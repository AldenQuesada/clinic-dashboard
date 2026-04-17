const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

async function main() {
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.oqboitkpcvuaudouwvkl',
    password: 'Rosangela*121776',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  console.log('--- Notifications recentes (ultimas 5) ---')
  const r1 = await client.query(`
    SELECT id, type, title, is_read, created_at
      FROM public.notifications
     ORDER BY created_at DESC LIMIT 5
  `)
  if (r1.rows.length === 0) {
    console.log('Nenhuma notification encontrada.')
  } else {
    r1.rows.forEach(function (r) {
      console.log(' -', String(r.created_at).slice(0, 19), r.type, '|', r.title)
    })
  }

  console.log('\n--- wa_outbox pending pro STAFF ---')
  const r2 = await client.query(`
    SELECT phone, lead_name, scheduled_at, status, substr(content, 1, 60) AS content_preview
      FROM public.wa_outbox
     WHERE lead_name = 'STAFF' OR content LIKE '%Revista%'
     ORDER BY created_at DESC LIMIT 5
  `)
  if (r2.rows.length === 0) {
    console.log('Nenhuma msg WA pro staff.')
  } else {
    r2.rows.forEach(function (r) {
      console.log(' -', r.phone, '|', r.status, '|', r.content_preview)
    })
  }

  await client.end()
}

main().catch(function (e) { console.error(e); process.exit(1) })
