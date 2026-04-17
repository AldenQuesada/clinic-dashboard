/**
 * VPI Embaixadora - Haptic feedback + sons cristalinos (Fase 9 - Entrega 6)
 *
 * Ao bater tier, badge, indicacao fechada ou missao completa, o
 * mobile vibra + toca som cristalino. Nao e ruido — e ritualizacao.
 *
 * API:
 *   VPIEmbHaptic.vibrate(pattern_name)
 *   VPIEmbHaptic.playSound(sound_name)
 *   VPIEmbHaptic.fire(event_name)     // combo vibrate + sound
 *   VPIEmbHaptic.toggleMute()
 *   VPIEmbHaptic.isMuted()
 *
 * Patterns:
 *   badge:      [100, 50, 100]
 *   tier_up:    [200, 100, 200, 100, 300]
 *   indication: [150]
 *   mission:    [100, 50, 100, 50, 200]
 *
 * Sons (Web Audio, sine waves):
 *   chime:      3 notas ascendentes C-E-G
 *   crystal:    sine 800Hz decay 300ms
 *   swoosh:     noise decrescente
 *   ding:       sine 1200Hz fade 200ms
 *
 * Respeita:
 *   - prefers-reduced-motion -> skip tudo
 *   - localStorage vpi_haptic_muted -> skip som
 *   - navigator.vibrate ausente -> skip vibrate
 *   - Web Audio ausente -> skip som
 *
 * Expoe window.VPIEmbHaptic.
 */
;(function () {
  'use strict'
  if (window._vpiEmbHapticLoaded) return
  window._vpiEmbHapticLoaded = true

  var PATTERNS = {
    badge:      [100, 50, 100],
    tier_up:    [200, 100, 200, 100, 300],
    indication: [150],
    mission:    [100, 50, 100, 50, 200],
    egg:        [80, 40, 80],
  }

  var EVENT_MAP = {
    badge:      { pattern: 'badge',      sound: 'chime'   },
    tier_up:    { pattern: 'tier_up',    sound: 'chime'   },
    indication: { pattern: 'indication', sound: 'ding'    },
    mission:    { pattern: 'mission',    sound: 'crystal' },
    egg:        { pattern: 'egg',        sound: 'crystal' },
  }

  function _reduceMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch (_) { return false }
  }

  function isMuted() {
    try { return localStorage.getItem('vpi_haptic_muted') === '1' }
    catch (_) { return false }
  }

  function toggleMute() {
    try {
      var next = !isMuted()
      localStorage.setItem('vpi_haptic_muted', next ? '1' : '0')
      _updateToggleIcon()
      return next
    } catch (_) { return false }
  }

  // ── Vibrate ─────────────────────────────────────────────
  function vibrate(patternName) {
    if (_reduceMotion()) return false
    if (!navigator || !navigator.vibrate) return false
    var pat = PATTERNS[patternName]
    if (!pat) return false
    try { navigator.vibrate(pat); return true }
    catch (_) { return false }
  }

  // ── Audio ───────────────────────────────────────────────
  var _ctx = null
  function _ensureCtx() {
    if (_ctx) return _ctx
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      _ctx = new Ctx()
      return _ctx
    } catch (_) { return null }
  }

  function _tone(freq, start, dur, type, peak) {
    var ctx = _ensureCtx(); if (!ctx) return
    try {
      var osc = ctx.createOscillator()
      var g   = ctx.createGain()
      osc.type = type || 'sine'
      osc.frequency.value = freq
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(peak || 0.18, start + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(g); g.connect(ctx.destination)
      osc.start(start); osc.stop(start + dur + 0.02)
    } catch (_) {}
  }

  function _noiseBuffer(ctx, dur) {
    var sampleRate = ctx.sampleRate
    var frameCount = Math.floor(sampleRate * dur)
    var buf = ctx.createBuffer(1, frameCount, sampleRate)
    var out = buf.getChannelData(0)
    for (var i = 0; i < frameCount; i++) {
      out[i] = (Math.random() * 2 - 1) * (1 - i / frameCount) // decrescente
    }
    return buf
  }

  function playSound(name) {
    if (_reduceMotion()) return false
    if (isMuted()) return false
    var ctx = _ensureCtx(); if (!ctx) return false
    // Destravar em alguns browsers (Chrome/iOS) apos gesto do usuario
    try { if (ctx.state === 'suspended' && ctx.resume) ctx.resume() } catch (_) {}

    var t0 = ctx.currentTime

    try {
      if (name === 'chime') {
        // C5 523.25, E5 659.25, G5 783.99
        _tone(523.25, t0,        0.25, 'sine', 0.14)
        _tone(659.25, t0 + 0.12, 0.25, 'sine', 0.14)
        _tone(783.99, t0 + 0.24, 0.45, 'sine', 0.18)
        return true
      }
      if (name === 'crystal') {
        _tone(800, t0, 0.35, 'sine', 0.2)
        _tone(1200, t0 + 0.05, 0.28, 'sine', 0.1)
        return true
      }
      if (name === 'swoosh') {
        var buf = _noiseBuffer(ctx, 0.35)
        var src = ctx.createBufferSource()
        src.buffer = buf
        var g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34)
        src.connect(g); g.connect(ctx.destination)
        src.start(t0); src.stop(t0 + 0.36)
        return true
      }
      if (name === 'ding') {
        _tone(1200, t0, 0.2, 'sine', 0.18)
        return true
      }
    } catch (_) {}
    return false
  }

  function fire(eventName) {
    var cfg = EVENT_MAP[eventName]
    if (!cfg) return false
    vibrate(cfg.pattern)
    playSound(cfg.sound)
    return true
  }

  // ── Mute toggle no footer do cartao ─────────────────────
  function _volumeIconSVG(muted) {
    // Feather volume-2 / volume-x
    if (muted) {
      return '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
    }
    return '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>'
  }

  function _updateToggleIcon() {
    var btn = document.getElementById('vpi-btn-haptic-mute')
    if (!btn) return
    btn.innerHTML = _volumeIconSVG(isMuted())
    btn.setAttribute('title', isMuted() ? 'Ligar sons' : 'Silenciar sons')
  }

  function _injectMuteButton() {
    if (document.getElementById('vpi-btn-haptic-mute')) return
    var footer = document.querySelector('.vpi-optout-footer')
    if (!footer) return
    var btn = document.createElement('button')
    btn.id = 'vpi-btn-haptic-mute'
    btn.type = 'button'
    btn.style.cssText = 'background:transparent;border:1px solid rgba(245,245,245,0.2);border-radius:50%;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;color:rgba(245,245,245,0.75);cursor:pointer;margin-left:8px;vertical-align:middle'
    btn.innerHTML = _volumeIconSVG(isMuted())
    btn.setAttribute('title', isMuted() ? 'Ligar sons' : 'Silenciar sons')
    btn.addEventListener('click', function (e) {
      e.preventDefault()
      toggleMute()
      // Feedback auditivo ao reativar
      if (!isMuted()) {
        try { playSound('ding') } catch (_) {}
      }
    })
    footer.appendChild(btn)
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(_injectMuteButton, 200)
      })
    } else {
      setTimeout(_injectMuteButton, 200)
    }
    window.addEventListener('vpi-emb-rendered', function () {
      setTimeout(_injectMuteButton, 30)
    })
  }

  window.VPIEmbHaptic = {
    init:       init,
    vibrate:    vibrate,
    playSound:  playSound,
    fire:       fire,
    toggleMute: toggleMute,
    isMuted:    isMuted,
  }
})()
