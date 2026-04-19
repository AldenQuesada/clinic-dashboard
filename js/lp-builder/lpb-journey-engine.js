/**
 * LP Builder · Journey Engine (Onda 24)
 *
 * Núcleo PURO. Lida com:
 *   · visitor_id estável (localStorage com fallback cookie)
 *   · agregação de paths (transforma lista em árvore)
 *   · cálculo de funis (% que prossegue)
 *
 * Sem fetch, sem render. Reusável fora do builder.
 */
;(function () {
  'use strict'
  if (window.LPBJourneyEngine) return

  var KEY = 'lpb_visitor_id'

  // visitor_id estável de 30 dias
  function getVisitorId() {
    try {
      var v = localStorage.getItem(KEY)
      if (v) return v
      v = 'v_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36)
      localStorage.setItem(KEY, v)
      return v
    } catch (_) {
      // fallback cookie
      var m = document.cookie.match(/(?:^|;\s*)lpb_vid=([^;]+)/)
      if (m) return m[1]
      var nv = 'v_' + Math.random().toString(36).slice(2)
      document.cookie = 'lpb_vid=' + nv + ';max-age=2592000;path=/'
      return nv
    }
  }

  function resetVisitorId() {
    try { localStorage.removeItem(KEY) } catch (_) {}
  }

  // Agrega paths em árvore: { slug: { count, next: { slug: {...} } } }
  function buildPathTree(events) {
    var byVisitor = {}
    ;(events || []).forEach(function (e) {
      var v = e.visitor_id || e.from_slug + '::' + e.to_slug  // fallback
      if (!byVisitor[v]) byVisitor[v] = []
      byVisitor[v].push(e)
    })
    var tree = {}
    Object.keys(byVisitor).forEach(function (v) {
      var seq = byVisitor[v].sort(function (a, b) {
        return new Date(a.created_at) - new Date(b.created_at)
      })
      var cursor = tree
      seq.forEach(function (ev) {
        var slug = ev.to_slug
        if (!cursor[slug]) cursor[slug] = { count: 0, next: {} }
        cursor[slug].count++
        cursor = cursor[slug].next
      })
    })
    return tree
  }

  // Funil: dado A → B, % de pessoas que vieram de A e chegaram em B
  function computeFunnelRate(paths, fromSlug, toSlug) {
    var total = 0, completed = 0
    ;(paths || []).forEach(function (p) {
      if (p.from_slug === fromSlug) {
        total += p.count
        if (p.to_slug === toSlug) completed += p.count
      }
    })
    return {
      total:     total,
      completed: completed,
      rate:      total > 0 ? completed / total : 0,
      ratePct:   total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
    }
  }

  window.LPBJourneyEngine = Object.freeze({
    getVisitorId:    getVisitorId,
    resetVisitorId:  resetVisitorId,
    buildPathTree:   buildPathTree,
    computeFunnelRate: computeFunnelRate,
  })
})()
