-- ============================================================
-- Migration: A/B Significance testing
-- ============================================================
-- Estende o A/B testing existente (wa_rule_ab_results) com:
--   - Calculo de Chi-square para determinar significancia estatistica
--   - Vencedor claro (A, B ou inconclusivo)
--   - Metricas de conversao alem de delivery (quando aplicavel)
--
-- Retorna uma unica RPC que lista todas as regras com A/B ativo + stats.
-- ============================================================

CREATE OR REPLACE FUNCTION public.wa_rule_ab_significance(
  p_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_result jsonb;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao autenticado');
  END IF;

  IF p_days IS NULL OR p_days <= 0 THEN p_days := 30; END IF;
  IF p_days > 365 THEN p_days := 365; END IF;

  WITH
  ab_rules AS (
    SELECT id, name, content_template, ab_variant_template, trigger_type, trigger_config, channel, is_active
    FROM wa_agenda_automations
    WHERE clinic_id = v_clinic_id
      AND ab_variant_template IS NOT NULL
      AND trim(ab_variant_template) <> ''
  ),
  per_variant AS (
    SELECT
      r.id   AS rule_id,
      o.ab_variant,
      count(*)                                    AS total,
      count(*) FILTER (WHERE o.status = 'sent')   AS sent,
      count(*) FILTER (WHERE o.status = 'failed') AS failed
    FROM ab_rules r
    JOIN wa_outbox o ON o.rule_id = r.id
    WHERE o.ab_variant IN ('A', 'B')
      AND o.clinic_id = v_clinic_id
      AND o.created_at > now() - make_interval(days => p_days)
    GROUP BY r.id, o.ab_variant
  ),
  aggregated AS (
    SELECT
      r.id,
      r.name,
      r.content_template,
      r.ab_variant_template,
      r.is_active,
      COALESCE(max(CASE WHEN v.ab_variant = 'A' THEN v.sent   END), 0) AS a_sent,
      COALESCE(max(CASE WHEN v.ab_variant = 'A' THEN v.failed END), 0) AS a_failed,
      COALESCE(max(CASE WHEN v.ab_variant = 'B' THEN v.sent   END), 0) AS b_sent,
      COALESCE(max(CASE WHEN v.ab_variant = 'B' THEN v.failed END), 0) AS b_failed
    FROM ab_rules r
    LEFT JOIN per_variant v ON v.rule_id = r.id
    GROUP BY r.id, r.name, r.content_template, r.ab_variant_template, r.is_active
  ),
  with_stats AS (
    SELECT
      id, name, content_template, ab_variant_template, is_active,
      a_sent, a_failed, b_sent, b_failed,
      (a_sent + a_failed) AS a_total,
      (b_sent + b_failed) AS b_total,
      (a_sent + a_failed + b_sent + b_failed) AS n_total,
      CASE WHEN (a_sent + a_failed) > 0
        THEN round(a_sent::numeric / (a_sent + a_failed) * 100, 1)
        ELSE NULL END AS a_rate,
      CASE WHEN (b_sent + b_failed) > 0
        THEN round(b_sent::numeric / (b_sent + b_failed) * 100, 1)
        ELSE NULL END AS b_rate,
      CASE
        WHEN (a_sent + a_failed) = 0 OR (b_sent + b_failed) = 0 THEN NULL
        WHEN (a_sent + b_sent) = 0 OR (a_failed + b_failed) = 0 THEN 0::numeric
        ELSE round(
          ((a_sent + a_failed + b_sent + b_failed)::numeric
            * power(a_sent::numeric * b_failed::numeric - a_failed::numeric * b_sent::numeric, 2))
          / NULLIF(
              ((a_sent + a_failed)::numeric
                * (b_sent + b_failed)::numeric
                * (a_sent + b_sent)::numeric
                * (a_failed + b_failed)::numeric),
              0)
          , 4)
      END AS chi_square
    FROM aggregated
  )
  SELECT jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'period_days', p_days,
      'rules', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'rule_id',        s.id,
          'rule_name',      s.name,
          'is_active',      s.is_active,
          'a_content',      left(s.content_template, 200),
          'b_content',      left(s.ab_variant_template, 200),
          'a_sent',         s.a_sent,
          'a_failed',       s.a_failed,
          'a_total',        s.a_total,
          'a_rate',         s.a_rate,
          'b_sent',         s.b_sent,
          'b_failed',       s.b_failed,
          'b_total',        s.b_total,
          'b_rate',         s.b_rate,
          'n_total',        s.n_total,
          'chi_square',     s.chi_square,
          'significant_95', (s.chi_square IS NOT NULL AND s.chi_square > 3.841),
          'significant_99', (s.chi_square IS NOT NULL AND s.chi_square > 6.635),
          'winner',         CASE
            WHEN s.chi_square IS NULL OR s.chi_square <= 3.841 THEN NULL
            WHEN s.a_rate IS NULL OR s.b_rate IS NULL THEN NULL
            WHEN s.a_rate > s.b_rate THEN 'A'
            WHEN s.b_rate > s.a_rate THEN 'B'
            ELSE NULL
          END,
          'min_sample_rec', GREATEST(0, 200 - s.n_total)
        ) ORDER BY s.n_total DESC)
        FROM with_stats s
      ), '[]'::jsonb)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_rule_ab_significance(int) TO authenticated;

COMMENT ON FUNCTION public.wa_rule_ab_significance(int) IS
  'A/B testing com chi-square test. Compara delivery_rate A vs B. Significante a 95% quando chi2 > 3.841.';
