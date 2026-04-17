/**
 * Aplica migration: VPI Staff Alert on High Tier (Fase 7 - Entrega 3).
 * Uso: node scripts/archive/apply-vpi-staff-alert.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000072_vpi_staff_alert.sql'
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
  console.log('=== VPI Staff Alert Tier Alto (Fase 7 - Entrega 3) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity ---')
  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_alert_staff','vpi_staff_alert_config','vpi_staff_alert_config_update','vpi_high_performance_check')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r => r.proname).join(', '))

  const tpl = await client.query(`
    SELECT slug, is_active FROM public.wa_agenda_automations WHERE slug='vpi_alerta_staff_tier_alto'
  `)
  console.log('Template:', tpl.rows.length ? 'OK ativo=' + tpl.rows[0].is_active : 'AUSENTE')

  console.log('\n--- Smoke config ---')
  const cfg = await client.query(`SELECT public.vpi_staff_alert_config() AS r`)
  console.log('Config atual:', cfg.rows[0].r)

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
