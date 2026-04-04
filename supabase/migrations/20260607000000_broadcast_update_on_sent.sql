-- ============================================================
-- Migration: Update broadcast sent_count and status on each message sent
-- ============================================================

CREATE OR REPLACE FUNCTION wa_outbox_on_sent(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broadcast_id uuid;
  v_msg_id uuid;
BEGIN
  -- Mark message as sent
  UPDATE wa_outbox SET status = 'sent', processed_at = now()
  WHERE id = p_id
  RETURNING broadcast_id INTO v_broadcast_id;

  -- If part of a broadcast, update counters and check completion
  IF v_broadcast_id IS NOT NULL THEN
    UPDATE wa_broadcasts
    SET sent_count = (
      SELECT count(*) FROM wa_outbox
      WHERE broadcast_id = v_broadcast_id AND status = 'sent'
    )
    WHERE id = v_broadcast_id;

    -- Check if all messages are done (sent or failed)
    IF NOT EXISTS (
      SELECT 1 FROM wa_outbox
      WHERE broadcast_id = v_broadcast_id
        AND status IN ('pending', 'processing')
    ) THEN
      UPDATE wa_broadcasts
      SET status = 'completed',
          completed_at = now(),
          failed_count = (
            SELECT count(*) FROM wa_outbox
            WHERE broadcast_id = v_broadcast_id AND status = 'failed'
          )
      WHERE id = v_broadcast_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'message_id', p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_outbox_on_sent(uuid) TO anon, authenticated;
