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

  console.log('--- Tiers configurados ---')
  const r1 = await client.query(`
    SELECT id, tipo, threshold, recompensa, recompensa_valor, is_active
      FROM public.vpi_reward_tiers
     ORDER BY threshold ASC LIMIT 20
  `)
  r1.rows.forEach(function (r) {
    console.log(r.tipo.padEnd(16), 'th=' + String(r.threshold).padEnd(4), 'valor=R$' + (r.recompensa_valor || 0), '-', r.recompensa)
  })

  console.log('\n--- Indications closed com tiers emitidos ---')
  const r2 = await client.query(`
    SELECT id, partner_id, recompensas_emitidas, fechada_em
      FROM public.vpi_indications
     WHERE status = 'closed'
       AND fechada_em >= date_trunc('year', now())
     ORDER BY fechada_em DESC LIMIT 20
  `)
  r2.rows.forEach(function (r) {
    const arr = r.recompensas_emitidas || []
    console.log(r.id, 'fechada=' + String(r.fechada_em).slice(0, 10), 'emitidas=' + JSON.stringify(arr).slice(0, 100))
  })

  console.log('\n--- Calculo manual do valor_rec_ano ---')
  const r3 = await client.query(`
    WITH emitted AS (
      SELECT
        (elem->>'tier_id')::uuid AS tier_id,
        COALESCE((elem->>'valor')::numeric, NULL) AS valor_inline
      FROM public.vpi_indications i,
           jsonb_array_elements(COALESCE(i.recompensas_emitidas, '[]'::jsonb)) elem
      WHERE i.status = 'closed'
        AND i.fechada_em >= date_trunc('year', now())
    )
    SELECT e.tier_id, e.valor_inline, t.recompensa_valor, t.recompensa
      FROM emitted e
      LEFT JOIN public.vpi_reward_tiers t ON t.id = e.tier_id
     LIMIT 20
  `)
  if (r3.rows.length === 0) {
    console.log('Nenhuma tier emitida no jsonb ate agora.')
  } else {
    r3.rows.forEach(function (r) {
      console.log('tier=' + r.tier_id, 'inline=' + r.valor_inline, 'tier_val=' + r.recompensa_valor, '-', r.recompensa)
    })
  }

  await client.end()
}

main().catch(function (e) { console.error(e); process.exit(1) })
