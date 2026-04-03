-- Fix: day_bucket consistency
-- 1. Submit quiz: new leads start at sem_data (Dia 0), day_bucket = 0
-- 2. Cron advance: sync day_bucket with stage position
-- 3. Fix Amanda

-- Fix submit: day_bucket = 0 (Dia 0 = dia que entrou)
CREATE OR REPLACE FUNCTION submit_quiz_response(
  p_quiz_id uuid, p_clinic_id uuid, p_answers jsonb, p_score int, p_temperature text,
  p_contact_name text, p_contact_phone text, p_contact_email text,
  p_utm_source text, p_utm_medium text, p_utm_campaign text, p_kanban_target text,
  p_queixas_faciais jsonb DEFAULT '[]'::jsonb, p_idade int DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_response_id uuid; v_lead_id text; v_pipeline_id uuid; v_stage_id uuid; v_recent_count int;
BEGIN
  IF p_contact_phone IS NOT NULL AND trim(p_contact_phone) <> '' THEN
    SELECT count(*) INTO v_recent_count FROM quiz_responses
    WHERE contact_phone = p_contact_phone AND submitted_at > now() - interval '1 hour';
    IF v_recent_count >= 5 THEN
      RETURN jsonb_build_object('error', 'rate_limit', 'message', 'Muitas tentativas.');
    END IF;
  END IF;

  INSERT INTO quiz_responses (quiz_id, clinic_id, answers, score, temperature,
    contact_name, contact_phone, contact_email, utm_source, utm_medium, utm_campaign,
    queixas_faciais, idade)
  VALUES (p_quiz_id, p_clinic_id, p_answers, p_score, p_temperature,
    p_contact_name, p_contact_phone, p_contact_email,
    p_utm_source, p_utm_medium, p_utm_campaign, p_queixas_faciais, p_idade)
  RETURNING id INTO v_response_id;

  IF p_contact_phone IS NOT NULL AND trim(p_contact_phone) <> '' THEN
    INSERT INTO leads (id, name, phone, email, clinic_id, temperature, phase,
      queixas_faciais, source_type, source_quiz_id, idade, day_bucket)
    VALUES (gen_random_uuid()::text, COALESCE(p_contact_name,''), p_contact_phone,
      COALESCE(trim(p_contact_email),''), p_clinic_id, COALESCE(p_temperature,'hot'),
      'lead', p_queixas_faciais, 'quiz', p_quiz_id, p_idade, 0)
    ON CONFLICT DO NOTHING RETURNING id INTO v_lead_id;

    IF v_lead_id IS NULL THEN
      UPDATE leads SET queixas_faciais = p_queixas_faciais,
        idade = COALESCE(p_idade, idade), updated_at = now()
      WHERE phone = p_contact_phone AND clinic_id = p_clinic_id
      RETURNING id INTO v_lead_id;
    END IF;

    IF v_lead_id IS NOT NULL THEN
      UPDATE quiz_responses SET lead_id = v_lead_id::uuid WHERE id = v_response_id;
    END IF;

    IF v_lead_id IS NOT NULL THEN
      FOR v_pipeline_id IN SELECT p.id FROM pipelines p WHERE p.clinic_id = p_clinic_id AND p.is_active = true LOOP
        SELECT ps.id INTO v_stage_id FROM pipeline_stages ps
        WHERE ps.pipeline_id = v_pipeline_id AND ps.is_active = true ORDER BY ps.sort_order ASC LIMIT 1;
        IF v_stage_id IS NOT NULL THEN
          INSERT INTO lead_pipeline_positions (lead_id, pipeline_id, stage_id, origin)
          VALUES (v_lead_id, v_pipeline_id, v_stage_id, 'auto') ON CONFLICT (lead_id, pipeline_id) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object('quiz_response_id', v_response_id, 'lead_id', v_lead_id);
END; $$;

-- Fix cron: sync day_bucket with stage after advancing
CREATE OR REPLACE FUNCTION sdr_advance_day_buckets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pipeline_id   uuid;
    v_stage_order   text[] := ARRAY[
      'sem_data', 'dia_1', 'dia_2', 'dia_3',
      'dia_4', 'dia_5', 'dia_6', 'dia_7_plus'
    ];
    v_bucket_map    int[] := ARRAY[0, 1, 2, 3, 4, 5, 6, 7];
    v_moved         int := 0;
    v_rows          int;
    v_i             int;
    v_from_slug     text;
    v_to_slug       text;
    v_from_id       uuid;
    v_to_id         uuid;
BEGIN
    SELECT id INTO v_pipeline_id
    FROM public.pipelines
    WHERE slug = 'seven_days'
    LIMIT 1;

    IF v_pipeline_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'pipeline seven_days nao encontrado');
    END IF;

    FOR v_i IN REVERSE (array_length(v_stage_order, 1) - 1) .. 1 LOOP
      v_from_slug := v_stage_order[v_i];
      v_to_slug   := v_stage_order[v_i + 1];

      IF v_from_slug = 'dia_7_plus' THEN CONTINUE; END IF;

      SELECT id INTO v_from_id FROM public.pipeline_stages
      WHERE pipeline_id = v_pipeline_id AND slug = v_from_slug LIMIT 1;

      SELECT id INTO v_to_id FROM public.pipeline_stages
      WHERE pipeline_id = v_pipeline_id AND slug = v_to_slug LIMIT 1;

      IF v_from_id IS NULL OR v_to_id IS NULL THEN CONTINUE; END IF;

      IF v_from_slug = 'sem_data' THEN
        UPDATE public.lead_pipeline_positions
        SET stage_id   = v_to_id,
            updated_at = now()
        WHERE pipeline_id = v_pipeline_id
          AND stage_id    = v_from_id
          AND entered_at  < now() - INTERVAL '1 hour';
      ELSE
        UPDATE public.lead_pipeline_positions
        SET stage_id   = v_to_id,
            updated_at = now()
        WHERE pipeline_id = v_pipeline_id
          AND stage_id    = v_from_id;
      END IF;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_moved := v_moved + v_rows;
    END LOOP;

    -- Sync day_bucket with stage position
    UPDATE public.leads l
    SET day_bucket = CASE ps.slug
      WHEN 'sem_data' THEN 0
      WHEN 'dia_1' THEN 1
      WHEN 'dia_2' THEN 2
      WHEN 'dia_3' THEN 3
      WHEN 'dia_4' THEN 4
      WHEN 'dia_5' THEN 5
      WHEN 'dia_6' THEN 6
      WHEN 'dia_7_plus' THEN 7
      ELSE l.day_bucket
    END
    FROM public.lead_pipeline_positions lpp
    JOIN public.pipeline_stages ps ON ps.id = lpp.stage_id
    WHERE lpp.pipeline_id = v_pipeline_id
      AND lpp.lead_id = l.id;

    RETURN jsonb_build_object('ok', true, 'leads_advanced', v_moved, 'ran_at', now());
END;
$$;

-- Fix Amanda: she entered 02/04, today is 03/04, so she is Dia 1
UPDATE leads SET day_bucket = 1 WHERE name = 'Amanda';
UPDATE lead_pipeline_positions
SET stage_id = (SELECT id FROM pipeline_stages WHERE slug = 'dia_1' AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'seven_days' LIMIT 1) LIMIT 1)
WHERE lead_id = (SELECT id FROM leads WHERE name = 'Amanda' LIMIT 1)
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'seven_days' LIMIT 1);

-- Add server-side guard: prevent moving leads in seven_days pipeline via sdr_move_lead
-- (UI already blocks this, but this adds defense in depth)
