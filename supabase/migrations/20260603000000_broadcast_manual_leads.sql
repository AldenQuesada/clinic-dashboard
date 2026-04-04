-- ============================================================
-- Migration: Broadcast Manual Lead Selection
-- Permite selecionar leads especificos por ID alem dos filtros
-- ============================================================

-- 1. Coluna para armazenar IDs selecionados manualmente
ALTER TABLE wa_broadcasts ADD COLUMN IF NOT EXISTS selected_lead_ids text[] DEFAULT '{}';

-- 2. Recriar wa_broadcast_create com suporte a selected_lead_ids
CREATE OR REPLACE FUNCTION wa_broadcast_create(
  p_name               text,
  p_content            text,
  p_media_url          text DEFAULT NULL,
  p_media_caption      text DEFAULT NULL,
  p_target_filter      jsonb DEFAULT '{}',
  p_scheduled_at       timestamptz DEFAULT NULL,
  p_batch_size         int DEFAULT 10,
  p_batch_interval_min int DEFAULT 10,
  p_selected_lead_ids  text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_count      int := 0;
  v_filter_count int := 0;
  v_manual_count int := 0;
  v_id         uuid;
  v_where      text := 'clinic_id = $1 AND deleted_at IS NULL AND wa_opt_in = true';
  v_filter_key text;
  v_filter_val text;
  v_has_filters boolean := false;
BEGIN
  -- Construir WHERE baseado nos filtros
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

  -- Contar leads por filtro (se tem filtros)
  IF v_has_filters THEN
    EXECUTE format('SELECT count(*) FROM leads WHERE %s', v_where)
      INTO v_filter_count USING v_clinic_id;
  END IF;

  -- Contar leads manuais (se tem IDs selecionados)
  IF p_selected_lead_ids IS NOT NULL AND array_length(p_selected_lead_ids, 1) > 0 THEN
    SELECT count(*) INTO v_manual_count
    FROM leads
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND id = ANY(p_selected_lead_ids)
      AND phone IS NOT NULL AND phone != '';

    -- Se nao tem filtros, so conta manuais
    IF NOT v_has_filters THEN
      v_count := v_manual_count;
    ELSE
      -- Conta uniao (filtro + manuais, sem duplicatas)
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
    clinic_id, name, content, media_url, media_caption,
    target_filter, total_targets, scheduled_at,
    batch_size, batch_interval_min, selected_lead_ids
  ) VALUES (
    v_clinic_id, p_name, p_content, p_media_url, p_media_caption,
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


-- 3. Recriar wa_broadcast_start com suporte a selected_lead_ids
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
  v_has_filters boolean := false;
  v_has_manual  boolean := false;
  v_full_query text;
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

  -- Construir WHERE baseado nos filtros
  FOR v_filter_key, v_filter_val IN
    SELECT key, value #>> '{}' FROM jsonb_each(v_broadcast.target_filter)
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

  v_has_manual := v_broadcast.selected_lead_ids IS NOT NULL
    AND array_length(v_broadcast.selected_lead_ids, 1) > 0;

  -- Construir query final: UNION de filtro + manuais (ou so um deles)
  IF v_has_filters AND v_has_manual THEN
    v_full_query := format(
      'SELECT id, phone, created_at FROM leads WHERE %s AND phone IS NOT NULL AND phone != ''''
       UNION
       SELECT id, phone, created_at FROM leads WHERE clinic_id = $1 AND deleted_at IS NULL
         AND id = ANY($5) AND phone IS NOT NULL AND phone != ''''',
      v_where
    );
  ELSIF v_has_manual THEN
    v_full_query := 'SELECT id, phone, created_at FROM leads WHERE clinic_id = $1 AND deleted_at IS NULL
      AND id = ANY($5) AND phone IS NOT NULL AND phone != ''''';
  ELSE
    v_full_query := format(
      'SELECT id, phone, created_at FROM leads WHERE %s AND phone IS NOT NULL AND phone != ''''',
      v_where
    );
  END IF;

  -- Inserir no outbox com scheduled_at escalonado
  EXECUTE format(
    'INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, content_type, media_url, priority, broadcast_id, status, scheduled_at)
     SELECT
       $1,
       t.id,
       t.phone,
       $2,
       CASE WHEN $3 IS NOT NULL THEN ''image'' ELSE ''text'' END,
       $3,
       7,
       $4,
       ''pending'',
       now() + (((row_number() OVER (ORDER BY t.created_at) - 1) / $6) * ($7 || '' minutes'')::interval)
     FROM (%s) t',
    v_full_query
  ) USING v_clinic_id, v_broadcast.content, v_broadcast.media_url, p_broadcast_id,
          v_broadcast.selected_lead_ids, v_broadcast.batch_size, v_broadcast.batch_interval_min;

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
GRANT EXECUTE ON FUNCTION wa_broadcast_create(text, text, text, text, jsonb, timestamptz, int, int, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_broadcast_start(uuid) TO anon, authenticated;
