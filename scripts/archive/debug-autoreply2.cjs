const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // TODAS as conversas que existem pro Alden (qualquer phone pattern)
  const allConvs = await client.query(`
    SELECT id, phone, lead_id, status, display_name, ai_enabled, created_at
    FROM wa_conversations
    WHERE lead_id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'
       OR phone = '5544998787673'
       OR phone LIKE '%998787673%'
    ORDER BY created_at
  `)
  console.log('Todas conversas Alden:')
  allConvs.rows.forEach(r => console.log(' ', r.id, '| phone:', r.phone, '| display:', r.display_name, '| ai:', r.ai_enabled, '| created:', r.created_at))

  // Msgs inbound no ultimo dia (qualquer conversa)
  const allInbound = await client.query(`
    SELECT m.conversation_id, m.direction, substring(m.content from 1 for 80) as txt, m.sent_at
    FROM wa_messages m
    JOIN wa_conversations c ON c.id = m.conversation_id
    WHERE c.phone = '5544998787673'
    ORDER BY m.sent_at DESC LIMIT 10
  `)
  console.log('\nTodas msgs do Alden (qualquer conversa):')
  allInbound.rows.forEach(r => console.log(' ', r.conversation_id?.substring(0,8), '|', r.direction, '|', r.txt))

  // Checar se o n8n usa remote_jid ao inves de phone
  const convCols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'wa_conversations' AND column_name LIKE '%jid%' OR column_name LIKE '%remote%'"
  )
  console.log('\nColunas jid:', convCols.rows.map(r => r.column_name))

  // Buscar por remote_jid
  const jidConv = await client.query(`
    SELECT id, phone, remote_jid, display_name
    FROM wa_conversations
    WHERE remote_jid LIKE '%998787673%'
  `)
  console.log('\nConversas por remote_jid:')
  jidConv.rows.forEach(r => console.log(' ', r.id, '| phone:', r.phone, '| jid:', r.remote_jid, '| name:', r.display_name))

  await client.end()
}
main().catch(console.error)
