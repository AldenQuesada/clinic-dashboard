-- ============================================================
-- Migration: 20260522000000 — SDR: sdr_assign_tag com Dispatch
--
-- Estende sdr_assign_tag para disparar automaticamente:
--   1. Alerta interno (internal_alerts) se a tag tem alert_template_id
--   2. Tarefa operacional (tasks) se a tag tem task_template_id
--
-- Também adiciona resolução de conflitos via coluna incompativeis[]
-- (além do tag_conflicts existente — backward compat mantido).
--
-- Blindagens:
--   - Tag não encontrada → retorna erro, não cria alert/task
--   - Template não encontrado ou inativo → silencioso, não quebra
--   - prazo_horas = 0 → due_at = now() (imediato)
--   - origin = 'rule' ignorado no dispatch para evitar loops
-- ============================================================

DROP FUNCTION IF EXISTS public.sdr_assign_tag(text, text, text, text);

CREATE OR REPLACE FUNCTION public.sdr_assign_tag(
  p_tag_slug    text,
  p_entity_type text,
  p_entity_id   text,
  p_origin      text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid;
  v_tag        tags%ROWTYPE;
  v_alert_tmpl tag_alert_templates%ROWTYPE;
  v_task_tmpl  tag_task_templates%ROWTYPE;
  v_due_at     timestamptz;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuário não autenticado ou sem clínica');
  END IF;

  -- ── Busca tag ─────────────────────────────────────────────────
  -- Tenta primeiro com entity_type (slug antigo: 'lead.quente')
  -- Se não achar, tenta sem entity_type (slug novo: 'lead_quente')
  SELECT * INTO v_tag
  FROM tags
  WHERE clinic_id  = v_clinic_id
    AND slug       = p_tag_slug
    AND entity_type = p_entity_type
    AND is_active  = true
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_tag
    FROM tags
    WHERE clinic_id = v_clinic_id
      AND slug      = p_tag_slug
      AND is_active = true
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tag não encontrada: ' || p_tag_slug);
  END IF;

  -- ── Exclusividade por categoria ───────────────────────────────
  IF v_tag.is_exclusive THEN
    UPDATE tag_assignments ta
    SET removed_at = now(), removed_by = auth.uid()
    WHERE ta.entity_type = p_entity_type
      AND ta.entity_id   = p_entity_id
      AND ta.removed_at  IS NULL
      AND ta.tag_id IN (
        SELECT id FROM tags
        WHERE clinic_id   = v_clinic_id
          AND entity_type = v_tag.entity_type
          AND category    = v_tag.category
          AND id         <> v_tag.id
      );
  END IF;

  -- ── Conflitos via incompativeis[] (novo sistema) ──────────────
  IF array_length(v_tag.incompativeis, 1) > 0 THEN
    UPDATE tag_assignments ta
    SET removed_at = now(), removed_by = auth.uid()
    WHERE ta.entity_type = p_entity_type
      AND ta.entity_id   = p_entity_id
      AND ta.removed_at  IS NULL
      AND ta.tag_id IN (
        SELECT id FROM tags
        WHERE clinic_id = v_clinic_id
          AND slug      = ANY(v_tag.incompativeis)
      );
  END IF;

  -- ── Conflitos via tag_conflicts (backward compat) ─────────────
  UPDATE tag_assignments ta
  SET removed_at = now(), removed_by = auth.uid()
  WHERE ta.entity_type = p_entity_type
    AND ta.entity_id   = p_entity_id
    AND ta.removed_at  IS NULL
    AND ta.tag_id IN (
      SELECT CASE WHEN tc.tag_a_id = v_tag.id THEN tc.tag_b_id ELSE tc.tag_a_id END
      FROM tag_conflicts tc
      WHERE tc.tag_a_id = v_tag.id
         OR (tc.tag_b_id = v_tag.id AND tc.bidirectional = true)
    );

  -- ── Upsert assignment ─────────────────────────────────────────
  INSERT INTO tag_assignments (tag_id, entity_type, entity_id, assigned_by, origin)
  VALUES (v_tag.id, p_entity_type, p_entity_id, auth.uid(), p_origin)
  ON CONFLICT (tag_id, entity_type, entity_id) DO UPDATE SET
    removed_at  = NULL,
    removed_by  = NULL,
    assigned_by = auth.uid(),
    assigned_at = now(),
    origin      = p_origin;

  -- ── Dispatch (só para origin != 'rule' — evita loops) ─────────
  IF p_origin <> 'rule' THEN

    -- ── 1. Alerta interno ───────────────────────────────────────
    IF v_tag.alert_template_id IS NOT NULL THEN
      SELECT * INTO v_alert_tmpl
      FROM tag_alert_templates
      WHERE clinic_id = v_clinic_id
        AND slug      = v_tag.alert_template_id
        AND ativo     = true;

      IF FOUND THEN
        INSERT INTO internal_alerts
          (clinic_id, entity_type, entity_id, template_slug, titulo, corpo, tipo, para)
        VALUES
          (v_clinic_id, p_entity_type, p_entity_id,
           v_tag.alert_template_id,
           v_alert_tmpl.titulo,
           v_alert_tmpl.corpo,
           v_alert_tmpl.tipo,
           v_alert_tmpl.para);
      END IF;
    END IF;

    -- ── 2. Tarefa operacional ───────────────────────────────────
    IF v_tag.task_template_id IS NOT NULL THEN
      SELECT * INTO v_task_tmpl
      FROM tag_task_templates
      WHERE clinic_id = v_clinic_id
        AND slug      = v_tag.task_template_id
        AND ativo     = true;

      IF FOUND THEN
        -- prazo_horas = 0 → tarefa imediata (due_at = now)
        v_due_at := CASE
          WHEN v_task_tmpl.prazo_horas > 0
          THEN now() + (v_task_tmpl.prazo_horas * interval '1 hour')
          ELSE now()
        END;

        INSERT INTO tasks
          (clinic_id, lead_id, type, title, description, status, due_at, triggered_by)
        VALUES
          (v_clinic_id,
           p_entity_id,    -- lead_id é text — funciona para todos entity_types
           'task',
           v_task_tmpl.titulo,
           v_task_tmpl.descricao,
           'pending',
           v_due_at,
           v_tag.slug);
      END IF;
    END IF;

  END IF; -- fim origin != 'rule'

  RETURN jsonb_build_object(
    'ok',   true,
    'data', jsonb_build_object('tag_id', v_tag.id, 'slug', v_tag.slug)
  );
END;
$$;
