const { Client } = require('pg')
const fs = require('fs')
const sql = fs.readFileSync(__dirname + '/supabase/migrations/20260700000180_report_luxury_templates.sql', 'utf8')
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
    var t = await c.query(`SELECT count(*) FROM report_luxury_templates`)
    console.log('report_luxury_templates rows:', t.rows[0].count)
    var fns = await c.query(`SELECT proname FROM pg_proc WHERE proname IN ('report_template_upsert','report_template_load_all','report_template_reset') ORDER BY proname`)
    console.log('RPCs:', fns.rows.map(r => r.proname).join(', '))
  } catch (e) { console.error('ERROR:', e.message); process.exit(1) }
  finally { await c.end() }
})()
