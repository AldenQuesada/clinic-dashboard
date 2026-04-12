-- ============================================================
-- Migration: Cashflow Patients LTV / RFM
-- LTV (Lifetime Value), RFM segmentation, top pacientes,
-- alertas de VIPs sumidos
-- ============================================================

-- ── 1. RPC: cashflow_patients_ltv ───────────────────────────
-- Retorna LTV de cada paciente + classe RFM + estatisticas

CREATE OR REPLACE FUNCTION public.cashflow_patients_ltv(
  p_limit       int  DEFAULT 100,
  p_only_active boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id   uuid := public._sdr_clinic_id();
  v_total_rev   numeric := 0;
  v_total_pat   int := 0;
  v_top10_pct   numeric := 0;
  v_avg_ltv     numeric := 0;
  v_p80_monetary numeric := 0;  -- threshold do top 20% (VIP)
  v_now         date := CURRENT_DATE;

  v_patients    jsonb := '[]'::jsonb;
  v_rfm_summary jsonb := '{}'::jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Calcula threshold do top 20% (P80) por monetary value
  SELECT COALESCE(percentile_cont(0.80) WITHIN GROUP (ORDER BY pat_total), 0)
  INTO v_p80_monetary
  FROM (
    SELECT SUM(amount) AS pat_total
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND patient_id IS NOT NULL
    GROUP BY patient_id
  ) t;

  -- Stats globais
  SELECT
    COALESCE(SUM(amount), 0),
    COUNT(DISTINCT patient_id)
  INTO v_total_rev, v_total_pat
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'credit'
    AND patient_id IS NOT NULL;

  IF v_total_pat > 0 THEN
    v_avg_ltv := v_total_rev / v_total_pat;
  END IF;

  -- Top 10% pacientes (concentracao de risco)
  SELECT COALESCE(SUM(top_total), 0)
  INTO v_top10_pct
  FROM (
    SELECT SUM(amount) AS top_total
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND patient_id IS NOT NULL
    GROUP BY patient_id
    ORDER BY SUM(amount) DESC
    LIMIT GREATEST(1, (v_total_pat / 10))
  ) t;

  -- Lista de pacientes com LTV + RFM class
  WITH pat_stats AS (
    SELECT
      c.patient_id,
      l.name AS patient_name,
      l.phone AS patient_phone,
      SUM(c.amount) AS monetary,
      COUNT(*) AS frequency,
      COUNT(DISTINCT c.transaction_date) AS visit_days,
      AVG(c.amount) AS avg_ticket,
      MIN(c.transaction_date) AS first_visit,
      MAX(c.transaction_date) AS last_visit,
      (v_now - MAX(c.transaction_date)) AS recency_days
    FROM public.cashflow_entries c
    LEFT JOIN public.leads l ON l.id = c.patient_id::text
    WHERE c.clinic_id = v_clinic_id
      AND c.deleted_at IS NULL
      AND c.direction = 'credit'
      AND c.patient_id IS NOT NULL
    GROUP BY c.patient_id, l.name, l.phone
  ),
  classified AS (
    SELECT
      ps.*,
      CASE
        WHEN ps.first_visit > v_now - 30 AND ps.frequency <= 2 THEN 'novo'
        WHEN ps.recency_days > 180 THEN 'inativo'
        WHEN ps.monetary >= v_p80_monetary AND ps.recency_days <= 60 THEN 'vip'
        WHEN ps.monetary >= v_p80_monetary AND ps.recency_days > 60 THEN 'em_risco'
        WHEN ps.recency_days <= 60 THEN 'regular'
        ELSE 'distante'
      END AS rfm_class
    FROM pat_stats ps
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'patient_id',    patient_id,
    'name',          COALESCE(patient_name, '(sem nome)'),
    'phone',         patient_phone,
    'monetary',      ROUND(monetary, 2),
    'frequency',     frequency,
    'visit_days',    visit_days,
    'avg_ticket',    ROUND(avg_ticket, 2),
    'first_visit',   first_visit,
    'last_visit',    last_visit,
    'recency_days',  recency_days,
    'rfm_class',     rfm_class
  ) ORDER BY monetary DESC), '[]'::jsonb)
  INTO v_patients
  FROM classified
  WHERE NOT p_only_active OR rfm_class IN ('vip','regular','novo')
  LIMIT p_limit;

  -- Resumo RFM
  WITH pat_stats AS (
    SELECT
      c.patient_id,
      SUM(c.amount) AS monetary,
      COUNT(*) AS frequency,
      MIN(c.transaction_date) AS first_visit,
      (v_now - MAX(c.transaction_date)) AS recency_days
    FROM public.cashflow_entries c
    WHERE c.clinic_id = v_clinic_id
      AND c.deleted_at IS NULL
      AND c.direction = 'credit'
      AND c.patient_id IS NOT NULL
    GROUP BY c.patient_id
  ),
  classified AS (
    SELECT
      patient_id,
      monetary,
      CASE
        WHEN first_visit > v_now - 30 AND frequency <= 2 THEN 'novo'
        WHEN recency_days > 180 THEN 'inativo'
        WHEN monetary >= v_p80_monetary AND recency_days <= 60 THEN 'vip'
        WHEN monetary >= v_p80_monetary AND recency_days > 60 THEN 'em_risco'
        WHEN recency_days <= 60 THEN 'regular'
        ELSE 'distante'
      END AS rfm_class
    FROM pat_stats
  )
  SELECT jsonb_object_agg(rfm_class, jsonb_build_object(
    'count',    cnt,
    'monetary', ROUND(total_mon, 2)
  ))
  INTO v_rfm_summary
  FROM (
    SELECT rfm_class, COUNT(*) AS cnt, SUM(monetary) AS total_mon
    FROM classified
    GROUP BY rfm_class
  ) t;

  RETURN jsonb_build_object(
    'stats', jsonb_build_object(
      'total_revenue',  ROUND(v_total_rev, 2),
      'total_patients', v_total_pat,
      'avg_ltv',        ROUND(v_avg_ltv, 2),
      'top10_revenue',  ROUND(v_top10_pct, 2),
      'top10_pct',      CASE WHEN v_total_rev > 0
                          THEN ROUND((v_top10_pct / v_total_rev) * 100, 1)
                          ELSE 0 END,
      'p80_threshold',  ROUND(v_p80_monetary, 2)
    ),
    'rfm', COALESCE(v_rfm_summary, '{}'::jsonb),
    'patients', v_patients
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_patients_ltv(int, boolean) TO authenticated;

-- ── 2. RPC: cashflow_vip_sumidos ────────────────────────────
-- Lista pacientes "em_risco" (VIP que nao volta ha 60+ dias)
-- pra acionar Lara/Lifting de retencao

CREATE OR REPLACE FUNCTION public.cashflow_vip_sumidos(
  p_min_days  int DEFAULT 60,
  p_max_days  int DEFAULT 180,
  p_limit     int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id    uuid := public._sdr_clinic_id();
  v_p80          numeric;
  v_result       jsonb;
  v_now          date := CURRENT_DATE;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Threshold de VIP (top 20%)
  SELECT COALESCE(percentile_cont(0.80) WITHIN GROUP (ORDER BY pat_total), 0)
  INTO v_p80
  FROM (
    SELECT SUM(amount) AS pat_total
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND patient_id IS NOT NULL
    GROUP BY patient_id
  ) t;

  WITH pat_stats AS (
    SELECT
      c.patient_id,
      l.name AS patient_name,
      l.phone AS patient_phone,
      SUM(c.amount) AS monetary,
      COUNT(*) AS frequency,
      MAX(c.transaction_date) AS last_visit,
      (v_now - MAX(c.transaction_date)) AS recency_days
    FROM public.cashflow_entries c
    LEFT JOIN public.leads l ON l.id = c.patient_id::text
    WHERE c.clinic_id = v_clinic_id
      AND c.deleted_at IS NULL
      AND c.direction = 'credit'
      AND c.patient_id IS NOT NULL
    GROUP BY c.patient_id, l.name, l.phone
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'patient_id',    patient_id,
    'name',          COALESCE(patient_name, '(sem nome)'),
    'phone',         patient_phone,
    'monetary',      ROUND(monetary, 2),
    'frequency',     frequency,
    'last_visit',    last_visit,
    'recency_days',  recency_days
  ) ORDER BY monetary DESC), '[]'::jsonb)
  INTO v_result
  FROM pat_stats
  WHERE monetary >= v_p80
    AND recency_days BETWEEN p_min_days AND p_max_days
  LIMIT p_limit;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_vip_sumidos(int, int, int) TO authenticated;

COMMENT ON FUNCTION public.cashflow_patients_ltv IS
  'LTV por paciente + classificacao RFM (vip / em_risco / regular / novo / inativo / distante). Inclui top 10% concentracao.';
COMMENT ON FUNCTION public.cashflow_vip_sumidos IS
  'VIPs (top 20% monetary) que nao retornam ha N dias. Usado pra acionar campanhas de retencao.';
