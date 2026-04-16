/**
 * Lê conteúdo completo dos templates que vão ser fundidos (Categoria 3)
 * para preparar o texto da fusão na migration.
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

  // Fusão 1: auto_reply_cancelled + Cancelamento
  console.log('════ FUSÃO 1: cancelado ════')
  const f1a = await client.query(`SELECT content FROM wa_message_templates WHERE slug='auto_reply_cancelled'`)
  const f1b = await client.query(`SELECT content_template FROM wa_agenda_automations WHERE name='Cancelamento'`)
  console.log('\n[B] auto_reply_cancelled:')
  console.log(f1a.rows[0]?.content)
  console.log('\n[A] Cancelamento:')
  console.log(f1b.rows[0]?.content_template)

  // Fusão 2: scheduling_reschedule + Remarcamento
  console.log('\n════ FUSÃO 2: remarcado ════')
  const f2a = await client.query(`SELECT content FROM wa_message_templates WHERE slug='scheduling_reschedule'`)
  const f2b = await client.query(`SELECT content_template FROM wa_agenda_automations WHERE name='Remarcamento'`)
  console.log('\n[B] scheduling_reschedule:')
  console.log(f2a.rows[0]?.content)
  console.log('\n[A] Remarcamento:')
  console.log(f2b.rows[0]?.content_template)

  // Fusão 3: paciente_pos_consulta (d+3) + Pos-procedimento D+3
  console.log('\n════ FUSÃO 3: D+3 pos-consulta ════')
  const f3a = await client.query(`SELECT content FROM wa_message_templates WHERE slug='paciente_pos_consulta'`)
  const f3b = await client.query(`SELECT content_template FROM wa_agenda_automations WHERE name='Pos-procedimento D+3'`)
  console.log('\n[B] paciente_pos_consulta:')
  console.log(f3a.rows[0]?.content)
  console.log('\n[A] Pos-procedimento D+3:')
  console.log(f3b.rows[0]?.content_template)

  // Fusão 4: pós-procedimento + Pos-procedimento D+1
  console.log('\n════ FUSÃO 4: D+1 pos ════')
  const f4a = await client.query(`SELECT content FROM wa_message_templates WHERE slug='pós-procedimento'`)
  const f4b = await client.query(`SELECT content_template FROM wa_agenda_automations WHERE name='Pos-procedimento D+1'`)
  console.log('\n[B] pós-procedimento:')
  console.log(f4a.rows[0]?.content)
  console.log('\n[A] Pos-procedimento D+1:')
  console.log(f4b.rows[0]?.content_template)

  // Fusão 5: menu_da_clinica + Consentimento Imagem
  console.log('\n════ FUSÃO 5: na_clinica ════')
  const f5a = await client.query(`SELECT content FROM wa_message_templates WHERE slug='menu_da_clinica'`)
  const f5b = await client.query(`SELECT content_template FROM wa_agenda_automations WHERE name='Consentimento Imagem'`)
  console.log('\n[B] menu_da_clinica:')
  console.log(f5a.rows[0]?.content)
  console.log('\n[A] Consentimento Imagem:')
  console.log(f5b.rows[0]?.content_template)

  // Standalone novos (não há versão A)
  console.log('\n════ NOVOS (sem fusão): migrar direto ════')
  const nov = await client.query(`
    SELECT slug, content FROM wa_message_templates
    WHERE slug IN ('auto_reply_confirmed','post_consultation')
  `)
  nov.rows.forEach(r => { console.log(`\n[${r.slug}]:`); console.log(r.content) })

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
