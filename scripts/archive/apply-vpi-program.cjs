/**
 * Aplica migration: VPI - Programa de Indicacao.
 * Uso: node scripts/archive/apply-vpi-program.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000020_vpi_program.sql'
)

const client = new Client({
  host:     'db.oqboitkpcvuaudouwvkl.supabase.co',
  port:     5432,
  user:     'postgres',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl:      { rejectUnauthorized: false },
})

async function main() {
  console.log('=== VPI Programa de Indicacao ===\n')

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

  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('vpi_partners','vpi_indications','vpi_reward_tiers','vpi_audit_log')
     ORDER BY table_name
  `)
  console.log('Tabelas criadas:')
  tables.rows.forEach(r => console.log('  -', r.table_name))

  const fns = await client.query(`
    SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'vpi_partner_upsert','vpi_partner_list','vpi_partner_get',
         'vpi_indication_create','vpi_indication_close',
         'vpi_tier_upsert','vpi_tier_list','vpi_tier_delete',
         'vpi_kpis','vpi_high_performance_check','_vpi_render','_vpi_touch_updated_at'
       )
     ORDER BY p.proname
  `)
  console.log('RPCs criadas:')
  fns.rows.forEach(r => console.log('  -', r.proname))

  const tiers = await client.query(`
    SELECT tipo, threshold, recompensa FROM public.vpi_reward_tiers
     WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
     ORDER BY tipo, threshold
  `)
  console.log('\nTiers seed (' + tiers.rows.length + '):')
  tiers.rows.forEach(r => console.log('  [' + r.tipo + '] th=' + r.threshold + ' => ' + r.recompensa))

  const tpl = await client.query(`
    SELECT slug, name, is_active FROM public.wa_agenda_automations
     WHERE slug = 'vpi_convite_parceiro'
  `)
  console.log('\nTemplate WA convite:')
  if (tpl.rows.length) {
    tpl.rows.forEach(r => console.log('  -', r.slug, '|', r.name, '| active=' + r.is_active))
  } else {
    console.log('  (nenhum)')
  }

  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM public.vpi_partners)     AS partners,
      (SELECT COUNT(*) FROM public.vpi_indications)  AS indications,
      (SELECT COUNT(*) FROM public.vpi_reward_tiers) AS tiers,
      (SELECT COUNT(*) FROM public.vpi_audit_log)    AS audit
  `)
  console.log('\nContadores (base zerada):')
  const c = counts.rows[0]
  console.log('  partners=' + c.partners + ' indications=' + c.indications + ' tiers=' + c.tiers + ' audit=' + c.audit)

  console.log('\n=== Concluido ===')
}

main()
  .catch(e => { console.error('ERROR:', e); process.exit(1) })
  .finally(() => client.end())
