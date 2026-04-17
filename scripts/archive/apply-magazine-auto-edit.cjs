/**
 * Aplica migration: magazine_brief_apply_plan + magazine_brief_photos.
 * Uso: node scripts/archive/apply-magazine-auto-edit.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260690000021_magazine_auto_edit.sql'
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
  console.log('=== magazine_auto_edit migration ===\n')
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
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN ('magazine_brief_apply_plan','magazine_brief_photos')
  `)
  console.log('RPCs:', fns.rows.map(r => r.proname).join(', '))

  console.log('\n=== Concluido ===')
}

main()
  .catch(e => { console.error('ERROR:', e); process.exit(1) })
  .finally(() => client.end())
