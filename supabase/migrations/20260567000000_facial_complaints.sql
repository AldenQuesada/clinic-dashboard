-- ============================================================
-- Migration: Facial Complaints (Queixas Faciais)
-- Adiciona campo queixas_faciais em leads + tabela lookup
-- ============================================================

-- 1. Tabela de referencia com queixas padronizadas
CREATE TABLE IF NOT EXISTS facial_complaints (
  id          serial PRIMARY KEY,
  slug        text UNIQUE NOT NULL,
  label       text NOT NULL,
  sort_order  int DEFAULT 0,
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- Seed das queixas
INSERT INTO facial_complaints (slug, label, sort_order) VALUES
  ('rugas-testa',           'Rugas na testa',                              1),
  ('pe-de-galinha',         'Pe de Galinha',                                2),
  ('bigode-chines',         'Bigode Chines',                               3),
  ('nariz-ponta-caida',     'Nariz (ponta caida)',                         4),
  ('codigo-barras',         'Codigo de Barras',                            5),
  ('labios-desidratados',   'Labios desidratados ou com perda de volume',  6),
  ('flacidez-facial',       'Flacidez facial',                             7),
  ('flacidez-palpebras',    'Flacidez de Palpebras',                       8),
  ('flacidez-papada',       'Flacidez na Papada',                          9),
  ('poros',                 'Poros',                                       10),
  ('cicatrizes-acne',       'Cicatrizes de Acnes',                         11),
  ('assimetria-facial',     'Assimetria facial',                           12),
  ('perda-contorno',        'Perda de definicao no contorno do rosto',     13),
  ('outro',                 'Outro',                                       14)
ON CONFLICT (slug) DO NOTHING;

-- 2. Coluna JSONB na tabela leads para armazenar queixas selecionadas
ALTER TABLE leads ADD COLUMN IF NOT EXISTS queixas_faciais jsonb DEFAULT '[]'::jsonb;

-- 3. Coluna na tabela quiz_responses tambem
ALTER TABLE quiz_responses ADD COLUMN IF NOT EXISTS queixas_faciais jsonb DEFAULT '[]'::jsonb;

-- 4. Atualizar RPC submit_quiz_response para receber queixas
DROP FUNCTION IF EXISTS submit_quiz_response(uuid,uuid,jsonb,int,text,text,text,text,text,text,text,text);

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
  p_queixas_faciais    jsonb DEFAULT '[]'::jsonb
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
    utm_source, utm_medium, utm_campaign,
    queixas_faciais
  ) VALUES (
    p_quiz_id, p_clinic_id, p_answers, p_score, p_temperature,
    p_contact_name, p_contact_phone, p_contact_email,
    p_utm_source, p_utm_medium, p_utm_campaign,
    p_queixas_faciais
  )
  RETURNING id INTO v_response_id;

  -- 2. Inserir lead apenas se tiver telefone
  IF p_contact_phone IS NOT NULL AND trim(p_contact_phone) <> '' THEN
    INSERT INTO leads (
      nome, telefone, email,
      clinic_id, temperature, phase,
      queixas_faciais
    ) VALUES (
      p_contact_name,
      p_contact_phone,
      NULLIF(trim(p_contact_email), ''),
      p_clinic_id,
      p_temperature,
      'captacao',
      p_queixas_faciais
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_lead_id;

    -- 3. Se lead ja existia, atualizar queixas e recuperar ID
    IF v_lead_id IS NULL THEN
      UPDATE leads
      SET queixas_faciais = p_queixas_faciais,
          updated_at = now()
      WHERE telefone = p_contact_phone
        AND clinic_id = p_clinic_id
      RETURNING id INTO v_lead_id;
    END IF;

    -- 4. Vincular quiz_response ao lead
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

-- 5. RLS
ALTER TABLE facial_complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facial_complaints_read" ON facial_complaints FOR SELECT USING (true);

-- 6. Index para buscar leads por queixa
CREATE INDEX IF NOT EXISTS idx_leads_queixas ON leads USING gin (queixas_faciais);
