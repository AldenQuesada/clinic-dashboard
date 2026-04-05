-- ============================================================
-- Birthday Templates v2 — 2026-04-05
--
-- 1. Atualiza os 3 templates com copy focada em transformacao
-- 2. Muda horario de envio de 10h para 13h
-- 3. Melhora fallback do [queixas]
-- 4. Cria auto-reply: quando campanha muda pra responded,
--    envia msg com link da pagina de aniversario
-- ============================================================

-- ============================================================
-- 1. Atualizar templates existentes (horario + conteudo)
-- ============================================================

-- Template 1: Oportunidade (D-30)
UPDATE wa_birthday_templates
SET send_hour = 13,
    content = '[nome], e se você pudesse voltar no tempo só um pouquinho? 🤫

Seu aniversário tá chegando e a Dra. Mirian me autorizou a fazer algo especial pra você...

Imagina se olhar no espelho e se *reconhecer* de novo — mais jovem, mais radiante, com aquele brilho que o tempo foi apagando?

Pra isso acontecer, ela liberou *3 opções imperdíveis*:

🎁 Desconto especial de aniversário
💳 Parcelamento até perder de vista
✨ Faça 1 e ganhe 2

Me conta aqui qual te deixou mais curiosa que eu já te envio o link pra você mesma escolher seu combo de aniversário e chegar ao novo ciclo mais linda e radiante! 💬'
WHERE label = 'Oportunidade'
  AND day_offset = 30;

-- Template 2: Lembrete (D-29)
UPDATE wa_birthday_templates
SET send_hour = 13,
    content = '[nome], adivinha o que vai expirar amanhã? ⏳

Aquela surpresa de aniversário que te falei ontem ainda tá de pé... mas *só até amanhã*.

Imagina começar esse novo ciclo se sentindo mais bonita, mais confiante, se reconhecendo de verdade no espelho...

Deixa eu refrescar sua memória:

🎁 Desconto especial
💳 Parcelamento até perder de vista
✨ Faça 1 e ganhe 2

Qual dessas combina mais com a nova você? Me responde aqui! 💬'
WHERE label = 'Lembrete'
  AND day_offset = 29;

-- Template 3: Última chance (D-28)
UPDATE wa_birthday_templates
SET send_hour = 13,
    content = '[nome], última pergunta: você vai ou vai deixar escapar? 👀

Hoje é o *último dia* da sua oferta especial de aniversário. Amanhã volta pro valor normal.

Pensa comigo: quando foi a última vez que você se deu um presente de verdade? Um presente que te faz se olhar no espelho e sorrir? 🎂

Me responde aqui que eu resolvo tudo em 2 minutinhos! 💜'
WHERE label = 'Ultima chance'
  AND day_offset = 28;

-- Atualizar tambem os defaults da tabela e da RPC
ALTER TABLE wa_birthday_templates ALTER COLUMN send_hour SET DEFAULT 13;

-- ============================================================
-- 2. Atualizar resolveVariables no banco (content da mensagem)
--    Template 1 tem versao COM e SEM queixas
-- ============================================================

-- Template 1 alternativo: COM queixas (usado pelo enqueue)
-- A logica de substituicao fica no JS, mas precisamos de um
-- marcador para o fallback. Usamos [queixas_ou_vazio] como
-- placeholder alternativo resolvido no JS.

-- ============================================================
-- 3. Auto-reply: mensagem com link ao responder
-- ============================================================

-- Tabela de auto-reply templates por tipo de campanha
CREATE TABLE IF NOT EXISTS wa_auto_reply_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  trigger_type text NOT NULL,          -- 'birthday_responded'
  content     text NOT NULL,
  media_url   text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(clinic_id, trigger_type)
);

ALTER TABLE wa_auto_reply_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auto_reply_templates_all" ON wa_auto_reply_templates FOR ALL USING (true);

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
-- 4. Trigger: ao marcar campanha como responded, envia auto-reply
-- ============================================================
CREATE OR REPLACE FUNCTION wa_birthday_on_responded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template record;
  v_phone    text;
BEGIN
  -- So dispara quando status muda para 'responded'
  IF NEW.status = 'responded' AND (OLD.status IS DISTINCT FROM 'responded') THEN

    -- Buscar template de auto-reply ativo
    SELECT content, media_url INTO v_template
    FROM wa_auto_reply_templates
    WHERE trigger_type = 'birthday_responded'
      AND clinic_id = NEW.clinic_id
      AND is_active = true
    LIMIT 1;

    IF v_template IS NULL THEN
      RETURN NEW;
    END IF;

    -- Buscar phone do lead
    v_phone := NEW.lead_phone;

    IF v_phone IS NOT NULL AND v_phone != '' THEN
      -- Inserir no outbox para envio imediato
      INSERT INTO wa_outbox (
        clinic_id, lead_id, phone, content, content_type,
        media_url, priority, status, scheduled_at
      ) VALUES (
        NEW.clinic_id,
        NEW.lead_id,
        v_phone,
        v_template.content,
        CASE WHEN v_template.media_url IS NOT NULL THEN 'image' ELSE 'text' END,
        v_template.media_url,
        3,  -- prioridade alta (resposta rapida)
        'pending',
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger na tabela de campanhas
DROP TRIGGER IF EXISTS trg_birthday_on_responded ON wa_birthday_campaigns;
CREATE TRIGGER trg_birthday_on_responded
  AFTER UPDATE ON wa_birthday_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION wa_birthday_on_responded();

-- ============================================================
-- 5. Atualizar send_hour default na RPC wa_birthday_template_save
-- ============================================================
DROP FUNCTION IF EXISTS wa_birthday_template_save(uuid, int, int, text, text, text, text, boolean, int);
CREATE OR REPLACE FUNCTION wa_birthday_template_save(
  p_id             uuid DEFAULT NULL,
  p_day_offset     int DEFAULT 30,
  p_send_hour      int DEFAULT 13,
  p_label          text DEFAULT 'Nova mensagem',
  p_content        text DEFAULT '',
  p_media_url      text DEFAULT NULL,
  p_media_position text DEFAULT 'above',
  p_is_active      boolean DEFAULT true,
  p_sort_order     int DEFAULT 99
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_id uuid;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE wa_birthday_templates
    SET day_offset = p_day_offset,
        send_hour = p_send_hour,
        label = p_label,
        content = p_content,
        media_url = p_media_url,
        media_position = p_media_position,
        is_active = p_is_active,
        sort_order = p_sort_order,
        updated_at = now()
    WHERE id = p_id AND clinic_id = v_clinic_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO wa_birthday_templates (
      clinic_id, day_offset, send_hour, label, content,
      media_url, media_position, is_active, sort_order
    ) VALUES (
      v_clinic_id, p_day_offset, p_send_hour, p_label, p_content,
      p_media_url, p_media_position, p_is_active, p_sort_order
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_template_save(uuid, int, int, text, text, text, text, boolean, int) TO anon, authenticated;
