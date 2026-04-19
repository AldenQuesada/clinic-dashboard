-- ============================================================
-- Migration: B2B Mira Analytics RPC
--
-- Consolida métricas da Mira B2B pra painel de observabilidade:
--   - Candidaturas: total, pending, aprovadas, rejeitadas
--   - Vouchers: total, via Mira vs manual, resgatados
--   - Tempo médio: onboarding (primeira → última mensagem) +
--     aprovação (pending → resolved)
--   - Saúde geral: % de parcerias verdes/amarelas/vermelhas
-- ============================================================

CREATE OR REPLACE FUNCTION public.b2b_mira_analytics(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_apps jsonb;
  v_vouchers jsonb;
  v_timing jsonb;
  v_health jsonb;
  v_mira_activity jsonb;
BEGIN
  -- Candidaturas
  SELECT jsonb_build_object(
    'total',     COUNT(*),
    'pending',   COUNT(*) FILTER (WHERE status = 'pending'),
    'approved',  COUNT(*) FILTER (WHERE status = 'approved'),
    'rejected',  COUNT(*) FILTER (WHERE status = 'rejected'),
    'archived',  COUNT(*) FILTER (WHERE status = 'archived'),
    'conversion_rate', CASE WHEN COUNT(*) > 0 THEN
      ROUND((COUNT(*) FILTER (WHERE status='approved')::numeric / COUNT(*)) * 100, 1)
      ELSE 0 END
  ) INTO v_apps
  FROM public.b2b_partnership_applications
  WHERE clinic_id = v_clinic_id
    AND created_at >= now() - (p_days || ' days')::interval;

  -- Vouchers via Mira vs manual (usa b2b_attributions.source)
  WITH v AS (
    SELECT a.source, v.status, v.issued_at
      FROM public.b2b_vouchers v
      LEFT JOIN public.b2b_attributions a ON a.voucher_id = v.id
     WHERE v.clinic_id = v_clinic_id
       AND v.issued_at >= now() - (p_days || ' days')::interval
  )
  SELECT jsonb_build_object(
    'total',        COUNT(*),
    'via_mira',     COUNT(*) FILTER (WHERE source = 'wa_mira'),
    'via_admin',    COUNT(*) FILTER (WHERE source = 'admin_manual' OR source IS NULL),
    'via_backfill', COUNT(*) FILTER (WHERE source = 'backfill'),
    'redeemed',     COUNT(*) FILTER (WHERE status = 'redeemed'),
    'delivered',    COUNT(*) FILTER (WHERE status IN ('delivered','opened','redeemed')),
    'opened',       COUNT(*) FILTER (WHERE status IN ('opened','redeemed'))
  ) INTO v_vouchers
  FROM v;

  -- Tempo de aprovação médio (horas entre created_at e resolved_at)
  SELECT jsonb_build_object(
    'avg_approval_hours', COALESCE(ROUND(
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 1), 0),
    'max_approval_hours', COALESCE(ROUND(
      MAX(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 1), 0),
    'resolved_count', COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)
  ) INTO v_timing
  FROM public.b2b_partnership_applications
  WHERE clinic_id = v_clinic_id
    AND resolved_at IS NOT NULL
    AND created_at >= now() - (p_days || ' days')::interval;

  -- Saúde atual das parcerias
  SELECT jsonb_build_object(
    'green',   COUNT(*) FILTER (WHERE health_color = 'green'),
    'yellow',  COUNT(*) FILTER (WHERE health_color = 'yellow'),
    'red',     COUNT(*) FILTER (WHERE health_color = 'red'),
    'unknown', COUNT(*) FILTER (WHERE health_color = 'unknown' OR health_color IS NULL),
    'total',   COUNT(*)
  ) INTO v_health
  FROM public.b2b_partnerships
  WHERE clinic_id = v_clinic_id
    AND status NOT IN ('closed');

  -- Atividade Mira: whitelist + brief sends + nps responses
  SELECT jsonb_build_object(
    'wa_senders_active', (SELECT COUNT(*) FROM public.b2b_partnership_wa_senders
                           WHERE clinic_id = v_clinic_id AND active = true),
    'wa_senders_total',  (SELECT COUNT(*) FROM public.b2b_partnership_wa_senders
                           WHERE clinic_id = v_clinic_id),
    'nps_responses',     (SELECT COUNT(*) FROM public.b2b_nps_responses
                           WHERE clinic_id = v_clinic_id
                             AND responded_at >= now() - (p_days || ' days')::interval),
    'nps_summary',       (SELECT public.b2b_nps_summary(null)),
    'insights_active',   (SELECT COUNT(*) FROM public.b2b_insights
                           WHERE clinic_id = v_clinic_id AND dismissed_at IS NULL)
  ) INTO v_mira_activity;

  RETURN jsonb_build_object(
    'ok', true,
    'period_days', p_days,
    'generated_at', now(),
    'applications', v_apps,
    'vouchers', v_vouchers,
    'timing', v_timing,
    'health', v_health,
    'mira', v_mira_activity
  );
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_mira_analytics(int) TO anon, authenticated, service_role;
