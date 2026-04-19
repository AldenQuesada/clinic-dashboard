/**
 * GrowthExecShell — Dashboard Executivo consolidado B2B + B2C (VPI)
 *
 * Reaproveita GrowthMetricsRepository (VPI) + B2BMetricsRepository (B2B)
 * + B2BInsightRepository para insights IA.
 *
 * Layout:
 *   1. Filtros de preset (Mês atual / Mês passado / YTD)
 *   2. Alertas consolidados top N (ambos lados)
 *   3. 2 cards lado a lado: KPIs B2C | KPIs B2B
 *   4. Comparativo visual (barras duplas: volume, conversão, revenue)
 *   5. Top 10 consolidado unificado (badge B2B/B2C)
 *   6. Insights IA + últimas indicações VPI fechadas
 *
 * IIFE puro. Zero deps. Handles gracefully quando um lado retorna vazio.
 */
;(function () {
  'use strict'
  if (window.GrowthExecShell) return

  var _state = {
    preset: 'month',   // 'month' | 'prev' | 'ytd'
    mountedIn: null,
  }

  // ─────────── helpers ───────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _num(v) { var n = Number(v); return isNaN(n) ? 0 : n }
  function _fmtBrl(v) {
    var n = _num(v)
    try { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
    catch (_) { return n.toFixed(2).replace('.', ',') }
  }
  function _fmtBrlShort(v) {
    var n = _num(v)
    if (n >= 1000000) return (n/1000000).toFixed(1).replace('.', ',') + 'M'
    if (n >= 1000)    return (n/1000).toFixed(1).replace('.', ',') + 'k'
    try { return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) } catch (_) { return String(Math.round(n)) }
  }
  function _fmtPct(v) {
    var n = _num(v)
    return (Math.round(n * 10) / 10).toString().replace('.', ',')
  }

  function _daysThisMonth() { return new Date().getDate() }
  function _daysPrevMonthWindow() {
    var n = new Date()
    var firstThis = new Date(n.getFullYear(), n.getMonth(), 1)
    var lastPrev = new Date(firstThis.getTime() - 86400000)
    var firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1)
    return Math.ceil((n - firstPrev) / 86400000)
  }
  function _daysYTD() {
    var n = new Date()
    var j1 = new Date(n.getFullYear(), 0, 1)
    return Math.max(1, Math.ceil((n - j1) / 86400000))
  }

  function _effectiveDays() {
    if (_state.preset === 'month') return _daysThisMonth()
    if (_state.preset === 'prev')  return _daysPrevMonthWindow()
    if (_state.preset === 'ytd')   return _daysYTD()
    return _daysThisMonth()
  }

  var PRESET_LABEL = {
    month: 'Mês atual',
    prev:  'Mês passado',
    ytd:   'Year-to-date',
  }

  // ─────────── render ───────────
  function _renderHeader() {
    var presets = [
      { key:'month', label:'Mês atual' },
      { key:'prev',  label:'Mês passado' },
      { key:'ytd',   label:'YTD' },
    ]
    return '' +
      '<header class="gx-header">' +
        '<div class="gx-header-top">' +
          '<div>' +
            '<div class="gx-eyebrow">Clínica Mirian de Paula · Growth consolidado</div>' +
            '<h1 class="gx-title">Dashboard <em>Executivo</em></h1>' +
            '<div class="gx-sub">Programa de Indicação (B2C) + Círculo de Parcerias (B2B) lado a lado</div>' +
          '</div>' +
          '<div class="gx-header-ctrl">' +
            '<button type="button" class="gx-reload" id="gxReload">↻ Recarregar</button>' +
          '</div>' +
        '</div>' +
        '<div class="gx-filters">' +
          presets.map(function (p) {
            return '<button type="button" class="gx-period' +
              (_state.preset === p.key ? ' active' : '') +
              '" data-preset="' + p.key + '">' + p.label + '</button>'
          }).join('') +
        '</div>' +
      '</header>'
  }

  function _renderShell() {
    return '' +
      _renderHeader() +
      '<section id="gxAlerts"></section>' +
      '<div class="gx-dual">' +
        '<div class="gx-card gx-card-b2c" id="gxKpisB2c"></div>' +
        '<div class="gx-card gx-card-b2b" id="gxKpisB2b"></div>' +
      '</div>' +
      '<section class="gx-section" id="gxCompare"></section>' +
      '<section class="gx-section" id="gxTop10"></section>' +
      '<section class="gx-section" id="gxInsights"></section>'
  }

  // ─────────── Alertas consolidados ───────────
  var SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 }
  var SEVERITY_LABEL = { critical: 'crítico', warning: 'atenção', info: 'info' }

  function _sevRank(s) { var r = SEVERITY_ORDER[s]; return r == null ? 99 : r }
  function _sevLabel(s) { return SEVERITY_LABEL[s] || _esc(s || '') }

  async function _renderAlerts() {
    var host = document.getElementById('gxAlerts')
    if (!host) return
    host.innerHTML = '<div class="gx-loading">Carregando alertas…</div>'

    var b2cAlerts = [], b2bAlerts = []
    try {
      if (window.GrowthMetricsRepository) {
        var l1 = await window.GrowthMetricsRepository.alertsList(20)
        b2cAlerts = (Array.isArray(l1) ? l1 : []).map(function (a) { a._src = 'b2c'; return a })
      }
    } catch (_) { /* graceful */ }
    try {
      if (window.B2BMetricsRepository) {
        var l2 = await window.B2BMetricsRepository.alertsList(20)
        b2bAlerts = (Array.isArray(l2) ? l2 : []).map(function (a) { a._src = 'b2b'; return a })
      }
    } catch (_) { /* graceful */ }

    var merged = b2cAlerts.concat(b2bAlerts).sort(function (a, b) {
      var ra = _sevRank(a && a.severity)
      var rb = _sevRank(b && b.severity)
      if (ra !== rb) return ra - rb
      var ta = a && (a.created_at || a.createdAt)
      var tb = b && (b.created_at || b.createdAt)
      if (ta && tb) return (ta < tb ? 1 : (ta > tb ? -1 : 0))
      return 0
    }).slice(0, 5)

    if (!merged.length) {
      host.innerHTML =
        '<div class="gx-alerts-header">Alertas consolidados</div>' +
        '<div class="gx-alerts-empty">Sem alertas ativos em nenhum dos programas</div>'
      return
    }

    var html = '<div class="gx-alerts-header">Top ' + merged.length +
      ' alerta' + (merged.length === 1 ? '' : 's') + ' consolidado' + (merged.length === 1 ? '' : 's') +
      ' (B2B + B2C)</div>'
    html += '<div class="gx-alerts">'
    html += merged.map(function (a) {
      var sev = a.severity || 'info'
      var src = a._src === 'b2b' ? 'B2B' : 'B2C'
      var srcCls = a._src === 'b2b' ? 'b2b' : 'b2c'
      var detail = a.detail || a.description || a.message || ''
      var rec = a.recommendation || a.recommended_action || a.action || ''
      return '' +
        '<div class="gx-alert ' + _esc(sev) + '">' +
          '<div class="gx-alert-head">' +
            '<span class="gx-alert-chip">' + _esc(_sevLabel(sev)) + '</span>' +
            '<span class="gx-alert-source ' + srcCls + '">' + src + '</span>' +
            '<span class="gx-alert-title">' + _esc(a.title || '') + '</span>' +
          '</div>' +
          (detail ? '<div class="gx-alert-detail">' + _esc(detail) + '</div>' : '') +
          (rec ? '<div class="gx-alert-detail"><strong>Ação:</strong> ' + _esc(rec) + '</div>' : '') +
        '</div>'
    }).join('')
    html += '</div>'
    host.innerHTML = html
  }

  // ─────────── KPIs side-by-side ───────────
  function _kpiRow(label, value, cls) {
    return '<div class="gx-kpi-row">' +
      '<span class="gx-kpi-label">' + _esc(label) + '</span>' +
      '<span class="gx-kpi-value ' + (cls || '') + '">' + value + '</span>' +
    '</div>'
  }

  function _roiClass(roi) {
    if (roi > 20) return 'pos'
    if (roi < 0)  return 'neg'
    if (roi < 10) return 'warn'
    return ''
  }

  async function _renderKpisB2c(days) {
    var host = document.getElementById('gxKpisB2c')
    if (!host) return
    host.innerHTML =
      '<div class="gx-card-title">B2C · VPI <span class="gx-badge b2c">Embaixadoras</span></div>' +
      '<div class="gx-card-sub">' + _esc(PRESET_LABEL[_state.preset] || '') + ' · ' + days + ' dias</div>' +
      '<div class="gx-loading">Carregando…</div>'

    if (!window.GrowthMetricsRepository) {
      host.innerHTML = host.innerHTML.replace('<div class="gx-loading">Carregando…</div>',
        '<div class="gx-empty">Repository B2C indisponível</div>')
      return
    }

    try {
      var results = await Promise.allSettled([
        window.GrowthMetricsRepository.funnel(days, null),
        window.GrowthMetricsRepository.forecast(20),
        window.GrowthMetricsRepository.payback(days, null),
      ])
      var funnel   = results[0].status === 'fulfilled' ? (results[0].value || {}) : {}
      var forecast = results[1].status === 'fulfilled' ? (results[1].value || {}) : {}
      var payback  = results[2].status === 'fulfilled' ? (results[2].value || {}) : {}

      var totalInd = _num(funnel.total || funnel.total_indications || payback.total_indications || payback.indications)
      var closed   = _num(funnel.closed || funnel.closed_indications || payback.closed_indications || payback.closed)
      var convPct  = totalInd > 0 ? (closed / totalInd) * 100 : 0
      var revenue  = _num(payback.revenue != null ? payback.revenue : payback.total_revenue)
      var cost     = _num(payback.cost != null ? payback.cost : payback.total_cost)
      var roi      = payback.roi_pct != null ? _num(payback.roi_pct)
                   : (cost > 0 ? ((revenue - cost) / cost) * 100 : 0)

      var body =
        _kpiRow('Indicações', totalInd) +
        _kpiRow('Fechadas', closed, 'pos') +
        _kpiRow('Conversão', _fmtPct(convPct) + '%') +
        _kpiRow('Faturamento', 'R$ ' + _fmtBrlShort(revenue)) +
        _kpiRow('ROI', (roi > 0 ? '+' : '') + _fmtPct(roi) + '%', _roiClass(roi))

      // Rodapé com projeção
      var projection = _num(forecast.projection)
      var meta = _num(forecast.meta)
      var footer = ''
      if (meta > 0 || projection > 0) {
        var pct = _num(forecast.pct_of_meta)
        footer = '<div style="margin-top:14px;font-size:11px;color:var(--ink-muted);letter-spacing:1px;">' +
          'Projeção: <strong style="color:var(--ink);">' + projection.toFixed(1) + '</strong> / meta ' + meta +
          ' (' + pct.toFixed(0) + '%)' +
          '</div>'
      }

      host.innerHTML =
        '<div class="gx-card-title">B2C · VPI <span class="gx-badge b2c">Embaixadoras</span></div>' +
        '<div class="gx-card-sub">' + _esc(PRESET_LABEL[_state.preset] || '') + ' · ' + days + ' dias</div>' +
        body + footer
    } catch (err) {
      host.innerHTML =
        '<div class="gx-card-title">B2C · VPI <span class="gx-badge b2c">Embaixadoras</span></div>' +
        '<div class="gx-card-sub">' + _esc(PRESET_LABEL[_state.preset] || '') + '</div>' +
        '<div class="gx-err">Falha: ' + _esc(err && err.message) + '</div>'
    }
  }

  async function _renderKpisB2b(days) {
    var host = document.getElementById('gxKpisB2b')
    if (!host) return
    host.innerHTML =
      '<div class="gx-card-title">B2B <span class="gx-badge b2b">Parcerias</span></div>' +
      '<div class="gx-card-sub">' + _esc(PRESET_LABEL[_state.preset] || '') + ' · ' + days + ' dias</div>' +
      '<div class="gx-loading">Carregando…</div>'

    if (!window.B2BMetricsRepository) {
      host.innerHTML = host.innerHTML.replace('<div class="gx-loading">Carregando…</div>',
        '<div class="gx-empty">Repository B2B indisponível</div>')
      return
    }

    try {
      var results = await Promise.allSettled([
        window.B2BMetricsRepository.funnel(days, null),
        window.B2BMetricsRepository.forecast(3, 30),
        window.B2BMetricsRepository.payback(days, null),
      ])
      var funnel   = results[0].status === 'fulfilled' ? (results[0].value || {}) : {}
      var forecast = results[1].status === 'fulfilled' ? (results[1].value || {}) : {}
      var payback  = results[2].status === 'fulfilled' ? (results[2].value || {}) : {}

      var active   = _num(funnel.active_partnerships || funnel.partnerships || forecast.active_partnerships)
      var issued   = _num(funnel.total || funnel.vouchers_issued || funnel.issued || payback.total_vouchers || payback.issued)
      var redeemed = _num(funnel.closed || funnel.vouchers_redeemed || funnel.redeemed || payback.redeemed_vouchers || payback.redeemed)
      var convPct  = issued > 0 ? (redeemed / issued) * 100 : 0
      var revenue  = _num(payback.revenue != null ? payback.revenue : payback.total_revenue)
      var cost     = _num(payback.cost != null ? payback.cost : payback.total_cost)
      var roi      = payback.roi_pct != null ? _num(payback.roi_pct)
                   : (cost > 0 ? ((revenue - cost) / cost) * 100 : 0)

      var body =
        _kpiRow('Parcerias ativas', active) +
        _kpiRow('Vouchers emitidos', issued) +
        _kpiRow('Vouchers resgatados', redeemed, 'pos') +
        _kpiRow('Conversão', _fmtPct(convPct) + '%') +
        _kpiRow('Revenue', 'R$ ' + _fmtBrlShort(revenue)) +
        _kpiRow('ROI', (roi > 0 ? '+' : '') + _fmtPct(roi) + '%', _roiClass(roi))

      var newProj = _num(forecast.new_projection)
      var vouchProj = _num(forecast.vouch_projection)
      var footer = ''
      if (newProj > 0 || vouchProj > 0) {
        footer = '<div style="margin-top:14px;font-size:11px;color:var(--ink-muted);letter-spacing:1px;">' +
          'Projeção: <strong style="color:var(--ink);">' + newProj.toFixed(1) + '</strong> parcerias · ' +
          '<strong style="color:var(--ink);">' + vouchProj.toFixed(1) + '</strong> vouchers' +
          '</div>'
      }

      host.innerHTML =
        '<div class="gx-card-title">B2B <span class="gx-badge b2b">Parcerias</span></div>' +
        '<div class="gx-card-sub">' + _esc(PRESET_LABEL[_state.preset] || '') + ' · ' + days + ' dias</div>' +
        body + footer
    } catch (err) {
      host.innerHTML =
        '<div class="gx-card-title">B2B <span class="gx-badge b2b">Parcerias</span></div>' +
        '<div class="gx-card-sub">' + _esc(PRESET_LABEL[_state.preset] || '') + '</div>' +
        '<div class="gx-err">Falha: ' + _esc(err && err.message) + '</div>'
    }
  }

  // ─────────── Comparativo ───────────
  function _compareRow(label, b2cVal, b2bVal, fmt) {
    var max = Math.max(_num(b2cVal), _num(b2bVal), 0.0001)
    var wC = (_num(b2cVal) / max) * 100
    var wB = (_num(b2bVal) / max) * 100
    var fC = fmt ? fmt(b2cVal) : String(b2cVal || 0)
    var fB = fmt ? fmt(b2bVal) : String(b2bVal || 0)
    return '' +
      '<div class="gx-compare-row">' +
        '<div class="gx-compare-label">' + _esc(label) + '</div>' +
        '<div class="gx-compare-bars">' +
          '<div class="gx-bar-wrap">' +
            '<span class="gx-bar-lbl">B2C</span>' +
            '<div class="gx-bar-track"><div class="gx-bar-fill b2c" style="width:' + wC.toFixed(1) + '%;"></div></div>' +
            '<span class="gx-bar-val">' + fC + '</span>' +
          '</div>' +
          '<div class="gx-bar-wrap">' +
            '<span class="gx-bar-lbl">B2B</span>' +
            '<div class="gx-bar-track"><div class="gx-bar-fill b2b" style="width:' + wB.toFixed(1) + '%;"></div></div>' +
            '<span class="gx-bar-val">' + fB + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
  }

  async function _renderCompare(days) {
    var host = document.getElementById('gxCompare')
    if (!host) return
    host.innerHTML =
      '<div class="gx-section-title">Comparativo · qual canal trouxe mais?</div>' +
      '<div class="gx-section-sub">' + _esc(PRESET_LABEL[_state.preset] || '') + ' · ' + days + ' dias</div>' +
      '<div class="gx-loading">Carregando…</div>'

    try {
      var results = await Promise.allSettled([
        window.GrowthMetricsRepository ? window.GrowthMetricsRepository.funnel(days, null) : Promise.resolve({}),
        window.GrowthMetricsRepository ? window.GrowthMetricsRepository.payback(days, null) : Promise.resolve({}),
        window.B2BMetricsRepository    ? window.B2BMetricsRepository.funnel(days, null)    : Promise.resolve({}),
        window.B2BMetricsRepository    ? window.B2BMetricsRepository.payback(days, null)   : Promise.resolve({}),
      ])
      var vpiFunnel  = results[0].status === 'fulfilled' ? (results[0].value || {}) : {}
      var vpiPayback = results[1].status === 'fulfilled' ? (results[1].value || {}) : {}
      var b2bFunnel  = results[2].status === 'fulfilled' ? (results[2].value || {}) : {}
      var b2bPayback = results[3].status === 'fulfilled' ? (results[3].value || {}) : {}

      var vpiTotal  = _num(vpiFunnel.total || vpiFunnel.total_indications || vpiPayback.total_indications || vpiPayback.indications)
      var vpiClosed = _num(vpiFunnel.closed || vpiFunnel.closed_indications || vpiPayback.closed_indications || vpiPayback.closed)
      var vpiConv   = vpiTotal > 0 ? (vpiClosed / vpiTotal) * 100 : 0
      var vpiRev    = _num(vpiPayback.revenue != null ? vpiPayback.revenue : vpiPayback.total_revenue)
      var vpiCost   = _num(vpiPayback.cost != null ? vpiPayback.cost : vpiPayback.total_cost)
      var vpiRoi    = vpiPayback.roi_pct != null ? _num(vpiPayback.roi_pct)
                    : (vpiCost > 0 ? ((vpiRev - vpiCost) / vpiCost) * 100 : 0)

      var b2bIssued   = _num(b2bFunnel.total || b2bFunnel.vouchers_issued || b2bFunnel.issued || b2bPayback.total_vouchers || b2bPayback.issued)
      var b2bRedeemed = _num(b2bFunnel.closed || b2bFunnel.vouchers_redeemed || b2bFunnel.redeemed || b2bPayback.redeemed_vouchers || b2bPayback.redeemed)
      var b2bConv     = b2bIssued > 0 ? (b2bRedeemed / b2bIssued) * 100 : 0
      var b2bRev      = _num(b2bPayback.revenue != null ? b2bPayback.revenue : b2bPayback.total_revenue)
      var b2bCost     = _num(b2bPayback.cost != null ? b2bPayback.cost : b2bPayback.total_cost)
      var b2bRoi      = b2bPayback.roi_pct != null ? _num(b2bPayback.roi_pct)
                      : (b2bCost > 0 ? ((b2bRev - b2bCost) / b2bCost) * 100 : 0)

      var rows = ''
      rows += _compareRow('Volume (entradas)', vpiTotal, b2bIssued)
      rows += _compareRow('Convertidos', vpiClosed, b2bRedeemed)
      rows += _compareRow('Conversão', vpiConv, b2bConv, function (v) { return _fmtPct(v) + '%' })
      rows += _compareRow('Revenue', vpiRev, b2bRev, function (v) { return 'R$ ' + _fmtBrlShort(v) })
      rows += _compareRow('ROI', vpiRoi, b2bRoi, function (v) { return (v > 0 ? '+' : '') + _fmtPct(v) + '%' })

      host.innerHTML =
        '<div class="gx-section-title">Comparativo · qual canal trouxe mais?</div>' +
        '<div class="gx-section-sub">' + _esc(PRESET_LABEL[_state.preset] || '') + ' · ' + days + ' dias</div>' +
        '<div class="gx-compare-grid">' + rows + '</div>'
    } catch (err) {
      host.innerHTML =
        '<div class="gx-section-title">Comparativo</div>' +
        '<div class="gx-err">Falha: ' + _esc(err && err.message) + '</div>'
    }
  }

  // ─────────── Top 10 consolidado ───────────
  async function _renderTop10(days) {
    var host = document.getElementById('gxTop10')
    if (!host) return
    host.innerHTML =
      '<div class="gx-section-title">Top 10 consolidado · parcerias + embaixadoras</div>' +
      '<div class="gx-section-sub">' + _esc(PRESET_LABEL[_state.preset] || '') + ' · ' + days + ' dias · ordenado por revenue</div>' +
      '<div class="gx-loading">Carregando…</div>'

    var periodForQuality = Math.max(days, 30)

    try {
      var results = await Promise.allSettled([
        window.GrowthMetricsRepository ? window.GrowthMetricsRepository.quality(periodForQuality) : Promise.resolve({ partners: [] }),
        window.B2BMetricsRepository    ? window.B2BMetricsRepository.quality(periodForQuality)    : Promise.resolve({ partners: [] }),
      ])
      var vpi = results[0].status === 'fulfilled' ? (results[0].value || {}) : {}
      var b2b = results[1].status === 'fulfilled' ? (results[1].value || {}) : {}

      var rows = []
      ;((vpi.partners) || []).forEach(function (p) {
        rows.push({
          src: 'B2C',
          nome: p.nome || '—',
          meta: p.tier || '',
          total: _num(p.total),
          closed: _num(p.closed),
          conv: _num(p.conversion_pct),
          revenue: _num(p.revenue != null ? p.revenue : p.total_revenue),
        })
      })
      ;((b2b.partners) || []).forEach(function (p) {
        rows.push({
          src: 'B2B',
          nome: p.nome || '—',
          meta: [p.tier, p.pillar].filter(Boolean).join(' · '),
          total: _num(p.total),
          closed: _num(p.closed),
          conv: _num(p.conversion_pct),
          revenue: _num(p.revenue != null ? p.revenue : p.total_revenue),
        })
      })

      if (!rows.length) {
        host.innerHTML =
          '<div class="gx-section-title">Top 10 consolidado</div>' +
          '<div class="gx-section-sub">' + _esc(PRESET_LABEL[_state.preset] || '') + '</div>' +
          '<div class="gx-empty">Nenhum parceiro/embaixadora com atividade no período</div>'
        return
      }

      // Ordena por revenue desc, empata por total desc
      rows.sort(function (a, b) {
        if (b.revenue !== a.revenue) return b.revenue - a.revenue
        return b.total - a.total
      })
      rows = rows.slice(0, 10)

      var head = '' +
        '<div class="gx-top-row gx-top-head">' +
          '<div>#</div>' +
          '<div>Nome</div>' +
          '<div style="text-align:right">Volume</div>' +
          '<div style="text-align:right;" class="gx-hide-mobile">Fechadas</div>' +
          '<div style="text-align:right">Conv</div>' +
          '<div style="text-align:right;" class="gx-hide-mobile">Revenue</div>' +
        '</div>'

      var body = rows.map(function (r, i) {
        var badgeCls = r.src === 'B2B' ? 'b2b' : 'b2c'
        return '' +
          '<div class="gx-top-row">' +
            '<div class="gx-top-pos">' + (i + 1) + '</div>' +
            '<div>' +
              '<div class="gx-top-name">' +
                _esc(r.nome) +
                '<span class="gx-badge ' + badgeCls + '">' + r.src + '</span>' +
              '</div>' +
              (r.meta ? '<div class="gx-top-meta">' + _esc(r.meta) + '</div>' : '') +
            '</div>' +
            '<div class="gx-top-num">' + r.total + '</div>' +
            '<div class="gx-top-num gx-hide-mobile">' + r.closed + '</div>' +
            '<div class="gx-top-pct">' + _fmtPct(r.conv) + '%</div>' +
            '<div class="gx-top-rev gx-hide-mobile">R$ ' + _fmtBrlShort(r.revenue) + '</div>' +
          '</div>'
      }).join('')

      host.innerHTML =
        '<div class="gx-section-title">Top 10 consolidado · parcerias + embaixadoras</div>' +
        '<div class="gx-section-sub">' + _esc(PRESET_LABEL[_state.preset] || '') + ' · ' + periodForQuality + ' dias · ordenado por revenue</div>' +
        head + body
    } catch (err) {
      host.innerHTML =
        '<div class="gx-section-title">Top 10 consolidado</div>' +
        '<div class="gx-err">Falha: ' + _esc(err && err.message) + '</div>'
    }
  }

  // ─────────── Insights IA + últimas VPI fechadas ───────────
  async function _fetchLastClosedVpi(limit) {
    if (!window._sbShared) return []
    try {
      var r = await window._sbShared
        .from('vpi_indications')
        .select('id, partner_id, procedimento, creditos, fechada_em, status')
        .eq('status', 'closed')
        .order('fechada_em', { ascending: false })
        .limit(limit || 3)
      if (r.error) return []
      return r.data || []
    } catch (_) { return [] }
  }

  async function _fetchPartnerNames(ids) {
    if (!ids.length || !window._sbShared) return {}
    try {
      var r = await window._sbShared
        .from('vpi_partners')
        .select('id, nome')
        .in('id', ids)
      if (r.error) return {}
      var map = {}
      ;(r.data || []).forEach(function (p) { map[p.id] = p.nome })
      return map
    } catch (_) { return {} }
  }

  async function _renderInsights() {
    var host = document.getElementById('gxInsights')
    if (!host) return
    host.innerHTML =
      '<div class="gx-section-title">Insights · IA (B2B) + últimas indicações fechadas (B2C)</div>' +
      '<div class="gx-section-sub">Ritual executivo · top 3 mais recentes de cada lado</div>' +
      '<div class="gx-loading">Carregando…</div>'

    var b2bInsights = []
    var vpiClosed = []
    try {
      if (window.B2BInsightRepository) {
        var r = await window.B2BInsightRepository.list(3)
        b2bInsights = Array.isArray(r) ? r : []
      }
    } catch (_) { /* graceful */ }

    try {
      vpiClosed = await _fetchLastClosedVpi(3)
      var partnerIds = vpiClosed.map(function (v) { return v.partner_id }).filter(Boolean)
      var nameMap = await _fetchPartnerNames(partnerIds)
      vpiClosed.forEach(function (v) { v._partnerName = nameMap[v.partner_id] || '—' })
    } catch (_) { /* graceful */ }

    var b2bHtml = ''
    if (!b2bInsights.length) {
      b2bHtml = '<div class="gx-insight-empty">Nenhum insight IA disponível<br><span style="font-size:10px;letter-spacing:1px;">Edge function <code>b2b-weekly-insight</code> roda semanal</span></div>'
    } else {
      b2bHtml = b2bInsights.map(function (i) {
        var sev = i.severity || 'info'
        var action = i.suggested_action || ''
        var partnership = i.partnership_name || ''
        return '' +
          '<div class="gx-insight">' +
            '<div class="gx-insight-head">' +
              '<span class="gx-insight-sev ' + _esc(sev) + '">' + _esc(sev) + '</span>' +
              '<span class="gx-badge b2b">B2B · IA</span>' +
            '</div>' +
            '<div class="gx-insight-headline">' + _esc(i.headline || '') + '</div>' +
            (i.detail ? '<div class="gx-insight-detail">' + _esc(i.detail) + '</div>' : '') +
            (action ? '<div class="gx-insight-detail"><strong>Ação:</strong> ' + _esc(action) + '</div>' : '') +
            (partnership ? '<div class="gx-insight-meta">parceria · ' + _esc(partnership) + '</div>' : '') +
          '</div>'
      }).join('')
    }

    var vpiHtml = ''
    if (!vpiClosed.length) {
      vpiHtml = '<div class="gx-insight-empty">Nenhuma indicação fechada recente</div>'
    } else {
      vpiHtml = vpiClosed.map(function (v) {
        var when = v.fechada_em ? new Date(v.fechada_em).toLocaleDateString('pt-BR') : '—'
        return '' +
          '<div class="gx-insight">' +
            '<div class="gx-insight-head">' +
              '<span class="gx-insight-sev success">fechada</span>' +
              '<span class="gx-badge b2c">B2C · VPI</span>' +
            '</div>' +
            '<div class="gx-insight-headline">' + _esc(v._partnerName || '—') +
              ' converteu' + (v.procedimento ? ' em ' + _esc(v.procedimento) : '') + '</div>' +
            '<div class="gx-insight-meta">' + _esc(when) +
              (v.creditos ? ' · ' + _esc(v.creditos) + ' crédito' + (v.creditos === 1 ? '' : 's') : '') + '</div>' +
          '</div>'
      }).join('')
    }

    host.innerHTML =
      '<div class="gx-section-title">Insights · IA (B2B) + últimas indicações fechadas (B2C)</div>' +
      '<div class="gx-section-sub">Ritual executivo · top 3 mais recentes de cada lado</div>' +
      '<div class="gx-insights-grid">' +
        '<div>' +
          '<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);margin-bottom:10px;">Insights IA (B2B)</div>' +
          b2bHtml +
        '</div>' +
        '<div>' +
          '<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);margin-bottom:10px;">Últimas fechadas (B2C · VPI)</div>' +
          vpiHtml +
        '</div>' +
      '</div>'
  }

  // ─────────── bind + render ───────────
  function _bind(root) {
    root.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        _state.preset = b.getAttribute('data-preset') || 'month'
        _renderAll()
      })
    })
    var r = root.querySelector('#gxReload')
    if (r) r.addEventListener('click', _renderAll)
  }

  function _renderAll() {
    var root = document.getElementById(_state.mountedIn)
    if (!root) return
    root.innerHTML = _renderShell()
    _bind(root)
    var days = _effectiveDays()

    // Dispara todas as seções em paralelo (cada uma é async e se auto-renderiza)
    _renderAlerts()
    _renderKpisB2c(days)
    _renderKpisB2b(days)
    _renderCompare(days)
    _renderTop10(days)
    _renderInsights()
  }

  async function mount(hostId) {
    _state.mountedIn = hostId
    _renderAll()
    // Scan silencioso pra garantir alertas frescos (best effort)
    try {
      if (window.GrowthMetricsRepository) { window.GrowthMetricsRepository.alertsScan() }
      if (window.B2BMetricsRepository)    { window.B2BMetricsRepository.alertsScan() }
    } catch (_) { /* silencioso */ }
  }

  window.GrowthExecShell = Object.freeze({ mount: mount })
})()
