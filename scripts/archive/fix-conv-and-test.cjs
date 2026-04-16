const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // 1. Atualizar wa_outbox_on_sent pra tambem setar remote_jid
  console.log('1. Atualizando wa_outbox_on_sent pra setar remote_jid...')
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

      -- Montar remote_jid no formato WhatsApp
      v_remote_jid := v_outbox.phone || '@s.whatsapp.net';

      -- Buscar conversa existente pelo phone OU remote_jid
      SELECT id INTO v_conv_id
      FROM wa_conversations
      WHERE clinic_id = v_clinic_id
        AND (phone = v_outbox.phone OR remote_jid = v_remote_jid)
        AND status = 'active'
      LIMIT 1;

      IF v_conv_id IS NULL THEN
        INSERT INTO wa_conversations (
          clinic_id, lead_id, phone, remote_jid, status, ai_persona, ai_enabled
        ) VALUES (
          v_clinic_id,
          COALESCE(v_outbox.lead_id, 'unknown'),
          v_outbox.phone,
          v_remote_jid,
          'active',
          'onboarder',
          true
        )
        RETURNING id INTO v_conv_id;
      ELSE
        -- Garantir que remote_jid esta preenchido
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
  console.log('   ✓ wa_outbox_on_sent v4 — agora seta remote_jid')

  // 2. Corrigir a conversa existente do Alden — adicionar remote_jid
  console.log('\n2. Corrigindo conversa do Alden...')
  await client.query(`
    UPDATE wa_conversations
    SET remote_jid = '5544998787673@s.whatsapp.net',
        display_name = 'Alden Julio'
    WHERE id = '4c055dd5-75b7-4c1d-971f-df0c49cdfab6'
  `)
  console.log('   ✓ remote_jid e display_name setados')

  // 3. Atualizar trigger detect_response pra tambem checar via conversa
  console.log('\n3. Atualizando trigger detect_response...')
  await client.query(`
    CREATE OR REPLACE FUNCTION wa_birthday_detect_response()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_phone text;
      v_campaign_id uuid;
    BEGIN
      IF NEW.direction != 'inbound' THEN
        RETURN NEW;
      END IF;

      SELECT phone INTO v_phone
      FROM wa_conversations
      WHERE id = NEW.conversation_id
      LIMIT 1;

      IF v_phone IS NULL THEN
        RETURN NEW;
      END IF;

      -- Vincular via birthday_messages → outbox (msg real enviada)
      SELECT bc.id INTO v_campaign_id
      FROM wa_birthday_campaigns bc
      JOIN wa_birthday_messages bm ON bm.campaign_id = bc.id
      JOIN wa_outbox o ON o.id = bm.outbox_id
      WHERE bc.status = 'sending'
        AND o.phone = v_phone
        AND o.status = 'sent'
      ORDER BY o.sent_at DESC
      LIMIT 1;

      IF v_campaign_id IS NOT NULL THEN
        UPDATE wa_birthday_campaigns
        SET status = 'responded',
            responded_at = now()
        WHERE id = v_campaign_id;
      END IF;

      RETURN NEW;
    END;
    $fn$
  `)
  console.log('   ✓ Trigger atualizado')

  // 4. Verificar estado final
  const conv = await client.query(`
    SELECT id, phone, remote_jid, display_name
    FROM wa_conversations
    WHERE id = '4c055dd5-75b7-4c1d-971f-df0c49cdfab6'
  `)
  console.log('\n4. Conversa final:', JSON.stringify(conv.rows[0]))

  await client.end()

  console.log('\n=== CORRIGIDO ===')
  console.log('A conversa agora tem remote_jid — a Lara/n8n vai encontrar.')
  console.log('Responda de novo no WhatsApp pra testar!')
}
main().catch(console.error)
