/**
 * Corrige overload do wa_log_message:
 * - Drop a versao 7-param que minha migration criou
 * - Atualiza a versao 11-param (canonica) com check de blacklist
 */
const { Client } = require('pg')

async function main() {
  const client = new Client({
    host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
    port: 5432,
    user: 'postgres',
    password: 'Rosangela*121776',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  console.log('Conectado\n')

  // 1. Drop a versao 7-param (a que minha migration criou)
  console.log('1. Drop wa_log_message 7-param...')
  await client.query(`
    DROP FUNCTION IF EXISTS public.wa_log_message(text, text, text, text, int, text, text);
  `)
  console.log('   OK')

  // 2. Recriar a 11-param com check de blacklist
  console.log('2. Recriando wa_log_message 11-param com blacklist check...')
  await client.query(`
    CREATE OR REPLACE FUNCTION public.wa_log_message(
      p_phone        text,
      p_lead_id      text    DEFAULT NULL,
      p_user_message text    DEFAULT NULL,
      p_ai_response  text    DEFAULT NULL,
      p_tokens_used  int     DEFAULT 0,
      p_tags         text    DEFAULT '[]',
      p_persona      text    DEFAULT 'onboarder',
      p_push_name    text    DEFAULT NULL,
      p_remote_jid   text    DEFAULT NULL,
      p_content_type text    DEFAULT 'text',
      p_media_url    text    DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_clinic_id     uuid := '00000000-0000-0000-0000-000000000001';
      v_conv          record;
      v_lead_id       text;
      v_tags_arr      text[];
      v_now           timestamptz := now();
      v_inbound_id    uuid;
      v_outbound_id   uuid;
      v_detected_name text;
      v_ct            text;
    BEGIN
      -- BLACKLIST: blocks staff/test/internal phones from creating leads or messages
      IF public.wa_is_phone_blacklisted(p_phone) THEN
        RETURN jsonb_build_object(
          'success',     false,
          'blacklisted', true,
          'phone',       p_phone
        );
      END IF;

      v_lead_id := p_lead_id;
      v_detected_name := NULLIF(TRIM(COALESCE(p_push_name, '')), '');
      v_ct := COALESCE(NULLIF(p_content_type, ''), 'text');

      IF v_lead_id IS NULL OR v_lead_id = '' THEN
        SELECT id INTO v_lead_id
        FROM leads
        WHERE phone = p_phone AND clinic_id = v_clinic_id AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1;
        IF v_lead_id IS NULL THEN
          v_lead_id := wa_upsert_lead_from_chat(p_phone, v_detected_name, 'whatsapp');
        END IF;
      END IF;

      SELECT * INTO v_conv
      FROM wa_conversations
      WHERE phone = p_phone AND clinic_id = v_clinic_id AND status = 'active'
      ORDER BY created_at DESC LIMIT 1;

      IF v_conv IS NULL THEN
        INSERT INTO wa_conversations (clinic_id, lead_id, phone, status, ai_persona, ai_enabled, display_name)
        VALUES (v_clinic_id, v_lead_id, p_phone, 'active', 'onboarder', false, v_detected_name)
        RETURNING * INTO v_conv;
      ELSE
        IF v_conv.lead_id = 'unknown' AND v_lead_id IS NOT NULL THEN
          UPDATE wa_conversations SET lead_id = v_lead_id, updated_at = v_now WHERE id = v_conv.id;
        END IF;
        IF v_detected_name IS NOT NULL AND (v_conv.display_name IS NULL OR v_conv.display_name = '' OR v_conv.display_name = 'Desconhecido') THEN
          UPDATE wa_conversations SET display_name = v_detected_name, updated_at = v_now WHERE id = v_conv.id;
        END IF;
      END IF;

      IF p_user_message IS NOT NULL AND p_user_message != '' THEN
        INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, content_type, media_url, ai_generated, sent_at)
        VALUES (v_conv.id, v_clinic_id, 'inbound', 'lead', p_user_message, v_ct, p_media_url, false, v_now)
        RETURNING id INTO v_inbound_id;
      END IF;

      IF p_ai_response IS NOT NULL AND p_ai_response != '' THEN
        INSERT INTO wa_messages (conversation_id, clinic_id, direction, sender, content, content_type, ai_generated, ai_model, ai_tokens_used, status, sent_at)
        VALUES (v_conv.id, v_clinic_id, 'outbound', 'lara', p_ai_response, 'text', true, 'claude-sonnet-4-20250514', p_tokens_used, 'sent', v_now)
        RETURNING id INTO v_outbound_id;
      END IF;

      BEGIN
        SELECT array_agg(t) INTO v_tags_arr FROM jsonb_array_elements_text(p_tags::jsonb) t;
      EXCEPTION WHEN OTHERS THEN v_tags_arr := '{}';
      END;

      UPDATE wa_conversations SET
        last_message_at = v_now,
        last_lead_msg = CASE WHEN p_user_message IS NOT NULL THEN v_now ELSE last_lead_msg END,
        last_ai_msg = CASE WHEN p_ai_response IS NOT NULL THEN v_now ELSE last_ai_msg END,
        ai_persona = p_persona,
        tags = CASE WHEN v_tags_arr IS NOT NULL AND array_length(v_tags_arr, 1) > 0
          THEN (SELECT array_agg(DISTINCT t) FROM unnest(COALESCE(tags, '{}') || v_tags_arr) t)
          ELSE tags END,
        updated_at = v_now
      WHERE id = v_conv.id;

      IF v_lead_id IS NOT NULL THEN
        UPDATE leads SET
          name = CASE WHEN v_detected_name IS NOT NULL AND (name IS NULL OR name = '') THEN v_detected_name ELSE name END,
          last_contacted_at = v_now,
          last_response_at = CASE WHEN p_user_message IS NOT NULL THEN v_now ELSE last_response_at END,
          conversation_status = 'active', ai_persona = p_persona, updated_at = v_now
        WHERE id = v_lead_id AND clinic_id = v_clinic_id;
      END IF;

      RETURN jsonb_build_object('success', true, 'conversation_id', v_conv.id, 'lead_id', v_lead_id,
        'inbound_msg_id', v_inbound_id, 'outbound_msg_id', v_outbound_id);
    END;
    $fn$;
  `)
  console.log('   OK')

  // 3. Grant
  await client.query(`
    GRANT EXECUTE ON FUNCTION public.wa_log_message(text, text, text, text, int, text, text, text, text, text, text)
    TO anon, authenticated;
  `)
  console.log('   GRANT OK')

  // 4. Test
  console.log('\n--- Test ---')
  const r1 = await client.query(`
    SELECT public.wa_log_message('554498787673', NULL, 'teste blacklist') AS result
  `)
  console.log('Blacklisted phone (Alden):')
  console.log('  ', JSON.stringify(r1.rows[0].result))

  const r2 = await client.query(`
    SELECT public.wa_is_phone_blacklisted('554498787673') AS bl
  `)
  console.log('  is_blacklisted:', r2.rows[0].bl)

  await client.end()
  console.log('\nFeito.')
}

main().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
