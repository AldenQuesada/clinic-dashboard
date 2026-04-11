-- ============================================================
-- Migration: Cashflow DRE / Lucro Real
-- - Tabela cashflow_config (taxas + comissoes por clinica)
-- - Colunas extras em cashflow_entries (procedure_name, professional_id)
-- - RPCs: cashflow_get_config, cashflow_save_config, cashflow_dre
-- ============================================================

-- ── 1. Adicionar colunas em cashflow_entries ────────────────

ALTER TABLE public.cashflow_entries
  ADD COLUMN IF NOT EXISTS procedure_name  text,
  ADD COLUMN IF NOT EXISTS professional_id uuid;

CREATE INDEX IF NOT EXISTS idx_cashflow_procedure
  ON public.cashflow_entries (clinic_id, procedure_name)
  WHERE deleted_at IS NULL AND procedure_name IS NOT NULL;

-- ── 2. Tabela cashflow_config ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.cashflow_config (
  clinic_id   uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  fees        jsonb NOT NULL DEFAULT '{}'::jsonb,
  commissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Defaults pra primeira clinica (ajustar via UI)
INSERT INTO public.cashflow_config (clinic_id, fees, commissions)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '{
    "pix":         0,
    "cash":        0,
    "card_credit": 3.49,
    "card_debit":  1.99,
    "transfer":    0,
    "boleto":      2.50,
    "installment": 4.50,
    "courtesy":    0,
    "convenio":    0,
    "link":        4.99,
    "other":       0
  }'::jsonb,
  '{
    "default_pct": 0,
    "by_professional": {}
  }'::jsonb
)
ON CONFLICT (clinic_id) DO NOTHING;

ALTER TABLE public.cashflow_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cf_config_select ON public.cashflow_config;
DROP POLICY IF EXISTS cf_config_admin ON public.cashflow_config;

CREATE POLICY cf_config_select ON public.cashflow_config
  FOR SELECT TO authenticated
  USING (clinic_id = public._sdr_clinic_id());

CREATE POLICY cf_config_admin ON public.cashflow_config
  FOR ALL TO authenticated
  USING (clinic_id = public._sdr_clinic_id() AND public.is_admin())
  WITH CHECK (clinic_id = public._sdr_clinic_id() AND public.is_admin());

-- ── 3. RPC: cashflow_get_config ─────────────────────────────

CREATE OR REPLACE FUNCTION public.cashflow_get_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_result    jsonb;
BEGIN
  SELECT jsonb_build_object(
    'fees',        COALESCE(fees, '{}'::jsonb),
    'commissions', COALESCE(commissions, '{}'::jsonb)
  )
  INTO v_result
  FROM public.cashflow_config
  WHERE clinic_id = v_clinic_id;

  IF v_result IS NULL THEN
    -- Retorna defaults
    v_result := jsonb_build_object(
      'fees',        '{}'::jsonb,
      'commissions', '{"default_pct": 0, "by_professional": {}}'::jsonb
    );
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_get_config() TO authenticated;

-- ── 4. RPC: cashflow_save_config ────────────────────────────

CREATE OR REPLACE FUNCTION public.cashflow_save_config(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado');
  END IF;

  INSERT INTO public.cashflow_config (clinic_id, fees, commissions, updated_at)
  VALUES (
    v_clinic_id,
    COALESCE(p_data->'fees',        '{}'::jsonb),
    COALESCE(p_data->'commissions', '{"default_pct": 0, "by_professional": {}}'::jsonb),
    now()
  )
  ON CONFLICT (clinic_id) DO UPDATE
    SET fees        = COALESCE(EXCLUDED.fees,        cashflow_config.fees),
        commissions = COALESCE(EXCLUDED.commissions, cashflow_config.commissions),
        updated_at  = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_save_config(jsonb) TO authenticated;

-- ── 5. RPC: cashflow_dre ────────────────────────────────────
-- Demonstrativo de Resultado do Exercicio simplificado.
-- Bruto - Taxa - Custo - Comissao - Despesas = Liquido

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
  v_by_prof       jsonb;

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
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  v_start := make_date(v_year, v_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  -- Carrega config
  SELECT fees, commissions
  INTO v_fees, v_commissions
  FROM public.cashflow_config
  WHERE clinic_id = v_clinic_id;

  v_fees         := COALESCE(v_fees, '{}'::jsonb);
  v_commissions  := COALESCE(v_commissions, '{"default_pct": 0, "by_professional": {}}'::jsonb);
  v_default_comm := COALESCE((v_commissions->>'default_pct')::numeric, 0);
  v_by_prof      := COALESCE(v_commissions->'by_professional', '{}'::jsonb);

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

    -- Taxa do metodo
    DECLARE
      v_fee_pct numeric := COALESCE((v_fees->>v_rec.payment_method)::numeric, 0);
      v_fee_val numeric := v_rec.amount * v_fee_pct / 100;
      v_proc_cost numeric := 0;
      v_comm_pct numeric := v_default_comm;
      v_comm_val numeric := 0;
    BEGIN
      v_taxa := v_taxa + v_fee_val;

      -- Custo do procedimento
      IF v_rec.procedure_name IS NOT NULL THEN
        v_proc_cost := COALESCE((v_proc_costs->>LOWER(TRIM(v_rec.procedure_name)))::numeric, 0);
        v_custo := v_custo + v_proc_cost;
      END IF;

      -- Comissao
      IF v_rec.professional_id IS NOT NULL THEN
        v_comm_pct := COALESCE(
          (v_by_prof->>v_rec.professional_id::text)::numeric,
          v_default_comm
        );
      END IF;
      v_comm_val := v_rec.amount * v_comm_pct / 100;
      v_comissao := v_comissao + v_comm_val;

      -- Breakdown por metodo
      v_breakdown_method := v_breakdown_method || jsonb_build_object(
        v_rec.payment_method,
        COALESCE((v_breakdown_method->>v_rec.payment_method)::numeric, 0) + v_rec.amount
      );

      -- Breakdown por procedimento (com lucro liquido por proc)
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
  'DRE simplificado: Bruto - Taxa - Custo - Comissao - Despesa = Liquido. Configurado em cashflow_config (taxas) e fin_config.procs (custos).';
