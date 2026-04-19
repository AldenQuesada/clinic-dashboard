/**
 * LP Builder · Block Render: links-tree (Onda 28)
 *
 * Renderer puro do bloco LinkTree-style. Reusado pelo canvas (admin)
 * e pelo lp.html (runtime). Zero dependência de DOM externo.
 *
 *   LPBBlockLinksTree.render(block) → string HTML
 *
 * Schema esperado (lpb-schema.js · 'links-tree'):
 *   { type: 'links-tree', props: {
 *       eyebrow, titulo, bg, items: [{ titulo, subtitulo, url, icon_svg }]
 *   }}
 */
;(function () {
  'use strict'
  if (window.LPBBlockLinksTree) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // SVG inline é confiável (vem do admin). Não fazemos sanitize agressivo
  // pra preservar fidelidade. Mantemos só básico (remove <script>).
  function _svgSafe(svg) {
    if (!svg) return ''
    var s = String(svg)
    if (s.indexOf('<script') >= 0) return ''  // never
    return s
  }

  var ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>'

  function render(block) {
    var p = (block && block.props) || {}
    var bg = p.bg || 'white'
    var items = Array.isArray(p.items) ? p.items : []

    var html = '<div class="blk-links-tree" data-bg="' + _esc(bg) + '">'
    if (p.eyebrow) html += '<div class="blk-links-tree-eyebrow">' + _esc(p.eyebrow) + '</div>'
    if (p.titulo)  html += '<div class="blk-links-tree-title">'   + _esc(p.titulo)  + '</div>'

    items.forEach(function (it) {
      if (!it || !it.titulo) return
      var url   = it.url || '#'
      var title = it.titulo
      var sub   = it.subtitulo || ''
      var ico   = _svgSafe(it.icon_svg)
      var external = /^https?:\/\//.test(url)

      html += '<a class="blk-link-btn" href="' + _esc(url) + '"' +
        (external ? ' target="_blank" rel="noopener"' : '') + '>'
      if (ico) html += '<div class="blk-link-icon">' + ico + '</div>'
      html += '<div class="blk-link-text">' +
                '<span class="blk-link-title">' + _esc(title) + '</span>' +
                (sub ? '<span class="blk-link-sub">' + _esc(sub) + '</span>' : '') +
              '</div>' +
              '<div class="blk-link-arrow">' + ARROW_SVG + '</div>' +
              '</a>'
    })

    if (!items.length) {
      html += '<div style="text-align:center;padding:1.5rem 1rem;color:rgba(44,44,44,.4);font-size:11px;font-style:italic">Adicione pelo menos 1 link</div>'
    }

    html += '</div>'
    return html
  }

  window.LPBBlockLinksTree = Object.freeze({ render: render })
})()
