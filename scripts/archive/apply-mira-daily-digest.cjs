/**
 * Aplica a migration do Daily Digest B2B:
 *   20260700000380_b2b_daily_digest_rpc.sql
 *
 * Credenciais lidas do env — ZERO inline secrets neste commit.
 *
 * ENV esperados:
 *   SUPABASE_DB_HOST      (ex: aws-0-us-west-2.pooler.supabase.com)
 *   SUPABASE_DB_PORT      (default 5432)
 *   SUPABASE_DB_USER      (ex: postgres.oqboitkpcvuaudouwvkl)
 *   SUPABASE_DB_PASSWORD  (obrigatorio)
 *   SUPABASE_DB_NAME      (default postgres)
 *
 * Idempotente (CREATE OR REPLACE na RPC).
 *
 * Uso:
 *   node scripts/archive/apply-mira-daily-digest.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIG = '20260700000380_b2b_daily_digest_rpc.sql'
const BASE = path.join(__dirname, '..', '..', 'supabase', 'migrations')

const required = ['SUPABASE_DB_PASSWORD']
const missing = required.filter(k => !process.env[k])
if (missing.length) {
  console.error('FAIL — env ausente:', missing.join(', '))
  console.error('Ver C:/Users/alden/.claude/projects/C--Users-alden/memory/reference_clinicai_api_keys.md')
  process.exit(1)
}

const client = new Client({
  host:     process.env.SUPABASE_DB_HOST     || 'aws-0-us-west-2.pooler.supabase.com',
  port:     parseInt(process.env.SUPABASE_DB_PORT || '5432', 10),
  user:     process.env.SUPABASE_DB_USER     || 'postgres.oqboitkpcvuaudouwvkl',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME     || 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== Migration 380: B2B Daily Digest RPC ===\n')
  await client.connect()

  const sql = fs.readFileSync(path.join(BASE, MIG), 'utf8')
  console.log(`-> ${MIG} (${sql.length} bytes)`)
  await client.query(sql)
  console.log('   OK\n')

  console.log('--- Sanity ---')
  const fn = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname = 'b2b_daily_digest'`)
  if (!fn.rowCount) {
    console.error('FAIL — RPC b2b_daily_digest NAO encontrada')
    process.exit(2)
  }
  console.log('RPC b2b_daily_digest: OK')

  // Smoke: roda o digest e mostra a estrutura
  const smoke = await client.query(`SELECT public.b2b_daily_digest() AS r`)
  const r = smoke.rows[0].r
  console.log('\n--- Smoke ---')
  console.log('ok:          ', r.ok)
  console.log('date:        ', r.date)
  console.log('has_content: ', r.has_content)
  console.log('sections:    ', Array.isArray(r.sections) ? r.sections.length : 'n/a')
  if (r.has_content) {
    console.log('\n--- Texto ---')
    console.log(r.text)
  } else {
    console.log('(sem conteudo — workflow pula envio)')
  }

  await client.end()
  console.log('\nDone.')
}

main().catch(err => {
  console.error('FAIL:', err.message)
  try { client.end() } catch {}
  process.exit(1)
})
