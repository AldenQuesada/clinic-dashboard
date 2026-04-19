/* ============================================================
 * apply-lp-heatmap.cjs (Onda 25)
 *
 * Captura interações UX (clicks com coords + scroll depth).
 * Sampling no client (1/3) pra não inundar banco.
 *
 *   · lp_interactions  — slug, type, x_pct, y_pct, scroll_pct, viewport, ts
 *   · RPC lp_interaction_log_batch(p_events jsonb)  — 1 INSERT por batch
 *   · RPC lp_interaction_clicks(p_slug, p_days)
 *   · RPC lp_interaction_scroll_dist(p_slug, p_days)
 *   · Cleanup: TTL 60 dias
 *
 * Idempotente. Uso: node apply-lp-heatmap.cjs
 * ============================================================ */
const { Client } = require('pg')
const sql = `
CREATE TABLE IF NOT EXISTS public.lp_interactions (
  id          bigserial PRIMARY KEY,
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  page_slug   text NOT NULL,
  visitor_id  text,
  event_type  text NOT NULL,    -- 'click' | 'scroll'
  x_pct       numeric(5,2),     -- % da largura (0-100)
  y_pct       numeric(5,2),     -- % da altura total
  scroll_pct  numeric(5,2),     -- % máximo scrollado
  viewport_w  int,
  viewport_h  int,
  block_idx   int,              -- bloco onde caiu (se inferível)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_interactions_slug ON public.lp_interactions (page_slug, created_at DESC);

ALTER TABLE public.lp_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lp_interactions_clinic ON public.lp_interactions;
CREATE POLICY lp_interactions_clinic ON public.lp_interactions
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Batch insert (recebe array, faz 1 INSERT)
CREATE OR REPLACE FUNCTION public.lp_interaction_log_batch(p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_payload');
  END IF;
  WITH src AS (
    SELECT
      e->>'page_slug'                         AS page_slug,
      e->>'visitor_id'                        AS visitor_id,
      e->>'event_type'                        AS event_type,
      NULLIF(e->>'x_pct','')::numeric         AS x_pct,
      NULLIF(e->>'y_pct','')::numeric         AS y_pct,
      NULLIF(e->>'scroll_pct','')::numeric    AS scroll_pct,
      NULLIF(e->>'viewport_w','')::int        AS viewport_w,
      NULLIF(e->>'viewport_h','')::int        AS viewport_h,
      NULLIF(e->>'block_idx','')::int         AS block_idx
    FROM jsonb_array_elements(p_events) e
  ),
  ins AS (
    INSERT INTO public.lp_interactions
      (page_slug, visitor_id, event_type, x_pct, y_pct, scroll_pct, viewport_w, viewport_h, block_idx)
    SELECT page_slug, visitor_id, event_type, x_pct, y_pct, scroll_pct, viewport_w, viewport_h, block_idx
      FROM src
     WHERE page_slug IS NOT NULL AND event_type IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;
  RETURN jsonb_build_object('ok', true, 'inserted', v_count);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_interaction_log_batch(jsonb) TO anon, authenticated;

-- Clicks agregados (pra heatmap)
CREATE OR REPLACE FUNCTION public.lp_interaction_clicks(p_slug text, p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'x_pct', x_pct, 'y_pct', y_pct, 'block_idx', block_idx
    ))
    FROM public.lp_interactions
    WHERE page_slug = p_slug
      AND event_type = 'click'
      AND x_pct IS NOT NULL AND y_pct IS NOT NULL
      AND created_at > now() - (p_days || ' days')::interval
    LIMIT 5000
  ), '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_interaction_clicks(text, int) TO anon, authenticated;

-- Scroll depth distribution (% que chegou em cada faixa de 10%)
CREATE OR REPLACE FUNCTION public.lp_interaction_scroll_dist(p_slug text, p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total int;
BEGIN
  SELECT count(DISTINCT visitor_id) INTO v_total
    FROM public.lp_interactions
   WHERE page_slug = p_slug
     AND event_type = 'scroll'
     AND created_at > now() - (p_days || ' days')::interval;

  IF v_total = 0 THEN RETURN jsonb_build_object('total', 0, 'buckets', '[]'::jsonb); END IF;

  RETURN jsonb_build_object(
    'total', v_total,
    'buckets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'pct', bucket * 10,
        'visitors', cnt
      ) ORDER BY bucket)
      FROM (
        SELECT
          floor(LEAST(scroll_pct, 100) / 10)::int AS bucket,
          count(DISTINCT visitor_id) AS cnt
        FROM public.lp_interactions
        WHERE page_slug = p_slug
          AND event_type = 'scroll'
          AND created_at > now() - (p_days || ' days')::interval
        GROUP BY bucket
      ) b
    ), '[]'::jsonb)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.lp_interaction_scroll_dist(text, int) TO anon, authenticated;

-- Cleanup TTL 60 dias (pode ser chamado por cron ou manualmente)
CREATE OR REPLACE FUNCTION public.lp_interactions_cleanup()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted int;
BEGIN
  WITH d AS (
    DELETE FROM public.lp_interactions
     WHERE created_at < now() - interval '60 days'
    RETURNING 1
  ) SELECT count(*) INTO v_deleted FROM d;
  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_interactions_cleanup() TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lp_interactions_cleanup';
    PERFORM cron.schedule('lp_interactions_cleanup', '0 4 * * *', $cron$ SELECT public.lp_interactions_cleanup(); $cron$);
  END IF;
END $$;

COMMENT ON TABLE public.lp_interactions IS 'Interações UX (clicks coords + scroll depth) — TTL 60 dias';
`
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})
;(async () => {
  try {
    await c.connect(); await c.query(sql); await c.query("NOTIFY pgrst, 'reload schema'")
    console.log('[heatmap] migration aplicada')
  } catch (e) { console.error('ERROR:', e.message); process.exit(1) }
  finally { await c.end() }
})()
