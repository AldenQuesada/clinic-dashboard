-- ============================================================
-- Migration: VPI Ranking com Janela Temporal (Fase 8 - Entrega 4)
--
-- Ranking hoje e acumulativo (creditos_total desde sempre). Parceiras
-- antigas dominam, novatas ficam invisiveis.
--
-- Novo RPC vpi_partner_ranking(p_period, p_limit) retorna top N
-- ordenado por indicacoes CLOSED no periodo solicitado:
--   'month' - mes corrente (default)
--   '90d'   - ultimos 90 dias
--   'year'  - ano corrente
--   'all'   - acumulado (creditos_total)
--
-- Tie-break: creditos_total DESC, created_at ASC
--
-- Idempotente: CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.vpi_partner_ranking(
  p_period text DEFAULT 'month',
  p_limit  int  DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_since     timestamptz;
  v_result    jsonb;
  v_is_all    boolean := false;
BEGIN
  p_period := lower(COALESCE(p_period, 'month'));
  p_limit  := COALESCE(p_limit, 50);
  IF p_limit <= 0 OR p_limit > 500 THEN p_limit := 50; END IF;

  IF p_period = 'month' THEN
    v_since := date_trunc('month', now());
  ELSIF p_period = '90d' THEN
    v_since := now() - interval '90 days';
  ELSIF p_period = 'year' THEN
    v_since := date_trunc('year', now());
  ELSIF p_period IN ('all','accum','accumulated','acumulado') THEN
    v_is_all := true;
  ELSE
    v_since := date_trunc('month', now());
  END IF;

  IF v_is_all THEN
    -- Acumulado: ordena por creditos_total
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.pos), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT
          row_number() OVER (ORDER BY p.creditos_total DESC NULLS LAST, p.created_at ASC)::int AS pos,
          p.id::text             AS partner_id,
          p.nome,
          p.avatar_url,
          p.tier_atual,
          p.creditos_total,
          COALESCE(p.indicacoes_mes_cache, 0) AS indicacoes_no_periodo,
          p.creditos_total       AS creditos_do_periodo,
          p.score_classe AS classe
        FROM public.vpi_partners p
        WHERE p.clinic_id = v_clinic_id
          AND p.status <> 'inativo'
        ORDER BY p.creditos_total DESC NULLS LAST, p.created_at ASC
        LIMIT p_limit
      ) t;
  ELSE
    -- Periodo: conta indications CLOSED nesse intervalo
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.pos), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT
          row_number() OVER (
            ORDER BY COUNT(i.id) DESC,
                     COALESCE(SUM(i.creditos), 0) DESC,
                     p.creditos_total DESC NULLS LAST,
                     p.created_at ASC
          )::int AS pos,
          p.id::text             AS partner_id,
          p.nome,
          p.avatar_url,
          p.tier_atual,
          p.creditos_total,
          COUNT(i.id)::int       AS indicacoes_no_periodo,
          COALESCE(SUM(i.creditos), 0)::int AS creditos_do_periodo,
          p.score_classe AS classe
        FROM public.vpi_partners p
        LEFT JOIN public.vpi_indications i
          ON i.partner_id = p.id
         AND i.clinic_id  = v_clinic_id
         AND i.status     = 'closed'
         AND i.fechada_em >= v_since
        WHERE p.clinic_id = v_clinic_id
          AND p.status <> 'inativo'
        GROUP BY p.id
        ORDER BY COUNT(i.id) DESC,
                 COALESCE(SUM(i.creditos), 0) DESC,
                 p.creditos_total DESC NULLS LAST,
                 p.created_at ASC
        LIMIT p_limit
      ) t;
  END IF;

  RETURN jsonb_build_object(
    'ok',      true,
    'period',  p_period,
    'since',   v_since,
    'limit',   p_limit,
    'rows',    COALESCE(v_result, '[]'::jsonb)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_partner_ranking(text, int) TO authenticated;

COMMENT ON FUNCTION public.vpi_partner_ranking(text, int) IS
  'Ranking com janela temporal: month|90d|year|all. Tie-break creditos_total+created_at. Fase 8 Entrega 4.';
