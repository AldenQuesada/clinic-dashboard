/**
 * Aplica migration: VPI Paleta Personalizada (Fase 9 - Entrega 4).
 * Uso: node scripts/archive/apply-vpi-palette.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000093_vpi_palette.sql'
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
  console.log('=== VPI Paleta (Fase 9 - Entrega 4) ===\n')
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')
  await client.connect()
  console.log('Connected.')
  await client.query(sql)
  console.log('Migration OK.\n')

  const col = await client.query(`
    SELECT column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_partners' AND column_name='palette_variant'
  `)
  console.log('Coluna palette_variant default:', col.rows[0] && col.rows[0].column_default)

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_pub_set_palette','vpi_pub_get_palette','_vpi_palette_is_valid')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r=>r.proname).join(', '))

  const t1 = await client.query(`SELECT public._vpi_palette_is_valid('bronze','rose') AS r1, public._vpi_palette_is_valid('bronze','sage') AS r2`)
  console.log('Validacao (bronze,rose) =>', t1.rows[0].r1, ' (bronze,sage) =>', t1.rows[0].r2)

  const t2 = await client.query(`SELECT public.vpi_pub_set_palette('bogus_tok','rose') AS r`)
  console.log('Set bogus:', JSON.stringify(t2.rows[0].r))

  const t3 = await client.query(`SELECT public.vpi_pub_get_palette('bogus_tok') AS r`)
  console.log('Get bogus:', JSON.stringify(t3.rows[0].r))

  await client.end()
  console.log('\n=== OK ===')
}
main().catch(e => { console.error('ERR:', e.message); client.end().catch(()=>{}); process.exit(1) })
