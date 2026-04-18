/**
 * Gera sitemap.xml a partir das edicoes publicadas + landings estaticas.
 * Uso: node scripts/generate-sitemap.cjs
 *
 * Rode antes de cada deploy (ou inclua em CI pos-build).
 * Output: sitemap.xml na raiz do projeto.
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const ORIGIN = process.env.SITE_ORIGIN || 'https://clinicmirian.com.br'
const OUT    = path.join(__dirname, '..', 'sitemap.xml')

// Paginas publicas estaticas (landings + gerais)
const STATIC_URLS = [
  { loc: '/',                         priority: 1.0, changefreq: 'weekly' },
  { loc: '/revista-live.html',        priority: 0.9, changefreq: 'weekly' },
  { loc: '/lp-smooth-eye.html',       priority: 0.8, changefreq: 'monthly' },
  { loc: '/lp-lifting-5d.html',       priority: 0.8, changefreq: 'monthly' },
  { loc: '/instagram.html',           priority: 0.5, changefreq: 'monthly' },
  { loc: '/aniversario.html',         priority: 0.5, changefreq: 'monthly' },
]

const client = new Client({
  host:     'aws-0-us-west-2.pooler.supabase.com',
  port:     5432,
  user:     'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl:      { rejectUnauthorized: false },
})

function esc(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;' })[c])
}

function urlEntry(loc, lastmod, priority, changefreq) {
  return (
    '  <url>\n' +
    '    <loc>' + esc(ORIGIN + loc) + '</loc>\n' +
    (lastmod ? '    <lastmod>' + esc(lastmod.slice(0, 10)) + '</lastmod>\n' : '') +
    (changefreq ? '    <changefreq>' + changefreq + '</changefreq>\n' : '') +
    (priority !== undefined ? '    <priority>' + priority.toFixed(1) + '</priority>\n' : '') +
    '  </url>'
  )
}

async function main() {
  console.log('=== Gerando sitemap.xml (origin=' + ORIGIN + ') ===\n')

  await client.connect()

  // Edicoes publicadas com slug
  let editions = []
  try {
    const r = await client.query(`
      SELECT slug, updated_at, published_at, created_at
        FROM public.magazine_editions
       WHERE status = 'published' AND slug IS NOT NULL
       ORDER BY COALESCE(published_at, created_at) DESC
    `)
    editions = r.rows
    console.log('Edicoes publicadas:', editions.length)
  } catch (e) {
    console.warn('Falha ao ler edicoes:', e.message, '— sitemap sera gerado apenas com estaticos')
  }

  // Landing pages publicadas (LP Builder)
  let lps = []
  try {
    const r = await client.query(`
      SELECT slug, updated_at, published_at
        FROM public.lp_pages
       WHERE status = 'published' AND slug IS NOT NULL
       ORDER BY COALESCE(published_at, updated_at) DESC
    `)
    lps = r.rows
    console.log('LPs publicadas:', lps.length)
  } catch (e) {
    console.warn('Tabela lp_pages ausente ou erro:', e.message)
  }

  await client.end()

  const urls = [
    ...STATIC_URLS.map(u => urlEntry(u.loc, null, u.priority, u.changefreq)),
    ...editions.map(ed => urlEntry(
      '/revista-live.html?edition=' + encodeURIComponent(ed.slug),
      (ed.updated_at || ed.published_at || ed.created_at || '').toString(),
      0.8, 'weekly'
    )),
    ...lps.map(lp => urlEntry(
      '/lp/' + encodeURIComponent(lp.slug),
      (lp.updated_at || lp.published_at || '').toString(),
      0.7, 'monthly'
    )),
  ]

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n'

  fs.writeFileSync(OUT, xml, 'utf8')
  console.log('\n✓ sitemap.xml gerado em:', OUT)
  console.log('  URLs totais:', urls.length)
}

main().catch(err => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
