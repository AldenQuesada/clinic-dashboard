/**
 * Aplica migration: VPI Expire Stale Indications (Fase 7 - Entrega 2).
 * Uso: node scripts/archive/apply-vpi-indication-expire.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000071_vpi_indication_expire.sql'
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
  console.log('=== VPI Expire Stale Indications (Fase 7 - Entrega 2) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const col = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_indications' AND column_name='invalid_reason'
  `)
  console.log('Coluna invalid_reason:', col.rows.length ? 'OK' : 'AUSENTE')

  const fn = await client.query(`
    SELECT proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='vpi_indication_expire_stale'
  `)
  console.log('Funcao:', fn.rows[0] || 'AUSENTE')

  try {
    const job = await client.query(`SELECT jobname, schedule FROM cron.job WHERE jobname='vpi_indication_expire_daily'`)
    console.log('pg_cron:', job.rows[0] || 'NAO AGENDADO')
  } catch (e) {
    console.log('pg_cron indisponivel:', e.message)
  }

  console.log('\n--- Smoke: dry run ---')
  const r = await client.query(`SELECT public.vpi_indication_expire_stale(90) AS r`)
  console.log(r.rows[0].r)

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
