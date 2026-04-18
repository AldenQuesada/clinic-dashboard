/**
 * Aplica migration: NPS pos-procedimento D+7 (s2-3 plano growth).
 * Uso: node scripts/archive/apply-nps-d7.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000190_nps_d7.sql'
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
  console.log('=== NPS pos-procedimento D+7 (s2-3) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const tbl = await client.query(`
    SELECT count(*) c FROM information_schema.tables
     WHERE table_schema='public' AND table_name='nps_responses'
  `)
  console.log('Tabela nps_responses:', tbl.rows[0].c > 0 ? 'OK' : 'AUSENTE')

  const tpls = await client.query(`
    SELECT slug, is_active FROM public.wa_agenda_automations
     WHERE slug IN ('nps_d7','nps_depoimento_request','nps_recuperacao_detratora')
     ORDER BY slug
  `)
  console.log('Templates:', tpls.rows.map(r => r.slug + '(' + r.is_active + ')').join(', '))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('nps_parse_inbound','nps_kpis','nps_testimonials_consented')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r => r.proname).join(', '))

  const trg = await client.query(`
    SELECT tgname FROM pg_trigger WHERE tgname='trg_nps_parse_inbound'
  `)
  console.log('Trigger:', trg.rows.length ? 'OK' : 'AUSENTE')

  console.log('\n--- Smoke: nps_kpis(30) ---')
  const kpi = await client.query(`SELECT public.nps_kpis(30) AS r`)
  console.log(JSON.stringify(kpi.rows[0].r, null, 2))

  console.log('\n=== OK ===\n')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
