/**
 * VpiQualityWidget — ranking de qualidade por embaixadora.
 * Consome GrowthMetricsRepository.quality(days).
 * IIFE puro. Renderiza tabela Top 10 ordenada por conversão desc.
 */
;(function () {
  'use strict'
  if (window.VpiQualityWidget) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _qClass(k) {
    var map = { ouro: 'gm-q-ouro', boa: 'gm-q-boa', media: 'gm-q-media', baixa: 'gm-q-baixa' }
    return map[String(k || '').toLowerCase()] || 'gm-q-media'
  }

  function _header(days) {
    return '' +
      '<div class="gm-widget-title">Qualidade por embaixadora · ' + Number(days) + 'd</div>' +
      '<div class="gm-widget-sub">Top 10 — volume x conversão</div>'
  }

  function _renderLoading(host, days) {
    host.innerHTML = _header(days) + '<div class="gm-widget-loading">Carregando ranking…</div>'
  }

  function _renderError(host, days, err) {
    host.innerHTML = _header(days) +
      '<div class="gm-widget-err">Falha ao carregar: ' + _esc(err && err.message ? err.message : err) + '</div>'
  }

  function _renderEmpty(host, days) {
    host.innerHTML = _header(days) +
      '<div class="gm-empty">Nenhuma embaixadora com indicações no período</div>'
  }

  function _renderList(host, days, partners) {
    var rows = partners.slice(0, 10).map(function (p, i) {
      var pos = i + 1
      var nome = _esc(p.nome || '—')
      var tier = _esc(p.tier || '')
      var qCls = _qClass(p.quality_class)
      var qTxt = _esc(String(p.quality_class || '—').toUpperCase())
      var total = Number(p.total || 0)
      var closed = Number(p.closed || 0)
      var pct = Number(p.conversion_pct || 0)
      return '' +
        '<div class="gm-quality-row">' +
          '<div class="gm-quality-pos">' + pos + '</div>' +
          '<div>' +
            '<div class="gm-quality-name">' + nome + (tier ? ' <span class="gm-quality-class ' + qCls + '" style="margin-left:6px;">' + qTxt + '</span>' : '') + '</div>' +
            (tier ? '<div style="font-size:10px;color:var(--ink-muted);letter-spacing:1px;text-transform:uppercase;margin-top:2px;">' + tier + '</div>' : '') +
          '</div>' +
          '<div class="gm-quality-num">' + total + '</div>' +
          '<div class="gm-quality-num">' + closed + '</div>' +
          '<div class="gm-quality-pct">' + pct.toFixed(1) + '%</div>' +
        '</div>'
    }).join('')

    var head = '' +
      '<div class="gm-quality-row" style="border-bottom:1px solid var(--line-strong);">' +
        '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);">#</div>' +
        '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);">Embaixadora</div>' +
        '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);text-align:right;">Total</div>' +
        '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);text-align:right;">Fechadas</div>' +
        '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);text-align:right;">Conv</div>' +
      '</div>'

    host.innerHTML = _header(days) + head + rows
  }

  async function mount(hostId, days) {
    var host = document.getElementById(hostId)
    if (!host) return
    var d = Number(days) || 90
    _renderLoading(host, d)
    try {
      if (!window.GrowthMetricsRepository) throw new Error('Repository indisponível')
      var res = await window.GrowthMetricsRepository.quality(d)
      var partners = (res && res.partners) || []
      if (!partners.length) return _renderEmpty(host, d)
      _renderList(host, d, partners)
    } catch (err) {
      _renderError(host, d, err)
    }
  }

  window.VpiQualityWidget = Object.freeze({ mount: mount })
})()
