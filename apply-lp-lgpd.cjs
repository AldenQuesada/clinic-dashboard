/* ============================================================
 * apply-lp-lgpd.cjs (Onda 21)
 *
 *   · coluna lp_pages.lgpd_config jsonb pra config por LP
 *   · tabela lp_consents pra log auditável de consentimentos
 *   · RPC lp_page_set_lgpd(p_id, p_config)
 *   · RPC lp_consent_log(p_slug, p_consents, p_meta)
 *   · RPC lp_consent_list(p_slug, p_limit)
 *
 * Idempotente. Uso: node apply-lp-lgpd.cjs
 * ============================================================ */

const { Client } = require('pg')

const sql = `
ALTER TABLE public.lp_pages
  ADD COLUMN IF NOT EXISTS lgpd_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.lp_consents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  page_slug   text NOT NULL,
  consents    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { necessary:true, analytics:bool, marketing:bool }
  ip_hash     text,
  user_agent  text,
  referrer    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_consents_slug ON public.lp_consents (page_slug, created_at DESC);

ALTER TABLE public.lp_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lp_consents_clinic ON public.lp_consents;
CREATE POLICY lp_consents_clinic ON public.lp_consents
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- ── set config por LP ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lp_page_set_lgpd(p_id uuid, p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'config_invalid');
  END IF;
  UPDATE public.lp_pages
     SET lgpd_config = p_config, updated_at = now()
   WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_set_lgpd(uuid, jsonb) TO anon, authenticated;

-- ── log de consentimento (chamado por lp.html runtime) ────
CREATE OR REPLACE FUNCTION public.lp_consent_log(
  p_slug     text,
  p_consents jsonb,
  p_meta     jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_slug IS NULL OR p_consents IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_args');
  END IF;
  INSERT INTO public.lp_consents (page_slug, consents, ip_hash, user_agent, referrer)
  VALUES (
    p_slug,
    p_consents,
    COALESCE(p_meta->>'ip_hash', ''),
    COALESCE(p_meta->>'ua', ''),
    COALESCE(p_meta->>'referrer', '')
  )
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_consent_log(text, jsonb, jsonb) TO anon, authenticated;

-- ── listar consentimentos pra audit (admin) ───────────────
CREATE OR REPLACE FUNCTION public.lp_consent_list(p_slug text DEFAULT NULL, p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',         c.id,
        'page_slug',  c.page_slug,
        'consents',   c.consents,
        'ip_hash',    c.ip_hash,
        'user_agent', c.user_agent,
        'referrer',   c.referrer,
        'created_at', c.created_at
      ) ORDER BY c.created_at DESC
    )
    FROM (
      SELECT * FROM public.lp_consents
       WHERE p_slug IS NULL OR page_slug = p_slug
       ORDER BY created_at DESC
       LIMIT GREATEST(1, LEAST(p_limit, 500))
    ) c
  ), '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_consent_list(text, int) TO anon, authenticated;

-- ── Atualiza lp_page_resolve pra retornar lgpd_config ─────
CREATE OR REPLACE FUNCTION public.lp_page_resolve(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_page public.lp_pages%ROWTYPE;
BEGIN
  SELECT * INTO v_page
    FROM public.lp_pages
   WHERE slug = p_slug AND status = 'published'
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object(
    'ok',              true,
    'id',              v_page.id,
    'slug',            v_page.slug,
    'title',           v_page.title,
    'meta_title',      v_page.meta_title,
    'meta_description',v_page.meta_description,
    'og_image_url',    v_page.og_image_url,
    'blocks',          v_page.blocks,
    'tokens_override', v_page.tokens_override,
    'tracking',        COALESCE(v_page.tracking, '{}'::jsonb),
    'ab_variant_slug', v_page.ab_variant_slug,
    'schema_org',      COALESCE(v_page.schema_org, '{}'::jsonb),
    'lgpd_config',     COALESCE(v_page.lgpd_config, '{}'::jsonb)
  );
END $$;

-- Atualiza lp_page_get pra incluir lgpd_config também
CREATE OR REPLACE FUNCTION public.lp_page_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.lp_pages%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.lp_pages WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object(
    'ok',               true,
    'id',               v_row.id,
    'slug',             v_row.slug,
    'title',            v_row.title,
    'status',           v_row.status,
    'blocks',           v_row.blocks,
    'tokens_override',  v_row.tokens_override,
    'meta_title',       v_row.meta_title,
    'meta_description', v_row.meta_description,
    'og_image_url',     v_row.og_image_url,
    'views',            v_row.views,
    'conversions',      v_row.conversions,
    'tracking',         COALESCE(v_row.tracking, '{}'::jsonb),
    'ab_variant_slug',  v_row.ab_variant_slug,
    'schema_org',       COALESCE(v_row.schema_org, '{}'::jsonb),
    'lgpd_config',      COALESCE(v_row.lgpd_config, '{}'::jsonb),
    'created_at',       v_row.created_at,
    'updated_at',       v_row.updated_at,
    'published_at',     v_row.published_at
  );
END $$;
GRANT EXECUTE ON FUNCTION public.lp_page_get(uuid) TO anon, authenticated;

COMMENT ON TABLE  public.lp_consents      IS 'Log auditável de consentimentos LGPD por visita';
COMMENT ON COLUMN public.lp_pages.lgpd_config IS 'Config do banner LGPD: { enabled, mode, theme, texts, policy_url }';
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
    console.log('[lgpd] migration aplicada')
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()
