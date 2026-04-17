/**
 * Aplica migration: VPI High Performance Cron (Fase 5 - Entrega 2).
 * Uso: node scripts/archive/apply-vpi-high-perf-cron.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000051_vpi_high_perf_cron.sql'
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
  console.log('=== VPI High Performance Cron (Fase 5 - Entrega 2) ===\n')

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

  // RPC updated?
  const fn = await client.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='vpi_high_performance_check'
  `)
  console.log('Funcao vpi_high_performance_check:',
    fn.rows.length ? JSON.stringify(fn.rows[0]) : 'NAO ENCONTRADA')

  // Dry-run
  const run = await client.query(`SELECT public.vpi_high_performance_check() AS r`)
  const r = run.rows[0].r
  console.log('\nExecucao de verificacao:')
  console.log('  - hits:',          (r.hits || []).length)
  console.log('  - emitted_count:', r.emitted_count)
  console.log('  - wa_count:',      r.wa_count)
  console.log('  - wa_failed:',     r.wa_failed)
  if ((r.hits || []).length) {
    console.log('  - amostra:', JSON.stringify(r.hits.slice(0,2)))
  }

  // pg_cron
  try {
    const ext = await client.query(`SELECT extname FROM pg_extension WHERE extname='pg_cron'`)
    console.log('\npg_cron extension:', ext.rows.length ? 'INSTALADO' : 'NAO INSTALADO')
    if (ext.rows.length) {
      const jobs = await client.query(`SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname='vpi_high_perf_monthly'`)
      console.log('Cron job (vpi_high_perf_monthly):',
        jobs.rows.length ? JSON.stringify(jobs.rows[0]) : 'NAO REGISTRADO')
    }
  } catch (e) {
    console.log('pg_cron check falhou:', e.message)
  }

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
