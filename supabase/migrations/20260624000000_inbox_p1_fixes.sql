-- ============================================================
-- Prioridade 1: Fixes criticos do Inbox
-- 1. wa_inbox_send nao atualiza last_ai_msg para mensagens humanas
-- 2. wa_log_secretary_reply para logar respostas do celular (n8n)
-- ============================================================

-- FIX 1: wa_inbox_send — nao atualizar last_ai_msg para mensagens humanas
CREATE OR REPLACE FUNCTION wa_inbox_send(p_conversation_id uuid, p_content text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_conv       record;
  v_msg_id     uuid;
  v_now        timestamptz := now();
BEGIN
  SELECT *
  INTO v_conv
  FROM wa_conversations
  WHERE id = p_conversation_id
    AND clinic_id = v_clinic_id;

  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Conversa nao encontrada');
  END IF;

  INSERT INTO wa_messages (
    conversation_id, clinic_id, direction, sender, content,
    ai_generated, status, sent_at
  ) VALUES (
    p_conversation_id, v_clinic_id, 'outbound', 'humano', p_content,
    false, 'pending', v_now
  )
  RETURNING id INTO v_msg_id;

  UPDATE wa_conversations
  SET last_message_at = v_now,
      updated_at      = v_now
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object(
    'success',    true,
    'message_id', v_msg_id,
    'phone',      v_conv.phone
  );
END;
$$;

-- FIX 2: wa_log_secretary_reply — logar respostas da secretaria pelo celular
-- Chamada pelo n8n quando detecta send.message do celular (nao da API)
CREATE OR REPLACE FUNCTION wa_log_secretary_reply(
  p_phone      text,
  p_message    text,
  p_remote_jid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_conv      record;
  v_msg_id    uuid;
  v_now       timestamptz := now();
BEGIN
  SELECT * INTO v_conv
  FROM wa_conversations
  WHERE phone = p_phone AND clinic_id = v_clinic_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conversa nao encontrada');
  END IF;

  INSERT INTO wa_messages (
    conversation_id, clinic_id, direction, sender, content,
    ai_generated, status, sent_at
  ) VALUES (
    v_conv.id, v_clinic_id, 'outbound', 'humano', p_message,
    false, 'sent', v_now
  )
  RETURNING id INTO v_msg_id;

  UPDATE wa_conversations
  SET last_message_at = v_now,
      updated_at      = v_now
  WHERE id = v_conv.id;

  RETURN jsonb_build_object('ok', true, 'message_id', v_msg_id, 'conversation_id', v_conv.id);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_log_secretary_reply(text, text, text) TO anon, authenticated;
