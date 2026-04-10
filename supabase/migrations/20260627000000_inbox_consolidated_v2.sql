-- ============================================================
-- CONSOLIDACAO COMPLETA: Inbox WhatsApp v2
-- Substitui TODAS as RPCs de inbox por versoes limpas
-- Corrige: LID mapping, phone matching, media, guard, lead creation
-- ============================================================

-- ── SCHEMA: Garantir colunas necessarias ──────────────────────
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS remote_jid text;
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS funnel text;
ALTER TABLE wa_conversations ALTER COLUMN ai_enabled SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wa_conv_remote_jid ON wa_conversations (remote_jid) WHERE remote_jid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON wa_conversations (clinic_id, phone, status);

-- ── TABELA: wa_errors (se nao existir) ────────────────────────
CREATE TABLE IF NOT EXISTS wa_errors (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  source      text NOT NULL,
  error_type  text NOT NULL,
  phone       text,
  payload     jsonb,
  error_msg   text,
  resolved    boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_errors_recent ON wa_errors (created_at DESC) WHERE NOT resolved;

-- ── DROP: Limpar overloads antigos ────────────────────────────
DROP FUNCTION IF EXISTS wa_log_message(text, text, text, text, int, text, text);
DROP FUNCTION IF EXISTS wa_log_message(text, text, text, text, int, text, text, text, text);
DROP FUNCTION IF EXISTS wa_log_message(text, text, text, text, int, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS wa_guard_check(text, text);
DROP FUNCTION IF EXISTS wa_guard_check(text, text, text);
DROP FUNCTION IF EXISTS wa_log_secretary_reply(text, text, text);
DROP FUNCTION IF EXISTS wa_upsert_lead_from_chat(text, text, text);
DROP FUNCTION IF EXISTS wa_inbox_send(uuid, text);

-- ══════════════════════════════════════════════════════════════
-- 1. wa_upsert_lead_from_chat
-- Cria ou atualiza lead a partir do WhatsApp
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION wa_upsert_lead_from_chat(
  p_phone  text,
  p_name   text DEFAULT NULL,
  p_source text DEFAULT 'whatsapp'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_lead      record;
  v_lead_id   uuid;
BEGIN
  -- Buscar por right(8) para evitar duplicatas por formato de phone
  SELECT * INTO v_lead FROM leads
  WHERE phone LIKE '%' || right(p_phone, 8)
    AND clinic_id = v_clinic_id AND deleted_at IS NULL
  LIMIT 1;

  IF v_lead IS NOT NULL THEN
    UPDATE leads SET wa_opt_in = true, last_contacted_at = now(), updated_at = now()
    WHERE id = v_lead.id;
    RETURN jsonb_build_object('ok', true, 'lead_id', v_lead.id, 'action', 'updated');
  END IF;

  v_lead_id := gen_random_uuid();
  INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, wa_opt_in)
  VALUES (v_lead_id, v_clinic_id, COALESCE(p_name, ''), p_phone, '', 'active', 'lead', 'cold', COALESCE(p_source, 'whatsapp'), 0, true);

  RETURN jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'action', 'created');
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 2. wa_find_conversation
-- Helper interno: busca conversa por phone OU remote_jid (LID)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION wa_find_conversation(
  p_phone      text,
  p_remote_jid text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_conv_id   uuid;
  v_jid_clean text;
BEGIN
  -- 1. Match exato por phone
  SELECT id INTO v_conv_id FROM wa_conversations
  WHERE phone = p_phone AND clinic_id = v_clinic_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;
  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;

  -- 2. Match por remote_jid (LID)
  IF p_remote_jid IS NOT NULL AND p_remote_jid != '' THEN
    v_jid_clean := split_part(p_remote_jid, '@', 1);
    SELECT id INTO v_conv_id FROM wa_conversations
    WHERE remote_jid LIKE '%' || v_jid_clean || '%'
      AND clinic_id = v_clinic_id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1;
    IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;
  END IF;

  -- 3. Match fuzzy por right(8)
  IF p_phone IS NOT NULL AND length(p_phone) >= 8 THEN
    SELECT id INTO v_conv_id FROM wa_conversations
    WHERE phone LIKE '%' || right(p_phone, 8)
      AND clinic_id = v_clinic_id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1;
    IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 3. wa_log_message
-- Log principal: inbound + outbound + media
-- Chamado pelo n8n (Log Inbound Only e Log Sequential fallback)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION wa_log_message(
  p_phone        text,
  p_lead_id      text    DEFAULT NULL,
  p_user_message text    DEFAULT NULL,
  p_ai_response  text    DEFAULT NULL,
  p_tokens_used  int     DEFAULT 0,
  p_tags         text    DEFAULT '[]',
  p_persona      text    DEFAULT 'onboarder',
  p_push_name    text    DEFAULT NULL,
  p_remote_jid   text    DEFAULT NULL,
  p_content_type text    DEFAULT 'text',
  p_media_url    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id     uuid := '00000000-0000-0000-0000-000000000001';
  v_conv_id       uuid;
  v_conv          record;
  v_lead_id       text;
  v_tags_arr      text[];
  v_now           timestamptz := now();
  v_inbound_id    uuid;
  v_outbound_id   uuid;
  v_detected_name text;
  v_ct            text;
BEGIN
  v_lead_id := p_lead_id;
  v_detected_name := NULLIF(TRIM(COALESCE(p_push_name, '')), '');
  v_ct := COALESCE(NULLIF(p_content_type, ''), 'text');

  -- Resolver lead
  IF v_lead_id IS NULL OR v_lead_id = '' THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE phone LIKE '%' || right(p_phone, 8)
      AND clinic_id = v_clinic_id AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 1;
    IF v_lead_id IS NULL THEN
      v_lead_id := (wa_upsert_lead_from_chat(p_phone, v_detected_name, 'whatsapp'))->>'lead_id';
    END IF;
  END IF;

  -- Buscar conversa (phone → LID → right8)
  v_conv_id := wa_find_conversation(p_phone, p_remote_jid);

  IF v_conv_id IS NULL THEN
    INSERT INTO wa_conversations (clinic_id, lead_id, phone, status, ai_persona, ai_enabled, display_name, remote_jid)
    VALUES (v_clinic_id, v_lead_id, p_phone, 'active', 'onboarder', false, v_detected_name, p_remote_jid)
    RETURNING id INTO v_conv_id;
  ELSE
    -- Atualizar metadados se necessario
    SELECT * INTO v_conv FROM wa_conversations WHERE id = v_conv_id;
    IF v_conv.lead_id = 'unknown' AND v_lead_id IS NOT NULL THEN
      UPDATE wa_conversations SET lead_id = v_lead_id, updated_at = v_now WHERE id = v_conv_id;
    END IF;
    IF v_detected_name IS NOT NULL AND (v_conv.display_name IS NULL OR v_conv.display_name = '' OR v_conv.display_name = 'Desconhecido') THEN
      UPDATE wa_conversations SET display_name = v_detected_name, updated_at = v_now WHERE id = v_conv_id;
    END IF;
    IF p_remote_jid IS NOT NULL AND p_remote_jid != '' AND (v_conv.remote_jid IS NULL OR v_conv.remote_jid = '') THEN
      UPDATE wa_conversations SET remote_jid = p_remote_jid, updated_at = v_now WHERE id = v_conv_id;
    END IF;
  END IF;

  -- Inbound
  IF p_user_message IS NOT NULL AND p_user_message != '' THEN
    INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, content_type, media_url, ai_generated, sent_at)
    VALUES (v_conv_id, v_clinic_id, 'inbound', 'lead', p_user_message, v_ct, p_media_url, false, v_now)
    RETURNING id INTO v_inbound_id;
  END IF;

  -- Outbound (resposta AI)
  IF p_ai_response IS NOT NULL AND p_ai_response != '' THEN
    INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, content_type, ai_generated, ai_model, ai_tokens_used, status, sent_at)
    VALUES (v_conv_id, v_clinic_id, 'outbound', 'lara', p_ai_response, 'text', true, 'claude-sonnet-4-20250514', p_tokens_used, 'sent', v_now + interval '1 second')
    RETURNING id INTO v_outbound_id;
  END IF;

  -- Tags
  BEGIN
    SELECT array_agg(t) INTO v_tags_arr FROM jsonb_array_elements_text(p_tags::jsonb) t;
  EXCEPTION WHEN OTHERS THEN v_tags_arr := '{}';
  END;

  -- Atualizar conversa
  UPDATE wa_conversations SET
    last_message_at = v_now,
    last_lead_msg = CASE WHEN p_user_message IS NOT NULL AND p_user_message != '' THEN v_now ELSE last_lead_msg END,
    last_ai_msg = CASE WHEN p_ai_response IS NOT NULL AND p_ai_response != '' THEN v_now ELSE last_ai_msg END,
    ai_persona = p_persona,
    tags = CASE WHEN v_tags_arr IS NOT NULL AND array_length(v_tags_arr, 1) > 0
      THEN (SELECT array_agg(DISTINCT t) FROM unnest(COALESCE(tags, '{}') || v_tags_arr) t)
      ELSE tags END,
    updated_at = v_now
  WHERE id = v_conv_id;

  -- Atualizar lead
  IF v_lead_id IS NOT NULL THEN
    UPDATE leads SET
      name = CASE WHEN v_detected_name IS NOT NULL AND (name IS NULL OR name = '') THEN v_detected_name ELSE name END,
      last_contacted_at = v_now,
      last_response_at = CASE WHEN p_user_message IS NOT NULL THEN v_now ELSE last_response_at END,
      conversation_status = 'active', ai_persona = p_persona, updated_at = v_now
    WHERE id = v_lead_id AND clinic_id = v_clinic_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'conversation_id', v_conv_id, 'lead_id', v_lead_id,
    'inbound_msg_id', v_inbound_id, 'outbound_msg_id', v_outbound_id);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 4. wa_log_secretary_reply
-- Registra mensagem da secretaria enviada pelo celular
-- Usa wa_find_conversation para resolver LID → conversa real
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION wa_log_secretary_reply(
  p_phone      text,
  p_message    text,
  p_remote_jid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_conv_id   uuid;
  v_msg_id    uuid;
  v_now       timestamptz := now();
BEGIN
  v_conv_id := wa_find_conversation(p_phone, p_remote_jid);

  IF v_conv_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conversa nao encontrada');
  END IF;

  -- Salvar remote_jid na conversa se ainda nao tem
  IF p_remote_jid IS NOT NULL AND p_remote_jid != '' THEN
    UPDATE wa_conversations SET remote_jid = COALESCE(remote_jid, p_remote_jid), updated_at = v_now
    WHERE id = v_conv_id AND (remote_jid IS NULL OR remote_jid = '');
  END IF;

  INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, ai_generated, status, sent_at)
  VALUES (v_conv_id, v_clinic_id, 'outbound', 'humano', p_message, false, 'sent', v_now)
  RETURNING id INTO v_msg_id;

  UPDATE wa_conversations SET last_message_at = v_now, updated_at = v_now WHERE id = v_conv_id;

  RETURN jsonb_build_object('ok', true, 'message_id', v_msg_id, 'conversation_id', v_conv_id);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 5. wa_inbox_send
-- Secretaria envia pelo dashboard (nao atualiza last_ai_msg)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION wa_inbox_send(p_conversation_id uuid, p_content text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_conv      record;
  v_msg_id    uuid;
  v_now       timestamptz := now();
BEGIN
  SELECT * INTO v_conv FROM wa_conversations WHERE id = p_conversation_id AND clinic_id = v_clinic_id;
  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Conversa nao encontrada');
  END IF;

  INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, ai_generated, status, sent_at)
  VALUES (p_conversation_id, v_clinic_id, 'outbound', 'humano', p_content, false, 'pending', v_now)
  RETURNING id INTO v_msg_id;

  -- NAO atualiza last_ai_msg — e mensagem humana
  UPDATE wa_conversations SET last_message_at = v_now, updated_at = v_now WHERE id = p_conversation_id;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id, 'phone', v_conv.phone);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 6. wa_guard_check
-- Default: BLOCK. So permite AI quando ai_enabled = true
-- ══════════════════════════════════════════════════════════════
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
  v_ai_enabled boolean := false;
  v_msgs_today int := 0;
  v_last_msg   text;
  v_blocks     jsonb := '[]'::jsonb;
  v_flags      jsonb := '[]'::jsonb;
  v_action     text := 'block';
  v_msg_lower  text;
BEGIN
  v_msg_lower := lower(p_message);

  -- Buscar conversa (phone → LID → right8)
  v_conv_id := wa_find_conversation(p_phone, p_remote_jid);

  IF v_conv_id IS NOT NULL THEN
    SELECT * INTO v_conv FROM wa_conversations WHERE id = v_conv_id;
    v_ai_enabled := COALESCE(v_conv.ai_enabled, false);
  END IF;

  IF NOT v_ai_enabled THEN
    v_action := 'block';
    v_blocks := v_blocks || '"ai_disabled"'::jsonb;
  ELSE
    v_action := 'allow';
  END IF;

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
    'ai_enabled', v_ai_enabled, 'msgs_today', v_msgs_today, 'conversation_id', v_conv_id);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 7. wa_health_check + wa_log_error + wa_errors_list
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION wa_log_error(p_source text, p_error_type text, p_phone text DEFAULT NULL, p_payload jsonb DEFAULT NULL, p_error_msg text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO wa_errors (source, error_type, phone, payload, error_msg) VALUES (p_source, p_error_type, p_phone, p_payload, p_error_msg) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'error_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION wa_health_check()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_in int; v_out int; v_err int; v_err_open int;
  v_last_in timestamptz; v_last_out timestamptz;
  v_active int; v_pending int; v_failed int;
BEGIN
  SELECT COUNT(*) FILTER (WHERE direction='inbound'), COUNT(*) FILTER (WHERE direction='outbound')
  INTO v_in, v_out FROM wa_messages WHERE clinic_id=v_clinic_id AND sent_at > now()-interval '24 hours';
  SELECT COUNT(*) INTO v_err FROM wa_errors WHERE clinic_id=v_clinic_id AND created_at > now()-interval '24 hours';
  SELECT COUNT(*) INTO v_err_open FROM wa_errors WHERE clinic_id=v_clinic_id AND NOT resolved;
  SELECT MAX(sent_at) INTO v_last_in FROM wa_messages WHERE clinic_id=v_clinic_id AND direction='inbound';
  SELECT MAX(sent_at) INTO v_last_out FROM wa_messages WHERE clinic_id=v_clinic_id AND direction='outbound';
  SELECT COUNT(*) INTO v_active FROM wa_conversations WHERE clinic_id=v_clinic_id AND status='active';
  SELECT COUNT(*) FILTER (WHERE status='pending'), COUNT(*) FILTER (WHERE status='failed')
  INTO v_pending, v_failed FROM wa_messages WHERE clinic_id=v_clinic_id AND direction='outbound' AND sent_at > now()-interval '24 hours';
  RETURN jsonb_build_object('inbound_24h',v_in,'outbound_24h',v_out,'errors_24h',v_err,'errors_unresolved',v_err_open,
    'last_inbound',v_last_in,'last_outbound',v_last_out,'conversations_active',v_active,
    'pending_msgs',v_pending,'failed_msgs',v_failed,'checked_at',now());
END;
$$;

CREATE OR REPLACE FUNCTION wa_errors_list(p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'source',e.source,'error_type',e.error_type,'phone',e.phone,
    'error_msg',e.error_msg,'resolved',e.resolved,'created_at',e.created_at) ORDER BY e.created_at DESC)
    FROM (SELECT * FROM wa_errors WHERE clinic_id='00000000-0000-0000-0000-000000000001' ORDER BY created_at DESC LIMIT p_limit) e), '[]'::jsonb);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 8. GRANTS
-- ══════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION wa_upsert_lead_from_chat(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_find_conversation(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_log_message(text, text, text, text, int, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_log_secretary_reply(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_inbox_send(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_guard_check(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_log_error(text, text, text, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_health_check() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_errors_list(int) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════
-- 9. LIMPEZA: Merge conversas LID → conversas reais
-- Move mensagens e arquiva conversas com phone invalido
-- ══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_lid record;
  v_real_conv_id uuid;
  v_moved int := 0;
  v_archived int := 0;
BEGIN
  -- Conversas com phone invalido (LID = phone > 13 digitos ou nao comeca com 55)
  FOR v_lid IN
    SELECT id, phone FROM wa_conversations
    WHERE status = 'active'
      AND (length(phone) > 13 OR phone NOT LIKE '55%')
      AND clinic_id = '00000000-0000-0000-0000-000000000001'
  LOOP
    -- Buscar conversa real pelo right(8) do phone LID
    SELECT id INTO v_real_conv_id FROM wa_conversations
    WHERE phone LIKE '55%' AND length(phone) <= 13
      AND phone LIKE '%' || right(v_lid.phone, 8)
      AND status = 'active'
      AND clinic_id = '00000000-0000-0000-0000-000000000001'
      AND id != v_lid.id
    LIMIT 1;

    IF v_real_conv_id IS NOT NULL THEN
      -- Mover mensagens para conversa real
      UPDATE wa_messages SET conversation_id = v_real_conv_id WHERE conversation_id = v_lid.id;
      -- Salvar LID na conversa real
      UPDATE wa_conversations SET remote_jid = v_lid.phone || '@lid', updated_at = now() WHERE id = v_real_conv_id AND (remote_jid IS NULL OR remote_jid = '');
      v_moved := v_moved + 1;
    END IF;

    -- Arquivar conversa LID
    UPDATE wa_conversations SET status = 'archived', updated_at = now() WHERE id = v_lid.id;
    v_archived := v_archived + 1;
  END LOOP;

  RAISE NOTICE 'LID cleanup: % merged, % archived', v_moved, v_archived;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 10. DESATIVAR cron auto-reactivate (se existir)
-- ══════════════════════════════════════════════════════════════
DO $$
BEGIN
  PERFORM cron.unschedule('wa-auto-reactivate');
EXCEPTION WHEN OTHERS THEN
  -- cron job nao existe ou pg_cron nao instalado
  NULL;
END;
$$;
