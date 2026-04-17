/**
 * Aplica migration: VPI Consent LGPD + Opt-Out (Fase 7 - Entrega 1).
 * Uso: node scripts/archive/apply-vpi-lgpd-consent.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000070_vpi_lgpd_consent.sql'
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
  console.log('=== VPI Consent LGPD + Opt-Out (Fase 7 - Entrega 1) ===\n')

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

  console.log('--- Sanity ---')
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_partners'
       AND column_name IN ('lgpd_consent_at','lgpd_consent_method','opt_out_at','opt_out_reason')
     ORDER BY column_name
  `)
  console.log('Colunas LGPD:', cols.rows.map(r => r.column_name).join(', '))

  const trg = await client.query(`
    SELECT tgname FROM pg_trigger WHERE tgname='trg_vpi_detect_aceito' AND NOT tgisinternal
  `)
  console.log('Trigger aceito:', trg.rows.length ? 'registrado' : 'NAO CRIADO')

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_pub_opt_out','vpi_grant_consent_by_phone','vpi_admin_grant_consent')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r => r.proname).join(', '))

  const tpl = await client.query(`
    SELECT slug, description FROM public.wa_agenda_automations WHERE slug='vpi_convite_parceiro'
  `)
  console.log('Template convite:', tpl.rows.length ? 'ATUALIZADO' : 'NAO ENCONTRADO')

  const status = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
     WHERE conrelid='public.vpi_partners'::regclass AND contype='c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  `)
  console.log('Status check:', status.rows.length ? status.rows[0].def : 'AUSENTE')

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
