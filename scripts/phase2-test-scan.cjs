const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== TESTE: Simular scan com D-7, D-3, D-1 ===\n')

  // Simular o que o scanner faria — sem executar
  const tz = 'America/Sao_Paulo'
  const now = await client.query("SELECT now() as utc, (now() AT TIME ZONE 'America/Sao_Paulo')::date as today_br")
  console.log('UTC:', now.rows[0].utc)
  console.log('Hoje BR:', now.rows[0].today_br)

  const leads = await client.query(`
    SELECT l.name, l.phone, l.birth_date::date as bd,
           make_date(2026, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int) as bday
    FROM leads l
    WHERE l.clinic_id = '00000000-0000-0000-0000-000000000001'
      AND l.deleted_at IS NULL
      AND l.birth_date IS NOT NULL AND l.birth_date != ''
      AND l.phone IS NOT NULL AND l.phone != ''
      AND l.wa_opt_in = true
      AND (
        make_date(2026, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int)
        BETWEEN CURRENT_DATE AND CURRENT_DATE + 31
      )
      AND COALESCE(l.channel_mode, 'ai') != 'human'
    ORDER BY make_date(2026, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int)
  `)

  const templates = await client.query(`
    SELECT day_offset, send_hour, label FROM wa_birthday_templates
    WHERE clinic_id = '00000000-0000-0000-0000-000000000001' AND is_active = true
    ORDER BY sort_order
  `)

  console.log('Templates:', templates.rows.map(t => 'D-' + t.day_offset + ' ' + t.send_hour + 'h').join(', '))
  console.log('Leads elegiveis:', leads.rows.length)
  console.log('')

  let wouldCreate = 0

  for (const lead of leads.rows) {
    const bday = new Date(lead.bday)
    let msgs = []

    for (const tmpl of templates.rows) {
      // Calcular scheduled_at em BR
      const schedDate = new Date(bday.getTime() - tmpl.day_offset * 24 * 3600 * 1000)
      // 13h BR = 16h UTC
      const schedUTC = new Date(schedDate)
      schedUTC.setUTCHours(tmpl.send_hour + 3, 0, 0, 0) // +3 para UTC

      const isFuture = schedUTC > new Date(now.rows[0].utc)
      msgs.push({
        label: 'D-' + tmpl.day_offset,
        date: schedUTC.toISOString().split('T')[0],
        hour: tmpl.send_hour + 'h BR',
        future: isFuture
      })
    }

    const futureMsgs = msgs.filter(m => m.future)
    const willCreate = futureMsgs.length > 0

    if (willCreate) wouldCreate++

    const flag = willCreate ? '✓' : '✗ (sem msgs futuras)'
    console.log(lead.name, '| niver:', lead.bday.toISOString().split('T')[0], '|', flag)
    msgs.forEach(m => {
      const status = m.future ? '  ENVIAR' : '  passado'
      console.log('  ', m.label, m.date, m.hour, status)
    })
  }

  console.log('\n=== RESUMO ===')
  console.log('Total elegiveis:', leads.rows.length)
  console.log('Campanhas que seriam criadas:', wouldCreate)
  console.log('Campanhas ignoradas (sem msgs futuras):', leads.rows.length - wouldCreate)

  await client.end()
}
main().catch(console.error)
