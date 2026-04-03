-- ============================================================
-- Migration: RPCs para o sistema de mensagens WhatsApp (Lara)
-- wa_get_lead_context: Retorna contexto do lead para o Claude
-- wa_log_message: Registra mensagens e atualiza conversa
-- ============================================================

-- 1. wa_get_lead_context
-- Chamada pelo n8n quando chega mensagem do WhatsApp
-- Retorna: lead, historico, system_prompt, conversation_id
CREATE OR REPLACE FUNCTION wa_get_lead_context(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead        record;
  v_conv        record;
  v_history     jsonb;
  v_sys_prompt  text;
  v_clinic_id   uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Buscar lead pelo telefone
  SELECT *
  INTO v_lead
  FROM leads
  WHERE phone = p_phone
    AND clinic_id = v_clinic_id
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- Se nao existe lead, retorna contexto minimo
  IF v_lead IS NULL THEN
    RETURN jsonb_build_object(
      'lead', jsonb_build_object(
        'id', NULL,
        'name', NULL,
        'phone', p_phone,
        'phase', 'lead',
        'temperature', 'hot',
        'queixas_faciais', '[]'::jsonb,
        'idade', NULL,
        'lead_score', 0,
        'day_bucket', 0,
        'ai_persona', 'onboarder',
        'last_response_at', NULL
      ),
      'conversation_id', NULL,
      'history', '[]'::jsonb,
      'system_prompt', ''
    );
  END IF;

  -- Buscar ou criar conversa
  SELECT *
  INTO v_conv
  FROM wa_conversations
  WHERE phone = p_phone
    AND clinic_id = v_clinic_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_conv IS NULL THEN
    INSERT INTO wa_conversations (
      clinic_id, lead_id, phone, status, ai_persona, ai_enabled
    ) VALUES (
      v_clinic_id, v_lead.id, p_phone, 'active',
      COALESCE(v_lead.ai_persona, 'onboarder'), true
    )
    RETURNING * INTO v_conv;
  END IF;

  -- Buscar ultimas 20 mensagens da conversa
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'direction', m.direction,
      'content', m.content,
      'sender', m.sender,
      'sent_at', m.sent_at
    ) ORDER BY m.sent_at ASC
  ), '[]'::jsonb)
  INTO v_history
  FROM (
    SELECT direction, content, sender, sent_at
    FROM wa_messages
    WHERE conversation_id = v_conv.id
    ORDER BY sent_at DESC
    LIMIT 20
  ) m;

  -- Buscar system prompt do template (se existir)
  -- O prompt principal vem do lara-prompt.md, carregado no n8n
  -- Aqui retornamos contexto complementar

  RETURN jsonb_build_object(
    'lead', jsonb_build_object(
      'id',               v_lead.id,
      'name',             v_lead.name,
      'phone',            v_lead.phone,
      'phase',            COALESCE(v_lead.phase, 'lead'),
      'temperature',      COALESCE(v_lead.temperature, 'hot'),
      'queixas_faciais',  COALESCE(v_lead.queixas_faciais, '[]'::jsonb),
      'idade',            v_lead.idade,
      'lead_score',       COALESCE(v_lead.lead_score, 0),
      'day_bucket',       COALESCE(v_lead.day_bucket, 0),
      'ai_persona',       COALESCE(v_conv.ai_persona, v_lead.ai_persona, 'onboarder'),
      'last_response_at', v_lead.last_response_at
    ),
    'conversation_id',    v_conv.id,
    'history',            v_history,
    'system_prompt',      ''
  );
END;
$$;


-- 2. wa_log_message
-- Chamada pelo n8n apos enviar resposta via WhatsApp
-- Registra msg do lead (inbound) + msg da Lara (outbound)
-- Atualiza timestamps na conversa e no lead
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

  -- Resolver lead_id se nao veio
  IF v_lead_id IS NULL THEN
    SELECT id INTO v_lead_id
    FROM leads
    WHERE phone = p_phone
      AND clinic_id = v_clinic_id
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
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
      v_clinic_id, COALESCE(v_lead_id, 'unknown'), p_phone,
      'active', p_persona, true
    )
    RETURNING * INTO v_conv;
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
      true, 'claude-sonnet-4-6', p_tokens_used, 'sent', v_now
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
    'inbound_msg_id',   v_inbound_id,
    'outbound_msg_id',  v_outbound_id,
    'tags_applied',     COALESCE(v_tags_arr, '{}')
  );
END;
$$;
