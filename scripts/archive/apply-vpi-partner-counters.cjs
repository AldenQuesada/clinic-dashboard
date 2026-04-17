/**
 * Aplica migration: VPI Materializar Counters (Fase 7 - Entrega 4).
 * Uso: node scripts/archive/apply-vpi-partner-counters.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000073_vpi_partner_counters.sql'
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
  console.log('=== VPI Partner Counters (Fase 7 - Entrega 4) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_partners'
       AND column_name IN ('indicacoes_mes_cache','indicacoes_ano_cache','counters_atualizados_em')
     ORDER BY column_name
  `)
  console.log('Colunas:', cols.rows.map(r => r.column_name).join(', '))

  const trg = await client.query(`
    SELECT tgname FROM pg_trigger WHERE tgname='trg_vpi_indications_counters' AND NOT tgisinternal
  `)
  console.log('Trigger:', trg.rows.length ? 'OK' : 'AUSENTE')

  try {
    const job = await client.query(`SELECT jobname, schedule FROM cron.job WHERE jobname='vpi_counters_weekly'`)
    console.log('pg_cron:', job.rows[0] || 'NAO')
  } catch (e) { console.log('pg_cron:', e.message) }

  const refresh = await client.query(`SELECT public.vpi_refresh_all_counters() AS r`)
  console.log('\nRefresh all:', refresh.rows[0].r)

  const sample = await client.query(`
    SELECT count(*) FILTER (WHERE counters_atualizados_em IS NOT NULL) AS com_cache,
           count(*) AS total
      FROM public.vpi_partners
  `)
  console.log('Cache coverage:', sample.rows[0])

  console.log('\n--- Smoke: vpi_partner_list ---')
  const list = await client.query(`SELECT jsonb_array_length(public.vpi_partner_list(NULL,'ranking')) AS n`)
  console.log('Ranked partners:', list.rows[0].n)

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
