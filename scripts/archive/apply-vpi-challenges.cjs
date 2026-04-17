/**
 * Aplica migration: VPI Desafios Sazonais (Fase 9 - Entrega 2).
 * Uso: node scripts/archive/apply-vpi-challenges.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000091_vpi_challenges.sql'
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
  console.log('=== VPI Desafios Sazonais (Fase 9 - Entrega 2) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const tbl = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_challenges'
     ORDER BY ordinal_position
  `)
  console.log('Colunas vpi_challenges:', tbl.rows.map(r=>r.column_name).join(', '))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
         '_vpi_active_challenge',
         'vpi_challenge_upsert',
         'vpi_challenge_list',
         'vpi_challenge_delete',
         'vpi_pub_active_challenge'
       )
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r=>r.proname).join(', '))

  const seeds = await client.query(`
    SELECT slug, titulo, multiplier, is_active FROM public.vpi_challenges ORDER BY sort_order DESC
  `)
  console.log('Seeds:')
  seeds.rows.forEach(r => console.log('  -', r.slug, '|', r.titulo, '| x' + r.multiplier, '|', r.is_active ? 'ACTIVE' : 'inactive'))

  // Test pub RPC
  const r1 = await client.query(`SELECT public.vpi_pub_active_challenge() AS r`)
  console.log('Active challenge agora:', JSON.stringify(r1.rows[0].r))

  await client.end()
  console.log('\n=== OK ===')
}

main().catch(e => {
  console.error('ERR:', e.message)
  client.end().catch(() => {})
  process.exit(1)
})
