/**
 * Aplica migration: Growth Risks Snapshot (rk-1..5).
 * Uso: node scripts/archive/apply-growth-risks.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000240_growth_risks_snapshot.sql'
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
  console.log('=== Growth Risks Snapshot (rk-1..5) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  await client.query(sql)
  console.log('Migration OK.\n')

  const r = await client.query(`SELECT public.growth_risks_snapshot() AS r`)
  const out = r.rows[0].r
  console.log('Snapshot:')
  console.log('  generated_at:', out.generated_at)
  out.risks.forEach(rk => {
    console.log(`  [${String(rk.status || '?').toUpperCase().padEnd(8)}] ${rk.id} ${rk.label}: ${rk.value ?? '-'} ${rk.unit || ''} — ${rk.hint}`)
  })

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
