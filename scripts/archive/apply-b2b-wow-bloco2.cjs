/**
 * Aplica migration do Bloco 2 dos efeitos WOW:
 *   330 — b2b_wow_bloco2 (W5 aniversário + W7 hall + W8 boas-vindas)
 *
 * Uso: node scripts/archive/apply-b2b-wow-bloco2.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIG = '20260700000330_b2b_wow_bloco2.sql'
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
  console.log('=== Migration 330: B2B WOW Bloco 2 ===\n')
  await client.connect()

  const sql = fs.readFileSync(path.join(BASE, MIG), 'utf8')
  console.log(`→ ${MIG} (${sql.length} bytes)`)
  await client.query(sql)
  console.log(`  ✓ aplicada\n`)

  console.log('--- Sanity ---')
  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
        'b2b_anniversaries_scan','b2b_partnerships_hall','_b2b_on_partnership_active'
       )
     ORDER BY proname`)
  console.log('Funções criadas:')
  fns.rows.forEach(r => console.log('  ·', r.proname))

  const trg = await client.query(`
    SELECT tgname FROM pg_trigger
     WHERE tgname = 'trg_b2b_partnership_on_active'`)
  console.log('Trigger boas-vindas:', trg.rowCount ? 'OK' : 'FALTA')

  const cronJob = await client.query(`
    SELECT jobname, schedule FROM cron.job
     WHERE jobname = 'b2b_cron_anniversaries'`)
  if (cronJob.rowCount) {
    console.log('Cron anniversaries:', cronJob.rows[0].schedule)
  } else {
    console.log('Cron anniversaries: (pg_cron indisponível — rodar manual)')
  }

  const smoke1 = await client.query(`SELECT public.b2b_anniversaries_scan() AS r`)
  console.log('\nSmoke anniversaries_scan:', smoke1.rows[0].r)

  const smoke2 = await client.query(`SELECT public.b2b_partnerships_hall() AS r`)
  const hallList = smoke2.rows[0].r
  console.log('Smoke hall list:', Array.isArray(hallList) ? hallList.length + ' parcerias ativas' : 'n/a')

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
