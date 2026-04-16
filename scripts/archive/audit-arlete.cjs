const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // 1. Buscar Arlete por nome
  console.log('=== Buscando Arlete ===')
  const leads = await client.query(
    "SELECT id, name, phone FROM leads WHERE name ILIKE '%arlete%' OR name ILIKE '%furlan%'"
  )
  console.log('Leads encontrados:')
  leads.rows.forEach(r => console.log(' ', r.id, '|', r.name, '|', r.phone))

  // 2. Buscar campanha de birthday da Arlete
  for (const l of leads.rows) {
    const camp = await client.query(`
      SELECT id, lead_name, lead_phone, status, is_excluded, exclude_reason, excluded_at, excluded_by,
             started_at, responded_at, created_at
      FROM wa_birthday_campaigns
      WHERE lead_id = $1 OR lead_name ILIKE '%arlete%' OR lead_name ILIKE '%furlan%'
    `, [l.id])
    console.log('\nCampanhas:')
    camp.rows.forEach(r => {
      console.log('  ID:', r.id)
      console.log('  Nome:', r.lead_name)
      console.log('  Phone:', r.lead_phone)
      console.log('  Status:', r.status)
      console.log('  is_excluded:', r.is_excluded)
      console.log('  exclude_reason:', r.exclude_reason)
      console.log('  excluded_at:', r.excluded_at)
      console.log('  excluded_by:', r.excluded_by)
      console.log('  started_at:', r.started_at)
      console.log('  created_at:', r.created_at)
    })

    // 3. Checar birthday_messages
    if (camp.rows.length > 0) {
      const msgs = await client.query(`
        SELECT bm.id, bm.status, bm.day_offset, bm.scheduled_at, bm.sent_at, bm.outbox_id
        FROM wa_birthday_messages bm
        WHERE bm.campaign_id = $1
        ORDER BY bm.day_offset DESC
      `, [camp.rows[0].id])
      console.log('\n  Birthday messages:')
      msgs.rows.forEach(r => console.log('   D-' + r.day_offset, '|', r.status, '| scheduled:', r.scheduled_at, '| sent:', r.sent_at, '| outbox:', r.outbox_id))
    }

    // 4. Checar outbox
    const outbox = await client.query(`
      SELECT id, phone, status, sent_at, substring(content from 1 for 60) as txt
      FROM wa_outbox WHERE lead_id = $1
      ORDER BY created_at DESC LIMIT 5
    `, [l.id])
    if (outbox.rows.length > 0) {
      console.log('\n  Outbox:')
      outbox.rows.forEach(r => console.log('   ', r.status, '|', r.phone, '|', r.txt))
    }
  }

  // 5. Verificar a RPC wa_birthday_toggle_lead
  console.log('\n=== Verificando RPC toggle_lead ===')
  const fn = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'wa_birthday_toggle_lead' LIMIT 1
  `)
  console.log(fn.rows[0]?.prosrc)

  // 6. Verificar a RPC wa_birthday_pause_all
  const fn2 = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'wa_birthday_pause_all' LIMIT 1
  `)
  console.log('\n=== wa_birthday_pause_all ===')
  console.log(fn2.rows[0]?.prosrc)

  await client.end()
}
main().catch(console.error)
