/**
 * VpiForecastWidget — projeção do mês vs meta.
 * Consome GrowthMetricsRepository.forecast(meta).
 * IIFE puro.
 */
;(function () {
  'use strict'
  if (window.VpiForecastWidget) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  var STATUS_LABEL = {
    acima:  'Acima da meta',
    ok:     'No ritmo',
    atento: 'Atenção',
    risco:  'Em risco'
  }

  function _header() {
    return '' +
      '<div class="gm-widget-title">Projeção do mês</div>' +
      '<div class="gm-widget-sub">Runrate x meta</div>'
  }

  function _renderLoading(host) {
    host.innerHTML = _header() + '<div class="gm-widget-loading">Calculando projeção…</div>'
  }

  function _renderError(host, err) {
    host.innerHTML = _header() +
      '<div class="gm-widget-err">Falha ao carregar: ' + _esc(err && err.message ? err.message : err) + '</div>'
  }

  function _renderData(host, data) {
    var meta = Number(data.meta || 0)
    var realized = Number(data.realized || 0)
    var projection = Number(data.projection || 0)
    var pct = Number(data.pct_of_meta || 0)
    var status = String(data.status || 'ok').toLowerCase()
    if (!STATUS_LABEL[status]) status = 'ok'
    var daysPassed = Math.max(1, Number(data.days_passed || 1))
    var prev = Number(data.prev_month_total || 0)
    var ritmo = (realized / daysPassed)
    var barW = Math.min(100, Math.max(0, pct))

    var html = _header() +
      '<div class="gm-forecast-hero">' +
        '<div>' +
          '<div class="gm-kpi" style="padding-top:0;">' +
            '<div class="gm-kpi-val">' + realized + '</div>' +
            '<div class="gm-kpi-lbl">Realizado no mês</div>' +
          '</div>' +
          '<div class="gm-kpi">' +
            '<div class="gm-kpi-val" style="font-size:28px;">' + projection.toFixed(1) + '</div>' +
            '<div class="gm-kpi-lbl">Projeção fim do mês</div>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div class="gm-kpi-val" style="font-size:48px;">' + pct.toFixed(0) + '<span style="font-size:20px;color:var(--ink-muted);">%</span></div>' +
          '<div class="gm-kpi-lbl">da meta (' + meta + ')</div>' +
          '<div class="gm-forecast-bar"><div class="gm-forecast-fill ' + _esc(status) + '" style="width:' + barW.toFixed(1) + '%;"></div></div>' +
          '<div class="gm-forecast-status ' + _esc(status) + '" style="background:var(--' + (
            status === 'acima' ? 'green' :
            status === 'ok' ? 'blue' :
            status === 'atento' ? 'amber' : 'red'
          ) + ');">' + _esc(STATUS_LABEL[status]) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="gm-kpi-sub" style="margin-top:14px;">' +
        'Ritmo ' + ritmo.toFixed(1) + '/dia · meta ' + meta + ' · mês anterior fechou ' + prev +
      '</div>'

    host.innerHTML = html
  }

  async function mount(hostId) {
    var host = document.getElementById(hostId)
    if (!host) return
    _renderLoading(host)
    try {
      if (!window.GrowthMetricsRepository) throw new Error('Repository indisponível')
      var data = await window.GrowthMetricsRepository.forecast(20)
      _renderData(host, data || {})
    } catch (err) {
      _renderError(host, err)
    }
  }

  window.VpiForecastWidget = Object.freeze({ mount: mount })
})()
