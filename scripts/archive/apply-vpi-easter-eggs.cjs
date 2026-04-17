/**
 * Aplica migration: VPI Easter Eggs (Fase 9 - Entrega 3).
 * Uso: node scripts/archive/apply-vpi-easter-eggs.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000092_vpi_easter_eggs.sql'
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
  console.log('=== VPI Easter Eggs (Fase 9 - Entrega 3) ===\n')
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')
  await client.connect()
  console.log('Connected.')
  await client.query(sql)
  console.log('Migration OK.\n')

  const tbl = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_easter_discoveries'
     ORDER BY ordinal_position
  `)
  console.log('Colunas vpi_easter_discoveries:', tbl.rows.map(r=>r.column_name).join(', '))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='vpi_pub_easter_triggered'
  `)
  console.log('Funcoes:', fns.rows.map(r=>r.proname).join(', '))

  const t1 = await client.query(`SELECT public.vpi_pub_easter_triggered('bogus_token','bronze_taps') AS r`)
  console.log('Easter bogus:', JSON.stringify(t1.rows[0].r))

  const t2 = await client.query(`SELECT public.vpi_pub_easter_triggered('bogus','invalid_code_x') AS r`)
  console.log('Easter invalid code:', JSON.stringify(t2.rows[0].r))

  await client.end()
  console.log('\n=== OK ===')
}
main().catch(e => { console.error('ERR:', e.message); client.end().catch(()=>{}); process.exit(1) })
