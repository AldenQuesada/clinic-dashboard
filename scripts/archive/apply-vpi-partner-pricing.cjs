/**
 * Aplica migration: VPI Partner Pricing (Fase 5 - Entrega 4).
 * Uso: node scripts/archive/apply-vpi-partner-pricing.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000053_vpi_partner_pricing.sql'
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
  console.log('=== VPI Partner Pricing (Fase 5 - Entrega 4) ===\n')

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

  // Coluna nova
  const col = await client.query(`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='clinic_procedimentos'
       AND column_name='partner_pricing_json'
  `)
  console.log('Coluna partner_pricing_json:', col.rows.length ? JSON.stringify(col.rows[0]) : 'NAO EXISTE')

  // Procedimentos que ganharam partner pricing
  const seeded = await client.query(`
    SELECT nome, preco, partner_pricing_json
      FROM public.clinic_procedimentos
     WHERE partner_pricing_json IS NOT NULL
     ORDER BY nome
  `)
  console.log('\nProcs com partner_pricing (' + seeded.rows.length + '):')
  seeded.rows.forEach(r => {
    console.log('  -', r.nome, '| preco=', r.preco, '| partner=', JSON.stringify(r.partner_pricing_json))
  })

  // RPCs
  const fns = await client.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('procedures_with_partner_pricing','vpi_is_active_partner','get_procedimentos')
     ORDER BY p.proname
  `)
  console.log('\nFuncoes:')
  fns.rows.forEach(r => console.log('  -', r.proname, '(' + r.args + ')'))

  // Dry run: se nao houver lead partner, retorna precos base
  const dryRun = await client.query(`SELECT public.procedures_with_partner_pricing(NULL) AS r`)
  const out = dryRun.rows[0].r
  console.log('\nprocedures_with_partner_pricing(NULL):')
  console.log('  - is_partner_active:', out.is_partner_active)
  console.log('  - procedures total:', (out.procedures || []).length)
  if ((out.procedures || []).length) {
    var samplePartner = out.procedures.filter(p => p.partner_pricing)[0]
    if (samplePartner) {
      console.log('  - amostra com partner_pricing:', JSON.stringify({
        nome: samplePartner.nome,
        preco: samplePartner.preco,
        partner_pricing: samplePartner.partner_pricing,
        preco_efetivo: samplePartner.preco_efetivo,
        partner_eligible: samplePartner.partner_eligible,
      }))
    }
  }

  // Helper vpi_is_active_partner com lead fake
  const isPartnerFake = await client.query(`SELECT public.vpi_is_active_partner('nonexistent-lead-xyz') AS r`)
  console.log('\nvpi_is_active_partner(fake):', isPartnerFake.rows[0].r, '(esperado false)')

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
