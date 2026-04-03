-- ============================================================================
-- Adiciona event_type 'page_view' ao quiz_events
-- ============================================================================

-- Drop e recria o CHECK constraint para incluir page_view
ALTER TABLE quiz_events DROP CONSTRAINT IF EXISTS quiz_events_event_type_check;
ALTER TABLE quiz_events ADD CONSTRAINT quiz_events_event_type_check
  CHECK (event_type IN (
    'page_view',        -- abriu a página do quiz (antes de clicar Começar)
    'quiz_start',       -- clicou "Começar"
    'step_view',        -- visualizou um step
    'quiz_complete',    -- confirmou LGPD e submeteu
    'whatsapp_click',   -- clicou no botão WhatsApp
    'btn_click'         -- clicou no botão personalizado
  ));

-- ============================================================================
-- Atualiza RPC quiz_analytics para incluir page_views e taxa de engajamento
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
BEGIN
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

  SELECT count(*) INTO v_completed
    FROM quiz_events
   WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
     AND event_type = 'quiz_complete'
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

    'funnel', (
      SELECT coalesce(jsonb_agg(row_to_json(f)), '[]'::jsonb)
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

    'leads_per_day', (
      SELECT coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb)
        FROM (
          SELECT date_trunc('day', created_at)::date as day, count(*) as total
            FROM quiz_events
           WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
             AND event_type = 'quiz_complete'
             AND created_at BETWEEN p_from AND p_to
           GROUP BY date_trunc('day', created_at)::date
           ORDER BY day
        ) d
    ),

    'exit_points', (
      SELECT coalesce(jsonb_agg(row_to_json(e)), '[]'::jsonb)
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
    )
  );

  RETURN result;
END;
$$;
