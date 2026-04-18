-- ============================================================
-- Migration: Growth Channel Analytics — LTV/CAC por canal
--
-- Story: s2-6 do Plano de Growth (2026-04-17)
--
-- Agrega vpi_partner_attribution (capturada via s1-1 hook) por canal
-- normalizado (utm_source + utm_medium → 'canal/medium' ou 'direto').
-- Retorna clicks, leads, conversões, receita, LTV, CTR, taxa de
-- conversão e — se admin passar custo por canal em jsonb — CAC e
-- razão LTV/CAC pra decidir onde investir.
--
-- Fonte de receita: valor_estimado na attribution (preenchido pelo
-- trigger _vpi_attribution_on_close com appointments.value ao fechar
-- indicação). Se appt.value for zero ou null, fallback R$1200.
--
-- Componentes:
--   1) RPC growth_channel_analytics(period_days, cost_by_channel)
--
-- Idempotente. Graceful degrade se vpi_partner_attribution ausente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.growth_channel_analytics(
  p_period_days      int    DEFAULT 30,
  p_cost_by_channel  jsonb  DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_since     timestamptz;
  v_out       jsonb;
  v_totals    jsonb;
BEGIN
  v_since := now() - (GREATEST(1, p_period_days) || ' days')::interval;

  WITH attr AS (
    SELECT
      CASE
        WHEN source IS NULL AND medium IS NULL THEN 'direto'
        WHEN source = 'vpi' AND medium = 'partner_card' THEN 'indicacao_vpi'
        WHEN source IS NULL THEN COALESCE(medium, 'outros')
        WHEN medium IS NULL THEN COALESCE(source, 'outros')
        ELSE source || '/' || medium
      END AS channel,
      clicked_at,
      converted_at,
      converted,
      valor_estimado,
      lead_id
    FROM public.vpi_partner_attribution
    WHERE clinic_id = v_clinic_id
      AND clicked_at >= v_since
  ),
  agg AS (
    SELECT
      channel,
      COUNT(*) AS clicks,
      COUNT(DISTINCT lead_id) FILTER (WHERE lead_id IS NOT NULL) AS leads,
      COUNT(*) FILTER (WHERE converted = true) AS conversoes,
      COALESCE(SUM(valor_estimado) FILTER (WHERE converted = true), 0) AS receita_total
    FROM attr
    GROUP BY channel
  ),
  enriched AS (
    SELECT
      a.channel,
      a.clicks,
      a.leads,
      a.conversoes,
      a.receita_total,
      COALESCE((p_cost_by_channel->>a.channel)::numeric, 0) AS custo_periodo,
      CASE WHEN a.conversoes > 0
           THEN ROUND(a.receita_total / a.conversoes::numeric, 2)
           ELSE 0 END AS ltv_medio,
      CASE WHEN a.leads > 0
           THEN ROUND((a.conversoes::numeric / a.leads::numeric) * 100, 2)
           ELSE 0 END AS taxa_conversao_pct,
      CASE WHEN a.clicks > 0
           THEN ROUND((a.leads::numeric / a.clicks::numeric) * 100, 2)
           ELSE 0 END AS ctr_pct
    FROM agg a
  ),
  final AS (
    SELECT
      e.*,
      CASE WHEN e.conversoes > 0 AND e.custo_periodo > 0
           THEN ROUND(e.custo_periodo / e.conversoes::numeric, 2)
           ELSE 0 END AS cac,
      CASE WHEN e.conversoes > 0 AND e.custo_periodo > 0 AND e.receita_total > 0
           THEN ROUND(e.receita_total / e.custo_periodo, 2)
           ELSE 0 END AS ltv_cac_ratio
    FROM enriched e
  )
  SELECT
    jsonb_build_object(
      'ok',              true,
      'period_days',     GREATEST(1, p_period_days),
      'since',           v_since,
      'total_clicks',    COALESCE(SUM(clicks), 0),
      'total_leads',     COALESCE(SUM(leads), 0),
      'total_conversoes',COALESCE(SUM(conversoes), 0),
      'total_receita',   COALESCE(SUM(receita_total), 0),
      'total_custo',     COALESCE(SUM(custo_periodo), 0),
      'channels', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'channel',             channel,
            'clicks',              clicks,
            'leads',               leads,
            'conversoes',          conversoes,
            'receita_total',       receita_total,
            'ltv_medio',           ltv_medio,
            'taxa_conversao_pct',  taxa_conversao_pct,
            'ctr_pct',             ctr_pct,
            'custo_periodo',       custo_periodo,
            'cac',                 cac,
            'ltv_cac_ratio',       ltv_cac_ratio
          )
          ORDER BY receita_total DESC, leads DESC
        ),
        '[]'::jsonb
      )
    )
  INTO v_out
  FROM final;

  RETURN v_out;

EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE '[growth_channel_analytics] vpi_partner_attribution ausente';
    RETURN jsonb_build_object(
      'ok', false, 'error', 'table_missing',
      'detail', 'vpi_partner_attribution nao existe — aplique 20260700000090_vpi_attribution.sql'
    );
  WHEN undefined_column THEN
    RAISE NOTICE '[growth_channel_analytics] coluna ausente: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'error', 'column_missing', 'detail', SQLERRM);
END $$;

GRANT EXECUTE ON FUNCTION public.growth_channel_analytics(int, jsonb) TO authenticated;

-- ── Sanity ──────────────────────────────────────────────────
DO $$
DECLARE v_fn int;
BEGIN
  SELECT count(*) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='growth_channel_analytics';
  RAISE NOTICE '[growth_channel_analytics] fn registrada=%', v_fn;
END $$;
