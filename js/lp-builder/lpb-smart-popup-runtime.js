/**
 * LP Builder · Smart Popup Runtime (Onda 29)
 *
 * Ativa todos popups [data-smart-popup] em rootEl.
 * Lê configuração de data-attributes (trigger / after / percent / cooldown / variant).
 * Usa LPBEngagement.onTrigger pra disparo + cooldown.
 * Track: popup_shown, popup_dismissed, popup_cta_click.
 *
 * A prova de bugs:
 *   · LPBEngagement ausente → popup nunca dispara (fail silent)
 *   · Esc fecha · click overlay (variant=center) fecha
 *   · Cleanup automático se rootEl for desmontado
 *
 *   LPBSmartPopupRuntime.bind(rootEl)
 */
;(function () {
  'use strict'
  if (window.LPBSmartPopupRuntime) return

  var BOUND_ATTR = 'data-spop-bound'

  function _track(event, meta) {
    if (window.LPBEngagement && LPBEngagement.track) {
      try { LPBEngagement.track(event, meta || {}) } catch (_) {}
    }
  }

  function _show(popupEl, variant) {
    try {
      popupEl.style.display = ''
      // força reflow pra animação CSS engatar
      // eslint-disable-next-line no-unused-expressions
      popupEl.offsetHeight
      popupEl.classList.add('is-open')
      if (variant === 'center') {
        try { document.documentElement.classList.add('blk-spop-lock') } catch (_) {}
      }
    } catch (_) {}
  }

  function _hide(popupEl, reason) {
    try {
      popupEl.classList.remove('is-open')
      var variant = popupEl.getAttribute('data-variant') || 'side'
      if (variant === 'center') {
        try { document.documentElement.classList.remove('blk-spop-lock') } catch (_) {}
      }
      // espera animação terminar antes de display:none
      setTimeout(function () {
        if (!popupEl.classList.contains('is-open')) {
          popupEl.style.display = 'none'
        }
      }, 420)
      _track('popup_dismissed', {
        slug: popupEl.getAttribute('data-slug') || '',
        reason: reason || 'manual',
      })
    } catch (_) {}
  }

  function _bindOne(popupEl) {
    if (!popupEl || popupEl.getAttribute(BOUND_ATTR) === '1') return
    popupEl.setAttribute(BOUND_ATTR, '1')

    var slug      = popupEl.getAttribute('data-slug') || 'popup'
    var trigger   = popupEl.getAttribute('data-trigger') || 'time'
    var afterMs   = parseInt(popupEl.getAttribute('data-after'), 10) || 30000
    var percent   = parseFloat(popupEl.getAttribute('data-percent')) || 50
    var cooldownH = parseInt(popupEl.getAttribute('data-cooldown'), 10) || 24
    var variant   = popupEl.getAttribute('data-variant') || 'side'
    var cooldownKey = 'popup-' + slug

    // Bind handlers de fechar
    var closeBtn = popupEl.querySelector('[data-spop-close]')
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        _hide(popupEl, 'close-button')
      })
    }
    var overlay = popupEl.querySelector('[data-spop-overlay]')
    if (overlay) {
      overlay.addEventListener('click', function () {
        _hide(popupEl, 'overlay-click')
      })
    }

    // Esc fecha (apenas quando aberto)
    var escHandler = function (e) {
      if (e.key === 'Escape' && popupEl.classList.contains('is-open')) {
        _hide(popupEl, 'escape-key')
      }
    }
    document.addEventListener('keydown', escHandler)

    // CTA click track
    var ctaWrap = popupEl.querySelector('[data-spop-cta]')
    if (ctaWrap) {
      ctaWrap.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest && ev.target.closest('a')
        if (!a) return
        _track('popup_cta_click', { slug: slug, href: a.getAttribute('href') || '' })
        // não fecha automaticamente — link target=_blank ou navega
      })
    }

    // Engine ausente → fail silent
    if (!window.LPBEngagement || !LPBEngagement.onTrigger) {
      return
    }

    // Cooldown já ativo? não registra trigger
    try {
      if (LPBEngagement.cooldownActive && LPBEngagement.cooldownActive(cooldownKey, cooldownH)) {
        return
      }
    } catch (_) {}

    var opts = {
      type:        trigger,
      cooldownKey: cooldownKey,
      cooldownH:   cooldownH,
      once:        true,
    }
    if (trigger === 'time')   opts.after   = afterMs
    if (trigger === 'scroll') opts.percent = percent

    try {
      LPBEngagement.onTrigger(opts, function (meta) {
        _show(popupEl, variant)
        _track('popup_shown', { slug: slug, trigger: trigger, meta: meta || {} })
      })
    } catch (e) {
      try { console.warn('[smart-popup] onTrigger erro:', e) } catch (_) {}
    }
  }

  function bind(rootEl) {
    if (!rootEl) rootEl = document
    try {
      var nodes = rootEl.querySelectorAll('[data-smart-popup]')
      for (var i = 0; i < nodes.length; i++) {
        _bindOne(nodes[i])
      }
    } catch (e) {
      try { console.warn('[smart-popup] bind erro:', e) } catch (_) {}
    }
  }

  window.LPBSmartPopupRuntime = Object.freeze({ bind: bind })
})()
