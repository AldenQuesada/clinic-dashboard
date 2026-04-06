-- ============================================================
-- Facial Analysis: sessions, photos, annotations
-- Stores processed photos (bg removed) to avoid re-processing
-- ============================================================

-- Photos cache: stores bg-removed photos to avoid paying twice
CREATE TABLE IF NOT EXISTS facial_photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE,
  lead_id uuid,
  angle text NOT NULL,              -- 'front', '45', 'lateral', 'after', 'sim'
  original_hash text NOT NULL,      -- SHA256 of original photo (dedup key)
  photo_b64 text NOT NULL,          -- base64 of processed (bg removed) photo
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facial_photos_hash ON facial_photos(original_hash);
CREATE INDEX IF NOT EXISTS idx_facial_photos_lead ON facial_photos(lead_id);

-- Facial analysis sessions: full session data per lead
CREATE TABLE IF NOT EXISTS facial_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  session_data jsonb NOT NULL,       -- annotations, vectors, tercoLines, rickettsPoints, editorMode
  gpt_analysis jsonb,                -- GPT Vision analysis result
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facial_sessions_lead ON facial_sessions(lead_id);

-- RPC: save or update a facial photo (upsert by hash)
CREATE OR REPLACE FUNCTION upsert_facial_photo(
  p_clinic_id uuid,
  p_lead_id uuid,
  p_angle text,
  p_hash text,
  p_photo_b64 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Check if already exists (cache hit)
  SELECT id INTO v_id FROM facial_photos WHERE original_hash = p_hash LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'cached', true);
  END IF;

  -- Insert new
  INSERT INTO facial_photos (clinic_id, lead_id, angle, original_hash, photo_b64)
  VALUES (p_clinic_id, p_lead_id, p_angle, p_hash, p_photo_b64)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'cached', false);
END;
$$;

-- RPC: get cached photo by hash
CREATE OR REPLACE FUNCTION get_facial_photo(p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row facial_photos%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM facial_photos WHERE original_hash = p_hash LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'found', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'found', true, 'photo_b64', v_row.photo_b64, 'angle', v_row.angle);
END;
$$;

-- RPC: save facial session
CREATE OR REPLACE FUNCTION upsert_facial_session(
  p_clinic_id uuid,
  p_lead_id uuid,
  p_session_data jsonb,
  p_gpt_analysis jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Upsert: one session per lead (latest wins)
  SELECT id INTO v_id FROM facial_sessions WHERE lead_id = p_lead_id ORDER BY updated_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE facial_sessions
    SET session_data = p_session_data,
        gpt_analysis = COALESCE(p_gpt_analysis, gpt_analysis),
        updated_at = now()
    WHERE id = v_id;
  ELSE
    INSERT INTO facial_sessions (clinic_id, lead_id, session_data, gpt_analysis)
    VALUES (p_clinic_id, p_lead_id, p_session_data, p_gpt_analysis)
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- RPC: load facial session for a lead
CREATE OR REPLACE FUNCTION get_facial_session(p_lead_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row facial_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM facial_sessions WHERE lead_id = p_lead_id ORDER BY updated_at DESC LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'found', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'found', true, 'session_data', v_row.session_data, 'gpt_analysis', v_row.gpt_analysis, 'updated_at', v_row.updated_at);
END;
$$;
