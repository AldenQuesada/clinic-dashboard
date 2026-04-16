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
    SELECT id, name, description, trigger_type, trigger_config, is_active
    FROM wa_agenda_automations
    WHERE trigger_type = 'min_before'
      AND (trigger_config->>'minutes')::int = 30
    ORDER BY name
  `)
  console.log('Regras encontradas (min_before = 30):')
  if (!before.rows.length) { console.log('  (nenhuma)'); await client.end(); return }
  before.rows.forEach(r => console.log(`  ${r.id} | ${r.name} | active=${r.is_active}`))

  const pendingOutbox = await client.query(`
    SELECT COUNT(*)::int AS n
    FROM wa_outbox
    WHERE status IN ('pending','scheduled')
      AND content LIKE '%comeca em *30 minutos*%'
  `)
  console.log(`\nwa_outbox pending/scheduled com conteudo de "30 min antes": ${pendingOutbox.rows[0].n}`)

  const cancelled = await client.query(`
    UPDATE wa_outbox
       SET status = 'cancelled'
     WHERE status IN ('pending','scheduled')
       AND content LIKE '%comeca em *30 minutos*%'
    RETURNING id
  `)
  console.log(`wa_outbox cancelados: ${cancelled.rowCount}`)

  const del = await client.query(`
    DELETE FROM wa_agenda_automations
     WHERE trigger_type = 'min_before'
       AND (trigger_config->>'minutes')::int = 30
    RETURNING id, name
  `)
  console.log(`\nRegras deletadas: ${del.rowCount}`)
  del.rows.forEach(r => console.log(`  ${r.id} | ${r.name}`))

  const after = await client.query(`
    SELECT COUNT(*)::int AS n
    FROM wa_agenda_automations
    WHERE trigger_type = 'min_before'
      AND (trigger_config->>'minutes')::int = 30
  `)
  console.log(`\nRestantes apos DELETE: ${after.rows[0].n}`)

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
