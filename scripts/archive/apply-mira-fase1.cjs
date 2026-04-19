/**
 * Aplica migrations da Fase 1 do roadmap Mira B2B:
 *   370 — applications + whitelist
 *   371 — WA templates + seasonal calendar
 *   372 — governance RPCs
 *
 * Uso: node scripts/archive/apply-mira-fase1.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGS = [
  '20260700000370_b2b_applications_whitelist.sql',
  '20260700000371_b2b_wa_templates_seasonal.sql',
  '20260700000372_b2b_governance_rpcs.sql',
]
const BASE = path.join(__dirname, '..', '..', 'supabase', 'migrations')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== Fase 1 Roadmap Mira B2B ===\n')
  await client.connect()
  for (const m of MIGS) {
    const sql = fs.readFileSync(path.join(BASE, m), 'utf8')
    console.log(`→ ${m} (${sql.length} bytes)`)
    await client.query(sql)
    console.log(`  ✓ aplicada\n`)
  }

  console.log('--- Sanity ---')
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_name IN ('b2b_partnership_applications','b2b_partnership_wa_senders',
                          'b2b_voucher_wa_templates','b2b_seasonal_calendar')
     ORDER BY table_name`)
  tables.rows.forEach(r => console.log('tabela:', r.table_name))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname LIKE 'b2b_application%' OR p.proname LIKE 'b2b_wa_sender%'
         OR p.proname LIKE 'b2b_seasonal%' OR p.proname LIKE 'b2b_voucher_compose%'
     ORDER BY proname`)
  console.log('\nRPCs novas:')
  fns.rows.forEach(r => console.log('  ·', r.proname))

  const seasonal = await client.query(`SELECT COUNT(*) AS n FROM public.b2b_seasonal_calendar`)
  console.log('\nSeasonal calendar:', seasonal.rows[0].n, 'meses')

  const tpl = await client.query(`SELECT COUNT(*) AS n FROM public.b2b_voucher_wa_templates WHERE is_default = true`)
  console.log('Template default:', tpl.rows[0].n)

  const now = await client.query(`SELECT public.b2b_seasonal_current() AS r`)
  console.log('\nMês corrente (sazonalidade):', JSON.stringify(now.rows[0].r))

  await client.end()
  console.log('\n✓ Fase 1 pronta.')
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
