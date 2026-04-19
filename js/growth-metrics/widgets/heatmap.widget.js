/**
 * VpiHeatmapWidget — heatmap dia-da-semana × hora-do-dia de atividade VPI.
 * Consome GrowthMetricsRepository.heatmap(days) → RPC vpi_heatmap_activity.
 * Linhas = DOW (0=Dom..6=Sab). Colunas = 24 horas. Intensidade via --heat.
 */
;(function () {
  'use strict'
  if (window.VpiHeatmapWidget) return

  var DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _header(days) {
    return '' +
      '<div class="gm-widget-title">Heatmap · dia × hora</div>' +
      '<div class="gm-widget-sub">Últimos ' + _esc(days) + ' dias</div>'
  }

  function _renderLoading(host, days) {
    host.innerHTML = _header(days) +
      '<div class="gm-widget-loading">Carregando…</div>'
  }

  function _renderError(host, days, msg) {
    host.innerHTML = _header(days) +
      '<div class="gm-widget-err">Falha ao carregar heatmap: ' + _esc(msg || 'erro desconhecido') + '</div>'
  }

  function _renderData(host, days, rows) {
    var list = Array.isArray(rows) ? rows : []
    // matriz 7x24 inicializada com 0
    var matrix = []
    for (var d = 0; d < 7; d++) {
      var row = []
      for (var h = 0; h < 24; h++) row.push(0)
      matrix.push(row)
    }
    var max = 0
    var total = 0
    list.forEach(function (r) {
      var dow = Number(r && (r.dow != null ? r.dow : r.day_of_week))
      var hour = Number(r && (r.hour != null ? r.hour : r.hour_of_day))
      var count = Number(r && (r.count != null ? r.count : r.activity_count)) || 0
      if (isNaN(dow) || isNaN(hour)) return
      if (dow < 0 || dow > 6 || hour < 0 || hour > 23) return
      matrix[dow][hour] += count
      if (matrix[dow][hour] > max) max = matrix[dow][hour]
      total += count
    })

    if (total === 0 || max === 0) {
      host.innerHTML = _header(days) +
        '<div class="gm-empty">Sem atividade registrada no período.</div>'
      return
    }

    // head row: célula vazia (label) + 24 horas
    var head = '<div class="gm-heatmap-head"></div>'
    for (var h2 = 0; h2 < 24; h2++) {
      head += '<div class="gm-heatmap-head">' + _esc(h2) + '</div>'
    }

    // body rows
    var body = ''
    for (var dd = 0; dd < 7; dd++) {
      body += '<div class="gm-heatmap-row-label">' + _esc(DOW_LABELS[dd]) + '</div>'
      for (var hh = 0; hh < 24; hh++) {
        var v = matrix[dd][hh]
        var intensity = max > 0 ? (v / max) : 0
        var title = DOW_LABELS[dd] + ' ' + hh + 'h · ' + v + ' atividade' + (v === 1 ? '' : 's')
        body += '<div class="gm-heatmap-cell" style="--heat:' + intensity.toFixed(3) +
          '" title="' + _esc(title) + '"></div>'
      }
    }

    host.innerHTML = _header(days) +
      '<div class="gm-heatmap-grid">' + head + body + '</div>'
  }

  async function mount(hostId, days) {
    var host = document.getElementById(hostId)
    if (!host) return
    var period = Number(days) || 90
    _renderLoading(host, period)
    try {
      if (!window.GrowthMetricsRepository) throw new Error('GrowthMetricsRepository ausente')
      var data = await window.GrowthMetricsRepository.heatmap(period)
      _renderData(host, period, data)
    } catch (err) {
      _renderError(host, period, err && err.message)
    }
  }

  window.VpiHeatmapWidget = Object.freeze({ mount: mount })
})()
