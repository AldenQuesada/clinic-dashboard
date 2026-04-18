-- ============================================================
-- Migration: B2B Export CSV — Fraqueza #10
--
-- RPC que retorna array json com campos relevantes das parcerias
-- para exportação CSV. Client-side converte pra CSV string.
--
-- Filtro opcional por status. Inclui is_collective/member_count
-- (Fase 3) + health_color + DNA score.
-- ============================================================

CREATE OR REPLACE FUNCTION public.b2b_partnership_export(
  p_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                    id,
      'name',                  name,
      'slug',                  slug,
      'pillar',                pillar,
      'category',              category,
      'tier',                  tier,
      'type',                  type,
      'status',                status,
      'status_reason',         status_reason,
      'dna_excelencia',        dna_excelencia,
      'dna_estetica',          dna_estetica,
      'dna_proposito',         dna_proposito,
      'dna_score',             dna_score,
      'health_color',          health_color,
      'contact_name',          contact_name,
      'contact_phone',         contact_phone,
      'contact_email',         contact_email,
      'instagram',             contact_instagram,
      'website',               contact_website,
      'is_collective',         COALESCE(is_collective, false),
      'member_count',          member_count,
      'voucher_combo',         voucher_combo,
      'voucher_validity_days', voucher_validity_days,
      'voucher_monthly_cap',   voucher_monthly_cap,
      'monthly_value_cap_brl', monthly_value_cap_brl,
      'contract_duration_months', contract_duration_months,
      'sazonais',              COALESCE(sazonais, ARRAY[]::text[]),
      'involved_professionals', COALESCE(involved_professionals, ARRAY[]::text[]),
      'closure_suggested_at',  closure_suggested_at,
      'closure_reason',        closure_reason,
      'created_at',            created_at,
      'updated_at',            updated_at
    )
    ORDER BY tier NULLS LAST, pillar, name
  ), '[]'::jsonb)
  INTO v_out
  FROM public.b2b_partnerships
  WHERE clinic_id = v_clinic_id
    AND (p_status IS NULL OR status = p_status);

  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_partnership_export(text) TO anon, authenticated, service_role;
