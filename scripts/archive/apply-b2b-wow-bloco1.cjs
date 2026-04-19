/**
 * Aplica migrations do Bloco 1 dos efeitos WOW:
 *   320 — b2b_partner_panel (WOW #2) + geo cols (WOW #3)
 *   321 — b2b_playbook_ia_runs (WOW #4)
 *   322 — b2b_partnership_upsert aceita lat/lng
 *
 * Uso: node scripts/archive/apply-b2b-wow-bloco1.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGS = [
  '20260700000320_b2b_partner_panel.sql',
  '20260700000321_b2b_playbook_ia.sql',
  '20260700000322_b2b_upsert_geo.sql',
]
const BASE = path.join(__dirname, '..', '..', 'supabase', 'migrations')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== Migrations 320+321+322: B2B WOW Bloco 1 ===\n')
  await client.connect()

  for (const m of MIGS) {
    const p = path.join(BASE, m)
    const sql = fs.readFileSync(p, 'utf8')
    console.log(`→ ${m} (${sql.length} bytes)`)
    await client.query(sql)
    console.log(`  ✓ aplicada\n`)
  }

  console.log('--- Sanity ---')
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_name='b2b_partnerships'
       AND column_name IN ('public_token','lat','lng')
     ORDER BY column_name`)
  cols.rows.forEach(r => console.log('col:', r.column_name, 'OK'))

  const tab = await client.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_name='b2b_playbook_ia_runs'`)
  console.log('Tabela b2b_playbook_ia_runs:', tab.rowCount ? 'OK' : 'FALTA')

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
        'b2b_partner_panel_issue_token','b2b_partner_panel_get','b2b_partner_panel_revoke',
        'b2b_partnerships_geo_list','b2b_partnership_set_geo',
        'b2b_playbook_ia_run_start','b2b_playbook_ia_run_finish',
        'b2b_playbook_ia_bulk_insert_content','b2b_playbook_ia_runs_list'
       )
     ORDER BY proname`)
  console.log('RPCs criadas:')
  fns.rows.forEach(r => console.log('  ·', r.proname))

  const geoSmoke = await client.query(`SELECT public.b2b_partnerships_geo_list() AS r`)
  console.log('\nSmoke geo_list:', Array.isArray(geoSmoke.rows[0].r) ? geoSmoke.rows[0].r.length + ' rows' : 'n/a')

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
