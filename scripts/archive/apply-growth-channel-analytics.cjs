/**
 * Aplica migration: Growth Channel Analytics LTV/CAC (s2-6 plano growth).
 * Uso: node scripts/archive/apply-growth-channel-analytics.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000180_growth_channel_analytics.sql'
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
  console.log('=== Growth Channel Analytics LTV/CAC (s2-6) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='growth_channel_analytics'
  `)
  console.log('Funcao:', fns.rows.map(r => r.proname).join(', ') || 'AUSENTE')

  console.log('\n--- Smoke test (30 dias, sem custos) ---')
  const res = await client.query(`SELECT public.growth_channel_analytics(30, '{}'::jsonb) AS r`)
  const r = res.rows[0].r
  if (!r.ok) {
    console.log('ERRO:', r.error, r.detail || '')
  } else {
    console.log('Period:', r.period_days, 'dias desde', r.since)
    console.log('Totals: clicks=' + r.total_clicks + ' leads=' + r.total_leads +
                ' conv=' + r.total_conversoes + ' receita=R$' + r.total_receita)
    const ch = r.channels || []
    console.log('Canais encontrados:', ch.length)
    ch.slice(0, 5).forEach((c, i) => {
      console.log(`  ${i+1}. ${c.channel} — clicks=${c.clicks} leads=${c.leads} conv=${c.conversoes} ` +
                  `receita=R$${c.receita_total} LTV=R$${c.ltv_medio} conv%=${c.taxa_conversao_pct}`)
    })
  }

  console.log('\n=== OK ===\n')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
