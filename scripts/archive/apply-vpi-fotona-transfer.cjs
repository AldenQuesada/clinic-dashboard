/**
 * Aplica migration: VPI Fotona Transferivel + Troca (Fase 8 - Entrega 5).
 * Uso: node scripts/archive/apply-vpi-fotona-transfer.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000084_vpi_fotona_transfer_exchange.sql'
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
  console.log('=== VPI Fotona Transferivel + Troca (Fase 8 - Entrega 5) ===\n')

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
       AND column_name IN ('fotonas_transferidas','fotonas_trocadas')
     ORDER BY column_name
  `)
  console.log('Colunas:', cols.rows.map(r=>r.column_name).join(', '))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_pub_fotona_transfer','vpi_pub_fotona_exchange','_vpi_send_fotona_notification','vpi_pub_get_card')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r=>r.proname).join(', '))

  const tpls = await client.query(`
    SELECT slug, is_active FROM public.wa_agenda_automations
     WHERE slug IN ('vpi_fotona_transfer','vpi_fotona_exchange') ORDER BY slug
  `)
  console.log('Templates:', tpls.rows.map(r => r.slug + ':' + r.is_active).join(', '))

  // Teste token nao existente
  const t1 = await client.query(`
    SELECT public.vpi_pub_fotona_transfer('bogus_token', NULL, NULL, 1) AS r
  `)
  console.log('Transfer bogus:', JSON.stringify(t1.rows[0].r))

  const t2 = await client.query(`
    SELECT public.vpi_pub_fotona_exchange('bogus_token', 'smooth_eyes', 1) AS r
  `)
  console.log('Exchange bogus:', JSON.stringify(t2.rows[0].r))

  const t3 = await client.query(`
    SELECT public.vpi_pub_fotona_exchange('bogus_token', 'invalid_protocol', 1) AS r
  `)
  console.log('Exchange invalid prot:', JSON.stringify(t3.rows[0].r))

  await client.end()
  console.log('\n=== OK ===')
}

main().catch(e => {
  console.error('ERR:', e.message)
  client.end().catch(() => {})
  process.exit(1)
})
