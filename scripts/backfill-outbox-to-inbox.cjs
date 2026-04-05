const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // Buscar todas msgs do outbox enviadas que NAO tem wa_messages correspondente
  const orphans = await client.query(`
    SELECT o.id, o.phone, o.lead_id, o.content, o.content_type, o.media_url,
           o.wa_message_id, o.sent_at, o.clinic_id
    FROM wa_outbox o
    WHERE o.status = 'sent'
      AND o.wa_message_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM wa_messages m WHERE m.wa_message_id = o.wa_message_id
      )
    ORDER BY o.sent_at
  `)

  console.log('Msgs orfas (outbox sem wa_messages):', orphans.rows.length)

  let created = 0
  let linked = 0

  for (const o of orphans.rows) {
    const phone = o.phone
    const phoneShort = phone.slice(-11)

    // Buscar conversa existente
    let convId = null
    const conv = await client.query(`
      SELECT id FROM wa_conversations
      WHERE clinic_id = $1
        AND (phone LIKE '%' || $2 OR phone = $3)
        AND status = 'active'
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT 1
    `, [o.clinic_id, phoneShort, phone])

    if (conv.rows.length > 0) {
      convId = conv.rows[0].id
      linked++
    } else {
      // Criar conversa
      const newConv = await client.query(`
        INSERT INTO wa_conversations (
          clinic_id, lead_id, phone, remote_jid, status, ai_persona, ai_enabled
        ) VALUES ($1, $2, $3, $4, 'active', 'onboarder', true)
        RETURNING id
      `, [o.clinic_id, o.lead_id || 'unknown', phone, phone + '@s.whatsapp.net'])
      convId = newConv.rows[0].id
      created++
    }

    // Inserir msg
    await client.query(`
      INSERT INTO wa_messages (
        conversation_id, clinic_id, direction, sender,
        content, content_type, media_url,
        ai_generated, wa_message_id, sent_at
      ) VALUES ($1, $2, 'outbound', 'sistema', $3, $4, $5, false, $6, $7)
    `, [convId, o.clinic_id, o.content, o.content_type || 'text', o.media_url, o.wa_message_id, o.sent_at])

    // Atualizar conversa
    await client.query(`
      UPDATE wa_conversations
      SET last_message_at = GREATEST(last_message_at, $2),
          last_ai_msg = GREATEST(last_ai_msg, $2),
          updated_at = now()
      WHERE id = $1
    `, [convId, o.sent_at])
  }

  console.log('Conversas novas criadas:', created)
  console.log('Vinculadas a conversas existentes:', linked)
  console.log('Total msgs sincronizadas:', orphans.rows.length)

  // Verificar Michele e Silvia agora
  for (const name of ['Michele Castro', 'Silvia Candida']) {
    const check = await client.query(`
      SELECT c.phone, c.display_name, count(m.id) as msgs
      FROM wa_conversations c
      LEFT JOIN wa_messages m ON m.conversation_id = c.id
      JOIN leads l ON l.phone LIKE '%' || right(c.phone, 11)
      WHERE l.name ILIKE '%' || $1 || '%'
      GROUP BY c.id, c.phone, c.display_name
    `, [name])
    console.log('\n' + name + ':')
    check.rows.forEach(r => console.log('  ', r.phone, '| msgs:', r.msgs))
  }

  await client.end()
  console.log('\n✓ Backfill completo — Central deve mostrar todas as msgs agora')
}
main().catch(console.error)
