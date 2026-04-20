const { Client } = require('pg')
;(async () => {
  const c = new Client({
    host:'db.oqboitkpcvuaudouwvkl.supabase.co', port:5432,
    user:'postgres', database:'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl:{ rejectUnauthorized:false },
  })
  await c.connect()
  try {
    const r = await c.query(`
      SELECT id, phone, name, template_key, lifecycle, status, attempts,
             left(error_message, 300) AS err,
             left(message_text, 200) AS msg,
             created_at, dispatched_at
      FROM public.anatomy_quiz_lara_dispatch
      ORDER BY created_at DESC
      LIMIT 5
    `)
    console.log('=== Últimos 5 dispatches ===')
    r.rows.forEach((row, i) => {
      console.log(`\n[${i}] ${row.id}`)
      console.log('  phone:', row.phone, '· name:', row.name)
      console.log('  template:', row.template_key, '· lifecycle:', row.lifecycle)
      console.log('  status:', row.status, '· attempts:', row.attempts)
      console.log('  created:', row.created_at)
      if (row.dispatched_at) console.log('  dispatched:', row.dispatched_at)
      if (row.err) console.log('  ERROR:', row.err)
      if (row.msg) console.log('  msg preview:', row.msg)
    })
    if (!r.rows.length) console.log('(nenhum dispatch encontrado)')

    // Check cron job activity
    const j = await c.query(`
      SELECT jobname, schedule, last_run_started, last_run_finished, last_run_status
      FROM cron.job_run_details d
      JOIN cron.job j ON d.jobid = j.jobid
      WHERE j.jobname = 'aq_lara_dispatcher'
      ORDER BY d.start_time DESC LIMIT 3
    `).catch(_ => ({ rows: [] }))
    if (j.rows.length) {
      console.log('\n=== Últimos 3 runs do cron ===')
      j.rows.forEach(r => console.log(' ', r))
    }
  } finally { await c.end() }
})()
