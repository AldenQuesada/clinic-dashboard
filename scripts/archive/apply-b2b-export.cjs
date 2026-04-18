/**
 * Aplica migration 301: B2B Export RPC (Fraqueza #10).
 * Uso: node scripts/archive/apply-b2b-export.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(__dirname, '..', '..', 'supabase', 'migrations', '20260700000301_b2b_export.sql')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== Migration 301: B2B Export ===\n')
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const r = await client.query(`SELECT public.b2b_partnership_export(NULL) AS rows`)
  const rows = r.rows[0].rows
  console.log('Total parcerias exportáveis:', Array.isArray(rows) ? rows.length : 0)
  if (Array.isArray(rows) && rows.length) {
    console.log('Campos do primeiro:', Object.keys(rows[0]).join(', '))
  }

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
