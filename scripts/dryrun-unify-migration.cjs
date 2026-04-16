/**
 * Dry-run da migration de unificacao.
 * Abre transacao, executa TODO SQL, mostra contagens, depois ROLLBACK.
 * Zero alteracao persistente.
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

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
  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260700000000_unify_wa_automations.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  // Remove o COMMIT final e substitui por ROLLBACK para dry-run
  const dryRunSql = sql
    .replace(/\nCOMMIT;/g, '\n-- COMMIT (dry-run: pulado)')
    // Comentarios de rollback NAO devem executar — ja sao comentarios

  console.log('═══════════════════════════════════════════════════')
  console.log('BEFORE — Estado atual')
  console.log('═══════════════════════════════════════════════════')
  const before1 = await client.query(`SELECT COUNT(*) AS n FROM wa_agenda_automations WHERE is_active = true`)
  const before2 = await client.query(`SELECT COUNT(*) AS n FROM wa_message_templates WHERE is_active = true`)
  console.log(`wa_agenda_automations ativas:   ${before1.rows[0].n}`)
  console.log(`wa_message_templates ativos:    ${before2.rows[0].n}`)

  console.log('\n═══════════════════════════════════════════════════')
  console.log('EXECUTANDO migration dentro de transacao...')
  console.log('═══════════════════════════════════════════════════')

  try {
    await client.query('BEGIN')
    // A migration ja tem BEGIN/COMMIT dentro. Remove apenas o COMMIT.
    await client.query(dryRunSql)
    console.log('✓ SQL executado sem erro')

    // Contagens APOS execucao
    const after1 = await client.query(`SELECT COUNT(*) AS n FROM wa_agenda_automations WHERE is_active = true`)
    const after2 = await client.query(`SELECT COUNT(*) AS n FROM wa_message_templates WHERE is_active = true`)
    const after3 = await client.query(`SELECT COUNT(*) AS n FROM wa_agenda_automations WHERE is_active = false`)
    console.log('\nAPOS migration:')
    console.log(`wa_agenda_automations ativas:   ${after1.rows[0].n} (era ${before1.rows[0].n})`)
    console.log(`wa_agenda_automations inativas: ${after3.rows[0].n}`)
    console.log(`wa_message_templates ativos:    ${after2.rows[0].n} (era ${before2.rows[0].n})`)

    // Detalhe: quais rules foram criadas (description sinalizando origem)
    const novos = await client.query(`
      SELECT name, trigger_type, trigger_config->'tag' AS tag,
             trigger_config->>'delay_days' AS delay_d, is_active
      FROM wa_agenda_automations
      WHERE description ILIKE '%migrada de wa_message_templates%'
         OR description ILIKE '%Campanha Fullface%'
         OR description ILIKE '%Campanha Olheiras%'
         OR description ILIKE '%Recuperacao de lead perdido%'
         OR description ILIKE '%Aplicar tag%'
         OR name IN ('Resposta Confirmacao','Lembrete Aguard. Confirmacao','Aguardando Retorno','Apos Consulta D+1','Orcamento Urgencia 7d','Encaixe Confirmacao','Orcamento Enviado Msg','Orcamento Follow-up 3d','Orcamento Fechado')
      ORDER BY sort_order, name
    `)
    console.log(`\nNovas regras criadas: ${novos.rows.length}`)
    console.table(novos.rows)

    // Validar que os templates de confirmacao imediata continuam ativos
    const confirm = await client.query(`SELECT slug, is_active FROM wa_message_templates WHERE slug LIKE 'scheduling_confirm_%'`)
    console.log('\nscheduling_confirm_* (devem estar ativos):')
    console.table(confirm.rows)

    await client.query('ROLLBACK')
    console.log('\n✓ ROLLBACK feito — nada foi persistido')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('\n✗ ERRO durante dry-run:')
    console.error(e.message)
    console.error(e.detail || '')
    console.error('Posicao:', e.position)
    process.exit(1)
  }

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
