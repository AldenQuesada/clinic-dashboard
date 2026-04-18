-- ============================================================
-- Migration: Growth Risks Snapshot — dashboard rk-1..rk-5
--
-- Story: Fase 4 do Plano de Growth (2026-04-18)
--
-- Monitora os 5 riscos operacionais em uma RPC unica que a UI
-- consome pra mostrar semaforos (OK / WARN / CRITICAL).
--
-- rk-1: Opt-out WA semana (>=5% = CRITICAL, >=3% = WARN)
-- rk-2: Canibalizacao preco parceira (margem media/procedimento)
-- rk-3: Alcance IG (proxy: posts nos ultimos 30d)
-- rk-4: Tier high_perf LTV (auditoria manual-assistida)
-- rk-5: Alternar titulos challenge (ultimo titulo == penultimo = WARN)
--
-- Idempotente. SECURITY DEFINER. Graceful degrade.
-- ============================================================

CREATE OR REPLACE FUNCTION public.growth_risks_snapshot()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_rk1 jsonb;
  v_rk2 jsonb;
  v_rk3 jsonb;
  v_rk4 jsonb;
  v_rk5 jsonb;
BEGIN
  -- ─── rk-1: Opt-out WA nos ultimos 7d ───
  BEGIN
    WITH base AS (
      SELECT
        COUNT(*) FILTER (WHERE opt_out_at IS NOT NULL AND opt_out_at >= now() - interval '7 days')::numeric AS opt_week,
        COUNT(*)::numeric AS total
      FROM public.vpi_partners WHERE clinic_id = v_clinic_id
    )
    SELECT jsonb_build_object(
      'id',       'rk-1',
      'label',    'Opt-out WA (7d)',
      'value',    COALESCE((opt_week / NULLIF(total, 0)) * 100, 0),
      'unit',     '%',
      'threshold_warn',     3,
      'threshold_critical', 5,
      'status',   CASE
                    WHEN total = 0 THEN 'unknown'
                    WHEN (opt_week / NULLIF(total, 0)) * 100 >= 5 THEN 'critical'
                    WHEN (opt_week / NULLIF(total, 0)) * 100 >= 3 THEN 'warn'
                    ELSE 'ok'
                  END,
      'hint',     CASE
                    WHEN total = 0 THEN 'Sem parceiras cadastradas'
                    WHEN (opt_week / NULLIF(total, 0)) * 100 >= 5 THEN 'Pausar broadcast. Opt-out >= 5%'
                    WHEN (opt_week / NULLIF(total, 0)) * 100 >= 3 THEN 'Atencao — revisar frequencia'
                    ELSE 'Operando normal'
                  END,
      'sample_size', total
    ) INTO v_rk1
    FROM base;
  EXCEPTION WHEN OTHERS THEN
    v_rk1 := jsonb_build_object('id','rk-1','label','Opt-out WA (7d)','status','error','hint',SQLERRM);
  END;

  -- ─── rk-2: Canibalizacao preco parceira (margem media ultimos 30d) ───
  BEGIN
    WITH partner_phones AS (
      SELECT DISTINCT right(regexp_replace(phone, '\D', '', 'g'), 8) AS sfx
      FROM public.vpi_partners
      WHERE clinic_id = v_clinic_id AND phone IS NOT NULL AND status = 'ativo'
    ),
    appt_base AS (
      SELECT COALESCE(a.value, 0)::numeric AS preco_eff,
             a.procedure_name,
             (SELECT 1 FROM partner_phones pp WHERE pp.sfx = right(regexp_replace(a.patient_phone, '\D', '', 'g'), 8) LIMIT 1) AS is_partner
      FROM public.appointments a
      WHERE a.status IN ('finalizado','realizado','completed','concluido','done')
        AND a.created_at >= now() - interval '30 days'
        AND COALESCE(a.value, 0) > 0
    )
    SELECT jsonb_build_object(
      'id',       'rk-2',
      'label',    'Canibalizacao preco parceira (30d)',
      'value',    COALESCE(
                    (AVG(preco_eff) FILTER (WHERE is_partner IS NOT NULL)::numeric /
                     NULLIF(AVG(preco_eff) FILTER (WHERE is_partner IS NULL), 0) * 100) - 100
                  , 0),
      'unit',     '% vs regular',
      'threshold_warn',     -20,
      'threshold_critical', -35,
      'status',   CASE
                    WHEN COUNT(*) FILTER (WHERE is_partner IS NOT NULL) < 3 THEN 'unknown'
                    WHEN ((AVG(preco_eff) FILTER (WHERE is_partner IS NOT NULL) /
                           NULLIF(AVG(preco_eff) FILTER (WHERE is_partner IS NULL), 0)) * 100 - 100) <= -35 THEN 'critical'
                    WHEN ((AVG(preco_eff) FILTER (WHERE is_partner IS NOT NULL) /
                           NULLIF(AVG(preco_eff) FILTER (WHERE is_partner IS NULL), 0)) * 100 - 100) <= -20 THEN 'warn'
                    ELSE 'ok'
                  END,
      'hint',     'Diferenca % do ticket medio parceiras vs pacientes regulares',
      'sample_partner',  COUNT(*) FILTER (WHERE is_partner IS NOT NULL),
      'sample_regular',  COUNT(*) FILTER (WHERE is_partner IS NULL)
    ) INTO v_rk2
    FROM appt_base;
  EXCEPTION WHEN OTHERS THEN
    v_rk2 := jsonb_build_object('id','rk-2','label','Canibalizacao preco parceira','status','error','hint',SQLERRM);
  END;

  -- ─── rk-3: Alcance IG (proxy — posts nos ultimos 30d) ───
  BEGIN
    WITH ig_posts AS (
      SELECT COUNT(*)::int AS posted_30d
      FROM public.nps_responses
      WHERE clinic_id = v_clinic_id
        AND instagram_posted_at IS NOT NULL
        AND instagram_posted_at >= now() - interval '30 days'
    )
    SELECT jsonb_build_object(
      'id',       'rk-3',
      'label',    'Posts IG (30d)',
      'value',    posted_30d,
      'unit',     'posts',
      'threshold_warn',     3,
      'threshold_critical', 1,
      'status',   CASE
                    WHEN posted_30d >= 8 THEN 'ok'
                    WHEN posted_30d >= 3 THEN 'warn'
                    ELSE 'critical'
                  END,
      'hint',     CASE
                    WHEN posted_30d >= 8 THEN 'Cadencia saudavel'
                    WHEN posted_30d >= 3 THEN 'Baixa frequencia — algoritmo pode punir'
                    ELSE 'Alcance tende a cair — aumentar cadencia'
                  END,
      'sample_size', posted_30d
    ) INTO v_rk3
    FROM ig_posts;
  EXCEPTION WHEN OTHERS THEN
    v_rk3 := jsonb_build_object('id','rk-3','label','Posts IG (30d)','status','unknown','hint','tabela nps_responses ausente');
  END;

  -- ─── rk-4: Tier high_perf LTV ratio ───
  BEGIN
    WITH tier_base AS (
      SELECT tier_atual, COUNT(*)::int AS qtd, AVG(creditos_total)::numeric AS avg_creds
      FROM public.vpi_partners
      WHERE clinic_id = v_clinic_id AND status = 'ativo'
      GROUP BY tier_atual
    ),
    hp AS (
      SELECT COALESCE(SUM(qtd) FILTER (WHERE tier_atual LIKE 'high_performance%'), 0) AS hp_qtd,
             COALESCE(SUM(qtd), 0) AS total_qtd
      FROM tier_base
    )
    SELECT jsonb_build_object(
      'id',       'rk-4',
      'label',    'Parceiras high_perf',
      'value',    COALESCE((hp_qtd::numeric / NULLIF(total_qtd, 0)) * 100, 0),
      'unit',     '% do total',
      'threshold_warn',     25,
      'threshold_critical', 40,
      'status',   CASE
                    WHEN total_qtd = 0 THEN 'unknown'
                    WHEN (hp_qtd::numeric / NULLIF(total_qtd, 0)) * 100 >= 40 THEN 'critical'
                    WHEN (hp_qtd::numeric / NULLIF(total_qtd, 0)) * 100 >= 25 THEN 'warn'
                    ELSE 'ok'
                  END,
      'hint',     'Concentracao em tier alto — auditar recompensa vs LTV real',
      'sample_size', total_qtd
    ) INTO v_rk4
    FROM hp;
  EXCEPTION WHEN OTHERS THEN
    v_rk4 := jsonb_build_object('id','rk-4','label','Parceiras high_perf','status','error','hint',SQLERRM);
  END;

  -- ─── rk-5: Tema challenge repetido ───
  BEGIN
    WITH ultimos AS (
      SELECT titulo, periodo_inicio
      FROM public.vpi_challenges
      WHERE clinic_id = v_clinic_id
      ORDER BY periodo_inicio DESC NULLS LAST
      LIMIT 2
    ),
    comp AS (
      SELECT
        (SELECT titulo FROM ultimos ORDER BY periodo_inicio DESC LIMIT 1) AS ultimo,
        (SELECT titulo FROM ultimos ORDER BY periodo_inicio DESC OFFSET 1 LIMIT 1) AS penult,
        (SELECT COUNT(*) FROM ultimos) AS qtd
    )
    SELECT jsonb_build_object(
      'id',       'rk-5',
      'label',    'Tema challenge repetido',
      'value',    CASE WHEN ultimo = penult AND penult IS NOT NULL THEN 1 ELSE 0 END,
      'unit',     'flag',
      'status',   CASE
                    WHEN qtd < 2 THEN 'unknown'
                    WHEN ultimo = penult AND penult IS NOT NULL THEN 'warn'
                    ELSE 'ok'
                  END,
      'hint',     CASE
                    WHEN qtd < 2 THEN 'Menos de 2 challenges — historico insuficiente'
                    WHEN ultimo = penult THEN 'Alternar titulo — ultimo e penultimo iguais (' || ultimo || ')'
                    ELSE 'Variedade saudavel'
                  END,
      'last_theme', ultimo
    ) INTO v_rk5
    FROM comp;
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
