const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== Fix: Guard Check agora marca responded + enfileira auto-reply ===\n')

  await client.query('DROP FUNCTION IF EXISTS wa_guard_check(text, text)')

  await client.query(`
    CREATE OR REPLACE FUNCTION wa_guard_check(p_phone text, p_message text DEFAULT '')
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
      v_conv record; v_ai_enabled boolean := true; v_msgs_today int := 0;
      v_last_2_msgs text[]; v_blocks jsonb := '[]'::jsonb; v_flags jsonb := '[]'::jsonb;
      v_msg_lower text; v_action text := 'allow';
      v_bday_camp record;
      v_auto_content text;
    BEGIN
      v_msg_lower := lower(p_message);

      SELECT * INTO v_conv FROM wa_conversations
      WHERE phone = p_phone AND clinic_id = v_clinic_id AND status = 'active'
      ORDER BY created_at DESC LIMIT 1;

      -- Guard 1: AI disabled
      IF v_conv IS NOT NULL THEN
        v_ai_enabled := COALESCE(v_conv.ai_enabled, true);
      END IF;
      IF NOT v_ai_enabled THEN
        v_action := 'block';
        v_blocks := v_blocks || '"ai_disabled"'::jsonb;
      END IF;

      -- Guard 2: Debounce 5s
      IF v_conv IS NOT NULL AND v_action = 'allow' THEN
        IF EXISTS (
          SELECT 1 FROM wa_messages
          WHERE conversation_id = v_conv.id AND direction = 'inbound'
            AND sent_at > now() - interval '5 seconds'
            AND sent_at < now() - interval '1 second'
        ) THEN
          v_action := 'block';
          v_blocks := v_blocks || '"debounce"'::jsonb;
        END IF;
      END IF;

      -- Guard 3: Daily limit 30 msgs
      IF v_conv IS NOT NULL AND v_action = 'allow' THEN
        SELECT count(*) INTO v_msgs_today FROM wa_messages
        WHERE conversation_id = v_conv.id AND direction = 'outbound'
          AND ai_generated = true
          AND sent_at >= date_trunc('day', now());
        IF v_msgs_today >= 30 THEN
          v_action := 'block';
          v_blocks := v_blocks || '"daily_limit_reached"'::jsonb;
          UPDATE wa_conversations SET ai_enabled = false, updated_at = now() WHERE id = v_conv.id;
        END IF;
      END IF;

      -- Guard 4: Spam detection
      IF v_conv IS NOT NULL AND v_action = 'allow' THEN
        SELECT array_agg(content ORDER BY sent_at DESC) INTO v_last_2_msgs
        FROM (SELECT content FROM wa_messages WHERE conversation_id = v_conv.id AND direction = 'inbound' ORDER BY sent_at DESC LIMIT 2) sub;
        IF v_last_2_msgs IS NOT NULL AND array_length(v_last_2_msgs, 1) = 2
          AND v_last_2_msgs[1] = p_message AND v_last_2_msgs[2] = p_message THEN
          v_action := 'block';
          v_blocks := v_blocks || '"spam_repeated"'::jsonb;
        END IF;
      END IF;

      -- Guard 5: Emergency
      IF v_action = 'allow' AND v_msg_lower ~ '(urgente|emergencia|sangramento|dor forte|alergia|hospital|socorro)' THEN
        v_action := 'emergency';
        v_flags := v_flags || '"emergencia"'::jsonb;
      END IF;

      -- Guard 6: Human handoff
      IF v_action = 'allow' AND v_msg_lower ~ '(falar com (alguem|pessoa|humano|doutora|dra|secretaria))|(voce (e|é) robo|bot)' THEN
        v_action := 'human_handoff';
        v_flags := v_flags || '"precisa_humano"'::jsonb;
        IF v_conv IS NOT NULL THEN
          UPDATE wa_conversations SET ai_enabled = false WHERE id = v_conv.id;
        END IF;
      END IF;

      -- Guard 7: Inappropriate
      IF v_action = 'allow' AND v_msg_lower ~ '(puta|merda|fdp|caralho|vai (se )?foder)' THEN
        v_action := 'block';
        v_blocks := v_blocks || '"inappropriate_content"'::jsonb;
        IF v_conv IS NOT NULL THEN
          UPDATE wa_conversations SET ai_enabled = false WHERE id = v_conv.id;
        END IF;
      END IF;

      -- Guard 8: Complaint
      IF v_action = 'allow' AND v_msg_lower ~ '(reclamar|processo|procon|advogado)' THEN
        v_action := 'human_handoff';
        v_flags := v_flags || '"reclamacao"'::jsonb;
      END IF;

      -- Guard 9: Birthday campaign active
      -- Bloqueia Lara + marca responded + enfileira auto-reply
      IF v_action = 'allow' THEN
        SELECT * INTO v_bday_camp
        FROM wa_birthday_campaigns
        WHERE status IN ('pending', 'sending')
          AND is_excluded = false
          AND lead_phone LIKE '%' || right(p_phone, 8)
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_bday_camp IS NOT NULL THEN
          v_action := 'block';
          v_blocks := v_blocks || '"birthday_active"'::jsonb;

          -- Marcar campanha como responded
          UPDATE wa_birthday_campaigns
          SET status = 'responded',
              responded_at = now()
          WHERE id = v_bday_camp.id
            AND status IN ('pending', 'sending');

          -- Cancelar msgs pendentes da sequencia
          UPDATE wa_birthday_messages SET status = 'cancelled'
          WHERE campaign_id = v_bday_camp.id AND status IN ('pending', 'queued');

          -- Enfileirar auto-reply com link
          SELECT content INTO v_auto_content
          FROM wa_auto_reply_templates
          WHERE trigger_type = 'birthday_responded'
            AND clinic_id = v_clinic_id
            AND is_active = true
          LIMIT 1;

          IF v_auto_content IS NOT NULL THEN
            INSERT INTO wa_outbox (
              clinic_id, lead_id, phone, content, content_type,
              priority, status, scheduled_at
            ) VALUES (
              v_clinic_id,
              v_bday_camp.lead_id,
              v_bday_camp.lead_phone,
              v_auto_content,
              'text',
              3,
              'pending',
              now()
            );
          END IF;
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'action', v_action, 'blocks', v_blocks, 'flags', v_flags,
        'ai_enabled', v_ai_enabled, 'msgs_today', v_msgs_today,
        'conversation_id', CASE WHEN v_conv IS NOT NULL THEN v_conv.id ELSE NULL END
      );
    END;
    $fn$
  `)

  await client.query('GRANT EXECUTE ON FUNCTION wa_guard_check(text, text) TO anon, authenticated')
  console.log('✓ wa_guard_check com auto-reply direto')

  // Resetar campanha do Alden pra testar
  await client.query(`
    UPDATE wa_birthday_campaigns
    SET status = 'sending', responded_at = NULL
    WHERE lead_id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'
      AND campaign_year = 2026
  `)
  console.log('✓ Campanha Alden resetada pra sending')

  // Testar o guard
  const t = await client.query("SELECT wa_guard_check('554498787673'::text, 'quero saber mais'::text) as r")
  console.log('\nTeste guard:', JSON.stringify(t.rows[0]?.r))

  // Checar se campanha mudou
  const camp = await client.query("SELECT status, responded_at FROM wa_birthday_campaigns WHERE lead_id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'")
  console.log('Campanha:', camp.rows[0]?.status, '| responded:', camp.rows[0]?.responded_at)

  // Checar outbox
  const outbox = await client.query(`
    SELECT id, phone, status, substring(content from 1 for 60) as txt
    FROM wa_outbox WHERE phone = '5544998787673' ORDER BY created_at DESC LIMIT 1
  `)
  console.log('Outbox:', outbox.rows[0]?.status, '|', outbox.rows[0]?.txt)

  await client.end()
  console.log('\n=== PRONTO ===')
  console.log('Guard 9 agora faz tudo em 1 passo:')
  console.log('  1. Bloqueia Lara')
  console.log('  2. Marca campanha responded')
  console.log('  3. Cancela msgs pendentes')
  console.log('  4. Enfileira auto-reply com link')
}
main().catch(console.error)
