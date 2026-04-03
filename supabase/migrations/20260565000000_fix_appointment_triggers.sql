-- ============================================================
-- Migration: Corrigir triggers de appointment
--
-- Bug: triggers usam NEW.lead_id mas a tabela tem patient_id
-- Bug: trigger seta 'agendamento' mas fase agora chama 'agendado'
-- Bug: trigger attended seta 'paciente' mas agora deve ser 'compareceu'
--
-- Corrige os 3 triggers + o de reagendamento
-- ============================================================

-- ── Trigger 1: appointment criado → phase = 'agendado' ───────
CREATE OR REPLACE FUNCTION public.trg_appointment_created_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.patient_id IS NULL OR NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  PERFORM public._sdr_record_phase_change(
    NEW.patient_id::text,
    'agendado',
    'appointment_created',
    auth.uid()
  );

  RETURN NEW;
END;
$$;

-- ── Trigger 2: appointment attended → phase = 'compareceu' ──
CREATE OR REPLACE FUNCTION public.trg_appointment_attended_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.patient_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('finalizado', 'em_consulta') THEN RETURN NEW; END IF;

  PERFORM public._sdr_record_phase_change(
    NEW.patient_id::text,
    'compareceu',
    'appointment_attended',
    auth.uid()
  );

  RETURN NEW;
END;
$$;

-- ── Trigger 3: appointment reagendado → phase = 'reagendado' ─
CREATE OR REPLACE FUNCTION public.trg_appointment_rescheduled_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.patient_id IS NULL THEN RETURN NEW; END IF;

  -- So age se a data/hora mudou (reagendamento real)
  IF OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
     AND OLD.start_time IS NOT DISTINCT FROM NEW.start_time THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelado' THEN RETURN NEW; END IF;

  -- So reagenda se o lead esta em fase que faz sentido
  IF EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = NEW.patient_id::text
      AND phase IN ('agendado', 'reagendado')
  ) THEN
    PERFORM public._sdr_record_phase_change(
      NEW.patient_id::text,
      'reagendado',
      'appointment_rescheduled',
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Recriar triggers (os nomes ja existem, so precisam apontar para as funcoes corrigidas)
DROP TRIGGER IF EXISTS trg_lead_phase_on_appointment_created ON public.appointments;
CREATE TRIGGER trg_lead_phase_on_appointment_created
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_appointment_created_phase();

DROP TRIGGER IF EXISTS trg_lead_phase_on_appointment_attended ON public.appointments;
CREATE TRIGGER trg_lead_phase_on_appointment_attended
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_appointment_attended_phase();

DROP TRIGGER IF EXISTS trg_lead_phase_on_appointment_rescheduled ON public.appointments;
CREATE TRIGGER trg_lead_phase_on_appointment_rescheduled
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_appointment_rescheduled_phase();

-- ============================================================
-- VERIFICACAO:
-- Criar appointment de teste e verificar se lead muda de fase:
--
-- SELECT id, phase FROM leads WHERE name ILIKE '%Mirian%';
-- (deve mudar para 'agendado' apos INSERT em appointments)
-- ============================================================
