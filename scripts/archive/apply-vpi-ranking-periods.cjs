/**
 * Aplica migration: VPI Ranking Periods (Fase 8 - Entrega 4).
 * Uso: node scripts/archive/apply-vpi-ranking-periods.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000083_vpi_ranking_periods.sql'
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
  console.log('=== VPI Ranking Periods (Fase 8 - Entrega 4) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const fn = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='vpi_partner_ranking'
  `)
  console.log('Funcao vpi_partner_ranking:', fn.rows.length ? 'OK' : 'AUSENTE')

  // Teste cada periodo
  for (const pr of ['month', '90d', 'year', 'all']) {
    const r = await client.query(
      `SELECT public.vpi_partner_ranking($1, 10) AS r`, [pr]
    )
    const j = r.rows[0].r
    console.log('Period', pr, ': rows=', Array.isArray(j.rows) ? j.rows.length : 0)
  }

  await client.end()
  console.log('\n=== OK ===')
}

main().catch(e => {
  console.error('ERR:', e.message)
  client.end().catch(() => {})
  process.exit(1)
})
