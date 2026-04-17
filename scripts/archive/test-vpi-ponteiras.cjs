const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

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

  // Pega token da Maria (teste)
  const p = await client.query(`
    SELECT card_token, nome, creditos_total, creditos_disponiveis, ponteiras_resgatadas_ano
      FROM public.vpi_partners
     WHERE lower(nome) LIKE '%maria%teste%' LIMIT 1
  `)
  if (p.rows.length === 0) { console.log('Maria nao encontrada'); await client.end(); return }
  const partner = p.rows[0]
  console.log('Maria ANTES:', partner)

  // Da 3 ponteiras pra Maria poder testar resgate
  await client.query(`
    UPDATE public.vpi_partners
       SET creditos_total = 3, creditos_disponiveis = 3,
           ponteiras_resgatadas_ano = 0,
           ponteiras_resgatadas_ano_ref = extract(year FROM now())::int
     WHERE lower(nome) LIKE '%maria%teste%'
  `)
  console.log('\nConcedidas 3 ponteiras pra teste.')

  // Testa resgate de 2 ponteiras (min valido)
  console.log('\n--- Teste 1: resgatar 2 ponteiras (SmoothLiftin + PIANO) ---')
  const r1 = await client.query(`
    SELECT public.vpi_pub_ponteira_resgatar($1, $2, $3) AS res
  `, [partner.card_token, 2, JSON.stringify(['SmoothLiftin', 'PIANO'])])
  console.log('Resultado:', JSON.stringify(r1.rows[0].res, null, 2))

  // Testa resgate de 1 ponteira (deve falhar)
  console.log('\n--- Teste 2: resgatar 1 ponteira (deve falhar — min 2) ---')
  const r2 = await client.query(`
    SELECT public.vpi_pub_ponteira_resgatar($1, $2, $3) AS res
  `, [partner.card_token, 1, JSON.stringify(['NX Runner'])])
  console.log('Resultado:', JSON.stringify(r2.rows[0].res, null, 2))

  // Estado final da Maria
  console.log('\n--- Maria DEPOIS ---')
  const p2 = await client.query(`
    SELECT creditos_total, creditos_disponiveis, ponteiras_resgatadas_ano
      FROM public.vpi_partners
     WHERE lower(nome) LIKE '%maria%teste%' LIMIT 1
  `)
  console.log(p2.rows[0])

  // Lista resgates da Maria
  console.log('\n--- Resgates da Maria ---')
  const r3 = await client.query(`
    SELECT id, quantidade, protocolos, status, created_at
      FROM public.vpi_ponteira_resgates
     WHERE partner_id = (SELECT id FROM public.vpi_partners WHERE lower(nome) LIKE '%maria%teste%' LIMIT 1)
     ORDER BY created_at DESC
  `)
  r3.rows.forEach(function (r) {
    console.log(' -', r.quantidade, 'ponteiras:', JSON.stringify(r.protocolos), '| status:', r.status)
  })

  // RPC admin list
  console.log('\n--- vpi_ponteira_resgate_list ---')
  const r4 = await client.query(`SELECT public.vpi_ponteira_resgate_list('pending') AS d`)
  console.log('Pending:', (r4.rows[0].d.rows || []).length, 'resgate(s)')

  await client.end()
}

main().catch(function (e) { console.error(e); process.exit(1) })
