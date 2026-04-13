-- ============================================================
-- APLICAR NO SQL EDITOR DO SUPABASE
-- RPCs faltantes: cashflow_segments + cashflow_patients_ltv + cashflow_vip_sumidos
-- ============================================================

-- ── 1. cashflow_segments ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cashflow_segments(
  p_year  int DEFAULT NULL,
  p_month int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_year      int  := COALESCE(p_year,  EXTRACT(YEAR  FROM CURRENT_DATE)::int);
  v_month     int  := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::int);
  v_start     date;
  v_end       date;

  v_fees          jsonb;
  v_default_comm  numeric;
  v_by_prof       jsonb;
  v_procs_config  jsonb;
  v_proc_costs    jsonb := '{}'::jsonb;
  v_proc_iter     jsonb;

  v_by_procedure   jsonb := '[]'::jsonb;
  v_by_professional jsonb := '[]'::jsonb;
  v_by_origem      jsonb := '[]'::jsonb;
  v_heatmap        jsonb := '[]'::jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  v_start := make_date(v_year, v_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  SELECT fees, commissions
  INTO v_fees, v_by_prof
  FROM public.cashflow_config
  WHERE clinic_id = v_clinic_id;

  v_fees := COALESCE(v_fees, '{}'::jsonb);
  v_default_comm := COALESCE((v_by_prof->>'default_pct')::numeric, 0);
  v_by_prof := COALESCE(v_by_prof->'by_professional', '{}'::jsonb);

  SELECT procs INTO v_procs_config FROM public.fin_config WHERE clinic_id = v_clinic_id;
  IF v_procs_config IS NOT NULL THEN
    FOR v_proc_iter IN SELECT * FROM jsonb_array_elements(v_procs_config) LOOP
      v_proc_costs := v_proc_costs || jsonb_build_object(
        LOWER(TRIM(v_proc_iter->>'nome')),
        COALESCE((v_proc_iter->>'custo')::numeric, 0)
      );
    END LOOP;
  END IF;

  WITH proc_data AS (
    SELECT
      COALESCE(c.procedure_name, '(sem procedimento)') AS procedure_name,
      SUM(c.amount) AS bruto,
      COUNT(*) AS qtd,
      AVG(c.amount) AS ticket_medio,
      SUM(c.amount * COALESCE((v_fees->>c.payment_method)::numeric, 0) / 100) AS taxa,
      SUM(COALESCE((v_proc_costs->>LOWER(TRIM(COALESCE(c.procedure_name, ''))))::numeric, 0)) AS custo,
      SUM(c.amount * v_default_comm / 100) AS comissao
    FROM public.cashflow_entries c
    WHERE c.clinic_id = v_clinic_id
      AND c.deleted_at IS NULL
      AND c.direction = 'credit'
      AND c.transaction_date BETWEEN v_start AND v_end
    GROUP BY COALESCE(c.procedure_name, '(sem procedimento)')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name',         procedure_name,
    'bruto',        ROUND(bruto, 2),
    'qtd',          qtd,
    'ticket_medio', ROUND(ticket_medio, 2),
    'taxa',         ROUND(taxa, 2),
    'custo',        ROUND(custo, 2),
    'comissao',     ROUND(comissao, 2),
    'liquido',      ROUND(bruto - taxa - custo - comissao, 2),
    'margem_pct',   CASE WHEN bruto > 0
                     THEN ROUND(((bruto - taxa - custo - comissao) / bruto) * 100, 1)
                     ELSE 0 END
  ) ORDER BY bruto DESC), '[]'::jsonb)
  INTO v_by_procedure
  FROM proc_data;

  WITH prof_data AS (
    SELECT
      c.professional_id,
      COALESCE(p.first_name || ' ' || p.last_name, '(sem profissional)') AS prof_name,
      SUM(c.amount) AS bruto,
      COUNT(*) AS qtd,
      AVG(c.amount) AS ticket_medio,
      SUM(c.amount *
          COALESCE((v_by_prof->>c.professional_id::text)::numeric, v_default_comm) / 100
      ) AS comissao
    FROM public.cashflow_entries c
    LEFT JOIN public.profiles p ON p.id = c.professional_id
    WHERE c.clinic_id = v_clinic_id
      AND c.deleted_at IS NULL
      AND c.direction = 'credit'
      AND c.transaction_date BETWEEN v_start AND v_end
    GROUP BY c.professional_id, p.first_name, p.last_name
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'professional_id', professional_id,
    'name',            prof_name,
    'bruto',           ROUND(bruto, 2),
    'qtd',             qtd,
    'ticket_medio',    ROUND(ticket_medio, 2),
    'comissao',        ROUND(comissao, 2),
    'liquido',         ROUND(bruto - comissao, 2)
  ) ORDER BY bruto DESC), '[]'::jsonb)
  INTO v_by_professional
  FROM prof_data;

  WITH origem_data AS (
    SELECT
      COALESCE(NULLIF(l.origem, ''),
               NULLIF(l.source_type, ''),
               '(direto)') AS origem,
      SUM(c.amount) AS bruto,
      COUNT(*) AS qtd,
      COUNT(DISTINCT c.patient_id) AS pacientes
    FROM public.cashflow_entries c
    LEFT JOIN public.leads l ON l.id = c.patient_id
    WHERE c.clinic_id = v_clinic_id
      AND c.deleted_at IS NULL
      AND c.direction = 'credit'
      AND c.transaction_date BETWEEN v_start AND v_end
      AND c.patient_id IS NOT NULL
    GROUP BY COALESCE(NULLIF(l.origem, ''), NULLIF(l.source_type, ''), '(direto)')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'origem',    origem,
    'bruto',     ROUND(bruto, 2),
    'qtd',       qtd,
    'pacientes', pacientes,
    'ticket_medio_paciente', CASE WHEN pacientes > 0
                              THEN ROUND(bruto / pacientes, 2)
                              ELSE 0 END
  ) ORDER BY bruto DESC), '[]'::jsonb)
  INTO v_by_origem
  FROM origem_data;

  WITH heatmap_data AS (
    SELECT
      EXTRACT(DOW FROM COALESCE(c.transaction_datetime, c.transaction_date::timestamptz))::int AS dow,
      EXTRACT(HOUR FROM COALESCE(c.transaction_datetime, c.transaction_date::timestamptz + interval '12 hours'))::int AS hour,
      SUM(c.amount) AS total,
      COUNT(*) AS qtd
    FROM public.cashflow_entries c
    WHERE c.clinic_id = v_clinic_id
      AND c.deleted_at IS NULL
      AND c.direction = 'credit'
      AND c.transaction_date BETWEEN v_start AND v_end
    GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'dow',   dow,
    'hour',  hour,
    'total', ROUND(total, 2),
    'qtd',   qtd
  )), '[]'::jsonb)
  INTO v_heatmap
  FROM heatmap_data;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('year', v_year, 'month', v_month, 'start', v_start, 'end', v_end),
    'by_procedure',    v_by_procedure,
    'by_professional', v_by_professional,
    'by_origem',       v_by_origem,
    'heatmap',         v_heatmap
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_segments(int, int) TO authenticated;

-- ── 2. cashflow_patients_ltv ────────────────────────────────

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
  v_p80_monetary numeric := 0;
  v_now         date := CURRENT_DATE;

  v_patients    jsonb := '[]'::jsonb;
  v_rfm_summary jsonb := '{}'::jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

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
    LEFT JOIN public.leads l ON l.id = c.patient_id
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

-- ── 3. cashflow_vip_sumidos ─────────────────────────────────

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
    LEFT JOIN public.leads l ON l.id = c.patient_id
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
