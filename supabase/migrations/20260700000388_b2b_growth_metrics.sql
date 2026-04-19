-- ============================================================
-- Migration: B2B Growth Metrics — funil + cohort + alertas proativos
-- Mesmo nivel de profundidade do growth-metrics (B2C/VPI), adaptado
-- pra universo B2B (partnerships, vouchers, attributions).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- TABELA de alertas B2B
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.b2b_analytics_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  kind            text NOT NULL,
  severity        text NOT NULL DEFAULT 'info'
                  CHECK (severity IN ('info','warning','critical')),
  title           text NOT NULL,
  detail          text NULL,
  recommendation  text NULL,
  metric_value    numeric NULL,
  metric_delta    numeric NULL,
  partnership_id  uuid NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  data            jsonb NULL,
  dismissed_at    timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_b2b_alerts_active
  ON public.b2b_analytics_alerts (clinic_id, dismissed_at, severity, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_b2b_alerts_active_kind
  ON public.b2b_analytics_alerts (clinic_id, kind, COALESCE(partnership_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE dismissed_at IS NULL;
ALTER TABLE public.b2b_analytics_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_alerts_all" ON public.b2b_analytics_alerts;
CREATE POLICY "b2b_alerts_all" ON public.b2b_analytics_alerts FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- RPC 1: Funnel B2B (8 etapas)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_funnel_breakdown(p_days int DEFAULT 90, p_partnership_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_out jsonb;
BEGIN
  -- Ordem canônica de status B2B: candidato(applications) → prospect → dna_check → contract → active → review → paused → closed
  WITH app AS (
    SELECT COUNT(*) AS candidatos
      FROM public.b2b_partnership_applications
     WHERE clinic_id = v_clinic_id AND created_at >= v_since
       AND (p_partnership_id IS NULL OR partnership_id = p_partnership_id)
  ),
  parts AS (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('prospect','dna_check','contract','active','review','paused','closed')) AS total,
      COUNT(*) FILTER (WHERE status IN ('prospect','dna_check','contract','active','review','paused','closed')) AS prospect,
      COUNT(*) FILTER (WHERE status IN ('dna_check','contract','active','review','paused','closed')) AS dna_check,
      COUNT(*) FILTER (WHERE status IN ('contract','active','review','paused','closed')) AS contract,
      COUNT(*) FILTER (WHERE status IN ('active','review','paused','closed')) AS active_ever,
      COUNT(*) FILTER (WHERE status IN ('review','paused','closed')) AS review,
      COUNT(*) FILTER (WHERE status = 'paused') AS paused,
      COUNT(*) FILTER (WHERE status = 'closed') AS closed
    FROM public.b2b_partnerships
    WHERE clinic_id = v_clinic_id
      AND created_at >= v_since
      AND (p_partnership_id IS NULL OR id = p_partnership_id)
  )
  SELECT jsonb_build_object(
    'candidatos', (SELECT candidatos FROM app),
    'prospect',   prospect,
    'dna_check',  dna_check,
    'contract',   contract,
    'active',     active_ever,
    'review',     review,
    'paused',     paused,
    'closed',     closed,
    'total',      prospect,
    'dropoff', jsonb_build_object(
      'candidato_to_prospect',  CASE WHEN (SELECT candidatos FROM app)>0 THEN ROUND((100.0*((SELECT candidatos FROM app)-prospect)/GREATEST((SELECT candidatos FROM app),1))::numeric,1) ELSE 0 END,
      'prospect_to_dna',        CASE WHEN prospect>0  THEN ROUND((100.0*(prospect-dna_check)/prospect)::numeric,1) ELSE 0 END,
      'dna_to_contract',        CASE WHEN dna_check>0 THEN ROUND((100.0*(dna_check-contract)/dna_check)::numeric,1) ELSE 0 END,
      'contract_to_active',     CASE WHEN contract>0  THEN ROUND((100.0*(contract-active_ever)/contract)::numeric,1) ELSE 0 END,
      'active_to_churn',        CASE WHEN active_ever>0 THEN ROUND((100.0*(paused+closed)/active_ever)::numeric,1) ELSE 0 END
    ),
    'conversion_rate', CASE WHEN prospect>0 THEN ROUND((100.0*active_ever/prospect)::numeric,1) ELSE 0 END,
    'period_days', p_days,
    'partnership_id', p_partnership_id
  ) INTO v_out FROM parts;
  RETURN v_out;
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 2: Time-series B2B (vouchers + redeemed + revenue)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_timeseries(
  p_bucket text DEFAULT 'month', p_periods int DEFAULT 12, p_partnership_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_since timestamptz;
  v_bucket_sql text;
  v_result jsonb;
BEGIN
  v_bucket_sql := CASE p_bucket WHEN 'day' THEN 'day' WHEN 'week' THEN 'week' ELSE 'month' END;
  v_since := date_trunc(v_bucket_sql, now()) - (
    CASE v_bucket_sql WHEN 'day' THEN (p_periods || ' days')::interval
                      WHEN 'week' THEN (p_periods * 7 || ' days')::interval
                      ELSE (p_periods || ' months')::interval END);
  WITH series AS (
    SELECT generate_series(v_since, now(),
      CASE v_bucket_sql WHEN 'day' THEN INTERVAL '1 day'
                        WHEN 'week' THEN INTERVAL '1 week'
                        ELSE INTERVAL '1 month' END)::date AS bucket
  ),
  data AS (
    SELECT
      date_trunc(v_bucket_sql, v.issued_at)::date AS bucket,
      COUNT(*) AS issued,
      COUNT(*) FILTER (WHERE v.status = 'redeemed') AS redeemed,
      COALESCE(SUM(CASE WHEN v.status = 'redeemed' THEN COALESCE(p.voucher_unit_cost_brl, 0) ELSE 0 END), 0) AS cost,
      COALESCE(SUM(CASE WHEN a.status='converted' THEN a.revenue_brl ELSE 0 END), 0) AS revenue
    FROM public.b2b_vouchers v
    LEFT JOIN public.b2b_partnerships p ON p.id = v.partnership_id
    LEFT JOIN public.b2b_attributions a ON a.voucher_id = v.id
    WHERE v.clinic_id = v_clinic_id AND v.issued_at >= v_since
      AND (p_partnership_id IS NULL OR v.partnership_id = p_partnership_id)
    GROUP BY date_trunc(v_bucket_sql, v.issued_at)
  )
  SELECT jsonb_agg(jsonb_build_object(
    'bucket', to_char(s.bucket, 'YYYY-MM-DD'),
    'created',  COALESCE(d.issued, 0),
    'closed',   COALESCE(d.redeemed, 0),
    'revenue',  COALESCE(d.revenue, 0),
    'cost',     COALESCE(d.cost, 0),
    'conversion', CASE WHEN COALESCE(d.issued,0) > 0
                    THEN ROUND((100.0 * COALESCE(d.redeemed,0) / d.issued)::numeric, 1) ELSE 0 END
  ) ORDER BY s.bucket) INTO v_result
  FROM series s LEFT JOIN data d USING (bucket);
  RETURN jsonb_build_object('bucket', p_bucket, 'periods', p_periods,
                            'partnership_id', p_partnership_id,
                            'series', COALESCE(v_result, '[]'::jsonb));
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 3: Cohort retention de parcerias
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_cohort_retention(p_months int DEFAULT 6)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_result jsonb;
BEGIN
  WITH cohorts AS (
    SELECT
      date_trunc('month', p.created_at)::date AS cohort_month,
      p.id AS partnership_id
    FROM public.b2b_partnerships p
    WHERE p.clinic_id = v_clinic_id
      AND p.created_at >= date_trunc('month', now()) - (p_months || ' months')::interval
  ),
  activity AS (
    SELECT
      partnership_id,
      date_trunc('month', v.issued_at)::date AS active_month
    FROM public.b2b_vouchers v
    WHERE v.clinic_id = v_clinic_id
    GROUP BY partnership_id, date_trunc('month', v.issued_at)
  ),
  matrix AS (
    SELECT
      c.cohort_month,
      COUNT(DISTINCT c.partnership_id) AS cohort_size,
      COUNT(DISTINCT a.partnership_id) FILTER (WHERE a.active_month = c.cohort_month) AS m0,
      COUNT(DISTINCT a.partnership_id) FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '1 month') AS m1,
      COUNT(DISTINCT a.partnership_id) FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '2 months') AS m2,
      COUNT(DISTINCT a.partnership_id) FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '3 months') AS m3,
      COUNT(DISTINCT a.partnership_id) FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '6 months') AS m6
    FROM cohorts c LEFT JOIN activity a ON a.partnership_id = c.partnership_id
    GROUP BY c.cohort_month
  )
  SELECT jsonb_agg(jsonb_build_object(
    'cohort', to_char(cohort_month, 'YYYY-MM'),
    'size', cohort_size,
    'm0', m0, 'm1', m1, 'm2', m2, 'm3', m3, 'm6', m6,
    'm1_rate', CASE WHEN cohort_size>0 THEN ROUND((100.0*m1/cohort_size)::numeric,1) ELSE 0 END,
    'm3_rate', CASE WHEN cohort_size>0 THEN ROUND((100.0*m3/cohort_size)::numeric,1) ELSE 0 END,
    'm6_rate', CASE WHEN cohort_size>0 THEN ROUND((100.0*m6/cohort_size)::numeric,1) ELSE 0 END
  ) ORDER BY cohort_month DESC) INTO v_result FROM matrix;
  RETURN jsonb_build_object('months', p_months, 'cohorts', COALESCE(v_result, '[]'::jsonb));
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 4: Velocity — dias entre created_at e primeira voucher
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_partnership_velocity(p_days int DEFAULT 180, p_partnership_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_now_data record;
  v_prev_data record;
BEGIN
  WITH first_voucher AS (
    SELECT partnership_id, MIN(issued_at) AS first_at
      FROM public.b2b_vouchers WHERE clinic_id = v_clinic_id
     GROUP BY partnership_id
  )
  SELECT
    AVG(EXTRACT(EPOCH FROM (fv.first_at - p.created_at)) / 86400)::numeric AS avg_days,
    MIN(EXTRACT(EPOCH FROM (fv.first_at - p.created_at)) / 86400)::numeric AS min_days,
    MAX(EXTRACT(EPOCH FROM (fv.first_at - p.created_at)) / 86400)::numeric AS max_days,
    COUNT(*) AS n
    INTO v_now_data
    FROM public.b2b_partnerships p
    JOIN first_voucher fv ON fv.partnership_id = p.id
    WHERE p.clinic_id = v_clinic_id
      AND p.created_at >= now() - (p_days || ' days')::interval
      AND (p_partnership_id IS NULL OR p.id = p_partnership_id);

  WITH first_voucher AS (
    SELECT partnership_id, MIN(issued_at) AS first_at
      FROM public.b2b_vouchers WHERE clinic_id = v_clinic_id
     GROUP BY partnership_id
  )
  SELECT AVG(EXTRACT(EPOCH FROM (fv.first_at - p.created_at)) / 86400)::numeric AS avg_days
    INTO v_prev_data
    FROM public.b2b_partnerships p
    JOIN first_voucher fv ON fv.partnership_id = p.id
    WHERE p.clinic_id = v_clinic_id
      AND p.created_at >= now() - (p_days*2 || ' days')::interval
      AND p.created_at <  now() - (p_days   || ' days')::interval
      AND (p_partnership_id IS NULL OR p.id = p_partnership_id);

  RETURN jsonb_build_object(
    'period_days', p_days, 'partnership_id', p_partnership_id,
    'avg_days', ROUND(COALESCE(v_now_data.avg_days, 0), 1),
    'min_days', ROUND(COALESCE(v_now_data.min_days, 0), 1),
    'max_days', ROUND(COALESCE(v_now_data.max_days, 0), 1),
    'n', v_now_data.n,
    'avg_days_prev', ROUND(COALESCE(v_prev_data.avg_days, 0), 1),
    'delta_pct', CASE WHEN COALESCE(v_prev_data.avg_days, 0) > 0
      THEN ROUND((100.0*(v_now_data.avg_days - v_prev_data.avg_days)/v_prev_data.avg_days)::numeric, 1)
      ELSE 0 END
  );
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 5: Quality ranking — volume × taxa de resgate
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_partnership_quality(p_days int DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_result jsonb;
BEGIN
  WITH stats AS (
    SELECT
      p.id AS partner_id,
      p.name AS nome,
      p.tier,
      p.pillar,
      p.status,
      COUNT(v.id) AS total,
      COUNT(v.id) FILTER (WHERE v.status = 'redeemed') AS closed,
      COUNT(v.id) FILTER (WHERE v.status IN ('expired','cancelled')) AS lost
    FROM public.b2b_partnerships p
    LEFT JOIN public.b2b_vouchers v ON v.partnership_id = p.id
      AND v.issued_at >= now() - (p_days || ' days')::interval
    WHERE p.clinic_id = v_clinic_id AND p.status IN ('active','review')
    GROUP BY p.id, p.name, p.tier, p.pillar, p.status
    HAVING COUNT(v.id) > 0
  )
  SELECT jsonb_agg(jsonb_build_object(
    'partner_id', partner_id, 'nome', nome,
    'tier', CASE WHEN tier IS NOT NULL THEN 'T' || tier ELSE NULL END,
    'pillar', pillar,
    'total', total, 'closed', closed, 'lost', lost,
    'conversion_pct', CASE WHEN total>0 THEN ROUND((100.0*closed/total)::numeric,1) ELSE 0 END,
    'quality_class', CASE
      WHEN total >= 5 AND closed::numeric/total >= 0.6 THEN 'ouro'
      WHEN total >= 3 AND closed::numeric/total >= 0.4 THEN 'boa'
      WHEN total >= 5 AND closed::numeric/total <  0.15 THEN 'baixa'
      ELSE 'media'
    END
  ) ORDER BY
    CASE WHEN total>0 THEN closed::numeric/total ELSE 0 END DESC,
    total DESC) INTO v_result FROM stats;
  RETURN jsonb_build_object('period_days', p_days, 'partners', COALESCE(v_result, '[]'::jsonb));
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 6: Forecast de parcerias novas + vouchers do mês
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_forecast_month(
  p_meta_new_partners int DEFAULT 3,
  p_meta_vouchers int DEFAULT 30
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_new_done int;
  v_vouch_done int;
  v_days_passed int;
  v_days_in_month int;
  v_new_proj numeric;
  v_vouch_proj numeric;
BEGIN
  SELECT COUNT(*) INTO v_new_done
    FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id
     AND created_at >= date_trunc('month', now())
     AND status IN ('active','review');
  SELECT COUNT(*) INTO v_vouch_done
    FROM public.b2b_vouchers
   WHERE clinic_id = v_clinic_id
     AND issued_at >= date_trunc('month', now());
  v_days_passed := GREATEST(1, EXTRACT(DAY FROM now())::int);
  v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', now()) + INTERVAL '1 month - 1 day'))::int;
  v_new_proj   := ROUND((v_new_done::numeric   / v_days_passed) * v_days_in_month, 1);
  v_vouch_proj := ROUND((v_vouch_done::numeric / v_days_passed) * v_days_in_month, 1);

  RETURN jsonb_build_object(
    'meta_new_partners', p_meta_new_partners,
    'meta_vouchers',     p_meta_vouchers,
    'new_realized',      v_new_done,
    'new_projection',    v_new_proj,
    'new_pct_of_meta',   CASE WHEN p_meta_new_partners>0 THEN ROUND((100.0*v_new_proj/p_meta_new_partners)::numeric,1) ELSE 0 END,
    'vouch_realized',    v_vouch_done,
    'vouch_projection',  v_vouch_proj,
    'vouch_pct_of_meta', CASE WHEN p_meta_vouchers>0 THEN ROUND((100.0*v_vouch_proj/p_meta_vouchers)::numeric,1) ELSE 0 END,
    'days_passed',       v_days_passed,
    'days_in_month',     v_days_in_month,
    'status', CASE
      WHEN v_new_proj >= p_meta_new_partners * 1.1 THEN 'acima'
      WHEN v_new_proj >= p_meta_new_partners * 0.9 THEN 'ok'
      WHEN v_new_proj >= p_meta_new_partners * 0.7 THEN 'atento'
      ELSE 'risco' END
  );
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 7: Drop-off vouchers (delivered mas não redeemed há X dias)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_dropoff_vouchers(p_days int DEFAULT 14)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'voucher_id', v.id,
    'token', v.token,
    'recipient_name', v.recipient_name,
    'partnership_name', p.name,
    'partnership_id', p.id,
    'status', v.status,
    'issued_at', v.issued_at,
    'days_since', EXTRACT(DAY FROM (now() - v.issued_at))::int
  ) ORDER BY v.issued_at ASC), '[]'::jsonb) INTO v_result
  FROM public.b2b_vouchers v
  JOIN public.b2b_partnerships p ON p.id = v.partnership_id
  WHERE v.clinic_id = v_clinic_id
    AND v.status IN ('issued','delivered','opened')
    AND v.issued_at <= now() - (p_days || ' days')::interval
    AND v.valid_until > now();  -- ainda válidos
  RETURN jsonb_build_object('threshold_days', p_days, 'vouchers', v_result);
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 8: Heatmap — dia×hora de emissões
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_heatmap_activity(p_days int DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'dow', dow, 'hour', hour, 'count', cnt
  )) INTO v_result FROM (
    SELECT
      EXTRACT(DOW FROM issued_at)::int AS dow,
      EXTRACT(HOUR FROM issued_at)::int AS hour,
      COUNT(*) AS cnt
    FROM public.b2b_vouchers
    WHERE clinic_id = v_clinic_id
      AND issued_at >= now() - (p_days || ' days')::interval
    GROUP BY dow, hour
  ) t;
  RETURN jsonb_build_object('period_days', p_days, 'cells', COALESCE(v_result, '[]'::jsonb));
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 9: Payback detalhado B2B
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_payback_analysis(p_days int DEFAULT 180, p_partnership_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_data record;
BEGIN
  SELECT
    COUNT(*) AS total_created,
    COUNT(*) FILTER (WHERE v.status='redeemed') AS total_closed,
    COALESCE(SUM(CASE WHEN v.status='redeemed' THEN COALESCE(p.voucher_unit_cost_brl, 10) ELSE 0 END), 0) AS cost_estimated,
    COALESCE(SUM(CASE WHEN a.status='converted' THEN a.revenue_brl ELSE 0 END), 0) AS revenue_estimated,
    AVG(CASE WHEN v.status='redeemed'
      THEN EXTRACT(EPOCH FROM (v.redeemed_at - v.issued_at))/86400 END)::numeric AS avg_payback_days
    INTO v_data
    FROM public.b2b_vouchers v
    LEFT JOIN public.b2b_partnerships p ON p.id = v.partnership_id
    LEFT JOIN public.b2b_attributions a ON a.voucher_id = v.id
    WHERE v.clinic_id = v_clinic_id
      AND v.issued_at >= now() - (p_days || ' days')::interval
      AND (p_partnership_id IS NULL OR v.partnership_id = p_partnership_id);
  RETURN jsonb_build_object(
    'period_days', p_days, 'partnership_id', p_partnership_id,
    'total_created', v_data.total_created,
    'total_closed',  v_data.total_closed,
    'cost_estimated', v_data.cost_estimated,
    'revenue_estimated', v_data.revenue_estimated,
    'roi_pct', CASE WHEN v_data.cost_estimated > 0
      THEN ROUND((100.0*(v_data.revenue_estimated - v_data.cost_estimated)/v_data.cost_estimated)::numeric, 1)
      ELSE 0 END,
    'avg_payback_days', ROUND(COALESCE(v_data.avg_payback_days, 0), 1)
  );
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 10: Search de parcerias (autocomplete)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_partnership_search(p_query text, p_limit int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_q text;
  v_q_digits text;
  v_out jsonb;
BEGIN
  v_q := lower(trim(COALESCE(p_query, '')));
  v_q_digits := regexp_replace(COALESCE(p_query, ''), '\D', '', 'g');
  IF length(v_q) < 2 AND length(v_q_digits) < 3 THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb)
  ; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'nome', name, 'phone', COALESCE(contact_phone, ''),
    'tier', CASE WHEN tier IS NOT NULL THEN 'T' || tier ELSE NULL END,
    'pillar', pillar, 'status', status
  ) ORDER BY name), '[]'::jsonb) INTO v_out FROM (
    SELECT id, name, contact_phone, tier, pillar, status
      FROM public.b2b_partnerships
     WHERE clinic_id = v_clinic_id
       AND status NOT IN ('closed')
       AND (
         (length(v_q) >= 2 AND lower(name) LIKE '%' || v_q || '%')
         OR (length(v_q_digits) >= 3 AND regexp_replace(COALESCE(contact_phone,''), '\D', '', 'g') LIKE '%' || v_q_digits || '%')
       )
     ORDER BY name LIMIT p_limit
  ) q;
  RETURN jsonb_build_object('rows', v_out, 'query', p_query);
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 11: scan alertas B2B
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_alerts_scan()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_created int := 0;
  v_funnel jsonb;
  v_velocity jsonb;
  v_forecast jsonb;
  v_dropoff jsonb;
  v_rec record;
BEGIN
  -- 1. Funnel drop prospect → dna_check > 50%
  v_funnel := public.b2b_funnel_breakdown(90, NULL);
  IF (v_funnel->'dropoff'->>'prospect_to_dna')::numeric > 50 THEN
    INSERT INTO public.b2b_analytics_alerts
      (kind, severity, title, detail, recommendation, metric_value)
    VALUES ('funnel_drop_dna', 'warning',
      'Prospects não avançam pra DNA check',
      'Mais da metade dos prospects está travada sem avaliação DNA.',
      'Agendar reunião DNA nos primeiros 7 dias após prospect. Definir owner responsável.',
      (v_funnel->'dropoff'->>'prospect_to_dna')::numeric)
    ON CONFLICT (clinic_id, kind, COALESCE(partnership_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE dismissed_at IS NULL DO NOTHING;
    v_created := v_created + 1;
  END IF;

  IF (v_funnel->'dropoff'->>'contract_to_active')::numeric > 30 THEN
    INSERT INTO public.b2b_analytics_alerts
      (kind, severity, title, detail, recommendation, metric_value)
    VALUES ('funnel_drop_activate', 'critical',
      'Contratos assinados mas não ativados',
      '30%+ das parcerias com contrato nunca chegaram a emitir voucher.',
      'Executar playbook de onboarding das parcerias travadas. Verificar se combo + link estão prontos.',
      (v_funnel->'dropoff'->>'contract_to_active')::numeric)
    ON CONFLICT (clinic_id, kind, COALESCE(partnership_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE dismissed_at IS NULL DO NOTHING;
    v_created := v_created + 1;
  END IF;

  -- 2. Forecast risco
  v_forecast := public.b2b_forecast_month(3, 30);
  IF (v_forecast->>'status')::text = 'risco' THEN
    INSERT INTO public.b2b_analytics_alerts
      (kind, severity, title, detail, recommendation)
    VALUES ('forecast_risk', 'critical',
      'Projeção do mês abaixo da meta',
      format('Projeção: %s novas parcerias + %s vouchers · Meta: %s + %s',
        (v_forecast->>'new_projection'), (v_forecast->>'vouch_projection'),
        (v_forecast->>'meta_new_partners'), (v_forecast->>'meta_vouchers')),
      'Acelerar pipeline: revisar candidaturas pendentes + reunir lista de 5 novas parceiras alvo pra contatar essa semana.')
    ON CONFLICT (clinic_id, kind, COALESCE(partnership_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE dismissed_at IS NULL DO NOTHING;
    v_created := v_created + 1;
  END IF;

  -- 3. Drop-off vouchers 14d+
  v_dropoff := public.b2b_dropoff_vouchers(14);
  IF jsonb_array_length(COALESCE(v_dropoff->'vouchers', '[]'::jsonb)) >= 3 THEN
    INSERT INTO public.b2b_analytics_alerts
      (kind, severity, title, detail, recommendation, metric_value, data)
    VALUES ('dropoff_vouchers', 'warning',
      format('%s vouchers emitidos há 14d+ sem resgate', jsonb_array_length(v_dropoff->'vouchers')),
      'Vouchers válidos não resgatados — risco de expirarem.',
      'Disparar mensagem de lembrete via Lara pra cada destinatária: "ainda dá tempo de aproveitar seu presente!"',
      jsonb_array_length(v_dropoff->'vouchers'), v_dropoff)
    ON CONFLICT (clinic_id, kind, COALESCE(partnership_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE dismissed_at IS NULL DO NOTHING;
    v_created := v_created + 1;
  END IF;

  -- 4. Parceiras active há 30d+ sem voucher (silêncio)
  FOR v_rec IN
    SELECT p.id, p.name,
      EXTRACT(DAY FROM (now() - GREATEST(p.created_at, COALESCE((SELECT MAX(issued_at) FROM b2b_vouchers v WHERE v.partnership_id=p.id), p.created_at))))::int AS silent_days
      FROM public.b2b_partnerships p
     WHERE p.clinic_id = v_clinic_id AND p.status = 'active'
       AND p.created_at <= now() - INTERVAL '30 days'
       AND NOT EXISTS (SELECT 1 FROM b2b_vouchers v WHERE v.partnership_id=p.id AND v.issued_at >= now() - INTERVAL '30 days')
  LOOP
    INSERT INTO public.b2b_analytics_alerts
      (kind, severity, title, detail, recommendation, metric_value, partnership_id)
    VALUES ('partnership_silent', 'info',
      format('%s está silenciosa há %s dias', v_rec.name, v_rec.silent_days),
      format('Parceria active sem nenhum voucher emitido nos últimos 30 dias.'),
      format('Ligar ou mandar mensagem pra lembrar do ritmo. Combinar próximo evento ou campanha com %s.', v_rec.name),
      v_rec.silent_days, v_rec.id)
    ON CONFLICT (clinic_id, kind, COALESCE(partnership_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE dismissed_at IS NULL DO NOTHING;
    v_created := v_created + 1;
  END LOOP;

  -- 5. Custo acumulado passou 80% do teto
  FOR v_rec IN
    SELECT p.id, p.name, p.monthly_value_cap_brl AS cap,
      COALESCE(p.voucher_unit_cost_brl, 0) *
        (SELECT COUNT(*) FROM public.b2b_vouchers v
          WHERE v.partnership_id = p.id AND v.status='redeemed'
            AND v.redeemed_at >= date_trunc('month', now())) AS spent
      FROM public.b2b_partnerships p
     WHERE p.clinic_id = v_clinic_id AND p.status = 'active'
       AND p.monthly_value_cap_brl IS NOT NULL AND p.monthly_value_cap_brl > 0
  LOOP
    IF v_rec.spent::numeric / v_rec.cap >= 0.8 AND v_rec.spent::numeric / v_rec.cap < 1.0 THEN
      INSERT INTO public.b2b_analytics_alerts
        (kind, severity, title, detail, recommendation, metric_value, partnership_id)
      VALUES ('cost_near_cap', 'warning',
        format('%s: custo no mês a 80%% do teto', v_rec.name),
        format('Custo R$ %s de teto mensal R$ %s.', v_rec.spent::text, v_rec.cap::text),
        'Revisar voucher_monthly_cap se o volume está justificando. Pausar emissão se preferir controlar.',
        ROUND((100.0*v_rec.spent/v_rec.cap)::numeric,1), v_rec.id)
      ON CONFLICT (clinic_id, kind, COALESCE(partnership_id, '00000000-0000-0000-0000-000000000000'::uuid))
        WHERE dismissed_at IS NULL DO NOTHING;
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END $$;


-- ════════════════════════════════════════════════════════════
-- RPCs: list / dismiss alertas B2B
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_alerts_list(p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'kind', kind, 'severity', severity,
    'title', title, 'detail', detail, 'recommendation', recommendation,
    'metric_value', metric_value, 'metric_delta', metric_delta,
    'partnership_id', partnership_id, 'created_at', created_at
  ) ORDER BY
    CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
    created_at DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT * FROM public.b2b_analytics_alerts
     WHERE clinic_id = v_clinic_id AND dismissed_at IS NULL
     ORDER BY created_at DESC LIMIT p_limit
  ) a;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.b2b_alert_dismiss(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.b2b_analytics_alerts SET dismissed_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;


-- ════════════════════════════════════════════════════════════
-- Grants
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON public.b2b_analytics_alerts TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_funnel_breakdown(int, uuid)               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_timeseries(text, int, uuid)               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_cohort_retention(int)                     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnership_velocity(int, uuid)           TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnership_quality(int)                  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_forecast_month(int, int)                  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_dropoff_vouchers(int)                     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_heatmap_activity(int)                     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_payback_analysis(int, uuid)               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnership_search(text, int)             TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_alerts_scan()                             TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_alerts_list(int)                          TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_alert_dismiss(uuid)                       TO anon, authenticated, service_role;
