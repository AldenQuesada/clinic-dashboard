-- ============================================================
-- ClinicAI — RPC de busca full-text no prontuario
-- Busca ILIKE em content + title de TODOS os registros do paciente.
-- ============================================================

CREATE OR REPLACE FUNCTION mr_search(
  p_patient_id  uuid,
  p_query       text,
  p_limit       int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clinic  uuid := app_clinic_id();
  v_role    text := app_role();
  v_uid     uuid := auth.uid();
  v_q       text;
  v_result  jsonb;
BEGIN
  IF v_role NOT IN ('therapist','admin','owner') THEN
    RETURN jsonb_build_object('records', '[]'::jsonb, 'total', 0);
  END IF;

  v_q := '%' || lower(trim(p_query)) || '%';

  WITH matched AS (
    SELECT
      mr.id, mr.record_type, mr.title, mr.content,
      mr.is_confidential, mr.professional_id,
      mr.created_at, mr.updated_at,
      p.full_name AS professional_name,
      (mr.professional_id = v_uid) AS is_mine,
      COUNT(*) OVER() AS total_count
    FROM public.medical_records mr
    LEFT JOIN public.profiles p ON p.id = mr.professional_id
    WHERE mr.clinic_id = v_clinic
      AND mr.patient_id = p_patient_id
      AND mr.deleted_at IS NULL
      AND (lower(mr.content) LIKE v_q OR lower(mr.title) LIKE v_q)
      AND (
        mr.is_confidential = false
        OR mr.professional_id = v_uid
        OR v_role IN ('admin','owner')
      )
    ORDER BY mr.created_at DESC
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'records', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'record_type', m.record_type,
        'title', m.title,
        'content', m.content,
        'is_confidential', m.is_confidential,
        'professional_id', m.professional_id,
        'professional_name', m.professional_name,
        'is_mine', m.is_mine,
        'created_at', m.created_at,
        'updated_at', m.updated_at
      )
    ), '[]'::jsonb),
    'total', COALESCE((SELECT total_count FROM matched LIMIT 1), 0)
  ) INTO v_result
  FROM matched m;

  RETURN COALESCE(v_result, jsonb_build_object('records', '[]'::jsonb, 'total', 0));
END;
$$;

GRANT EXECUTE ON FUNCTION mr_search(uuid, text, int) TO authenticated;
