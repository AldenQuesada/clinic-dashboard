-- ============================================================
-- Fix: Add media_url to wa_inbox_conversation RPC
-- Para que fotos aparecam no inbox do dashboard
-- ============================================================

CREATE OR REPLACE FUNCTION wa_inbox_conversation(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_conv       wa_conversations%ROWTYPE;
  v_lead       jsonb;
  v_messages   jsonb;
BEGIN
  -- Buscar conversa
  SELECT * INTO v_conv
  FROM wa_conversations
  WHERE id = p_conversation_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Conversa nao encontrada');
  END IF;

  -- Buscar lead
  SELECT jsonb_build_object(
    'id',    l.id,
    'name',  l.name,
    'phone', l.phone,
    'phase', l.phase,
    'temperature', l.temperature
  ) INTO v_lead
  FROM leads l
  WHERE l.phone = v_conv.phone AND l.clinic_id = v_clinic_id
  LIMIT 1;

  -- Buscar ultimas 50 mensagens com media_url
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',           m.id,
      'direction',    m.direction,
      'sender',       m.sender,
      'content',      m.content,
      'content_type', m.content_type,
      'media_url',    m.media_url,
      'ai_generated', m.ai_generated,
      'sent_at',      m.sent_at
    ) ORDER BY m.sent_at ASC
  ), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT id, direction, sender, content, content_type, media_url, ai_generated, sent_at
    FROM wa_messages
    WHERE conversation_id = p_conversation_id
    ORDER BY sent_at DESC
    LIMIT 50
  ) m;

  RETURN jsonb_build_object(
    'conversation', jsonb_build_object(
      'id',         v_conv.id,
      'phone',      v_conv.phone,
      'status',     v_conv.status,
      'ai_enabled', v_conv.ai_enabled,
      'ai_persona', v_conv.ai_persona,
      'created_at', v_conv.created_at
    ),
    'lead', COALESCE(v_lead, '{}'::jsonb),
    'messages', v_messages
  );
END;
$$;
