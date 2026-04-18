-- ============================================================
-- Migration: NSM snapshot + deltas nos riscos
--
-- UX optimizations (2026-04-18):
--   1) RPC growth_nsm_snapshot() — metrica-mae do plano de growth:
--      Agendamentos finalizados no mes + vs mes anterior (delta).
--   2) Estende growth_risks_snapshot() com `delta_7d` em cada risco
--      pra permitir cards com direcao (melhorando/piorando).
--
-- Idempotente. SECURITY DEFINER. Graceful degrade.
-- ============================================================

-- ── NSM: Agendamentos finalizados ────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_nsm_snapshot()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_now       timestamptz := now();
  v_cur_from  timestamptz;
  v_cur_to    timestamptz;
  v_prev_from timestamptz;
  v_prev_to   timestamptz;
  v_cur_count int;
  v_prev_count int;
  v_cur_value  numeric;
  v_prev_value numeric;
  v_delta_pct  numeric;
BEGIN
  -- Mes atual (do dia 1 ao fim de hoje)
  v_cur_from  := date_trunc('month', v_now);
  v_cur_to    := v_now;
  -- Mes anterior (mesma janela relativa: dia 1 ao mesmo dia do mes passado)
  v_prev_from := date_trunc('month', v_now - interval '1 month');
  v_prev_to   := v_prev_from + (v_now - v_cur_from);

  BEGIN
    SELECT COUNT(*)::int, COALESCE(SUM(COALESCE(value, 0)), 0)::numeric
      INTO v_cur_count, v_cur_value
      FROM public.appointments
     WHERE clinic_id = v_clinic_id
       AND status IN ('finalizado','realizado','completed','concluido','done')
       AND created_at >= v_cur_from AND created_at <= v_cur_to;

    SELECT COUNT(*)::int, COALESCE(SUM(COALESCE(value, 0)), 0)::numeric
      INTO v_prev_count, v_prev_value
      FROM public.appointments
     WHERE clinic_id = v_clinic_id
       AND status IN ('finalizado','realizado','completed','concluido','done')
       AND created_at >= v_prev_from AND created_at <= v_prev_to;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  v_delta_pct := CASE
    WHEN v_prev_count = 0 AND v_cur_count > 0 THEN 100
    WHEN v_prev_count = 0 THEN 0
    ELSE ((v_cur_count - v_prev_count)::numeric / v_prev_count) * 100
  END;

  RETURN jsonb_build_object(
    'ok',              true,
    'metric',          'Agendamentos finalizados / mes',
    'current_count',   v_cur_count,
    'current_value',   v_cur_value,
    'previous_count',  v_prev_count,
    'previous_value',  v_prev_value,
    'delta_pct',       round(v_delta_pct, 1),
    'period_from',     v_cur_from,
    'period_to',       v_cur_to,
    'prev_period_from', v_prev_from,
    'prev_period_to',   v_prev_to
  );
END $$;

GRANT EXECUTE ON FUNCTION public.growth_nsm_snapshot()
  TO anon, authenticated, service_role;


-- ── Riscos com delta 7d ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_risks_snapshot()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_rk1 jsonb; v_rk2 jsonb; v_rk3 jsonb; v_rk4 jsonb; v_rk5 jsonb;
BEGIN
  -- ─── rk-1: Opt-out WA 7d (com delta vs 7-14d atras) ───
  BEGIN
    WITH base AS (
      SELECT
        COUNT(*) FILTER (WHERE opt_out_at IS NOT NULL AND opt_out_at >= now() - interval '7 days')::numeric AS cur_opt,
        COUNT(*) FILTER (WHERE opt_out_at IS NOT NULL AND opt_out_at >= now() - interval '14 days' AND opt_out_at < now() - interval '7 days')::numeric AS prev_opt,
        COUNT(*)::numeric AS total
      FROM public.vpi_partners WHERE clinic_id = v_clinic_id
    )
    SELECT jsonb_build_object(
      'id', 'rk-1',
      'label', 'Opt-out WA (7d)',
      'value', COALESCE((cur_opt / NULLIF(total, 0)) * 100, 0),
      'prev_value', COALESCE((prev_opt / NULLIF(total, 0)) * 100, 0),
      'delta', COALESCE((cur_opt / NULLIF(total, 0)) * 100, 0) - COALESCE((prev_opt / NULLIF(total, 0)) * 100, 0),
      'delta_direction_good', 'down',
      'unit', '%',
      'status', CASE
        WHEN total = 0 THEN 'unknown'
        WHEN (cur_opt / NULLIF(total, 0)) * 100 >= 5 THEN 'critical'
        WHEN (cur_opt / NULLIF(total, 0)) * 100 >= 3 THEN 'warn'
        ELSE 'ok'
      END,
      'hint', CASE
        WHEN total = 0 THEN 'Sem parceiras cadastradas'
        WHEN (cur_opt / NULLIF(total, 0)) * 100 >= 5 THEN 'Pausar broadcast. Opt-out >= 5%'
        WHEN (cur_opt / NULLIF(total, 0)) * 100 >= 3 THEN 'Atencao — revisar frequencia'
        ELSE 'Operando normal'
      END,
      'sample_size', total
    ) INTO v_rk1 FROM base;
  EXCEPTION WHEN OTHERS THEN
    v_rk1 := jsonb_build_object('id','rk-1','label','Opt-out WA (7d)','status','error','hint',SQLERRM);
  END;

  -- ─── rk-2: Canibalizacao preco (30d) — sem delta util aqui ───
  BEGIN
    WITH partner_phones AS (
      SELECT DISTINCT right(regexp_replace(phone, '\D', '', 'g'), 8) AS sfx
      FROM public.vpi_partners WHERE clinic_id = v_clinic_id AND phone IS NOT NULL AND status = 'ativo'
    ),
    appt_base AS (
      SELECT COALESCE(a.value, 0)::numeric AS preco_eff,
             (SELECT 1 FROM partner_phones pp WHERE pp.sfx = right(regexp_replace(a.patient_phone, '\D', '', 'g'), 8) LIMIT 1) AS is_partner
      FROM public.appointments a
      WHERE a.status IN ('finalizado','realizado','completed','concluido','done')
        AND a.created_at >= now() - interval '30 days'
        AND COALESCE(a.value, 0) > 0
    )
    SELECT jsonb_build_object(
      'id', 'rk-2',
      'label', 'Canibalizacao preco parceira (30d)',
      'value', COALESCE(
        (AVG(preco_eff) FILTER (WHERE is_partner IS NOT NULL)::numeric /
         NULLIF(AVG(preco_eff) FILTER (WHERE is_partner IS NULL), 0) * 100) - 100
      , 0),
      'delta', 0, 'delta_direction_good', 'up',
      'unit', '% vs regular',
      'status', CASE
        WHEN COUNT(*) FILTER (WHERE is_partner IS NOT NULL) < 3 THEN 'unknown'
        WHEN ((AVG(preco_eff) FILTER (WHERE is_partner IS NOT NULL) /
               NULLIF(AVG(preco_eff) FILTER (WHERE is_partner IS NULL), 0)) * 100 - 100) <= -35 THEN 'critical'
        WHEN ((AVG(preco_eff) FILTER (WHERE is_partner IS NOT NULL) /
               NULLIF(AVG(preco_eff) FILTER (WHERE is_partner IS NULL), 0)) * 100 - 100) <= -20 THEN 'warn'
        ELSE 'ok'
      END,
      'hint', 'Diferenca % do ticket medio parceiras vs regulares',
      'sample_partner', COUNT(*) FILTER (WHERE is_partner IS NOT NULL),
      'sample_regular', COUNT(*) FILTER (WHERE is_partner IS NULL)
    ) INTO v_rk2 FROM appt_base;
  EXCEPTION WHEN OTHERS THEN
    v_rk2 := jsonb_build_object('id','rk-2','label','Canibalizacao preco','status','error','hint',SQLERRM);
  END;

  -- ─── rk-3: Posts IG 30d (delta vs 30-60d atras) ───
  BEGIN
    WITH ig AS (
      SELECT
        COUNT(*) FILTER (WHERE instagram_posted_at >= now() - interval '30 days')::int AS cur,
        COUNT(*) FILTER (WHERE instagram_posted_at >= now() - interval '60 days' AND instagram_posted_at < now() - interval '30 days')::int AS prev
      FROM public.nps_responses
      WHERE clinic_id = v_clinic_id AND instagram_posted_at IS NOT NULL
    )
    SELECT jsonb_build_object(
      'id', 'rk-3',
      'label', 'Posts IG (30d)',
      'value', cur,
      'prev_value', prev,
      'delta', cur - prev,
      'delta_direction_good', 'up',
      'unit', 'posts',
      'status', CASE
        WHEN cur >= 8 THEN 'ok'
        WHEN cur >= 3 THEN 'warn'
        ELSE 'critical'
      END,
      'hint', CASE
        WHEN cur >= 8 THEN 'Cadencia saudavel'
        WHEN cur >= 3 THEN 'Baixa frequencia'
        ELSE 'Aumentar cadencia'
      END,
      'sample_size', cur
    ) INTO v_rk3 FROM ig;
  EXCEPTION WHEN OTHERS THEN
    v_rk3 := jsonb_build_object('id','rk-3','label','Posts IG (30d)','status','unknown','hint','tabela nps_responses ausente');
  END;

  -- ─── rk-4: Parceiras high_perf % ───
  BEGIN
    WITH tb AS (
      SELECT
        COUNT(*) FILTER (WHERE tier_atual LIKE 'high_performance%')::numeric AS hp,
        COUNT(*)::numeric AS total
      FROM public.vpi_partners
      WHERE clinic_id = v_clinic_id AND status = 'ativo'
    )
    SELECT jsonb_build_object(
      'id', 'rk-4',
      'label', 'Parceiras high_perf',
      'value', COALESCE((hp / NULLIF(total, 0)) * 100, 0),
      'delta', 0, 'delta_direction_good', 'up',
      'unit', '% do total',
      'status', CASE
        WHEN total = 0 THEN 'unknown'
        WHEN (hp / NULLIF(total, 0)) * 100 >= 40 THEN 'critical'
        WHEN (hp / NULLIF(total, 0)) * 100 >= 25 THEN 'warn'
        ELSE 'ok'
      END,
      'hint', 'Auditar recompensa vs LTV',
      'sample_size', total
    ) INTO v_rk4 FROM tb;
  EXCEPTION WHEN OTHERS THEN
    v_rk4 := jsonb_build_object('id','rk-4','label','Parceiras high_perf','status','error','hint',SQLERRM);
  END;

  -- ─── rk-5: Tema challenge repetido ───
  BEGIN
    WITH ultimos AS (
      SELECT titulo FROM public.vpi_challenges
      WHERE clinic_id = v_clinic_id
      ORDER BY periodo_inicio DESC NULLS LAST LIMIT 2
    ),
    comp AS (
      SELECT
        (SELECT titulo FROM ultimos LIMIT 1) AS ultimo,
        (SELECT titulo FROM ultimos OFFSET 1 LIMIT 1) AS penult,
        (SELECT COUNT(*) FROM ultimos) AS qtd
    )
    SELECT jsonb_build_object(
      'id', 'rk-5',
      'label', 'Tema challenge repetido',
      'value', CASE WHEN ultimo = penult AND penult IS NOT NULL THEN 1 ELSE 0 END,
      'delta', 0, 'delta_direction_good', 'down',
      'unit', 'flag',
      'status', CASE
        WHEN qtd < 2 THEN 'unknown'
        WHEN ultimo = penult AND penult IS NOT NULL THEN 'warn'
        ELSE 'ok'
      END,
      'hint', CASE
        WHEN qtd < 2 THEN 'Historico insuficiente'
        WHEN ultimo = penult THEN 'Alternar tema (' || ultimo || ')'
        ELSE 'Variedade saudavel'
      END,
      'last_theme', ultimo
    ) INTO v_rk5 FROM comp;
  EXCEPTION WHEN OTHERS THEN
    v_rk5 := jsonb_build_object('id','rk-5','label','Tema challenge repetido','status','unknown','hint','tabela vpi_challenges ausente');
  END;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'risks', jsonb_build_array(v_rk1, v_rk2, v_rk3, v_rk4, v_rk5)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.growth_risks_snapshot()
  TO anon, authenticated, service_role;
