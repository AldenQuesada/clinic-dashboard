/**
 * Auditoria: quantas mensagens um paciente recebe ao ser agendado para HOJE à tarde.
 */
const { Client } = require('pg')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()

  console.log('=== Templates de mensagem por fase (wa_message_templates) ===')
  const r2 = await client.query(`
    SELECT trigger_phase, slug, name, day, delay_hours, delay_minutes, sort_order,
           LEFT(content, 80) AS preview
    FROM wa_message_templates
    WHERE is_active = true AND trigger_phase IS NOT NULL
    ORDER BY trigger_phase, sort_order, day, delay_hours, delay_minutes
  `)
  console.table(r2.rows)

  console.log('\n=== Template de confirmação imediata (scheduling_confirm_*) ===')
  const r3 = await client.query(`
    SELECT slug, name, is_active, LEFT(content, 80) AS preview
    FROM wa_message_templates
    WHERE slug IN ('scheduling_confirm_novo','scheduling_confirm_retorno')
  `)
  console.table(r3.rows)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => client.end())
