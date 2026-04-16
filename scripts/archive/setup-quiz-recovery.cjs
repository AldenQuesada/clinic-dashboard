const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== Setup: Recuperacao de Quiz Abandonado ===\n')

  // 1. Garantir colunas extras na tabela
  console.log('1. Adicionando colunas faltantes (se nao existem)...')
  await client.query(`
    ALTER TABLE public.wa_message_templates
      ADD COLUMN IF NOT EXISTS slug     text,
      ADD COLUMN IF NOT EXISTS category text DEFAULT 'geral',
      ADD COLUMN IF NOT EXISTS content  text,
      ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'
  `)
  console.log('   OK colunas')

  // 2. Atualizar constraint
  console.log('2. Atualizando constraint chk_wmt_type...')
  await client.query(`ALTER TABLE public.wa_message_templates DROP CONSTRAINT IF EXISTS chk_wmt_type`)
  await client.query(`
    ALTER TABLE public.wa_message_templates
      ADD CONSTRAINT chk_wmt_type
        CHECK (type IN (
          'confirmacao','lembrete','engajamento','boas_vindas',
          'consent_img','consent_info','recuperacao'
        ))
  `)
  console.log('   OK constraint')

  // 3. Inserir template
  console.log('3. Inserindo template de recuperacao...')
  await client.query(`
    INSERT INTO wa_message_templates (
      clinic_id, type, name, message, slug, category, content, is_active, sort_order
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      'recuperacao',
      'Recuperacao Quiz - Nao finalizou',
      'Oi {nome}, tudo bem? Aqui e a Lara, da equipe da Dra. Mirian

Vi que voce comecou nossa avaliacao e demonstrou interesse em resolver {queixas}, mas por algum motivo nao finalizou.

Acontece bastante — as vezes a correria nao deixa, ne?

Posso te ajudar por aqui mesmo? Me conta o que mais te incomoda hoje que eu ja te passo as opcoes certinhas pra voce',
      'recovery_quiz_abandoned',
      'recuperacao',
      'Oi {nome}, tudo bem? Aqui e a Lara, da equipe da Dra. Mirian

Vi que voce comecou nossa avaliacao e demonstrou interesse em resolver {queixas}, mas por algum motivo nao finalizou.

Acontece bastante — as vezes a correria nao deixa, ne?

Posso te ajudar por aqui mesmo? Me conta o que mais te incomoda hoje que eu ja te passo as opcoes certinhas pra voce',
      true,
      10
    )
    ON CONFLICT DO NOTHING
  `)
  console.log('   OK template: recovery_quiz_abandoned')

  // 4. Criar RPC
  console.log('\n4. Criando RPC wa_quiz_recovery_scan...')
  await client.query(`
    CREATE OR REPLACE FUNCTION wa_quiz_recovery_scan()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
      v_template  record;
      v_event     record;
      v_msg       text;
      v_phone     text;
      v_first_name text;
      v_queixas   text;
      v_enqueued  int := 0;
      v_lead      record;
    BEGIN
      SELECT * INTO v_template
      FROM wa_message_templates
      WHERE slug = 'recovery_quiz_abandoned'
        AND clinic_id = v_clinic_id
        AND is_active = true
      LIMIT 1;

      IF v_template IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'template not found');
      END IF;

      FOR v_event IN
        SELECT
          e.contact_name,
          e.contact_phone,
          max(e.created_at) as last_event
        FROM quiz_events e
        WHERE e.contact_phone IS NOT NULL
          AND e.contact_phone != ''
          AND e.event_type = 'step_view'
          AND e.step_index >= 10
          AND NOT EXISTS (
            SELECT 1 FROM quiz_responses r
            WHERE r.contact_phone = e.contact_phone
          )
          AND NOT EXISTS (
            SELECT 1 FROM wa_outbox o
            WHERE o.phone LIKE '%' || right(regexp_replace(e.contact_phone, '[^0-9]', '', 'g'), 8)
              AND o.content LIKE '%nao finalizou%'
              AND o.created_at > now() - interval '7 days'
          )
          AND e.created_at < now() - interval '1 hour'
        GROUP BY e.contact_name, e.contact_phone
        ORDER BY max(e.created_at) DESC
      LOOP
        v_phone := '55' || regexp_replace(v_event.contact_phone, '[^0-9]', '', 'g');

        SELECT * INTO v_lead
        FROM leads
        WHERE phone LIKE '%' || right(v_phone, 8)
          AND deleted_at IS NULL
        LIMIT 1;

        v_first_name := split_part(COALESCE(v_event.contact_name, ''), ' ', 1);
        IF v_first_name = '' THEN v_first_name := 'voce'; END IF;

        v_queixas := '';
        IF v_lead IS NOT NULL AND v_lead.queixas_faciais IS NOT NULL
           AND jsonb_array_length(v_lead.queixas_faciais) > 0 THEN
          SELECT string_agg(value #>> '{}', ', ') INTO v_queixas
          FROM jsonb_array_elements(v_lead.queixas_faciais);
        END IF;

        v_msg := v_template.message;
        v_msg := replace(v_msg, '{nome}', v_first_name);
        IF v_queixas != '' AND v_queixas IS NOT NULL THEN
          v_msg := replace(v_msg, '{queixas}', v_queixas);
        ELSE
          v_msg := replace(v_msg, ' em resolver {queixas},', ',');
        END IF;

        INSERT INTO wa_outbox (
          clinic_id, lead_id, phone, content, content_type,
          priority, status, scheduled_at
        ) VALUES (
          v_clinic_id,
          CASE WHEN v_lead IS NOT NULL THEN v_lead.id::text ELSE 'unknown' END,
          v_phone,
          v_msg,
          'text',
          5,
          'pending',
          now()
        );

        v_enqueued := v_enqueued + 1;
      END LOOP;

      RETURN jsonb_build_object('ok', true, 'enqueued', v_enqueued);
    END;
    $fn$
  `)
  await client.query('GRANT EXECUTE ON FUNCTION wa_quiz_recovery_scan() TO anon, authenticated')
  console.log('   OK RPC criada')

  // 5. Dry-run: quantos seriam enfileirados?
  console.log('\n5. Dry-run — quiz abandonados elegiveis:')
  const abandoned = await client.query(`
    SELECT e.contact_name, e.contact_phone, max(e.created_at) as last_event
    FROM quiz_events e
    WHERE e.contact_phone IS NOT NULL AND e.contact_phone != ''
      AND e.event_type = 'step_view' AND e.step_index >= 10
      AND NOT EXISTS (SELECT 1 FROM quiz_responses r WHERE r.contact_phone = e.contact_phone)
      AND e.created_at < now() - interval '1 hour'
    GROUP BY e.contact_name, e.contact_phone
    ORDER BY max(e.created_at) DESC
  `)
  console.log('   Total:', abandoned.rows.length)
  abandoned.rows.forEach(r => console.log('   ', r.contact_name, '|', r.contact_phone, '|', r.last_event))

  // 6. PostgREST reload
  await client.query("NOTIFY pgrst, 'reload schema'")

  await client.end()
  console.log('\n=== Setup completo ===')
  console.log('Para disparar: SELECT wa_quiz_recovery_scan()')
}
main().catch(err => { console.error(err); process.exit(1) })
