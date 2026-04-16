const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // 1. Ver estrutura da tabela short_links
  const cols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'short_links' ORDER BY ordinal_position"
  )
  console.log('Colunas short_links:')
  cols.rows.forEach(r => console.log(' ', r.column_name, ':', r.data_type))

  // 2. Ver short_link_resolve
  const fn = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'short_link_resolve' LIMIT 1
  `)
  console.log('\nshort_link_resolve source:')
  console.log(fn.rows[0]?.prosrc?.substring(0, 500))

  // 3. Ver links existentes
  const links = await client.query('SELECT code, url, clicks FROM short_links ORDER BY created_at DESC LIMIT 5')
  console.log('\nLinks existentes:')
  links.rows.forEach(r => console.log(' ', r.code, '→', r.url, '(', r.clicks, 'clicks)'))

  await client.end()
}
main().catch(console.error)
