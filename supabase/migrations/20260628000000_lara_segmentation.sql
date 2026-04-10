-- ============================================================
-- SEGMENTACAO LARA: So responde para funnel fullface
-- Regra: ai_enabled=true E funnel='fullface' E phase='lead'
-- Qualquer outra combinacao = Lara silenciada
-- ============================================================

-- 1. Guard check: adicionar verificacao de funnel
CREATE OR REPLACE FUNCTION wa_guard_check(
  p_phone      text,
  p_message    text,
  p_remote_jid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_conv       record;
  v_conv_id    uuid;
  v_lead       record;
  v_ai_enabled boolean := false;
  v_funnel     text;
  v_phase      text;
  v_msgs_today int := 0;
  v_last_msg   text;
  v_blocks     jsonb := '[]'::jsonb;
  v_flags      jsonb := '[]'::jsonb;
  v_action     text := 'block';
  v_msg_lower  text;
BEGIN
  v_msg_lower := lower(p_message);
  v_conv_id := wa_find_conversation(p_phone, p_remote_jid);

  IF v_conv_id IS NOT NULL THEN
    SELECT * INTO v_conv FROM wa_conversations WHERE id = v_conv_id;
    v_ai_enabled := COALESCE(v_conv.ai_enabled, false);
    v_funnel := v_conv.funnel;

    -- Buscar fase do lead
    IF v_conv.lead_id IS NOT NULL AND v_conv.lead_id != 'unknown' THEN
      SELECT phase INTO v_phase FROM leads WHERE id = v_conv.lead_id AND deleted_at IS NULL LIMIT 1;
    END IF;
  END IF;

  -- REGRA PRINCIPAL: 3 condicoes obrigatorias
  IF NOT v_ai_enabled THEN
    v_action := 'block';
    v_blocks := v_blocks || '"ai_disabled"'::jsonb;
  ELSIF v_funnel IS NULL OR v_funnel NOT IN ('fullface', 'procedimentos') THEN
    v_action := 'block';
    v_blocks := v_blocks || '"no_funnel"'::jsonb;
  ELSIF v_phase IS NOT NULL AND v_phase NOT IN ('lead', 'agendado') THEN
    -- Pacientes, orcamentos, perdidos = secretaria cuida
    v_action := 'block';
    v_blocks := v_blocks || '"phase_excluded"'::jsonb;
  ELSE
    v_action := 'allow';
  END IF;

  -- Guards adicionais (so se ainda allow)
  -- Debounce
  IF v_conv_id IS NOT NULL AND v_action = 'allow' THEN
    IF EXISTS (SELECT 1 FROM wa_messages WHERE conversation_id = v_conv_id AND direction = 'inbound'
      AND sent_at > now() - interval '5 seconds' AND sent_at < now() - interval '1 second') THEN
      v_action := 'block'; v_blocks := v_blocks || '"debounce"'::jsonb;
    END IF;
  END IF;

  -- Limite diario
  IF v_conv_id IS NOT NULL AND v_action = 'allow' THEN
    SELECT COUNT(*) INTO v_msgs_today FROM wa_messages
    WHERE conversation_id = v_conv_id AND direction = 'outbound' AND ai_generated = true AND sent_at::date = CURRENT_DATE;
    IF v_msgs_today >= 30 THEN
      v_action := 'block'; v_blocks := v_blocks || '"daily_limit"'::jsonb;
      UPDATE wa_conversations SET ai_enabled = false, updated_at = now() WHERE id = v_conv_id;
    END IF;
    IF v_msgs_today >= 25 THEN v_flags := v_flags || '"approaching_limit"'::jsonb; END IF;
  END IF;

  -- Duplicata
  IF v_conv_id IS NOT NULL AND v_action = 'allow' THEN
    SELECT content INTO v_last_msg FROM wa_messages WHERE conversation_id = v_conv_id AND direction = 'inbound' ORDER BY sent_at DESC LIMIT 1;
    IF v_last_msg IS NOT NULL AND lower(v_last_msg) = v_msg_lower THEN
      v_action := 'block'; v_blocks := v_blocks || '"duplicate"'::jsonb;
    END IF;
  END IF;

  -- Pedido de humano
  IF v_action = 'allow' AND v_msg_lower ~ '(preciso falar|quero falar|atendente|humano|pessoa real|gerente|reclamação|reclamar)' THEN
    v_flags := v_flags || '"wants_human"'::jsonb;
    UPDATE wa_conversations SET ai_enabled = false, updated_at = now() WHERE id = v_conv_id;
    v_action := 'block'; v_blocks := v_blocks || '"human_requested"'::jsonb;
  END IF;

  -- Msg curta
  IF v_action = 'allow' AND v_msg_lower IN ('ok','sim','nao','não','obrigado','obrigada','valeu','blz','beleza','oi','olá','ola') THEN
    v_flags := v_flags || '"short_msg"'::jsonb;
  END IF;

  RETURN jsonb_build_object('action', v_action, 'blocks', v_blocks, 'flags', v_flags,
    'ai_enabled', v_ai_enabled, 'funnel', v_funnel, 'phase', v_phase,
    'msgs_today', v_msgs_today, 'conversation_id', v_conv_id);
END;
$$;

-- 2. Onboarding trigger: so ativa Lara para leads do quiz com funnel fullface
CREATE OR REPLACE FUNCTION wa_enqueue_onboarding()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_template    record;
  v_content     text;
  v_lead_name   text;
  v_queixa      text;
  v_funnel      text;
BEGIN
  -- Sem telefone ou sem opt-in = nao faz nada
  IF NEW.phone IS NULL OR NEW.phone = '' THEN RETURN NEW; END IF;
  IF NEW.wa_opt_in IS NOT NULL AND NEW.wa_opt_in = false THEN RETURN NEW; END IF;

  -- SEGMENTACAO: so ativa Lara se veio do quiz (source=quiz) E tem funnel definido
  v_funnel := NEW.funnel;
  IF NEW.source_type NOT IN ('quiz', 'landing_page') THEN
    -- Lead criado por WhatsApp direto, importacao, ou outro — Lara NAO ativa
    -- Criar conversa mas com ai_enabled=false
    INSERT INTO wa_conversations (clinic_id, lead_id, phone, status, ai_persona, ai_enabled, funnel)
    VALUES (NEW.clinic_id, NEW.id, NEW.phone, 'active', 'onboarder', false, v_funnel)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- Veio do quiz/landing page — verificar se tem funnel fullface
  IF v_funnel IS NULL OR v_funnel != 'fullface' THEN
    -- Quiz de outro funil ou sem funil — Lara NAO ativa
    INSERT INTO wa_conversations (clinic_id, lead_id, phone, status, ai_persona, ai_enabled, funnel)
    VALUES (NEW.clinic_id, NEW.id, NEW.phone, 'active', 'onboarder', false, v_funnel)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- APROVADO: quiz fullface — ativar Lara
  -- Buscar template de boas-vindas
  SELECT * INTO v_template FROM wa_message_templates
  WHERE clinic_id = NEW.clinic_id AND slug = 'onboarding_welcome' AND is_active = true LIMIT 1;

  IF v_template IS NOT NULL THEN
    v_lead_name := COALESCE(split_part(NEW.name, ' ', 1), 'Lead');
    BEGIN
      SELECT COALESCE(
        (SELECT string_agg(q, ' e ') FROM (SELECT jsonb_array_elements_text(NEW.queixas_faciais) q LIMIT 2) sub),
        'suas queixas'
      ) INTO v_queixa;
    EXCEPTION WHEN OTHERS THEN v_queixa := 'suas queixas';
    END;

    v_content := v_template.content;
    v_content := replace(v_content, '{nome}', v_lead_name);
    v_content := replace(v_content, '{queixa_principal}', v_queixa);

    INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, template_id, priority, scheduled_at, business_hours, status)
    VALUES (NEW.clinic_id, NEW.id, NEW.phone, v_content, v_template.id, 1, NULL, false, 'pending');
  END IF;

  -- Criar conversa com Lara ATIVA e funnel fullface
  INSERT INTO wa_conversations (clinic_id, lead_id, phone, status, ai_persona, ai_enabled, cadence_step, funnel)
  VALUES (NEW.clinic_id, NEW.id, NEW.phone, 'active', 'onboarder', true, 0, 'fullface')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- 3. wa_inbox_release: so permite devolver para Lara se tem funnel
CREATE OR REPLACE FUNCTION wa_inbox_release(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_conv      record;
BEGIN
  SELECT * INTO v_conv FROM wa_conversations WHERE id = p_conversation_id AND clinic_id = v_clinic_id;
  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Conversa nao encontrada');
  END IF;

  -- So permite ativar Lara se tem funnel valido
  IF v_conv.funnel IS NULL OR v_conv.funnel NOT IN ('fullface', 'procedimentos') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lara so pode ser ativada para leads com funil definido (Lifting 5D ou Olheiras)');
  END IF;

  UPDATE wa_conversations
  SET ai_enabled = true, updated_at = now()
  WHERE id = p_conversation_id AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4. GRANTS
GRANT EXECUTE ON FUNCTION wa_guard_check(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_inbox_release(uuid) TO anon, authenticated;
