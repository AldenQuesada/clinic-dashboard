/**
 * LP Builder · Block Render: before-after-carousel (Onda 28)
 *
 * Reproduz fielmente o bloco antes-depois do legado p.html. Diferencial:
 * dots em formato ROMBO (rotate 45deg + escala/glow no active) ao invés
 * dos pills do legado.
 *
 * Funciona estático (1 slide · sem dots) ou carrossel (2+ slides).
 *
 *   LPBBlockBaCarousel.render(block)        → string HTML
 *   LPBBlockBaCarousel.bind(rootEl)         → ativa scroll-snap + dots
 *
 * Schema esperado:
 *   { type: 'before-after-carousel', props: {
 *       eyebrow, titulo, bg, label_before, label_after,
 *       slides: [{ before_url, after_url, procedure, detail }]
 *   }}
 */
;(function () {
  'use strict'
  if (window.LPBBlockBaCarousel) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function _imgOrPlaceholder(url, alt, fallbackText) {
    if (url) return '<img src="' + _esc(url) + '" alt="' + _esc(alt) + '" loading="lazy" decoding="async">'
    return '<div class="blk-bac-img-placeholder">' + _esc(fallbackText) + '</div>'
  }

  function render(block) {
    var p = (block && block.props) || {}
    var bg = p.bg || 'graphite'
    var slides = Array.isArray(p.slides) ? p.slides : []
    var labelBefore = p.label_before || 'Antes'
    var labelAfter  = p.label_after  || 'Depois'
    var hasMulti = slides.length > 1
    var carouselId = 'bac-' + Math.random().toString(36).slice(2, 8)

    var html = '<div class="blk-bac" data-bg="' + _esc(bg) + '" data-bac-root>'
    if (p.eyebrow) html += '<div class="blk-bac-eyebrow">' + _esc(p.eyebrow) + '</div>'
    if (p.titulo)  html += '<div class="blk-bac-title">'   + _esc(p.titulo)  + '</div>'

    if (!slides.length) {
      html += '<div style="text-align:center;padding:2rem;color:rgba(200,169,126,.5);font-size:11px;font-style:italic">Adicione pelo menos 1 slide com fotos antes/depois</div></div>'
      return html
    }

    html += '<div class="blk-bac-track" data-bac-track="' + carouselId + '">'
    slides.forEach(function (s) {
      html += '<div class="blk-bac-slide">' +
                '<div class="blk-bac-card">' +
                  '<div class="blk-bac-img">' +
                    _imgOrPlaceholder(s.before_url, labelBefore, 'Foto antes') +
                    '<div class="blk-bac-label">' + _esc(labelBefore) + '</div>' +
                  '</div>' +
                  '<div class="blk-bac-img">' +
                    _imgOrPlaceholder(s.after_url, labelAfter, 'Foto depois') +
                    '<div class="blk-bac-label">' + _esc(labelAfter) + '</div>' +
                  '</div>' +
                  ((s.procedure || s.detail)
                    ? '<div class="blk-bac-info">' +
                        (s.procedure ? '<p class="blk-bac-procedure">' + _esc(s.procedure) + '</p>' : '') +
                        (s.detail    ? '<p class="blk-bac-detail">'    + _esc(s.detail)    + '</p>' : '') +
                      '</div>'
                    : '') +
                '</div>' +
              '</div>'
    })
    html += '</div>'

    if (hasMulti) {
      html += '<div class="blk-bac-dots" data-bac-dots="' + carouselId + '">'
      slides.forEach(function (_, i) {
        html += '<button type="button" class="blk-bac-dot' + (i === 0 ? ' active' : '') +
                '" data-bac-idx="' + i + '" aria-label="Ir para slide ' + (i + 1) + '"></button>'
      })
      html += '</div>'
    }

    html += '</div>'
    return html
  }

  // Liga o comportamento de scroll-snap + dots clicáveis
  function bind(rootEl) {
    if (!rootEl) return
    var roots = rootEl.querySelectorAll
      ? rootEl.querySelectorAll('[data-bac-root]')
      : []
    roots.forEach(function (root) {
      var track = root.querySelector('[data-bac-track]')
      var dots  = root.querySelectorAll('[data-bac-dot], .blk-bac-dot')
      if (!track || !dots.length) return

      // Click nos dots → scroll · slide é 100% width sem gap
      dots.forEach(function (d) {
        d.addEventListener('click', function () {
          var idx = parseInt(d.dataset.bacIdx, 10) || 0
          var sw = track.children[0] ? track.children[0].offsetWidth : 1
          track.scrollTo({ left: idx * sw, behavior: 'smooth' })
        })
      })

      // Scroll natural → atualiza dot ativo
      var scrollPending = false
      track.addEventListener('scroll', function () {
        if (scrollPending) return
        scrollPending = true
        requestAnimationFrame(function () {
          scrollPending = false
          var sw = track.children[0] ? track.children[0].offsetWidth : 1
          var idx = Math.round(track.scrollLeft / sw)
          dots.forEach(function (d, i) {
            d.classList.toggle('active', i === idx)
          })
        })
      }, { passive: true })
    })
  }

  window.LPBBlockBaCarousel = Object.freeze({
    render: render,
    bind:   bind,
  })
})()
