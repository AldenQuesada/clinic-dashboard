-- ============================================================
-- Migration: VPI Strategic KPIs (Fase 6 - Entrega 3)
--
-- Substitui os 4 KPIs legacy por:
--   1. K-factor — indicacoes_fechadas / parceiras_ativas (metrica-mae)
--   2. Faturamento indicado (R$) — soma de procedures das ind. closed
--   3. Indicacoes fechadas no periodo
--   4. Parceiras dormentes (N + ids)
--
-- RPC vpi_kpis_strategic(p_period_days, p_valor_medio_fallback)
-- Retorna jsonb completo: value + delta_vs_prev + formula/ids por KPI.
--
-- Idempotente (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.vpi_kpis_strategic(
  p_period_days int DEFAULT 30,
  p_valor_medio_fallback int DEFAULT 1200
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_period    int  := GREATEST(1, COALESCE(p_period_days, 30));
  v_fb        int  := GREATEST(0, COALESCE(p_valor_medio_fallback, 1200));
  v_now       timestamptz := now();

  -- periodo atual
  v_cur_start timestamptz;
  v_prev_start timestamptz;
  v_prev_end   timestamptz;

  v_ind_cur      int := 0;
  v_ind_prev     int := 0;
  v_ind_delta    int := 0;

  v_partners_cur int := 0;
  v_partners_prev int := 0;

  v_k_cur        numeric := 0;
  v_k_prev       numeric := 0;
  v_k_delta      numeric := 0;

  v_fat_cur      numeric := 0;
  v_fat_prev     numeric := 0;
  v_fat_delta    numeric := 0;

  v_dormant      jsonb;
  v_dormant_ids  jsonb;
  v_dormant_cnt  int := 0;
BEGIN
  v_cur_start  := v_now - (v_period || ' days')::interval;
  v_prev_end   := v_cur_start;
  v_prev_start := v_cur_start - (v_period || ' days')::interval;

  -- ── Ind. fechadas no periodo atual vs anterior ──
  SELECT COUNT(*)::int INTO v_ind_cur
    FROM public.vpi_indications
   WHERE clinic_id = v_clinic_id
     AND status    = 'closed'
     AND fechada_em >= v_cur_start;

  SELECT COUNT(*)::int INTO v_ind_prev
    FROM public.vpi_indications
   WHERE clinic_id = v_clinic_id
     AND status    = 'closed'
     AND fechada_em >= v_prev_start
     AND fechada_em <  v_prev_end;

  v_ind_delta := v_ind_cur - v_ind_prev;

  -- ── Parceiras ativas no INICIO de cada janela ──
  SELECT COUNT(*)::int INTO v_partners_cur
    FROM public.vpi_partners
   WHERE clinic_id = v_clinic_id
     AND status    = 'ativo'
     AND created_at <= v_cur_start;

  SELECT COUNT(*)::int INTO v_partners_prev
    FROM public.vpi_partners
   WHERE clinic_id = v_clinic_id
     AND status    = 'ativo'
     AND created_at <= v_prev_start;

  -- ── K-factor ──
  IF v_partners_cur > 0 THEN
    v_k_cur := ROUND((v_ind_cur::numeric / v_partners_cur::numeric), 2);
  END IF;
  IF v_partners_prev > 0 THEN
    v_k_prev := ROUND((v_ind_prev::numeric / v_partners_prev::numeric), 2);
  END IF;
  v_k_delta := v_k_cur - v_k_prev;

  -- ── Faturamento indicado ──
  -- Tenta buscar valor real via JOIN com appointments; fallback = count x v_fb
  WITH indic_cur AS (
    SELECT i.appt_id
      FROM public.vpi_indications i
     WHERE i.clinic_id = v_clinic_id
       AND i.status    = 'closed'
       AND i.fechada_em >= v_cur_start
  ),
  faturamento AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN a.value IS NOT NULL AND a.value > 0 THEN a.value
        ELSE v_fb
      END
    ), 0)::numeric AS total
      FROM indic_cur ic
      LEFT JOIN public.appointments a
        ON a.id::text = ic.appt_id
       AND a.clinic_id = v_clinic_id
       AND a.deleted_at IS NULL
  )
  SELECT total INTO v_fat_cur FROM faturamento;

  -- Fallback: se nenhum appt encontrado (campo appt_id nulo em muitas ind), conta x fb
  IF v_fat_cur = 0 AND v_ind_cur > 0 THEN
    v_fat_cur := v_ind_cur::numeric * v_fb;
  END IF;

  -- Previo
  WITH indic_prev AS (
    SELECT i.appt_id
      FROM public.vpi_indications i
     WHERE i.clinic_id = v_clinic_id
       AND i.status    = 'closed'
       AND i.fechada_em >= v_prev_start
       AND i.fechada_em <  v_prev_end
  ),
  faturamento_prev AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN a.value IS NOT NULL AND a.value > 0 THEN a.value
        ELSE v_fb
      END
    ), 0)::numeric AS total
      FROM indic_prev ip
      LEFT JOIN public.appointments a
        ON a.id::text = ip.appt_id
       AND a.clinic_id = v_clinic_id
       AND a.deleted_at IS NULL
  )
  SELECT total INTO v_fat_prev FROM faturamento_prev;

  IF v_fat_prev = 0 AND v_ind_prev > 0 THEN
    v_fat_prev := v_ind_prev::numeric * v_fb;
  END IF;

  IF v_fat_prev > 0 THEN
    v_fat_delta := ROUND(((v_fat_cur - v_fat_prev) / v_fat_prev) * 100, 1);
  ELSE
    v_fat_delta := 0;
  END IF;

  -- ── Dormentes (reusa vpi_dormant_partners_scan) ──
  BEGIN
    v_dormant := public.vpi_dormant_partners_scan();
  EXCEPTION WHEN OTHERS THEN
    v_dormant := '[]'::jsonb;
  END;

  v_dormant_cnt := jsonb_array_length(COALESCE(v_dormant, '[]'::jsonb));
  SELECT COALESCE(jsonb_agg(elem->>'id'), '[]'::jsonb) INTO v_dormant_ids
    FROM jsonb_array_elements(COALESCE(v_dormant, '[]'::jsonb)) elem;

  -- ── Output ──────────────────────────────────────
  RETURN jsonb_build_object(
    'period_days', v_period,
    'k_factor', jsonb_build_object(
      'value',         v_k_cur,
      'value_prev',    v_k_prev,
      'delta_abs',     v_k_delta,
      'delta_pct',     CASE WHEN v_k_prev > 0 THEN ROUND(((v_k_cur - v_k_prev) / v_k_prev) * 100, 1) ELSE 0 END,
      'formula',       'ind_fechadas / parceiras_ativas',
      'ind_fechadas',  v_ind_cur,
      'parceiras_ativas', v_partners_cur
    ),
    'faturamento_mes', jsonb_build_object(
      'value',      v_fat_cur,
      'value_prev', v_fat_prev,
      'delta_pct',  v_fat_delta,
      'currency',   'BRL',
      'valor_medio_fallback', v_fb
    ),
    'ind_fechadas_mes', jsonb_build_object(
      'value',      v_ind_cur,
      'value_prev', v_ind_prev,
      'delta_abs',  v_ind_delta,
      'delta_pct',  CASE WHEN v_ind_prev > 0 THEN ROUND(((v_ind_cur - v_ind_prev)::numeric / v_ind_prev::numeric) * 100, 1) ELSE 0 END
    ),
    'dormentes', jsonb_build_object(
      'value',       v_dormant_cnt,
      'ids',         v_dormant_ids,
      'cta_action',  'send_dormant_reminders'
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_kpis_strategic(int, int) TO authenticated;

-- ── Sanity ─────────────────────────────────────────────────
DO $$
DECLARE v_r jsonb;
BEGIN
  SELECT public.vpi_kpis_strategic(30, 1200) INTO v_r;
  RAISE NOTICE '[vpi_kpis_strategic] k=% fat=% ind=% dormentes=%',
    v_r->'k_factor'->>'value',
    v_r->'faturamento_mes'->>'value',
    v_r->'ind_fechadas_mes'->>'value',
    v_r->'dormentes'->>'value';
END $$;
