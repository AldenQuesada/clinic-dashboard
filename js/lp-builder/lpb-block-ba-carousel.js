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

  // Maps de tamanho · espelha as opções do schema
  var SIZE_EYEBROW = { sm: '8px',  md: '9px',  lg: '11px', xl: '13px' }
  var SIZE_TITULO  = { sm: '18px', md: '24px', lg: '32px', xl: '40px' }
  var SIZE_LABEL   = { sm: '7px',  md: '8px',  lg: '10px', xl: '12px' }
  var SIZE_PROC    = { sm: '13px', md: '15px', lg: '18px', xl: '22px' }
  var SIZE_DETAIL  = { sm: '10px', md: '11px', lg: '13px', xl: '15px' }
  var PADX_MAP     = { '0': '0', sm: '0.5rem', md: '1.5rem', lg: '2.5rem', xl: '4rem' }

  function _styleStr(parts) {
    return parts.filter(Boolean).join(';')
  }
  function _fontSize(map, v) {
    var px = map[v || 'md']
    return px ? 'font-size:' + px : ''
  }
  function _color(v) {
    return v ? 'color:' + v : ''
  }
  function _padx(v) {
    var px = PADX_MAP[v || 'md']
    return px != null ? 'padding-left:' + px + ';padding-right:' + px : ''
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
    if (p.eyebrow) {
      var eyebrowStyle = _styleStr([_fontSize(SIZE_EYEBROW, p.eyebrow_size), _color(p.eyebrow_color), _padx(p.eyebrow_padx)])
      html += '<div class="blk-bac-eyebrow"' + (eyebrowStyle ? ' style="' + eyebrowStyle + '"' : '') + '>' + _esc(p.eyebrow) + '</div>'
    }
    if (p.titulo) {
      var tituloStyle = _styleStr([_fontSize(SIZE_TITULO, p.titulo_size), _color(p.titulo_color), _padx(p.titulo_padx)])
      html += '<div class="blk-bac-title"' + (tituloStyle ? ' style="' + tituloStyle + '"' : '') + '>' + _esc(p.titulo) + '</div>'
    }

    if (!slides.length) {
      html += '<div style="text-align:center;padding:2rem;color:rgba(200,169,126,.5);font-size:11px;font-style:italic">Adicione pelo menos 1 slide com fotos antes/depois</div></div>'
      return html
    }

    // Styles inline pra labels antes/depois (aplicados em todos slides)
    var labelBeforeStyle = _styleStr([_fontSize(SIZE_LABEL, p.label_before_size), _color(p.label_before_color)])
    var labelAfterStyle  = _styleStr([_fontSize(SIZE_LABEL, p.label_after_size),  _color(p.label_after_color)])
    var labelBeforeAttr  = labelBeforeStyle ? ' style="' + labelBeforeStyle + '"' : ''
    var labelAfterAttr   = labelAfterStyle  ? ' style="' + labelAfterStyle  + '"' : ''

    // Styles inline pra procedure/detail (aplicados a TODOS slides · controle global)
    var procStyle   = _styleStr([_fontSize(SIZE_PROC, p.procedure_size), _color(p.procedure_color)])
    var detailStyle = _styleStr([_fontSize(SIZE_DETAIL, p.detail_size),  _color(p.detail_color)])
    var procAttr    = procStyle   ? ' style="' + procStyle   + '"' : ''
    var detailAttr  = detailStyle ? ' style="' + detailStyle + '"' : ''

    html += '<div class="blk-bac-track" data-bac-track="' + carouselId + '">'
    slides.forEach(function (s, i) {
      var slideStyle = i === 0 ? '' : 'display:none;opacity:0'
      html += '<div class="blk-bac-slide" data-bac-slide="' + i + '" style="' + slideStyle + '">' +
                '<div class="blk-bac-card">' +
                  '<div class="blk-bac-img">' +
                    _imgOrPlaceholder(s.before_url, labelBefore, 'Foto antes') +
                    '<div class="blk-bac-label"' + labelBeforeAttr + '>' + _esc(labelBefore) + '</div>' +
                  '</div>' +
                  '<div class="blk-bac-img">' +
                    _imgOrPlaceholder(s.after_url, labelAfter, 'Foto depois') +
                    '<div class="blk-bac-label"' + labelAfterAttr + '>' + _esc(labelAfter) + '</div>' +
                  '</div>' +
                  ((s.procedure || s.detail)
                    ? '<div class="blk-bac-info">' +
                        (s.procedure ? '<p class="blk-bac-procedure"' + procAttr   + '>' + _esc(s.procedure) + '</p>' : '') +
                        (s.detail    ? '<p class="blk-bac-detail"'    + detailAttr + '>' + _esc(s.detail)    + '</p>' : '') +
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
