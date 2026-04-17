/**
 * Aplica migration: VPI UTM + Attribution ROI (Fase 9 - Entrega 1).
 * Uso: node scripts/archive/apply-vpi-attribution.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000090_vpi_attribution.sql'
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
  console.log('=== VPI Attribution ROI (Fase 9 - Entrega 1) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const tbl = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_partner_attribution'
     ORDER BY ordinal_position
  `)
  console.log('Colunas vpi_partner_attribution:', tbl.rows.map(r=>r.column_name).join(', '))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
         'vpi_track_attribution',
         'vpi_link_attribution_to_lead',
         'vpi_partner_attribution_summary',
         'vpi_pub_attribution_summary',
         'vpi_pub_track_attribution',
         '_vpi_attribution_on_close'
       )
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r=>r.proname).join(', '))

  const trgs = await client.query(`
    SELECT tgname FROM pg_trigger
     WHERE tgname = 'trg_vpi_attribution_on_close'
       AND NOT tgisinternal
  `)
  console.log('Triggers:', trgs.rows.map(r=>r.tgname).join(', '))

  // Test bogus call
  const t1 = await client.query(`SELECT public.vpi_pub_attribution_summary('bogus_token') AS r`)
  console.log('Summary bogus:', JSON.stringify(t1.rows[0].r))

  const t2 = await client.query(`SELECT public.vpi_link_attribution_to_lead('no_session','no_lead') AS r`)
  console.log('Link bogus:', JSON.stringify(t2.rows[0].r))

  await client.end()
  console.log('\n=== OK ===')
}

main().catch(e => {
  console.error('ERR:', e.message)
  client.end().catch(() => {})
  process.exit(1)
})
