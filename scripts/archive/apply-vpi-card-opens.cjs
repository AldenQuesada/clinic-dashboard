/**
 * Aplica migration: VPI Card Opens Tracking (Fase 8 - Entrega 3).
 * Uso: node scripts/archive/apply-vpi-card-opens.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000082_vpi_card_opens.sql'
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
  console.log('=== VPI Card Opens Tracking (Fase 8 - Entrega 3) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_partners'
       AND column_name IN ('aberturas_count','ultima_abertura_em','aberturas_mes_cache')
     ORDER BY column_name
  `)
  console.log('Colunas:', cols.rows.map(r=>r.column_name).join(', '))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_pub_track_card_open','_vpi_refresh_aberturas_mes','vpi_mini_stats','vpi_partner_compute_score')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r=>r.proname).join(', '))

  // Test track with bogus token
  const test = await client.query(`SELECT public.vpi_pub_track_card_open('xxx_bogus_token') AS r`)
  console.log('Track bogus token:', JSON.stringify(test.rows[0].r))

  // Test mini_stats
  const stats = await client.query(`SELECT public.vpi_mini_stats() AS r`)
  console.log('Mini stats:', JSON.stringify(stats.rows[0].r))

  await client.end()
  console.log('\n=== OK ===')
}

main().catch(e => {
  console.error('ERR:', e.message)
  client.end().catch(() => {})
  process.exit(1)
})
