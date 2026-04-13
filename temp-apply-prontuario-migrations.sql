-- ============================================
-- PRONTUARIO AUDIT FIXES - Execute no SQL Editor do Supabase
-- ============================================


-- supabase/migrations/20260680000000_prontuario_auto_procedimento.sql
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


-- supabase/migrations/20260681000000_prontuario_search_rpc.sql
-- ============================================================
-- ClinicAI — RPC de busca full-text no prontuario
-- Busca ILIKE em content + title de TODOS os registros do paciente.
-- ============================================================

CREATE OR REPLACE FUNCTION mr_search(
  p_patient_id  uuid,
  p_query       text,
  p_limit       int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clinic  uuid := app_clinic_id();
  v_role    text := app_role();
  v_uid     uuid := auth.uid();
  v_q       text;
  v_result  jsonb;
BEGIN
  IF v_role NOT IN ('therapist','admin','owner') THEN
    RETURN jsonb_build_object('records', '[]'::jsonb, 'total', 0);
  END IF;

  v_q := '%' || lower(trim(p_query)) || '%';

  WITH matched AS (
    SELECT
      mr.id, mr.record_type, mr.title, mr.content,
      mr.is_confidential, mr.professional_id,
      mr.created_at, mr.updated_at,
      p.full_name AS professional_name,
      (mr.professional_id = v_uid) AS is_mine,
      COUNT(*) OVER() AS total_count
    FROM public.medical_records mr
    LEFT JOIN public.profiles p ON p.id = mr.professional_id
    WHERE mr.clinic_id = v_clinic
      AND mr.patient_id = p_patient_id
      AND mr.deleted_at IS NULL
      AND (lower(mr.content) LIKE v_q OR lower(mr.title) LIKE v_q)
      AND (
        mr.is_confidential = false
        OR mr.professional_id = v_uid
        OR v_role IN ('admin','owner')
      )
    ORDER BY mr.created_at DESC
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'records', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'record_type', m.record_type,
        'title', m.title,
        'content', m.content,
        'is_confidential', m.is_confidential,
        'professional_id', m.professional_id,
        'professional_name', m.professional_name,
        'is_mine', m.is_mine,
        'created_at', m.created_at,
        'updated_at', m.updated_at
      )
    ), '[]'::jsonb),
    'total', COALESCE((SELECT total_count FROM matched LIMIT 1), 0)
  ) INTO v_result
  FROM matched m;

  RETURN COALESCE(v_result, jsonb_build_object('records', '[]'::jsonb, 'total', 0));
END;
$$;

GRANT EXECUTE ON FUNCTION mr_search(uuid, text, int) TO authenticated;


-- supabase/migrations/20260682000000_medical_record_attachments.sql
-- ============================================================
-- ClinicAI — Tabela de anexos do prontuario
-- Armazena referencia a arquivos (fotos, PDFs, exames) por paciente.
-- Storage real no Supabase Storage bucket 'attachments'.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.medical_record_attachments (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid        REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id  uuid        NOT NULL,
  record_id   uuid        REFERENCES public.medical_records(id) ON DELETE SET NULL,
  file_name   text        NOT NULL,
  file_path   text        NOT NULL,
  file_url    text        NOT NULL DEFAULT '',
  file_type   text        NOT NULL DEFAULT 'application/octet-stream',
  file_size   bigint      NOT NULL DEFAULT 0,
  description text        NOT NULL DEFAULT '',
  deleted_at  timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE public.medical_record_attachments IS 'Anexos do prontuario — fotos, PDFs, exames por paciente';

CREATE INDEX IF NOT EXISTS idx_mra_patient
  ON public.medical_record_attachments (clinic_id, patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Trigger updated_at
DROP TRIGGER IF EXISTS medical_record_attachments_updated_at ON public.medical_record_attachments;
CREATE TRIGGER medical_record_attachments_updated_at
  BEFORE UPDATE ON public.medical_record_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.medical_record_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mra_select" ON public.medical_record_attachments;
CREATE POLICY "mra_select"
  ON public.medical_record_attachments FOR SELECT
  USING (
    clinic_id = app_clinic_id()
    AND deleted_at IS NULL
    AND app_role() IN ('therapist','admin','owner')
  );

DROP POLICY IF EXISTS "mra_insert" ON public.medical_record_attachments;
CREATE POLICY "mra_insert"
  ON public.medical_record_attachments FOR INSERT
  WITH CHECK (
    clinic_id = app_clinic_id()
    AND app_role() IN ('therapist','admin','owner')
  );

DROP POLICY IF EXISTS "mra_update" ON public.medical_record_attachments;
CREATE POLICY "mra_update"
  ON public.medical_record_attachments FOR UPDATE
  USING (
    clinic_id = app_clinic_id()
    AND app_role() IN ('admin','owner')
  );

