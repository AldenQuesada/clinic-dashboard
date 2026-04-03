-- ============================================================
-- Quiz Tables: quiz_templates + quiz_responses + RPC
-- ============================================================

-- ── quiz_templates ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid        NOT NULL,
  slug          text        NOT NULL UNIQUE,
  title         text        NOT NULL,
  kanban_target text        NOT NULL,         -- 'kanban-fullface' | 'kanban-protocolos'
  pipeline      text        NOT NULL DEFAULT 'evolution',
  schema        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_templates_clinic ON quiz_templates (clinic_id);
CREATE INDEX IF NOT EXISTS idx_quiz_templates_slug   ON quiz_templates (slug);
CREATE INDEX IF NOT EXISTS idx_quiz_templates_active ON quiz_templates (active);

-- ── quiz_responses ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_responses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id         uuid        NOT NULL REFERENCES quiz_templates(id) ON DELETE CASCADE,
  clinic_id       uuid        NOT NULL,
  answers         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  score           int         NOT NULL DEFAULT 0,
  temperature     text        NOT NULL DEFAULT 'cold' CHECK (temperature IN ('hot','warm','cold')),
  lead_id         uuid        REFERENCES leads(id) ON DELETE SET NULL,
  contact_name    text,
  contact_phone   text,
  contact_email   text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  submitted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_responses_quiz_id   ON quiz_responses (quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_clinic_id ON quiz_responses (clinic_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_lead_id   ON quiz_responses (lead_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_submitted ON quiz_responses (submitted_at DESC);

-- ── RLS: quiz_templates ─────────────────────────────────────
ALTER TABLE quiz_templates ENABLE ROW LEVEL SECURITY;

-- Anon pode SELECT apenas quizzes ativos
CREATE POLICY "quiz_templates_anon_select"
  ON quiz_templates
  FOR SELECT
  TO anon
  USING (active = true);

-- Authenticated pode tudo (gestão admin)
CREATE POLICY "quiz_templates_auth_all"
  ON quiz_templates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── RLS: quiz_responses ─────────────────────────────────────
ALTER TABLE quiz_responses ENABLE ROW LEVEL SECURITY;

-- Anon pode INSERT (submissão pública)
CREATE POLICY "quiz_responses_anon_insert"
  ON quiz_responses
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Authenticated pode tudo
CREATE POLICY "quiz_responses_auth_all"
  ON quiz_responses
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── RPC: submit_quiz_response ───────────────────────────────
-- SECURITY DEFINER: permite INSERT em leads mesmo via anon
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
  v_lead_id     uuid;
BEGIN
  -- 1. Inserir em quiz_responses
  INSERT INTO quiz_responses (
    quiz_id, clinic_id, answers, score, temperature,
    contact_name, contact_phone, contact_email,
    utm_source, utm_medium, utm_campaign
  ) VALUES (
    p_quiz_id, p_clinic_id, p_answers, p_score, p_temperature,
    p_contact_name, p_contact_phone, p_contact_email,
    p_utm_source, p_utm_medium, p_utm_campaign
  )
  RETURNING id INTO v_response_id;

  -- 2. Inserir ou ignorar em leads (ON CONFLICT DO NOTHING por telefone+clinic)
  INSERT INTO leads (
    nome, telefone, email,
    clinic_id, temperature, source, pipeline_stage
  ) VALUES (
    p_contact_name,
    p_contact_phone,
    p_contact_email,
    p_clinic_id,
    p_temperature,
    'quiz',
    'novo'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_lead_id;

  -- 3. Se lead foi criado, atualizar quiz_response com lead_id
  IF v_lead_id IS NOT NULL THEN
    UPDATE quiz_responses
    SET lead_id = v_lead_id
    WHERE id = v_response_id;
  ELSE
    -- Tentar recuperar lead existente pelo telefone+clinic
    SELECT id INTO v_lead_id
    FROM leads
    WHERE telefone = p_contact_phone
      AND clinic_id = p_clinic_id
    LIMIT 1;

    IF v_lead_id IS NOT NULL THEN
      UPDATE quiz_responses
      SET lead_id = v_lead_id
      WHERE id = v_response_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'quiz_response_id', v_response_id,
    'lead_id',          v_lead_id
  );
END;
$$;

-- Garantir que anon pode executar a função
GRANT EXECUTE ON FUNCTION submit_quiz_response(
  uuid, uuid, jsonb, int, text,
  text, text, text, text, text, text, text
) TO anon;
