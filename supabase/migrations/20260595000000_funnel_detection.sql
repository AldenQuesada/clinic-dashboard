-- ============================================================
-- Migration: Deteccao automatica de funil (Full Face vs Procedimentos)
-- Adiciona campo funnel no lead e conversa
-- Detecta pelo conteudo da primeira mensagem
-- ============================================================

-- 1. Adicionar campo funnel
ALTER TABLE leads ADD COLUMN IF NOT EXISTS funnel text;
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS funnel text;

-- 2. Funcao para detectar funil pela mensagem
CREATE OR REPLACE FUNCTION wa_detect_funnel(p_message text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lower text;
BEGIN
  v_lower := lower(p_message);

  -- Full Face: protocolo, lifting 5D, formulario
  IF v_lower ~ '(protocolo|lifting.?5d|formul[aá]rio|harmoniza[cç][aã]o facial|full.?face)' THEN
    RETURN 'fullface';
  END IF;

  -- Procedimentos isolados: queixas especificas, utm
  IF v_lower ~ '(olheiras|p[aá]lpebras|botox|preenchimento|bioestimulador|bigode.?chin[eê]s|sulco|ruga|utm_)' THEN
    RETURN 'procedimentos';
  END IF;

  RETURN NULL;
END;
$$;

-- 3. Atualizar wa_log_message para detectar e salvar funil na primeira msg
CREATE OR REPLACE FUNCTION wa_log_message(
  p_phone        text,
  p_lead_id      text    DEFAULT NULL,
  p_user_message text    DEFAULT NULL,
  p_ai_response  text    DEFAULT NULL,
  p_tokens_used  int     DEFAULT 0,
  p_tags         text    DEFAULT '[]',
  p_persona      text    DEFAULT 'onboarder',
  p_push_name    text    DEFAULT NULL,
  p_remote_jid   text    DEFAULT NULL
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
  v_funnel        text;
BEGIN
  v_lead_id := p_lead_id;
  IF v_lead_id IS NULL OR v_lead_id = '' THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE phone = p_phone AND clinic_id = v_clinic_id AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 1;
    IF v_lead_id IS NULL THEN
      v_lead_id := wa_upsert_lead_from_chat(p_phone, p_push_name, 'whatsapp');
    END IF;
  END IF;

  SELECT * INTO v_conv FROM wa_conversations
  WHERE phone = p_phone AND clinic_id = v_clinic_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_conv IS NULL THEN
    -- Detectar funil na primeira mensagem
    v_funnel := wa_detect_funnel(COALESCE(p_user_message, ''));

    INSERT INTO wa_conversations (clinic_id, lead_id, phone, status, ai_persona, ai_enabled, display_name, remote_jid, funnel)
    VALUES (v_clinic_id, v_lead_id, p_phone, 'active', p_persona, true, p_push_name, p_remote_jid, v_funnel)
    RETURNING * INTO v_conv;

    -- Salvar funil no lead tambem
    IF v_funnel IS NOT NULL THEN
      UPDATE leads SET funnel = v_funnel, updated_at = v_now
      WHERE id = v_lead_id AND funnel IS NULL;
    END IF;
  ELSE
    IF v_conv.lead_id = 'unknown' AND v_lead_id IS NOT NULL THEN
      UPDATE wa_conversations SET lead_id = v_lead_id, updated_at = v_now WHERE id = v_conv.id;
    END IF;
    IF v_conv.display_name IS NULL AND p_push_name IS NOT NULL AND p_push_name != '' THEN
      UPDATE wa_conversations SET display_name = p_push_name, updated_at = v_now WHERE id = v_conv.id;
    END IF;
    IF v_conv.remote_jid IS NULL AND p_remote_jid IS NOT NULL AND p_remote_jid != '' THEN
      UPDATE wa_conversations SET remote_jid = p_remote_jid, updated_at = v_now WHERE id = v_conv.id;
    END IF;
    -- Detectar funil se conversa ainda nao tem
    IF v_conv.funnel IS NULL AND p_user_message IS NOT NULL THEN
      v_funnel := wa_detect_funnel(p_user_message);
      IF v_funnel IS NOT NULL THEN
        UPDATE wa_conversations SET funnel = v_funnel, updated_at = v_now WHERE id = v_conv.id;
        UPDATE leads SET funnel = v_funnel, updated_at = v_now
        WHERE id = v_lead_id AND funnel IS NULL;
      END IF;
    END IF;
  END IF;

  -- Inbound
  IF p_user_message IS NOT NULL AND p_user_message != '' THEN
    INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, ai_generated, sent_at)
    VALUES (v_conv.id, v_clinic_id, 'inbound', 'lead', p_user_message, false, v_now)
    RETURNING id INTO v_inbound_id;
  END IF;

  -- Outbound (+1s para ordem correta)
  IF p_ai_response IS NOT NULL AND p_ai_response != '' THEN
    INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, ai_generated, ai_model, ai_tokens_used, status, sent_at)
    VALUES (v_conv.id, v_clinic_id, 'outbound', 'lara', p_ai_response, true, 'claude-sonnet-4-20250514', p_tokens_used, 'sent', v_now + interval '1 second')
    RETURNING id INTO v_outbound_id;
  END IF;

  BEGIN
    SELECT array_agg(t) INTO v_tags_arr FROM jsonb_array_elements_text(p_tags::jsonb) t;
  EXCEPTION WHEN OTHERS THEN v_tags_arr := '{}'; END;

  UPDATE wa_conversations SET
    last_message_at = v_now,
    last_lead_msg = CASE WHEN p_user_message IS NOT NULL THEN v_now ELSE last_lead_msg END,
    last_ai_msg = CASE WHEN p_ai_response IS NOT NULL THEN v_now + interval '1 second' ELSE last_ai_msg END,
    ai_persona = p_persona,
    tags = CASE WHEN v_tags_arr IS NOT NULL AND array_length(v_tags_arr, 1) > 0
      THEN (SELECT array_agg(DISTINCT t) FROM unnest(COALESCE(tags, '{}') || v_tags_arr) t) ELSE tags END,
    updated_at = v_now
  WHERE id = v_conv.id;

  IF v_lead_id IS NOT NULL THEN
    UPDATE leads SET
      last_contacted_at = v_now,
      last_response_at = CASE WHEN p_user_message IS NOT NULL THEN v_now ELSE last_response_at END,
      conversation_status = 'active', ai_persona = p_persona, updated_at = v_now
    WHERE id = v_lead_id AND clinic_id = v_clinic_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'conversation_id', v_conv.id, 'lead_id', v_lead_id,
    'inbound_msg_id', v_inbound_id, 'outbound_msg_id', v_outbound_id, 'tags_applied', COALESCE(v_tags_arr, '{}'),
    'funnel', COALESCE(v_funnel, v_conv.funnel));
END;
$$;

-- 4. Atualizar wa_get_lead_context para retornar funil
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
  v_funnel         text;
BEGIN
  SELECT * INTO v_lead FROM leads
  WHERE phone = p_phone AND clinic_id = v_clinic_id AND deleted_at IS NULL
  ORDER BY created_at DESC LIMIT 1;

  v_has_lead := (v_lead IS NOT NULL);

  SELECT count(*) INTO v_conv_count FROM wa_conversations
  WHERE phone = p_phone AND clinic_id = v_clinic_id;

  SELECT * INTO v_conv FROM wa_conversations
  WHERE phone = p_phone AND clinic_id = v_clinic_id
  ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'closed' THEN 1 WHEN 'archived' THEN 2 ELSE 3 END,
    created_at DESC
  LIMIT 1;

  IF v_conv IS NOT NULL AND v_conv.status != 'active' THEN
    UPDATE wa_conversations SET status = 'active', updated_at = now() WHERE id = v_conv.id;
  END IF;

  IF v_conv IS NULL THEN
    INSERT INTO wa_conversations (clinic_id, lead_id, phone, status, ai_persona, ai_enabled)
    VALUES (v_clinic_id, CASE WHEN v_has_lead THEN v_lead.id ELSE 'unknown' END, p_phone, 'active',
      CASE WHEN v_has_lead THEN COALESCE(v_lead.ai_persona, 'onboarder') ELSE 'onboarder' END, true)
    RETURNING * INTO v_conv;
  END IF;

  SELECT count(*) INTO v_msg_count FROM wa_messages WHERE conversation_id = v_conv.id;
  v_is_returning := (v_msg_count > 0);

  SELECT content INTO v_last_ai_msg FROM wa_messages
  WHERE conversation_id = v_conv.id AND direction = 'outbound' AND sender = 'lara'
  ORDER BY sent_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'direction', m.direction, 'content', m.content, 'sender', m.sender, 'sent_at', m.sent_at
  ) ORDER BY m.sent_at ASC), '[]'::jsonb) INTO v_history
  FROM (SELECT direction, content, sender, sent_at FROM wa_messages
    WHERE conversation_id = v_conv.id ORDER BY sent_at DESC LIMIT 20) m;

  IF v_has_lead THEN
    v_lead_name := v_lead.name; v_lead_phase := COALESCE(v_lead.phase, 'lead');
  ELSE
    v_lead_name := NULL; v_lead_phase := CASE WHEN v_msg_count > 0 THEN 'lead' ELSE 'unknown' END;
  END IF;

  v_funnel := COALESCE(v_conv.funnel, CASE WHEN v_has_lead THEN v_lead.funnel ELSE NULL END);

  v_auto_persona := CASE
    WHEN v_conv.ai_persona IS NOT NULL AND v_conv.ai_persona != 'onboarder' AND v_msg_count > 0 THEN v_conv.ai_persona
    WHEN v_has_lead AND v_lead.phase = 'lead' AND v_msg_count = 0 THEN 'onboarder'
    WHEN v_has_lead AND v_lead.phase = 'lead' AND v_msg_count > 0 THEN 'sdr'
    WHEN v_has_lead AND v_lead.phase IN ('agendado', 'confirmado') THEN 'confirmador'
    WHEN v_has_lead AND v_lead.phase IN ('atendido', 'orcamento', 'convertido') THEN 'closer'
    WHEN v_has_lead AND v_lead.phase = 'perdido' THEN 'recuperador'
    WHEN NOT v_has_lead AND v_msg_count > 0 THEN 'sdr'
    ELSE 'onboarder'
  END;

  IF v_auto_persona != COALESCE(v_conv.ai_persona, '') THEN
    UPDATE wa_conversations SET ai_persona = v_auto_persona, updated_at = now() WHERE id = v_conv.id;
  END IF;

  RETURN jsonb_build_object(
    'lead', jsonb_build_object(
      'id', CASE WHEN v_has_lead THEN v_lead.id ELSE NULL END,
      'name', v_lead_name, 'phone', p_phone,
      'phase', v_lead_phase,
      'temperature', CASE WHEN v_has_lead THEN COALESCE(v_lead.temperature, 'warm') ELSE 'warm' END,
      'queixas_faciais', CASE WHEN v_has_lead THEN COALESCE(v_lead.queixas_faciais, '[]'::jsonb) ELSE '[]'::jsonb END,
      'idade', CASE WHEN v_has_lead THEN v_lead.idade ELSE NULL END,
      'lead_score', CASE WHEN v_has_lead THEN COALESCE(v_lead.lead_score, 0) ELSE 0 END,
      'day_bucket', CASE WHEN v_has_lead THEN COALESCE(v_lead.day_bucket, 0) ELSE 0 END,
      'ai_persona', v_auto_persona,
      'last_response_at', CASE WHEN v_has_lead THEN v_lead.last_response_at ELSE NULL END,
      'funnel', v_funnel
    ),
    'conversation_id', v_conv.id, 'history', v_history,
    'is_returning', v_is_returning, 'message_count', v_msg_count,
    'conversation_count', v_conv_count, 'last_ai_message', v_last_ai_msg,
    'system_prompt', ''
  );
END;
$$;
