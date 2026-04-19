/**
 * LP Builder · Preview Fullscreen
 *
 * Modal full-screen com mockup de iPhone (390x844) carregando lp.html.
 * Permite copiar link + abrir em nova aba.
 *
 * window.LPBPreviewFS.open()
 */
;(function () {
  'use strict'
  if (window.LPBPreviewFS) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  function open() {
    var page = LPBuilder.getCurrentPage()
    if (!page) return
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var url = LPBuilder.getPublicUrl()
    if (!url) return

    // Se nao publicada, ainda permite preview do banco — mas avisa
    var isDraft = page.status !== 'published'

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbFsBg" style="background:rgba(0,0,0,0.92)">' +
        '<div onclick="event.stopPropagation()" style="display:flex;flex-direction:column;align-items:center;gap:18px;max-height:96vh">' +
          // top toolbar
          '<div style="display:flex;align-items:center;gap:12px;color:var(--lpb-text)">' +
            '<select id="lpbFsDevice" class="lpb-select" style="background:var(--lpb-surface);border:1px solid var(--lpb-border);color:var(--lpb-text);padding:6px 10px;font-size:11px;letter-spacing:.05em">' +
              '<option value="iphone15"   data-w="393" data-h="852" data-bw="14" data-r="50">iPhone 15 Pro · 393x852</option>' +
              '<option value="iphone-se"  data-w="375" data-h="667" data-bw="10" data-r="36">iPhone SE · 375x667</option>' +
              '<option value="ipad"       data-w="820" data-h="1180" data-bw="22" data-r="22">iPad · 820x1180</option>' +
              '<option value="galaxy"     data-w="412" data-h="915" data-bw="12" data-r="32">Galaxy S23 · 412x915</option>' +
            '</select>' +
            '<button class="lpb-btn ghost sm" id="lpbFsCopy">' + _ico('link', 12) + ' Copiar link</button>' +
            '<button class="lpb-btn ghost sm" id="lpbFsOpen">' + _ico('external-link', 12) + ' Abrir' + '</button>' +
            (isDraft
              ? '<span style="color:var(--lpb-warn);font-size:11px;letter-spacing:.1em;text-transform:uppercase">Rascunho — não publicado</span>'
              : '') +
            '<button class="lpb-btn-icon" id="lpbFsClose" style="margin-left:12px">' + _ico('x', 18) + '</button>' +
          '</div>' +
          // device frame
          '<div id="lpbFsFrame" style="background:#1a1a1c;padding:14px;border-radius:50px;box-shadow:0 30px 60px rgba(0,0,0,.5);transition:all .3s">' +
            '<div id="lpbFsScreen" style="width:393px;height:780px;background:#fff;border-radius:36px;overflow:hidden;position:relative">' +
              '<iframe id="lpbFsIframe" style="width:100%;height:100%;border:0" src=""></iframe>' +
            '</div>' +
          '</div>' +
          '<small style="color:var(--lpb-text-3);font-size:10px;letter-spacing:.15em;text-transform:uppercase">' +
            (isDraft ? 'Pré-visualização — publique para acesso público' : 'Versão publicada · ' + _esc(url)) +
          '</small>' +
        '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbFsBg')
    var close  = document.getElementById('lpbFsClose')
    var copy   = document.getElementById('lpbFsCopy')
    var openBt = document.getElementById('lpbFsOpen')
    var device = document.getElementById('lpbFsDevice')
    var iframe = document.getElementById('lpbFsIframe')

    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss

    copy.onclick = function () {
      navigator.clipboard.writeText(url).then(function () {
        LPBToast && LPBToast('Link copiado', 'success')
      })
    }
    openBt.onclick = function () { window.open(url, '_blank') }

    device.onchange = function () {
      var opt = device.options[device.selectedIndex]
      var w   = opt.dataset.w
      var h   = opt.dataset.h
      var bw  = opt.dataset.bw
      var r   = opt.dataset.r
      var screen = document.getElementById('lpbFsScreen')
      var frame  = document.getElementById('lpbFsFrame')
      // ajusta proporcao pra caber em max-height 90vh
      var maxH = Math.max(360, window.innerHeight - 180)
      var scale = Math.min(1, maxH / (parseInt(h, 10) + parseInt(bw, 10) * 2))
      screen.style.width  = w + 'px'
      screen.style.height = h + 'px'
      screen.style.borderRadius = r + 'px'
      frame.style.padding = bw + 'px'
      frame.style.borderRadius = (parseInt(r, 10) + parseInt(bw, 10)) + 'px'
      frame.style.transform = 'scale(' + scale + ')'
      frame.style.transformOrigin = 'top center'
    }
    device.dispatchEvent(new Event('change'))

    // se publicada, carrega URL publica; se nao, monta um data url com o estado atual via lp.html querystring
    iframe.src = url
  }

  window.LPBPreviewFS = { open: open }
})()
