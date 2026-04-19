/**
 * VpiPaybackWidget — ROI e payback médio por indicação.
 * Consome GrowthMetricsRepository.payback(days) → RPC vpi_payback_analysis.
 * 2 KPIs: ROI% (cor condicional) e Payback médio em dias.
 */
;(function () {
  'use strict'
  if (window.VpiPaybackWidget) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _header(days) {
    return '' +
      '<div class="gm-widget-title">Payback · ROI por indicação</div>' +
      '<div class="gm-widget-sub">Últimos ' + _esc(days) + ' dias</div>'
  }

  function _renderLoading(host, days) {
    host.innerHTML = _header(days) +
      '<div class="gm-widget-loading">Carregando…</div>'
  }

  function _renderError(host, days, msg) {
    host.innerHTML = _header(days) +
      '<div class="gm-widget-err">Falha ao carregar payback: ' + _esc(msg || 'erro desconhecido') + '</div>'
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
    var totalInd = _num(payload.total_indications != null ? payload.total_indications : payload.indications)
    var closedInd = _num(payload.closed_indications != null ? payload.closed_indications : payload.closed)

    var roi = payload.roi_pct != null ? Number(payload.roi_pct) : (cost > 0 ? ((revenue - cost) / cost) * 100 : 0)
    var payback = payload.avg_payback_days != null ? Number(payload.avg_payback_days) : Number(payload.payback_days)

    if (totalInd === 0 && revenue === 0 && cost === 0) {
      host.innerHTML = _header(days) +
        '<div class="gm-empty">Sem dados de payback no período.</div>'
      return
    }

    var roiColor = roi > 0 ? 'var(--green, #10b981)' : (roi < 0 ? 'var(--red, #ef4444)' : 'var(--ink-muted)')
    var roiSign = roi > 0 ? '+' : ''

    var grid = '' +
      '<div class="gm-kpi-grid">' +
        '<div class="gm-kpi">' +
          '<div class="gm-kpi-label">ROI</div>' +
          '<div class="gm-kpi-value" style="color:' + roiColor + '">' +
            _esc(roiSign + _fmtPct(roi)) + '%</div>' +
          '<div class="gm-kpi-sub">retorno sobre custo</div>' +
        '</div>' +
        '<div class="gm-kpi">' +
          '<div class="gm-kpi-label">Payback médio</div>' +
          '<div class="gm-kpi-value">' + _esc(_fmtDays(payback)) +
            (isNaN(Number(payback)) ? '' : ' <span style="font-size:13px;color:var(--ink-muted);font-weight:400">dias</span>') +
            '</div>' +
          '<div class="gm-kpi-sub">até recuperar investimento</div>' +
        '</div>' +
      '</div>'

    var sub = '<div class="gm-widget-sub" style="margin-top:10px">' +
      'R$ ' + _esc(_fmtBrl(revenue)) + ' revenue / R$ ' + _esc(_fmtBrl(cost)) + ' custo' +
      ' (' + _esc(totalInd) + ' indicaç' + (totalInd === 1 ? 'ão' : 'ões') +
      ', ' + _esc(closedInd) + ' fechada' + (closedInd === 1 ? '' : 's') + ')' +
      '</div>'

    host.innerHTML = _header(days) + grid + sub
  }

  async function mount(hostId, days, partnerId) {
    var host = document.getElementById(hostId)
    if (!host) return
    var period = Number(days) || 90
    _renderLoading(host, period)
    try {
      if (!window.GrowthMetricsRepository) throw new Error('GrowthMetricsRepository ausente')
      var data = await window.GrowthMetricsRepository.payback(period, partnerId || null)
      _renderData(host, period, data)
    } catch (err) {
      _renderError(host, period, err && err.message)
    }
  }

  window.VpiPaybackWidget = Object.freeze({ mount: mount })
})()
