/**
 * VpiCohortWidget — retenção de embaixadoras por coorte mensal.
 * Consome GrowthMetricsRepository.cohort(6) → RPC vpi_cohort_retention.
 * Renderiza matriz coorte × M+0..M+6 com heatmap via CSS var --heat.
 */
;(function () {
  'use strict'
  if (window.VpiCohortWidget) return

  var COLS = [
    { key: 'm0', label: 'M+0' },
    { key: 'm1', label: 'M+1' },
    { key: 'm2', label: 'M+2' },
    { key: 'm3', label: 'M+3' },
    { key: 'm6', label: 'M+6' },
  ]

  var MONTHS_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _header() {
    return '' +
      '<div class="gm-widget-title">Retenção de embaixadoras</div>' +
      '<div class="gm-widget-sub">Últimos 6 meses</div>'
  }

  function _renderLoading(host) {
    host.innerHTML = _header() + '<div class="gm-widget-loading">Carregando…</div>'
  }

  function _renderError(host, msg) {
    host.innerHTML = _header() +
      '<div class="gm-widget-err">Falha ao carregar coortes: ' + _esc(msg || 'erro desconhecido') + '</div>'
  }

  // "2026-04" → "abr/26"
  function _label(cohort) {
    if (!cohort || typeof cohort !== 'string') return ''
    var parts = cohort.split('-')
    if (parts.length < 2) return cohort
    var year = parts[0]
    var mIdx = Number(parts[1]) - 1
    if (isNaN(mIdx) || mIdx < 0 || mIdx > 11) return cohort
    return MONTHS_PT[mIdx] + '/' + year.slice(-2)
  }

  // Cell: exibe count + rate% (se houver rate computado) + intensidade heatmap
  function _cellHtml(row, col) {
    var count = Number(row[col.key]) || 0
    var size  = Number(row.size) || 0
    // Rate: usa m1_rate/m3_rate/m6_rate quando disponível; fallback calcula
    var rate
    if (col.key === 'm1' && row.m1_rate != null) rate = Number(row.m1_rate)
    else if (col.key === 'm3' && row.m3_rate != null) rate = Number(row.m3_rate)
    else if (col.key === 'm6' && row.m6_rate != null) rate = Number(row.m6_rate)
    else if (size > 0) rate = Math.round(1000 * count / size) / 10
    else rate = 0

    if (!isFinite(rate)) rate = 0

    // Heat 0-100 escalonado para visibilidade (100% retenção ≈ fundo cheio)
    var heat = Math.max(0, Math.min(100, rate))
    var inner
    if (size === 0) {
      inner = '<span style="color:var(--ink-muted)">—</span>'
    } else if (count === 0 && col.key !== 'm0') {
      inner = '<span style="color:var(--ink-muted)">0</span>'
    } else {
      inner = '<div style="font-weight:600">' + _esc(count) + '</div>' +
              '<div style="font-size:9px;color:var(--ink-soft);letter-spacing:1px;margin-top:2px">' +
              _esc(rate.toFixed(1)) + '%</div>'
    }
    return '<td class="gm-cohort-cell" style="--heat:' + heat.toFixed(0) + '">' + inner + '</td>'
  }

  function _renderData(host, cohorts) {
    if (!Array.isArray(cohorts) || cohorts.length === 0) {
      host.innerHTML = _header() + '<div class="gm-empty">Sem dados suficientes.</div>'
      return
    }

    var headCols = COLS.map(function (c) {
      return '<th>' + _esc(c.label) + '</th>'
    }).join('')

    var rows = cohorts.map(function (row) {
      var cells = COLS.map(function (c) { return _cellHtml(row, c) }).join('')
      return '' +
        '<tr>' +
          '<td style="text-align:left;font-weight:600;color:var(--champagne-light)">' +
            _esc(_label(row.cohort)) +
          '</td>' +
          '<td>' + _esc(Number(row.size) || 0) + '</td>' +
          cells +
        '</tr>'
    }).join('')

    var table = '' +
      '<table class="gm-cohort-table">' +
        '<thead>' +
          '<tr>' +
            '<th style="text-align:left">Coorte</th>' +
            '<th>Tamanho</th>' +
            headCols +
          '</tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>'

    host.innerHTML = _header() + table
  }

  async function mount(hostId) {
    var host = document.getElementById(hostId)
    if (!host) return
    _renderLoading(host)
    try {
      if (!window.GrowthMetricsRepository) throw new Error('GrowthMetricsRepository ausente')
      var data = await window.GrowthMetricsRepository.cohort(6)
      var cohorts = (data && data.cohorts) || []
      _renderData(host, cohorts)
    } catch (err) {
      _renderError(host, err && err.message)
    }
  }

  window.VpiCohortWidget = Object.freeze({ mount: mount })
})()
