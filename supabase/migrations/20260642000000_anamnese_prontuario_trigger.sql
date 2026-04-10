-- ============================================================
-- Migration: 20260642000000 — Anamnese security hardening + prontuario trigger
--
-- Quando anamnesis_responses.status muda para 'completed',
-- cria automaticamente um registro no medical_records.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_anamnesis_to_medical_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req record;
  v_patient record;
  v_already_exists boolean;
BEGIN
  -- So dispara quando status muda para completed
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN RETURN NEW; END IF;

  -- Verificar se ja existe registro vinculado
  SELECT EXISTS(
    SELECT 1 FROM medical_records
    WHERE patient_id = NEW.patient_id::text
      AND record_type = 'anamnese'
      AND title LIKE '%' || NEW.id::text || '%'
  ) INTO v_already_exists;

  IF v_already_exists THEN RETURN NEW; END IF;

  -- Buscar dados do request
  SELECT * INTO v_req FROM anamnesis_requests WHERE id = NEW.request_id;

  -- Buscar nome do paciente
  SELECT name INTO v_patient FROM patients WHERE id = NEW.patient_id LIMIT 1;

  -- Criar registro no prontuario
  INSERT INTO medical_records (
    patient_id, record_type, title, content,
    is_confidential, professional_id, professional_name,
    created_at
  ) VALUES (
    NEW.patient_id::text,
    'anamnese',
    'Ficha de Anamnese [' || NEW.id::text || ']',
    'Ficha de anamnese digital preenchida pelo paciente ' || COALESCE(v_patient.name, '') || '. Completada em ' || to_char(NEW.completed_at, 'DD/MM/YYYY HH24:MI') || '.',
    false,
    NULL,
    'Sistema (auto)',
    COALESCE(NEW.completed_at, now())
  );

  RETURN NEW;
END;
$$;

-- Criar trigger (drop se ja existe)
DROP TRIGGER IF EXISTS trg_anamnesis_to_medical_record ON public.anamnesis_responses;
CREATE TRIGGER trg_anamnesis_to_medical_record
  AFTER UPDATE ON public.anamnesis_responses
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.fn_anamnesis_to_medical_record();
