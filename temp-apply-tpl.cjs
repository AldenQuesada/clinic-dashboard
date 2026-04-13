const { Client } = require('pg')
const fs = require('fs')
const sql = fs.readFileSync(__dirname + '/supabase/migrations/20260668000000_wa_templates_novo_retorno.sql', 'utf8')
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})
;(async () => {
  try {
    // Primeiro: garante a constraint unica que o ON CONFLICT precisa
    await c.connect()
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_wa_templates_clinic_slug ON public.wa_message_templates (clinic_id, slug)`)
    await c.query(sql)
    await c.query("NOTIFY pgrst, 'reload schema'")
    console.log('migration aplicada')
    const r = await c.query(`
      SELECT slug, category, is_active, LEFT(content, 80) as preview
      FROM wa_message_templates
      WHERE slug IN ('scheduling_confirm_novo', 'scheduling_confirm_retorno')
      ORDER BY slug
    `)
    console.log('\ntemplates criados:')
    r.rows.forEach(row => console.log(' -', row.slug, '|', row.is_active ? 'ON' : 'off', '|', row.preview))
  } catch (e) { console.error('ERROR:', e.message); process.exit(1) }
  finally { await c.end() }
})()
