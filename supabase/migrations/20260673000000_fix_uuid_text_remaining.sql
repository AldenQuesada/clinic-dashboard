-- ============================================================
-- Migration: fix remaining uuid=text errors (legal_doc, anamnesis)
-- ============================================================

-- 1. legal_doc_list_requests: r.patient_id (uuid) = p_patient_id (text)
DROP FUNCTION IF EXISTS public.legal_doc_list_requests(text, text, text, integer);

CREATE OR REPLACE FUNCTION public.legal_doc_list_requests(
  p_patient_id text DEFAULT NULL,
  p_appointment_id text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE v_clinic uuid := app_clinic_id();
BEGIN
  RETURN (SELECT COALESCE(jsonb_agg(row_to_json(sub.*) ORDER BY sub.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT r.id, r.template_id, r.patient_id, r.patient_name, r.patient_cpf,
           r.patient_phone, r.appointment_id, r.professional_name, r.professional_reg,
           r.content_snapshot, r.status, r.public_slug,
           r.signed_at, r.expires_at, r.created_at,
           t.name as template_name
    FROM legal_doc_requests r
    LEFT JOIN legal_doc_templates t ON t.id = r.template_id
    WHERE r.clinic_id = v_clinic
      AND (p_patient_id IS NULL OR r.patient_id = p_patient_id::uuid)
      AND (p_appointment_id IS NULL OR r.appointment_id = p_appointment_id)
      AND (p_status IS NULL OR r.status = p_status)
    ORDER BY r.created_at DESC
    LIMIT p_limit
  ) sub);
END;
$fn$;

-- 2. legal_doc_create_request: INSERT p_patient_id (text) into patient_id (uuid)
DROP FUNCTION IF EXISTS public.legal_doc_create_request(uuid, text, text, text, text, text, text, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.legal_doc_create_request(
  p_template_id uuid,
  p_patient_id text DEFAULT NULL, p_patient_name text DEFAULT NULL,
  p_patient_cpf text DEFAULT NULL, p_patient_phone text DEFAULT NULL,
  p_appointment_id text DEFAULT NULL,
  p_professional_name text DEFAULT NULL, p_professional_reg text DEFAULT NULL,
  p_professional_spec text DEFAULT NULL, p_content_snapshot text DEFAULT NULL,
  p_expires_hours integer DEFAULT 48
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_id uuid;
  v_slug text;
  v_token text;
BEGIN
  v_slug := encode(extensions.gen_random_bytes(12), 'hex');
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO legal_doc_requests (
    clinic_id, template_id, patient_id, patient_name, patient_cpf, patient_phone,
    appointment_id, professional_name, professional_reg, professional_spec,
    content_snapshot, public_slug, token_hash, status, expires_at
  ) VALUES (
    v_clinic_id, p_template_id,
    CASE WHEN p_patient_id IS NOT NULL THEN p_patient_id::uuid ELSE NULL END,
    p_patient_name, p_patient_cpf, p_patient_phone,
    p_appointment_id, p_professional_name, p_professional_reg, p_professional_spec,
    p_content_snapshot, v_slug, encode(extensions.digest(v_token, 'sha256'), 'hex'),
    'pending', now() + (p_expires_hours || ' hours')::interval
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'public_slug', v_slug, 'raw_token', v_token);
END;
$fn$;

-- 3. create_anamnesis_request: INSERT p_patient_id (text) into patient_id (uuid)
DROP FUNCTION IF EXISTS public.create_anamnesis_request(uuid, text, uuid, uuid, uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.create_anamnesis_request(
  p_clinic_id uuid, p_patient_id text, p_template_id uuid,
  p_created_by uuid DEFAULT NULL, p_appointment_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE
  v_id uuid;
  v_slug text;
  v_token text;
BEGIN
  v_slug := encode(extensions.gen_random_bytes(8), 'hex');
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO anamnesis_requests (
    clinic_id, patient_id, template_id, appointment_id,
    created_by, public_slug, token_hash, status, expires_at
  ) VALUES (
    p_clinic_id, p_patient_id::uuid, p_template_id, p_appointment_id,
    p_created_by, v_slug, encode(extensions.digest(v_token, 'sha256'), 'hex'),
    'pending', COALESCE(p_expires_at, now() + interval '30 days')
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'public_slug', v_slug, 'raw_token', v_token);
END;
$fn$;

NOTIFY pgrst, 'reload schema';
