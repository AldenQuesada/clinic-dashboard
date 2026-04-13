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
