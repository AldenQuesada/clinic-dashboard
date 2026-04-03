-- ═══════════════════════════════════════════════════════════════════════════
--  ClinicAI — Sprint 2: Qualidade de Código e Correções Funcionais
--  Migration: 20260331000000_anamnesis_sprint2_quality.sql
--
--  Correções implementadas:
--
--  1. anamnesis_template_sessions.deleted_at
--     - Adiciona coluna deleted_at para suporte a soft-delete completo
--     - _loadBuilderSessions e bootWithTemplate já filtram is_active = true;
--       o deleted_at é adicionado como camada extra de auditoria
--
--  2. Corrige public_url na RPC create_anamnesis_request
--     - Altera /anamnese.html → /form-render.html no campo public_url
--     - O caminho correto do formulário do paciente é form-render.html
--
--  3. Índice de performance: anamnesis_template_sessions filtrado por is_active
--     - Consultas de listagem de sessões ativas agora usam índice parcial
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Coluna deleted_at em anamnesis_template_sessions ─────────────────────
do $$ begin
  alter table public.anamnesis_template_sessions
    add column deleted_at timestamptz null;
exception when duplicate_column then null; end $$;

-- Índice para filtrar sessões ativas (deleted_at IS NULL AND is_active = true)
create index if not exists anamnesis_template_sessions_active_idx
  on public.anamnesis_template_sessions (template_id, order_index)
  where deleted_at is null and is_active = true;

-- ── 2. Trigger updated_at em anamnesis_template_sessions (se não existir) ───
-- A tabela não tinha trigger updated_at — necessário após adicionar deleted_at
create or replace function public._set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$ begin
  create trigger trg_anamnesis_template_sessions_updated_at
    before update on public.anamnesis_template_sessions
    for each row execute function public._set_updated_at();
exception when duplicate_object then null; end $$;

-- ── 3. Corrige public_url na RPC create_anamnesis_request ───────────────────
create or replace function public.create_anamnesis_request(
  p_clinic_id      uuid,
  p_patient_id     uuid,
  p_template_id    uuid,
  p_created_by     uuid        default null,
  p_appointment_id uuid        default null,
  p_expires_at     timestamptz default null
)
returns table (
  request_id  uuid,
  public_slug text,
  raw_token   text,
  public_url  text
)
language plpgsql security definer as $$
declare
  v_raw_token   text;
  v_token_hash  text;
  v_request_id  uuid;
  v_public_slug text;
begin
  select t.raw_token, t.token_hash
    into v_raw_token, v_token_hash
  from public.generate_anamnesis_request_token() t;

  insert into public.anamnesis_requests (
    clinic_id, patient_id, template_id, appointment_id,
    token_hash, status, expires_at, created_by
  ) values (
    p_clinic_id, p_patient_id, p_template_id, p_appointment_id,
    v_token_hash, 'draft', p_expires_at, p_created_by
  )
  returning id, anamnesis_requests.public_slug
  into v_request_id, v_public_slug;

  update public.anamnesis_requests
    set status  = 'sent',
        sent_at = now()
  where id = v_request_id;

  request_id  := v_request_id;
  public_slug := v_public_slug;
  raw_token   := v_raw_token;
  -- Caminho correto: form-render.html (não anamnese.html)
  public_url  := '/form-render.html?slug=' || v_public_slug || '&token=' || v_raw_token;

  return next;
end;
$$;

grant execute on function public.create_anamnesis_request(uuid, uuid, uuid, uuid, uuid, timestamptz) to anon, authenticated;

-- ── 4. Índice parcial: anamnesis_fields sem deleted_at ──────────────────────
-- Melhora performance na listagem de campos ativos no builder
create index if not exists anamnesis_fields_active_session_idx
  on public.anamnesis_fields (session_id, order_index)
  where deleted_at is null;
