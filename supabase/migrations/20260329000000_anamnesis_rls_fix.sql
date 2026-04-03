-- ═══════════════════════════════════════════════════════════════════════════
--  ClinicAI — Anamnese: Correção de RLS e Permissões
--  Migration: 20260329000000_anamnesis_rls_fix.sql
--
--  Problemas corrigidos:
--  1. RLS bloqueava tudo (policies eram `to authenticated`, app usa `anon` key)
--  2. `auth.jwt() ->> 'clinic_id'` sempre NULL (sem custom JWT claim)
--  3. Funções RPC sem GRANT para role `anon`
--  4. patients.cpf NOT NULL impedia upsert de leads sem CPF
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. PATIENTS: tornar cpf nullable ─────────────────────────────────────
-- Leads do sistema podem não ter CPF; a constraint NOT NULL bloqueava upserts.

alter table public.patients
  alter column cpf drop not null,
  alter column cpf set default null;

-- Recria o índice único para ignorar cpf nulo (NULL != NULL no B-Tree)
drop index if exists patients_clinic_cpf_unique_idx;
create unique index if not exists patients_clinic_cpf_unique_idx
  on public.patients (clinic_id, cpf)
  where deleted_at is null and cpf is not null;

-- Remove a check constraint que exigia cpf não vazio
-- (agora só vale quando cpf for fornecido)
alter table public.patients
  drop constraint if exists patients_cpf_not_empty_chk;

-- ── 2. RLS: adicionar policies `to anon` em todas as tabelas ─────────────
-- O app envia a anon key diretamente (sem Supabase Auth), portanto
-- o role JWT é sempre "anon". As policies anteriores eram `to authenticated`
-- e nunca eram atingidas.

-- patients
drop policy if exists patients_allow_anon on public.patients;
create policy patients_allow_anon on public.patients
  for all to anon using (true) with check (true);

-- anamnesis_templates
drop policy if exists anamnesis_templates_allow_anon on public.anamnesis_templates;
create policy anamnesis_templates_allow_anon on public.anamnesis_templates
  for all to anon using (true) with check (true);

-- anamnesis_template_sessions
drop policy if exists anamnesis_template_sessions_allow_anon on public.anamnesis_template_sessions;
create policy anamnesis_template_sessions_allow_anon on public.anamnesis_template_sessions
  for all to anon using (true) with check (true);

-- anamnesis_fields
drop policy if exists anamnesis_fields_allow_anon on public.anamnesis_fields;
create policy anamnesis_fields_allow_anon on public.anamnesis_fields
  for all to anon using (true) with check (true);

-- anamnesis_field_options
drop policy if exists anamnesis_field_options_allow_anon on public.anamnesis_field_options;
create policy anamnesis_field_options_allow_anon on public.anamnesis_field_options
  for all to anon using (true) with check (true);

-- anamnesis_requests
drop policy if exists anamnesis_requests_allow_anon on public.anamnesis_requests;
create policy anamnesis_requests_allow_anon on public.anamnesis_requests
  for all to anon using (true) with check (true);

-- anamnesis_request_access_logs
drop policy if exists anamnesis_request_access_logs_allow_anon on public.anamnesis_request_access_logs;
create policy anamnesis_request_access_logs_allow_anon on public.anamnesis_request_access_logs
  for all to anon using (true) with check (true);

-- anamnesis_responses
drop policy if exists anamnesis_responses_allow_anon on public.anamnesis_responses;
create policy anamnesis_responses_allow_anon on public.anamnesis_responses
  for all to anon using (true) with check (true);

-- anamnesis_answers
drop policy if exists anamnesis_answers_allow_anon on public.anamnesis_answers;
create policy anamnesis_answers_allow_anon on public.anamnesis_answers
  for all to anon using (true) with check (true);

-- anamnesis_response_flags
drop policy if exists anamnesis_response_flags_allow_anon on public.anamnesis_response_flags;
create policy anamnesis_response_flags_allow_anon on public.anamnesis_response_flags
  for all to anon using (true) with check (true);

-- anamnesis_response_protocol_suggestions
drop policy if exists anamnesis_response_protocol_suggestions_allow_anon on public.anamnesis_response_protocol_suggestions;
create policy anamnesis_response_protocol_suggestions_allow_anon on public.anamnesis_response_protocol_suggestions
  for all to anon using (true) with check (true);

-- audit_logs
drop policy if exists audit_logs_allow_anon on public.audit_logs;
create policy audit_logs_allow_anon on public.audit_logs
  for all to anon using (true) with check (true);

-- clinics e app_users (necessário para inserções via FK)
alter table public.clinics    enable row level security;
alter table public.app_users  enable row level security;

drop policy if exists clinics_allow_anon on public.clinics;
create policy clinics_allow_anon on public.clinics
  for all to anon using (true) with check (true);

drop policy if exists app_users_allow_anon on public.app_users;
create policy app_users_allow_anon on public.app_users
  for all to anon using (true) with check (true);

-- ── 3. GRANT EXECUTE nas funções RPC para `anon` ─────────────────────────
grant execute on function public.create_anamnesis_request(uuid, uuid, uuid, uuid, uuid, timestamptz) to anon;
grant execute on function public.validate_anamnesis_public_link(text, text) to anon;
grant execute on function public.mark_anamnesis_request_opened(uuid, inet, text) to anon;
grant execute on function public.generate_anamnesis_request_token() to anon;
grant execute on function public.generate_public_slug() to anon;
grant execute on function public.normalize_text_from_json(jsonb) to anon;
