/**
 * LP Builder · Live Counter Runtime (Onda 29)
 *
 * Liga o fetch real de count em todos [data-lc-root] dentro de rootEl.
 *
 * Comportamento:
 *   · On mount: chama lp_recent_leads_count(p_slug, p_days) via LPBEngagement.getRpc()
 *   · Atualiza <span data-count> com count real
 *   · Animação: count incrementa de 0 ao alvo em 1.5s (ease-out)
 *   · Refresh a cada 60s (caso novo lead chegue durante a sessão)
 *   · Hide se count < min_count (não mostra "0 mulheres")
 *   · Track LPBEngagement.counter_view 1x quando entra viewport
 *
 *   LPBLiveCounterRuntime.bind(rootEl)
 */
;(function () {
  'use strict'
  if (window.LPBLiveCounterRuntime) return

  var REFRESH_MS = 60000
  var ANIM_MS = 1500

  function _track(eventType, payload) {
    try {
      if (window.LPBEngagement && typeof LPBEngagement.track === 'function') {
        LPBEngagement.track(eventType, payload || {})
      }
    } catch (_) {}
  }

  function _getRpcSlug() {
    var rpc = null, slug = null
    try {
      if (window.LPBEngagement) {
        if (typeof LPBEngagement.getRpc === 'function')  rpc  = LPBEngagement.getRpc()
        if (typeof LPBEngagement.getSlug === 'function') slug = LPBEngagement.getSlug()
      }
    } catch (_) {}
    if (!slug) {
      try {
        slug = new URLSearchParams(window.location.search).get('s')
      } catch (_) {}
    }
    return { rpc: rpc, slug: slug }
  }

  function _easeOut(t) { return 1 - Math.pow(1 - t, 3) }

  function _animateCount(el, target) {
    if (!el) return
    var start = 0
    var t0 = null
    function step(ts) {
      if (t0 == null) t0 = ts
      var p = Math.min(1, (ts - t0) / ANIM_MS)
      var v = Math.round(start + (target - start) * _easeOut(p))
      try { el.textContent = String(v) } catch (_) {}
      if (p < 1) requestAnimationFrame(step)
      else      try { el.textContent = String(target) } catch (_) {}
    }
    if (window.requestAnimationFrame) requestAnimationFrame(step)
    else el.textContent = String(target)
  }

  function _bindOne(root) {
    if (!root || root.__lcBound) return
    root.__lcBound = true

    var countEl = root.querySelector('[data-count]')
    var days    = parseInt(root.getAttribute('data-lc-days'), 10) || 7
    var minN    = parseInt(root.getAttribute('data-lc-min'),  10) || 1

    var lastCount = null
    var refreshTimer = null
    var viewTracked = false

    function applyCount(n) {
      var num = parseInt(n, 10)
      if (!isFinite(num) || num < 0) num = 0
      if (num < minN) {
        // Esconde · não mostra "0 mulheres"
        try { root.setAttribute('hidden', '') } catch (_) {}
        return
      }
      try { root.removeAttribute('hidden') } catch (_) {}
      // Anima do anterior (ou 0 inicial) ao novo
      if (lastCount == null) {
        _animateCount(countEl, num)
      } else if (num !== lastCount) {
        // Atualização suave · sem reset a 0
        if (countEl) {
          try { countEl.textContent = String(num) } catch (_) {}
        }
      }
      lastCount = num
    }

    function fetchCount() {
      var ctx = _getRpcSlug()
      if (!ctx.rpc || !ctx.slug) return
      try {
        var p = ctx.rpc('lp_recent_leads_count', { p_slug: ctx.slug, p_days: days })
        if (p && typeof p.then === 'function') {
          p.then(function (res) {
            // Suporta múltiplos formatos de retorno
            var n = 0
            if (res == null) n = 0
            else if (typeof res === 'number') n = res
            else if (res.data != null) {
              if (typeof res.data === 'number') n = res.data
              else if (res.data && typeof res.data === 'object') {
                n = parseInt(res.data.count, 10) || parseInt(res.data, 10) || 0
              }
            } else if (res.count != null) n = parseInt(res.count, 10) || 0
            applyCount(n)
          }).catch(function (e) {
            if (window.console) console.warn('[LPBLiveCounterRuntime] rpc erro:', e)
          })
        }
      } catch (e) {
        if (window.console) console.warn('[LPBLiveCounterRuntime] fetch erro:', e)
      }
    }

    // IntersectionObserver: track view 1x · primeiro fetch ao entrar
    if ('IntersectionObserver' in window) {
      try {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting && !viewTracked) {
              viewTracked = true
              _track('counter_view', {})
              fetchCount()
            }
          })
        }, { threshold: 0.25 })
        io.observe(root)
      } catch (_) {
        viewTracked = true
        _track('counter_view', {})
        fetchCount()
      }
    } else {
      viewTracked = true
      _track('counter_view', {})
      fetchCount()
    }

    // Refresh a cada 60s · só roda se a aba estiver visível
    refreshTimer = setInterval(function () {
      if (document.visibilityState === 'hidden') return
      fetchCount()
    }, REFRESH_MS)

    // Cleanup ao remover do DOM (best effort)
    if (window.MutationObserver) {
      try {
        var mo = new MutationObserver(function () {
          if (!document.body.contains(root)) {
            clearInterval(refreshTimer)
            mo.disconnect()
          }
        })
        mo.observe(document.body, { childList: true, subtree: true })
      } catch (_) {}
    }
  }

  function bind(rootEl) {
    try {
      var scope = rootEl || document
      var nodes = scope.querySelectorAll('[data-lc-root]')
      for (var i = 0; i < nodes.length; i++) {
        try { _bindOne(nodes[i]) } catch (e) {
          if (window.console) console.warn('[LPBLiveCounterRuntime] bind erro:', e)
        }
      }
    } catch (e) {
      if (window.console) console.warn('[LPBLiveCounterRuntime] scope erro:', e)
    }
  }

  window.LPBLiveCounterRuntime = Object.freeze({ bind: bind })
})()
