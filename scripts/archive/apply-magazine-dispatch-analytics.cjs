/**
 * Aplica migration: magazine_dispatch_analytics RPC.
 * Uso: node scripts/archive/apply-magazine-dispatch-analytics.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260690000022_magazine_dispatch_analytics.sql'
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
  console.log('=== magazine_dispatch_analytics migration ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  await client.connect()
  console.log('Connected.')

  try {
    await client.query(sql)
    console.log('Migration OK.\n')
  } catch (e) {
    console.error('Migration FAILED:', e.message)
    throw e
  }

  const fns = await client.query(`
    SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='magazine_dispatch_analytics'
  `)
  console.log('RPC magazine_dispatch_analytics:', fns.rows.length ? 'OK' : 'MISSING')

  console.log('\n=== Concluido ===')
}

main()
  .catch(e => { console.error('ERROR:', e); process.exit(1) })
  .finally(() => client.end())
