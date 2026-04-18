/**
 * Aplica migration 300: B2B Partnership Comments (Fraqueza #7).
 * Uso: node scripts/archive/apply-b2b-comments.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(__dirname, '..', '..', 'supabase', 'migrations', '20260700000300_b2b_partnership_comments.sql')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== Migration 300: B2B Partnership Comments ===\n')
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const tab = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='b2b_partnership_comments'
     ORDER BY ordinal_position`)
  console.log('Colunas b2b_partnership_comments:')
  tab.rows.forEach(r => console.log('  ' + r.column_name + ' :: ' + r.data_type))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN ('b2b_comment_add','b2b_comments_list','b2b_comment_delete')
     ORDER BY proname`)
  console.log('\nRPCs criadas:', fns.rows.map(r => r.proname).join(', '))

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
