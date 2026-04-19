/**
 * LP Builder · Transformation Reel Runtime (Onda 29)
 *
 * Ativa todos reels [data-reel-root] em rootEl.
 *   · IntersectionObserver: pause out-of-view, play in-view
 *   · Mute toggle salvo em sessionStorage (preferência por sessão)
 *   · Track: reel_play (1x), reel_complete (80%+), reel_cta_click
 *   · Fallback se autoplay bloqueado: revela play button overlay
 *
 *   LPBReelRuntime.bind(rootEl)
 */
;(function () {
  'use strict'
  if (window.LPBReelRuntime) return

  var BOUND_ATTR = 'data-reel-bound'
  var SESSION_KEY = 'lpb_reel_muted'  // '1' ou '0'

  function _track(event, meta) {
    if (window.LPBEngagement && LPBEngagement.track) {
      try { LPBEngagement.track(event, meta || {}) } catch (_) {}
    }
  }

  function _getSessionMuted() {
    try {
      var v = sessionStorage.getItem(SESSION_KEY)
      if (v === '0') return false
      return true  // default mutado
    } catch (_) { return true }
  }
  function _setSessionMuted(muted) {
    try { sessionStorage.setItem(SESSION_KEY, muted ? '1' : '0') } catch (_) {}
  }

  function _bindOne(rootEl) {
    if (!rootEl || rootEl.getAttribute(BOUND_ATTR) === '1') return
    rootEl.setAttribute(BOUND_ATTR, '1')

    var video    = rootEl.querySelector('[data-reel-video]')
    var muteBtn  = rootEl.querySelector('[data-reel-mute]')
    var playBtn  = rootEl.querySelector('[data-reel-play]')
    var ctaEl    = rootEl.querySelector('[data-reel-cta]')
    var aspect   = rootEl.getAttribute('data-aspect') || '9/16'
    var autoplay = rootEl.getAttribute('data-autoplay') !== 'no'

    // CTA click track (mesmo sem vídeo)
    if (ctaEl) {
      ctaEl.addEventListener('click', function () {
        _track('reel_cta_click', { aspect: aspect, href: ctaEl.getAttribute('href') || '' })
      })
    }

    if (!video) return

    // Aplica preferência inicial de mute
    var initialMuted = _getSessionMuted()
    try {
      video.muted = initialMuted
      if (muteBtn) {
        muteBtn.setAttribute('aria-pressed', initialMuted ? 'false' : 'true')
        muteBtn.setAttribute('aria-label', initialMuted ? 'Ativar som' : 'Desativar som')
        if (initialMuted) muteBtn.classList.remove('is-unmuted')
        else              muteBtn.classList.add('is-unmuted')
      }
    } catch (_) {}

    // Mute toggle
    if (muteBtn) {
      muteBtn.addEventListener('click', function (e) {
        e.preventDefault()
        try {
          var nowMuted = !video.muted
          video.muted = nowMuted
          _setSessionMuted(nowMuted)
          muteBtn.setAttribute('aria-pressed', nowMuted ? 'false' : 'true')
          muteBtn.setAttribute('aria-label', nowMuted ? 'Ativar som' : 'Desativar som')
          if (nowMuted) muteBtn.classList.remove('is-unmuted')
          else          muteBtn.classList.add('is-unmuted')
          _track('reel_mute_toggle', { muted: nowMuted })
        } catch (_) {}
      })
    }

    // Play overlay (fallback se autoplay falhou)
    if (playBtn) {
      playBtn.addEventListener('click', function (e) {
        e.preventDefault()
        try {
          var pl = video.play()
          if (pl && typeof pl.then === 'function') {
            pl.then(function () { playBtn.hidden = true }).catch(function () {})
          } else {
            playBtn.hidden = true
          }
        } catch (_) {}
      })
    }

    // Track play (1x)
    var playedOnce = false
    var completed  = false
    video.addEventListener('play', function () {
      if (playedOnce) return
      playedOnce = true
      _track('reel_play', { aspect: aspect, src: video.currentSrc || video.src || '' })
    })

    // Track 80% complete
    video.addEventListener('timeupdate', function () {
      if (completed) return
      try {
        if (video.duration > 0 && (video.currentTime / video.duration) >= 0.8) {
          completed = true
          _track('reel_complete', { aspect: aspect, percent: 80 })
        }
      } catch (_) {}
    })

    // Tenta autoplay (se config = yes)
    function _tryAutoplay() {
      if (!autoplay) return
      try {
        var pl = video.play()
        if (pl && typeof pl.then === 'function') {
          pl.catch(function () {
            // autoplay bloqueado · revela play button
            if (playBtn) playBtn.hidden = false
          })
        }
      } catch (_) {
        if (playBtn) playBtn.hidden = false
      }
    }

    // IntersectionObserver: play in-view, pause out-of-view
    if ('IntersectionObserver' in window) {
      try {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              _tryAutoplay()
            } else {
              try { if (!video.paused) video.pause() } catch (_) {}
            }
          })
        }, { threshold: 0.4 })
        io.observe(rootEl)
      } catch (_) {
        _tryAutoplay()
      }
    } else {
      _tryAutoplay()
    }
  }

  function bind(rootEl) {
    if (!rootEl) rootEl = document
    try {
      var nodes = rootEl.querySelectorAll('[data-reel-root]')
      for (var i = 0; i < nodes.length; i++) {
        _bindOne(nodes[i])
      }
    } catch (e) {
      try { console.warn('[reel] bind erro:', e) } catch (_) {}
    }
  }

  window.LPBReelRuntime = Object.freeze({ bind: bind })
})()
