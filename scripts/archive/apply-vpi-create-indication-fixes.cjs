const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000140_vpi_create_indication_fixes.sql'
)

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
  console.log('Conectado.\n')

  const sql = fs.readFileSync(MIGRATION, 'utf8')
  console.log('Aplicando migration (' + sql.length + ' chars)...')
  try {
    await client.query(sql)
    console.log('OK\n')
  } catch (e) {
    console.error('ERRO:', e.message)
    if (e.position) console.error('Pos:', e.position)
    if (e.where) console.error('Where:', e.where)
    await client.end()
    process.exit(1)
  }

  // Verifica backfill da indicacao orfa
  console.log('--- Verificacao: indicacao 34abe011... ---')
  const r1 = await client.query(`
    SELECT i.id, i.lead_id, l.name, l.phone, l.deleted_at, l.phase, l.funnel
      FROM public.vpi_indications i
      JOIN public.leads l ON l.id::text = i.lead_id
     WHERE i.id = '34abe011-b4bf-4afa-941a-1b3a6cbaf901'
        OR i.created_at > now() - interval '24 hours'
     ORDER BY i.created_at DESC LIMIT 5
  `)
  r1.rows.forEach(r => console.log(' -', r.id, '| lead:', r.name, r.phone, '| phase:', r.phase, 'funnel:', r.funnel, 'deleted:', r.deleted_at ? 'SIM' : 'NAO'))

  // Audit backfill
  console.log('\n--- Audit backfill_orphan ---')
  const r2 = await client.query(`
    SELECT entity_id, payload, created_at
      FROM public.vpi_audit_log
     WHERE action = 'backfill_orphan'
     ORDER BY created_at DESC LIMIT 5
  `)
  r2.rows.forEach(r => console.log(' -', r.entity_id, '|', JSON.stringify(r.payload)))

  await client.end()
  console.log('\nFim.')
}

main().catch(function (e) { console.error('FALHA:', e.message); process.exit(1) })
