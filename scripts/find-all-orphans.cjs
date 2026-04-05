const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // 1. TODAS as msgs do outbox enviadas que NAO tem wa_messages
  const orphans = await client.query(`
    SELECT o.id, o.phone, o.lead_id, o.status, o.wa_message_id, o.sent_at,
           substring(o.content from 1 for 60) as txt,
           l.name as lead_name
    FROM wa_outbox o
    LEFT JOIN leads l ON l.id = o.lead_id
    WHERE o.status = 'sent'
      AND NOT EXISTS (
        SELECT 1 FROM wa_messages m WHERE m.wa_message_id = o.wa_message_id
      )
    ORDER BY o.sent_at DESC
  `)

  console.log('=== TODAS msgs orfas (outbox sent, sem wa_messages) ===')
  console.log('Total:', orphans.rows.length)
  orphans.rows.forEach(r => console.log(
    ' ', r.lead_name || 'SEM LEAD',
    '|', r.phone,
    '|', r.sent_at?.toISOString?.() || r.sent_at,
    '|', r.txt
  ))

  // 2. Buscar Sabrina especificamente
  console.log('\n=== Sabrina Almeida ===')
  const sabrina = await client.query(
    "SELECT id, name, phone FROM leads WHERE name ILIKE '%sabrina%almeida%' LIMIT 3"
  )
  sabrina.rows.forEach(r => console.log('  Lead:', r.id, '|', r.name, '|', r.phone))

  for (const s of sabrina.rows) {
    const outbox = await client.query(`
      SELECT id, phone, status, wa_message_id, sent_at, substring(content from 1 for 80) as txt
      FROM wa_outbox WHERE lead_id = $1 OR phone = $2
      ORDER BY created_at DESC LIMIT 5
    `, [s.id, s.phone])
    console.log('  Outbox:')
    outbox.rows.forEach(r => console.log('   ', r.status, '|', r.phone, '|', r.wa_message_id ? 'WA_OK' : 'NO_WA', '|', r.txt))

    const conv = await client.query(`
      SELECT id, phone FROM wa_conversations
      WHERE phone LIKE '%' || right($1, 11) OR lead_id = $2
    `, [s.phone, s.id])
    console.log('  Conversas:', conv.rows.length)
    conv.rows.forEach(r => console.log('   ', r.id.substring(0,8), '|', r.phone))
  }

  // 3. Contar total de msgs no outbox sem sync
  const stats = await client.query(`
    SELECT
      count(*) FILTER (WHERE status = 'sent') as total_sent,
      count(*) FILTER (WHERE status = 'sent' AND NOT EXISTS (
        SELECT 1 FROM wa_messages m WHERE m.wa_message_id = wa_outbox.wa_message_id
      )) as orphans
    FROM wa_outbox
    WHERE wa_message_id IS NOT NULL
  `)
  console.log('\n=== Stats ===')
  console.log('Total sent com WA ID:', stats.rows[0]?.total_sent)
  console.log('Orfas (sem wa_messages):', stats.rows[0]?.orphans)

  await client.end()
}
main().catch(console.error)
