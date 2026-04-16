/**
 * Reordena regras do modulo Agendamento com sort_order cronologico.
 * Agrupamento: ANTES (10-49) / DURANTE (50-69) / CASOS ESPECIAIS (70-109)
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

// name -> sort_order novo. Match exato por name.
var NEW_ORDER = {
  // ANTES da consulta
  'Confirmacao Agendamento — Paciente Novo':    10,
  'Confirmacao Agendamento — Paciente Retorno': 11,
  'Lembrete Aguard. Confirmacao':               20,
  'Tarefa Confirmar Presenca':                  21,
  'Resposta Confirmacao':                       30,
  'Tarefa Preparar Prontuario':                 31,
  'Confirmacao D-1':                            40,
  'Chegou o Dia':                               41,
  '30 Min Antes':                               42,
  'Alerta 10 Min':                              43,
  // DURANTE a consulta
  'Paciente Chegou':                            50,
  'Consentimento Imagem':                       51,
  'Alexa: Boas-vindas Recepcao':                52,
  'Alexa: Aviso Dra Mirian':                    53,
  'Em Consulta':                                60,
  // CASOS ESPECIAIS
  'Remarcamento':                               70,
  'Cancelamento':                               80,
  'Tarefa Recuperar Cancelamento':              81,
  'Recuperacao No-show':                        90,
  'Tarefa Recuperar No-show':                   91,
  'Encaixe Confirmacao':                        100,
}

async function main() {
  await client.connect()

  var updated = []
  var notFound = []

  for (var name in NEW_ORDER) {
    var res = await client.query(
      'UPDATE wa_agenda_automations SET sort_order = $1, updated_at = now() WHERE name = $2 RETURNING id, name, sort_order',
      [NEW_ORDER[name], name]
    )
    if (res.rows.length) updated.push(res.rows[0])
    else notFound.push(name)
  }

  console.log('[OK] Atualizadas ' + updated.length + ' regras:')
  console.table(updated.map(function(r) { return { name: r.name, sort_order: r.sort_order } }))
  if (notFound.length) {
    console.log('\n[WARN] Nao encontradas (nomes diferentes no DB?):')
    notFound.forEach(function(n) { console.log(' - ' + n) })
  }

  await client.end()
}

main().catch(function(e) { console.error('ERRO:', e.message); process.exit(1) })
