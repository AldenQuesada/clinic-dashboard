-- ============================================================
-- Migration: Cashflow Auto-Reconciliation Engine
-- Casa cashflow_entries com appointments por data + valor
-- ============================================================

-- ── 1. RPC: cashflow_auto_reconcile ─────────────────────────
-- Roda o matching engine para entries pendentes no periodo

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

  -- Loop por entries credit pendentes (none ou pending_bank_confirmation)
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

    -- Caso especial: pending_bank_confirmation (criada pelo finalize_modal)
    -- ja tem appointment_id, so precisa confirmar via OFX
    IF v_entry.match_confidence = 'pending_bank_confirmation' THEN
      -- Procura uma entry OFX (ou pluggy) com mesmo valor e data proxima
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

    -- Caso padrao: entry sem vinculo (none) - tenta matchear com appointment
    -- Conta candidatos
    SELECT COUNT(*) INTO v_appt_count
    FROM public.appointments a
    WHERE a.clinic_id = v_clinic_id
      AND a.deleted_at IS NULL
      AND a.status IN ('finalizado', 'concluido', 'compareceu')
      AND a.date BETWEEN v_entry.transaction_date - p_tolerance_days
                     AND v_entry.transaction_date + p_tolerance_days
      AND (
        abs(COALESCE((a.data->>'valor')::numeric, 0)     - v_entry.amount) <= p_amount_tolerance
        OR abs(COALESCE((a.data->>'valorPago')::numeric, 0) - v_entry.amount) <= p_amount_tolerance
      );

    IF v_appt_count = 0 THEN
      v_none := v_none + 1;
      CONTINUE;
    END IF;

    -- 1 candidato unico → alta confianca, link automatico
    IF v_appt_count = 1 THEN
      SELECT a.id, a.patient_id, a.date,
             COALESCE((a.data->>'valor')::numeric, 0) AS valor
      INTO v_appt
      FROM public.appointments a
      WHERE a.clinic_id = v_clinic_id
        AND a.deleted_at IS NULL
        AND a.status IN ('finalizado', 'concluido', 'compareceu')
        AND a.date BETWEEN v_entry.transaction_date - p_tolerance_days
                       AND v_entry.transaction_date + p_tolerance_days
        AND (
          abs(COALESCE((a.data->>'valor')::numeric, 0)     - v_entry.amount) <= p_amount_tolerance
          OR abs(COALESCE((a.data->>'valorPago')::numeric, 0) - v_entry.amount) <= p_amount_tolerance
        )
      LIMIT 1;

      -- Score: data exata = high, mesmo dia +/- tolerancia mas valor exato = high tambem
      UPDATE public.cashflow_entries
      SET appointment_id = v_appt.id,
          patient_id     = COALESCE(patient_id, v_appt.patient_id),
          match_confidence = 'auto_high',
          match_reasons  = jsonb_build_array(
            'unique_candidate',
            'date_diff_' || abs(v_appt.date - v_entry.transaction_date)::text,
            'amount_match'
          ),
          reconciled_at  = now(),
          reconciled_by  = v_user_id,
          updated_at     = now()
      WHERE id = v_entry.id;

      v_high := v_high + 1;
      CONTINUE;
    END IF;

    -- Multiplos candidatos → baixa confianca, marca como sugerido
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

-- ── 2. RPC: cashflow_get_suggestions ────────────────────────
-- Lista entries com auto_low e seus candidatos

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
    -- Busca candidatos
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'appointment_id', a.id,
      'patient_id',     a.patient_id,
      'patient_name',   p.name,
      'date',           a.date,
      'start_time',     a.start_time,
      'valor',          COALESCE((a.data->>'valor')::numeric, 0),
      'valor_pago',     COALESCE((a.data->>'valorPago')::numeric, 0),
      'forma_pagamento', a.data->>'formaPagamento',
      'days_diff',      abs(a.date - v_entry.transaction_date)
    ) ORDER BY abs(a.date - v_entry.transaction_date)), '[]'::jsonb)
    INTO v_candidates
    FROM public.appointments a
    LEFT JOIN public.patients p ON p.id = a.patient_id
    WHERE a.clinic_id = v_clinic_id
      AND a.deleted_at IS NULL
      AND a.status IN ('finalizado', 'concluido', 'compareceu')
      AND a.date BETWEEN v_entry.transaction_date - 2 AND v_entry.transaction_date + 2
      AND (
        abs(COALESCE((a.data->>'valor')::numeric, 0)     - v_entry.amount) <= 0.50
        OR abs(COALESCE((a.data->>'valorPago')::numeric, 0) - v_entry.amount) <= 0.50
      )
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

-- ── 3. RPC: cashflow_reject_suggestion ──────────────────────
-- Marca uma entry como "no_match" definitivo (nao oferecer mais sugestoes)

CREATE OR REPLACE FUNCTION public.cashflow_reject_suggestion(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
BEGIN
  UPDATE public.cashflow_entries
  SET match_confidence = 'none',
      match_reasons = jsonb_build_array('manually_rejected'),
      updated_at = now()
  WHERE id = p_entry_id AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true, 'id', p_entry_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_reject_suggestion(uuid) TO authenticated;

COMMENT ON FUNCTION public.cashflow_auto_reconcile IS
  'Roda matching engine para entries pendentes. auto_high (1 candidato exato) faz link automatico. auto_low (multiplos) marca como sugerido para review manual.';
