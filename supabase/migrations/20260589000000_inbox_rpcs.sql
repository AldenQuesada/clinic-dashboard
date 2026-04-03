-- ============================================================
-- Migration: RPCs para a Central de Atendimento (WhatsApp Inbox)
-- wa_inbox_list: Lista conversas ativas para o painel
-- wa_inbox_conversation: Detalhes + mensagens de uma conversa
-- wa_inbox_assume: Secretaria assume conversa (desliga IA)
-- wa_inbox_release: Devolve conversa para Lara (liga IA)
-- wa_inbox_send: Secretaria envia mensagem manual
-- wa_inbox_resolve: Marca conversa como encerrada
-- ============================================================


-- 1. wa_inbox_list
-- Retorna array JSONB com todas as conversas ativas
-- Ordenadas por urgencia e depois por ultima mensagem
CREATE OR REPLACE FUNCTION wa_inbox_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_result     jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_data ORDER BY is_urgent DESC, last_message_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'conversation_id',        c.id,
      'phone',                  c.phone,
      'lead_name',              COALESCE(l.name, 'Desconhecido'),
      'lead_phase',             COALESCE(l.phase, 'lead'),
      'ai_enabled',             c.ai_enabled,
      'ai_persona',             c.ai_persona,
      'last_message_text',      last_msg.content,
      'last_message_at',        c.last_message_at,
      'last_message_direction', last_msg.direction,
      'unread_count',           COALESCE(c.unread_count, 0),
      'tags',                   COALESCE(c.tags, '{}'),
      'is_urgent',              (c.tags && ARRAY['precisa_humano', 'emergencia']),
      'msgs_today_count',       COALESCE(today_ai.cnt, 0)
    ) AS row_data,
    -- campos para ORDER BY
    (c.tags && ARRAY['precisa_humano', 'emergencia']) AS is_urgent,
    c.last_message_at
    FROM wa_conversations c
    -- Join com leads (pode nao existir)
    LEFT JOIN leads l
      ON l.id = c.lead_id
      AND l.clinic_id = v_clinic_id
      AND l.deleted_at IS NULL
    -- Ultima mensagem da conversa
    LEFT JOIN LATERAL (
      SELECT m.content, m.direction
      FROM wa_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.sent_at DESC
      LIMIT 1
    ) last_msg ON true
    -- Contagem de msgs outbound AI hoje
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt
      FROM wa_messages m
      WHERE m.conversation_id = c.id
        AND m.direction = 'outbound'
        AND m.ai_generated = true
        AND m.sent_at >= date_trunc('day', now())
    ) today_ai ON true
    WHERE c.clinic_id = v_clinic_id
      AND c.status = 'active'
  ) sub;

  RETURN v_result;
END;
$$;


-- 2. wa_inbox_conversation
-- Retorna detalhes da conversa + lead + ultimas 50 mensagens
CREATE OR REPLACE FUNCTION wa_inbox_conversation(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_conv       record;
  v_lead       record;
  v_messages   jsonb;
BEGIN
  -- Buscar conversa
  SELECT *
  INTO v_conv
  FROM wa_conversations
  WHERE id = p_conversation_id
    AND clinic_id = v_clinic_id;

  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('error', 'Conversa nao encontrada');
  END IF;

  -- Buscar lead vinculado
  SELECT *
  INTO v_lead
  FROM leads
  WHERE id = v_conv.lead_id
    AND clinic_id = v_clinic_id
    AND deleted_at IS NULL;

  -- Buscar ultimas 50 mensagens (ASC para exibir na ordem)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',           m.id,
      'direction',    m.direction,
      'sender',       m.sender,
      'content',      m.content,
      'content_type', m.content_type,
      'ai_generated', m.ai_generated,
      'sent_at',      m.sent_at
    ) ORDER BY m.sent_at ASC
  ), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT id, direction, sender, content, content_type, ai_generated, sent_at
    FROM wa_messages
    WHERE conversation_id = p_conversation_id
    ORDER BY sent_at DESC
    LIMIT 50
  ) m;

  RETURN jsonb_build_object(
    'conversation', jsonb_build_object(
      'id',         v_conv.id,
      'phone',      v_conv.phone,
      'ai_enabled', v_conv.ai_enabled,
      'ai_persona', v_conv.ai_persona,
      'tags',       COALESCE(v_conv.tags, '{}'),
      'status',     v_conv.status
    ),
    'lead', jsonb_build_object(
      'name',             COALESCE(v_lead.name, 'Desconhecido'),
      'phone',            COALESCE(v_lead.phone, v_conv.phone),
      'phase',            COALESCE(v_lead.phase, 'lead'),
      'temperature',      v_lead.temperature,
      'queixas_faciais',  COALESCE(v_lead.queixas_faciais, '[]'::jsonb),
      'idade',            v_lead.idade
    ),
    'messages', v_messages
  );
END;
$$;


-- 3. wa_inbox_assume
-- Secretaria assume a conversa (desliga IA)
CREATE OR REPLACE FUNCTION wa_inbox_assume(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE wa_conversations
  SET ai_enabled = false,
      updated_at = now()
  WHERE id = p_conversation_id
    AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Conversa nao encontrada');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- 4. wa_inbox_release
-- Devolve conversa para a Lara (liga IA)
CREATE OR REPLACE FUNCTION wa_inbox_release(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE wa_conversations
  SET ai_enabled = true,
      updated_at = now()
  WHERE id = p_conversation_id
    AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Conversa nao encontrada');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- 5. wa_inbox_send
-- Secretaria envia mensagem manual (humano, nao IA)
-- Retorna phone para o frontend chamar a Evolution API
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
  -- Buscar conversa
  SELECT *
  INTO v_conv
  FROM wa_conversations
  WHERE id = p_conversation_id
    AND clinic_id = v_clinic_id;

  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('error', 'Conversa nao encontrada');
  END IF;

  -- Inserir mensagem da secretaria
  INSERT INTO wa_messages (
    conversation_id, clinic_id, direction, sender, content,
    ai_generated, status, sent_at
  ) VALUES (
    p_conversation_id, v_clinic_id, 'outbound', 'humano', p_content,
    false, 'pending', v_now
  )
  RETURNING id INTO v_msg_id;

  -- Atualizar conversa
  UPDATE wa_conversations
  SET last_message_at = v_now,
      last_ai_msg     = v_now,
      updated_at      = v_now
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object(
    'success',    true,
    'message_id', v_msg_id,
    'phone',      v_conv.phone
  );
END;
$$;


-- 6. wa_inbox_resolve
-- Marca conversa como encerrada
CREATE OR REPLACE FUNCTION wa_inbox_resolve(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE wa_conversations
  SET status     = 'closed',
      updated_at = now()
  WHERE id = p_conversation_id
    AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Conversa nao encontrada');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
