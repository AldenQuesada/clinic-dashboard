-- ============================================================
-- Migration: 20260534000000 — RLS: Compartimentação por Especialista
--
-- Problema crítico identificado:
--   1. Tabela `leads` NÃO tinha RLS habilitado — acesso aberto a
--      qualquer usuário autenticado da plataforma Supabase.
--   2. Tabelas `patients`, `anamnesis_requests`, `anamnesis_responses`
--      e `anamnesis_answers` tinham RLS apenas por clinic_id —
--      qualquer membro da clínica via TODOS os dados sensíveis.
--
-- Modelo de acesso implementado (espelho de appointments):
--
--   owner / admin        → acesso total à clínica
--   receptionist         → acesso total à clínica (operacional)
--   therapist            → acesso apenas a leads/pacientes assigned_to = uid
--                          + leads/pacientes sem dono (assigned_to IS NULL)
--   viewer               → igual a therapist, mas sem escrita
--
-- Tabelas afetadas:
--   leads                → ENABLE RLS + 4 policies
--   patients             → ADD COLUMN assigned_to + 4 policies novas
--   anamnesis_requests   → policies restritas por paciente/criador
--   anamnesis_responses  → idem (via request)
--   anamnesis_answers    → idem (via response → request)
--   anamnesis_response_flags → idem
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. LEADS — habilitar RLS (estava completamente aberto)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Limpa políticas antigas (vindas de sprints anteriores sem isolamento)
DROP POLICY IF EXISTS leads_clinic_all     ON public.leads;
DROP POLICY IF EXISTS leads_select         ON public.leads;
DROP POLICY IF EXISTS leads_insert         ON public.leads;
DROP POLICY IF EXISTS leads_update         ON public.leads;
DROP POLICY IF EXISTS leads_delete         ON public.leads;

-- SELECT: admin/receptionist veem tudo; therapist/viewer apenas seus leads
--         ou leads ainda não atribuídos
CREATE POLICY leads_select ON public.leads
  FOR SELECT TO authenticated
  USING (
    clinic_id = public._sdr_clinic_id()
    AND deleted_at IS NULL
    AND (
      public.app_role() IN ('owner', 'admin', 'receptionist')
      OR assigned_to  = auth.uid()
      OR assigned_to IS NULL
    )
  );

-- INSERT: qualquer staff (não viewer)
CREATE POLICY leads_insert ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public._sdr_clinic_id()
    AND public.app_role() IN ('owner', 'admin', 'receptionist', 'therapist')
  );

-- UPDATE: admin/receptionist todos; therapist apenas os seus
CREATE POLICY leads_update ON public.leads
  FOR UPDATE TO authenticated
  USING (
    clinic_id = public._sdr_clinic_id()
    AND (
      public.app_role() IN ('owner', 'admin', 'receptionist')
      OR (public.app_role() = 'therapist' AND assigned_to = auth.uid())
    )
  )
  WITH CHECK (clinic_id = public._sdr_clinic_id());

-- DELETE: soft delete via RPC; remoção real apenas admin/owner
CREATE POLICY leads_delete ON public.leads
  FOR DELETE TO authenticated
  USING (
    clinic_id = public._sdr_clinic_id()
    AND public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────
-- 2. PATIENTS — adicionar assigned_to + recriar policies
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS assigned_to uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_assigned_to
  ON public.patients (assigned_to)
  WHERE deleted_at IS NULL;

-- Remove políticas antigas (múltiplas sprints criaram nomes diferentes)
DROP POLICY IF EXISTS patients_select_by_clinic  ON public.patients;
DROP POLICY IF EXISTS patients_insert_by_clinic  ON public.patients;
DROP POLICY IF EXISTS patients_update_by_clinic  ON public.patients;
DROP POLICY IF EXISTS patients_auth_select       ON public.patients;
DROP POLICY IF EXISTS patients_auth_insert       ON public.patients;
DROP POLICY IF EXISTS patients_auth_update       ON public.patients;
DROP POLICY IF EXISTS patients_auth_delete       ON public.patients;
DROP POLICY IF EXISTS patients_select            ON public.patients;
DROP POLICY IF EXISTS patients_insert            ON public.patients;
DROP POLICY IF EXISTS patients_update            ON public.patients;
DROP POLICY IF EXISTS patients_delete            ON public.patients;

CREATE POLICY patients_select ON public.patients
  FOR SELECT TO authenticated
  USING (
    clinic_id  = public.app_clinic_id()
    AND deleted_at IS NULL
    AND (
      public.app_role() IN ('owner', 'admin', 'receptionist')
      OR assigned_to  = auth.uid()
      OR assigned_to IS NULL
    )
  );

CREATE POLICY patients_insert ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner', 'admin', 'receptionist', 'therapist')
  );

CREATE POLICY patients_update ON public.patients
  FOR UPDATE TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND (
      public.app_role() IN ('owner', 'admin', 'receptionist')
      OR (public.app_role() = 'therapist' AND assigned_to = auth.uid())
    )
  )
  WITH CHECK (clinic_id = public.app_clinic_id());

CREATE POLICY patients_delete ON public.patients
  FOR DELETE TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────
-- 3. ANAMNESIS_REQUESTS — restrito ao criador ou ao responsável
--    pelo paciente
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS anamnesis_requests_all_by_clinic ON public.anamnesis_requests;
DROP POLICY IF EXISTS requests_auth_select             ON public.anamnesis_requests;
DROP POLICY IF EXISTS requests_auth_insert             ON public.anamnesis_requests;
DROP POLICY IF EXISTS requests_auth_update             ON public.anamnesis_requests;
DROP POLICY IF EXISTS requests_auth_delete             ON public.anamnesis_requests;
DROP POLICY IF EXISTS anamnesis_requests_select        ON public.anamnesis_requests;
DROP POLICY IF EXISTS anamnesis_requests_insert        ON public.anamnesis_requests;
DROP POLICY IF EXISTS anamnesis_requests_update        ON public.anamnesis_requests;
DROP POLICY IF EXISTS anamnesis_requests_delete        ON public.anamnesis_requests;

-- SELECT: therapist vê apenas fichas de pacientes que ele gerencia
--         ou que ele mesmo criou
CREATE POLICY anamnesis_requests_select ON public.anamnesis_requests
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND (
      public.app_role() IN ('owner', 'admin', 'receptionist')
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.patients p
        WHERE p.id = patient_id
          AND p.clinic_id = public.app_clinic_id()
          AND (p.assigned_to = auth.uid() OR p.assigned_to IS NULL)
          AND p.deleted_at IS NULL
      )
    )
  );

CREATE POLICY anamnesis_requests_insert ON public.anamnesis_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner', 'admin', 'receptionist', 'therapist')
  );

-- UPDATE e DELETE apenas admin (status changes via RPC)
CREATE POLICY anamnesis_requests_update ON public.anamnesis_requests
  FOR UPDATE TO authenticated
  USING  (clinic_id = public.app_clinic_id() AND public.is_admin())
  WITH CHECK (clinic_id = public.app_clinic_id());

CREATE POLICY anamnesis_requests_delete ON public.anamnesis_requests
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 4. ANAMNESIS_RESPONSES — segue a cadeia request → patient
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS anamnesis_responses_all_by_clinic ON public.anamnesis_responses;
DROP POLICY IF EXISTS responses_auth_select             ON public.anamnesis_responses;
DROP POLICY IF EXISTS anamnesis_responses_select        ON public.anamnesis_responses;

CREATE POLICY anamnesis_responses_select ON public.anamnesis_responses
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND (
      public.app_role() IN ('owner', 'admin', 'receptionist')
      OR EXISTS (
        SELECT 1 FROM public.anamnesis_requests r
        WHERE r.id = request_id
          AND (
            r.created_by = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.patients p
              WHERE p.id        = r.patient_id
                AND p.clinic_id = public.app_clinic_id()
                AND (p.assigned_to = auth.uid() OR p.assigned_to IS NULL)
                AND p.deleted_at IS NULL
            )
          )
      )
    )
  );

-- Staff não escreve responses diretamente — feito via form público (anon) ou RPC

-- ─────────────────────────────────────────────────────────────
-- 5. ANAMNESIS_ANSWERS — segue a cadeia response → request → patient
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS anamnesis_answers_all_by_clinic ON public.anamnesis_answers;
DROP POLICY IF EXISTS answers_auth_select             ON public.anamnesis_answers;
DROP POLICY IF EXISTS anamnesis_answers_select        ON public.anamnesis_answers;

CREATE POLICY anamnesis_answers_select ON public.anamnesis_answers
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND (
      public.app_role() IN ('owner', 'admin', 'receptionist')
      OR EXISTS (
        SELECT 1
        FROM public.anamnesis_responses  res
        JOIN public.anamnesis_requests   req ON req.id = res.request_id
        WHERE res.id = response_id
          AND (
            req.created_by = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.patients p
              WHERE p.id        = req.patient_id
                AND p.clinic_id = public.app_clinic_id()
                AND (p.assigned_to = auth.uid() OR p.assigned_to IS NULL)
                AND p.deleted_at IS NULL
            )
          )
      )
    )
  );

-- Staff não escreve answers diretamente

-- ─────────────────────────────────────────────────────────────
-- 6. ANAMNESIS_RESPONSE_FLAGS — idem (dado clínico sensível)
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS anamnesis_response_flags_all_by_clinic ON public.anamnesis_response_flags;
DROP POLICY IF EXISTS flags_auth_select                       ON public.anamnesis_response_flags;
DROP POLICY IF EXISTS anamnesis_response_flags_select         ON public.anamnesis_response_flags;

CREATE POLICY anamnesis_response_flags_select ON public.anamnesis_response_flags
  FOR SELECT TO authenticated
  USING (
    public.app_role() IN ('owner', 'admin', 'receptionist')
    OR EXISTS (
      SELECT 1
      FROM public.anamnesis_responses  res
      JOIN public.anamnesis_requests   req ON req.id = res.request_id
      WHERE res.id = response_id
        AND res.clinic_id = public.app_clinic_id()
        AND (
          req.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id        = req.patient_id
              AND p.clinic_id = public.app_clinic_id()
              AND (p.assigned_to = auth.uid() OR p.assigned_to IS NULL)
              AND p.deleted_at IS NULL
          )
        )
    )
  );

-- Flags criadas apenas via RPC (SECURITY DEFINER) — sem INSERT/UPDATE direto

-- ─────────────────────────────────────────────────────────────
-- VERIFICAÇÃO PÓS-MIGRATION
-- ─────────────────────────────────────────────────────────────
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'leads','patients','anamnesis_requests',
--     'anamnesis_responses','anamnesis_answers','anamnesis_response_flags'
--   );
-- Todas devem mostrar rowsecurity = true
--
-- Testar isolamento (como therapist):
-- SELECT count(*) FROM leads;                   -- apenas seus leads
-- SELECT count(*) FROM patients;                -- apenas seus pacientes
-- SELECT count(*) FROM anamnesis_requests;      -- apenas fichas acessíveis
-- ============================================================
