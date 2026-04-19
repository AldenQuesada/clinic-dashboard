/* ============================================================
 * apply-lp-engagement.cjs (Onda 29 · foundation)
 *
 * Eventos de engajamento granulares pros 6 novos blocos de conversão:
 *   · popup_shown / popup_dismissed / popup_cta_click
 *   · quiz_area_marked / quiz_area_unmarked / quiz_completed
 *   · collagen_view / collagen_cta_click
 *   · counter_view
 *   · reel_play / reel_complete
 *   · smart_cta_render / smart_cta_click
 *
 * Tabela lp_engagement_events alimenta:
 *   - Heatmap (correlaciona com clicks)
 *   - Live counter ("X marcaram avaliação esta semana")
 *   - Analytics avançado por bloco/segmento
 *   - Smart CTA (decide texto baseado em histórico)
 *
 * Idempotente. Uso: node apply-lp-engagement.cjs
 * ============================================================ */
const { Client } = require('pg')

const sql = `
CREATE TABLE IF NOT EXISTS public.lp_engagement_events (
  id          bigserial PRIMARY KEY,
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  page_slug   text NOT NULL,
  visitor_id  text,
  event_type  text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_engagement_slug   ON public.lp_engagement_events (page_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lp_engagement_event  ON public.lp_engagement_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lp_engagement_visitor ON public.lp_engagement_events (visitor_id, created_at DESC);

ALTER TABLE public.lp_engagement_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lp_engagement_clinic ON public.lp_engagement_events;
CREATE POLICY lp_engagement_clinic ON public.lp_engagement_events
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Batch insert (recebe array · 1 INSERT só)
CREATE OR REPLACE FUNCTION public.lp_engagement_log_batch(p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_payload');
  END IF;
  WITH src AS (
    SELECT
      e->>'page_slug'  AS page_slug,
      e->>'visitor_id' AS visitor_id,
      e->>'event_type' AS event_type,
      COALESCE(e->'payload', '{}'::jsonb) AS payload
    FROM jsonb_array_elements(p_events) e
  ),
  ins AS (
    INSERT INTO public.lp_engagement_events (page_slug, visitor_id, event_type, payload)
    SELECT page_slug, visitor_id, event_type, payload
      FROM src WHERE page_slug IS NOT NULL AND event_type IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;
  RETURN jsonb_build_object('ok', true, 'inserted', v_count);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_engagement_log_batch(jsonb) TO anon, authenticated;

-- Live counter · contagem de leads recentes pra prova social ao vivo
-- (não usa lp_engagement_events · usa lp_leads diretamente)
CREATE OR REPLACE FUNCTION public.lp_recent_leads_count(p_slug text DEFAULT NULL, p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF p_slug IS NULL OR p_slug = '' THEN
    SELECT count(*) INTO v_count FROM public.lp_leads
     WHERE created_at > now() - (p_days || ' days')::interval;
  ELSE
    SELECT count(*) INTO v_count FROM public.lp_leads
     WHERE page_slug = p_slug
       AND created_at > now() - (p_days || ' days')::interval;
  END IF;
  RETURN jsonb_build_object('ok', true, 'count', COALESCE(v_count, 0), 'days', p_days);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_recent_leads_count(text, int) TO anon, authenticated;

-- Cleanup TTL 90 dias (cron)
CREATE OR REPLACE FUNCTION public.lp_engagement_cleanup()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted int;
BEGIN
  WITH d AS (
    DELETE FROM public.lp_engagement_events
     WHERE created_at < now() - interval '90 days'
    RETURNING 1
  ) SELECT count(*) INTO v_deleted FROM d;
  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_engagement_cleanup() TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lp_engagement_cleanup';
    PERFORM cron.schedule('lp_engagement_cleanup', '0 5 * * *', $cron$ SELECT public.lp_engagement_cleanup(); $cron$);
  END IF;
END $$;

COMMENT ON TABLE public.lp_engagement_events IS 'Eventos granulares dos blocos de conversão (Onda 29) · TTL 90d';
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
    console.log('[engagement] migration aplicada')
  } catch (e) { console.error('ERROR:', e.message); process.exit(1) }
  finally { await c.end() }
})()
