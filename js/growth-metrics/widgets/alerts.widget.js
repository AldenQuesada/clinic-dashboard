/**
 * VpiAlertsWidget — banner de alertas do Programa de Indicação.
 * Consome GrowthMetricsRepository.alertsList(20) → RPC vpi_alerts_list.
 * Renderiza como painel de alertas no topo (sem título de widget).
 * Se zero alertas, host fica vazio (invisível).
 * Botão close dispensa via alertDismiss(id) e re-monta.
 */
;(function () {
  'use strict'
  if (window.VpiAlertsWidget) return

  var SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 }
  var SEVERITY_LABEL = { critical: 'crítico', warning: 'atenção', info: 'info' }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _sevRank(sev) {
    var r = SEVERITY_ORDER[sev]
    return r == null ? 99 : r
  }

  function _sevLabel(sev) {
    return SEVERITY_LABEL[sev] || _esc(sev || '')
  }

  function _sortAlerts(list) {
    return list.slice().sort(function (a, b) {
      var ra = _sevRank(a && a.severity)
      var rb = _sevRank(b && b.severity)
      if (ra !== rb) return ra - rb
      // tie-break: created_at desc (mais recentes primeiro) se disponível
      var ta = a && (a.created_at || a.createdAt)
      var tb = b && (b.created_at || b.createdAt)
      if (ta && tb) return (ta < tb ? 1 : (ta > tb ? -1 : 0))
      return 0
    })
  }

  function _renderAlert(a) {
    var sev = (a && a.severity) || 'info'
    var id = a && a.id
    var title = (a && a.title) || ''
    var detail = (a && (a.detail || a.description || a.message)) || ''
    var rec = (a && (a.recommendation || a.recommended_action || a.action)) || ''

    return '' +
      '<div class="gm-alert ' + _esc(sev) + '">' +
        '<div class="gm-alert-head">' +
          '<span class="gm-alert-chip">' + _esc(_sevLabel(sev)) + '</span>' +
          '<span class="gm-alert-title">' + _esc(title) + '</span>' +
          (id != null
            ? '<button type="button" class="gm-alert-close" data-dismiss-id="' + _esc(id) +
                '" aria-label="Dispensar alerta">×</button>'
            : '') +
        '</div>' +
        (detail
          ? '<div class="gm-alert-detail">' + _esc(detail) + '</div>'
          : '') +
        (rec
          ? '<div class="gm-alert-recommend"><strong>Ação sugerida:</strong> ' + _esc(rec) + '</div>'
          : '') +
      '</div>'
  }

  function _bindDismiss(host, hostId) {
    host.querySelectorAll('.gm-alert-close').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = btn.getAttribute('data-dismiss-id')
        if (!id) return
        btn.disabled = true
        try {
          if (window.GrowthMetricsRepository) {
            await window.GrowthMetricsRepository.alertDismiss(id)
          }
        } catch (err) {
          btn.disabled = false
          console.error('[VpiAlertsWidget] dismiss falhou:', err)
          return
        }
        // re-monta para atualizar lista
        mount(hostId)
      })
    })
  }

  function _renderError(host, msg) {
    host.innerHTML =
      '<div class="gm-alerts">' +
        '<div class="gm-widget-err">Falha ao carregar alertas: ' + _esc(msg || 'erro desconhecido') + '</div>' +
      '</div>'
  }

  async function mount(hostId) {
    var host = document.getElementById(hostId)
    if (!host) return
    try {
      if (!window.GrowthMetricsRepository) {
        host.innerHTML = ''
        return
      }
      var raw = await window.GrowthMetricsRepository.alertsList(20)
      var list = Array.isArray(raw) ? raw : []
      if (list.length === 0) {
        host.innerHTML = ''
        return
      }
      var sorted = _sortAlerts(list)
      host.innerHTML =
        '<div class="gm-alerts">' +
          sorted.map(_renderAlert).join('') +
        '</div>'
      _bindDismiss(host, hostId)
    } catch (err) {
      _renderError(host, err && err.message)
    }
  }

  window.VpiAlertsWidget = Object.freeze({ mount: mount })
})()
