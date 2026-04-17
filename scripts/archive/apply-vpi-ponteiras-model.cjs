const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000130_vpi_ponteiras_model.sql'
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
  await client.connect()
  console.log('Conectado.\n')

  const sql = fs.readFileSync(MIGRATION, 'utf8')
  console.log('Aplicando migration (' + sql.length + ' chars)...')
  try {
    await client.query(sql)
    console.log('OK\n')
  } catch (e) {
    console.error('ERRO:', e.message)
    if (e.position) console.error('Pos:', e.position)
    if (e.where) console.error('Where:', e.where)
    await client.end()
    process.exit(1)
  }

  console.log('--- Verificacao ---')

  const r0 = await client.query(`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE tipo = 'per_indication') AS per_ind,
           COUNT(*) FILTER (WHERE tipo = 'milestone') AS milestones,
           COUNT(*) FILTER (WHERE tipo = 'high_performance') AS high_perf
      FROM public.vpi_reward_tiers
  `)
  console.log('Tiers restantes:', r0.rows[0])

  const r1 = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_name = 'vpi_partners' AND column_name LIKE 'ponteiras%'
     ORDER BY column_name
  `)
  console.log('Colunas ponteiras:', r1.rows.map(function (r) { return r.column_name }).join(', '))

  const r2 = await client.query(`SELECT to_regclass('public.vpi_ponteira_resgates') AS t`)
  console.log('Tabela vpi_ponteira_resgates:', r2.rows[0].t || 'NAO EXISTE')

  const r3 = await client.query(`
    SELECT proname FROM pg_proc
     WHERE proname LIKE 'vpi_%ponteira%'
     ORDER BY proname
  `)
  console.log('RPCs criadas:', r3.rows.map(function (r) { return r.proname }).join(', '))

  // Testa resumo publico pra Maria (agora com saldo zerado)
  console.log('\n--- Teste: vpi_pub_ponteiras_resumo pra Maria ---')
  const r4 = await client.query(`
    SELECT public.vpi_pub_ponteiras_resumo(card_token) AS d
      FROM public.vpi_partners
     WHERE lower(nome) LIKE '%maria%teste%'
     LIMIT 1
  `)
  if (r4.rows.length > 0) {
    const d = r4.rows[0].d
    console.log('disponiveis:', d.disponiveis)
    console.log('resgatadas_ano:', d.resgatadas_ano)
    console.log('restante_ano:', d.restante_ano)
    console.log('fotona_completa_em:', d.fotona_completa_em)
    console.log('protocolos:', (d.protocolos_disponiveis || []).map(function (p) { return p.id }).join(', '))
  }

  await client.end()
  console.log('\nFim.')
}

main().catch(function (e) { console.error('FALHA:', e.message); process.exit(1) })
