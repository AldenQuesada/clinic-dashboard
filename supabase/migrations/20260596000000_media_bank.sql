-- Media bank for before/after images
CREATE TABLE IF NOT EXISTS wa_media_bank (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  filename    text NOT NULL,
  url         text NOT NULL,
  category    text NOT NULL DEFAULT 'before_after',
  funnel      text,              -- fullface, procedimentos
  queixas     text[] DEFAULT '{}', -- olheiras, sulcos, flacidez, etc
  phase       text,              -- which playbook phase to use in
  caption     text,              -- optional caption
  is_active   boolean DEFAULT true,
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE wa_media_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_media_clinic" ON wa_media_bank FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- RPC to get images by queixa and funnel
CREATE OR REPLACE FUNCTION wa_get_media(
  p_funnel text DEFAULT NULL,
  p_queixa text DEFAULT NULL,
  p_phase text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'url', m.url,
      'filename', m.filename,
      'queixas', m.queixas,
      'funnel', m.funnel,
      'phase', m.phase,
      'caption', m.caption
    ) ORDER BY m.sort_order
  ), '[]'::jsonb)
  INTO v_result
  FROM wa_media_bank m
  WHERE m.is_active = true
    AND (p_funnel IS NULL OR m.funnel = p_funnel OR m.funnel IS NULL)
    AND (p_queixa IS NULL OR p_queixa = ANY(m.queixas) OR m.queixas = '{}')
    AND (p_phase IS NULL OR m.phase = p_phase OR m.phase IS NULL);

  RETURN v_result;
END;
$$;
