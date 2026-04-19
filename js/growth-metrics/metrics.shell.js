/**
 * GrowthMetricsShell — orquestra a página de métricas.
 * Header com período (rolling + preset + custom range) + filtro embaixadora.
 * Expõe window.GrowthMetricsShell.
 */
;(function () {
  'use strict'
  if (window.GrowthMetricsShell) return

  var _state = {
    period: 30,
    preset: null,        // 'month' | 'prev' | 'ytd' | null
    from: null,          // ISO 'YYYY-MM-DD' quando date range custom
    to: null,
    partnerId: null,
    partnerName: '',
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
    if (!_state.partnerId) return ''
    return '<div class="gm-partner-chip">' +
      '<span class="gm-partner-chip-lbl">Embaixadora:</span>' +
      '<strong>' + _esc(_state.partnerName || 'sel') + '</strong>' +
      '<button type="button" class="gm-partner-clear" id="gmPartnerClear" title="Limpar filtro">×</button>' +
    '</div>'
  }

  function _renderShell() {
    return '' +
      '<header class="gm-header">' +
        '<div class="gm-header-top">' +
          '<div>' +
            '<div class="gm-eyebrow">Clínica Mirian de Paula · VPI</div>' +
            '<h1 class="gm-title">Growth <em>Metrics</em></h1>' +
            '<div class="gm-sub">Diagnóstico completo do Programa de Indicação</div>' +
            _renderPartnerChip() +
          '</div>' +
          '<div class="gm-header-ctrl">' +
            '<button type="button" class="gm-reload" id="gmReloadAll">↻ Recarregar</button>' +
          '</div>' +
        '</div>' +

        '<div class="gm-filters">' +
          '<div class="gm-period-group">' +
            '<span class="gm-period-group-label">Rolling</span>' +
            [7,30,90,180].map(function (d) {
              return '<button type="button" class="gm-period' +
                (_state.period===d && !_state.preset && !(_state.from && _state.to) ?' active':'') +
                '" data-period="' + d + '">' + d + 'd</button>'
            }).join('') +
          '</div>' +
          '<div class="gm-period-group">' +
            '<span class="gm-period-group-label">Preset</span>' +
            [
              { key:'month', label:'Mês atual', days:_daysThisMonth() },
              { key:'prev',  label:'Mês passado', days:_daysPrevMonthWindow() },
              { key:'ytd',   label:'YTD', days:_daysYTD() },
            ].map(function (p) {
              return '<button type="button" class="gm-period' +
                (_state.preset===p.key && !(_state.from && _state.to)?' active':'') +
                '" data-preset="' + p.key + '" data-preset-days="' + p.days + '">' +
                p.label + '</button>'
            }).join('') +
          '</div>' +
          '<div class="gm-period-group gm-daterange">' +
            '<span class="gm-period-group-label">De</span>' +
            '<input type="date" id="gmDateFrom" value="' + _esc(_state.from || '') + '" max="' + _today() + '">' +
            '<span class="gm-period-group-label">até</span>' +
            '<input type="date" id="gmDateTo" value="' + _esc(_state.to || '') + '" max="' + _today() + '">' +
            '<button type="button" class="gm-period' + (_state.from && _state.to ? ' active' : '') + '" id="gmDateApply">Aplicar</button>' +
            (_state.from && _state.to ? '<button type="button" class="gm-period" id="gmDateClear">×</button>' : '') +
          '</div>' +
          '<div class="gm-period-group gm-partner-search">' +
            '<span class="gm-period-group-label">Embaixadora</span>' +
            '<input type="text" id="gmPartnerInput" placeholder="Nome ou telefone…" autocomplete="off" ' +
              'value="' + _esc(_state.partnerName || '') + '">' +
            '<div id="gmPartnerResults" class="gm-partner-results"></div>' +
          '</div>' +
        '</div>' +
      '</header>' +

      '<section id="gmAlertsSection"></section>' +

      '<div class="gm-grid">' +
        '<div class="gm-card gm-col-2"><div id="gmFunnel"></div></div>' +
        '<div class="gm-card gm-col-2"><div id="gmForecast"></div></div>' +
        '<div class="gm-card"><div id="gmVelocity"></div></div>' +
        '<div class="gm-card"><div id="gmPayback"></div></div>' +
        '<div class="gm-card gm-col-2"><div id="gmTimeseries"></div></div>' +
        '<div class="gm-card gm-col-2"><div id="gmQuality"></div></div>' +
        '<div class="gm-card gm-col-2"><div id="gmCohort"></div></div>' +
        '<div class="gm-card"><div id="gmDropoff"></div></div>' +
        '<div class="gm-card"><div id="gmHeatmap"></div></div>' +
        '<div class="gm-card gm-col-2"><div id="gmNps"></div></div>' +
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
    var pid = _state.partnerId
    if (window.VpiAlertsWidget)     window.VpiAlertsWidget.mount('gmAlertsSection')
    if (window.VpiFunnelWidget)     window.VpiFunnelWidget.mount('gmFunnel', d, pid)
    if (window.VpiForecastWidget)   window.VpiForecastWidget.mount('gmForecast')
    if (window.VpiVelocityWidget)   window.VpiVelocityWidget.mount('gmVelocity', d, pid)
    if (window.VpiPaybackWidget)    window.VpiPaybackWidget.mount('gmPayback', d, pid)
    if (window.VpiTimeseriesWidget) window.VpiTimeseriesWidget.mount('gmTimeseries', pid)
    if (window.VpiQualityWidget)    window.VpiQualityWidget.mount('gmQuality', Math.max(d, 90))
    if (window.VpiCohortWidget)     window.VpiCohortWidget.mount('gmCohort')
    if (window.VpiDropoffWidget)    window.VpiDropoffWidget.mount('gmDropoff')
    if (window.VpiHeatmapWidget)    window.VpiHeatmapWidget.mount('gmHeatmap', Math.max(d, 90))
    if (window.VpiNpsWidget)        window.VpiNpsWidget.mount('gmNps')
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
    var dFrom = root.querySelector('#gmDateFrom')
    var dTo   = root.querySelector('#gmDateTo')
    var dApply = root.querySelector('#gmDateApply')
    if (dApply) dApply.addEventListener('click', function () {
      if (dFrom && dTo && dFrom.value && dTo.value) {
        _state.from = dFrom.value; _state.to = dTo.value
        _state.preset = null
        _renderAll()
      }
    })
    var dClear = root.querySelector('#gmDateClear')
    if (dClear) dClear.addEventListener('click', function () {
      _state.from = null; _state.to = null
      _renderAll()
    })

    var input = root.querySelector('#gmPartnerInput')
    var results = root.querySelector('#gmPartnerResults')
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

    var clear = root.querySelector('#gmPartnerClear')
    if (clear) clear.addEventListener('click', function () {
      _state.partnerId = null
      _state.partnerName = ''
      _renderAll()
    })

    var r = root.querySelector('#gmReloadAll')
    if (r) r.addEventListener('click', _renderAll)
  }

  async function _searchPartner(q, resultsEl) {
    if (!q || q.length < 2) { resultsEl.innerHTML = ''; return }
    try {
      var r = await window.GrowthMetricsRepository.partnerSearch(q, 10)
      var rows = (r && r.rows) || []
      if (!rows.length) {
        resultsEl.innerHTML = '<div class="gm-partner-empty">Nenhuma embaixadora encontrada</div>'
        return
      }
      resultsEl.innerHTML = rows.map(function (p) {
        return '<button type="button" class="gm-partner-result" data-pid="' + _esc(p.id) +
          '" data-pname="' + _esc(p.nome) + '">' +
          '<strong>' + _esc(p.nome) + '</strong>' +
          '<span>' + _esc(p.phone || '') + ' · ' + _esc(p.tier || '') + '</span>' +
          '</button>'
      }).join('')
      resultsEl.querySelectorAll('[data-pid]').forEach(function (b) {
        b.addEventListener('click', function () {
          _state.partnerId = b.getAttribute('data-pid')
          _state.partnerName = b.getAttribute('data-pname')
          resultsEl.innerHTML = ''
          _renderAll()
        })
      })
    } catch (e) {
      resultsEl.innerHTML = '<div class="gm-partner-empty">Erro: ' + _esc(e.message) + '</div>'
    }
  }

  async function mount(hostId) {
    _state.mountedIn = hostId
    _renderAll()
    try {
      if (window.GrowthMetricsRepository) {
        await window.GrowthMetricsRepository.alertsScan()
        if (window.VpiAlertsWidget) window.VpiAlertsWidget.mount('gmAlertsSection')
      }
    } catch (_) { /* silencioso */ }
  }

  window.GrowthMetricsShell = Object.freeze({ mount: mount })
})()
