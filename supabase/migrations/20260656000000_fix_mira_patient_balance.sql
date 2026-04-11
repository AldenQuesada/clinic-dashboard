-- Fix: wa_pro_patient_balance retornava lead aleatorio quando query era so nome
-- (sem digitos). A clausula `phone LIKE '%' || '' || '%'` bate com qualquer phone,
-- fazendo LIMIT 1 cair no lead mais recentemente atualizado.
-- Mesma correcao que ja existia em wa_pro_patient_search (v_q_digits != '').

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
  v_q_digits  text := REGEXP_REPLACE(COALESCE(p_patient_query, ''), '[^0-9]', '', 'g');
  v_lead      record;
  v_total     numeric := 0;
  v_paid      numeric := 0;
  v_appts     jsonb := '[]'::jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;

  IF v_q = '' OR LENGTH(v_q) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'query_too_short');
  END IF;

  -- Encontra o lead/paciente (primeiro match)
  SELECT id, name, phone INTO v_lead
  FROM public.leads
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND (
      name ILIKE '%' || v_q || '%'
      OR (v_q_digits != '' AND phone LIKE '%' || v_q_digits || '%')
    )
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
    AND a.patient_id::text = v_lead.id::text
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
