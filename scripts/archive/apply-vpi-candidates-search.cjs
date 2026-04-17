/**
 * Aplica migration: VPI Candidates Search (Fase 6 - Entrega 1).
 * Uso: node scripts/archive/apply-vpi-candidates-search.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000060_vpi_candidates_search.sql'
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
  console.log('=== VPI Candidates Search (Fase 6 - Entrega 1) ===\n')

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
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='vpi_search_candidates'
  `)
  console.log('Funcao:', fns.rows.length ? fns.rows[0] : 'NAO REGISTRADA')

  // Smoke
  console.log('\n--- Smoke test ---')
  try {
    const r = await client.query(`SELECT public.vpi_search_candidates('Ma', 5) AS r`)
    const arr = r.rows[0].r
    console.log('vpi_search_candidates("Ma", 5):', Array.isArray(arr) ? arr.length + ' resultado(s)' : arr)
    if (Array.isArray(arr) && arr.length) {
      arr.slice(0, 3).forEach(c => {
        console.log('  *', c.source, c.nome || '?', '| phone=', (c.phone || '—'),
          '| partner=', c.is_already_partner, '| injet12m=', c.has_injetavel_12m)
      })
    }
  } catch (e) {
    console.log('Smoke falhou:', e.message)
  }

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
