const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000120_vpi_revista_full_face_spotlight.sql'
)

async function main() {
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.oqboitkpcvuaudouwvkl',
    password: 'Rosangela*121776',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  console.log('Conectado.\n')

  const sql = fs.readFileSync(MIGRATION, 'utf8')
  console.log('Aplicando migration (' + sql.length + ' chars)...')
  try {
    await client.query(sql)
    console.log('OK\n')
  } catch (e) {
    console.error('ERRO:', e.message)
    if (e.position) console.error('Pos:', e.position)
    if (e.where) console.error('Where:', e.where)
    await client.end()
    process.exit(1)
  }

  // Verifica que os objetos foram criados
  console.log('--- Verificacao ---')

  const r2 = await client.query(`
    SELECT proname FROM pg_proc
     WHERE proname IN (
       'vpi_revista_generate_full_face_spotlight',
       '_vpi_revista_upsert_asset',
       '_vpi_revista_ensure_edition',
       '_trg_vpi_revista_full_face_hook'
     )
     ORDER BY proname
  `)
  console.log('Funcoes criadas:', r2.rows.map(function (r) { return r.proname }).join(', '))

  const r3 = await client.query(`
    SELECT tgname FROM pg_trigger
     WHERE tgname = 'trg_vpi_revista_full_face_hook'
  `)
  console.log('Trigger criado:', r3.rows.map(function (r) { return r.tgname }).join(', ') || 'NENHUM')

  await client.end()
  console.log('\nFim.')
}

main().catch(function (e) { console.error('FALHA:', e.message); process.exit(1) })
