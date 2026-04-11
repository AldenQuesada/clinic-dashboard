-- ============================================================
-- Fix: 4 RPCs cashflow_* usavam data->>'valor' (errado).
-- Tabela appointments tem colunas diretas: value, scheduled_date,
-- payment_status, patient_id (uuid).
--
-- Tambem corrige a logica de "valor pago": usa SUM(cashflow_entries)
-- vinculados ao appointment como fonte da verdade (em vez de campo
-- valorPago que so existe no localStorage).
-- ============================================================

-- ── 1. cashflow_search_appointments ─────────────────────────

DROP FUNCTION IF EXISTS public.cashflow_search_appointments(numeric, date, int);

CREATE OR REPLACE FUNCTION public.cashflow_search_appointments(
  p_amount         numeric,
  p_date           date,
  p_tolerance_days int DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_result    jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',           a.id,
      'patient_id',   a.patient_id::text,
      'patient_name', COALESCE(a.patient_name, p.name),
      'date',         a.scheduled_date,
      'start_time',   a.start_time,
      'valor',        a.value,
      'valor_pago',   a.value,
      'status',       a.status,
      'days_diff',    abs(a.scheduled_date - p_date)
    )
    ORDER BY abs(a.scheduled_date - p_date), abs(a.value - p_amount)
  ), '[]'::jsonb)
  INTO v_result
  FROM public.appointments a
  LEFT JOIN public.patients p ON p.id = a.patient_id::text
  WHERE a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL
    AND a.scheduled_date BETWEEN p_date - p_tolerance_days AND p_date + p_tolerance_days
    AND abs(COALESCE(a.value, 0) - p_amount) <= 0.50
  LIMIT 20;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_search_appointments(numeric, date, int) TO authenticated;

-- ── 2. cashflow_auto_reconcile ──────────────────────────────

DROP FUNCTION IF EXISTS public.cashflow_auto_reconcile(date, date, int, numeric);

CREATE OR REPLACE FUNCTION public.cashflow_auto_reconcile(
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL,
  p_tolerance_days int DEFAULT 2,
  p_amount_tolerance numeric DEFAULT 0.50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_user_id   uuid := auth.uid();
  v_entry     record;
  v_appt      record;
  v_appt_count int;
  v_high      int := 0;
  v_low       int := 0;
  v_none      int := 0;
  v_processed int := 0;
  v_pending_confirmed int := 0;
  v_start     date := COALESCE(p_start_date, CURRENT_DATE - 90);
  v_end       date := COALESCE(p_end_date, CURRENT_DATE);
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado');
  END IF;

  FOR v_entry IN
    SELECT id, transaction_date, amount, description, payment_method, match_confidence
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND match_confidence IN ('none', 'pending_bank_confirmation')
      AND transaction_date BETWEEN v_start AND v_end
    ORDER BY transaction_date DESC
  LOOP
    v_processed := v_processed + 1;

    -- pending_bank_confirmation: confirma quando chega entry de OFX/Pluggy correspondente
    IF v_entry.match_confidence = 'pending_bank_confirmation' THEN
      PERFORM 1
      FROM public.cashflow_entries c2
      WHERE c2.clinic_id = v_clinic_id
        AND c2.deleted_at IS NULL
        AND c2.id != v_entry.id
        AND c2.source IN ('ofx_import', 'pluggy')
        AND c2.direction = 'credit'
        AND abs(c2.amount - v_entry.amount) <= p_amount_tolerance
        AND c2.transaction_date BETWEEN v_entry.transaction_date - p_tolerance_days
                                    AND v_entry.transaction_date + p_tolerance_days
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.cashflow_entries
        SET match_confidence = 'auto_high',
            reconciled_at = now(),
            reconciled_by = v_user_id,
            match_reasons = jsonb_build_array('confirmed_by_bank_import'),
            updated_at = now()
        WHERE id = v_entry.id;
        v_pending_confirmed := v_pending_confirmed + 1;
      END IF;
      CONTINUE;
    END IF;

    -- Conta candidatos
    SELECT COUNT(*) INTO v_appt_count
    FROM public.appointments a
    WHERE a.clinic_id = v_clinic_id
      AND a.deleted_at IS NULL
      AND a.status IN ('finalizado', 'concluido', 'compareceu')
      AND a.scheduled_date BETWEEN v_entry.transaction_date - p_tolerance_days
                              AND v_entry.transaction_date + p_tolerance_days
      AND abs(COALESCE(a.value, 0) - v_entry.amount) <= p_amount_tolerance;

    IF v_appt_count = 0 THEN
      v_none := v_none + 1;
      CONTINUE;
    END IF;

    -- 1 candidato unico → alta confianca, link automatico
    IF v_appt_count = 1 THEN
      SELECT a.id, a.patient_id::text AS patient_id, a.scheduled_date, a.value
      INTO v_appt
      FROM public.appointments a
      WHERE a.clinic_id = v_clinic_id
        AND a.deleted_at IS NULL
        AND a.status IN ('finalizado', 'concluido', 'compareceu')
        AND a.scheduled_date BETWEEN v_entry.transaction_date - p_tolerance_days
                                AND v_entry.transaction_date + p_tolerance_days
        AND abs(COALESCE(a.value, 0) - v_entry.amount) <= p_amount_tolerance
      LIMIT 1;

      UPDATE public.cashflow_entries
      SET appointment_id = v_appt.id,
          patient_id     = COALESCE(patient_id, v_appt.patient_id),
          match_confidence = 'auto_high',
          match_reasons  = jsonb_build_array(
            'unique_candidate',
            'date_diff_' || abs(v_appt.scheduled_date - v_entry.transaction_date)::text,
            'amount_match'
          ),
          reconciled_at  = now(),
          reconciled_by  = v_user_id,
          updated_at     = now()
      WHERE id = v_entry.id;

      v_high := v_high + 1;
      CONTINUE;
    END IF;

    -- Multiplos candidatos → marca como sugerido
    UPDATE public.cashflow_entries
    SET match_confidence = 'auto_low',
        match_reasons    = jsonb_build_array(
          'multiple_candidates_' || v_appt_count::text,
          'requires_manual_review'
        ),
        updated_at = now()
    WHERE id = v_entry.id;

    v_low := v_low + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',                true,
    'processed',         v_processed,
    'auto_high',         v_high,
    'auto_low',          v_low,
    'no_match',          v_none,
    'pending_confirmed', v_pending_confirmed,
    'period',            jsonb_build_object('start', v_start, 'end', v_end)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_auto_reconcile(date, date, int, numeric) TO authenticated;

-- ── 3. cashflow_get_suggestions ─────────────────────────────

DROP FUNCTION IF EXISTS public.cashflow_get_suggestions(date, date, int);

CREATE OR REPLACE FUNCTION public.cashflow_get_suggestions(
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL,
  p_limit      int  DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_result    jsonb := '[]'::jsonb;
  v_entry     record;
  v_candidates jsonb;
  v_start     date := COALESCE(p_start_date, CURRENT_DATE - 90);
  v_end       date := COALESCE(p_end_date, CURRENT_DATE);
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_entry IN
    SELECT id, transaction_date, amount, description, payment_method
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND match_confidence = 'auto_low'
      AND transaction_date BETWEEN v_start AND v_end
    ORDER BY transaction_date DESC
    LIMIT p_limit
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'appointment_id', a.id,
      'patient_id',     a.patient_id::text,
      'patient_name',   COALESCE(a.patient_name, p.name),
      'date',           a.scheduled_date,
      'start_time',     a.start_time,
      'valor',          a.value,
      'valor_pago',     a.value,
      'forma_pagamento', a.payment_method,
      'days_diff',      abs(a.scheduled_date - v_entry.transaction_date)
    ) ORDER BY abs(a.scheduled_date - v_entry.transaction_date)), '[]'::jsonb)
    INTO v_candidates
    FROM public.appointments a
    LEFT JOIN public.patients p ON p.id = a.patient_id::text
    WHERE a.clinic_id = v_clinic_id
      AND a.deleted_at IS NULL
      AND a.status IN ('finalizado', 'concluido', 'compareceu')
      AND a.scheduled_date BETWEEN v_entry.transaction_date - 2 AND v_entry.transaction_date + 2
      AND abs(COALESCE(a.value, 0) - v_entry.amount) <= 0.50
    LIMIT 5;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'entry_id',         v_entry.id,
      'transaction_date', v_entry.transaction_date,
      'amount',           v_entry.amount,
      'description',      v_entry.description,
      'payment_method',   v_entry.payment_method,
      'candidates',       v_candidates
    ));
  END LOOP;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_get_suggestions(date, date, int) TO authenticated;

-- ── 4. cashflow_intelligence (com colunas corretas) ─────────

DROP FUNCTION IF EXISTS public.cashflow_intelligence(int, int);

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

  v_credits       numeric := 0;
  v_debits        numeric := 0;
  v_count         int     := 0;

  v_prev_credits  numeric := 0;
  v_prev_debits   numeric := 0;

  v_daily_avg     numeric := 0;
  v_projected     numeric := 0;

  v_meta          numeric := 0;
  v_meta_pct      numeric := 0;
  v_meta_prorata  numeric := 0;

  v_receivables_total numeric := 0;
  v_receivables_count int     := 0;
  v_receivables_list  jsonb   := '[]'::jsonb;

  v_debtors_total numeric := 0;
  v_debtors_count int     := 0;
  v_debtors_list  jsonb   := '[]'::jsonb;

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

  -- 1. Periodo atual
  SELECT
    COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END), 0),
    COUNT(*)
  INTO v_credits, v_debits, v_count
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND transaction_date BETWEEN v_start AND v_end;

  -- 2. Periodo anterior
  SELECT
    COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END), 0)
  INTO v_prev_credits, v_prev_debits
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND transaction_date BETWEEN v_prev_start AND v_prev_end;

  -- 3. Projecao
  IF v_days_passed > 0 THEN
    v_daily_avg := v_credits / v_days_passed;
    v_projected := v_daily_avg * v_days_in_month;
  END IF;

  -- 4. Meta
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

  -- 5. Recebiveis proximos 30 dias (entries pending_bank_confirmation)
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_receivables_total, v_receivables_count
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'credit'
    AND match_confidence = 'pending_bank_confirmation'
    AND transaction_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30;

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

  -- 6. Inadimplentes: appointments finalizados com payment_status pendente/parcial,
  --    saldo = appt.value - SUM(cashflow_entries.amount linkadas ao appt)
  WITH appt_paid AS (
    SELECT
      a.id,
      a.patient_id::text AS patient_id,
      COALESCE(a.patient_name, p.name) AS patient_name,
      a.scheduled_date,
      a.value AS valor,
      COALESCE((SELECT SUM(amount) FROM public.cashflow_entries
                WHERE appointment_id = a.id AND deleted_at IS NULL AND direction = 'credit'), 0) AS valor_pago
    FROM public.appointments a
    LEFT JOIN public.patients p ON p.id = a.patient_id::text
    WHERE a.clinic_id = v_clinic_id
      AND a.deleted_at IS NULL
      AND a.status = 'finalizado'
      AND a.scheduled_date BETWEEN v_start - 90 AND v_end
      AND COALESCE(a.payment_status, '') IN ('pendente', 'parcial')
  )
  SELECT
    COALESCE(SUM(GREATEST(0, valor - valor_pago)), 0),
    COUNT(*) FILTER (WHERE valor > valor_pago)
  INTO v_debtors_total, v_debtors_count
  FROM appt_paid;

  WITH appt_paid AS (
    SELECT
      a.id,
      a.patient_id::text AS patient_id,
      COALESCE(a.patient_name, p.name) AS patient_name,
      a.scheduled_date,
      a.value AS valor,
      COALESCE((SELECT SUM(amount) FROM public.cashflow_entries
                WHERE appointment_id = a.id AND deleted_at IS NULL AND direction = 'credit'), 0) AS valor_pago
    FROM public.appointments a
    LEFT JOIN public.patients p ON p.id = a.patient_id::text
    WHERE a.clinic_id = v_clinic_id
      AND a.deleted_at IS NULL
      AND a.status = 'finalizado'
      AND a.scheduled_date BETWEEN v_start - 90 AND v_end
      AND COALESCE(a.payment_status, '') IN ('pendente', 'parcial')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'appointment_id', id,
    'patient_id',     patient_id,
    'patient_name',   patient_name,
    'date',           scheduled_date,
    'valor',          valor,
    'valor_pago',     valor_pago,
    'saldo',          GREATEST(0, valor - valor_pago)
  ) ORDER BY scheduled_date DESC), '[]'::jsonb)
  INTO v_debtors_list
  FROM appt_paid
  WHERE valor > valor_pago
  LIMIT 10;

  -- 7. Alertas

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

  RETURN jsonb_build_object(
    'period', jsonb_build_object(
      'year', v_year, 'month', v_month,
      'start', v_start, 'end', v_end,
      'days_in_month', v_days_in_month, 'days_passed', v_days_passed
    ),
    'current', jsonb_build_object(
      'credits', v_credits, 'debits', v_debits,
      'balance', v_credits - v_debits, 'count', v_count
    ),
    'previous', jsonb_build_object(
      'credits', v_prev_credits, 'debits', v_prev_debits,
      'balance', v_prev_credits - v_prev_debits
    ),
    'delta', jsonb_build_object(
      'credits_pct', CASE WHEN v_prev_credits > 0 THEN ROUND(((v_credits - v_prev_credits) / v_prev_credits) * 100, 1) ELSE NULL END,
      'debits_pct',  CASE WHEN v_prev_debits  > 0 THEN ROUND(((v_debits  - v_prev_debits)  / v_prev_debits)  * 100, 1) ELSE NULL END,
      'balance_pct', CASE WHEN (v_prev_credits - v_prev_debits) > 0
                       THEN ROUND((((v_credits - v_debits) - (v_prev_credits - v_prev_debits)) / NULLIF(v_prev_credits - v_prev_debits, 0)) * 100, 1)
                       ELSE NULL END
    ),
    'projection', jsonb_build_object(
      'daily_avg', ROUND(v_daily_avg, 2),
      'projected_credits', ROUND(v_projected, 2),
      'projected_balance', ROUND(v_projected - (CASE WHEN v_days_passed > 0 THEN v_debits / v_days_passed * v_days_in_month ELSE 0 END), 2)
    ),
    'goal', jsonb_build_object(
      'meta', v_meta,
      'realized', v_credits,
      'pct', ROUND(v_meta_pct, 1),
      'prorata', ROUND(v_meta_prorata, 2),
      'has_goal', v_meta > 0
    ),
    'receivables', jsonb_build_object(
      'total_30d', v_receivables_total,
      'count', v_receivables_count,
      'list', v_receivables_list
    ),
    'debtors', jsonb_build_object(
      'total', v_debtors_total,
      'count', v_debtors_count,
      'list', v_debtors_list
    ),
    'alerts', v_alerts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_intelligence(int, int) TO authenticated;

COMMENT ON FUNCTION public.cashflow_intelligence IS
  'Inteligencia decisoria do Fluxo de Caixa: comparativos vs mes anterior, projecao, meta vs realizado, recebiveis 30d, inadimplentes, alertas.';
