/**
 * B2BMAlertsWidget — banner de alertas do Programa B2B.
 * Consome B2BMetricsRepository.alertsList(20) → RPC b2b_alerts_list.
 * Renderiza como painel de alertas no topo (sem título de widget).
 * Se zero alertas, host fica vazio (invisível).
 * Botão close dispensa via alertDismiss(id) e re-monta.
 */
;(function () {
  'use strict'
  if (window.B2BMAlertsWidget) return

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
      '<div class="b2bm-alert ' + _esc(sev) + '">' +
        '<div class="b2bm-alert-head">' +
          '<span class="b2bm-alert-chip">' + _esc(_sevLabel(sev)) + '</span>' +
          '<span class="b2bm-alert-title">' + _esc(title) + '</span>' +
          (id != null
            ? '<button type="button" class="b2bm-alert-close" data-dismiss-id="' + _esc(id) +
                '" aria-label="Dispensar alerta">×</button>'
            : '') +
        '</div>' +
        (detail
          ? '<div class="b2bm-alert-detail">' + _esc(detail) + '</div>'
          : '') +
        (rec
          ? '<div class="b2bm-alert-recommend"><strong>Ação sugerida:</strong> ' + _esc(rec) + '</div>'
          : '') +
      '</div>'
  }

  function _bindDismiss(host, hostId) {
    host.querySelectorAll('.b2bm-alert-close').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = btn.getAttribute('data-dismiss-id')
        if (!id) return
        btn.disabled = true
        try {
          if (window.B2BMetricsRepository) {
            await window.B2BMetricsRepository.alertDismiss(id)
          }
        } catch (err) {
          btn.disabled = false
          console.error('[B2BMAlertsWidget] dismiss falhou:', err)
          return
        }
        // re-monta para atualizar lista
        mount(hostId)
      })
    })
  }

  function _renderError(host, msg) {
    host.innerHTML =
      '<div class="b2bm-alerts">' +
        '<div class="b2bm-widget-err">Falha ao carregar alertas: ' + _esc(msg || 'erro desconhecido') + '</div>' +
      '</div>'
  }

  async function mount(hostId) {
    var host = document.getElementById(hostId)
    if (!host) return
    try {
      if (!window.B2BMetricsRepository) {
        host.innerHTML = ''
        return
      }
      var raw = await window.B2BMetricsRepository.alertsList(20)
      var list = Array.isArray(raw) ? raw : []
      if (list.length === 0) {
        host.innerHTML = ''
        return
      }
      var sorted = _sortAlerts(list)
      host.innerHTML =
        '<div class="b2bm-alerts">' +
          sorted.map(_renderAlert).join('') +
        '</div>'
      _bindDismiss(host, hostId)
    } catch (err) {
      _renderError(host, err && err.message)
    }
  }

  window.B2BMAlertsWidget = Object.freeze({ mount: mount })
})()
