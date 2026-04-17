/**
 * Aplica migration: VPI Card Tokens (Fase 1).
 * Uso: node scripts/archive/apply-vpi-card-tokens.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000030_vpi_card_tokens.sql'
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
  console.log('=== VPI Card Tokens - Fase 1 ===\n')

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

  const cols = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_partners'
       AND column_name IN ('card_token','avatar_url','tier_atual','streak_meses','numero_membro','short_link_slug')
     ORDER BY column_name
  `)
  console.log('Colunas novas em vpi_partners (' + cols.rows.length + '/6):')
  cols.rows.forEach(r => console.log('  -', r.column_name, '(' + r.data_type + ')'))

  const fns = await client.query(`
    SELECT p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_pub_get_card','_vpi_calc_tier','_vpi_slugify','_vpi_partner_before_insert','_vpi_partner_before_update_tier','vpi_partner_set_short_slug')
     ORDER BY p.proname
  `)
  console.log('\nFuncoes criadas (' + fns.rows.length + '/6):')
  fns.rows.forEach(r => console.log('  -', r.proname))

  const trgs = await client.query(`
    SELECT tgname FROM pg_trigger
     WHERE tgname IN ('trg_vpi_partner_before_insert','trg_vpi_partner_before_update_tier')
     ORDER BY tgname
  `)
  console.log('\nTriggers (' + trgs.rows.length + '/2):')
  trgs.rows.forEach(r => console.log('  -', r.tgname))

  const backfill = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE card_token IS NOT NULL)      AS with_token,
      COUNT(*) FILTER (WHERE tier_atual IS NOT NULL)      AS with_tier,
      COUNT(*) FILTER (WHERE numero_membro IS NOT NULL)   AS with_membro,
      COUNT(*) FILTER (WHERE short_link_slug IS NOT NULL) AS with_slug,
      COUNT(*) AS total
    FROM public.vpi_partners
  `)
  const b = backfill.rows[0]
  console.log('\nBackfill parceiras (total=' + b.total + '):')
  console.log('  - com card_token:      ', b.with_token)
  console.log('  - com tier_atual:      ', b.with_tier)
  console.log('  - com numero_membro:   ', b.with_membro)
  console.log('  - com short_link_slug: ', b.with_slug)

  const tpl = await client.query(`
    SELECT slug, CASE WHEN content_template LIKE '%{{link_cartao}}%' THEN 'YES' ELSE 'NO' END AS has_link
      FROM public.wa_agenda_automations
     WHERE slug='vpi_convite_parceiro'
  `)
  if (tpl.rows.length) {
    console.log('\nTemplate vpi_convite_parceiro: link_cartao =', tpl.rows[0].has_link)
  } else {
    console.log('\nTemplate vpi_convite_parceiro: NAO ENCONTRADO')
  }

  // Teste rapido do RPC (sem token valido)
  const rpcTest = await client.query(`SELECT public.vpi_pub_get_card('invalid_token') AS r`)
  console.log('\nRPC test (token invalido):', rpcTest.rows[0].r.error)

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
