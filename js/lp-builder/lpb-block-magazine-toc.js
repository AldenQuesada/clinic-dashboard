/**
 * LP Builder · Block Render: magazine-toc (Onda 28)
 *
 * Reproduz o sumário da revista (t04_toc_editorial) com brandbook da
 * clínica (Cormorant + champagne em vez de Playfair).
 *
 * Layout:
 *   · 2 colunas (grid 1fr / 1.2fr) · vira 1 col em mobile
 *   · side esquerdo: kicker + h1 grande Cormorant + lead
 *   · list direito: items com num · title (+ kicker) · pg
 *
 * Animação:
 *   · cada .item: transition padding-left .25s
 *   · :hover desliza 8px pra direita (estilo editorial premium)
 *
 *   LPBBlockMagazineToc.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockMagazineToc) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function _padNum(n) {
    var s = String(n)
    return s.length === 1 ? '0' + s : s
  }

  function render(block) {
    var p = (block && block.props) || {}
    var bg = p.bg || 'cream'
    var items = Array.isArray(p.items) ? p.items.filter(function (i) { return i && i.titulo }) : []

    var itemsHtml = items.map(function (it, i) {
      var num     = (it.num && String(it.num).trim()) || _padNum(i + 1)
      var hasPg   = it.page_no && String(it.page_no).trim()
      var anchor  = it.anchor && String(it.anchor).trim()
      var tag     = anchor ? 'a'   : 'div'
      var attrs   = anchor
        ? ' href="#' + _esc(anchor) + '" data-toc-target="' + _esc(anchor) + '"'
        : ''
      var classes = 'blk-mtoc-item' + (hasPg ? '' : ' no-pg') + (anchor ? ' is-link' : '')
      return '<' + tag + ' class="' + classes + '"' + attrs + '>' +
        '<div class="blk-mtoc-num">' + _esc(num) + '</div>' +
        '<div class="blk-mtoc-title">' +
          _esc(it.titulo) +
          (it.kicker ? '<span>' + _esc(it.kicker) + '</span>' : '') +
        '</div>' +
        (hasPg ? '<div class="blk-mtoc-pg">' + _esc(it.page_no) + '</div>' : '') +
      '</' + tag + '>'
    }).join('')

    if (!items.length) {
      itemsHtml = '<div class="blk-mtoc-empty">Adicione pelo menos 2 itens no sumário</div>'
    }

    return '<section class="blk-mtoc" data-bg="' + _esc(bg) + '">' +
      '<div class="blk-mtoc-side">' +
        (p.eyebrow ? '<div class="blk-mtoc-kicker">' + _esc(p.eyebrow) + '</div>' : '') +
        (p.h1      ? '<h1 class="blk-mtoc-h1">'      + _esc(p.h1)      + '</h1>' : '') +
        (p.lead    ? '<p class="blk-mtoc-lead">'     + _esc(p.lead)    + '</p>' : '') +
      '</div>' +
      '<div class="blk-mtoc-list">' + itemsHtml + '</div>' +
    '</section>'
  }

  window.LPBBlockMagazineToc = Object.freeze({ render: render })
})()
