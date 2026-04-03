-- ============================================================
-- Migration: Processador de outbox
-- RPC que busca msgs pendentes e marca como processing
-- ============================================================

CREATE OR REPLACE FUNCTION wa_outbox_fetch_pending(p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_result    jsonb;
  v_ids       uuid[];
BEGIN
  -- Buscar e marcar como processing atomicamente
  WITH pending AS (
    SELECT id, phone, content, template_id, conversation_id
    FROM wa_outbox
    WHERE clinic_id = v_clinic_id
      AND status = 'pending'
      AND (scheduled_at IS NULL OR scheduled_at <= now())
      AND attempts < max_attempts
    ORDER BY priority ASC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE wa_outbox
    SET status = 'processing', attempts = attempts + 1, processed_at = now()
    WHERE id IN (SELECT id FROM pending)
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM updated;

  -- Retornar detalhes
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'phone', o.phone,
      'content', o.content,
      'conversation_id', o.conversation_id
    )
  ), '[]'::jsonb)
  INTO v_result
  FROM wa_outbox o
  WHERE o.id = ANY(COALESCE(v_ids, '{}'));

  RETURN v_result;
END;
$$;

-- Marcar como enviado
CREATE OR REPLACE FUNCTION wa_outbox_mark_sent(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE wa_outbox SET status = 'sent', processed_at = now() WHERE id = p_id;
END;
$$;

-- Marcar como falho
CREATE OR REPLACE FUNCTION wa_outbox_mark_failed(p_id uuid, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE wa_outbox
  SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
      error_message = p_error,
      processed_at = now()
  WHERE id = p_id;
END;
$$;
