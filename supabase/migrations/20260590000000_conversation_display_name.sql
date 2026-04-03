-- ============================================================
-- Migration: display_name em wa_conversations + vincular orfas
-- Estrategia de 4 camadas para resolver nomes no inbox
-- ============================================================

-- 1. Adicionar display_name na conversa
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS display_name text;

-- 2. Vincular conversas orfas (lead_id = 'unknown') aos leads pelo telefone
UPDATE wa_conversations c
SET lead_id = l.id,
    display_name = COALESCE(c.display_name, l.name),
    updated_at = now()
FROM leads l
WHERE c.lead_id = 'unknown'
  AND c.phone = l.phone
  AND l.clinic_id = c.clinic_id
  AND l.deleted_at IS NULL;

-- 3. Atualizar wa_log_message para receber e salvar pushName
CREATE OR REPLACE FUNCTION wa_log_message(
  p_phone        text,
  p_lead_id      text    DEFAULT NULL,
  p_user_message text    DEFAULT NULL,
  p_ai_response  text    DEFAULT NULL,
  p_tokens_used  int     DEFAULT 0,
  p_tags         text    DEFAULT '[]',
  p_persona      text    DEFAULT 'onboarder',
  p_push_name    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id     uuid := '00000000-0000-0000-0000-000000000001';
  v_conv          record;
  v_lead_id       text;
  v_tags_arr      text[];
  v_now           timestamptz := now();
  v_inbound_id    uuid;
  v_outbound_id   uuid;
BEGIN
  v_lead_id := p_lead_id;

  -- Resolver ou criar lead
  IF v_lead_id IS NULL OR v_lead_id = '' THEN
    SELECT id INTO v_lead_id
    FROM leads
    WHERE phone = p_phone
      AND clinic_id = v_clinic_id
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_lead_id IS NULL THEN
      v_lead_id := wa_upsert_lead_from_chat(p_phone, p_push_name, 'whatsapp');
    END IF;
  END IF;

  -- Buscar conversa ativa
  SELECT *
  INTO v_conv
  FROM wa_conversations
  WHERE phone = p_phone
    AND clinic_id = v_clinic_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Criar conversa se nao existe
  IF v_conv IS NULL THEN
    INSERT INTO wa_conversations (
      clinic_id, lead_id, phone, status, ai_persona, ai_enabled, display_name
    ) VALUES (
      v_clinic_id, v_lead_id, p_phone,
      'active', p_persona, true, p_push_name
    )
    RETURNING * INTO v_conv;
  ELSE
    -- Atualizar lead_id se era 'unknown'
    IF v_conv.lead_id = 'unknown' AND v_lead_id IS NOT NULL THEN
      UPDATE wa_conversations
      SET lead_id = v_lead_id, updated_at = v_now
      WHERE id = v_conv.id;
    END IF;
    -- Atualizar display_name se ainda nao tem e veio pushName
    IF v_conv.display_name IS NULL AND p_push_name IS NOT NULL AND p_push_name != '' THEN
      UPDATE wa_conversations
      SET display_name = p_push_name, updated_at = v_now
      WHERE id = v_conv.id;
    END IF;
  END IF;

  -- Registrar mensagem do lead (inbound)
  IF p_user_message IS NOT NULL AND p_user_message != '' THEN
    INSERT INTO wa_messages (
      conversation_id, clinic_id, direction, sender, content,
      ai_generated, sent_at
    ) VALUES (
      v_conv.id, v_clinic_id, 'inbound', 'lead', p_user_message,
      false, v_now
    )
    RETURNING id INTO v_inbound_id;
  END IF;

  -- Registrar resposta da Lara (outbound)
  IF p_ai_response IS NOT NULL AND p_ai_response != '' THEN
    INSERT INTO wa_messages (
      conversation_id, clinic_id, direction, sender, content,
      ai_generated, ai_model, ai_tokens_used, status, sent_at
    ) VALUES (
      v_conv.id, v_clinic_id, 'outbound', 'lara', p_ai_response,
      true, 'claude-sonnet-4-20250514', p_tokens_used, 'sent', v_now
    )
    RETURNING id INTO v_outbound_id;
  END IF;

  -- Parse tags
  BEGIN
    SELECT array_agg(t)
    INTO v_tags_arr
    FROM jsonb_array_elements_text(p_tags::jsonb) t;
  EXCEPTION WHEN OTHERS THEN
    v_tags_arr := '{}';
  END;

  -- Atualizar conversa
  UPDATE wa_conversations
  SET
    last_message_at = v_now,
    last_lead_msg   = CASE WHEN p_user_message IS NOT NULL THEN v_now ELSE last_lead_msg END,
    last_ai_msg     = CASE WHEN p_ai_response IS NOT NULL THEN v_now ELSE last_ai_msg END,
    ai_persona      = p_persona,
    tags            = CASE
                        WHEN v_tags_arr IS NOT NULL AND array_length(v_tags_arr, 1) > 0
                        THEN (SELECT array_agg(DISTINCT t) FROM unnest(COALESCE(tags, '{}') || v_tags_arr) t)
                        ELSE tags
                      END,
    updated_at      = v_now
  WHERE id = v_conv.id;

  -- Atualizar lead
  IF v_lead_id IS NOT NULL THEN
    UPDATE leads
    SET
      last_contacted_at    = v_now,
      last_response_at     = CASE WHEN p_user_message IS NOT NULL THEN v_now ELSE last_response_at END,
      conversation_status  = 'active',
      ai_persona           = p_persona,
      updated_at           = v_now
    WHERE id = v_lead_id
      AND clinic_id = v_clinic_id;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'conversation_id',  v_conv.id,
    'lead_id',          v_lead_id,
    'inbound_msg_id',   v_inbound_id,
    'outbound_msg_id',  v_outbound_id,
    'tags_applied',     COALESCE(v_tags_arr, '{}')
  );
END;
$$;

-- 4. Atualizar wa_inbox_list com hierarquia de nome
CREATE OR REPLACE FUNCTION wa_inbox_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_result    jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row ORDER BY row.is_urgent DESC, row.last_message_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      c.id AS conversation_id,
      c.phone,
      COALESCE(
        NULLIF(l.name, ''),
        NULLIF(c.display_name, ''),
        '(' || substring(c.phone from 1 for 2) || ') ' ||
        substring(c.phone from 3 for 5) || '-' ||
        substring(c.phone from 8)
      ) AS lead_name,
      COALESCE(l.phase, 'lead') AS lead_phase,
      c.ai_enabled,
      c.ai_persona,
      c.last_message_at,
      COALESCE(c.unread_count, 0) AS unread_count,
      COALESCE(c.tags, '{}') AS tags,
      (c.tags && ARRAY['precisa_humano', 'emergencia']) AS is_urgent,
      lm.content AS last_message_text,
      lm.direction AS last_message_direction,
      COALESCE(today_ai.cnt, 0) AS msgs_today_count
    FROM wa_conversations c
    LEFT JOIN leads l ON l.id = c.lead_id AND l.clinic_id = v_clinic_id AND l.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT content, direction
      FROM wa_messages
      WHERE conversation_id = c.id
      ORDER BY sent_at DESC
      LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS cnt
      FROM wa_messages
      WHERE conversation_id = c.id
        AND direction = 'outbound'
        AND ai_generated = true
        AND sent_at >= date_trunc('day', now())
    ) today_ai ON true
    WHERE c.clinic_id = v_clinic_id
      AND c.status = 'active'
  ) row;

  RETURN v_result;
END;
$$;

-- 5. Atualizar wa_inbox_conversation para incluir display_name
CREATE OR REPLACE FUNCTION wa_inbox_conversation(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_conv      record;
  v_lead      record;
  v_messages  jsonb;
BEGIN
  SELECT * INTO v_conv
  FROM wa_conversations
  WHERE id = p_conversation_id AND clinic_id = v_clinic_id;

  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('error', 'Conversa nao encontrada');
  END IF;

  SELECT * INTO v_lead
  FROM leads
  WHERE id = v_conv.lead_id AND clinic_id = v_clinic_id AND deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'direction', m.direction,
      'sender', m.sender,
      'content', m.content,
      'content_type', m.content_type,
      'ai_generated', m.ai_generated,
      'sent_at', m.sent_at
    ) ORDER BY m.sent_at ASC
  ), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT * FROM wa_messages
    WHERE conversation_id = p_conversation_id
    ORDER BY sent_at DESC
    LIMIT 50
  ) m;

  RETURN jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', v_conv.id,
      'phone', v_conv.phone,
      'ai_enabled', v_conv.ai_enabled,
      'ai_persona', v_conv.ai_persona,
      'tags', COALESCE(v_conv.tags, '{}'),
      'status', v_conv.status,
      'display_name', v_conv.display_name
    ),
    'lead', jsonb_build_object(
      'name', COALESCE(NULLIF(v_lead.name, ''), v_conv.display_name,
        '(' || substring(v_conv.phone from 1 for 2) || ') ' ||
        substring(v_conv.phone from 3 for 5) || '-' ||
        substring(v_conv.phone from 8)),
      'phone', v_conv.phone,
      'phase', COALESCE(v_lead.phase, 'lead'),
      'temperature', COALESCE(v_lead.temperature, 'warm'),
      'queixas_faciais', COALESCE(v_lead.queixas_faciais, '[]'::jsonb),
      'idade', v_lead.idade
    ),
    'messages', v_messages
  );
END;
$$;
