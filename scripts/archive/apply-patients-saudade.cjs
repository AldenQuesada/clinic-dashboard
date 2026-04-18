/**
 * Aplica migration: Saudade Pacientes Inativas (s1-7 plano growth).
 * Uso: node scripts/archive/apply-patients-saudade.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000170_patients_saudade.sql'
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
  console.log('=== Saudade Pacientes Inativas (s1-7 plano growth) ===\n')

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
       AND p.proname IN ('patients_saudade_scan','patients_saudade_send','patients_saudade_send_batch')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r => r.proname).join(', '))

  const tpl = await client.query(`
    SELECT slug, is_active FROM public.wa_agenda_automations WHERE slug='patients_saudade'
  `)
  console.log('Template:', tpl.rows.length ? 'OK ativo=' + tpl.rows[0].is_active : 'AUSENTE')

  try {
    const job = await client.query(`SELECT jobname, schedule FROM cron.job WHERE jobname='patients_saudade_monthly'`)
    console.log('pg_cron:', job.rows[0] || 'NAO')
  } catch (e) { console.log('pg_cron:', e.message) }

  console.log('\n--- Smoke scan (sem enviar) ---')
  const scan = await client.query(`SELECT public.patients_saudade_scan(5) AS r`)
  const arr = scan.rows[0].r || []
  console.log('Pacientes inativas elegiveis (>=5 meses, nao-parceiras):', arr.length)
  if (arr.length) {
    console.log('Sample (ate 3):')
    arr.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i+1}. ${p.nome || '<sem nome>'} — ${p.meses_desde_ultimo}m — ultimo: ${p.ultimo_procedimento}`)
    })
  }

  console.log('\n=== OK ===')
  console.log('⚠️  Batch NAO foi executado — rode manualmente quando validar template:')
  console.log('    SELECT public.patients_saudade_send_batch(5);\n')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
