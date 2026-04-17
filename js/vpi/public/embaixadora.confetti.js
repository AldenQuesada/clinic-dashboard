/**
 * VPI Embaixadora - Confetti Canvas
 *
 * Canvas 2D fullscreen fixed. Dispara chuva de confetti com
 * 120 particulas (fisica simples com gravidade + rotacao + fade).
 * Cores adaptativas ao tier do partner.
 *
 * API publica: VPIEmbConfetti.fire(opts?)
 *   opts.tier - 'bronze' | 'prata' | 'ouro' | 'diamante'
 *   opts.count - numero de particulas (default 120)
 *   opts.duration - ms (default 3000)
 */
;(function () {
  'use strict'
  if (window._vpiEmbConfettiLoaded) return
  window._vpiEmbConfettiLoaded = true

  var PALETTES = {
    bronze:   ['#CD7F32', '#8B5A2B', '#D79854', '#F4E4BC'],
    prata:    ['#C0C0C0', '#8A8A8A', '#E8E8E8', '#FFFFFF'],
    ouro:     ['#C9A96E', '#E4C795', '#8E7543', '#FFFFFF'],
    diamante: ['#7C3AED', '#E0C3FC', '#C9A96E', '#FFFFFF', '#F0ABFC'],
    default:  ['#C9A96E', '#5B21B6', '#FFFFFF'],
  }

  var _canvas = null
  var _ctx    = null
  var _raf    = 0
  var _parts  = []
  var _endAt  = 0
  var _paused = false

  function _ensureCanvas() {
    if (_canvas) return _canvas
    _canvas = document.createElement('canvas')
    _canvas.className = 'vpi-confetti-canvas'
    document.body.appendChild(_canvas)
    _ctx = _canvas.getContext('2d')
    _resize()
    window.addEventListener('resize', _resize, { passive: true })
    // Pausa animacao quando tab fica oculto (evita workload em background)
    try {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          _paused = true
          if (_raf) { cancelAnimationFrame(_raf); _raf = 0 }
        } else if (_paused) {
          _paused = false
          if (_parts.length > 0 && !_raf) {
            _raf = requestAnimationFrame(_step)
          }
        }
      })
    } catch (_) {}
    return _canvas
  }

  function _resize() {
    if (!_canvas) return
    var dpr = Math.min(window.devicePixelRatio || 1, 2)
    _canvas.width  = Math.floor(window.innerWidth  * dpr)
    _canvas.height = Math.floor(window.innerHeight * dpr)
    _canvas.style.width  = window.innerWidth  + 'px'
    _canvas.style.height = window.innerHeight + 'px'
    _ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function _makeParticle(palette) {
    var w = window.innerWidth
    var h = window.innerHeight
    return {
      x: w / 2 + (Math.random() - 0.5) * w * 0.6,
      y: -20 - Math.random() * 80,
      vx: (Math.random() - 0.5) * 6,
      vy: 2 + Math.random() * 4,
      g: 0.15 + Math.random() * 0.08,
      size: 6 + Math.random() * 7,
      color: palette[Math.floor(Math.random() * palette.length)],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.25,
      shape: Math.random() < 0.6 ? 'rect' : 'circle',
      life: 1,
      decay: 0.006 + Math.random() * 0.004,
      maxY: h + 40,
    }
  }

  function _step() {
    if (!_ctx) return
    var now = performance.now()
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height)

    var alive = 0
    for (var i = 0; i < _parts.length; i++) {
      var p = _parts[i]
      if (p.life <= 0) continue
      p.vy += p.g
      p.x  += p.vx
      p.y  += p.vy
      p.rot += p.vr
      if (p.y > p.maxY) p.life = 0
      else {
        if (now > _endAt) p.life -= p.decay
        alive++
        _ctx.save()
        _ctx.globalAlpha = Math.max(0, p.life)
        _ctx.translate(p.x, p.y)
        _ctx.rotate(p.rot)
        _ctx.fillStyle = p.color
        if (p.shape === 'circle') {
          _ctx.beginPath()
          _ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          _ctx.fill()
        } else {
          _ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66)
        }
        _ctx.restore()
      }
    }

    if (alive > 0 && !_paused) {
      // Defensivo: cancela raf anterior antes de reassign pra evitar loops duplos
      if (_raf) cancelAnimationFrame(_raf)
      _raf = requestAnimationFrame(_step)
    } else {
      if (_raf) { cancelAnimationFrame(_raf); _raf = 0 }
      // Limpa particulas quando todas se foram — libera memory
      if (alive === 0) {
        _parts.length = 0
        _ctx.clearRect(0, 0, _canvas.width, _canvas.height)
      }
    }
  }

  function fire(opts) {
    opts = opts || {}
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return // respect user setting
      }
    } catch (_) {}
    _ensureCanvas()
    var tier = opts.tier || 'default'
    var palette = PALETTES[tier] || PALETTES.default
    var count = Math.max(30, Math.min(300, opts.count || 120))
    var duration = Math.max(600, Math.min(8000, opts.duration || 3000))
    _endAt = performance.now() + duration

    // Append novas particulas (permite re-fire)
    for (var i = 0; i < count; i++) _parts.push(_makeParticle(palette))

    // Defensivo: cancela raf anterior antes de reassign
    if (_raf) { cancelAnimationFrame(_raf); _raf = 0 }
    if (!_paused) _raf = requestAnimationFrame(_step)
  }

  window.VPIEmbConfetti = { fire: fire }
})()
