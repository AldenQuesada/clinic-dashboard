/**
 * LP Builder · Block Render: badges-legacy (Onda 28)
 *
 * Reproduz blk-badges do legado:
 *   · flex horizontal gap 2px · max 900px
 *   · cada badge: ivory bg + border-LEFT 2px champagne + padding 1rem 1.5rem
 *   · icon (emoji/char) opcional + text
 *   · mobile: vira coluna automaticamente
 *
 *   LPBBlockBadgesLegacy.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockBadgesLegacy) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function render(block) {
    var p  = (block && block.props) || {}
    var bg = p.bg || 'transparent'
    var items = Array.isArray(p.items) ? p.items.filter(function (i) { return i && i.text }) : []

    var html = '<section class="blk-badges-legacy" data-bg="' + _esc(bg) + '">'
    if (p.eyebrow || p.titulo) {
      html += '<div class="blk-badges-legacy-head">'
      if (p.eyebrow) html += '<div class="blk-badges-legacy-eyebrow">' + _esc(p.eyebrow) + '</div>'
      if (p.titulo)  html += '<h2 class="blk-badges-legacy-title">'    + _esc(p.titulo)  + '</h2>'
      html += '</div>'
    }
    html += '<div class="blk-badges-legacy-row">'
    items.forEach(function (it) {
      html += '<div class="blk-badge-legacy">'
      if (it.icon) html += '<span class="blk-badge-legacy-icon">' + _esc(it.icon) + '</span>'
      html += '<span class="blk-badge-legacy-text">' + _esc(it.text) + '</span>'
      html += '</div>'
    })
    if (!items.length) {
      html += '<div style="color:rgba(200,169,126,.5);font-size:11px;font-style:italic;padding:1rem;text-align:center;width:100%">Adicione pelo menos 1 selo</div>'
    }
    html += '</div></section>'
    return html
  }

  window.LPBBlockBadgesLegacy = Object.freeze({ render: render })
})()
