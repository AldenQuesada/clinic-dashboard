const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // Todas conversas do Alden (qualquer formato de phone)
  const convs = await client.query(`
    SELECT id, phone, display_name, status, created_at, last_message_at
    FROM wa_conversations
    WHERE phone LIKE '%98787673%'
    ORDER BY created_at DESC
  `)
  console.log('Conversas com 98787673:')
  convs.rows.forEach(r => console.log(' ', r.id.substring(0,8), '| phone:', r.phone, '| name:', r.display_name, '| status:', r.status, '| created:', r.created_at))

  // Checar se tem msgs em conversas criadas HOJE
  for (const c of convs.rows) {
    const msgs = await client.query(`
      SELECT direction, sender, substring(content from 1 for 60) as txt, sent_at
      FROM wa_messages WHERE conversation_id = $1
      ORDER BY sent_at DESC LIMIT 3
    `, [c.id])
    if (msgs.rowCount > 0) {
      console.log('\n  Msgs em', c.phone, '(', c.id.substring(0,8), '):')
      msgs.rows.forEach(r => console.log('   ', r.direction, '|', r.sender, '|', r.txt))
    }
  }

  await client.end()
}
main().catch(console.error)
