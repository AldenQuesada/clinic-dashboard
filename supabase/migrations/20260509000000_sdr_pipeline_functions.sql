-- ============================================================
-- Migration: 010 — SDR: Funções de Pipeline
-- Sprint 8 — SDR Module Foundation
--
-- Funções criadas (RPCs consumidas pelo JS):
--   sdr_move_lead(p_lead_id, p_pipeline_slug, p_stage_slug, p_origin?)
--   sdr_get_kanban_7dias(p_phase?)
--   sdr_get_kanban_evolution(p_phase?)
--   sdr_init_lead_pipelines(p_lead_id)
--     → coloca lead recém-criado no stage inicial de cada pipeline ativo
--
-- Quando um lead muda de fase (phase_changed), a função
-- sdr_init_lead_pipelines deve ser chamada para reposicioná-lo.
-- ============================================================

-- ── sdr_move_lead ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sdr_move_lead(text, text, text, text);
CREATE OR REPLACE FUNCTION public.sdr_move_lead(
  p_lead_id       text,
  p_pipeline_slug text,
  p_stage_slug    text,
  p_origin        text DEFAULT 'drag'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id  uuid;
  v_pipeline   public.pipelines%ROWTYPE;
  v_stage      public.pipeline_stages%ROWTYPE;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuário não autenticado');
  END IF;

  -- Busca pipeline
  SELECT * INTO v_pipeline
  FROM public.pipelines
  WHERE clinic_id = v_clinic_id AND slug = p_pipeline_slug AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pipeline não encontrado: ' || p_pipeline_slug);
  END IF;

  -- Busca stage
  SELECT * INTO v_stage
  FROM public.pipeline_stages
  WHERE pipeline_id = v_pipeline.id AND slug = p_stage_slug AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Stage não encontrado: ' || p_stage_slug);
  END IF;

  -- Upsert da posição
  INSERT INTO public.lead_pipeline_positions (lead_id, pipeline_id, stage_id, moved_by, origin)
  VALUES (p_lead_id, v_pipeline.id, v_stage.id, auth.uid(), p_origin)
  ON CONFLICT (lead_id, pipeline_id)
  DO UPDATE SET
    stage_id   = v_stage.id,
    updated_at = now(),
    moved_by   = auth.uid(),
    origin     = p_origin;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'lead_id',  p_lead_id,
    'pipeline', p_pipeline_slug,
    'stage',    p_stage_slug
  ));
END;
$$;

-- ── sdr_init_lead_pipelines ───────────────────────────────────
-- Inicializa posição do lead em todos os pipelines ativos da clínica
DROP FUNCTION IF EXISTS public.sdr_init_lead_pipelines(text);
CREATE OR REPLACE FUNCTION public.sdr_init_lead_pipelines(
  p_lead_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id uuid;
  v_pipeline  RECORD;
  v_stage     public.pipeline_stages%ROWTYPE;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuário não autenticado');
  END IF;

  FOR v_pipeline IN
    SELECT * FROM public.pipelines
    WHERE clinic_id = v_clinic_id AND is_active = true
  LOOP
    -- Pega o primeiro stage (menor sort_order)
    SELECT * INTO v_stage
    FROM public.pipeline_stages
    WHERE pipeline_id = v_pipeline.id AND is_active = true
    ORDER BY sort_order ASC
    LIMIT 1;

    CONTINUE WHEN NOT FOUND;

    -- Só insere se não tiver posição ainda (não sobrescreve existente)
    INSERT INTO public.lead_pipeline_positions (lead_id, pipeline_id, stage_id, origin)
    VALUES (p_lead_id, v_pipeline.id, v_stage.id, 'auto')
    ON CONFLICT (lead_id, pipeline_id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── sdr_get_kanban_7dias ──────────────────────────────────────
DROP FUNCTION IF EXISTS public.sdr_get_kanban_7dias(text);
CREATE OR REPLACE FUNCTION public.sdr_get_kanban_7dias(
  p_phase text DEFAULT NULL
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

  SELECT jsonb_build_object(
    'stages', (
      SELECT jsonb_agg(jsonb_build_object(
        'slug',      s.slug,
        'label',     s.label,
        'color',     s.color,
        'day_number', s.day_number,
        'sort_order', s.sort_order,
        'leads', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id',          l.id,
            'name',        l.name,
            'phone',       l.phone,
            'status',      l.status,
            'phase',       l.phase,
            'temperature', l.temperature,
            'priority',    l.priority,
            'assigned_to', l.assigned_to,
            'created_at',  l.created_at
          ) ORDER BY l.priority DESC, l.created_at ASC)
          FROM public.lead_pipeline_positions lpp
          JOIN public.leads l ON l.id = lpp.lead_id
          WHERE lpp.stage_id   = s.id
            AND l.clinic_id    = v_clinic_id
            AND l.deleted_at   IS NULL
            AND (p_phase IS NULL OR l.phase = p_phase)
        ), '[]'::jsonb)
      ) ORDER BY s.sort_order)
      FROM public.pipeline_stages s
      JOIN public.pipelines p ON p.id = s.pipeline_id
      WHERE p.clinic_id = v_clinic_id
        AND p.slug      = 'seven_days'
        AND p.is_active = true
        AND s.is_active = true
    )
  ) INTO v_result;

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_result, '{}'::jsonb));
END;
$$;

-- ── sdr_get_kanban_evolution ──────────────────────────────────
DROP FUNCTION IF EXISTS public.sdr_get_kanban_evolution(text);
CREATE OR REPLACE FUNCTION public.sdr_get_kanban_evolution(
  p_phase text DEFAULT NULL
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

  SELECT jsonb_build_object(
    'stages', (
      SELECT jsonb_agg(jsonb_build_object(
        'slug',      s.slug,
        'label',     s.label,
        'color',     s.color,
        'sort_order', s.sort_order,
        'leads', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id',          l.id,
            'name',        l.name,
            'phone',       l.phone,
            'status',      l.status,
            'phase',       l.phase,
            'temperature', l.temperature,
            'priority',    l.priority,
            'assigned_to', l.assigned_to,
            'created_at',  l.created_at
          ) ORDER BY l.priority DESC, l.created_at ASC)
          FROM public.lead_pipeline_positions lpp
          JOIN public.leads l ON l.id = lpp.lead_id
          WHERE lpp.stage_id   = s.id
            AND l.clinic_id    = v_clinic_id
            AND l.deleted_at   IS NULL
            AND (p_phase IS NULL OR l.phase = p_phase)
        ), '[]'::jsonb)
      ) ORDER BY s.sort_order)
      FROM public.pipeline_stages s
      JOIN public.pipelines p ON p.id = s.pipeline_id
      WHERE p.clinic_id = v_clinic_id
        AND p.slug      = 'evolution'
        AND p.is_active = true
        AND s.is_active = true
    )
  ) INTO v_result;

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_result, '{}'::jsonb));
END;
$$;

-- ============================================================
-- TESTE:
-- SELECT public.sdr_get_kanban_7dias('captacao');
-- SELECT public.sdr_get_kanban_evolution();
-- ============================================================
