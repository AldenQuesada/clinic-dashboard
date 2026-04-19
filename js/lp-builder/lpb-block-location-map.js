/**
 * LP Builder · Block: location-map (Onda 31)
 *
 * Mapa imersivo styled em paleta champagne · pin pulsante + card flutuante.
 * Pure SVG faux-map (zero dependencias externas · sem Mapbox/Leaflet/Google Maps key).
 *
 * IIFE auto-contido · CSS injetado em <head> no primeiro render.
 * Status "ABERTO AGORA" calculado em runtime via bind() (Date()).
 *
 *   LPBBlockLocationMap.render(block) → string HTML
 *   LPBBlockLocationMap.bind(rootEl)  → ativa status dinamico
 */
;(function () {
  'use strict'
  if (window.LPBBlockLocationMap) return

  // ──────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────
  function _esc(s) {
    var d = document.createElement('div')
    d.textContent = s == null ? '' : s
    return d.innerHTML
  }

  // ──────────────────────────────────────────────────────────
  // CSS injetado · self-contained
  // ──────────────────────────────────────────────────────────
  var CSS_ID = 'lpb-block-location-map-css'
  function _injectCSS() {
    if (document.getElementById(CSS_ID)) return
    var style = document.createElement('style')
    style.id = CSS_ID
    style.textContent = [
      '.blk-locmap{padding:2.5rem 0 2rem;max-width:480px;margin:0 auto;background:#2C2C2C}',
      '.blk-locmap[data-bg="ivory"]{background:#FEFCF8}',
      '.blk-locmap[data-bg="white"]{background:#FFFFFF}',
      // Header
      '.blk-locmap-eyebrow{font-family:Montserrat,sans-serif;font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:#C8A97E;font-weight:500;text-align:center;padding:0 1.5rem;margin-bottom:.5rem}',
      '.blk-locmap-title{font-family:"Cormorant Garamond",serif;font-size:24px;font-weight:300;text-align:center;color:#FEFCF8;padding:0 1.5rem;margin-bottom:1.25rem}',
      '.blk-locmap[data-bg="ivory"] .blk-locmap-title,.blk-locmap[data-bg="white"] .blk-locmap-title{color:#2C2C2C}',
      // Stage (faux-map)
      '.blk-locmap-stage{position:relative;width:100%;max-width:var(--lp-photo-card-max-width,380px);aspect-ratio:var(--lp-photo-card-aspect,4/5);margin:0 auto;overflow:hidden;border-radius:6px;background:#1f1f1f;box-shadow:0 12px 40px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.15)}',
      '.blk-locmap[data-bg="ivory"] .blk-locmap-stage,.blk-locmap[data-bg="white"] .blk-locmap-stage{box-shadow:0 12px 32px rgba(44,44,44,.12),0 2px 6px rgba(44,44,44,.06)}',
      // Faux-map SVG
      '.blk-locmap-bg{position:absolute;inset:0;width:100%;height:100%;display:block}',
      // Pin centralizado
      '.blk-locmap-pin{position:absolute;top:42%;left:50%;transform:translate(-50%,-100%);width:48px;height:48px;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5}',
      '.blk-locmap-pin-dot{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;background:#C8A97E;border-radius:50%;border:3px solid rgba(254,252,248,.95);box-shadow:0 4px 12px rgba(0,0,0,.4),0 0 24px rgba(200,169,126,.6);z-index:3}',
      '.blk-locmap-pin-icon{position:absolute;top:50%;left:50%;transform:translate(-50%,-58%);color:#2C2C2C;z-index:4}',
      // Ripple anim
      '.blk-locmap-ripple{position:absolute;top:50%;left:50%;width:14px;height:14px;border-radius:50%;border:2px solid rgba(200,169,126,.6);transform:translate(-50%,-50%);opacity:0;animation:blk-locmap-ripple 2.4s ease-out infinite;z-index:2}',
      '.blk-locmap-ripple-2{animation-delay:1.2s}',
      '@keyframes blk-locmap-ripple{0%{width:14px;height:14px;opacity:.7}100%{width:120px;height:120px;opacity:0}}',
      '@media(prefers-reduced-motion:reduce){.blk-locmap-ripple{animation:none;display:none}}',
      // Card flutuante (frosted glass)
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
      // Actions
      '.blk-locmap-actions{display:flex;gap:8px;padding:1rem 1.25rem 0;flex-wrap:wrap}',
      '.blk-locmap-btn{flex:1;min-width:90px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 12px;font-family:Montserrat,sans-serif;font-size:10px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;border-radius:3px;transition:all .2s cubic-bezier(.4,0,.2,1)}',
      '.blk-locmap-btn-primary{background:#C8A97E;color:#2C2C2C;border:1px solid #C8A97E}',
      '.blk-locmap-btn-primary:hover{background:#B89B70;transform:translateY(-1px);box-shadow:0 6px 16px rgba(200,169,126,.3)}',
      '.blk-locmap-btn-ghost{background:transparent;color:#C8A97E;border:1px solid rgba(200,169,126,.5)}',
      '.blk-locmap-btn-ghost:hover{background:rgba(200,169,126,.1);border-color:#C8A97E}',
      '.blk-locmap[data-bg="ivory"] .blk-locmap-btn-ghost,.blk-locmap[data-bg="white"] .blk-locmap-btn-ghost{color:#A8895E;border-color:rgba(168,137,94,.5)}',
      '@media(prefers-reduced-motion:reduce){.blk-locmap-btn:hover{transform:none}}',
    ].join('\n')
    document.head.appendChild(style)
  }

  // ──────────────────────────────────────────────────────────
  // SVG faux-map · road network estilizado em champagne
  // ──────────────────────────────────────────────────────────
  function _fauxMapSvg() {
    // Paths simulando ruas (curvas suaves) + áreas verdes (parques)
    return '<svg class="blk-locmap-bg" viewBox="0 0 380 475" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      // Background gradient sutil
      '<defs>' +
        '<radialGradient id="locmap-bg" cx="50%" cy="42%" r="65%">' +
          '<stop offset="0%" stop-color="#2A2A2D"/>' +
          '<stop offset="100%" stop-color="#1A1A1C"/>' +
        '</radialGradient>' +
      '</defs>' +
      '<rect width="380" height="475" fill="url(#locmap-bg)"/>' +
      // Park areas (verde escuro sutil)
      '<path d="M30,300 Q60,280 100,310 Q120,340 90,380 Q50,400 20,360 Z" fill="rgba(74,90,60,.25)" stroke="rgba(74,90,60,.4)" stroke-width=".5"/>' +
      '<path d="M280,80 Q320,70 350,100 Q360,140 330,160 Q290,150 270,120 Z" fill="rgba(74,90,60,.22)" stroke="rgba(74,90,60,.35)" stroke-width=".5"/>' +
      // Major streets (curvas champagne)
      '<g stroke="rgba(200,169,126,.35)" stroke-width="3" fill="none" stroke-linecap="round">' +
        '<path d="M0,200 Q120,180 200,200 Q280,220 380,200"/>' +
        '<path d="M190,0 Q200,120 195,200 Q190,280 200,475"/>' +
      '</g>' +
      // Secondary streets
      '<g stroke="rgba(200,169,126,.18)" stroke-width="1.5" fill="none" stroke-linecap="round">' +
        '<path d="M0,80 Q100,95 200,85 Q300,75 380,90"/>' +
        '<path d="M0,320 Q120,310 200,330 Q280,350 380,330"/>' +
        '<path d="M0,400 Q120,395 200,410 Q280,420 380,400"/>' +
        '<path d="M80,0 Q88,120 80,200 Q70,300 85,475"/>' +
        '<path d="M300,0 Q310,120 305,200 Q300,300 310,475"/>' +
      '</g>' +
      // Tertiary (very faint)
      '<g stroke="rgba(200,169,126,.08)" stroke-width="1" fill="none" stroke-linecap="round">' +
        '<path d="M0,140 L380,150"/>' +
        '<path d="M0,250 L380,260"/>' +
        '<path d="M0,440 L380,440"/>' +
        '<path d="M40,0 L42,475"/>' +
        '<path d="M140,0 L142,475"/>' +
        '<path d="M240,0 L242,475"/>' +
        '<path d="M340,0 L342,475"/>' +
      '</g>' +
      // Subtle dots representing buildings
      '<g fill="rgba(200,169,126,.1)">' +
        '<circle cx="50" cy="60" r="2"/><circle cx="130" cy="40" r="1.5"/><circle cx="260" cy="50" r="2"/>' +
        '<circle cx="60" cy="170" r="1.5"/><circle cx="160" cy="155" r="1"/><circle cx="320" cy="180" r="1.5"/>' +
        '<circle cx="50" cy="280" r="1"/><circle cx="160" cy="280" r="2"/><circle cx="270" cy="290" r="1.5"/>' +
      '</g>' +
    '</svg>'
  }

  // Pin SVG · gota com sombra
  function _pinIcon() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" opacity="0"/>' +
    '</svg>'
  }

  // Ícones dos botões
  var ICON_WA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
  var ICON_MAP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
  var ICON_NAV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>'

  // ──────────────────────────────────────────────────────────
  // Status aberto/fechado (defaults Mon-Fri 9-19, Sat 9-13, Sun closed)
  // Calculo feito em bind() pra usar Date() do cliente
  // ──────────────────────────────────────────────────────────
  function _isOpenNow(now) {
    now = now || new Date()
    var dow = now.getDay()       // 0=Sun, 1=Mon ... 6=Sat
    var hour = now.getHours() + now.getMinutes() / 60
    if (dow === 0) return false                                 // domingo fechado
    if (dow === 6) return hour >= 9 && hour < 13                // sabado 9-13
    return hour >= 9 && hour < 19                               // seg-sex 9-19
  }

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────
  function render(block) {
    _injectCSS()
    var p = (block && block.props) || {}

    var bg            = p.bg || 'graphite'
    var eyebrow       = p.eyebrow         || 'Localização'
    var titulo        = p.titulo          || 'Onde nos encontrar'
    var address       = p.address         || 'Av. Brasil, 4242'
    var city          = p.city            || 'Maringá / PR'
    var hoursSummary  = p.hours_summary   || 'Seg a Sex 9h-19h · Sáb 9h-13h'
    var showStatus    = p.show_open_status !== false
    var whatsappUrl   = p.whatsapp_url    || 'https://wa.me/5544999999999'
    var whatsappLabel = p.whatsapp_label  || 'WhatsApp'
    var mapsUrl       = p.maps_url        || 'https://maps.google.com/?q=Clinica+Mirian+Paula+Maringa'
    var mapsLabel     = p.maps_label      || 'Maps'
    var wazeUrl       = p.waze_url        || 'https://waze.com/ul?q=Clinica+Mirian+Paula+Maringa'
    var wazeLabel     = p.waze_label      || 'Waze'
    var showWaze      = p.show_waze !== false

    // Status renderizado em "fechado" como neutro · bind() ajusta
    var statusHtml = ''
    if (showStatus) {
      statusHtml = '<span class="blk-locmap-status" data-locmap-status data-open="0">' +
        '<span class="blk-locmap-status-dot"></span>' +
        '<span data-locmap-status-text>FECHADO</span>' +
      '</span>'
    }

    var html = '<section class="blk-locmap" data-bg="' + _esc(bg) + '" data-locmap-root>'

    // Header
    if (eyebrow) html += '<div class="blk-locmap-eyebrow">' + _esc(eyebrow) + '</div>'
    if (titulo)  html += '<h2 class="blk-locmap-title">' + _esc(titulo) + '</h2>'

    // Stage (faux-map + pin + card)
    html += '<div class="blk-locmap-stage">' +
      _fauxMapSvg() +
      '<div class="blk-locmap-pin" aria-hidden="true">' +
        '<span class="blk-locmap-ripple"></span>' +
        '<span class="blk-locmap-ripple blk-locmap-ripple-2"></span>' +
        '<span class="blk-locmap-pin-dot"></span>' +
        '<span class="blk-locmap-pin-icon">' + _pinIcon() + '</span>' +
      '</div>' +
      '<div class="blk-locmap-card">' +
        statusHtml +
        '<p class="blk-locmap-address">' + _esc(address) + '</p>' +
        '<p class="blk-locmap-city">' + _esc(city) + '</p>' +
        (hoursSummary ? '<p class="blk-locmap-hours">' + _esc(hoursSummary) + '</p>' : '') +
      '</div>' +
    '</div>'

    // Actions
    html += '<div class="blk-locmap-actions">' +
      '<a class="blk-locmap-btn blk-locmap-btn-primary" href="' + _esc(whatsappUrl) + '" target="_blank" rel="noopener">' +
        ICON_WA + '<span>' + _esc(whatsappLabel) + '</span>' +
      '</a>' +
      '<a class="blk-locmap-btn blk-locmap-btn-ghost" href="' + _esc(mapsUrl) + '" target="_blank" rel="noopener">' +
        ICON_MAP + '<span>' + _esc(mapsLabel) + '</span>' +
      '</a>' +
      (showWaze
        ? '<a class="blk-locmap-btn blk-locmap-btn-ghost" href="' + _esc(wazeUrl) + '" target="_blank" rel="noopener">' +
            ICON_NAV + '<span>' + _esc(wazeLabel) + '</span>' +
          '</a>'
        : '') +
    '</div>'

    html += '</section>'
    return html
  }

  // ──────────────────────────────────────────────────────────
  // Bind · atualiza status aberto/fechado em runtime
  // ──────────────────────────────────────────────────────────
  function bind(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return
    var roots = rootEl.querySelectorAll('[data-locmap-root]')
    roots.forEach(function (root) {
      var statusEl = root.querySelector('[data-locmap-status]')
      if (!statusEl) return
      function _update() {
        var open = _isOpenNow()
        statusEl.setAttribute('data-open', open ? '1' : '0')
        var txt = statusEl.querySelector('[data-locmap-status-text]')
        if (txt) txt.textContent = open ? 'ABERTO AGORA' : 'FECHADO'
      }
      _update()
      // Re-check a cada 60s caso user fique muito tempo (transição em horário fechamento/abertura)
      if (root._locmapTimer) clearInterval(root._locmapTimer)
      root._locmapTimer = setInterval(_update, 60000)
    })
  }

  window.LPBBlockLocationMap = Object.freeze({
    render: render,
    bind:   bind,
  })
})()
