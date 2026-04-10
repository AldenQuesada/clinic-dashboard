-- ============================================================
-- Migration: Cashflow / Fluxo de Caixa
-- Tabela de movimentos financeiros + RPCs CRUD/summary
-- Suporta: lancamento manual, finalize_modal, OFX import (futuro)
-- ============================================================

-- ── 1. Tabela cashflow_entries ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.cashflow_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Transacao
  transaction_date     date NOT NULL,
  transaction_datetime timestamptz,
  direction            text NOT NULL CHECK (direction IN ('credit','debit')),
  amount               numeric(12,2) NOT NULL CHECK (amount >= 0),
  payment_method       text NOT NULL CHECK (payment_method IN (
    'pix','cash','card_credit','card_debit','transfer',
    'boleto','installment','courtesy','convenio','link',
    'fee','chargeback','other'
  )),
  description          text,
  category             text,  -- 'consulta','produto','despesa_fixa','despesa_var','imposto','outro'

  -- Origem
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN (
    'manual','finalize_modal','ofx_import','pluggy','pos_api','recurring'
  )),
  external_id  text,
  raw_data     jsonb DEFAULT '{}'::jsonb,

  -- Reconciliacao
  patient_id          text REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id      text REFERENCES public.appointments(id) ON DELETE SET NULL,
  match_confidence    text DEFAULT 'none' CHECK (match_confidence IN ('none','manual','auto_low','auto_high','pending_bank_confirmation')),
  match_reasons       jsonb DEFAULT '[]'::jsonb,
  reconciled_at       timestamptz,
  reconciled_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Parcelamento (para vendas parceladas)
  installment_number  int,
  installment_total   int,
  parent_entry_id     uuid REFERENCES public.cashflow_entries(id) ON DELETE CASCADE,

  -- Audit
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cashflow_clinic_date
  ON public.cashflow_entries (clinic_id, transaction_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cashflow_patient
  ON public.cashflow_entries (clinic_id, patient_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cashflow_appointment
  ON public.cashflow_entries (clinic_id, appointment_id)
  WHERE deleted_at IS NULL;

-- Idempotencia: evita importar a mesma transacao 2x
CREATE UNIQUE INDEX IF NOT EXISTS idx_cashflow_source_extid_uq
  ON public.cashflow_entries (source, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- ── 2. Trigger updated_at ───────────────────────────────────

DROP TRIGGER IF EXISTS trg_cashflow_updated_at ON public.cashflow_entries;
CREATE TRIGGER trg_cashflow_updated_at
  BEFORE UPDATE ON public.cashflow_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. RLS ──────────────────────────────────────────────────

ALTER TABLE public.cashflow_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cashflow_select ON public.cashflow_entries;
DROP POLICY IF EXISTS cashflow_write ON public.cashflow_entries;
DROP POLICY IF EXISTS cashflow_delete ON public.cashflow_entries;

CREATE POLICY cashflow_select ON public.cashflow_entries
  FOR SELECT TO authenticated
  USING (clinic_id = public._sdr_clinic_id() AND deleted_at IS NULL);

CREATE POLICY cashflow_write ON public.cashflow_entries
  FOR ALL TO authenticated
  USING (clinic_id = public._sdr_clinic_id() AND public.app_role() IN ('owner','admin','receptionist'))
  WITH CHECK (clinic_id = public._sdr_clinic_id());

-- ── 4. RPC: cashflow_create_entry ───────────────────────────

CREATE OR REPLACE FUNCTION public.cashflow_create_entry(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_id        uuid;
  v_user_id   uuid := auth.uid();
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado');
  END IF;

  INSERT INTO public.cashflow_entries (
    clinic_id, transaction_date, transaction_datetime,
    direction, amount, payment_method, description, category,
    source, external_id, raw_data,
    patient_id, appointment_id, match_confidence,
    installment_number, installment_total, parent_entry_id,
    created_by
  ) VALUES (
    v_clinic_id,
    COALESCE((p_data->>'transaction_date')::date, CURRENT_DATE),
    NULLIF(p_data->>'transaction_datetime','')::timestamptz,
    COALESCE(p_data->>'direction', 'credit'),
    COALESCE((p_data->>'amount')::numeric, 0),
    COALESCE(p_data->>'payment_method', 'other'),
    NULLIF(p_data->>'description',''),
    NULLIF(p_data->>'category',''),
    COALESCE(p_data->>'source', 'manual'),
    NULLIF(p_data->>'external_id',''),
    COALESCE(p_data->'raw_data', '{}'::jsonb),
    NULLIF(p_data->>'patient_id',''),
    NULLIF(p_data->>'appointment_id',''),
    COALESCE(p_data->>'match_confidence', 'none'),
    NULLIF((p_data->>'installment_number')::int, NULL),
    NULLIF((p_data->>'installment_total')::int, NULL),
    NULLIF(p_data->>'parent_entry_id','')::uuid,
    v_user_id
  )
  ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Conflict: ja existia, retorna o id existente
    SELECT id INTO v_id
    FROM public.cashflow_entries
    WHERE source = (p_data->>'source')
      AND external_id = (p_data->>'external_id')
      AND deleted_at IS NULL
    LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'duplicated', true);
  END IF;

  -- Auto link a appointment se vinculo manual veio com confidence != 'none'
  IF (p_data->>'appointment_id') IS NOT NULL AND (p_data->>'appointment_id') != '' THEN
    UPDATE public.cashflow_entries
    SET reconciled_at = now(),
        reconciled_by = v_user_id,
        match_confidence = COALESCE(NULLIF(p_data->>'match_confidence',''), 'manual')
    WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'duplicated', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_create_entry(jsonb) TO authenticated;

-- ── 5. RPC: cashflow_update_entry ───────────────────────────

CREATE OR REPLACE FUNCTION public.cashflow_update_entry(p_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado');
  END IF;

  UPDATE public.cashflow_entries SET
    transaction_date = COALESCE((p_data->>'transaction_date')::date, transaction_date),
    direction        = COALESCE(p_data->>'direction', direction),
    amount           = COALESCE((p_data->>'amount')::numeric, amount),
    payment_method   = COALESCE(p_data->>'payment_method', payment_method),
    description      = COALESCE(NULLIF(p_data->>'description',''), description),
    category         = COALESCE(NULLIF(p_data->>'category',''), category),
    patient_id       = NULLIF(p_data->>'patient_id',''),
    appointment_id   = NULLIF(p_data->>'appointment_id',''),
    match_confidence = COALESCE(p_data->>'match_confidence', match_confidence),
    updated_at       = now()
  WHERE id = p_id
    AND clinic_id = v_clinic_id
    AND deleted_at IS NULL;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_update_entry(uuid, jsonb) TO authenticated;

-- ── 6. RPC: cashflow_delete_entry ───────────────────────────

CREATE OR REPLACE FUNCTION public.cashflow_delete_entry(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
BEGIN
  UPDATE public.cashflow_entries
  SET deleted_at = now()
  WHERE id = p_id AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_delete_entry(uuid) TO authenticated;

-- ── 7. RPC: cashflow_list_entries ───────────────────────────

CREATE OR REPLACE FUNCTION public.cashflow_list_entries(
  p_start_date  date DEFAULT NULL,
  p_end_date    date DEFAULT NULL,
  p_direction   text DEFAULT NULL,
  p_method      text DEFAULT NULL,
  p_only_unreconciled boolean DEFAULT false,
  p_limit       int  DEFAULT 500
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
  IF v_clinic_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                   c.id,
      'transaction_date',     c.transaction_date,
      'transaction_datetime', c.transaction_datetime,
      'direction',            c.direction,
      'amount',               c.amount,
      'payment_method',       c.payment_method,
      'description',          c.description,
      'category',             c.category,
      'source',               c.source,
      'external_id',          c.external_id,
      'patient_id',           c.patient_id,
      'patient_name',         p.name,
      'appointment_id',       c.appointment_id,
      'match_confidence',     c.match_confidence,
      'reconciled_at',        c.reconciled_at,
      'installment_number',   c.installment_number,
      'installment_total',    c.installment_total,
      'created_at',           c.created_at,
      'updated_at',           c.updated_at
    )
    ORDER BY c.transaction_date DESC, c.created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM public.cashflow_entries c
  LEFT JOIN public.patients p ON p.id = c.patient_id
  WHERE c.clinic_id = v_clinic_id
    AND c.deleted_at IS NULL
    AND (p_start_date IS NULL OR c.transaction_date >= p_start_date)
    AND (p_end_date   IS NULL OR c.transaction_date <= p_end_date)
    AND (p_direction  IS NULL OR c.direction = p_direction)
    AND (p_method     IS NULL OR c.payment_method = p_method)
    AND (NOT p_only_unreconciled OR c.match_confidence = 'none' OR c.match_confidence = 'pending_bank_confirmation')
  LIMIT p_limit;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_list_entries(date, date, text, text, boolean, int) TO authenticated;

-- ── 8. RPC: cashflow_summary ────────────────────────────────

CREATE OR REPLACE FUNCTION public.cashflow_summary(
  p_start_date date,
  p_end_date   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id    uuid := public._sdr_clinic_id();
  v_credits      numeric := 0;
  v_debits       numeric := 0;
  v_count        int     := 0;
  v_unreconciled int     := 0;
  v_by_method    jsonb;
  v_daily        jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Totalizadores
  SELECT
    COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE match_confidence IN ('none','pending_bank_confirmation') AND direction='credit')
  INTO v_credits, v_debits, v_count, v_unreconciled
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND transaction_date BETWEEN p_start_date AND p_end_date;

  -- Quebra por metodo (so credits)
  SELECT COALESCE(jsonb_object_agg(payment_method, total), '{}'::jsonb)
  INTO v_by_method
  FROM (
    SELECT payment_method, SUM(amount) AS total
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND transaction_date BETWEEN p_start_date AND p_end_date
    GROUP BY payment_method
  ) t;

  -- Por dia
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date',    d::date,
    'credits', credits,
    'debits',  debits,
    'balance', credits - debits
  ) ORDER BY d), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT
      transaction_date AS d,
      SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END) AS credits,
      SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END) AS debits
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND transaction_date BETWEEN p_start_date AND p_end_date
    GROUP BY transaction_date
  ) x;

  RETURN jsonb_build_object(
    'credits',      v_credits,
    'debits',       v_debits,
    'balance',      v_credits - v_debits,
    'count',        v_count,
    'unreconciled', v_unreconciled,
    'by_method',    v_by_method,
    'daily',        v_daily,
    'period',       jsonb_build_object('start', p_start_date, 'end', p_end_date)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_summary(date, date) TO authenticated;

-- ── 9. RPC: cashflow_link_appointment ───────────────────────

CREATE OR REPLACE FUNCTION public.cashflow_link_appointment(
  p_entry_id       uuid,
  p_appointment_id text,
  p_patient_id     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_user_id   uuid := auth.uid();
BEGIN
  UPDATE public.cashflow_entries
  SET appointment_id   = p_appointment_id,
      patient_id       = COALESCE(p_patient_id, patient_id),
      match_confidence = 'manual',
      reconciled_at    = now(),
      reconciled_by    = v_user_id,
      updated_at       = now()
  WHERE id = p_entry_id AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true, 'id', p_entry_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_link_appointment(uuid, text, text) TO authenticated;

-- ── 10. RPC: cashflow_search_appointments ───────────────────
-- Busca appointments candidatos para reconciliacao

CREATE OR REPLACE FUNCTION public.cashflow_search_appointments(
  p_amount      numeric,
  p_date        date,
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
      'patient_id',   a.patient_id,
      'patient_name', p.name,
      'date',         a.date,
      'start_time',   a.start_time,
      'valor',        (a.data->>'valor')::numeric,
      'valor_pago',   (a.data->>'valorPago')::numeric,
      'status',       a.status,
      'days_diff',    abs(a.date - p_date)
    )
    ORDER BY abs(a.date - p_date), abs((a.data->>'valor')::numeric - p_amount)
  ), '[]'::jsonb)
  INTO v_result
  FROM public.appointments a
  LEFT JOIN public.patients p ON p.id = a.patient_id
  WHERE a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL
    AND a.date BETWEEN p_date - p_tolerance_days AND p_date + p_tolerance_days
    AND (
      abs(COALESCE((a.data->>'valor')::numeric, 0) - p_amount) <= 0.50
      OR abs(COALESCE((a.data->>'valorPago')::numeric, 0) - p_amount) <= 0.50
    )
  LIMIT 20;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_search_appointments(numeric, date, int) TO authenticated;

-- ── Comentarios ─────────────────────────────────────────────

COMMENT ON TABLE public.cashflow_entries IS
  'Movimentos de fluxo de caixa: entradas (vendas, recebimentos) e saidas (despesas, taxas). Suporta multiplas fontes (manual, OFX, finalize_modal, Pluggy) com idempotencia via (source,external_id).';
