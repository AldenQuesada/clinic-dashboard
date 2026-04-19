/**
 * Aplica migration do Bloco 3 dos efeitos WOW:
 *   340 — insights + NPS (W9, W11)
 *
 * Uso: node scripts/archive/apply-b2b-wow-bloco3.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIG = '20260700000340_b2b_wow_bloco3.sql'
const BASE = path.join(__dirname, '..', '..', 'supabase', 'migrations')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== Migration 340: B2B WOW Bloco 3 ===\n')
  await client.connect()

  const sql = fs.readFileSync(path.join(BASE, MIG), 'utf8')
  console.log(`→ ${MIG} (${sql.length} bytes)`)
  await client.query(sql)
  console.log(`  ✓ aplicada\n`)

  console.log('--- Sanity ---')
  const tabs = await client.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_name IN ('b2b_insights','b2b_nps_responses')
     ORDER BY table_name`)
  tabs.rows.forEach(r => console.log('tabela:', r.table_name, 'OK'))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
        'b2b_insights_list','b2b_insight_add','b2b_insight_dismiss','b2b_insight_mark_seen',
        'b2b_nps_issue','b2b_nps_get','b2b_nps_submit','b2b_nps_summary','b2b_nps_quarterly_dispatch'
       )
     ORDER BY proname`)
  console.log('RPCs criadas:')
  fns.rows.forEach(r => console.log('  ·', r.proname))

  const cronJob = await client.query(`
    SELECT jobname, schedule FROM cron.job
     WHERE jobname = 'b2b_cron_nps_quarterly'`)
  if (cronJob.rowCount) {
    console.log('Cron NPS quarterly:', cronJob.rows[0].schedule)
  } else {
    console.log('Cron NPS quarterly: (manual)')
  }

  const smoke = await client.query(`SELECT public.b2b_insights_list(5) AS r`)
  console.log('\nSmoke insights_list:', Array.isArray(smoke.rows[0].r) ? smoke.rows[0].r.length + ' insights' : 'n/a')
  const smoke2 = await client.query(`SELECT public.b2b_nps_summary(null) AS r`)
  console.log('Smoke nps_summary:', smoke2.rows[0].r)

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
