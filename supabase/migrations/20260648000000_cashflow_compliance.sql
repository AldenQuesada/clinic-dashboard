-- ============================================================
-- Migration: Cashflow Compliance — DAS / Simples Nacional
-- Calcula DAS estimado (Anexo III - Servicos) baseado em
-- RBT12 (receita bruta dos ultimos 12 meses)
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashflow_das_estimate(
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
  v_rbt12_start date;
  v_rbt12_end   date;

  v_rbt12        numeric := 0;
  v_month_rev    numeric := 0;
  v_aliquota_nominal numeric := 0;
  v_deducao      numeric := 0;
  v_aliquota_efetiva numeric := 0;
  v_das_estimado numeric := 0;
  v_faixa        text := '';
  v_proxima_faixa numeric := 0;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  v_start := make_date(v_year, v_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  -- RBT12: receita dos ultimos 12 meses (ate o mes anterior)
  v_rbt12_end   := (v_start - interval '1 day')::date;
  v_rbt12_start := (v_rbt12_end - interval '11 months')::date;
  v_rbt12_start := make_date(EXTRACT(YEAR FROM v_rbt12_start)::int,
                             EXTRACT(MONTH FROM v_rbt12_start)::int, 1);

  SELECT COALESCE(SUM(amount), 0)
  INTO v_rbt12
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'credit'
    AND transaction_date BETWEEN v_rbt12_start AND v_rbt12_end;

  -- Receita do mes referencia
  SELECT COALESCE(SUM(amount), 0)
  INTO v_month_rev
  FROM public.cashflow_entries
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND direction = 'credit'
    AND transaction_date BETWEEN v_start AND v_end;

  -- Anexo III - Simples Nacional (Servicos / Profissionais Liberais)
  -- Faixas vigentes desde 2018:
  IF v_rbt12 <= 180000 THEN
    v_aliquota_nominal := 6.00;
    v_deducao := 0;
    v_faixa := '1a Faixa (ate R$ 180.000)';
    v_proxima_faixa := 180000;
  ELSIF v_rbt12 <= 360000 THEN
    v_aliquota_nominal := 11.20;
    v_deducao := 9360;
    v_faixa := '2a Faixa (R$ 180.000 a R$ 360.000)';
    v_proxima_faixa := 360000;
  ELSIF v_rbt12 <= 720000 THEN
    v_aliquota_nominal := 13.50;
    v_deducao := 17640;
    v_faixa := '3a Faixa (R$ 360.000 a R$ 720.000)';
    v_proxima_faixa := 720000;
  ELSIF v_rbt12 <= 1800000 THEN
    v_aliquota_nominal := 16.00;
    v_deducao := 35640;
    v_faixa := '4a Faixa (R$ 720.000 a R$ 1.800.000)';
    v_proxima_faixa := 1800000;
  ELSIF v_rbt12 <= 3600000 THEN
    v_aliquota_nominal := 21.00;
    v_deducao := 125640;
    v_faixa := '5a Faixa (R$ 1.800.000 a R$ 3.600.000)';
    v_proxima_faixa := 3600000;
  ELSE
    v_aliquota_nominal := 33.00;
    v_deducao := 648000;
    v_faixa := '6a Faixa (acima de R$ 3.600.000)';
    v_proxima_faixa := 4800000;
  END IF;

  -- Aliquota efetiva = ((RBT12 * Aliquota Nominal) - Deducao) / RBT12 * 100
  IF v_rbt12 > 0 THEN
    v_aliquota_efetiva := ((v_rbt12 * v_aliquota_nominal / 100) - v_deducao) / v_rbt12 * 100;
    IF v_aliquota_efetiva < 0 THEN v_aliquota_efetiva := 0; END IF;
  ELSE
    v_aliquota_efetiva := v_aliquota_nominal;
  END IF;

  -- DAS estimado do mes
  v_das_estimado := v_month_rev * v_aliquota_efetiva / 100;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('year', v_year, 'month', v_month),
    'rbt12', jsonb_build_object(
      'value',  ROUND(v_rbt12, 2),
      'start',  v_rbt12_start,
      'end',    v_rbt12_end
    ),
    'faixa', jsonb_build_object(
      'nome',             v_faixa,
      'aliquota_nominal', v_aliquota_nominal,
      'deducao',          v_deducao,
      'aliquota_efetiva', ROUND(v_aliquota_efetiva, 4),
      'proxima_faixa',    v_proxima_faixa,
      'distancia_proxima', ROUND(v_proxima_faixa - v_rbt12, 2)
    ),
    'mes_atual', jsonb_build_object(
      'receita',       ROUND(v_month_rev, 2),
      'das_estimado',  ROUND(v_das_estimado, 2)
    ),
    'aviso', 'Estimativa baseada em Anexo III (servicos). Calculo real depende de retenoes, fator-r e classificacao da clinica. Valide com seu contador.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_das_estimate(int, int) TO authenticated;

COMMENT ON FUNCTION public.cashflow_das_estimate IS
  'Estimativa de DAS Simples Nacional Anexo III (servicos) baseada em RBT12 e receita do mes. Apenas referencia — valide com contador.';
