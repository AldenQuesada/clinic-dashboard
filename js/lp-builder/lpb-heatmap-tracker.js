/**
 * LP Builder · Heatmap Tracker (Onda 25)
 *
 * Usado APENAS em lp.html. Captura clicks + scroll depth com batching.
 * Decisão de sampling no boot — se aceita, captura tudo dessa visita.
 *
 * API:
 *   LPBHeatmapTracker.boot(slug, rpc, lgpdEnabled)
 *
 * Boot decisions:
 *   · Bloqueia se LGPD analytics === false
 *   · Sampling 1/3 (configurável via window.LPB_HEATMAP_RATE)
 *   · Buffer de eventos, flush a cada 5s ou no unload
 */
;(function () {
  'use strict'
  if (window.LPBHeatmapTracker) return

  var FLUSH_MS = 5000
  var MAX_BUFFER = 50

  var _buffer = []
  var _flushTimer = null
  var _slug = null
  var _rpc = null
  var _visitorId = null
  var _lastScrollPct = 0

  function _isAllowed(lgpdEnabled) {
    if (!lgpdEnabled) return true
    return document.documentElement.dataset.lgpdAnalytics === '1'
  }

  function _flush() {
    if (!_buffer.length || !_rpc) return
    var batch = _buffer.slice()
    _buffer = []
    _rpc('lp_interaction_log_batch', { p_events: batch }).catch(function () {})
  }

  function _scheduleFlush() {
    if (_flushTimer) return
    _flushTimer = setTimeout(function () { _flushTimer = null; _flush() }, FLUSH_MS)
  }

  function _enqueue(ev) {
    _buffer.push(ev)
    if (_buffer.length >= MAX_BUFFER) _flush()
    else _scheduleFlush()
  }

  function _onClick(e) {
    if (!window.LPBHeatmapEngine) return
    var container = document.getElementById('lpRoot') || document.body
    var c = LPBHeatmapEngine.normalizeClick(e, container)
    if (!c) return
    _enqueue({
      page_slug:  _slug,
      visitor_id: _visitorId,
      event_type: 'click',
      x_pct:      c.x_pct,
      y_pct:      c.y_pct,
      block_idx:  c.block_idx,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
    })
  }

  var _scrollPending = false
  function _onScroll() {
    if (_scrollPending) return
    _scrollPending = true
    requestAnimationFrame(function () {
      _scrollPending = false
      if (!window.LPBHeatmapEngine) return
      var docH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight || 0)
      var pct  = LPBHeatmapEngine.computeMaxScrollPct(window.scrollY, window.innerHeight, docH)
      // só registra incrementos de >=10% (evita ruído)
      if (pct - _lastScrollPct >= 10 || (pct >= 95 && _lastScrollPct < 95)) {
        _lastScrollPct = pct
        _enqueue({
          page_slug:  _slug,
          visitor_id: _visitorId,
          event_type: 'scroll',
          scroll_pct: Math.round(pct * 100) / 100,
          viewport_w: window.innerWidth,
          viewport_h: window.innerHeight,
        })
      }
    })
  }

  function boot(slug, rpc, lgpdEnabled) {
    if (!slug || typeof rpc !== 'function') return
    if (!_isAllowed(lgpdEnabled)) return
    var rate = window.LPB_HEATMAP_RATE || 3
    if (!window.LPBHeatmapEngine || !LPBHeatmapEngine.sampleDecision(rate)) return

    _slug = slug
    _rpc  = rpc
    _visitorId = window.LPBJourneyEngine ? LPBJourneyEngine.getVisitorId() : 'anon'

    document.addEventListener('click', _onClick, true)
    window.addEventListener('scroll', _onScroll, { passive: true })
    window.addEventListener('beforeunload', _flush)
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') _flush()
    })
  }

  window.LPBHeatmapTracker = Object.freeze({ boot: boot })
})()
