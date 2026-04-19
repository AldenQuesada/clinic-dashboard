/**
 * LP Builder · Block Render: hero-cover (Onda 28 · capa de revista)
 *
 * Hero full-bleed com:
 *   · foto absolute cobrindo 100% (object-fit:cover)
 *   · overlay configurável (gradient-bottom · gradient-top · full-dim · none)
 *   · texto sobreposto: eyebrow + headline + subheadline + CTA opcional
 *   · posição Y configurável (independente desktop/mobile)
 *   · alinhamento horizontal: left/center/right
 *   · cor: light (foto escura) ou dark (foto clara)
 *
 * O drag-to-position acontece em módulo separado (lpb-hero-cover-drag.js)
 * só no canvas admin. Esse renderer é puro.
 *
 *   LPBBlockHeroCover.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockHeroCover) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function _multiline(s) {
    return _esc(s).replace(/\n/g, '<br>')
  }

  function render(block) {
    var p = (block && block.props) || {}
    var aspect      = p.aspect || '4/5'
    var yDesk       = parseFloat(p.text_y_pct) || 78
    var yMob        = parseFloat(p.text_y_pct_mobile) || 78
    var align       = p.text_align || 'center'
    var color       = p.text_color || 'light'
    var overlay     = p.overlay || 'gradient-bottom'
    var oStrength   = parseFloat(p.overlay_strength) || 70
    var aspectClass = aspect === '100vh' ? 'is-vh' : ''
    var aspectStyle = aspect === '100vh' ? '' : 'aspect-ratio:' + _esc(aspect) + ';'

    // CSS variável p/ posição Y (cobertor pra desktop/mobile via media query)
    var styleVars = '--hc-y-desk:' + yDesk + '%; --hc-y-mob:' + yMob + '%;'

    // Curva do overlay: até 100 = curva normal · acima de 100 = curva agressiva
    // que escurece mais cedo na foto (overflow vira intensidade adicional)
    var oRaw   = oStrength            // 30-150
    var oAlpha = Math.min(1, oRaw / 100).toFixed(2)  // alpha base capado em 1.0
    var aggro  = Math.max(0, (oRaw - 100) / 50)      // 0 quando ≤100, 1 quando =150
    function _mix(a, b, t) { return (a + (b - a) * t).toFixed(2) }

    // Gradiente bottom (default — escurece base pra texto sentar)
    var overlayStyle = ''
    if (overlay === 'gradient-bottom') {
      // Pontos de parada · com aggro sobe os stops pra cima e aumenta os alphas intermediários
      var s1 = _mix(25, 5, aggro)       // 25% → 5% (gradient começa mais alto)
      var s2 = _mix(45, 25, aggro)
      var s3 = _mix(65, 50, aggro)
      var a1 = _mix(0,  oAlpha * 0.5, aggro)
      var a2 = _mix(oAlpha * 0.25, oAlpha * 0.75, aggro)
      var a3 = _mix(oAlpha * 0.6,  oAlpha * 0.92, aggro)
      overlayStyle = 'background:linear-gradient(to bottom,' +
        'rgba(44,44,44,0) 0%,' +
        'rgba(44,44,44,' + a1 + ') ' + s1 + '%,' +
        'rgba(44,44,44,' + a2 + ') ' + s2 + '%,' +
        'rgba(44,44,44,' + a3 + ') ' + s3 + '%,' +
        'rgba(44,44,44,' + oAlpha + ') 100%' +
      ');'
    } else if (overlay === 'gradient-top') {
      var ts1 = _mix(30, 10, aggro)
      var ts2 = _mix(70, 50, aggro)
      var ta1 = _mix(0, oAlpha * 0.4, aggro)
      var ta2 = _mix(oAlpha * 0.5, oAlpha * 0.85, aggro)
      overlayStyle = 'background:linear-gradient(to top,' +
        'rgba(44,44,44,0) 0%,' +
        'rgba(44,44,44,' + ta1 + ') ' + ts1 + '%,' +
        'rgba(44,44,44,' + ta2 + ') ' + ts2 + '%,' +
        'rgba(44,44,44,' + oAlpha + ') 100%' +
      ');'
    } else if (overlay === 'full-dim') {
      overlayStyle = 'background:rgba(44,44,44,' + oAlpha + ');'
    }

    // Sizes por elemento (data-attr · CSS pega)
    var ebSize  = p.eyebrow_size     || 'md'
    var hlSize  = p.headline_size    || 'md'
    var shSize  = p.subheadline_size || 'md'

    // Cores custom (style inline · só se preenchido)
    function colorStyle(hex) {
      return (hex && /^#[0-9a-f]{3,8}$/i.test(hex)) ? ' style="color:' + _esc(hex) + '"' : ''
    }

    // Verifica conteúdo NÃO-VAZIO de forma estrita (trim · evita whitespace fantasma)
    function _has(v) { return v != null && String(v).trim().length > 0 }

    var html = '<section class="blk-hc ' + aspectClass + '" data-color="' + _esc(color) + '" data-align="' + _esc(align) + '"' +
               ' style="' + styleVars + aspectStyle + '">' +
      (p.image_url
        ? '<img class="blk-hc-img" src="' + _esc(p.image_url) + '" alt="" fetchpriority="high" decoding="async">'
        : '<div class="blk-hc-img-placeholder">Foto de fundo · adicione no inspector</div>') +
      (overlayStyle ? '<div class="blk-hc-overlay" style="' + overlayStyle + '"></div>' : '') +
      '<div class="blk-hc-text" data-hc-text>' +
        (_has(p.eyebrow)
          ? '<div class="blk-hc-eyebrow" data-size="' + _esc(ebSize) + '"' + colorStyle(p.eyebrow_color) + '>' + _esc(p.eyebrow) + '</div>'
          : '') +
        (_has(p.headline)
          ? '<h1 class="blk-hc-headline" data-size="' + _esc(hlSize) + '"' + colorStyle(p.headline_color) + '>' + _multiline(p.headline) + '</h1>'
          : '') +
        (_has(p.subheadline)
          ? '<p class="blk-hc-subheadline" data-size="' + _esc(shSize) + '"' + colorStyle(p.subheadline_color) + '>' + _multiline(p.subheadline) + '</p>'
          : '') +
        (_has(p.cta_label)
          ? '<a class="blk-hc-cta" href="' + _esc(p.cta_url || '#') + '"' +
              (/^https?:\/\//.test(p.cta_url || '') ? ' target="_blank" rel="noopener"' : '') + '>' +
              _esc(p.cta_label) +
            '</a>'
          : '') +
      '</div>' +
    '</section>'

    return html
  }

  window.LPBBlockHeroCover = Object.freeze({ render: render })
})()
