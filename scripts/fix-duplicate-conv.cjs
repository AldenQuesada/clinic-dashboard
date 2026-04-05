const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // A conversa real do Alden (Lara) é 554498787673
  // A conversa duplicada (outbox) é 5544998787673
  // Precisamos: mover msgs da duplicada pra original, deletar duplicada

  const REAL_CONV = await client.query(
    "SELECT id, phone FROM wa_conversations WHERE phone = '554498787673' LIMIT 1"
  )
  const DUPE_CONV = await client.query(
    "SELECT id, phone FROM wa_conversations WHERE phone = '5544998787673' LIMIT 1"
  )

  console.log('Conversa REAL (Lara):', REAL_CONV.rows[0]?.id, '| phone:', REAL_CONV.rows[0]?.phone)
  console.log('Conversa DUPE (outbox):', DUPE_CONV.rows[0]?.id, '| phone:', DUPE_CONV.rows[0]?.phone)

  if (!REAL_CONV.rows[0] || !DUPE_CONV.rows[0]) {
    console.log('Erro: conversas nao encontradas')
    await client.end()
    return
  }

  const realId = REAL_CONV.rows[0].id
  const dupeId = DUPE_CONV.rows[0].id

  // 1. Mover msgs da duplicada pra real
  const moved = await client.query(`
    UPDATE wa_messages SET conversation_id = $1 WHERE conversation_id = $2 RETURNING id
  `, [realId, dupeId])
  console.log('\n✓ Msgs movidas pra conversa real:', moved.rowCount)

  // 2. Deletar conversa duplicada
  const del = await client.query('DELETE FROM wa_conversations WHERE id = $1 RETURNING id', [dupeId])
  console.log('✓ Conversa duplicada deletada:', del.rowCount)

  // 3. Atualizar conversa real com remote_jid e timestamps
  await client.query(`
    UPDATE wa_conversations
    SET remote_jid = COALESCE(remote_jid, '5544998787673@s.whatsapp.net'),
        last_message_at = now(),
        updated_at = now()
    WHERE id = $1
  `, [realId])
  console.log('✓ Conversa real atualizada com remote_jid')

  // 4. Verificar estado final
  const msgs = await client.query(`
    SELECT direction, sender, substring(content from 1 for 60) as txt
    FROM wa_messages WHERE conversation_id = $1
    ORDER BY sent_at DESC LIMIT 5
  `, [realId])
  console.log('\nMsgs na conversa real agora:')
  msgs.rows.forEach(r => console.log(' ', r.direction, '|', r.sender, '|', r.txt))

  await client.end()
  console.log('\n✓ CORRIGIDO — Central deve mostrar tudo agora')
}
main().catch(console.error)
