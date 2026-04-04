-- ============================================================
-- Migration: Delivery & Read Receipt Tracking
--
-- Adds wa_message_id to outbox for correlation with Evolution API,
-- plus RPCs to mark delivered/read from webhook events.
-- ============================================================


-- ============================================================
-- 1. wa_message_id column on wa_outbox for webhook correlation
-- ============================================================
ALTER TABLE wa_outbox ADD COLUMN IF NOT EXISTS wa_message_id text;
ALTER TABLE wa_outbox ADD COLUMN IF NOT EXISTS sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_wa_outbox_wa_message_id
  ON wa_outbox (wa_message_id)
  WHERE wa_message_id IS NOT NULL;


-- ============================================================
-- 2. wa_outbox_on_sent — UPDATED to accept wa_message_id
--    Replaces old version that only accepted p_id
-- ============================================================
DROP FUNCTION IF EXISTS wa_outbox_on_sent(uuid);

CREATE OR REPLACE FUNCTION wa_outbox_on_sent(
  p_outbox_id     uuid,
  p_wa_message_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broadcast_id uuid;
BEGIN
  UPDATE wa_outbox
  SET status        = 'sent',
      sent_at       = now(),
      processed_at  = now(),
      wa_message_id = COALESCE(p_wa_message_id, wa_message_id)
  WHERE id = p_outbox_id
  RETURNING broadcast_id INTO v_broadcast_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Outbox item nao encontrado');
  END IF;

  -- Update broadcast counters if part of a broadcast
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

  RETURN jsonb_build_object('ok', true, 'id', p_outbox_id);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_outbox_on_sent(uuid, text) TO anon, authenticated;


-- ============================================================
-- 3. wa_outbox_on_delivered — mark delivery receipt
--    Matches by wa_message_id (from Evolution API webhook)
-- ============================================================
CREATE OR REPLACE FUNCTION wa_outbox_on_delivered(
  p_wa_message_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox_id      uuid;
  v_conversation_id uuid;
  v_updated        int := 0;
BEGIN
  IF p_wa_message_id IS NULL OR p_wa_message_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wa_message_id obrigatorio');
  END IF;

  -- Update outbox
  UPDATE wa_outbox
  SET delivered_at = COALESCE(delivered_at, now())
  WHERE wa_message_id = p_wa_message_id
    AND delivered_at IS NULL
  RETURNING id, conversation_id INTO v_outbox_id, v_conversation_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Also update wa_messages if conversation linked
  UPDATE wa_messages
  SET delivered_at = COALESCE(delivered_at, now()),
      status = CASE WHEN status = 'sent' THEN 'delivered' ELSE status END
  WHERE wa_message_id = p_wa_message_id
    AND delivered_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'outbox_updated', v_updated > 0,
    'outbox_id', v_outbox_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wa_outbox_on_delivered(text) TO anon, authenticated;


-- ============================================================
-- 4. wa_outbox_on_read — mark read receipt
--    Also sets delivered_at if not yet set (read implies delivered)
-- ============================================================
CREATE OR REPLACE FUNCTION wa_outbox_on_read(
  p_wa_message_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox_id      uuid;
  v_conversation_id uuid;
  v_updated        int := 0;
BEGIN
  IF p_wa_message_id IS NULL OR p_wa_message_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wa_message_id obrigatorio');
  END IF;

  -- Update outbox: read implies delivered
  UPDATE wa_outbox
  SET delivered_at = COALESCE(delivered_at, now()),
      read_at      = COALESCE(read_at, now())
  WHERE wa_message_id = p_wa_message_id
    AND read_at IS NULL
  RETURNING id, conversation_id INTO v_outbox_id, v_conversation_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Also update wa_messages
  UPDATE wa_messages
  SET delivered_at = COALESCE(delivered_at, now()),
      read_at      = COALESCE(read_at, now()),
      status = 'read'
  WHERE wa_message_id = p_wa_message_id
    AND read_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'outbox_updated', v_updated > 0,
    'outbox_id', v_outbox_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wa_outbox_on_read(text) TO anon, authenticated;
