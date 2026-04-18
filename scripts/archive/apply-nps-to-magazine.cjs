/**
 * Aplica migration: NPS → Magazine bridge (s2-4 plano growth).
 * Uso: node scripts/archive/apply-nps-to-magazine.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000230_nps_to_magazine.sql'
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
  console.log('=== NPS → Magazine bridge (s2-4) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const col = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_name='nps_responses' AND column_name='magazine_page_id'
  `)
  console.log('nps_responses.magazine_page_id:', col.rows.length ? 'OK' : 'AUSENTE')

  const fn = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='nps_testimonial_to_magazine'
  `)
  console.log('RPC nps_testimonial_to_magazine:', fn.rows.length ? 'OK' : 'AUSENTE')

  console.log('\n--- Smoke (sem NPS real, testa retorno de erro) ---')
  const smoke = await client.query(`
    SELECT public.nps_testimonial_to_magazine('00000000-0000-0000-0000-000000000000'::uuid) AS r
  `)
  console.log('not_found handling:', smoke.rows[0].r)

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
