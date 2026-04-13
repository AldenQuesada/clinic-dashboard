const { Client } = require('pg')
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})
;(async () => {
  await c.connect()

  // Verificar blacklist
  var r = await c.query(`SELECT * FROM wa_phone_blacklist WHERE phone LIKE '%998787673%'`)
  console.log('Blacklist:', r.rows.length ? r.rows : 'NAO esta na blacklist')

  // Verificar se Mira tem o numero autorizado
  var r2 = await c.query(`SELECT * FROM wa_pro_authorized_numbers WHERE phone LIKE '%998787673%'`)
  console.log('Autorizado Mira:', r2.rows.length ? 'SIM' : 'NAO')

  // Verificar authorized numbers
  var r3 = await c.query(`SELECT phone, professional_name FROM wa_pro_authorized_numbers ORDER BY created_at`)
  console.log('\nNumeros autorizados Mira:')
  r3.rows.forEach(r => console.log('  ' + r.phone + ' — ' + (r.professional_name || '')))

  await c.end()
})()
