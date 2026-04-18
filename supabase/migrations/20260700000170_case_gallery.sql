-- ============================================================
-- Migration: Case Gallery
-- Banco de casos antes/depois para inclusao no report luxury.
--
-- Decisoes:
--   - Storage paths, nunca base64 na row (igual facial_shares).
--   - Tags JSONB para filtros flexiveis (ex: ['terco_medio', 'mandibula']).
--   - Consent da paciente obrigatorio na criacao — sem foto de pessoa sem autorizacao.
--   - Anonimizacao: so armazena iniciais + idade, nunca nome completo.
-- ============================================================

CREATE TABLE IF NOT EXISTS case_gallery (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Anonimizacao
  patient_initials       text NOT NULL,              -- ex: "M.", "L.A."
  patient_age            int,                        -- idade aproximada
  patient_gender         text DEFAULT 'F',           -- F | M

  -- Foco/tags (para seletor similar por perfil)
  focus_area             text NOT NULL,              -- ex: "terco_medio", "mandibula", "labios"
  focus_label            text NOT NULL,              -- display: "Terço médio", "Linha mandibular"
  tags                   jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ['ha', 'botox', 'fotona', ...]

  -- Fotos (storage paths, bucket case-gallery)
  photo_before_path      text NOT NULL,
  photo_after_path       text NOT NULL,

  -- Contexto temporal
  months_since_procedure int NOT NULL,               -- ex: 8 = "8 meses depois"
  procedure_date         date,

  -- Narrativa curta (aparece no meta do caso)
  summary                text,                       -- ex: "Protocolo similar · 8 meses"

  -- LGPD
  consent_acknowledged_at timestamptz NOT NULL DEFAULT now(),
  consent_snapshot        text,                      -- texto do consentimento assinado

  -- Estado
  is_active              boolean NOT NULL DEFAULT true,
  display_order          int NOT NULL DEFAULT 0,

  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by_user_id     uuid,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE case_gallery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_gallery_clinic" ON case_gallery
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE INDEX IF NOT EXISTS idx_case_active   ON case_gallery (is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_case_focus    ON case_gallery (focus_area) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_case_age      ON case_gallery (patient_age)  WHERE is_active;

CREATE OR REPLACE FUNCTION case_gallery_set_updated_at()
RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS case_gallery_updated_at ON case_gallery;
CREATE TRIGGER case_gallery_updated_at
  BEFORE UPDATE ON case_gallery
  FOR EACH ROW EXECUTE FUNCTION case_gallery_set_updated_at();

-- ============================================================
-- RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION case_gallery_create(
  p_patient_initials      text,
  p_patient_age           int,
  p_patient_gender        text,
  p_focus_area            text,
  p_focus_label           text,
  p_tags                  jsonb,
  p_photo_before_path     text,
  p_photo_after_path      text,
  p_months_since          int,
  p_summary               text,
  p_consent_text          text
) RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  IF p_consent_text IS NULL OR length(p_consent_text) < 10 THEN
    RAISE EXCEPTION 'consent_text obrigatorio (LGPD)';
  END IF;
  INSERT INTO case_gallery (
    patient_initials, patient_age, patient_gender,
    focus_area, focus_label, tags,
    photo_before_path, photo_after_path,
    months_since_procedure, summary,
    consent_snapshot
  ) VALUES (
    p_patient_initials, p_patient_age, COALESCE(p_patient_gender, 'F'),
    p_focus_area, p_focus_label, COALESCE(p_tags, '[]'::jsonb),
    p_photo_before_path, p_photo_after_path,
    p_months_since, p_summary,
    p_consent_text
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION case_gallery_update(
  p_id              uuid,
  p_patient_initials text,
  p_patient_age     int,
  p_focus_area      text,
  p_focus_label     text,
  p_tags            jsonb,
  p_months_since    int,
  p_summary         text,
  p_is_active       boolean
) RETURNS boolean AS $$
BEGIN
  UPDATE case_gallery SET
    patient_initials = COALESCE(p_patient_initials, patient_initials),
    patient_age      = COALESCE(p_patient_age,      patient_age),
    focus_area       = COALESCE(p_focus_area,       focus_area),
    focus_label      = COALESCE(p_focus_label,      focus_label),
    tags             = COALESCE(p_tags,             tags),
    months_since_procedure = COALESCE(p_months_since, months_since_procedure),
    summary          = COALESCE(p_summary,          summary),
    is_active        = COALESCE(p_is_active,        is_active)
  WHERE id = p_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION case_gallery_delete(p_id uuid)
RETURNS jsonb AS $$
DECLARE v_row case_gallery%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM case_gallery WHERE id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  DELETE FROM case_gallery WHERE id = p_id;
  RETURN jsonb_build_object(
    'before_path', v_row.photo_before_path,
    'after_path',  v_row.photo_after_path
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lista todos ativos. Client pode filtrar por perfil.
CREATE OR REPLACE FUNCTION case_gallery_list(
  p_focus_area    text DEFAULT NULL,
  p_age_min       int  DEFAULT NULL,
  p_age_max       int  DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  patient_initials text,
  patient_age int,
  patient_gender text,
  focus_area text,
  focus_label text,
  tags jsonb,
  photo_before_path text,
  photo_after_path text,
  months_since_procedure int,
  summary text,
  display_order int,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT cg.id, cg.patient_initials, cg.patient_age, cg.patient_gender,
         cg.focus_area, cg.focus_label, cg.tags,
         cg.photo_before_path, cg.photo_after_path,
         cg.months_since_procedure, cg.summary, cg.display_order, cg.created_at
  FROM case_gallery cg
  WHERE cg.is_active = true
    AND (p_focus_area IS NULL OR cg.focus_area = p_focus_area)
    AND (p_age_min    IS NULL OR cg.patient_age >= p_age_min)
    AND (p_age_max    IS NULL OR cg.patient_age <= p_age_max)
  ORDER BY cg.display_order ASC, cg.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT ALL ON case_gallery TO anon, authenticated;
GRANT EXECUTE ON FUNCTION case_gallery_create TO anon, authenticated;
GRANT EXECUTE ON FUNCTION case_gallery_update TO anon, authenticated;
GRANT EXECUTE ON FUNCTION case_gallery_delete TO anon, authenticated;
GRANT EXECUTE ON FUNCTION case_gallery_list   TO anon, authenticated;
