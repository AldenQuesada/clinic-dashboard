-- ============================================================
-- Migration: Cashflow Trends (dados pra graficos)
-- - Daily series ultimos N dias
-- - Monthly series ultimos N meses
-- - Comparativos
-- ============================================================

CREATE OR REPLACE FUNCTION public.cashflow_trends(
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
  v_daily     jsonb := '[]'::jsonb;
  v_monthly   jsonb := '[]'::jsonb;
  v_by_method jsonb := '[]'::jsonb;
  v_by_category jsonb := '[]'::jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  v_start := make_date(v_year, v_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  -- Daily: serie completa do mes (com zeros nos dias sem movimento)
  WITH days AS (
    SELECT generate_series(v_start, v_end, '1 day'::interval)::date AS d
  ),
  agg AS (
    SELECT
      transaction_date,
      SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END) AS credits,
      SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END) AS debits
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND transaction_date BETWEEN v_start AND v_end
    GROUP BY transaction_date
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date',     d.d,
    'credits',  ROUND(COALESCE(a.credits, 0), 2),
    'debits',   ROUND(COALESCE(a.debits, 0), 2),
    'balance',  ROUND(COALESCE(a.credits, 0) - COALESCE(a.debits, 0), 2)
  ) ORDER BY d.d), '[]'::jsonb)
  INTO v_daily
  FROM days d
  LEFT JOIN agg a ON a.transaction_date = d.d;

  -- Monthly: ultimos 12 meses (com zeros nos meses sem movimento)
  WITH months AS (
    SELECT
      (date_trunc('month', CURRENT_DATE) - (i || ' month')::interval)::date AS m
    FROM generate_series(0, 11) AS i
  ),
  agg AS (
    SELECT
      date_trunc('month', transaction_date)::date AS month_start,
      SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END) AS credits,
      SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END) AS debits,
      COUNT(*) AS qtd
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND transaction_date >= (date_trunc('month', CURRENT_DATE) - interval '11 months')::date
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'month',    m.m,
    'credits',  ROUND(COALESCE(a.credits, 0), 2),
    'debits',   ROUND(COALESCE(a.debits, 0), 2),
    'balance',  ROUND(COALESCE(a.credits, 0) - COALESCE(a.debits, 0), 2),
    'qtd',      COALESCE(a.qtd, 0)
  ) ORDER BY m.m), '[]'::jsonb)
  INTO v_monthly
  FROM months m
  LEFT JOIN agg a ON a.month_start = m.m;

  -- Por metodo (pie chart) — so credit do mes
  WITH method_agg AS (
    SELECT payment_method, SUM(amount) AS total, COUNT(*) AS qtd
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND transaction_date BETWEEN v_start AND v_end
    GROUP BY payment_method
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', payment_method,
    'amount', ROUND(total, 2),
    'qtd',    qtd
  ) ORDER BY total DESC), '[]'::jsonb)
  INTO v_by_method
  FROM method_agg;

  -- Por categoria (pie chart secundario)
  WITH cat_agg AS (
    SELECT COALESCE(category, '(sem categoria)') AS category, SUM(amount) AS total, COUNT(*) AS qtd
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND direction = 'credit'
      AND transaction_date BETWEEN v_start AND v_end
    GROUP BY COALESCE(category, '(sem categoria)')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'category', category,
    'amount',   ROUND(total, 2),
    'qtd',      qtd
  ) ORDER BY total DESC), '[]'::jsonb)
  INTO v_by_category
  FROM cat_agg;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('year', v_year, 'month', v_month, 'start', v_start, 'end', v_end),
    'daily',       v_daily,
    'monthly',     v_monthly,
    'by_method',   v_by_method,
    'by_category', v_by_category
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_trends(int, int) TO authenticated;

COMMENT ON FUNCTION public.cashflow_trends IS
  'Series temporais para graficos: daily (mes atual com zeros), monthly (ultimos 12 meses), by_method, by_category.';
