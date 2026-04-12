-- ============================================================
-- Migration: fix uuid=text errors after patient_id migration
-- ============================================================
-- patient_complaints.patient_id agora e uuid.
-- Estas RPCs comparavam text com uuid → "operator does not exist"
-- ============================================================

-- 1. complaint_list: p_patient_id text → cast para uuid
DROP FUNCTION IF EXISTS public.complaint_list(text);
CREATE OR REPLACE FUNCTION public.complaint_list(p_patient_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $fn$
BEGIN
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'complaint', complaint, 'source', source, 'status', status,
    'treatment_procedure', treatment_procedure, 'treatment_date', treatment_date,
    'retouch_interval_days', retouch_interval_days, 'next_retouch_date', next_retouch_date,
    'retouch_count', retouch_count, 'resolved_at', resolved_at, 'notes', notes,
    'professional_name', professional_name, 'created_at', created_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
  FROM patient_complaints
  WHERE patient_id = p_patient_id::uuid AND clinic_id = app_clinic_id());
END;
$fn$;

-- 2. complaint_upsert: p_patient_id text → cast no INSERT
DROP FUNCTION IF EXISTS public.complaint_upsert(uuid, text, text, text, text, timestamptz, integer, text, text, text);
CREATE OR REPLACE FUNCTION public.complaint_upsert(
  p_id uuid DEFAULT NULL, p_patient_id text DEFAULT NULL,
  p_complaint text DEFAULT NULL, p_status text DEFAULT NULL,
  p_treatment_procedure text DEFAULT NULL, p_treatment_date timestamptz DEFAULT NULL,
  p_retouch_interval_days integer DEFAULT NULL, p_notes text DEFAULT NULL,
  p_professional_name text DEFAULT NULL, p_appointment_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE v_id uuid;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO patient_complaints (
      patient_id, clinic_id, complaint, status, treatment_procedure,
      treatment_date, retouch_interval_days, notes, professional_name, appointment_id
    ) VALUES (
      p_patient_id::uuid, app_clinic_id(), p_complaint, COALESCE(p_status,'pendente'),
      p_treatment_procedure, p_treatment_date, p_retouch_interval_days, p_notes,
      p_professional_name, p_appointment_id
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE patient_complaints SET
      complaint = COALESCE(p_complaint, complaint),
      status = COALESCE(p_status, status),
      treatment_procedure = COALESCE(p_treatment_procedure, treatment_procedure),
      treatment_date = COALESCE(p_treatment_date, treatment_date),
      retouch_interval_days = COALESCE(p_retouch_interval_days, retouch_interval_days),
      notes = COALESCE(p_notes, notes),
      professional_name = COALESCE(p_professional_name, professional_name)
    WHERE id = p_id AND clinic_id = app_clinic_id() RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$fn$;

-- 3. complaints_pending_retouch: JOIN leads.id (text) = patient_id (uuid) → cast
CREATE OR REPLACE FUNCTION public.complaints_pending_retouch()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $fn$
BEGIN
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pc.id, 'complaint', pc.complaint, 'patient_id', pc.patient_id,
    'patient_name', l.name, 'patient_phone', l.phone,
    'next_retouch_date', pc.next_retouch_date, 'treatment_procedure', pc.treatment_procedure
  )), '[]'::jsonb)
  FROM patient_complaints pc
  JOIN leads l ON l.id = pc.patient_id::text
  WHERE pc.clinic_id = app_clinic_id()
    AND pc.next_retouch_date <= CURRENT_DATE + 7
    AND pc.status IN ('tratada','em_tratamento'));
END;
$fn$;

-- 4. complaint_migrate_from_leads: patient_id::text → ::uuid para INSERT
CREATE OR REPLACE FUNCTION public.complaint_migrate_from_leads()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE v_clinic uuid; v_count int := 0; v_resp record; v_ans record; v_val text; v_label text;
BEGIN
  v_clinic := app_clinic_id();
  FOR v_resp IN SELECT id, patient_id FROM anamnesis_responses WHERE clinic_id = v_clinic AND status = 'completed'
  LOOP
    FOR v_ans IN SELECT field_id, value_json FROM anamnesis_answers WHERE response_id = v_resp.id
      AND field_key LIKE 'assinale_as_opcoes%' AND jsonb_typeof(value_json) = 'array' LOOP
      FOR v_val IN SELECT jsonb_array_elements_text(v_ans.value_json) LOOP
        SELECT o.label INTO v_label FROM anamnesis_field_options o WHERE o.field_id = v_ans.field_id AND o.value = v_val LIMIT 1;
        v_label := COALESCE(v_label, v_val);
        IF v_label != '' AND NOT EXISTS (SELECT 1 FROM patient_complaints WHERE patient_id = v_resp.patient_id AND complaint = v_label) THEN
          INSERT INTO patient_complaints (patient_id, clinic_id, complaint, source)
          VALUES (v_resp.patient_id, v_clinic, v_label, 'anamnese');
          v_count := v_count + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'migrated', v_count);
END;
$fn$;

-- 5. Drop fn_anamnesis_to_medical_record (ja deveria ter sido dropada — trigger removido em 20260667)
DROP FUNCTION IF EXISTS public.fn_anamnesis_to_medical_record() CASCADE;

NOTIFY pgrst, 'reload schema';
