/**
 * Aplica migration: VPI Rate Limit Phone (Fase 7 - Entrega 5).
 * Uso: node scripts/archive/apply-vpi-rate-limit-phone.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000074_vpi_rate_limit_phone.sql'
)

const client = new Client({
  host:     'aws-0-us-west-2.pooler.supabase.com',
  port:     5432,
  user:     'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl:      { rejectUnauthorized: false },
})

async function main() {
  console.log('=== VPI Rate Limit Phone (Fase 7 - Entrega 5) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const idx = await client.query(`
    SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND indexname='idx_vpi_audit_phone_suffix'
  `)
  console.log('Indice phone_suffix:', idx.rows.length ? 'OK' : 'AUSENTE')

  const fn = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='vpi_pub_create_indication'
  `)
  console.log('RPC:', fn.rows.length ? 'OK' : 'AUSENTE')

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
