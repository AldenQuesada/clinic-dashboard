/**
 * LP Builder · Analytics Dashboard
 *
 * Dashboard agregado de todas as LPs: totais, por página, por dia (leads),
 * top views, top conversion rate.
 *
 * Independente — testável isolado:
 *   var data = await LPBAnalytics.fetchGlobal(30)
 *   LPBAnalytics.exportCsv(data)
 *   LPBAnalytics.open()
 *
 * 0 deps cruzadas. Usa apenas o endpoint Supabase.
 */
;(function () {
  'use strict'
  if (window.LPBAnalytics) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  var SB_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'

  function _rpc(name, params) {
    return fetch(SB_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params || {})
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    })
  }

  // ────────────────────────────────────────────────────────────
  // API pública
  // ────────────────────────────────────────────────────────────
  function fetchGlobal(periodDays) {
    return _rpc('lp_analytics_global', { p_period_days: periodDays || 30 })
  }

  function exportCsv(data) {
    if (!data || !data.by_page) return
    function csvEsc(v) {
      if (v == null) return ''
      var s = String(v)
      if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }
    var headers = ['Slug', 'Título', 'Status', 'Views', 'Conversões', 'Taxa %', 'Leads (período)']
    var rows = data.by_page.map(function (p) {
      return [p.slug, p.title, p.status, p.views, p.conversions, p.rate, p.leads_period].map(csvEsc).join(',')
    })
    var csv = headers.join(',') + '\n' + rows.join('\n')
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = 'lp-analytics-' + new Date().toISOString().slice(0, 10) + '.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ────────────────────────────────────────────────────────────
  // Modal UI
  // ────────────────────────────────────────────────────────────
  var _currentPeriod = 30
  var _sortKey = 'views'
  var _sortDir = 'desc'

  function open() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbAnBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:960px;max-height:92vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Analytics · Todas as LPs</h3>' +
            '<button class="lpb-btn-icon" id="lpbAnClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="padding:12px 18px;background:var(--lpb-surface-2);border-bottom:1px solid var(--lpb-border);display:flex;align-items:center;gap:10px">' +
            '<span style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3)">Período:</span>' +
            _periodBtn(7)  +
            _periodBtn(30) +
            _periodBtn(90) +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn ghost sm" id="lpbAnCsv">' + _ico('download', 12) + ' Exportar CSV</button>' +
            '<button class="lpb-btn ghost sm" id="lpbAnReload">' + _ico('rotate-cw', 12) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body" id="lpbAnBody" style="flex:1;overflow:auto;padding:0">' +
            '<div style="padding:60px;text-align:center;color:var(--lpb-text-3);font-style:italic">Carregando métricas...</div>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg    = document.getElementById('lpbAnBg')
    var close = document.getElementById('lpbAnClose')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss

    document.getElementById('lpbAnReload').onclick = _loadAndRender
    _attachPeriod()
    _loadAndRender()
  }

  function _periodBtn(days) {
    var active = _currentPeriod === days
    return '<button class="lpb-period-btn" data-period="' + days + '" ' +
      'style="background:' + (active ? 'var(--lpb-accent)' : 'transparent') + ';' +
      'border:1px solid ' + (active ? 'var(--lpb-accent)' : 'var(--lpb-border)') + ';' +
      'color:' + (active ? '#1A1A1C' : 'var(--lpb-text-2)') + ';' +
      'padding:5px 12px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;cursor:pointer">' +
      days + 'd</button>'
  }

  function _attachPeriod() {
    document.querySelectorAll('.lpb-period-btn').forEach(function (b) {
      b.onclick = function () {
        _currentPeriod = parseInt(b.dataset.period, 10) || 30
        // re-render buttons
        var bar = b.parentElement
        bar.querySelectorAll('.lpb-period-btn').forEach(function (x) {
          var v = parseInt(x.dataset.period, 10)
          var active = v === _currentPeriod
          x.style.background = active ? 'var(--lpb-accent)' : 'transparent'
          x.style.borderColor = active ? 'var(--lpb-accent)' : 'var(--lpb-border)'
          x.style.color = active ? '#1A1A1C' : 'var(--lpb-text-2)'
        })
        _loadAndRender()
      }
    })
  }

  var _cachedData = null
  async function _loadAndRender() {
    var body = document.getElementById('lpbAnBody')
    if (!body) return
    body.innerHTML = '<div style="padding:60px;text-align:center;color:var(--lpb-text-3);font-style:italic">Carregando métricas...</div>'
    try {
      _cachedData = await fetchGlobal(_currentPeriod)
      _renderBody(_cachedData)
    } catch (e) {
      body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--lpb-danger)">Erro: ' + _esc(e.message) + '</div>'
    }
    var csv = document.getElementById('lpbAnCsv')
    if (csv) csv.onclick = function () {
      exportCsv(_cachedData)
      LPBToast && LPBToast('CSV exportado', 'success')
    }
  }

  function _renderBody(data) {
    var body = document.getElementById('lpbAnBody')
    if (!body) return
    var t = data.totals || {}

    body.innerHTML = '' +
      // Totais
      '<div style="padding:24px 20px;background:var(--lpb-bg);border-bottom:1px solid var(--lpb-border);display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:18px">' +
        _bigStat(t.pages || 0,                'LPs publicadas', 'var(--lpb-accent)') +
        _bigStat(t.views || 0,                'Views total',     'var(--lpb-text)') +
        _bigStat(t.leads || 0,                'Leads (período)', 'var(--lpb-success)') +
        _bigStat((t.conversion_rate_pct || 0) + '%', 'Conversão',  'var(--lpb-warn)') +
      '</div>' +

      // Gráfico leads por dia
      ((data.by_day && data.by_day.length)
        ? '<div style="padding:14px 20px;border-bottom:1px solid var(--lpb-border)">' +
            '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);margin-bottom:12px">Leads por dia · últimos ' + data.period_days + 'd</div>' +
            _renderSparkbar(data.by_day) +
          '</div>'
        : '') +

      // Tabela por página
      '<div style="padding:14px 20px 4px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3)">Por página</div>' +
      _renderPageTable(data.by_page || []) +

      // Top lists
      '<div style="padding:18px 20px;display:grid;grid-template-columns:1fr 1fr;gap:24px;border-top:1px solid var(--lpb-border);margin-top:10px">' +
        '<div>' +
          '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);margin-bottom:10px">Top views</div>' +
          _renderTopList(data.top_views || [], 'views', ' views') +
        '</div>' +
        '<div>' +
          '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);margin-bottom:10px">Top conversão</div>' +
          _renderTopList(data.top_rate || [], 'rate', '%') +
        '</div>' +
      '</div>'

    // Wire sortable headers
    body.querySelectorAll('[data-sort]').forEach(function (th) {
      th.onclick = function () {
        var k = th.dataset.sort
        if (_sortKey === k) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc'
        else { _sortKey = k; _sortDir = 'desc' }
        _renderBody(_cachedData)
      }
    })
    // Click em linha → abre a LP no editor
    body.querySelectorAll('[data-open-lp]').forEach(function (row) {
      row.onclick = function () {
        var id = row.dataset.openLp
        if (window.LPBuilder) {
          LPBuilder.loadPage(id).catch(function () {})
          document.getElementById('lpbModalRoot').innerHTML = ''
        }
      }
    })
  }

  function _bigStat(value, label, color) {
    return '<div style="text-align:center">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:40px;font-weight:300;font-style:italic;color:' + color + ';line-height:1">' +
        _esc(String(value)) +
      '</div>' +
      '<div style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--lpb-text-3);margin-top:6px">' +
        _esc(label) +
      '</div>' +
    '</div>'
  }

  function _renderSparkbar(data) {
    if (!data.length) return '<div style="color:var(--lpb-text-3);font-style:italic;font-size:12px">Sem dados no período.</div>'
    var max = Math.max.apply(null, data.map(function (d) { return d.leads }))
    if (max === 0) max = 1
    return '<div style="display:flex;align-items:flex-end;gap:3px;height:80px;border-bottom:1px solid var(--lpb-border)">' +
      data.map(function (d) {
        var h = (d.leads / max) * 100
        var date = new Date(d.date)
        return '<div style="flex:1;background:var(--lpb-accent);height:' + h + '%;min-height:2px;opacity:.8;position:relative" title="' +
          date.toLocaleDateString('pt-BR') + ': ' + d.leads + ' lead(s)"></div>'
      }).join('') +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--lpb-text-3);margin-top:6px;letter-spacing:.1em">' +
        '<span>' + new Date(data[0].date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + '</span>' +
        '<span>' + new Date(data[data.length - 1].date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + '</span>' +
      '</div>'
  }

  function _renderPageTable(pages) {
    if (!pages.length) {
      return '<div style="padding:30px;text-align:center;color:var(--lpb-text-3);font-style:italic;font-size:13px">Nenhuma LP ativa.</div>'
    }
    // Sort
    var sorted = pages.slice().sort(function (a, b) {
      var av = a[_sortKey], bv = b[_sortKey]
      if (av == null) av = 0; if (bv == null) bv = 0
      return _sortDir === 'asc' ? av - bv : bv - av
    })
    function sortArrow(k) {
      return _sortKey === k ? (_sortDir === 'asc' ? ' ↑' : ' ↓') : ''
    }
    var headers = ''
      + '<th style="text-align:left;padding:10px 14px;cursor:default">LP</th>'
      + '<th data-sort="views" style="text-align:right;padding:10px 14px;cursor:pointer;white-space:nowrap">Views' + sortArrow('views') + '</th>'
      + '<th data-sort="conversions" style="text-align:right;padding:10px 14px;cursor:pointer;white-space:nowrap">Conv.' + sortArrow('conversions') + '</th>'
      + '<th data-sort="rate" style="text-align:right;padding:10px 14px;cursor:pointer;white-space:nowrap">Taxa %' + sortArrow('rate') + '</th>'
      + '<th data-sort="leads_period" style="text-align:right;padding:10px 14px;cursor:pointer;white-space:nowrap">Leads' + sortArrow('leads_period') + '</th>'

    var rows = sorted.map(function (p) {
      var statusColor = p.status === 'published' ? 'var(--lpb-success)' : 'var(--lpb-warn)'
      return '<tr data-open-lp="' + _esc(p.id) + '" style="border-top:1px solid var(--lpb-border);cursor:pointer;transition:background .12s">' +
        '<td style="padding:10px 14px;font-size:12px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          '<span style="display:inline-block;width:6px;height:6px;border-radius:100%;background:' + statusColor + ';margin-right:8px"></span>' +
          _esc(p.title) +
          '<small style="color:var(--lpb-text-3);font-size:10px;margin-left:6px">/' + _esc(p.slug) + '</small>' +
        '</td>' +
        '<td style="text-align:right;padding:10px 14px;font-family:monospace;font-size:12px;color:var(--lpb-text)">' + (p.views || 0) + '</td>' +
        '<td style="text-align:right;padding:10px 14px;font-family:monospace;font-size:12px;color:var(--lpb-text-2)">' + (p.conversions || 0) + '</td>' +
        '<td style="text-align:right;padding:10px 14px;font-family:monospace;font-size:12px;color:' +
          (p.rate >= 5 ? 'var(--lpb-success)' : (p.rate > 0 ? 'var(--lpb-accent)' : 'var(--lpb-text-3)')) + '">' + (p.rate || 0) + '%</td>' +
        '<td style="text-align:right;padding:10px 14px;font-family:monospace;font-size:12px;color:var(--lpb-success);font-weight:500">' + (p.leads_period || 0) + '</td>' +
      '</tr>'
    }).join('')

    return '<table style="width:100%;border-collapse:collapse;font-family:Montserrat,sans-serif">' +
      '<thead style="background:var(--lpb-surface-2)"><tr style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);font-weight:600">' + headers + '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>'
  }

  function _renderTopList(items, key, suffix) {
    if (!items.length) {
      return '<div style="color:var(--lpb-text-3);font-style:italic;font-size:12px">Sem dados suficientes.</div>'
    }
    return items.map(function (it, i) {
      return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--lpb-border);font-size:12px;gap:10px">' +
        '<div style="color:var(--lpb-text-3);font-family:Cormorant Garamond,serif;font-style:italic;width:20px;flex-shrink:0">' + (i + 1) + '.</div>' +
        '<div style="flex:1;color:var(--lpb-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(it.title) + '</div>' +
        '<strong style="color:var(--lpb-accent);font-family:monospace">' + (it[key] || 0) + suffix + '</strong>' +
        '</div>'
    }).join('')
  }

  window.LPBAnalytics = Object.freeze({
    fetchGlobal: fetchGlobal,
    exportCsv:   exportCsv,
    open:        open,
  })
})()
