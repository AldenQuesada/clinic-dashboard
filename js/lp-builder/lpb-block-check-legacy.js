/**
 * LP Builder · Block Render: check-legacy (Onda 28)
 *
 * Lista de items com círculo champagne + check branco SVG.
 * Reproduz .blk-check + .blk-check-icon do legado.
 *
 *   LPBBlockCheckLegacy.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockCheckLegacy) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // Check SVG branco · 12×12 dentro do círculo champagne 20×20
  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="20 6 9 17 4 12"/>' +
  '</svg>'

  function render(block) {
    var p  = (block && block.props) || {}
    var bg = p.bg || 'transparent'
    var items = Array.isArray(p.items) ? p.items.filter(function (i) { return i && i.text }) : []

    var html = '<section class="blk-check-legacy" data-bg="' + _esc(bg) + '">'
    if (p.eyebrow || p.h2) {
      html += '<div class="blk-check-legacy-head">'
      if (p.eyebrow) html += '<div class="blk-check-legacy-eyebrow">' + _esc(p.eyebrow) + '</div>'
      if (p.h2)      html += '<h2 class="blk-check-legacy-h2">' + _esc(p.h2) + '</h2>'
      html += '</div>'
    }
    html += '<div class="blk-check-legacy-list">'
    items.forEach(function (it) {
      html += '<div class="blk-check-legacy-item">' +
                '<span class="blk-check-legacy-icon">' + CHECK_SVG + '</span>' +
                '<span class="blk-check-legacy-text">' + _esc(it.text) + '</span>' +
              '</div>'
    })
    if (!items.length) {
      html += '<div style="color:rgba(200,169,126,.5);font-size:11px;font-style:italic;padding:1rem;text-align:center">Adicione pelo menos 2 itens</div>'
    }
    html += '</div></section>'
    return html
  }

  window.LPBBlockCheckLegacy = Object.freeze({ render: render })
})()
