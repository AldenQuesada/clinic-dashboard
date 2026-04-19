/**
 * LP Builder · Runtime: before-after-reveal slider
 *
 * Bind:
 *  - Drag mouse + touch + arrow keys no handle (PER stage)
 *  - Auto-rock (handle balança sozinho · rAF + sin oscillation)
 *  - Auto-carousel entre slides (fade 800ms · setInterval configurable)
 *  - Pause-on-interaction (3s idle → resume)
 *  - Dots tap → fade pra slide
 *
 *   LPBBaRevealRuntime.bind(rootEl)
 */
;(function () {
  'use strict'
  if (window.LPBBaRevealRuntime) return

  var ROCK_SPEED_MS = { slow: 6000, medium: 4000, fast: 2000 }
  var ROCK_RANGE    = { narrow: [35, 65], medium: [25, 75], full: [10, 90] }

  // Cleanup global · permite re-bind sem leak
  var _activeRoots = []
  function _killRoot(root) {
    if (root._rockRaf) { cancelAnimationFrame(root._rockRaf); root._rockRaf = null }
    if (root._slideTimer) { clearInterval(root._slideTimer); root._slideTimer = null }
    if (root._resumeTimer) { clearTimeout(root._resumeTimer); root._resumeTimer = null }
    root._rockActive  = false
    root._slidesActive = false
  }
  function _killAll() { _activeRoots.forEach(_killRoot); _activeRoots = [] }

  function _setPos(stage, pos) {
    pos = Math.max(0, Math.min(100, pos))
    var after = stage.querySelector('[data-bars-after]')
    var line  = stage.querySelector('[data-bars-line]')
    if (after) after.style.clipPath = 'inset(0 0 0 ' + pos + '%)'
    if (line)  line.style.left = pos + '%'
    stage.dataset.pos = pos
  }

  function _activeStage(root) {
    // Slide visivel = stage atual (display != none)
    var slides = root.querySelectorAll('[data-bars-slide]')
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].style.display !== 'none') {
        return slides[i].querySelector('[data-bars-stage]')
      }
    }
    return root.querySelector('[data-bars-stage]')
  }

  // ── Auto-rock ──────────────────────────────────────────────
  function _startRock(root) {
    if (!root._rockSettings.on) return
    var period = ROCK_SPEED_MS[root._rockSettings.speed] || 4000
    var range  = ROCK_RANGE[root._rockSettings.range]    || [25, 75]
    var min = range[0], max = range[1]
    var center = (min + max) / 2
    var amp    = (max - min) / 2
    var startTime = performance.now()
    root._rockActive = true

    function tick(t) {
      if (!root._rockActive) return
      var stage = _activeStage(root)
      if (!stage) { root._rockRaf = requestAnimationFrame(tick); return }
      var elapsed = (t - startTime) % period
      var phase = elapsed / period * 2 * Math.PI
      var pos = center + amp * Math.sin(phase)
      _setPos(stage, pos)
      root._rockRaf = requestAnimationFrame(tick)
    }
    root._rockRaf = requestAnimationFrame(tick)
  }
  function _stopRock(root) {
    root._rockActive = false
    if (root._rockRaf) { cancelAnimationFrame(root._rockRaf); root._rockRaf = null }
  }

  // ── Auto-carousel (fade entre slides) ──────────────────────
  function _startSlides(root) {
    if (!root._slidesSettings.on) return
    var slides = root.querySelectorAll('[data-bars-slide]')
    if (slides.length < 2) return
    var dots = root.querySelectorAll('[data-bars-dot], .blk-bars-dot')
    var cur = 0
    root._slidesActive = true

    function goTo(idx) {
      if (idx === cur) return
      var prev = slides[cur]
      var next = slides[idx]
      prev.style.opacity = '0'
      setTimeout(function () {
        prev.style.display = 'none'
        next.style.display = 'block'
        // reset handle position pra initial_pos do slide novo
        var nextStage = next.querySelector('[data-bars-stage]')
        if (nextStage) {
          var initialPos = parseFloat(nextStage.dataset.initialPos) || 50
          _setPos(nextStage, initialPos)
        }
        void next.offsetWidth
        next.style.opacity = '1'
        cur = idx
      }, 800)
      dots.forEach(function (d, di) { d.classList.toggle('active', di === idx) })
    }

    var ms = (root._slidesSettings.intervalSec || 6) * 1000
    root._slideTimer = setInterval(function () {
      goTo((cur + 1) % slides.length)
    }, ms)

    // Dots tap
    dots.forEach(function (d, di) {
      d.addEventListener('click', function () {
        if (di === cur) return
        clearInterval(root._slideTimer)
        goTo(di)
        root._slideTimer = setInterval(function () {
          goTo((cur + 1) % slides.length)
        }, ms)
      })
    })
  }
  function _stopSlides(root) {
    root._slidesActive = false
    if (root._slideTimer) { clearInterval(root._slideTimer); root._slideTimer = null }
  }

  // ── Pause em interacao + resume após 3s idle ───────────────
  function _pauseAutoplay(root) {
    _stopRock(root)
    _stopSlides(root)
    if (root._resumeTimer) clearTimeout(root._resumeTimer)
    root._resumeTimer = setTimeout(function () {
      _startRock(root)
      _startSlides(root)
    }, 3000)
  }

  function _bindStage(stage, root) {
    if (stage.__barsBound) return
    stage.__barsBound = true

    var dragging = false

    function _moveTo(clientX) {
      var rect = stage.getBoundingClientRect()
      if (rect.width <= 0) return
      var pos = ((clientX - rect.left) / rect.width) * 100
      _setPos(stage, pos)
    }

    stage.addEventListener('pointerdown', function (e) {
      e.preventDefault()
      dragging = true
      try { stage.setPointerCapture(e.pointerId) } catch (_) {}
      _moveTo(e.clientX)
      _pauseAutoplay(root)
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

    var handle = stage.querySelector('[data-bars-handle]')
    if (handle) {
      handle.addEventListener('keydown', function (e) {
        var pos = parseFloat(stage.dataset.pos) || 50
        if (e.key === 'ArrowLeft')  { _setPos(stage, pos - 5); _pauseAutoplay(root); e.preventDefault() }
        if (e.key === 'ArrowRight') { _setPos(stage, pos + 5); _pauseAutoplay(root); e.preventDefault() }
        if (e.key === 'Home')       { _setPos(stage, 0);       _pauseAutoplay(root); e.preventDefault() }
        if (e.key === 'End')        { _setPos(stage, 100);     _pauseAutoplay(root); e.preventDefault() }
      })
    }
  }

  function _bindRoot(root) {
    if (root.__barsRootBound) return
    root.__barsRootBound = true
    _activeRoots.push(root)

    // Le settings dos data-attrs
    root._rockSettings = {
      on:    root.getAttribute('data-autoplay-rock') === '1',
      speed: root.getAttribute('data-rock-speed') || 'medium',
      range: root.getAttribute('data-rock-range') || 'medium',
    }
    root._slidesSettings = {
      on: root.getAttribute('data-autoplay-slides') === '1',
      intervalSec: parseInt(root.getAttribute('data-slides-interval'), 10) || 6,
    }

    // Bind cada stage (drag handler)
    var stages = root.querySelectorAll('[data-bars-stage]')
    stages.forEach(function (st) { _bindStage(st, root) })

    // Inicia autoplays
    _startRock(root)
    _startSlides(root)

    // Pausa em hover (desktop)
    root.addEventListener('mouseenter', function () { _stopRock(root); _stopSlides(root) })
    root.addEventListener('mouseleave', function () {
      if (root._rockSettings.on)   _startRock(root)
      if (root._slidesSettings.on) _startSlides(root)
    })
  }

  function bind(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return
    _killAll()  // cleanup re-bind safe
    var roots = rootEl.querySelectorAll('[data-bars-root]')
    roots.forEach(_bindRoot)
  }

  window.LPBBaRevealRuntime = Object.freeze({ bind: bind })
})()
