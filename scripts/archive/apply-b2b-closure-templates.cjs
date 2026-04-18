/**
 * Aplica migration 303: B2B Closure Templates (Fraqueza #13).
 * Uso: node scripts/archive/apply-b2b-closure-templates.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(__dirname, '..', '..', 'supabase', 'migrations', '20260700000303_b2b_closure_templates.sql')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== Migration 303: B2B Closure Templates ===\n')
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const r = await client.query(`SELECT public.b2b_closure_templates_list() AS rows`)
  const rows = r.rows[0].rows
  console.log('Templates:', Array.isArray(rows) ? rows.length : 0)
  rows.forEach(t => {
    console.log('  · key=' + t.key + ' subject=' + (t.subject || '(sem)') + ' body_len=' + (t.body ? t.body.length : 0))
  })

  const g = await client.query(`SELECT public.b2b_closure_template_get('default') AS r`)
  console.log('\nGet default OK:', g.rows[0].r.ok)

  const fns = await client.query(`
    SELECT proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname LIKE 'b2b_closure%'
     ORDER BY proname`)
  console.log('\nRPCs closure:')
  fns.rows.forEach(r => console.log('  ' + r.proname + '(' + r.args + ')'))

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
