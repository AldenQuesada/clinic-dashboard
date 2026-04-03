-- Add age field to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS idade int;

-- Update submit RPC to accept age
CREATE OR REPLACE FUNCTION submit_quiz_response(
  p_quiz_id            uuid,
  p_clinic_id          uuid,
  p_answers            jsonb,
  p_score              int,
  p_temperature        text,
  p_contact_name       text,
  p_contact_phone      text,
  p_contact_email      text,
  p_utm_source         text,
  p_utm_medium         text,
  p_utm_campaign       text,
  p_kanban_target      text,
  p_queixas_faciais    jsonb DEFAULT '[]'::jsonb,
  p_idade              int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response_id uuid;
  v_lead_id     text;
  v_pipeline_id uuid;
  v_stage_id    uuid;
BEGIN
  INSERT INTO quiz_responses (
    quiz_id, clinic_id, answers, score, temperature,
    contact_name, contact_phone, contact_email,
    utm_source, utm_medium, utm_campaign,
    queixas_faciais
  ) VALUES (
    p_quiz_id, p_clinic_id, p_answers, p_score, p_temperature,
    p_contact_name, p_contact_phone, p_contact_email,
    p_utm_source, p_utm_medium, p_utm_campaign,
    p_queixas_faciais
  )
  RETURNING id INTO v_response_id;

  IF p_contact_phone IS NOT NULL AND trim(p_contact_phone) <> '' THEN
    INSERT INTO leads (
      id, name, phone, email,
      clinic_id, temperature, phase,
      queixas_faciais, source_type, source_quiz_id, idade
    ) VALUES (
      gen_random_uuid()::text,
      COALESCE(p_contact_name, ''),
      p_contact_phone,
      COALESCE(trim(p_contact_email), ''),
      p_clinic_id,
      COALESCE(p_temperature, 'hot'),
      'lead',
      p_queixas_faciais,
      'quiz',
      p_quiz_id,
      p_idade
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_lead_id;

    IF v_lead_id IS NULL THEN
      UPDATE leads
      SET queixas_faciais = p_queixas_faciais,
          idade = COALESCE(p_idade, idade),
          updated_at = now()
      WHERE phone = p_contact_phone
        AND clinic_id = p_clinic_id
      RETURNING id INTO v_lead_id;
    END IF;

    IF v_lead_id IS NOT NULL THEN
      UPDATE quiz_responses
      SET lead_id = v_lead_id::uuid
      WHERE id = v_response_id;
    END IF;

    IF v_lead_id IS NOT NULL THEN
      FOR v_pipeline_id IN
        SELECT p.id FROM pipelines p
        WHERE p.clinic_id = p_clinic_id AND p.is_active = true
      LOOP
        SELECT ps.id INTO v_stage_id
        FROM pipeline_stages ps
        WHERE ps.pipeline_id = v_pipeline_id
          AND ps.is_active = true
        ORDER BY ps.sort_order ASC
        LIMIT 1;

        IF v_stage_id IS NOT NULL THEN
          INSERT INTO lead_pipeline_positions (lead_id, pipeline_id, stage_id, origin)
          VALUES (v_lead_id, v_pipeline_id, v_stage_id, 'auto')
          ON CONFLICT (lead_id, pipeline_id) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'quiz_response_id', v_response_id,
    'lead_id',          v_lead_id
  );
END;
$$;

-- Update leads_list to return idade
CREATE OR REPLACE FUNCTION leads_list(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit  int  DEFAULT 2000,
  p_offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_result    jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_role NOT IN ('owner','admin','receptionist','therapist','viewer') THEN
    RAISE EXCEPTION 'Permissao insuficiente para acessar leads';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row.updated_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      l.data
      || jsonb_build_object(
        'id',               l.id,
        'name',             l.name,
        'phone',            l.phone,
        'email',            l.email,
        'status',           l.status,
        'leadScore',        l.lead_score,
        'dataNascimento',   NULLIF(l.birth_date, ''),
        'createdAt',        l.created_at,
        'queixas_faciais',  COALESCE(l.queixas_faciais, '[]'::jsonb),
        'idade',            l.idade,
        '_synced',          true
      )                                       AS data,
      l.updated_at
    FROM public.leads l
    WHERE l.clinic_id  = v_clinic_id
      AND l.deleted_at IS NULL
      AND (p_status IS NULL OR l.status = p_status)
      AND (
        p_search IS NULL
        OR l.name  ILIKE '%' || p_search || '%'
        OR l.phone ILIKE '%' || p_search || '%'
        OR l.email ILIKE '%' || p_search || '%'
      )
    ORDER BY l.updated_at DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) row;

  RETURN v_result;
END;
$$;
