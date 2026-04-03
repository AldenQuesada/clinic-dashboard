# Schema — Módulo de Anamnese Digital

Referência rápida das tabelas, colunas-chave e relações do módulo de ficha de anamnese.
Gerado a partir das migrations em `supabase/migrations/`.

## Tabelas

### `anamnesis_templates`
Template reutilizável de ficha de anamnese (criado pelo gestor da clínica).

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | |
| `clinic_id` | uuid FK → `clinics` | Isolamento por clínica |
| `name` | text | |
| `category` | enum | `general`, `facial`, `body`, `capillary`, `epilation`, `custom` |
| `is_active` | bool | Soft-disable |
| `deleted_at` | timestamptz | Soft-delete |
| `created_at` / `updated_at` | timestamptz | |

### `anamnesis_template_sessions`
Sessões (seções/abas) dentro de um template.

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | |
| `template_id` | uuid FK → `anamnesis_templates` | |
| `clinic_id` | uuid FK → `clinics` | |
| `title` | text | Título exibido ao paciente |
| `order_index` | int | NULL para registros soft-deleted |
| `is_active` | bool | |
| `deleted_at` | timestamptz | |

### `anamnesis_fields`
Campos individuais dentro de uma sessão.

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | |
| `session_id` | uuid FK → `anamnesis_template_sessions` | |
| `clinic_id` | uuid FK → `clinics` | |
| `field_key` | text | Identificador semântico (ex: `fumante`) |
| `label` | text | Texto exibido ao paciente |
| `field_type` | enum | Ver `FIELD_TYPES` em `js/anamnese-types.js` |
| `is_required` | bool | |
| `order_index` | int | NULL para registros soft-deleted |
| `settings_json` | jsonb | Configurações específicas do tipo |
| `conditional_rules_json` | jsonb | `{ dependsOn, operator, value }` |
| `deleted_at` | timestamptz | Soft-delete (preserva respostas) |
| `is_active` | bool | |

**`settings_json` por tipo:**
- `number` + `display: scale_select` → `{ min, max, step, labels }`
- `description_text` + `display: image_pair` → `{ images: [{url, title}], inverted }`
- `multi_select` + `display: radio_select` → seleção única via radio buttons
- `multi_select` + `display: single_select` → dropdown de seleção única

### `anamnesis_field_options`
Opções para campos de seleção (`single_select`, `multi_select`, etc.).

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | |
| `field_id` | uuid FK → `anamnesis_fields` | |
| `clinic_id` | uuid FK → `clinics` | |
| `label` | text | Texto da opção |
| `value` | text | Valor persistido |
| `order_index` | int | |
| `is_active` | bool | |

### `anamnesis_requests`
Solicitação de preenchimento enviada a um paciente.

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | |
| `clinic_id` | uuid FK → `clinics` | |
| `patient_id` | uuid FK → `patients` | |
| `template_id` | uuid FK → `anamnesis_templates` | |
| `public_slug` | text UNIQUE | Identificador público (sem auth) |
| `token_hash` | text | SHA-256 do raw token (token nunca é armazenado) |
| `expires_at` | timestamptz | Default: +30 dias via RPC |
| `status` | enum | `pending`, `in_progress`, `completed`, `expired`, etc. |
| `template_snapshot_json` | jsonb | Snapshot imutável do template no momento da criação |
| `deleted_at` | timestamptz | |

**Nota de segurança:** o `raw_token` é retornado pelo RPC `create_anamnesis_request`
uma única vez e armazenado em `sessionStorage` pelo admin. O banco nunca armazena o token
em texto claro — somente o hash. O link usa o token no fragment `#token=...` para evitar
vazamento via Referer ou logs de servidor.

### `anamnesis_responses`
Instância de resposta do paciente a um request.

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | |
| `request_id` | uuid FK → `anamnesis_requests` | |
| `clinic_id` | uuid FK → `clinics` | |
| `patient_id` | uuid FK → `patients` | |
| `status` | enum | `not_started`, `in_progress`, `completed`, etc. |
| `progress_percent` | int | 0–100, calculado excluindo campos ocultos |
| `current_session_id` | uuid | Última sessão salva |
| `completed_at` | timestamptz | |

### `anamnesis_answers`
Respostas individuais por campo.

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | |
| `response_id` | uuid FK → `anamnesis_responses` | |
| `clinic_id` | uuid FK → `clinics` | Para RLS e auditoria |
| `field_id` | uuid FK → `anamnesis_fields` | |
| `field_key` | text | Cópia desnormalizada do field_key |
| `value_json` | jsonb | Valor da resposta |
| `normalized_text` | text | Texto normalizado para busca (CPF/RG mascarado como `[REDACTED]`) |

**Unique constraint:** `(response_id, field_id)` — suporta upsert de respostas parciais.

## RPCs (Supabase Functions)

| RPC | Descrição |
|-----|-----------|
| `create_anamnesis_request(p_clinic_id, p_patient_id, p_template_id, p_expires_at?)` | Cria request com slug único, token SHA-256 e snapshot completo do template |
| `complete_anamnesis_form(p_response_id, p_request_id, p_patient_id, p_clinic_id, ...)` | RPC atômico: fecha response + request + atualiza patient (incl. sex/rg/birth_date/address) |
| `validate_anamnesis_token(p_public_slug, p_raw_token)` | Valida token com rate limiting (10 falhas/15min → rate_limited) |
| `reorder_anamnesis_sessions(p_template_id, p_ids)` | Reordena sessões atomicamente |
| `reorder_anamnesis_fields(p_session_id, p_ids)` | Reordena campos atomicamente |
| `reorder_anamnesis_field_options(p_field_id, p_ids)` | Reordena opções atomicamente |

## Diagrama de Relações

```
clinics
  └── anamnesis_templates (clinic_id)
        └── anamnesis_template_sessions (template_id, clinic_id)
              └── anamnesis_fields (session_id, clinic_id)
                    └── anamnesis_field_options (field_id, clinic_id)

patients
  └── anamnesis_requests (patient_id, template_id, clinic_id)
        └── anamnesis_responses (request_id, patient_id, clinic_id)
              └── anamnesis_answers (response_id, field_id, clinic_id)
```

## Migrations

| Arquivo | Conteúdo |
|---------|----------|
| `20260328000000_anamnesis_module.sql` | Schema inicial — 12 tabelas, enums, RLS base |
| `20260329000000_anamnesis_rls_fix.sql` | Fix RLS para role anon, CPF nullable |
| `20260330000000_anamnesis_sprint1_hardening.sql` | RLS com escopo de clínica |
| `20260331000000_anamnesis_sprint2_quality.sql` | Soft-delete, indexes de performance |
| `20260332000000_anamnesis_sprint3_robustness.sql` | Unique indexes parciais |
| `20260333000000_anamnesis_sprint4_experience.sql` | RLS com subqueries em tabelas filhas |
| `20260400000000_anamnesis_rls_parent_audit.sql` | Limpeza de políticas |
| `20260401000000_anamnesis_reorder_rpc.sql` | 3 RPCs atômicos de reordenação |
| `20260402000000_anamnesis_hardening_p1.sql` | P1: slug index, clinic_id em answers, snapshot, GIN, tombstone fix |
| `20260403000000_anamnesis_hardening_p2.sql` | P2: complete_anamnesis_form atômico, validate_anamnesis_token granular, rate_failures |
| `20260404000000_anamnesis_final_sprint.sql` | Sprint Final: patients (sex/rg/birth_date/address), rate limiting real, unsafe-inline removido |
