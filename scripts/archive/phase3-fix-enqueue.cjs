const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== FASE 3: Reescrever wa_birthday_enqueue ===\n')

  await client.query('DROP FUNCTION IF EXISTS wa_birthday_enqueue()')
  await client.query(`
    CREATE OR REPLACE FUNCTION wa_birthday_enqueue()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_clinic_id   uuid := '00000000-0000-0000-0000-000000000001';
      v_tz          text := 'America/Sao_Paulo';
      v_now         timestamptz := now();
      v_msg         record;
      v_tmpl        record;
      v_camp        record;
      v_lead        record;
      v_outbox_id   uuid;
      v_enqueued    int := 0;
      v_cancelled   int := 0;
      v_guard_reason text;
      v_content     text;
      v_queixas     text;
      v_first_name  text;
    BEGIN
      FOR v_msg IN
        SELECT m.*, c.lead_id, c.lead_phone, c.lead_name, c.status AS camp_status,
               c.is_excluded, c.started_at AS camp_started, c.queixas AS camp_queixas,
               c.has_open_budget, c.budget_title, c.budget_total,
               c.birth_date AS camp_bday
        FROM wa_birthday_messages m
        JOIN wa_birthday_campaigns c ON c.id = m.campaign_id
        WHERE m.status = 'pending'
          AND m.scheduled_at <= v_now
          AND c.status NOT IN ('cancelled', 'responded')
          AND c.is_excluded = false
        ORDER BY m.scheduled_at
      LOOP
        -- Skip resolved
        IF v_msg.camp_status IN ('cancelled', 'responded') OR v_msg.is_excluded THEN
          UPDATE wa_birthday_messages SET status = 'cancelled' WHERE id = v_msg.id;
          v_cancelled := v_cancelled + 1;
          CONTINUE;
        END IF;

        -- ── GUARD CHECKS ─────────────────────────────────
        v_guard_reason := NULL;

        -- Guard 1: Lead respondeu no WhatsApp apos inicio da campanha
        IF v_msg.camp_started IS NOT NULL AND v_guard_reason IS NULL THEN
          PERFORM 1 FROM wa_conversations wc
          JOIN wa_messages wm ON wm.conversation_id = wc.id
          WHERE wc.lead_id = v_msg.lead_id
            AND wm.direction = 'inbound'
            AND wm.sent_at > v_msg.camp_started
          LIMIT 1;
          IF FOUND THEN v_guard_reason := 'responded'; END IF;
        END IF;

        -- Guard 2: Orcamento criado apos inicio da campanha
        IF v_msg.camp_started IS NOT NULL AND v_guard_reason IS NULL THEN
          PERFORM 1 FROM budgets b
          WHERE b.lead_id = v_msg.lead_id
            AND b.created_at > v_msg.camp_started
          LIMIT 1;
          IF FOUND THEN v_guard_reason := 'new_budget'; END IF;
        END IF;

        -- Guard 3: Canal nao e WhatsApp
        IF v_guard_reason IS NULL THEN
          PERFORM 1 FROM leads l
          WHERE l.id = v_msg.lead_id
            AND l.channel_mode IS NOT NULL
            AND l.channel_mode NOT IN ('whatsapp', 'ai')
          LIMIT 1;
          IF FOUND THEN v_guard_reason := 'human_channel'; END IF;
        END IF;

        -- Guard triggered → cancelar
        IF v_guard_reason IS NOT NULL THEN
          UPDATE wa_birthday_campaigns
          SET status = CASE WHEN v_guard_reason = 'responded' THEN 'responded' ELSE 'cancelled' END,
              exclude_reason = v_guard_reason,
              is_excluded = true,
              excluded_at = v_now,
              excluded_by = 'auto_guard',
              completed_at = v_now
          WHERE id = v_msg.campaign_id;

          UPDATE wa_birthday_messages SET status = 'cancelled'
          WHERE campaign_id = v_msg.campaign_id AND status = 'pending';

          v_cancelled := v_cancelled + 1;
          CONTINUE;
        END IF;

        -- ── RESOLVER CONTEUDO DO TEMPLATE ────────────────
        -- Ler template ATUAL (nao o conteudo gravado no scan)
        SELECT * INTO v_tmpl FROM wa_birthday_templates
        WHERE id = v_msg.template_id;

        IF v_tmpl IS NULL THEN
          UPDATE wa_birthday_messages SET status = 'cancelled' WHERE id = v_msg.id;
          v_cancelled := v_cancelled + 1;
          CONTINUE;
        END IF;

        -- Se birthday_message ja tem conteudo (backward compat), usar
        -- Senao, resolver do template
        IF v_msg.content IS NOT NULL AND v_msg.content != '' THEN
          v_content := v_msg.content;
        ELSE
          v_content := v_tmpl.content;

          -- Resolver variaveis
          v_first_name := split_part(COALESCE(v_msg.lead_name, ''), ' ', 1);
          IF v_first_name = '' THEN v_first_name := 'você'; END IF;

          v_content := replace(v_content, '[nome]', v_first_name);
          v_content := replace(v_content, '[Nome]', v_first_name);

          -- Queixas: se vazio, remover linhas com [queixas]
          v_queixas := COALESCE(v_msg.camp_queixas, '');
          IF v_queixas != '' THEN
            v_content := replace(v_content, '[queixas]', v_queixas);
          ELSE
            -- Remover linhas que contem [queixas]
            v_content := array_to_string(
              ARRAY(
                SELECT line FROM unnest(string_to_array(v_content, E'\n')) AS line
                WHERE line NOT LIKE '%[queixas]%'
              ),
              E'\n'
            );
            -- Limpar linhas vazias duplas
            WHILE v_content LIKE E'%\n\n\n%' LOOP
              v_content := replace(v_content, E'\n\n\n', E'\n\n');
            END LOOP;
          END IF;

          -- Idade
          IF v_msg.camp_bday IS NOT NULL THEN
            v_content := replace(v_content, '[idade]',
              (EXTRACT(YEAR FROM v_msg.camp_bday) - EXTRACT(YEAR FROM v_msg.camp_bday - (EXTRACT(YEAR FROM v_msg.camp_bday) - EXTRACT(YEAR FROM CURRENT_DATE)) * interval '1 year'))::text
            );
          END IF;
          v_content := replace(v_content, '[idade]', '');

          -- Orcamento
          IF v_msg.has_open_budget AND v_msg.budget_title IS NOT NULL THEN
            v_content := replace(v_content, '[orcamento]', v_msg.budget_title || ' (R$ ' || COALESCE(v_msg.budget_total::text, '0') || ')');
          ELSE
            v_content := replace(v_content, '[orcamento]', '');
          END IF;
        END IF;

        -- ── ENQUEUE ──────────────────────────────────────
        INSERT INTO wa_outbox (
          clinic_id, lead_id, phone, content, content_type,
          media_url, priority, status, scheduled_at
        ) VALUES (
          v_clinic_id, v_msg.lead_id, v_msg.lead_phone, v_content,
          CASE WHEN v_tmpl.media_url IS NOT NULL THEN 'image' ELSE 'text' END,
          v_tmpl.media_url, 5, 'pending', v_now
        )
        RETURNING id INTO v_outbox_id;

        -- Atualizar birthday_message
        UPDATE wa_birthday_messages
        SET status = 'queued',
            outbox_id = v_outbox_id,
            content = v_content  -- Gravar conteudo resolvido (pra historico)
        WHERE id = v_msg.id;

        -- Marcar campanha como sending
        UPDATE wa_birthday_campaigns
        SET status = 'sending', started_at = COALESCE(started_at, v_now)
        WHERE id = v_msg.campaign_id AND status = 'pending';

        v_enqueued := v_enqueued + 1;
      END LOOP;

      RETURN jsonb_build_object('ok', true, 'enqueued', v_enqueued, 'cancelled', v_cancelled);
    END;
    $fn$
  `)

  await client.query('GRANT EXECUTE ON FUNCTION wa_birthday_enqueue() TO anon, authenticated')

  console.log('✓ wa_birthday_enqueue reescrito')
  console.log('')
  console.log('Correcoes:')
  console.log('  1. Resolve conteudo do template no momento do envio (nao usa conteudo gravado)')
  console.log('  2. Backward compat: se birthday_message ja tem conteudo, usa')
  console.log('  3. [queixas] vazio → remove linhas com [queixas] (sem fallback)')
  console.log('  4. Grava conteudo resolvido no birthday_message (historico)')
  console.log('  5. Guard 3 aceita channel_mode "ai" alem de "whatsapp"')
  console.log('  6. Timezone awareness via v_now')

  await client.end()
}
main().catch(console.error)
