-- ============================================================
-- Migration: Outbox → Inbox sync + Birthday auto-reply
-- 2026-04-05
--
-- 1. wa_outbox_on_sent agora loga em wa_conversations + wa_messages
-- 2. Tabela wa_auto_reply_templates
-- 3. Trigger auto-reply ao responder campanha de aniversario
-- ============================================================

-- ============================================================
-- 1. wa_outbox_on_sent — v3: sync com inbox
--    Ao marcar como sent, cria/atualiza conversa e loga mensagem
-- ============================================================
DROP FUNCTION IF EXISTS wa_outbox_on_sent(uuid, text);

CREATE OR REPLACE FUNCTION wa_outbox_on_sent(
  p_outbox_id     uuid,
  p_wa_message_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox       record;
  v_conv_id      uuid;
  v_broadcast_id uuid;
  v_clinic_id    uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Buscar outbox item
  SELECT * INTO v_outbox FROM wa_outbox WHERE id = p_outbox_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Outbox item nao encontrado');
  END IF;

  -- Marcar como sent
  UPDATE wa_outbox
  SET status        = 'sent',
      sent_at       = now(),
      processed_at  = now(),
      wa_message_id = COALESCE(p_wa_message_id, wa_message_id)
  WHERE id = p_outbox_id
  RETURNING broadcast_id INTO v_broadcast_id;

  -- ── Sync com inbox: criar/atualizar conversa ────────────────
  -- Buscar conversa existente pelo telefone
  SELECT id INTO v_conv_id
  FROM wa_conversations
  WHERE clinic_id = v_clinic_id
    AND phone = v_outbox.phone
    AND status = 'active'
  LIMIT 1;

  -- Criar conversa se nao existe
  IF v_conv_id IS NULL THEN
    INSERT INTO wa_conversations (
      clinic_id, lead_id, phone, status, ai_persona, ai_enabled, display_name
    ) VALUES (
      v_clinic_id,
      COALESCE(v_outbox.lead_id, 'unknown'),
      v_outbox.phone,
      'active',
      'onboarder',
      true,
      NULL
    )
    RETURNING id INTO v_conv_id;
  END IF;

  -- Logar mensagem na conversa
  INSERT INTO wa_messages (
    conversation_id, clinic_id, direction, sender,
    content, content_type, media_url,
    ai_generated, wa_message_id, sent_at
  ) VALUES (
    v_conv_id, v_clinic_id, 'outbound', 'sistema',
    v_outbox.content,
    COALESCE(v_outbox.content_type, 'text'),
    v_outbox.media_url,
    false,
    p_wa_message_id,
    now()
  );

  -- Atualizar conversa
  UPDATE wa_conversations
  SET last_message_at = now(),
      last_ai_msg = now(),
      updated_at = now()
  WHERE id = v_conv_id;

  -- ── Broadcast counters (logica existente) ───────────────────
  IF v_broadcast_id IS NOT NULL THEN
    UPDATE wa_broadcasts
    SET sent_count = (
      SELECT count(*) FROM wa_outbox
      WHERE broadcast_id = v_broadcast_id AND status = 'sent'
    )
    WHERE id = v_broadcast_id;

    IF NOT EXISTS (
      SELECT 1 FROM wa_outbox
      WHERE broadcast_id = v_broadcast_id
        AND status IN ('pending', 'processing')
    ) THEN
      UPDATE wa_broadcasts
      SET status = 'completed',
          completed_at = now(),
          failed_count = (
            SELECT count(*) FROM wa_outbox
            WHERE broadcast_id = v_broadcast_id AND status = 'failed'
          )
      WHERE id = v_broadcast_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_outbox_id, 'conversation_id', v_conv_id);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_outbox_on_sent(uuid, text) TO anon, authenticated;

-- ============================================================
-- 2. Tabela wa_auto_reply_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_auto_reply_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  trigger_type text NOT NULL,
  content     text NOT NULL,
  media_url   text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(clinic_id, trigger_type)
);

ALTER TABLE wa_auto_reply_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auto_reply_templates_all ON wa_auto_reply_templates;
CREATE POLICY auto_reply_templates_all ON wa_auto_reply_templates FOR ALL USING (true);

-- Template de auto-reply para birthday
INSERT INTO wa_auto_reply_templates (trigger_type, content) VALUES
('birthday_responded',
'Que bom que te interessou! 🎉

Preparei uma página especial só pra você escolher seu combo de aniversário. É só tocar no link abaixo e selecionar o que mais combina com você:

👇 *Escolha seu presente:*
https://clinicai-dashboard.px1hdq.easypanel.host/aniversario.html

Qualquer dúvida, me chama aqui! 💬')
ON CONFLICT (clinic_id, trigger_type) DO UPDATE
SET content = EXCLUDED.content, updated_at = now();

-- ============================================================
-- 3. Trigger: birthday responded → auto-reply com link
-- ============================================================
CREATE OR REPLACE FUNCTION wa_birthday_on_responded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template record;
BEGIN
  IF NEW.status = 'responded' AND (OLD.status IS DISTINCT FROM 'responded') THEN

    SELECT content, media_url INTO v_template
    FROM wa_auto_reply_templates
    WHERE trigger_type = 'birthday_responded'
      AND clinic_id = NEW.clinic_id
      AND is_active = true
    LIMIT 1;

    IF v_template IS NULL THEN
      RETURN NEW;
    END IF;

    IF NEW.lead_phone IS NOT NULL AND NEW.lead_phone != '' THEN
      INSERT INTO wa_outbox (
        clinic_id, lead_id, phone, content, content_type,
        media_url, priority, status, scheduled_at
      ) VALUES (
        NEW.clinic_id,
        NEW.lead_id,
        NEW.lead_phone,
        v_template.content,
        CASE WHEN v_template.media_url IS NOT NULL THEN 'image' ELSE 'text' END,
        v_template.media_url,
        3,
        'pending',
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_birthday_on_responded ON wa_birthday_campaigns;
CREATE TRIGGER trg_birthday_on_responded
  AFTER UPDATE ON wa_birthday_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION wa_birthday_on_responded();
