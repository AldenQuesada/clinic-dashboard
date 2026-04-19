/**
 * LP Builder · Schedule Badge (Onda 23)
 *
 * Renderiza badges visuais de agendamento. Usado em qualquer lugar
 * que precise mostrar status temporal (cards de listagem, header do editor).
 *
 * API:
 *   LPBScheduleBadge.html(page) → string HTML (vazio se sem agenda)
 */
;(function () {
  'use strict'
  if (window.LPBScheduleBadge) return

  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  // Mapping de estado → estilo
  var STYLES = {
    scheduled: { bg: 'rgba(167, 139, 250, .18)', color: '#a78bfa', icon: '◷',  label: 'agendada' },
    'live-temp': { bg: 'rgba(74, 222, 128, .18)', color: 'var(--lpb-success)', icon: '●', label: 'temporária' },
    expired:   { bg: 'rgba(248, 113, 113, .18)', color: 'var(--lpb-danger)',   icon: '◌', label: 'expirou' },
  }

  function html(page) {
    if (!page) return ''
    if (!window.LPBScheduleEngine) return ''
    var st = LPBScheduleEngine.computeState(page)
    var style = STYLES[st.state]
    if (!style) return ''  // 'live'/'draft'/'archived' já têm o badge nativo
    return '<span title="' + _esc(st.message) + '" style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;background:' + style.bg + ';color:' + style.color + ';font-size:8px;letter-spacing:1px;text-transform:uppercase;font-weight:600">' +
      '<span style="font-size:10px;line-height:1">' + style.icon + '</span>' +
      _esc(style.label) + ' · ' + _esc(st.message) +
    '</span>'
  }

  window.LPBScheduleBadge = Object.freeze({ html: html })
})()
