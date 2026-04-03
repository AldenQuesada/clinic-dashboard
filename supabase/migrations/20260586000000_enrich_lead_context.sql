-- ============================================================
-- Migration: Enriquecer wa_get_lead_context
-- Retorna contexto completo: se e novo/recorrente, historico,
-- auto-deteccao de persona, contagem de mensagens
-- ============================================================

CREATE OR REPLACE FUNCTION wa_get_lead_context(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead           record;
  v_conv           record;
  v_history        jsonb;
  v_clinic_id      uuid := '00000000-0000-0000-0000-000000000001';
  v_msg_count      int := 0;
  v_is_returning   boolean := false;
  v_auto_persona   text := 'onboarder';
  v_conv_count     int := 0;
  v_last_ai_msg    text;
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

  -- Se nao existe lead, retorna contexto minimo (lead novo sem quiz)
  IF v_lead IS NULL THEN
    RETURN jsonb_build_object(
      'lead', jsonb_build_object(
        'id', NULL,
        'name', NULL,
        'phone', p_phone,
        'phase', 'unknown',
        'temperature', 'warm',
        'queixas_faciais', '[]'::jsonb,
        'idade', NULL,
        'lead_score', 0,
        'day_bucket', 0,
        'ai_persona', 'onboarder',
        'last_response_at', NULL
      ),
      'conversation_id', NULL,
      'history', '[]'::jsonb,
      'is_returning', false,
      'message_count', 0,
      'conversation_count', 0,
      'last_ai_message', NULL,
      'system_prompt', ''
    );
  END IF;

  -- Contar conversas anteriores
  SELECT count(*) INTO v_conv_count
  FROM wa_conversations
  WHERE phone = p_phone
    AND clinic_id = v_clinic_id;

  -- Buscar ou criar conversa ativa
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

  -- Contar mensagens trocadas nesta conversa
  SELECT count(*) INTO v_msg_count
  FROM wa_messages
  WHERE conversation_id = v_conv.id;

  v_is_returning := (v_msg_count > 0);

  -- Buscar ultima mensagem da Lara (para nao repetir)
  SELECT content INTO v_last_ai_msg
  FROM wa_messages
  WHERE conversation_id = v_conv.id
    AND direction = 'outbound'
    AND sender = 'lara'
  ORDER BY sent_at DESC
  LIMIT 1;

  -- Buscar ultimas 20 mensagens da conversa (ordem cronologica)
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

  -- Auto-deteccao de persona baseada na fase do lead
  v_auto_persona := CASE
    -- Se a conversa ja tem persona definida, manter
    WHEN v_conv.ai_persona IS NOT NULL AND v_conv.ai_persona != 'onboarder'
      THEN v_conv.ai_persona
    -- Baseado na fase do lead
    WHEN v_lead.phase = 'lead' AND v_msg_count = 0
      THEN 'onboarder'
    WHEN v_lead.phase = 'lead' AND v_msg_count > 0
      THEN 'sdr'
    WHEN v_lead.phase = 'agendado'
      THEN 'confirmador'
    WHEN v_lead.phase = 'confirmado'
      THEN 'confirmador'
    WHEN v_lead.phase = 'atendido'
      THEN 'closer'
    WHEN v_lead.phase = 'orcamento'
      THEN 'closer'
    WHEN v_lead.phase = 'convertido'
      THEN 'closer'
    WHEN v_lead.phase = 'perdido'
      THEN 'recuperador'
    -- Se tem muitas msgs sem resposta
    WHEN v_lead.conversation_status = 'sem_resposta'
      THEN 'recuperador'
    -- Default
    ELSE COALESCE(v_lead.ai_persona, 'onboarder')
  END;

  -- Atualizar persona na conversa se mudou
  IF v_auto_persona != COALESCE(v_conv.ai_persona, '') THEN
    UPDATE wa_conversations
    SET ai_persona = v_auto_persona, updated_at = now()
    WHERE id = v_conv.id;
  END IF;

  RETURN jsonb_build_object(
    'lead', jsonb_build_object(
      'id',               v_lead.id,
      'name',             v_lead.name,
      'phone',            v_lead.phone,
      'phase',            COALESCE(v_lead.phase, 'lead'),
      'temperature',      COALESCE(v_lead.temperature, 'warm'),
      'queixas_faciais',  COALESCE(v_lead.queixas_faciais, '[]'::jsonb),
      'idade',            v_lead.idade,
      'lead_score',       COALESCE(v_lead.lead_score, 0),
      'day_bucket',       COALESCE(v_lead.day_bucket, 0),
      'ai_persona',       v_auto_persona,
      'last_response_at', v_lead.last_response_at
    ),
    'conversation_id',    v_conv.id,
    'history',            v_history,
    'is_returning',       v_is_returning,
    'message_count',      v_msg_count,
    'conversation_count', v_conv_count,
    'last_ai_message',    v_last_ai_msg,
    'system_prompt',      ''
  );
END;
$$;
