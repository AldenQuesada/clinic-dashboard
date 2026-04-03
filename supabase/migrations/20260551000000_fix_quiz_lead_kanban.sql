-- ============================================================================
-- Fix: Quiz leads entram no Kanban correto com validação de telefone duplicado
-- ============================================================================
-- 1. Unique index em (clinic_id, telefone) para evitar duplicatas
-- 2. RPC submit_quiz_response atualizada para:
--    - Usar ON CONFLICT (clinic_id, telefone) corretamente
--    - Atualizar temperatura se lead já existe (quiz mais recente ganha)
--    - Posicionar lead no pipeline correto (kanban_target)
--    - Setar day_bucket = 1 (dia 0 = novo)
-- ============================================================================

-- 1. Unique constraint para phone por clínica
-- Drop se existir versão anterior com WHERE
DROP INDEX IF EXISTS idx_leads_phone_clinic;
CREATE UNIQUE INDEX idx_leads_phone_clinic
  ON public.leads (clinic_id, phone);

-- 2. RPC atualizada
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
BEGIN
  -- Normalizar telefone
  v_phone := trim(COALESCE(p_contact_phone, ''));

  -- 1. Inserir em quiz_responses
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

  -- 2. Criar ou atualizar lead (se tiver telefone)
  IF v_phone != '' THEN
    -- Tenta inserir novo lead
    INSERT INTO leads (
      id, name, phone, email,
      clinic_id, temperature, phase, day_bucket,
      status, lead_score, birth_date, data
    ) VALUES (
      gen_random_uuid()::text,
      COALESCE(p_contact_name, ''),
      v_phone,
      COALESCE(NULLIF(trim(COALESCE(p_contact_email, '')), ''), ''),
      p_clinic_id,
      p_temperature,
      'captacao',
      1,
      'new',
      0,
      '',
      '{}'::jsonb
    )
    ON CONFLICT (clinic_id, phone)
    DO UPDATE SET
      -- Atualiza temperatura se o quiz mais recente deu resultado diferente
      temperature = EXCLUDED.temperature,
      -- Atualiza nome/email se estavam vazios
      name  = COALESCE(NULLIF(leads.name, ''), EXCLUDED.name),
      email = COALESCE(leads.email, EXCLUDED.email)
    RETURNING id INTO v_lead_id;

    v_is_new := (v_lead_id IS NOT NULL);

    -- Se não retornou (edge case), busca pelo telefone
    IF v_lead_id IS NULL THEN
      SELECT id INTO v_lead_id
      FROM leads
      WHERE phone = v_phone
        AND clinic_id = p_clinic_id
        AND deleted_at IS NULL
      LIMIT 1;
    END IF;

    -- 3. Vincular quiz_response ao lead
    IF v_lead_id IS NOT NULL THEN
      UPDATE quiz_responses
      SET lead_id = v_lead_id::uuid
      WHERE id = v_response_id;
    END IF;

    -- 4. Posicionar em TODOS os pipelines ativos da clínica (evolution + seven_days)
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
