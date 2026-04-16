/**
 * Migra scheduling_confirm_novo/retorno de wa_message_templates
 * para wa_agenda_automations como regras on_status=agendado com
 * trigger_config.patient_type = 'novo'|'retorno'.
 */
const { Client } = require('pg')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()

  // 1. Busca os 2 templates ativos
  var r = await client.query(`
    SELECT slug, content FROM wa_message_templates
    WHERE slug IN ('scheduling_confirm_novo', 'scheduling_confirm_retorno') AND is_active = true
  `)
  var bySlug = {}
  r.rows.forEach(function(row) { bySlug[row.slug] = row.content })

  if (!bySlug.scheduling_confirm_novo || !bySlug.scheduling_confirm_retorno) {
    console.error('ERRO: templates origem nao encontrados')
    process.exit(1)
  }

  console.log('Textos origem capturados:')
  console.log(' - scheduling_confirm_novo:',    bySlug.scheduling_confirm_novo.slice(0, 80) + '...')
  console.log(' - scheduling_confirm_retorno:', bySlug.scheduling_confirm_retorno.slice(0, 80) + '...')

  // 2. Verifica se ja existem regras espelhadas (idempotente)
  var ex = await client.query(`
    SELECT id, name, trigger_config FROM wa_agenda_automations
    WHERE trigger_type = 'on_status'
      AND trigger_config->>'status' = 'agendado'
      AND trigger_config->>'patient_type' IN ('novo', 'retorno')
  `)
  if (ex.rows.length > 0) {
    console.log('\nRegras ja existem:')
    console.table(ex.rows.map(function(r) { return { id: r.id.slice(0, 8), name: r.name, patient_type: r.trigger_config.patient_type } }))
    console.log('Nada a fazer. Para forcar recriacao, delete essas regras primeiro.')
    await client.end()
    return
  }

  // 3. Cria 2 regras novas
  var novo = await client.query(`
    INSERT INTO wa_agenda_automations (
      name, description, category, trigger_type, trigger_config,
      recipient_type, channel, content_template, is_active, sort_order
    ) VALUES (
      'Confirmacao Agendamento — Paciente Novo',
      'Msg imediata ao agendar paciente NOVO. Inclui link de anamnese. Migrada de wa_message_templates slug scheduling_confirm_novo.',
      'before',
      'on_status',
      '{"status": "agendado", "patient_type": "novo"}'::jsonb,
      'patient',
      'whatsapp',
      $1,
      true,
      1
    ) RETURNING id
  `, [bySlug.scheduling_confirm_novo])
  console.log('\n[OK] Regra NOVO criada:', novo.rows[0].id)

  var retorno = await client.query(`
    INSERT INTO wa_agenda_automations (
      name, description, category, trigger_type, trigger_config,
      recipient_type, channel, content_template, is_active, sort_order
    ) VALUES (
      'Confirmacao Agendamento — Paciente Retorno',
      'Msg imediata ao agendar paciente RETORNO (sem link de anamnese). Migrada de wa_message_templates slug scheduling_confirm_retorno.',
      'before',
      'on_status',
      '{"status": "agendado", "patient_type": "retorno"}'::jsonb,
      'patient',
      'whatsapp',
      $1,
      true,
      2
    ) RETURNING id
  `, [bySlug.scheduling_confirm_retorno])
  console.log('[OK] Regra RETORNO criada:', retorno.rows[0].id)

  console.log('\n[DONE] As 2 regras estao agora em wa_agenda_automations com patient_type para filtragem.')

  await client.end()
}

main().catch(function(e) { console.error('ERRO:', e.message); process.exit(1) })
