/**
 * Aplica migration: WA Template Sanitize (Fase 8 - Entrega 1).
 * Uso: node scripts/archive/apply-wa-template-sanitize.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000080_wa_template_sanitize.sql'
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
  console.log('=== WA Template Sanitize (Fase 8 - Entrega 1) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const fn = await client.query(`
    SELECT proname, pronargs FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='_wa_render_template'
  `)
  console.log('Funcao _wa_render_template:', fn.rows.length ? 'OK' : 'AUSENTE')

  // Teste real end-to-end
  const test1 = await client.query(
    `SELECT public._wa_render_template(
       'Sua *{{recompensa}}* esta liberada!',
       jsonb_build_object('recompensa', '')
     ) AS r`
  )
  console.log('Test empty var:', JSON.stringify(test1.rows[0].r))

  const test2 = await client.query(
    `SELECT public._wa_render_template(
       'Ola {{nome}}!  Seu  {{item}} chegou  .',
       jsonb_build_object('nome','Maria','item','')
     ) AS r`
  )
  console.log('Test extra spaces:', JSON.stringify(test2.rows[0].r))

  const test3 = await client.query(
    `SELECT public._wa_render_template(
       'Ola {{nome}}!',
       jsonb_build_object('nome','Julia')
     ) AS r`
  )
  console.log('Test normal:', JSON.stringify(test3.rows[0].r))

  await client.end()
  console.log('\n=== OK ===')
}

main().catch(e => {
  console.error('ERR:', e.message)
  client.end().catch(() => {})
  process.exit(1)
})
