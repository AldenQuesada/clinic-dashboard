-- ═══════════════════════════════════════════════════════════════════════════
--  ClinicAI — Sprint 4: Experiência do Paciente e Visualizador de Respostas
--  Migration: 20260333000000_anamnesis_sprint4_experience.sql
--
--  Correções implementadas:
--
--  1. RLS endurecida para tabelas filhas (role anon)
--     - Sprint 1 usou `using(true)` em tabelas sem clinic_id direto.
--     - Isso permite que qualquer portador do anon key leia dados de
--       qualquer clínica via FK traversal.
--     - Este migration substitui por sub-queries restritas a app_clinic_id():
--
--       anamnesis_template_sessions  → via anamnesis_templates.clinic_id
--       anamnesis_fields             → via anamnesis_templates.clinic_id
--       anamnesis_field_options      → via anamnesis_fields → templates.clinic_id
--       anamnesis_answers            → via anamnesis_responses.clinic_id
--       anamnesis_response_flags     → via anamnesis_responses.clinic_id
--       anamnesis_response_protocol_suggestions → via anamnesis_responses.clinic_id
--       anamnesis_request_access_logs → via anamnesis_requests.clinic_id
--
--  2. Índice de performance para restore de respostas
--     - _restoreAnswers consulta anamnesis_answers por response_id sem join.
--     - Índice já existe (anamnesis_answers_response_id_idx) — garantido idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1a. anamnesis_template_sessions — acesso anon via template.clinic_id ────
drop policy if exists anamnesis_template_sessions_allow_anon on public.anamnesis_template_sessions;
create policy anamnesis_template_sessions_allow_anon
  on public.anamnesis_template_sessions
  for all to anon
  using (exists (
    select 1 from public.anamnesis_templates t
    where t.id        = template_id
      and t.clinic_id = public.app_clinic_id()
      and t.deleted_at is null
  ))
  with check (exists (
    select 1 from public.anamnesis_templates t
    where t.id        = template_id
      and t.clinic_id = public.app_clinic_id()
      and t.deleted_at is null
  ));

-- ── 1b. anamnesis_fields — acesso anon via template.clinic_id ───────────────
drop policy if exists anamnesis_fields_allow_anon on public.anamnesis_fields;
create policy anamnesis_fields_allow_anon
  on public.anamnesis_fields
  for all to anon
  using (exists (
    select 1 from public.anamnesis_templates t
    where t.id        = template_id
      and t.clinic_id = public.app_clinic_id()
      and t.deleted_at is null
  ))
  with check (exists (
    select 1 from public.anamnesis_templates t
    where t.id        = template_id
      and t.clinic_id = public.app_clinic_id()
      and t.deleted_at is null
  ));

-- ── 1c. anamnesis_field_options — acesso anon via field → template.clinic_id ─
drop policy if exists anamnesis_field_options_allow_anon on public.anamnesis_field_options;
create policy anamnesis_field_options_allow_anon
  on public.anamnesis_field_options
  for all to anon
  using (exists (
    select 1
    from public.anamnesis_fields   f
    join public.anamnesis_templates t on t.id = f.template_id
    where f.id        = field_id
      and t.clinic_id = public.app_clinic_id()
      and t.deleted_at is null
  ))
  with check (exists (
    select 1
    from public.anamnesis_fields   f
    join public.anamnesis_templates t on t.id = f.template_id
    where f.id        = field_id
      and t.clinic_id = public.app_clinic_id()
      and t.deleted_at is null
  ));

-- ── 1d. anamnesis_answers — acesso anon via response.clinic_id ──────────────
drop policy if exists anamnesis_answers_allow_anon on public.anamnesis_answers;
create policy anamnesis_answers_allow_anon
  on public.anamnesis_answers
  for all to anon
  using (exists (
    select 1 from public.anamnesis_responses r
    where r.id        = response_id
      and r.clinic_id = public.app_clinic_id()
  ))
  with check (exists (
    select 1 from public.anamnesis_responses r
    where r.id        = response_id
      and r.clinic_id = public.app_clinic_id()
  ));

-- ── 1e. anamnesis_response_flags — acesso anon via response.clinic_id ───────
drop policy if exists anamnesis_response_flags_allow_anon on public.anamnesis_response_flags;
create policy anamnesis_response_flags_allow_anon
  on public.anamnesis_response_flags
  for all to anon
  using (exists (
    select 1 from public.anamnesis_responses r
    where r.id        = response_id
      and r.clinic_id = public.app_clinic_id()
  ))
  with check (exists (
    select 1 from public.anamnesis_responses r
    where r.id        = response_id
      and r.clinic_id = public.app_clinic_id()
  ));

-- ── 1f. anamnesis_response_protocol_suggestions ─────────────────────────────
drop policy if exists anamnesis_response_protocol_suggestions_allow_anon on public.anamnesis_response_protocol_suggestions;
create policy anamnesis_response_protocol_suggestions_allow_anon
  on public.anamnesis_response_protocol_suggestions
  for all to anon
  using (exists (
    select 1 from public.anamnesis_responses r
    where r.id        = response_id
      and r.clinic_id = public.app_clinic_id()
  ))
  with check (exists (
    select 1 from public.anamnesis_responses r
    where r.id        = response_id
      and r.clinic_id = public.app_clinic_id()
  ));

-- ── 1g. anamnesis_request_access_logs — acesso anon via request.clinic_id ───
drop policy if exists anamnesis_request_access_logs_allow_anon on public.anamnesis_request_access_logs;
create policy anamnesis_request_access_logs_allow_anon
  on public.anamnesis_request_access_logs
  for all to anon
  using (exists (
    select 1 from public.anamnesis_requests rq
    where rq.id        = request_id
      and rq.clinic_id = public.app_clinic_id()
  ))
  with check (exists (
    select 1 from public.anamnesis_requests rq
    where rq.id        = request_id
      and rq.clinic_id = public.app_clinic_id()
  ));

-- ── 2. Índice de performance: restore de respostas ──────────────────────────
-- _restoreAnswers consulta anamnesis_answers por (response_id) sem join
-- O índice já existe desde a migration base — garantido idempotente.
create index if not exists anamnesis_answers_restore_idx
  on public.anamnesis_answers (response_id, field_key);
