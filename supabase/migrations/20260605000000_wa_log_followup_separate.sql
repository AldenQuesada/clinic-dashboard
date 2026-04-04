-- ============================================================
-- Migration: Add follow-up as separate message in sequential log
-- ============================================================

CREATE OR REPLACE FUNCTION wa_log_message_sequential(
  p_phone text,
  p_lead_id text DEFAULT NULL,
  p_user_message text DEFAULT '',
  p_ai_response text DEFAULT '',
  p_tokens_used int DEFAULT 0,
  p_tags text DEFAULT '[]',
  p_persona text DEFAULT 'onboarder',
  p_detected_name text DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL,
  p_photo_urls text[] DEFAULT NULL,
  p_photo_captions text[] DEFAULT NULL,
  p_follow_up text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_conv_id uuid;
  v_lead_id text;
  v_base_time timestamptz := now();
  v_tags text[];
  v_i int;
  v_offset int := 2; -- next available offset after outbound text (1s)
BEGIN
  v_conv_id := p_conversation_id;
  v_lead_id := p_lead_id;

  IF v_conv_id IS NULL THEN
    SELECT id INTO v_conv_id
    FROM wa_conversations
    WHERE clinic_id = v_clinic_id AND phone = p_phone AND status = 'active'
    LIMIT 1;
  END IF;

  IF v_conv_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conversation not found');
  END IF;

  -- Parse tags
  BEGIN
    SELECT array_agg(t::text) INTO v_tags
    FROM jsonb_array_elements_text(p_tags::jsonb) t;
  EXCEPTION WHEN OTHERS THEN
    v_tags := '{}';
  END;

  -- 1. Log INBOUND (user message) — base time
  IF p_user_message IS NOT NULL AND p_user_message != '' THEN
    INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, content_type, ai_generated, sent_at)
    VALUES (v_conv_id, v_clinic_id, 'inbound', 'lead', p_user_message, 'text', false, v_base_time);
  END IF;

  -- 2. Log OUTBOUND (AI response) — base time + 1 second
  IF p_ai_response IS NOT NULL AND p_ai_response != '' THEN
    INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, content_type, ai_generated, ai_model, ai_tokens_used, sent_at)
    VALUES (v_conv_id, v_clinic_id, 'outbound', 'lara', p_ai_response, 'text', true, 'claude-sonnet-4-20250514', p_tokens_used, v_base_time + interval '1 second');
  END IF;

  -- 3. Log PHOTOS — base time + 2, 3, 4... seconds
  IF p_photo_urls IS NOT NULL AND array_length(p_photo_urls, 1) > 0 THEN
    FOR v_i IN 1..array_length(p_photo_urls, 1) LOOP
      INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, content_type, media_url, ai_generated, sent_at)
      VALUES (
        v_conv_id, v_clinic_id, 'outbound', 'lara',
        COALESCE(p_photo_captions[v_i], 'Resultado real - Dra. Mirian de Paula'),
        'image',
        p_photo_urls[v_i],
        true,
        v_base_time + ((v_i + 1) * interval '1 second')
      );
    END LOOP;
    v_offset := v_offset + array_length(p_photo_urls, 1);
  END IF;

  -- 4. Log FOLLOW-UP as separate message — after photos
  IF p_follow_up IS NOT NULL AND p_follow_up != '' THEN
    INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, content_type, ai_generated, sent_at)
    VALUES (v_conv_id, v_clinic_id, 'outbound', 'lara', p_follow_up, 'text', true, v_base_time + (v_offset * interval '1 second'));
  END IF;

  -- Update conversation metadata
  UPDATE wa_conversations
  SET last_message_at = v_base_time + interval '1 second',
      last_ai_msg = v_base_time + interval '1 second',
      last_lead_msg = CASE WHEN p_user_message != '' THEN v_base_time ELSE last_lead_msg END,
      updated_at = now()
  WHERE id = v_conv_id;

  -- Update tags if any
  IF v_tags IS NOT NULL AND array_length(v_tags, 1) > 0 THEN
    UPDATE wa_conversations
    SET tags = (SELECT array_agg(DISTINCT t) FROM unnest(tags || v_tags) t)
    WHERE id = v_conv_id;
  END IF;

  -- Update lead name if detected
  IF p_detected_name IS NOT NULL AND p_detected_name != '' THEN
    UPDATE leads SET name = p_detected_name, updated_at = now()
    WHERE id = v_lead_id AND (name IS NULL OR name = '' OR name = 'Desconhecido');

    UPDATE wa_conversations SET display_name = p_detected_name
    WHERE id = v_conv_id AND (display_name IS NULL OR display_name = '' OR display_name = 'Desconhecido');
  END IF;

  RETURN jsonb_build_object('ok', true, 'conversation_id', v_conv_id, 'photos_logged', COALESCE(array_length(p_photo_urls, 1), 0));
END;
$$;

GRANT EXECUTE ON FUNCTION wa_log_message_sequential(text, text, text, text, int, text, text, text, uuid, text[], text[], text) TO anon, authenticated;
