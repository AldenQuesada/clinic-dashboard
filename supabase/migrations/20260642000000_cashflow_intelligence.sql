-- ============================================================
-- Migration: Cashflow Intelligence RPC
-- Retorna dados decisorios em uma chamada:
--   - comparativo vs mes anterior
--   - saldo projetado fim do mes
--   - meta vs realizado (de fin_goals)
--   - recebiveis proximos 30d
--   - pacientes inadimplentes
--   - alertas (receita caindo, concentracao, etc)
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashflow_intelligence(
  p_year  int DEFAULT NULL,
  p_month int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id     uuid := public._sdr_clinic_id();
  v_year          int  := COALESCE(p_year,  EXTRACT(YEAR  FROM CURRENT_DATE)::int);
  v_month         int  := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::int);
  v_start         date;
  v_end           date;
  v_days_in_month int;
  v_days_passed   int;
  v_prev_start    date;
  v_prev_end      date;

  -- Periodo atual
  v_credits       numeric := 0;
  v_debits        numeric := 0;
  v_count         int     := 0;

  -- Periodo anterior
  v_prev_credits  numeric := 0;
  v_prev_debits   numeric := 0;

  -- Projecao
  v_daily_avg     numeric := 0;
  v_projected     numeric := 0;

  -- Meta (fin_goals)
  v_meta          numeric := 0;
  v_meta_pct      numeric := 0;
  v_meta_prorata  numeric := 0;

  -- Recebiveis
  v_receivables_total numeric := 0;
  v_receivables_count int     := 0;
  v_receivables_list  jsonb   := '[]'::jsonb;

  -- Inadimplentes
  v_debtors_total numeric := 0;
  v_debtors_count int     := 0;
  v_debtors_list  jsonb   := '[]'::jsonb;

  -- Alertas
  v_alerts        jsonb   := '[]'::jsonb;
  v_last7_credits numeric := 0;
  v_avg30_daily   numeric := 0;

BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  v_start         := make_date(v_year, v_month, 1);
  v_end           := (v_start + interval '1 month - 1 day')::date;
  v_days_in_month := EXTRACT(DAY FROM v_end)::int;
  v_days_passed   := LEAST(v_days_in_month, GREATEST(1, (CURRENT_DATE - v_start + 1)::int));

  v_prev_start := (v_start - interval '1 month')::date;
  v_prev_end   := (v_start - interval '1 day')::date;

  -- ── 1. Periodo atual ────────────────────────────────────
  SELECT
    COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END), 0),
    COUNT(*)
  INTO v_credits, v_debits, v_count
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND transaction_date BETWEEN v_start AND v_end;

  -- ── 2. Periodo anterior ─────────────────────────────────
  SELECT
    COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END), 0)
  INTO v_prev_credits, v_prev_debits
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND transaction_date BETWEEN v_prev_start AND v_prev_end;

  -- ── 3. Projecao saldo fim do mes ────────────────────────
  IF v_days_passed > 0 THEN
    v_daily_avg := v_credits / v_days_passed;
    v_projected := v_daily_avg * v_days_in_month;
  END IF;

  -- ── 4. Meta (fin_goals) ─────────────────────────────────
  SELECT COALESCE((meta_data->>'meta')::numeric, 0)
  INTO v_meta
  FROM public.fin_goals
  WHERE clinic_id = v_clinic_id
    AND year      = v_year
    AND month     = v_month
  LIMIT 1;

  IF v_meta > 0 THEN
    v_meta_pct     := (v_credits / v_meta) * 100;
    v_meta_prorata := (v_meta / v_days_in_month) * v_days_passed;
  END IF;

  -- ── 5. Recebiveis proximos 30 dias ──────────────────────
  -- (a) Parcelas do cashflow_entries com status pending_bank_confirmation
  -- (b) Saldos pendentes de appointments (entrada + saldo, parcelados)
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_receivables_total, v_receivables_count
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'credit'
    AND match_confidence = 'pending_bank_confirmation'
    AND transaction_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30;

  -- Lista top 5 recebiveis
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           c.id,
    'date',         c.transaction_date,
    'amount',       c.amount,
    'description',  c.description,
    'patient_name', p.name
  ) ORDER BY c.transaction_date), '[]'::jsonb)
  INTO v_receivables_list
  FROM (
    SELECT id, transaction_date, amount, description, patient_id
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND match_confidence = 'pending_bank_confirmation'
      AND transaction_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
    ORDER BY transaction_date
    LIMIT 5
  ) c
  LEFT JOIN public.patients p ON p.id = c.patient_id;

  -- ── 6. Pacientes inadimplentes (appointments com saldo pendente) ──
  SELECT
    COALESCE(SUM(GREATEST(0,
      COALESCE((data->>'valor')::numeric, 0) - COALESCE((data->>'valorPago')::numeric, 0)
    )), 0),
    COUNT(*) FILTER (WHERE
      COALESCE((data->>'statusPagamento'), '') IN ('parcial', 'pendente')
      AND COALESCE((data->>'valor')::numeric, 0) > COALESCE((data->>'valorPago')::numeric, 0)
    )
  INTO v_debtors_total, v_debtors_count
  FROM public.appointments
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND status IN ('finalizado', 'concluido', 'compareceu')
    AND date BETWEEN v_start - 90 AND v_end
    AND COALESCE((data->>'statusPagamento'), '') IN ('parcial', 'pendente')
    AND COALESCE((data->>'valor')::numeric, 0) > COALESCE((data->>'valorPago')::numeric, 0);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'appointment_id', a.id,
    'patient_id',     a.patient_id,
    'patient_name',   p.name,
    'date',           a.date,
    'valor',          (a.data->>'valor')::numeric,
    'valor_pago',     COALESCE((a.data->>'valorPago')::numeric, 0),
    'saldo',          COALESCE((a.data->>'valor')::numeric, 0) - COALESCE((a.data->>'valorPago')::numeric, 0)
  ) ORDER BY a.date DESC), '[]'::jsonb)
  INTO v_debtors_list
  FROM (
    SELECT id, patient_id, date, data
    FROM public.appointments
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND status IN ('finalizado', 'concluido', 'compareceu')
      AND date BETWEEN v_start - 90 AND v_end
      AND COALESCE((data->>'statusPagamento'), '') IN ('parcial', 'pendente')
      AND COALESCE((data->>'valor')::numeric, 0) > COALESCE((data->>'valorPago')::numeric, 0)
    ORDER BY date DESC
    LIMIT 10
  ) a
  LEFT JOIN public.patients p ON p.id = a.patient_id;

  -- ── 7. Alertas ──────────────────────────────────────────

  -- Alerta A: receita ultimos 7 dias vs media diaria 30 dias
  SELECT COALESCE(SUM(amount), 0)
  INTO v_last7_credits
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'credit'
    AND transaction_date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE;

  SELECT COALESCE(SUM(amount), 0) / 30.0
  INTO v_avg30_daily
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'credit'
    AND transaction_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE;

  -- Compara media diaria 7d vs media 30d
  IF v_avg30_daily > 0 AND (v_last7_credits / 7.0) < (v_avg30_daily * 0.85) THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type',     'revenue_drop',
      'severity', 'warning',
      'icon',     'trending-down',
      'title',    'Receita caindo',
      'message',  'Media diaria dos ultimos 7 dias ' ||
                  ROUND((1 - (v_last7_credits / 7.0) / NULLIF(v_avg30_daily, 0)) * 100, 1)::text ||
                  '% abaixo da media de 30 dias'
    ));
  ELSIF v_avg30_daily > 0 AND (v_last7_credits / 7.0) > (v_avg30_daily * 1.20) THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type',     'revenue_up',
      'severity', 'success',
      'icon',     'trending-up',
      'title',    'Receita acelerando',
      'message',  'Media diaria dos ultimos 7 dias ' ||
                  ROUND(((v_last7_credits / 7.0) / NULLIF(v_avg30_daily, 0) - 1) * 100, 1)::text ||
                  '% acima da media de 30 dias'
    ));
  END IF;

  -- Alerta B: meta abaixo do pro-rata
  IF v_meta > 0 AND v_credits < v_meta_prorata * 0.90 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type',     'goal_behind',
      'severity', 'warning',
      'icon',     'target',
      'title',    'Meta atrasada',
      'message',  'No ' || v_days_passed::text || ' dia do mes voce deveria ter atingido R$ ' ||
                  TO_CHAR(v_meta_prorata, 'FM999G999G999D00') ||
                  '. Realizado: R$ ' || TO_CHAR(v_credits, 'FM999G999G999D00')
    ));
  ELSIF v_meta > 0 AND v_credits >= v_meta_prorata * 1.10 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type',     'goal_ahead',
      'severity', 'success',
      'icon',     'target',
      'title',    'Acima da meta',
      'message',  'Voce esta ' ||
                  ROUND(((v_credits / NULLIF(v_meta_prorata, 0)) - 1) * 100, 1)::text ||
                  '% acima do pro-rata da meta mensal'
    ));
  END IF;

  -- Alerta C: inadimplentes acima de R$ 1000
  IF v_debtors_total >= 1000 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type',     'debtors',
      'severity', 'warning',
      'icon',     'alert-circle',
      'title',    'Pacientes em aberto',
      'message',  v_debtors_count::text || ' paciente(s) devem R$ ' ||
                  TO_CHAR(v_debtors_total, 'FM999G999G999D00') || ' no total'
    ));
  END IF;

  -- ── 8. Retorno consolidado ──────────────────────────────
  RETURN jsonb_build_object(
    'period', jsonb_build_object(
      'year',           v_year,
      'month',          v_month,
      'start',          v_start,
      'end',            v_end,
      'days_in_month',  v_days_in_month,
      'days_passed',    v_days_passed
    ),
    'current', jsonb_build_object(
      'credits',  v_credits,
      'debits',   v_debits,
      'balance',  v_credits - v_debits,
      'count',    v_count
    ),
    'previous', jsonb_build_object(
      'credits',  v_prev_credits,
      'debits',   v_prev_debits,
      'balance',  v_prev_credits - v_prev_debits
    ),
    'delta', jsonb_build_object(
      'credits_pct', CASE WHEN v_prev_credits > 0
                       THEN ROUND(((v_credits - v_prev_credits) / v_prev_credits) * 100, 1)
                       ELSE NULL END,
      'debits_pct',  CASE WHEN v_prev_debits > 0
                       THEN ROUND(((v_debits  - v_prev_debits)  / v_prev_debits) * 100, 1)
                       ELSE NULL END,
      'balance_pct', CASE WHEN (v_prev_credits - v_prev_debits) > 0
                       THEN ROUND((((v_credits - v_debits) - (v_prev_credits - v_prev_debits)) / NULLIF(v_prev_credits - v_prev_debits, 0)) * 100, 1)
                       ELSE NULL END
    ),
    'projection', jsonb_build_object(
      'daily_avg',          ROUND(v_daily_avg, 2),
      'projected_credits',  ROUND(v_projected, 2),
      'projected_balance',  ROUND(v_projected - (v_debits / NULLIF(v_days_passed, 0) * v_days_in_month), 2)
    ),
    'goal', jsonb_build_object(
      'meta',          v_meta,
      'realized',      v_credits,
      'pct',           ROUND(v_meta_pct, 1),
      'prorata',       ROUND(v_meta_prorata, 2),
      'has_goal',      v_meta > 0
    ),
    'receivables', jsonb_build_object(
      'total_30d',  v_receivables_total,
      'count',      v_receivables_count,
      'list',       v_receivables_list
    ),
    'debtors', jsonb_build_object(
      'total',  v_debtors_total,
      'count',  v_debtors_count,
      'list',   v_debtors_list
    ),
    'alerts', v_alerts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_intelligence(int, int) TO authenticated;

COMMENT ON FUNCTION public.cashflow_intelligence IS
  'Inteligencia decisoria do Fluxo de Caixa: comparativos, projecao, meta, recebiveis, inadimplentes e alertas em uma chamada.';
