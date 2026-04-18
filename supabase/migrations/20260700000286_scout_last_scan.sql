-- ============================================================
-- Hotfix: b2b_scout_consumed_current_month inclui last_scan_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.b2b_scout_consumed_current_month()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_month_start date := date_trunc('month', now())::date;
  v_total_brl  numeric := 0;
  v_breakdown  jsonb;
  v_cfg        record;
  v_pct        numeric := 0;
  v_last_scan  timestamptz;
BEGIN
  SELECT COALESCE(SUM(cost_brl), 0) INTO v_total_brl
    FROM public.b2b_scout_usage
   WHERE clinic_id = v_clinic_id AND created_at >= v_month_start;

  SELECT COALESCE(jsonb_object_agg(event_type, sub), '{}'::jsonb) INTO v_breakdown
    FROM (
      SELECT event_type, jsonb_build_object(
               'count', COUNT(*),
               'cost',  ROUND(SUM(cost_brl)::numeric, 2)
             ) AS sub
        FROM public.b2b_scout_usage
       WHERE clinic_id = v_clinic_id AND created_at >= v_month_start
       GROUP BY event_type
    ) t;

  SELECT MAX(created_at) INTO v_last_scan
    FROM public.b2b_scout_usage
   WHERE clinic_id = v_clinic_id
     AND event_type = 'google_maps_scan';

  SELECT scout_enabled, budget_cap_monthly, alert_threshold_pct
    INTO v_cfg FROM public.b2b_scout_config WHERE clinic_id = v_clinic_id;

  IF v_cfg.budget_cap_monthly IS NOT NULL AND v_cfg.budget_cap_monthly > 0 THEN
    v_pct := ROUND((v_total_brl / v_cfg.budget_cap_monthly) * 100, 1);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'month_start',      v_month_start,
    'total_brl',        ROUND(v_total_brl::numeric, 2),
    'budget_cap_brl',   COALESCE(v_cfg.budget_cap_monthly, 100),
    'pct_used',         v_pct,
    'alert_threshold',  COALESCE(v_cfg.alert_threshold_pct, 80),
    'scout_enabled',    COALESCE(v_cfg.scout_enabled, false),
    'capped',           v_pct >= 100,
    'breakdown',        v_breakdown,
    'last_scan_at',     v_last_scan
  );
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_scout_consumed_current_month()
  TO anon, authenticated, service_role;
