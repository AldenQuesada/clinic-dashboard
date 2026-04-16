const { Client } = require('pg')
const c = new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.oqboitkpcvuaudouwvkl',password:'Rosangela*121776',database:'postgres',ssl:{rejectUnauthorized:false}})
c.connect().then(async () => {
  const r = await c.query(
    "UPDATE wa_agenda_automations " +
    "SET content_template = regexp_replace(content_template, '\\{(\\w+)\\}', '{{\\1}}', 'g') " +
    "WHERE trigger_type = 'on_status' " +
    "AND trigger_config->>'status' = 'agendado' " +
    "AND trigger_config->>'patient_type' IN ('novo','retorno') " +
    "RETURNING id, name, LEFT(content_template, 80) as preview"
  )
  console.log('Convertido:')
  console.table(r.rows)
  c.end()
}).catch(e => { console.error(e.message); process.exit(1) })
