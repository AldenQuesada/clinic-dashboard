/**
 * Aplica migration: VPI Celebrations (Fase 9 - Entrega 7).
 * Uso: node scripts/archive/apply-vpi-celebrations.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000095_vpi_celebrations.sql'
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
  console.log('=== VPI Celebrations (Fase 9 - Entrega 7) ===\n')
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')
  await client.connect(); console.log('Connected.')
  await client.query(sql); console.log('Migration OK.\n')

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_celebrations'
     ORDER BY ordinal_position
  `)
  console.log('Colunas vpi_celebrations:', cols.rows.map(r=>r.column_name).join(', '))

  const waRx = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='wa_messages' AND column_name='reaction'
  `)
  console.log('wa_messages.reaction:', waRx.rows.length ? 'OK' : 'MISSING')

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('_vpi_detect_reaction','_vpi_detect_celebration_consent',
                         'vpi_list_pending_celebrations','vpi_mark_celebration_posted',
                         'vpi_list_all_celebrations')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r=>r.proname).join(', '))

  const trgs = await client.query(`
    SELECT tgname FROM pg_trigger
     WHERE tgname IN ('trg_vpi_detect_reaction','trg_vpi_detect_celebration_consent')
       AND NOT tgisinternal
  `)
  console.log('Triggers:', trgs.rows.map(r=>r.tgname).join(', '))

  const t1 = await client.query(`SELECT public.vpi_list_pending_celebrations(5) AS r`)
  console.log('Pending (sample):', JSON.stringify(t1.rows[0].r).slice(0, 200))

  const t2 = await client.query(`SELECT public.vpi_mark_celebration_posted('00000000-0000-0000-0000-000000000000'::uuid) AS r`)
  console.log('Mark posted bogus:', JSON.stringify(t2.rows[0].r))

  await client.end()
  console.log('\n=== OK ===')
}
main().catch(e => { console.error('ERR:', e.message); client.end().catch(()=>{}); process.exit(1) })
