/**
 * B2BMFunnelWidget — funil de conversão de parcerias B2B.
 * Consome B2BMetricsRepository.funnel(days, partnerId) → RPC b2b_funnel_breakdown.
 * Renderiza 5 etapas (candidatos → ativas) com barra, drop-off e closed como side-info.
 */
;(function () {
  'use strict'
  if (window.B2BMFunnelWidget) return

  var STAGES = [
    { key: 'candidatos', label: 'CANDIDATOS', dropFrom: null },
    { key: 'prospect',   label: 'PROSPECT',   dropFrom: 'candidato_to_prospect' },
    { key: 'dna_check',  label: 'DNA CHECK',  dropFrom: 'prospect_to_dna' },
    { key: 'contract',   label: 'CONTRATO',   dropFrom: 'dna_to_contract' },
    { key: 'active',     label: 'ATIVAS',     dropFrom: 'contract_to_active' },
  ]

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _header(days) {
    return '' +
      '<div class="b2bm-widget-title">Funil de conversão · ' + _esc(days) + 'd</div>' +
      '<div class="b2bm-widget-sub">Candidatos → Prospect → DNA → Contrato → Ativas</div>'
  }

  function _renderLoading(host, days) {
    host.innerHTML = _header(days) +
      '<div class="b2bm-widget-loading">Carregando…</div>'
  }

  function _renderError(host, days, msg) {
    host.innerHTML = _header(days) +
      '<div class="b2bm-widget-err">Falha ao carregar funil: ' + _esc(msg || 'erro desconhecido') + '</div>'
  }

  function _renderData(host, days, data) {
    var total = Number(data && data.candidatos) || 0
    if (total === 0) {
      host.innerHTML = _header(days) +
        '<div class="b2bm-empty">Sem candidatos no período.</div>'
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
          dropHtml = '<div class="b2bm-funnel-drop">drop ' + _esc(dropVal) + '%</div>'
        } else {
          dropHtml = '<div class="b2bm-funnel-drop" style="visibility:hidden">drop 0%</div>'
        }
      }
      return '' +
        '<div class="b2bm-funnel-row">' +
          '<div class="b2bm-funnel-label">' + _esc(st.label) + '</div>' +
          '<div class="b2bm-funnel-bar">' +
            '<div class="b2bm-funnel-fill" style="width:' + pct.toFixed(1) + '%"></div>' +
          '</div>' +
          '<div>' +
            '<div class="b2bm-funnel-value">' + _esc(value) + '</div>' +
            dropHtml +
          '</div>' +
        '</div>'
    }).join('')

    var conv = Number(data.conversion_rate)
    if (isNaN(conv)) {
      conv = total > 0 ? Math.round(1000 * (Number(data.active) || 0) / total) / 10 : 0
    }
    var summary = '' +
      '<div class="b2bm-funnel-row" style="border-top:1px solid var(--line);margin-top:10px;padding-top:12px">' +
        '<div class="b2bm-funnel-label" style="color:var(--champagne)">CONVERSÃO TOTAL</div>' +
        '<div style="font-size:11px;color:var(--ink-muted);letter-spacing:1px">CANDIDATOS → ATIVAS</div>' +
        '<div class="b2bm-funnel-value" style="color:var(--champagne-light);font-size:16px">' +
          _esc(conv) + '%' +
        '</div>' +
      '</div>'

    var closed = Number(data.closed) || 0
    var closedInfo = ''
    if (closed > 0) {
      closedInfo = '' +
        '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);' +
          'display:flex;justify-content:space-between;align-items:center;' +
          'font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted)">' +
          '<span>Encerradas no período</span>' +
          '<span style="color:var(--ink-soft);font-weight:600">' + _esc(closed) + '</span>' +
        '</div>'
    }

    host.innerHTML = _header(days) + rows + summary + closedInfo
  }

  async function mount(hostId, days, partnerId) {
    var host = document.getElementById(hostId)
    if (!host) return
    var period = Number(days) || 30
    _renderLoading(host, period)
    try {
      if (!window.B2BMetricsRepository) throw new Error('B2BMetricsRepository ausente')
      var data = await window.B2BMetricsRepository.funnel(period, partnerId || null)
      _renderData(host, period, data || {})
    } catch (err) {
      _renderError(host, period, err && err.message)
    }
  }

  window.B2BMFunnelWidget = Object.freeze({ mount: mount })
})()
