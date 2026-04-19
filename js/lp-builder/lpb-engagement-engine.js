/**
 * LP Builder · Engagement Engine (Onda 29 · foundation)
 *
 * Núcleo PURO. Sem fetch, sem DOM (apenas localStorage + window events).
 * Usado por TODOS os blocos de conversão (anatomy-quiz, smart-popup,
 * collagen-animation, live-counter, transformation-reel, smart-cta).
 *
 * Responsabilidades:
 *   1. Gatilhos: time/scroll/exit-intent/manual com cleanup
 *   2. Cooldowns por visitor (localStorage 24h default · configurável)
 *   3. Buffer + flush remoto via lp_engagement_log_batch
 *   4. Visitor profile (LPBJourneyEngine.getVisitorId reuso)
 *   5. Respeita LGPD: bloqueia se analytics === false
 *
 * Independente · testável isolado · zero acoplamento com outros blocos.
 *
 * API:
 *   LPBEngagement.boot({ slug, rpc, lgpdEnabled })  // 1x no lp.html
 *   LPBEngagement.track(eventType, payload)          // a qualquer momento
 *   LPBEngagement.onTrigger({ type, after, percent, once, cooldownH }, callback)
 *   LPBEngagement.cooldownActive(key, hours)         // bool
 *   LPBEngagement.markCooldown(key)                  // seta cooldown agora
 *   LPBEngagement.getVisitorId()                     // proxy pra LPBJourneyEngine
 */
;(function () {
  'use strict'
  if (window.LPBEngagement) return

  // ──────────────────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────────────────
  var _slug = null
  var _rpc = null
  var _lgpdEnabled = false
  var _booted = false
  var _buffer = []
  var _flushTimer = null
  var _registered = []  // [{ type, fn, cleanup }]

  var FLUSH_MS = 3500
  var MAX_BUFFER = 30
  var COOLDOWN_PREFIX = 'lpb_eng_cd::'

  // ──────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────
  function getVisitorId() {
    if (window.LPBJourneyEngine && LPBJourneyEngine.getVisitorId) {
      return LPBJourneyEngine.getVisitorId()
    }
    // fallback minimal
    try {
      var k = 'lpb_visitor_id'
      var v = localStorage.getItem(k)
      if (v) return v
      v = 'v_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36)
      localStorage.setItem(k, v)
      return v
    } catch (_) { return 'anon_' + Math.random().toString(36).slice(2) }
  }

  function _isAllowed() {
    if (!_lgpdEnabled) return true
    return document.documentElement.dataset.lgpdAnalytics === '1'
  }

  // ──────────────────────────────────────────────────────────
  // Cooldowns (localStorage)
  // ──────────────────────────────────────────────────────────
  function cooldownActive(key, hours) {
    if (!key) return false
    try {
      var raw = localStorage.getItem(COOLDOWN_PREFIX + key)
      if (!raw) return false
      var ts = parseInt(raw, 10)
      if (!ts) return false
      var deltaMs = Date.now() - ts
      var maxMs = (hours || 24) * 3600 * 1000
      return deltaMs < maxMs
    } catch (_) { return false }
  }

  function markCooldown(key) {
    if (!key) return
    try { localStorage.setItem(COOLDOWN_PREFIX + key, String(Date.now())) } catch (_) {}
  }

  function clearCooldown(key) {
    if (!key) return
    try { localStorage.removeItem(COOLDOWN_PREFIX + key) } catch (_) {}
  }

  // ──────────────────────────────────────────────────────────
  // Tracking · buffer + flush
  // ──────────────────────────────────────────────────────────
  function track(eventType, payload) {
    if (!_isAllowed() || !_slug || !eventType) return
    _buffer.push({
      page_slug:  _slug,
      visitor_id: getVisitorId(),
      event_type: eventType,
      payload:    payload || {},
    })
    if (_buffer.length >= MAX_BUFFER) _flush()
    else _scheduleFlush()
  }

  function _flush() {
    if (!_buffer.length || !_rpc) return
    var batch = _buffer.slice()
    _buffer = []
    _rpc('lp_engagement_log_batch', { p_events: batch }).catch(function () {})
  }

  function _scheduleFlush() {
    if (_flushTimer) return
    _flushTimer = setTimeout(function () {
      _flushTimer = null
      _flush()
    }, FLUSH_MS)
  }

  // ──────────────────────────────────────────────────────────
  // Triggers
  //   { type: 'time'|'scroll'|'exit-intent'|'manual',
  //     after: ms (time), percent: % (scroll),
  //     once: true (default), cooldownKey: str, cooldownH: 24 }
  // ──────────────────────────────────────────────────────────
  function onTrigger(opts, callback) {
    if (typeof callback !== 'function') return
    opts = opts || {}
    var type = opts.type || 'manual'
    var once = opts.once !== false
    var fired = false

    function _maybeFire(meta) {
      if (once && fired) return
      if (opts.cooldownKey && cooldownActive(opts.cooldownKey, opts.cooldownH || 24)) return
      fired = true
      if (opts.cooldownKey) markCooldown(opts.cooldownKey)
      try { callback(meta || {}) } catch (e) { console.warn('[engagement] trigger callback erro:', e) }
    }

    var cleanup = function () {}

    if (type === 'time') {
      var ms = parseInt(opts.after, 10) || 30000
      var t = setTimeout(function () { _maybeFire({ type: 'time', after: ms }) }, ms)
      cleanup = function () { clearTimeout(t) }
    }
    else if (type === 'scroll') {
      var pct = parseFloat(opts.percent) || 50
      var pending = false
      var onScroll = function () {
        if (pending || fired) return
        pending = true
        requestAnimationFrame(function () {
          pending = false
          var docH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight || 0)
          var max = Math.max(1, docH - window.innerHeight)
          var p = (window.scrollY / max) * 100
          if (p >= pct) {
            _maybeFire({ type: 'scroll', percent: p })
            window.removeEventListener('scroll', onScroll)
          }
        })
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      cleanup = function () { window.removeEventListener('scroll', onScroll) }
    }
    else if (type === 'exit-intent') {
      // Mouse sai pra cima da viewport (intenção de fechar aba/voltar)
      var onLeave = function (e) {
        if (e.clientY <= 0 && !fired) _maybeFire({ type: 'exit-intent' })
      }
      document.addEventListener('mouseout', onLeave)
      cleanup = function () { document.removeEventListener('mouseout', onLeave) }
    }
    else if (type === 'manual') {
      // só dispara via callback externo
      cleanup = function () {}
    }

    var reg = { type: type, fire: _maybeFire, cleanup: cleanup }
    _registered.push(reg)
    return {
      fire: function (meta) { _maybeFire(meta) },  // pra trigger manual
      cancel: function () { cleanup() },
    }
  }

  // ──────────────────────────────────────────────────────────
  // Boot · 1x no lp.html
  // ──────────────────────────────────────────────────────────
  function boot(opts) {
    if (_booted) return
    opts = opts || {}
    _slug = opts.slug
    _rpc = opts.rpc
    _lgpdEnabled = !!opts.lgpdEnabled
    _booted = true

    // flush no unload (não perde batches finais)
    window.addEventListener('beforeunload', _flush)
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') _flush()
    })

    // Auto-track view inicial (apenas 1x por sessão)
    track('page_view', { ts: Date.now(), referrer: (document.referrer || '').slice(0, 200) })
  }

  function isBooted() { return _booted }
  function getSlug()  { return _slug }
  function getRpc()   { return _rpc }

  window.LPBEngagement = Object.freeze({
    boot:           boot,
    track:          track,
    onTrigger:      onTrigger,
    cooldownActive: cooldownActive,
    markCooldown:   markCooldown,
    clearCooldown:  clearCooldown,
    getVisitorId:   getVisitorId,
    isBooted:       isBooted,
    getSlug:        getSlug,
    getRpc:         getRpc,
  })
})()
