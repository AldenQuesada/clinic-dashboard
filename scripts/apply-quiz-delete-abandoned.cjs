const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260686000000_quiz_delete_abandoned_sessions.sql'), 'utf8')
  await client.query(sql)
  console.log('Migration applied: quiz_delete_abandoned_sessions')
  await client.end()
}

main().catch(err => { console.error(err); process.exit(1) })
