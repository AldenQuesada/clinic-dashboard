-- ============================================================
-- Migration: Quiz Warning Fixes (6 melhorias pre-deploy)
--
-- W1: Deduplicacao de submit (prevenir duplicata no retry)
-- W2: (frontend only - pixel error logging)
-- W3: (ja confirmado - phase='lead')
-- W4: (frontend only - countdown cleanup)
-- W5: (frontend only - WhatsApp detection)
-- W6: (frontend only - phone validation)
-- ============================================================

-- ============================================================
-- W1: Deduplicacao de quiz_responses
-- Se o mesmo telefone + quiz_id ja respondeu nos ultimos 5 min,
-- retorna o response existente em vez de criar duplicata.
-- Atualiza o submit_quiz_response para verificar antes de inserir.
-- ============================================================

CREATE OR REPLACE FUNCTION submit_quiz_response(
  p_quiz_id       uuid,
  p_clinic_id     uuid,
  p_answers       jsonb,
  p_score         int,
  p_temperature   text,
  p_contact_name  text,
  p_contact_phone text,
  p_contact_email text,
  p_utm_source    text,
  p_utm_medium    text,
  p_utm_campaign  text,
  p_kanban_target text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response_id uuid;
  v_lead_id     text;
  v_is_new      boolean := false;
  v_phone       text;
  v_pipeline_id uuid;
  v_stage_id    uuid;
  v_existing_id uuid;
BEGIN
  v_phone := trim(COALESCE(p_contact_phone, ''));

  -- W1: Deduplicacao — se mesmo telefone + quiz nos ultimos 5 minutos, retorna existente
  IF v_phone != '' THEN
    SELECT id INTO v_existing_id
    FROM quiz_responses
    WHERE quiz_id = p_quiz_id
      AND contact_phone = v_phone
      AND submitted_at > now() - interval '5 minutes'
    ORDER BY submitted_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Retorna o response existente (deduplicado)
      SELECT lead_id::text INTO v_lead_id
      FROM quiz_responses WHERE id = v_existing_id;
      RETURN jsonb_build_object(
        'quiz_response_id', v_existing_id,
        'lead_id',          v_lead_id,
        'is_new',           false,
        'deduplicated',     true
      );
    END IF;
  END IF;

  INSERT INTO quiz_responses (
    quiz_id, clinic_id, answers, score, temperature,
    contact_name, contact_phone, contact_email,
    utm_source, utm_medium, utm_campaign
  ) VALUES (
    p_quiz_id, p_clinic_id, p_answers, p_score, p_temperature,
    p_contact_name, v_phone, NULLIF(trim(COALESCE(p_contact_email, '')), ''),
    p_utm_source, p_utm_medium, p_utm_campaign
  )
  RETURNING id INTO v_response_id;

  IF v_phone != '' THEN
    INSERT INTO leads (
      id, name, phone, email,
      clinic_id, temperature, phase, day_bucket,
      status, lead_score, birth_date, data,
      source_type, source_quiz_id
    ) VALUES (
      gen_random_uuid()::text,
      COALESCE(p_contact_name, ''),
      v_phone,
      COALESCE(NULLIF(trim(COALESCE(p_contact_email, '')), ''), ''),
      p_clinic_id,
      p_temperature,
      'lead',
      1,
      'new',
      0,
      '',
      '{}'::jsonb,
      'quiz',
      p_quiz_id
    )
    ON CONFLICT (clinic_id, phone)
    DO UPDATE SET
      temperature = EXCLUDED.temperature,
      name  = COALESCE(NULLIF(leads.name, ''), EXCLUDED.name),
      email = COALESCE(leads.email, EXCLUDED.email)
    RETURNING id INTO v_lead_id;

    v_is_new := (v_lead_id IS NOT NULL);

    IF v_lead_id IS NULL THEN
      SELECT id INTO v_lead_id
      FROM leads
      WHERE phone = v_phone
        AND clinic_id = p_clinic_id
        AND deleted_at IS NULL
      LIMIT 1;
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
    'lead_id',          v_lead_id,
    'is_new',           v_is_new
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_quiz_response(
  uuid, uuid, jsonb, int, text,
  text, text, text, text, text, text, text
) TO anon;

-- Indice para deduplicacao rapida
CREATE INDEX IF NOT EXISTS idx_quiz_responses_dedup
  ON quiz_responses (quiz_id, contact_phone, submitted_at DESC)
  WHERE contact_phone IS NOT NULL AND contact_phone != '';
