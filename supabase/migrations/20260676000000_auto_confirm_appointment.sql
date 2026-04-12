-- ============================================================
-- Migration: auto-confirmar agendamento quando paciente responde SIM
-- ============================================================
-- Trigger em wa_messages: quando chega mensagem inbound com palavras
-- de confirmacao, busca agendamento pendente do mesmo telefone e
-- muda status para 'confirmado'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.wa_auto_confirm_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE
  v_phone text;
  v_content text;
  v_appt record;
  v_is_confirm boolean;
  v_is_cancel boolean;
BEGIN
  -- Apenas mensagens inbound (do paciente)
  IF NEW.direction != 'inbound' THEN RETURN NEW; END IF;

  v_phone := NEW.phone;
  v_content := lower(trim(COALESCE(NEW.content, '')));

  -- Ignorar mensagens muito longas (nao sao respostas simples)
  IF length(v_content) > 50 THEN RETURN NEW; END IF;

  -- Detectar confirmacao
  v_is_confirm := v_content IN (
    'sim', 'si', 'yes', 'ok', 'confirmo', 'confirmado', 'confirmada',
    'vou sim', 'estarei la', 'pode confirmar', 'tudo certo',
    'com certeza', 'claro', 'positivo', 's', '1'
  ) OR v_content LIKE 'sim%' OR v_content LIKE 'confirm%';

  -- Detectar cancelamento
  v_is_cancel := v_content IN (
    'nao', 'não', 'no', 'cancela', 'cancelar', 'cancelado',
    'nao vou', 'nao posso', 'desmarcar', 'remarcar',
    'n', '2'
  ) OR v_content LIKE 'nao%' OR v_content LIKE 'não%' OR v_content LIKE 'cancel%';

  IF NOT v_is_confirm AND NOT v_is_cancel THEN RETURN NEW; END IF;

  -- Buscar agendamento pendente (agendado ou aguardando_confirmacao) do mesmo telefone
  SELECT a.* INTO v_appt
  FROM appointments a
  WHERE a.patient_phone IS NOT NULL
    AND right(a.patient_phone, 8) = right(v_phone, 8)
    AND a.status IN ('agendado', 'aguardando_confirmacao')
    AND a.data >= CURRENT_DATE
  ORDER BY a.data ASC, a."horaInicio" ASC
  LIMIT 1;

  IF v_appt.id IS NULL THEN RETURN NEW; END IF;

  IF v_is_confirm THEN
    UPDATE appointments
    SET status = 'confirmado', updated_at = now()
    WHERE id = v_appt.id;

    -- Log
    INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, status, scheduled_at, priority, appt_ref)
    VALUES (
      v_appt.clinic_id, COALESCE(v_appt.patient_id::text, ''), v_phone,
      'Obrigada por confirmar! Te esperamos no dia ' || to_char(v_appt.data, 'DD/MM') || ' as ' || v_appt."horaInicio" || '. 💜',
      'pending', now(), 1, v_appt.id
    );
  END IF;

  IF v_is_cancel THEN
    UPDATE appointments
    SET status = 'cancelado', updated_at = now()
    WHERE id = v_appt.id;

    INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, status, scheduled_at, priority, appt_ref)
    VALUES (
      v_appt.clinic_id, COALESCE(v_appt.patient_id::text, ''), v_phone,
      'Sem problemas! Se quiser remarcar, e so me avisar. Estamos a disposicao. 😊',
      'pending', now(), 1, v_appt.id
    );
  END IF;

  RETURN NEW;
END;
$fn$;

-- Trigger: dispara APOS inserir mensagem inbound
DROP TRIGGER IF EXISTS trg_wa_auto_confirm ON wa_messages;
CREATE TRIGGER trg_wa_auto_confirm
  AFTER INSERT ON wa_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'inbound')
  EXECUTE FUNCTION wa_auto_confirm_appointment();
