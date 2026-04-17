const fs = require('fs'), path = require('path'), { Client } = require('pg'), dns = require('dns')
dns.setDefaultResultOrder('ipv6first')
const client = new Client({
  host:'aws-0-us-west-2.pooler.supabase.com', port:5432,
  user:'postgres.oqboitkpcvuaudouwvkl', password:'Rosangela*121776',
  database:'postgres', ssl:{rejectUnauthorized:false},
})
;(async () => {
  await client.connect()
  const sql = fs.readFileSync(path.join(__dirname,'..','..','supabase','migrations','20260690000024_magazine_prompt_library.sql'),'utf8')
  try { await client.query(sql); console.log('Migration OK') }
  catch(e){ console.error('FAILED:',e.message); process.exit(1) }
  const rows = await client.query(`SELECT count(*) AS c, (SELECT count(*) FROM public.clinics) AS clinicas FROM public.magazine_prompt_library`)
  console.log('prompts na library:', rows.rows[0].c, '· clinicas:', rows.rows[0].clinicas)
  const fns = await client.query(`SELECT proname FROM pg_proc WHERE proname LIKE 'magazine_prompt_library%'`)
  console.log('RPCs:', fns.rows.map(r=>r.proname).join(', '))
  await client.end()
})().catch(e=>{console.error(e); process.exit(1)})
