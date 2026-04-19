/**
 * GrowthMetricsShell — orquestra a página de métricas.
 * Renderiza grade de widgets + header com período.
 * Expõe window.GrowthMetricsShell.
 */
;(function () {
  'use strict'
  if (window.GrowthMetricsShell) return

  var _state = { period: 30, preset: null, mountedIn: null }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _daysThisMonth() {
    var n = new Date()
    return n.getDate() // dia corrente do mês = dias rolling
  }
  function _daysPrevMonthWindow() {
    // últimos 30d aproximados — simplificação: back 30d da última data do mês passado
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

  function _renderShell() {
    return '' +
      '<header class="gm-header">' +
        '<div class="gm-header-top">' +
          '<div>' +
            '<div class="gm-eyebrow">Clínica Mirian de Paula · VPI</div>' +
            '<h1 class="gm-title">Growth <em>Metrics</em></h1>' +
            '<div class="gm-sub">Diagnóstico completo do Programa de Indicação</div>' +
          '</div>' +
          '<div class="gm-header-ctrl">' +
            '<button type="button" class="gm-reload" id="gmReloadAll">↻ Recarregar</button>' +
            '<div class="gm-period-group">' +
              '<span class="gm-period-group-label">Rolling</span>' +
              [7,30,90,180].map(function (d) {
                return '<button type="button" class="gm-period' +
                  (_state.period===d && !_state.preset ?' active':'') +
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
                  (_state.preset===p.key?' active':'') +
                  '" data-preset="' + p.key + '" data-preset-days="' + p.days + '">' +
                  p.label + '</button>'
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</header>' +

      // Alerts banner no topo (sempre visível se tem alertas)
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
    var d = _state.period
    if (window.VpiAlertsWidget)     window.VpiAlertsWidget.mount('gmAlertsSection')
    if (window.VpiFunnelWidget)     window.VpiFunnelWidget.mount('gmFunnel', d)
    if (window.VpiForecastWidget)   window.VpiForecastWidget.mount('gmForecast')
    if (window.VpiVelocityWidget)   window.VpiVelocityWidget.mount('gmVelocity', d)
    if (window.VpiPaybackWidget)    window.VpiPaybackWidget.mount('gmPayback', d)
    if (window.VpiTimeseriesWidget) window.VpiTimeseriesWidget.mount('gmTimeseries')
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
        _renderAll()
      })
    })
    root.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        _state.preset = b.getAttribute('data-preset')
        _state.period = Number(b.getAttribute('data-preset-days')) || 30
        _renderAll()
      })
    })
    var r = root.querySelector('#gmReloadAll')
    if (r) r.addEventListener('click', _renderAll)
  }

  async function mount(hostId) {
    _state.mountedIn = hostId
    _renderAll()
    // Dispara scan de alertas no background (sem bloquear UI)
    try {
      if (window.GrowthMetricsRepository) {
        await window.GrowthMetricsRepository.alertsScan()
        if (window.VpiAlertsWidget) window.VpiAlertsWidget.mount('gmAlertsSection')
      }
    } catch (_) { /* silencioso */ }
  }

  window.GrowthMetricsShell = Object.freeze({ mount: mount })
})()
