const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000111_vpi_backfill_recompensas.sql'
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

  // Antes
  console.log('--- ANTES ---')
  const a = await client.query('SELECT public.vpi_pub_impact() AS d')
  console.log('recompensas_emitidas_ano:', a.rows[0].d.recompensas_emitidas_ano)

  // Aplica
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  console.log('\nAplicando backfill...')
  await client.query(sql)
  console.log('OK\n')

  // Depois
  console.log('--- DEPOIS ---')
  const b = await client.query('SELECT public.vpi_pub_impact() AS d')
  console.log('recompensas_emitidas_ano:', b.rows[0].d.recompensas_emitidas_ano)
  console.log('total_embaixadoras:', b.rows[0].d.total_embaixadoras)
  console.log('total_indicacoes_ano:', b.rows[0].d.total_indicacoes_ano)

  // Lista partners + tiers backfilled
  console.log('\n--- Partners com recompensas emitidas ---')
  const c = await client.query(`
    SELECT p.nome, p.creditos_total,
           (SELECT jsonb_agg(elem->>'recompensa')
              FROM public.vpi_indications i2,
                   jsonb_array_elements(i2.recompensas_emitidas) elem
             WHERE i2.partner_id = p.id) AS recompensas
      FROM public.vpi_partners p
     WHERE p.creditos_total > 0
     ORDER BY p.creditos_total DESC
  `)
  c.rows.forEach(function (r) {
    console.log((r.nome || '').padEnd(24), 'cred=' + r.creditos_total, '->', (r.recompensas || []).join(' | '))
  })

  await client.end()
}

main().catch(function (e) { console.error(e); process.exit(1) })
