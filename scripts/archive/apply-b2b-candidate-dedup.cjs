/**
 * Aplica migration 302: B2B Candidate Fuzzy Dedup (Fraqueza #11).
 * Uso: node scripts/archive/apply-b2b-candidate-dedup.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(__dirname, '..', '..', 'supabase', 'migrations', '20260700000302_b2b_candidate_dedup.sql')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== Migration 302: B2B Candidate Fuzzy Dedup ===\n')
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const ext = await client.query(`SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','unaccent') ORDER BY extname`)
  console.log('Extensões ativas:', ext.rows.map(r => r.extname).join(', ') || '(nenhuma — usando fallback)')

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='b2b_candidates'
       AND column_name IN ('search_key','phone_digits')
     ORDER BY column_name`)
  console.log('Colunas geradas:', cols.rows.map(r => r.column_name).join(', '))

  const r = await client.query(`SELECT public.b2b_candidate_find_similar('Cazza Flor', NULL) AS rows`)
  console.log('Teste find_similar("Cazza Flor"):', JSON.stringify(r.rows[0].rows).slice(0, 300))

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
