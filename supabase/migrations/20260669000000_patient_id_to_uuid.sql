-- ============================================================
-- Migration: patient_id text → uuid (Opcao C — escopo cirurgico)
-- ============================================================
-- Converte patients.id e 6 colunas patient_id de text para uuid.
-- Reescreve trigger _convert_lead_to_patient (md5 → gen_random_uuid).
-- NAO toca em leads.id nem em lead_id (Fase 3 futura).
-- ============================================================

-- ============================================================
-- Passo 0: Reescrever trigger _convert_lead_to_patient
-- ============================================================
CREATE OR REPLACE FUNCTION public._convert_lead_to_patient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE
  v_patient_id uuid;
BEGIN
  IF NEW.status NOT IN ('paciente','attending','patient') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  BEGIN
    v_patient_id := gen_random_uuid();

    INSERT INTO public.patients (
      id, "leadId", "tenantId", name, phone, email,
      status, "totalProcedures", "totalRevenue", "createdAt", "updatedAt"
    ) VALUES (
      v_patient_id, NEW.id, NEW.clinic_id::text,
      COALESCE(NEW.name,''), COALESCE(NEW.phone,''), NEW.email,
      'active', 0, 0, now(), now()
    )
    ON CONFLICT ("leadId") DO UPDATE SET
      name       = COALESCE(NULLIF(EXCLUDED.name,''),  patients.name),
      phone      = COALESCE(NULLIF(EXCLUDED.phone,''), patients.phone),
      email      = COALESCE(EXCLUDED.email, patients.email),
      status     = 'active',
      "updatedAt" = now(),
      deleted_at  = NULL;
  EXCEPTION WHEN others THEN
    RAISE WARNING '[_convert_lead_to_patient] Erro: %. Lead id=%', SQLERRM, NEW.id;
  END;

  RETURN NEW;
END;
$fn$;

-- ============================================================
-- Passo 1: Drop FKs existentes
-- ============================================================
ALTER TABLE anamnesis_requests  DROP CONSTRAINT IF EXISTS anamnesis_requests_patient_id_fkey;
ALTER TABLE anamnesis_responses DROP CONSTRAINT IF EXISTS anamnesis_responses_patient_id_fkey;
ALTER TABLE cashflow_entries    DROP CONSTRAINT IF EXISTS cashflow_entries_patient_id_fkey;

-- ============================================================
-- Passo 1b: Drop TODAS as RLS policies que referenciam patients.id
-- (PostgreSQL bloqueia ALTER TYPE em coluna usada por policy)
-- ============================================================
DROP POLICY IF EXISTS anamnesis_requests_select ON anamnesis_requests;
DROP POLICY IF EXISTS anamnesis_responses_select ON anamnesis_responses;
DROP POLICY IF EXISTS anamnesis_answers_select ON anamnesis_answers;
DROP POLICY IF EXISTS anamnesis_response_flags_select ON anamnesis_response_flags;

-- ============================================================
-- Passo 2: ALTER colunas text → uuid
-- ============================================================
ALTER TABLE patients            ALTER COLUMN id         TYPE uuid USING id::uuid;
ALTER TABLE anamnesis_requests  ALTER COLUMN patient_id TYPE uuid USING patient_id::uuid;
ALTER TABLE anamnesis_responses ALTER COLUMN patient_id TYPE uuid USING patient_id::uuid;
ALTER TABLE cashflow_entries    ALTER COLUMN patient_id TYPE uuid USING patient_id::uuid;
ALTER TABLE budgets             ALTER COLUMN patient_id TYPE uuid USING patient_id::uuid;
ALTER TABLE legal_doc_requests  ALTER COLUMN patient_id TYPE uuid USING patient_id::uuid;
ALTER TABLE patient_complaints  ALTER COLUMN patient_id TYPE uuid USING patient_id::uuid;

-- ============================================================
-- Passo 3: Recriar FKs
-- ============================================================
ALTER TABLE anamnesis_requests ADD CONSTRAINT anamnesis_requests_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE anamnesis_responses ADD CONSTRAINT anamnesis_responses_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE cashflow_entries ADD CONSTRAINT cashflow_entries_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

-- ============================================================
-- Passo 3b: Recriar RLS policies (identicas, agora uuid = uuid)
-- ============================================================

-- anamnesis_requests
CREATE POLICY anamnesis_requests_select ON anamnesis_requests
  FOR SELECT USING (
    (clinic_id = app_clinic_id())
    AND (
      (app_role() = ANY (ARRAY['owner','admin','receptionist']))
      OR (created_by = auth.uid())
      OR (EXISTS (
        SELECT 1 FROM patients p
        WHERE p.id = anamnesis_requests.patient_id
          AND p.clinic_id = app_clinic_id()
          AND (p.assigned_to = auth.uid() OR p.assigned_to IS NULL)
          AND p.deleted_at IS NULL
      ))
    )
  );

-- anamnesis_responses
CREATE POLICY anamnesis_responses_select ON anamnesis_responses
  FOR SELECT USING (
    (clinic_id = app_clinic_id())
    AND (
      (app_role() = ANY (ARRAY['owner','admin','receptionist']))
      OR (EXISTS (
        SELECT 1 FROM anamnesis_requests r
        WHERE r.id = anamnesis_responses.request_id
          AND (
            r.created_by = auth.uid()
            OR EXISTS (
              SELECT 1 FROM patients p
              WHERE p.id = r.patient_id
                AND p.clinic_id = app_clinic_id()
                AND (p.assigned_to = auth.uid() OR p.assigned_to IS NULL)
                AND p.deleted_at IS NULL
            )
          )
      ))
    )
  );

-- anamnesis_answers
CREATE POLICY anamnesis_answers_select ON anamnesis_answers
  FOR SELECT USING (
    (clinic_id = app_clinic_id())
    AND (
      (app_role() = ANY (ARRAY['owner','admin','receptionist']))
      OR (EXISTS (
        SELECT 1
        FROM anamnesis_responses res
        JOIN anamnesis_requests req ON req.id = res.request_id
        WHERE res.id = anamnesis_answers.response_id
          AND (
            req.created_by = auth.uid()
            OR EXISTS (
              SELECT 1 FROM patients p
              WHERE p.id = req.patient_id
                AND p.clinic_id = app_clinic_id()
                AND (p.assigned_to = auth.uid() OR p.assigned_to IS NULL)
                AND p.deleted_at IS NULL
            )
          )
      ))
    )
  );

-- anamnesis_response_flags
CREATE POLICY anamnesis_response_flags_select ON anamnesis_response_flags
  FOR SELECT USING (
    (app_role() = ANY (ARRAY['owner','admin','receptionist']))
    OR (EXISTS (
      SELECT 1
      FROM anamnesis_responses res
      JOIN anamnesis_requests req ON req.id = res.request_id
      WHERE res.id = anamnesis_response_flags.response_id
        AND res.clinic_id = app_clinic_id()
        AND (
          req.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM patients p
            WHERE p.id = req.patient_id
              AND p.clinic_id = app_clinic_id()
              AND (p.assigned_to = auth.uid() OR p.assigned_to IS NULL)
              AND p.deleted_at IS NULL
          )
        )
    ))
  );

-- ============================================================
-- Passo 4: Reload PostgREST cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
