const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()
  // Pega o body da função get_professionals
  const src = await client.query(`
    SELECT prosrc
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_professionals'
  `)
  const body = src.rows[0]?.prosrc || ''
  console.log('agenda_enabled no body de get_professionals:', body.includes('agenda_enabled') ? 'OK' : 'FALTA')
  await client.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
