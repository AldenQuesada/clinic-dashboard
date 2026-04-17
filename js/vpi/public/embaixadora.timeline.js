/**
 * VPI Embaixadora - Timeline de Indicacoes
 *
 * Renderiza o historico das ultimas 20 indicacoes no verso
 * do cartao. Separado do card para permitir filtros e paginacao
 * no futuro sem inflar o modulo principal.
 *
 * Expoe window.VPIEmbTimeline.
 */
;(function () {
  'use strict'
  if (window._vpiEmbTimelineLoaded) return
  window._vpiEmbTimelineLoaded = true

  function _esc(s) {
    if (window.VPIEmbApp && window.VPIEmbApp.esc) return window.VPIEmbApp.esc(s)
    var d = document.createElement('div')
    d.textContent = s == null ? '' : String(s)
    return d.innerHTML
  }

  function _formatDate(iso) {
    if (!iso) return ''
    try {
      var d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      var dd = String(d.getDate()).padStart(2, '0')
      var mm = String(d.getMonth() + 1).padStart(2, '0')
      return dd + '/' + mm + '/' + d.getFullYear()
    } catch (_) { return '' }
  }

  function _statusLabel(status) {
    switch (status) {
      case 'closed':       return 'fechada'
      case 'pending_close': return 'em andamento'
      case 'invalid':      return 'inválida'
      default:             return status || ''
    }
  }

  function renderHTML(items) {
    if (!items || !items.length) {
      return '<div class="vpi-tl-empty">' +
        '<strong>Comece agora</strong>' +
        'Sua jornada de embaixadora começa com a primeira indicação.<br>' +
        'Cada amiga que fechar um procedimento gera créditos no seu cartão.' +
      '</div>'
    }
    return items.map(function (i) {
      var closed = i.status === 'closed'
      var date = _formatDate(i.fechada_em || i.created_at)
      return '<div class="vpi-tl-item" data-status="' + _esc(i.status) + '">' +
        '<div class="vpi-tl-dot ' + (closed ? '' : 'pending') + '"></div>' +
        '<div class="vpi-tl-body">' +
          '<div class="vpi-tl-proc">' + _esc(i.procedimento || 'Indicação') + '</div>' +
          '<div class="vpi-tl-date">' + date + ' - ' + _statusLabel(i.status) + '</div>' +
        '</div>' +
        '<div class="vpi-tl-credits">+' + (i.creditos || 0) + '</div>' +
      '</div>'
    }).join('')
  }

  window.VPIEmbTimeline = {
    renderHTML: renderHTML,
  }
})()
