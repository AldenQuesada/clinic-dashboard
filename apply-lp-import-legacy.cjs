/* ============================================================
 * apply-lp-import-legacy.cjs (Onda 28 · final)
 *
 * Migra LPs do construtor legado (page_templates) pro novo (lp_pages):
 *
 *   page_templates (legado)        →  lp_pages (novo)
 *   ──────────────────────────────────────────────────────
 *   schema.blocks[]                →  blocks[]  (re-mapped)
 *   slug, title, status, views     →  preservados
 *   created_at                     →  preservado
 *
 * Mapping de tipos:
 *   hero          → hero-cover (foto full-bleed + texto overlay)
 *   links         → links-tree
 *   divider       → divider-legacy
 *   before_after  → before-after-carousel
 *   testimonials  → testimonials (existing)
 *   testimonial   → testimonials (1 item)
 *   cta_section   → cta-legacy
 *   footer        → footer (V2)
 *   title         → title-legacy
 *   text          → title-legacy (lead only)
 *   badges        → badges-legacy
 *   check         → check-legacy
 *   price         → price-legacy
 *   buttons       → buttons-row
 *   carousel      → carousel-slides
 *   image         → IGNORADO (sem equivalente direto · skipped log)
 *   video         → IGNORADO
 *   toggle        → IGNORADO
 *
 * Idempotente: usa suffix configurável pra não sobrescrever (default: -v2)
 *
 * Uso:
 *   node apply-lp-import-legacy.cjs           # importa com slug suffix -v2
 *   node apply-lp-import-legacy.cjs --dry     # só mostra diff sem persistir
 *   node apply-lp-import-legacy.cjs --suffix=-import   # custom suffix
 *   node apply-lp-import-legacy.cjs --slug=instagram   # importa só uma
 * ============================================================ */

const { Client } = require('pg')

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const SUFFIX = (args.find(a => a.startsWith('--suffix=')) || '--suffix=-v2').split('=')[1]
const ONLY_SLUG = (args.find(a => a.startsWith('--slug=')) || '').split('=')[1] || null

// ============================================================
// MAPPER · pure function (legacy block → novo block)
// ============================================================
function mapBlock(b) {
  if (!b || !b.type) return null
  switch (b.type) {

    case 'hero':
      // hero (com image_url) → hero-cover full-bleed
      return {
        type: 'hero-cover',
        props: {
          image_url:        b.image_url || '',
          eyebrow:          b.label || '',
          headline:         b.title || '',
          subheadline:      [b.tagline, b.subtitle, b.description].filter(Boolean).join('\n'),
          aspect:           b.image_url ? '4/5' : '100vh',
          text_y_pct:       '78',
          text_y_pct_mobile:'78',
          text_align:       'center',
          text_color:       (b.theme === 'light') ? 'dark' : 'light',
          overlay:          b.image_url ? 'gradient-bottom' : 'none',
          overlay_strength: '70',
        },
      }

    case 'links':
      return {
        type: 'links-tree',
        props: {
          eyebrow: b.label || '',
          titulo:  b.title || 'Links',
          bg:      'white',
          items: (b.items || []).map(function (it) {
            return {
              titulo:    it.title || '',
              subtitulo: it.subtitle || '',
              url:       it.url || '#',
              icon_svg:  it.icon_svg || '',
            }
          }),
        },
      }

    case 'divider':
      return {
        type: 'divider-legacy',
        props: {
          spacing:   'md',
          show_mark: 'yes',
        },
      }

    case 'before_after':
      return {
        type: 'before-after-carousel',
        props: {
          eyebrow:     b.label || '',
          titulo:      b.title || '',
          bg:          'graphite',
          label_before:'Antes',
          label_after: 'Depois',
          slides: (b.slides || []).map(function (s) {
            return {
              before_url: s.before_url || '',
              after_url:  s.after_url  || '',
              procedure:  s.procedure  || '',
              detail:     s.detail     || '',
            }
          }),
        },
      }

    case 'testimonials':
      // mantém tipo nativo do novo construtor (já existe)
      return {
        type: 'testimonials',
        props: {
          eyebrow: b.label || '',
          h2:      b.title || '',
          layout:  'carousel',
          show_stars: true,
          bg:      'ivory',
          items: (b.items || []).map(function (t) {
            return {
              body:  t.body || '',
              nome:  t.author || '',
              meta:  t.meta || '',
              stars: typeof t.stars === 'number' ? t.stars : 5,
            }
          }),
        },
      }

    case 'testimonial':
      // singular → testimonials com 1 item
      return {
        type: 'testimonials',
        props: {
          eyebrow: '',
          h2:      '',
          layout:  'grid',
          show_stars: true,
          bg:      'ivory',
          items: [{
            body:  b.body || '',
            nome:  b.author || '',
            meta:  b.date || '',
            stars: typeof b.stars === 'number' ? b.stars : 5,
          }],
        },
      }

    case 'cta_section':
      return {
        type: 'cta-legacy',
        props: {
          eyebrow:   b.label || 'Próximo passo',
          headline:  b.headline || '',
          subtitle:  b.subtitle || '',
          btn_label: b.button_label || 'Falar no WhatsApp',
          btn_url:   b.button_url   || 'https://wa.me/55',
          btn_style: b.button_style || 'whatsapp',
          bg:        'graphite',
        },
      }

    case 'footer':
      return {
        type: 'footer',
        props: {
          clinic_label: b.clinic_label || 'Clínica',
          brand_name:   b.clinic_name  || '',
          tagline:      b.tagline || '',
          copyright:    '© ' + new Date().getFullYear() + ' ' + (b.clinic_label || 'Clínica') + ' ' + (b.clinic_name || ''),
          bg:           'graphite',
          social: (b.social || []).map(function (s) {
            return {
              network: 'auto',
              label:   s.label || '',
              url:     s.url || '#',
            }
          }),
        },
      }

    case 'title':
      return {
        type: 'title-legacy',
        props: {
          eyebrow: '',
          h2:      b.text || '',
          lead:    b.subtitle || '',
          align:   b.align || 'left',
          bg:      'transparent',
        },
      }

    case 'text':
      // text bloco simples → title-legacy só com lead (parágrafo)
      return {
        type: 'title-legacy',
        props: {
          eyebrow: '',
          h2:      '',
          lead:    b.content || '',
          align:   b.align || 'left',
          bg:      'transparent',
        },
      }

    case 'badges':
      return {
        type: 'badges-legacy',
        props: {
          eyebrow: '',
          titulo:  '',
          bg:      'transparent',
          items: (b.items || []).map(function (it) {
            return { icon: it.icon || '', text: it.text || '' }
          }),
        },
      }

    case 'check':
      return {
        type: 'check-legacy',
        props: {
          eyebrow: '',
          h2:      b.title || '',
          bg:      'transparent',
          items: (b.items || []).map(function (txt) {
            // legado usa string simples; novo usa { text }
            return { text: typeof txt === 'string' ? txt : (txt && txt.text || '') }
          }),
        },
      }

    case 'price':
      return {
        type: 'price-legacy',
        props: {
          label:     b.label || 'Investimento',
          original:  b.original ? String(b.original) : '',
          value:     b.value ? String(b.value) : '',
          parcelas:  b.parcelas ? String(b.parcelas) : '',
          cta_label: '',
          cta_url:   '',
          cta_style: 'champagne',
          bg:        'transparent',
        },
      }

    case 'buttons':
      return {
        type: 'buttons-row',
        props: {
          eyebrow: '',
          titulo:  '',
          bg:      'transparent',
          items: (b.items || []).map(function (btn) {
            return {
              label: btn.label || '',
              url:   btn.url   || '#',
              style: btn.style || 'whatsapp',
            }
          }),
        },
      }

    case 'carousel':
      // legado tem { items: [{url}] } simples → carousel-slides
      return {
        type: 'carousel-slides',
        props: {
          eyebrow: '',
          h2:      '',
          autoplay: false,
          autoplay_interval: '6',
          slides: (b.items || []).map(function (s) {
            return {
              eyebrow: '',
              titulo:  '',
              texto:   '',
              foto:    s.url || s.image || '',
            }
          }),
        },
      }

    // Sem equivalente direto: image, video, toggle
    case 'image':
    case 'video':
    case 'toggle':
      return { _skip: true, _reason: b.type + ' (sem equivalente direto no novo construtor)' }
  }
  return { _skip: true, _reason: 'tipo desconhecido: ' + b.type }
}

function mapBlocks(legacyBlocks) {
  var out = []
  var skipped = []
  ;(legacyBlocks || []).forEach(function (b, i) {
    var mapped = mapBlock(b)
    if (!mapped) { skipped.push({ idx: i, type: b && b.type, reason: 'mapper retornou null' }); return }
    if (mapped._skip) { skipped.push({ idx: i, type: b.type, reason: mapped._reason }); return }
    out.push(mapped)
  })
  return { blocks: out, skipped: skipped }
}

// ============================================================
// IMPORTER
// ============================================================
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

;(async () => {
  try {
    await c.connect()

    var query = "SELECT id, slug, title, status, schema, views, created_at FROM page_templates"
    var params = []
    if (ONLY_SLUG) { query += ' WHERE slug = $1'; params.push(ONLY_SLUG) }
    query += ' ORDER BY created_at'
    var legacy = await c.query(query, params)

    if (!legacy.rows.length) {
      console.log('Nenhuma LP legada encontrada.' + (ONLY_SLUG ? ' (slug=' + ONLY_SLUG + ')' : ''))
      return
    }

    console.log('═════ Import' + (DRY ? ' (DRY RUN)' : '') + ' · ' + legacy.rows.length + ' página(s) ═════\n')

    var summary = []
    for (var i = 0; i < legacy.rows.length; i++) {
      var row = legacy.rows[i]
      var legacyBlocks = (row.schema && row.schema.blocks) || []
      var mapped = mapBlocks(legacyBlocks)
      var newSlug = row.slug + SUFFIX

      console.log('───── /' + row.slug + ' → /' + newSlug)
      console.log('  título: ' + row.title)
      console.log('  status: ' + row.status + '  ·  views: ' + row.views)
      console.log('  blocos legado: ' + legacyBlocks.length + '  →  importados: ' + mapped.blocks.length +
                  '  (skipped: ' + mapped.skipped.length + ')')
      console.log('  mapeamento:')
      legacyBlocks.forEach(function (b, idx) {
        var mb = mapped.blocks[idx] || mapped.skipped.find(function (s) { return s.idx === idx })
        if (mb && mb.type)        console.log('    ' + String(idx + 1).padStart(2) + '. ' + b.type.padEnd(15) + ' → ' + mb.type)
        else if (mb && mb.reason) console.log('    ' + String(idx + 1).padStart(2) + '. ' + b.type.padEnd(15) + ' × ' + mb.reason)
      })

      if (DRY) {
        summary.push({ slug: newSlug, status: 'dry-run-only' })
        console.log('')
        continue
      }

      // Verifica se slug novo já existe
      var exists = await c.query("SELECT id FROM lp_pages WHERE slug = $1", [newSlug])
      if (exists.rows.length) {
        console.log('  ⚠ slug /' + newSlug + ' já existe em lp_pages · pulando (use --suffix=-outro pra customizar)')
        summary.push({ slug: newSlug, status: 'skip-conflict' })
        console.log('')
        continue
      }

      var ins = await c.query(
        "INSERT INTO lp_pages (slug, title, status, blocks, views, published_at, meta_title) " +
        "VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) RETURNING id",
        [
          newSlug,
          row.title + ' (importada)',
          row.status === 'published' ? 'published' : 'draft',
          JSON.stringify(mapped.blocks),
          row.views || 0,
          row.status === 'published' ? row.created_at : null,
          row.title,
        ]
      )
      console.log('  ✓ inserido · id=' + ins.rows[0].id)
      summary.push({ slug: newSlug, status: 'imported', id: ins.rows[0].id, blocks: mapped.blocks.length })
      console.log('')
    }

    if (!DRY) await c.query("NOTIFY pgrst, 'reload schema'")

    console.log('═════ Resumo ═════')
    summary.forEach(function (s) {
      console.log(' ', (s.status === 'imported' ? '✓' : (s.status === 'skip-conflict' ? '⚠' : '·')),
                  '/' + s.slug, '·', s.status, s.blocks ? '(' + s.blocks + ' blocos)' : '')
    })
    console.log(DRY ? '\n[DRY RUN · nada foi persistido]' : '\n[Migração concluída]')
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()
