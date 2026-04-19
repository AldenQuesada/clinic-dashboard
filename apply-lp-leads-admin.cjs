/* ============================================================
 * apply-lp-leads-admin.cjs
 *
 * 3 RPCs adicionais pro admin de leads:
 *   · lp_lead_update_status(p_id, p_status)
 *   · lp_lead_delete(p_id)
 *   · lp_lead_stats(p_slug, p_period_days)
 *
 * Idempotente. Pré-requisito: apply-lp-leads.cjs já rodou.
 *
 * Uso:
 *   node apply-lp-leads-admin.cjs
 * ============================================================ */

const { Client } = require('pg')

const sql = `
-- Update status
CREATE OR REPLACE FUNCTION public.lp_lead_update_status(
  p_id     uuid,
  p_status text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('new','contacted','converted','discarded') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;
  UPDATE public.lp_leads SET status = p_status WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_lead_update_status(uuid, text) TO anon, authenticated;

-- Delete
CREATE OR REPLACE FUNCTION public.lp_lead_delete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.lp_leads WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_lead_delete(uuid) TO anon, authenticated;

-- Stats agregadas: counts por status, leads por dia (N), top UTMs
CREATE OR REPLACE FUNCTION public.lp_lead_stats(
  p_slug        text DEFAULT NULL,
  p_period_days int  DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_since timestamptz := now() - (GREATEST(1, p_period_days) || ' days')::interval;
  v_total int;
  v_by_status jsonb;
  v_by_day jsonb;
  v_top_utm_source jsonb;
  v_top_utm_campaign jsonb;
BEGIN
  -- Total no periodo (com filtro de slug opcional)
  SELECT count(*) INTO v_total
    FROM public.lp_leads
   WHERE created_at >= v_since
     AND (p_slug IS NULL OR page_slug = p_slug);

  -- Counts por status
  SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) INTO v_by_status
    FROM (
      SELECT status, count(*) AS n
        FROM public.lp_leads
       WHERE created_at >= v_since
         AND (p_slug IS NULL OR page_slug = p_slug)
       GROUP BY status
    ) t;

  -- Leads por dia
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'n', n) ORDER BY d), '[]'::jsonb) INTO v_by_day
    FROM (
      SELECT date_trunc('day', created_at)::date AS d, count(*) AS n
        FROM public.lp_leads
       WHERE created_at >= v_since
         AND (p_slug IS NULL OR page_slug = p_slug)
       GROUP BY 1
    ) t;

  -- Top UTM source
  SELECT COALESCE(jsonb_agg(jsonb_build_object('source', src, 'n', n) ORDER BY n DESC), '[]'::jsonb) INTO v_top_utm_source
    FROM (
      SELECT COALESCE(utm->>'source', '(none)') AS src, count(*) AS n
        FROM public.lp_leads
       WHERE created_at >= v_since
         AND (p_slug IS NULL OR page_slug = p_slug)
       GROUP BY 1
       ORDER BY 2 DESC
       LIMIT 5
    ) t;

  -- Top UTM campaign
  SELECT COALESCE(jsonb_agg(jsonb_build_object('campaign', cmp, 'n', n) ORDER BY n DESC), '[]'::jsonb) INTO v_top_utm_campaign
    FROM (
      SELECT COALESCE(utm->>'campaign', '(none)') AS cmp, count(*) AS n
        FROM public.lp_leads
       WHERE created_at >= v_since
         AND (p_slug IS NULL OR page_slug = p_slug)
       GROUP BY 1
       ORDER BY 2 DESC
       LIMIT 5
    ) t;

  RETURN jsonb_build_object(
    'period_days',    p_period_days,
    'slug',           p_slug,
    'total',          v_total,
    'by_status',      v_by_status,
    'by_day',         v_by_day,
    'top_utm_source', v_top_utm_source,
    'top_utm_campaign', v_top_utm_campaign
  );
END $$;

GRANT EXECUTE ON FUNCTION public.lp_lead_stats(text, int) TO anon, authenticated;
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
    console.log('[lp-leads-admin] RPCs criadas')

    var fn = await c.query(`
      SELECT proname FROM pg_proc
      WHERE proname IN ('lp_lead_update_status','lp_lead_delete','lp_lead_stats')
      ORDER BY proname
    `)
    console.log('[lp-leads-admin] presentes:', fn.rows.map(r => r.proname).join(', '))
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()
