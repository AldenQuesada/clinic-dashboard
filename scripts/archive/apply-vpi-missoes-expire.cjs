/**
 * Aplica migration: VPI Missoes Expire (Fase 5 - Entrega 3).
 * Uso: node scripts/archive/apply-vpi-missoes-expire.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000052_vpi_missoes_expire.sql'
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
  console.log('=== VPI Missoes Expire (Fase 5 - Entrega 3) ===\n')

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

  const fns = await client.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname IN ('vpi_missoes_expire_scan','vpi_missao_reativar')
     ORDER BY p.proname
  `)
  console.log('Funcoes (' + fns.rows.length + '/2):')
  fns.rows.forEach(r => console.log('  -', r.proname, '(' + r.args + ')'))

  // Dry-run scan
  const scan = await client.query(`SELECT public.vpi_missoes_expire_scan() AS r`)
  console.log('\nvpi_missoes_expire_scan():', JSON.stringify(scan.rows[0].r))

  // pg_cron
  try {
    const ext = await client.query(`SELECT extname FROM pg_extension WHERE extname='pg_cron'`)
    console.log('\npg_cron extension:', ext.rows.length ? 'INSTALADO' : 'NAO INSTALADO')
    if (ext.rows.length) {
      const jobs = await client.query(`SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname='vpi_missoes_expire_daily'`)
      console.log('Cron job (vpi_missoes_expire_daily):',
        jobs.rows.length ? JSON.stringify(jobs.rows[0]) : 'NAO REGISTRADO')
    }
  } catch (e) {
    console.log('pg_cron check falhou:', e.message)
  }

  // Stats missoes
  const stats = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE is_active=true) AS ativas,
      COUNT(*) FILTER (WHERE is_active=false) AS inativas,
      COUNT(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until < now()) AS com_prazo_vencido
    FROM public.vpi_missoes
  `)
  console.log('\nStats vpi_missoes:', JSON.stringify(stats.rows[0]))

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
