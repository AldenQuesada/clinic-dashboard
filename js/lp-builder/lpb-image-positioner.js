/**
 * LP Builder · Image Positioner Modal (Onda 30)
 *
 * Modal pra ajustar zoom + pan de uma foto sem re-upload.
 * Persiste 3 numeros (zoom, x%, y%) que o renderer aplica via transform.
 *
 * Uso:
 *   LPBImagePositioner.open({
 *     url:      'https://...',     // URL da foto
 *     aspect:   '3/4',             // aspect ratio do container (default 3/4)
 *     zoom:     1,                 // valor inicial (default 1)
 *     x:        0,                 // pan X em % (default 0)
 *     y:        0,                 // pan Y em % (default 0)
 *     onSave:   function (pos) { ... },  // recebe { zoom, x, y }
 *     onCancel: function () { ... }      // opcional
 *   })
 */
;(function () {
  'use strict'
  if (window.LPBImagePositioner) return

  var MIN_ZOOM = 1, MAX_ZOOM = 5

  function _clampZoom(z) { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)) }
  function _clampPan(p)  { return Math.max(-50, Math.min(50, p)) }

  function open(opts) {
    opts = opts || {}
    if (!opts.url) {
      window.LPBToast && LPBToast('Sem foto pra posicionar · faça upload primeiro', 'error')
      return
    }
    var aspect = opts.aspect || '3/4'
    var state = {
      zoom: _clampZoom(parseFloat(opts.zoom) || 1),
      x:    _clampPan(parseFloat(opts.x) || 0),
      y:    _clampPan(parseFloat(opts.y) || 0),
    }

    // Backdrop + modal markup
    var modal = document.createElement('div')
    modal.className = 'lpb-imgpos-backdrop'
    modal.innerHTML = '' +
      '<div class="lpb-imgpos-modal" role="dialog" aria-modal="true">' +
        '<div class="lpb-imgpos-header">' +
          '<div class="lpb-imgpos-title">Posicionar foto</div>' +
          '<button class="lpb-imgpos-close" type="button" aria-label="Fechar">×</button>' +
        '</div>' +
        '<div class="lpb-imgpos-body">' +
          '<div class="lpb-imgpos-stage" style="aspect-ratio:' + aspect + '">' +
            '<img class="lpb-imgpos-img" src="' + opts.url.replace(/"/g, '&quot;') + '" draggable="false" alt="">' +
          '</div>' +
          '<div class="lpb-imgpos-help">Roda do mouse = zoom · arraste = mover · clique 2x = reset</div>' +
        '</div>' +
        '<div class="lpb-imgpos-controls">' +
          '<label class="lpb-imgpos-slider-row">' +
            '<span>Zoom</span>' +
            '<input type="range" class="lpb-imgpos-slider" min="1" max="5" step="0.05" value="' + state.zoom + '">' +
            '<span class="lpb-imgpos-zoomval">' + Math.round(state.zoom * 100) + '%</span>' +
          '</label>' +
        '</div>' +
        '<div class="lpb-imgpos-footer">' +
          '<button class="lpb-imgpos-btn ghost" type="button" data-act="reset">Resetar</button>' +
          '<button class="lpb-imgpos-btn ghost" type="button" data-act="cancel">Cancelar</button>' +
          '<button class="lpb-imgpos-btn primary" type="button" data-act="save">Salvar posição</button>' +
        '</div>' +
      '</div>'

    document.body.appendChild(modal)

    var stage   = modal.querySelector('.lpb-imgpos-stage')
    var img     = modal.querySelector('.lpb-imgpos-img')
    var slider  = modal.querySelector('.lpb-imgpos-slider')
    var zoomVal = modal.querySelector('.lpb-imgpos-zoomval')

    function _apply() {
      img.style.transform = 'scale(' + state.zoom + ') translate(' + state.x + '%, ' + state.y + '%)'
      slider.value = state.zoom
      zoomVal.textContent = Math.round(state.zoom * 100) + '%'
    }
    _apply()

    // ── Mouse wheel zoom (mantém foco do cursor relativo) ────────
    stage.addEventListener('wheel', function (e) {
      e.preventDefault()
      var factor = e.deltaY < 0 ? 1.08 : 1 / 1.08
      state.zoom = _clampZoom(state.zoom * factor)
      _apply()
    }, { passive: false })

    // ── Drag pan ─────────────────────────────────────────────────
    var dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0
    stage.addEventListener('mousedown', function (e) {
      e.preventDefault()
      dragging = true
      startX = e.clientX; startY = e.clientY
      baseX = state.x;    baseY = state.y
      stage.classList.add('is-dragging')
    })
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return
      var rect = stage.getBoundingClientRect()
      // Converte deltaPx → delta% relativo ao stage e dividido pelo zoom
      // (porque o transform aplica scale antes do translate)
      var dx = ((e.clientX - startX) / rect.width  * 100) / state.zoom
      var dy = ((e.clientY - startY) / rect.height * 100) / state.zoom
      state.x = _clampPan(baseX + dx)
      state.y = _clampPan(baseY + dy)
      _apply()
    })
    document.addEventListener('mouseup', function () {
      dragging = false
      stage.classList.remove('is-dragging')
    })

    // Touch (mobile · pan apenas · 1 dedo)
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return
      var t = e.touches[0]
      dragging = true
      startX = t.clientX; startY = t.clientY
      baseX = state.x;    baseY = state.y
    }, { passive: true })
    stage.addEventListener('touchmove', function (e) {
      if (!dragging || e.touches.length !== 1) return
      var t = e.touches[0]
      var rect = stage.getBoundingClientRect()
      var dx = ((t.clientX - startX) / rect.width  * 100) / state.zoom
      var dy = ((t.clientY - startY) / rect.height * 100) / state.zoom
      state.x = _clampPan(baseX + dx)
      state.y = _clampPan(baseY + dy)
      _apply()
    }, { passive: true })
    stage.addEventListener('touchend', function () { dragging = false })

    // Slider zoom
    slider.addEventListener('input', function () {
      state.zoom = _clampZoom(parseFloat(slider.value))
      _apply()
    })

    // Double-click reset
    stage.addEventListener('dblclick', function (e) {
      e.preventDefault()
      state.zoom = 1; state.x = 0; state.y = 0
      _apply()
    })

    // Footer actions
    modal.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.onclick = function () {
        var act = btn.dataset.act
        if (act === 'reset')  { state.zoom = 1; state.x = 0; state.y = 0; _apply(); return }
        if (act === 'cancel') { _close(); if (opts.onCancel) opts.onCancel(); return }
        if (act === 'save')   {
          _close()
          if (opts.onSave) opts.onSave({ zoom: state.zoom, x: state.x, y: state.y })
        }
      }
    })
    modal.querySelector('.lpb-imgpos-close').onclick = function () {
      _close(); if (opts.onCancel) opts.onCancel()
    }

    function _onEscape(e) { if (e.key === 'Escape') { _close(); if (opts.onCancel) opts.onCancel() } }
    document.addEventListener('keydown', _onEscape)

    function _close() {
      document.removeEventListener('keydown', _onEscape)
      if (modal.parentNode) modal.parentNode.removeChild(modal)
    }
  }

  // Helper · gera string de transform pronta pro renderer
  function transformStr(zoom, x, y) {
    var z = parseFloat(zoom) || 1
    var px = parseFloat(x) || 0
    var py = parseFloat(y) || 0
    if (z === 1 && px === 0 && py === 0) return ''
    return 'transform:scale(' + z + ') translate(' + px + '%, ' + py + '%);transform-origin:center'
  }

  window.LPBImagePositioner = Object.freeze({
    open:         open,
    transformStr: transformStr,
  })
})()
