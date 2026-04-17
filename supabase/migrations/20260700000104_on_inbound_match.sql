-- ============================================================
-- Migration: Trigger on_inbound_match para auto-resposta SIM/NAO
-- ============================================================
-- Adiciona um novo trigger_type 'on_inbound_match' em wa_agenda_automations
-- para que auto-respostas SIM/NAO ao lembrete D-1 sejam editaveis no Funil
-- (antes eram hardcoded em wa_message_templates slugs auto_reply_*).
--
-- Seed de 2 regras default:
--   - "Resposta Automatica SIM (D-1 confirmacao)" match=confirm
--   - "Resposta Automatica NAO (D-1 cancelamento)" match=cancel
--
-- Trigger wa_auto_confirm_appointment atualizado pra ler reply da regra
-- ativa em wa_agenda_automations; cai no hardcoded se nao encontrar.
-- ============================================================

-- ── Seed das 2 regras defaults ──────────────────────────────
-- clinic_id: usa o da Mirian ('00000000-...-0001' padrao do ClinicAI).
-- Limpa qualquer regra on_inbound_match pre-existente pro seed ser
-- idempotente sem precisar de constraint unica em (clinic_id, name).
DELETE FROM wa_agenda_automations
WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
  AND trigger_type = 'on_inbound_match';

INSERT INTO wa_agenda_automations (
  id, clinic_id, name, description,
  trigger_type, trigger_config,
  channel, content_template,
  category, is_active, sort_order,
  created_at, updated_at
)
VALUES
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'Resposta Automatica SIM (D-1 confirmacao)',
  'Enviada quando paciente responde SIM/CONFIRMO ao lembrete D-1.',
  'on_inbound_match',
  jsonb_build_object('match', 'confirm'),
  'whatsapp',
  E'Obrigada por confirmar, *{{nome}}*! \xF0\x9F\x92\x9C\n\nTe esperamos no dia *{{data}}* as *{{hora}}*.\n\nChegue 10 minutinhos antes, ta? Qualquer duvida, e so me chamar!\n\n*Equipe {{clinica}}*',
  'during',
  true,
  900,
  now(), now()
),
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'Resposta Automatica NAO (D-1 cancelamento)',
  'Enviada quando paciente responde NAO/CANCELAR ao lembrete D-1.',
  'on_inbound_match',
  jsonb_build_object('match', 'cancel'),
  'whatsapp',
  E'Sem problemas, *{{nome}}*! \xF0\x9F\x98\x8A\n\nSe quiser remarcar, e so me avisar por aqui. Estamos a disposicao!\n\n*Equipe {{clinica}}*',
  'during',
  true,
  901,
  now(), now()
);

-- ── Atualiza trigger pra ler reply da regra ─────────────────
CREATE OR REPLACE FUNCTION public.wa_auto_confirm_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE
  v_phone text;
  v_content text;
  v_appt record;
  v_is_confirm boolean;
  v_is_cancel boolean;
  v_match_kind text;
  v_rule_content text;
  v_reply text;
  v_clinica text;
BEGIN
  IF NEW.direction != 'inbound' THEN RETURN NEW; END IF;

  v_phone := NEW.phone;
  v_content := lower(trim(COALESCE(NEW.content, '')));
  IF length(v_content) > 50 THEN RETURN NEW; END IF;

  v_is_confirm := v_content IN (
    'sim', 'si', 'yes', 'ok', 'confirmo', 'confirmado', 'confirmada',
    'vou sim', 'estarei la', 'pode confirmar', 'tudo certo',
    'com certeza', 'claro', 'positivo', 's', '1'
  ) OR v_content LIKE 'sim%' OR v_content LIKE 'confirm%';

  v_is_cancel := v_content IN (
    'nao', 'não', 'no', 'cancela', 'cancelar', 'cancelado',
    'nao vou', 'nao posso', 'desmarcar', 'remarcar', 'n', '2'
  ) OR v_content LIKE 'nao%' OR v_content LIKE 'não%' OR v_content LIKE 'cancel%';

  IF NOT v_is_confirm AND NOT v_is_cancel THEN RETURN NEW; END IF;

  SELECT a.* INTO v_appt FROM appointments a
  WHERE a.patient_phone IS NOT NULL
    AND right(a.patient_phone, 8) = right(v_phone, 8)
    AND a.status IN ('agendado', 'aguardando_confirmacao')
    AND a.scheduled_date >= CURRENT_DATE
  ORDER BY a.scheduled_date ASC, a.start_time ASC LIMIT 1;

  IF v_appt.id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE((data->>'nome'), 'Clinica') INTO v_clinica
  FROM clinic_data WHERE key = 'clinicai_clinic_settings' LIMIT 1;

  IF v_is_confirm THEN
    UPDATE appointments SET
      status         = 'confirmado',
      d1_response    = 'confirmed',
      d1_response_at = now(),
      updated_at     = now()
    WHERE id = v_appt.id;
    v_match_kind := 'confirm';
  ELSE
    UPDATE appointments SET
      status         = 'cancelado',
      d1_response    = 'declined',
      d1_response_at = now(),
      updated_at     = now()
    WHERE id = v_appt.id;
    v_match_kind := 'cancel';
  END IF;

  -- Le reply da regra on_inbound_match (editavel no Funil)
  SELECT content_template INTO v_rule_content
  FROM wa_agenda_automations
  WHERE clinic_id = v_appt.clinic_id
    AND trigger_type = 'on_inbound_match'
    AND trigger_config->>'match' = v_match_kind
    AND is_active = true
  ORDER BY sort_order ASC
  LIMIT 1;

  v_reply := v_rule_content;

  -- Fallback pro template legado se nao houver regra ativa
  IF v_reply IS NULL OR v_reply = '' THEN
    IF v_match_kind = 'confirm' THEN
      SELECT content INTO v_reply FROM wa_message_templates
      WHERE slug = 'auto_reply_confirmed' AND is_active = true LIMIT 1;
      v_reply := COALESCE(v_reply, 'Confirmado! Te esperamos.');
    ELSE
      SELECT content INTO v_reply FROM wa_message_templates
      WHERE slug = 'auto_reply_cancelled' AND is_active = true LIMIT 1;
      v_reply := COALESCE(v_reply, 'Sem problemas! Se quiser remarcar, e so avisar.');
    END IF;
  END IF;

  -- Substitui variaveis (aceita {var} e {{var}})
  v_reply := replace(v_reply, '{{nome}}',         COALESCE(v_appt.patient_name, ''));
  v_reply := replace(v_reply, '{nome}',           COALESCE(v_appt.patient_name, ''));
  v_reply := replace(v_reply, '{{data}}',         to_char(v_appt.scheduled_date, 'DD/MM'));
  v_reply := replace(v_reply, '{data}',           to_char(v_appt.scheduled_date, 'DD/MM'));
  v_reply := replace(v_reply, '{{hora}}',         COALESCE(v_appt.start_time::text, ''));
  v_reply := replace(v_reply, '{hora}',           COALESCE(v_appt.start_time::text, ''));
  v_reply := replace(v_reply, '{{clinica}}',      v_clinica);
  v_reply := replace(v_reply, '{clinica}',        v_clinica);
  v_reply := replace(v_reply, '{{profissional}}', COALESCE(v_appt.professional_name, ''));
  v_reply := replace(v_reply, '{profissional}',   COALESCE(v_appt.professional_name, ''));

  INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, status, scheduled_at, priority, appt_ref)
  VALUES (v_appt.clinic_id, COALESCE(v_appt.patient_id::text, ''), v_phone, v_reply, 'pending', now(), 1, v_appt.id);

  RETURN NEW;
END;
$fn$;
