/* ============================================================
 * apply-lp-journey.cjs (Onda 24)
 *
 * Tracking de jornada cross-LP:
 *   · lp_journey_events — visitor_id, from_slug, to_slug, ts, ref
 *   · RPC lp_journey_track(visitor_id, from_slug, to_slug, meta)
 *   · RPC lp_journey_paths(p_limit) — agrega paths mais comuns
 *   · RPC lp_journey_visitor(visitor_id) — timeline de 1 visitor
 *
 * Idempotente. Uso: node apply-lp-journey.cjs
 * ============================================================ */
const { Client } = require('pg')
const sql = `
CREATE TABLE IF NOT EXISTS public.lp_journey_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  visitor_id  text NOT NULL,
  from_slug   text,
  to_slug     text NOT NULL,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_journey_visitor ON public.lp_journey_events (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lp_journey_to      ON public.lp_journey_events (to_slug, created_at DESC);

ALTER TABLE public.lp_journey_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lp_journey_clinic ON public.lp_journey_events;
CREATE POLICY lp_journey_clinic ON public.lp_journey_events
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE OR REPLACE FUNCTION public.lp_journey_track(
  p_visitor_id text,
  p_from_slug  text,
  p_to_slug    text,
  p_meta       jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_visitor_id IS NULL OR p_to_slug IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_args');
  END IF;
  INSERT INTO public.lp_journey_events (visitor_id, from_slug, to_slug, meta)
  VALUES (p_visitor_id, NULLIF(p_from_slug, ''), p_to_slug, COALESCE(p_meta, '{}'::jsonb));
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_journey_track(text, text, text, jsonb) TO anon, authenticated;

-- Top paths: from_slug → to_slug agregado
CREATE OR REPLACE FUNCTION public.lp_journey_paths(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'from_slug', from_slug,
        'to_slug',   to_slug,
        'count',     cnt,
        'last_at',   last_at
      ) ORDER BY cnt DESC
    )
    FROM (
      SELECT from_slug, to_slug, count(*) AS cnt, max(created_at) AS last_at
        FROM public.lp_journey_events
       WHERE created_at > now() - interval '90 days'
       GROUP BY from_slug, to_slug
       ORDER BY cnt DESC
       LIMIT GREATEST(1, LEAST(p_limit, 200))
    ) p
  ), '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_journey_paths(int) TO anon, authenticated;

-- Timeline de 1 visitor
CREATE OR REPLACE FUNCTION public.lp_journey_visitor(p_visitor_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'from_slug',  from_slug,
        'to_slug',    to_slug,
        'created_at', created_at,
        'meta',       meta
      ) ORDER BY created_at
    )
    FROM public.lp_journey_events
    WHERE visitor_id = p_visitor_id
    LIMIT 200
  ), '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_journey_visitor(text) TO anon, authenticated;

COMMENT ON TABLE public.lp_journey_events IS 'Eventos de navegação cross-LP (Onda 24)';
`
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})
;(async () => {
  try {
    await c.connect(); await c.query(sql); await c.query("NOTIFY pgrst, 'reload schema'")
    console.log('[journey] migration aplicada')
  } catch (e) { console.error('ERROR:', e.message); process.exit(1) }
  finally { await c.end() }
})()
