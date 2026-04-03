-- ============================================================
-- SDR: Advance Day Buckets
-- Funcao chamada diariamente a 00:00 para avançar todos os leads
-- de um bucket para o proximo no pipeline seven_days.
--
-- Sequencia: sem_data -> dia_1 -> dia_2 -> dia_3 -> dia_4
--            -> dia_5 -> dia_6 -> dia_7_plus (termina aqui)
--
-- Para agendar via pg_cron (Supabase Pro):
--   SELECT cron.schedule(
--     'sdr-advance-day-buckets',
--     '0 0 * * *',
--     $$SELECT sdr_advance_day_buckets()$$
--   );
--
-- Para agendar via Supabase Edge Functions:
--   Criar edge function que chama esta RPC no cron 0 0 * * *
-- ============================================================

CREATE OR REPLACE FUNCTION public.sdr_advance_day_buckets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id   uuid;
  v_stage_order   text[] := ARRAY[
    'sem_data', 'dia_1', 'dia_2', 'dia_3',
    'dia_4', 'dia_5', 'dia_6', 'dia_7_plus'
  ];
  v_stage_ids     uuid[];
  v_moved         int := 0;
  v_i             int;
  v_from_slug     text;
  v_to_slug       text;
  v_from_id       uuid;
  v_to_id         uuid;
BEGIN
  -- Obtem o pipeline seven_days
  SELECT id INTO v_pipeline_id
  FROM public.pipelines
  WHERE slug = 'seven_days'
  LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pipeline seven_days nao encontrado');
  END IF;

  -- Carrega os IDs dos stages na ordem correta
  SELECT ARRAY(
    SELECT ps.id
    FROM public.pipeline_stages ps
    WHERE ps.pipeline_id = v_pipeline_id
      AND ps.slug = ANY(v_stage_order)
    ORDER BY ARRAY_POSITION(v_stage_order, ps.slug)
  ) INTO v_stage_ids;

  -- Avanca da frente para tras (evita que um lead avance duas vezes)
  -- dia_6 -> dia_7_plus, dia_5 -> dia_6, ..., sem_data -> dia_1
  -- sem_data avanca apenas leads que ja tem posicao ha pelo menos 1 dia
  FOR v_i IN REVERSE (array_length(v_stage_order, 1) - 1) .. 1 LOOP
    v_from_slug := v_stage_order[v_i];
    v_to_slug   := v_stage_order[v_i + 1];

    -- dia_7_plus nao avanca (ultimo bucket)
    IF v_from_slug = 'dia_7_plus' THEN CONTINUE; END IF;

    SELECT id INTO v_from_id FROM public.pipeline_stages
    WHERE pipeline_id = v_pipeline_id AND slug = v_from_slug LIMIT 1;

    SELECT id INTO v_to_id FROM public.pipeline_stages
    WHERE pipeline_id = v_pipeline_id AND slug = v_to_slug LIMIT 1;

    IF v_from_id IS NULL OR v_to_id IS NULL THEN CONTINUE; END IF;

    -- Para sem_data: so avanca leads que entraram ha mais de 1 hora
    -- (evita que leads recem-criados ja avancem na mesma madrugada)
    IF v_from_slug = 'sem_data' THEN
      UPDATE public.lead_pipeline_positions
      SET stage_id   = v_to_id,
          updated_at = now()
      WHERE pipeline_id = v_pipeline_id
        AND stage_id    = v_from_id
        AND created_at  < now() - INTERVAL '1 hour';
    ELSE
      UPDATE public.lead_pipeline_positions
      SET stage_id   = v_to_id,
          updated_at = now()
      WHERE pipeline_id = v_pipeline_id
        AND stage_id    = v_from_id;
    END IF;

    GET DIAGNOSTICS v_moved = v_moved + ROW_COUNT;
  END LOOP;

  -- Atualiza leads.day_bucket para ficar em sincronia
  UPDATE public.leads l
  SET day_bucket = ps.slug
  FROM public.lead_pipeline_positions lpp
  JOIN public.pipeline_stages ps ON ps.id = lpp.stage_id
  WHERE lpp.pipeline_id = v_pipeline_id
    AND lpp.lead_id = l.id;

  RETURN jsonb_build_object('ok', true, 'leads_advanced', v_moved, 'ran_at', now());
END;
$$;

-- Permite chamada anonima via RPC (o cron roda sem usuario logado)
-- Adicionar GRANT apenas se usar pg_cron ou service_role:
-- GRANT EXECUTE ON FUNCTION public.sdr_advance_day_buckets() TO service_role;

COMMENT ON FUNCTION public.sdr_advance_day_buckets() IS
  'Avanca todos os leads no pipeline seven_days para o proximo day_bucket. '
  'Deve ser chamada diariamente a 00:00 via pg_cron ou Edge Function.';
