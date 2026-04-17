/**
 * VPI Embaixadora - Easter Eggs por Tier (Fase 9 - Entrega 3)
 *
 * Gestos especificos desbloqueiam animacoes custom por tier.
 *   - Bronze:   3 toques rapidos (< 400ms entre toques) no nome
 *   - Prata:    5 toques rapidos no nome
 *   - Ouro:     long press 3 segundos sem mover no cartao
 *   - Diamante: sequencia ↑↑↓↓ via swipes
 *
 * Cada egg so dispara se o tier do partner e >= tier do egg.
 * Cooldown 1h via sessionStorage.
 *
 * Expoe window.VPIEmbEaster.
 */
;(function () {
  'use strict'
  if (window._vpiEmbEasterLoaded) return
  window._vpiEmbEasterLoaded = true

  var TIER_RANK = { bronze: 1, prata: 2, ouro: 3, diamante: 4 }
  var COOLDOWN_MS = 60 * 60 * 1000  // 1h

  function _app() { return window.VPIEmbApp }
  function _sb()  { return window._sbShared }
  function _token() { return _app() && _app().getToken && _app().getToken() }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _getTier() {
    try {
      var d = _app() && _app().getData()
      return (d && d.partner && d.partner.tier_atual) || 'bronze'
    } catch (_) { return 'bronze' }
  }

  function _canTriggerForTier(eggTier) {
    var current = TIER_RANK[_getTier()] || 1
    var needed  = TIER_RANK[eggTier] || 99
    return current >= needed
  }

  function _cooldownExpired(code) {
    try {
      var last = sessionStorage.getItem('vpi_egg_' + code)
      if (!last) return true
      return (Date.now() - Number(last)) >= COOLDOWN_MS
    } catch (_) { return true }
  }

  function _markCooldown(code) {
    try { sessionStorage.setItem('vpi_egg_' + code, String(Date.now())) } catch (_) {}
  }

  function _reduceMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch (_) { return false }
  }

  // ── Som via Web Audio API (sem arquivo) ─────────────────
  var _audioCtx = null
  function _ensureAudio() {
    if (_audioCtx) return _audioCtx
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      _audioCtx = new Ctx()
      return _audioCtx
    } catch (_) { return null }
  }

  function _playCrystal(freq, dur) {
    var ctx = _ensureAudio()
    if (!ctx) return
    try {
      var t = ctx.currentTime
      var osc = ctx.createOscillator()
      var g   = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq || 900
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.4))
      osc.connect(g); g.connect(ctx.destination)
      osc.start(t); osc.stop(t + (dur || 0.4) + 0.02)
    } catch (_) {}
  }

  // ── Toast custom do easter ──────────────────────────────
  function _eggToast(msg, color) {
    var el = document.createElement('div')
    el.className = 'vpi-egg-toast'
    el.style.cssText = 'position:fixed;top:24px;left:50%;transform:translate(-50%,-40px);z-index:10050;padding:12px 20px;border-radius:14px;background:' + (color || '#0B0813') + ';color:#fff;font-size:13px;font-weight:700;box-shadow:0 12px 40px rgba(0,0,0,.5);opacity:0;transition:transform .4s cubic-bezier(.2,.9,.3,1.2),opacity .4s ease'
    el.textContent = msg
    document.body.appendChild(el)
    requestAnimationFrame(function () {
      el.style.opacity = '1'
      el.style.transform = 'translate(-50%,0)'
    })
    setTimeout(function () {
      el.style.opacity = '0'
      el.style.transform = 'translate(-50%,-40px)'
      setTimeout(function () { el.remove() }, 500)
    }, 3600)
  }

  // ── Animacoes por tier ──────────────────────────────────
  function _animBronze() {
    // Confetti bronze pequeno: 40 partículas cobre + sparkle
    if (_reduceMotion()) return
    var layer = document.createElement('div')
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10030;overflow:hidden'
    for (var i = 0; i < 40; i++) {
      var p = document.createElement('div')
      var size = 6 + Math.random() * 6
      var left = Math.random() * 100
      var delay = Math.random() * 300
      var dur = 1400 + Math.random() * 800
      p.style.cssText = 'position:absolute;top:-10px;left:' + left + '%;width:' + size + 'px;height:' + size + 'px;background:linear-gradient(135deg,#CD7F32,#F5A142);border-radius:50%;opacity:0.9;box-shadow:0 0 8px #CD7F32;animation:vpiEggFall ' + dur + 'ms ' + delay + 'ms ease-in forwards'
      layer.appendChild(p)
    }
    document.body.appendChild(layer)
    setTimeout(function () { layer.remove() }, 2800)
  }

  function _animPrata() {
    if (_reduceMotion()) return
    // Shimmer prata full card: overlay com gradient sweep
    var card = document.querySelector('.vpi-card-outer')
    if (!card) { _animBronze(); return }
    var ov = document.createElement('div')
    ov.style.cssText = 'position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,0.45) 50%,transparent 70%);mix-blend-mode:overlay;z-index:3;transform:translateX(-100%);transition:transform 1.3s cubic-bezier(.1,.9,.2,1)'
    // Garantir position:relative
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative'
    card.appendChild(ov)
    requestAnimationFrame(function () {
      ov.style.transform = 'translateX(100%)'
    })
    setTimeout(function () { ov.remove() }, 1600)
  }

  function _animOuro() {
    if (_reduceMotion()) return
    // Anel dourado pulsante no card
    var card = document.querySelector('.vpi-card-outer')
    if (!card) return
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative'
    var ring = document.createElement('div')
    ring.style.cssText = 'position:absolute;inset:-10px;border-radius:inherit;pointer-events:none;box-shadow:0 0 0 3px #C9A96E,0 0 40px 10px rgba(201,169,110,.6);z-index:4;animation:vpiEggRing 1.8s ease-out 3 forwards'
    card.appendChild(ring)
    setTimeout(function () { ring.remove() }, 5600)
  }

  function _animDiamante() {
    if (_reduceMotion()) return
    // Hologram fullscreen overlay com iridescencia
    var ov = document.createElement('div')
    ov.style.cssText = 'position:fixed;inset:0;z-index:10040;pointer-events:none;background:conic-gradient(from 0deg at 50% 50%,rgba(255,0,200,.22),rgba(0,200,255,.22),rgba(200,255,0,.22),rgba(255,120,0,.22),rgba(255,0,200,.22));mix-blend-mode:overlay;animation:vpiEggHolo 2.8s ease-in-out forwards'
    document.body.appendChild(ov)
    setTimeout(function () { ov.remove() }, 3000)
  }

  function _injectStyles() {
    if (document.getElementById('vpi-egg-style')) return
    var s = document.createElement('style')
    s.id = 'vpi-egg-style'
    s.textContent =
      '@keyframes vpiEggFall { to { transform: translateY(120vh) rotate(720deg); opacity: 0; } }' +
      '@keyframes vpiEggRing { 0% { transform: scale(0.95); opacity: 0; } 40% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.08); opacity: 0; } }' +
      '@keyframes vpiEggHolo { 0% { opacity: 0; transform: scale(1.1); } 20% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1); } }'
    document.head.appendChild(s)
  }

  // ── Audit + gate ────────────────────────────────────────
  function _fireServer(code) {
    var sb = _sb(), token = _token()
    if (!sb || !token) return
    try {
      sb.rpc('vpi_pub_easter_triggered', { p_token: token, p_egg_code: code })
        .then(function () { /* silent */ })
        .catch(function (_) {})
    } catch (_) {}
  }

  function _firstName() {
    try {
      var d = _app() && _app().getData()
      var n = d && d.partner && d.partner.nome
      return String(n || '').trim().split(/\s+/)[0] || 'Embaixadora'
    } catch (_) { return 'Embaixadora' }
  }

  function _trigger(code, tier, msg, color, animFn, soundFreq) {
    if (!_canTriggerForTier(tier)) return false
    if (!_cooldownExpired(code)) return false
    _markCooldown(code)
    _fireServer(code)
    try {
      // Fase 9 Entrega 6: reusa VPIEmbHaptic quando carregado
      if (window.VPIEmbHaptic && window.VPIEmbHaptic.fire) {
        window.VPIEmbHaptic.fire('egg')
      } else if (soundFreq) {
        _playCrystal(soundFreq, 0.6)
      }
    } catch (_) {}
    try { animFn && animFn() } catch (_) {}
    _eggToast(msg, color)
    return true
  }

  // ── Detectores de gesto ─────────────────────────────────
  function _bindTaps() {
    // Tap no elemento do nome dispara bronze (3 toques) / prata (5)
    function onTap(e) {
      var target = e.target.closest('.vpi-name')
      if (!target) return
      var now = Date.now()
      _tapTimes = _tapTimes.filter(function (t) { return (now - t) < 1400 })
      _tapTimes.push(now)
      if (_tapTimes.length >= 5) {
        _tapTimes.length = 0
        _trigger('prata_taps', 'prata',
          _firstName() + ', voce descobriu o easter egg PRATA!',
          '#8A8A8A', _animPrata, 1100)
      } else if (_tapTimes.length === 3) {
        // Bronze com delay pra permitir continuar pra 5
        setTimeout(function () {
          // So dispara bronze se nao virou prata no meio
          if (_tapTimes.length >= 3 && _tapTimes.length < 5) {
            _trigger('bronze_taps', 'bronze',
              _firstName() + ', voce descobriu o easter egg BRONZE!',
              '#8B5A2B', _animBronze, 900)
            _tapTimes.length = 0
          }
        }, 500)
      }
    }
    var _tapTimes = []
    document.addEventListener('click', onTap, true)
    document.addEventListener('touchend', function (e) {
      // sintetizar click em name pra capturar rapid taps em mobile
      var t = e.target && e.target.closest && e.target.closest('.vpi-name')
      if (t) onTap({ target: t })
    }, true)
  }

  function _bindLongPress() {
    var timer = null
    var startX = 0, startY = 0
    function cancel() { if (timer) { clearTimeout(timer); timer = null } }

    function onStart(e) {
      cancel()
      var pt = e.touches ? e.touches[0] : e
      if (!pt) return
      var target = e.target.closest && e.target.closest('.vpi-card-outer')
      if (!target) return
      startX = pt.clientX; startY = pt.clientY
      timer = setTimeout(function () {
        _trigger('ouro_press', 'ouro',
          'Poder do OURO ativado, ' + _firstName() + '!',
          '#C9A96E', _animOuro, 1320)
      }, 3000)
    }
    function onMove(e) {
      if (!timer) return
      var pt = e.touches ? e.touches[0] : e
      if (!pt) return
      if (Math.abs(pt.clientX - startX) > 8 || Math.abs(pt.clientY - startY) > 8) cancel()
    }
    document.addEventListener('mousedown',  onStart,  { passive: true })
    document.addEventListener('touchstart', onStart,  { passive: true })
    document.addEventListener('mousemove',  onMove,   { passive: true })
    document.addEventListener('touchmove',  onMove,   { passive: true })
    document.addEventListener('mouseup',    cancel,   { passive: true })
    document.addEventListener('touchend',   cancel,   { passive: true })
    document.addEventListener('touchcancel',cancel,   { passive: true })
  }

  function _bindKonami() {
    // Sequencia: up, up, down, down (via swipe em mobile ou setas desktop)
    var SEQ = ['up', 'up', 'down', 'down']
    var buf = []

    function push(dir) {
      buf.push(dir)
      if (buf.length > SEQ.length) buf.shift()
      if (buf.length === SEQ.length && buf.every(function (x, i) { return x === SEQ[i] })) {
        buf.length = 0
        _trigger('diamante_konami', 'diamante',
          'HOLOGRAM DIAMANTE liberado para ' + _firstName() + '!',
          '#7C3AED', _animDiamante, 1660)
      }
    }

    // Desktop: setas
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp')   push('up')
      if (e.key === 'ArrowDown') push('down')
    })

    // Mobile: swipe
    var sx = 0, sy = 0, tracking = false
    document.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) { tracking = false; return }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true
    }, { passive: true })
    document.addEventListener('touchend', function (e) {
      if (!tracking) return
      var t = e.changedTouches && e.changedTouches[0]; if (!t) return
      var dx = t.clientX - sx, dy = t.clientY - sy
      tracking = false
      if (Math.abs(dy) < 40) return
      if (Math.abs(dx) > Math.abs(dy)) return // so swipes verticais contam
      push(dy < 0 ? 'up' : 'down')
    }, { passive: true })
  }

  function init() {
    _injectStyles()
    _bindTaps()
    _bindLongPress()
    _bindKonami()
  }

  window.VPIEmbEaster = {
    init: init,
  }
})()
