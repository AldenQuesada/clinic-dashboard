/**
 * Aplica migration: Growth Content Opportunities (s2-5).
 * Uso: node scripts/archive/apply-growth-content.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000200_growth_content_opportunities.sql'
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
  console.log('=== Growth Content Opportunities (s2-5) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  await client.query(sql)
  console.log('Migration OK.\n')

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('growth_content_opportunities','growth_content_mark_posted')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r => r.proname).join(', '))

  console.log('\n--- Smoke: growth_content_opportunities(60, 50) ---')
  const res = await client.query(`SELECT public.growth_content_opportunities(60, 50) AS r`)
  const r = res.rows[0].r
  console.log('total=' + r.total + ' since=' + r.since)
  if ((r.opportunities || []).length) {
    console.log('Amostras:')
    r.opportunities.slice(0, 3).forEach((o, i) => {
      console.log(`  ${i+1}. [${o.type}] ${o.person_name} — ${o.tag}`)
    })
  } else {
    console.log('Zero candidatos — esperado ate primeiros depoimentos/tiers chegarem.')
  }

  console.log('\n=== OK ===\n')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
