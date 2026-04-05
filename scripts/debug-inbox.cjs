const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // 1. Todas as msgs inbound do ultimo dia (qualquer lead)
  const inbound = await client.query(`
    SELECT m.id, m.direction, m.sender, substring(m.content from 1 for 60) as txt,
           m.sent_at, c.phone, c.display_name
    FROM wa_messages m
    JOIN wa_conversations c ON c.id = m.conversation_id
    WHERE m.direction = 'inbound'
    ORDER BY m.sent_at DESC LIMIT 20
  `)
  console.log('=== Ultimas 20 msgs INBOUND (todos leads) ===')
  if (inbound.rows.length === 0) {
    console.log('  ZERO msgs inbound no banco!')
  }
  inbound.rows.forEach(r => console.log(' ', r.phone, '|', r.display_name, '|', r.txt, '|', r.sent_at))

  // 2. Todas as msgs (inbound+outbound) recentes
  const all = await client.query(`
    SELECT m.direction, m.sender, substring(m.content from 1 for 60) as txt,
           m.sent_at, c.phone
    FROM wa_messages m
    JOIN wa_conversations c ON c.id = m.conversation_id
    ORDER BY m.sent_at DESC LIMIT 20
  `)
  console.log('\n=== Ultimas 20 msgs (qualquer direcao) ===')
  all.rows.forEach(r => console.log(' ', r.direction, '|', r.phone, '|', r.sender, '|', r.txt))

  // 3. Total de msgs por direcao
  const stats = await client.query(`
    SELECT direction, count(*) as total FROM wa_messages GROUP BY direction
  `)
  console.log('\n=== Stats msgs ===')
  stats.rows.forEach(r => console.log(' ', r.direction, ':', r.total))

  // 4. Conversas ativas
  const convs = await client.query(`
    SELECT id, phone, display_name, last_message_at, last_lead_msg
    FROM wa_conversations
    WHERE status = 'active'
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT 10
  `)
  console.log('\n=== Conversas ativas (top 10) ===')
  convs.rows.forEach(r => console.log(' ', r.phone, '|', r.display_name, '| last_msg:', r.last_message_at, '| last_lead:', r.last_lead_msg))

  await client.end()
}
main().catch(console.error)
