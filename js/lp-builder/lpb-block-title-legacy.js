/**
 * LP Builder · Block Render: title-legacy (Onda 28)
 *
 * Section title H2 + lead opcional. Cormorant 300 clamp(28-44px).
 * Reproduz .blk-title do legado.
 *
 *   LPBBlockTitleLegacy.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockTitleLegacy) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }
  function _multiline(s) { return _esc(s).replace(/\n/g, '<br>') }

  function render(block) {
    var p = (block && block.props) || {}
    var bg    = p.bg || 'transparent'
    var align = p.align || 'left'
    var html = '<section class="blk-title-legacy" data-bg="' + _esc(bg) + '" data-align="' + _esc(align) + '">'
    if (p.eyebrow) html += '<div class="blk-title-legacy-eyebrow">' + _esc(p.eyebrow) + '</div>'
    if (p.h2)      html += '<h2 class="blk-title-legacy-h2">' + _multiline(p.h2) + '</h2>'
    if (p.lead)    html += '<p class="blk-title-legacy-lead">' + _multiline(p.lead) + '</p>'
    html += '</section>'
    return html
  }

  window.LPBBlockTitleLegacy = Object.freeze({ render: render })
})()
