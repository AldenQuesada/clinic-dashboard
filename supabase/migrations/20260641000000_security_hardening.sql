-- ============================================================
-- Migration: 20260641000000 — Security Hardening
--
-- Fixes: professional_id validation, missing indexes,
-- deduplication constraint, audit columns
-- ============================================================

-- 1. Index para deduplicacao de auto-send (appointment + template)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ldr_dedup
  ON public.legal_doc_requests (appointment_id, template_id)
  WHERE appointment_id IS NOT NULL AND status NOT IN ('revoked', 'purged');

-- 2. Indexes de performance
CREATE INDEX IF NOT EXISTS idx_ldr_template ON public.legal_doc_requests (template_id);
CREATE INDEX IF NOT EXISTS idx_ldr_phone ON public.legal_doc_requests (patient_phone) WHERE patient_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ldr_expires ON public.legal_doc_requests (expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_lds_created ON public.legal_doc_signatures (signed_at DESC);

-- 3. Coluna de audit nos templates
ALTER TABLE public.legal_doc_templates ADD COLUMN IF NOT EXISTS updated_by text;

-- 4. Fix RPC upsert para validar professional_id pertence a mesma clinica
-- (sera aplicado quando pg disponivel)

-- 5. Fix legal_doc_purge_all RPC
CREATE OR REPLACE FUNCTION public.legal_doc_purge_all()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic_id uuid; v_del int;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF app_role() NOT IN ('admin', 'owner') THEN RAISE EXCEPTION 'Permissao insuficiente'; END IF;
  DELETE FROM legal_doc_signatures WHERE request_id IN (SELECT id FROM legal_doc_requests WHERE clinic_id = v_clinic_id);
  DELETE FROM legal_doc_token_failures WHERE slug IN (SELECT public_slug FROM legal_doc_requests WHERE clinic_id = v_clinic_id);
  DELETE FROM legal_doc_requests WHERE clinic_id = v_clinic_id;
  GET DIAGNOSTICS v_del = ROW_COUNT;
  DELETE FROM short_links WHERE code LIKE 'tc-%' AND clinic_id = v_clinic_id;
  RETURN jsonb_build_object('ok', true, 'deleted', v_del);
END; $$;
GRANT EXECUTE ON FUNCTION public.legal_doc_purge_all() TO authenticated;

-- 6. Fix RPC upsert_template (recriar sem bug no default jsonb)
DROP FUNCTION IF EXISTS public.legal_doc_upsert_template(uuid,text,text,text,text,jsonb,boolean,text,jsonb,uuid,text,text);
DROP FUNCTION IF EXISTS public.legal_doc_upsert_template(uuid,text,text,text,text,jsonb,boolean,text,jsonb);
DROP FUNCTION IF EXISTS public.legal_doc_upsert_template(uuid,text,text,text,text,jsonb,boolean);

CREATE OR REPLACE FUNCTION public.legal_doc_upsert_template(
  p_id uuid DEFAULT NULL, p_slug text DEFAULT NULL, p_name text DEFAULT NULL,
  p_doc_type text DEFAULT 'custom', p_content text DEFAULT NULL,
  p_variables jsonb DEFAULT NULL, p_is_active boolean DEFAULT true,
  p_trigger_status text DEFAULT NULL, p_trigger_procedures jsonb DEFAULT NULL,
  p_professional_id uuid DEFAULT NULL, p_tracking_scripts text DEFAULT NULL,
  p_redirect_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic_id uuid; v_role text; v_id uuid;
BEGIN
  v_clinic_id := app_clinic_id(); v_role := app_role();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_role NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Permissao insuficiente'; END IF;
  IF p_name IS NULL OR trim(p_name)='' THEN RAISE EXCEPTION 'Nome obrigatorio'; END IF;
  IF p_content IS NULL OR trim(p_content)='' THEN RAISE EXCEPTION 'Conteudo obrigatorio'; END IF;

  -- Validar professional_id pertence a mesma clinica
  IF p_professional_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM professional_profiles WHERE id = p_professional_id AND clinic_id = v_clinic_id) THEN
      RAISE EXCEPTION 'Profissional nao pertence a esta clinica';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO legal_doc_templates (clinic_id, slug, name, doc_type, content, variables, is_active, trigger_status, trigger_procedures, professional_id, tracking_scripts, redirect_url)
    VALUES (v_clinic_id, COALESCE(p_slug,'doc-'||substr(gen_random_uuid()::text,1,8)), trim(p_name), p_doc_type, p_content,
      COALESCE(p_variables, '["nome","cpf","data","profissional","registro_profissional","especialidade","procedimento","clinica"]'::jsonb),
      p_is_active, p_trigger_status, p_trigger_procedures, p_professional_id, p_tracking_scripts, p_redirect_url)
    RETURNING id INTO v_id;
  ELSE
    UPDATE legal_doc_templates SET
      name=COALESCE(trim(p_name),name), slug=COALESCE(p_slug,slug), doc_type=COALESCE(p_doc_type,doc_type),
      content=COALESCE(p_content,content), variables=COALESCE(p_variables,variables),
      is_active=COALESCE(p_is_active,is_active), trigger_status=p_trigger_status,
      trigger_procedures=p_trigger_procedures, professional_id=p_professional_id,
      tracking_scripts=p_tracking_scripts, redirect_url=p_redirect_url, version=version+1
    WHERE id=p_id AND clinic_id=v_clinic_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Template nao encontrado'; END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.legal_doc_upsert_template(uuid,text,text,text,text,jsonb,boolean,text,jsonb,uuid,text,text) TO authenticated;
