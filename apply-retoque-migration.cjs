const { Client } = require('pg')
const fs = require('fs')
const sql = fs.readFileSync(__dirname + '/supabase/migrations/20260700000150_retoque_campaigns.sql', 'utf8')
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})
;(async () => {
  try {
    await c.connect()
    await c.query(sql)
    await c.query("NOTIFY pgrst, 'reload schema'")
    console.log('migration aplicada')
    const r = await c.query(`SELECT count(*) FROM retoque_campaigns`)
    console.log('retoque_campaigns row count:', r.rows[0].count)
    const fns = await c.query(`
      SELECT proname FROM pg_proc
      WHERE proname IN ('retoque_create','retoque_update_status','retoque_link_appointment','retoque_list')
      ORDER BY proname
    `)
    console.log('RPCs criadas:', fns.rows.map(r => r.proname).join(', '))
  } catch (e) { console.error('ERROR:', e.message); process.exit(1) }
  finally { await c.end() }
})()
