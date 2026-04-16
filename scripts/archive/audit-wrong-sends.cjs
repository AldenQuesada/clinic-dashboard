const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  const names = ['Silvia Candida', 'Michele Castro', 'Marjory Tavares', 'Adilso']

  for (const name of names) {
    console.log('\n========== ' + name + ' ==========')

    // 1. Lead
    const lead = await client.query(
      "SELECT id, name, phone, birth_date FROM leads WHERE name ILIKE '%' || $1 || '%' LIMIT 1",
      [name]
    )
    if (lead.rows.length === 0) {
      console.log('  Lead NAO ENCONTRADO')
      continue
    }
    const l = lead.rows[0]
    console.log('Lead:', l.id, '|', l.name, '|', l.phone, '| birth:', l.birth_date)

    // 2. Campanha birthday
    const camp = await client.query(`
      SELECT id, lead_name, status, is_excluded, exclude_reason, birth_date, campaign_year, started_at, created_at
      FROM wa_birthday_campaigns
      WHERE lead_id = $1
      ORDER BY created_at DESC
    `, [l.id])
    if (camp.rows.length === 0) {
      console.log('  Campanha: NENHUMA')
    } else {
      camp.rows.forEach(c => {
        console.log('  Campanha:', c.id.substring(0,8), '| status:', c.status, '| excluded:', c.is_excluded, '| reason:', c.exclude_reason, '| birth:', c.birth_date, '| year:', c.campaign_year, '| started:', c.started_at)
      })
    }

    // 3. Birthday messages
    if (camp.rows.length > 0) {
      const msgs = await client.query(`
        SELECT bm.id, bm.status, bm.day_offset, bm.scheduled_at, bm.sent_at, bm.outbox_id
        FROM wa_birthday_messages bm
        WHERE bm.campaign_id = $1
        ORDER BY bm.day_offset DESC
      `, [camp.rows[0].id])
      console.log('  Birthday msgs:', msgs.rows.length)
      msgs.rows.forEach(m => console.log('    D-' + m.day_offset, '|', m.status, '| scheduled:', m.scheduled_at, '| sent:', m.sent_at))
    }

    // 4. Outbox (o que realmente foi enviado)
    const outbox = await client.query(`
      SELECT id, phone, status, sent_at, substring(content from 1 for 80) as txt, broadcast_id
      FROM wa_outbox WHERE lead_id = $1
      ORDER BY created_at DESC LIMIT 5
    `, [l.id])
    console.log('  Outbox:', outbox.rows.length, 'msgs')
    outbox.rows.forEach(o => console.log('    ', o.status, '| broadcast:', o.broadcast_id?.substring(0,8) || 'NULL', '|', o.txt))
  }

  // 5. Verificar: quantas campanhas com status "sending" existem e quantas tem birthday_messages
  console.log('\n\n========== AUDITORIA GERAL ==========')
  const allCamps = await client.query(`
    SELECT c.id, c.lead_name, c.status, c.is_excluded,
           (SELECT count(*) FROM wa_birthday_messages bm WHERE bm.campaign_id = c.id) as msg_count,
           (SELECT count(*) FROM wa_birthday_messages bm WHERE bm.campaign_id = c.id AND bm.status = 'sent') as sent_count
    FROM wa_birthday_campaigns c
    WHERE c.status IN ('sending', 'pending', 'responded')
    ORDER BY c.created_at DESC
  `)
  console.log('Campanhas ativas:', allCamps.rows.length)
  allCamps.rows.forEach(c => {
    const flag = c.msg_count === 0 ? ' ⚠️ SEM MSGS' : ''
    console.log(' ', c.lead_name, '|', c.status, '| msgs:', c.msg_count, '| sent:', c.sent_count, flag)
  })

  // 6. Verificar o scanner - como ele cria campanhas
  console.log('\n=== wa_birthday_scan source ===')
  const fn = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'wa_birthday_scan' LIMIT 1")
  const src = fn.rows[0]?.prosrc || ''
  // Mostrar a parte que filtra por data de aniversario
  const lines = src.split('\n')
  const relevant = lines.filter(line =>
    line.includes('birth') || line.includes('WHERE') || line.includes('INSERT') || line.includes('interval') || line.includes('day')
  )
  relevant.forEach(line => console.log(' ', line.trim()))

  await client.end()
}
main().catch(console.error)
