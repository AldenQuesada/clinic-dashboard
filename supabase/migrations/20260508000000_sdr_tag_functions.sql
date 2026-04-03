-- ============================================================
-- Migration: 009 — SDR: Funções de Tags
-- Sprint 8 — SDR Module Foundation
--
-- Funções criadas (RPCs consumidas pelo JS):
--   sdr_assign_tag(p_tag_slug, p_entity_type, p_entity_id, p_origin?)
--   sdr_remove_tag(p_tag_slug, p_entity_type, p_entity_id)
--   sdr_set_exclusive_tag(p_tag_slug, p_entity_type, p_entity_id)
--   sdr_get_tags(p_entity_type, p_entity_id)
--   sdr_get_tags_bulk(p_entity_type, p_entity_ids)
--
-- Todas usam clinic_id do JWT (auth.uid() → profiles.clinic_id)
-- Padrão de retorno: { ok: boolean, data?, error? }
-- ============================================================

-- ── Helper: resolver clinic_id do usuário logado ─────────────
CREATE OR REPLACE FUNCTION public._sdr_clinic_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── sdr_assign_tag ────────────────────────────────────────────
-- Atribui uma tag a uma entidade.
-- Se a tag for exclusiva na categoria, remove outras da mesma category.
DROP FUNCTION IF EXISTS public.sdr_assign_tag(text, text, text, text);
CREATE OR REPLACE FUNCTION public.sdr_assign_tag(
  p_tag_slug    text,
  p_entity_type text,
  p_entity_id   text,
  p_origin      text DEFAULT 'manual'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id   uuid;
  v_tag         public.tags%ROWTYPE;
  v_assignment  public.tag_assignments%ROWTYPE;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuário não autenticado ou sem clínica');
  END IF;

  -- Busca a tag
  SELECT * INTO v_tag
  FROM public.tags
  WHERE clinic_id = v_clinic_id
    AND slug = p_tag_slug
    AND entity_type = p_entity_type
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tag não encontrada: ' || p_tag_slug);
  END IF;

  -- Se exclusiva: remove outras tags da mesma categoria para esta entidade
  IF v_tag.is_exclusive THEN
    UPDATE public.tag_assignments ta
    SET removed_at = now(), removed_by = auth.uid()
    WHERE ta.entity_type = p_entity_type
      AND ta.entity_id   = p_entity_id
      AND ta.removed_at IS NULL
      AND ta.tag_id IN (
        SELECT id FROM public.tags
        WHERE clinic_id = v_clinic_id
          AND entity_type = p_entity_type
          AND category = v_tag.category
          AND id <> v_tag.id
      );
  END IF;

  -- Remove conflitos declarados
  UPDATE public.tag_assignments ta
  SET removed_at = now(), removed_by = auth.uid()
  WHERE ta.entity_type = p_entity_type
    AND ta.entity_id   = p_entity_id
    AND ta.removed_at IS NULL
    AND ta.tag_id IN (
      SELECT CASE WHEN tc.tag_a_id = v_tag.id THEN tc.tag_b_id ELSE tc.tag_a_id END
      FROM public.tag_conflicts tc
      WHERE (tc.tag_a_id = v_tag.id OR (tc.tag_b_id = v_tag.id AND tc.bidirectional = true))
    );

  -- Upsert da assignment
  INSERT INTO public.tag_assignments (tag_id, entity_type, entity_id, assigned_by, origin)
  VALUES (v_tag.id, p_entity_type, p_entity_id, auth.uid(), p_origin)
  ON CONFLICT (tag_id, entity_type, entity_id)
  DO UPDATE SET
    removed_at  = NULL,
    removed_by  = NULL,
    assigned_by = auth.uid(),
    assigned_at = now(),
    origin      = p_origin;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('tag_id', v_tag.id, 'slug', v_tag.slug));
END;
$$;

-- ── sdr_remove_tag ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sdr_remove_tag(text, text, text);
CREATE OR REPLACE FUNCTION public.sdr_remove_tag(
  p_tag_slug    text,
  p_entity_type text,
  p_entity_id   text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id uuid;
  v_tag_id    uuid;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuário não autenticado');
  END IF;

  SELECT id INTO v_tag_id
  FROM public.tags
  WHERE clinic_id = v_clinic_id AND slug = p_tag_slug AND entity_type = p_entity_type;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tag não encontrada: ' || p_tag_slug);
  END IF;

  UPDATE public.tag_assignments
  SET removed_at = now(), removed_by = auth.uid()
  WHERE tag_id = v_tag_id
    AND entity_type = p_entity_type
    AND entity_id   = p_entity_id
    AND removed_at IS NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── sdr_get_tags ──────────────────────────────────────────────
-- Retorna todas as tags ativas de uma entidade
DROP FUNCTION IF EXISTS public.sdr_get_tags(text, text);
CREATE OR REPLACE FUNCTION public.sdr_get_tags(
  p_entity_type text,
  p_entity_id   text
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_clinic_id uuid;
  v_result    jsonb;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuário não autenticado');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id',         t.id,
    'slug',       t.slug,
    'label',      t.label,
    'color',      t.color,
    'category',   t.category,
    'assigned_at', ta.assigned_at
  ) ORDER BY t.sort_order, t.label)
  INTO v_result
  FROM public.tag_assignments ta
  JOIN public.tags t ON t.id = ta.tag_id
  WHERE ta.entity_type = p_entity_type
    AND ta.entity_id   = p_entity_id
    AND ta.removed_at IS NULL
    AND t.clinic_id    = v_clinic_id
    AND t.is_active    = true;

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_result, '[]'::jsonb));
END;
$$;

-- ── sdr_get_tags_bulk ─────────────────────────────────────────
-- Retorna tags de múltiplas entidades de uma vez (para render do kanban)
DROP FUNCTION IF EXISTS public.sdr_get_tags_bulk(text, text[]);
CREATE OR REPLACE FUNCTION public.sdr_get_tags_bulk(
  p_entity_type text,
  p_entity_ids  text[]
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_clinic_id uuid;
  v_result    jsonb;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuário não autenticado');
  END IF;

  SELECT jsonb_object_agg(
    entity_id,
    tags
  )
  INTO v_result
  FROM (
    SELECT
      ta.entity_id,
      jsonb_agg(jsonb_build_object(
        'slug',  t.slug,
        'label', t.label,
        'color', t.color
      ) ORDER BY t.sort_order) AS tags
    FROM public.tag_assignments ta
    JOIN public.tags t ON t.id = ta.tag_id
    WHERE ta.entity_type  = p_entity_type
      AND ta.entity_id    = ANY(p_entity_ids)
      AND ta.removed_at   IS NULL
      AND t.clinic_id     = v_clinic_id
      AND t.is_active     = true
    GROUP BY ta.entity_id
  ) sub;

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_result, '{}'::jsonb));
END;
$$;

-- ============================================================
-- TESTE:
-- SELECT public.sdr_assign_tag('lead.quente', 'lead', '<lead_id>');
-- SELECT public.sdr_get_tags('lead', '<lead_id>');
-- ============================================================
