/**
 * LP Builder · Block Render: price-legacy (Onda 28)
 *
 * Reproduz blk-price do legado:
 *   · card 500px · padding 3rem · ivory bg · border-TOP 3px champagne
 *   · label uppercase 10px champagne
 *   · original (riscado opcional)
 *   · value Cormorant 48px champagne weight 300 ← peça principal
 *   · parcelas 14px graphite-light
 *   · economia em badge sage 12% (verde sutil destacando saving)
 *   · CTA opcional abaixo (usa LPBButtonLegacy)
 *
 *   LPBBlockPriceLegacy.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockPriceLegacy) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function _fmtBR(n) {
    var num = Number(n)
    if (!isFinite(num) || num <= 0) return ''
    return num.toLocaleString('pt-BR')
  }

  function render(block) {
    var p  = (block && block.props) || {}
    var bg = p.bg || 'transparent'
    var value    = parseFloat(p.value)    || 0
    var original = parseFloat(p.original) || 0
    var parcelas = parseInt(p.parcelas, 10) || 0
    var econ = (original > value && value > 0) ? (original - value) : 0

    var btn = (p.cta_label && window.LPBButtonLegacy)
      ? LPBButtonLegacy.render({
          label: p.cta_label,
          url:   p.cta_url || '#',
          style: p.cta_style || 'champagne',
        })
      : ''

    var html = '<section class="blk-price-legacy" data-bg="' + _esc(bg) + '">' +
      '<div class="blk-price-legacy-card">'

    if (p.label) html += '<div class="blk-price-legacy-label">' + _esc(p.label) + '</div>'

    if (original > 0) {
      html += '<div class="blk-price-legacy-original">De R$ ' + _fmtBR(original) + '</div>'
    }

    if (value > 0) {
      html += '<div class="blk-price-legacy-value">R$ ' + _fmtBR(value) + '</div>'
    } else {
      html += '<div class="blk-price-legacy-value" style="opacity:.4;font-size:24px">R$ —</div>'
    }

    if (parcelas > 0 && value > 0) {
      var parcVal = Math.ceil(value / parcelas)
      html += '<div class="blk-price-legacy-parcelas">' + parcelas +
              'x de R$ ' + _fmtBR(parcVal) + ' sem juros</div>'
    }

    if (econ > 0) {
      html += '<div class="blk-price-legacy-economy">Economia de R$ ' + _fmtBR(econ) + '</div>'
    }

    if (btn) html += '<div class="blk-price-legacy-cta">' + btn + '</div>'

    html += '</div></section>'
    return html
  }

  window.LPBBlockPriceLegacy = Object.freeze({ render: render })
})()
