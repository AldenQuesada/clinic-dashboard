/**
 * Aplica migration: VPI Short-Links (Fase 4 - Entrega 1).
 * Uso: node scripts/archive/apply-vpi-shortlinks.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000040_vpi_shortlinks.sql'
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
  console.log('=== VPI Short-Links (Fase 4 - Entrega 1) ===\n')

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

  // Funcoes criadas
  const fns = await client.query(`
    SELECT p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_partner_ensure_short_link','_vpi_card_url',
                         '_vpi_partner_after_insert_shortlink',
                         '_vpi_partner_after_update_shortlink')
     ORDER BY p.proname
  `)
  console.log('Funcoes (' + fns.rows.length + '/4):')
  fns.rows.forEach(r => console.log('  -', r.proname))

  // Triggers registrados
  const trg = await client.query(`
    SELECT tgname FROM pg_trigger
     WHERE tgname IN ('trg_vpi_partner_after_insert_shortlink',
                      'trg_vpi_partner_after_update_shortlink')
     ORDER BY tgname
  `)
  console.log('\nTriggers (' + trg.rows.length + '/2):')
  trg.rows.forEach(r => console.log('  -', r.tgname))

  // Quantos partners e quantos short_links ja existem
  const stats = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.vpi_partners)                                               AS total_partners,
      (SELECT COUNT(*)::int FROM public.vpi_partners WHERE short_link_slug IS NOT NULL)             AS com_slug,
      (SELECT COUNT(*)::int FROM public.short_links WHERE code LIKE 'emb-%')                        AS short_links_emb
  `)
  console.log('\nCobertura atual:')
  console.log('  - partners total    :', stats.rows[0].total_partners)
  console.log('  - partners c/ slug  :', stats.rows[0].com_slug)
  console.log('  - short_links emb-* :', stats.rows[0].short_links_emb)

  // Lista alguns exemplos
  const exemplos = await client.query(`
    SELECT p.nome, p.short_link_slug,
           (SELECT sl.url FROM public.short_links sl
             WHERE sl.code = p.short_link_slug
               AND sl.clinic_id = p.clinic_id
             LIMIT 1) AS url,
           (SELECT sl.clicks FROM public.short_links sl
             WHERE sl.code = p.short_link_slug
               AND sl.clinic_id = p.clinic_id
             LIMIT 1) AS clicks
      FROM public.vpi_partners p
     WHERE p.short_link_slug IS NOT NULL
     ORDER BY p.created_at DESC
     LIMIT 3
  `)
  if (exemplos.rows.length) {
    console.log('\nExemplos (ultimos 3):')
    exemplos.rows.forEach(r => {
      const linkMark = r.url ? 'OK' : 'MISSING'
      console.log('  -', (r.nome || '').padEnd(24, ' '), 'slug=' + r.short_link_slug,
                  'short_link=' + linkMark, 'clicks=' + (r.clicks || 0))
    })
  }

  // Teste funcional: RPC direta
  const first = await client.query(`SELECT id FROM public.vpi_partners LIMIT 1`)
  if (first.rows.length) {
    const r = await client.query(
      `SELECT public.vpi_partner_ensure_short_link($1) AS r`,
      [first.rows[0].id]
    )
    console.log('\nRPC vpi_partner_ensure_short_link (teste):')
    console.log('  ', JSON.stringify(r.rows[0].r))
  } else {
    console.log('\nSem partners pra teste funcional (OK).')
  }

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
