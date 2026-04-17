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

  console.log('--- Indications Full Face (creditos=5) ---')
  const r1 = await client.query(`
    SELECT id, partner_id, creditos, procedimento, indicada_nome,
           consent_mostrar_na_historia,
           (foto_antes_url IS NOT NULL) AS has_foto_antes,
           (foto_depois_url IS NOT NULL) AS has_foto_depois,
           (depoimento IS NOT NULL AND length(depoimento) > 20) AS has_depoimento,
           fechada_em
      FROM public.vpi_indications
     WHERE status = 'closed' AND creditos = 5
     ORDER BY fechada_em DESC LIMIT 5
  `)
  console.log('Full Face encontradas:', r1.rows.length)
  r1.rows.forEach(function (r) {
    console.log(' -', r.id, 'proc=' + r.procedimento, 'consent=' + r.consent_mostrar_na_historia,
                'antes=' + r.has_foto_antes, 'depois=' + r.has_foto_depois, 'depo=' + r.has_depoimento)
  })

  if (r1.rows.length === 0) {
    console.log('\nNenhuma Full Face pra testar. Criando cenario sintetico...')
    // Pega uma indication qualquer e finge Full Face
    const any = await client.query(`SELECT id FROM public.vpi_indications WHERE status='closed' LIMIT 1`)
    if (any.rows.length === 0) {
      console.log('Nem indication closed existe. Pulando teste.')
      await client.end()
      return
    }
    const testId = any.rows[0].id
    console.log('Testando com indication:', testId)
    const r2 = await client.query(`SELECT public.vpi_revista_generate_full_face_spotlight($1) AS res`, [testId])
    console.log('Resultado:', JSON.stringify(r2.rows[0].res, null, 2))
  } else {
    const testId = r1.rows[0].id
    console.log('\nTestando funcao com:', testId)
    const r2 = await client.query(`SELECT public.vpi_revista_generate_full_face_spotlight($1) AS res`, [testId])
    console.log('Resultado:', JSON.stringify(r2.rows[0].res, null, 2))
  }

  // Lista audit recente
  console.log('\n--- Audit recente revista ---')
  const r3 = await client.query(`
    SELECT created_at, action, entity_id, payload
      FROM public.vpi_audit_log
     WHERE action LIKE 'revista%'
     ORDER BY created_at DESC LIMIT 5
  `)
  r3.rows.forEach(function (r) {
    console.log(' -', String(r.created_at).slice(0, 19), r.action, JSON.stringify(r.payload).slice(0, 100))
  })

  await client.end()
}

main().catch(function (e) { console.error(e); process.exit(1) })
