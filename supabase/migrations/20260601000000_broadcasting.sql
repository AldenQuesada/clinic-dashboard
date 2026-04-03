-- ============================================================
-- Migration: Broadcasting (Mass Messaging) System
-- Tabela de campanhas de disparo em massa + RPCs
-- ============================================================

-- 1. Tabela de broadcasts
CREATE TABLE IF NOT EXISTS wa_broadcasts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name            text NOT NULL,
  content         text NOT NULL,
  media_url       text,
  media_caption   text,
  target_filter   jsonb DEFAULT '{}',
  total_targets   int DEFAULT 0,
  sent_count      int DEFAULT 0,
  failed_count    int DEFAULT 0,
  status          text DEFAULT 'draft',
  scheduled_at    timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE wa_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_broadcasts_clinic" ON wa_broadcasts
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Constraint de status
ALTER TABLE wa_broadcasts
  ADD CONSTRAINT chk_wa_broadcasts_status
    CHECK (status IN ('draft', 'sending', 'completed', 'cancelled'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wa_broadcasts_status ON wa_broadcasts (status);
CREATE INDEX IF NOT EXISTS idx_wa_broadcasts_created ON wa_broadcasts (created_at DESC);

-- 2. Adicionar broadcast_id no outbox para rastreio
ALTER TABLE wa_outbox ADD COLUMN IF NOT EXISTS broadcast_id uuid REFERENCES wa_broadcasts(id);
CREATE INDEX IF NOT EXISTS idx_wa_outbox_broadcast ON wa_outbox (broadcast_id) WHERE broadcast_id IS NOT NULL;


-- ============================================================
-- RPC: wa_broadcast_create
-- Conta leads que correspondem ao filtro e cria o registro
-- ============================================================
CREATE OR REPLACE FUNCTION wa_broadcast_create(
  p_name          text,
  p_content       text,
  p_media_url     text DEFAULT NULL,
  p_media_caption text DEFAULT NULL,
  p_target_filter jsonb DEFAULT '{}',
  p_scheduled_at  timestamptz DEFAULT NULL
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
  -- Construir WHERE dinamico baseado no target_filter
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

  -- Contar leads que correspondem
  EXECUTE format('SELECT count(*) FROM leads WHERE %s', v_where)
    INTO v_count USING v_clinic_id;

  -- Criar broadcast
  INSERT INTO wa_broadcasts (
    clinic_id, name, content, media_url, media_caption,
    target_filter, total_targets, scheduled_at
  ) VALUES (
    v_clinic_id, p_name, p_content, p_media_url, p_media_caption,
    p_target_filter, v_count, p_scheduled_at
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'total_targets', v_count
  );
END;
$$;


-- ============================================================
-- RPC: wa_broadcast_start
-- Enfileira mensagens no outbox para cada lead correspondente
-- ============================================================
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
  -- Buscar broadcast
  SELECT * INTO v_broadcast
  FROM wa_broadcasts
  WHERE id = p_broadcast_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Broadcast nao encontrado');
  END IF;

  IF v_broadcast.status != 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Broadcast ja iniciado ou cancelado');
  END IF;

  -- Construir WHERE dinamico
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

  -- Inserir no outbox para cada lead correspondente
  EXECUTE format(
    'INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, content_type, media_url, priority, broadcast_id, status)
     SELECT
       $1,
       l.id,
       l.phone,
       $2,
       CASE WHEN $3 IS NOT NULL THEN ''image'' ELSE ''text'' END,
       $3,
       7,
       $4,
       ''pending''
     FROM leads l
     WHERE %s
       AND l.phone IS NOT NULL
       AND l.phone != ''''',
    v_where
  ) USING v_clinic_id, v_broadcast.content, v_broadcast.media_url, p_broadcast_id;

  GET DIAGNOSTICS v_enqueued = ROW_COUNT;

  -- Atualizar broadcast
  UPDATE wa_broadcasts
  SET status = 'sending',
      started_at = now(),
      total_targets = v_enqueued
  WHERE id = p_broadcast_id;

  RETURN jsonb_build_object(
    'ok', true,
    'enqueued', v_enqueued
  );
END;
$$;


-- ============================================================
-- RPC: wa_broadcast_list
-- Lista todos os broadcasts ordenados por data de criacao
-- ============================================================
CREATE OR REPLACE FUNCTION wa_broadcast_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_result    jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'content', b.content,
      'media_url', b.media_url,
      'media_caption', b.media_caption,
      'target_filter', b.target_filter,
      'total_targets', b.total_targets,
      'sent_count', b.sent_count,
      'failed_count', b.failed_count,
      'status', b.status,
      'scheduled_at', b.scheduled_at,
      'started_at', b.started_at,
      'completed_at', b.completed_at,
      'created_at', b.created_at
    ) ORDER BY b.created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM wa_broadcasts b
  WHERE b.clinic_id = v_clinic_id;

  RETURN v_result;
END;
$$;


-- ============================================================
-- RPC: wa_broadcast_cancel
-- Cancela broadcast e remove mensagens pendentes do outbox
-- ============================================================
CREATE OR REPLACE FUNCTION wa_broadcast_cancel(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_broadcast wa_broadcasts%ROWTYPE;
  v_removed   int;
BEGIN
  SELECT * INTO v_broadcast
  FROM wa_broadcasts
  WHERE id = p_broadcast_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Broadcast nao encontrado');
  END IF;

  IF v_broadcast.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Broadcast ja foi concluido');
  END IF;

  IF v_broadcast.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Broadcast ja foi cancelado');
  END IF;

  -- Remover msgs pendentes do outbox
  DELETE FROM wa_outbox
  WHERE broadcast_id = p_broadcast_id
    AND clinic_id = v_clinic_id
    AND status IN ('pending', 'processing');

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  -- Marcar como cancelado
  UPDATE wa_broadcasts
  SET status = 'cancelled',
      completed_at = now()
  WHERE id = p_broadcast_id;

  RETURN jsonb_build_object(
    'ok', true,
    'removed_from_outbox', v_removed
  );
END;
$$;


-- Grants
GRANT EXECUTE ON FUNCTION wa_broadcast_create(text, text, text, text, jsonb, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_broadcast_start(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_broadcast_list() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_broadcast_cancel(uuid) TO anon, authenticated;
