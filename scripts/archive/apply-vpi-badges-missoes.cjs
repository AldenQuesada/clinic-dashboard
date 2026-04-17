/**
 * Aplica migration: VPI Badges + Missoes (Fase 2).
 * Uso: node scripts/archive/apply-vpi-badges-missoes.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000031_vpi_badges_missoes.sql'
)

const client = new Client({
  host:     'aws-0-us-west-2.pooler.supabase.com',
  port:     5432,
  user:     'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl:      { rejectUnauthorized: false },
})

async function main() {
  console.log('=== VPI Badges + Missoes - Fase 2 ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Migration:', MIGRATION_PATH)
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  try {
    await client.query(sql)
    console.log('Migration OK.\n')
  } catch (e) {
    console.error('Migration FAILED:', e.message)
    throw e
  }

  console.log('--- Sanity checks ---')

  const tabs = await client.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public'
       AND table_name IN ('vpi_badge_catalog','vpi_badges','vpi_missoes','vpi_missao_progresso')
     ORDER BY table_name
  `)
  console.log('Tabelas novas (' + tabs.rows.length + '/4):')
  tabs.rows.forEach(r => console.log('  -', r.table_name))

  const bc = await client.query(`SELECT COUNT(*)::int AS c FROM public.vpi_badge_catalog WHERE is_active=true`)
  console.log('\nBadge catalog seeded:', bc.rows[0].c, 'badges ativos')

  const ms = await client.query(`
    SELECT COUNT(*)::int AS c FROM public.vpi_missoes
     WHERE is_active=true AND (valid_until IS NULL OR valid_until > now())
  `)
  console.log('Missoes ativas:', ms.rows[0].c)

  const fns = await client.query(`
    SELECT p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
         'vpi_pub_get_badges','vpi_pub_get_missao_atual','vpi_pub_create_indication',
         'vpi_check_and_unlock_badges','_vpi_update_missao_progress','_vpi_streak_meses',
         '_vpi_ind_after_close','vpi_pub_get_card'
       )
     ORDER BY p.proname
  `)
  console.log('\nFuncoes (' + fns.rows.length + '/8):')
  fns.rows.forEach(r => console.log('  -', r.proname))

  const trg = await client.query(`
    SELECT tgname FROM pg_trigger
     WHERE tgname IN ('trg_vpi_ind_after_close','trg_vpi_missoes_updated_at','trg_vpi_mp_updated_at')
     ORDER BY tgname
  `)
  console.log('\nTriggers (' + trg.rows.length + '/3):')
  trg.rows.forEach(r => console.log('  -', r.tgname))

  // Test RPC invalid
  const r1 = await client.query(`SELECT public.vpi_pub_get_badges('bad') AS r`)
  console.log('\nvpi_pub_get_badges(invalid):', r1.rows[0].r.error)
  const r2 = await client.query(`SELECT public.vpi_pub_get_missao_atual('bad') AS r`)
  console.log('vpi_pub_get_missao_atual(invalid):', r2.rows[0].r.error)
  const r3 = await client.query(`SELECT public.vpi_pub_create_indication('bad', '{}'::jsonb) AS r`)
  console.log('vpi_pub_create_indication(invalid):', r3.rows[0].r.error)

  // Test extended card RPC structure
  const r4 = await client.query(`
    SELECT jsonb_object_keys(public.vpi_pub_get_card(card_token)) AS k
      FROM public.vpi_partners LIMIT 1
  `)
  if (r4.rows.length) {
    const keys = r4.rows.map(x => x.k)
    console.log('\nvpi_pub_get_card keys:', keys.join(','))
    const expect = ['badges_unlocked','missao_atual','streak_meses']
    expect.forEach(k => {
      console.log('  -', k, keys.includes(k) ? 'OK' : 'MISSING')
    })
  } else {
    console.log('\nvpi_pub_get_card: sem partners pra testar')
  }

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
