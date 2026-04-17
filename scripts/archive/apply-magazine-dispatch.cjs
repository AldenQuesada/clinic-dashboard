/**
 * Aplica migration: magazine_dispatches + RPCs + pg_cron runner.
 * Uso: node scripts/archive/apply-magazine-dispatch.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260690000020_magazine_dispatch.sql'
)

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== magazine_dispatches migration ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Migration:', MIGRATION_PATH)
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  try {
    await client.query(sql)
    console.log('Migration OK.\n')
  } catch (e) {
    console.error('Migration FAILED:', e.message)
    throw e
  }

  console.log('--- Sanity checks ---')

  const tbl = await client.query(`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='magazine_dispatches'
     ORDER BY ordinal_position
  `)
  console.log('magazine_dispatches columns:', tbl.rows.length)
  tbl.rows.forEach(r => console.log('  -', r.column_name, '(' + r.data_type + ')'))

  const fns = await client.query(`
    SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname LIKE 'magazine_dispatch%'
     ORDER BY p.proname
  `)
  console.log('\nRPCs:')
  fns.rows.forEach(r => console.log('  -', r.proname))

  const cron = await client.query(`
    SELECT jobname FROM cron.job WHERE jobname = 'magazine_dispatch_runner'
  `).catch(() => ({ rows: [] }))
  console.log('\npg_cron job:', cron.rows.length ? 'SCHEDULED' : 'NOT SCHEDULED (pg_cron may be disabled)')

  const est = await client.query(`SELECT public.magazine_dispatch_estimate('{"rfm":"all"}'::jsonb) AS r`)
  console.log('\nEstimate (rfm=all):', JSON.stringify(est.rows[0].r))

  console.log('\n=== Concluido ===')
}

main()
  .catch(e => { console.error('ERROR:', e); process.exit(1) })
  .finally(() => client.end())
