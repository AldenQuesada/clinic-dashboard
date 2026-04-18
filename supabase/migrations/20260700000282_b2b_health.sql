-- ============================================================
-- Migration: B2B Health — Fase 2
--
-- Calcula e persiste health_color (green/yellow/red/unknown) por parceria.
-- Replica as regras do B2BHealthService no lado SQL pra que o cron
-- mensal (próxima migration) possa rodar sem JS.
--
-- Regras:
--   red     = DNA < 5 OU metas < 50% OU 2+ eventos atrasados OU 3+ meses inativo
--   yellow  = DNA 5-7 OU metas 50-80% OU 1 evento atrasado OU DNA n/a
--   green   = DNA >= 7 + metas >= 80% + 0 atrasados
--   unknown = status paused/closed
--
-- Fase 2: metas ainda sem 'progress' real (vai na Fase 3) —
-- então por ora só usa DNA + eventos + inatividade.
--
-- Idempotente. SECURITY DEFINER.
-- ============================================================

CREATE OR REPLACE FUNCTION public.b2b_partnership_health_recalc(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_p         public.b2b_partnerships%ROWTYPE;
  v_dna       numeric;
  v_overdue   int;
  v_idle_mo   int;
  v_color     text := 'green';
  v_reasons   text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_p FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  -- Status paused/closed → unknown
  IF v_p.status IN ('paused','closed') THEN
    UPDATE public.b2b_partnerships SET health_color='unknown' WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'color', 'unknown', 'reasons', ARRAY['Status ' || v_p.status]);
  END IF;

  -- DNA
  IF v_p.dna_excelencia IS NULL OR v_p.dna_estetica IS NULL OR v_p.dna_proposito IS NULL THEN
    v_reasons := array_append(v_reasons, 'DNA não avaliado');
    v_color := 'yellow';
  ELSE
    v_dna := (v_p.dna_excelencia + v_p.dna_estetica + v_p.dna_proposito)::numeric / 3;
    IF v_dna < 5 THEN
      v_reasons := array_append(v_reasons, 'DNA crítico (' || round(v_dna, 1) || ')');
      v_color := 'red';
    ELSIF v_dna < 7 THEN
      v_reasons := array_append(v_reasons, 'DNA abaixo do ideal (' || round(v_dna, 1) || ')');
      IF v_color = 'green' THEN v_color := 'yellow'; END IF;
    END IF;
  END IF;

  -- Eventos atrasados
  SELECT COUNT(*) INTO v_overdue
    FROM public.b2b_partnership_events
   WHERE partnership_id = p_id
     AND status = 'planned'
     AND next_occurrence IS NOT NULL
     AND next_occurrence < now();

  IF v_overdue >= 2 THEN
    v_reasons := array_append(v_reasons, v_overdue || ' eventos atrasados');
    v_color := 'red';
  ELSIF v_overdue = 1 THEN
    v_reasons := array_append(v_reasons, '1 evento atrasado');
    IF v_color = 'green' THEN v_color := 'yellow'; END IF;
  END IF;

  -- Inatividade (usa updated_at)
  v_idle_mo := EXTRACT(EPOCH FROM (now() - v_p.updated_at)) / (86400 * 30);
  IF v_idle_mo >= 3 AND v_p.status = 'active' THEN
    v_reasons := array_append(v_reasons, v_idle_mo || ' meses sem atualização');
    v_color := 'red';
  END IF;

  -- Status prospect/dna_check = sempre yellow (não maduro)
  IF v_p.status IN ('prospect','dna_check') AND v_color = 'green' THEN
    v_color := 'yellow';
    v_reasons := array_append(v_reasons, 'Em ' || v_p.status);
  END IF;

  UPDATE public.b2b_partnerships
     SET health_color = v_color, updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'color', v_color, 'reasons', v_reasons);
END $$;


CREATE OR REPLACE FUNCTION public.b2b_partnership_health_recalc_all()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_row       record;
  v_count     int := 0;
BEGIN
  FOR v_row IN
    SELECT id FROM public.b2b_partnerships WHERE clinic_id = v_clinic_id
  LOOP
    PERFORM public.b2b_partnership_health_recalc(v_row.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'recalculated', v_count);
END $$;


-- ── Snapshot agregado (pro dashboard) ────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_health_snapshot()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_counts    jsonb;
  v_critical  jsonb;  -- detalhe das amarelas+vermelhas
  v_total_active int;
  v_total_all    int;
BEGIN
  SELECT jsonb_build_object(
    'green',   COUNT(*) FILTER (WHERE health_color='green'),
    'yellow',  COUNT(*) FILTER (WHERE health_color='yellow'),
    'red',     COUNT(*) FILTER (WHERE health_color='red'),
    'unknown', COUNT(*) FILTER (WHERE health_color='unknown' OR health_color IS NULL)
  ),
  COUNT(*) FILTER (WHERE status IN ('active','review','contract','paused')),
  COUNT(*)
  INTO v_counts, v_total_active, v_total_all
  FROM public.b2b_partnerships
  WHERE clinic_id = v_clinic_id;

  -- Lista das amarelas + vermelhas pra ação imediata
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'pillar', pillar, 'tier', tier,
      'status', status, 'health_color', health_color,
      'dna_score', dna_score,
      'contact_name', contact_name, 'contact_phone', contact_phone
    )
    ORDER BY CASE health_color WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 ELSE 2 END, tier NULLS LAST, name
  ), '[]'::jsonb)
  INTO v_critical
  FROM public.b2b_partnerships
  WHERE clinic_id = v_clinic_id
    AND health_color IN ('red','yellow')
    AND status NOT IN ('closed');

  RETURN jsonb_build_object(
    'ok',           true,
    'generated_at', now(),
    'counts',       v_counts,
    'total_active', v_total_active,
    'total_all',    v_total_all,
    'critical',     v_critical
  );
END $$;


GRANT EXECUTE ON FUNCTION public.b2b_partnership_health_recalc(uuid)        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnership_health_recalc_all()        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_health_snapshot()                      TO anon, authenticated, service_role;
