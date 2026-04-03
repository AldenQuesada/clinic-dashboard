-- Migration: anamnesis_hardening_p1
-- Correções P1 identificadas na revisão técnica (Staff Engineer review)
-- 1. Index em public_slug (busca por link do paciente)
-- 2. clinic_id em anamnesis_answers (RLS + auditoria multi-tenant)
-- 3. snapshot_json em anamnesis_requests (versionamento de template)
-- 4. GIN index em normalized_text (busca full-text)
-- 5. Default 30 dias no RPC create_anamnesis_request
-- 6. Tombstone order_index → NULL após soft-delete

-- ── 1. Index em public_slug ──────────────────────────────────────────────────
-- Toda abertura de form-render.html busca por este campo; sem index é seq-scan.
CREATE UNIQUE INDEX IF NOT EXISTS anamnesis_requests_public_slug_idx
  ON anamnesis_requests (public_slug)
  WHERE deleted_at IS NULL;

-- ── 2. clinic_id em anamnesis_answers ────────────────────────────────────────
-- Necessário para RLS multi-tenant e auditoria por clínica.
ALTER TABLE anamnesis_answers
  ADD COLUMN IF NOT EXISTS clinic_id uuid
    REFERENCES clinics(id) ON DELETE CASCADE;

-- Popula clinic_id para registros existentes via JOIN na cadeia de FKs
UPDATE anamnesis_answers aa
SET    clinic_id = r.clinic_id
FROM   anamnesis_responses ar
JOIN   anamnesis_requests  r ON r.id = ar.request_id
WHERE  aa.response_id = ar.id
  AND  aa.clinic_id IS NULL;

-- Torna obrigatório somente após backfill
ALTER TABLE anamnesis_answers
  ALTER COLUMN clinic_id SET NOT NULL;

-- Index para queries por clínica
CREATE INDEX IF NOT EXISTS anamnesis_answers_clinic_id_idx
  ON anamnesis_answers (clinic_id);

-- RLS: anon pode inserir somente para a própria clínica do request autenticado
-- (A RLS de anamnesis_answers já existe via response_id; este índice apoia futura política)

-- ── 3. snapshot_json em anamnesis_requests ────────────────────────────────────
-- Congela o template no momento da criação do request para auditoria clínica.
ALTER TABLE anamnesis_requests
  ADD COLUMN IF NOT EXISTS template_snapshot_json jsonb;

COMMENT ON COLUMN anamnesis_requests.template_snapshot_json IS
  'Snapshot do template (sessões + campos) no momento da criação do request. '
  'Garante que a ficha histórica não mude se o template for editado posteriormente.';

-- ── 4. GIN index em normalized_text ──────────────────────────────────────────
-- Habilita busca full-text eficiente por respostas de pacientes.
CREATE INDEX IF NOT EXISTS anamnesis_answers_normalized_text_gin_idx
  ON anamnesis_answers USING GIN (to_tsvector('portuguese', normalized_text))
  WHERE normalized_text IS NOT NULL AND normalized_text != '[REDACTED]';

-- ── 5. Default 30 dias no RPC create_anamnesis_request ───────────────────────
-- Garante que links sem data de expiração explícita expirem em 30 dias.
-- O frontend já passa o default; esta constraint é a segunda camada de defesa.
CREATE OR REPLACE FUNCTION create_anamnesis_request(
  p_clinic_id   uuid,
  p_patient_id  uuid,
  p_template_id uuid,
  p_expires_at  timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  public_slug text,
  raw_token   text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id               uuid := gen_random_uuid();
  v_slug             text;
  v_raw_token        text;
  v_token_hash       text;
  v_expires_at       timestamptz;
  v_template_snapshot jsonb;
BEGIN
  -- Default: 30 dias a partir de agora
  v_expires_at := COALESCE(p_expires_at, NOW() + INTERVAL '30 days');

  -- Gera slug único (8 chars base36)
  LOOP
    v_slug := lower(substring(replace(gen_random_uuid()::text, '-', '') FOR 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM anamnesis_requests WHERE public_slug = v_slug
    );
  END LOOP;

  -- Gera token seguro e armazena hash SHA-256
  v_raw_token  := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

  -- Snapshot do template (sessões + campos ativos) para auditoria clínica imutável
  SELECT jsonb_build_object(
    'template_id',   t.id,
    'template_name', t.name,
    'captured_at',   NOW(),
    'sessions',      COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',          s.id,
          'title',       s.title,
          'order_index', s.order_index,
          'fields',      COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id',         f.id,
                'field_key',  f.field_key,
                'label',      f.label,
                'field_type', f.field_type,
                'is_required',f.is_required,
                'order_index',f.order_index
              ) ORDER BY f.order_index
            )
            FROM anamnesis_fields f
            WHERE f.session_id = s.id AND f.is_active AND f.deleted_at IS NULL
          ), '[]'::jsonb)
        ) ORDER BY s.order_index
      )
      FROM anamnesis_template_sessions s
      WHERE s.template_id = t.id AND s.is_active AND s.deleted_at IS NULL
    ), '[]'::jsonb)
  )
  INTO v_template_snapshot
  FROM anamnesis_templates t
  WHERE t.id = p_template_id;

  INSERT INTO anamnesis_requests (
    id, clinic_id, patient_id, template_id,
    public_slug, token_hash, expires_at, status, template_snapshot_json
  ) VALUES (
    v_id, p_clinic_id, p_patient_id, p_template_id,
    v_slug, v_token_hash, v_expires_at, 'pending', v_template_snapshot
  );

  RETURN QUERY SELECT v_id, v_slug, v_raw_token;
END;
$$;

-- ── 6. Tombstone order_index → NULL ──────────────────────────────────────────
-- Campos soft-deleted com order_index = 800000+ poluem queries de ordenação.
-- Após soft-delete, order_index deve ser NULL.
UPDATE anamnesis_fields
SET    order_index = NULL
WHERE  deleted_at IS NOT NULL
  AND  order_index >= 800000;

UPDATE anamnesis_template_sessions
SET    order_index = NULL
WHERE  deleted_at IS NOT NULL
  AND  order_index >= 800000;

-- Garante que futuros soft-deletes não criem tombstones com order_index alto
-- (tratado no application code — este check é documentação da intenção)
COMMENT ON COLUMN anamnesis_fields.order_index IS
  'Ordem do campo na sessão. NULL para campos soft-deleted (deleted_at IS NOT NULL).';
