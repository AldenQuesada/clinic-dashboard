const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // 1. Campanha status
  const camp = await client.query(
    "SELECT id, status, responded_at FROM wa_birthday_campaigns WHERE lead_id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'"
  )
  console.log('Campanha:', camp.rows[0]?.status, camp.rows[0]?.responded_at)

  // 2. Msgs na conversa
  const msgs = await client.query(`
    SELECT direction, sender, substring(content from 1 for 80) as txt, sent_at
    FROM wa_messages
    WHERE conversation_id = '4c055dd5-75b7-4c1d-971f-df0c49cdfab6'
    ORDER BY sent_at DESC LIMIT 10
  `)
  console.log('\nMsgs conversa Alden:')
  msgs.rows.forEach(r => console.log(' ', r.direction, '|', r.sender, '|', r.txt))

  // 3. Trigger ativo?
  const trigs = await client.query(
    "SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_birthday_detect_response'"
  )
  console.log('\nTrigger:', trigs.rows[0]?.tgname, '| enabled:', trigs.rows[0]?.tgenabled)

  // 4. Vinculo campanha→outbox
  const link = await client.query(`
    SELECT bc.id as camp_id, bc.status, bm.outbox_id, o.phone, o.status as o_status
    FROM wa_birthday_campaigns bc
    JOIN wa_birthday_messages bm ON bm.campaign_id = bc.id
    JOIN wa_outbox o ON o.id = bm.outbox_id
    WHERE bc.lead_id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'
  `)
  console.log('\nVinculo camp→outbox:', link.rows.length, 'rows')
  link.rows.forEach(r => console.log(' ', JSON.stringify(r)))

  // 5. Verificar: a conversa do outbox vs conversa real do Alden
  const convCheck = await client.query(`
    SELECT c.id, c.phone, c.lead_id
    FROM wa_conversations c
    WHERE c.phone = '5544998787673'
    ORDER BY c.created_at
  `)
  console.log('\nConversas com phone 5544998787673:')
  convCheck.rows.forEach(r => console.log(' ', r.id, '| lead:', r.lead_id))

  // 6. Msgs inbound recentes (qualquer conversa)
  const inbound = await client.query(`
    SELECT m.conversation_id, c.phone, m.direction, substring(m.content from 1 for 60) as txt
    FROM wa_messages m
    JOIN wa_conversations c ON c.id = m.conversation_id
    WHERE m.direction = 'inbound' AND m.sent_at > now() - interval '1 hour'
    ORDER BY m.sent_at DESC LIMIT 5
  `)
  console.log('\nInbound recentes (1h):')
  inbound.rows.forEach(r => console.log(' ', r.phone, '|', r.txt))

  await client.end()
}
main().catch(console.error)
