-- ============================================================
-- Migration: Broadcast Throttle (rate limiting)
-- Adiciona controle de lote e intervalo para disparos
-- ============================================================

-- 1. Novas colunas na tabela de broadcasts
ALTER TABLE wa_broadcasts ADD COLUMN IF NOT EXISTS batch_size int DEFAULT 10;
ALTER TABLE wa_broadcasts ADD COLUMN IF NOT EXISTS batch_interval_min int DEFAULT 10;

-- 2. Recriar wa_broadcast_create com suporte a throttle
CREATE OR REPLACE FUNCTION wa_broadcast_create(
  p_name              text,
  p_content           text,
  p_media_url         text DEFAULT NULL,
  p_media_caption     text DEFAULT NULL,
  p_target_filter     jsonb DEFAULT '{}',
  p_scheduled_at      timestamptz DEFAULT NULL,
  p_batch_size        int DEFAULT 10,
  p_batch_interval_min int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_count      int;
  v_id         uuid;
  v_where      text := 'clinic_id = $1 AND deleted_at IS NULL AND wa_opt_in = true';
  v_filter_key text;
  v_filter_val text;
BEGIN
  FOR v_filter_key, v_filter_val IN
    SELECT key, value #>> '{}' FROM jsonb_each(p_target_filter)
  LOOP
    IF v_filter_key = 'funnel' THEN
      v_where := v_where || format(' AND funnel = %L', v_filter_val);
    ELSIF v_filter_key = 'phase' THEN
      v_where := v_where || format(' AND phase = %L', v_filter_val);
    ELSIF v_filter_key = 'temperature' THEN
      v_where := v_where || format(' AND temperature = %L', v_filter_val);
    ELSIF v_filter_key = 'source_type' THEN
      v_where := v_where || format(' AND source_type = %L', v_filter_val);
    END IF;
  END LOOP;

  EXECUTE format('SELECT count(*) FROM leads WHERE %s', v_where)
    INTO v_count USING v_clinic_id;

  INSERT INTO wa_broadcasts (
    clinic_id, name, content, media_url, media_caption,
    target_filter, total_targets, scheduled_at,
    batch_size, batch_interval_min
  ) VALUES (
    v_clinic_id, p_name, p_content, p_media_url, p_media_caption,
    p_target_filter, v_count, p_scheduled_at,
    GREATEST(p_batch_size, 1), GREATEST(p_batch_interval_min, 1)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'total_targets', v_count
  );
END;
$$;


-- 3. Recriar wa_broadcast_start com scheduled_at escalonado
CREATE OR REPLACE FUNCTION wa_broadcast_start(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_broadcast  wa_broadcasts%ROWTYPE;
  v_where      text := 'clinic_id = $1 AND deleted_at IS NULL AND wa_opt_in = true';
  v_filter_key text;
  v_filter_val text;
  v_enqueued   int;
BEGIN
  SELECT * INTO v_broadcast
  FROM wa_broadcasts
  WHERE id = p_broadcast_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Broadcast nao encontrado');
  END IF;

  IF v_broadcast.status != 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Broadcast ja iniciado ou cancelado');
  END IF;

  FOR v_filter_key, v_filter_val IN
    SELECT key, value #>> '{}' FROM jsonb_each(v_broadcast.target_filter)
  LOOP
    IF v_filter_key = 'funnel' THEN
      v_where := v_where || format(' AND funnel = %L', v_filter_val);
    ELSIF v_filter_key = 'phase' THEN
      v_where := v_where || format(' AND phase = %L', v_filter_val);
    ELSIF v_filter_key = 'temperature' THEN
      v_where := v_where || format(' AND temperature = %L', v_filter_val);
    ELSIF v_filter_key = 'source_type' THEN
      v_where := v_where || format(' AND source_type = %L', v_filter_val);
    END IF;
  END LOOP;

  -- Inserir no outbox com scheduled_at escalonado por batch
  -- row_number() divide os leads em batches, cada batch espera N minutos a mais
  EXECUTE format(
    'INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, content_type, media_url, priority, broadcast_id, status, scheduled_at)
     SELECT
       $1,
       l.id,
       l.phone,
       $2,
       CASE WHEN $3 IS NOT NULL THEN ''image'' ELSE ''text'' END,
       $3,
       7,
       $4,
       ''pending'',
       now() + (((row_number() OVER (ORDER BY l.created_at) - 1) / $5) * ($6 || '' minutes'')::interval)
     FROM leads l
     WHERE %s
       AND l.phone IS NOT NULL
       AND l.phone != ''''',
    v_where
  ) USING v_clinic_id, v_broadcast.content, v_broadcast.media_url, p_broadcast_id,
          v_broadcast.batch_size, v_broadcast.batch_interval_min;

  GET DIAGNOSTICS v_enqueued = ROW_COUNT;

  UPDATE wa_broadcasts
  SET status = 'sending',
      started_at = now(),
      total_targets = v_enqueued
  WHERE id = p_broadcast_id;

  RETURN jsonb_build_object(
    'ok', true,
    'enqueued', v_enqueued,
    'batch_size', v_broadcast.batch_size,
    'batch_interval_min', v_broadcast.batch_interval_min,
    'estimated_minutes', CASE WHEN v_enqueued > 0
      THEN ((v_enqueued - 1) / v_broadcast.batch_size) * v_broadcast.batch_interval_min
      ELSE 0 END
  );
END;
$$;


-- Grants
GRANT EXECUTE ON FUNCTION wa_broadcast_create(text, text, text, text, jsonb, timestamptz, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_broadcast_start(uuid) TO anon, authenticated;
