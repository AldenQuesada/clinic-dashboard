/**
 * LP Builder · Validator Panel (drawer de warnings)
 *
 * Drawer lateral mostra erros + warnings agrupados por bloco.
 * Click em item seleciona o bloco no canvas.
 *
 * window.LPBValidatorPanel.open() / close() / toggle() / getBadge()
 */
;(function () {
  'use strict'
  if (window.LPBValidatorPanel) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  // ────────────────────────────────────────────────────────────
  // Badge data (pra topbar)
  // ────────────────────────────────────────────────────────────
  function getBadge() {
    var v = window.LPBValidator
    if (!v) return { errors: 0, warnings: 0, score: 100 }
    var r = v.validateCurrent()
    return {
      errors:   r.errors.length,
      warnings: r.warnings.length,
      score:    r.score,
    }
  }

  // ────────────────────────────────────────────────────────────
  // Modal/drawer
  // ────────────────────────────────────────────────────────────
  function open() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    var v = window.LPBValidator
    if (!v) { LPBToast && LPBToast('Validator nao carregado', 'error'); return }
    var report = v.validateCurrent()

    var scoreColor = report.score >= 80 ? 'var(--lpb-success)'
                   : report.score >= 50 ? 'var(--lpb-warn)'
                   : 'var(--lpb-danger)'

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbValBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:560px;max-height:88vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Validação da página</h3>' +
            '<button class="lpb-btn-icon" id="lpbValClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          // Score header
          '<div style="padding:18px 20px;background:var(--lpb-bg);border-bottom:1px solid var(--lpb-border);' +
            'display:flex;align-items:center;gap:18px">' +
            '<div style="width:64px;height:64px;border:3px solid ' + scoreColor + ';display:flex;align-items:center;justify-content:center;font-family:Cormorant Garamond,serif;font-size:24px;font-weight:400;color:' + scoreColor + '">' +
              report.score +
            '</div>' +
            '<div>' +
              '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);margin-bottom:4px">Pontuação editorial</div>' +
              '<div style="font-size:13px;color:var(--lpb-text)">' +
                '<strong style="color:var(--lpb-danger)">' + report.errors.length + '</strong> erros · ' +
                '<strong style="color:var(--lpb-warn)">' + report.warnings.length + '</strong> avisos' +
              '</div>' +
            '</div>' +
          '</div>' +
          // Body
          '<div class="lpb-modal-body" id="lpbValBody" style="flex:1;overflow:auto;padding:0">' +
            _renderList(report) +
          '</div>' +
        '</div>' +
      '</div>'

    var bg = document.getElementById('lpbValBg')
    var close = document.getElementById('lpbValClose')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss

    _attach()
  }

  function _renderList(report) {
    if (report.total === 0) {
      return '<div style="padding:60px 24px;text-align:center;color:var(--lpb-text-3);' +
        'font-family:Cormorant Garamond,serif;font-size:20px;font-style:italic">' +
        'Tudo certo. Nenhum problema detectado.' +
        '</div>'
    }

    var html = ''
    var all = report.errors.concat(report.warnings)
    // agrupa por block (ou page-level)
    var groups = {}
    all.forEach(function (item) {
      var key = item.scope === 'page'
        ? '__page__'
        : 'b_' + (item.blockIdx != null ? item.blockIdx : '?')
      if (!groups[key]) groups[key] = { label: '', items: [], blockIdx: item.blockIdx }
      groups[key].items.push(item)
      if (key === '__page__') {
        groups[key].label = 'Página'
      } else {
        groups[key].label = (item.blockType || 'bloco') + ' · #' + item.blockIdx
      }
    })

    Object.keys(groups).forEach(function (k) {
      var g = groups[k]
      html += '<div style="border-bottom:1px solid var(--lpb-border)">'
      html += '<div style="padding:10px 20px;background:var(--lpb-surface-2);' +
        'display:flex;justify-content:space-between;align-items:center">' +
        '<strong style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-2)">' +
          _esc(g.label) +
        '</strong>' +
        (g.blockIdx != null
          ? '<button class="lpb-btn sm ghost" data-select-block="' + g.blockIdx + '">Abrir</button>'
          : '') +
      '</div>'
      g.items.forEach(function (it) {
        var color = it.severity === 'error' ? 'var(--lpb-danger)' : 'var(--lpb-warn)'
        var icon  = it.severity === 'error' ? 'alert-circle' : 'alert-triangle'
        html += '' +
          '<div style="padding:10px 20px;display:flex;gap:10px;align-items:flex-start;border-top:1px solid var(--lpb-border);cursor:' +
            (it.blockIdx != null ? 'pointer' : 'default') + '" ' +
            (it.blockIdx != null ? 'data-select-block="' + it.blockIdx + '"' : '') + '>' +
            '<span style="color:' + color + ';flex-shrink:0;margin-top:1px">' + _ico(icon, 14) + '</span>' +
            '<div style="flex:1">' +
              '<div style="font-size:12px;color:var(--lpb-text);line-height:1.45">' + _esc(it.message) + '</div>' +
              '<small style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--lpb-text-3)">' +
                _esc(it.code) +
              '</small>' +
            '</div>' +
          '</div>'
      })
      html += '</div>'
    })
    return html
  }

  function _attach() {
    var body = document.getElementById('lpbValBody')
    if (!body) return
    body.querySelectorAll('[data-select-block]').forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault(); e.stopPropagation()
        var idx = parseInt(el.dataset.selectBlock, 10)
        if (!isNaN(idx)) {
          LPBuilder.selectBlock(idx)
          // fecha modal
          document.getElementById('lpbModalRoot').innerHTML = ''
          LPBToast && LPBToast('Bloco selecionado', 'success')
        }
      }
    })
  }

  window.LPBValidatorPanel = {
    open: open,
    getBadge: getBadge,
  }
})()
