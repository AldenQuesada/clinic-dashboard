-- ============================================================
-- Migration: 20260530000000 — SDR: Limpeza e consolidação de tags
--
-- Problemas corrigidos:
--   1. Remove tags com dot notation (lead.frio etc.) do seed antigo
--      (20260512) que foram substituídas pelas tags underscore (20260521)
--   2. Corrige category de lead_frio/morno/quente para 'temperatura'
--      para que sdr_get_tags e sdr_get_tags_bulk as excluam corretamente
--   3. Atualiza sdr_get_tags e sdr_get_tags_bulk para excluir também
--      por slug (camada adicional de proteção)
-- ============================================================

-- ── 1. Remove tag_assignments órfãos das tags dot notation ────
--    (a migration 20260517 já deletou assignments de category='temperatura'
--     mas podem existir assignments para outras tags dot notation)

DELETE FROM public.tag_assignments ta
USING public.tags t
WHERE ta.tag_id = t.id
  AND t.slug LIKE 'lead.%';

-- ── 2. Remove as tags dot notation (seed antigo 20260512) ─────
--    São substituídas pelas tags underscore do seed 20260521

DELETE FROM public.tags
WHERE slug IN (
  'lead.frio',
  'lead.morno',
  'lead.quente',
  'lead.novo',
  'lead.sem_resposta_24h',
  'lead.sem_resposta_48h',
  'lead.indicacao',
  'lead.prioridade_alta',
  'lead.em_negociacao',
  'lead.retornar_amanha'
);

-- ── 3. Corrige category das tags de temperatura (underscore) ──
--    lead_frio/morno/quente têm category='status_captacao' pelo seed 20260521
--    mas devem ter category='temperatura' para que os RPCs as excluam

UPDATE public.tags
SET
  category   = 'temperatura',
  is_exclusive = true,
  updated_at = now()
WHERE slug IN ('lead_frio', 'lead_morno', 'lead_quente')
  AND entity_type = 'lead';

-- ── 4. Atualiza sdr_get_tags — exclui temperatura por categoria ─

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

-- ── 5. Atualiza sdr_get_tags_bulk — exclui temperatura por categoria ─

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

  SELECT jsonb_object_agg(entity_id, tags)
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

-- ── 6. Limpeza: remove tag_assignments de temperatura se existirem ─

DELETE FROM public.tag_assignments ta
USING public.tags t
WHERE ta.tag_id     = t.id
  AND ta.entity_type = 'lead'
  AND t.category     = 'temperatura';

-- ============================================================
-- VERIFICAÇÕES (rode após aplicar):
--
-- Não deve retornar nenhuma linha (dot notation removida):
-- SELECT slug FROM public.tags WHERE slug LIKE 'lead.%';
--
-- Deve retornar lead_frio, lead_morno, lead_quente com category='temperatura':
-- SELECT slug, category FROM public.tags WHERE slug IN ('lead_frio','lead_morno','lead_quente');
--
-- Não deve haver assignments de temperatura:
-- SELECT COUNT(*) FROM public.tag_assignments ta
-- JOIN public.tags t ON t.id = ta.tag_id
-- WHERE t.category = 'temperatura';
--
-- Tags de lead disponíveis (não temperatura):
-- SELECT slug, label, category FROM public.tags
-- WHERE entity_type = 'lead' AND category != 'temperatura'
-- ORDER BY sort_order;
-- ============================================================
