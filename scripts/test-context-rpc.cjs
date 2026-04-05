const SUPABASE_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'

async function main() {
  // 1. Testar wa_get_lead_context pro Alden
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/wa_get_lead_context', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_phone: '5544998787673' }),
  })
  const data = await r.json()
  console.log('=== wa_get_lead_context(5544998787673) ===')
  console.log('conversation_id:', data.conversation_id)
  console.log('lead:', data.lead?.name, data.lead?.id)
  console.log('message_count:', data.message_count)
  console.log('history length:', data.history?.length)
  console.log('is_returning:', data.is_returning)

  // 2. Testar wa_log_message_sequential simulando o que o n8n faria
  console.log('\n=== Simulando log inbound ===')
  const log = await fetch(SUPABASE_URL + '/rest/v1/rpc/wa_log_message_sequential', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_phone: '5544998787673',
      p_lead_id: '4af193c0-f939-4bea-88f9-3d1be0f64dd6',
      p_user_message: 'TESTE: simulando resposta do lead pra testar trigger birthday',
      p_ai_response: '',
      p_tokens_used: 0,
      p_tags: '[]',
      p_persona: 'onboarder',
      p_detected_name: null,
      p_conversation_id: data.conversation_id || null,
    }),
  })
  const logData = await log.json()
  console.log('Log result:', JSON.stringify(logData))

  // 3. Esperar e checar se campanha mudou pra responded
  await new Promise(r => setTimeout(r, 2000))

  const { Client } = require('pg')
  const client = new Client({
    host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
    port: 5432, user: 'postgres', password: 'Rosangela*121776',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  })
  await client.connect()

  const camp = await client.query(
    "SELECT id, status, responded_at FROM wa_birthday_campaigns WHERE lead_id = '4af193c0-f939-4bea-88f9-3d1be0f64dd6'"
  )
  console.log('\n=== Campanha apos inbound ===')
  console.log('Status:', camp.rows[0]?.status, '| responded_at:', camp.rows[0]?.responded_at)

  // Checar outbox pra auto-reply
  const outbox = await client.query(`
    SELECT id, status, substring(content from 1 for 80) as txt, created_at
    FROM wa_outbox
    WHERE phone = '5544998787673'
    ORDER BY created_at DESC LIMIT 3
  `)
  console.log('\n=== Outbox ===')
  outbox.rows.forEach(r => console.log(' ', r.status, '|', r.txt))

  await client.end()
}
main().catch(console.error)
