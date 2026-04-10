-- ============================================================
-- Migration: 20260638000000 — Legal Doc Metrics RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.legal_doc_metrics()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid; v_result jsonb;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado'); END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'total', COUNT(*),
    'signed', COUNT(*) FILTER (WHERE status = 'signed'),
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'viewed', COUNT(*) FILTER (WHERE status = 'viewed'),
    'expired', COUNT(*) FILTER (WHERE status = 'expired'),
    'revoked', COUNT(*) FILTER (WHERE status = 'revoked'),
    'sign_rate', CASE WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE status = 'signed')::numeric / COUNT(*)::numeric * 100, 1)
      ELSE 0 END,
    'avg_hours_to_sign', COALESCE(
      ROUND(EXTRACT(EPOCH FROM AVG(signed_at - created_at) FILTER (WHERE status = 'signed')) / 3600, 1),
      0),
    'last_7_days', COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days'),
    'signed_7_days', COUNT(*) FILTER (WHERE status = 'signed' AND signed_at >= now() - interval '7 days')
  ) INTO v_result
  FROM public.legal_doc_requests
  WHERE clinic_id = v_clinic_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.legal_doc_metrics() TO authenticated;
