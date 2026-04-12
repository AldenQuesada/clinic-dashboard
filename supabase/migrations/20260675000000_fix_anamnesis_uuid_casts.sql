-- ============================================================
-- Migration: fix uuid=text em create_anamnesis_request e validate_anamnesis_token
-- ============================================================
-- Pos-migracao patient_id text→uuid (20260669):
-- 1. create_anamnesis_request: status 'pending' → 'sent' (enum)
-- 2. validate_anamnesis_token: casts para comparar patients.id (uuid) com leads.id (text)
-- ============================================================

-- 1. create_anamnesis_request: fix enum value
DROP FUNCTION IF EXISTS public.create_anamnesis_request(uuid, text, uuid, uuid, uuid, timestamptz);
CREATE OR REPLACE FUNCTION public.create_anamnesis_request(
  p_clinic_id uuid, p_patient_id text, p_template_id uuid,
  p_created_by uuid DEFAULT NULL, p_appointment_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE v_id uuid; v_slug text; v_token text;
BEGIN
  v_slug := encode(extensions.gen_random_bytes(8), 'hex');
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO anamnesis_requests (
    clinic_id, patient_id, template_id, appointment_id,
    created_by, public_slug, token_hash, status, expires_at
  ) VALUES (
    p_clinic_id, p_patient_id::uuid, p_template_id, p_appointment_id,
    p_created_by, v_slug, encode(extensions.digest(v_token, 'sha256'), 'hex'),
    'sent', COALESCE(p_expires_at, now() + interval '30 days')
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'public_slug', v_slug, 'raw_token', v_token);
END;
$fn$;

-- 2. validate_anamnesis_token: ja corrigido via script direto no banco
-- Casts aplicados: p.id::text = l.id, l.id = v_req.patient_id::text,
-- RETURN v_req.patient_id::text

NOTIFY pgrst, 'reload schema';
