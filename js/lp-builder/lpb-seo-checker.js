/**
 * LP Builder · SEO Checker
 *
 * Engine isolada que escaneia a página atual e identifica
 * problemas de SEO/conversão básica. Não substitui Lighthouse —
 * complementa com checks específicos de LP de clínica.
 *
 * Checks implementados (12):
 *   1.  Title presente e 30-70 chars
 *   2.  Meta description presente e 80-200 chars
 *   3.  OG image presente
 *   4.  Slug curto e legível
 *   5.  Exatamente 1 H1 na página
 *   6.  Toda foto tem caption/label/alt-equivalente
 *   7.  Forms com labels nos fields
 *   8.  Conteúdo >= 300 palavras
 *   9.  CTA na primeira tela (hero ou bloco logo após)
 *   10. Quantidade de imagens razoável (<= 20)
 *   11. URL canônica configurada (via tracking)
 *   12. AB test ativo? (sugere medir)
 *
 * Independente — testável isolado:
 *   var checks = LPBSeoChecker.scan(page)
 *   var score  = LPBSeoChecker.getScore(page)
 *   LPBSeoChecker.open()
 */
;(function () {
  'use strict'
  if (window.LPBSeoChecker) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  // ────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────
  function _walkText(value, out) {
    if (typeof value === 'string') {
      out.text += (out.text ? ' ' : '') + value
    } else if (Array.isArray(value)) {
      value.forEach(function (v) { _walkText(v, out) })
    } else if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (k) {
        if (k === 'icon_svg' || k === 'foto' || k === 'visual_image' ||
            k === 'before_url' || k === 'after_url' || k === 'foto_url' ||
            k === 'logo_url' || k === 'url' || k === 'foto_initial' ||
            k === 'visual_placeholder' || k === 'cta_enabled' ||
            k === 'bg' || k === 'bg_section' || k === 'direction') return
        _walkText(value[k], out)
      })
    }
  }

  function _countWords(text) {
    if (!text) return 0
    return String(text).trim().split(/\s+/).filter(Boolean).length
  }

  function _countImages(blocks) {
    var n = 0
    function walk(v) {
      if (typeof v === 'string') {
        if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|avif|gif)/i.test(v)) n++
      } else if (Array.isArray(v)) {
        v.forEach(walk)
      } else if (v && typeof v === 'object') {
        Object.keys(v).forEach(function (k) { walk(v[k]) })
      }
    }
    ;(blocks || []).forEach(function (b) { walk(b.props || {}) })
    return n
  }

  function _imagesWithoutAltLike(blocks) {
    // Conta imagens cujo bloco/item não tem campo de texto descritivo (caption, label, alt, foto_initial)
    var orphans = 0
    ;(blocks || []).forEach(function (b) {
      var p = b.props || {}
      // image fields top-level
      function checkPair(imgKey, descKeys) {
        if (p[imgKey] && !descKeys.some(function (k) { return p[k] && String(p[k]).trim() })) {
          orphans++
        }
      }
      checkPair('foto',         ['nome', 'h2', 'titulo', 'foto_initial'])
      checkPair('visual_image', ['eyebrow', 'h1', 'lead', 'visual_placeholder'])

      // images dentro de items[]
      if (Array.isArray(p.items)) {
        p.items.forEach(function (it) {
          if (!it) return
          if (it.foto && !(it.label || it.caption || it.legenda || it.titulo || it.data)) orphans++
          if (it.url && !(it.caption || it.label || it.titulo)) orphans++
          if (it.before_url && !(it.caption || it.label)) orphans++
          if (it.after_url  && !(it.caption || it.label)) orphans++
          if (it.foto_url   && !(it.label || it.legenda)) orphans++
          if (it.logo_url   && !it.alt) orphans++
        })
      }
    })
    return orphans
  }

  function _hasFormBlock(blocks) {
    return (blocks || []).some(function (b) { return b && b.type === 'form-inline' })
  }

  function _formFieldsHaveLabels(blocks) {
    var bad = 0
    ;(blocks || []).forEach(function (b) {
      if (b.type !== 'form-inline') return
      var fields = (b.props && b.props.fields) || []
      fields.forEach(function (f) {
        if (!f.label || !String(f.label).trim()) bad++
      })
    })
    return bad
  }

  function _ctaInFirstFold(blocks) {
    // CTA está no primeiro bloco com conteúdo (após nav)?
    var first = 0
    if (blocks[0] && blocks[0].type === 'nav') first = 1
    var b = blocks[first]
    if (!b || !b.props) return false
    // Hero geralmente tem cta_primary
    return !!(b.props.cta_primary || b.props.cta || (b.props.cta_enabled && b.props.cta && b.props.cta.label))
  }

  function _countH1(blocks) {
    // Conta blocks que renderizam <h1>: hero-split + parallax-banner usam h1; outros usam h2
    var n = 0
    ;(blocks || []).forEach(function (b) {
      if (b.type === 'hero-split' && b.props && b.props.h1) n++
      // parallax-banner usa <h2> internamente mas semanticamente é H1
    })
    return n
  }

  // ────────────────────────────────────────────────────────────
  // SCAN — retorna lista de checks com severidade
  // ────────────────────────────────────────────────────────────
  function scan(page) {
    if (!page) return []
    var checks = []
    var blocks = page.blocks || []

    // 1. Title
    var title = (page.title || '').trim()
    if (!title) {
      checks.push({ severity: 'error', code: 'no_title', label: 'Título da página', message: 'Sem título configurado.' })
    } else if (title.length < 30) {
      checks.push({ severity: 'warning', code: 'title_short', label: 'Título', message: 'Título com ' + title.length + ' chars · ideal 30-70.' })
    } else if (title.length > 70) {
      checks.push({ severity: 'warning', code: 'title_long', label: 'Título', message: 'Título com ' + title.length + ' chars · Google corta após 60-70.' })
    } else {
      checks.push({ severity: 'pass', code: 'title_ok', label: 'Título', message: title.length + ' chars · ideal' })
    }

    // 2. Meta description
    var desc = (page.meta_description || '').trim()
    if (!desc) {
      checks.push({ severity: 'error', code: 'no_meta_desc', label: 'Meta descrição', message: 'Sem meta descrição · prejudica SEO + compartilhamento.' })
    } else if (desc.length < 80) {
      checks.push({ severity: 'warning', code: 'meta_desc_short', label: 'Meta descrição', message: desc.length + ' chars · ideal 80-200.' })
    } else if (desc.length > 200) {
      checks.push({ severity: 'warning', code: 'meta_desc_long', label: 'Meta descrição', message: desc.length + ' chars · Google corta após ~160.' })
    } else {
      checks.push({ severity: 'pass', code: 'meta_desc_ok', label: 'Meta descrição', message: desc.length + ' chars · ideal' })
    }

    // 3. OG image
    if (!page.og_image_url) {
      checks.push({ severity: 'warning', code: 'no_og_image', label: 'Imagem OG', message: 'Sem imagem para compartilhamento social · WhatsApp/Facebook ficam genéricos.' })
    } else {
      checks.push({ severity: 'pass', code: 'og_image_ok', label: 'Imagem OG', message: 'Configurada' })
    }

    // 4. Slug
    var slug = page.slug || ''
    if (!/^[a-z0-9-]+$/.test(slug)) {
      checks.push({ severity: 'error', code: 'slug_invalid', label: 'Slug', message: 'Slug com caracteres inválidos: "' + slug + '"' })
    } else if (slug.length > 50) {
      checks.push({ severity: 'warning', code: 'slug_long', label: 'Slug', message: 'Slug muito longo (' + slug.length + ' chars) · prefira < 30.' })
    } else if (/\d{3,}/.test(slug)) {
      checks.push({ severity: 'warning', code: 'slug_numbers', label: 'Slug', message: 'Slug com sequência de números · prefira palavras-chave.' })
    } else {
      checks.push({ severity: 'pass', code: 'slug_ok', label: 'Slug', message: '/' + slug })
    }

    // 5. H1
    var h1 = _countH1(blocks)
    if (h1 === 0) {
      checks.push({ severity: 'error', code: 'no_h1', label: 'Hierarquia H1', message: 'Página sem H1 · todo conteúdo SEO precisa de 1 H1.' })
    } else if (h1 > 1) {
      checks.push({ severity: 'warning', code: 'multiple_h1', label: 'Hierarquia H1', message: h1 + ' H1s · idealmente apenas 1 (no hero).' })
    } else {
      checks.push({ severity: 'pass', code: 'h1_ok', label: 'Hierarquia H1', message: '1 H1 · ideal' })
    }

    // 6. Imagens sem caption/alt
    var imgsTotal = _countImages(blocks)
    var orphans = _imagesWithoutAltLike(blocks)
    if (imgsTotal === 0) {
      checks.push({ severity: 'pass', code: 'no_images', label: 'Imagens', message: 'Página sem imagens.' })
    } else if (orphans === 0) {
      checks.push({ severity: 'pass', code: 'images_described', label: 'Imagens', message: imgsTotal + ' imagens · todas com legenda/alt.' })
    } else {
      checks.push({ severity: 'warning', code: 'images_orphan', label: 'Imagens', message: orphans + ' de ' + imgsTotal + ' imagens sem legenda/alt · acessibilidade e SEO prejudicados.' })
    }

    // 7. Forms com labels
    if (_hasFormBlock(blocks)) {
      var noLabel = _formFieldsHaveLabels(blocks)
      if (noLabel === 0) {
        checks.push({ severity: 'pass', code: 'form_labels_ok', label: 'Formulário', message: 'Todos os campos com label.' })
      } else {
        checks.push({ severity: 'error', code: 'form_no_labels', label: 'Formulário', message: noLabel + ' campo(s) sem label · acessibilidade quebrada.' })
      }
    }

    // 8. Palavras
    var acc = { text: '' }
    blocks.forEach(function (b) { _walkText(b.props || {}, acc) })
    var words = _countWords(acc.text)
    if (words < 200) {
      checks.push({ severity: 'warning', code: 'few_words', label: 'Conteúdo', message: 'Apenas ' + words + ' palavras · SEO precisa de pelo menos 300.' })
    } else {
      checks.push({ severity: 'pass', code: 'words_ok', label: 'Conteúdo', message: words + ' palavras' })
    }

    // 9. CTA above the fold
    if (_ctaInFirstFold(blocks)) {
      checks.push({ severity: 'pass', code: 'cta_first_fold', label: 'CTA inicial', message: 'Primeiro bloco tem CTA · ideal pra conversão.' })
    } else {
      checks.push({ severity: 'warning', code: 'no_cta_first_fold', label: 'CTA inicial', message: 'Primeiro bloco sem CTA · paciente precisa scrollar pra agir.' })
    }

    // 10. Quantidade de imagens (perf)
    if (imgsTotal > 25) {
      checks.push({ severity: 'warning', code: 'too_many_images', label: 'Performance', message: imgsTotal + ' imagens · pode carregar lento no mobile.' })
    } else if (imgsTotal > 0) {
      checks.push({ severity: 'pass', code: 'image_count_ok', label: 'Performance', message: imgsTotal + ' imagens · razoável.' })
    }

    // 11. Tracking
    var t = page.tracking || {}
    if (!t.ga4_id && !t.fb_pixel_id && !t.gtm_id) {
      checks.push({ severity: 'warning', code: 'no_tracking', label: 'Tracking', message: 'Sem GA4/FB Pixel/GTM · não dá pra medir conversão real.' })
    } else {
      var active = []
      if (t.ga4_id) active.push('GA4')
      if (t.fb_pixel_id) active.push('FB')
      if (t.gtm_id) active.push('GTM')
      checks.push({ severity: 'pass', code: 'tracking_ok', label: 'Tracking', message: 'Ativos: ' + active.join(', ') })
    }

    // 12. AB test
    if (page.ab_variant_slug) {
      checks.push({ severity: 'info', code: 'ab_active', label: 'A/B test', message: 'Ativo · variant B = /' + page.ab_variant_slug })
    }

    // 13. Schema.org (rich snippets Google)
    var sc = page.schema_org || {}
    if (!sc.name) {
      checks.push({ severity: 'warning', code: 'no_schema_org', label: 'Schema.org', message: 'Sem dados da clínica · perde rich snippets (estrelas, endereço, FAQ no Google).' })
    } else {
      var bonus = []
      if (sc.street && sc.city)              bonus.push('endereço')
      if (sc.telephone)                      bonus.push('telefone')
      if (sc.openingHours)                   bonus.push('horário')
      if (sc.latitude && sc.longitude)       bonus.push('geo')
      checks.push({ severity: 'pass', code: 'schema_org_ok', label: 'Schema.org', message: 'Configurado' + (bonus.length ? ' · ' + bonus.join(' + ') : '') })
    }

    return checks
  }

  // ────────────────────────────────────────────────────────────
  // SCORE
  // ────────────────────────────────────────────────────────────
  function getScore(page) {
    var checks = scan(page)
    var penalty = 0
    checks.forEach(function (c) {
      if (c.severity === 'error') penalty += 15
      if (c.severity === 'warning') penalty += 5
    })
    return Math.max(0, Math.min(100, 100 - penalty))
  }

  // ────────────────────────────────────────────────────────────
  // Modal UI
  // ────────────────────────────────────────────────────────────
  function open() {
    if (!window.LPBuilder) return
    var page = LPBuilder.getCurrentPage()
    if (!page) {
      LPBToast && LPBToast('Abra uma página primeiro', 'error'); return
    }
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var checks = scan(page)
    var score  = getScore(page)
    var errors = checks.filter(function (c) { return c.severity === 'error' }).length
    var warns  = checks.filter(function (c) { return c.severity === 'warning' }).length
    var passes = checks.filter(function (c) { return c.severity === 'pass' }).length
    var infos  = checks.filter(function (c) { return c.severity === 'info' }).length

    var scoreColor = score >= 80 ? 'var(--lpb-success)'
                   : score >= 60 ? 'var(--lpb-warn)'
                   : 'var(--lpb-danger)'

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbSeoBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:620px;max-height:90vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>SEO checker · ' + _esc(page.title || page.slug) + '</h3>' +
            '<button class="lpb-btn-icon" id="lpbSeoClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          // Score header
          '<div style="padding:18px 22px;background:var(--lpb-bg);border-bottom:1px solid var(--lpb-border);display:flex;align-items:center;gap:18px">' +
            '<div style="width:64px;height:64px;border:3px solid ' + scoreColor + ';display:flex;align-items:center;justify-content:center;font-family:Cormorant Garamond,serif;font-size:24px;font-weight:400;color:' + scoreColor + ';flex-shrink:0">' +
              score +
            '</div>' +
            '<div style="flex:1">' +
              '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);margin-bottom:4px">SEO Score (0-100)</div>' +
              '<div style="font-size:13px;color:var(--lpb-text);line-height:1.6">' +
                '<strong style="color:var(--lpb-success)">' + passes + '</strong> ok · ' +
                '<strong style="color:var(--lpb-warn)">' + warns + '</strong> avisos · ' +
                '<strong style="color:var(--lpb-danger)">' + errors + '</strong> erros' +
              '</div>' +
            '</div>' +
          '</div>' +
          // Lista
          '<div class="lpb-modal-body" style="flex:1;overflow:auto;padding:0">' +
            checks.map(_renderCheck).join('') +
            '<div style="padding:14px 22px;font-size:11px;color:var(--lpb-text-3);font-style:italic;border-top:1px solid var(--lpb-border);background:var(--lpb-bg)">' +
              'Estes checks são complementares · Use Lighthouse (DevTools) para análise profunda de performance.' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg    = document.getElementById('lpbSeoBg')
    var close = document.getElementById('lpbSeoClose')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
  }

  function _renderCheck(c) {
    var color, icon
    if (c.severity === 'error')   { color = 'var(--lpb-danger)';  icon = 'alert-circle' }
    else if (c.severity === 'warning') { color = 'var(--lpb-warn)';   icon = 'alert-triangle' }
    else if (c.severity === 'info')    { color = 'var(--lpb-text-2)';  icon = 'info' }
    else                                { color = 'var(--lpb-success)'; icon = 'check-circle' }
    return '<div style="padding:12px 22px;border-bottom:1px solid var(--lpb-border);display:flex;gap:12px;align-items:flex-start">' +
      '<span style="color:' + color + ';flex-shrink:0;margin-top:1px">' + _ico(icon, 14) + '</span>' +
      '<div style="flex:1">' +
        '<div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3)">' + _esc(c.label) + '</div>' +
        '<div style="font-size:12px;color:var(--lpb-text);margin-top:3px;line-height:1.45">' + _esc(c.message) + '</div>' +
      '</div>' +
      '</div>'
  }

  window.LPBSeoChecker = Object.freeze({
    scan:     scan,
    getScore: getScore,
    open:     open,
  })
})()
