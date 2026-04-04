-- ============================================================
-- Migration: Broadcast Missing RPCs + media_position fix
-- Bug 1: wa_broadcast_leads (lista leads de um broadcast por segmento)
-- Bug 2: wa_broadcast_create com p_media_position
-- Bug 2: wa_broadcast_reschedule (editar broadcast agendado)
-- Bug 2: wa_broadcast_update (update parcial)
-- ============================================================

-- ============================================================
-- 1. DROP overloads antigos de wa_broadcast_create
-- ============================================================
DROP FUNCTION IF EXISTS wa_broadcast_create(text, text, text, text, jsonb, timestamptz);
DROP FUNCTION IF EXISTS wa_broadcast_create(text, text, text, text, jsonb, timestamptz, int, int, text[]);

-- ============================================================
-- 2. wa_broadcast_create — com p_media_position
-- ============================================================
CREATE OR REPLACE FUNCTION wa_broadcast_create(
  p_name               text,
  p_content            text,
  p_media_url          text DEFAULT NULL,
  p_media_caption      text DEFAULT NULL,
  p_target_filter      jsonb DEFAULT '{}',
  p_scheduled_at       timestamptz DEFAULT NULL,
  p_batch_size         int DEFAULT 10,
  p_batch_interval_min int DEFAULT 10,
  p_selected_lead_ids  text[] DEFAULT NULL,
  p_media_position     text DEFAULT 'above'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id    uuid := '00000000-0000-0000-0000-000000000001';
  v_count        int := 0;
  v_filter_count int := 0;
  v_manual_count int := 0;
  v_id           uuid;
  v_where        text := 'clinic_id = $1 AND deleted_at IS NULL AND wa_opt_in = true';
  v_filter_key   text;
  v_filter_val   text;
  v_has_filters  boolean := false;
BEGIN
  FOR v_filter_key, v_filter_val IN
    SELECT key, value #>> '{}' FROM jsonb_each(p_target_filter)
  LOOP
    v_has_filters := true;
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

  IF v_has_filters THEN
    EXECUTE format('SELECT count(*) FROM leads WHERE %s', v_where)
      INTO v_filter_count USING v_clinic_id;
  END IF;

  IF p_selected_lead_ids IS NOT NULL AND array_length(p_selected_lead_ids, 1) > 0 THEN
    SELECT count(*) INTO v_manual_count
    FROM leads
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND id = ANY(p_selected_lead_ids)
      AND phone IS NOT NULL AND phone != '';

    IF NOT v_has_filters THEN
      v_count := v_manual_count;
    ELSE
      EXECUTE format(
        'SELECT count(*) FROM (
          SELECT id FROM leads WHERE %s AND phone IS NOT NULL AND phone != ''''
          UNION
          SELECT id FROM leads WHERE clinic_id = $1 AND deleted_at IS NULL
            AND id = ANY($2) AND phone IS NOT NULL AND phone != ''''
        ) u', v_where
      ) INTO v_count USING v_clinic_id, p_selected_lead_ids;
    END IF;
  ELSE
    v_count := v_filter_count;
  END IF;

  INSERT INTO wa_broadcasts (
    clinic_id, name, content, media_url, media_caption, media_position,
    target_filter, total_targets, scheduled_at,
    batch_size, batch_interval_min, selected_lead_ids
  ) VALUES (
    v_clinic_id, p_name, p_content, p_media_url, p_media_caption,
    COALESCE(p_media_position, 'above'),
    p_target_filter, v_count, p_scheduled_at,
    GREATEST(p_batch_size, 1), GREATEST(p_batch_interval_min, 1),
    COALESCE(p_selected_lead_ids, '{}')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'total_targets', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wa_broadcast_create(text, text, text, text, jsonb, timestamptz, int, int, text[], text) TO anon, authenticated;


-- ============================================================
-- 3. wa_broadcast_reschedule — editar broadcast agendado (status=draft)
-- ============================================================
CREATE OR REPLACE FUNCTION wa_broadcast_reschedule(
  p_broadcast_id       uuid,
  p_name               text DEFAULT NULL,
  p_content            text DEFAULT NULL,
  p_media_url          text DEFAULT NULL,
  p_target_filter      jsonb DEFAULT NULL,
  p_scheduled_at       timestamptz DEFAULT NULL,
  p_batch_size         int DEFAULT NULL,
  p_batch_interval_min int DEFAULT NULL,
  p_selected_lead_ids  text[] DEFAULT NULL,
  p_media_position     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id   uuid := '00000000-0000-0000-0000-000000000001';
  v_broadcast   wa_broadcasts%ROWTYPE;
  v_count       int := 0;
  v_where       text;
  v_filter_key  text;
  v_filter_val  text;
  v_has_filters boolean := false;
  v_filter      jsonb;
  v_leads       text[];
BEGIN
  SELECT * INTO v_broadcast
  FROM wa_broadcasts
  WHERE id = p_broadcast_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Broadcast nao encontrado');
  END IF;

  IF v_broadcast.status != 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas broadcasts em rascunho podem ser editados');
  END IF;

  v_filter := COALESCE(p_target_filter, v_broadcast.target_filter);
  v_leads  := COALESCE(p_selected_lead_ids, v_broadcast.selected_lead_ids);

  -- Recontar leads
  v_where := 'clinic_id = $1 AND deleted_at IS NULL AND wa_opt_in = true';
  FOR v_filter_key, v_filter_val IN
    SELECT key, value #>> '{}' FROM jsonb_each(v_filter)
  LOOP
    v_has_filters := true;
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

  IF v_has_filters AND v_leads IS NOT NULL AND array_length(v_leads, 1) > 0 THEN
    EXECUTE format(
      'SELECT count(*) FROM (
        SELECT id FROM leads WHERE %s AND phone IS NOT NULL AND phone != ''''
        UNION
        SELECT id FROM leads WHERE clinic_id = $1 AND deleted_at IS NULL
          AND id = ANY($2) AND phone IS NOT NULL AND phone != ''''
      ) u', v_where
    ) INTO v_count USING v_clinic_id, v_leads;
  ELSIF v_leads IS NOT NULL AND array_length(v_leads, 1) > 0 THEN
    SELECT count(*) INTO v_count FROM leads
    WHERE clinic_id = v_clinic_id AND deleted_at IS NULL
      AND id = ANY(v_leads) AND phone IS NOT NULL AND phone != '';
  ELSIF v_has_filters THEN
    EXECUTE format('SELECT count(*) FROM leads WHERE %s AND phone IS NOT NULL AND phone != ''''', v_where)
      INTO v_count USING v_clinic_id;
  END IF;

  UPDATE wa_broadcasts SET
    name               = COALESCE(p_name, name),
    content            = COALESCE(p_content, content),
    media_url          = CASE WHEN p_media_url IS NOT NULL THEN p_media_url ELSE media_url END,
    target_filter      = v_filter,
    scheduled_at       = COALESCE(p_scheduled_at, scheduled_at),
    batch_size         = COALESCE(p_batch_size, batch_size),
    batch_interval_min = COALESCE(p_batch_interval_min, batch_interval_min),
    selected_lead_ids  = v_leads,
    media_position     = COALESCE(p_media_position, media_position),
    total_targets      = v_count
  WHERE id = p_broadcast_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_broadcast_id,
    'total_targets', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wa_broadcast_reschedule(uuid, text, text, text, jsonb, timestamptz, int, int, text[], text) TO anon, authenticated;


-- ============================================================
-- 4. wa_broadcast_update — update parcial (qualquer campo)
-- ============================================================
CREATE OR REPLACE FUNCTION wa_broadcast_update(
  p_broadcast_id       uuid,
  p_name               text DEFAULT NULL,
  p_content            text DEFAULT NULL,
  p_media_url          text DEFAULT NULL,
  p_media_caption      text DEFAULT NULL,
  p_target_filter      jsonb DEFAULT NULL,
  p_scheduled_at       timestamptz DEFAULT NULL,
  p_batch_size         int DEFAULT NULL,
  p_batch_interval_min int DEFAULT NULL,
  p_selected_lead_ids  text[] DEFAULT NULL,
  p_media_position     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_broadcast wa_broadcasts%ROWTYPE;
BEGIN
  SELECT * INTO v_broadcast
  FROM wa_broadcasts
  WHERE id = p_broadcast_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Broadcast nao encontrado');
  END IF;

  IF v_broadcast.status != 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas broadcasts em rascunho podem ser editados');
  END IF;

  UPDATE wa_broadcasts SET
    name               = COALESCE(p_name, name),
    content            = COALESCE(p_content, content),
    media_url          = CASE WHEN p_media_url IS NOT NULL THEN p_media_url ELSE media_url END,
    media_caption      = CASE WHEN p_media_caption IS NOT NULL THEN p_media_caption ELSE media_caption END,
    target_filter      = COALESCE(p_target_filter, target_filter),
    scheduled_at       = COALESCE(p_scheduled_at, scheduled_at),
    batch_size         = COALESCE(p_batch_size, batch_size),
    batch_interval_min = COALESCE(p_batch_interval_min, batch_interval_min),
    selected_lead_ids  = COALESCE(p_selected_lead_ids, selected_lead_ids),
    media_position     = COALESCE(p_media_position, media_position)
  WHERE id = p_broadcast_id;

  RETURN jsonb_build_object('ok', true, 'id', p_broadcast_id);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_broadcast_update(uuid, text, text, text, text, jsonb, timestamptz, int, int, text[], text) TO anon, authenticated;


-- ============================================================
-- 5. wa_broadcast_leads — lista leads de um broadcast por segmento
-- ============================================================
CREATE OR REPLACE FUNCTION wa_broadcast_leads(
  p_broadcast_id uuid,
  p_segment      text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_result    jsonb;
BEGIN
  -- Verificar se broadcast existe
  IF NOT EXISTS (
    SELECT 1 FROM wa_broadcasts WHERE id = p_broadcast_id AND clinic_id = v_clinic_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Broadcast nao encontrado');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      l.id,
      l.name,
      l.phone,
      l.phase,
      l.temperature,
      l.source_type,
      o.status AS outbox_status,
      o.sent_at,
      o.delivered_at,
      o.read_at
    FROM wa_outbox o
    JOIN leads l ON l.id = o.lead_id
    WHERE o.broadcast_id = p_broadcast_id
      AND o.clinic_id = v_clinic_id
      AND (
        p_segment = 'all'
        OR (p_segment = 'sent' AND o.status = 'sent')
        OR (p_segment = 'failed' AND o.status = 'failed')
        OR (p_segment = 'pending' AND o.status IN ('pending', 'processing'))
        OR (p_segment = 'delivered' AND o.delivered_at IS NOT NULL)
        OR (p_segment = 'read' AND o.read_at IS NOT NULL)
      )
  ) t;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_broadcast_leads(uuid, text) TO anon, authenticated;
