const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

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
      v_rec       record;
      v_msg       text;
      v_phone     text;
      v_first_name text;
      v_queixas   text;
      v_enqueued  int := 0;
      v_lead      record;
      v_queixas_arr jsonb;
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

      -- Mesma logica da tabela de abandonados:
      -- sessoes que NAO tem quiz_complete, com telefone preenchido
      FOR v_rec IN
        SELECT
          max(e.contact_name) FILTER (WHERE e.contact_name IS NOT NULL AND e.contact_name != '') as contact_name,
          max(e.contact_phone) FILTER (WHERE e.contact_phone IS NOT NULL AND e.contact_phone != '') as contact_phone,
          max(e.created_at) as abandoned_at,
          e.session_id
        FROM quiz_events e
        WHERE e.clinic_id = v_clinic_id
          AND e.event_type = 'step_view'
          -- Tem telefone (chegou no step de contato)
          AND e.contact_phone IS NOT NULL
          AND e.contact_phone != ''
          -- Sessao NAO completou o quiz
          AND e.session_id NOT IN (
            SELECT session_id
            FROM quiz_events
            WHERE quiz_id = e.quiz_id
              AND event_type = 'quiz_complete'
          )
          -- NAO recebeu recuperacao nos ultimos 7 dias
          AND NOT EXISTS (
            SELECT 1 FROM wa_outbox o
            WHERE o.phone LIKE '%' || right(regexp_replace(e.contact_phone, '[^0-9]', '', 'g'), 8)
              AND o.content LIKE '%finalizou%'
              AND o.created_at > now() - interval '7 days'
          )
        GROUP BY e.session_id
        ORDER BY max(e.created_at) DESC
      LOOP
        v_phone := '55' || regexp_replace(v_rec.contact_phone, '[^0-9]', '', 'g');

        SELECT * INTO v_lead
        FROM leads
        WHERE phone LIKE '%' || right(v_phone, 8)
          AND deleted_at IS NULL
        LIMIT 1;

        v_first_name := split_part(COALESCE(v_rec.contact_name, ''), ' ', 1);
        IF v_first_name = '' THEN v_first_name := 'você'; END IF;

        -- Queixas: do quiz_events.metadata, fallback pra leads.queixas_faciais
        v_queixas := '';
        SELECT ev2.metadata->'queixas' INTO v_queixas_arr
        FROM quiz_events ev2
        WHERE ev2.session_id = v_rec.session_id
          AND ev2.metadata->'queixas' IS NOT NULL
          AND jsonb_typeof(ev2.metadata->'queixas') = 'array'
        ORDER BY ev2.created_at DESC
        LIMIT 1;

        IF v_queixas_arr IS NOT NULL AND jsonb_typeof(v_queixas_arr) = 'array'
           AND jsonb_array_length(v_queixas_arr) > 0 THEN
          SELECT string_agg(value #>> '{}', ', ') INTO v_queixas
          FROM (SELECT value FROM jsonb_array_elements(v_queixas_arr) LIMIT 3) sub;
        ELSIF v_lead IS NOT NULL AND v_lead.queixas_faciais IS NOT NULL
              AND jsonb_typeof(v_lead.queixas_faciais) = 'array'
              AND jsonb_array_length(v_lead.queixas_faciais) > 0 THEN
          SELECT string_agg(value #>> '{}', ', ') INTO v_queixas
          FROM (SELECT value FROM jsonb_array_elements(v_lead.queixas_faciais) LIMIT 3) sub;
        END IF;

        v_msg := v_template.message;
        v_msg := replace(v_msg, '{nome}', v_first_name);
        IF v_queixas != '' AND v_queixas IS NOT NULL THEN
          v_msg := replace(v_msg, '{queixas}', lower(v_queixas));
        ELSE
          v_msg := replace(v_msg, ' e se incomoda com {queixas},', ',');
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
  await client.query("NOTIFY pgrst, 'reload schema'")
  console.log('RPC atualizada: mesma logica da tabela de abandonados, sem grace period')
  console.log('Cron a cada 2 min → max ~4 min entre abandono e mensagem')

  await client.end()
}
main().catch(err => { console.error(err); process.exit(1) })
