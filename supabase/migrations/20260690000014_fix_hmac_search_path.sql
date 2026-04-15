-- ============================================================================
-- Fix: HMAC functions need extensions in search_path (pgcrypto vive la)
-- ============================================================================

CREATE OR REPLACE FUNCTION public._mag_verify_lead_hash(
  p_lead_id    uuid,
  p_edition_id uuid,
  p_hash       text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text := public._mag_current_hmac_secret();
  v_expected text;
BEGIN
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RETURN p_hash IS NULL OR length(p_hash) = 0;
  END IF;
  v_expected := encode(
    extensions.hmac(p_lead_id::text || p_edition_id::text, v_secret, 'sha256'),
    'hex'
  );
  RETURN v_expected = p_hash;
END $$;

CREATE OR REPLACE FUNCTION public.magazine_sign_lead_link(
  p_lead_id    uuid,
  p_edition_id uuid
)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text := public._mag_current_hmac_secret();
BEGIN
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE EXCEPTION 'magazine.hmac_secret nao configurado';
  END IF;
  RETURN encode(
    extensions.hmac(p_lead_id::text || p_edition_id::text, v_secret, 'sha256'),
    'hex'
  );
END $$;
