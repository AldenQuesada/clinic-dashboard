const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // Conversa real do Alden
  const conv = await client.query(
    "SELECT id, phone FROM wa_conversations WHERE phone LIKE '%98787673%' ORDER BY last_message_at DESC"
  )
  console.log('Conversas Alden:')
  conv.rows.forEach(r => console.log(' ', r.id, '|', r.phone))

  // Todas as msgs na conversa real
  for (const c of conv.rows) {
    const msgs = await client.query(`
      SELECT direction, sender, substring(content from 1 for 80) as txt, sent_at
      FROM wa_messages WHERE conversation_id = $1
      ORDER BY sent_at DESC
    `, [c.id])
    console.log('\nMsgs em', c.phone, '(' + msgs.rowCount + ' total):')
    msgs.rows.forEach(r => console.log(' ', r.direction, '|', r.sender, '|', r.txt))
  }

  // Checar se ha msgs inbound HOJE
  const today = await client.query(`
    SELECT m.direction, m.sender, substring(m.content from 1 for 80) as txt, c.phone
    FROM wa_messages m
    JOIN wa_conversations c ON c.id = m.conversation_id
    WHERE m.direction = 'inbound' AND m.sent_at > '2026-04-05'
    ORDER BY m.sent_at DESC
  `)
  console.log('\n=== Inbound HOJE (todos leads) ===')
  console.log('Total:', today.rowCount)
  today.rows.forEach(r => console.log(' ', r.phone, '|', r.txt))

  await client.end()
}
main().catch(console.error)
