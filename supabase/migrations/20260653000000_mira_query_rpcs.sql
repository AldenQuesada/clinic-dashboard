-- ============================================================
-- Migration: Mira Query RPCs — Pacientes, Agenda, Financeiro
-- Todas read-only, validam phone como primeira coisa,
-- respeitam access_scope (own | team | full)
-- ============================================================

-- ── Helper: resolve professional_id pelo telefone ───────────

CREATE OR REPLACE FUNCTION public.wa_pro_resolve_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_phone     text := REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  v_rec       record;
BEGIN
  IF v_phone = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_required');
  END IF;

  SELECT n.professional_id, n.access_scope, p.display_name
  INTO v_rec
  FROM public.wa_numbers n
  LEFT JOIN public.professional_profiles p ON p.id = n.professional_id
  WHERE n.clinic_id = v_clinic_id
    AND n.number_type = 'professional_private'
    AND n.is_active = true
    AND REGEXP_REPLACE(n.phone, '[^0-9]', '', 'g') = v_phone
  LIMIT 1;

  IF v_rec.professional_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'clinic_id',       v_clinic_id,
    'professional_id', v_rec.professional_id,
    'name',            v_rec.display_name,
    'access_scope',    v_rec.access_scope
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_resolve_phone(text) TO authenticated, anon;

-- ============================================================
-- PACIENTES
-- ============================================================

-- ── wa_pro_patient_search ───────────────────────────────────
-- Busca paciente por nome (parcial) ou telefone

CREATE OR REPLACE FUNCTION public.wa_pro_patient_search(
  p_phone  text,
  p_query  text,
  p_limit  int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth      jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_q         text := COALESCE(TRIM(p_query), '');
  v_q_digits  text := REGEXP_REPLACE(v_q, '[^0-9]', '', 'g');
  v_results   jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN v_auth;
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;

  IF v_q = '' OR LENGTH(v_q) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'query_too_short');
  END IF;

  -- Busca em leads (nome ou telefone)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',          l.id,
    'name',        l.name,
    'phone',       l.phone,
    'temperature', l.temperature,
    'phase',       l.phase,
    'status',      l.status,
    'last_response_at', l.last_response_at
  ) ORDER BY l.updated_at DESC), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT id, name, phone, temperature, phase, status, last_response_at, updated_at
    FROM public.leads
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND (
        name ILIKE '%' || v_q || '%'
        OR (v_q_digits != '' AND phone LIKE '%' || v_q_digits || '%')
      )
    ORDER BY updated_at DESC
    LIMIT p_limit
  ) l;

  RETURN jsonb_build_object('ok', true, 'results', v_results, 'query', v_q);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_patient_search(text, text, int) TO authenticated, anon;

-- ── wa_pro_patient_balance ──────────────────────────────────
-- Quanto o paciente ainda deve (saldo de appointments)

CREATE OR REPLACE FUNCTION public.wa_pro_patient_balance(
  p_phone     text,
  p_patient_query text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth      jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_q         text := TRIM(COALESCE(p_patient_query, ''));
  v_lead      record;
  v_total     numeric := 0;
  v_paid      numeric := 0;
  v_appts     jsonb := '[]'::jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;

  -- Encontra o lead/paciente (primeiro match)
  SELECT id, name, phone INTO v_lead
  FROM public.leads
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND (name ILIKE '%' || v_q || '%' OR phone LIKE '%' || REGEXP_REPLACE(v_q, '[^0-9]', '', 'g') || '%')
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_lead.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'patient_not_found', 'query', v_q);
  END IF;

  -- Soma de appointments finalizados + cashflow_entries vinculadas
  SELECT
    COALESCE(SUM(a.value), 0),
    COALESCE(SUM((SELECT COALESCE(SUM(amount), 0) FROM public.cashflow_entries WHERE appointment_id = a.id AND deleted_at IS NULL AND direction = 'credit')), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'date', a.scheduled_date,
      'procedure', a.procedure_name,
      'value', a.value,
      'paid', (SELECT COALESCE(SUM(amount), 0) FROM public.cashflow_entries WHERE appointment_id = a.id AND deleted_at IS NULL AND direction = 'credit'),
      'payment_status', a.payment_status
    ) ORDER BY a.scheduled_date DESC), '[]'::jsonb)
  INTO v_total, v_paid, v_appts
  FROM public.appointments a
  WHERE a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL
    AND a.patient_id::text = v_lead.id
    AND a.status = 'finalizado';

  RETURN jsonb_build_object(
    'ok',         true,
    'patient',    jsonb_build_object('id', v_lead.id, 'name', v_lead.name, 'phone', v_lead.phone),
    'total',      ROUND(v_total, 2),
    'paid',       ROUND(v_paid, 2),
    'balance',    ROUND(GREATEST(0, v_total - v_paid), 2),
    'appointments', v_appts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_patient_balance(text, text) TO authenticated, anon;

-- ============================================================
-- AGENDA
-- ============================================================

-- ── wa_pro_agenda ───────────────────────────────────────────
-- Agenda do profissional pra uma data especifica

CREATE OR REPLACE FUNCTION public.wa_pro_agenda(
  p_phone text,
  p_date  date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth      jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_prof_id   uuid;
  v_scope     text;
  v_appts     jsonb;
  v_total     int := 0;
  v_finalized int := 0;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id',           a.id,
      'time',         a.start_time,
      'patient',      a.patient_name,
      'procedure',    a.procedure_name,
      'status',       a.status,
      'value',        a.value,
      'payment_status', a.payment_status
    ) ORDER BY a.start_time), '[]'::jsonb),
    COUNT(*),
    COUNT(*) FILTER (WHERE a.status = 'finalizado')
  INTO v_appts, v_total, v_finalized
  FROM public.appointments a
  WHERE a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL
    AND a.scheduled_date = p_date
    AND (
      v_scope IN ('full', 'team')
      OR a.professional_id = v_prof_id
    );

  RETURN jsonb_build_object(
    'ok',         true,
    'date',       p_date,
    'appointments', v_appts,
    'total',      v_total,
    'finalized',  v_finalized,
    'pending',    v_total - v_finalized
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_agenda(text, date) TO authenticated, anon;

-- ── wa_pro_agenda_free_slots ────────────────────────────────
-- Horarios livres do profissional num dia

CREATE OR REPLACE FUNCTION public.wa_pro_agenda_free_slots(
  p_phone text,
  p_date  date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth      jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_prof_id   uuid;
  v_scope     text;
  v_busy      jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';

  -- Lista horarios ocupados
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'start_time', start_time,
    'end_time',   end_time,
    'patient',    patient_name
  ) ORDER BY start_time), '[]'::jsonb)
  INTO v_busy
  FROM public.appointments
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND scheduled_date = p_date
    AND status IN ('agendado', 'confirmado', 'compareceu', 'finalizado')
    AND (v_scope IN ('full', 'team') OR professional_id = v_prof_id);

  RETURN jsonb_build_object(
    'ok',   true,
    'date', p_date,
    'busy', v_busy
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_agenda_free_slots(text, date) TO authenticated, anon;

-- ============================================================
-- FINANCEIRO
-- ============================================================

-- ── wa_pro_finance_summary ──────────────────────────────────
-- Resumo financeiro do profissional num periodo

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
  v_auth      jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_prof_id   uuid;
  v_scope     text;
  v_bruto     numeric := 0;
  v_qtd       int := 0;
  v_prev_bruto numeric := 0;
  v_period_days int;
  v_prev_start date;
  v_prev_end   date;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';

  -- Receita bruta no periodo
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_bruto, v_qtd
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'credit'
    AND transaction_date BETWEEN p_start_date AND p_end_date
    AND (v_scope = 'full' OR professional_id = v_prof_id);

  -- Comparativo: mesmo periodo anterior
  v_period_days := (p_end_date - p_start_date) + 1;
  v_prev_end := p_start_date - 1;
  v_prev_start := v_prev_end - (v_period_days - 1);

  SELECT COALESCE(SUM(amount), 0)
  INTO v_prev_bruto
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'credit'
    AND transaction_date BETWEEN v_prev_start AND v_prev_end
    AND (v_scope = 'full' OR professional_id = v_prof_id);

  RETURN jsonb_build_object(
    'ok',     true,
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date, 'days', v_period_days),
    'bruto',  ROUND(v_bruto, 2),
    'qtd',    v_qtd,
    'ticket_medio', CASE WHEN v_qtd > 0 THEN ROUND(v_bruto / v_qtd, 2) ELSE 0 END,
    'previous_bruto', ROUND(v_prev_bruto, 2),
    'delta_pct', CASE WHEN v_prev_bruto > 0 THEN ROUND(((v_bruto - v_prev_bruto) / v_prev_bruto) * 100, 1) ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_finance_summary(text, date, date) TO authenticated, anon;

-- ── wa_pro_finance_commission ───────────────────────────────
-- Comissao do profissional no periodo

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
  v_auth        jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id   uuid;
  v_prof_id     uuid;
  v_prof_comms  jsonb;
  v_commissions jsonb;
  v_default_comm numeric := 0;
  v_total_bruto numeric := 0;
  v_total_comm  numeric := 0;
  v_rec         record;
  v_comm_item   jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;

  -- Carrega comissoes do profissional
  SELECT commissions INTO v_prof_comms
  FROM public.professional_profiles
  WHERE id = v_prof_id;

  -- Carrega default da clinica
  SELECT commissions INTO v_commissions FROM public.cashflow_config WHERE clinic_id = v_clinic_id;
  v_default_comm := COALESCE((v_commissions->>'default_pct')::numeric, 0);

  -- Loop por entries do profissional
  FOR v_rec IN
    SELECT amount, procedure_name
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND professional_id = v_prof_id
      AND transaction_date BETWEEN p_start_date AND p_end_date
  LOOP
    v_total_bruto := v_total_bruto + v_rec.amount;

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

      -- Fallback default
      IF NOT v_match AND v_default_comm > 0 THEN
        v_comm_val := v_rec.amount * v_default_comm / 100;
      END IF;

      v_total_comm := v_total_comm + v_comm_val;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',          true,
    'period',      jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'bruto',       ROUND(v_total_bruto, 2),
    'comissao',    ROUND(v_total_comm, 2),
    'percentual',  CASE WHEN v_total_bruto > 0 THEN ROUND((v_total_comm / v_total_bruto) * 100, 1) ELSE 0 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_finance_commission(text, date, date) TO authenticated, anon;

COMMENT ON FUNCTION public.wa_pro_resolve_phone        IS 'Mira: helper que resolve phone → clinic_id, professional_id, access_scope';
COMMENT ON FUNCTION public.wa_pro_patient_search       IS 'Mira: busca paciente por nome ou telefone';
COMMENT ON FUNCTION public.wa_pro_patient_balance      IS 'Mira: saldo do paciente (total - pago via cashflow_entries)';
COMMENT ON FUNCTION public.wa_pro_agenda               IS 'Mira: agenda do profissional num dia (respeita access_scope)';
COMMENT ON FUNCTION public.wa_pro_agenda_free_slots    IS 'Mira: lista horarios ocupados (frontend infere os livres)';
COMMENT ON FUNCTION public.wa_pro_finance_summary      IS 'Mira: receita do profissional num periodo + delta vs anterior';
COMMENT ON FUNCTION public.wa_pro_finance_commission   IS 'Mira: comissao real do profissional via professional_profiles.commissions';
