-- ============================================================
-- Migration: SDR — Remove temperatura das tags de leads
--
-- 1. Limpa tag_assignments de categoria 'temperatura' em leads
--    (temperatura agora é gerenciada pelo campo leads.temperature)
-- 2. Atualiza sdr_get_tags para excluir categoria 'temperatura'
-- 3. Atualiza sdr_get_tags_bulk para excluir categoria 'temperatura'
-- ============================================================

-- ── 1. Limpeza: remove assignments de temperatura existentes ──

DELETE FROM public.tag_assignments ta
USING public.tags t
WHERE ta.tag_id     = t.id
  AND ta.entity_type = 'lead'
  AND t.category     = 'temperatura';

-- ── 2. sdr_get_tags: exclui categoria temperatura ─────────────

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
    'id',          t.id,
    'slug',        t.slug,
    'label',       t.label,
    'color',       t.color,
    'category',    t.category,
    'assigned_at', ta.assigned_at
  ) ORDER BY t.sort_order, t.label)
  INTO v_result
  FROM public.tag_assignments ta
  JOIN public.tags t ON t.id = ta.tag_id
  WHERE ta.entity_type = p_entity_type
    AND ta.entity_id   = p_entity_id
    AND ta.removed_at IS NULL
    AND t.clinic_id    = v_clinic_id
    AND t.category    != 'temperatura';

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_result, '[]'::jsonb));
END;
$$;

-- ── 3. sdr_get_tags_bulk: exclui categoria temperatura ────────

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
        'id',          t.id,
        'slug',        t.slug,
        'label',       t.label,
        'color',       t.color,
        'category',    t.category,
        'assigned_at', ta.assigned_at
      ) ORDER BY t.sort_order, t.label) AS tags
    FROM public.tag_assignments ta
    JOIN public.tags t ON t.id = ta.tag_id
    WHERE ta.entity_type  = p_entity_type
      AND ta.entity_id    = ANY(p_entity_ids)
      AND ta.removed_at  IS NULL
      AND t.clinic_id     = v_clinic_id
      AND t.category     != 'temperatura'
    GROUP BY ta.entity_id
  ) sub;

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_result, '{}'::jsonb));
END;
$$;

-- ============================================================
-- VERIFICACAO:
-- SELECT COUNT(*) FROM tag_assignments ta
-- JOIN tags t ON t.id = ta.tag_id WHERE t.category = 'temperatura';
-- Deve retornar 0.
-- ============================================================
