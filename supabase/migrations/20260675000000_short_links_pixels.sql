-- ============================================================
-- Short Links — Pixels & Tags tracking
-- Adiciona coluna pixels (jsonb) para rastreamento por link
-- ============================================================

-- 1. Adicionar coluna pixels
ALTER TABLE short_links
ADD COLUMN IF NOT EXISTS pixels jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN short_links.pixels IS 'Pixel/tag config por link: meta_pixel_id, google_ads_id, google_analytics_id, tiktok_pixel_id, custom_head';

-- 2. Recriar RPC short_link_create com suporte a pixels
CREATE OR REPLACE FUNCTION short_link_create(
  p_code   text,
  p_url    text,
  p_title  text DEFAULT NULL,
  p_pixels jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := ((current_setting('request.jwt.claims',true))::jsonb ->> 'clinic_id')::uuid;

  INSERT INTO short_links (clinic_id, code, url, title, pixels)
  VALUES (v_clinic_id, p_code, p_url, p_title, COALESCE(p_pixels, '{}'::jsonb));

  RETURN jsonb_build_object('ok', true, 'code', p_code);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'code_exists');
END;
$$;

GRANT EXECUTE ON FUNCTION short_link_create(text, text, text, jsonb) TO authenticated;

-- 3. Recriar RPC short_link_list retornando pixels
CREATE OR REPLACE FUNCTION short_link_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := ((current_setting('request.jwt.claims',true))::jsonb ->> 'clinic_id')::uuid;

  RETURN (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'code',   sl.code,
        'url',    sl.url,
        'title',  sl.title,
        'clicks', sl.clicks,
        'pixels', COALESCE(sl.pixels, '{}'::jsonb),
        'created_at', sl.created_at
      ) ORDER BY sl.created_at DESC
    ), '[]'::jsonb)
    FROM short_links sl
    WHERE sl.clinic_id = v_clinic_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION short_link_list() TO authenticated;

-- 4. RPC para atualizar pixels de um link existente
CREATE OR REPLACE FUNCTION short_link_update_pixels(
  p_code   text,
  p_pixels jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_found boolean;
BEGIN
  v_clinic_id := ((current_setting('request.jwt.claims',true))::jsonb ->> 'clinic_id')::uuid;

  UPDATE short_links
  SET pixels = COALESCE(p_pixels, '{}'::jsonb)
  WHERE code = p_code AND clinic_id = v_clinic_id
  RETURNING true INTO v_found;

  IF v_found IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION short_link_update_pixels(text, jsonb) TO authenticated;

-- 5. Atualizar RPC de tracking para retornar pixels tambem
CREATE OR REPLACE FUNCTION wa_birthday_track_link_open(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_pixels jsonb;
  v_campaign_id uuid;
BEGIN
  UPDATE short_links SET clicks = clicks + 1
  WHERE code = p_code
  RETURNING url, COALESCE(pixels, '{}'::jsonb) INTO v_url, v_pixels;

  IF v_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'link not found');
  END IF;

  -- Track birthday campaign open if applicable
  UPDATE wa_birthday_campaigns
  SET link_opened_at = NOW()
  WHERE link_code = p_code
    AND link_opened_at IS NULL
  RETURNING id INTO v_campaign_id;

  RETURN jsonb_build_object(
    'ok', true,
    'url', v_url,
    'pixels', v_pixels,
    'tracked', v_campaign_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_track_link_open(text) TO anon, authenticated;
