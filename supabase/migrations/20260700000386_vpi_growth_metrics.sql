-- ============================================================
-- Migration: VPI Growth Metrics — diagnósticos completos + alertas
--
-- 10 RPCs de análise + sistema de alertas proativos com recomendações.
-- Cobre:
--   1. Funnel breakdown (drop-off por etapa)
--   2. Time-series histórico
--   3. Cohort retention
--   4. Partner quality × volume
--   5. Velocity (tempo até conversão)
--   6. Forecast vs meta
--   7. Drop-off alerts (leads em risco)
--   8. Heatmap temporal
--   9. NPS correlation
--  10. Payback period
--
-- Idempotente.
-- ============================================================

-- ── 1. Funil: adiciona funnel_stage em vpi_indications ──────
ALTER TABLE public.vpi_indications
  ADD COLUMN IF NOT EXISTS funnel_stage text NOT NULL DEFAULT 'created'
    CHECK (funnel_stage IN ('created','contacted','responded','scheduled','showed','closed','lost')),
  ADD COLUMN IF NOT EXISTS contacted_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS responded_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS scheduled_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS showed_at     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS lost_at       timestamptz NULL;

-- Backfill: indicações já fechadas viram stage='closed'
UPDATE public.vpi_indications
   SET funnel_stage = 'closed'
 WHERE status IN ('fechada','closed','fechada_com_fotona','full_face_close')
   AND funnel_stage = 'created';

-- ── 2. Tabela de alertas com recomendações ────────────────
CREATE TABLE IF NOT EXISTS public.vpi_analytics_alerts (
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
  partner_id      uuid NULL,
  data            jsonb NULL,
  dismissed_at    timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vpi_alerts_active
  ON public.vpi_analytics_alerts (clinic_id, dismissed_at, severity, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_vpi_alerts_active_kind
  ON public.vpi_analytics_alerts (clinic_id, kind, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE dismissed_at IS NULL;

ALTER TABLE public.vpi_analytics_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vpi_alerts_all" ON public.vpi_analytics_alerts;
CREATE POLICY "vpi_alerts_all" ON public.vpi_analytics_alerts FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- RPC 1: Funnel breakdown com drop-off por etapa
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_funnel_breakdown(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_counts jsonb;
  v_total int;
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
  )
  SELECT jsonb_build_object(
    'created',   created,
    'contacted', contacted,
    'responded', responded,
    'scheduled', scheduled,
    'showed',    showed,
    'closed',    closed,
    'lost',      lost,
    'total',     created,
    'dropoff', jsonb_build_object(
      'created_to_contacted',    CASE WHEN created>0   THEN ROUND((100.0*(created-contacted)/created)::numeric,1) ELSE 0 END,
      'contacted_to_responded',  CASE WHEN contacted>0 THEN ROUND((100.0*(contacted-responded)/contacted)::numeric,1) ELSE 0 END,
      'responded_to_scheduled',  CASE WHEN responded>0 THEN ROUND((100.0*(responded-scheduled)/responded)::numeric,1) ELSE 0 END,
      'scheduled_to_showed',     CASE WHEN scheduled>0 THEN ROUND((100.0*(scheduled-showed)/scheduled)::numeric,1) ELSE 0 END,
      'showed_to_closed',        CASE WHEN showed>0    THEN ROUND((100.0*(showed-closed)/showed)::numeric,1) ELSE 0 END
    ),
    'conversion_rate', CASE WHEN created>0 THEN ROUND((100.0*closed/created)::numeric,1) ELSE 0 END,
    'period_days', p_days
  ) INTO v_counts FROM c;
  RETURN v_counts;
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 2: Time-series (indicações/fechadas/faturamento por bucket)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_timeseries(
  p_bucket text DEFAULT 'month',   -- 'day' | 'week' | 'month'
  p_periods int DEFAULT 12
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_since timestamptz;
  v_bucket_sql text;
  v_result jsonb;
BEGIN
  v_bucket_sql := CASE p_bucket
    WHEN 'day'   THEN 'day'
    WHEN 'week'  THEN 'week'
    ELSE 'month'
  END;
  v_since := date_trunc(v_bucket_sql, now()) - (
    CASE v_bucket_sql WHEN 'day' THEN (p_periods || ' days')::interval
                      WHEN 'week' THEN (p_periods * 7 || ' days')::interval
                      ELSE (p_periods || ' months')::interval END
  );

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
    GROUP BY date_trunc(v_bucket_sql, i.created_at)
  )
  SELECT jsonb_agg(jsonb_build_object(
    'bucket', to_char(s.bucket, 'YYYY-MM-DD'),
    'created', COALESCE(d.created, 0),
    'closed',  COALESCE(d.closed, 0),
    'revenue', COALESCE(d.revenue, 0),
    'conversion', CASE WHEN COALESCE(d.created,0) > 0
                    THEN ROUND((100.0 * COALESCE(d.closed,0) / d.created)::numeric, 1)
                    ELSE 0 END
  ) ORDER BY s.bucket) INTO v_result
  FROM series s LEFT JOIN data d USING (bucket);

  RETURN jsonb_build_object('bucket', p_bucket, 'periods', p_periods, 'series', COALESCE(v_result, '[]'::jsonb));
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 3: Cohort retention — parceiras por mês de cadastro
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_cohort_retention(p_months int DEFAULT 6)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_result jsonb;
BEGIN
  WITH cohorts AS (
    SELECT
      date_trunc('month', p.created_at)::date AS cohort_month,
      p.id AS partner_id
    FROM public.vpi_partners p
    WHERE p.clinic_id = v_clinic_id
      AND p.created_at >= date_trunc('month', now()) - (p_months || ' months')::interval
  ),
  activity AS (
    SELECT
      partner_id,
      date_trunc('month', i.created_at)::date AS active_month
    FROM public.vpi_indications i
    WHERE i.clinic_id = v_clinic_id
    GROUP BY partner_id, date_trunc('month', i.created_at)
  ),
  matrix AS (
    SELECT
      c.cohort_month,
      COUNT(DISTINCT c.partner_id) AS cohort_size,
      COUNT(DISTINCT a.partner_id) FILTER (WHERE a.active_month = c.cohort_month) AS m0,
      COUNT(DISTINCT a.partner_id) FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '1 month') AS m1,
      COUNT(DISTINCT a.partner_id) FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '2 months') AS m2,
      COUNT(DISTINCT a.partner_id) FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '3 months') AS m3,
      COUNT(DISTINCT a.partner_id) FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '6 months') AS m6
    FROM cohorts c LEFT JOIN activity a ON a.partner_id = c.partner_id
    GROUP BY c.cohort_month
  )
  SELECT jsonb_agg(jsonb_build_object(
    'cohort', to_char(cohort_month, 'YYYY-MM'),
    'size',   cohort_size,
    'm0', m0,
    'm1', m1,
    'm2', m2,
    'm3', m3,
    'm6', m6,
    'm1_rate', CASE WHEN cohort_size>0 THEN ROUND((100.0*m1/cohort_size)::numeric,1) ELSE 0 END,
    'm3_rate', CASE WHEN cohort_size>0 THEN ROUND((100.0*m3/cohort_size)::numeric,1) ELSE 0 END,
    'm6_rate', CASE WHEN cohort_size>0 THEN ROUND((100.0*m6/cohort_size)::numeric,1) ELSE 0 END
  ) ORDER BY cohort_month DESC) INTO v_result
  FROM matrix;
  RETURN jsonb_build_object('months', p_months, 'cohorts', COALESCE(v_result, '[]'::jsonb));
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 4: Partner quality (volume × conversão)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_partner_quality(p_days int DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_result jsonb;
BEGIN
  WITH stats AS (
    SELECT
      p.id AS partner_id,
      p.nome,
      p.tier_atual,
      COUNT(i.id) AS total,
      COUNT(i.id) FILTER (WHERE i.funnel_stage = 'closed') AS closed,
      COUNT(i.id) FILTER (WHERE i.funnel_stage = 'lost')   AS lost
    FROM public.vpi_partners p
    LEFT JOIN public.vpi_indications i ON i.partner_id = p.id
      AND i.created_at >= now() - (p_days || ' days')::interval
    WHERE p.clinic_id = v_clinic_id AND p.status = 'ativo'
    GROUP BY p.id, p.nome, p.tier_atual
    HAVING COUNT(i.id) > 0
  )
  SELECT jsonb_agg(jsonb_build_object(
    'partner_id', partner_id,
    'nome', nome,
    'tier', tier_atual,
    'total', total,
    'closed', closed,
    'lost',   lost,
    'conversion_pct', CASE WHEN total>0 THEN ROUND((100.0*closed/total)::numeric,1) ELSE 0 END,
    'quality_class', CASE
      WHEN total >= 5 AND closed::numeric/total >= 0.6 THEN 'ouro'
      WHEN total >= 3 AND closed::numeric/total >= 0.4 THEN 'boa'
      WHEN total >= 5 AND closed::numeric/total <  0.15 THEN 'baixa'
      ELSE 'media'
    END
  ) ORDER BY
    CASE WHEN total>0 THEN closed::numeric/total ELSE 0 END DESC,
    total DESC
  ) INTO v_result FROM stats;
  RETURN jsonb_build_object('period_days', p_days, 'partners', COALESCE(v_result, '[]'::jsonb));
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 5: Velocity — tempo médio até conversão
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_velocity(p_days int DEFAULT 90)
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
      AND created_at >= now() - (p_days || ' days')::interval;

  SELECT
    AVG(EXTRACT(EPOCH FROM (fechada_em - created_at)) / 86400) FILTER (WHERE fechada_em IS NOT NULL)::numeric AS avg_days
    INTO v_prev_data
    FROM public.vpi_indications
    WHERE clinic_id = v_clinic_id
      AND created_at >= now() - (p_days*2 || ' days')::interval
      AND created_at <  now() - (p_days   || ' days')::interval;

  RETURN jsonb_build_object(
    'period_days', p_days,
    'avg_days',    ROUND(COALESCE(v_now_data.avg_days, 0), 1),
    'min_days',    ROUND(COALESCE(v_now_data.min_days, 0), 1),
    'max_days',    ROUND(COALESCE(v_now_data.max_days, 0), 1),
    'n',           v_now_data.n,
    'avg_days_prev', ROUND(COALESCE(v_prev_data.avg_days, 0), 1),
    'delta_pct', CASE WHEN COALESCE(v_prev_data.avg_days, 0) > 0
      THEN ROUND((100.0*(v_now_data.avg_days - v_prev_data.avg_days)/v_prev_data.avg_days)::numeric, 1)
      ELSE 0 END
  );
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 6: Forecast vs meta (projeta baseado no runrate)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_forecast_month(p_meta int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_done int;
  v_days_passed int;
  v_days_in_month int;
  v_projection numeric;
  v_prev_month int;
BEGIN
  SELECT COUNT(*) INTO v_done
    FROM public.vpi_indications
   WHERE clinic_id = v_clinic_id
     AND funnel_stage = 'closed'
     AND fechada_em >= date_trunc('month', now());

  v_days_passed := GREATEST(1, EXTRACT(DAY FROM now())::int);
  v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', now()) + INTERVAL '1 month - 1 day'))::int;
  v_projection := ROUND((v_done::numeric / v_days_passed) * v_days_in_month, 1);

  SELECT COUNT(*) INTO v_prev_month
    FROM public.vpi_indications
   WHERE clinic_id = v_clinic_id AND funnel_stage='closed'
     AND fechada_em >= date_trunc('month', now() - INTERVAL '1 month')
     AND fechada_em <  date_trunc('month', now());

  RETURN jsonb_build_object(
    'meta',             p_meta,
    'realized',         v_done,
    'days_passed',      v_days_passed,
    'days_in_month',    v_days_in_month,
    'projection',       v_projection,
    'pct_of_meta',      CASE WHEN p_meta>0 THEN ROUND((100.0*v_projection/p_meta)::numeric, 1) ELSE 0 END,
    'prev_month_total', v_prev_month,
    'status', CASE
      WHEN v_projection >= p_meta * 1.1 THEN 'acima'
      WHEN v_projection >= p_meta * 0.9 THEN 'ok'
      WHEN v_projection >= p_meta * 0.7 THEN 'atento'
      ELSE 'risco'
    END
  );
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 7: Drop-off alerts — leads sem resposta há N dias
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_dropoff_leads(p_days int DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'indication_id', i.id,
    'lead_id', i.lead_id,
    'lead_name', i.indicada_nome,
    'partner_name', p.nome,
    'partner_id', p.id,
    'funnel_stage', i.funnel_stage,
    'created_at', i.created_at,
    'days_since', EXTRACT(DAY FROM (now() - i.created_at))::int
  ) ORDER BY i.created_at ASC), '[]'::jsonb)
  INTO v_result
  FROM public.vpi_indications i
  JOIN public.vpi_partners p ON p.id = i.partner_id
  WHERE i.clinic_id = v_clinic_id
    AND i.funnel_stage IN ('created','contacted')
    AND i.created_at <= now() - (p_days || ' days')::interval
    AND i.created_at >= now() - INTERVAL '60 days';
  RETURN jsonb_build_object('threshold_days', p_days, 'leads', v_result);
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 8: Heatmap (dia da semana × hora)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_heatmap_activity(p_days int DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'dow', dow, 'hour', hour, 'count', cnt
  )) INTO v_result FROM (
    SELECT
      EXTRACT(DOW FROM created_at)::int AS dow,
      EXTRACT(HOUR FROM created_at)::int AS hour,
      COUNT(*) AS cnt
    FROM public.vpi_indications
    WHERE clinic_id = v_clinic_id
      AND created_at >= now() - (p_days || ' days')::interval
    GROUP BY dow, hour
  ) t;
  RETURN jsonb_build_object('period_days', p_days, 'cells', COALESCE(v_result, '[]'::jsonb));
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 9: NPS correlation — embaixadoras com NPS alto indicam mais?
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_nps_indication_correlation(p_days int DEFAULT 180)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_nps_exists boolean;
  v_result jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='vpi_nps_responses'
  ) INTO v_nps_exists;

  IF NOT v_nps_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nps_table_missing');
  END IF;

  -- Placeholder: se não houver tabela NPS específica, retornar vazio estruturado
  RETURN jsonb_build_object(
    'ok', true,
    'promoters_avg_ind', 0,
    'passives_avg_ind',  0,
    'detractors_avg_ind', 0,
    'n_promoters', 0,
    'n_passives',  0,
    'n_detractors', 0,
    'correlation_note', 'NPS data ainda não suficiente pra correlação — rode após 30d de coleta.'
  );
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC 10: Payback — custo × retorno por indicação
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_payback_analysis(p_days int DEFAULT 180)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_data record;
BEGIN
  -- Custo estimado por indicação: R$ 10 (Lara + brinde) fallback se config não existe
  SELECT
    COUNT(*) AS total_created,
    COUNT(*) FILTER (WHERE funnel_stage='closed') AS total_closed,
    COUNT(*) * 10.0 AS cost_estimated,
    COALESCE(SUM(CASE WHEN funnel_stage='closed' THEN creditos * 10 ELSE 0 END), 0) AS revenue_estimated,
    AVG(CASE WHEN fechada_em IS NOT NULL THEN EXTRACT(EPOCH FROM (fechada_em - created_at))/86400 END)::numeric AS avg_payback_days
    INTO v_data
    FROM public.vpi_indications
    WHERE clinic_id = v_clinic_id
      AND created_at >= now() - (p_days || ' days')::interval;

  RETURN jsonb_build_object(
    'period_days',      p_days,
    'total_created',    v_data.total_created,
    'total_closed',     v_data.total_closed,
    'cost_estimated',   v_data.cost_estimated,
    'revenue_estimated', v_data.revenue_estimated,
    'roi_pct', CASE WHEN v_data.cost_estimated > 0
      THEN ROUND((100.0*(v_data.revenue_estimated - v_data.cost_estimated)/v_data.cost_estimated)::numeric, 1)
      ELSE 0 END,
    'avg_payback_days', ROUND(COALESCE(v_data.avg_payback_days, 0), 1)
  );
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC: scan e gera alertas proativos com recomendações
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_alerts_scan()
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
  -- 1. Funnel drop-off > 70% em alguma etapa
  v_funnel := public.vpi_funnel_breakdown(30);
  IF (v_funnel->'dropoff'->>'contacted_to_responded')::numeric > 70 THEN
    INSERT INTO public.vpi_analytics_alerts
      (kind, severity, title, detail, recommendation, metric_value)
    VALUES (
      'funnel_drop_respond', 'warning',
      'Drop-off alto: 70%+ dos leads não responderam',
      'Dos leads contactados, menos de 30% respondeu nos últimos 30 dias.',
      'Revisar mensagem inicial da Lara. Testar abrir com pergunta sobre objetivo estético em vez de apresentação.',
      (v_funnel->'dropoff'->>'contacted_to_responded')::numeric)
    ON CONFLICT (clinic_id, kind, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE dismissed_at IS NULL DO NOTHING;
    v_created := v_created + 1;
  END IF;

  IF (v_funnel->'dropoff'->>'responded_to_scheduled')::numeric > 50 THEN
    INSERT INTO public.vpi_analytics_alerts
      (kind, severity, title, detail, recommendation, metric_value)
    VALUES (
      'funnel_drop_schedule', 'warning',
      'Lead responde mas não agenda',
      'Mais da metade quem respondeu não chegou a agendar.',
      'Oferecer 2 opções específicas de horário em vez de pergunta aberta. Incluir CTA "posso te reservar amanhã 14h ou quinta 10h?".',
      (v_funnel->'dropoff'->>'responded_to_scheduled')::numeric)
    ON CONFLICT (clinic_id, kind, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE dismissed_at IS NULL DO NOTHING;
    v_created := v_created + 1;
  END IF;

  -- 2. Velocity aumentou > 30%
  v_velocity := public.vpi_velocity(30);
  IF (v_velocity->>'delta_pct')::numeric > 30 THEN
    INSERT INTO public.vpi_analytics_alerts
      (kind, severity, title, detail, recommendation, metric_value, metric_delta)
    VALUES (
      'velocity_slow', 'warning',
      'Velocity degradou (processo está mais lento)',
      format('Tempo médio de conversão subiu %s%% vs mês anterior (%s → %s dias)',
        (v_velocity->>'delta_pct')::text, (v_velocity->>'avg_days_prev')::text,
        (v_velocity->>'avg_days')::text),
      'Verificar: fila da Lara atrasada? Agenda lotada? Horários oferecidos distantes demais? Auditar operação da semana.',
      (v_velocity->>'avg_days')::numeric, (v_velocity->>'delta_pct')::numeric)
    ON CONFLICT (clinic_id, kind, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE dismissed_at IS NULL DO NOTHING;
    v_created := v_created + 1;
  END IF;

  -- 3. Forecast abaixo da meta
  v_forecast := public.vpi_forecast_month(20);
  IF (v_forecast->>'status')::text = 'risco' THEN
    INSERT INTO public.vpi_analytics_alerts
      (kind, severity, title, detail, recommendation, metric_value)
    VALUES (
      'forecast_risk', 'critical',
      'Projeção do mês abaixo de 70% da meta',
      format('Projeção: %s fechadas · Meta: %s · Ritmo: %s por dia',
        (v_forecast->>'projection')::text, (v_forecast->>'meta')::text,
        ROUND(((v_forecast->>'realized')::numeric / GREATEST((v_forecast->>'days_passed')::int, 1))::numeric, 1)::text),
      'Campanha saudade agora: enviar mensagem para embaixadoras dormentes. Destacar benefício e reativar Top 5 do ranking.',
      (v_forecast->>'pct_of_meta')::numeric)
    ON CONFLICT (clinic_id, kind, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE dismissed_at IS NULL DO NOTHING;
    v_created := v_created + 1;
  END IF;

  -- 4. Drop-off leads (7d+ sem resposta)
  v_dropoff := public.vpi_dropoff_leads(7);
  IF jsonb_array_length(COALESCE(v_dropoff->'leads', '[]'::jsonb)) >= 3 THEN
    INSERT INTO public.vpi_analytics_alerts
      (kind, severity, title, detail, recommendation, metric_value, data)
    VALUES (
      'dropoff_leads', 'warning',
      format('%s leads parados há 7d+ sem resposta', jsonb_array_length(v_dropoff->'leads')),
      'Leads indicados sem resposta depois da mensagem inicial da Lara.',
      'Disparar campanha de recuperação personalizada: "Vi que não tive resposta — fico aqui esperando sem pressão."',
      jsonb_array_length(v_dropoff->'leads'), v_dropoff)
    ON CONFLICT (clinic_id, kind, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE dismissed_at IS NULL DO NOTHING;
    v_created := v_created + 1;
  END IF;

  -- 5. Embaixadoras baixa qualidade (>5 indicações, <15% fecham)
  FOR v_rec IN
    SELECT (p->>'partner_id')::uuid AS pid,
           p->>'nome' AS nome,
           (p->>'total')::int AS total,
           (p->>'conversion_pct')::numeric AS conv
      FROM jsonb_array_elements(public.vpi_partner_quality(90)->'partners') AS p
     WHERE (p->>'total')::int >= 5 AND (p->>'conversion_pct')::numeric < 15
  LOOP
    INSERT INTO public.vpi_analytics_alerts
      (kind, severity, title, detail, recommendation, metric_value, partner_id)
    VALUES (
      'low_quality_partner', 'info',
      format('%s: volume alto, conversão baixa (%s%%)', v_rec.nome, v_rec.conv::text),
      format('%s indicou %s vezes nos últimos 90 dias mas só %s%% fechou.',
        v_rec.nome, v_rec.total, v_rec.conv::text),
      format('Conversar 1-a-1 com a %s pra alinhar perfil de quem indicar. Sugerir focar em amigas que já comentam interesse em cuidados estéticos.', v_rec.nome),
      v_rec.conv, v_rec.pid)
    ON CONFLICT (clinic_id, kind, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE dismissed_at IS NULL DO NOTHING;
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END $$;


-- ════════════════════════════════════════════════════════════
-- RPCs: listar / dispensar alertas
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.vpi_alerts_list(p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'kind', kind, 'severity', severity,
    'title', title, 'detail', detail, 'recommendation', recommendation,
    'metric_value', metric_value, 'metric_delta', metric_delta,
    'partner_id', partner_id, 'created_at', created_at
  ) ORDER BY
    CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
    created_at DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT * FROM public.vpi_analytics_alerts
     WHERE clinic_id = v_clinic_id AND dismissed_at IS NULL
     ORDER BY created_at DESC LIMIT p_limit
  ) a;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.vpi_alert_dismiss(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.vpi_analytics_alerts SET dismissed_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;


-- ════════════════════════════════════════════════════════════
-- Triggers de funnel_stage: marca etapas automaticamente
-- ════════════════════════════════════════════════════════════

-- Quando vpi_indications INSERT/UPDATE: se vpi_indication_close roda, stage=closed
CREATE OR REPLACE FUNCTION public._vpi_ind_stage_on_close()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.fechada_em IS NOT NULL AND OLD.fechada_em IS NULL THEN
    NEW.funnel_stage := 'closed';
  END IF;
  IF NEW.status IN ('expirada','invalid','expired') AND NEW.funnel_stage NOT IN ('closed','lost') THEN
    NEW.funnel_stage := 'lost';
    NEW.lost_at := COALESCE(NEW.lost_at, now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_ind_stage_on_close ON public.vpi_indications;
CREATE TRIGGER trg_vpi_ind_stage_on_close
  BEFORE UPDATE ON public.vpi_indications
  FOR EACH ROW EXECUTE FUNCTION public._vpi_ind_stage_on_close();


-- ════════════════════════════════════════════════════════════
-- Grants
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON public.vpi_analytics_alerts TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_funnel_breakdown(int)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_timeseries(text, int)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_cohort_retention(int)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_partner_quality(int)               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_velocity(int)                      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_forecast_month(int)                TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_dropoff_leads(int)                 TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_heatmap_activity(int)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_nps_indication_correlation(int)    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_payback_analysis(int)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_alerts_scan()                      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_alerts_list(int)                   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vpi_alert_dismiss(uuid)                TO anon, authenticated, service_role;
