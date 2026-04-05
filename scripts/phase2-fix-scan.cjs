const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== FASE 2: Reescrever wa_birthday_scan ===\n')

  // Correcoes:
  // 1. Timezone: usar America/Sao_Paulo em vez de UTC
  // 2. NAO gravar conteudo na birthday_messages — ler do template no momento do envio
  // 3. Remover fallback "aquelas coisinhas" — tratar no JS e no enqueue
  // 4. Validar que scheduled_at e FUTURO antes de criar msg
  // 5. Se nenhuma msg futura, NAO criar campanha (evita campanhas vazias)

  await client.query('DROP FUNCTION IF EXISTS wa_birthday_scan()')
  await client.query(`
    CREATE OR REPLACE FUNCTION wa_birthday_scan()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
      v_tz         text := 'America/Sao_Paulo';
      v_now        timestamptz := now();
      v_today      date := (v_now AT TIME ZONE v_tz)::date;
      v_year       int := EXTRACT(YEAR FROM v_today)::int;
      v_created    int := 0;
      v_lead       record;
      v_campaign_id uuid;
      v_tmpl       record;
      v_bday       date;
      v_queixas    text;
      v_has_budget boolean;
      v_budget_id  uuid;
      v_budget_total numeric;
      v_budget_title text;
      v_segment    text;
      v_sched      timestamptz;
      v_msgs_created int;
    BEGIN
      FOR v_lead IN
        SELECT l.id, l.name, l.phone, l.birth_date::date AS bd,
               l.queixas_faciais, l.queixas_corporais, l.phase,
               l.wa_opt_in, l.channel_mode
        FROM leads l
        WHERE l.clinic_id = v_clinic_id
          AND l.deleted_at IS NULL
          AND l.birth_date IS NOT NULL AND l.birth_date != ''
          AND l.phone IS NOT NULL AND l.phone != ''
          AND l.wa_opt_in = true
          AND (
            make_date(v_year, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int)
            BETWEEN v_today AND v_today + 31
          )
          AND NOT EXISTS (
            SELECT 1 FROM wa_birthday_campaigns c
            WHERE c.lead_id = l.id AND c.campaign_year = v_year
              AND c.status NOT IN ('cancelled')
          )
          AND COALESCE(l.channel_mode, 'ai') != 'human'
      LOOP
        v_bday := make_date(v_year, EXTRACT(MONTH FROM v_lead.bd)::int, EXTRACT(DAY FROM v_lead.bd)::int);

        -- Resolver queixas (vazio se nao tem — JS trata o fallback)
        v_queixas := '';
        IF v_lead.queixas_faciais IS NOT NULL AND jsonb_array_length(v_lead.queixas_faciais) > 0 THEN
          SELECT string_agg(value #>> '{}', ', ') INTO v_queixas
          FROM jsonb_array_elements(v_lead.queixas_faciais);
        END IF;
        IF v_lead.queixas_corporais IS NOT NULL AND jsonb_array_length(v_lead.queixas_corporais) > 0 THEN
          IF v_queixas != '' THEN v_queixas := v_queixas || ', '; END IF;
          SELECT v_queixas || string_agg(value #>> '{}', ', ') INTO v_queixas
          FROM jsonb_array_elements(v_lead.queixas_corporais);
        END IF;
        -- NAO usar fallback aqui — queixas vazio = template sem linha de queixas

        -- Orcamento
        v_has_budget := false;
        v_budget_id := NULL;
        v_budget_total := NULL;
        v_budget_title := NULL;
        SELECT b.id, b.total, b.title INTO v_budget_id, v_budget_total, v_budget_title
        FROM budgets b
        WHERE b.lead_id = v_lead.id
          AND b.status NOT IN ('approved', 'lost', 'cancelled')
        ORDER BY b.created_at DESC LIMIT 1;
        IF v_budget_id IS NOT NULL THEN v_has_budget := true; END IF;

        -- Segmento
        IF v_lead.phase = 'paciente' AND v_has_budget THEN
          v_segment := 'paciente_orcamento';
        ELSIF v_has_budget OR v_lead.phase = 'orcamento' THEN
          v_segment := 'orcamento';
        ELSE
          v_segment := 'paciente';
        END IF;

        -- PRIMEIRO: contar quantas msgs futuras teria
        v_msgs_created := 0;
        FOR v_tmpl IN
          SELECT * FROM wa_birthday_templates
          WHERE clinic_id = v_clinic_id AND is_active = true
          ORDER BY sort_order, day_offset DESC
        LOOP
          -- Horario em timezone Brasil
          v_sched := (v_bday - v_tmpl.day_offset * interval '1 day')
                     + make_interval(hours => v_tmpl.send_hour);
          -- Converter pra timezone correto
          v_sched := (v_sched::date || ' ' || v_tmpl.send_hour || ':00:00')::timestamp
                     AT TIME ZONE v_tz;

          IF v_sched > v_now THEN
            v_msgs_created := v_msgs_created + 1;
          END IF;
        END LOOP;

        -- Se nenhuma msg futura, NAO criar campanha (evita campanhas vazias)
        IF v_msgs_created = 0 THEN
          CONTINUE;
        END IF;

        -- Criar campanha
        INSERT INTO wa_birthday_campaigns (
          clinic_id, lead_id, lead_name, lead_phone, birth_date,
          campaign_year, segment, status, has_open_budget,
          budget_id, budget_total, budget_title, queixas
        ) VALUES (
          v_clinic_id, v_lead.id, v_lead.name, v_lead.phone, v_bday,
          v_year, v_segment, 'pending', v_has_budget,
          v_budget_id, v_budget_total, v_budget_title,
          CASE WHEN v_queixas = '' THEN NULL ELSE v_queixas END
        )
        RETURNING id INTO v_campaign_id;

        -- Criar msgs (SEM conteudo — conteudo resolvido no enqueue)
        FOR v_tmpl IN
          SELECT * FROM wa_birthday_templates
          WHERE clinic_id = v_clinic_id AND is_active = true
          ORDER BY sort_order, day_offset DESC
        LOOP
          v_sched := (v_bday - v_tmpl.day_offset * interval '1 day')
                     + make_interval(hours => v_tmpl.send_hour);
          v_sched := (v_sched::date || ' ' || v_tmpl.send_hour || ':00:00')::timestamp
                     AT TIME ZONE v_tz;

          IF v_sched > v_now THEN
            INSERT INTO wa_birthday_messages (
              campaign_id, template_id, day_offset, send_hour,
              content, media_url, scheduled_at, status
            ) VALUES (
              v_campaign_id, v_tmpl.id, v_tmpl.day_offset, v_tmpl.send_hour,
              NULL, v_tmpl.media_url, v_sched, 'pending'
            );
          END IF;
        END LOOP;

        v_created := v_created + 1;
      END LOOP;

      RETURN jsonb_build_object(
        'ok', true,
        'campaigns_created', v_created,
        'year', v_year,
        'today', v_today
      );
    END;
    $fn$
  `)

  await client.query('GRANT EXECUTE ON FUNCTION wa_birthday_scan() TO anon, authenticated')
  console.log('✓ wa_birthday_scan reescrito')

  // Listar correcoes
  console.log('\nCorrecoes aplicadas:')
  console.log('  1. Timezone America/Sao_Paulo em vez de UTC')
  console.log('  2. Conteudo NULL na birthday_messages (resolvido no enqueue)')
  console.log('  3. Queixas vazio = NULL (sem fallback "aquelas coisinhas")')
  console.log('  4. Campanhas so criadas se tem pelo menos 1 msg futura')
  console.log('  5. Campanhas canceladas nao bloqueiam recriacao')

  // TESTE: simular scan (dry run)
  console.log('\n=== TESTE: Verificar leads elegiveis ===')
  const eligible = await client.query(`
    SELECT l.name, l.phone, l.birth_date::date as bd,
           make_date(2026, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int) as bday_2026
    FROM leads l
    WHERE l.clinic_id = '00000000-0000-0000-0000-000000000001'
      AND l.deleted_at IS NULL
      AND l.birth_date IS NOT NULL AND l.birth_date != ''
      AND l.phone IS NOT NULL AND l.phone != ''
      AND l.wa_opt_in = true
      AND (
        make_date(2026, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int)
        BETWEEN CURRENT_DATE AND CURRENT_DATE + 31
      )
      AND COALESCE(l.channel_mode, 'ai') != 'human'
    ORDER BY l.birth_date::date
  `)
  console.log('Leads com aniversario nos proximos 31 dias:', eligible.rows.length)
  eligible.rows.forEach(r => console.log('  ', r.name, '| birth:', r.bd, '| bday 2026:', r.bday_2026))

  // Verificar horarios que seriam agendados pra D-30 (13h BR)
  const now = new Date()
  console.log('\nAgora (UTC):', now.toISOString())
  console.log('Agora (BR):', new Date(now.getTime() - 3*3600*1000).toISOString().replace('Z', ' BR'))

  for (const r of eligible.rows.slice(0, 3)) {
    const bday = new Date(r.bday_2026)
    const d30 = new Date(bday.getTime() - 30 * 24 * 3600 * 1000)
    d30.setUTCHours(16, 0, 0, 0) // 13h BR = 16h UTC
    const d29 = new Date(bday.getTime() - 29 * 24 * 3600 * 1000)
    d29.setUTCHours(16, 0, 0, 0)
    const d28 = new Date(bday.getTime() - 28 * 24 * 3600 * 1000)
    d28.setUTCHours(16, 0, 0, 0)
    console.log('\n  ' + r.name + ':')
    console.log('    D-30:', d30.toISOString(), d30 > now ? '→ FUTURO ✓' : '→ PASSADO ✗')
    console.log('    D-29:', d29.toISOString(), d29 > now ? '→ FUTURO ✓' : '→ PASSADO ✗')
    console.log('    D-28:', d28.toISOString(), d28 > now ? '→ FUTURO ✓' : '→ PASSADO ✗')
  }

  await client.end()
}
main().catch(console.error)
