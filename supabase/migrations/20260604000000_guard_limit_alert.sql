-- ============================================================
-- Fix: Guard limit 30 + alerta em 25 msgs
-- Quando conversa chega em 25 msgs AI no dia, cria alerta interno
-- ============================================================

-- Recriar funcao com limite 30 e alerta em 25
CREATE OR REPLACE FUNCTION wa_guard_check(
  p_phone        text,
  p_message      text,
  p_remote_jid   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id    uuid := '00000000-0000-0000-0000-000000000001';
  v_conv         record;
  v_ai_enabled   boolean := true;
  v_msgs_today   int := 0;
  v_last_msg     text;
  v_last_2_msgs  text[];
  v_spam_count   int := 0;
  v_result       jsonb;
  v_blocks       jsonb := '[]'::jsonb;
  v_flags        jsonb := '[]'::jsonb;
  v_msg_lower    text;
  v_action       text := 'allow';
  v_lead_name    text;
BEGIN
  v_msg_lower := lower(p_message);

  -- GUARD 1: Buscar conversa e verificar ai_enabled
  SELECT * INTO v_conv
  FROM wa_conversations
  WHERE phone = p_phone AND clinic_id = v_clinic_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_conv IS NOT NULL THEN
    v_ai_enabled := COALESCE(v_conv.ai_enabled, true);
  END IF;

  IF NOT v_ai_enabled THEN
    v_action := 'block';
    v_blocks := v_blocks || '"ai_disabled"'::jsonb;
  END IF;

  -- GUARD 1.5: Debounce (skip if another inbound msg in last 5s)
  IF v_conv IS NOT NULL AND v_action = 'allow' THEN
    IF EXISTS (
      SELECT 1 FROM wa_messages
      WHERE conversation_id = v_conv.id
        AND direction = 'inbound'
        AND sent_at > now() - interval '5 seconds'
        AND sent_at < now() - interval '1 second'
    ) THEN
      v_action := 'block';
      v_blocks := v_blocks || '"debounce"'::jsonb;
    END IF;
  END IF;

  -- GUARD 2: Limite diario (30 msgs da IA por conversa)
  IF v_conv IS NOT NULL AND v_action = 'allow' THEN
    SELECT count(*) INTO v_msgs_today
    FROM wa_messages
    WHERE conversation_id = v_conv.id
      AND direction = 'outbound'
      AND ai_generated = true
      AND sent_at >= date_trunc('day', now());

    -- ALERTA em 25 msgs (aviso antes do limite)
    IF v_msgs_today = 25 THEN
      -- Buscar nome do lead para o alerta
      SELECT name INTO v_lead_name FROM leads
      WHERE phone = p_phone AND clinic_id = v_clinic_id LIMIT 1;

      -- Criar alerta interno no dashboard
      PERFORM sdr_create_internal_alert(
        'conversation',
        v_conv.id::text,
        NULL,
        'Limite de msgs chegando: ' || COALESCE(v_lead_name, p_phone),
        'A conversa com ' || COALESCE(v_lead_name, p_phone) || ' esta em 25/30 mensagens AI hoje. A Lara sera pausada automaticamente em 30. Assuma a conversa se necessario.',
        'warning',
        'all'
      );
    END IF;

    -- BLOQUEAR em 30 msgs
    IF v_msgs_today >= 30 THEN
      v_action := 'block';
      v_blocks := v_blocks || '"daily_limit_reached"'::jsonb;

      SELECT name INTO v_lead_name FROM leads
      WHERE phone = p_phone AND clinic_id = v_clinic_id LIMIT 1;

      -- Alerta critico: limite atingido
      PERFORM sdr_create_internal_alert(
        'conversation',
        v_conv.id::text,
        NULL,
        'Lara PAUSADA: ' || COALESCE(v_lead_name, p_phone),
        'Limite de 30 mensagens AI atingido na conversa com ' || COALESCE(v_lead_name, p_phone) || '. A Lara foi pausada. Assuma a conversa manualmente.',
        'danger',
        'all'
      );

      UPDATE wa_conversations
      SET ai_enabled = false, updated_at = now()
      WHERE id = v_conv.id;
    END IF;
  END IF;

  -- GUARD 3: Spam (mesma mensagem 3x seguidas)
  IF v_conv IS NOT NULL AND v_action = 'allow' THEN
    SELECT array_agg(content ORDER BY sent_at DESC)
    INTO v_last_2_msgs
    FROM (
      SELECT content FROM wa_messages
      WHERE conversation_id = v_conv.id
        AND direction = 'inbound'
      ORDER BY sent_at DESC LIMIT 2
    ) sub;

    IF v_last_2_msgs IS NOT NULL
       AND array_length(v_last_2_msgs, 1) = 2
       AND v_last_2_msgs[1] = p_message
       AND v_last_2_msgs[2] = p_message THEN
      v_action := 'block';
      v_blocks := v_blocks || '"spam_repeated"'::jsonb;
    END IF;
  END IF;

  -- GUARD 4: Emergencia medica
  IF v_action = 'allow' THEN
    IF v_msg_lower ~ '(urgente|emergencia|sangramento|sangr|dor forte|alergia|inchaço|inchado|hospital|socorro|reação|reacao|febre|infecç|inflamou|pus )' THEN
      v_action := 'emergency';
      v_flags := v_flags || '"emergencia"'::jsonb;
      IF v_conv IS NOT NULL THEN
        UPDATE wa_conversations
        SET tags = array_append(COALESCE(tags, '{}'), 'emergencia'),
            updated_at = now()
        WHERE id = v_conv.id
          AND NOT ('emergencia' = ANY(COALESCE(tags, '{}')));
      END IF;
    END IF;
  END IF;

  -- GUARD 5: Pedido explicito de humano
  IF v_action = 'allow' THEN
    IF v_msg_lower ~ '(falar com (alguem|alguém|pessoa|humano|atendente|doutora|dra|médic|secretaria))|((quero|preciso|pode) (me )?(passar|transferir|conectar))|(nao (e|é) robo|voce (e|é) robo|bot)' THEN
      v_action := 'human_handoff';
      v_flags := v_flags || '"precisa_humano"'::jsonb;
      IF v_conv IS NOT NULL THEN
        UPDATE wa_conversations
        SET ai_enabled = false,
            tags = array_append(COALESCE(tags, '{}'), 'precisa_humano'),
            updated_at = now()
        WHERE id = v_conv.id
          AND NOT ('precisa_humano' = ANY(COALESCE(tags, '{}')));
      END IF;
    END IF;
  END IF;

  -- GUARD 6: Conteudo inapropriado
  IF v_action = 'allow' THEN
    IF v_msg_lower ~ '(puta|merda|fdp|caralho|vai (se |)foder|arrombad|viado|buceta|piranha|desgraça|lixo|nojent|idiota|imbecil)' THEN
      v_action := 'block';
      v_blocks := v_blocks || '"inappropriate_content"'::jsonb;
      IF v_conv IS NOT NULL THEN
        UPDATE wa_conversations
        SET ai_enabled = false, updated_at = now()
        WHERE id = v_conv.id;
      END IF;
    END IF;
  END IF;

  -- GUARD 7: Reclamacao / insatisfacao
  IF v_action = 'allow' THEN
    IF v_msg_lower ~ '(reclamar|reclamação|insatisfeit|processo|procon|advogado|justiça|tribunal|denunciar|denúncia|ouvidoria)' THEN
      v_action := 'human_handoff';
      v_flags := v_flags || '"reclamacao"'::jsonb;
      IF v_conv IS NOT NULL THEN
        UPDATE wa_conversations
        SET tags = array_append(COALESCE(tags, '{}'), 'precisa_humano'),
            updated_at = now()
        WHERE id = v_conv.id
          AND NOT ('precisa_humano' = ANY(COALESCE(tags, '{}')));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'action',       v_action,
    'blocks',       v_blocks,
    'flags',        v_flags,
    'ai_enabled',   v_ai_enabled,
    'msgs_today',   v_msgs_today,
    'conversation_id', CASE WHEN v_conv IS NOT NULL THEN v_conv.id ELSE NULL END
  );
END;
$$;
