/**
 * Aplica migration: B2B Partnerships Fase 1 (fundação).
 * Uso: node scripts/archive/apply-b2b-partnerships.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(__dirname, '..', '..', 'supabase', 'migrations', '20260700000270_b2b_partnerships.sql')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== B2B Partnerships (Fase 1 fundação) ===\n')
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const tabs = await client.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name LIKE 'b2b_%'
     ORDER BY table_name`)
  console.log('Tabelas B2B:', tabs.rows.map(r => r.table_name).join(', '))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname LIKE 'b2b_%'
     ORDER BY proname`)
  console.log('RPCs B2B:', fns.rows.map(r => r.proname).join(', '))

  const cfg = await client.query(`SELECT public.b2b_scout_config_get() AS r`)
  console.log('\nScout config inicial:', cfg.rows[0].r)

  const list = await client.query(`SELECT public.b2b_partnership_list() AS r`)
  console.log('Partnerships (deve ser [] no primeiro run):',
    Array.isArray(list.rows[0].r) ? list.rows[0].r.length + ' items' : list.rows[0].r)

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
