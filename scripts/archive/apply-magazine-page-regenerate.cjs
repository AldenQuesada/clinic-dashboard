/**
 * Aplica: magazine_page_update_slots + magazine_page_get.
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION = path.join(__dirname,'..','..','supabase','migrations','20260690000023_magazine_page_regenerate.sql')
const client = new Client({
  host:'aws-0-us-west-2.pooler.supabase.com', port:5432,
  user:'postgres.oqboitkpcvuaudouwvkl', password:'Rosangela*121776',
  database:'postgres', ssl:{rejectUnauthorized:false},
})

;(async () => {
  await client.connect()
  const sql = fs.readFileSync(MIGRATION,'utf8')
  try { await client.query(sql); console.log('Migration OK') }
  catch(e){ console.error('FAILED:',e.message); process.exit(1) }
  const fns = await client.query(`SELECT proname FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace WHERE nspname='public' AND proname IN ('magazine_page_update_slots','magazine_page_get')`)
  console.log('RPCs:', fns.rows.map(r=>r.proname).join(', '))
  await client.end()
})().catch(e=>{console.error(e); process.exit(1)})
