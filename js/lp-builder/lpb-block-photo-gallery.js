/**
 * LP Builder · Block: photo-gallery (Onda 32)
 *
 * Carrossel de fotos com label inferior por foto.
 * - 1 foto = visual estático
 * - 2+ fotos = carrossel com fade 800ms + autoplay configurável + dots em rombo
 * - Aspect 4/5 default (padrão LP) · 7 opções configuráveis
 * - Cada foto tem positioner (zoom + pan + rot + ghost overlay desabilitado)
 * - Caption inferior com gradient overlay dark
 *
 * IIFE auto-contido · CSS INLINE no HTML (iframe-safe)
 *
 *   LPBBlockPhotoGallery.render(block) → string HTML
 *   LPBBlockPhotoGallery.bind(rootEl)  → autoplay + dots tap
 */
;(function () {
  'use strict'
  if (window.LPBBlockPhotoGallery) return

  function _esc(s) {
    var d = document.createElement('div')
    d.textContent = s == null ? '' : s
    return d.innerHTML
  }

  // ──────────────────────────────────────────────────────────
  // Maps de tamanho · espelho de outros blocos
  // ──────────────────────────────────────────────────────────
  var SIZE_EYEBROW = { sm: '8px',  md: '9px',  lg: '11px', xl: '13px' }
  var SIZE_TITULO  = { sm: '18px', md: '24px', lg: '32px', xl: '40px' }
  var SIZE_CAPTION = { sm: '10px', md: '12px', lg: '14px', xl: '17px' }
  var PADX_MAP     = { '0': '0', sm: '0.5rem', md: '1.5rem', lg: '2.5rem', xl: '4rem' }

  function _styleStr(parts) { return parts.filter(Boolean).join(';') }
  function _fontSize(map, v) { var px = map[v || 'md']; return px ? 'font-size:' + px : '' }
  function _color(v) { return v ? 'color:' + v : '' }
  function _padx(v)  { var px = PADX_MAP[v || 'md']; return px != null ? 'padding-left:' + px + ';padding-right:' + px : '' }
  function _imgTransform(zoom, x, y, rot) {
    var z  = parseFloat(zoom) || 1
    var px = parseFloat(x) || 0
    var py = parseFloat(y) || 0
    var pr = parseFloat(rot) || 0
    if (z === 1 && px === 0 && py === 0 && pr === 0) return ''
    return 'transform:rotate(' + pr + 'deg) scale(' + z + ') translate(' + px + '%, ' + py + '%);transform-origin:center'
  }

  // ──────────────────────────────────────────────────────────
  // CSS · INLINE com HTML (iframe-safe)
  // ──────────────────────────────────────────────────────────
  var CSS = [
    '.blk-pg{padding:2.5rem 0 2rem;max-width:480px;margin:0 auto;background:#2C2C2C}',
    '.blk-pg[data-bg="ivory"]{background:#FEFCF8}',
    '.blk-pg[data-bg="white"]{background:#FFFFFF}',
    '.blk-pg-eyebrow{font-family:Montserrat,sans-serif;font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:#C8A97E;font-weight:500;text-align:center;padding:0 1.5rem;margin-bottom:.5rem}',
    '.blk-pg-title{font-family:"Cormorant Garamond",serif;font-size:24px;font-weight:300;text-align:center;color:#FEFCF8;padding:0 1.5rem;margin-bottom:1.25rem}',
    '.blk-pg[data-bg="ivory"] .blk-pg-title,.blk-pg[data-bg="white"] .blk-pg-title{color:#2C2C2C}',
    // Track empilhado · slides absolutos (fade)
    '.blk-pg-track{position:relative;width:100%;padding:0 0 1rem}',
    '.blk-pg-slide{width:100%;display:flex;transition:opacity 800ms cubic-bezier(.4,0,.2,1)}',
    // Stage · padrao LP (380px max + aspect 4/5)
    '.blk-pg-stage{position:relative;width:100%;max-width:var(--lp-photo-card-max-width,380px);margin:0 auto;overflow:hidden;background:rgba(200,169,126,.06);box-shadow:0 12px 40px rgba(0,0,0,.25),0 2px 6px rgba(0,0,0,.1)}',
    // Aspect ratio variants · controlado por data-aspect no root
    '.blk-pg[data-aspect="1/1"]   .blk-pg-stage{aspect-ratio:1/1}',
    '.blk-pg[data-aspect="4/5"]   .blk-pg-stage{aspect-ratio:4/5}',
    '.blk-pg[data-aspect="5/4"]   .blk-pg-stage{aspect-ratio:5/4}',
    '.blk-pg[data-aspect="2/3"]   .blk-pg-stage{aspect-ratio:2/3}',
    '.blk-pg[data-aspect="3/2"]   .blk-pg-stage{aspect-ratio:3/2}',
    '.blk-pg[data-aspect="3/4"]   .blk-pg-stage{aspect-ratio:3/4}',
    '.blk-pg[data-aspect="16/9"]  .blk-pg-stage{aspect-ratio:16/9}',
    '.blk-pg[data-aspect="9/16"]  .blk-pg-stage{aspect-ratio:9/16}',
    // Imagem
    '.blk-pg-img{width:100%;height:100%;object-fit:cover;display:block;transform-origin:center}',
    '.blk-pg-placeholder{display:flex;align-items:center;justify-content:center;height:100%;font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(200,169,126,.45)}',
    // Caption inferior · gradient + texto
    '.blk-pg-caption{position:absolute;left:0;right:0;bottom:0;padding:18px 16px 14px;color:#FEFCF8;background:linear-gradient(to top,rgba(0,0,0,.78) 0%,rgba(0,0,0,.45) 60%,rgba(0,0,0,0) 100%);font-family:Montserrat,sans-serif;font-size:12px;letter-spacing:.04em;text-align:center;pointer-events:none}',
    '.blk-pg-caption-text{display:block;line-height:1.4}',
    // Dots em rombo champagne · padrão da LP
    '.blk-pg-dots{display:flex;justify-content:center;gap:14px;margin-top:.85rem;padding:0 1.5rem}',
    '.blk-pg-dot{width:8px;height:8px;background:transparent;border:1px solid rgba(200,169,126,.45);cursor:pointer;transition:all .35s cubic-bezier(.4,0,.2,1);padding:0;transform:rotate(45deg);flex-shrink:0}',
    '.blk-pg-dot:hover{border-color:#C8A97E;transform:rotate(45deg) scale(1.15)}',
    '.blk-pg-dot.active{width:12px;height:12px;background:#C8A97E;border-color:#C8A97E;box-shadow:0 0 0 4px rgba(200,169,126,.12)}',
    '.blk-pg[data-bg="ivory"] .blk-pg-dot,.blk-pg[data-bg="white"] .blk-pg-dot{border-color:rgba(200,169,126,.6)}',
    '@media(prefers-reduced-motion:reduce){.blk-pg-slide{transition:none}.blk-pg-dot{transition:none}}',
  ].join('\n')

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────
  function render(block) {
    var p = (block && block.props) || {}
    var bg      = p.bg     || 'graphite'
    var aspect  = p.aspect || '4/5'
    var eyebrow = p.eyebrow
    var titulo  = p.titulo

    var photos = Array.isArray(p.photos) ? p.photos.filter(function (it) { return it && (it.url || it.caption) }) : []
    if (!photos.length) {
      photos = [{ url: '', caption: '' }]  // placeholder
    }
    var hasMulti = photos.length > 1

    // Inline styles texto block-level
    var sEyebrow = _styleStr([_fontSize(SIZE_EYEBROW, p.eyebrow_size), _color(p.eyebrow_color), _padx(p.eyebrow_padx)])
    var sTitulo  = _styleStr([_fontSize(SIZE_TITULO,  p.titulo_size),  _color(p.titulo_color),  _padx(p.titulo_padx)])

    // Autoplay opts
    var autoplayCar = !!(hasMulti && (p.autoplay_slides !== false))
    var slidesIntv  = parseInt(p.slides_interval, 10) || 4

    var rootAttrs = ' data-autoplay-slides="' + (autoplayCar ? '1' : '0') + '"' +
                    ' data-slides-interval="' + slidesIntv + '"' +
                    ' data-aspect="' + _esc(aspect) + '"'

    var html = '<style data-lpb-style="photo-gallery">' + CSS + '</style>'
    html += '<section class="blk-pg" data-bg="' + _esc(bg) + '" data-pg-root' + rootAttrs + '>'

    if (eyebrow) html += '<div class="blk-pg-eyebrow"' + (sEyebrow ? ' style="' + sEyebrow + '"' : '') + '>' + _esc(eyebrow) + '</div>'
    if (titulo)  html += '<h2 class="blk-pg-title"'    + (sTitulo  ? ' style="' + sTitulo  + '"' : '') + '>' + _esc(titulo) + '</h2>'

    html += '<div class="blk-pg-track" data-pg-track>'
    photos.forEach(function (ph, i) {
      var slideStyle = i === 0 ? '' : 'display:none;opacity:0'
      var imgT = _imgTransform(ph.zoom, ph.x, ph.y, ph.rot)
      var imgStyleAttr = imgT ? ' style="' + imgT + '"' : ''
      var sCap = _styleStr([_fontSize(SIZE_CAPTION, ph.caption_size), _color(ph.caption_color)])
      var capAttr = sCap ? ' style="' + sCap + '"' : ''
      html += '<div class="blk-pg-slide" data-pg-slide="' + i + '" style="' + slideStyle + '">' +
        '<div class="blk-pg-stage">' +
          (ph.url
            ? '<img class="blk-pg-img" src="' + _esc(ph.url) + '" alt="' + _esc(ph.caption || 'Foto ' + (i + 1)) + '" loading="lazy" decoding="async"' + imgStyleAttr + '>'
            : '<div class="blk-pg-placeholder">Adicione a foto</div>') +
          (ph.caption
            ? '<div class="blk-pg-caption"' + capAttr + '><span class="blk-pg-caption-text">' + _esc(ph.caption) + '</span></div>'
            : '') +
        '</div>' +
      '</div>'
    })
    html += '</div>'

    if (hasMulti) {
      html += '<div class="blk-pg-dots" data-pg-dots>'
      photos.forEach(function (_, i) {
        html += '<button type="button" class="blk-pg-dot' + (i === 0 ? ' active' : '') +
                '" data-pg-idx="' + i + '" aria-label="Ir para foto ' + (i + 1) + '"></button>'
      })
      html += '</div>'
    }

    html += '</section>'
    return html
  }

  // ──────────────────────────────────────────────────────────
  // Bind · autoplay fade + dots tap (mesmo padrão BA-carousel)
  // ──────────────────────────────────────────────────────────
  var _pgTimers = []
  function _clearAllTimers() {
    _pgTimers.forEach(function (t) { clearInterval(t) })
    _pgTimers = []
  }

  function bind(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return
    _clearAllTimers()
    var roots = rootEl.querySelectorAll('[data-pg-root]')
    roots.forEach(function (root) {
      var slides = root.querySelectorAll('[data-pg-slide]')
      var dots   = root.querySelectorAll('.blk-pg-dot')
      var total  = slides.length
      if (total < 2) return

      var on   = root.getAttribute('data-autoplay-slides') === '1'
      var ms   = (parseInt(root.getAttribute('data-slides-interval'), 10) || 4) * 1000
      var cur  = 0

      function goTo(idx) {
        if (idx === cur) return
        var prev = slides[cur]
        var next = slides[idx]
        prev.style.opacity = '0'
        setTimeout(function () {
          prev.style.display = 'none'
          next.style.display = 'flex'
          void next.offsetWidth
          next.style.opacity = '1'
          cur = idx
        }, 800)
        dots.forEach(function (d, di) { d.classList.toggle('active', di === idx) })
      }

      var timer = null
      function start() {
        if (!on) return
        if (timer) clearInterval(timer)
        timer = setInterval(function () { goTo((cur + 1) % total) }, ms)
        _pgTimers.push(timer)
      }
      start()

      dots.forEach(function (d, di) {
        d.addEventListener('click', function () {
          if (di === cur) return
          if (timer) clearInterval(timer)
          goTo(di)
          start()
        })
      })

      // Pausa no hover desktop
      root.addEventListener('mouseenter', function () { if (timer) { clearInterval(timer); timer = null } })
      root.addEventListener('mouseleave', function () { start() })
    })
  }

  window.LPBBlockPhotoGallery = Object.freeze({ render: render, bind: bind })
})()
