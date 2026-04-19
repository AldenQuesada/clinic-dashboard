/**
 * LP Builder · Block Render: buttons-row (Onda 28)
 *
 * Vários botões empilhados verticalmente (max 500px). Cada botão tem
 * seu próprio estilo (whatsapp/champagne/outline/graphite) via
 * LPBButtonLegacy.
 *
 * Reproduz .blk-buttons do legado.
 *
 *   LPBBlockButtonsRow.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockButtonsRow) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function render(block) {
    var p  = (block && block.props) || {}
    var bg = p.bg || 'transparent'
    var items = Array.isArray(p.items) ? p.items.filter(function (i) { return i && i.label }) : []

    var html = '<section class="blk-buttons-row" data-bg="' + _esc(bg) + '">'
    if (p.eyebrow || p.titulo) {
      html += '<div class="blk-buttons-row-head">'
      if (p.eyebrow) html += '<div class="blk-buttons-row-eyebrow">' + _esc(p.eyebrow) + '</div>'
      if (p.titulo)  html += '<h2 class="blk-buttons-row-title">'    + _esc(p.titulo)  + '</h2>'
      html += '</div>'
    }
    html += '<div class="blk-buttons-row-stack">'
    items.forEach(function (it) {
      if (window.LPBButtonLegacy) {
        html += LPBButtonLegacy.render({
          label: it.label,
          url:   it.url   || '#',
          style: it.style || 'whatsapp',
        })
      }
    })
    if (!items.length) {
      html += '<div style="color:rgba(200,169,126,.5);font-size:11px;font-style:italic;padding:1rem;text-align:center">Adicione pelo menos 1 botão</div>'
    }
    html += '</div></section>'
    return html
  }

  window.LPBBlockButtonsRow = Object.freeze({ render: render })
})()
