const { Client } = require('pg')
const fs = require('fs')
const sql = fs.readFileSync(__dirname + '/supabase/migrations/20260700000161_facial_shares_cron.sql', 'utf8')
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})
;(async () => {
  try {
    await c.connect()
    await c.query(sql)
    console.log('migration aplicada')
    var jobs = await c.query(`SELECT jobid, jobname, schedule, command, active FROM cron.job WHERE jobname = 'fm-share-expire-old'`)
    if (jobs.rows.length) {
      console.log('Job agendado:')
      jobs.rows.forEach(function (j) {
        console.log('  id=' + j.jobid + ' name=' + j.jobname + ' schedule="' + j.schedule + '" active=' + j.active)
      })
    } else {
      console.log('AVISO: job nao encontrado em cron.job')
    }
  } catch (e) {
    console.error('ERROR:', e.message)
    process.exit(1)
  } finally { await c.end() }
})()
