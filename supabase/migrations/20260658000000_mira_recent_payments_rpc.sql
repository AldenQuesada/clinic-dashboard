-- Nova RPC pra Mira: lista pagamentos de um periodo
-- Responde queries tipo "quem pagou essa semana?", "pagamentos de hoje", "quem me pagou esse mes"
-- Respeita access_scope (own = so do profissional, full/team = todos)

CREATE OR REPLACE FUNCTION public.wa_pro_recent_payments(
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
  v_payments  jsonb;
  v_total     int := 0;
  v_sum       numeric := 0;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id',        a.id,
      'date',      a.scheduled_date,
      'patient',   a.patient_name,
      'procedure', a.procedure_name,
      'value',     a.value,
      'method',    a.payment_method
    ) ORDER BY a.scheduled_date DESC, a.start_time DESC), '[]'::jsonb),
    COUNT(*),
    COALESCE(SUM(a.value), 0)
  INTO v_payments, v_total, v_sum
  FROM public.appointments a
  WHERE a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL
    AND a.scheduled_date BETWEEN p_start_date AND p_end_date
    AND a.status = 'finalizado'
    AND a.payment_status = 'pago'
    AND (
      v_scope IN ('full', 'team')
      OR a.professional_id = v_prof_id
    );

  RETURN jsonb_build_object(
    'ok',       true,
    'start',    p_start_date,
    'end',      p_end_date,
    'total',    v_total,
    'sum',      ROUND(v_sum, 2),
    'payments', v_payments
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_recent_payments(text, date, date) TO authenticated, anon;

COMMENT ON FUNCTION public.wa_pro_recent_payments IS 'Mira: lista pagamentos finalizados num periodo (respeita access_scope)';
