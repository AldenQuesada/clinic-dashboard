-- ============================================================
-- Migration: Page Builder — Landing pages editaveis
-- ============================================================

CREATE TABLE IF NOT EXISTS page_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  slug        text NOT NULL UNIQUE,
  title       text NOT NULL,
  status      text DEFAULT 'draft',  -- draft | published
  schema      jsonb NOT NULL DEFAULT '{"blocks":[],"appearance":{},"sticky_button":null}',
  views       int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE page_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "page_templates_clinic" ON page_templates
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE INDEX IF NOT EXISTS idx_page_templates_slug ON page_templates (slug);

-- Resolve page by slug (public, increments views)
CREATE OR REPLACE FUNCTION page_resolve(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_page page_templates%ROWTYPE;
BEGIN
  SELECT * INTO v_page FROM page_templates WHERE slug = p_slug AND status = 'published';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  UPDATE page_templates SET views = views + 1 WHERE id = v_page.id;
  RETURN jsonb_build_object('ok', true, 'title', v_page.title, 'schema', v_page.schema);
END; $$;
GRANT EXECUTE ON FUNCTION page_resolve(text) TO anon, authenticated;

-- List pages
CREATE OR REPLACE FUNCTION page_list()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((SELECT jsonb_agg(row_to_json(t) ORDER BY t.updated_at DESC) FROM (
    SELECT id, slug, title, status, views, created_at, updated_at FROM page_templates
    WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
  ) t), '[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION page_list() TO anon, authenticated;

-- Save page (create or update)
CREATE OR REPLACE FUNCTION page_save(
  p_id uuid DEFAULT NULL, p_slug text DEFAULT NULL,
  p_title text DEFAULT NULL, p_schema jsonb DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE page_templates SET
      slug = COALESCE(p_slug, slug), title = COALESCE(p_title, title),
      schema = COALESCE(p_schema, schema), status = COALESCE(p_status, status),
      updated_at = now()
    WHERE id = p_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO page_templates (slug, title, schema, status)
    VALUES (p_slug, COALESCE(p_title, 'Nova Pagina'), COALESCE(p_schema, '{"blocks":[],"appearance":{}}'::jsonb), COALESCE(p_status, 'draft'))
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
GRANT EXECUTE ON FUNCTION page_save(uuid, text, text, jsonb, text) TO anon, authenticated;

-- Delete page
CREATE OR REPLACE FUNCTION page_delete(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM page_templates WHERE id = p_id AND clinic_id = '00000000-0000-0000-0000-000000000001';
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION page_delete(uuid) TO anon, authenticated;
