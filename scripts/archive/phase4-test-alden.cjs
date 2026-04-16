const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== FASE 4: Teste com Alden ===\n')

  // 1. Limpar campanhas anteriores do Alden (todas)
  await client.query("DELETE FROM wa_birthday_messages WHERE campaign_id IN (SELECT id FROM wa_birthday_campaigns WHERE lead_id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6')")
  await client.query("DELETE FROM wa_birthday_campaigns WHERE lead_id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'")
  console.log('✓ Campanhas anteriores do Alden limpas')

  // 2. Verificar birth_date do Alden
  const alden = await client.query("SELECT id, name, phone, birth_date FROM leads WHERE id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'")
  console.log('\nAlden:', alden.rows[0]?.name, '| birth:', alden.rows[0]?.birth_date, '| phone:', alden.rows[0]?.phone)

  // Alden precisa ter aniversario nos proximos 8 dias pra pegar D-7
  // Vou temporariamente mudar pra 12 de abril (daqui 7 dias)
  const testBday = '1990-04-12'
  await client.query("UPDATE leads SET birth_date = $1 WHERE id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'", [testBday])
  console.log('Birth date temporaria:', testBday, '(aniversario 12 de abril)')

  // 3. Rodar scanner
  console.log('\n--- Rodando wa_birthday_scan() ---')
  const scan = await client.query("SELECT wa_birthday_scan() as result")
  console.log('Resultado:', JSON.stringify(scan.rows[0]?.result))

  // 4. Verificar campanha criada
  const camp = await client.query(`
    SELECT id, lead_name, status, birth_date, campaign_year, queixas
    FROM wa_birthday_campaigns
    WHERE lead_id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'
  `)
  if (camp.rows.length === 0) {
    console.log('\n✗ Campanha NAO criada!')
    await client.end()
    return
  }
  const c = camp.rows[0]
  console.log('\nCampanha criada:')
  console.log('  ID:', c.id)
  console.log('  Status:', c.status)
  console.log('  Birth:', c.birth_date)
  console.log('  Queixas:', c.queixas)

  // 5. Verificar birthday_messages
  const msgs = await client.query(`
    SELECT id, day_offset, send_hour, scheduled_at, status, content, template_id
    FROM wa_birthday_messages
    WHERE campaign_id = $1
    ORDER BY day_offset DESC
  `, [c.id])
  console.log('\nMensagens agendadas:', msgs.rows.length)
  msgs.rows.forEach(m => {
    const schedBR = new Date(new Date(m.scheduled_at).getTime()).toISOString()
    console.log('  D-' + m.day_offset, '| ' + m.send_hour + 'h |', schedBR, '| status:', m.status, '| content:', m.content ? m.content.substring(0, 40) + '...' : 'NULL (resolve no envio)')
  })

  // 6. Simular enqueue da primeira msg (D-7) — forcar scheduled_at pra agora
  console.log('\n--- Forcando D-7 pra agora (teste) ---')
  const d7 = msgs.rows.find(m => m.day_offset === 7)
  if (d7) {
    await client.query("UPDATE wa_birthday_messages SET scheduled_at = now() - interval '1 minute' WHERE id = $1", [d7.id])
    console.log('D-7 scheduled_at ajustado pra agora')

    // Rodar enqueue
    console.log('\n--- Rodando wa_birthday_enqueue() ---')
    const enq = await client.query("SELECT wa_birthday_enqueue() as result")
    console.log('Resultado:', JSON.stringify(enq.rows[0]?.result))

    // Verificar outbox
    const outbox = await client.query(`
      SELECT id, phone, status, substring(content from 1 for 100) as txt
      FROM wa_outbox
      WHERE lead_id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'
      ORDER BY created_at DESC LIMIT 1
    `)
    if (outbox.rows.length > 0) {
      console.log('\n✓ Outbox criado:')
      console.log('  ID:', outbox.rows[0].id)
      console.log('  Phone:', outbox.rows[0].phone)
      console.log('  Status:', outbox.rows[0].status)
      console.log('  Conteudo:', outbox.rows[0].txt)
    } else {
      console.log('\n✗ Outbox NAO criado!')
    }

    // Verificar birthday_message atualizada
    const bmCheck = await client.query("SELECT status, outbox_id, content FROM wa_birthday_messages WHERE id = $1", [d7.id])
    console.log('\nBirthday message D-7:')
    console.log('  Status:', bmCheck.rows[0]?.status)
    console.log('  Outbox ID:', bmCheck.rows[0]?.outbox_id)
    console.log('  Conteudo gravado:', bmCheck.rows[0]?.content?.substring(0, 80))
  }

  // 7. Verificar campanha status
  const campFinal = await client.query("SELECT status, started_at FROM wa_birthday_campaigns WHERE id = $1", [c.id])
  console.log('\nCampanha final:')
  console.log('  Status:', campFinal.rows[0]?.status)
  console.log('  Started:', campFinal.rows[0]?.started_at)

  await client.end()
  console.log('\n=== Msg vai pro outbox → n8n envia em ~2min ===')
  console.log('Verifica no WhatsApp se chegou corretamente!')
}
main().catch(console.error)
