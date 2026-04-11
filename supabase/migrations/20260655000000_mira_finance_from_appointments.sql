-- ============================================================
-- Migration: Mira Finance — fonte unica = appointments
-- Refatora wa_pro_finance_summary e wa_pro_finance_commission
-- pra somar a partir da camada OPERACIONAL (appointments), que
-- e onde fica a verdade de "quem fez o que e quanto". Cashflow
-- continua como camada BANCARIA (OFX), usado pra reconciliacao,
-- nao pra atribuicao por profissional.
-- ============================================================

-- ── wa_pro_finance_summary v2 (appointments) ────────────────

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

  -- Receita bruta: soma appointments finalizados no periodo
  -- Fonte = camada operacional (quem fez o que e por quanto)
  SELECT COALESCE(SUM(COALESCE(a.value, 0)), 0), COUNT(*)
  INTO v_bruto, v_qtd
  FROM public.appointments a
  WHERE a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL
    AND a.status = 'finalizado'
    AND a.scheduled_date BETWEEN p_start_date AND p_end_date
    AND (v_scope = 'full' OR a.professional_id = v_prof_id);

  -- Periodo anterior (comparativo)
  v_period_days := (p_end_date - p_start_date) + 1;
  v_prev_end := p_start_date - 1;
  v_prev_start := v_prev_end - (v_period_days - 1);

  SELECT COALESCE(SUM(COALESCE(a.value, 0)), 0)
  INTO v_prev_bruto
  FROM public.appointments a
  WHERE a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL
    AND a.status = 'finalizado'
    AND a.scheduled_date BETWEEN v_prev_start AND v_prev_end
    AND (v_scope = 'full' OR a.professional_id = v_prof_id);

  RETURN jsonb_build_object(
    'ok',     true,
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date, 'days', v_period_days),
    'bruto',  ROUND(v_bruto, 2),
    'qtd',    v_qtd,
    'ticket_medio',   CASE WHEN v_qtd > 0 THEN ROUND(v_bruto / v_qtd, 2) ELSE 0 END,
    'previous_bruto', ROUND(v_prev_bruto, 2),
    'delta_pct',      CASE WHEN v_prev_bruto > 0 THEN ROUND(((v_bruto - v_prev_bruto) / v_prev_bruto) * 100, 1) ELSE NULL END,
    'source', 'appointments'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_finance_summary(text, date, date) TO authenticated, anon;

-- ── wa_pro_finance_commission v2 (appointments) ────────────

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
  v_auth         jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id    uuid;
  v_prof_id      uuid;
  v_prof_comms   jsonb;
  v_default_comm numeric := 0;
  v_total_bruto  numeric := 0;
  v_total_comm   numeric := 0;
  v_rec          record;
  v_commissions  jsonb;
  v_comm_item    jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;

  -- Comissoes do profissional
  SELECT commissions INTO v_prof_comms
  FROM public.professional_profiles
  WHERE id = v_prof_id;

  -- Default da clinica
  SELECT commissions INTO v_commissions FROM public.cashflow_config WHERE clinic_id = v_clinic_id;
  v_default_comm := COALESCE((v_commissions->>'default_pct')::numeric, 0);

  -- Loop por appointments finalizados do profissional
  FOR v_rec IN
    SELECT a.value AS amount, a.procedure_name
    FROM public.appointments a
    WHERE a.clinic_id = v_clinic_id
      AND a.deleted_at IS NULL
      AND a.status = 'finalizado'
      AND a.professional_id = v_prof_id
      AND a.scheduled_date BETWEEN p_start_date AND p_end_date
      AND COALESCE(a.value, 0) > 0
  LOOP
    v_total_bruto := v_total_bruto + COALESCE(v_rec.amount, 0);

    DECLARE
      v_comm_pct numeric := v_default_comm;
      v_comm_val numeric := 0;
      v_match    boolean := false;
    BEGIN
      IF v_prof_comms IS NOT NULL AND jsonb_typeof(v_prof_comms) = 'array' THEN
        -- Match exato pelo procedure_name
        IF v_rec.procedure_name IS NOT NULL THEN
          FOR v_comm_item IN SELECT * FROM jsonb_array_elements(v_prof_comms)
          LOOP
            IF LOWER(TRIM(v_comm_item->>'procedure')) = LOWER(TRIM(v_rec.procedure_name)) THEN
              IF (v_comm_item->>'type') = 'fixed' THEN
                v_comm_val := COALESCE((v_comm_item->>'value')::numeric, 0);
              ELSE
                v_comm_pct := COALESCE((v_comm_item->>'value')::numeric, 0);
                v_comm_val := v_rec.amount * v_comm_pct / 100;
              END IF;
              v_match := true;
              EXIT;
            END IF;
          END LOOP;
        END IF;
        -- Fallback __todos__
        IF NOT v_match THEN
          FOR v_comm_item IN SELECT * FROM jsonb_array_elements(v_prof_comms)
          LOOP
            IF (v_comm_item->>'procedure') = '__todos__' THEN
              IF (v_comm_item->>'type') = 'fixed' THEN
                v_comm_val := COALESCE((v_comm_item->>'value')::numeric, 0);
              ELSE
                v_comm_pct := COALESCE((v_comm_item->>'value')::numeric, 0);
                v_comm_val := v_rec.amount * v_comm_pct / 100;
              END IF;
              v_match := true;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

      -- Fallback default da clinica
      IF NOT v_match AND v_default_comm > 0 THEN
        v_comm_val := v_rec.amount * v_default_comm / 100;
      END IF;

      v_total_comm := v_total_comm + v_comm_val;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',         true,
    'period',     jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'bruto',      ROUND(v_total_bruto, 2),
    'comissao',   ROUND(v_total_comm, 2),
    'percentual', CASE WHEN v_total_bruto > 0 THEN ROUND((v_total_comm / v_total_bruto) * 100, 1) ELSE 0 END,
    'source',     'appointments'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_finance_commission(text, date, date) TO authenticated, anon;

COMMENT ON FUNCTION public.wa_pro_finance_summary    IS 'Mira v2: receita por profissional a partir de appointments finalizados (camada operacional)';
COMMENT ON FUNCTION public.wa_pro_finance_commission IS 'Mira v2: comissao real via professional_profiles.commissions sobre appointments finalizados';
