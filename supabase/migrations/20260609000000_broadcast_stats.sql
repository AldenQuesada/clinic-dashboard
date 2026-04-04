-- Add delivery tracking columns to outbox
ALTER TABLE wa_outbox ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE wa_outbox ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- RPC to get broadcast stats including response tracking
CREATE OR REPLACE FUNCTION wa_broadcast_stats(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_broadcast wa_broadcasts%ROWTYPE;
  v_total int;
  v_sent int;
  v_failed int;
  v_delivered int;
  v_read int;
  v_responded int;
BEGIN
  SELECT * INTO v_broadcast FROM wa_broadcasts WHERE id = p_broadcast_id AND clinic_id = v_clinic_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

  SELECT count(*) INTO v_total FROM wa_outbox WHERE broadcast_id = p_broadcast_id;
  SELECT count(*) INTO v_sent FROM wa_outbox WHERE broadcast_id = p_broadcast_id AND status = 'sent';
  SELECT count(*) INTO v_failed FROM wa_outbox WHERE broadcast_id = p_broadcast_id AND status = 'failed';
  SELECT count(*) INTO v_delivered FROM wa_outbox WHERE broadcast_id = p_broadcast_id AND delivered_at IS NOT NULL;
  SELECT count(*) INTO v_read FROM wa_outbox WHERE broadcast_id = p_broadcast_id AND read_at IS NOT NULL;

  -- Count responses: leads who sent a message AFTER the broadcast started
  SELECT count(DISTINCT o.lead_id) INTO v_responded
  FROM wa_outbox o
  JOIN wa_messages m ON m.conversation_id = o.conversation_id AND m.direction = 'inbound'
  WHERE o.broadcast_id = p_broadcast_id
    AND o.status = 'sent'
    AND m.sent_at > v_broadcast.started_at;

  RETURN jsonb_build_object(
    'ok', true,
    'total', v_total,
    'sent', v_sent,
    'failed', v_failed,
    'delivered', v_delivered,
    'read', v_read,
    'responded', v_responded,
    'send_rate', CASE WHEN v_total > 0 THEN round((v_sent::numeric / v_total) * 100) ELSE 0 END,
    'delivery_rate', CASE WHEN v_sent > 0 THEN round((v_delivered::numeric / v_sent) * 100) ELSE 0 END,
    'read_rate', CASE WHEN v_sent > 0 THEN round((v_read::numeric / v_sent) * 100) ELSE 0 END,
    'response_rate', CASE WHEN v_sent > 0 THEN round((v_responded::numeric / v_sent) * 100) ELSE 0 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wa_broadcast_stats(uuid) TO anon, authenticated;
