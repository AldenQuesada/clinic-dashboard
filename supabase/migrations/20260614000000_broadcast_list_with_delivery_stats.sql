-- ============================================================
-- Migration: Update wa_broadcast_list_with_stats
-- Adds delivered, read, delivery_rate, read_rate, response_rate
-- ============================================================

DROP FUNCTION IF EXISTS wa_broadcast_list_with_stats();

CREATE OR REPLACE FUNCTION wa_broadcast_list_with_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', b.id, 'name', b.name, 'content', b.content,
      'media_url', b.media_url, 'media_caption', b.media_caption,
      'media_position', b.media_position,
      'target_filter', b.target_filter,
      'total_targets', b.total_targets,
      'sent_count', b.sent_count, 'failed_count', b.failed_count,
      'status', b.status, 'scheduled_at', b.scheduled_at,
      'started_at', b.started_at, 'completed_at', b.completed_at,
      'created_at', b.created_at,
      'batch_size', b.batch_size, 'batch_interval_min', b.batch_interval_min,
      'selected_lead_ids', b.selected_lead_ids,
      'delivered', (SELECT count(*) FROM wa_outbox o2
        WHERE o2.broadcast_id = b.id AND o2.delivered_at IS NOT NULL),
      'read', (SELECT count(*) FROM wa_outbox o3
        WHERE o3.broadcast_id = b.id AND o3.read_at IS NOT NULL),
      'responded', (SELECT count(DISTINCT o.lead_id) FROM wa_outbox o
        JOIN wa_messages m ON m.conversation_id = o.conversation_id AND m.direction = 'inbound'
        WHERE o.broadcast_id = b.id AND o.status = 'sent'
          AND b.started_at IS NOT NULL AND m.sent_at > b.started_at),
      'delivery_rate', CASE WHEN b.sent_count > 0 THEN
        round(((SELECT count(*) FROM wa_outbox o4 WHERE o4.broadcast_id = b.id AND o4.delivered_at IS NOT NULL)::numeric / b.sent_count) * 100)
        ELSE 0 END,
      'read_rate', CASE WHEN b.sent_count > 0 THEN
        round(((SELECT count(*) FROM wa_outbox o5 WHERE o5.broadcast_id = b.id AND o5.read_at IS NOT NULL)::numeric / b.sent_count) * 100)
        ELSE 0 END,
      'response_rate', CASE WHEN b.sent_count > 0 THEN
        round(((SELECT count(DISTINCT o6.lead_id) FROM wa_outbox o6
          JOIN wa_messages m2 ON m2.conversation_id = o6.conversation_id AND m2.direction = 'inbound'
          WHERE o6.broadcast_id = b.id AND o6.status = 'sent'
            AND b.started_at IS NOT NULL AND m2.sent_at > b.started_at)::numeric / b.sent_count) * 100)
        ELSE 0 END
    ) ORDER BY b.created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM wa_broadcasts b WHERE b.clinic_id = v_clinic_id;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_broadcast_list_with_stats() TO anon, authenticated;
