-- ============================================================
-- Migration: filtros por partner_id nas RPCs de métricas + search helper
-- Backward compat — parâmetro opcional default NULL (comportamento global).
-- ============================================================

-- ── Search helper (autocomplete) ────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_partner_search(p_query text, p_limit int DEFAULT 10)
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
    RETURN jsonb_build_object('rows', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',    id,
    'nome',  nome,
    'phone', phone,
    'tier',  tier_atual,
    'status', status
  ) ORDER BY nome), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT id, nome, phone, tier_atual, status
      FROM public.vpi_partners
     WHERE clinic_id = v_clinic_id
       AND status IN ('ativo','pendente')
       AND (
         (length(v_q) >= 2 AND lower(unaccent(nome)) LIKE '%' || unaccent(v_q) || '%')
         OR (length(v_q_digits) >= 3 AND regexp_replace(phone, '\D', '', 'g') LIKE '%' || v_q_digits || '%')
       )
     ORDER BY nome
     LIMIT p_limit
  ) q;

  RETURN jsonb_build_object('rows', v_out, 'query', p_query);
EXCEPTION WHEN OTHERS THEN
  -- fallback sem unaccent (caso extensão não esteja instalada)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'nome', nome, 'phone', phone, 'tier', tier_atual, 'status', status
  ) ORDER BY nome), '[]'::jsonb) INTO v_out
  FROM (
    SELECT id, nome, phone, tier_atual, status
      FROM public.vpi_partners
     WHERE clinic_id = v_clinic_id
       AND status IN ('ativo','pendente')
       AND (
         (length(v_q) >= 2 AND lower(nome) LIKE '%' || v_q || '%')
         OR (length(v_q_digits) >= 3 AND regexp_replace(phone, '\D', '', 'g') LIKE '%' || v_q_digits || '%')
       )
     ORDER BY nome LIMIT p_limit
  ) q;
  RETURN jsonb_build_object('rows', v_out, 'query', p_query);
END $$;


-- ── Atualiza RPCs principais pra aceitar partner_id opcional ──

CREATE OR REPLACE FUNCTION public.vpi_funnel_breakdown(p_days int DEFAULT 30, p_partner_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_counts jsonb;
BEGIN
  WITH c AS (
    SELECT
      COUNT(*) FILTER (WHERE funnel_stage IN ('created','contacted','responded','scheduled','showed','closed','lost')) AS created,
      COUNT(*) FILTER (WHERE funnel_stage IN ('contacted','responded','scheduled','showed','closed')) AS contacted,
      COUNT(*) FILTER (WHERE funnel_stage IN ('responded','scheduled','showed','closed')) AS responded,
      COUNT(*) FILTER (WHERE funnel_stage IN ('scheduled','showed','closed')) AS scheduled,
      COUNT(*) FILTER (WHERE funnel_stage IN ('showed','closed')) AS showed,
      COUNT(*) FILTER (WHERE funnel_stage = 'closed') AS closed,
      COUNT(*) FILTER (WHERE funnel_stage = 'lost') AS lost
    FROM public.vpi_indications
    WHERE clinic_id = v_clinic_id AND created_at >= v_since
      AND (p_partner_id IS NULL OR partner_id = p_partner_id)
  )
  SELECT jsonb_build_object(
    'created',   created, 'contacted', contacted, 'responded', responded,
    'scheduled', scheduled, 'showed', showed, 'closed', closed, 'lost', lost,
    'total', created,
    'dropoff', jsonb_build_object(
      'created_to_contacted',   CASE WHEN created>0   THEN ROUND((100.0*(created-contacted)/created)::numeric,1) ELSE 0 END,
      'contacted_to_responded', CASE WHEN contacted>0 THEN ROUND((100.0*(contacted-responded)/contacted)::numeric,1) ELSE 0 END,
      'responded_to_scheduled', CASE WHEN responded>0 THEN ROUND((100.0*(responded-scheduled)/responded)::numeric,1) ELSE 0 END,
      'scheduled_to_showed',    CASE WHEN scheduled>0 THEN ROUND((100.0*(scheduled-showed)/scheduled)::numeric,1) ELSE 0 END,
      'showed_to_closed',       CASE WHEN showed>0    THEN ROUND((100.0*(showed-closed)/showed)::numeric,1) ELSE 0 END
    ),
    'conversion_rate', CASE WHEN created>0 THEN ROUND((100.0*closed/created)::numeric,1) ELSE 0 END,
    'period_days', p_days,
    'partner_id', p_partner_id
  ) INTO v_counts FROM c;
  RETURN v_counts;
END $$;


CREATE OR REPLACE FUNCTION public.vpi_timeseries(
  p_bucket text DEFAULT 'month', p_periods int DEFAULT 12, p_partner_id uuid DEFAULT NULL
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
      date_trunc(v_bucket_sql, i.created_at)::date AS bucket,
      COUNT(*) AS created,
      COUNT(*) FILTER (WHERE i.funnel_stage = 'closed') AS closed,
      COALESCE(SUM(CASE WHEN i.funnel_stage='closed' THEN i.creditos * 10 ELSE 0 END), 0) AS revenue
    FROM public.vpi_indications i
    WHERE i.clinic_id = v_clinic_id AND i.created_at >= v_since
      AND (p_partner_id IS NULL OR i.partner_id = p_partner_id)
    GROUP BY date_trunc(v_bucket_sql, i.created_at)
  )
  SELECT jsonb_agg(jsonb_build_object(
    'bucket', to_char(s.bucket, 'YYYY-MM-DD'),
    'created', COALESCE(d.created, 0),
    'closed',  COALESCE(d.closed, 0),
    'revenue', COALESCE(d.revenue, 0),
    'conversion', CASE WHEN COALESCE(d.created,0) > 0
                    THEN ROUND((100.0 * COALESCE(d.closed,0) / d.created)::numeric, 1) ELSE 0 END
  ) ORDER BY s.bucket) INTO v_result
  FROM series s LEFT JOIN data d USING (bucket);
  RETURN jsonb_build_object('bucket', p_bucket, 'periods', p_periods,
                            'partner_id', p_partner_id,
                            'series', COALESCE(v_result, '[]'::jsonb));
END $$;


CREATE OR REPLACE FUNCTION public.vpi_velocity(p_days int DEFAULT 90, p_partner_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_now_data record;
  v_prev_data record;
BEGIN
  SELECT
    AVG(EXTRACT(EPOCH FROM (fechada_em - created_at)) / 86400) FILTER (WHERE fechada_em IS NOT NULL)::numeric AS avg_days,
    MIN(EXTRACT(EPOCH FROM (fechada_em - created_at)) / 86400) FILTER (WHERE fechada_em IS NOT NULL)::numeric AS min_days,
    MAX(EXTRACT(EPOCH FROM (fechada_em - created_at)) / 86400) FILTER (WHERE fechada_em IS NOT NULL)::numeric AS max_days,
    COUNT(*) FILTER (WHERE fechada_em IS NOT NULL) AS n
    INTO v_now_data
    FROM public.vpi_indications
    WHERE clinic_id = v_clinic_id
      AND created_at >= now() - (p_days || ' days')::interval
      AND (p_partner_id IS NULL OR partner_id = p_partner_id);
  SELECT
    AVG(EXTRACT(EPOCH FROM (fechada_em - created_at)) / 86400) FILTER (WHERE fechada_em IS NOT NULL)::numeric AS avg_days
    INTO v_prev_data
    FROM public.vpi_indications
    WHERE clinic_id = v_clinic_id
      AND created_at >= now() - (p_days*2 || ' days')::interval
      AND created_at <  now() - (p_days   || ' days')::interval
      AND (p_partner_id IS NULL OR partner_id = p_partner_id);
  RETURN jsonb_build_object(
    'period_days', p_days, 'partner_id', p_partner_id,
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


CREATE OR REPLACE FUNCTION public.vpi_payback_analysis(p_days int DEFAULT 180, p_partner_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_data record;
BEGIN
  SELECT
    COUNT(*) AS total_created,
    COUNT(*) FILTER (WHERE funnel_stage='closed') AS total_closed,
    COUNT(*) * 10.0 AS cost_estimated,
    COALESCE(SUM(CASE WHEN funnel_stage='closed' THEN creditos * 10 ELSE 0 END), 0) AS revenue_estimated,
    AVG(CASE WHEN fechada_em IS NOT NULL THEN EXTRACT(EPOCH FROM (fechada_em - created_at))/86400 END)::numeric AS avg_payback_days
    INTO v_data FROM public.vpi_indications
    WHERE clinic_id = v_clinic_id
      AND created_at >= now() - (p_days || ' days')::interval
      AND (p_partner_id IS NULL OR partner_id = p_partner_id);
  RETURN jsonb_build_object(
    'period_days', p_days, 'partner_id', p_partner_id,
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


GRANT EXECUTE ON FUNCTION public.vpi_partner_search(text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_funnel_breakdown(int, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_timeseries(text, int, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_velocity(int, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_payback_analysis(int, uuid) TO anon, authenticated, service_role;
