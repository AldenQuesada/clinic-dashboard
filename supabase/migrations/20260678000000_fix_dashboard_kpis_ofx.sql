-- Fix: dashboard_kpis receita vem do OFX (cashflow_entries) em vez de appointments
-- Os appointments foram zerados, mas o OFX tem as transacoes reais do mes.

CREATE OR REPLACE FUNCTION public.dashboard_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinic_id   uuid := app_clinic_id();
    v_role        text := app_role();
    v_today       date := CURRENT_DATE;
    v_yesterday   date := CURRENT_DATE - 1;
    v_month_start date := date_trunc('month', CURRENT_DATE)::date;

    v_leads_today     bigint  := 0;
    v_leads_yesterday bigint  := 0;
    v_total_leads     bigint  := 0;
    v_converted       bigint  := 0;
    v_conv_rate       numeric := 0;
    v_leads_trend     numeric;
    v_appts_month     bigint  := 0;
    v_revenue_month   numeric := 0;
    v_despesa_month   numeric := 0;
    v_funnel          jsonb   := '[]'::jsonb;
  BEGIN
    IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
    IF v_role NOT IN ('owner','admin','receptionist','therapist','viewer') THEN
      RAISE EXCEPTION 'Permissão insuficiente para acessar KPIs';
    END IF;

    -- ── Leads hoje ───────────────────────────────────────────────
    SELECT COUNT(*) INTO v_leads_today
      FROM public.leads
     WHERE clinic_id  = v_clinic_id
       AND deleted_at IS NULL
       AND status    <> 'archived'
       AND created_at::date = v_today;

    -- ── Leads ontem ──────────────────────────────────────────────
    SELECT COUNT(*) INTO v_leads_yesterday
      FROM public.leads
     WHERE clinic_id  = v_clinic_id
       AND deleted_at IS NULL
       AND status    <> 'archived'
       AND created_at::date = v_yesterday;

    -- ── Total de leads ativos ─────────────────────────────────────
    SELECT COUNT(*) INTO v_total_leads
      FROM public.leads
     WHERE clinic_id  = v_clinic_id
       AND deleted_at IS NULL
       AND status    <> 'archived';

    -- ── Leads convertidos ────────────────────────────────────────
    SELECT COUNT(*) INTO v_converted
      FROM public.leads
     WHERE clinic_id  = v_clinic_id
       AND deleted_at IS NULL
       AND status IN ('patient','paciente','converted','attending');

    -- ── Taxa de conversão (%) ────────────────────────────────────
    IF v_total_leads > 0 THEN
      v_conv_rate := round((v_converted::numeric / v_total_leads) * 100, 1);
    END IF;

    -- ── Trend de leads (% variação hoje vs ontem) ────────────────
    v_leads_trend := CASE
      WHEN v_leads_yesterday = 0 AND v_leads_today > 0 THEN 100
      WHEN v_leads_yesterday = 0                        THEN NULL
      ELSE round(
        ((v_leads_today - v_leads_yesterday)::numeric / v_leads_yesterday) * 100,
        1
      )
    END;

    -- ── Agendamentos do mês atual ─────────────────────────────────
    SELECT COUNT(*) INTO v_appts_month
      FROM public.appointments
     WHERE clinic_id      = v_clinic_id
       AND deleted_at     IS NULL
       AND scheduled_date >= v_month_start
       AND scheduled_date <= v_today;

    -- ── Receita do mês — OFX (cashflow_entries) ───────────────────
    -- Fonte real: transacoes bancarias importadas via OFX
    SELECT
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)
    INTO v_revenue_month, v_despesa_month
    FROM public.cashflow_entries
    WHERE clinic_id        = v_clinic_id
      AND deleted_at       IS NULL
      AND transaction_date >= v_month_start
      AND transaction_date <= v_today;

    -- ── Funil por status ─────────────────────────────────────────
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('stage', status, 'count', cnt)
        ORDER BY cnt DESC
      ),
      '[]'::jsonb
    )
    INTO v_funnel
    FROM (
      SELECT status, COUNT(*) AS cnt
        FROM public.leads
       WHERE clinic_id  = v_clinic_id
         AND deleted_at IS NULL
         AND status    <> 'archived'
       GROUP BY status
    ) s;

    -- ── Resultado consolidado ─────────────────────────────────────
    RETURN jsonb_build_object(
      'leadsToday',        v_leads_today,
      'leadsYesterday',    v_leads_yesterday,
      'totalLeads',        v_total_leads,
      'converted',         v_converted,
      'conversionRate',    v_conv_rate,
      'leadsTrend',        v_leads_trend,
      'appointmentsTotal', v_appts_month,
      'totalRevenue',      v_revenue_month,
      'totalDespesa',      v_despesa_month,
      'messagesAiToday',   0,
      'funnel',            v_funnel,
      'computedAt',        now()
    );
  END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_kpis() TO authenticated;
