-- ============================================================
-- Fix: wa_get_lead_context deve buscar conversas mesmo sem lead
-- O numero pode ter conversas anteriores sem estar na tabela leads
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
  v_lead_name      text;
  v_lead_phase     text := 'unknown';
  v_has_lead       boolean := false;
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

  v_has_lead := (v_lead IS NOT NULL);

  -- Contar conversas anteriores (independente de ter lead)
  SELECT count(*) INTO v_conv_count
  FROM wa_conversations
  WHERE phone = p_phone
    AND clinic_id = v_clinic_id;

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
      v_clinic_id,
      CASE WHEN v_has_lead THEN v_lead.id ELSE 'unknown' END,
      p_phone, 'active',
      CASE WHEN v_has_lead THEN COALESCE(v_lead.ai_persona, 'onboarder') ELSE 'onboarder' END,
      true
    )
    RETURNING * INTO v_conv;
  END IF;

  -- Contar mensagens trocadas nesta conversa
  SELECT count(*) INTO v_msg_count
  FROM wa_messages
  WHERE conversation_id = v_conv.id;

  v_is_returning := (v_msg_count > 0);

  -- Buscar ultima mensagem da Lara
  SELECT content INTO v_last_ai_msg
  FROM wa_messages
  WHERE conversation_id = v_conv.id
    AND direction = 'outbound'
    AND sender = 'lara'
  ORDER BY sent_at DESC
  LIMIT 1;

  -- Buscar ultimas 20 mensagens (ordem cronologica)
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

  -- Determinar nome e fase
  IF v_has_lead THEN
    v_lead_name  := v_lead.name;
    v_lead_phase := COALESCE(v_lead.phase, 'lead');
  ELSE
    v_lead_name  := NULL;
    v_lead_phase := CASE WHEN v_msg_count > 0 THEN 'lead' ELSE 'unknown' END;
  END IF;

  -- Auto-deteccao de persona
  v_auto_persona := CASE
    WHEN v_conv.ai_persona IS NOT NULL AND v_conv.ai_persona != 'onboarder' AND v_msg_count > 0
      THEN v_conv.ai_persona
    WHEN v_has_lead AND v_lead.phase = 'lead' AND v_msg_count = 0
      THEN 'onboarder'
    WHEN v_has_lead AND v_lead.phase = 'lead' AND v_msg_count > 0
      THEN 'sdr'
    WHEN v_has_lead AND v_lead.phase = 'agendado'
      THEN 'confirmador'
    WHEN v_has_lead AND v_lead.phase = 'confirmado'
      THEN 'confirmador'
    WHEN v_has_lead AND v_lead.phase IN ('atendido', 'orcamento', 'convertido')
      THEN 'closer'
    WHEN v_has_lead AND v_lead.phase = 'perdido'
      THEN 'recuperador'
    WHEN NOT v_has_lead AND v_msg_count > 0
      THEN 'sdr'
    ELSE 'onboarder'
  END;

  -- Atualizar persona na conversa se mudou
  IF v_auto_persona != COALESCE(v_conv.ai_persona, '') THEN
    UPDATE wa_conversations
    SET ai_persona = v_auto_persona, updated_at = now()
    WHERE id = v_conv.id;
  END IF;

  RETURN jsonb_build_object(
    'lead', jsonb_build_object(
      'id',               CASE WHEN v_has_lead THEN v_lead.id ELSE NULL END,
      'name',             v_lead_name,
      'phone',            p_phone,
      'phase',            v_lead_phase,
      'temperature',      CASE WHEN v_has_lead THEN COALESCE(v_lead.temperature, 'warm') ELSE 'warm' END,
      'queixas_faciais',  CASE WHEN v_has_lead THEN COALESCE(v_lead.queixas_faciais, '[]'::jsonb) ELSE '[]'::jsonb END,
      'idade',            CASE WHEN v_has_lead THEN v_lead.idade ELSE NULL END,
      'lead_score',       CASE WHEN v_has_lead THEN COALESCE(v_lead.lead_score, 0) ELSE 0 END,
      'day_bucket',       CASE WHEN v_has_lead THEN COALESCE(v_lead.day_bucket, 0) ELSE 0 END,
      'ai_persona',       v_auto_persona,
      'last_response_at', CASE WHEN v_has_lead THEN v_lead.last_response_at ELSE NULL END
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
