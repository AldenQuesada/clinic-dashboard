-- ═══════════════════════════════════════════════════════════════════════════
--  ClinicAI — Auditoria RLS: Tabelas Pai
--  Migration: 20260400000000_anamnesis_rls_parent_audit.sql
--
--  Substitui políticas anon permissivas (using(true)) por políticas
--  restritas a app_clinic_id() nas tabelas pai do módulo de anamnese.
--
--  Tabelas afetadas:
--    - public.anamnesis_templates   (clinic_id direto + soft delete)
--    - public.anamnesis_requests    (clinic_id direto)
--    - public.anamnesis_responses   (clinic_id direto)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- anamnesis_templates
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove qualquer policy anon existente (permissiva ou antiga)
drop policy if exists "anamnesis_templates_anon_all"      on public.anamnesis_templates;
drop policy if exists "anamnesis_templates_allow_anon"    on public.anamnesis_templates;
drop policy if exists "anon can do everything"            on public.anamnesis_templates;
drop policy if exists "anon_all"                          on public.anamnesis_templates;
drop policy if exists "allow_anon"                        on public.anamnesis_templates;
drop policy if exists "templates_anon"                    on public.anamnesis_templates;

create policy anamnesis_templates_allow_anon
  on public.anamnesis_templates
  for all
  to anon
  using (
    clinic_id = public.app_clinic_id()
    and deleted_at is null
  )
  with check (
    clinic_id = public.app_clinic_id()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- anamnesis_requests
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "anamnesis_requests_anon_all"       on public.anamnesis_requests;
drop policy if exists "anamnesis_requests_allow_anon"     on public.anamnesis_requests;
drop policy if exists "anon can do everything"            on public.anamnesis_requests;
drop policy if exists "anon_all"                          on public.anamnesis_requests;
drop policy if exists "allow_anon"                        on public.anamnesis_requests;
drop policy if exists "requests_anon"                     on public.anamnesis_requests;

create policy anamnesis_requests_allow_anon
  on public.anamnesis_requests
  for all
  to anon
  using (
    clinic_id = public.app_clinic_id()
  )
  with check (
    clinic_id = public.app_clinic_id()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- anamnesis_responses
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "anamnesis_responses_anon_all"      on public.anamnesis_responses;
drop policy if exists "anamnesis_responses_allow_anon"    on public.anamnesis_responses;
drop policy if exists "anon can do everything"            on public.anamnesis_responses;
drop policy if exists "anon_all"                          on public.anamnesis_responses;
drop policy if exists "allow_anon"                        on public.anamnesis_responses;
drop policy if exists "responses_anon"                    on public.anamnesis_responses;

create policy anamnesis_responses_allow_anon
  on public.anamnesis_responses
  for all
  to anon
  using (
    clinic_id = public.app_clinic_id()
  )
  with check (
    clinic_id = public.app_clinic_id()
  );
