/**
 * B2BMForecastWidget — projeção do mês vs meta para novas parcerias e vouchers.
 * Consome B2BMetricsRepository.forecast(metaNew, metaVouchers).
 * IIFE puro.
 */
;(function () {
  'use strict'
  if (window.B2BMForecastWidget) return

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

  function _statusVar(status) {
    if (status === 'acima') return 'green'
    if (status === 'ok') return 'blue'
    if (status === 'atento') return 'amber'
    return 'red'
  }

  function _normStatus(s) {
    var status = String(s || 'ok').toLowerCase()
    if (!STATUS_LABEL[status]) status = 'ok'
    return status
  }

  function _header() {
    return '' +
      '<div class="b2bm-widget-title">Projeção do mês</div>' +
      '<div class="b2bm-widget-sub">Runrate x meta · parcerias e vouchers</div>'
  }

  function _renderLoading(host) {
    host.innerHTML = _header() + '<div class="b2bm-widget-loading">Calculando projeção…</div>'
  }

  function _renderError(host, err) {
    host.innerHTML = _header() +
      '<div class="b2bm-widget-err">Falha ao carregar: ' + _esc(err && err.message ? err.message : err) + '</div>'
  }

  function _block(opts) {
    var meta = Number(opts.meta || 0)
    var realized = Number(opts.realized || 0)
    var projection = Number(opts.projection || 0)
    var pct = Number(opts.pct || 0)
    var status = _normStatus(opts.status)
    var barW = Math.min(100, Math.max(0, pct))

    return '' +
      '<div class="b2bm-forecast-block">' +
        '<div class="b2bm-forecast-block-title">' + _esc(opts.label) + '</div>' +
        '<div class="b2bm-kpi-grid">' +
          '<div class="b2bm-kpi">' +
            '<div class="b2bm-kpi-val">' + _esc(realized) + '</div>' +
            '<div class="b2bm-kpi-lbl">Realizado</div>' +
          '</div>' +
          '<div class="b2bm-kpi">' +
            '<div class="b2bm-kpi-val" style="font-size:22px;">' + projection.toFixed(1) + '</div>' +
            '<div class="b2bm-kpi-lbl">Projeção fim do mês</div>' +
          '</div>' +
        '</div>' +
        '<div class="b2bm-forecast-meta">' +
          '<span>' + pct.toFixed(0) + '% da meta (' + _esc(meta) + ')</span>' +
          '<span class="b2bm-forecast-status ' + _esc(status) + '" style="background:var(--' + _statusVar(status) + ');">' +
            _esc(STATUS_LABEL[status]) +
          '</span>' +
        '</div>' +
        '<div class="b2bm-forecast-bar"><div class="b2bm-forecast-fill ' + _esc(status) + '" style="width:' + barW.toFixed(1) + '%;"></div></div>' +
      '</div>'
  }

  function _overallStatus(s1, s2) {
    // pior status domina
    var rank = { risco: 0, atento: 1, ok: 2, acima: 3 }
    var a = rank[_normStatus(s1)]
    var b = rank[_normStatus(s2)]
    var worst = a <= b ? s1 : s2
    return _normStatus(worst)
  }

  function _renderData(host, data) {
    var d = data || {}
    var metaNew = Number(d.meta_new_partners || 0)
    var newRealized = Number(d.new_realized || 0)
    var newProjection = Number(d.new_projection || 0)
    var pctNew = Number(d.pct_of_meta_new || 0)
    var statusNew = _normStatus(d.status_new)

    var metaVouch = Number(d.meta_vouchers || 0)
    var vouchRealized = Number(d.vouch_realized || 0)
    var vouchProjection = Number(d.vouch_projection || 0)
    var pctVouch = Number(d.pct_of_meta_vouchers || 0)
    var statusVouch = _normStatus(d.status_vouchers)

    var overall = _normStatus(d.status_overall || _overallStatus(statusNew, statusVouch))

    var blocks = '' +
      '<div class="b2bm-forecast-dual">' +
        _block({
          label: 'Novas parcerias',
          meta: metaNew,
          realized: newRealized,
          projection: newProjection,
          pct: pctNew,
          status: statusNew
        }) +
        _block({
          label: 'Vouchers',
          meta: metaVouch,
          realized: vouchRealized,
          projection: vouchProjection,
          pct: pctVouch,
          status: statusVouch
        }) +
      '</div>'

    var daysPassed = Math.max(1, Number(d.days_passed || 1))
    var prevNew = Number(d.prev_month_new_partners || 0)
    var prevVouch = Number(d.prev_month_vouchers || 0)

    var footer = '' +
      '<div class="b2bm-forecast-overall">' +
        '<span class="b2bm-forecast-status ' + _esc(overall) + '" style="background:var(--' + _statusVar(overall) + ');">' +
          _esc(STATUS_LABEL[overall]) +
        '</span>' +
        '<span class="b2bm-kpi-sub">' +
          'Dia ' + daysPassed + ' · mês anterior: ' + prevNew + ' parcerias / ' + prevVouch + ' vouchers' +
        '</span>' +
      '</div>'

    host.innerHTML = _header() + blocks + footer
  }

  async function mount(hostId, metaNew, metaVouchers) {
    var host = document.getElementById(hostId)
    if (!host) return
    var mn = Number(metaNew) || 3
    var mv = Number(metaVouchers) || 30
    _renderLoading(host)
    try {
      if (!window.B2BMetricsRepository) throw new Error('B2BMetricsRepository ausente')
      var data = await window.B2BMetricsRepository.forecast(mn, mv)
      _renderData(host, data || {})
    } catch (err) {
      _renderError(host, err)
    }
  }

  window.B2BMForecastWidget = Object.freeze({ mount: mount })
})()
