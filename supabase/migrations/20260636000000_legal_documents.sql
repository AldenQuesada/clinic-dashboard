-- ============================================================
-- Migration: 20260636000000 — Legal Documents Module
--
-- Sistema de documentos legais com assinatura digital.
-- Consentimento de uso de imagem, procedimentos, termos.
-- Validade juridica: Lei 14.063/2020 (assinatura eletronica simples).
--
-- Tabelas: legal_doc_templates, legal_doc_requests, legal_doc_signatures
-- RPCs: create/validate/submit/list
-- ============================================================

-- ══════════════════════════════════════════════════════════════
--  1. TEMPLATES — modelos editaveis pelo admin
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.legal_doc_templates (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL DEFAULT app_clinic_id(),
  slug        text        NOT NULL,
  name        text        NOT NULL,
  doc_type    text        NOT NULL DEFAULT 'custom',
  content     text        NOT NULL,
  variables   jsonb       NOT NULL DEFAULT '["nome","cpf","data","profissional","registro_profissional","especialidade","procedimento","clinica"]'::jsonb,
  version     int         NOT NULL DEFAULT 1,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT legal_doc_templates_pkey PRIMARY KEY (id),
  CONSTRAINT legal_doc_templates_clinic_slug UNIQUE (clinic_id, slug)
);

COMMENT ON TABLE public.legal_doc_templates IS
  'Modelos de documentos legais editaveis. doc_type: uso_imagem | procedimento | anestesia | custom';

CREATE INDEX idx_legal_doc_templates_clinic ON public.legal_doc_templates (clinic_id) WHERE deleted_at IS NULL;

CREATE TRIGGER legal_doc_templates_updated_at
  BEFORE UPDATE ON public.legal_doc_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.legal_doc_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY ldt_select ON public.legal_doc_templates
  FOR SELECT TO authenticated
  USING (clinic_id = app_clinic_id() AND deleted_at IS NULL);

CREATE POLICY ldt_admin ON public.legal_doc_templates
  FOR ALL TO authenticated
  USING (clinic_id = app_clinic_id() AND app_role() IN ('admin', 'owner'))
  WITH CHECK (clinic_id = app_clinic_id() AND app_role() IN ('admin', 'owner'));

-- ══════════════════════════════════════════════════════════════
--  2. REQUESTS — documento gerado por paciente (snapshot imutavel)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.legal_doc_requests (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  clinic_id         uuid        NOT NULL DEFAULT app_clinic_id(),
  template_id       uuid        NOT NULL REFERENCES public.legal_doc_templates(id),
  patient_id        text,
  patient_name      text        NOT NULL,
  patient_cpf       text,
  patient_phone     text,
  appointment_id    text,
  professional_name text,
  professional_reg  text,
  professional_spec text,
  public_slug       text        NOT NULL,
  token_hash        text        NOT NULL,
  content_snapshot  text        NOT NULL,
  document_hash     text,
  status            text        NOT NULL DEFAULT 'pending',
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  viewed_at         timestamptz,
  signed_at         timestamptz,
  revoked_at        timestamptz,

  CONSTRAINT legal_doc_requests_pkey PRIMARY KEY (id),
  CONSTRAINT legal_doc_requests_slug UNIQUE (public_slug)
);

COMMENT ON TABLE public.legal_doc_requests IS
  'Documento gerado por paciente. content_snapshot e imutavel apos criacao. status: pending|viewed|signed|expired|revoked';

CREATE INDEX idx_ldr_clinic ON public.legal_doc_requests (clinic_id, created_at DESC);
CREATE INDEX idx_ldr_patient ON public.legal_doc_requests (clinic_id, patient_id) WHERE status != 'revoked';
CREATE INDEX idx_ldr_slug ON public.legal_doc_requests (public_slug);
CREATE INDEX idx_ldr_appointment ON public.legal_doc_requests (appointment_id) WHERE appointment_id IS NOT NULL;

ALTER TABLE public.legal_doc_requests ENABLE ROW LEVEL SECURITY;

-- Staff pode ver/criar
CREATE POLICY ldr_staff_select ON public.legal_doc_requests
  FOR SELECT TO authenticated
  USING (clinic_id = app_clinic_id());

CREATE POLICY ldr_staff_insert ON public.legal_doc_requests
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = app_clinic_id());

CREATE POLICY ldr_staff_update ON public.legal_doc_requests
  FOR UPDATE TO authenticated
  USING (clinic_id = app_clinic_id());

-- Anon pode ler por slug (validacao via RPC)
CREATE POLICY ldr_anon_select ON public.legal_doc_requests
  FOR SELECT TO anon
  USING (true);

-- ══════════════════════════════════════════════════════════════
--  3. SIGNATURES — prova juridica (IMUTAVEL, sem soft-delete)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.legal_doc_signatures (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  request_id          uuid        NOT NULL REFERENCES public.legal_doc_requests(id),
  signer_name         text        NOT NULL,
  signer_cpf          text,
  signature_data_url  text        NOT NULL,
  document_hash       text        NOT NULL,
  ip_address          text,
  user_agent          text,
  geolocation         jsonb,
  acceptance_text     text        NOT NULL DEFAULT 'Li, compreendi e concordo com todos os termos deste documento.',
  signed_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT legal_doc_signatures_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.legal_doc_signatures IS
  'Registro imutavel de assinatura. NUNCA deletar — valor juridico legal. Sem RLS de delete.';

ALTER TABLE public.legal_doc_signatures ENABLE ROW LEVEL SECURITY;

-- Staff pode ver
CREATE POLICY lds_staff_select ON public.legal_doc_signatures
  FOR SELECT TO authenticated
  USING (request_id IN (SELECT id FROM public.legal_doc_requests WHERE clinic_id = app_clinic_id()));

-- Anon pode inserir (assinatura do paciente)
CREATE POLICY lds_anon_insert ON public.legal_doc_signatures
  FOR INSERT TO anon
  WITH CHECK (true);

-- Anon pode ver (para confirmar assinatura)
CREATE POLICY lds_anon_select ON public.legal_doc_signatures
  FOR SELECT TO anon
  USING (true);

-- NENHUMA policy de UPDATE ou DELETE — registro imutavel

-- ── Rate limiting para validacao de token ─────────────────────
CREATE TABLE IF NOT EXISTS public.legal_doc_token_failures (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text        NOT NULL,
  ip_address text,
  failed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ldtf_slug ON public.legal_doc_token_failures (slug, failed_at DESC);

-- ══════════════════════════════════════════════════════════════
--  4. RPCs
-- ══════════════════════════════════════════════════════════════

-- ── 4a. Listar templates ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.legal_doc_list_templates()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado'); END IF;

  RETURN jsonb_build_object('ok', true, 'data', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'name', t.name, 'doc_type', t.doc_type,
      'content', t.content, 'variables', t.variables, 'version', t.version,
      'is_active', t.is_active, 'created_at', t.created_at, 'updated_at', t.updated_at
    ) ORDER BY t.name), '[]'::jsonb)
    FROM public.legal_doc_templates t
    WHERE t.clinic_id = v_clinic_id AND t.deleted_at IS NULL
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.legal_doc_list_templates() TO authenticated;

-- ── 4b. Upsert template ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.legal_doc_upsert_template(
  p_id       uuid    DEFAULT NULL,
  p_slug     text    DEFAULT NULL,
  p_name     text    DEFAULT NULL,
  p_doc_type text    DEFAULT 'custom',
  p_content  text    DEFAULT NULL,
  p_variables jsonb  DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid; v_role text; v_id uuid;
BEGIN
  v_clinic_id := app_clinic_id(); v_role := app_role();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_role NOT IN ('admin', 'owner') THEN RAISE EXCEPTION 'Permissao insuficiente'; END IF;
  IF p_name IS NULL OR trim(p_name) = '' THEN RAISE EXCEPTION 'Nome obrigatorio'; END IF;
  IF p_content IS NULL OR trim(p_content) = '' THEN RAISE EXCEPTION 'Conteudo obrigatorio'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.legal_doc_templates (clinic_id, slug, name, doc_type, content, variables, is_active)
    VALUES (v_clinic_id, COALESCE(p_slug, 'doc-' || substr(gen_random_uuid()::text, 1, 8)), trim(p_name), p_doc_type, p_content,
            COALESCE(p_variables, '["nome","cpf","data","profissional","registro_profissional","especialidade","procedimento","clinica"]'::jsonb), p_is_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.legal_doc_templates SET
      name = COALESCE(trim(p_name), name),
      slug = COALESCE(p_slug, slug),
      doc_type = COALESCE(p_doc_type, doc_type),
      content = COALESCE(p_content, content),
      variables = COALESCE(p_variables, variables),
      is_active = COALESCE(p_is_active, is_active),
      version = version + 1
    WHERE id = p_id AND clinic_id = v_clinic_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Template nao encontrado'; END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.legal_doc_upsert_template(uuid, text, text, text, text, jsonb, boolean) TO authenticated;

-- ── 4c. Criar request (gerar documento para paciente) ────────

CREATE OR REPLACE FUNCTION public.legal_doc_create_request(
  p_template_id       uuid,
  p_patient_id        text    DEFAULT NULL,
  p_patient_name      text    DEFAULT NULL,
  p_patient_cpf       text    DEFAULT NULL,
  p_patient_phone     text    DEFAULT NULL,
  p_appointment_id    text    DEFAULT NULL,
  p_professional_name text    DEFAULT NULL,
  p_professional_reg  text    DEFAULT NULL,
  p_professional_spec text    DEFAULT NULL,
  p_content_snapshot  text    DEFAULT NULL,
  p_expires_hours     int     DEFAULT 48
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid;
  v_slug       text;
  v_raw_token  text;
  v_token_hash text;
  v_id         uuid;
  v_template   record;
  v_content    text;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  -- Buscar template
  SELECT * INTO v_template FROM public.legal_doc_templates
  WHERE id = p_template_id AND clinic_id = v_clinic_id AND deleted_at IS NULL AND is_active;
  IF v_template IS NULL THEN RAISE EXCEPTION 'Template nao encontrado ou inativo'; END IF;

  -- Gerar slug e token
  v_slug := 'ld-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

  -- Usar snapshot fornecido ou o template original
  v_content := COALESCE(p_content_snapshot, v_template.content);

  INSERT INTO public.legal_doc_requests (
    clinic_id, template_id, patient_id, patient_name, patient_cpf, patient_phone,
    appointment_id, professional_name, professional_reg, professional_spec,
    public_slug, token_hash, content_snapshot, document_hash, expires_at
  ) VALUES (
    v_clinic_id, p_template_id, p_patient_id, p_patient_name, p_patient_cpf, p_patient_phone,
    p_appointment_id, p_professional_name, p_professional_reg, p_professional_spec,
    v_slug, v_token_hash, v_content,
    encode(sha256(v_content::bytea), 'hex'),
    now() + (p_expires_hours || ' hours')::interval
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'slug', v_slug, 'token', v_raw_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.legal_doc_create_request(uuid, text, text, text, text, text, text, text, text, text, int) TO authenticated;

-- ── 4d. Validar token (publico, com rate limiting) ───────────

CREATE OR REPLACE FUNCTION public.legal_doc_validate_token(
  p_slug  text,
  p_token text,
  p_ip    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req         record;
  v_token_hash  text;
  v_failures    int;
BEGIN
  -- Rate limiting: max 10 falhas por slug em 15 minutos
  SELECT COUNT(*) INTO v_failures
  FROM public.legal_doc_token_failures
  WHERE slug = p_slug AND failed_at > now() - interval '15 minutes';

  IF v_failures >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Muitas tentativas. Aguarde 15 minutos.', 'code', 'RATE_LIMITED');
  END IF;

  -- Buscar request
  SELECT * INTO v_req FROM public.legal_doc_requests WHERE public_slug = p_slug;
  IF v_req IS NULL THEN
    INSERT INTO public.legal_doc_token_failures (slug, ip_address) VALUES (p_slug, p_ip);
    RETURN jsonb_build_object('ok', false, 'error', 'Documento nao encontrado', 'code', 'NOT_FOUND');
  END IF;

  -- Verificar token
  v_token_hash := encode(sha256(p_token::bytea), 'hex');
  IF v_req.token_hash != v_token_hash THEN
    INSERT INTO public.legal_doc_token_failures (slug, ip_address) VALUES (p_slug, p_ip);
    RETURN jsonb_build_object('ok', false, 'error', 'Token invalido', 'code', 'INVALID_TOKEN');
  END IF;

  -- Verificar status
  IF v_req.status = 'signed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Documento ja assinado', 'code', 'ALREADY_SIGNED');
  END IF;
  IF v_req.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Documento revogado', 'code', 'REVOKED');
  END IF;
  IF v_req.expires_at < now() THEN
    UPDATE public.legal_doc_requests SET status = 'expired' WHERE id = v_req.id AND status = 'pending';
    RETURN jsonb_build_object('ok', false, 'error', 'Documento expirado', 'code', 'EXPIRED');
  END IF;

  -- Marcar como visualizado
  IF v_req.viewed_at IS NULL THEN
    UPDATE public.legal_doc_requests SET viewed_at = now(), status = 'viewed' WHERE id = v_req.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'id', v_req.id,
    'patient_name', v_req.patient_name,
    'patient_cpf', v_req.patient_cpf,
    'professional_name', v_req.professional_name,
    'professional_reg', v_req.professional_reg,
    'professional_spec', v_req.professional_spec,
    'content', v_req.content_snapshot,
    'document_hash', v_req.document_hash,
    'status', v_req.status,
    'created_at', v_req.created_at
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.legal_doc_validate_token(text, text, text) TO anon, authenticated;

-- ── 4e. Submeter assinatura (publico) ────────────────────────

CREATE OR REPLACE FUNCTION public.legal_doc_submit_signature(
  p_slug              text,
  p_token             text,
  p_signer_name       text,
  p_signer_cpf        text    DEFAULT NULL,
  p_signature_data    text    DEFAULT NULL,
  p_ip_address        text    DEFAULT NULL,
  p_user_agent        text    DEFAULT NULL,
  p_geolocation       jsonb   DEFAULT NULL,
  p_acceptance_text   text    DEFAULT 'Li, compreendi e concordo com todos os termos deste documento.'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req        record;
  v_token_hash text;
  v_sig_id     uuid;
BEGIN
  -- Buscar e validar
  SELECT * INTO v_req FROM public.legal_doc_requests WHERE public_slug = p_slug;
  IF v_req IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nao encontrado'); END IF;

  v_token_hash := encode(sha256(p_token::bytea), 'hex');
  IF v_req.token_hash != v_token_hash THEN RETURN jsonb_build_object('ok', false, 'error', 'Token invalido'); END IF;
  IF v_req.status = 'signed' THEN RETURN jsonb_build_object('ok', false, 'error', 'Ja assinado'); END IF;
  IF v_req.status = 'revoked' THEN RETURN jsonb_build_object('ok', false, 'error', 'Revogado'); END IF;
  IF v_req.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'error', 'Expirado'); END IF;

  IF p_signer_name IS NULL OR trim(p_signer_name) = '' THEN RAISE EXCEPTION 'Nome do signatario obrigatorio'; END IF;
  IF p_signature_data IS NULL OR trim(p_signature_data) = '' THEN RAISE EXCEPTION 'Assinatura obrigatoria'; END IF;

  -- Inserir assinatura (IMUTAVEL)
  INSERT INTO public.legal_doc_signatures (
    request_id, signer_name, signer_cpf, signature_data_url,
    document_hash, ip_address, user_agent, geolocation, acceptance_text
  ) VALUES (
    v_req.id, trim(p_signer_name), p_signer_cpf, p_signature_data,
    v_req.document_hash, p_ip_address, p_user_agent, p_geolocation, p_acceptance_text
  )
  RETURNING id INTO v_sig_id;

  -- Atualizar request
  UPDATE public.legal_doc_requests
  SET status = 'signed', signed_at = now()
  WHERE id = v_req.id;

  -- Atualizar consentimento no appointment se vinculado
  IF v_req.appointment_id IS NOT NULL THEN
    UPDATE public.appointments
    SET consentimento_img = true
    WHERE id = v_req.appointment_id AND clinic_id = v_req.clinic_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'signature_id', v_sig_id, 'signed_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.legal_doc_submit_signature(text, text, text, text, text, text, text, jsonb, text) TO anon, authenticated;

-- ── 4f. Listar requests (admin/staff) ────────────────────────

CREATE OR REPLACE FUNCTION public.legal_doc_list_requests(
  p_patient_id     text    DEFAULT NULL,
  p_appointment_id text    DEFAULT NULL,
  p_status         text    DEFAULT NULL,
  p_limit          int     DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado'); END IF;

  RETURN jsonb_build_object('ok', true, 'data', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'template_id', r.template_id,
      'patient_name', r.patient_name, 'patient_cpf', r.patient_cpf,
      'professional_name', r.professional_name,
      'status', r.status, 'created_at', r.created_at,
      'viewed_at', r.viewed_at, 'signed_at', r.signed_at,
      'appointment_id', r.appointment_id,
      'has_signature', EXISTS(SELECT 1 FROM public.legal_doc_signatures s WHERE s.request_id = r.id)
    ) ORDER BY r.created_at DESC), '[]'::jsonb)
    FROM public.legal_doc_requests r
    WHERE r.clinic_id = v_clinic_id
      AND (p_patient_id IS NULL OR r.patient_id = p_patient_id)
      AND (p_appointment_id IS NULL OR r.appointment_id = p_appointment_id)
      AND (p_status IS NULL OR r.status = p_status)
    LIMIT p_limit
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.legal_doc_list_requests(text, text, text, int) TO authenticated;

-- ── 4g. Revogar documento ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.legal_doc_revoke(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF app_role() NOT IN ('admin', 'owner') THEN RAISE EXCEPTION 'Permissao insuficiente'; END IF;

  UPDATE public.legal_doc_requests
  SET status = 'revoked', revoked_at = now()
  WHERE id = p_id AND clinic_id = v_clinic_id AND status IN ('pending', 'viewed');

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.legal_doc_revoke(uuid) TO authenticated;
