-- ============================================================
-- Migration: Cashflow Segments — Segmentacao Estrategica
-- 4 cortes: por procedimento, por especialista, por origem, heatmap
-- ============================================================

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

  -- Carrega config (taxas e comissoes)
  SELECT fees, commissions
  INTO v_fees, v_by_prof
  FROM public.cashflow_config
  WHERE clinic_id = v_clinic_id;

  v_fees := COALESCE(v_fees, '{}'::jsonb);
  v_default_comm := COALESCE((v_by_prof->>'default_pct')::numeric, 0);
  v_by_prof := COALESCE(v_by_prof->'by_professional', '{}'::jsonb);

  -- Carrega custos de procedimentos
  SELECT procs INTO v_procs_config FROM public.fin_config WHERE clinic_id = v_clinic_id;
  IF v_procs_config IS NOT NULL THEN
    FOR v_proc_iter IN SELECT * FROM jsonb_array_elements(v_procs_config) LOOP
      v_proc_costs := v_proc_costs || jsonb_build_object(
        LOWER(TRIM(v_proc_iter->>'nome')),
        COALESCE((v_proc_iter->>'custo')::numeric, 0)
      );
    END LOOP;
  END IF;

  -- ── 1. Por Procedimento ───────────────────────────────────
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

  -- ── 2. Por Especialista ───────────────────────────────────
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

  -- ── 3. Por Origem do Lead (utm/origem) ────────────────────
  WITH origem_data AS (
    SELECT
      COALESCE(NULLIF(l.origem, ''),
               NULLIF(l.source_type, ''),
               '(direto)') AS origem,
      SUM(c.amount) AS bruto,
      COUNT(*) AS qtd,
      COUNT(DISTINCT c.patient_id) AS pacientes
    FROM public.cashflow_entries c
    LEFT JOIN public.leads l ON l.id = c.patient_id::text
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

  -- ── 4. Heatmap dia x hora (entries do mes) ────────────────
  -- Usa transaction_datetime se houver, senao transaction_date com hora 12:00
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

COMMENT ON FUNCTION public.cashflow_segments IS
  'Segmentacao estrategica do Fluxo de Caixa: por procedimento (com margem), por especialista (com comissao), por origem do lead, e heatmap dia x hora.';
