/**
 * LP Builder · A/B Compare
 *
 * Modal full-screen lado a lado: pagina atual vs outra escolhida.
 * Util pra comparar variantes antes de publicar.
 *
 * window.LPBABCompare.open()
 */
;(function () {
  'use strict'
  if (window.LPBABCompare) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  function open() {
    var current = LPBuilder.getCurrentPage()
    if (!current) return
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var pages = LPBuilder.getPages() || []
    var others = pages.filter(function (p) {
      return p.id !== current.id && p.status === 'published'
    })

    if (!others.length) {
      LPBToast && LPBToast('Nenhuma outra LP publicada para comparação', 'error')
      return
    }

    var defaultB = others[0].slug
    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbAbBg" style="background:rgba(0,0,0,0.92);align-items:flex-start;padding:20px">' +
        '<div onclick="event.stopPropagation()" style="width:100%;max-width:1600px;display:flex;flex-direction:column;gap:14px">' +
          // toolbar
          '<div style="display:flex;align-items:center;gap:14px;color:var(--lpb-text)">' +
            '<strong style="font-family:Cormorant Garamond,serif;font-size:20px;font-style:italic">Comparar A/B</strong>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn-icon" id="lpbAbClose">' + _ico('x', 18) + '</button>' +
          '</div>' +
          // 2 colunas
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;height:calc(100vh - 100px)">' +
            // A
            '<div style="display:flex;flex-direction:column;background:var(--lpb-surface);border:1px solid var(--lpb-border)">' +
              '<div style="padding:10px 14px;background:var(--lpb-surface-2);border-bottom:1px solid var(--lpb-border);display:flex;justify-content:space-between;align-items:center">' +
                '<div>' +
                  '<small style="color:var(--lpb-accent);font-size:9px;letter-spacing:.2em;text-transform:uppercase">Versão A · Atual</small>' +
                  '<div style="font-size:13px;color:var(--lpb-text);margin-top:2px">' + _esc(current.title) + '</div>' +
                '</div>' +
                (current.status === 'published'
                  ? '<span class="lpb-tb-status published">Publicada</span>'
                  : '<span class="lpb-tb-status draft">Rascunho</span>') +
              '</div>' +
              '<iframe id="lpbAbIframeA" style="flex:1;border:0;background:#fff" src=""></iframe>' +
            '</div>' +
            // B
            '<div style="display:flex;flex-direction:column;background:var(--lpb-surface);border:1px solid var(--lpb-border)">' +
              '<div style="padding:10px 14px;background:var(--lpb-surface-2);border-bottom:1px solid var(--lpb-border);display:flex;justify-content:space-between;align-items:center;gap:10px">' +
                '<div style="flex:1">' +
                  '<small style="color:var(--lpb-accent);font-size:9px;letter-spacing:.2em;text-transform:uppercase">Versão B</small>' +
                  '<select id="lpbAbSelect" class="lpb-select" style="background:var(--lpb-bg);border:1px solid var(--lpb-border);color:var(--lpb-text);padding:5px 8px;font-size:12px;width:100%;margin-top:2px">' +
                    others.map(function (p) {
                      return '<option value="' + _esc(p.slug) + '"' +
                        (p.slug === defaultB ? ' selected' : '') + '>' +
                        _esc(p.title) +
                        '</option>'
                    }).join('') +
                  '</select>' +
                '</div>' +
              '</div>' +
              '<iframe id="lpbAbIframeB" style="flex:1;border:0;background:#fff" src=""></iframe>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg    = document.getElementById('lpbAbBg')
    var close = document.getElementById('lpbAbClose')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss

    var iframeA = document.getElementById('lpbAbIframeA')
    var iframeB = document.getElementById('lpbAbIframeB')
    var select  = document.getElementById('lpbAbSelect')

    function loadIframes() {
      iframeA.src = window.location.origin + '/lp.html?s=' + encodeURIComponent(current.slug)
      iframeB.src = window.location.origin + '/lp.html?s=' + encodeURIComponent(select.value)
    }
    select.onchange = loadIframes
    loadIframes()
  }

  window.LPBABCompare = { open: open }
})()
