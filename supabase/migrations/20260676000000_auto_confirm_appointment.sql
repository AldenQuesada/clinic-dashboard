-- ============================================================
-- Migration: auto-confirmar agendamento quando paciente responde SIM
-- ============================================================
-- Trigger em wa_messages: quando chega mensagem inbound com palavras
-- de confirmacao, busca agendamento pendente do mesmo telefone e
-- muda status. Resposta editavel via templates.
-- ============================================================

-- Templates de resposta editaveis
INSERT INTO wa_message_templates (clinic_id, slug, category, name, content, is_active, active, type, sort_order, trigger_phase)
VALUES
('00000000-0000-0000-0000-000000000001', 'auto_reply_confirmed', 'agendamento', 'Resposta — Paciente Confirmou',
 $c$Obrigada por confirmar, *{nome}*! 💜

Te esperamos no dia *{data}* as *{hora}*.

Chegue 10 minutinhos antes, ta? Qualquer duvida, e so me chamar!

*Equipe {clinica}*$c$, true, true, 'confirmacao', 20, 'confirmado'),

('00000000-0000-0000-0000-000000000001', 'auto_reply_cancelled', 'agendamento', 'Resposta — Paciente Cancelou',
 $c$Sem problemas, *{nome}*! 😊

Se quiser remarcar, e so me avisar por aqui. Estamos a disposicao!

*Equipe {clinica}*$c$, true, true, 'confirmacao', 21, 'cancelado')
ON CONFLICT (clinic_id, slug) DO UPDATE SET
  content = EXCLUDED.content, name = EXCLUDED.name, updated_at = now();

-- Trigger que le dos templates
CREATE OR REPLACE FUNCTION public.wa_auto_confirm_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE
  v_phone text;
  v_content text;
  v_appt record;
  v_is_confirm boolean;
  v_is_cancel boolean;
  v_tpl_content text;
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
    AND a.data >= CURRENT_DATE
  ORDER BY a.data ASC, a."horaInicio" ASC LIMIT 1;

  IF v_appt.id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE((data->>'nome'), 'Clinica') INTO v_clinica
  FROM clinic_data WHERE key = 'clinicai_clinic_settings' LIMIT 1;

  IF v_is_confirm THEN
    UPDATE appointments SET status = 'confirmado', updated_at = now() WHERE id = v_appt.id;
    SELECT content INTO v_tpl_content FROM wa_message_templates
    WHERE slug = 'auto_reply_confirmed' AND is_active = true LIMIT 1;
    v_reply := COALESCE(v_tpl_content, 'Confirmado! Te esperamos. 💜');
  END IF;

  IF v_is_cancel THEN
    UPDATE appointments SET status = 'cancelado', updated_at = now() WHERE id = v_appt.id;
    SELECT content INTO v_tpl_content FROM wa_message_templates
    WHERE slug = 'auto_reply_cancelled' AND is_active = true LIMIT 1;
    v_reply := COALESCE(v_tpl_content, 'Sem problemas! Se quiser remarcar, e so avisar. 😊');
  END IF;

  v_reply := replace(v_reply, '{nome}', COALESCE(v_appt.patient_name, ''));
  v_reply := replace(v_reply, '{data}', to_char(v_appt.data, 'DD/MM'));
  v_reply := replace(v_reply, '{hora}', COALESCE(v_appt."horaInicio", ''));
  v_reply := replace(v_reply, '{clinica}', v_clinica);
  v_reply := replace(v_reply, '{profissional}', COALESCE(v_appt.professional_name, ''));

  INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, status, scheduled_at, priority, appt_ref)
  VALUES (v_appt.clinic_id, COALESCE(v_appt.patient_id::text, ''), v_phone, v_reply, 'pending', now(), 1, v_appt.id);

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_wa_auto_confirm ON wa_messages;
CREATE TRIGGER trg_wa_auto_confirm
  AFTER INSERT ON wa_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'inbound')
  EXECUTE FUNCTION wa_auto_confirm_appointment();
