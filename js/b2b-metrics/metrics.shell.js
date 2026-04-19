/**
 * B2BMetricsShell — orquestra a página de métricas B2B.
 * Header com período (rolling + preset + custom range) + filtro parceria.
 * Expõe window.B2BMetricsShell.
 */
;(function () {
  'use strict'
  if (window.B2BMetricsShell) return

  var _state = {
    period: 30,
    preset: null,           // 'month' | 'prev' | 'ytd' | null
    from: null,             // ISO 'YYYY-MM-DD' quando date range custom
    to: null,
    partnershipId: null,
    partnershipName: '',
    mountedIn: null,
    searchDebounce: null,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
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
    // Se date range custom está setado, calcula dias entre from e to
    if (_state.from && _state.to) {
      var f = new Date(_state.from), t = new Date(_state.to)
      return Math.max(1, Math.ceil((t - f) / 86400000) + 1)
    }
    return _state.period
  }

  function _today() {
    var d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
  }

  function _renderPartnerChip() {
    if (!_state.partnershipId) return ''
    return '<div class="b2bm-partner-chip">' +
      '<span class="b2bm-partner-chip-lbl">Parceria:</span>' +
      '<strong>' + _esc(_state.partnershipName || 'sel') + '</strong>' +
      '<button type="button" class="b2bm-partner-clear" id="b2bmPartnerClear" title="Limpar filtro">×</button>' +
    '</div>'
  }

  function _renderShell() {
    return '' +
      '<header class="b2bm-header">' +
        '<div class="b2bm-header-top">' +
          '<div>' +
            '<div class="b2bm-eyebrow">Círculo Mirian · B2B</div>' +
            '<h1 class="b2bm-title">B2B <em>Metrics</em></h1>' +
            '<div class="b2bm-sub">Diagnóstico completo do programa de parcerias corporativas</div>' +
            _renderPartnerChip() +
          '</div>' +
          '<div class="b2bm-header-ctrl">' +
            '<button type="button" class="b2bm-export-btn" id="b2bmExportCsv" title="Exporta ranking de qualidade em CSV">Exportar CSV</button>' +
            '<button type="button" class="b2bm-export-btn" id="b2bmExportPdf" title="Abre versão imprimível em nova aba">Imprimir / PDF</button>' +
            '<button type="button" class="b2bm-reload" id="b2bmReloadAll">↻ Recarregar</button>' +
          '</div>' +
        '</div>' +

        '<div class="b2bm-filters">' +
          '<div class="b2bm-period-group">' +
            '<span class="b2bm-period-group-label">Rolling</span>' +
            [7,30,90,180].map(function (d) {
              return '<button type="button" class="b2bm-period' +
                (_state.period===d && !_state.preset && !(_state.from && _state.to) ?' active':'') +
                '" data-period="' + d + '">' + d + 'd</button>'
            }).join('') +
          '</div>' +
          '<div class="b2bm-period-group">' +
            '<span class="b2bm-period-group-label">Preset</span>' +
            [
              { key:'month', label:'Mês atual', days:_daysThisMonth() },
              { key:'prev',  label:'Mês passado', days:_daysPrevMonthWindow() },
              { key:'ytd',   label:'YTD', days:_daysYTD() },
            ].map(function (p) {
              return '<button type="button" class="b2bm-period' +
                (_state.preset===p.key && !(_state.from && _state.to)?' active':'') +
                '" data-preset="' + p.key + '" data-preset-days="' + p.days + '">' +
                p.label + '</button>'
            }).join('') +
          '</div>' +
          '<div class="b2bm-period-group b2bm-daterange">' +
            '<span class="b2bm-period-group-label">De</span>' +
            '<input type="date" id="b2bmDateFrom" value="' + _esc(_state.from || '') + '" max="' + _today() + '">' +
            '<span class="b2bm-period-group-label">até</span>' +
            '<input type="date" id="b2bmDateTo" value="' + _esc(_state.to || '') + '" max="' + _today() + '">' +
            '<button type="button" class="b2bm-period' + (_state.from && _state.to ? ' active' : '') + '" id="b2bmDateApply">Aplicar</button>' +
            (_state.from && _state.to ? '<button type="button" class="b2bm-period" id="b2bmDateClear">×</button>' : '') +
          '</div>' +
          '<div class="b2bm-period-group b2bm-partner-search">' +
            '<span class="b2bm-period-group-label">Parceria</span>' +
            '<input type="text" id="b2bmPartnerInput" placeholder="Nome da empresa…" autocomplete="off" ' +
              'value="' + _esc(_state.partnershipName || '') + '">' +
            '<div id="b2bmPartnerResults" class="b2bm-partner-results"></div>' +
          '</div>' +
        '</div>' +
      '</header>' +

      '<section id="b2bmAlertsSection"></section>' +

      '<div class="b2bm-grid">' +
        '<div class="b2bm-card b2bm-col-2"><div id="b2bmFunnel"></div></div>' +
        '<div class="b2bm-card b2bm-col-2"><div id="b2bmForecast"></div></div>' +
        '<div class="b2bm-card"><div id="b2bmVelocity"></div></div>' +
        '<div class="b2bm-card"><div id="b2bmPayback"></div></div>' +
        '<div class="b2bm-card b2bm-col-2"><div id="b2bmTimeseries"></div></div>' +
        '<div class="b2bm-card b2bm-col-2"><div id="b2bmQuality"></div></div>' +
        '<div class="b2bm-card b2bm-col-2"><div id="b2bmCohort"></div></div>' +
        '<div class="b2bm-card"><div id="b2bmDropoff"></div></div>' +
        '<div class="b2bm-card"><div id="b2bmHeatmap"></div></div>' +
      '</div>'
  }

  function _renderAll() {
    var root = document.getElementById(_state.mountedIn)
    if (!root) return
    root.innerHTML = _renderShell()
    _bind(root)
    _mountWidgets()
  }

  function _mountWidgets() {
    var d = _effectiveDays()
    var pid = _state.partnershipId
    if (window.B2BMAlertsWidget)     window.B2BMAlertsWidget.mount('b2bmAlertsSection')
    if (window.B2BMFunnelWidget)     window.B2BMFunnelWidget.mount('b2bmFunnel', d, pid)
    if (window.B2BMForecastWidget)   window.B2BMForecastWidget.mount('b2bmForecast')
    if (window.B2BMVelocityWidget)   window.B2BMVelocityWidget.mount('b2bmVelocity', d, pid)
    if (window.B2BMPaybackWidget)    window.B2BMPaybackWidget.mount('b2bmPayback', d, pid)
    if (window.B2BMTimeseriesWidget) window.B2BMTimeseriesWidget.mount('b2bmTimeseries', pid)
    if (window.B2BMQualityWidget)    window.B2BMQualityWidget.mount('b2bmQuality', Math.max(d, 90))
    if (window.B2BMCohortWidget)     window.B2BMCohortWidget.mount('b2bmCohort')
    if (window.B2BMDropoffWidget)    window.B2BMDropoffWidget.mount('b2bmDropoff')
    if (window.B2BMHeatmapWidget)    window.B2BMHeatmapWidget.mount('b2bmHeatmap', Math.max(d, 90))
  }

  function _bind(root) {
    root.querySelectorAll('[data-period]').forEach(function (b) {
      b.addEventListener('click', function () {
        _state.period = Number(b.getAttribute('data-period')) || 30
        _state.preset = null
        _state.from = null; _state.to = null
        _renderAll()
      })
    })
    root.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        _state.preset = b.getAttribute('data-preset')
        _state.period = Number(b.getAttribute('data-preset-days')) || 30
        _state.from = null; _state.to = null
        _renderAll()
      })
    })
    var dFrom = root.querySelector('#b2bmDateFrom')
    var dTo   = root.querySelector('#b2bmDateTo')
    var dApply = root.querySelector('#b2bmDateApply')
    if (dApply) dApply.addEventListener('click', function () {
      if (dFrom && dTo && dFrom.value && dTo.value) {
        _state.from = dFrom.value; _state.to = dTo.value
        _state.preset = null
        _renderAll()
      }
    })
    var dClear = root.querySelector('#b2bmDateClear')
    if (dClear) dClear.addEventListener('click', function () {
      _state.from = null; _state.to = null
      _renderAll()
    })

    var input = root.querySelector('#b2bmPartnerInput')
    var results = root.querySelector('#b2bmPartnerResults')
    if (input && results) {
      input.addEventListener('input', function () {
        clearTimeout(_state.searchDebounce)
        var q = input.value
        _state.searchDebounce = setTimeout(function () { _searchPartner(q, results) }, 300)
      })
      input.addEventListener('focus', function () {
        if (input.value.length >= 2) _searchPartner(input.value, results)
      })
      document.addEventListener('click', function (e) {
        if (!input.contains(e.target) && !results.contains(e.target)) {
          results.innerHTML = ''
        }
      })
    }

    var clear = root.querySelector('#b2bmPartnerClear')
    if (clear) clear.addEventListener('click', function () {
      _state.partnershipId = null
      _state.partnershipName = ''
      _renderAll()
    })

    var r = root.querySelector('#b2bmReloadAll')
    if (r) r.addEventListener('click', _renderAll)

    var btnCsv = root.querySelector('#b2bmExportCsv')
    if (btnCsv) btnCsv.addEventListener('click', _exportCsv)
    var btnPdf = root.querySelector('#b2bmExportPdf')
    if (btnPdf) btnPdf.addEventListener('click', _exportPdf)
  }

  function _toast(msg, kind) {
    try {
      if (window.B2BToast) {
        var fn = window.B2BToast[kind] || window.B2BToast.info
        if (fn) fn(msg)
      }
    } catch (_) { /* silencioso */ }
  }

  function _stamp() {
    var d = new Date()
    var p = function (n) { return n < 10 ? '0' + n : String(n) }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
  }

  async function _exportCsv() {
    if (!window.MetricsExporter || !window.B2BMetricsRepository) {
      _toast('Exporter indisponível', 'error'); return
    }
    try {
      var d = Math.max(_effectiveDays(), 90)
      var res = await window.B2BMetricsRepository.quality(d)
      var partners = (res && res.partners) || []
      if (!partners.length) { _toast('Sem dados de qualidade para exportar', 'warn'); return }
      var rows = partners.map(function (p, i) {
        return {
          posicao: i + 1,
          nome: p.nome || '',
          pilar: p.pillar || '',
          tier: p.tier || '',
          quality_class: p.quality_class || '',
          total: Number(p.total || 0),
          resgatados: Number(p.closed || 0),
          conversao_pct: Number(p.conversion_pct || 0),
        }
      })
      var columns = [
        { key: 'posicao',        label: 'Posição' },
        { key: 'nome',           label: 'Parceria' },
        { key: 'pilar',          label: 'Pilar' },
        { key: 'tier',           label: 'Tier' },
        { key: 'quality_class',  label: 'Classe Qualidade' },
        { key: 'total',          label: 'Total Vouchers' },
        { key: 'resgatados',     label: 'Resgatados' },
        { key: 'conversao_pct',  label: 'Conversão (%)' },
      ]
      var filename = 'b2b-metrics-' + _stamp() + '.csv'
      window.MetricsExporter.toCSV(filename, rows, { columns: columns })
      _toast('CSV exportado', 'success')
    } catch (err) {
      _toast('Falha ao exportar: ' + (err && err.message || err), 'error')
    }
  }

  async function _exportPdf() {
    if (!window.MetricsExporter) { _toast('Exporter indisponível', 'error'); return }
    try {
      var mesesBR = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
      var n = new Date()
      var periodo = mesesBR[n.getMonth()] + '/' + n.getFullYear()
      var title = 'Clínica Mirian de Paula · B2B Metrics · ' + periodo

      var d = _effectiveDays()
      var report = { summary: {} }
      try {
        var [funnel, forecast, velocity, payback, quality] = await Promise.all([
          window.B2BMetricsRepository.funnel(d, _state.partnershipId).catch(function () { return null }),
          (window.B2BMetricsRepository.forecast ? window.B2BMetricsRepository.forecast(20) : Promise.resolve(null)).catch(function () { return null }),
          window.B2BMetricsRepository.velocity(d, _state.partnershipId).catch(function () { return null }),
          window.B2BMetricsRepository.payback(Math.max(d, 90), _state.partnershipId).catch(function () { return null }),
          window.B2BMetricsRepository.quality(Math.max(d, 90)).catch(function () { return null }),
        ])
        report.summary['Período'] = d + ' dias'
        if (_state.partnershipName) report.summary['Parceria'] = _state.partnershipName
        if (funnel)   report.funnel   = Object.assign({ days: d }, funnel)
        if (forecast) report.forecast = forecast
        if (velocity) report.velocity = Object.assign({ days: d }, velocity)
        if (payback)  report.payback  = Object.assign({ days: Math.max(d, 90) }, payback)
        if (quality)  report.quality  = Object.assign({ days: Math.max(d, 90) }, quality)
      } catch (_) { /* usa só snapshot */ }

      var builtHtml = window.MetricsExporter.buildReport(report)
      var snapshotHtml = ''
      var host = document.getElementById(_state.mountedIn)
      if (host) {
        snapshotHtml = '<div class="mex-snapshot"><h2 style="font-family:\'Cormorant Garamond\',serif;font-size:15px;margin:0 0 8px;">Snapshot dos widgets</h2><div class="mex-snapshot-grid">' +
          _extractWidgetsSnapshot(host) + '</div></div>'
      }

      window.MetricsExporter.toPrintPDF(title, { html: builtHtml + snapshotHtml })
    } catch (err) {
      _toast('Falha ao gerar PDF: ' + (err && err.message || err), 'error')
    }
  }

  function _extractWidgetsSnapshot(container) {
    var cards = container.querySelectorAll('.b2bm-card')
    var out = []
    cards.forEach(function (card) {
      var t = card.querySelector('.b2bm-widget-title')
      var s = card.querySelector('.b2bm-widget-sub')
      var title = (t && t.textContent) || 'Widget'
      var sub = (s && s.textContent) || ''
      var txt = (card.innerText || '').trim()
      if (title) txt = txt.replace(title, '').trim()
      if (sub) txt = txt.replace(sub, '').trim()
      var escHtml = function (x) {
        return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
          return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
        })
      }
      out.push('<div class="mex-snapshot-card"><h3>' + escHtml(title) + '</h3>' +
        '<div class="mex-raw">' + escHtml(txt).replace(/\n/g, '<br>') + '</div></div>')
    })
    return out.join('')
  }

  async function _searchPartner(q, resultsEl) {
    if (!q || q.length < 2) { resultsEl.innerHTML = ''; return }
    try {
      var r = await window.B2BMetricsRepository.partnerSearch(q, 10)
      var rows = (r && r.rows) || []
      if (!rows.length) {
        resultsEl.innerHTML = '<div class="b2bm-partner-empty">Nenhuma parceria encontrada</div>'
        return
      }
      resultsEl.innerHTML = rows.map(function (p) {
        return '<button type="button" class="b2bm-partner-result" data-pid="' + _esc(p.id) +
          '" data-pname="' + _esc(p.nome) + '">' +
          '<strong>' + _esc(p.nome) + '</strong>' +
          '<span>' + _esc(p.tipo || '') + ' · ' + _esc(p.status || '') + '</span>' +
          '</button>'
      }).join('')
      resultsEl.querySelectorAll('[data-pid]').forEach(function (b) {
        b.addEventListener('click', function () {
          _state.partnershipId = b.getAttribute('data-pid')
          _state.partnershipName = b.getAttribute('data-pname')
          resultsEl.innerHTML = ''
          _renderAll()
        })
      })
    } catch (e) {
      resultsEl.innerHTML = '<div class="b2bm-partner-empty">Erro: ' + _esc(e.message) + '</div>'
    }
  }

  async function mount(hostId) {
    _state.mountedIn = hostId
    _renderAll()
    try {
      if (window.B2BMetricsRepository) {
        await window.B2BMetricsRepository.alertsScan()
        if (window.B2BMAlertsWidget) window.B2BMAlertsWidget.mount('b2bmAlertsSection')
      }
    } catch (_) { /* silencioso */ }
  }

  window.B2BMetricsShell = Object.freeze({ mount: mount })
})()
