/**
 * Aplica migration: VPI Shoutout + Impact (Fase 3).
 * Uso: node scripts/archive/apply-vpi-shoutout-impact.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000032_vpi_shoutout_impact.sql'
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
  console.log('=== VPI Shoutout + Impact - Fase 3 ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Migration:', MIGRATION_PATH)
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  try {
    await client.query(sql)
    console.log('Migration OK.\n')
  } catch (e) {
    console.error('Migration FAILED:', e.message)
    throw e
  }

  console.log('--- Sanity checks ---')

  const fns = await client.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_pub_shoutout_atual','vpi_pub_impact')
     ORDER BY p.proname, args
  `)
  console.log('Funcoes (' + fns.rows.length + '):')
  fns.rows.forEach(r => console.log('  -', r.proname, '(' + r.args + ')'))

  const idx = await client.query(`
    SELECT indexname FROM pg_indexes
     WHERE schemaname='public'
       AND indexname IN ('idx_vpi_indications_month_closed','idx_vpi_indications_partner_closed_date')
     ORDER BY indexname
  `)
  console.log('\nIndices (' + idx.rows.length + '/2):')
  idx.rows.forEach(r => console.log('  -', r.indexname))

  // Test RPCs com token invalido e publico
  const r1 = await client.query(`SELECT public.vpi_pub_shoutout_atual('bad') AS r`)
  console.log('\nvpi_pub_shoutout_atual(bad):', r1.rows[0].r.error)

  const r2 = await client.query(`SELECT public.vpi_pub_impact('00000000-0000-0000-0000-000000000001'::uuid) AS r`)
  const imp = r2.rows[0].r
  console.log('\nvpi_pub_impact():')
  console.log('  - total_embaixadoras  :', imp.total_embaixadoras)
  console.log('  - total_indicacoes_ano:', imp.total_indicacoes_ano)
  console.log('  - valor_total_ano     : R$', imp.valor_total_ano)
  console.log('  - ano_ref             :', imp.ano_ref)

  // Teste shoutout com partner real se existir
  const p = await client.query(`SELECT card_token FROM public.vpi_partners LIMIT 1`)
  if (p.rows.length) {
    const r3 = await client.query(`SELECT public.vpi_pub_shoutout_atual($1) AS r`, [p.rows[0].card_token])
    const sh = r3.rows[0].r
    console.log('\nvpi_pub_shoutout_atual (token real):')
    console.log('  - leader:', sh.leader ? sh.leader.nome : 'nenhum')
    console.log('  - self_pos:', sh.self_pos)
    console.log('  - ranking size:', (sh.ranking || []).length)
  } else {
    console.log('\nSem partners pra teste de shoutout (OK).')
  }

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
