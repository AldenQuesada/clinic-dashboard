/**
 * LP Builder · Block: location-map (Onda 31 · v2 com gallery carousel)
 *
 * Mapa imersivo styled em paleta champagne · pin pulsante + card flutuante.
 * Pure SVG faux-map (zero dependencias externas · sem Mapbox/Leaflet).
 *
 * v2 · CSS INLINE no HTML (funciona em iframe E main page) +
 *       gallery_photos carousel pequeno top-right (autoplay fade · tap → lightbox)
 *
 *   LPBBlockLocationMap.render(block) → string HTML
 *   LPBBlockLocationMap.bind(rootEl)  → ativa status dinamico + gallery
 */
;(function () {
  'use strict'
  if (window.LPBBlockLocationMap) return

  function _esc(s) {
    var d = document.createElement('div')
    d.textContent = s == null ? '' : s
    return d.innerHTML
  }

  // Maps de tamanho · espelho do BA-carousel pra consistencia
  var SIZE_EYEBROW = { sm: '8px',  md: '9px',  lg: '11px', xl: '13px' }
  var SIZE_TITULO  = { sm: '18px', md: '24px', lg: '32px', xl: '40px' }
  var SIZE_ADDR    = { sm: '14px', md: '18px', lg: '22px', xl: '26px' }
  var SIZE_SMALL   = { sm: '9px',  md: '11px', lg: '13px', xl: '15px' }
  var SIZE_BTN     = { sm: '9px',  md: '10px', lg: '12px', xl: '14px' }
  var PADX_MAP     = { '0': '0', sm: '0.5rem', md: '1.5rem', lg: '2.5rem', xl: '4rem' }
  function _styleStr(parts) { return parts.filter(Boolean).join(';') }
  function _fontSize(map, v) { var px = map[v || 'md']; return px ? 'font-size:' + px : '' }
  function _colorRule(v) { return v ? 'color:' + v : '' }
  function _padxRule(v)  { var px = PADX_MAP[v || 'md']; return px != null ? 'padding-left:' + px + ';padding-right:' + px : '' }
  function _attrIfStyle(s) { return s ? ' style="' + s + '"' : '' }

  // ──────────────────────────────────────────────────────────
  // CSS · INLINE com HTML (funciona em qualquer document/iframe)
  // ──────────────────────────────────────────────────────────
  var CSS = [
    '.blk-locmap{padding:2.5rem 0 2rem;max-width:480px;margin:0 auto;background:#2C2C2C}',
    '.blk-locmap[data-bg="ivory"]{background:#FEFCF8}',
    '.blk-locmap[data-bg="white"]{background:#FFFFFF}',
    '.blk-locmap-eyebrow{font-family:Montserrat,sans-serif;font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:#C8A97E;font-weight:500;text-align:center;padding:0 1.5rem;margin-bottom:.5rem}',
    '.blk-locmap-title{font-family:"Cormorant Garamond",serif;font-size:24px;font-weight:300;text-align:center;color:#FEFCF8;padding:0 1.5rem;margin-bottom:1.25rem}',
    '.blk-locmap[data-bg="ivory"] .blk-locmap-title,.blk-locmap[data-bg="white"] .blk-locmap-title{color:#2C2C2C}',
    '.blk-locmap-stage{position:relative;width:100%;max-width:var(--lp-photo-card-max-width,380px);aspect-ratio:var(--lp-photo-card-aspect,4/5);margin:0 auto;overflow:hidden;border-radius:6px;background:#1f1f1f;box-shadow:0 12px 40px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.15)}',
    '.blk-locmap[data-bg="ivory"] .blk-locmap-stage,.blk-locmap[data-bg="white"] .blk-locmap-stage{box-shadow:0 12px 32px rgba(44,44,44,.12),0 2px 6px rgba(44,44,44,.06)}',
    '.blk-locmap-bg{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.blk-locmap-pin{position:absolute;top:42%;left:50%;transform:translate(-50%,-100%);width:48px;height:48px;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5}',
    '.blk-locmap-pin-dot{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;background:#C8A97E;border-radius:50%;border:3px solid rgba(254,252,248,.95);box-shadow:0 4px 12px rgba(0,0,0,.4),0 0 24px rgba(200,169,126,.6);z-index:3}',
    '.blk-locmap-pin-icon{position:absolute;top:50%;left:50%;transform:translate(-50%,-58%);color:#2C2C2C;z-index:4}',
    '.blk-locmap-ripple{position:absolute;top:50%;left:50%;width:14px;height:14px;border-radius:50%;border:2px solid rgba(200,169,126,.6);transform:translate(-50%,-50%);opacity:0;animation:blk-locmap-ripple 2.4s ease-out infinite;z-index:2}',
    '.blk-locmap-ripple-2{animation-delay:1.2s}',
    '@keyframes blk-locmap-ripple{0%{width:14px;height:14px;opacity:.7}100%{width:120px;height:120px;opacity:0}}',
    '@media(prefers-reduced-motion:reduce){.blk-locmap-ripple{animation:none;display:none}}',
    '.blk-locmap-card{position:absolute;left:14px;right:14px;bottom:14px;padding:14px 16px;background:rgba(28,28,28,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(200,169,126,.25);border-radius:5px;color:#FEFCF8;z-index:6}',
    '.blk-locmap[data-bg="ivory"] .blk-locmap-card,.blk-locmap[data-bg="white"] .blk-locmap-card{background:rgba(254,252,248,.92);color:#2C2C2C;border-color:rgba(200,169,126,.5)}',
    '.blk-locmap-status{display:inline-flex;align-items:center;gap:6px;font-family:Montserrat,sans-serif;font-size:9px;letter-spacing:.18em;text-transform:uppercase;font-weight:600;padding:3px 9px;border-radius:2px;margin-bottom:8px}',
    '.blk-locmap-status[data-open="1"]{background:rgba(22,163,74,.18);color:#4ADE80;border:1px solid rgba(22,163,74,.4)}',
    '.blk-locmap-status[data-open="0"]{background:rgba(110,110,118,.2);color:#A0A0A8;border:1px solid rgba(110,110,118,.4)}',
    '.blk-locmap-status-dot{width:6px;height:6px;border-radius:50%;background:currentColor;animation:blk-locmap-pulse 1.6s ease-in-out infinite}',
    '@keyframes blk-locmap-pulse{0%,100%{opacity:1}50%{opacity:.4}}',
    '@media(prefers-reduced-motion:reduce){.blk-locmap-status-dot{animation:none}}',
    '.blk-locmap-address{font-family:"Cormorant Garamond",serif;font-size:18px;font-weight:400;line-height:1.2;margin:0 0 2px}',
    '.blk-locmap-city{font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:.06em;color:rgba(254,252,248,.6);margin:0}',
    '.blk-locmap[data-bg="ivory"] .blk-locmap-city,.blk-locmap[data-bg="white"] .blk-locmap-city{color:rgba(44,44,44,.55)}',
    '.blk-locmap-hours{font-family:Montserrat,sans-serif;font-size:10px;color:rgba(254,252,248,.55);margin:6px 0 0;letter-spacing:.04em}',
    '.blk-locmap[data-bg="ivory"] .blk-locmap-hours,.blk-locmap[data-bg="white"] .blk-locmap-hours{color:rgba(44,44,44,.5)}',
    '.blk-locmap-actions{display:flex;gap:8px;padding:1rem 1.25rem 0;flex-wrap:wrap}',
    '.blk-locmap-btn{flex:1;min-width:90px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 12px;font-family:Montserrat,sans-serif;font-size:10px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;border-radius:3px;transition:all .2s cubic-bezier(.4,0,.2,1)}',
    '.blk-locmap-btn-primary{background:#C8A97E;color:#2C2C2C;border:1px solid #C8A97E}',
    '.blk-locmap-btn-primary:hover{background:#B89B70;transform:translateY(-1px);box-shadow:0 6px 16px rgba(200,169,126,.3)}',
    '.blk-locmap-btn-ghost{background:transparent;color:#C8A97E;border:1px solid rgba(200,169,126,.5)}',
    '.blk-locmap-btn-ghost:hover{background:rgba(200,169,126,.1);border-color:#C8A97E}',
    '.blk-locmap[data-bg="ivory"] .blk-locmap-btn-ghost,.blk-locmap[data-bg="white"] .blk-locmap-btn-ghost{color:#A8895E;border-color:rgba(168,137,94,.5)}',
    '@media(prefers-reduced-motion:reduce){.blk-locmap-btn:hover{transform:none}}',

    // Gallery carousel · top-right pequeno (Polaroid champagne)
    '.blk-locmap-gallery{position:absolute;width:36%;aspect-ratio:1/1;overflow:hidden;border-radius:4px;border:3px solid #FEFCF8;box-shadow:0 6px 16px rgba(0,0,0,.45),0 0 0 1px rgba(200,169,126,.3);cursor:pointer;z-index:7;transition:transform .25s ease}',
    '.blk-locmap-gallery:hover{transform:scale(1.04)}',
    '.blk-locmap-gallery[data-pos="top-right"]{top:14px;right:14px}',
    '.blk-locmap-gallery[data-pos="top-left"]{top:14px;left:14px}',
    '.blk-locmap-gallery[data-pos="bottom-right"]{bottom:14px;right:14px}',
    '.blk-locmap-gallery[data-pos="bottom-left"]{bottom:14px;left:14px}',
    '.blk-locmap-gallery img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity 800ms cubic-bezier(.4,0,.2,1);pointer-events:none}',
    '.blk-locmap-gallery img:not(.is-active){opacity:0}',
    '.blk-locmap-gallery img.is-active{opacity:1}',
    '.blk-locmap-gallery-tag{position:absolute;left:6px;bottom:6px;padding:2px 6px;font-family:Montserrat,sans-serif;font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:#FEFCF8;background:rgba(28,28,28,.7);border-radius:2px;pointer-events:none;z-index:2}',
    '@media(prefers-reduced-motion:reduce){.blk-locmap-gallery:hover{transform:none}.blk-locmap-gallery img{transition:none}}',

    // Lightbox modal (fullscreen swipe · ao tap na gallery)
    '.blk-locmap-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;animation:blk-locmap-fadein .25s ease-out;cursor:pointer}',
    '@keyframes blk-locmap-fadein{from{opacity:0}to{opacity:1}}',
    '.blk-locmap-lightbox img{max-width:100%;max-height:100%;object-fit:contain;cursor:default;box-shadow:0 24px 60px rgba(0,0,0,.6);border-radius:4px}',
    '.blk-locmap-lightbox-close{position:absolute;top:16px;right:20px;background:transparent;border:0;color:#FEFCF8;font-size:32px;cursor:pointer;line-height:1;width:40px;height:40px;display:flex;align-items:center;justify-content:center}',
    '.blk-locmap-lightbox-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(28,28,28,.6);border:1px solid rgba(200,169,126,.4);color:#C8A97E;width:44px;height:44px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1}',
    '.blk-locmap-lightbox-nav:hover{background:rgba(28,28,28,.9);color:#FEFCF8}',
    '.blk-locmap-lightbox-prev{left:16px}',
    '.blk-locmap-lightbox-next{right:16px}',
    '.blk-locmap-lightbox-counter{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(254,252,248,.6)}',
  ].join('\n')

  // ──────────────────────────────────────────────────────────
  // Faux-map SVG
  // ──────────────────────────────────────────────────────────
  function _fauxMapSvg() {
    return '<svg class="blk-locmap-bg" viewBox="0 0 380 475" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><radialGradient id="locmap-bg" cx="50%" cy="42%" r="65%"><stop offset="0%" stop-color="#2A2A2D"/><stop offset="100%" stop-color="#1A1A1C"/></radialGradient></defs>' +
      '<rect width="380" height="475" fill="url(#locmap-bg)"/>' +
      '<path d="M30,300 Q60,280 100,310 Q120,340 90,380 Q50,400 20,360 Z" fill="rgba(74,90,60,.25)" stroke="rgba(74,90,60,.4)" stroke-width=".5"/>' +
      '<path d="M280,80 Q320,70 350,100 Q360,140 330,160 Q290,150 270,120 Z" fill="rgba(74,90,60,.22)" stroke="rgba(74,90,60,.35)" stroke-width=".5"/>' +
      '<g stroke="rgba(200,169,126,.35)" stroke-width="3" fill="none" stroke-linecap="round">' +
        '<path d="M0,200 Q120,180 200,200 Q280,220 380,200"/>' +
        '<path d="M190,0 Q200,120 195,200 Q190,280 200,475"/>' +
      '</g>' +
      '<g stroke="rgba(200,169,126,.18)" stroke-width="1.5" fill="none" stroke-linecap="round">' +
        '<path d="M0,80 Q100,95 200,85 Q300,75 380,90"/>' +
        '<path d="M0,320 Q120,310 200,330 Q280,350 380,330"/>' +
        '<path d="M0,400 Q120,395 200,410 Q280,420 380,400"/>' +
        '<path d="M80,0 Q88,120 80,200 Q70,300 85,475"/>' +
        '<path d="M300,0 Q310,120 305,200 Q300,300 310,475"/>' +
      '</g>' +
      '<g stroke="rgba(200,169,126,.08)" stroke-width="1" fill="none" stroke-linecap="round">' +
        '<path d="M0,140 L380,150"/><path d="M0,250 L380,260"/><path d="M0,440 L380,440"/>' +
        '<path d="M40,0 L42,475"/><path d="M140,0 L142,475"/><path d="M240,0 L242,475"/><path d="M340,0 L342,475"/>' +
      '</g>' +
      '<g fill="rgba(200,169,126,.1)">' +
        '<circle cx="50" cy="60" r="2"/><circle cx="130" cy="40" r="1.5"/><circle cx="260" cy="50" r="2"/>' +
        '<circle cx="60" cy="170" r="1.5"/><circle cx="160" cy="155" r="1"/><circle cx="320" cy="180" r="1.5"/>' +
        '<circle cx="50" cy="280" r="1"/><circle cx="160" cy="280" r="2"/><circle cx="270" cy="290" r="1.5"/>' +
      '</g>' +
    '</svg>'
  }

  var ICON_WA  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
  var ICON_MAP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
  var ICON_NAV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>'

  function _isOpenNow(now) {
    now = now || new Date()
    var dow = now.getDay()
    var hour = now.getHours() + now.getMinutes() / 60
    if (dow === 0) return false
    if (dow === 6) return hour >= 8 && hour < 14
    return hour >= 8 && hour < 20
  }

  // Render do carousel pequeno se houver gallery_photos
  function _renderGallery(photos, position, tag) {
    if (!photos || !photos.length) return ''
    var imgsHtml = photos.map(function (url, i) {
      return '<img src="' + _esc(url) + '" alt="Foto ' + (i + 1) + '" loading="lazy" decoding="async"' + (i === 0 ? ' class="is-active"' : '') + '>'
    }).join('')
    var tagHtml = tag ? '<span class="blk-locmap-gallery-tag">' + _esc(tag) + '</span>' : ''
    return '<div class="blk-locmap-gallery" data-locmap-gallery data-pos="' + _esc(position) + '" role="button" aria-label="Ver fotos da clínica" tabindex="0">' +
      imgsHtml + tagHtml +
    '</div>'
  }

  function render(block) {
    var p = (block && block.props) || {}
    var bg            = p.bg              || 'graphite'
    var eyebrow       = p.eyebrow         || 'Localização'
    var titulo        = p.titulo          || 'Onde nos encontrar'
    var address       = p.address         || 'Av. Carneiro Leão, 296 · Sala 806'
    var city          = p.city            || 'Maringá / PR · CEP 87014-010'
    var hoursSummary  = p.hours_summary   || 'Seg a Sex 8h-20h · Sáb 8h-14h'
    var showStatus    = p.show_open_status !== false
    var whatsappUrl   = p.whatsapp_url    || 'https://wa.me/5544991622986'
    var whatsappLabel = p.whatsapp_label  || 'WhatsApp'
    var mapsUrl       = p.maps_url        || 'https://maps.app.goo.gl/VCxLkAL6m15JLnaV7'
    var mapsLabel     = p.maps_label      || 'Maps'
    var wazeUrl       = p.waze_url        || 'https://waze.com/ul?q=Av+Carneiro+Leao+296+Maringa'
    var wazeLabel     = p.waze_label      || 'Waze'
    var showWaze      = p.show_waze !== false

    // Gallery · aceita array de strings OU array de objetos {url, caption}
    var galleryPhotos = Array.isArray(p.gallery_photos)
      ? p.gallery_photos.map(function (it) {
          if (typeof it === 'string') return it
          if (it && typeof it === 'object' && it.url) return it.url
          return null
        }).filter(Boolean)
      : []
    var galleryPos    = p.gallery_position || 'top-right'
    var galleryTag    = p.gallery_tag      || 'Conheça'

    var statusHtml = showStatus
      ? '<span class="blk-locmap-status" data-locmap-status data-open="0">' +
          '<span class="blk-locmap-status-dot"></span>' +
          '<span data-locmap-status-text>FECHADO</span>' +
        '</span>'
      : ''

    // Inline styles por texto (size + color + padx onde aplicavel)
    var sEyebrow  = _styleStr([_fontSize(SIZE_EYEBROW, p.eyebrow_size), _colorRule(p.eyebrow_color), _padxRule(p.eyebrow_padx)])
    var sTitulo   = _styleStr([_fontSize(SIZE_TITULO,  p.titulo_size),  _colorRule(p.titulo_color),  _padxRule(p.titulo_padx)])
    var sAddress  = _styleStr([_fontSize(SIZE_ADDR,    p.address_size), _colorRule(p.address_color)])
    var sCity     = _styleStr([_fontSize(SIZE_SMALL,   p.city_size),    _colorRule(p.city_color)])
    var sHours    = _styleStr([_fontSize(SIZE_SMALL,   p.hours_summary_size), _colorRule(p.hours_summary_color)])
    var sBtnWA    = _styleStr([_fontSize(SIZE_BTN,     p.whatsapp_label_size), _colorRule(p.whatsapp_label_color)])
    var sBtnMaps  = _styleStr([_fontSize(SIZE_BTN,     p.maps_label_size),     _colorRule(p.maps_label_color)])
    var sBtnWaze  = _styleStr([_fontSize(SIZE_BTN,     p.waze_label_size),     _colorRule(p.waze_label_color)])

    var html = '<style data-lpb-style="location-map">' + CSS + '</style>'
    html += '<section class="blk-locmap" data-bg="' + _esc(bg) + '" data-locmap-root>'

    if (eyebrow) html += '<div class="blk-locmap-eyebrow"' + _attrIfStyle(sEyebrow) + '>' + _esc(eyebrow) + '</div>'
    if (titulo)  html += '<h2 class="blk-locmap-title"'    + _attrIfStyle(sTitulo)  + '>' + _esc(titulo) + '</h2>'

    html += '<div class="blk-locmap-stage">' +
      _fauxMapSvg() +
      '<div class="blk-locmap-pin" aria-hidden="true">' +
        '<span class="blk-locmap-ripple"></span>' +
        '<span class="blk-locmap-ripple blk-locmap-ripple-2"></span>' +
        '<span class="blk-locmap-pin-dot"></span>' +
      '</div>' +
      _renderGallery(galleryPhotos, galleryPos, galleryTag) +
      '<div class="blk-locmap-card">' +
        statusHtml +
        '<p class="blk-locmap-address"' + _attrIfStyle(sAddress) + '>' + _esc(address) + '</p>' +
        '<p class="blk-locmap-city"'    + _attrIfStyle(sCity)    + '>' + _esc(city) + '</p>' +
        (hoursSummary ? '<p class="blk-locmap-hours"' + _attrIfStyle(sHours) + '>' + _esc(hoursSummary) + '</p>' : '') +
      '</div>' +
    '</div>'

    html += '<div class="blk-locmap-actions">' +
      '<a class="blk-locmap-btn blk-locmap-btn-primary" href="' + _esc(whatsappUrl) + '" target="_blank" rel="noopener">' +
        ICON_WA + '<span' + _attrIfStyle(sBtnWA) + '>' + _esc(whatsappLabel) + '</span></a>' +
      '<a class="blk-locmap-btn blk-locmap-btn-ghost" href="' + _esc(mapsUrl) + '" target="_blank" rel="noopener">' +
        ICON_MAP + '<span' + _attrIfStyle(sBtnMaps) + '>' + _esc(mapsLabel) + '</span></a>' +
      (showWaze
        ? '<a class="blk-locmap-btn blk-locmap-btn-ghost" href="' + _esc(wazeUrl) + '" target="_blank" rel="noopener">' +
            ICON_NAV + '<span' + _attrIfStyle(sBtnWaze) + '>' + _esc(wazeLabel) + '</span></a>'
        : '') +
    '</div>'

    html += '</section>'
    return html
  }

  // ──────────────────────────────────────────────────────────
  // Lightbox modal (criado via DOM no doc onde o bloco vive)
  // ──────────────────────────────────────────────────────────
  function _openLightbox(doc, photos, startIdx) {
    var cur = startIdx || 0
    var modal = doc.createElement('div')
    modal.className = 'blk-locmap-lightbox'
    modal.innerHTML =
      '<button class="blk-locmap-lightbox-close" type="button" aria-label="Fechar">×</button>' +
      '<button class="blk-locmap-lightbox-nav blk-locmap-lightbox-prev" type="button" aria-label="Anterior">‹</button>' +
      '<img src="' + photos[cur].replace(/"/g, '&quot;') + '" alt="Foto">' +
      '<button class="blk-locmap-lightbox-nav blk-locmap-lightbox-next" type="button" aria-label="Próxima">›</button>' +
      '<div class="blk-locmap-lightbox-counter">' + (cur + 1) + ' / ' + photos.length + '</div>'
    doc.body.appendChild(modal)
    var img     = modal.querySelector('img')
    var counter = modal.querySelector('.blk-locmap-lightbox-counter')

    function _show(i) {
      cur = (i + photos.length) % photos.length
      img.src = photos[cur]
      counter.textContent = (cur + 1) + ' / ' + photos.length
    }
    function _close() {
      doc.removeEventListener('keydown', _onKey)
      if (modal.parentNode) modal.parentNode.removeChild(modal)
    }
    function _onKey(e) {
      if (e.key === 'Escape')      _close()
      if (e.key === 'ArrowLeft')   _show(cur - 1)
      if (e.key === 'ArrowRight')  _show(cur + 1)
    }
    doc.addEventListener('keydown', _onKey)
    modal.addEventListener('click', function (e) {
      if (e.target === modal) _close()  // click fora da img fecha
    })
    modal.querySelector('.blk-locmap-lightbox-close').onclick = _close
    modal.querySelector('.blk-locmap-lightbox-prev').onclick  = function (e) { e.stopPropagation(); _show(cur - 1) }
    modal.querySelector('.blk-locmap-lightbox-next').onclick  = function (e) { e.stopPropagation(); _show(cur + 1) }
    img.addEventListener('click', function (e) { e.stopPropagation() })
  }

  // ──────────────────────────────────────────────────────────
  // Bind · status dinamico + gallery autoplay + lightbox
  // ──────────────────────────────────────────────────────────
  function bind(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return
    var doc = rootEl.ownerDocument || document
    var roots = rootEl.querySelectorAll('[data-locmap-root]')
    roots.forEach(function (root) {
      // Status dinamico
      var statusEl = root.querySelector('[data-locmap-status]')
      if (statusEl) {
        function _updateStatus() {
          var open = _isOpenNow()
          statusEl.setAttribute('data-open', open ? '1' : '0')
          var txt = statusEl.querySelector('[data-locmap-status-text]')
          if (txt) txt.textContent = open ? 'ABERTO AGORA' : 'FECHADO'
        }
        _updateStatus()
        if (root._locmapStatusTimer) clearInterval(root._locmapStatusTimer)
        root._locmapStatusTimer = setInterval(_updateStatus, 60000)
      }

      // Gallery autoplay (fade entre fotos · 4s)
      var gallery = root.querySelector('[data-locmap-gallery]')
      if (gallery) {
        var imgs = gallery.querySelectorAll('img')
        if (imgs.length > 1) {
          var cur = 0
          if (root._locmapGalleryTimer) clearInterval(root._locmapGalleryTimer)
          root._locmapGalleryTimer = setInterval(function () {
            imgs[cur].classList.remove('is-active')
            cur = (cur + 1) % imgs.length
            imgs[cur].classList.add('is-active')
          }, 4000)
        }
        // Tap → lightbox
        gallery.addEventListener('click', function () {
          var urls = Array.prototype.map.call(imgs, function (im) { return im.src })
          _openLightbox(doc, urls, 0)
        })
        gallery.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            gallery.click()
          }
        })
      }
    })
  }

  window.LPBBlockLocationMap = Object.freeze({ render: render, bind: bind })
})()
