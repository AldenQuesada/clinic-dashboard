const { Client } = require('pg')
const fs = require('fs')
const sql = fs.readFileSync(__dirname + '/supabase/migrations/20260700000160_facial_shares.sql', 'utf8')
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
    const t = await c.query(`SELECT count(*) FROM facial_shares`)
    console.log('facial_shares row count:', t.rows[0].count)
    const log = await c.query(`SELECT count(*) FROM facial_share_access_log`)
    console.log('facial_share_access_log row count:', log.rows[0].count)
    const fns = await c.query(`
      SELECT proname FROM pg_proc
      WHERE proname IN ('fm_share_create','fm_share_resolve','fm_share_revoke','fm_share_list','fm_share_expire_old')
      ORDER BY proname
    `)
    console.log('RPCs:', fns.rows.map(r => r.proname).join(', '))
  } catch (e) { console.error('ERROR:', e.message); process.exit(1) }
  finally { await c.end() }
})()
