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
    slides.forEach(function (s, i) {
      var slideStyle = i === 0 ? '' : 'display:none;opacity:0'
      html += '<div class="blk-bac-slide" data-bac-slide="' + i + '" style="' + slideStyle + '">' +
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

  // Liga fade transition (800ms) + autoplay (3s) · mesmo padrão do quiz BA carousel
  // Cleanup global · permite re-bind sem leak de timers
  var _bacTimers = []
  function _clearAllTimers() {
    _bacTimers.forEach(function (t) { clearInterval(t) })
    _bacTimers = []
  }

  function bind(rootEl) {
    if (!rootEl) return
    _clearAllTimers()
    var roots = rootEl.querySelectorAll
      ? rootEl.querySelectorAll('[data-bac-root]')
      : []
    roots.forEach(function (root) {
      var track  = root.querySelector('[data-bac-track]')
      var slides = root.querySelectorAll('[data-bac-slide]')
      var dots   = root.querySelectorAll('.blk-bac-dot')
      var total  = slides.length
      if (!track || total < 2) return

      var cur = 0

      function goTo(idx) {
        if (idx === cur) return
        var prev = slides[cur]
        var next = slides[idx]
        prev.style.opacity = '0'
        setTimeout(function () {
          prev.style.display = 'none'
          next.style.display = 'flex'
          // force reflow pra animar opacity do 0 ao 1
          void next.offsetWidth
          next.style.opacity = '1'
          cur = idx
        }, 800)
        // Atualiza dots imediatamente
        dots.forEach(function (d, di) {
          d.classList.toggle('active', di === idx)
        })
      }

      // Autoplay 3s
      var timer = setInterval(function () { goTo((cur + 1) % total) }, 3000)
      _bacTimers.push(timer)

      // Click manual nos dots → reseta autoplay
      dots.forEach(function (d, di) {
        d.addEventListener('click', function () {
          if (di === cur) return
          clearInterval(timer)
          _bacTimers = _bacTimers.filter(function (t) { return t !== timer })
          goTo(di)
          timer = setInterval(function () { goTo((cur + 1) % total) }, 3000)
          _bacTimers.push(timer)
        })
      })

      // Pausa em hover (desktop) · retoma quando sai
      root.addEventListener('mouseenter', function () { clearInterval(timer); timer = null })
      root.addEventListener('mouseleave', function () {
        if (timer) return
        timer = setInterval(function () { goTo((cur + 1) % total) }, 3000)
        _bacTimers.push(timer)
      })
    })
  }

  window.LPBBlockBaCarousel = Object.freeze({
    render: render,
    bind:   bind,
  })
})()
