-- ============================================================================
-- RPC: quiz_abandoned_leads — Leads que abandonaram o quiz
-- ============================================================================
-- Retorna sessões que têm step_view mas NÃO têm quiz_complete.
-- Inclui nome, telefone (se preenchidos), último step, progresso, data.
-- ============================================================================

CREATE OR REPLACE FUNCTION quiz_abandoned_leads(
  p_quiz_id   uuid,
  p_clinic_id uuid,
  p_from      timestamptz DEFAULT (now() - interval '30 days'),
  p_to        timestamptz DEFAULT now(),
  p_limit     int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY r.abandoned_at DESC), '[]'::jsonb)
    FROM (
      SELECT
        e.session_id,
        max(e.contact_name)  FILTER (WHERE e.contact_name IS NOT NULL AND e.contact_name != '')  as contact_name,
        max(e.contact_phone) FILTER (WHERE e.contact_phone IS NOT NULL AND e.contact_phone != '') as contact_phone,
        max(e.step_index)    as last_step,
        (array_agg(e.step_label ORDER BY e.step_index DESC))[1] as last_step_label,
        count(DISTINCT e.step_index) as steps_completed,
        max(e.created_at)    as abandoned_at,
        max(e.utm_source)    FILTER (WHERE e.utm_source IS NOT NULL)  as utm_source,
        max(e.utm_medium)    FILTER (WHERE e.utm_medium IS NOT NULL)  as utm_medium,
        max(e.utm_campaign)  FILTER (WHERE e.utm_campaign IS NOT NULL) as utm_campaign
      FROM quiz_events e
      WHERE e.quiz_id = p_quiz_id
        AND e.clinic_id = p_clinic_id
        AND e.event_type = 'step_view'
        AND e.created_at BETWEEN p_from AND p_to
        AND e.session_id NOT IN (
          SELECT session_id
          FROM quiz_events
          WHERE quiz_id = p_quiz_id
            AND event_type = 'quiz_complete'
            AND created_at BETWEEN p_from AND p_to
        )
      GROUP BY e.session_id
      ORDER BY max(e.created_at) DESC
      LIMIT p_limit
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION quiz_abandoned_leads(uuid, uuid, timestamptz, timestamptz, int) TO authenticated;
