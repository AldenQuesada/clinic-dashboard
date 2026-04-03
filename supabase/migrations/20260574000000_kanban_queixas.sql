CREATE OR REPLACE FUNCTION sdr_get_kanban_evolution(p_phase text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinic_id uuid;
    v_result    jsonb;
  BEGIN
    v_clinic_id := public._sdr_clinic_id();
    IF v_clinic_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado');
    END IF;

    SELECT jsonb_build_object(
      'stages', (
        SELECT jsonb_agg(jsonb_build_object(
          'slug',       s.slug,
          'label',      s.label,
          'color',      s.color,
          'sort_order', s.sort_order,
          'leads', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id',               l.id,
              'name',             l.name,
              'phone',            l.phone,
              'status',           l.status,
              'phase',            l.phase,
              'temperature',      l.temperature,
              'priority',         l.priority,
              'assigned_to',      l.assigned_to,
              'created_at',       l.created_at,
              'queixas_faciais',  COALESCE(l.queixas_faciais, '[]'::jsonb)
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
