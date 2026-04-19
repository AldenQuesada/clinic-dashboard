/**
 * ClinicAI — B2B Map (WOW #3)
 *
 * Mapa vivo de Maringá com pontos pulsantes por parceria.
 *   - Tamanho do ponto proporcional ao tier (T1 maior)
 *   - Cor = health (verde/amarelo/vermelho/cinza)
 *   - Clique = abre detalhe
 *
 * Carrega Leaflet sob demanda (CDN). Fallback com mensagem quando
 * nenhuma parceria tem lat/lng.
 *
 * Consome: B2BGeoRepository.
 * Expõe window.B2BMap.
 */
;(function () {
  'use strict'
  if (window.B2BMap) return

  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
  var LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
  // Maringá centro
  var CENTER = [-23.4205, -51.9333]
  var ZOOM   = 13

  var _map = null
  var _layer = null

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _healthColor(h) {
    return { green:'#10B981', yellow:'#F59E0B', red:'#EF4444', unknown:'#94A3B8' }[h] || '#94A3B8'
  }
  function _tierRadius(t) {
    if (t === 1) return 14
    if (t === 2) return 11
    if (t === 3) return 9
    return 8
  }

  function _ensureLeaflet() {
    if (window.L) return Promise.resolve()
    return new Promise(function (resolve, reject) {
      // CSS
      if (!document.querySelector('link[data-leaflet]')) {
        var link = document.createElement('link')
        link.rel = 'stylesheet'; link.href = LEAFLET_CSS
        link.setAttribute('data-leaflet', '1')
        document.head.appendChild(link)
      }
      // JS
      var script = document.createElement('script')
      script.src = LEAFLET_JS
      script.async = true
      script.onload = function () { resolve() }
      script.onerror = function () { reject(new Error('Falha ao carregar Leaflet')) }
      document.head.appendChild(script)
    })
  }

  function _fitToPoints(points) {
    if (!_map || !points.length) return
    var valid = points.filter(function (p) { return p.lat != null && p.lng != null })
    if (!valid.length) return
    var bounds = window.L.latLngBounds(valid.map(function (p) { return [p.lat, p.lng] }))
    _map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
  }

  function _plot(points) {
    if (!_map) return
    if (_layer) { _layer.clearLayers() } else { _layer = window.L.layerGroup().addTo(_map) }

    points.forEach(function (p) {
      if (p.lat == null || p.lng == null) return
      var marker = window.L.circleMarker([Number(p.lat), Number(p.lng)], {
        radius: _tierRadius(p.tier),
        color: _healthColor(p.health_color),
        fillColor: _healthColor(p.health_color),
        fillOpacity: 0.75,
        weight: 2,
      })
      var popup = '<div style="min-width:180px;font-family:Montserrat,sans-serif">' +
        '<strong style="font-size:14px">' + _esc(p.name) + '</strong><br>' +
        '<span style="font-size:11px;color:#666">' + _esc(p.pillar || '') +
          (p.tier ? ' · T' + p.tier : '') + '</span><br>' +
        '<button class="b2b-map-popup-btn" data-map-open="' + _esc(p.id) + '" ' +
          'style="margin-top:8px;padding:4px 10px;font-size:11px;cursor:pointer;' +
          'background:#1A1A2E;color:#fff;border:none;border-radius:3px">' +
          'Abrir detalhe</button></div>'
      marker.bindPopup(popup)
      _layer.addLayer(marker)
    })

    // Delegação global pra botão no popup
    _map.on('popupopen', function (e) {
      var el = e.popup.getElement()
      if (!el) return
      var btn = el.querySelector('[data-map-open]')
      if (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-map-open')
          document.dispatchEvent(new CustomEvent('b2b:open-detail', { detail: { id: id } }))
        })
      }
    })
  }

  async function mount(hostId) {
    var host = document.getElementById(hostId)
    if (!host) return
    host.innerHTML =
      '<div class="b2b-map-wrap">' +
        '<div class="b2b-map-hdr">' +
          '<div>' +
            '<div class="b2b-sec-title" style="margin:0">Mapa vivo · parcerias em Maringá</div>' +
            '<div class="b2b-map-legend">' +
              '<span><i style="background:#10B981"></i>Saudável</span>' +
              '<span><i style="background:#F59E0B"></i>Atenção</span>' +
              '<span><i style="background:#EF4444"></i>Crítica</span>' +
              '<span><i style="background:#94A3B8"></i>Sem dado</span>' +
            '</div>' +
          '</div>' +
          '<div class="b2b-map-hint">Tamanho = Tier · Clique para abrir detalhe</div>' +
        '</div>' +
        '<div id="b2bMapLeaflet" class="b2b-map-leaflet"></div>' +
        '<div id="b2bMapEmpty" class="b2b-map-empty" style="display:none">' +
          'Nenhuma parceria com coordenadas ainda.<br>' +
          'Edite uma parceria e preencha latitude/longitude pra aparecer aqui.' +
        '</div>' +
      '</div>'

    try {
      await _ensureLeaflet()
    } catch (e) {
      host.innerHTML = '<div class="b2b-empty b2b-empty-err">Mapa offline: ' + _esc(e.message) + '</div>'
      return
    }

    var points = []
    try {
      points = await window.B2BGeoRepository.list()
      points = Array.isArray(points) ? points : []
    } catch (e) {
      host.innerHTML = '<div class="b2b-empty b2b-empty-err">Falha ao carregar parcerias: ' + _esc(e.message) + '</div>'
      return
    }

    var el = document.getElementById('b2bMapLeaflet')
    var empty = document.getElementById('b2bMapEmpty')
    if (!points.length) {
      if (el) el.style.display = 'none'
      if (empty) empty.style.display = 'block'
      return
    }

    _map = window.L.map(el, { center: CENTER, zoom: ZOOM, scrollWheelZoom: true })
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(_map)

    _plot(points)
    _fitToPoints(points)
  }

  function destroy() {
    if (_map) { _map.remove(); _map = null; _layer = null }
  }

  // ─── Auto-mount quando a tab 'map' fica ativa ───────────────
  document.addEventListener('b2b:tab-change', function (e) {
    if (!e.detail || e.detail.tab !== 'map') {
      destroy()
      return
    }
    var body = window.B2BShell ? window.B2BShell.getTabBody() : document.getElementById('b2bTabBody')
    if (!body) return
    body.innerHTML = '<div id="b2bMapHost"></div>'
    mount('b2bMapHost')
  })

  window.B2BMap = Object.freeze({ mount: mount, destroy: destroy })
})()
