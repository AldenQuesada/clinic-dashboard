-- ============================================================
-- Migration: Auto-criar lead quando numero desconhecido conversa
-- e atualizar nome quando Lara identifica o paciente
-- ============================================================

-- Funcao para criar/atualizar lead a partir do WhatsApp
CREATE OR REPLACE FUNCTION wa_upsert_lead_from_chat(
  p_phone      text,
  p_name       text DEFAULT NULL,
  p_source     text DEFAULT 'whatsapp'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_lead_id    text;
BEGIN
  -- Buscar lead existente
  SELECT id INTO v_lead_id
  FROM leads
  WHERE phone = p_phone
    AND clinic_id = v_clinic_id
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    -- Lead existe: atualizar nome se veio e se o lead nao tem nome
    IF p_name IS NOT NULL AND p_name != '' THEN
      UPDATE leads
      SET name = COALESCE(NULLIF(name, ''), p_name),
          updated_at = now()
      WHERE id = v_lead_id
        AND (name IS NULL OR name = '');
    END IF;
    RETURN v_lead_id;
  END IF;

  -- Lead nao existe: criar
  v_lead_id := gen_random_uuid()::text;

  INSERT INTO leads (
    id, clinic_id, name, phone, email, status,
    phase, temperature, source_type, lead_score,
    day_bucket, wa_opt_in, data, created_at, updated_at
  ) VALUES (
    v_lead_id, v_clinic_id,
    COALESCE(p_name, ''),
    p_phone,
    '',
    'active',
    'lead',
    'warm',
    p_source,
    0,
    0,
    true,
    '{}'::jsonb,
    now(), now()
  );

  -- Atualizar conversa com o lead_id real
  UPDATE wa_conversations
  SET lead_id = v_lead_id, updated_at = now()
  WHERE phone = p_phone
    AND clinic_id = v_clinic_id
    AND lead_id = 'unknown';

  RETURN v_lead_id;
END;
$$;

-- Atualizar wa_log_message para auto-criar lead
CREATE OR REPLACE FUNCTION wa_log_message(
  p_phone        text,
  p_lead_id      text    DEFAULT NULL,
  p_user_message text    DEFAULT NULL,
  p_ai_response  text    DEFAULT NULL,
  p_tokens_used  int     DEFAULT 0,
  p_tags         text    DEFAULT '[]',
  p_persona      text    DEFAULT 'onboarder'
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
    -- Tentar encontrar lead existente
    SELECT id INTO v_lead_id
    FROM leads
    WHERE phone = p_phone
      AND clinic_id = v_clinic_id
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    -- Se nao existe, criar automaticamente
    IF v_lead_id IS NULL THEN
      v_lead_id := wa_upsert_lead_from_chat(p_phone, NULL, 'whatsapp');
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
      clinic_id, lead_id, phone, status, ai_persona, ai_enabled
    ) VALUES (
      v_clinic_id, v_lead_id, p_phone,
      'active', p_persona, true
    )
    RETURNING * INTO v_conv;
  ELSE
    -- Atualizar lead_id se era 'unknown'
    IF v_conv.lead_id = 'unknown' AND v_lead_id IS NOT NULL THEN
      UPDATE wa_conversations
      SET lead_id = v_lead_id, updated_at = v_now
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

  -- Parse tags JSON array para text[]
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
