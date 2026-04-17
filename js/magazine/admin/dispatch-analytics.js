/* ============================================================================
 * Beauty & Health Magazine — Dispatch Analytics Dashboard (A4)
 *
 * Le metricas agregadas via magazine_dispatch_analytics(edition_id) e exibe:
 *   - Cards KPI (enviado, aberto, lido, quiz, conversoes, CTR)
 *   - Funil visual (SVG horizontal): Enviado -> Aberto -> Lido -> Quiz
 *   - Por segmento (tabela)
 *   - Por tipo de dispatch (initial/d1/d7)
 *   - Top 10 leads mais engajadas
 *
 * Expoe: window.MagazineAdmin.DispatchAnalytics
 *   - mount(host, sb) -> controller { open(edition) }
 * ============================================================================ */
;(function () {
  'use strict'

  function mount(host, sb) {
    if (!host) return null
    host.innerHTML = [
      '<div class="da-overlay" data-open="0" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;z-index:9999;align-items:center;justify-content:center">',
      '  <div class="da-modal" style="background:#fff;max-width:1100px;width:95vw;max-height:92vh;overflow:auto;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.3)">',
      '    <div class="da-head" style="display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid #e5ddd2">',
      '      <div style="font-family:Playfair Display,serif;font-weight:700;font-size:18px">Performance da edicao</div>',
      '      <div data-role="edition-label" style="color:#8a8178;font-size:13px;flex:1"></div>',
      '      <button data-act="refresh" title="Recarregar" style="padding:6px 10px;border:1px solid #e5ddd2;border-radius:6px;background:#fff;cursor:pointer;font-size:12px">Atualizar</button>',
      '      <button data-act="close" style="border:none;background:none;font-size:28px;line-height:1;cursor:pointer;color:#555">&times;</button>',
      '    </div>',
      '    <div class="da-body" style="padding:16px 20px" data-role="body">',
      '      <div style="color:#8a8178;padding:40px;text-align:center">Selecione uma edicao.</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('\n')

    var overlay = host.querySelector('.da-overlay')
    var edLabel = host.querySelector('[data-role="edition-label"]')
    var body = host.querySelector('[data-role="body"]')
    var currentEdition = null

    host.querySelector('[data-act="close"]').addEventListener('click', close)
    host.querySelector('[data-act="refresh"]').addEventListener('click', function () { if (currentEdition) load(currentEdition) })
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close() })
    document.addEventListener('keydown', function (e) {
      if (overlay.dataset.open === '1' && e.key === 'Escape') close()
    })

    async function open(edition) {
      currentEdition = edition
      edLabel.textContent = edition ? (edition.title || edition.slug) : ''
      overlay.dataset.open = '1'
      overlay.style.display = 'flex'
      await load(edition)
    }

    function close() {
      overlay.dataset.open = '0'
      overlay.style.display = 'none'
      currentEdition = null
    }

    async function load(edition) {
      body.innerHTML = '<div style="color:#8a8178;padding:40px;text-align:center">Carregando metricas…</div>'
      try {
        var res = await sb.rpc('magazine_dispatch_analytics', { p_edition_id: edition.id })
        if (res.error) throw res.error
        body.innerHTML = render(res.data || {})
      } catch (err) {
        body.innerHTML = '<div style="color:#b91c1c;padding:20px">Erro: ' + escapeHtml(err.message) + '</div>'
      }
    }

    function render(data) {
      var t = data.totals || {}
      var funnel = Array.isArray(data.funnel) ? data.funnel : []
      var bySeg = Array.isArray(data.by_segment) ? data.by_segment : []
      var byTipo = Array.isArray(data.by_tipo) ? data.by_tipo : []
      var top = Array.isArray(data.top_engaged) ? data.top_engaged : []

      return [
        kpiGrid(t),
        '<h3 style="margin:24px 0 8px;font-size:14px;font-weight:700">Funil</h3>',
        funnelSvg(funnel),
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">',
        '  <div>',
        '    <h3 style="margin:0 0 8px;font-size:13px;font-weight:700">Por segmento</h3>',
        segmentTable(bySeg),
        '  </div>',
        '  <div>',
        '    <h3 style="margin:0 0 8px;font-size:13px;font-weight:700">Por tipo de dispatch</h3>',
        tipoTable(byTipo),
        '  </div>',
        '</div>',
        '<h3 style="margin:24px 0 8px;font-size:13px;font-weight:700">Top 10 leads engajadas</h3>',
        topTable(top),
      ].join('\n')
    }

    function kpiGrid(t) {
      var cards = [
        { label: 'Enviado', val: fmt(t.sent), sub: t.dispatches_done + ' campanhas' },
        { label: 'Abertos', val: fmt(t.opened), sub: t.ctr + '% CTR' },
        { label: 'Lido (80%)', val: fmt(t.completed), sub: t.read_rate + '% / abertos' },
        { label: 'Quiz', val: fmt(t.quiz_done), sub: t.quiz_rate + '% / abertos' },
        { label: 'Conversoes', val: fmt(t.converted), sub: 'Leadt > appt pos leitura' },
        { label: 'Tempo medio', val: ((t.avg_time_sec || 0) / 60).toFixed(1) + ' min', sub: 'por leitora' },
      ]
      return [
        '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px">',
        cards.map(function (c) {
          return [
            '<div style="background:#f7f3ec;padding:12px;border-radius:8px;border:1px solid #e5ddd2">',
            '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a8178">' + escapeHtml(c.label) + '</div>',
            '<div style="font-family:Playfair Display,serif;font-size:26px;font-weight:700;margin-top:4px">' + escapeHtml(String(c.val || 0)) + '</div>',
            '<div style="font-size:10px;color:#8a8178;margin-top:2px">' + escapeHtml(c.sub || '') + '</div>',
            '</div>',
          ].join('')
        }).join(''),
        '</div>',
      ].join('')
    }

    function funnelSvg(f) {
      if (!f.length) return '<div style="color:#8a8178">Sem dados.</div>'
      var maxVal = Math.max.apply(null, f.map(function (x) { return x.value || 0 }).concat([1]))
      var W = 800, H = 40, gap = 8
      var parts = f.map(function (step, i) {
        var pct = maxVal ? (step.value / maxVal) : 0
        var width = Math.max(pct * (W - 100), 60)
        var color = ['#1a1a1a','#7a1f2b','#b45309','#2d7a43'][i] || '#555'
        return [
          '<g transform="translate(0,' + (i * (H + gap)) + ')">',
          '<rect x="0" y="0" width="' + width + '" height="' + H + '" rx="6" fill="' + color + '" />',
          '<text x="12" y="' + (H / 2 + 5) + '" fill="#fff" font-size="12" font-weight="600">' + escapeHtml(step.step) + '</text>',
          '<text x="' + (width + 12) + '" y="' + (H / 2 + 5) + '" fill="#1a1a1a" font-size="13" font-weight="700">' + fmt(step.value) + '</text>',
          '</g>',
        ].join('')
      }).join('')
      var totalH = f.length * (H + gap)
      return '<svg viewBox="0 0 ' + W + ' ' + totalH + '" width="100%" style="max-width:720px">' + parts + '</svg>'
    }

    function segmentTable(rows) {
      if (!rows.length) return '<div style="color:#8a8178;font-size:13px">Sem dados de leitura.</div>'
      return [
        '<table style="width:100%;border-collapse:collapse;font-size:12px">',
        '<thead><tr style="text-align:left;border-bottom:1px solid #e5ddd2">',
        '<th style="padding:6px 8px">Segmento</th><th style="padding:6px 8px">Leitoras</th><th style="padding:6px 8px">Abriu</th><th style="padding:6px 8px">Leu</th><th style="padding:6px 8px">Quiz</th>',
        '</tr></thead><tbody>',
        rows.map(function (r) {
          return '<tr style="border-bottom:1px solid #f1ece3">' +
            '<td style="padding:6px 8px;text-transform:capitalize">' + escapeHtml(r.segment || '—') + '</td>' +
            '<td style="padding:6px 8px">' + fmt(r.leads) + '</td>' +
            '<td style="padding:6px 8px">' + fmt(r.opened) + '</td>' +
            '<td style="padding:6px 8px">' + fmt(r.completed) + '</td>' +
            '<td style="padding:6px 8px">' + fmt(r.quiz_done) + '</td>' +
          '</tr>'
        }).join(''),
        '</tbody></table>',
      ].join('')
    }

    function tipoTable(rows) {
      if (!rows.length) return '<div style="color:#8a8178;font-size:13px">Nenhuma campanha concluida.</div>'
      return [
        '<table style="width:100%;border-collapse:collapse;font-size:12px">',
        '<thead><tr style="text-align:left;border-bottom:1px solid #e5ddd2">',
        '<th style="padding:6px 8px">Tipo</th><th style="padding:6px 8px">Campanhas</th><th style="padding:6px 8px">Enviados</th><th style="padding:6px 8px">Total leads</th>',
        '</tr></thead><tbody>',
        rows.map(function (r) {
          return '<tr style="border-bottom:1px solid #f1ece3">' +
            '<td style="padding:6px 8px">' + escapeHtml(r.tipo) + '</td>' +
            '<td style="padding:6px 8px">' + fmt(r.dispatches) + '</td>' +
            '<td style="padding:6px 8px">' + fmt(r.sent) + '</td>' +
            '<td style="padding:6px 8px">' + fmt(r.total_leads) + '</td>' +
          '</tr>'
        }).join(''),
        '</tbody></table>',
      ].join('')
    }

    function topTable(rows) {
      if (!rows.length) return '<div style="color:#8a8178;font-size:13px">Sem leitoras engajadas ainda.</div>'
      return [
        '<table style="width:100%;border-collapse:collapse;font-size:12px">',
        '<thead><tr style="text-align:left;border-bottom:1px solid #e5ddd2">',
        '<th style="padding:6px 8px">#</th><th style="padding:6px 8px">Lead</th><th style="padding:6px 8px">Segmento</th><th style="padding:6px 8px">Tempo</th><th style="padding:6px 8px">Paginas</th><th style="padding:6px 8px">Extras</th>',
        '</tr></thead><tbody>',
        rows.map(function (r, i) {
          var extras = []
          if (r.quiz_completed) extras.push('quiz')
          if (r.hidden_icon_found) extras.push('hidden')
          if (r.shared) extras.push('shared')
          return '<tr style="border-bottom:1px solid #f1ece3">' +
            '<td style="padding:6px 8px;color:#8a8178">' + (i + 1) + '</td>' +
            '<td style="padding:6px 8px">' + escapeHtml(r.lead_name) + '</td>' +
            '<td style="padding:6px 8px">' + escapeHtml(r.segment || '—') + '</td>' +
            '<td style="padding:6px 8px">' + ((r.time_spent_sec || 0) / 60).toFixed(1) + ' min</td>' +
            '<td style="padding:6px 8px">' + (r.pages_done || 0) + '</td>' +
            '<td style="padding:6px 8px;font-size:11px;color:#555">' + escapeHtml(extras.join(' · ')) + '</td>' +
          '</tr>'
        }).join(''),
        '</tbody></table>',
      ].join('')
    }

    function fmt(v) { return v == null ? 0 : v }
    function escapeHtml(s) {
      if (s == null) return ''
      return String(s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
      })
    }

    return { open: open, close: close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.DispatchAnalytics = { mount: mount }
})()
