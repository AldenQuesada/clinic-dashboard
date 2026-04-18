/**
 * Aplica migrations das Fraquezas #8 (custo) e #9 (health trend):
 *   312 — b2b_cost
 *   313 — b2b_health_history
 *   314 — b2b_upsert_unit_cost (extensão do upsert)
 *
 * Uso: node scripts/archive/apply-b2b-cost-and-trend.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGS = [
  '20260700000312_b2b_cost.sql',
  '20260700000313_b2b_health_history.sql',
  '20260700000314_b2b_upsert_unit_cost.sql',
]
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
  console.log('=== Migrations 312+313+314: B2B Cost + Health Trend ===\n')
  await client.connect()

  for (const m of MIGS) {
    const p = path.join(BASE, m)
    const sql = fs.readFileSync(p, 'utf8')
    console.log(`→ ${m} (${sql.length} bytes)`)
    await client.query(sql)
    console.log(`  ✓ aplicada\n`)
  }

  console.log('--- Sanity ---')
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_name='b2b_partnerships' AND column_name='voucher_unit_cost_brl'`)
  console.log('Coluna voucher_unit_cost_brl:', cols.rowCount ? 'OK' : 'FALTA')

  const cols2 = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_name='b2b_group_exposures' AND column_name='cost_estimate_brl'`)
  console.log('Coluna cost_estimate_brl (exposures):', cols2.rowCount ? 'OK' : 'FALTA')

  const tab = await client.query(`
    SELECT 1 FROM information_schema.tables
     WHERE table_name='b2b_health_history'`)
  console.log('Tabela b2b_health_history:', tab.rowCount ? 'OK' : 'FALTA')

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
        'b2b_partnership_cost','b2b_cost_summary',
        'b2b_health_trend','b2b_health_trend_summary',
        'b2b_partnership_upsert'
       )
     ORDER BY proname`)
  console.log('RPCs criadas:')
  fns.rows.forEach(r => console.log('  ·', r.proname))

  const smoke = await client.query(`SELECT public.b2b_cost_summary(5) AS r`)
  console.log('\nSmoke b2b_cost_summary(5):', Array.isArray(smoke.rows[0].r) ? smoke.rows[0].r.length + ' rows' : 'n/a')

  const smoke2 = await client.query(`SELECT public.b2b_health_trend_summary(90) AS r`)
  console.log('Smoke b2b_health_trend_summary(90):', smoke2.rows[0].r)

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
