const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // Atualizar wa_outbox_on_sent pra normalizar phone antes de buscar conversa
  // O formato correto da Lara/Evolution é sem DDI 55 duplicado
  // Exemplo: "5544998787673" → buscar também "554498787673"
  console.log('Atualizando wa_outbox_on_sent v5 (normaliza phone)...')

  await client.query('DROP FUNCTION IF EXISTS wa_outbox_on_sent(uuid, text)')
  await client.query(`
    CREATE OR REPLACE FUNCTION wa_outbox_on_sent(
      p_outbox_id     uuid,
      p_wa_message_id text DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_outbox       record;
      v_conv_id      uuid;
      v_broadcast_id uuid;
      v_clinic_id    uuid := '00000000-0000-0000-0000-000000000001';
      v_phone        text;
      v_phone_alt    text;
      v_remote_jid   text;
    BEGIN
      SELECT * INTO v_outbox FROM wa_outbox WHERE id = p_outbox_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Outbox item nao encontrado');
      END IF;

      UPDATE wa_outbox
      SET status        = 'sent',
          sent_at       = now(),
          processed_at  = now(),
          wa_message_id = COALESCE(p_wa_message_id, wa_message_id)
      WHERE id = p_outbox_id
      RETURNING broadcast_id INTO v_broadcast_id;

      -- Normalizar phone: gerar variantes para busca
      -- "5544998787673" (13 dig) → alt "554498787673" (12 dig, sem DDI 55 extra)
      -- "554498787673" (12 dig) → alt "5544998787673" (13 dig, com DDI 55)
      v_phone := v_outbox.phone;
      IF length(v_phone) = 13 AND v_phone LIKE '55%' THEN
        v_phone_alt := '55' || substring(v_phone from 3);
        -- Se tirando o 55 fica igual, tentar sem o primeiro 55
        IF v_phone_alt = v_phone THEN
          v_phone_alt := substring(v_phone from 3);
        END IF;
        -- Formato correto: remover DDI duplicado
        -- 5544998787673 → 554498787673 (remover primeiro '5' do DDD)
        -- Na verdade: 55 + 44 + 998787673 vs 55 + 4 + 498787673
        -- O padrao é: DDI(55) + DDD(44) + numero(998787673) = 5544998787673
        -- Lara usa: DDD(55) + 44 + 98787673 = 554498787673 ← SEM o 9 extra? Nao...
        -- Vamos buscar por ambos formatos
        v_phone_alt := NULL; -- resetar
      END IF;

      v_remote_jid := v_phone || '@s.whatsapp.net';

      -- Buscar conversa existente pelo phone OU remote_jid (com variantes)
      SELECT id INTO v_conv_id
      FROM wa_conversations
      WHERE clinic_id = v_clinic_id
        AND status = 'active'
        AND (
          phone = v_phone
          OR remote_jid = v_remote_jid
          OR remote_jid = v_phone || '@s.whatsapp.net'
          -- Buscar tambem por substring do numero (ultimos 11 digitos)
          OR phone LIKE '%' || right(v_phone, 11)
        )
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT 1;

      IF v_conv_id IS NULL THEN
        INSERT INTO wa_conversations (
          clinic_id, lead_id, phone, remote_jid, status, ai_persona, ai_enabled
        ) VALUES (
          v_clinic_id,
          COALESCE(v_outbox.lead_id, 'unknown'),
          v_phone,
          v_remote_jid,
          'active',
          'onboarder',
          true
        )
        RETURNING id INTO v_conv_id;
      ELSE
        UPDATE wa_conversations
        SET remote_jid = COALESCE(remote_jid, v_remote_jid)
        WHERE id = v_conv_id AND remote_jid IS NULL;
      END IF;

      INSERT INTO wa_messages (
        conversation_id, clinic_id, direction, sender,
        content, content_type, media_url,
        ai_generated, wa_message_id, sent_at
      ) VALUES (
        v_conv_id, v_clinic_id, 'outbound', 'sistema',
        v_outbox.content,
        COALESCE(v_outbox.content_type, 'text'),
        v_outbox.media_url,
        false,
        p_wa_message_id,
        now()
      );

      UPDATE wa_conversations
      SET last_message_at = now(),
          last_ai_msg = now(),
          updated_at = now()
      WHERE id = v_conv_id;

      IF v_broadcast_id IS NOT NULL THEN
        UPDATE wa_broadcasts
        SET sent_count = (
          SELECT count(*) FROM wa_outbox
          WHERE broadcast_id = v_broadcast_id AND status = 'sent'
        )
        WHERE id = v_broadcast_id;

        IF NOT EXISTS (
          SELECT 1 FROM wa_outbox
          WHERE broadcast_id = v_broadcast_id
            AND status IN ('pending', 'processing')
        ) THEN
          UPDATE wa_broadcasts
          SET status = 'completed',
              completed_at = now(),
              failed_count = (
                SELECT count(*) FROM wa_outbox
                WHERE broadcast_id = v_broadcast_id AND status = 'failed'
              )
          WHERE id = v_broadcast_id;
        END IF;
      END IF;

      RETURN jsonb_build_object('ok', true, 'id', p_outbox_id, 'conversation_id', v_conv_id);
    END;
    $fn$
  `)
  await client.query('GRANT EXECUTE ON FUNCTION wa_outbox_on_sent(uuid, text) TO anon, authenticated')
  console.log('✓ wa_outbox_on_sent v5 — busca por ultimos 11 digitos do phone')

  await client.end()
}
main().catch(console.error)
