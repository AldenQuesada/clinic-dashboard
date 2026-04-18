/**
 * Aplica migration: Growth Tracker Items — persistência Supabase.
 * Uso: node scripts/archive/apply-growth-tracker-items.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000210_growth_tracker_items.sql'
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
  console.log('=== Growth Tracker Items (infra plano growth) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const tab = await client.query(`
    SELECT count(*)::int AS c FROM information_schema.tables
     WHERE table_schema='public' AND table_name='growth_tracker_items'
  `)
  console.log('Tabela growth_tracker_items:', tab.rows[0].c ? 'OK' : 'AUSENTE')

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('growth_tracker_read_all','growth_tracker_set_field','growth_tracker_reset_all')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r => r.proname).join(', '))

  const seed = await client.query(`
    SELECT item_id, checked FROM public.growth_tracker_items
     WHERE clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
     ORDER BY item_id
  `)
  console.log('Seed inicial (itens entregues):', seed.rows.length, 'linhas')
  seed.rows.forEach(r => console.log('  -', r.item_id, r.checked ? '✓' : '○'))

  console.log('\n--- Smoke read_all ---')
  const rd = await client.query(`SELECT public.growth_tracker_read_all() AS r`)
  const out = rd.rows[0].r
  console.log('version:', out.version, '| itens:', Object.keys(out.items || {}).length)

  console.log('\n--- Smoke set_field ---')
  const set = await client.query(`
    SELECT public.growth_tracker_set_field('s1-3', 'notes', '"backend pronto, falta UI"'::jsonb, 'smoke-test') AS r
  `)
  console.log('set_field s1-3 notes:', set.rows[0].r)

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
