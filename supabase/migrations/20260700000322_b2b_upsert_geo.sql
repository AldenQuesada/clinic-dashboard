-- ============================================================
-- Hotfix: b2b_partnership_upsert aceita lat/lng do payload (WOW #3)
-- ============================================================

CREATE OR REPLACE FUNCTION public.b2b_partnership_upsert(
  p_slug     text,
  p_payload  jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id        uuid;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_empty');
  END IF;

  INSERT INTO public.b2b_partnerships (
    clinic_id, slug, name, pillar, category, tier, type,
    dna_excelencia, dna_estetica, dna_proposito,
    contact_name, contact_phone, contact_email, contact_instagram, contact_website,
    voucher_combo, voucher_validity_days, voucher_min_notice_days, voucher_monthly_cap, voucher_delivery,
    voucher_unit_cost_brl,
    contrapartida, contrapartida_cadence,
    monthly_value_cap_brl, contract_duration_months, review_cadence_months, sazonais,
    slogans, narrative_quote, narrative_author, emotional_trigger,
    involved_professionals, status, created_by,
    is_collective, member_count, estimated_monthly_reach,
    lat, lng
  ) VALUES (
    v_clinic_id,
    p_slug,
    p_payload->>'name',
    COALESCE(p_payload->>'pillar', 'outros'),
    p_payload->>'category',
    NULLIF(p_payload->>'tier','')::int,
    COALESCE(p_payload->>'type', 'institutional'),
    NULLIF(p_payload->>'dna_excelencia','')::int,
    NULLIF(p_payload->>'dna_estetica','')::int,
    NULLIF(p_payload->>'dna_proposito','')::int,
    p_payload->>'contact_name', p_payload->>'contact_phone', p_payload->>'contact_email',
    p_payload->>'contact_instagram', p_payload->>'contact_website',
    p_payload->>'voucher_combo',
    COALESCE(NULLIF(p_payload->>'voucher_validity_days','')::int, 30),
    COALESCE(NULLIF(p_payload->>'voucher_min_notice_days','')::int, 15),
    NULLIF(p_payload->>'voucher_monthly_cap','')::int,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'voucher_delivery')), ARRAY['digital']),
    NULLIF(p_payload->>'voucher_unit_cost_brl','')::numeric,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'contrapartida')), ARRAY[]::text[]),
    p_payload->>'contrapartida_cadence',
    NULLIF(p_payload->>'monthly_value_cap_brl','')::numeric,
    NULLIF(p_payload->>'contract_duration_months','')::int,
    COALESCE(NULLIF(p_payload->>'review_cadence_months','')::int, 3),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'sazonais')), ARRAY[]::text[]),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'slogans')), ARRAY[]::text[]),
    p_payload->>'narrative_quote',
    p_payload->>'narrative_author',
    p_payload->>'emotional_trigger',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'involved_professionals')), ARRAY['mirian']),
    COALESCE(p_payload->>'status','prospect'),
    p_payload->>'created_by',
    COALESCE((p_payload->>'is_collective')::boolean, false),
    NULLIF(p_payload->>'member_count','')::int,
    NULLIF(p_payload->>'estimated_monthly_reach','')::int,
    NULLIF(p_payload->>'lat','')::numeric,
    NULLIF(p_payload->>'lng','')::numeric
  )
  ON CONFLICT (clinic_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    pillar = EXCLUDED.pillar,
    category = EXCLUDED.category,
    tier = EXCLUDED.tier,
    type = EXCLUDED.type,
    dna_excelencia = EXCLUDED.dna_excelencia,
    dna_estetica = EXCLUDED.dna_estetica,
    dna_proposito = EXCLUDED.dna_proposito,
    contact_name = EXCLUDED.contact_name,
    contact_phone = EXCLUDED.contact_phone,
    contact_email = EXCLUDED.contact_email,
    contact_instagram = EXCLUDED.contact_instagram,
    contact_website = EXCLUDED.contact_website,
    voucher_combo = EXCLUDED.voucher_combo,
    voucher_validity_days = EXCLUDED.voucher_validity_days,
    voucher_min_notice_days = EXCLUDED.voucher_min_notice_days,
    voucher_monthly_cap = EXCLUDED.voucher_monthly_cap,
    voucher_delivery = EXCLUDED.voucher_delivery,
    voucher_unit_cost_brl = EXCLUDED.voucher_unit_cost_brl,
    contrapartida = EXCLUDED.contrapartida,
    contrapartida_cadence = EXCLUDED.contrapartida_cadence,
    monthly_value_cap_brl = EXCLUDED.monthly_value_cap_brl,
    contract_duration_months = EXCLUDED.contract_duration_months,
    review_cadence_months = EXCLUDED.review_cadence_months,
    sazonais = EXCLUDED.sazonais,
    slogans = EXCLUDED.slogans,
    narrative_quote = EXCLUDED.narrative_quote,
    narrative_author = EXCLUDED.narrative_author,
    emotional_trigger = EXCLUDED.emotional_trigger,
    involved_professionals = EXCLUDED.involved_professionals,
    status = EXCLUDED.status,
    is_collective = EXCLUDED.is_collective,
    member_count = EXCLUDED.member_count,
    estimated_monthly_reach = EXCLUDED.estimated_monthly_reach,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'slug', p_slug);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_partnership_upsert(text, jsonb) TO anon, authenticated, service_role;
