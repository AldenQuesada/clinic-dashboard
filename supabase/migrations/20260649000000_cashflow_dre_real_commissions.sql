-- ============================================================
-- Migration: Cashflow DRE — Comissao real por procedimento
-- Le professional_profiles.commissions (jsonb array) com matching
-- por procedure_name → __todos__ → default_pct (cashflow_config)
-- Suporta type='percent' e type='fixed'
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashflow_dre(
  p_year  int DEFAULT NULL,
  p_month int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id     uuid := public._sdr_clinic_id();
  v_year          int  := COALESCE(p_year,  EXTRACT(YEAR  FROM CURRENT_DATE)::int);
  v_month         int  := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::int);
  v_start         date;
  v_end           date;
  v_fees          jsonb;
  v_commissions   jsonb;
  v_default_comm  numeric;

  v_bruto         numeric := 0;
  v_taxa          numeric := 0;
  v_custo         numeric := 0;
  v_comissao      numeric := 0;
  v_despesas      numeric := 0;

  v_breakdown_method   jsonb := '{}'::jsonb;
  v_breakdown_proc     jsonb := '{}'::jsonb;
  v_breakdown_prof     jsonb := '{}'::jsonb;

  v_procs_config  jsonb;
  v_proc_costs    jsonb := '{}'::jsonb;
  v_proc          jsonb;
  v_rec           record;
  v_prof_comms    jsonb;
  v_comm_item     jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  v_start := make_date(v_year, v_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  -- Carrega config (taxas + comissao default)
  SELECT fees, commissions
  INTO v_fees, v_commissions
  FROM public.cashflow_config
  WHERE clinic_id = v_clinic_id;

  v_fees         := COALESCE(v_fees, '{}'::jsonb);
  v_commissions  := COALESCE(v_commissions, '{"default_pct": 0}'::jsonb);
  v_default_comm := COALESCE((v_commissions->>'default_pct')::numeric, 0);

  -- Carrega custos por procedimento de fin_config.procs
  SELECT procs INTO v_procs_config
  FROM public.fin_config
  WHERE clinic_id = v_clinic_id;

  IF v_procs_config IS NOT NULL THEN
    FOR v_proc IN SELECT * FROM jsonb_array_elements(v_procs_config)
    LOOP
      v_proc_costs := v_proc_costs || jsonb_build_object(
        LOWER(TRIM(v_proc->>'nome')),
        COALESCE((v_proc->>'custo')::numeric, 0)
      );
    END LOOP;
  END IF;

  -- Itera entries credit do periodo
  FOR v_rec IN
    SELECT id, amount, payment_method, procedure_name, professional_id
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND transaction_date BETWEEN v_start AND v_end
  LOOP
    v_bruto := v_bruto + v_rec.amount;

    DECLARE
      v_fee_pct   numeric := COALESCE((v_fees->>v_rec.payment_method)::numeric, 0);
      v_fee_val   numeric := v_rec.amount * v_fee_pct / 100;
      v_proc_cost numeric := 0;
      v_comm_val  numeric := 0;
      v_comm_pct  numeric := v_default_comm;
      v_comm_type text    := 'percent';
      v_match_found boolean := false;
    BEGIN
      v_taxa := v_taxa + v_fee_val;

      -- Custo do procedimento
      IF v_rec.procedure_name IS NOT NULL THEN
        v_proc_cost := COALESCE((v_proc_costs->>LOWER(TRIM(v_rec.procedure_name)))::numeric, 0);
        v_custo := v_custo + v_proc_cost;
      END IF;

      -- Comissao: le de professional_profiles.commissions
      IF v_rec.professional_id IS NOT NULL THEN
        SELECT commissions INTO v_prof_comms
        FROM public.professional_profiles
        WHERE id = v_rec.professional_id AND clinic_id = v_clinic_id;

        IF v_prof_comms IS NOT NULL AND jsonb_typeof(v_prof_comms) = 'array' THEN
          -- 1. Match exato pelo procedure_name (case insensitive)
          IF v_rec.procedure_name IS NOT NULL THEN
            FOR v_comm_item IN SELECT * FROM jsonb_array_elements(v_prof_comms)
            LOOP
              IF LOWER(TRIM(v_comm_item->>'procedure')) = LOWER(TRIM(v_rec.procedure_name)) THEN
                v_comm_type := COALESCE(v_comm_item->>'type', 'percent');
                IF v_comm_type = 'fixed' THEN
                  v_comm_val := COALESCE((v_comm_item->>'value')::numeric, 0);
                ELSE
                  v_comm_pct := COALESCE((v_comm_item->>'value')::numeric, 0);
                  v_comm_val := v_rec.amount * v_comm_pct / 100;
                END IF;
                v_match_found := true;
                EXIT;
              END IF;
            END LOOP;
          END IF;

          -- 2. Fallback __todos__ se nao deu match exato
          IF NOT v_match_found THEN
            FOR v_comm_item IN SELECT * FROM jsonb_array_elements(v_prof_comms)
            LOOP
              IF v_comm_item->>'procedure' = '__todos__' THEN
                v_comm_type := COALESCE(v_comm_item->>'type', 'percent');
                IF v_comm_type = 'fixed' THEN
                  v_comm_val := COALESCE((v_comm_item->>'value')::numeric, 0);
                ELSE
                  v_comm_pct := COALESCE((v_comm_item->>'value')::numeric, 0);
                  v_comm_val := v_rec.amount * v_comm_pct / 100;
                END IF;
                v_match_found := true;
                EXIT;
              END IF;
            END LOOP;
          END IF;
        END IF;
      END IF;

      -- 3. Fallback final: default_pct do cashflow_config
      IF NOT v_match_found AND v_default_comm > 0 THEN
        v_comm_val := v_rec.amount * v_default_comm / 100;
      END IF;

      v_comissao := v_comissao + v_comm_val;

      -- Breakdown por metodo
      v_breakdown_method := v_breakdown_method || jsonb_build_object(
        v_rec.payment_method,
        COALESCE((v_breakdown_method->>v_rec.payment_method)::numeric, 0) + v_rec.amount
      );

      -- Breakdown por procedimento
      IF v_rec.procedure_name IS NOT NULL THEN
        v_breakdown_proc := v_breakdown_proc || jsonb_build_object(
          v_rec.procedure_name,
          jsonb_build_object(
            'bruto',     COALESCE((v_breakdown_proc->v_rec.procedure_name->>'bruto')::numeric, 0) + v_rec.amount,
            'custo',     COALESCE((v_breakdown_proc->v_rec.procedure_name->>'custo')::numeric, 0) + v_proc_cost,
            'taxa',      COALESCE((v_breakdown_proc->v_rec.procedure_name->>'taxa')::numeric, 0)  + v_fee_val,
            'comissao',  COALESCE((v_breakdown_proc->v_rec.procedure_name->>'comissao')::numeric, 0) + v_comm_val,
            'qtd',       COALESCE((v_breakdown_proc->v_rec.procedure_name->>'qtd')::int, 0) + 1
          )
        );
      END IF;

      -- Breakdown por profissional
      IF v_rec.professional_id IS NOT NULL THEN
        v_breakdown_prof := v_breakdown_prof || jsonb_build_object(
          v_rec.professional_id::text,
          jsonb_build_object(
            'bruto',    COALESCE((v_breakdown_prof->v_rec.professional_id::text->>'bruto')::numeric, 0) + v_rec.amount,
            'comissao', COALESCE((v_breakdown_prof->v_rec.professional_id::text->>'comissao')::numeric, 0) + v_comm_val
          )
        );
      END IF;
    END;
  END LOOP;

  -- Despesas (debits no periodo)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_despesas
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'debit'
    AND transaction_date BETWEEN v_start AND v_end;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('year', v_year, 'month', v_month, 'start', v_start, 'end', v_end),
    'dre', jsonb_build_object(
      'bruto',    ROUND(v_bruto, 2),
      'taxa',     ROUND(v_taxa, 2),
      'custo',    ROUND(v_custo, 2),
      'comissao', ROUND(v_comissao, 2),
      'despesas', ROUND(v_despesas, 2),
      'liquido',  ROUND(v_bruto - v_taxa - v_custo - v_comissao - v_despesas, 2),
      'margem_pct', CASE WHEN v_bruto > 0
                      THEN ROUND(((v_bruto - v_taxa - v_custo - v_comissao - v_despesas) / v_bruto) * 100, 1)
                      ELSE 0 END
    ),
    'breakdown', jsonb_build_object(
      'by_method',       v_breakdown_method,
      'by_procedure',    v_breakdown_proc,
      'by_professional', v_breakdown_prof
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_dre(int, int) TO authenticated;

COMMENT ON FUNCTION public.cashflow_dre IS
  'DRE com comissao real por procedimento. Le professional_profiles.commissions com matching: nome exato → __todos__ → default_pct. Suporta type percent e fixed.';
