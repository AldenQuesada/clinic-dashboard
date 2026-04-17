/**
 * Aplica migration: VPI Linhagem (Fase 8 - Entrega 6).
 * Uso: node scripts/archive/apply-vpi-lineage.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000085_vpi_lineage.sql'
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
  console.log('=== VPI Linhagem (Fase 8 - Entrega 6) ===\n')

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
       AND column_name IN ('referred_by_partner_id','creditos_cascata_ano')
     ORDER BY column_name
  `)
  console.log('Colunas:', cols.rows.map(r=>r.column_name).join(', '))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('_vpi_partner_set_lineage','_vpi_credit_cascade','_vpi_trigger_cascade_on_close','vpi_pub_partner_lineage')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r=>r.proname).join(', '))

  const trgs = await client.query(`
    SELECT tgname FROM pg_trigger
     WHERE tgname IN ('trg_vpi_partner_set_lineage','trg_vpi_cascade_on_close')
       AND NOT tgisinternal
     ORDER BY tgname
  `)
  console.log('Triggers:', trgs.rows.map(r=>r.tgname).join(', '))

  // Backfill stats
  const bf = await client.query(`
    SELECT COUNT(*)::int AS pop, COUNT(*) FILTER (WHERE referred_by_partner_id IS NOT NULL)::int AS with_parent
      FROM public.vpi_partners
  `)
  console.log('Partners total:', bf.rows[0].pop, '| com parent:', bf.rows[0].with_parent)

  // Test lineage com bogus token
  const t1 = await client.query(`SELECT public.vpi_pub_partner_lineage('bogus_token') AS r`)
  console.log('Lineage bogus:', JSON.stringify(t1.rows[0].r))

  // Test _vpi_credit_cascade com partner sem parent
  const ids = await client.query(`SELECT id FROM public.vpi_partners LIMIT 1`)
  if (ids.rows.length > 0) {
    const t2 = await client.query(`SELECT public._vpi_credit_cascade($1::uuid, 1) AS r`, [ids.rows[0].id])
    console.log('Credit cascade no-parent:', JSON.stringify(t2.rows[0].r))
  }

  await client.end()
  console.log('\n=== OK ===')
}

main().catch(e => {
  console.error('ERR:', e.message)
  client.end().catch(() => {})
  process.exit(1)
})
