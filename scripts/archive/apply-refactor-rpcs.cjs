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
  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260700000005_refactor_rpcs_to_agenda_automations.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  console.log('Aplicando migration refactor RPCs...')
  try {
    await client.query(sql)
    console.log('OK — migration aplicada')

    const r = await client.query(`
      SELECT slug, name, trigger_type, is_active
      FROM wa_agenda_automations
      WHERE slug IS NOT NULL
      ORDER BY slug
    `)
    console.log('\nRegras com slug (fonte unica para RPCs backend):')
    r.rows.forEach(row => {
      console.log(`  ${row.slug.padEnd(26)} | ${row.name.padEnd(30)} | ${row.trigger_type.padEnd(10)} | active=${row.is_active}`)
    })

    const rpc = await client.query(`
      SELECT proname FROM pg_proc
      WHERE proname IN ('wa_auto_confirm_appointment','wa_quiz_recovery_scan','wa_enqueue_onboarding')
      ORDER BY proname
    `)
    console.log('\nRPCs atualizadas:', rpc.rows.map(r => r.proname).join(', '))
  } catch (e) {
    console.error('ERRO:', e.message)
    console.error(e.detail || '')
    process.exit(1)
  }
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
