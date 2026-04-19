/* ============================================================
 * apply-lp-leads.cjs
 *
 * Cria tabela lp_leads + RPC lp_lead_submit pra capturar
 * envios de formulário das LPs públicas.
 *
 * Idempotente. Independente do resto do LP Builder.
 *
 * Uso:
 *   node apply-lp-leads.cjs
 * ============================================================ */

const { Client } = require('pg')

const sql = `
CREATE TABLE IF NOT EXISTS public.lp_leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  page_slug   text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  utm         jsonb,
  ip          text,
  ua          text,
  status      text NOT NULL DEFAULT 'new',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lp_leads_status_chk CHECK (status IN ('new','contacted','converted','discarded'))
);

CREATE INDEX IF NOT EXISTS idx_lp_leads_slug    ON public.lp_leads (page_slug);
CREATE INDEX IF NOT EXISTS idx_lp_leads_created ON public.lp_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lp_leads_status  ON public.lp_leads (status);

ALTER TABLE public.lp_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lp_leads_clinic ON public.lp_leads;
CREATE POLICY lp_leads_clinic ON public.lp_leads
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- RPC publica pra submeter (anon)
CREATE OR REPLACE FUNCTION public.lp_lead_submit(
  p_slug text,
  p_data jsonb,
  p_utm  jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slug_required');
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'data_required');
  END IF;

  INSERT INTO public.lp_leads (page_slug, data, utm)
  VALUES (p_slug, p_data, p_utm)
  RETURNING id INTO v_id;

  -- incrementa conversion da pagina (best-effort)
  BEGIN
    UPDATE public.lp_pages
       SET conversions = conversions + 1
     WHERE slug = p_slug;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_lead_submit(text, jsonb, jsonb) TO anon, authenticated;

-- RPC admin pra listar leads (filtros opcionais)
CREATE OR REPLACE FUNCTION public.lp_leads_list(
  p_slug   text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit  int  DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',         l.id,
        'page_slug',  l.page_slug,
        'data',       l.data,
        'utm',        l.utm,
        'status',     l.status,
        'created_at', l.created_at
      ) ORDER BY l.created_at DESC
    )
    FROM (
      SELECT * FROM public.lp_leads
       WHERE (p_slug   IS NULL OR page_slug = p_slug)
         AND (p_status IS NULL OR status    = p_status)
       ORDER BY created_at DESC
       LIMIT GREATEST(1, LEAST(p_limit, 500))
    ) l
  ), '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_leads_list(text, text, int) TO anon, authenticated;

COMMENT ON TABLE public.lp_leads IS 'Leads capturados pelos forms inline das LPs publicadas';
`

const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

;(async () => {
  try {
    await c.connect()
    await c.query(sql)
    await c.query("NOTIFY pgrst, 'reload schema'")
    console.log('[lp-leads] tabela + RPCs aplicadas')

    var t = await c.query(`SELECT count(*) FROM public.lp_leads`)
    console.log('[lp-leads] linhas atuais:', t.rows[0].count)

    var fn = await c.query(`
      SELECT proname FROM pg_proc
      WHERE proname IN ('lp_lead_submit','lp_leads_list')
      ORDER BY proname
    `)
    console.log('[lp-leads] RPCs:', fn.rows.map(r => r.proname).join(', '))
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()
