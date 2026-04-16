/**
 * Fase 1 — Inspeção para unificar wa_message_templates -> wa_agenda_automations
 * NÃO EXECUTA nada, só gera relatório.
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

  // 1. Schema de wa_agenda_automations
  console.log('═══════════════════════════════════════════════════')
  console.log('1. SCHEMA wa_agenda_automations')
  console.log('═══════════════════════════════════════════════════')
  const s1 = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'wa_agenda_automations'
    ORDER BY ordinal_position
  `)
  console.table(s1.rows)

  // 2. Schema de wa_message_templates
  console.log('\n═══════════════════════════════════════════════════')
  console.log('2. SCHEMA wa_message_templates')
  console.log('═══════════════════════════════════════════════════')
  const s2 = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'wa_message_templates'
    ORDER BY ordinal_position
  `)
  console.table(s2.rows)

  // 3. Valores distintos de trigger_type já em uso
  console.log('\n═══════════════════════════════════════════════════')
  console.log('3. Trigger types em uso em wa_agenda_automations')
  console.log('═══════════════════════════════════════════════════')
  const s3 = await client.query(`
    SELECT trigger_type, COUNT(*) as n
    FROM wa_agenda_automations
    WHERE is_active = true
    GROUP BY trigger_type
    ORDER BY trigger_type
  `)
  console.table(s3.rows)

  // 4. Todos os templates ativos com todos os campos relevantes
  console.log('\n═══════════════════════════════════════════════════')
  console.log('4. TODOS os templates ATIVOS em wa_message_templates')
  console.log('═══════════════════════════════════════════════════')
  const s4 = await client.query(`
    SELECT id, slug, name, category, trigger_phase,
           day, delay_hours, delay_minutes, sort_order,
           type, LEFT(content, 50) AS preview
    FROM wa_message_templates
    WHERE is_active = true
    ORDER BY trigger_phase NULLS FIRST, sort_order, slug
  `)
  console.table(s4.rows)

  // 5. Templates SEM trigger_phase (textos sob demanda)
  console.log('\n═══════════════════════════════════════════════════')
  console.log('5. Templates SEM trigger_phase (textos sob demanda — candidatos a MANTER)')
  console.log('═══════════════════════════════════════════════════')
  const s5 = await client.query(`
    SELECT slug, name, category, LEFT(content, 60) AS preview
    FROM wa_message_templates
    WHERE is_active = true AND (trigger_phase IS NULL OR trigger_phase = '')
    ORDER BY slug
  `)
  console.table(s5.rows)

  // 6. Grep no código: quem chama cada slug
  console.log('\n═══════════════════════════════════════════════════')
  console.log('6. wa_agenda_automations — TODAS regras (active + inactive)')
  console.log('═══════════════════════════════════════════════════')
  const s6 = await client.query(`
    SELECT name, trigger_type, trigger_config, channel, is_active,
           LEFT(COALESCE(content_template, ''), 40) AS content_preview
    FROM wa_agenda_automations
    ORDER BY is_active DESC, trigger_type, name
  `)
  console.table(s6.rows)

  // 7. Detectar duplicatas potenciais: templates em wa_message_templates com categoria 'agendamento'
  console.log('\n═══════════════════════════════════════════════════')
  console.log('7. Duplicatas potenciais: templates com trigger_phase=agendado vs regras D-1/D-0 existentes')
  console.log('═══════════════════════════════════════════════════')
  const s7 = await client.query(`
    SELECT slug, name, day, delay_hours, delay_minutes, LEFT(content, 80) AS preview
    FROM wa_message_templates
    WHERE is_active = true AND trigger_phase = 'agendado'
  `)
  console.table(s7.rows)

  // 8. Quais slugs de wa_message_templates são referenciados no JS (textos sob demanda)
  console.log('\n═══════════════════════════════════════════════════')
  console.log('8. Outros slugs referenciados em consultas RPC/JS (precisam MANTER como textos)')
  console.log('═══════════════════════════════════════════════════')
  console.log('   Ver via grep no código — vai aparecer no próximo passo')

  // 9. Mapeamento de cada trigger_phase para tag/status candidato
  console.log('\n═══════════════════════════════════════════════════')
  console.log('9. Templates agrupados por trigger_phase (para planejar o on_tag)')
  console.log('═══════════════════════════════════════════════════')
  const s9 = await client.query(`
    SELECT trigger_phase, COUNT(*) AS qtd, STRING_AGG(slug, ', ' ORDER BY sort_order) AS slugs
    FROM wa_message_templates
    WHERE is_active = true AND trigger_phase IS NOT NULL AND trigger_phase <> ''
    GROUP BY trigger_phase
    ORDER BY qtd DESC
  `)
  console.table(s9.rows)

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
