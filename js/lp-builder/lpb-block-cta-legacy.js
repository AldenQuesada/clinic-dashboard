/**
 * LP Builder · Block Render: cta-legacy (Onda 28)
 *
 * Reproduz fielmente o cta_section do legado:
 *   · bg grafite com radial gradients sutis (champagne 12% + sage 8%)
 *   · headline Cormorant 22px italic ivory · entre aspas curvas ❝...❞
 *   · subtitle 12px ivory dim
 *   · botão (4 estilos · whatsapp verde icônico = sensational)
 *
 *   LPBBlockCtaLegacy.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockCtaLegacy) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }
  function _multiline(s) {
    return _esc(s).replace(/\n/g, '<br>')
  }

  function render(block) {
    var p  = (block && block.props) || {}
    var bg = p.bg || 'graphite'
    var btn = (p.btn_label && window.LPBButtonLegacy)
      ? LPBButtonLegacy.render({ label: p.btn_label, url: p.btn_url || '#', style: p.btn_style || 'whatsapp' })
      : ''

    var html = '<section class="blk-cta-legacy" data-bg="' + _esc(bg) + '">'
    if (p.eyebrow)  html += '<div class="blk-cta-legacy-eyebrow">'  + _esc(p.eyebrow)  + '</div>'
    if (p.headline) html += '<p class="blk-cta-legacy-headline">\u201C' + _multiline(p.headline) + '\u201D</p>'
    if (p.subtitle) html += '<p class="blk-cta-legacy-sub">'        + _esc(p.subtitle) + '</p>'
    if (btn)        html += btn
    html += '</section>'
    return html
  }

  window.LPBBlockCtaLegacy = Object.freeze({ render: render })
})()
