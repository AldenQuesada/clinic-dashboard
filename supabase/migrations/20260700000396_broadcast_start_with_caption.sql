-- =====================================================================
-- Broadcast Start: Propagate media_caption to wa_outbox
-- =====================================================================
-- Bug: wa_broadcast_start populava wa_outbox com content + media_url mas
-- nunca copiava media_caption do wa_broadcasts pro wa_outbox. O n8n/Lara
-- nao recebia a legenda da imagem.
--
-- Fix: INSERT agora inclui media_caption vindo de v_broadcast.media_caption.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.wa_broadcast_start(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_broadcast wa_broadcasts%ROWTYPE;
  v_where text := 'clinic_id = $1 AND deleted_at IS NULL AND wa_opt_in = true';
  v_filter_key text; v_filter_val text;
  v_enqueued int;
  v_has_filters boolean := false;
  v_has_manual boolean := false;
  v_full_query text;
  v_start_time timestamptz;
BEGIN
  SELECT * INTO v_broadcast FROM wa_broadcasts WHERE id = p_broadcast_id AND clinic_id = v_clinic_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Broadcast nao encontrado'); END IF;
  IF v_broadcast.status != 'draft' THEN RETURN jsonb_build_object('ok', false, 'error', 'Broadcast ja iniciado ou cancelado'); END IF;

  -- Use scheduled_at if in the future, otherwise now
  v_start_time := GREATEST(now(), COALESCE(v_broadcast.scheduled_at, now()));

  FOR v_filter_key, v_filter_val IN SELECT key, value #>> '{}' FROM jsonb_each(v_broadcast.target_filter) LOOP
    v_has_filters := true;
    IF v_filter_key = 'funnel' THEN v_where := v_where || format(' AND funnel = %L', v_filter_val);
    ELSIF v_filter_key = 'phase' THEN v_where := v_where || format(' AND phase = %L', v_filter_val);
    ELSIF v_filter_key = 'temperature' THEN v_where := v_where || format(' AND temperature = %L', v_filter_val);
    ELSIF v_filter_key = 'source_type' THEN v_where := v_where || format(' AND source_type = %L', v_filter_val);
    END IF;
  END LOOP;

  v_has_manual := v_broadcast.selected_lead_ids IS NOT NULL AND array_length(v_broadcast.selected_lead_ids, 1) > 0;

  IF v_has_filters AND v_has_manual THEN
    v_full_query := format('SELECT id, phone, created_at FROM leads WHERE %s AND phone IS NOT NULL AND phone != ''''
      UNION SELECT id, phone, created_at FROM leads WHERE clinic_id = $1 AND deleted_at IS NULL AND id = ANY($5) AND phone IS NOT NULL AND phone != ''''', v_where);
  ELSIF v_has_manual THEN
    v_full_query := 'SELECT id, phone, created_at FROM leads WHERE clinic_id = $1 AND deleted_at IS NULL AND id = ANY($5) AND phone IS NOT NULL AND phone != ''''';
  ELSE
    v_full_query := format('SELECT id, phone, created_at FROM leads WHERE %s AND phone IS NOT NULL AND phone != ''''', v_where);
  END IF;

  EXECUTE format(
    'INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, content_type, media_url, media_caption, priority, broadcast_id, status, scheduled_at)
     SELECT $1, t.id, t.phone, $2,
       CASE WHEN $3 IS NOT NULL THEN ''image'' ELSE ''text'' END,
       $3, $9, 7, $4, ''pending'',
       $8 + (((row_number() OVER (ORDER BY t.created_at) - 1) / $6) * ($7 || '' minutes'')::interval)
     FROM (%s) t', v_full_query
  ) USING v_clinic_id, v_broadcast.content, v_broadcast.media_url, p_broadcast_id,
          v_broadcast.selected_lead_ids, v_broadcast.batch_size, v_broadcast.batch_interval_min, v_start_time,
          v_broadcast.media_caption;

  GET DIAGNOSTICS v_enqueued = ROW_COUNT;

  UPDATE wa_broadcasts SET status = 'sending', started_at = now(), total_targets = v_enqueued WHERE id = p_broadcast_id;

  RETURN jsonb_build_object('ok', true, 'enqueued', v_enqueued, 'batch_size', v_broadcast.batch_size,
    'batch_interval_min', v_broadcast.batch_interval_min,
    'scheduled_for', v_start_time,
    'estimated_minutes', CASE WHEN v_enqueued > 0 THEN ((v_enqueued - 1) / v_broadcast.batch_size) * v_broadcast.batch_interval_min ELSE 0 END);
END; $function$;

COMMENT ON FUNCTION public.wa_broadcast_start(uuid) IS
  'Inicia broadcast: popula wa_outbox com content+media_url+media_caption do wa_broadcasts. Respeita scheduled_at, batch_size e batch_interval_min.';
