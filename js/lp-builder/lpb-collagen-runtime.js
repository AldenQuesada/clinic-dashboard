/**
 * LP Builder · Collagen Animation Runtime (Onda 29)
 *
 * Liga o loop de animação em todos [data-collagen-root] dentro de rootEl.
 *
 * Comportamento:
 *   · setInterval 3000ms ciclando data-stage entre "0" → "30" → "60" → "0"
 *   · mouseenter pausa · mouseleave retoma
 *   · IntersectionObserver: só anima quando bloco está visível (perf)
 *   · Track LPBEngagement.collagen_view 1x quando entra viewport
 *   · Track LPBEngagement.collagen_cta_click ao clicar CTA com meta { stage_at_click }
 *
 *   LPBCollagenRuntime.bind(rootEl)
 */
;(function () {
  'use strict'
  if (window.LPBCollagenRuntime) return

  var STAGE_MS = 3000
  var STAGES = ['0', '30', '60']
  var SUBTITLES = {
    '0':  'Pele com sinais de tempo · colágeno disperso',
    '30': 'Estimulação iniciada · novas fibras se formando',
    '60': 'Firmeza visível · pele renovada',
  }
  var LABELS = {
    '0':  'Hoje',
    '30': '30 dias',
    '60': '60 dias',
  }

  function _track(eventType, payload) {
    try {
      if (window.LPBEngagement && typeof LPBEngagement.track === 'function') {
        LPBEngagement.track(eventType, payload || {})
      }
    } catch (_) {}
  }

  function _bindOne(root) {
    if (!root || root.__collagenBound) return
    root.__collagenBound = true

    var labelEl = root.querySelector('[data-stage-label]')
    var subEl   = root.querySelector('[data-stage-sub]')
    var dots    = root.querySelectorAll('[data-marker]')
    var cta     = root.querySelector('[data-collagen-cta]')

    var idx = 0
    var timer = null
    var paused = false
    var visible = false
    var viewTracked = false

    function applyStage(stage) {
      try {
        root.setAttribute('data-stage', stage)
        if (labelEl) labelEl.textContent = LABELS[stage] || ''
        if (subEl)   subEl.textContent   = SUBTITLES[stage] || ''
        if (dots && dots.length) {
          for (var i = 0; i < dots.length; i++) {
            var d = dots[i]
            if (!d) continue
            d.classList.toggle('is-active', d.getAttribute('data-marker') === stage)
          }
        }
      } catch (_) {}
    }

    function tick() {
      if (paused || !visible) return
      idx = (idx + 1) % STAGES.length
      applyStage(STAGES[idx])
    }

    function start() {
      if (timer) return
      timer = setInterval(tick, STAGE_MS)
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null }
    }

    // Pause on hover
    root.addEventListener('mouseenter', function () { paused = true })
    root.addEventListener('mouseleave', function () { paused = false })

    // CTA click tracking
    if (cta) {
      cta.addEventListener('click', function () {
        _track('collagen_cta_click', { stage_at_click: STAGES[idx] })
      })
    }

    // Visibility-driven start/stop
    if ('IntersectionObserver' in window) {
      try {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              visible = true
              if (!viewTracked) {
                viewTracked = true
                _track('collagen_view', {})
              }
              start()
            } else {
              visible = false
              stop()
            }
          })
        }, { threshold: 0.25 })
        io.observe(root)
      } catch (_) {
        // Fallback: anima direto
        visible = true
        if (!viewTracked) { viewTracked = true; _track('collagen_view', {}) }
        start()
      }
    } else {
      visible = true
      if (!viewTracked) { viewTracked = true; _track('collagen_view', {}) }
      start()
    }

    // Estado inicial
    applyStage(STAGES[0])
  }

  function bind(rootEl) {
    try {
      var scope = rootEl || document
      var nodes = scope.querySelectorAll('[data-collagen-root]')
      for (var i = 0; i < nodes.length; i++) {
        try { _bindOne(nodes[i]) } catch (e) {
          if (window.console) console.warn('[LPBCollagenRuntime] bind erro:', e)
        }
      }
    } catch (e) {
      if (window.console) console.warn('[LPBCollagenRuntime] scope erro:', e)
    }
  }

  window.LPBCollagenRuntime = Object.freeze({ bind: bind })
})()
