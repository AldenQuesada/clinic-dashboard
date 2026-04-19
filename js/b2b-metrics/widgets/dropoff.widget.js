/**
 * B2BMDropoffWidget — vouchers em risco (14d+ sem resgate).
 * Consome B2BMetricsRepository.dropoff(days).
 * IIFE puro.
 */
;(function () {
  'use strict'
  if (window.B2BMDropoffWidget) return

  var STATUS_LABEL = {
    issued:    'emitida',
    delivered: 'entregue',
    opened:    'aberta'
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _statusLbl(s) {
    var k = String(s || '').toLowerCase()
    return STATUS_LABEL[k] || _esc(s || '—')
  }

  function _header(days) {
    return '' +
      '<div class="b2bm-widget-title">Vouchers em risco · ' + _esc(days) + 'd+ sem resgate</div>' +
      '<div class="b2bm-widget-sub">Acionar antes que expirem</div>'
  }

  function _renderLoading(host, days) {
    host.innerHTML = _header(days) + '<div class="b2bm-widget-loading">Buscando vouchers…</div>'
  }

  function _renderError(host, days, err) {
    host.innerHTML = _header(days) +
      '<div class="b2bm-widget-err">Falha ao carregar: ' + _esc(err && err.message ? err.message : err) + '</div>'
  }

  function _renderEmpty(host, days) {
    host.innerHTML = _header(days) +
      '<div class="b2bm-empty">Nenhum voucher em risco ✓</div>'
  }

  function _renderList(host, days, vouchers) {
    var visible = vouchers.slice(0, 8)
    var extra = vouchers.length - visible.length
    var rows = visible.map(function (v) {
      var partner = _esc(v.partnership_name || '—')
      var recipient = _esc(v.recipient_name || '—')
      var status = _statusLbl(v.status)
      var days = Number(v.days_since || 0)
      return '' +
        '<div class="b2bm-dropoff-item">' +
          '<div>' +
            '<div class="b2bm-dropoff-name">' + recipient + '</div>' +
            '<div class="b2bm-dropoff-meta">' + partner + ' · ' + status + '</div>' +
          '</div>' +
          '<div class="b2bm-dropoff-days">' + days + 'd</div>' +
        '</div>'
    }).join('')

    var footer = extra > 0
      ? '<div class="b2bm-kpi-sub" style="margin-top:10px;">+ ' + extra + ' outros vouchers em risco</div>'
      : ''

    host.innerHTML = _header(days) + rows + footer
  }

  async function mount(hostId, days) {
    var host = document.getElementById(hostId)
    if (!host) return
    var d = Number(days) || 14
    _renderLoading(host, d)
    try {
      if (!window.B2BMetricsRepository) throw new Error('B2BMetricsRepository ausente')
      var res = await window.B2BMetricsRepository.dropoff(d)
      var vouchers = (res && (res.vouchers || res.leads)) || (Array.isArray(res) ? res : [])
      if (!vouchers.length) return _renderEmpty(host, d)
      _renderList(host, d, vouchers)
    } catch (err) {
      _renderError(host, d, err)
    }
  }

  window.B2BMDropoffWidget = Object.freeze({ mount: mount })
})()
