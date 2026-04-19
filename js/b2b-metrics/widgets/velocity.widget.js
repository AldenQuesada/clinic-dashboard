/**
 * B2BMVelocityWidget — tempo médio até primeira voucher B2B + delta vs período anterior.
 * Consome B2BMetricsRepository.velocity(days, partnerId).
 * IIFE puro.
 */
;(function () {
  'use strict'
  if (window.B2BMVelocityWidget) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _fmt(n, d) {
    var v = Number(n || 0)
    return v.toFixed(typeof d === 'number' ? d : 1)
  }

  function _header() {
    return '' +
      '<div class="b2bm-widget-title">Velocity · dias até primeira voucher</div>' +
      '<div class="b2bm-widget-sub">Média, range e tendência</div>'
  }

  function _renderLoading(host) {
    host.innerHTML = _header() + '<div class="b2bm-widget-loading">Calculando velocity…</div>'
  }

  function _renderError(host, err) {
    host.innerHTML = _header() +
      '<div class="b2bm-widget-err">Falha ao carregar: ' + _esc(err && err.message ? err.message : err) + '</div>'
  }

  function _deltaClass(delta) {
    // delta_pct positivo = tempo subiu (piorou)
    if (delta > 0) return 'down'   // vermelho
    if (delta < 0) return 'up'     // verde
    return 'flat'
  }
  function _deltaArrow(delta) {
    if (delta > 0) return '↑'
    if (delta < 0) return '↓'
    return '·'
  }

  function _renderData(host, data) {
    var avg = Number(data.avg_days || 0)
    var min = Number(data.min_days || 0)
    var max = Number(data.max_days || 0)
    var n = Number(data.n || 0)
    var delta = Number(data.delta_pct || 0)
    var deltaCls = _deltaClass(delta)
    var deltaArr = _deltaArrow(delta)
    var deltaTxt = Math.abs(delta).toFixed(1) + '%'

    if (n === 0 && avg === 0) {
      host.innerHTML = _header() + '<div class="b2bm-empty">Sem vouchers emitidas no período.</div>'
      return
    }

    var html = _header() +
      '<div class="b2bm-kpi-grid">' +
        '<div class="b2bm-kpi">' +
          '<div class="b2bm-kpi-val">' + _fmt(avg, 1) + '<span style="font-size:14px;color:var(--ink-muted);margin-left:6px;">dias</span></div>' +
          '<div class="b2bm-kpi-lbl">Média até primeira voucher</div>' +
          '<div class="b2bm-kpi-sub b2bm-kpi-delta ' + deltaCls + '">' + deltaArr + ' ' + deltaTxt + ' vs período anterior</div>' +
        '</div>' +
        '<div class="b2bm-kpi">' +
          '<div class="b2bm-kpi-val" style="font-size:22px;">' + _fmt(min, 1) + ' – ' + _fmt(max, 1) + '<span style="font-size:12px;color:var(--ink-muted);margin-left:6px;">dias</span></div>' +
          '<div class="b2bm-kpi-lbl">Range (mín – máx)</div>' +
          '<div class="b2bm-kpi-sub">' + n + ' parcerias ativadas no período</div>' +
        '</div>' +
      '</div>'
    host.innerHTML = html
  }

  async function mount(hostId, days, partnerId) {
    var host = document.getElementById(hostId)
    if (!host) return
    var d = Number(days) || 30
    _renderLoading(host)
    try {
      if (!window.B2BMetricsRepository) throw new Error('B2BMetricsRepository ausente')
      var data = await window.B2BMetricsRepository.velocity(d, partnerId || null)
      _renderData(host, data || {})
    } catch (err) {
      _renderError(host, err)
    }
  }

  window.B2BMVelocityWidget = Object.freeze({ mount: mount })
})()
