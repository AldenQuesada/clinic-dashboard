/**
 * Aplica migration via conexao direta ao PostgreSQL do Supabase
 * Uso: node scripts/apply-migration-direct.cjs
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== Aplicando migrations via PostgreSQL direto ===\n')

  await client.connect()
  console.log('✓ Conectado ao PostgreSQL\n')

  // ── 1. wa_outbox_on_sent v3 (sync com inbox) ─────────────
  console.log('1. Atualizando wa_outbox_on_sent (sync com inbox)...')
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

      -- Sync com inbox: buscar conversa existente
      SELECT id INTO v_conv_id
      FROM wa_conversations
      WHERE clinic_id = v_clinic_id
        AND phone = v_outbox.phone
        AND status = 'active'
      LIMIT 1;

      -- Criar conversa se nao existe
      IF v_conv_id IS NULL THEN
        INSERT INTO wa_conversations (
          clinic_id, lead_id, phone, status, ai_persona, ai_enabled
        ) VALUES (
          v_clinic_id,
          COALESCE(v_outbox.lead_id, 'unknown'),
          v_outbox.phone,
          'active',
          'onboarder',
          true
        )
        RETURNING id INTO v_conv_id;
      END IF;

      -- Logar mensagem na conversa
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

      -- Atualizar conversa
      UPDATE wa_conversations
      SET last_message_at = now(),
          last_ai_msg = now(),
          updated_at = now()
      WHERE id = v_conv_id;

      -- Broadcast counters
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
  console.log('   ✓ wa_outbox_on_sent v3 aplicada\n')

  // ── 2. Tabela wa_auto_reply_templates ─────────────────────
  console.log('2. Criando tabela wa_auto_reply_templates...')
  await client.query(`
    CREATE TABLE IF NOT EXISTS wa_auto_reply_templates (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
      trigger_type text NOT NULL,
      content     text NOT NULL,
      media_url   text,
      is_active   boolean DEFAULT true,
      created_at  timestamptz DEFAULT now(),
      updated_at  timestamptz DEFAULT now(),
      UNIQUE(clinic_id, trigger_type)
    )
  `)
  await client.query('ALTER TABLE wa_auto_reply_templates ENABLE ROW LEVEL SECURITY')
  await client.query(`
    DO $$ BEGIN
      CREATE POLICY auto_reply_templates_all ON wa_auto_reply_templates FOR ALL USING (true);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `)
  console.log('   ✓ Tabela criada\n')

  // ── 3. Template de auto-reply birthday ────────────────────
  console.log('3. Inserindo template auto-reply birthday...')
  await client.query(`
    INSERT INTO wa_auto_reply_templates (trigger_type, content) VALUES
    ('birthday_responded',
    'Que bom que te interessou! 🎉

Preparei uma página especial só pra você escolher seu combo de aniversário. É só tocar no link abaixo e selecionar o que mais combina com você:

👇 *Escolha seu presente:*
https://clinicai-dashboard.px1hdq.easypanel.host/aniversario.html

Qualquer dúvida, me chama aqui! 💬')
    ON CONFLICT (clinic_id, trigger_type) DO UPDATE
    SET content = EXCLUDED.content, updated_at = now()
  `)
  console.log('   ✓ Template inserido\n')

  // ── 4. Trigger auto-reply birthday ────────────────────────
  console.log('4. Criando trigger auto-reply birthday...')
  await client.query(`
    CREATE OR REPLACE FUNCTION wa_birthday_on_responded()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_template record;
    BEGIN
      IF NEW.status = 'responded' AND (OLD.status IS DISTINCT FROM 'responded') THEN
        SELECT content, media_url INTO v_template
        FROM wa_auto_reply_templates
        WHERE trigger_type = 'birthday_responded'
          AND clinic_id = NEW.clinic_id
          AND is_active = true
        LIMIT 1;

        IF v_template IS NULL THEN
          RETURN NEW;
        END IF;

        IF NEW.lead_phone IS NOT NULL AND NEW.lead_phone != '' THEN
          INSERT INTO wa_outbox (
            clinic_id, lead_id, phone, content, content_type,
            media_url, priority, status, scheduled_at
          ) VALUES (
            NEW.clinic_id,
            NEW.lead_id,
            NEW.lead_phone,
            v_template.content,
            CASE WHEN v_template.media_url IS NOT NULL THEN 'image' ELSE 'text' END,
            v_template.media_url,
            3,
            'pending',
            now()
          );
        END IF;
      END IF;

      RETURN NEW;
    END;
    $fn$
  `)
  await client.query('DROP TRIGGER IF EXISTS trg_birthday_on_responded ON wa_birthday_campaigns')
  await client.query(`
    CREATE TRIGGER trg_birthday_on_responded
      AFTER UPDATE ON wa_birthday_campaigns
      FOR EACH ROW
      EXECUTE FUNCTION wa_birthday_on_responded()
  `)
  console.log('   ✓ Trigger criado\n')

  // ── 5. Atualizar default da RPC template_save ─────────────
  console.log('5. Atualizando RPC wa_birthday_template_save (default 13h)...')
  await client.query('DROP FUNCTION IF EXISTS wa_birthday_template_save(uuid, int, int, text, text, text, text, boolean, int)')
  await client.query(`
    CREATE OR REPLACE FUNCTION wa_birthday_template_save(
      p_id             uuid DEFAULT NULL,
      p_day_offset     int DEFAULT 30,
      p_send_hour      int DEFAULT 13,
      p_label          text DEFAULT 'Nova mensagem',
      p_content        text DEFAULT '',
      p_media_url      text DEFAULT NULL,
      p_media_position text DEFAULT 'above',
      p_is_active      boolean DEFAULT true,
      p_sort_order     int DEFAULT 99
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
      v_id uuid;
    BEGIN
      IF p_id IS NOT NULL THEN
        UPDATE wa_birthday_templates
        SET day_offset = p_day_offset,
            send_hour = p_send_hour,
            label = p_label,
            content = p_content,
            media_url = p_media_url,
            media_position = p_media_position,
            is_active = p_is_active,
            sort_order = p_sort_order,
            updated_at = now()
        WHERE id = p_id AND clinic_id = v_clinic_id
        RETURNING id INTO v_id;
      ELSE
        INSERT INTO wa_birthday_templates (
          clinic_id, day_offset, send_hour, label, content,
          media_url, media_position, is_active, sort_order
        ) VALUES (
          v_clinic_id, p_day_offset, p_send_hour, p_label, p_content,
          p_media_url, p_media_position, p_is_active, p_sort_order
        )
        RETURNING id INTO v_id;
      END IF;

      RETURN jsonb_build_object('ok', true, 'id', v_id);
    END;
    $fn$
  `)
  await client.query('GRANT EXECUTE ON FUNCTION wa_birthday_template_save(uuid, int, int, text, text, text, text, boolean, int) TO anon, authenticated')
  console.log('   ✓ RPC atualizada (default 13h)\n')

  // ── 6. Atualizar default da coluna ────────────────────────
  console.log('6. Atualizando default send_hour na tabela...')
  await client.query('ALTER TABLE wa_birthday_templates ALTER COLUMN send_hour SET DEFAULT 13')
  console.log('   ✓ Default atualizado\n')

  await client.end()

  console.log('=== TUDO APLICADO ===')
  console.log('✓ wa_outbox_on_sent v3 — msgs agora aparecem na Central')
  console.log('✓ wa_auto_reply_templates — tabela criada com template birthday')
  console.log('✓ trg_birthday_on_responded — auto-reply com link ao responder')
  console.log('✓ wa_birthday_template_save — default 13h')
  console.log('✓ wa_birthday_templates — coluna default 13h')
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1) })
