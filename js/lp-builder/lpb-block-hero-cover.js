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
    var oAlpha    = (oStrength / 100).toFixed(2)

    // Gradiente bottom (default — escurece base pra texto sentar)
    var overlayStyle = ''
    if (overlay === 'gradient-bottom') {
      overlayStyle = 'background:linear-gradient(to bottom,' +
        'rgba(44,44,44,0) 0%,' +
        'rgba(44,44,44,0) 25%,' +
        'rgba(44,44,44,' + (oAlpha * 0.25).toFixed(2) + ') 45%,' +
        'rgba(44,44,44,' + (oAlpha * 0.6).toFixed(2)  + ') 65%,' +
        'rgba(44,44,44,' + oAlpha + ') 100%' +
      ');'
    } else if (overlay === 'gradient-top') {
      overlayStyle = 'background:linear-gradient(to top,' +
        'rgba(44,44,44,0) 0%,' +
        'rgba(44,44,44,0) 30%,' +
        'rgba(44,44,44,' + (oAlpha * 0.5).toFixed(2) + ') 70%,' +
        'rgba(44,44,44,' + oAlpha + ') 100%' +
      ');'
    } else if (overlay === 'full-dim') {
      overlayStyle = 'background:rgba(44,44,44,' + oAlpha + ');'
    }

    var html = '<section class="blk-hc ' + aspectClass + '" data-color="' + _esc(color) + '" data-align="' + _esc(align) + '"' +
               ' style="' + styleVars + aspectStyle + '">' +
      // Imagem fundo
      (p.image_url
        ? '<img class="blk-hc-img" src="' + _esc(p.image_url) + '" alt="" fetchpriority="high" decoding="async">'
        : '<div class="blk-hc-img-placeholder">Foto de fundo · adicione no inspector</div>') +
      // Overlay
      (overlayStyle ? '<div class="blk-hc-overlay" style="' + overlayStyle + '"></div>' : '') +
      // Texto
      '<div class="blk-hc-text" data-hc-text>' +
        (p.eyebrow    ? '<div class="blk-hc-eyebrow">'    + _esc(p.eyebrow) + '</div>' : '') +
        (p.headline   ? '<h1 class="blk-hc-headline">'    + _multiline(p.headline) + '</h1>' : '') +
        (p.subheadline? '<p class="blk-hc-subheadline">'  + _multiline(p.subheadline) + '</p>' : '') +
        (p.cta_label
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
