-- ============================================================================
-- quiz_analytics v3 — Hybrid: quiz_responses + quiz_events
-- ============================================================================
-- Usa quiz_responses como fonte de verdade para completed e leads_per_day
-- Usa quiz_events para métricas de comportamento (page_view, start, funnel, exits, wa)
-- ============================================================================

CREATE OR REPLACE FUNCTION quiz_analytics(
  p_quiz_id   uuid,
  p_clinic_id uuid,
  p_from      timestamptz DEFAULT (now() - interval '30 days'),
  p_to        timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  v_page_views  int;
  v_started     int;
  v_completed   int;
  v_wa_clicks   int;
  v_btn_clicks  int;
  v_has_events  boolean;
BEGIN
  -- ── Métricas de comportamento (quiz_events) ──────────────────
  SELECT count(*) INTO v_page_views
    FROM quiz_events
   WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
     AND event_type = 'page_view'
     AND created_at BETWEEN p_from AND p_to;

  SELECT count(*) INTO v_started
    FROM quiz_events
   WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
     AND event_type = 'quiz_start'
     AND created_at BETWEEN p_from AND p_to;

  SELECT count(*) INTO v_wa_clicks
    FROM quiz_events
   WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
     AND event_type = 'whatsapp_click'
     AND created_at BETWEEN p_from AND p_to;

  SELECT count(*) INTO v_btn_clicks
    FROM quiz_events
   WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
     AND event_type = 'btn_click'
     AND created_at BETWEEN p_from AND p_to;

  -- ── Completed: fonte de verdade é quiz_responses ─────────────
  SELECT count(*) INTO v_completed
    FROM quiz_responses
   WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
     AND submitted_at BETWEEN p_from AND p_to;

  -- Se não temos eventos de start, usar completed como fallback para started
  -- (leads antigos não têm eventos, mas sabemos que iniciaram pois completaram)
  IF v_started = 0 AND v_completed > 0 THEN
    v_started := v_completed;
  END IF;

  -- Se não temos page_views, usar started como fallback
  IF v_page_views = 0 AND v_started > 0 THEN
    v_page_views := v_started;
  END IF;

  -- Verifica se existem eventos de tracking (para decidir se mostra funil/exits)
  SELECT exists(
    SELECT 1 FROM quiz_events
     WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
       AND created_at BETWEEN p_from AND p_to
     LIMIT 1
  ) INTO v_has_events;

  result := jsonb_build_object(
    'page_views', v_page_views,
    'started',    v_started,
    'completed',  v_completed,
    'wa_clicks',  v_wa_clicks,
    'btn_clicks', v_btn_clicks,
    'engagement_rate', CASE WHEN v_page_views > 0
      THEN round((v_started::numeric / v_page_views::numeric) * 100, 1)
      ELSE 0 END,
    'conversion_rate', CASE WHEN v_started > 0
      THEN round((v_completed::numeric / v_started::numeric) * 100, 1)
      ELSE 0 END,

    -- Leads por dia: SEMPRE de quiz_responses (fonte de verdade)
    'leads_per_day', (
      SELECT coalesce(jsonb_agg(row_to_json(d) ORDER BY d.day), '[]'::jsonb)
        FROM (
          SELECT date_trunc('day', submitted_at)::date as day, count(*) as total
            FROM quiz_responses
           WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
             AND submitted_at BETWEEN p_from AND p_to
           GROUP BY date_trunc('day', submitted_at)::date
           ORDER BY day
        ) d
    ),

    -- Funil: só de quiz_events (só aparece quando há tracking)
    'funnel', (
      SELECT CASE WHEN v_has_events THEN
        coalesce(jsonb_agg(row_to_json(f)), '[]'::jsonb)
      ELSE '[]'::jsonb END
        FROM (
          SELECT step_index, step_label, count(DISTINCT session_id) as views
            FROM quiz_events
           WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
             AND event_type = 'step_view'
             AND created_at BETWEEN p_from AND p_to
           GROUP BY step_index, step_label
           ORDER BY step_index
        ) f
    ),

    -- Pontos de saída: só de quiz_events
    'exit_points', (
      SELECT CASE WHEN v_has_events THEN
        coalesce(jsonb_agg(row_to_json(e)), '[]'::jsonb)
      ELSE '[]'::jsonb END
        FROM (
          SELECT last_step, last_label, count(*) as exits
            FROM (
              SELECT session_id,
                     max(step_index) as last_step,
                     (array_agg(step_label ORDER BY step_index DESC))[1] as last_label
                FROM quiz_events
               WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
                 AND event_type = 'step_view'
                 AND created_at BETWEEN p_from AND p_to
                 AND session_id NOT IN (
                   SELECT session_id FROM quiz_events
                    WHERE quiz_id = p_quiz_id AND event_type = 'quiz_complete'
                      AND created_at BETWEEN p_from AND p_to
                 )
               GROUP BY session_id
            ) abandoned
           GROUP BY last_step, last_label
           ORDER BY exits DESC
        ) e
    ),

    -- Distribuição de temperatura: de quiz_responses
    'temperature_dist', (
      SELECT coalesce(jsonb_object_agg(t.temp, t.cnt), '{}'::jsonb)
        FROM (
          SELECT temperature as temp, count(*) as cnt
            FROM quiz_responses
           WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
             AND submitted_at BETWEEN p_from AND p_to
           GROUP BY temperature
        ) t
    )
  );

  RETURN result;
END;
$$;
