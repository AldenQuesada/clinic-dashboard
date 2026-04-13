-- ============================================================
-- ClinicAI — Auto-criar registro de prontuario ao finalizar agendamento
--
-- Quando appointment.status muda para 'finalizado', cria um
-- medical_record tipo 'procedimento' automaticamente.
-- Idempotente: verifica se ja existe registro com mesmo appointment_id.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_appointment_to_medical_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clinic_id   uuid;
  v_patient_id  uuid;
  v_prof_id     uuid;
  v_proc_name   text;
  v_valor       numeric;
  v_exists      boolean;
BEGIN
  -- So dispara quando status muda PARA 'finalizado'
  IF NEW.status <> 'finalizado' THEN RETURN NEW; END IF;
  IF OLD.status = 'finalizado' THEN RETURN NEW; END IF;

  v_clinic_id  := NEW.clinic_id;
  v_patient_id := COALESCE(NEW.patient_id, NEW."pacienteId");
  v_prof_id    := NEW.professional_id;
  v_proc_name  := COALESCE(NEW.procedimento, NEW.procedure_name, 'Consulta');
  v_valor      := NEW.valor;

  -- Nao criar se nao tem paciente
  IF v_patient_id IS NULL THEN RETURN NEW; END IF;

  -- Idempotencia: ja existe registro para este appointment?
  SELECT EXISTS(
    SELECT 1 FROM public.medical_records
    WHERE appointment_id = NEW.id::uuid
      AND clinic_id = v_clinic_id
      AND deleted_at IS NULL
  ) INTO v_exists;

  IF v_exists THEN RETURN NEW; END IF;

  -- Cria registro automatico
  INSERT INTO public.medical_records (
    clinic_id, patient_id, professional_id, appointment_id,
    record_type, title, content, is_confidential
  ) VALUES (
    v_clinic_id,
    v_patient_id,
    v_prof_id,
    NEW.id::uuid,
    'procedimento',
    v_proc_name,
    'Procedimento: ' || v_proc_name
      || E'\nData: ' || COALESCE(NEW.scheduled_date::text, NEW.data::text, now()::date::text)
      || CASE WHEN v_valor IS NOT NULL THEN E'\nValor: R$ ' || to_char(v_valor, 'FM999G999D00') ELSE '' END
      || E'\n\n[Registro criado automaticamente ao finalizar agendamento]',
    false
  );

  RETURN NEW;
END;
$$;

-- Trigger: dispara ao atualizar status do agendamento
DROP TRIGGER IF EXISTS trg_appointment_to_medical_record ON public.appointments;
CREATE TRIGGER trg_appointment_to_medical_record
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_appointment_to_medical_record();
