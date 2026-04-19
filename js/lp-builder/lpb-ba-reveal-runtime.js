/**
 * LP Builder · Runtime: before-after-reveal slider
 *
 * Bind drag mouse + touch + arrow keys no handle do slider.
 * Atualiza clip-path do after + posicao da linha em tempo real.
 *
 *   LPBBaRevealRuntime.bind(rootEl)
 */
;(function () {
  'use strict'
  if (window.LPBBaRevealRuntime) return

  function _setPos(stage, pos) {
    pos = Math.max(0, Math.min(100, pos))
    var after = stage.querySelector('[data-bars-after]')
    var line  = stage.querySelector('[data-bars-line]')
    if (after) after.style.clipPath = 'inset(0 0 0 ' + pos + '%)'
    if (line)  line.style.left = pos + '%'
    stage.dataset.pos = pos
  }

  function _bindStage(stage) {
    if (stage.__barsBound) return
    stage.__barsBound = true

    var dragging = false

    function _moveTo(clientX) {
      var rect = stage.getBoundingClientRect()
      if (rect.width <= 0) return
      var pos = ((clientX - rect.left) / rect.width) * 100
      _setPos(stage, pos)
    }

    // Pointer events · cobre mouse + touch + pen com 1 listener
    stage.addEventListener('pointerdown', function (e) {
      // Permite click direto na area pra "saltar" o handle
      e.preventDefault()
      dragging = true
      try { stage.setPointerCapture(e.pointerId) } catch (_) {}
      _moveTo(e.clientX)
    })
    stage.addEventListener('pointermove', function (e) {
      if (!dragging) return
      e.preventDefault()
      _moveTo(e.clientX)
    })
    function _release(e) {
      if (!dragging) return
      dragging = false
      try { stage.releasePointerCapture(e.pointerId) } catch (_) {}
    }
    stage.addEventListener('pointerup',     _release)
    stage.addEventListener('pointercancel', _release)
    stage.addEventListener('pointerleave',  _release)

    // Keyboard (acessibilidade · setas movem 5%)
    var handle = stage.querySelector('[data-bars-handle]')
    if (handle) {
      handle.addEventListener('keydown', function (e) {
        var pos = parseFloat(stage.dataset.pos) || 50
        if (e.key === 'ArrowLeft')  { _setPos(stage, pos - 5); e.preventDefault() }
        if (e.key === 'ArrowRight') { _setPos(stage, pos + 5); e.preventDefault() }
        if (e.key === 'Home')       { _setPos(stage, 0);       e.preventDefault() }
        if (e.key === 'End')        { _setPos(stage, 100);     e.preventDefault() }
      })
    }
  }

  function bind(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return
    var stages = rootEl.querySelectorAll('[data-bars-stage]')
    stages.forEach(_bindStage)
  }

  window.LPBBaRevealRuntime = Object.freeze({ bind: bind })
})()
