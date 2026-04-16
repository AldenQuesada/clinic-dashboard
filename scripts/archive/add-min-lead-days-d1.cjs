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

  const before = await client.query(`
    SELECT id, name, trigger_type, trigger_config
    FROM wa_agenda_automations
    WHERE trigger_type = 'd_before'
      AND name ILIKE 'Confirmacao D-1%'
  `)
  console.log('Regra alvo:')
  before.rows.forEach(r => console.log(`  ${r.id} | ${r.name} | ${JSON.stringify(r.trigger_config)}`))
  if (!before.rows.length) { console.log('  (nenhuma)'); await client.end(); return }

  const upd = await client.query(`
    UPDATE wa_agenda_automations
       SET trigger_config = trigger_config || '{"min_lead_days": 2}'::jsonb,
           updated_at     = now()
     WHERE trigger_type = 'd_before'
       AND name ILIKE 'Confirmacao D-1%'
    RETURNING id, name, trigger_config
  `)
  console.log(`\nAtualizadas: ${upd.rowCount}`)
  upd.rows.forEach(r => console.log(`  ${r.id} | ${r.name} | ${JSON.stringify(r.trigger_config)}`))

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
