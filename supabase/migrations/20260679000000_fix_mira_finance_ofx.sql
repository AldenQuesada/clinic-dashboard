-- Fix: wa_pro_finance_summary puxa receita do OFX (cashflow_entries)
-- em vez de appointments.value (que esta zerado)

CREATE OR REPLACE FUNCTION public.wa_pro_finance_summary(
  p_phone      text,
  p_start_date date,
  p_end_date   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth         jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id    uuid;
  v_prof_id      uuid;
  v_scope        text;
  v_bruto        numeric := 0;
  v_qtd          int := 0;
  v_prev_bruto   numeric := 0;
  v_period_days  int;
  v_prev_start   date;
  v_prev_end     date;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';

  -- Receita do periodo — OFX (cashflow_entries)
  SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
         COUNT(*) FILTER (WHERE amount > 0)
  INTO v_bruto, v_qtd
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND transaction_date BETWEEN p_start_date AND p_end_date;

  -- Periodo anterior (comparativo)
  v_period_days := (p_end_date - p_start_date) + 1;
  v_prev_end := p_start_date - 1;
  v_prev_start := v_prev_end - (v_period_days - 1);

  SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)
  INTO v_prev_bruto
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND transaction_date BETWEEN v_prev_start AND v_prev_end;

  RETURN jsonb_build_object(
    'ok',     true,
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date, 'days', v_period_days),
    'bruto',  ROUND(v_bruto, 2),
    'qtd',    v_qtd,
    'ticket_medio',   CASE WHEN v_qtd > 0 THEN ROUND(v_bruto / v_qtd, 2) ELSE 0 END,
    'previous_bruto', ROUND(v_prev_bruto, 2),
    'delta_pct',      CASE WHEN v_prev_bruto > 0 THEN ROUND(((v_bruto - v_prev_bruto) / v_prev_bruto) * 100, 1) ELSE NULL END,
    'source', 'cashflow_entries'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_finance_summary(text, date, date) TO authenticated, anon;


-- Fix: wa_pro_finance_commission tambem precisa do OFX
-- (comissao e calculada sobre a receita)
CREATE OR REPLACE FUNCTION public.wa_pro_finance_commission(
  p_phone      text,
  p_start_date date,
  p_end_date   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth       jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id  uuid;
  v_prof_id    uuid;
  v_scope      text;
  v_bruto      numeric := 0;
  v_comissao   numeric := 0;
  v_pct        numeric := 0;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';

  -- Receita do periodo via OFX
  SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)
  INTO v_bruto
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND transaction_date BETWEEN p_start_date AND p_end_date;

  -- Comissao: busca percentual do profissional
  SELECT COALESCE(commission_pct, 0) INTO v_pct
  FROM public.professional_profiles
  WHERE id = v_prof_id;

  v_comissao := ROUND(v_bruto * (v_pct / 100), 2);

  RETURN jsonb_build_object(
    'ok',         true,
    'bruto',      ROUND(v_bruto, 2),
    'comissao',   v_comissao,
    'percentual', v_pct
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_finance_commission(text, date, date) TO authenticated, anon;
