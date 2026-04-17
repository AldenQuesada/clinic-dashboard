-- ============================================================
-- RPC: sdr_lifecycle_metrics
-- Métricas de lifecycle por fase do funil — Dashboard de Conversão
-- Complementa sdr_funnel_metrics com:
--   - Tempo médio em cada fase (duração entre transições)
--   - Matriz de transições (from -> to)
--   - Attribution por origem (auto_transition | manual_override | rule)
--   - Filtro opcional por funnel (fullface | procedimentos | NULL=all)
-- ============================================================

CREATE OR REPLACE FUNCTION public.sdr_lifecycle_metrics(
  p_days   int  DEFAULT 30,
  p_funnel text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_from      timestamptz;
  v_result    jsonb;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao autenticado');
  END IF;

  IF p_days IS NULL OR p_days <= 0 THEN p_days := 30; END IF;
  IF p_days > 365 THEN p_days := 365; END IF;

  v_from := now() - make_interval(days => p_days);

  WITH
  lead_scope AS (
    SELECT id, phase
    FROM leads
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND (p_funnel IS NULL OR funnel = p_funnel)
  ),
  phase_events AS (
    SELECT ph.lead_id, ph.from_phase, ph.to_phase, ph.created_at,
           ph.origin, ph.triggered_by
    FROM phase_history ph
    WHERE ph.lead_id IN (SELECT id FROM lead_scope)
      AND ph.created_at >= v_from
  ),
  entries_per_phase AS (
    SELECT to_phase AS phase, count(DISTINCT lead_id) AS entries
    FROM phase_events
    WHERE to_phase IS NOT NULL
    GROUP BY to_phase
  ),
  exits_per_phase AS (
    SELECT from_phase AS phase, count(DISTINCT lead_id) AS exits
    FROM phase_events
    WHERE from_phase IS NOT NULL
    GROUP BY from_phase
  ),
  current_per_phase AS (
    SELECT phase, count(*) AS in_phase
    FROM lead_scope
    WHERE phase IS NOT NULL
    GROUP BY phase
  ),
  -- Duração em fase: para cada entrada em X, achar a próxima saída de X
  durations AS (
    SELECT
      e1.to_phase AS phase,
      extract(epoch FROM (
        (SELECT MIN(e2.created_at)
         FROM phase_events e2
         WHERE e2.lead_id = e1.lead_id
           AND e2.from_phase = e1.to_phase
           AND e2.created_at > e1.created_at)
        - e1.created_at
      )) / 3600.0 AS hours
    FROM phase_events e1
    WHERE e1.to_phase IS NOT NULL
  ),
  avg_time AS (
    SELECT phase, round(avg(hours)::numeric, 2) AS avg_hours, count(*) FILTER (WHERE hours IS NOT NULL) AS samples
    FROM durations
    WHERE hours IS NOT NULL
    GROUP BY phase
  ),
  all_phases AS (
    SELECT DISTINCT phase FROM (
      SELECT phase FROM entries_per_phase
      UNION SELECT phase FROM exits_per_phase
      UNION SELECT phase FROM current_per_phase
    ) u WHERE phase IS NOT NULL
  ),
  transitions AS (
    SELECT from_phase, to_phase, count(*) AS cnt
    FROM phase_events
    WHERE from_phase IS NOT NULL AND to_phase IS NOT NULL
    GROUP BY from_phase, to_phase
  ),
  origin_summary AS (
    SELECT COALESCE(origin, 'unknown') AS origin, count(*) AS cnt
    FROM phase_events
    GROUP BY origin
  ),
  rule_attribution AS (
    SELECT triggered_by, count(*) AS cnt
    FROM phase_events
    WHERE origin = 'rule' AND triggered_by IS NOT NULL
    GROUP BY triggered_by
    ORDER BY cnt DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'period_days', p_days,
      'funnel', p_funnel,
      'phases', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'phase',     p.phase,
            'entries',   COALESCE(e.entries, 0),
            'exits',     COALESCE(x.exits, 0),
            'current',   COALESCE(c.in_phase, 0),
            'avg_hours', COALESCE(t.avg_hours, 0),
            'samples',   COALESCE(t.samples, 0)
          )
          ORDER BY array_position(
            ARRAY['lead','agendado','reagendado','compareceu','orcamento','paciente','perdido']::text[],
            p.phase
          ) NULLS LAST
        )
        FROM all_phases p
        LEFT JOIN entries_per_phase e ON e.phase = p.phase
        LEFT JOIN exits_per_phase   x ON x.phase = p.phase
        LEFT JOIN current_per_phase c ON c.phase = p.phase
        LEFT JOIN avg_time          t ON t.phase = p.phase
      ), '[]'::jsonb),
      'transitions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'from',  from_phase,
          'to',    to_phase,
          'count', cnt
        ) ORDER BY cnt DESC)
        FROM transitions
      ), '[]'::jsonb),
      'origins', COALESCE((
        SELECT jsonb_object_agg(origin, cnt) FROM origin_summary
      ), '{}'::jsonb),
      'top_rules', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'rule', triggered_by,
          'count', cnt
        ))
        FROM rule_attribution
      ), '[]'::jsonb),
      'totals', jsonb_build_object(
        'events',           (SELECT count(*) FROM phase_events),
        'leads_touched',    (SELECT count(DISTINCT lead_id) FROM phase_events),
        'pacientes_period', (SELECT count(DISTINCT lead_id) FROM phase_events WHERE to_phase = 'paciente'),
        'perdidos_period',  (SELECT count(DISTINCT lead_id) FROM phase_events WHERE to_phase = 'perdido'),
        'leads_scope',      (SELECT count(*) FROM lead_scope)
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sdr_lifecycle_metrics(int, text) TO authenticated;

COMMENT ON FUNCTION public.sdr_lifecycle_metrics(int, text) IS
  'Lifecycle metrics por fase do funil — dashboard de conversão. Complementa sdr_funnel_metrics.';
