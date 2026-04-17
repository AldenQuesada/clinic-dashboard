/**
 * Aplica migration: VPI Impact Stories (Fase 9 - Entrega 5).
 * Uso: node scripts/archive/apply-vpi-impact-stories.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000094_vpi_impact_stories.sql'
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
  console.log('=== VPI Impact Stories (Fase 9 - Entrega 5) ===\n')
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Size:', sql.length, 'bytes\n')
  await client.connect(); console.log('Connected.')
  await client.query(sql); console.log('Migration OK.\n')

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_indications'
       AND column_name IN ('depoimento','foto_antes_url','foto_depois_url','consent_mostrar_na_historia','indicada_nome')
     ORDER BY column_name
  `)
  console.log('Colunas novas:', cols.rows.map(r=>r.column_name).join(', '))

  const fns = await client.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_pub_my_impact','vpi_indication_story_update','vpi_indication_stories_list','_vpi_first_name_from_lead')
     ORDER BY proname
  `)
  console.log('Funcoes:', fns.rows.map(r=>r.proname).join(', '))

  const t1 = await client.query(`SELECT public.vpi_pub_my_impact('bogus_token') AS r`)
  console.log('My impact bogus:', JSON.stringify(t1.rows[0].r))

  const t2 = await client.query(`SELECT public.vpi_indication_stories_list(NULL, 5) AS r`)
  console.log('Stories list (sample):', JSON.stringify(t2.rows[0].r).slice(0, 200) + '...')

  await client.end()
  console.log('\n=== OK ===')
}
main().catch(e => { console.error('ERR:', e.message); client.end().catch(()=>{}); process.exit(1) })
