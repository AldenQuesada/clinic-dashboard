-- ============================================================
-- Hotfix: b2b_partnership_impact_score — CASE + jsonb_agg
-- sem GROUP BY viola regra SQL. Refatorado com 2 branches claros.
-- ============================================================

CREATE OR REPLACE FUNCTION public.b2b_partnership_impact_score(p_partnership_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  WITH base AS (
    SELECT
      p.id, p.name, p.tier, p.pillar, p.status, p.health_color,
      COALESCE((SELECT COUNT(*) FROM public.b2b_vouchers v
                 WHERE v.partnership_id = p.id AND v.status = 'redeemed'), 0) AS vouchers_redeemed,
      COALESCE((SELECT SUM(reach_count) FROM public.b2b_group_exposures ge
                 WHERE ge.partnership_id = p.id), 0) AS total_reach,
      COALESCE(p.voucher_unit_cost_brl, 0) *
        COALESCE((SELECT COUNT(*) FROM public.b2b_vouchers v
                   WHERE v.partnership_id = p.id AND v.status = 'redeemed'), 0) +
      COALESCE((SELECT SUM(cost_estimate_brl) FROM public.b2b_group_exposures ge
                 WHERE ge.partnership_id = p.id), 0) AS total_cost,
      COALESCE((SELECT AVG(score)::numeric FROM public.b2b_nps_responses n
                 WHERE n.partnership_id = p.id AND n.score IS NOT NULL), 0) AS avg_nps
      FROM public.b2b_partnerships p
     WHERE p.clinic_id = v_clinic_id
       AND (p_partnership_id IS NULL OR p.id = p_partnership_id)
       AND p.status NOT IN ('closed')
  ),
  scored AS (
    SELECT *,
      (vouchers_redeemed::numeric * GREATEST(avg_nps, 1) * (1 + total_reach::numeric / 1000))
      / GREATEST(1 + total_cost / 1000, 1) AS raw_score
    FROM base
  ),
  normalized AS (
    SELECT *,
      CASE WHEN MAX(raw_score) OVER () > 0
        THEN ROUND((raw_score / MAX(raw_score) OVER ()) * 100)
        ELSE 0
      END AS impact_score
    FROM scored
  )
  SELECT
    CASE WHEN p_partnership_id IS NOT NULL THEN
      (SELECT to_jsonb(n.*) FROM normalized n LIMIT 1)
    ELSE
      COALESCE((SELECT jsonb_agg(to_jsonb(n.*) ORDER BY n.impact_score DESC) FROM normalized n), '[]'::jsonb)
    END
  INTO v_out;

  IF p_partnership_id IS NOT NULL AND v_out IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN v_out;
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_partnership_impact_score(uuid) TO anon, authenticated, service_role;
