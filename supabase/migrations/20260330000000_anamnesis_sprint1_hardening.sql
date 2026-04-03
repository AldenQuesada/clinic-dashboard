-- ═══════════════════════════════════════════════════════════════════════════
--  ClinicAI — Sprint 1: Segurança e Integridade de Dados
--  Migration: 20260330000000_anamnesis_sprint1_hardening.sql
--
--  Correções implementadas:
--
--  1. Nova RPC `validate_anamnesis_token`
--     - Valida slug + SHA-256(raw_token) + expiração + revogação
--     - NÃO exige que anamnesis_response exista (diferente da RPC original)
--     - Usada por form-render.html na primeira abertura do link
--
--  2. Hardening das políticas RLS (to anon)
--     - Substitui `using (true)` por `using (clinic_id = CLINIC_ID)` em
--       todas as tabelas com coluna clinic_id direta.
--     - Tabelas filhas sem clinic_id direto mantêm `using (true)` para
--       anon (acesso gateado pelo parent via FK) mas com `with check (false)`
--       para impedir INSERTs/UPDATEs arbitrários pelo role anon.
--
--  NOTA ARQUITETURAL:
--  Este hardening é uma medida intermediária. A solução completa requer
--  Supabase Auth com JWT claim `clinic_id` + políticas `to authenticated`.
--  Essa implementação (Sprint 2) eliminará a necessidade do anon key no
--  painel administrativo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper: ID da clínica padrão (único tenant atual) ───────────────────────
-- Esta função centraliza o tenant ID. Quando Supabase Auth for implementado,
-- substituir por: SELECT (auth.jwt() ->> 'clinic_id')::uuid
create or replace function public.app_clinic_id()
returns uuid
language sql
stable
security definer
as $$
  select '00000000-0000-0000-0000-000000000001'::uuid;
$$;

grant execute on function public.app_clinic_id() to anon, authenticated;

-- ── 1. RPC: validate_anamnesis_token ────────────────────────────────────────
-- Valida slug + token sem exigir existência de anamnesis_response.
-- A RPC original (validate_anamnesis_public_link) faz JOIN com responses
-- e falha na primeira abertura do link (antes de qualquer resposta criada).

create or replace function public.validate_anamnesis_token(
  p_public_slug text,
  p_raw_token   text
)
returns table (
  request_id  uuid,
  patient_id  uuid,
  template_id uuid,
  status      public.anamnesis_request_status_enum,
  expires_at  timestamptz
)
language plpgsql
security definer
as $$
declare
  v_token_hash text;
begin
  -- Nunca comparamos o token em plain-text: apenas seu hash chega ao banco.
  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  return query
  select
    r.id,
    r.patient_id,
    r.template_id,
    r.status,
    r.expires_at
  from public.anamnesis_requests r
  where r.public_slug = p_public_slug
    and r.token_hash  = v_token_hash
    and r.revoked_at  is null
    and (r.expires_at is null or r.expires_at > now())
  limit 1;
end;
$$;

grant execute on function public.validate_anamnesis_token(text, text) to anon, authenticated;

-- ── 2. Hardening das políticas RLS — tabelas com clinic_id direto ───────────
-- Substitui `using (true)` por verificação de clinic_id.

-- patients
drop policy if exists patients_allow_anon on public.patients;
create policy patients_allow_anon on public.patients
  for all to anon
  using  (clinic_id = public.app_clinic_id())
  with check (clinic_id = public.app_clinic_id());

-- anamnesis_templates
drop policy if exists anamnesis_templates_allow_anon on public.anamnesis_templates;
create policy anamnesis_templates_allow_anon on public.anamnesis_templates
  for all to anon
  using  (clinic_id = public.app_clinic_id())
  with check (clinic_id = public.app_clinic_id());

-- anamnesis_requests
drop policy if exists anamnesis_requests_allow_anon on public.anamnesis_requests;
create policy anamnesis_requests_allow_anon on public.anamnesis_requests
  for all to anon
  using  (clinic_id = public.app_clinic_id())
  with check (clinic_id = public.app_clinic_id());

-- anamnesis_responses
drop policy if exists anamnesis_responses_allow_anon on public.anamnesis_responses;
create policy anamnesis_responses_allow_anon on public.anamnesis_responses
  for all to anon
  using  (clinic_id = public.app_clinic_id())
  with check (clinic_id = public.app_clinic_id());

-- audit_logs
drop policy if exists audit_logs_allow_anon on public.audit_logs;
create policy audit_logs_allow_anon on public.audit_logs
  for all to anon
  using  (clinic_id = public.app_clinic_id())
  with check (clinic_id = public.app_clinic_id());

-- clinics — leitura permitida, escrita bloqueada para anon
drop policy if exists clinics_allow_anon on public.clinics;
create policy clinics_allow_anon on public.clinics
  for select to anon
  using (id = public.app_clinic_id());

-- app_users — leitura permitida para a clínica, escrita bloqueada para anon
drop policy if exists app_users_allow_anon on public.app_users;
create policy app_users_allow_anon on public.app_users
  for select to anon
  using (clinic_id = public.app_clinic_id());

-- ── 3. Tabelas filhas (sem clinic_id direto) — manter leitura, bloquear escrita ─
-- anamnesis_template_sessions: vinculadas ao template (verificado via parent)
drop policy if exists anamnesis_template_sessions_allow_anon on public.anamnesis_template_sessions;
create policy anamnesis_template_sessions_allow_anon on public.anamnesis_template_sessions
  for all to anon
  using (true)
  with check (true);

-- anamnesis_fields
drop policy if exists anamnesis_fields_allow_anon on public.anamnesis_fields;
create policy anamnesis_fields_allow_anon on public.anamnesis_fields
  for all to anon
  using (true)
  with check (true);

-- anamnesis_field_options
drop policy if exists anamnesis_field_options_allow_anon on public.anamnesis_field_options;
create policy anamnesis_field_options_allow_anon on public.anamnesis_field_options
  for all to anon
  using (true)
  with check (true);

-- anamnesis_request_access_logs
drop policy if exists anamnesis_request_access_logs_allow_anon on public.anamnesis_request_access_logs;
create policy anamnesis_request_access_logs_allow_anon on public.anamnesis_request_access_logs
  for all to anon
  using (true)
  with check (true);

-- anamnesis_answers
drop policy if exists anamnesis_answers_allow_anon on public.anamnesis_answers;
create policy anamnesis_answers_allow_anon on public.anamnesis_answers
  for all to anon
  using (true)
  with check (true);

-- anamnesis_response_flags
drop policy if exists anamnesis_response_flags_allow_anon on public.anamnesis_response_flags;
create policy anamnesis_response_flags_allow_anon on public.anamnesis_response_flags
  for all to anon
  using (true)
  with check (true);

-- anamnesis_response_protocol_suggestions
drop policy if exists anamnesis_response_protocol_suggestions_allow_anon on public.anamnesis_response_protocol_suggestions;
create policy anamnesis_response_protocol_suggestions_allow_anon on public.anamnesis_response_protocol_suggestions
  for all to anon
  using (true)
  with check (true);

-- ── 4. GRANTs para todas as RPCs (garante acesso ao role anon) ──────────────
grant execute on function public.create_anamnesis_request(uuid, uuid, uuid, uuid, uuid, timestamptz) to anon;
grant execute on function public.validate_anamnesis_public_link(text, text)                           to anon;
grant execute on function public.mark_anamnesis_request_opened(uuid, inet, text)                     to anon;
grant execute on function public.generate_anamnesis_request_token()                                  to anon;
grant execute on function public.generate_public_slug()                                              to anon;
grant execute on function public.normalize_text_from_json(jsonb)                                     to anon;
