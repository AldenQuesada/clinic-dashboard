/**
 * LP Builder · Heatmap Viewer (Onda 25)
 *
 * Modal admin: scroll depth bars + grid de density (heatmap simplificado).
 * Não desenha overlay sobre LP real — usa visualização agregada simples.
 *
 * API: LPBHeatmapViewer.open(slug)
 */
;(function () {
  'use strict'
  if (window.LPBHeatmapViewer) return

  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }
  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }

  async function open(slug) {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    if (!slug) {
      var p = LPBuilder.getCurrentPage && LPBuilder.getCurrentPage()
      if (p) slug = p.slug
    }
    if (!slug) { LPBToast && LPBToast('Abra uma LP primeiro', 'error'); return }

    var clicks = [], scroll = { total: 0, buckets: [] }
    try {
      var [c, s] = await Promise.all([
        LPBuilder.rpc('lp_interaction_clicks', { p_slug: slug, p_days: 30 }),
        LPBuilder.rpc('lp_interaction_scroll_dist', { p_slug: slug, p_days: 30 }),
      ])
      clicks = Array.isArray(c) ? c : []
      scroll = s || { total: 0, buckets: [] }
    } catch (err) { LPBToast && LPBToast('Erro: ' + err.message, 'error'); return }

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbHmBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:760px;width:96vw;max-height:92vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Heatmap · /' + _esc(slug) + ' <small style="font-weight:400;color:var(--lpb-text-2);margin-left:8px;font-size:11px">últimos 30 dias</small></h3>' +
            '<button class="lpb-btn-icon" id="lpbHmClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body" style="overflow:auto;padding:18px 22px">' +
            _renderScrollBars(scroll) +
            _renderGrid(clicks) +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<div style="font-size:10px;color:var(--lpb-text-2)">' +
              _ico('info', 11) + ' Sampling 1/3 visitantes · TTL 60 dias.' +
            '</div>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn ghost" id="lpbHmDone">Fechar</button>' +
          '</div>' +
        '</div></div>'

    document.getElementById('lpbHmBg').addEventListener('click', _dismiss)
    document.getElementById('lpbHmClose').onclick = _dismiss
    document.getElementById('lpbHmDone').onclick  = _dismiss
  }

  function _renderScrollBars(scroll) {
    var total = scroll.total || 0
    if (!total) {
      return '<div style="padding:30px;text-align:center;color:var(--lpb-text-2);font-size:11px">' +
        _ico('chevrons-down', 22) +
        '<div style="margin-top:10px">Sem dados de scroll ainda.</div>' +
      '</div>'
    }
    // distribuicao cumulativa (% que chegou pelo menos a cada 10%)
    var buckets = scroll.buckets || []
    // converte: bucket = pct mínimo, cnt = visitantes que chegaram exatamente naquele
    // queremos cumulativo decrescente (visitantes que chegaram >= aquele ponto)
    var byPct = {}
    buckets.forEach(function (b) { byPct[b.pct] = b.visitors })
    var rows = []
    for (var pct = 0; pct <= 100; pct += 10) {
      var sum = 0
      for (var p = pct; p <= 100; p += 10) {
        sum += (byPct[p] || 0)
      }
      var ratePct = total > 0 ? Math.round((sum / total) * 100) : 0
      rows.push({ pct: pct, count: sum, ratePct: ratePct })
    }

    var bars = rows.map(function (r) {
      var w = Math.max(2, r.ratePct)
      return '<div style="display:flex;align-items:center;gap:10px;font-size:11px;margin-bottom:4px">' +
        '<div style="width:50px;color:var(--lpb-text-2);font-size:10px;text-align:right">' + r.pct + '%+</div>' +
        '<div style="flex:1;background:var(--lpb-bg);border:1px solid var(--lpb-border);height:18px;position:relative">' +
          '<div style="width:' + w + '%;height:100%;background:var(--lpb-accent);transition:width .3s"></div>' +
          '<div style="position:absolute;inset:0;display:flex;align-items:center;padding:0 8px;font-size:10px;color:var(--lpb-text);font-weight:500">' + r.ratePct + '% · ' + r.count + ' visitantes</div>' +
        '</div>' +
      '</div>'
    }).join('')

    return '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;margin-bottom:10px">Scroll depth · ' + total + ' visitantes únicos</div>' +
      bars +
      '<div style="font-size:10px;color:var(--lpb-text-2);margin-top:8px;font-style:italic">% de visitantes que chegaram pelo menos àquela altura da página.</div>'
  }

  function _renderGrid(clicks) {
    if (!window.LPBHeatmapEngine) return ''
    if (!clicks.length) {
      return '<div style="margin-top:24px;padding:30px;text-align:center;color:var(--lpb-text-2);font-size:11px">' +
        _ico('mouse-pointer', 22) +
        '<div style="margin-top:10px">Sem clicks ainda.</div>' +
      '</div>'
    }
    var grid = LPBHeatmapEngine.gridDensity(clicks, 16)
    var max = 0
    grid.forEach(function (row) { row.forEach(function (v) { if (v > max) max = v }) })
    if (max < 1) max = 1

    var cells = ''
    grid.forEach(function (row) {
      cells += '<tr>'
      row.forEach(function (v) {
        var alpha = v / max
        var bg = 'rgba(200,169,126,' + alpha.toFixed(2) + ')'
        cells += '<td style="background:' + bg + ';width:24px;height:24px;border:1px solid rgba(0,0,0,.04);text-align:center;font-size:9px;color:' + (alpha > 0.5 ? '#fff' : 'var(--lpb-text-2)') + '">' + (v || '') + '</td>'
      })
      cells += '</tr>'
    })

    return '<div style="margin-top:24px">' +
      '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;margin-bottom:10px">Density grid · ' + clicks.length + ' clicks</div>' +
      '<table style="border-collapse:collapse;margin:0 auto">' + cells + '</table>' +
      '<div style="font-size:10px;color:var(--lpb-text-2);margin-top:8px;font-style:italic;text-align:center">Cada célula = região (largura × altura da LP). Mais escuro = mais clicks.</div>' +
    '</div>'
  }

  function _dismiss() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (modalRoot) modalRoot.innerHTML = ''
  }

  window.LPBHeatmapViewer = Object.freeze({ open: open })
})()
