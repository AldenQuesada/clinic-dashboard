/**
 * LP Builder · Block Render: smart-cta (Onda 29)
 *
 * CTA contextual · texto muda baseado em comportamento do visitor:
 *   · novo (<1h)              → cta_default_label
 *   · retorno (1+ visit)      → cta_returning_label
 *   · pós prova social        → cta_after_social_proof_label
 *
 * Renderer PURO. Decisão acontece em lpb-smart-cta-runtime.js.
 *
 *   LPBBlockSmartCTA.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockSmartCTA) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }
  function _has(v) { return v != null && String(v).trim().length > 0 }

  function _renderCta(label, url, style) {
    if (window.LPBButtonLegacy) {
      try {
        return LPBButtonLegacy.render({ label: label, url: url || '#', style: style || 'champagne' })
      } catch (_) {}
    }
    var external = /^https?:\/\//.test(url || '')
    var styleCls = (style && /^(whatsapp|champagne|outline|graphite)$/.test(style)) ? style : 'champagne'
    return '<a class="blk-btn-legacy blk-btn-legacy--' + styleCls + '"' +
      ' href="' + _esc(url || '#') + '"' +
      (external ? ' target="_blank" rel="noopener"' : '') + '>' +
      '<span>' + _esc(label) + '</span></a>'
  }

  function render(block) {
    var p = (block && block.props) || {}

    var defaultLbl   = _has(p.cta_default_label) ? p.cta_default_label : 'Conhecer protocolos'
    var returningLbl = _has(p.cta_returning_label) ? p.cta_returning_label : ''
    var socialLbl    = _has(p.cta_after_social_proof_label) ? p.cta_after_social_proof_label : ''
    var ctaUrl       = _has(p.cta_url) ? p.cta_url : '#'
    var ctaStyle     = (p.cta_style && /^(whatsapp|champagne|outline)$/.test(p.cta_style)) ? p.cta_style : 'champagne'
    var bg           = (p.bg && /^(transparent|ivory|graphite)$/.test(p.bg)) ? p.bg : 'transparent'
    var eyebrow      = _has(p.eyebrow)  ? p.eyebrow  : ''
    var headline     = _has(p.headline) ? p.headline : ''

    // variants embed em data-variants (JSON · runtime decide)
    var variants = {
      'default':            defaultLbl,
      'returning':          returningLbl || defaultLbl,
      'after_social_proof': socialLbl    || defaultLbl,
    }
    var variantsJson = ''
    try { variantsJson = JSON.stringify(variants) } catch (_) { variantsJson = '{}' }

    var html = ''
      + '<section class="blk-scta" data-bg="' + _esc(bg) + '" data-smart-cta-root'
      +   ' data-variants=\'' + _esc(variantsJson) + '\'>'
      + '<div class="blk-scta-wrap">'
      + (eyebrow  ? '<div class="blk-scta-eyebrow">' + _esc(eyebrow)  + '</div>' : '')
      + (headline ? '<h2 class="blk-scta-head">'    + _esc(headline) + '</h2>'   : '')
      + '<div class="blk-scta-btn" data-smart-cta-btn>'
      +   _renderCta(defaultLbl, ctaUrl, ctaStyle)
      + '</div>'
      + '</div>'
      + '</section>'

    return html
  }

  window.LPBBlockSmartCTA = Object.freeze({ render: render })
})()
