/**
 * VpiDropoffWidget — leads em risco (7d+ sem resposta).
 * Consome GrowthMetricsRepository.dropoff(days).
 * IIFE puro.
 */
;(function () {
  'use strict'
  if (window.VpiDropoffWidget) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _header() {
    return '' +
      '<div class="gm-widget-title">Leads em risco · 7d+ sem resposta</div>' +
      '<div class="gm-widget-sub">Recuperar antes que esfriem</div>'
  }

  function _renderLoading(host) {
    host.innerHTML = _header() + '<div class="gm-widget-loading">Buscando leads…</div>'
  }

  function _renderError(host, err) {
    host.innerHTML = _header() +
      '<div class="gm-widget-err">Falha ao carregar: ' + _esc(err && err.message ? err.message : err) + '</div>'
  }

  function _renderEmpty(host) {
    host.innerHTML = _header() +
      '<div class="gm-empty">Nenhum lead em risco ✓</div>'
  }

  function _renderList(host, leads) {
    var visible = leads.slice(0, 8)
    var extra = leads.length - visible.length
    var rows = visible.map(function (l) {
      var nome = _esc(l.lead_name || '—')
      var partner = _esc(l.partner_name || '—')
      var stage = _esc(String(l.funnel_stage || '').toLowerCase())
      var days = Number(l.days_since || 0)
      return '' +
        '<div class="gm-dropoff-item">' +
          '<div>' +
            '<div class="gm-dropoff-name">' + nome + '</div>' +
            '<div class="gm-dropoff-meta">indicada por ' + partner + (stage ? ' · ' + stage : '') + '</div>' +
          '</div>' +
          '<div class="gm-dropoff-days">' + days + 'd</div>' +
        '</div>'
    }).join('')

    var footer = extra > 0
      ? '<div class="gm-kpi-sub" style="margin-top:10px;">+ ' + extra + ' outros leads em risco</div>'
      : ''

    host.innerHTML = _header() + rows + footer
  }

  async function mount(hostId) {
    var host = document.getElementById(hostId)
    if (!host) return
    _renderLoading(host)
    try {
      if (!window.GrowthMetricsRepository) throw new Error('Repository indisponível')
      var res = await window.GrowthMetricsRepository.dropoff(7)
      var leads = (res && res.leads) || []
      if (!leads.length) return _renderEmpty(host)
      _renderList(host, leads)
    } catch (err) {
      _renderError(host, err)
    }
  }

  window.VpiDropoffWidget = Object.freeze({ mount: mount })
})()
