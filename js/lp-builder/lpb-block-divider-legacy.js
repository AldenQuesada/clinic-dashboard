/**
 * LP Builder · Block Render: divider-legacy (Onda 28)
 *
 * Linha 1px bege com rombo champagne 8×8 rotacionado 45deg no centro.
 * Reproduz fielmente .blk-divider + .blk-divider-mark do legado.
 *
 *   LPBBlockDividerLegacy.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockDividerLegacy) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function render(block) {
    var p = (block && block.props) || {}
    var spacing = p.spacing || 'md'
    var showMark = p.show_mark !== 'no'
    return '<div class="blk-divider-legacy" data-spacing="' + _esc(spacing) + '" data-mark="' + (showMark ? '1' : '0') + '">' +
      (showMark ? '<span class="blk-divider-legacy-mark"></span>' : '') +
    '</div>'
  }

  window.LPBBlockDividerLegacy = Object.freeze({ render: render })
})()
