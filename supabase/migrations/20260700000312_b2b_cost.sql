-- ============================================================
-- Migration: B2B Custo Real por Parceria — Fraqueza #8
--
-- Soma custos reais (vouchers resgatados + eventos/exposições)
-- e exibe custo acumulado + custo médio por entrega.
--
-- Fontes de custo:
--   1. Vouchers redeemed  × voucher_unit_cost_brl (parceria)
--   2. b2b_group_exposures × cost_estimate_brl (por evento)
--
-- Idempotente. RLS permissiva (alinhado com o projeto).
-- ============================================================

-- ── 1. Colunas novas (idempotentes) ──────────────────────────
ALTER TABLE public.b2b_partnerships
  ADD COLUMN IF NOT EXISTS voucher_unit_cost_brl numeric NULL;

COMMENT ON COLUMN public.b2b_partnerships.voucher_unit_cost_brl IS
  'Custo estimado de 1 voucher resgatado (hard cost insumo/tempo). Base do cálculo de custo total da parceria.';

ALTER TABLE public.b2b_group_exposures
  ADD COLUMN IF NOT EXISTS cost_estimate_brl numeric NULL;

COMMENT ON COLUMN public.b2b_group_exposures.cost_estimate_brl IS
  'Custo estimado da exposição (palestra/evento/post). Deslocamento, material, tempo.';


-- ── 2. RPC: custo agregado de UMA parceria ──────────────────
CREATE OR REPLACE FUNCTION public.b2b_partnership_cost(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_unit_cost numeric;
  v_monthly_cap numeric;
  v_voucher_count int;
  v_voucher_cost numeric;
  v_group_cost numeric;
  v_group_exposures int;
  v_group_reach int;
BEGIN
  SELECT voucher_unit_cost_brl, monthly_value_cap_brl
    INTO v_unit_cost, v_monthly_cap
    FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = p_partnership_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  SELECT COUNT(*) INTO v_voucher_count
    FROM public.b2b_vouchers
   WHERE clinic_id = v_clinic_id
     AND partnership_id = p_partnership_id
     AND status = 'redeemed';

  v_voucher_cost := COALESCE(v_unit_cost, 0) * v_voucher_count;

  SELECT COALESCE(SUM(cost_estimate_brl), 0),
         COUNT(*),
         COALESCE(SUM(reach_count), 0)
    INTO v_group_cost, v_group_exposures, v_group_reach
    FROM public.b2b_group_exposures
   WHERE clinic_id = v_clinic_id AND partnership_id = p_partnership_id;

  RETURN jsonb_build_object(
    'ok', true,
    'voucher_unit_cost_brl', v_unit_cost,
    'voucher_redeemed',      v_voucher_count,
    'voucher_total_cost',    v_voucher_cost,
    'group_exposures',       v_group_exposures,
    'group_reach',           v_group_reach,
    'group_total_cost',      v_group_cost,
    'total_cost',            v_voucher_cost + v_group_cost,
    'monthly_cap_brl',       v_monthly_cap,
    'over_cap',              (v_monthly_cap IS NOT NULL
                              AND (v_voucher_cost + v_group_cost) > v_monthly_cap)
  );
END $$;


-- ── 3. RPC: sumário de custos (ranqueado pra lista) ─────────
CREATE OR REPLACE FUNCTION public.b2b_cost_summary(p_limit int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  WITH costs AS (
    SELECT
      p.id,
      p.name,
      p.status,
      p.pillar,
      p.voucher_unit_cost_brl,
      p.monthly_value_cap_brl,
      (SELECT COUNT(*) FROM public.b2b_vouchers v
        WHERE v.partnership_id = p.id AND v.status = 'redeemed') AS vouchers_redeemed,
      COALESCE((SELECT SUM(cost_estimate_brl) FROM public.b2b_group_exposures ge
                 WHERE ge.partnership_id = p.id), 0) AS group_cost
      FROM public.b2b_partnerships p
     WHERE p.clinic_id = v_clinic_id
       AND p.status NOT IN ('closed')
  ),
  with_totals AS (
    SELECT
      id, name, status, pillar,
      voucher_unit_cost_brl,
      vouchers_redeemed,
      (COALESCE(voucher_unit_cost_brl, 0) * vouchers_redeemed) AS voucher_cost,
      group_cost,
      (COALESCE(voucher_unit_cost_brl, 0) * vouchers_redeemed + group_cost) AS total_cost,
      monthly_value_cap_brl
    FROM costs
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'status', status, 'pillar', pillar,
      'unit_cost',         voucher_unit_cost_brl,
      'vouchers_redeemed', vouchers_redeemed,
      'voucher_cost',      voucher_cost,
      'group_cost',        group_cost,
      'total_cost',        total_cost,
      'monthly_cap',       monthly_value_cap_brl,
      'over_cap',          (monthly_value_cap_brl IS NOT NULL AND total_cost > monthly_value_cap_brl)
    )
    ORDER BY total_cost DESC
  ), '[]'::jsonb) INTO v_out
  FROM with_totals;

  RETURN v_out;
END $$;


GRANT EXECUTE ON FUNCTION public.b2b_partnership_cost(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_cost_summary(int)      TO anon, authenticated, service_role;
