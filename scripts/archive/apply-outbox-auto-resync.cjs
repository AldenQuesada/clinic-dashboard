/**
 * Aplica migration: wa_outbox auto-resync ao editar regra.
 * Uso: node scripts/archive/apply-outbox-auto-resync.cjs
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000010_wa_outbox_auto_resync.sql'
)

const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('=== wa_outbox auto-resync migration ===\n')

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

  const cols = await client.query(`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'wa_outbox'
       AND column_name IN ('rule_id', 'vars_snapshot')
     ORDER BY column_name
  `)
  console.log('wa_outbox columns:')
  cols.rows.forEach(r => console.log('  -', r.column_name, '(' + r.data_type + ')'))

  const fks = await client.query(`
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.wa_outbox'::regclass
       AND conname = 'wa_outbox_rule_id_fkey'
  `)
  console.log('FK wa_outbox_rule_id_fkey:', fks.rows.length ? 'OK' : 'MISSING')

  const idx = await client.query(`
    SELECT indexname
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'wa_outbox'
       AND indexname = 'idx_wa_outbox_rule_pending'
  `)
  console.log('Index idx_wa_outbox_rule_pending:', idx.rows.length ? 'OK' : 'MISSING')

  const fns = await client.query(`
    SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         '_wa_render_template',
         'wa_outbox_schedule_automation',
         'wa_outbox_resync_rule',
         '_wa_outbox_cancel_on_rule_delete'
       )
     ORDER BY p.proname
  `)
  console.log('Functions:')
  fns.rows.forEach(r => console.log('  -', r.proname + '(' + r.args + ')'))

  const trg = await client.query(`
    SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'public.wa_agenda_automations'::regclass
       AND tgname = 'trg_wa_outbox_cancel_on_rule_delete'
  `)
  console.log('Trigger trg_wa_outbox_cancel_on_rule_delete:', trg.rows.length ? 'OK' : 'MISSING')

  console.log('\n=== Concluido ===')
}

main()
  .catch(e => { console.error('ERROR:', e); process.exit(1) })
  .finally(() => client.end())
