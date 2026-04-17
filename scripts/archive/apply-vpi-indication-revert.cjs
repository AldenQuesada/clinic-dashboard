/**
 * Aplica migration: VPI Indication Revert (Fase 8 - Entrega 2).
 * Uso: node scripts/archive/apply-vpi-indication-revert.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000081_vpi_indication_revert.sql'
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
  console.log('=== VPI Indication Revert (Fase 8 - Entrega 2) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const fn = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_indication_revert_by_appt','_vpi_appt_revert_on_cancel')
     ORDER BY proname
  `)
  console.log('Funcoes:', fn.rows.map(r=>r.proname).join(', '))

  const trg = await client.query(`
    SELECT tgname FROM pg_trigger WHERE tgname='trg_vpi_revert_on_cancel' AND NOT tgisinternal
  `)
  console.log('Trigger:', trg.rows.length ? 'OK' : 'AUSENTE')

  // Teste dry-run: chamar RPC com appt fake
  const test = await client.query(
    `SELECT public.vpi_indication_revert_by_appt('nonexistent_appt_id', 'test') AS r`
  )
  console.log('Dry-run teste:', JSON.stringify(test.rows[0].r))

  const col = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_indications'
       AND column_name='invalid_reason'
  `)
  console.log('Coluna invalid_reason:', col.rows.length ? 'OK' : 'AUSENTE')

  await client.end()
  console.log('\n=== OK ===')
}

main().catch(e => {
  console.error('ERR:', e.message)
  client.end().catch(() => {})
  process.exit(1)
})
