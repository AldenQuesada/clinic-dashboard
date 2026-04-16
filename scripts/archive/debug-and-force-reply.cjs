const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // 1. Verificar se msg inbound chegou AGORA
  const inbound = await client.query(`
    SELECT m.id, m.direction, m.sender, substring(m.content from 1 for 80) as txt,
           m.sent_at, c.phone, c.remote_jid
    FROM wa_messages m
    JOIN wa_conversations c ON c.id = m.conversation_id
    WHERE c.phone = '5544998787673'
    ORDER BY m.sent_at DESC LIMIT 10
  `)
  console.log('=== Msgs do Alden (todas) ===')
  inbound.rows.forEach(r => console.log(' ', r.direction, '|', r.sender, '|', r.txt))

  // 2. Verificar se ha OUTRA conversa pro Alden (Lara)
  const allConvs = await client.query(`
    SELECT id, phone, remote_jid, lead_id, display_name, ai_persona, created_at
    FROM wa_conversations
    WHERE phone LIKE '%998787673%' OR remote_jid LIKE '%998787673%'
    ORDER BY created_at
  `)
  console.log('\n=== Todas conversas 998787673 ===')
  allConvs.rows.forEach(r => console.log(' ', r.id.substring(0,8), '| jid:', r.remote_jid, '| name:', r.display_name, '| persona:', r.ai_persona))

  // 3. Campanha status
  const camp = await client.query(
    "SELECT id, status FROM wa_birthday_campaigns WHERE lead_id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'"
  )
  console.log('\n=== Campanha ===')
  console.log('Status:', camp.rows[0]?.status)

  // 4. Se campanha ainda sending, FORCAR responded pra testar o auto-reply
  if (camp.rows[0] && camp.rows[0].status === 'sending') {
    console.log('\n=== FORCANDO responded pra testar auto-reply ===')
    await client.query(`
      UPDATE wa_birthday_campaigns
      SET status = 'responded', responded_at = now()
      WHERE id = $1
    `, [camp.rows[0].id])
    console.log('✓ Campanha marcada como responded')
    console.log('  Se o trigger funcionar, auto-reply vai pro outbox agora')

    // Esperar 1s e checar outbox
    await new Promise(r => setTimeout(r, 1000))
    const outbox = await client.query(`
      SELECT id, phone, status, substring(content from 1 for 80) as txt, created_at
      FROM wa_outbox
      WHERE phone = '5544998787673'
      ORDER BY created_at DESC LIMIT 3
    `)
    console.log('\n=== Outbox pos-trigger ===')
    outbox.rows.forEach(r => console.log(' ', r.id.substring(0,8), '|', r.status, '|', r.txt))
  }

  // 5. Verificar auto-reply template
  const tmpl = await client.query("SELECT * FROM wa_auto_reply_templates WHERE trigger_type = 'birthday_responded'")
  console.log('\n=== Auto-reply template ===')
  if (tmpl.rows[0]) {
    console.log('Content:', tmpl.rows[0].content.substring(0, 100))
    console.log('Active:', tmpl.rows[0].is_active)
  } else {
    console.log('NAO ENCONTRADO!')
  }

  await client.end()
}
main().catch(console.error)
