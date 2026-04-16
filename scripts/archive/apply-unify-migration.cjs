const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

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
  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260700000000_unify_wa_automations.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  console.log('Aplicando migration de unificacao...')
  try {
    await client.query(sql)
    console.log('✓ Migration aplicada com sucesso')

    const a = await client.query(`SELECT COUNT(*) AS n FROM wa_agenda_automations WHERE is_active = true`)
    const b = await client.query(`SELECT COUNT(*) AS n FROM wa_agenda_automations WHERE is_active = false`)
    const c = await client.query(`SELECT COUNT(*) AS n FROM wa_message_templates WHERE is_active = true`)
    console.log(`\nwa_agenda_automations ativas:   ${a.rows[0].n}`)
    console.log(`wa_agenda_automations inativas: ${b.rows[0].n}`)
    console.log(`wa_message_templates ativos:    ${c.rows[0].n}`)
  } catch (e) {
    console.error('✗ Erro:', e.message)
    console.error(e.detail || '')
    process.exit(1)
  }
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
