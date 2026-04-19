/**
 * GrowthMetricsShell — orquestra a página de métricas.
 * Renderiza grade de widgets + header com período.
 * Expõe window.GrowthMetricsShell.
 */
;(function () {
  'use strict'
  if (window.GrowthMetricsShell) return

  var _state = { period: 30, mountedIn: null }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
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
            '<div class="gm-period-buttons">' +
              [7,30,90,180].map(function (d) {
                return '<button type="button" class="gm-period' + (_state.period===d?' active':'') +
                  '" data-period="' + d + '">' + d + 'd</button>'
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
