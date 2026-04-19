/**
 * LP Builder · Smart CTA Runtime (Onda 29)
 *
 * Decide qual variant do CTA exibir baseado no comportamento do visitor:
 *   · Visitor novo (<1h)             → 'default'
 *   · Já voltou (1+ visit anterior)  → 'returning'
 *   · Viu testimonials               → 'after_social_proof'
 *
 * Sinais lidos do localStorage / DOM:
 *   · lpb_visitor_id               · created_at proxy via lpb_visitor_first_seen
 *   · lpb_eng_cd::popup-{slug}     · viu popup (assume engajado)
 *   · lpb_quiz_areas::{slug}       · marcou áreas no quiz
 *   · IntersectionObserver em [data-block-type="testimonials" / "ba-carousel" / "before-after"]
 *
 * Track:
 *   · smart_cta_render { variant_chosen, reason }
 *   · smart_cta_click  { variant }
 *
 *   LPBSmartCTARuntime.bind(rootEl)
 */
;(function () {
  'use strict'
  if (window.LPBSmartCTARuntime) return

  var BOUND_ATTR = 'data-scta-bound'
  var FIRST_SEEN_KEY = 'lpb_visitor_first_seen'  // ts ms
  var SOCIAL_PROOF_SELECTOR = [
    '[data-block-type="testimonials"]',
    '[data-block-type="ba-carousel"]',
    '[data-block-type="before-after"]',
    '[data-block-type="before-after-carousel"]',
    '.blk-ba',  // antes/depois fallback
  ].join(', ')

  function _track(event, meta) {
    if (window.LPBEngagement && LPBEngagement.track) {
      try { LPBEngagement.track(event, meta || {}) } catch (_) {}
    }
  }

  // First-seen helper · grava 1ª visita pra calcular se é "retorno"
  function _ensureFirstSeen() {
    try {
      var v = localStorage.getItem(FIRST_SEEN_KEY)
      if (v) return parseInt(v, 10)
      var now = Date.now()
      localStorage.setItem(FIRST_SEEN_KEY, String(now))
      return now
    } catch (_) { return Date.now() }
  }

  function _isReturning(firstSeenTs) {
    if (!firstSeenTs) return false
    var ageMs = Date.now() - firstSeenTs
    return ageMs > 60 * 60 * 1000  // > 1h = retorno
  }

  function _slug() {
    if (window.LPBEngagement && LPBEngagement.getSlug) {
      try { return LPBEngagement.getSlug() || '' } catch (_) {}
    }
    try {
      return new URLSearchParams(window.location.search).get('s') || ''
    } catch (_) { return '' }
  }

  function _hasQuizAreas(slug) {
    try {
      // chave sugerida: lpb_quiz_areas::{slug}
      var raw = localStorage.getItem('lpb_quiz_areas::' + slug)
      if (raw && raw !== '[]' && raw !== '{}') return true
    } catch (_) {}
    return false
  }

  function _hasSeenPopup(slug) {
    try {
      // engagement engine usa prefixo lpb_eng_cd::popup-{slug}
      // basta varrer keys com prefixo "lpb_eng_cd::popup-"
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i)
        if (k && k.indexOf('lpb_eng_cd::popup-') === 0) return true
      }
    } catch (_) {}
    return false
  }

  function _decideVariant(ctx) {
    // Prioridade: pós-prova-social > retorno > default
    if (ctx.sawSocialProof) {
      return { variant: 'after_social_proof', reason: 'social_proof_viewed' }
    }
    if (ctx.returning || ctx.hasQuizAreas || ctx.sawPopup) {
      return { variant: 'returning', reason:
        ctx.returning      ? 'visit_age>1h'
      : ctx.hasQuizAreas   ? 'quiz_areas'
      : 'popup_seen' }
    }
    return { variant: 'default', reason: 'new_visitor' }
  }

  function _applyVariant(rootEl, variantKey, label, reason) {
    var btnWrap = rootEl.querySelector('[data-smart-cta-btn]')
    if (!btnWrap) return
    var anchor = btnWrap.querySelector('a')
    if (anchor) {
      var spanLabel = anchor.querySelector('span')
      if (spanLabel) spanLabel.textContent = label
      else            anchor.textContent = label
    }
    rootEl.setAttribute('data-variant-applied', variantKey)
    _track('smart_cta_render', { variant_chosen: variantKey, reason: reason })
  }

  function _bindOne(rootEl) {
    if (!rootEl || rootEl.getAttribute(BOUND_ATTR) === '1') return
    rootEl.setAttribute(BOUND_ATTR, '1')

    var variants = {}
    try {
      var raw = rootEl.getAttribute('data-variants') || '{}'
      variants = JSON.parse(raw) || {}
    } catch (_) { variants = {} }

    var slug = _slug()
    var firstSeen = _ensureFirstSeen()

    var ctx = {
      returning:      _isReturning(firstSeen),
      hasQuizAreas:   _hasQuizAreas(slug),
      sawPopup:       _hasSeenPopup(slug),
      sawSocialProof: false,
    }

    function _commit() {
      var dec = _decideVariant(ctx)
      var label = variants[dec.variant] || variants['default'] || ''
      if (label) _applyVariant(rootEl, dec.variant, label, dec.reason)
    }

    // Bind click track no botão
    var btnWrap = rootEl.querySelector('[data-smart-cta-btn]')
    if (btnWrap) {
      btnWrap.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest && ev.target.closest('a')
        if (!a) return
        var v = rootEl.getAttribute('data-variant-applied') || 'default'
        _track('smart_cta_click', { variant: v, href: a.getAttribute('href') || '' })
      })
    }

    // Aplica decisão inicial (sem aguardar social proof)
    _commit()

    // IntersectionObserver pra detectar prova social vista (eleva variant em runtime)
    if ('IntersectionObserver' in window) {
      try {
        var nodes = document.querySelectorAll(SOCIAL_PROOF_SELECTOR)
        if (nodes.length > 0) {
          var io = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
              if (entries[i].isIntersecting) {
                if (!ctx.sawSocialProof) {
                  ctx.sawSocialProof = true
                  _commit()
                }
                io.disconnect()
                break
              }
            }
          }, { threshold: 0.35 })
          nodes.forEach(function (n) { io.observe(n) })
        }
      } catch (_) {}
    }
  }

  function bind(rootEl) {
    if (!rootEl) rootEl = document
    try {
      var nodes = rootEl.querySelectorAll('[data-smart-cta-root]')
      for (var i = 0; i < nodes.length; i++) {
        _bindOne(nodes[i])
      }
    } catch (e) {
      try { console.warn('[smart-cta] bind erro:', e) } catch (_) {}
    }
  }

  window.LPBSmartCTARuntime = Object.freeze({ bind: bind })
})()
