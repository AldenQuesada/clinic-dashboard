/**
 * LP Builder · Block Render: before-after-reveal (Onda 30)
 *
 * Slider lateral antes/depois (linha vertical central + handle arrastavel).
 * Inspirado no fm-compare.js (Face Mapping).
 *
 * - Foto BEFORE em baixo (visivel)
 * - Foto AFTER em cima com clip-path inset(0 0 0 X%)
 * - Linha + handle na posicao X%
 * - Drag mouse / touch atualiza X em tempo real
 *
 *   LPBBlockBaReveal.render(block) → string HTML
 *   (drag + bind ficam em LPBBaRevealRuntime · lpb-ba-reveal-runtime.js)
 */
;(function () {
  'use strict'
  if (window.LPBBlockBaReveal) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // Maps tamanho · espelho do BA-carousel
  var SIZE_EYEBROW = { sm: '8px',  md: '9px',  lg: '11px', xl: '13px' }
  var SIZE_TITULO  = { sm: '18px', md: '24px', lg: '32px', xl: '40px' }
  var SIZE_LABEL   = { sm: '7px',  md: '8px',  lg: '10px', xl: '12px' }
  var SIZE_PROC    = { sm: '13px', md: '15px', lg: '18px', xl: '22px' }
  var SIZE_DETAIL  = { sm: '10px', md: '11px', lg: '13px', xl: '15px' }
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

  function _imgOrPlaceholder(url, alt, fallback, transformStyle) {
    if (url) {
      var styleAttr = transformStyle ? ' style="' + transformStyle + '"' : ''
      return '<img src="' + _esc(url) + '" alt="' + _esc(alt) + '" loading="lazy" decoding="async" draggable="false"' + styleAttr + '>'
    }
    return '<div class="blk-bars-placeholder">' + _esc(fallback) + '</div>'
  }

  // Renderiza UMA stage (par antes/depois) · usado no loop de slides
  function _renderStage(s, idx, opts) {
    var beforeT = _imgTransform(s.before_zoom, s.before_x, s.before_y, s.before_rot)
    var afterT  = _imgTransform(s.after_zoom,  s.after_x,  s.after_y,  s.after_rot)
    var initialPos = opts.initialPos
    var labelBefore = opts.labelBefore
    var labelAfter  = opts.labelAfter
    var labelBeforeAttr = opts.labelBeforeAttr
    var labelAfterAttr  = opts.labelAfterAttr

    var slideStyle = idx === 0 ? '' : 'display:none;opacity:0'

    var html = '<div class="blk-bars-slide" data-bars-slide="' + idx + '" style="' + slideStyle + '">' +
      '<div class="blk-bars-stage" data-bars-stage data-pos="' + initialPos + '" data-initial-pos="' + initialPos + '">' +
        '<div class="blk-bars-img blk-bars-img-before">' +
          _imgOrPlaceholder(s.before_url, labelBefore, 'Foto antes', beforeT) +
        '</div>' +
        '<div class="blk-bars-img blk-bars-img-after" data-bars-after style="clip-path:inset(0 0 0 ' + initialPos + '%)">' +
          _imgOrPlaceholder(s.after_url, labelAfter, 'Foto depois', afterT) +
        '</div>' +
        '<span class="blk-bars-label blk-bars-label-before"' + labelBeforeAttr + '>' + _esc(labelBefore) + '</span>' +
        '<span class="blk-bars-label blk-bars-label-after"'  + labelAfterAttr  + '>' + _esc(labelAfter)  + '</span>' +
        '<div class="blk-bars-line" data-bars-line style="left:' + initialPos + '%">' +
          '<div class="blk-bars-handle" data-bars-handle aria-label="Arraste pra revelar antes/depois" role="slider" tabindex="0">' +
            '<svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<polyline points="6 2 2 7 6 12"/>' +
            '</svg>' +
            '<svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<polyline points="4 2 8 7 4 12"/>' +
            '</svg>' +
          '</div>' +
        '</div>' +
      '</div>'

    // Per-slide procedure + detail (cada slide pode ter o seu)
    if (s.procedure || s.detail) {
      var procStyle    = _styleStr([_fontSize(SIZE_PROC,   s.procedure_size), _color(s.procedure_color)])
      var detailStyle  = _styleStr([_fontSize(SIZE_DETAIL, s.detail_size),    _color(s.detail_color)])
      html += '<div class="blk-bars-info">' +
        (s.procedure ? '<p class="blk-bars-procedure"' + (procStyle ? ' style="' + procStyle + '"' : '') + '>' + _esc(s.procedure) + '</p>' : '') +
        (s.detail    ? '<p class="blk-bars-detail"'    + (detailStyle ? ' style="' + detailStyle + '"' : '') + '>' + _esc(s.detail)    + '</p>' : '') +
      '</div>'
    }

    html += '</div>'
    return html
  }

  function render(block) {
    var p = (block && block.props) || {}
    var bg          = p.bg || 'graphite'
    var labelBefore = p.label_before || 'Antes'
    var labelAfter  = p.label_after  || 'Depois'
    var initialPos  = parseFloat(p.initial_pos)
    if (isNaN(initialPos) || initialPos < 0 || initialPos > 100) initialPos = 50

    // Styles inline (block-level)
    var eyebrowStyle = _styleStr([_fontSize(SIZE_EYEBROW, p.eyebrow_size), _color(p.eyebrow_color), _padx(p.eyebrow_padx)])
    var tituloStyle  = _styleStr([_fontSize(SIZE_TITULO, p.titulo_size),  _color(p.titulo_color),  _padx(p.titulo_padx)])
    var labelBeforeStyle = _styleStr([_fontSize(SIZE_LABEL, p.label_before_size), _color(p.label_before_color)])
    var labelAfterStyle  = _styleStr([_fontSize(SIZE_LABEL, p.label_after_size),  _color(p.label_after_color)])
    var labelBeforeAttr = labelBeforeStyle ? ' style="' + labelBeforeStyle + '"' : ''
    var labelAfterAttr  = labelAfterStyle  ? ' style="' + labelAfterStyle  + '"' : ''

    // SLIDES · slide 0 = top-level fields · slides[1+] = items do array
    var slide0 = {
      before_url: p.before_url, before_zoom: p.before_zoom, before_x: p.before_x, before_y: p.before_y, before_rot: p.before_rot,
      after_url:  p.after_url,  after_zoom:  p.after_zoom,  after_x:  p.after_x,  after_y:  p.after_y,  after_rot:  p.after_rot,
      procedure:  p.procedure,  procedure_size: p.procedure_size, procedure_color: p.procedure_color,
      detail:     p.detail,     detail_size:    p.detail_size,    detail_color:    p.detail_color,
    }
    var extraSlides = Array.isArray(p.slides) ? p.slides : []
    var slides = [slide0].concat(extraSlides.filter(function (s) { return s && (s.before_url || s.after_url || s.procedure || s.detail) }))
    var hasMulti = slides.length > 1

    // Autoplay opts pro runtime ler via data-attrs
    var autoplayRock = !!p.autoplay_rock
    var rockSpeed    = p.rock_speed     || 'medium'
    var rockRange    = p.rock_range     || 'medium'
    var autoplayCar  = !!p.autoplay_slides && hasMulti
    var slidesIntv   = parseInt(p.slides_interval, 10) || 6

    var rootAttrs =
      ' data-autoplay-rock="' + (autoplayRock ? '1' : '0') + '"' +
      ' data-rock-speed="' + _esc(rockSpeed) + '"' +
      ' data-rock-range="' + _esc(rockRange) + '"' +
      ' data-autoplay-slides="' + (autoplayCar ? '1' : '0') + '"' +
      ' data-slides-interval="' + slidesIntv + '"'

    var html = '<div class="blk-bars" data-bg="' + _esc(bg) + '" data-bars-root' + rootAttrs + '>'

    if (p.eyebrow) html += '<div class="blk-bars-eyebrow"' + (eyebrowStyle ? ' style="' + eyebrowStyle + '"' : '') + '>' + _esc(p.eyebrow) + '</div>'
    if (p.titulo)  html += '<div class="blk-bars-title"'   + (tituloStyle ? ' style="' + tituloStyle + '"'   : '') + '>' + _esc(p.titulo)  + '</div>'

    // Slides empilhados (1 visivel · resto display:none com opacity 0)
    html += '<div class="blk-bars-track" data-bars-track>'
    slides.forEach(function (s, i) {
      html += _renderStage(s, i, {
        initialPos: initialPos,
        labelBefore: labelBefore, labelAfter: labelAfter,
        labelBeforeAttr: labelBeforeAttr, labelAfterAttr: labelAfterAttr,
      })
    })
    html += '</div>'

    // Dots em rombo (so se multi-slide)
    if (hasMulti) {
      html += '<div class="blk-bars-dots" data-bars-dots>'
      slides.forEach(function (_, i) {
        html += '<button type="button" class="blk-bars-dot' + (i === 0 ? ' active' : '') +
                '" data-bars-idx="' + i + '" aria-label="Ir para slide ' + (i + 1) + '"></button>'
      })
      html += '</div>'
    }

    html += '</div>'
    return html
  }

  window.LPBBlockBaReveal = Object.freeze({ render: render })
})()
