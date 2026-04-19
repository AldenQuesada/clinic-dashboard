/**
 * LP Builder · Performance Panel (Onda 20)
 *
 * UI sobre LPBPerfChecker. Mesmo padrão do SEO checker:
 *   · header com score grande + grade A-F
 *   · lista de checks coloridos
 *   · seção "como melhorar" com ações concretas
 *
 * Independente — testável isolado:
 *   LPBPerfPanel.open()
 */
;(function () {
  'use strict'
  if (window.LPBPerfPanel) return

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

  function _scoreColor(score) {
    if (score >= 90) return 'var(--lpb-success)'
    if (score >= 75) return '#7CB87B'
    if (score >= 60) return 'var(--lpb-warn)'
    return 'var(--lpb-danger)'
  }

  // Tips concretas baseadas nos códigos de check
  var TIPS = {
    too_many_imgs:      'Reduza pra menos de 20 imagens. Combine antes/depois em uma só, comprima JPGs em < 200KB cada.',
    many_imgs:          'Considere remover blocos com galerias longas — mobile vai sentir.',
    many_external_imgs: 'Hospede imagens no Supabase Storage. Cada domínio externo adiciona ~150ms de DNS lookup.',
    too_many_blocks:    'LPs longas convertem menos. Foque em hero + benefícios + prova + CTA. Ideal: 8-15 blocos.',
    heavy_anim:         'Parallax e zoom-pan podem travar em iPhone 8 / Android antigos. Teste com Chrome DevTools throttle 4G.',
    heavy_tracking:     'GA4 + FB Pixel + GTM = ~150KB de JS. Use só GTM e configure os outros dentro dele.',
    multi_forms:        'Múltiplos forms confundem o paciente. Mantenha 1 form de captura + 1 CTA secundário (WhatsApp).',
  }

  function open() {
    if (!window.LPBuilder)        return
    if (!window.LPBPerfChecker)   { LPBToast && LPBToast('Engine de perf não carregada', 'error'); return }

    var page = LPBuilder.getCurrentPage()
    if (!page) { LPBToast && LPBToast('Abra uma página primeiro', 'error'); return }

    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var result = LPBPerfChecker.getScore(page)
    var score = result.score
    var grade = result.grade
    var checks = result.checks
    var counts = result.counts
    var color = _scoreColor(score)

    // tips só pra checks com problemas
    var tipChecks = checks.filter(function (c) { return TIPS[c.code] && (c.severity === 'error' || c.severity === 'warning') })

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbPerfBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:680px;max-height:90vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Performance · ' + _esc(page.title || page.slug) + '</h3>' +
            '<button class="lpb-btn-icon" id="lpbPerfClose">' + _ico('x', 16) + '</button>' +
          '</div>' +

          // Score header
          '<div style="padding:20px 22px;background:var(--lpb-bg);border-bottom:1px solid var(--lpb-border);display:flex;align-items:center;gap:20px">' +
            '<div style="position:relative;width:84px;height:84px;border:3px solid ' + color + ';border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0">' +
              '<div style="font-family:Cormorant Garamond,serif;font-size:30px;font-weight:400;color:' + color + ';line-height:1">' + score + '</div>' +
              '<div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-2);margin-top:2px">grade ' + grade + '</div>' +
            '</div>' +
            '<div style="flex:1">' +
              '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-2);margin-bottom:6px">Performance Score (estimativa estática)</div>' +
              '<div style="font-size:13px;color:var(--lpb-text);line-height:1.6">' +
                '<strong style="color:var(--lpb-success)">' + counts.pass + '</strong> ok · ' +
                '<strong style="color:var(--lpb-warn)">' + counts.warning + '</strong> avisos · ' +
                '<strong style="color:var(--lpb-danger)">' + counts.error + '</strong> erros' +
                (counts.info ? ' · <strong>' + counts.info + '</strong> info' : '') +
              '</div>' +
            '</div>' +
          '</div>' +

          // Checks
          '<div class="lpb-modal-body" style="flex:1;overflow:auto;padding:0">' +
            '<div style="padding:14px 22px 6px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600">Diagnóstico estático</div>' +
            checks.map(_renderCheck).join('') +

            (tipChecks.length
              ? '<div style="padding:18px 22px 6px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;border-top:1px solid var(--lpb-border)">Como melhorar</div>' +
                tipChecks.map(_renderTip).join('')
              : '') +

            '<div style="padding:14px 22px;font-size:11px;color:var(--lpb-text-2);font-style:italic;border-top:1px solid var(--lpb-border);background:var(--lpb-bg);line-height:1.6">' +
              _ico('info', 11) + ' Score estimado pela estrutura — não substitui Lighthouse. Para audit real abra a LP pública no Chrome → DevTools → Lighthouse → Mobile.' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg = document.getElementById('lpbPerfBg')
    var close = document.getElementById('lpbPerfClose')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
  }

  function _renderCheck(c) {
    var color = _color(c.severity)
    var icon  = _sevIcon(c.severity)
    return '<div style="padding:11px 22px;border-bottom:1px solid var(--lpb-border);display:flex;gap:12px;align-items:flex-start">' +
      '<span style="color:' + color + ';flex-shrink:0;margin-top:1px">' + _ico(icon, 14) + '</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-2)">' + _esc(c.label) + '</div>' +
        '<div style="font-size:12px;color:var(--lpb-text);margin-top:3px;line-height:1.5">' + _esc(c.message) + '</div>' +
      '</div>' +
    '</div>'
  }

  function _renderTip(c) {
    return '<div style="padding:11px 22px;border-bottom:1px solid var(--lpb-border);background:rgba(200,169,126,.04)">' +
      '<div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);margin-bottom:4px">' + _esc(c.label) + '</div>' +
      '<div style="font-size:12px;color:var(--lpb-text);line-height:1.55">' + _esc(TIPS[c.code]) + '</div>' +
    '</div>'
  }

  // Atalho Ctrl+Shift+P
  document.addEventListener('keydown', function (e) {
    var ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      var p = LPBuilder.getCurrentPage && LPBuilder.getCurrentPage()
      if (p) { e.preventDefault(); open() }
    }
  })

  window.LPBPerfPanel = Object.freeze({ open: open })
})()
