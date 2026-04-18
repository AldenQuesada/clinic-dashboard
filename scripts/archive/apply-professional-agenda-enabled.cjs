/**
 * Aplica migration: professional_profiles.agenda_enabled + RPCs atualizadas.
 * Uso: node scripts/archive/apply-professional-agenda-enabled.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000220_professional_agenda_enabled.sql'
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
  console.log('=== professional_profiles.agenda_enabled ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  await client.query(sql)
  console.log('Migration OK.\n')

  console.log('--- Sanity: coluna ---')
  const col = await client.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='professional_profiles'
      AND column_name='agenda_enabled'
  `)
  console.log(col.rows[0] ? `  agenda_enabled: ${col.rows[0].data_type} default ${col.rows[0].column_default}` : '  AUSENTE')

  console.log('\n--- Sanity: RPC signatures ---')
  const fns = await client.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('get_professionals','upsert_professional')
  `)
  fns.rows.forEach(r => {
    const hasAgenda = r.args.includes('agenda_enabled')
    console.log(`  ${r.proname}: ${hasAgenda ? 'OK (agenda_enabled presente)' : 'FALTA agenda_enabled'}`)
  })

  console.log('\n--- Backfill: garantir que todos existentes estão true ---')
  const bf = await client.query(`
    UPDATE public.professional_profiles
       SET agenda_enabled = true
     WHERE agenda_enabled IS NULL
    RETURNING id
  `)
  console.log(`  Atualizados: ${bf.rowCount}`)

  console.log('\n--- Smoke: listar profs visíveis ---')
  const smoke = await client.query(`
    SELECT display_name, nivel, agenda_enabled
    FROM public.professional_profiles
    WHERE is_active = true
    ORDER BY lower(display_name)
    LIMIT 20
  `)
  smoke.rows.forEach(r => console.log(`  ${r.agenda_enabled ? '[X]' : '[ ]'} ${r.display_name} (${r.nivel})`))

  await client.end()
  console.log('\nDone.')
}

main().catch(err => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
