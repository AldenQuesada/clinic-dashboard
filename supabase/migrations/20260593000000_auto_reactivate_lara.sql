-- ============================================================
-- Migration: Reativacao automatica da Lara
-- Quando secretaria assume mas nao responde em 2 minutos,
-- Lara reativa automaticamente se tem msg inbound pendente.
-- Executado via pg_cron a cada 1 minuto.
-- ============================================================

-- RPC que verifica conversas pausadas e reativa se necessario
CREATE OR REPLACE FUNCTION wa_auto_reactivate()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id   uuid := '00000000-0000-0000-0000-000000000001';
  v_reactivated int := 0;
  v_conv        record;
BEGIN
  -- Buscar conversas que:
  -- 1. ai_enabled = false (secretaria assumiu)
  -- 2. Tem mensagem inbound (do paciente) DEPOIS da ultima msg outbound (da secretaria)
  -- 3. Essa msg inbound tem mais de 2 minutos sem resposta da secretaria
  FOR v_conv IN
    SELECT c.id, c.phone, c.display_name
    FROM wa_conversations c
    WHERE c.clinic_id = v_clinic_id
      AND c.status = 'active'
      AND c.ai_enabled = false
      AND EXISTS (
        -- Tem msg inbound recente sem resposta
        SELECT 1 FROM wa_messages m
        WHERE m.conversation_id = c.id
          AND m.direction = 'inbound'
          AND m.sent_at > COALESCE(
            -- Ultima msg outbound (da secretaria ou lara)
            (SELECT max(m2.sent_at) FROM wa_messages m2
             WHERE m2.conversation_id = c.id AND m2.direction = 'outbound'),
            '1970-01-01'::timestamptz
          )
          AND m.sent_at < now() - interval '2 minutes'
      )
  LOOP
    -- Reativar Lara
    UPDATE wa_conversations
    SET ai_enabled = true, updated_at = now()
    WHERE id = v_conv.id;

    v_reactivated := v_reactivated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reactivated', v_reactivated,
    'checked_at', now()
  );
END;
$$;

-- Agendar no pg_cron: executa a cada 1 minuto
SELECT cron.schedule(
  'wa-auto-reactivate',
  '* * * * *',
  $$SELECT wa_auto_reactivate()$$
);
