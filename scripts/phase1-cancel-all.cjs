const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== FASE 1: CANCELAR TUDO ===\n')

  // 1. Estado atual
  const stats = await client.query(`
    SELECT status, count(*) as total FROM wa_birthday_campaigns GROUP BY status ORDER BY status
  `)
  console.log('Estado ANTES:')
  stats.rows.forEach(r => console.log('  ', r.status, ':', r.total))

  const msgStats = await client.query(`
    SELECT status, count(*) as total FROM wa_birthday_messages GROUP BY status ORDER BY status
  `)
  console.log('\nBirthday messages ANTES:')
  msgStats.rows.forEach(r => console.log('  ', r.status, ':', r.total))

  const outboxPending = await client.query(`
    SELECT count(*) as total FROM wa_outbox
    WHERE status IN ('pending', 'processing')
      AND id IN (SELECT outbox_id FROM wa_birthday_messages WHERE outbox_id IS NOT NULL)
  `)
  console.log('\nOutbox pendentes (birthday):', outboxPending.rows[0]?.total)

  // 2. Cancelar outbox pendentes vinculados a birthday
  const cancelOutbox = await client.query(`
    UPDATE wa_outbox SET status = 'cancelled'
    WHERE status IN ('pending', 'processing')
      AND id IN (SELECT outbox_id FROM wa_birthday_messages WHERE outbox_id IS NOT NULL)
    RETURNING id
  `)
  console.log('\n--- Executando ---')
  console.log('Outbox cancelados:', cancelOutbox.rowCount)

  // 3. Cancelar todas birthday_messages pendentes/queued/paused
  const cancelMsgs = await client.query(`
    UPDATE wa_birthday_messages SET status = 'cancelled'
    WHERE status IN ('pending', 'queued', 'paused')
    RETURNING id
  `)
  console.log('Birthday messages canceladas:', cancelMsgs.rowCount)

  // 4. Cancelar todas campanhas ativas (exceto a de teste do Alden que ja e responded)
  const cancelCamps = await client.query(`
    UPDATE wa_birthday_campaigns SET status = 'cancelled'
    WHERE status IN ('pending', 'sending', 'paused')
    RETURNING id, lead_name
  `)
  console.log('Campanhas canceladas:', cancelCamps.rowCount)
  cancelCamps.rows.forEach(r => console.log('  ', r.lead_name))

  // 5. Estado final
  console.log('\n--- Estado DEPOIS ---')
  const statsAfter = await client.query(`
    SELECT status, count(*) as total FROM wa_birthday_campaigns GROUP BY status ORDER BY status
  `)
  statsAfter.rows.forEach(r => console.log('  ', r.status, ':', r.total))

  const msgAfter = await client.query(`
    SELECT status, count(*) as total FROM wa_birthday_messages GROUP BY status ORDER BY status
  `)
  console.log('\nBirthday messages:')
  msgAfter.rows.forEach(r => console.log('  ', r.status, ':', r.total))

  // 6. Verificar que nao ha nada pendente no outbox
  const outboxCheck = await client.query(`
    SELECT count(*) as total FROM wa_outbox
    WHERE status IN ('pending', 'processing')
      AND id IN (SELECT outbox_id FROM wa_birthday_messages WHERE outbox_id IS NOT NULL)
  `)
  console.log('\nOutbox pendentes restantes:', outboxCheck.rows[0]?.total)

  await client.end()
  console.log('\n✓ FASE 1 COMPLETA — Tudo parado. Nenhuma msg sera enviada.')
}
main().catch(console.error)
