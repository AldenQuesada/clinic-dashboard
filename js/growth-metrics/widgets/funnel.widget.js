/**
 * VpiFunnelWidget — funil de conversão do Programa de Indicação.
 * Consome GrowthMetricsRepository.funnel(days) → RPC vpi_funnel_breakdown.
 * Renderiza 6 etapas (created → closed) com barra, drop-off e conversão total.
 */
;(function () {
  'use strict'
  if (window.VpiFunnelWidget) return

  var STAGES = [
    { key: 'created',   label: 'INDICADAS',  dropFrom: null },
    { key: 'contacted', label: 'CONTATADAS', dropFrom: 'created_to_contacted' },
    { key: 'responded', label: 'RESPONDERAM', dropFrom: 'contacted_to_responded' },
    { key: 'scheduled', label: 'AGENDARAM',  dropFrom: 'responded_to_scheduled' },
    { key: 'showed',    label: 'COMPARECERAM', dropFrom: 'scheduled_to_showed' },
    { key: 'closed',    label: 'FECHARAM',   dropFrom: 'showed_to_closed' },
  ]

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _header(days) {
    return '' +
      '<div class="gm-widget-title">Funil de conversão</div>' +
      '<div class="gm-widget-sub">Últimos ' + _esc(days) + ' dias</div>'
  }

  function _renderLoading(host, days) {
    host.innerHTML = _header(days) +
      '<div class="gm-widget-loading">Carregando…</div>'
  }

  function _renderError(host, days, msg) {
    host.innerHTML = _header(days) +
      '<div class="gm-widget-err">Falha ao carregar funil: ' + _esc(msg || 'erro desconhecido') + '</div>'
  }

  function _renderData(host, days, data) {
    var total = Number(data && data.created) || 0
    if (total === 0) {
      host.innerHTML = _header(days) +
        '<div class="gm-empty">Sem indicações no período.</div>'
      return
    }
    var dropoff = (data && data.dropoff) || {}
    var rows = STAGES.map(function (st) {
      var value = Number(data[st.key]) || 0
      var pct = total > 0 ? (100 * value / total) : 0
      var dropHtml = ''
      if (st.dropFrom) {
        var dropVal = Number(dropoff[st.dropFrom])
        if (!isNaN(dropVal) && dropVal > 0) {
          dropHtml = '<div class="gm-funnel-drop">drop ' + _esc(dropVal) + '%</div>'
        } else {
          dropHtml = '<div class="gm-funnel-drop" style="visibility:hidden">drop 0%</div>'
        }
      }
      return '' +
        '<div class="gm-funnel-row">' +
          '<div class="gm-funnel-label">' + _esc(st.label) + '</div>' +
          '<div class="gm-funnel-bar">' +
            '<div class="gm-funnel-fill" style="width:' + pct.toFixed(1) + '%"></div>' +
          '</div>' +
          '<div>' +
            '<div class="gm-funnel-value">' + _esc(value) + '</div>' +
            dropHtml +
          '</div>' +
        '</div>'
    }).join('')

    var conv = Number(data.conversion_rate)
    if (isNaN(conv)) {
      conv = total > 0 ? Math.round(1000 * (Number(data.closed) || 0) / total) / 10 : 0
    }
    var summary = '' +
      '<div class="gm-funnel-row" style="border-top:1px solid var(--line);margin-top:10px;padding-top:12px">' +
        '<div class="gm-funnel-label" style="color:var(--champagne)">CONVERSÃO TOTAL</div>' +
        '<div style="font-size:11px;color:var(--ink-muted);letter-spacing:1px">INDICADAS → FECHARAM</div>' +
        '<div class="gm-funnel-value" style="color:var(--champagne-light);font-size:16px">' +
          _esc(conv) + '%' +
        '</div>' +
      '</div>'

    host.innerHTML = _header(days) + rows + summary
  }

  async function mount(hostId, days, partnerId) {
    var host = document.getElementById(hostId)
    if (!host) return
    var period = Number(days) || 30
    _renderLoading(host, period)
    try {
      if (!window.GrowthMetricsRepository) throw new Error('GrowthMetricsRepository ausente')
      var data = await window.GrowthMetricsRepository.funnel(period, partnerId || null)
      _renderData(host, period, data || {})
    } catch (err) {
      _renderError(host, period, err && err.message)
    }
  }

  window.VpiFunnelWidget = Object.freeze({ mount: mount })
})()
