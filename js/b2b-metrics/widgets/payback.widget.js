/**
 * B2BMPaybackWidget — ROI e payback médio por voucher B2B.
 * Consome B2BMetricsRepository.payback(days, partnerId) → RPC b2b_payback_analysis.
 * 2 KPIs: ROI% (cor condicional) e Payback médio em dias.
 */
;(function () {
  'use strict'
  if (window.B2BMPaybackWidget) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _header(days) {
    return '' +
      '<div class="b2bm-widget-title">Payback · ROI por voucher</div>' +
      '<div class="b2bm-widget-sub">Últimos ' + _esc(days) + ' dias</div>'
  }

  function _renderLoading(host, days) {
    host.innerHTML = _header(days) +
      '<div class="b2bm-widget-loading">Carregando…</div>'
  }

  function _renderError(host, days, msg) {
    host.innerHTML = _header(days) +
      '<div class="b2bm-widget-err">Falha ao carregar payback: ' + _esc(msg || 'erro desconhecido') + '</div>'
  }

  function _num(v) {
    var n = Number(v)
    return isNaN(n) ? 0 : n
  }

  function _fmtBrl(v) {
    var n = _num(v)
    try {
      return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    } catch (_) {
      return n.toFixed(2).replace('.', ',')
    }
  }

  function _fmtPct(v) {
    var n = Number(v)
    if (isNaN(n)) return '0,0'
    return (Math.round(n * 10) / 10).toString().replace('.', ',')
  }

  function _fmtDays(v) {
    var n = Number(v)
    if (isNaN(n)) return '—'
    return (Math.round(n * 10) / 10).toString().replace('.', ',')
  }

  function _renderData(host, days, data) {
    var payload = data || {}
    var revenue = _num(payload.revenue != null ? payload.revenue : payload.total_revenue)
    var cost = _num(payload.cost != null ? payload.cost : payload.total_cost)
    var created = _num(
      payload.total_created != null ? payload.total_created :
      (payload.created != null ? payload.created :
      (payload.total_vouchers != null ? payload.total_vouchers : payload.total_indications))
    )
    var redeemed = _num(
      payload.total_redeemed != null ? payload.total_redeemed :
      (payload.redeemed != null ? payload.redeemed :
      (payload.closed_indications != null ? payload.closed_indications : payload.closed))
    )

    var roi = payload.roi_pct != null ? Number(payload.roi_pct) : (cost > 0 ? ((revenue - cost) / cost) * 100 : 0)
    var payback = payload.avg_payback_days != null ? Number(payload.avg_payback_days) : Number(payload.payback_days)

    if (created === 0 && revenue === 0 && cost === 0) {
      host.innerHTML = _header(days) +
        '<div class="b2bm-empty">Sem dados de payback no período.</div>'
      return
    }

    var roiColor = roi > 0 ? 'var(--green, #10b981)' : (roi < 0 ? 'var(--red, #ef4444)' : 'var(--ink-muted)')
    var roiSign = roi > 0 ? '+' : ''

    var grid = '' +
      '<div class="b2bm-kpi-grid">' +
        '<div class="b2bm-kpi">' +
          '<div class="b2bm-kpi-lbl">ROI</div>' +
          '<div class="b2bm-kpi-val" style="color:' + roiColor + '">' +
            _esc(roiSign + _fmtPct(roi)) + '%</div>' +
          '<div class="b2bm-kpi-sub">retorno sobre custo</div>' +
        '</div>' +
        '<div class="b2bm-kpi">' +
          '<div class="b2bm-kpi-lbl">Payback médio</div>' +
          '<div class="b2bm-kpi-val">' + _esc(_fmtDays(payback)) +
            (isNaN(Number(payback)) ? '' : ' <span style="font-size:13px;color:var(--ink-muted);font-weight:400">dias</span>') +
            '</div>' +
          '<div class="b2bm-kpi-sub">até recuperar investimento</div>' +
        '</div>' +
      '</div>'

    var sub = '<div class="b2bm-widget-sub" style="margin-top:10px">' +
      'R$ ' + _esc(_fmtBrl(revenue)) + ' revenue / R$ ' + _esc(_fmtBrl(cost)) + ' custo' +
      ' (' + _esc(created) + ' criada' + (created === 1 ? '' : 's') +
      ', ' + _esc(redeemed) + ' resgatada' + (redeemed === 1 ? '' : 's') + ')' +
      '</div>'

    host.innerHTML = _header(days) + grid + sub
  }

  async function mount(hostId, days, partnerId) {
    var host = document.getElementById(hostId)
    if (!host) return
    var period = Number(days) || 90
    _renderLoading(host, period)
    try {
      if (!window.B2BMetricsRepository) throw new Error('B2BMetricsRepository ausente')
      var data = await window.B2BMetricsRepository.payback(period, partnerId || null)
      _renderData(host, period, data)
    } catch (err) {
      _renderError(host, period, err && err.message)
    }
  }

  window.B2BMPaybackWidget = Object.freeze({ mount: mount })
})()
