-- ============================================================================
-- RPC: quiz_delete_abandoned_sessions
-- ============================================================================
-- Deleta todos os quiz_events das session_ids informadas, escopado por
-- quiz_id + clinic_id. So apaga sessoes que NAO tem quiz_complete (abandonadas).
-- ============================================================================

CREATE OR REPLACE FUNCTION quiz_delete_abandoned_sessions(
  p_quiz_id     uuid,
  p_clinic_id   uuid,
  p_session_ids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted int;
BEGIN
  IF p_session_ids IS NULL OR array_length(p_session_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;

  WITH safe_sessions AS (
    SELECT unnest(p_session_ids) AS session_id
    EXCEPT
    SELECT session_id
    FROM quiz_events
    WHERE quiz_id = p_quiz_id
      AND clinic_id = p_clinic_id
      AND event_type = 'quiz_complete'
  ),
  del AS (
    DELETE FROM quiz_events
    WHERE quiz_id = p_quiz_id
      AND clinic_id = p_clinic_id
      AND session_id IN (SELECT session_id FROM safe_sessions)
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN jsonb_build_object('deleted', coalesce(v_deleted, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION quiz_delete_abandoned_sessions(uuid, uuid, text[]) TO authenticated;
