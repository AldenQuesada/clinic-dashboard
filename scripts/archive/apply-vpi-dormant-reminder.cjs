/**
 * Aplica migration: VPI Lembrete Parceira Dormente (Fase 5 - Entrega 1).
 * Uso: node scripts/archive/apply-vpi-dormant-reminder.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000050_vpi_dormant_reminder.sql'
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
  console.log('=== VPI Lembrete Dormente (Fase 5 - Entrega 1) ===\n')

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

  // RPCs
  const fns = await client.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_dormant_partners_scan','vpi_dormant_send_reminder','vpi_dormant_send_reminders_batch')
     ORDER BY p.proname
  `)
  console.log('Funcoes (' + fns.rows.length + '/3):')
  fns.rows.forEach(r => console.log('  -', r.proname, '(' + r.args + ')'))

  // Template
  const tpl = await client.query(`
    SELECT id, slug, name, trigger_type, is_active
      FROM public.wa_agenda_automations
     WHERE slug='vpi_lembrete_dormente'
  `)
  console.log('\nTemplate:', tpl.rows.length ? JSON.stringify(tpl.rows[0]) : 'NAO ENCONTRADO')

  // pg_cron
  try {
    const ext = await client.query(`SELECT extname FROM pg_extension WHERE extname='pg_cron'`)
    console.log('\npg_cron extension:', ext.rows.length ? 'INSTALADO' : 'NAO INSTALADO')

    if (ext.rows.length) {
      const jobs = await client.query(`SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname='vpi_dormant_monthly'`)
      console.log('Cron job (vpi_dormant_monthly):',
        jobs.rows.length ? JSON.stringify(jobs.rows[0]) : 'NAO REGISTRADO')
    }
  } catch (e) {
    console.log('pg_cron check falhou:', e.message)
  }

  // Scan test
  const scan = await client.query(`SELECT public.vpi_dormant_partners_scan() AS r`)
  const arr = scan.rows[0].r
  console.log('\nvpi_dormant_partners_scan():')
  console.log('  - total partners elegiveis:', arr.length)
  if (arr.length) {
    console.log('  - amostra (primeiros 3):')
    arr.slice(0, 3).forEach(p => {
      console.log('    *', p.nome, '| creditos=', p.creditos_total, '| last_closed=', p.last_closed_at)
    })
  }

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
