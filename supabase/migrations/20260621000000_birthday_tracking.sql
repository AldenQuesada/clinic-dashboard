-- ============================================================
-- Birthday Campaign Tracking — 2026-04-05
-- Campos link_opened_at e page_landed_at + RPCs de tracking
-- ============================================================

ALTER TABLE wa_birthday_campaigns
ADD COLUMN IF NOT EXISTS link_opened_at timestamptz,
ADD COLUMN IF NOT EXISTS page_landed_at timestamptz;

-- RPC: track link open (chamada pelo r.html)
CREATE OR REPLACE FUNCTION wa_birthday_track_link_open(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_campaign_id uuid;
BEGIN
  UPDATE short_links SET clicks = clicks + 1
  WHERE code = p_code
  RETURNING url INTO v_url;

  IF v_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'link not found');
  END IF;

  IF p_code = 'niver' OR v_url LIKE '%aniversario%' THEN
    SELECT id INTO v_campaign_id
    FROM wa_birthday_campaigns
    WHERE status = 'responded'
      AND link_opened_at IS NULL
    ORDER BY responded_at DESC
    LIMIT 1;

    IF v_campaign_id IS NOT NULL THEN
      UPDATE wa_birthday_campaigns
      SET link_opened_at = now()
      WHERE id = v_campaign_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'url', v_url, 'tracked', v_campaign_id IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_track_link_open(text) TO anon, authenticated;

-- RPC: track page land (chamada pelo aniversario.html)
CREATE OR REPLACE FUNCTION wa_birthday_track_page_land(p_phone text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  IF p_phone IS NOT NULL AND p_phone != '' THEN
    SELECT id INTO v_campaign_id
    FROM wa_birthday_campaigns
    WHERE lead_phone LIKE '%' || right(p_phone, 11)
      AND status = 'responded'
      AND page_landed_at IS NULL
    ORDER BY responded_at DESC
    LIMIT 1;
  ELSE
    SELECT id INTO v_campaign_id
    FROM wa_birthday_campaigns
    WHERE status = 'responded'
      AND link_opened_at IS NOT NULL
      AND page_landed_at IS NULL
    ORDER BY link_opened_at DESC
    LIMIT 1;
  END IF;

  IF v_campaign_id IS NOT NULL THEN
    UPDATE wa_birthday_campaigns
    SET page_landed_at = now()
    WHERE id = v_campaign_id;
    RETURN jsonb_build_object('ok', true, 'tracked', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'tracked', false);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_track_page_land(text) TO anon, authenticated;
