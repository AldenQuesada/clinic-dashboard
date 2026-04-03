-- ============================================================
-- Migration: Lead Source Tracking
--
-- Adiciona rastreamento de origem do lead para comparacao
-- de conversao entre quizzes e outras fontes.
--
-- Campos:
--   source_type    — tipo de origem (quiz, manual, import, referral, social)
--   source_quiz_id — uuid do quiz que originou (se source_type = 'quiz')
--
-- Seguranca:
--   - DEFAULT 'manual' garante que nunca fica NULL
--   - source_quiz_id e referencia historica, NAO e FK
--     (quiz pode ser deletado sem quebrar dados)
--   - Backfill determinisico via quiz_responses
-- ============================================================

-- ============================================================
-- PASSO 1: Adicionar colunas
-- ============================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_type    text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_quiz_id uuid;

ALTER TABLE public.leads
  ADD CONSTRAINT chk_leads_source_type
    CHECK (source_type IN ('quiz', 'manual', 'import', 'referral', 'social'));

CREATE INDEX IF NOT EXISTS idx_leads_source_type
  ON public.leads (clinic_id, source_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_source_quiz
  ON public.leads (clinic_id, source_quiz_id)
  WHERE deleted_at IS NULL AND source_quiz_id IS NOT NULL;

-- ============================================================
-- PASSO 2: Backfill — leads existentes com quiz_response
-- O primeiro quiz respondido e a origem real
-- ============================================================
UPDATE public.leads l
SET source_type    = 'quiz',
    source_quiz_id = sub.quiz_id
FROM (
  SELECT DISTINCT ON (qr.lead_id)
    qr.lead_id::text AS lead_id,
    qr.quiz_id
  FROM public.quiz_responses qr
  WHERE qr.lead_id IS NOT NULL
  ORDER BY qr.lead_id, qr.submitted_at ASC
) sub
WHERE l.id = sub.lead_id
  AND l.source_type = 'manual';

-- ============================================================
-- PASSO 3: Atualizar submit_quiz_response para setar origem
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
BEGIN
  v_phone := trim(COALESCE(p_contact_phone, ''));

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
      -- NAO sobrescreve source_type/source_quiz_id (origem e imutavel)
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

-- ============================================================
-- PASSO 4: RPC — Metricas do funil agrupadas por origem
-- ============================================================
CREATE OR REPLACE FUNCTION public.sdr_funnel_by_source(
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to   timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_result    jsonb;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao autenticado');
  END IF;

  SELECT jsonb_build_object('ok', true, 'data', COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb))
  INTO v_result
  FROM (
    SELECT
      l.source_type,
      l.source_quiz_id,
      qt.title AS quiz_title,
      count(*)                                                    AS total_leads,
      count(*) FILTER (WHERE l.phase IN ('agendado','reagendado','compareceu','paciente','orcamento')) AS agendados,
      count(*) FILTER (WHERE l.phase IN ('compareceu','paciente','orcamento'))                        AS compareceram,
      count(*) FILTER (WHERE l.phase = 'paciente')                AS pacientes,
      count(*) FILTER (WHERE l.phase = 'orcamento')               AS orcamentos,
      count(*) FILTER (WHERE l.phase = 'perdido')                 AS perdidos,
      -- Taxas
      CASE WHEN count(*) > 0
        THEN round(count(*) FILTER (WHERE l.phase IN ('agendado','reagendado','compareceu','paciente','orcamento'))::numeric / count(*) * 100)
        ELSE 0 END AS taxa_agendamento,
      CASE WHEN count(*) FILTER (WHERE l.phase IN ('agendado','reagendado','compareceu','paciente','orcamento')) > 0
        THEN round(count(*) FILTER (WHERE l.phase IN ('compareceu','paciente','orcamento'))::numeric /
             count(*) FILTER (WHERE l.phase IN ('agendado','reagendado','compareceu','paciente','orcamento')) * 100)
        ELSE 0 END AS taxa_comparecimento,
      CASE WHEN count(*) FILTER (WHERE l.phase IN ('compareceu','paciente','orcamento')) > 0
        THEN round(count(*) FILTER (WHERE l.phase = 'paciente')::numeric /
             count(*) FILTER (WHERE l.phase IN ('compareceu','paciente','orcamento')) * 100)
        ELSE 0 END AS taxa_conversao,
      CASE WHEN count(*) > 0
        THEN round(count(*) FILTER (WHERE l.phase = 'perdido')::numeric / count(*) * 100)
        ELSE 0 END AS taxa_perda
    FROM public.leads l
    LEFT JOIN public.quiz_templates qt ON qt.id = l.source_quiz_id
    WHERE l.clinic_id = v_clinic_id
      AND l.deleted_at IS NULL
      AND l.created_at BETWEEN p_from AND p_to
    GROUP BY l.source_type, l.source_quiz_id, qt.title
    ORDER BY count(*) DESC
  ) r;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION sdr_funnel_by_source(timestamptz, timestamptz) TO authenticated;

-- ============================================================
-- VERIFICACAO:
--
-- SELECT source_type, source_quiz_id, count(*)
-- FROM leads WHERE deleted_at IS NULL
-- GROUP BY source_type, source_quiz_id;
--
-- SELECT sdr_funnel_by_source();
-- ============================================================
