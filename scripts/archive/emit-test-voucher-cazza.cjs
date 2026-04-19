/**
 * Emite voucher de teste pra parceria Cazza Flor.
 * Uso: node scripts/archive/emit-test-voucher-cazza.cjs
 */
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

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

  // 1. Busca Cazza Flor
  const p = await client.query(`
    SELECT id, name, slug, status, voucher_combo
      FROM public.b2b_partnerships
     WHERE name ILIKE '%cazza%' OR slug ILIKE '%cazza%'
     LIMIT 1
  `)
  if (!p.rowCount) {
    console.log('Cazza Flor NÃO encontrada nas parcerias.')
    console.log('Parcerias ativas disponíveis:')
    const all = await client.query(`SELECT name, slug, status FROM public.b2b_partnerships ORDER BY name`)
    all.rows.forEach(r => console.log('  ·', r.name, '(', r.slug, ') ·', r.status))
    await client.end()
    return
  }

  const partnership = p.rows[0]
  console.log('Parceria achada:', partnership.name, '·', partnership.status)

  // 2. Emite voucher
  const payload = {
    partnership_id: partnership.id,
    combo: partnership.voucher_combo || 'buque_premium+limpeza_de_pele',
    recipient_name: 'Camila Ribeiro (teste)',
    recipient_phone: '+55 44 9 0000-0000',
    notes: 'Voucher de teste pra visualização do formato',
    validity_days: 30,
  }

  const r = await client.query(
    `SELECT public.b2b_voucher_issue($1::jsonb) AS r`,
    [JSON.stringify(payload)]
  )
  const result = r.rows[0].r
  if (!result.ok) {
    console.log('FALHA:', result)
    await client.end()
    return
  }

  console.log('\n✓ Voucher emitido')
  console.log('  token:', result.token)
  console.log('  valid_until:', result.valid_until)

  const urlProd = 'https://clinicai-dashboard.px1hdq.easypanel.host/voucher.html?t=' + result.token
  const urlLocal = 'http://localhost:8080/voucher.html?t=' + result.token

  console.log('\n═══════════════════════════════════════')
  console.log('ABRA NO BROWSER:')
  console.log('\n  PROD:  ' + urlProd)
  console.log('\n  LOCAL: ' + urlLocal)
  console.log('═══════════════════════════════════════\n')

  await client.end()
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1) })
