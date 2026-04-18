-- ============================================================
-- Migration: B2B Candidato manual (por indicação) + avaliar IA
--
-- Cadastro manual é alternativa ao scout automático (Apify/Claude).
-- Preserva rastreabilidade: quem indicou, por que, contato.
--
-- Também inclui RPC b2b_candidate_evaluate_prepare que retorna o
-- payload pronto pra edge function de avaliação IA isolada
-- (sem Apify — só Claude).
-- ============================================================

ALTER TABLE public.b2b_candidates
  ADD COLUMN IF NOT EXISTS referred_by          text NULL,
  ADD COLUMN IF NOT EXISTS referred_by_contact  text NULL,
  ADD COLUMN IF NOT EXISTS referred_by_reason   text NULL;

CREATE INDEX IF NOT EXISTS idx_b2b_candidates_referred_by
  ON public.b2b_candidates (clinic_id, referred_by) WHERE referred_by IS NOT NULL;


-- ── RPC: cadastrar candidato manualmente (source=referral) ──
CREATE OR REPLACE FUNCTION public.b2b_candidate_add_manual(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id        uuid;
BEGIN
  IF p_payload->>'name' IS NULL OR length(trim(p_payload->>'name')) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_required');
  END IF;
  IF p_payload->>'category' IS NULL OR length(trim(p_payload->>'category')) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'category_required');
  END IF;

  INSERT INTO public.b2b_candidates (
    clinic_id, category, tier_target, name,
    address, phone, whatsapp, email, instagram_handle, website,
    source, raw_data,
    dna_score, dna_justification, fit_reasons, risk_flags, approach_message,
    referred_by, referred_by_contact, referred_by_reason,
    contact_status
  ) VALUES (
    v_clinic_id,
    p_payload->>'category',
    NULLIF(p_payload->>'tier_target','')::int,
    p_payload->>'name',
    p_payload->>'address', p_payload->>'phone', p_payload->>'whatsapp',
    p_payload->>'email', p_payload->>'instagram_handle', p_payload->>'website',
    'referral',                                   -- manual → always 'referral'
    p_payload,
    NULLIF(p_payload->>'dna_score','')::numeric,  -- admin pode preencher já
    p_payload->>'dna_justification',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'fit_reasons')), ARRAY[]::text[]),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'risk_flags')), ARRAY[]::text[]),
    p_payload->>'approach_message',
    p_payload->>'referred_by',
    p_payload->>'referred_by_contact',
    p_payload->>'referred_by_reason',
    COALESCE(p_payload->>'contact_status', 'new')
  )
  ON CONFLICT (clinic_id, dedup_key) DO UPDATE SET
    referred_by         = COALESCE(EXCLUDED.referred_by,         public.b2b_candidates.referred_by),
    referred_by_contact = COALESCE(EXCLUDED.referred_by_contact, public.b2b_candidates.referred_by_contact),
    referred_by_reason  = COALESCE(EXCLUDED.referred_by_reason,  public.b2b_candidates.referred_by_reason),
    phone               = COALESCE(EXCLUDED.phone,               public.b2b_candidates.phone),
    instagram_handle    = COALESCE(EXCLUDED.instagram_handle,    public.b2b_candidates.instagram_handle),
    website             = COALESCE(EXCLUDED.website,             public.b2b_candidates.website),
    updated_at          = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;


-- ── RPC: retorna payload pronto pra avaliacao IA isolada ──
-- Usado pela edge function b2b-candidate-evaluate
CREATE OR REPLACE FUNCTION public.b2b_candidate_evaluate_payload(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_c         public.b2b_candidates%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM public.b2b_candidates
   WHERE clinic_id = v_clinic_id AND id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'candidate', jsonb_build_object(
      'id', v_c.id,
      'name', v_c.name,
      'category', v_c.category,
      'address', v_c.address,
      'phone', v_c.phone,
      'email', v_c.email,
      'instagram_handle', v_c.instagram_handle,
      'website', v_c.website,
      'referred_by', v_c.referred_by,
      'referred_by_reason', v_c.referred_by_reason,
      'google_rating', v_c.google_rating,
      'google_reviews', v_c.google_reviews
    )
  );
END $$;


-- ── RPC: aplica resultado de avaliacao IA ao candidato ──
CREATE OR REPLACE FUNCTION public.b2b_candidate_evaluate_apply(
  p_id uuid, p_result jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  UPDATE public.b2b_candidates SET
    dna_score         = COALESCE(NULLIF(p_result->>'dna_score','')::numeric, dna_score),
    dna_justification = COALESCE(p_result->>'dna_justification', dna_justification),
    fit_reasons       = COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_result->'fit_reasons')), fit_reasons),
    risk_flags        = COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_result->'risk_flags')), risk_flags),
    approach_message  = COALESCE(p_result->>'approach_message', approach_message),
    updated_at        = now()
  WHERE clinic_id = v_clinic_id AND id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;


GRANT EXECUTE ON FUNCTION public.b2b_candidate_add_manual(jsonb)            TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_candidate_evaluate_payload(uuid)       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_candidate_evaluate_apply(uuid, jsonb)  TO anon, authenticated, service_role;
