-- ═══════════════════════════════════════════════════════════════════════════
--  ClinicAI — Sprint Final: Blindagem Total
--  Migration: 20260404000000_anamnesis_final_sprint.sql
--
--  1. patients — novas colunas (sex, rg, birth_date, address_json)
--  2. complete_anamnesis_form — salva sex/rg/birth_date/address
--  3. validate_anamnesis_token — rate limiting real (bloqueio após 10 falhas/15min)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Novas colunas em patients ─────────────────────────────────────────────
-- Migra dados que estavam dispersos em clinic_data.clinicai_leads para
-- colunas de primeira classe na tabela patients.
DO $$ BEGIN
  ALTER TABLE public.patients ADD COLUMN sex          text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.patients ADD COLUMN rg           text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.patients ADD COLUMN birth_date   date;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.patients ADD COLUMN address_json jsonb;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

COMMENT ON COLUMN public.patients.sex          IS 'Sexo biológico (Masculino/Feminino)';
COMMENT ON COLUMN public.patients.rg           IS 'RG mascarado (dígitos + X)';
COMMENT ON COLUMN public.patients.birth_date   IS 'Data de nascimento';
COMMENT ON COLUMN public.patients.address_json IS 'Endereço completo: {cep, logradouro, numero, complemento, bairro, cidade, estado, pais}';

-- ── 2. complete_anamnesis_form — aceita e persiste novos campos de paciente ──
-- Adiciona p_patient_sex, p_patient_rg, p_patient_birth_date, p_patient_address
-- ao RPC atômico de conclusão. Elimina dependência de clinic_data no frontend.
CREATE OR REPLACE FUNCTION public.complete_anamnesis_form(
  p_response_id          uuid,
  p_request_id           uuid,
  p_patient_id           uuid,
  p_clinic_id            uuid,
  p_patient_first_name   text    DEFAULT NULL,
  p_patient_last_name    text    DEFAULT NULL,
  p_patient_phone        text    DEFAULT NULL,
  p_patient_cpf          text    DEFAULT NULL,
  p_patient_sex          text    DEFAULT NULL,
  p_patient_rg           text    DEFAULT NULL,
  p_patient_birth_date   date    DEFAULT NULL,
  p_patient_address      jsonb   DEFAULT NULL,
  p_final_answers        jsonb   DEFAULT NULL  -- [{field_id, field_key, value_json, normalized_text}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now    timestamptz := NOW();
  v_answer jsonb;
BEGIN
  -- ── 1a. Upsert das respostas finais (sessão atual, se houver) ──────────────
  IF p_final_answers IS NOT NULL AND jsonb_array_length(p_final_answers) > 0 THEN
    FOR v_answer IN SELECT * FROM jsonb_array_elements(p_final_answers)
    LOOP
      INSERT INTO anamnesis_answers (
        response_id, clinic_id, field_id, field_key, value_json, normalized_text
      ) VALUES (
        p_response_id,
        p_clinic_id,
        (v_answer->>'field_id')::uuid,
        v_answer->>'field_key',
        v_answer->'value_json',
        COALESCE(v_answer->>'normalized_text', '')
      )
      ON CONFLICT (response_id, field_id) DO UPDATE SET
        value_json      = EXCLUDED.value_json,
        normalized_text = EXCLUDED.normalized_text,
        updated_at      = v_now;
    END LOOP;
  END IF;

  -- ── 1b. Marca response como completed ──────────────────────────────────────
  UPDATE anamnesis_responses
  SET    status           = 'completed',
         completed_at     = v_now,
         progress_percent = 100,
         updated_at       = v_now
  WHERE  id        = p_response_id
    AND  clinic_id = p_clinic_id;

  -- ── 1c. Marca request como completed ───────────────────────────────────────
  UPDATE anamnesis_requests
  SET    status       = 'completed',
         completed_at = v_now,
         updated_at   = v_now
  WHERE  id        = p_request_id
    AND  clinic_id = p_clinic_id;

  -- ── 1d. Atualiza dados do paciente (apenas campos fornecidos) ───────────────
  -- Agora inclui sex, rg, birth_date e address_json — elimina clinic_data.
  IF p_patient_first_name  IS NOT NULL OR p_patient_last_name IS NOT NULL
     OR p_patient_phone    IS NOT NULL OR p_patient_cpf       IS NOT NULL
     OR p_patient_sex      IS NOT NULL OR p_patient_rg        IS NOT NULL
     OR p_patient_birth_date IS NOT NULL OR p_patient_address IS NOT NULL
  THEN
    UPDATE patients
    SET    first_name   = COALESCE(p_patient_first_name,  first_name),
           last_name    = COALESCE(p_patient_last_name,   last_name),
           phone        = COALESCE(p_patient_phone,        phone),
           cpf          = COALESCE(p_patient_cpf,          cpf),
           sex          = COALESCE(p_patient_sex,           sex),
           rg           = COALESCE(p_patient_rg,            rg),
           birth_date   = COALESCE(p_patient_birth_date,   birth_date),
           address_json = COALESCE(p_patient_address,       address_json),
           updated_at   = v_now
    WHERE  id         = p_patient_id
      AND  clinic_id  = p_clinic_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'completed_at', v_now);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_anamnesis_form(
  uuid, uuid, uuid, uuid,
  text, text, text, text,
  text, text, date, jsonb,
  jsonb
) TO anon;

-- ── 3. validate_anamnesis_token — rate limiting com bloqueio real ────────────
-- Registra cada tentativa inválida em anamnesis_token_failures.
-- Bloqueia automaticamente se > 10 tentativas inválidas para o mesmo slug nos
-- últimos 15 minutos, retornando error_code = 'rate_limited'.
-- O bloqueio é por slug (não por IP) para funcionar sem logs de IP em GDPR/LGPD.
CREATE OR REPLACE FUNCTION public.validate_anamnesis_token(
  p_public_slug text,
  p_raw_token   text
)
RETURNS TABLE (
  request_id             uuid,
  clinic_id              uuid,
  patient_id             uuid,
  template_id            uuid,
  status                 public.anamnesis_request_status_enum,
  expires_at             timestamptz,
  template_snapshot_json jsonb,
  error_code             text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_hash  text;
  v_req         record;
  v_fail_count  bigint;
BEGIN
  -- ── Rate limiting ──────────────────────────────────────────────────────────
  -- Bloqueia antes de qualquer operação criptográfica para não desperdiçar CPU.
  SELECT COUNT(*) INTO v_fail_count
  FROM   public.anamnesis_token_failures
  WHERE  slug      = p_public_slug
    AND  failed_at > NOW() - INTERVAL '15 minutes';

  IF v_fail_count >= 10 THEN
    RETURN QUERY SELECT
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::public.anamnesis_request_status_enum,
      NULL::timestamptz,
      NULL::jsonb,
      'rate_limited'::text;
    RETURN;
  END IF;

  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  -- Busca o request por slug + token hash (sem filtro de estado)
  SELECT r.id, r.clinic_id, r.patient_id, r.template_id, r.status,
         r.expires_at, r.revoked_at, r.template_snapshot_json
  INTO   v_req
  FROM   public.anamnesis_requests r
  WHERE  r.public_slug = p_public_slug
    AND  r.token_hash  = v_token_hash
    AND  r.deleted_at  IS NULL
  LIMIT  1;

  IF NOT FOUND THEN
    -- Registra falha: slug existe (ou não) mas token é incorreto.
    -- A inserção acontece com SECURITY DEFINER, contornando RLS.
    INSERT INTO public.anamnesis_token_failures (slug, ip_hash, failed_at)
    VALUES (p_public_slug, NULL, NOW());
    RETURN;  -- 0 linhas → frontend exibe "Link inválido"
  END IF;

  -- ── Link revogado/cancelado ────────────────────────────────────────────────
  IF v_req.revoked_at IS NOT NULL
     OR v_req.status IN ('revoked', 'cancelled')
  THEN
    RETURN QUERY SELECT
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid,
      v_req.status, v_req.expires_at, NULL::jsonb,
      'revoked'::text;
    RETURN;
  END IF;

  -- ── Link expirado ──────────────────────────────────────────────────────────
  IF v_req.expires_at IS NOT NULL AND v_req.expires_at <= NOW() THEN
    RETURN QUERY SELECT
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid,
      v_req.status, v_req.expires_at, NULL::jsonb,
      'expired'::text;
    RETURN;
  END IF;

  -- ── Ficha já concluída ─────────────────────────────────────────────────────
  IF v_req.status = 'completed' THEN
    RETURN QUERY SELECT
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid,
      v_req.status, v_req.expires_at, NULL::jsonb,
      'completed'::text;
    RETURN;
  END IF;

  -- ── Caso válido — retorna todos os dados ───────────────────────────────────
  -- Token válido e link ativo: remove falhas pendentes para este slug
  -- (sucesso após backoff — não penaliza o paciente que esperou).
  DELETE FROM public.anamnesis_token_failures
  WHERE  slug     = p_public_slug
    AND  failed_at > NOW() - INTERVAL '15 minutes';

  RETURN QUERY SELECT
    v_req.id,
    v_req.clinic_id,
    v_req.patient_id,
    v_req.template_id,
    v_req.status,
    v_req.expires_at,
    v_req.template_snapshot_json,
    NULL::text;  -- error_code = NULL → válido
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_anamnesis_token(text, text) TO anon, authenticated;

-- ── 4. SCHEMA.md tracking ─────────────────────────────────────────────────────
-- Atualizar SCHEMA.md manualmente após aplicar esta migration:
--   • patients: sex, rg, birth_date, address_json
--   • complete_anamnesis_form: novos params sex/rg/birth_date/address
--   • validate_anamnesis_token: rate limiting 10 falhas/15min
