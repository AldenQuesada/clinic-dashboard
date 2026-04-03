-- ═══════════════════════════════════════════════════════════════════════════
--  ClinicAI — Sprint 3: Robustez e Confiabilidade
--  Migration: 20260332000000_anamnesis_sprint3_robustness.sql
--
--  Correções implementadas:
--
--  1. Partial unique indexes em anamnesis_fields
--     - UNIQUE(template_id, field_key) era full: registros soft-deletados
--       bloqueavam reutilização da mesma field_key no mesmo template.
--     - UNIQUE(session_id, order_index) era full: registros soft-deletados
--       bloqueavam order_index já usados.
--     - Ambos convertidos para índices parciais WHERE deleted_at IS NULL.
--
--  2. validate_anamnesis_token atualizado para retornar clinic_id
--     - Necessário para form-render.html criar anamnesis_response corretamente
--       sem depender de uma segunda query à tabela patients.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1a. Partial unique index: anamnesis_fields (template_id, field_key) ────
-- Remove constraint full e cria índice parcial que exclui soft-deleted

alter table public.anamnesis_fields
  drop constraint if exists anamnesis_fields_template_id_field_key_key;

create unique index if not exists anamnesis_fields_template_field_key_active_uidx
  on public.anamnesis_fields (template_id, field_key)
  where deleted_at is null;

-- ── 1b. Partial unique index: anamnesis_fields (session_id, order_index) ───
alter table public.anamnesis_fields
  drop constraint if exists anamnesis_fields_session_id_order_index_key;

create unique index if not exists anamnesis_fields_session_order_active_uidx
  on public.anamnesis_fields (session_id, order_index)
  where deleted_at is null;

-- ── 1c. Partial unique index: anamnesis_template_sessions (template_id, order_index)
-- Sessões tombstoned (order_index > 800000) não devem bloquear o índice
alter table public.anamnesis_template_sessions
  drop constraint if exists anamnesis_template_sessions_template_id_order_index_key;

create unique index if not exists anamnesis_sessions_template_order_active_uidx
  on public.anamnesis_template_sessions (template_id, order_index)
  where is_active = true;

-- ── 2. validate_anamnesis_token — adiciona clinic_id ao retorno ─────────────
create or replace function public.validate_anamnesis_token(
  p_public_slug text,
  p_raw_token   text
)
returns table (
  request_id  uuid,
  clinic_id   uuid,
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
  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  return query
  select
    r.id,
    r.clinic_id,
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

-- ── 3. Updated_at column para anamnesis_template_sessions (se não existe) ──
do $$ begin
  alter table public.anamnesis_template_sessions
    add column updated_at timestamptz not null default now();
exception when duplicate_column then null; end $$;
