-- ═══════════════════════════════════════════════════════════════════════════
--  ClinicAI — Módulo de Anamnese Digital v1.0
--  Migration: 20260328000000_anamnesis_module.sql
--
--  Execute no Supabase SQL Editor (uma única vez por ambiente).
--  Idempotente: seguro para re-executar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. EXTENSÕES ──────────────────────────────────────────────────────────
create extension if not exists pgcrypto;
create extension if not exists citext;

-- ── 2. ENUMS ──────────────────────────────────────────────────────────────

do $$ begin
  create type public.patient_sex_enum as enum (
    'male', 'female', 'other', 'not_informed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.anamnesis_template_category_enum as enum (
    'general', 'facial', 'body', 'capillary', 'epilation', 'custom'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.anamnesis_field_type_enum as enum (
    'text', 'textarea', 'rich_text', 'number', 'date', 'boolean',
    'single_select', 'multi_select', 'single_select_dynamic',
    'scale_select', 'image_select', 'file_upload', 'image_upload',
    'section_title', 'label', 'description_text'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.anamnesis_request_status_enum as enum (
    'draft', 'sent', 'opened', 'in_progress', 'completed',
    'expired', 'revoked', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.anamnesis_response_status_enum as enum (
    'not_started', 'in_progress', 'completed', 'abandoned', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.anamnesis_flag_severity_enum as enum (
    'info', 'warning', 'high', 'critical'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.anamnesis_flag_type_enum as enum (
    'clinical', 'eligibility', 'commercial', 'document', 'data_quality'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.audit_action_enum as enum (
    'create', 'update', 'delete', 'restore',
    'send_link', 'revoke_link', 'complete_form'
  );
exception when duplicate_object then null; end $$;

-- ── 3. FUNÇÕES AUXILIARES ─────────────────────────────────────────────────

create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_public_slug()
returns text language sql as $$
  select encode(gen_random_bytes(12), 'hex');
$$;

create or replace function public.normalize_text_from_json(input_json jsonb)
returns text language plpgsql as $$
declare
  result text;
begin
  if jsonb_typeof(input_json) = 'array' then
    select string_agg(v, ', ')
    into result
    from jsonb_array_elements_text(input_json) as v;
    return result;
  elsif jsonb_typeof(input_json) = 'object' then
    return input_json::text;
  else
    return trim(both '"' from input_json::text);
  end if;
end;
$$;

create or replace function public.generate_anamnesis_request_token()
returns table(raw_token text, token_hash text) language plpgsql as $$
declare
  v_raw text;
begin
  v_raw      := encode(gen_random_bytes(32), 'hex');
  raw_token  := v_raw;
  token_hash := encode(digest(v_raw, 'sha256'), 'hex');
  return next;
end;
$$;

-- ── 4. TABELAS BASE ───────────────────────────────────────────────────────

create table if not exists public.clinics (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id         uuid        primary key,
  clinic_id  uuid        not null references public.clinics(id) on delete cascade,
  full_name  text,
  email      citext,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 5. PATIENTS ───────────────────────────────────────────────────────────

create table if not exists public.patients (
  id         uuid                   primary key default gen_random_uuid(),
  clinic_id  uuid                   not null references public.clinics(id) on delete cascade,
  first_name text                   not null,
  last_name  text                   not null,
  full_name  text                   generated always as (trim(first_name || ' ' || last_name)) stored,
  sex        public.patient_sex_enum not null default 'not_informed',
  phone      text,
  cpf        text                   not null,
  birth_date date,
  rg         text,
  address_zip_code     text,
  address_street       text,
  address_number       text,
  address_complement   text,
  address_neighborhood text,
  address_city         text,
  address_state        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create unique index if not exists patients_clinic_cpf_unique_idx
  on public.patients (clinic_id, cpf)
  where deleted_at is null;

create index if not exists patients_clinic_id_idx on public.patients (clinic_id);
create index if not exists patients_phone_idx     on public.patients (phone);
create index if not exists patients_full_name_idx on public.patients (full_name);

do $$ begin
  alter table public.patients
    add constraint patients_cpf_not_empty_chk check (length(trim(cpf)) > 0);
exception when duplicate_object then null; end $$;

-- ── 6. ANAMNESIS_TEMPLATES ────────────────────────────────────────────────

create table if not exists public.anamnesis_templates (
  id          uuid                                    primary key default gen_random_uuid(),
  clinic_id   uuid                                    not null references public.clinics(id) on delete cascade,
  name        text                                    not null,
  description text,
  category    public.anamnesis_template_category_enum not null default 'general',
  is_active               boolean not null default true,
  is_default              boolean not null default false,
  is_pre_appointment_form boolean not null default true,
  version                 integer not null default 1,
  created_by uuid null references public.app_users(id),
  updated_by uuid null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists anamnesis_templates_clinic_id_idx on public.anamnesis_templates (clinic_id);
create index if not exists anamnesis_templates_category_idx  on public.anamnesis_templates (category);

do $$ begin
  alter table public.anamnesis_templates
    add constraint anamnesis_templates_version_positive_chk check (version > 0);
exception when duplicate_object then null; end $$;

-- ── 7. ANAMNESIS_TEMPLATE_SESSIONS ────────────────────────────────────────

create table if not exists public.anamnesis_template_sessions (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.anamnesis_templates(id) on delete cascade,
  title       text not null,
  description text,
  order_index integer not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (template_id, order_index)
);

create index if not exists anamnesis_template_sessions_template_id_idx
  on public.anamnesis_template_sessions (template_id);

do $$ begin
  alter table public.anamnesis_template_sessions
    add constraint anamnesis_template_sessions_order_positive_chk check (order_index > 0);
exception when duplicate_object then null; end $$;

-- ── 8. ANAMNESIS_FIELDS ───────────────────────────────────────────────────

create table if not exists public.anamnesis_fields (
  id          uuid                           primary key default gen_random_uuid(),
  template_id uuid                           not null references public.anamnesis_templates(id) on delete cascade,
  session_id  uuid                           not null references public.anamnesis_template_sessions(id) on delete cascade,
  field_key   text                           not null,
  label       text                           not null,
  description text,
  help_text   text,
  field_type  public.anamnesis_field_type_enum not null,
  placeholder text,
  is_required boolean not null default false,
  is_active   boolean not null default true,
  is_visible  boolean not null default true,
  order_index            integer not null,
  default_value          jsonb,
  validation_rules       jsonb not null default '{}'::jsonb,
  settings_json          jsonb not null default '{}'::jsonb,
  conditional_rules_json jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz null,
  unique (template_id, field_key),
  unique (session_id, order_index)
);

create index if not exists anamnesis_fields_template_id_idx on public.anamnesis_fields (template_id);
create index if not exists anamnesis_fields_session_id_idx  on public.anamnesis_fields (session_id);
create index if not exists anamnesis_fields_field_type_idx  on public.anamnesis_fields (field_type);

do $$ begin
  alter table public.anamnesis_fields
    add constraint anamnesis_fields_order_positive_chk check (order_index > 0);
exception when duplicate_object then null; end $$;

-- ── 9. ANAMNESIS_FIELD_OPTIONS ────────────────────────────────────────────

create table if not exists public.anamnesis_field_options (
  id          uuid    primary key default gen_random_uuid(),
  field_id    uuid    not null references public.anamnesis_fields(id) on delete cascade,
  label       text    not null,
  value       text    not null,
  image_url   text,
  order_index integer not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (field_id, value),
  unique (field_id, order_index)
);

create index if not exists anamnesis_field_options_field_id_idx
  on public.anamnesis_field_options (field_id);

do $$ begin
  alter table public.anamnesis_field_options
    add constraint anamnesis_field_options_order_positive_chk check (order_index > 0);
exception when duplicate_object then null; end $$;

-- ── 10. ANAMNESIS_REQUESTS ────────────────────────────────────────────────

create table if not exists public.anamnesis_requests (
  id             uuid                                   primary key default gen_random_uuid(),
  clinic_id      uuid                                   not null references public.clinics(id) on delete cascade,
  patient_id     uuid                                   not null references public.patients(id) on delete cascade,
  template_id    uuid                                   not null references public.anamnesis_templates(id) on delete restrict,
  appointment_id uuid                                   null,
  token_hash     text                                   not null,
  public_slug    text                                   not null unique,
  status         public.anamnesis_request_status_enum   not null default 'draft',
  expires_at      timestamptz null,
  sent_at         timestamptz null,
  first_opened_at timestamptz null,
  last_opened_at  timestamptz null,
  completed_at    timestamptz null,
  revoked_at      timestamptz null,
  created_by  uuid null references public.app_users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists anamnesis_requests_token_hash_unique_idx
  on public.anamnesis_requests (token_hash);

create index if not exists anamnesis_requests_clinic_id_idx  on public.anamnesis_requests (clinic_id);
create index if not exists anamnesis_requests_patient_id_idx on public.anamnesis_requests (patient_id);
create index if not exists anamnesis_requests_status_idx     on public.anamnesis_requests (status);

-- ── 11. ANAMNESIS_REQUEST_ACCESS_LOGS ────────────────────────────────────

create table if not exists public.anamnesis_request_access_logs (
  id          uuid        primary key default gen_random_uuid(),
  request_id  uuid        not null references public.anamnesis_requests(id) on delete cascade,
  ip_address  inet        null,
  user_agent  text        null,
  accessed_at timestamptz not null default now(),
  event_name  text        not null
);

create index if not exists anamnesis_request_access_logs_request_id_idx
  on public.anamnesis_request_access_logs (request_id);

-- ── 12. ANAMNESIS_RESPONSES ───────────────────────────────────────────────

create table if not exists public.anamnesis_responses (
  id          uuid                                    primary key default gen_random_uuid(),
  request_id  uuid                                    not null unique references public.anamnesis_requests(id) on delete cascade,
  clinic_id   uuid                                    not null references public.clinics(id) on delete cascade,
  patient_id  uuid                                    not null references public.patients(id) on delete cascade,
  template_id uuid                                    not null references public.anamnesis_templates(id) on delete restrict,
  status              public.anamnesis_response_status_enum not null default 'not_started',
  current_session_id  uuid null references public.anamnesis_template_sessions(id) on delete set null,
  progress_percent    numeric(5,2) not null default 0,
  started_at   timestamptz null,
  completed_at timestamptz null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists anamnesis_responses_clinic_id_idx  on public.anamnesis_responses (clinic_id);
create index if not exists anamnesis_responses_patient_id_idx on public.anamnesis_responses (patient_id);
create index if not exists anamnesis_responses_status_idx     on public.anamnesis_responses (status);

do $$ begin
  alter table public.anamnesis_responses
    add constraint anamnesis_responses_progress_chk check (progress_percent >= 0 and progress_percent <= 100);
exception when duplicate_object then null; end $$;

-- ── 13. ANAMNESIS_ANSWERS ─────────────────────────────────────────────────

create table if not exists public.anamnesis_answers (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.anamnesis_responses(id) on delete cascade,
  field_id    uuid not null references public.anamnesis_fields(id) on delete cascade,
  field_key   text not null,
  value_json      jsonb not null,
  normalized_text text  null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (response_id, field_id)
);

create index if not exists anamnesis_answers_response_id_idx on public.anamnesis_answers (response_id);
create index if not exists anamnesis_answers_field_id_idx    on public.anamnesis_answers (field_id);

-- ── 14. ANAMNESIS_RESPONSE_FLAGS ──────────────────────────────────────────

create table if not exists public.anamnesis_response_flags (
  id          uuid                               primary key default gen_random_uuid(),
  response_id uuid                               not null references public.anamnesis_responses(id) on delete cascade,
  flag_type   public.anamnesis_flag_type_enum     not null,
  flag_code   text                               not null,
  severity    public.anamnesis_flag_severity_enum not null default 'info',
  message     text                               not null,
  metadata    jsonb                              not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists anamnesis_response_flags_response_id_idx
  on public.anamnesis_response_flags (response_id);

-- ── 15. ANAMNESIS_RESPONSE_PROTOCOL_SUGGESTIONS ───────────────────────────

create table if not exists public.anamnesis_response_protocol_suggestions (
  id            uuid    primary key default gen_random_uuid(),
  response_id   uuid    not null references public.anamnesis_responses(id) on delete cascade,
  protocol_code text    not null,
  protocol_name text    not null,
  reason        text,
  priority      integer not null default 0,
  metadata      jsonb   not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists anamnesis_response_protocol_suggestions_response_id_idx
  on public.anamnesis_response_protocol_suggestions (response_id);

-- ── 16. AUDIT_LOGS ────────────────────────────────────────────────────────

create table if not exists public.audit_logs (
  id         uuid                    primary key default gen_random_uuid(),
  clinic_id  uuid                    null references public.clinics(id) on delete cascade,
  user_id    uuid                    null references public.app_users(id) on delete set null,
  table_name text                    not null,
  record_id  uuid                    null,
  action     public.audit_action_enum not null,
  old_data   jsonb null,
  new_data   jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_clinic_id_idx  on public.audit_logs (clinic_id);
create index if not exists audit_logs_table_name_idx on public.audit_logs (table_name);

-- ── 17. TRIGGERS ─────────────────────────────────────────────────────────

create or replace trigger trg_clinics_updated_at
  before update on public.clinics
  for each row execute function public.update_updated_at_column();

create or replace trigger trg_app_users_updated_at
  before update on public.app_users
  for each row execute function public.update_updated_at_column();

create or replace trigger trg_patients_updated_at
  before update on public.patients
  for each row execute function public.update_updated_at_column();

create or replace trigger trg_anamnesis_templates_updated_at
  before update on public.anamnesis_templates
  for each row execute function public.update_updated_at_column();

create or replace trigger trg_anamnesis_template_sessions_updated_at
  before update on public.anamnesis_template_sessions
  for each row execute function public.update_updated_at_column();

create or replace trigger trg_anamnesis_fields_updated_at
  before update on public.anamnesis_fields
  for each row execute function public.update_updated_at_column();

create or replace trigger trg_anamnesis_field_options_updated_at
  before update on public.anamnesis_field_options
  for each row execute function public.update_updated_at_column();

create or replace trigger trg_anamnesis_requests_updated_at
  before update on public.anamnesis_requests
  for each row execute function public.update_updated_at_column();

create or replace trigger trg_anamnesis_responses_updated_at
  before update on public.anamnesis_responses
  for each row execute function public.update_updated_at_column();

create or replace trigger trg_anamnesis_answers_updated_at
  before update on public.anamnesis_answers
  for each row execute function public.update_updated_at_column();

-- public_slug automático
create or replace function public.set_anamnesis_request_defaults()
returns trigger language plpgsql as $$
begin
  if new.public_slug is null or new.public_slug = '' then
    new.public_slug := public.generate_public_slug();
  end if;
  return new;
end;
$$;

create or replace trigger trg_set_anamnesis_request_defaults
  before insert on public.anamnesis_requests
  for each row execute function public.set_anamnesis_request_defaults();

-- normalized_text automático nas respostas
create or replace function public.set_normalized_text_on_answers()
returns trigger language plpgsql as $$
begin
  new.normalized_text := public.normalize_text_from_json(new.value_json);
  return new;
end;
$$;

create or replace trigger trg_set_normalized_text_on_answers
  before insert or update on public.anamnesis_answers
  for each row execute function public.set_normalized_text_on_answers();

-- response criada automaticamente junto com o request
create or replace function public.create_response_for_request()
returns trigger language plpgsql as $$
begin
  insert into public.anamnesis_responses (
    request_id, clinic_id, patient_id, template_id, status
  ) values (
    new.id, new.clinic_id, new.patient_id, new.template_id, 'not_started'
  );
  return new;
end;
$$;

create or replace trigger trg_create_response_for_request
  after insert on public.anamnesis_requests
  for each row execute function public.create_response_for_request();

-- auditoria básica
create or replace function public.audit_basic_changes()
returns trigger language plpgsql as $$
declare
  v_clinic_id uuid;
begin
  if tg_op = 'INSERT' then
    v_clinic_id := new.clinic_id;
    insert into public.audit_logs (clinic_id, table_name, record_id, action, new_data)
    values (v_clinic_id, tg_table_name, new.id, 'create', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    v_clinic_id := coalesce(new.clinic_id, old.clinic_id);
    insert into public.audit_logs (clinic_id, table_name, record_id, action, old_data, new_data)
    values (v_clinic_id, tg_table_name, new.id, 'update', to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    v_clinic_id := old.clinic_id;
    insert into public.audit_logs (clinic_id, table_name, record_id, action, old_data)
    values (v_clinic_id, tg_table_name, old.id, 'delete', to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

create or replace trigger trg_audit_patients
  after insert or update or delete on public.patients
  for each row execute function public.audit_basic_changes();

create or replace trigger trg_audit_anamnesis_requests
  after insert or update or delete on public.anamnesis_requests
  for each row execute function public.audit_basic_changes();

create or replace trigger trg_audit_anamnesis_templates
  after insert or update or delete on public.anamnesis_templates
  for each row execute function public.audit_basic_changes();

-- ── 18. RLS ───────────────────────────────────────────────────────────────

alter table public.patients                                enable row level security;
alter table public.anamnesis_templates                     enable row level security;
alter table public.anamnesis_template_sessions             enable row level security;
alter table public.anamnesis_fields                        enable row level security;
alter table public.anamnesis_field_options                 enable row level security;
alter table public.anamnesis_requests                      enable row level security;
alter table public.anamnesis_request_access_logs           enable row level security;
alter table public.anamnesis_responses                     enable row level security;
alter table public.anamnesis_answers                       enable row level security;
alter table public.anamnesis_response_flags                enable row level security;
alter table public.anamnesis_response_protocol_suggestions enable row level security;
alter table public.audit_logs                              enable row level security;

-- patients
drop policy if exists patients_select_by_clinic on public.patients;
create policy patients_select_by_clinic on public.patients
  for select to authenticated
  using (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid));

drop policy if exists patients_insert_by_clinic on public.patients;
create policy patients_insert_by_clinic on public.patients
  for insert to authenticated
  with check (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid));

drop policy if exists patients_update_by_clinic on public.patients;
create policy patients_update_by_clinic on public.patients
  for update to authenticated
  using  (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid))
  with check (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid));

-- anamnesis_templates
drop policy if exists anamnesis_templates_select_by_clinic on public.anamnesis_templates;
create policy anamnesis_templates_select_by_clinic on public.anamnesis_templates
  for select to authenticated
  using (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid));

drop policy if exists anamnesis_templates_insert_by_clinic on public.anamnesis_templates;
create policy anamnesis_templates_insert_by_clinic on public.anamnesis_templates
  for insert to authenticated
  with check (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid));

drop policy if exists anamnesis_templates_update_by_clinic on public.anamnesis_templates;
create policy anamnesis_templates_update_by_clinic on public.anamnesis_templates
  for update to authenticated
  using  (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid))
  with check (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid));

-- anamnesis_template_sessions
drop policy if exists anamnesis_template_sessions_all_by_clinic on public.anamnesis_template_sessions;
create policy anamnesis_template_sessions_all_by_clinic on public.anamnesis_template_sessions
  for all to authenticated
  using (exists (
    select 1 from public.anamnesis_templates t
    where t.id = template_id
      and t.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ))
  with check (exists (
    select 1 from public.anamnesis_templates t
    where t.id = template_id
      and t.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ));

-- anamnesis_fields
drop policy if exists anamnesis_fields_all_by_clinic on public.anamnesis_fields;
create policy anamnesis_fields_all_by_clinic on public.anamnesis_fields
  for all to authenticated
  using (exists (
    select 1 from public.anamnesis_templates t
    where t.id = template_id
      and t.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ))
  with check (exists (
    select 1 from public.anamnesis_templates t
    where t.id = template_id
      and t.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ));

-- anamnesis_field_options
drop policy if exists anamnesis_field_options_all_by_clinic on public.anamnesis_field_options;
create policy anamnesis_field_options_all_by_clinic on public.anamnesis_field_options
  for all to authenticated
  using (exists (
    select 1 from public.anamnesis_fields f
    join public.anamnesis_templates t on t.id = f.template_id
    where f.id = field_id
      and t.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ))
  with check (exists (
    select 1 from public.anamnesis_fields f
    join public.anamnesis_templates t on t.id = f.template_id
    where f.id = field_id
      and t.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ));

-- anamnesis_requests
drop policy if exists anamnesis_requests_all_by_clinic on public.anamnesis_requests;
create policy anamnesis_requests_all_by_clinic on public.anamnesis_requests
  for all to authenticated
  using  (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid))
  with check (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid));

-- anamnesis_responses
drop policy if exists anamnesis_responses_all_by_clinic on public.anamnesis_responses;
create policy anamnesis_responses_all_by_clinic on public.anamnesis_responses
  for all to authenticated
  using  (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid))
  with check (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid));

-- anamnesis_answers
drop policy if exists anamnesis_answers_all_by_clinic on public.anamnesis_answers;
create policy anamnesis_answers_all_by_clinic on public.anamnesis_answers
  for all to authenticated
  using (exists (
    select 1 from public.anamnesis_responses r
    where r.id = response_id
      and r.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ))
  with check (exists (
    select 1 from public.anamnesis_responses r
    where r.id = response_id
      and r.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ));

-- anamnesis_response_flags
drop policy if exists anamnesis_response_flags_all_by_clinic on public.anamnesis_response_flags;
create policy anamnesis_response_flags_all_by_clinic on public.anamnesis_response_flags
  for all to authenticated
  using (exists (
    select 1 from public.anamnesis_responses r
    where r.id = response_id
      and r.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ))
  with check (exists (
    select 1 from public.anamnesis_responses r
    where r.id = response_id
      and r.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ));

-- anamnesis_response_protocol_suggestions
drop policy if exists anamnesis_response_protocol_suggestions_all_by_clinic on public.anamnesis_response_protocol_suggestions;
create policy anamnesis_response_protocol_suggestions_all_by_clinic on public.anamnesis_response_protocol_suggestions
  for all to authenticated
  using (exists (
    select 1 from public.anamnesis_responses r
    where r.id = response_id
      and r.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ))
  with check (exists (
    select 1 from public.anamnesis_responses r
    where r.id = response_id
      and r.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ));

-- anamnesis_request_access_logs
drop policy if exists anamnesis_request_access_logs_select_by_clinic on public.anamnesis_request_access_logs;
create policy anamnesis_request_access_logs_select_by_clinic on public.anamnesis_request_access_logs
  for select to authenticated
  using (exists (
    select 1 from public.anamnesis_requests r
    where r.id = request_id
      and r.clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid)
  ));

-- audit_logs
drop policy if exists audit_logs_select_by_clinic on public.audit_logs;
create policy audit_logs_select_by_clinic on public.audit_logs
  for select to authenticated
  using (clinic_id = ((auth.jwt() ->> 'clinic_id')::uuid));

-- ── 19. FUNÇÕES SQL PRINCIPAIS ────────────────────────────────────────────

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
  public_url  := '/anamnese.html?slug=' || v_public_slug || '&token=' || v_raw_token;

  return next;
end;
$$;

create or replace function public.validate_anamnesis_public_link(
  p_public_slug text,
  p_raw_token   text
)
returns table (
  request_id      uuid,
  clinic_id       uuid,
  patient_id      uuid,
  template_id     uuid,
  response_id     uuid,
  request_status  public.anamnesis_request_status_enum,
  response_status public.anamnesis_response_status_enum,
  expires_at      timestamptz
)
language plpgsql security definer as $$
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
    resp.id,
    r.status,
    resp.status,
    r.expires_at
  from public.anamnesis_requests r
  join public.anamnesis_responses resp on resp.request_id = r.id
  where r.public_slug = p_public_slug
    and r.token_hash  = v_token_hash
    and r.revoked_at  is null
    and (r.expires_at is null or r.expires_at > now())
  limit 1;
end;
$$;

create or replace function public.mark_anamnesis_request_opened(
  p_request_id uuid,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns void language plpgsql security definer as $$
begin
  update public.anamnesis_requests
    set first_opened_at = coalesce(first_opened_at, now()),
        last_opened_at  = now(),
        status = case
          when status in ('sent', 'draft') then 'opened'
          else status
        end
  where id = p_request_id;

  insert into public.anamnesis_request_access_logs
    (request_id, ip_address, user_agent, event_name)
  values
    (p_request_id, p_ip_address, p_user_agent, 'opened');
end;
$$;

-- ── 20. SEEDS ─────────────────────────────────────────────────────────────

insert into public.clinics (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Clinica Seed')
on conflict (id) do nothing;

insert into public.anamnesis_templates (
  id, clinic_id, name, description, category,
  is_active, is_default, is_pre_appointment_form, version
) values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Anamnese Digital Premium',
  'Template padrão completo da anamnese',
  'general', true, true, true, 1
)
on conflict (id) do nothing;

insert into public.anamnesis_template_sessions
  (id, template_id, title, description, order_index, is_active)
values
  ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Dados Gerais','Dados completos do paciente',1,true),
  ('11000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Identificação Básica','Dados iniciais',2,true),
  ('11000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Queixas Faciais','Interesses e incômodos faciais',3,true),
  ('11000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Autoavaliação Facial','Autoimagem e percepção',4,true),
  ('11000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','Queixas Corporais','Interesses corporais',5,true),
  ('11000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','Alergias','Histórico de alergias',6,true),
  ('11000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','Histórico Médico','Cirurgias, medicamentos e acompanhamento',7,true),
  ('11000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000001','Doenças e Condições','Condições sistêmicas e riscos',8,true),
  ('11000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','Gestação e Hábitos','Gestação, amamentação e estilo de vida',9,true),
  ('11000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000001','Pele e Patologias','Pele e alterações cutâneas',10,true),
  ('11000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000001','Histórico Estético','Injetáveis e tecnologias',11,true),
  ('11000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000001','Avaliação Corporal','Corpo, regiões e elasticidade',12,true),
  ('11000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000001','Observações','Observações finais',13,true)
on conflict do nothing;

insert into public.anamnesis_fields
  (id, template_id, session_id, field_key, label, description, help_text,
   field_type, placeholder, is_required, is_active, is_visible, order_index,
   validation_rules, settings_json, conditional_rules_json)
values
  -- Sessão 1: Dados gerais
  ('12000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','first_name','Nome',null,null,'text','Digite seu nome',true,true,true,1,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','last_name','Sobrenome',null,null,'text','Digite seu sobrenome',true,true,true,2,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','phone','Telefone',null,null,'text','Digite seu telefone',true,true,true,3,'{"format":"phone_br"}','{}','{}'),
  ('12000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','birth_date','Data de nascimento',null,null,'date',null,true,true,true,4,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','rg','RG',null,null,'text','Digite seu RG',false,true,true,5,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','cpf','CPF',null,null,'text','Digite seu CPF',true,true,true,6,'{"format":"cpf"}','{}','{}'),
  ('12000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','address_zip_code','CEP',null,null,'text','Digite seu CEP',false,true,true,7,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','address_street','Logradouro',null,null,'text','Rua / Avenida',false,true,true,8,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','address_number','Número',null,null,'text','Número',false,true,true,9,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','address_complement','Complemento',null,null,'text','Complemento',false,true,true,10,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','address_neighborhood','Bairro',null,null,'text','Bairro',false,true,true,11,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','address_city','Cidade',null,null,'text','Cidade',false,true,true,12,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','address_state','Estado',null,null,'text','Estado',false,true,true,13,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','sex','Sexo',null,null,'single_select',null,true,true,true,14,'{}','{}','{}'),
  -- Sessão 2: Identificação básica
  ('12000000-0000-0000-0000-000000000015','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','age','Idade',null,null,'number','Digite sua idade',true,true,true,1,'{"min":10,"max":120}','{}','{}'),
  -- Sessão 3: Queixas faciais
  ('12000000-0000-0000-0000-000000000016','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003','facial_concerns','(FACIAL) Assinale as opções em que você gostaria de melhorar em relação ao seu rosto',null,null,'multi_select',null,true,true,true,1,'{}','{"exclusiveOptions":["none"]}','{}'),
  ('12000000-0000-0000-0000-000000000017','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003','facial_concerns_other','Caso tenha marcado outros, descreva',null,null,'text','Digite',false,true,true,2,'{}','{}','{"dependsOn":"facial_concerns","operator":"includes","value":"other"}'),
  -- Sessão 4: Autoavaliação facial
  ('12000000-0000-0000-0000-000000000018','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000004','main_facial_discomfort','Das alterações faciais mencionadas acima, qual é a que mais te incomoda?',null,null,'single_select_dynamic',null,true,true,true,1,'{}','{"sourceFieldKey":"facial_concerns"}','{}'),
  ('12000000-0000-0000-0000-000000000019','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000004','facial_discomfort_score','Em uma escala de 0 a 10, qual é o nível de incômodo que as alterações faciais causam em você?','0 não impacta nada, 10 mexem com minha autoestima',null,'scale_select','Selecione',true,true,true,2,'{}','{"min":0,"max":10,"displayMode":"select"}','{}'),
  ('12000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000004','collagen_self_assessment','Observe a imagem acima e marque o número que mais se aproxima do seu rosto hoje',null,null,'single_select',null,true,true,true,3,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000004','nose_shape','Em relação à imagem 01, qual seria o formato do seu nariz?',null,null,'single_select',null,true,true,true,4,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000022','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000004','nose_base_shape','Agora em relação à imagem 02, qual seria o formato da base do seu nariz?',null,null,'single_select',null,true,true,true,5,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000023','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000004','nose_satisfaction_score','Em relação à autoavaliação do seu nariz, qual é o seu nível de satisfação de 0 a 10?','0 não gosto nada, 10 é perfeito',null,'scale_select','Selecione',true,true,true,6,'{}','{"min":0,"max":10,"displayMode":"select"}','{}'),
  -- Sessão 5: Queixas corporais
  ('12000000-0000-0000-0000-000000000024','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000005','body_concerns','(CORPORAL) Assinale as opções em que você gostaria de melhorar em relação ao seu corpo',null,null,'multi_select',null,true,true,true,1,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000025','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000005','body_concerns_other','Caso a resposta anterior seja OUTROS, cite quais',null,null,'text','Digite',false,true,true,2,'{}','{}','{"dependsOn":"body_concerns","operator":"includes","value":"other"}'),
  ('12000000-0000-0000-0000-000000000026','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000005','body_discomfort_score','Em uma escala de 0 a 10, qual é o nível de incômodo que as alterações corporais causam em você?','Zero não impactam em nada, 10 mexem com minha autoestima',null,'scale_select','Selecione',true,true,true,3,'{}','{"min":0,"max":10,"displayMode":"select"}','{}'),
  -- Sessão 6: Alergias
  ('12000000-0000-0000-0000-000000000027','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000006','allergies','Possui alergia?',null,null,'multi_select',null,true,true,true,1,'{}','{"exclusiveOptions":["no"]}','{}'),
  ('12000000-0000-0000-0000-000000000028','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000006','allergies_other','Caso a resposta anterior seja OUTROS, qual outro tipo de alergia?',null,null,'text','Digite',false,true,true,2,'{}','{}','{"dependsOn":"allergies","operator":"includes","value":"other"}'),
  -- Sessão 7: Histórico médico
  ('12000000-0000-0000-0000-000000000029','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000007','medical_follow_up','Está em acompanhamento médico atualmente?',null,null,'boolean',null,true,true,true,1,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000030','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000007','medical_follow_up_details','Se SIM, qual especialidade e diagnóstico?',null,null,'text','Digite',false,true,true,2,'{}','{}','{"dependsOn":"medical_follow_up","operator":"equals","value":true}'),
  ('12000000-0000-0000-0000-000000000031','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000007','previous_surgery','Já fez cirurgia?',null,null,'boolean',null,true,true,true,3,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000032','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000007','previous_surgery_details','Se SIM, qual tipo de cirurgia?',null,null,'text','Digite',false,true,true,4,'{}','{}','{"dependsOn":"previous_surgery","operator":"equals","value":true}'),
  ('12000000-0000-0000-0000-000000000033','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000007','continuous_medications','Utiliza medicamentos contínuos?',null,null,'boolean',null,true,true,true,5,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000034','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000007','continuous_medications_details','Se SIM, quais medicamentos?',null,null,'text','Digite',false,true,true,6,'{}','{}','{"dependsOn":"continuous_medications","operator":"equals","value":true}'),
  -- Sessão 8: Doenças e condições
  ('12000000-0000-0000-0000-000000000035','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000008','autoimmune_disease','Portador(a) de doenças autoimunes?',null,null,'boolean',null,true,true,true,1,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000036','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000008','autoimmune_disease_details','Se SIM, qual doença?',null,null,'text','Digite',false,true,true,2,'{}','{}','{"dependsOn":"autoimmune_disease","operator":"equals","value":true}'),
  ('12000000-0000-0000-0000-000000000037','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000008','herpes_history','Herpes labial/facial?',null,null,'boolean',null,true,true,true,3,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000038','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000008','herpes_frequency','Se SIM, com qual frequência?',null,null,'text','Digite',false,true,true,4,'{}','{}','{"dependsOn":"herpes_history","operator":"equals","value":true}'),
  ('12000000-0000-0000-0000-000000000039','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000008','heart_disease','Portador(a) de doença cardíaca?',null,null,'boolean',null,true,true,true,5,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000040','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000008','heart_disease_details','Se SIM, qual doença?',null,null,'text','Digite',false,true,true,6,'{}','{}','{"dependsOn":"heart_disease","operator":"equals","value":true}'),
  ('12000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000008','hormonal_or_thyroid_changes','Possui alterações hormonais ou na tireoide?',null,null,'boolean',null,true,true,true,7,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000042','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000008','valve_prosthesis_or_pacemaker','Possui prótese valvar ou marcapasso?',null,null,'boolean',null,true,true,true,8,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000043','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000008','diabetes_type','Possui diabetes?',null,null,'single_select',null,true,true,true,9,'{}','{}','{}'),
  -- Sessão 9: Gestação e hábitos
  ('12000000-0000-0000-0000-000000000044','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000009','pregnant','Gestante?',null,null,'boolean',null,true,true,true,1,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000045','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000009','pregnancy_weeks','Se SIM, quantas semanas de gestação?',null,null,'number','Digite',false,true,true,2,'{}','{}','{"dependsOn":"pregnant","operator":"equals","value":true}'),
  ('12000000-0000-0000-0000-000000000046','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000009','breastfeeding','Amamenta?',null,null,'boolean',null,true,true,true,3,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000047','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000009','smoker','Tabagista?',null,null,'boolean',null,true,true,true,4,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000048','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000009','sunscreen_daily','Utiliza filtro solar diariamente?',null,null,'boolean',null,true,true,true,5,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000049','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000009','physical_activity_regular','Realiza atividade física regular?',null,null,'boolean',null,true,true,true,6,'{}','{}','{}'),
  -- Sessão 10: Pele e patologias
  ('12000000-0000-0000-0000-000000000050','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000010','skin_pathologies','Possui patologias cutâneas?',null,null,'multi_select',null,true,true,true,1,'{}','{"exclusiveOptions":["none"]}','{}'),
  ('12000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000010','pigmentation_changes','Alterações pigmentares cutâneas?',null,null,'multi_select',null,true,true,true,2,'{}','{"exclusiveOptions":["none"]}','{}'),
  -- Sessão 11: Histórico estético
  ('12000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000011','injectable_history','Realizou procedimentos estéticos injetáveis anteriormente?',null,null,'multi_select',null,true,true,true,1,'{}','{"exclusiveOptions":["never"]}','{}'),
  ('12000000-0000-0000-0000-000000000053','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000011','injectable_history_other','Se SIM, quais?',null,null,'text','Digite',false,true,true,2,'{}','{}','{"dependsOn":"injectable_history","operator":"includes","value":"other"}'),
  ('12000000-0000-0000-0000-000000000054','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000011','technology_history','Realizou procedimentos estéticos com tecnologias anteriormente?',null,null,'multi_select',null,true,true,true,3,'{}','{"exclusiveOptions":["never"]}','{}'),
  ('12000000-0000-0000-0000-000000000055','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000011','technology_history_other','Se SIM, quais?',null,null,'text','Digite',false,true,true,4,'{}','{}','{"dependsOn":"technology_history","operator":"includes","value":"other"}'),
  ('12000000-0000-0000-0000-000000000056','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000011','previous_adverse_reaction','Teve alguma intercorrência/reação adversa?',null,null,'boolean',null,true,true,true,5,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000057','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000011','previous_adverse_reaction_details','Se SIM, quais?',null,null,'text','Digite',false,true,true,6,'{}','{}','{"dependsOn":"previous_adverse_reaction","operator":"equals","value":true}'),
  -- Sessão 12: Avaliação corporal
  ('12000000-0000-0000-0000-000000000058','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000012','localized_fat','Possui gordura localizada?',null,null,'boolean',null,true,true,true,1,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000059','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000012','localized_fat_region','Se SIM, em qual região?',null,null,'text','Digite',false,true,true,2,'{}','{}','{"dependsOn":"localized_fat","operator":"equals","value":true}'),
  ('12000000-0000-0000-0000-000000000060','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000012','flaccidity_specific_areas','Possui flacidez em áreas específicas?',null,null,'boolean',null,true,true,true,3,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000061','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000012','flaccidity_region','Se SIM, em qual região?',null,null,'text','Digite',false,true,true,4,'{}','{}','{"dependsOn":"flaccidity_specific_areas","operator":"equals","value":true}'),
  ('12000000-0000-0000-0000-000000000062','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000012','visible_cellulite','Possui celulites visíveis?',null,null,'boolean',null,true,true,true,5,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000063','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000012','cellulite_region','Se SIM, em qual região?',null,null,'text','Digite',false,true,true,6,'{}','{}','{"dependsOn":"visible_cellulite","operator":"equals","value":true}'),
  ('12000000-0000-0000-0000-000000000064','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000012','visible_stretch_marks','Possui estrias aparentes?',null,null,'boolean',null,true,true,true,7,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000065','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000012','stretch_marks_region','Se SIM, em qual região?',null,null,'text','Digite',false,true,true,8,'{}','{}','{"dependsOn":"visible_stretch_marks","operator":"equals","value":true}'),
  ('12000000-0000-0000-0000-000000000066','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000012','loss_of_elasticity','Perda de elasticidade após emagrecimento/gestação?',null,null,'boolean',null,true,true,true,9,'{}','{}','{}'),
  ('12000000-0000-0000-0000-000000000067','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000012','loss_of_elasticity_region','Se SIM, em qual região?',null,null,'text','Digite',false,true,true,10,'{}','{}','{"dependsOn":"loss_of_elasticity","operator":"equals","value":true}'),
  -- Sessão 13: Observações
  ('12000000-0000-0000-0000-000000000068','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000013','general_notes','Alguma observação relevante?',null,null,'rich_text',null,false,true,true,1,'{}','{}','{}')
on conflict do nothing;

insert into public.anamnesis_field_options (field_id, label, value, order_index) values
  -- sex
  ('12000000-0000-0000-0000-000000000014','Masculino','male',1),
  ('12000000-0000-0000-0000-000000000014','Feminino','female',2),
  ('12000000-0000-0000-0000-000000000014','Outro','other',3),
  ('12000000-0000-0000-0000-000000000014','Não informado','not_informed',4),
  -- facial_concerns
  ('12000000-0000-0000-0000-000000000016','Rugas na testa','rugas_testa',1),
  ('12000000-0000-0000-0000-000000000016','Pé de galinha','pe_galinha',2),
  ('12000000-0000-0000-0000-000000000016','Olheiras','olheiras',3),
  ('12000000-0000-0000-0000-000000000016','Bigode chinês','bigode_chines',4),
  ('12000000-0000-0000-0000-000000000016','Nariz (ponta caída)','nariz_ponta_caida',5),
  ('12000000-0000-0000-0000-000000000016','Código de barras','codigo_barras',6),
  ('12000000-0000-0000-0000-000000000016','Lábios desidratados ou com perda de volume','labios_desidratados',7),
  ('12000000-0000-0000-0000-000000000016','Flacidez facial','flacidez_facial',8),
  ('12000000-0000-0000-0000-000000000016','Flacidez de pálpebras','flacidez_palpebras',9),
  ('12000000-0000-0000-0000-000000000016','Flacidez na papada','flacidez_papada',10),
  ('12000000-0000-0000-0000-000000000016','Poros','poros',11),
  ('12000000-0000-0000-0000-000000000016','Cicatrizes de acne','cicatrizes_acne',12),
  ('12000000-0000-0000-0000-000000000016','Pele opaca','pele_opaca',13),
  ('12000000-0000-0000-0000-000000000016','Outros','other',14),
  ('12000000-0000-0000-0000-000000000016','Nenhuma','none',15),
  -- collagen_self_assessment
  ('12000000-0000-0000-0000-000000000020','1 – Perda leve de colágeno (até -5%)','1',1),
  ('12000000-0000-0000-0000-000000000020','2 – Perda inicial (-15%)','2',2),
  ('12000000-0000-0000-0000-000000000020','3 – Perda moderada (-30%)','3',3),
  ('12000000-0000-0000-0000-000000000020','4 – Perda avançada (-50%)','4',4),
  -- nose_shape
  ('12000000-0000-0000-0000-000000000021','Reto','reto',1),
  ('12000000-0000-0000-0000-000000000021','Convexo','convexo',2),
  ('12000000-0000-0000-0000-000000000021','Côncavo','concavo',3),
  ('12000000-0000-0000-0000-000000000021','Formato de onda','onda',4),
  -- nose_base_shape
  ('12000000-0000-0000-0000-000000000022','Reto','reto',1),
  ('12000000-0000-0000-0000-000000000022','Levantado','levantado',2),
  ('12000000-0000-0000-0000-000000000022','Rebaixado','rebaixado',3),
  -- body_concerns
  ('12000000-0000-0000-0000-000000000024','Gordura localizada','gordura_localizada',1),
  ('12000000-0000-0000-0000-000000000024','Flacidez','flacidez',2),
  ('12000000-0000-0000-0000-000000000024','Celulites','celulites',3),
  ('12000000-0000-0000-0000-000000000024','Estrias','estrias',4),
  ('12000000-0000-0000-0000-000000000024','Lipedema','lipedema',5),
  ('12000000-0000-0000-0000-000000000024','Íntimo','intimo',6),
  ('12000000-0000-0000-0000-000000000024','Queda capilar / cabelo enfraquecido','queda_capilar',7),
  ('12000000-0000-0000-0000-000000000024','Ronco / apneia','ronco_apneia',8),
  ('12000000-0000-0000-0000-000000000024','Outros','other',9),
  -- allergies
  ('12000000-0000-0000-0000-000000000027','Não','no',1),
  ('12000000-0000-0000-0000-000000000027','Antibióticos','antibioticos',2),
  ('12000000-0000-0000-0000-000000000027','Analgésicos','analgesicos',3),
  ('12000000-0000-0000-0000-000000000027','Esteroides','esteroides',4),
  ('12000000-0000-0000-0000-000000000027','Alimentos','alimentos',5),
  ('12000000-0000-0000-0000-000000000027','Cosméticos','cosmeticos',6),
  ('12000000-0000-0000-0000-000000000027','Outros','other',7),
  -- diabetes_type
  ('12000000-0000-0000-0000-000000000043','Não','no',1),
  ('12000000-0000-0000-0000-000000000043','Sim, tipo 1','type_1',2),
  ('12000000-0000-0000-0000-000000000043','Sim, tipo 2','type_2',3),
  -- skin_pathologies
  ('12000000-0000-0000-0000-000000000050','Psoríase','psoriase',1),
  ('12000000-0000-0000-0000-000000000050','Vitiligo','vitiligo',2),
  ('12000000-0000-0000-0000-000000000050','Lúpus','lupus',3),
  ('12000000-0000-0000-0000-000000000050','Rosácea','rosacea',4),
  ('12000000-0000-0000-0000-000000000050','Nenhuma','none',5),
  -- pigmentation_changes
  ('12000000-0000-0000-0000-000000000051','Sardas','sardas',1),
  ('12000000-0000-0000-0000-000000000051','Manchas senis','manchas_senis',2),
  ('12000000-0000-0000-0000-000000000051','Melasma','melasma',3),
  ('12000000-0000-0000-0000-000000000051','Manchas por sequela de cicatriz','manchas_cicatriz',4),
  ('12000000-0000-0000-0000-000000000051','Nenhuma','none',5),
  -- injectable_history
  ('12000000-0000-0000-0000-000000000052','Não, nunca fiz','never',1),
  ('12000000-0000-0000-0000-000000000052','Botox','botox',2),
  ('12000000-0000-0000-0000-000000000052','Preenchimento','preenchimento',3),
  ('12000000-0000-0000-0000-000000000052','Bioestimulador de colágeno','bioestimulador',4),
  ('12000000-0000-0000-0000-000000000052','Outros','other',5),
  -- technology_history
  ('12000000-0000-0000-0000-000000000054','Não, nunca fiz','never',1),
  ('12000000-0000-0000-0000-000000000054','Fotona','fotona',2),
  ('12000000-0000-0000-0000-000000000054','Lavieen','lavieen',3),
  ('12000000-0000-0000-0000-000000000054','Ultraformer','ultraformer',4),
  ('12000000-0000-0000-0000-000000000054','Criolipólise','criolipolise',5),
  ('12000000-0000-0000-0000-000000000054','Outros','other',6)
on conflict do nothing;
