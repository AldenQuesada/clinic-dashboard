-- ============================================================
-- Migration: Cashflow Forecast — Cobertura de Despesas Fixas
-- Projeta receita comprometida + projetada vs gastos fixos +
-- variaveis (historicos do OFX) pra os proximos N meses
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashflow_forecast(
  p_months_ahead int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id     uuid := public._sdr_clinic_id();
  v_now           date := CURRENT_DATE;
  v_curr_month    date := date_trunc('month', v_now)::date;
  v_total_fixos   numeric := 0;
  v_var_avg_3m    numeric := 0;  -- media variaveis (debits) ultimos 3 meses
  v_rev_avg_3m    numeric := 0;  -- media receita ultimos 3 meses
  v_gastos        jsonb;
  v_fix_item      jsonb;
  v_months_arr    jsonb := '[]'::jsonb;
  v_critical_count int := 0;
  v_result        jsonb;
  i               int;
  v_target_month  date;
  v_target_start  date;
  v_target_end    date;
  v_committed     numeric;
  v_projected     numeric;
  v_total_rev     numeric;
  v_var_est       numeric;
  v_sobra         numeric;
  v_cobertura     numeric;
  v_status        text;
  v_seasonal      boolean;
  v_month_num     int;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  -- 1. Soma gastos fixos cadastrados em fin_config.gastos.fixos
  SELECT gastos INTO v_gastos FROM public.fin_config WHERE clinic_id = v_clinic_id;
  IF v_gastos IS NOT NULL AND v_gastos->'fixos' IS NOT NULL THEN
    FOR v_fix_item IN SELECT * FROM jsonb_array_elements(v_gastos->'fixos')
    LOOP
      v_total_fixos := v_total_fixos + COALESCE((v_fix_item->>'valor')::numeric, 0);
    END LOOP;
  END IF;

  -- 2. Media de despesas variaveis (debits) dos ultimos 3 meses (REAL do OFX)
  SELECT COALESCE(SUM(amount), 0) / 3.0
  INTO v_var_avg_3m
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'debit'
    AND transaction_date >= (v_curr_month - interval '3 months')::date
    AND transaction_date < v_curr_month;

  -- 3. Media de receita real ultimos 3 meses (pra projecao)
  SELECT COALESCE(SUM(amount), 0) / 3.0
  INTO v_rev_avg_3m
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'credit'
    AND transaction_date >= (v_curr_month - interval '3 months')::date
    AND transaction_date < v_curr_month;

  -- 4. Loop pelos N meses futuros
  FOR i IN 0..(p_months_ahead - 1)
  LOOP
    v_target_month := (v_curr_month + (i || ' month')::interval)::date;
    v_target_start := v_target_month;
    v_target_end   := (v_target_start + interval '1 month - 1 day')::date;
    v_month_num    := EXTRACT(MONTH FROM v_target_month)::int;

    -- Receita comprometida: parcelas pendentes para esse mes
    SELECT COALESCE(SUM(amount), 0)
    INTO v_committed
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND match_confidence = 'pending_bank_confirmation'
      AND transaction_date BETWEEN v_target_start AND v_target_end;

    -- Receita projetada: media historica MENOS o ja comprometido (evita dobra)
    v_projected := GREATEST(0, v_rev_avg_3m - v_committed);
    v_total_rev := v_committed + v_projected;

    -- Variaveis estimadas: media historica de debits
    v_var_est := v_var_avg_3m;

    -- Sobra = Total Receita - Fixos - Variaveis
    v_sobra := v_total_rev - v_total_fixos - v_var_est;

    -- Cobertura % = (Receita Comprometida / Fixos) * 100
    -- (so olha pra receita JA garantida vs fixos)
    v_cobertura := CASE WHEN v_total_fixos > 0
                     THEN ROUND((v_committed / v_total_fixos) * 100, 1)
                     ELSE 0 END;

    -- Status baseado na cobertura comprometida
    v_status := CASE
      WHEN v_cobertura >= 100 THEN 'cobre'
      WHEN v_cobertura >= 50  THEN 'risco'
      ELSE 'critico'
    END;

    -- Sazonalidade: Janeiro/Fevereiro/Marco = mes critico (pos festas + carnaval)
    v_seasonal := v_month_num IN (1, 2, 3);

    IF v_status = 'critico' OR (v_seasonal AND v_cobertura < 80) THEN
      v_critical_count := v_critical_count + 1;
    END IF;

    v_months_arr := v_months_arr || jsonb_build_array(jsonb_build_object(
      'month',         v_target_month,
      'month_num',     v_month_num,
      'committed',     ROUND(v_committed, 2),
      'projected',     ROUND(v_projected, 2),
      'total_revenue', ROUND(v_total_rev, 2),
      'fixos',         ROUND(v_total_fixos, 2),
      'variaveis',     ROUND(v_var_est, 2),
      'sobra',         ROUND(v_sobra, 2),
      'cobertura_pct', v_cobertura,
      'status',        v_status,
      'seasonal',      v_seasonal
    ));
  END LOOP;

  -- Resumo
  RETURN jsonb_build_object(
    'config', jsonb_build_object(
      'months_ahead',  p_months_ahead,
      'total_fixos',   ROUND(v_total_fixos, 2),
      'var_avg_3m',    ROUND(v_var_avg_3m, 2),
      'rev_avg_3m',    ROUND(v_rev_avg_3m, 2),
      'fixos_count',   COALESCE(jsonb_array_length(v_gastos->'fixos'), 0)
    ),
    'months', v_months_arr,
    'summary', jsonb_build_object(
      'critical_count',  v_critical_count,
      'has_critical',    v_critical_count > 0
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_forecast(int) TO authenticated;

COMMENT ON FUNCTION public.cashflow_forecast IS
  'Forecast N meses: receita comprometida (parcelas) + projetada (media 3m) vs gastos fixos (fin_config) + variaveis (media 3m OFX). Sazonalidade Jan-Mar critica.';
