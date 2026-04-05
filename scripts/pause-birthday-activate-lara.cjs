const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== Desconectar birthday + Ativar Lara ===\n')

  // 1. Cancelar TODAS campanhas de birthday
  const camps = await client.query(`
    UPDATE wa_birthday_campaigns SET status = 'cancelled'
    WHERE status IN ('pending', 'sending', 'paused')
    RETURNING lead_name
  `)
  console.log('1. Campanhas canceladas:', camps.rowCount)

  // 2. Cancelar todas birthday_messages pendentes
  const msgs = await client.query(`
    UPDATE wa_birthday_messages SET status = 'cancelled'
    WHERE status IN ('pending', 'queued', 'paused')
    RETURNING id
  `)
  console.log('2. Birthday messages canceladas:', msgs.rowCount)

  // 3. Cancelar outbox pendentes de birthday
  const outbox = await client.query(`
    UPDATE wa_outbox SET status = 'cancelled'
    WHERE status = 'pending'
      AND id IN (SELECT outbox_id FROM wa_birthday_messages WHERE outbox_id IS NOT NULL)
    RETURNING id
  `)
  console.log('3. Outbox birthday cancelados:', outbox.rowCount)

  // 4. Remover Guard 9 (birthday) do wa_guard_check — restaurar sem birthday
  console.log('\n4. Restaurando wa_guard_check SEM guard de birthday...')
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
    BEGIN
      v_msg_lower := lower(p_message);

      SELECT * INTO v_conv FROM wa_conversations
      WHERE phone = p_phone AND clinic_id = v_clinic_id AND status = 'active'
      ORDER BY created_at DESC LIMIT 1;

      IF v_conv IS NOT NULL THEN
        v_ai_enabled := COALESCE(v_conv.ai_enabled, true);
      END IF;
      IF NOT v_ai_enabled THEN
        v_action := 'block';
        v_blocks := v_blocks || '"ai_disabled"'::jsonb;
      END IF;

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

      IF v_conv IS NOT NULL AND v_action = 'allow' THEN
        SELECT array_agg(content ORDER BY sent_at DESC) INTO v_last_2_msgs
        FROM (SELECT content FROM wa_messages WHERE conversation_id = v_conv.id AND direction = 'inbound' ORDER BY sent_at DESC LIMIT 2) sub;
        IF v_last_2_msgs IS NOT NULL AND array_length(v_last_2_msgs, 1) = 2
          AND v_last_2_msgs[1] = p_message AND v_last_2_msgs[2] = p_message THEN
          v_action := 'block';
          v_blocks := v_blocks || '"spam_repeated"'::jsonb;
        END IF;
      END IF;

      IF v_action = 'allow' AND v_msg_lower ~ '(urgente|emergencia|sangramento|dor forte|alergia|hospital|socorro)' THEN
        v_action := 'emergency';
        v_flags := v_flags || '"emergencia"'::jsonb;
      END IF;

      IF v_action = 'allow' AND v_msg_lower ~ '(falar com (alguem|pessoa|humano|doutora|dra|secretaria))|(voce (e|é) robo|bot)' THEN
        v_action := 'human_handoff';
        v_flags := v_flags || '"precisa_humano"'::jsonb;
        IF v_conv IS NOT NULL THEN
          UPDATE wa_conversations SET ai_enabled = false WHERE id = v_conv.id;
        END IF;
      END IF;

      IF v_action = 'allow' AND v_msg_lower ~ '(puta|merda|fdp|caralho|vai (se )?foder)' THEN
        v_action := 'block';
        v_blocks := v_blocks || '"inappropriate_content"'::jsonb;
        IF v_conv IS NOT NULL THEN
          UPDATE wa_conversations SET ai_enabled = false WHERE id = v_conv.id;
        END IF;
      END IF;

      IF v_action = 'allow' AND v_msg_lower ~ '(reclamar|processo|procon|advogado)' THEN
        v_action := 'human_handoff';
        v_flags := v_flags || '"reclamacao"'::jsonb;
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
  console.log('   ✓ wa_guard_check restaurado (sem birthday guard)')

  // 5. Notificar PostgREST
  await client.query("NOTIFY pgrst, 'reload schema'")
  console.log('5. PostgREST reload notificado')

  // 6. Verificar estado final
  const stats = await client.query(`
    SELECT status, count(*) as c FROM wa_birthday_campaigns GROUP BY status
  `)
  console.log('\n=== Estado final ===')
  console.log('Campanhas:', stats.rows.map(r => r.status + ':' + r.c).join(', '))

  // 7. Testar Lara — guard deve retornar allow
  const test = await client.query("SELECT wa_guard_check('554498787673'::text, 'quero saber sobre lifting'::text) as r")
  console.log('Lara guard (Alden):', test.rows[0]?.r?.action)

  await client.end()
  console.log('\n✓ Birthday desconectado')
  console.log('✓ Lara ativa para lifting, olheiras, urgencias, PIX')
}
main().catch(console.error)
