/**
 * LP Builder · Journey Tracker (Onda 24)
 *
 * Usado APENAS em lp.html. Registra:
 *   · entrada na LP atual (com from_slug se referer foi outra LP)
 *   · clicks em links pra outras LPs (data-lp-link ou href contendo /lp.html?s=)
 *
 * Respeita LGPD: só roda se consent.analytics === true OU se LGPD não está ativo.
 *
 * API:
 *   LPBJourneyTracker.boot(currentSlug, rpc, lgpdEnabled)
 */
;(function () {
  'use strict'
  if (window.LPBJourneyTracker) return

  function _detectFromSlug() {
    var ref = document.referrer || ''
    if (!ref) return ''
    try {
      var u = new URL(ref)
      // mesma origem + lp.html?s=X
      if (u.origin !== window.location.origin) return ''
      if (u.pathname.indexOf('/lp.html') !== 0) return ''
      var p = u.searchParams.get('s')
      return p || ''
    } catch (_) { return '' }
  }

  function _isAllowed(lgpdEnabled) {
    if (!lgpdEnabled) return true
    var raw = document.documentElement.dataset.lgpdAnalytics
    return raw === '1'
  }

  function boot(currentSlug, rpc, lgpdEnabled) {
    if (!currentSlug || typeof rpc !== 'function') return
    if (!window.LPBJourneyEngine)                   return
    if (!_isAllowed(lgpdEnabled))                   return  // bloqueado por LGPD

    var visitorId = LPBJourneyEngine.getVisitorId()
    var fromSlug  = _detectFromSlug()

    // Track entrada
    rpc('lp_journey_track', {
      p_visitor_id: visitorId,
      p_from_slug:  fromSlug,
      p_to_slug:    currentSlug,
      p_meta:       { ref: (document.referrer || '').slice(0, 200) },
    }).catch(function () {})

    // Track clicks em links pra outras LPs (logo, evento delegado)
    document.body.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a[href*="/lp.html?s="]')
      if (!a) return
      try {
        var url = new URL(a.href)
        if (url.origin !== window.location.origin) return
        var nextSlug = url.searchParams.get('s')
        if (!nextSlug || nextSlug === currentSlug) return
        rpc('lp_journey_track', {
          p_visitor_id: visitorId,
          p_from_slug:  currentSlug,
          p_to_slug:    nextSlug,
          p_meta:       { type: 'link_click', anchor: (a.textContent || '').trim().slice(0, 100) },
        }).catch(function () {})
      } catch (_) {}
    }, true)
  }

  window.LPBJourneyTracker = Object.freeze({ boot: boot })
})()
