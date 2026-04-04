-- ============================================================
-- Migration: Outbox fetch includes lead name for variable substitution
-- ============================================================

CREATE OR REPLACE FUNCTION wa_outbox_fetch_pending(p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_result    jsonb;
  v_ids       uuid[];
BEGIN
  WITH pending AS (
    SELECT id, phone, content, template_id, conversation_id, lead_id, media_url, media_caption
    FROM wa_outbox
    WHERE clinic_id = v_clinic_id
      AND status = 'pending'
      AND (scheduled_at IS NULL OR scheduled_at <= now())
      AND attempts < max_attempts
    ORDER BY priority ASC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE wa_outbox
    SET status = 'processing', attempts = attempts + 1, processed_at = now()
    WHERE id IN (SELECT id FROM pending)
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM updated;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'phone', o.phone,
      'content', o.content,
      'conversation_id', o.conversation_id,
      'lead_id', o.lead_id,
      'media_url', o.media_url,
      'media_caption', o.media_caption,
      'lead_name', COALESCE(l.name, ''),
      'lead_queixa', COALESCE((l.data->>'queixa_principal')::text, '')
    )
  ), '[]'::jsonb)
  INTO v_result
  FROM wa_outbox o
  LEFT JOIN leads l ON l.id = o.lead_id
  WHERE o.id = ANY(COALESCE(v_ids, '{}'));

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_outbox_fetch_pending(int) TO anon, authenticated;
