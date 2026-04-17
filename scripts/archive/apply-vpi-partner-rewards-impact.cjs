/**
 * Aplica migration 20260700000110 — vpi_partner_rewards_impact
 * Muda a RPC vpi_pub_impact pra retornar recompensas entregues (etica) em vez de receita.
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION = path.join(
  __dirname,
  '..',
  '..',
  'supabase',
  'migrations',
  '20260700000110_vpi_partner_rewards_impact.sql'
)

async function main() {
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.oqboitkpcvuaudouwvkl',
    password: 'Rosangela*121776',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })

  console.log('Conectando ao PostgreSQL...')
  await client.connect()
  console.log('OK\n')

  const sql = fs.readFileSync(MIGRATION, 'utf8')
  console.log(`Aplicando: ${path.basename(MIGRATION)}`)
  console.log(`Tamanho: ${sql.length} chars\n`)

  try {
    await client.query(sql)
    console.log('Migration aplicada com sucesso\n')
  } catch (e) {
    console.error('ERRO:', e.message)
    if (e.position) console.error('Position:', e.position)
    throw e
  }

  // Verificar que vpi_pub_impact retorna a nova estrutura
  console.log('--- Verificacao: vpi_pub_impact ---')
  const r1 = await client.query(`SELECT public.vpi_pub_impact() AS d`)
  const d = r1.rows[0].d
  console.log('Keys retornadas:', Object.keys(d).join(', '))
  console.log('total_embaixadoras:', d.total_embaixadoras)
  console.log('total_indicacoes_ano:', d.total_indicacoes_ano)
  console.log('recompensas_emitidas_ano:', d.recompensas_emitidas_ano)
  console.log('ano_ref:', d.ano_ref)

  // Check que valor_total_ano sumiu (nao deve mais vir)
  if ('valor_total_ano' in d) {
    console.log('\nAVISO: valor_total_ano ainda presente no retorno (reversao necessaria)')
  } else {
    console.log('\nOK: valor_total_ano removido (etica aplicada)')
  }

  await client.end()
  console.log('\nFim.')
}

main().catch(function (e) {
  console.error('FALHA FINAL:', e.message)
  process.exit(1)
})
