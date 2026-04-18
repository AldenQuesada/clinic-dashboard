-- ============================================================
-- Migration: Report Luxury Templates
-- Sistema de textos editaveis do report. Cada bloco tem chaves
-- dot-notation (ex: 'cashback.headline', 'timeline.stage1.title').
--
-- Migracao suave:
--   - Defaults vivem no JS (report-luxury.templates.defaults.js)
--   - Banco armazena APENAS overrides — chave nao existente = usar default
--   - Editor admin sobrescreve chaves; "resetar" deleta a row
-- ============================================================

CREATE TABLE IF NOT EXISTS report_luxury_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  template_key text NOT NULL,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  UNIQUE (clinic_id, template_key)
);

ALTER TABLE report_luxury_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_luxury_templates_clinic" ON report_luxury_templates
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE INDEX IF NOT EXISTS idx_rlt_clinic_key ON report_luxury_templates (clinic_id, template_key);

CREATE OR REPLACE FUNCTION rlt_set_updated_at()
RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS rlt_updated_at ON report_luxury_templates;
CREATE TRIGGER rlt_updated_at BEFORE UPDATE ON report_luxury_templates
  FOR EACH ROW EXECUTE FUNCTION rlt_set_updated_at();

-- ============================================================
-- RPCs
-- ============================================================

-- Upsert de UM template
CREATE OR REPLACE FUNCTION report_template_upsert(
  p_key   text,
  p_value text
) RETURNS jsonb AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO report_luxury_templates (template_key, value)
  VALUES (p_key, p_value)
  ON CONFLICT (clinic_id, template_key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'key', p_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Carrega TODOS os overrides (cliente faz merge com defaults)
CREATE OR REPLACE FUNCTION report_template_load_all()
RETURNS TABLE (template_key text, value text, updated_at timestamptz) AS $$
BEGIN
  RETURN QUERY
  SELECT t.template_key, t.value, t.updated_at
  FROM report_luxury_templates t
  WHERE t.clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
  ORDER BY t.template_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reseta uma chave (volta para o default)
CREATE OR REPLACE FUNCTION report_template_reset(p_key text)
RETURNS boolean AS $$
BEGIN
  DELETE FROM report_luxury_templates
  WHERE template_key = p_key;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT ALL ON report_luxury_templates TO anon, authenticated;
GRANT EXECUTE ON FUNCTION report_template_upsert     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION report_template_load_all   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION report_template_reset      TO anon, authenticated;
