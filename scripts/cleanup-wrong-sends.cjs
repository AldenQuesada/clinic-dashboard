const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== Limpeza: msgs de aniversario erradas + conversas duplicadas ===\n')

  // 1. Deletar msgs de aniversario do wa_messages (enviadas como "sistema")
  // Identificar por conteudo (templates antigos)
  const wrongMsgs = await client.query(`
    DELETE FROM wa_messages
    WHERE sender = 'sistema'
      AND content LIKE '%aniversario%'
    RETURNING id, conversation_id, substring(content from 1 for 60) as txt
  `)
  console.log('Msgs de aniversario deletadas do wa_messages:', wrongMsgs.rowCount)
  wrongMsgs.rows.forEach(r => console.log('  ', r.txt))

  // 2. Deletar msgs de auto-reply do wa_messages
  const autoReply = await client.query(`
    DELETE FROM wa_messages
    WHERE sender = 'sistema'
      AND content LIKE '%combo de aniversário%'
    RETURNING id, substring(content from 1 for 60) as txt
  `)
  console.log('\nAuto-reply msgs deletadas:', autoReply.rowCount)

  // 3. Limpar conversas duplicadas do Alden
  console.log('\n--- Conversas do Alden ---')
  const aldenConvs = await client.query(`
    SELECT id, phone, display_name, lead_id, created_at,
           (SELECT count(*) FROM wa_messages WHERE conversation_id = c.id) as msg_count
    FROM wa_conversations c
    WHERE phone LIKE '%98787673%'
    ORDER BY created_at
  `)
  aldenConvs.rows.forEach(r => console.log('  ', r.id.substring(0,8), '|', r.phone, '|', r.display_name, '| msgs:', r.msg_count, '| lead:', r.lead_id?.substring(0,8)))

  // Manter a conversa com mais msgs, deletar as vazias/duplicadas
  if (aldenConvs.rows.length > 1) {
    // Ordenar por msg_count desc
    const sorted = [...aldenConvs.rows].sort((a, b) => b.msg_count - a.msg_count)
    const keep = sorted[0]
    const toDelete = sorted.slice(1)

    console.log('\n  Mantendo:', keep.id.substring(0,8), '(', keep.msg_count, 'msgs)')
    for (const d of toDelete) {
      // Mover msgs pra conversa principal se tiver alguma
      if (d.msg_count > 0) {
        await client.query('UPDATE wa_messages SET conversation_id = $1 WHERE conversation_id = $2', [keep.id, d.id])
        console.log('  Msgs movidas de', d.id.substring(0,8), '→', keep.id.substring(0,8))
      }
      await client.query('DELETE FROM wa_conversations WHERE id = $1', [d.id])
      console.log('  Deletada:', d.id.substring(0,8), '|', d.phone)
    }
  }

  // 4. Limpar conversas criadas pelo outbox pra leads de birthday que nao tinham conversa
  // (Michele, Silvia, Marjory, Adilso — conversas com 0 msgs reais)
  const orphanConvs = await client.query(`
    SELECT c.id, c.phone, c.display_name,
           (SELECT count(*) FROM wa_messages WHERE conversation_id = c.id) as msg_count
    FROM wa_conversations c
    WHERE NOT EXISTS (
      SELECT 1 FROM wa_messages m WHERE m.conversation_id = c.id AND m.sender != 'sistema'
    )
    AND (SELECT count(*) FROM wa_messages WHERE conversation_id = c.id) <= 2
    AND c.created_at > '2026-04-05'
  `)
  console.log('\n--- Conversas orfas (criadas hoje, so msgs sistema) ---')
  orphanConvs.rows.forEach(r => console.log('  ', r.id.substring(0,8), '|', r.phone, '|', r.display_name, '| msgs:', r.msg_count))

  for (const c of orphanConvs.rows) {
    await client.query('DELETE FROM wa_messages WHERE conversation_id = $1', [c.id])
    await client.query('DELETE FROM wa_conversations WHERE id = $1', [c.id])
  }
  console.log('Conversas orfas limpas:', orphanConvs.rowCount)

  // 5. Estado final
  console.log('\n--- Estado final conversas Alden ---')
  const finalAlden = await client.query(`
    SELECT id, phone, display_name,
           (SELECT count(*) FROM wa_messages WHERE conversation_id = c.id) as msg_count
    FROM wa_conversations c
    WHERE phone LIKE '%98787673%'
  `)
  finalAlden.rows.forEach(r => console.log('  ', r.id.substring(0,8), '|', r.phone, '|', r.display_name, '| msgs:', r.msg_count))

  await client.end()
  console.log('\n✓ Limpeza completa')
}
main().catch(console.error)
