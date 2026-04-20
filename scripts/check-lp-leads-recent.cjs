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
    const cols = await c.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='lp_leads'
      ORDER BY ordinal_position
    `)
    console.log('=== lp_leads columns ===')
    cols.rows.forEach(r => console.log(' ', r.column_name, r.data_type))

    const r = await c.query(`SELECT * FROM public.lp_leads ORDER BY created_at DESC LIMIT 3`)
    console.log('\n=== Últimos 3 leads ===')
    r.rows.forEach((row, i) => console.log(`\n[${i}]`, JSON.stringify(row).slice(0, 600)))
  } finally { await c.end() }
})()
