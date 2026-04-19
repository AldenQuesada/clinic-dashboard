/**
 * LP Builder · Block Render: location-facade
 *
 * Hero da fachada da clínica — bloco premium estático:
 *   · foto da fachada full-width (aspect 4/5) com transform inline (zoom/x/y/rot)
 *   · gradient overlay no bottom 50% pra texto ficar legível
 *   · título Cormorant Garamond + endereço Montserrat champagne sobre a foto
 *   · grid 2x2 de chips de proximidade abaixo da foto
 *   · 2 botões side-by-side: WhatsApp (champagne sólido) + Maps (ghost champagne)
 *   · placeholder gradient grafite-champagne quando facade_url vazio
 *   · respect prefers-reduced-motion
 *
 *   LPBBlockLocationFacade.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockLocationFacade) return

  function _esc(s) {
    var d = document.createElement('div')
    d.textContent = s == null ? '' : s
    return d.innerHTML
  }

  function _has(v) { return v != null && String(v).trim().length > 0 }

  function _num(v, fb) {
    var n = parseFloat(v)
    return isFinite(n) ? n : fb
  }

  // CSS inline · funciona em iframe E main page (em vez de inject em head do parent)
  var _LPB_CSS_FACADE = null
  function _buildCSS() {
    if (_LPB_CSS_FACADE) return _LPB_CSS_FACADE
    var css = ''
      + '.blk-lf{'
        + 'box-sizing:border-box;'
        + 'width:100%;'
        + 'max-width:480px;'
        + 'margin:0 auto;'
        + 'padding:32px 20px 40px;'
        + 'font-family:"Montserrat","Helvetica Neue",Arial,sans-serif;'
        + 'color:#FEFCF8;'
      + '}'
      + '.blk-lf[data-bg="graphite"]{background:#2C2C2C;color:#FEFCF8}'
      + '.blk-lf[data-bg="ivory"]{background:#FEFCF8;color:#2C2C2C}'
      + '.blk-lf[data-bg="white"]{background:#FFFFFF;color:#2C2C2C}'

      + '.blk-lf-eyebrow{'
        + 'font-size:9px;'
        + 'font-weight:600;'
        + 'letter-spacing:.25em;'
        + 'text-transform:uppercase;'
        + 'color:#C8A97E;'
        + 'margin:0 0 14px;'
        + 'text-align:center;'
      + '}'

      + '.blk-lf-photo{'
        + 'position:relative;'
        + 'width:100%;'
        + 'max-width:var(--lp-photo-card-max-width,380px);'
        + 'aspect-ratio:var(--lp-photo-card-aspect,4/5);'
        + 'margin:0 auto 18px;'
        + 'overflow:hidden;'
        + 'border-radius:14px;'
        + 'background:linear-gradient(135deg,#2C2C2C 0%,#3a3530 50%,#C8A97E 100%);'
        + 'box-shadow:0 18px 48px rgba(0,0,0,.35);'
      + '}'
      + '.blk-lf-photo-img{'
        + 'position:absolute;'
        + 'inset:0;'
        + 'width:100%;'
        + 'height:100%;'
        + 'object-fit:cover;'
        + 'transform-origin:center;'
        + 'display:block;'
      + '}'
      + '.blk-lf-photo-placeholder{'
        + 'position:absolute;'
        + 'inset:0;'
        + 'display:flex;'
        + 'align-items:center;'
        + 'justify-content:center;'
        + 'font-family:"Montserrat",sans-serif;'
        + 'font-size:11px;'
        + 'font-weight:600;'
        + 'letter-spacing:.3em;'
        + 'text-transform:uppercase;'
        + 'color:rgba(254,252,248,.85);'
        + 'text-align:center;'
        + 'padding:24px;'
      + '}'
      + '.blk-lf-photo-overlay{'
        + 'position:absolute;'
        + 'left:0;right:0;bottom:0;'
        + 'height:50%;'
        + 'background:linear-gradient(to bottom,rgba(0,0,0,0) 0%,rgba(0,0,0,.45) 55%,rgba(0,0,0,.78) 100%);'
        + 'pointer-events:none;'
      + '}'
      + '.blk-lf-photo-text{'
        + 'position:absolute;'
        + 'left:20px;'
        + 'right:20px;'
        + 'bottom:18px;'
        + 'z-index:2;'
        + 'pointer-events:none;'
      + '}'
      + '.blk-lf-photo-title{'
        + 'margin:0 0 6px;'
        + 'font-family:"Cormorant Garamond","Playfair Display",Georgia,serif;'
        + 'font-weight:300;'
        + 'font-size:28px;'
        + 'line-height:1.1;'
        + 'color:#FEFCF8;'
        + 'letter-spacing:.01em;'
        + 'text-shadow:0 2px 12px rgba(0,0,0,.5);'
      + '}'
      + '.blk-lf-photo-address{'
        + 'display:inline-flex;'
        + 'align-items:center;'
        + 'gap:6px;'
        + 'font-family:"Montserrat",sans-serif;'
        + 'font-size:11px;'
        + 'font-weight:500;'
        + 'letter-spacing:.04em;'
        + 'color:#C8A97E;'
        + 'text-shadow:0 1px 6px rgba(0,0,0,.55);'
      + '}'
      + '.blk-lf-photo-address svg{flex:0 0 auto}'

      + '.blk-lf-chips{'
        + 'display:grid;'
        + 'grid-template-columns:1fr 1fr;'
        + 'gap:8px;'
        + 'max-width:var(--lp-photo-card-max-width,380px);'
        + 'margin:0 auto 18px;'
      + '}'
      + '.blk-lf-chip{'
        + 'display:flex;'
        + 'align-items:center;'
        + 'gap:8px;'
        + 'padding:10px 12px;'
        + 'border:1px solid rgba(200,169,126,.25);'
        + 'border-radius:10px;'
        + 'background:rgba(200,169,126,.06);'
        + 'font-size:11px;'
        + 'font-weight:500;'
        + 'letter-spacing:.02em;'
        + 'line-height:1.3;'
        + 'color:inherit;'
        + 'transition:transform .25s ease,border-color .25s ease,background .25s ease;'
      + '}'
      + '.blk-lf-chip-dot{'
        + 'flex:0 0 4px;'
        + 'width:4px;height:4px;'
        + 'border-radius:50%;'
        + 'background:#C8A97E;'
      + '}'
      + '.blk-lf-chip:hover{'
        + 'transform:translateY(-1px);'
        + 'border-color:rgba(200,169,126,.55);'
        + 'background:rgba(200,169,126,.12);'
      + '}'

      + '.blk-lf-actions{'
        + 'display:grid;'
        + 'grid-template-columns:1fr 1fr;'
        + 'gap:10px;'
        + 'max-width:var(--lp-photo-card-max-width,380px);'
        + 'margin:0 auto;'
      + '}'
      + '.blk-lf-btn{'
        + 'display:inline-flex;'
        + 'align-items:center;'
        + 'justify-content:center;'
        + 'gap:8px;'
        + 'padding:13px 14px;'
        + 'border-radius:10px;'
        + 'font-family:"Montserrat",sans-serif;'
        + 'font-size:12px;'
        + 'font-weight:600;'
        + 'letter-spacing:.06em;'
        + 'text-transform:uppercase;'
        + 'text-decoration:none;'
        + 'line-height:1;'
        + 'cursor:pointer;'
        + 'transition:transform .22s ease,background .22s ease,color .22s ease,border-color .22s ease;'
        + 'border:1px solid transparent;'
      + '}'
      + '.blk-lf-btn-primary{'
        + 'background:#C8A97E;'
        + 'color:#2C2C2C;'
        + 'border-color:#C8A97E;'
      + '}'
      + '.blk-lf-btn-primary:hover{transform:scale(1.02);background:#d4b78c;border-color:#d4b78c}'
      + '.blk-lf-btn-ghost{'
        + 'background:transparent;'
        + 'color:#C8A97E;'
        + 'border-color:#C8A97E;'
      + '}'
      + '.blk-lf-btn-ghost:hover{background:#C8A97E;color:#2C2C2C}'
      + '.blk-lf-btn svg{flex:0 0 auto}'

      + '@media (prefers-reduced-motion:reduce){'
        + '.blk-lf-chip,.blk-lf-btn{transition:none}'
        + '.blk-lf-chip:hover,.blk-lf-btn-primary:hover{transform:none}'
      + '}'

    _LPB_CSS_FACADE = css
    return css
  }

  // SVG Feather-style 14x14 stroke 1.5
  function _svgMapPin(size) {
    var sz = size || 14
    return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" '
      + 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>'
      + '<circle cx="12" cy="10" r="3"/>'
      + '</svg>'
  }
  function _svgMessageCircle(size) {
    var sz = size || 14
    return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" '
      + 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'
      + '</svg>'
  }

  function _photoTransform(p) {
    var z   = _num(p.facade_zoom, 1)
    var x   = _num(p.facade_x, 0)
    var y   = _num(p.facade_y, 0)
    var rot = _num(p.facade_rot, 0)
    // formato: rotate -> scale -> translate (translate em % do próprio elemento)
    return 'transform:rotate(' + rot + 'deg) scale(' + z + ') translate(' + x + '%, ' + y + '%);transform-origin:center;'
  }

  function render(block) {
    var _styleTag = '<style data-lpb-style="location-facade">' + _buildCSS() + '</style>'

    var p = (block && block.props) || {}

    var bg              = p.bg || 'graphite'
    var eyebrow         = _has(p.eyebrow) ? p.eyebrow : 'LOCALIZAÇÃO'
    var titulo          = _has(p.titulo) ? p.titulo : 'Onde nos encontrar'
    var facadeUrl       = _has(p.facade_url) ? p.facade_url : ''
    var address         = _has(p.address) ? p.address : 'Av. Brasil, 4242 — Maringá/PR'
    var chip1           = _has(p.chip_1) ? p.chip_1 : '8 min do Shopping'
    var chip2           = _has(p.chip_2) ? p.chip_2 : '12 min do Aeroporto'
    var chip3           = _has(p.chip_3) ? p.chip_3 : '5 min do Centro'
    var chip4           = _has(p.chip_4) ? p.chip_4 : 'Estacionamento próprio'
    var whatsappUrl     = _has(p.whatsapp_url) ? p.whatsapp_url : 'https://wa.me/5544999999999'
    var whatsappLabel   = _has(p.whatsapp_label) ? p.whatsapp_label : 'Falar no WhatsApp'
    var mapsUrl         = _has(p.maps_url) ? p.maps_url : 'https://maps.google.com/?q=Clinica+Mirian+Paula'
    var mapsLabel       = _has(p.maps_label) ? p.maps_label : 'Como chegar'

    var photoTransform = _photoTransform(p)

    var photoInner = facadeUrl
      ? '<img class="blk-lf-photo-img" src="' + _esc(facadeUrl) + '" alt="' + _esc(titulo) + '" '
          + 'loading="lazy" decoding="async" style="' + photoTransform + '">'
      : '<div class="blk-lf-photo-placeholder">FOTO DA FACHADA</div>'

    var chipHtml = function (label) {
      return '<div class="blk-lf-chip">'
        + '<span class="blk-lf-chip-dot" aria-hidden="true"></span>'
        + '<span class="blk-lf-chip-label">' + _esc(label) + '</span>'
        + '</div>'
    }

    var html = ''
      + '<section class="blk-lf" data-bg="' + _esc(bg) + '">'
        + (_has(eyebrow) ? '<div class="blk-lf-eyebrow">' + _esc(eyebrow) + '</div>' : '')

        + '<div class="blk-lf-photo">'
          + photoInner
          + '<div class="blk-lf-photo-overlay" aria-hidden="true"></div>'
          + '<div class="blk-lf-photo-text">'
            + '<h2 class="blk-lf-photo-title">' + _esc(titulo) + '</h2>'
            + (_has(address)
              ? '<div class="blk-lf-photo-address">' + _svgMapPin(12) + '<span>' + _esc(address) + '</span></div>'
              : '')
          + '</div>'
        + '</div>'

        + '<div class="blk-lf-chips">'
          + chipHtml(chip1)
          + chipHtml(chip2)
          + chipHtml(chip3)
          + chipHtml(chip4)
        + '</div>'

        + '<div class="blk-lf-actions">'
          + '<a class="blk-lf-btn blk-lf-btn-primary" href="' + _esc(whatsappUrl) + '" '
            + 'target="_blank" rel="noopener noreferrer">'
            + _svgMessageCircle(14)
            + '<span>' + _esc(whatsappLabel) + '</span>'
          + '</a>'
          + '<a class="blk-lf-btn blk-lf-btn-ghost" href="' + _esc(mapsUrl) + '" '
            + 'target="_blank" rel="noopener noreferrer">'
            + _svgMapPin(14)
            + '<span>' + _esc(mapsLabel) + '</span>'
          + '</a>'
        + '</div>'
      + '</section>'

    return _styleTag + html
  }

  window.LPBBlockLocationFacade = Object.freeze({ render: render })
})()
