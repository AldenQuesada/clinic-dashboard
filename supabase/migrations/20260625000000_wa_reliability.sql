-- ============================================================
-- Reliability Layer: Log de erros + health check
-- NAO altera normalizacao de phone — apenas observabilidade
-- ============================================================

-- 1. Tabela de erros do WhatsApp pipeline
CREATE TABLE IF NOT EXISTS wa_errors (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  source      text NOT NULL,          -- 'n8n', 'evolution', 'rpc', 'inbox_send', 'broadcast'
  error_type  text NOT NULL,          -- 'rpc_failed', 'evolution_timeout', 'send_failed', etc
  phone       text,
  payload     jsonb,                  -- dados da mensagem que falhou
  error_msg   text,
  resolved    boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_errors_recent ON wa_errors (created_at DESC) WHERE NOT resolved;
CREATE INDEX IF NOT EXISTS idx_wa_errors_source ON wa_errors (source, created_at DESC);

-- RLS
ALTER TABLE wa_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_errors_clinic" ON wa_errors FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001');

-- 2. RPC para logar erro (chamada pelo frontend e n8n)
CREATE OR REPLACE FUNCTION wa_log_error(
  p_source     text,
  p_error_type text,
  p_phone      text DEFAULT NULL,
  p_payload    jsonb DEFAULT NULL,
  p_error_msg  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO wa_errors (source, error_type, phone, payload, error_msg)
  VALUES (p_source, p_error_type, p_phone, p_payload, p_error_msg)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'error_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_log_error(text, text, text, jsonb, text) TO anon, authenticated;

-- 3. RPC health check — retorna metricas das ultimas 24h
CREATE OR REPLACE FUNCTION wa_health_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_inbound_24h int;
  v_outbound_24h int;
  v_errors_24h int;
  v_errors_unresolved int;
  v_last_inbound timestamptz;
  v_last_outbound timestamptz;
  v_conversations_active int;
  v_pending_msgs int;
  v_failed_msgs int;
BEGIN
  -- Mensagens ultimas 24h
  SELECT
    COUNT(*) FILTER (WHERE direction = 'inbound'),
    COUNT(*) FILTER (WHERE direction = 'outbound')
  INTO v_inbound_24h, v_outbound_24h
  FROM wa_messages
  WHERE clinic_id = v_clinic_id
    AND sent_at > now() - interval '24 hours';

  -- Erros ultimas 24h
  SELECT COUNT(*) INTO v_errors_24h
  FROM wa_errors
  WHERE clinic_id = v_clinic_id
    AND created_at > now() - interval '24 hours';

  SELECT COUNT(*) INTO v_errors_unresolved
  FROM wa_errors
  WHERE clinic_id = v_clinic_id
    AND NOT resolved;

  -- Ultima mensagem
  SELECT MAX(sent_at) INTO v_last_inbound
  FROM wa_messages
  WHERE clinic_id = v_clinic_id AND direction = 'inbound';

  SELECT MAX(sent_at) INTO v_last_outbound
  FROM wa_messages
  WHERE clinic_id = v_clinic_id AND direction = 'outbound';

  -- Conversas ativas
  SELECT COUNT(*) INTO v_conversations_active
  FROM wa_conversations
  WHERE clinic_id = v_clinic_id AND status = 'active';

  -- Mensagens pendentes/falhadas
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_pending_msgs, v_failed_msgs
  FROM wa_messages
  WHERE clinic_id = v_clinic_id
    AND direction = 'outbound'
    AND sent_at > now() - interval '24 hours';

  RETURN jsonb_build_object(
    'inbound_24h', v_inbound_24h,
    'outbound_24h', v_outbound_24h,
    'errors_24h', v_errors_24h,
    'errors_unresolved', v_errors_unresolved,
    'last_inbound', v_last_inbound,
    'last_outbound', v_last_outbound,
    'conversations_active', v_conversations_active,
    'pending_msgs', v_pending_msgs,
    'failed_msgs', v_failed_msgs,
    'checked_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wa_health_check() TO anon, authenticated;

-- 4. RPC listar erros recentes (para dashboard)
CREATE OR REPLACE FUNCTION wa_errors_list(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id,
      'source', e.source,
      'error_type', e.error_type,
      'phone', e.phone,
      'error_msg', e.error_msg,
      'resolved', e.resolved,
      'created_at', e.created_at
    ) ORDER BY e.created_at DESC)
    FROM (
      SELECT * FROM wa_errors
      WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
      ORDER BY created_at DESC
      LIMIT p_limit
    ) e
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_errors_list(int) TO anon, authenticated;
