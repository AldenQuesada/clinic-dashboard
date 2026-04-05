const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // 1. Buscar campanhas de birthday ativas (sending/responded)
  const camps = await client.query(`
    SELECT id, lead_name, lead_phone, status, is_excluded, started_at
    FROM wa_birthday_campaigns
    WHERE status IN ('sending', 'responded', 'pending')
    ORDER BY created_at DESC LIMIT 20
  `)
  console.log('=== Campanhas birthday ativas ===')
  camps.rows.forEach(r => console.log(' ', r.lead_name, '|', r.lead_phone, '|', r.status, '| excluded:', r.is_excluded))

  // 2. Buscar as 3 leads especificas
  const names = ['Michele Castro', 'Silvia', 'Arlete Furlan']
  for (const name of names) {
    const lead = await client.query(
      "SELECT id, name, phone FROM leads WHERE name ILIKE '%' || $1 || '%' LIMIT 3",
      [name]
    )
    console.log('\n--- ' + name + ' ---')
    lead.rows.forEach(r => console.log('  Lead:', r.id, '|', r.name, '|', r.phone))

    for (const l of lead.rows) {
      // Checar outbox
      const outbox = await client.query(`
        SELECT id, phone, status, substring(content from 1 for 60) as txt, sent_at, wa_message_id
        FROM wa_outbox WHERE lead_id = $1
        ORDER BY created_at DESC LIMIT 3
      `, [l.id])
      if (outbox.rows.length > 0) {
        console.log('  Outbox:')
        outbox.rows.forEach(r => console.log('   ', r.status, '|', r.phone, '|', r.txt))
      }

      // Checar conversas
      const convs = await client.query(`
        SELECT id, phone, remote_jid, display_name
        FROM wa_conversations
        WHERE phone LIKE '%' || right($1, 11) OR lead_id = $2
        LIMIT 3
      `, [l.phone, l.id])
      if (convs.rows.length > 0) {
        console.log('  Conversas:')
        convs.rows.forEach(r => console.log('   ', r.id.substring(0,8), '|', r.phone, '| jid:', r.remote_jid, '| name:', r.display_name))
      } else {
        console.log('  Conversas: NENHUMA')
      }
    }
  }

  // 3. Checar msgs enviadas hoje pelo outbox que NAO entraram na Central
  const todayOutbox = await client.query(`
    SELECT o.id, o.phone, o.lead_id, o.status, o.wa_message_id, o.sent_at,
           substring(o.content from 1 for 50) as txt
    FROM wa_outbox o
    WHERE o.sent_at > '2026-04-05'
      AND o.status = 'sent'
    ORDER BY o.sent_at DESC
  `)
  console.log('\n=== Outbox enviados HOJE ===')
  todayOutbox.rows.forEach(r => console.log(' ', r.phone, '|', r.status, '|', r.wa_message_id ? 'WA_OK' : 'NO_WA_ID', '|', r.txt))

  // 4. Checar se essas msgs tem wa_messages correspondentes
  for (const o of todayOutbox.rows) {
    const msg = await client.query(`
      SELECT m.id FROM wa_messages m
      WHERE m.wa_message_id = $1
    `, [o.wa_message_id])
    const inInbox = msg.rows.length > 0 ? 'SIM' : 'NAO'
    console.log('  → wa_messages:', inInbox, '| outbox:', o.id.substring(0,8))
  }

  await client.end()
}
main().catch(console.error)
