/**
 * LP Builder · Accessibility Panel (Onda 22)
 *
 * UI sobre LPBA11yChecker. Mesma família visual do SEO/Perf checker mas
 * mostra também referência WCAG ao lado de cada check.
 *
 * API:
 *   LPBA11yPanel.open()
 */
;(function () {
  'use strict'
  if (window.LPBA11yPanel) return

  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }
  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }

  function _color(sev) {
    return sev === 'error'   ? 'var(--lpb-danger)'
         : sev === 'warning' ? 'var(--lpb-warn)'
         : sev === 'info'    ? 'var(--lpb-text-2)'
                             : 'var(--lpb-success)'
  }
  function _sevIcon(sev) {
    return sev === 'error'   ? 'alert-circle'
         : sev === 'warning' ? 'alert-triangle'
         : sev === 'info'    ? 'info'
                             : 'check-circle'
  }
  function _scoreColor(s) {
    if (s >= 90) return 'var(--lpb-success)'
    if (s >= 75) return '#7CB87B'
    if (s >= 60) return 'var(--lpb-warn)'
    return 'var(--lpb-danger)'
  }

  function open() {
    if (!window.LPBuilder)        return
    if (!window.LPBA11yChecker)   { LPBToast && LPBToast('Engine A11y não carregada', 'error'); return }

    var page = LPBuilder.getCurrentPage()
    if (!page) { LPBToast && LPBToast('Abra uma página primeiro', 'error'); return }

    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var result = LPBA11yChecker.getScore(page)
    var color = _scoreColor(result.score)

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbA11yBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:680px;max-height:90vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Acessibilidade · ' + _esc(page.title || page.slug) + '</h3>' +
            '<button class="lpb-btn-icon" id="lpbA11yClose">' + _ico('x', 16) + '</button>' +
          '</div>' +

          '<div style="padding:20px 22px;background:var(--lpb-bg);border-bottom:1px solid var(--lpb-border);display:flex;align-items:center;gap:20px">' +
            '<div style="position:relative;width:84px;height:84px;border:3px solid ' + color + ';border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0">' +
              '<div style="font-family:Cormorant Garamond,serif;font-size:30px;font-weight:400;color:' + color + ';line-height:1">' + result.score + '</div>' +
              '<div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-2);margin-top:2px">grade ' + result.grade + '</div>' +
            '</div>' +
            '<div style="flex:1">' +
              '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-2);margin-bottom:6px">Score WCAG 2.1 (AA)</div>' +
              '<div style="font-size:13px;color:var(--lpb-text);line-height:1.6">' +
                '<strong style="color:var(--lpb-success)">' + result.counts.pass + '</strong> ok · ' +
                '<strong style="color:var(--lpb-warn)">' + result.counts.warning + '</strong> avisos · ' +
                '<strong style="color:var(--lpb-danger)">' + result.counts.error + '</strong> erros' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="lpb-modal-body" style="flex:1;overflow:auto;padding:0">' +
            result.checks.map(_renderCheck).join('') +
            '<div style="padding:14px 22px;font-size:11px;color:var(--lpb-text-2);font-style:italic;border-top:1px solid var(--lpb-border);background:var(--lpb-bg);line-height:1.6">' +
              _ico('info', 11) + ' Análise estática. Pra audit completo use NVDA/VoiceOver + axe DevTools.' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'

    document.getElementById('lpbA11yBg').addEventListener('click', _dismiss)
    document.getElementById('lpbA11yClose').onclick = _dismiss
  }

  function _renderCheck(c) {
    var col = _color(c.severity)
    var ic  = _sevIcon(c.severity)
    var wcagBadge = c.wcag
      ? '<span style="font-size:9px;letter-spacing:.06em;background:var(--lpb-bg);border:1px solid var(--lpb-border);color:var(--lpb-text-2);padding:1px 6px;margin-left:6px">WCAG ' + _esc(c.wcag) + '</span>'
      : ''
    return '<div style="padding:11px 22px;border-bottom:1px solid var(--lpb-border);display:flex;gap:12px;align-items:flex-start">' +
      '<span style="color:' + col + ';flex-shrink:0;margin-top:1px">' + _ico(ic, 14) + '</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-2)">' + _esc(c.label) + wcagBadge + '</div>' +
        '<div style="font-size:12px;color:var(--lpb-text);margin-top:3px;line-height:1.5">' + _esc(c.message) + '</div>' +
      '</div>' +
    '</div>'
  }

  function _dismiss() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (modalRoot) modalRoot.innerHTML = ''
  }

  // Atalho Ctrl+Shift+A
  document.addEventListener('keydown', function (e) {
    var ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      var p = LPBuilder.getCurrentPage && LPBuilder.getCurrentPage()
      if (p) { e.preventDefault(); open() }
    }
  })

  window.LPBA11yPanel = Object.freeze({ open: open })
})()
