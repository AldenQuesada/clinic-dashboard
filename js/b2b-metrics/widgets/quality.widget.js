/**
 * B2BMQualityWidget — ranking de qualidade por parceria B2B.
 * Consome B2BMetricsRepository.quality(days).
 * IIFE puro. Renderiza Top 10 ordenado por conversion_pct desc.
 */
;(function () {
  'use strict'
  if (window.B2BMQualityWidget) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _qClass(k) {
    var map = { ouro: 'b2bm-q-ouro', boa: 'b2bm-q-boa', media: 'b2bm-q-media', baixa: 'b2bm-q-baixa' }
    return map[String(k || '').toLowerCase()] || 'b2bm-q-media'
  }

  function _header(days) {
    return '' +
      '<div class="b2bm-widget-title">Qualidade por parceria · ' + Number(days) + 'd</div>' +
      '<div class="b2bm-widget-sub">Top 10 — volume x conversão</div>'
  }

  function _renderLoading(host, days) {
    host.innerHTML = _header(days) + '<div class="b2bm-widget-loading">Carregando ranking…</div>'
  }

  function _renderError(host, days, err) {
    host.innerHTML = _header(days) +
      '<div class="b2bm-widget-err">Falha ao carregar: ' + _esc(err && err.message ? err.message : err) + '</div>'
  }

  function _renderEmpty(host, days) {
    host.innerHTML = _header(days) +
      '<div class="b2bm-empty">Nenhuma parceria com vouchers no período</div>'
  }

  function _renderList(host, days, partners) {
    var rows = partners.slice(0, 10).map(function (p, i) {
      var pos = i + 1
      var nome = _esc(p.nome || '—')
      var tier = _esc(p.tier || '')
      var pillar = _esc(p.pillar || '')
      var qCls = _qClass(p.quality_class)
      var qTxt = _esc(String(p.quality_class || '—').toUpperCase())
      var total = Number(p.total || 0)
      var closed = Number(p.closed || 0)
      var pct = Number(p.conversion_pct || 0)
      var meta = [tier, pillar].filter(Boolean).join(' · ')
      return '' +
        '<div class="b2bm-quality-row">' +
          '<div class="b2bm-quality-pos">' + pos + '</div>' +
          '<div>' +
            '<div class="b2bm-quality-name">' + nome +
              (tier ? ' <span class="b2bm-quality-class ' + qCls + '" style="margin-left:6px;">' + qTxt + '</span>' : '') +
            '</div>' +
            (meta ? '<div style="font-size:10px;color:var(--ink-muted);letter-spacing:1px;text-transform:uppercase;margin-top:2px;">' + meta + '</div>' : '') +
          '</div>' +
          '<div class="b2bm-quality-num">' + total + '</div>' +
          '<div class="b2bm-quality-num">' + closed + '</div>' +
          '<div class="b2bm-quality-pct">' + pct.toFixed(1) + '%</div>' +
        '</div>'
    }).join('')

    var head = '' +
      '<div class="b2bm-quality-row" style="border-bottom:1px solid var(--line-strong);">' +
        '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);">#</div>' +
        '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);">Parceria</div>' +
        '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);text-align:right;">Total</div>' +
        '<div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);text-align:right;">Resgatados</div>' +
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
      if (!window.B2BMetricsRepository) throw new Error('Repository indisponível')
      var res = await window.B2BMetricsRepository.quality(d)
      var partners = (res && res.partners) || []
      if (!partners.length) return _renderEmpty(host, d)
      _renderList(host, d, partners)
    } catch (err) {
      _renderError(host, d, err)
    }
  }

  window.B2BMQualityWidget = Object.freeze({ mount: mount })
})()
