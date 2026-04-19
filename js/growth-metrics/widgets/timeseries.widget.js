/**
 * VpiTimeseriesWidget — histórico mensal de indicações × fechadas.
 * Consome GrowthMetricsRepository.timeseries('month', 12) → RPC vpi_timeseries.
 * Renderiza SVG inline com 2 linhas suavizadas + eixo + legenda.
 */
;(function () {
  'use strict'
  if (window.VpiTimeseriesWidget) return

  var VB_W = 600, VB_H = 180
  var PAD_L = 34, PAD_R = 12, PAD_T = 14, PAD_B = 28
  var COLOR_CREATED = '#C9A96E'
  var COLOR_CLOSED  = '#10B981'

  var MONTHS_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _header() {
    return '' +
      '<div class="gm-widget-title">Histórico mensal</div>' +
      '<div class="gm-widget-sub">Últimos 12 meses</div>'
  }

  function _renderLoading(host) {
    host.innerHTML = _header() + '<div class="gm-widget-loading">Carregando…</div>'
  }

  function _renderError(host, msg) {
    host.innerHTML = _header() +
      '<div class="gm-widget-err">Falha ao carregar série: ' + _esc(msg || 'erro desconhecido') + '</div>'
  }

  // "2026-04-01" → "abr/26"
  function _label(bucket) {
    if (!bucket || typeof bucket !== 'string') return ''
    var parts = bucket.split('-')
    if (parts.length < 2) return bucket
    var year = parts[0]
    var mIdx = Number(parts[1]) - 1
    if (isNaN(mIdx) || mIdx < 0 || mIdx > 11) return bucket
    return MONTHS_PT[mIdx] + '/' + year.slice(-2)
  }

  // Catmull-Rom → SVG cubic path (smooth line)
  function _smoothPath(points) {
    if (!points.length) return ''
    if (points.length === 1) {
      return 'M' + points[0][0] + ',' + points[0][1]
    }
    var d = 'M' + points[0][0].toFixed(2) + ',' + points[0][1].toFixed(2)
    for (var i = 0; i < points.length - 1; i++) {
      var p0 = points[i - 1] || points[i]
      var p1 = points[i]
      var p2 = points[i + 1]
      var p3 = points[i + 2] || p2
      var c1x = p1[0] + (p2[0] - p0[0]) / 6
      var c1y = p1[1] + (p2[1] - p0[1]) / 6
      var c2x = p2[0] - (p3[0] - p1[0]) / 6
      var c2y = p2[1] - (p3[1] - p1[1]) / 6
      d += ' C' + c1x.toFixed(2) + ',' + c1y.toFixed(2) +
           ' ' + c2x.toFixed(2) + ',' + c2y.toFixed(2) +
           ' ' + p2[0].toFixed(2) + ',' + p2[1].toFixed(2)
    }
    return d
  }

  function _areaPath(points, yBase) {
    if (!points.length) return ''
    var line = _smoothPath(points)
    var last = points[points.length - 1]
    var first = points[0]
    return line +
      ' L' + last[0].toFixed(2) + ',' + yBase.toFixed(2) +
      ' L' + first[0].toFixed(2) + ',' + yBase.toFixed(2) + ' Z'
  }

  function _renderData(host, series) {
    if (!Array.isArray(series) || series.length === 0) {
      host.innerHTML = _header() + '<div class="gm-empty">Sem dados suficientes.</div>'
      return
    }

    var innerW = VB_W - PAD_L - PAD_R
    var innerH = VB_H - PAD_T - PAD_B
    var n = series.length
    var stepX = n > 1 ? innerW / (n - 1) : 0

    var maxY = 0
    series.forEach(function (p) {
      var c = Number(p.created) || 0
      var d = Number(p.closed)  || 0
      if (c > maxY) maxY = c
      if (d > maxY) maxY = d
    })
    if (maxY === 0) maxY = 1 // avoid div/0

    function yCoord(v) {
      var vNum = Number(v) || 0
      return PAD_T + innerH - (vNum / maxY) * innerH
    }

    var ptsCreated = series.map(function (p, i) {
      return [PAD_L + i * stepX, yCoord(p.created)]
    })
    var ptsClosed = series.map(function (p, i) {
      return [PAD_L + i * stepX, yCoord(p.closed)]
    })

    var yBase = PAD_T + innerH

    // Y-axis ticks (0, mid, max)
    var yTicks = [0, Math.round(maxY / 2), maxY]
    var yGrid = yTicks.map(function (v) {
      var y = yCoord(v).toFixed(2)
      return '' +
        '<line class="gm-ts-axis" x1="' + PAD_L + '" x2="' + (VB_W - PAD_R) + '" y1="' + y + '" y2="' + y + '" />' +
        '<text class="gm-ts-label" x="' + (PAD_L - 6) + '" y="' + (Number(y) + 3) + '" text-anchor="end">' + _esc(v) + '</text>'
    }).join('')

    // X-axis labels — evita sobreposição: ~8 rótulos max
    var xLabelStep = Math.max(1, Math.ceil(n / 8))
    var xLabels = series.map(function (p, i) {
      if (i % xLabelStep !== 0 && i !== n - 1) return ''
      var x = (PAD_L + i * stepX).toFixed(2)
      return '<text class="gm-ts-label" x="' + x + '" y="' + (VB_H - 8) + '" text-anchor="middle">' +
        _esc(_label(p.bucket)) + '</text>'
    }).join('')

    var areaCreated = _areaPath(ptsCreated, yBase)
    var lineCreated = _smoothPath(ptsCreated)
    var lineClosed  = _smoothPath(ptsClosed)

    // Markers (small dots on closed line for readability)
    var dotsClosed = ptsClosed.map(function (pt) {
      return '<circle cx="' + pt[0].toFixed(2) + '" cy="' + pt[1].toFixed(2) +
        '" r="2.5" fill="' + COLOR_CLOSED + '" />'
    }).join('')

    var svg = '' +
      '<svg class="gm-ts-chart" viewBox="0 0 ' + VB_W + ' ' + VB_H + '" preserveAspectRatio="none" role="img" aria-label="Série temporal">' +
        yGrid +
        '<path class="gm-ts-area" d="' + areaCreated + '" />' +
        '<path class="gm-ts-line" d="' + lineCreated + '" stroke="' + COLOR_CREATED + '" />' +
        '<path class="gm-ts-line" d="' + lineClosed  + '" stroke="' + COLOR_CLOSED  + '" />' +
        dotsClosed +
        xLabels +
      '</svg>' +
      '<div class="gm-ts-legend">' +
        '<span><i style="background:' + COLOR_CREATED + '"></i>Indicações geradas</span>' +
        '<span><i style="background:' + COLOR_CLOSED  + '"></i>Fechadas</span>' +
      '</div>'

    host.innerHTML = _header() + svg
  }

  async function mount(hostId) {
    var host = document.getElementById(hostId)
    if (!host) return
    _renderLoading(host)
    try {
      if (!window.GrowthMetricsRepository) throw new Error('GrowthMetricsRepository ausente')
      var data = await window.GrowthMetricsRepository.timeseries('month', 12)
      var series = (data && data.series) || []
      _renderData(host, series)
    } catch (err) {
      _renderError(host, err && err.message)
    }
  }

  window.VpiTimeseriesWidget = Object.freeze({ mount: mount })
})()
