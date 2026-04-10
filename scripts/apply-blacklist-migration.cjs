/**
 * Aplica migration 20260638 — wa_phone_blacklist
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const MIGRATION = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260638000000_wa_phone_blacklist.sql'
)

async function main() {
  const client = new Client({
    host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
    port: 5432,
    user: 'postgres',
    password: 'Rosangela*121776',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })

  console.log('Conectando ao PostgreSQL...')
  await client.connect()
  console.log('OK\n')

  const sql = fs.readFileSync(MIGRATION, 'utf8')
  console.log(`Aplicando: ${path.basename(MIGRATION)}`)
  console.log(`Tamanho: ${sql.length} chars\n`)

  try {
    await client.query(sql)
    console.log('Migration aplicada com sucesso\n')
  } catch (e) {
    console.error('ERRO:', e.message)
    if (e.position) console.error('Position:', e.position)
    throw e
  }

  // Verificar
  console.log('--- Verificacao ---')
  const r1 = await client.query('SELECT COUNT(*) FROM public.wa_phone_blacklist')
  console.log(`Telefones na blacklist: ${r1.rows[0].count}`)

  const r2 = await client.query(`
    SELECT phone, reason FROM public.wa_phone_blacklist ORDER BY phone LIMIT 5
  `)
  console.log('Sample:')
  r2.rows.forEach(row => console.log(`  ${row.phone}: ${row.reason}`))

  // Testar funcao helper
  const r3 = await client.query(
    "SELECT public.wa_is_phone_blacklisted('554498787673') AS alden"
  )
  console.log(`\nwa_is_phone_blacklisted('554498787673') = ${r3.rows[0].alden}`)

  const r4 = await client.query(
    "SELECT public.wa_is_phone_blacklisted('554499999999') AS rand"
  )
  console.log(`wa_is_phone_blacklisted('554499999999') = ${r4.rows[0].rand}`)

  await client.end()
  console.log('\nFeito.')
}

main().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
