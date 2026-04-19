/* ============================================================
 * apply-lp-lead-submit-v2-rpc.cjs (Onda 29 · alinha contrato)
 *
 * Cria RPC lp_lead_submit_v2 com contrato direto ergonômico:
 *   p_slug text, p_phone text, p_name text, p_meta jsonb
 *
 * Internamente delega pro lp_lead_submit existente. v2 é mais
 * conveniente pro front (usado pelo anatomy-quiz da Onda 29).
 *
 * Idempotente. Uso: node apply-lp-lead-submit-v2-rpc.cjs
 * ============================================================ */
const { Client } = require('pg')

const sql = `
CREATE OR REPLACE FUNCTION public.lp_lead_submit_v2(
  p_slug  text,
  p_phone text,
  p_name  text DEFAULT NULL,
  p_meta  jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb;
  v_phone_clean text;
BEGIN
  IF p_slug IS NULL OR p_slug = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slug_missing');
  END IF;
  IF p_phone IS NULL OR length(regexp_replace(p_phone, '\\D', '', 'g')) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_invalid');
  END IF;

  v_phone_clean := regexp_replace(p_phone, '\\D', '', 'g');

  v_data := jsonb_build_object(
    'phone',     v_phone_clean,
    'phone_raw', p_phone,
    'name',      COALESCE(p_name, '')
  ) || COALESCE(p_meta, '{}'::jsonb);

  RETURN public.lp_lead_submit(p_slug, v_data, NULL);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_lead_submit_v2(text, text, text, jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.lp_lead_submit_v2(text, text, text, jsonb) IS
  'V2 ergonomico (slug+phone+name+meta) usado pelo anatomy-quiz e blocos Onda 29';
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
    console.log('[lead-submit-v2-rpc] aplicada')
  } catch (e) { console.error('ERROR:', e.message); process.exit(1) }
  finally { await c.end() }
})()
