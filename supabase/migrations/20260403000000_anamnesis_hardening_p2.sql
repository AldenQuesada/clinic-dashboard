-- ═══════════════════════════════════════════════════════════════════════════
--  ClinicAI — Hardening P2: Atomicidade, Snapshot Completo, Segurança Pública
--  Migration: 20260403000000_anamnesis_hardening_p2.sql
--
--  1. complete_anamnesis_form — RPC transacional para conclusão da ficha
--  2. validate_anamnesis_token — error_code granular + snapshot no retorno
--  3. create_anamnesis_request — snapshot completo (settings + options)
--  4. anamnesis_token_failures — rate limiting por IP/slug
--  5. anamnesis_answers — RLS direta via clinic_id (elimina JOIN longo)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. complete_anamnesis_form — conclusão atômica ───────────────────────────
-- Substitui a sequência de 3 PATCHes independentes (response + request + patient)
-- por uma única transação PL/pgSQL, eliminando estados parciais.
CREATE OR REPLACE FUNCTION public.complete_anamnesis_form(
  p_response_id        uuid,
  p_request_id         uuid,
  p_patient_id         uuid,
  p_clinic_id          uuid,
  p_patient_first_name text    DEFAULT NULL,
  p_patient_last_name  text    DEFAULT NULL,
  p_patient_phone      text    DEFAULT NULL,
  p_patient_cpf        text    DEFAULT NULL,
  p_final_answers      jsonb   DEFAULT NULL  -- [{field_id, field_key, value_json, normalized_text}]
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
  -- Idempotente: usa ON CONFLICT (response_id, field_id) para não duplicar.
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
  IF p_patient_first_name IS NOT NULL OR p_patient_last_name IS NOT NULL
     OR p_patient_phone IS NOT NULL OR p_patient_cpf IS NOT NULL
  THEN
    UPDATE patients
    SET    first_name  = COALESCE(p_patient_first_name, first_name),
           last_name   = COALESCE(p_patient_last_name,  last_name),
           phone       = COALESCE(p_patient_phone,       phone),
           cpf         = COALESCE(p_patient_cpf,         cpf),
           updated_at  = v_now
    WHERE  id         = p_patient_id
      AND  clinic_id  = p_clinic_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'completed_at', v_now);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_anamnesis_form(
  uuid, uuid, uuid, uuid, text, text, text, text, jsonb
) TO anon;

-- ── 2. validate_anamnesis_token — error_code granular + snapshot ─────────────
-- Anteriormente: filtrava expired/revoked no WHERE → frontend recebia 0 linhas
-- e exibia "Link inválido" para todos os casos de rejeição.
-- Agora: retorna o motivo específico (expired/revoked/completed) sem expor
-- dados sensíveis (patient_id, template_id ficam NULL em casos de erro).
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
  error_code             text   -- NULL → válido; 'expired' | 'revoked' | 'completed'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_hash text;
  v_req        record;
BEGIN
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
    -- Slug ou token incorretos: retorna 0 linhas (não expõe nenhum dado)
    RETURN;
  END IF;

  -- ── Caso: link revogado/cancelado ─────────────────────────────────────────
  IF v_req.revoked_at IS NOT NULL
     OR v_req.status IN ('revoked', 'cancelled')
  THEN
    -- Retorna status sem dados sensíveis (PII protegida)
    RETURN QUERY SELECT
      NULL::uuid,          -- request_id oculto
      NULL::uuid,          -- clinic_id oculto
      NULL::uuid,          -- patient_id oculto
      NULL::uuid,          -- template_id oculto
      v_req.status,
      v_req.expires_at,
      NULL::jsonb,         -- snapshot oculto
      'revoked'::text;
    RETURN;
  END IF;

  -- ── Caso: link expirado ────────────────────────────────────────────────────
  IF v_req.expires_at IS NOT NULL AND v_req.expires_at <= NOW() THEN
    RETURN QUERY SELECT
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid,
      v_req.status,
      v_req.expires_at,
      NULL::jsonb,
      'expired'::text;
    RETURN;
  END IF;

  -- ── Caso: ficha já concluída ───────────────────────────────────────────────
  IF v_req.status = 'completed' THEN
    RETURN QUERY SELECT
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid,
      v_req.status,
      v_req.expires_at,
      NULL::jsonb,
      'completed'::text;
    RETURN;
  END IF;

  -- ── Caso válido: retorna todos os dados ───────────────────────────────────
  RETURN QUERY SELECT
    v_req.id,
    v_req.clinic_id,
    v_req.patient_id,
    v_req.template_id,
    v_req.status,
    v_req.expires_at,
    v_req.template_snapshot_json,
    NULL::text;     -- error_code = NULL → válido
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_anamnesis_token(text, text) TO anon, authenticated;

-- ── 3. create_anamnesis_request — snapshot completo ──────────────────────────
-- Expande o snapshot para incluir settings_json, conditional_rules_json,
-- description e options de cada campo — necessário para renderização histórica
-- fiel sem depender do template vivo.
CREATE OR REPLACE FUNCTION public.create_anamnesis_request(
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
SET search_path = public
AS $$
DECLARE
  v_id                uuid := gen_random_uuid();
  v_slug              text;
  v_raw_token         text;
  v_token_hash        text;
  v_expires_at        timestamptz;
  v_template_snapshot jsonb;
BEGIN
  v_expires_at := COALESCE(p_expires_at, NOW() + INTERVAL '30 days');

  LOOP
    v_slug := lower(substring(replace(gen_random_uuid()::text, '-', '') FOR 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM anamnesis_requests WHERE public_slug = v_slug
    );
  END LOOP;

  v_raw_token  := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

  -- Snapshot completo: settings_json + conditional_rules_json + options
  -- Congela o template para que respostas antigas sejam sempre interpretáveis
  -- independente de edições futuras no builder.
  SELECT jsonb_build_object(
    'template_id',       t.id,
    'template_name',     t.name,
    'captured_at',       NOW(),
    'has_general_session', COALESCE((t.settings_json->>'has_general_session')::boolean, false),
    'sessions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',          s.id,
          'title',       s.title,
          'order_index', s.order_index,
          'fields',      COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id',                     f.id,
                'field_key',              f.field_key,
                'label',                  f.label,
                'description',            f.description,
                'field_type',             f.field_type,
                'is_required',            f.is_required,
                'order_index',            f.order_index,
                'settings_json',          f.settings_json,
                'conditional_rules_json', f.conditional_rules_json,
                'options', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id',          o.id,
                      'label',       o.label,
                      'value',       o.value,
                      'order_index', o.order_index
                    ) ORDER BY o.order_index
                  )
                  FROM anamnesis_field_options o
                  WHERE o.field_id = f.id AND o.is_active
                ), '[]'::jsonb)
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

-- ── 4. Rate limiting — anamnesis_token_failures ───────────────────────────────
-- Registra tentativas de token inválido para detectar força bruta de slugs.
-- validate_anamnesis_token já não retorna dados em caso de token inválido,
-- mas esta tabela permite detecção de padrões abusivos via dashboard/alerta.
CREATE TABLE IF NOT EXISTS public.anamnesis_token_failures (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text        NOT NULL,
  ip_hash    text,        -- hash do IP (não armazenamos IP em plain-text)
  failed_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS anamnesis_token_failures_slug_ts_idx
  ON public.anamnesis_token_failures (slug, failed_at DESC);

ALTER TABLE public.anamnesis_token_failures ENABLE ROW LEVEL SECURITY;

-- Apenas INSERT para anon (a inserção é feita pelo sistema); SELECT restrito ao admin
CREATE POLICY anamnesis_token_failures_insert_anon
  ON public.anamnesis_token_failures FOR INSERT TO anon
  WITH CHECK (true);

-- Limpa registros com mais de 24h (manutenção periódica via pg_cron ou similar)
COMMENT ON TABLE public.anamnesis_token_failures IS
  'Registra tentativas de token inválido. Útil para detectar força bruta. '
  'Limpar registros > 24h periodicamente.';

-- ── 5. anamnesis_answers — RLS direta via clinic_id ──────────────────────────
-- A política anterior usava JOIN answers→responses→requests para validar clinic_id.
-- Agora que answers tem clinic_id diretamente (P1), simplificamos a política.
DROP POLICY IF EXISTS anamnesis_answers_allow_anon ON public.anamnesis_answers;

CREATE POLICY anamnesis_answers_allow_anon
  ON public.anamnesis_answers
  FOR ALL
  TO anon
  USING  (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

-- ── 6. updated_at em anamnesis_answers (para o campo updated_at no upsert) ───
DO $$ BEGIN
  ALTER TABLE public.anamnesis_answers
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ── Permissões ────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.create_anamnesis_request(uuid, uuid, uuid, timestamptz)
  TO anon, authenticated;
