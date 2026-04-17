/**
 * Aplica migration: VPI Cortesia Indicado (Fase 4 - Entrega 3).
 * Uso: node scripts/archive/apply-vpi-cortesia.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000042_vpi_cortesia_indicado.sql'
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
  console.log('=== VPI Cortesia Indicado (Fase 4 - Entrega 3) ===\n')

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

  // RPC criada
  const fn = await client.query(`
    SELECT p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='vpi_get_partner_name_by_lead'
  `)
  console.log('RPC vpi_get_partner_name_by_lead:', fn.rows.length ? 'OK' : 'MISSING')

  // Template novo
  const tpl = await client.query(`
    SELECT slug, name, trigger_type, trigger_config, is_active,
           left(content_template, 80) AS preview
      FROM public.wa_agenda_automations
     WHERE slug='vpi_cortesia_indicado'
  `)
  console.log('\nTemplate vpi_cortesia_indicado:', tpl.rows.length ? 'OK' : 'MISSING')
  if (tpl.rows.length) {
    const t = tpl.rows[0]
    console.log('  - trigger:', t.trigger_type, JSON.stringify(t.trigger_config))
    console.log('  - is_active:', t.is_active)
    console.log('  - preview:', t.preview, '...')
  }

  // Guards only_if_not_indicated
  const guarded = await client.query(`
    SELECT name, trigger_config
      FROM public.wa_agenda_automations
     WHERE trigger_type='on_status'
       AND (trigger_config->>'status')='agendado'
     ORDER BY name
  `)
  console.log('\nRegras on_status=agendado (' + guarded.rows.length + '):')
  guarded.rows.forEach(r => {
    const cfg = r.trigger_config || {}
    const tags = []
    if (cfg.only_if_indicated) tags.push('only_if_indicated')
    if (cfg.only_if_not_indicated) tags.push('only_if_not_indicated')
    if (cfg.patient_type) tags.push('patient_type=' + cfg.patient_type)
    console.log('  -', r.name.padEnd(60, ' '), '[', tags.join(', ') || '-', ']')
  })

  // Teste RPC com lead sem indicacao
  const r1 = await client.query(
    `SELECT public.vpi_get_partner_name_by_lead('lead-inexistente-xyz') AS r`
  )
  console.log('\nvpi_get_partner_name_by_lead (lead inexistente):')
  console.log('  ', JSON.stringify(r1.rows[0].r))

  // Teste RPC com lead real se existir
  const leadReal = await client.query(`
    SELECT lead_id FROM public.vpi_indications
     WHERE status <> 'invalid'
     ORDER BY created_at DESC LIMIT 1
  `)
  if (leadReal.rows.length) {
    const r2 = await client.query(
      `SELECT public.vpi_get_partner_name_by_lead($1) AS r`,
      [leadReal.rows[0].lead_id]
    )
    console.log('\nvpi_get_partner_name_by_lead (lead real ' + leadReal.rows[0].lead_id + '):')
    console.log('  ', JSON.stringify(r2.rows[0].r))
  } else {
    console.log('\nSem vpi_indications existentes para teste com lead real (OK).')
  }

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
