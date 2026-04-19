/**
 * LP Builder · Block Render: live-counter (Onda 29)
 *
 * Prova social ao vivo · count REAL via RPC lp_recent_leads_count.
 * Renderer puro · runtime separado em lpb-live-counter-runtime.js.
 *
 * Variantes:
 *   · card  — bloco centrado padrão (default)
 *   · pill  — pill discreto inline (parágrafo)
 *   · fixed — pill sticky no canto inferior esquerdo
 *
 *   LPBBlockLiveCounter.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockLiveCounter) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // Ícone Feather "users" inline
  function _iconUsers() {
    return '<svg class="blk-lc-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" '
      + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>'
      + '<circle cx="9" cy="7" r="4"/>'
      + '<path d="M23 21v-2a4 4 0 0 0-3-3.87"/>'
      + '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
      + '</svg>'
  }

  function render(block) {
    var p = (block && block.props) || {}
    var bg       = p.bg || 'ivory'
    var variant  = p.variant || 'card'
    var days     = parseInt(p.days, 10); if (!days || days < 1) days = 7
    var minCount = parseInt(p.min_count, 10); if (!minCount || minCount < 1) minCount = 3
    var template = (p.text_template && String(p.text_template).indexOf('{n}') !== -1)
      ? p.text_template
      : '{n} mulheres marcaram avaliação esta semana'

    // Split em torno do {n} pra inserir o span sem quebrar escape
    var parts = String(template).split('{n}')
    var before = _esc(parts[0] || '')
    var after  = _esc(parts.slice(1).join('{n}') || '')

    // Estado inicial · hidden até runtime confirmar count >= min
    var html = ''
      + '<section class="blk-lc" data-bg="' + _esc(bg) + '" data-variant="' + _esc(variant) + '"'
      + ' data-lc-root data-lc-days="' + days + '" data-lc-min="' + minCount + '" hidden>'
      +   '<div class="blk-lc-inner">'
      +     '<span class="blk-lc-iconwrap">' + _iconUsers() + '</span>'
      +     '<span class="blk-lc-text">'
      +       before
      +       '<span class="blk-lc-count" data-count>—</span>'
      +       after
      +     '</span>'
      +   '</div>'
      + '</section>'

    return html
  }

  window.LPBBlockLiveCounter = Object.freeze({ render: render })
})()
