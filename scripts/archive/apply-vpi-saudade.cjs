/**
 * Aplica migration: VPI Sentindo Sua Falta (Fase 7 - Entrega 7).
 * Uso: node scripts/archive/apply-vpi-saudade.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000075_vpi_saudade.sql'
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
  console.log('=== VPI Sentindo Sua Falta (Fase 7 - Entrega 7) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_saudade_scan','vpi_saudade_send','vpi_saudade_send_batch')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r => r.proname).join(', '))

  const tpl = await client.query(`
    SELECT slug, is_active FROM public.wa_agenda_automations WHERE slug='vpi_saudade_parceira'
  `)
  console.log('Template:', tpl.rows.length ? 'OK ativo=' + tpl.rows[0].is_active : 'AUSENTE')

  try {
    const job = await client.query(`SELECT jobname, schedule FROM cron.job WHERE jobname='vpi_saudade_monthly'`)
    console.log('pg_cron:', job.rows[0] || 'NAO')
  } catch (e) { console.log('pg_cron:', e.message) }

  console.log('\n--- Smoke scan ---')
  const scan = await client.query(`SELECT public.vpi_saudade_scan(5) AS r`)
  const arr = scan.rows[0].r || []
  console.log('Partners elegiveis saudade:', arr.length)
  if (arr.length) console.log('Sample:', arr[0])

  console.log('\n--- Smoke batch (dry run) ---')
  const b = await client.query(`SELECT public.vpi_saudade_send_batch(5) AS r`)
  console.log('Batch:', b.rows[0].r)

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
