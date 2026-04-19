/**
 * LP Builder · LGPD Banner runtime (Onda 21)
 *
 * Usado APENAS em lp.html (LP pública). Lê config.lgpd_config da página
 * resolvida e mostra banner se enabled. Persiste decisão em localStorage
 * (chave por slug) e envia ao banco via RPC lp_consent_log.
 *
 * Hook de re-consent: se versão da config mudou, mostra banner de novo.
 *
 * API:
 *   LPBLgpdBanner.maybeShow(pageData, supabaseRpc)
 *   LPBLgpdBanner.getStoredConsent(slug) → { necessary, analytics, marketing, version, timestamp } | null
 *   LPBLgpdBanner.reset(slug)  // pra debug — limpa localStorage e reabre
 */
;(function () {
  'use strict'
  if (window.LPBLgpdBanner) return

  function _key(slug) { return 'lpb_lgpd_consent::' + slug }

  function getStoredConsent(slug) {
    try {
      var raw = localStorage.getItem(_key(slug))
      return raw ? JSON.parse(raw) : null
    } catch (_) { return null }
  }

  function _store(slug, record) {
    try { localStorage.setItem(_key(slug), JSON.stringify(record)) } catch (_) {}
  }

  function reset(slug) {
    try { localStorage.removeItem(_key(slug)) } catch (_) {}
  }

  function _hashIp() {
    // Sem coletar IP real (privacy-first). Hash da UA + screen como pseudo-id.
    var s = (navigator.userAgent || '') + '::' + (screen.width || 0) + 'x' + (screen.height || 0)
    var h = 0
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0 }
    return 'p_' + (h >>> 0).toString(36)
  }

  function maybeShow(pageData, rpc) {
    if (!pageData || !pageData.slug) return
    var raw = pageData.lgpd_config || {}
    if (!raw.enabled) return
    if (!window.LPBLgpdEngine) { console.warn('[lgpd] engine not loaded'); return }

    var config = LPBLgpdEngine.resolveConfig(raw)
    var stored = getStoredConsent(pageData.slug)

    // Se já consentiu nesta versão, aplica e sai
    if (stored && stored.version === config.version) {
      _applyConsents(stored, pageData.tracking || {})
      return
    }

    // Mostra banner
    var wrap = document.createElement('div')
    wrap.id = 'lpbLgpdRoot'
    wrap.innerHTML = LPBLgpdEngine.buildBannerHTML(config)
    document.body.appendChild(wrap)

    var pane = wrap.querySelector('.lpb-lgpd-banner')
    if (!pane) return

    var btnAccept    = pane.querySelector('.lpb-lgpd-accept')
    var btnReject    = pane.querySelector('.lpb-lgpd-reject')
    var btnCustomize = pane.querySelector('.lpb-lgpd-customize')
    var btnSave      = pane.querySelector('.lpb-lgpd-save')
    var details      = pane.querySelector('.lpb-lgpd-details')

    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap) }

    function commit(choices) {
      var rec = LPBLgpdEngine.buildConsentRecord(choices, config.version)
      _store(pageData.slug, rec)
      _applyConsents(rec, pageData.tracking || {})
      _logRemote(rpc, pageData.slug, rec)
      close()
    }

    btnAccept.addEventListener('click', function () { commit({ analytics: true,  marketing: true  }) })
    btnReject.addEventListener('click', function () { commit({ analytics: false, marketing: false }) })

    btnCustomize.addEventListener('click', function () {
      details.style.display = 'block'
      btnCustomize.style.display = 'none'
      btnAccept.style.display = 'none'
      btnReject.style.display = 'none'
      btnSave.style.display = 'inline-block'
    })

    btnSave.addEventListener('click', function () {
      var choices = {}
      details.querySelectorAll('input[type="checkbox"][data-cat]').forEach(function (cb) {
        choices[cb.dataset.cat] = !!cb.checked
      })
      commit(choices)
    })
  }

  // Aplica consentimentos nos trackers (bloqueia GA4/FB se rejeitou)
  function _applyConsents(rec, tracking) {
    if (!rec) return
    document.documentElement.dataset.lgpdAnalytics = rec.analytics ? '1' : '0'
    document.documentElement.dataset.lgpdMarketing = rec.marketing ? '1' : '0'

    // GA4 consent mode v2
    if (window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage:  rec.analytics ? 'granted' : 'denied',
        ad_storage:         rec.marketing ? 'granted' : 'denied',
        ad_user_data:       rec.marketing ? 'granted' : 'denied',
        ad_personalization: rec.marketing ? 'granted' : 'denied',
      })
    }
    // FB Pixel
    if (window.fbq) {
      try { window.fbq('consent', rec.marketing ? 'grant' : 'revoke') } catch (_) {}
    }
  }

  function _logRemote(rpc, slug, rec) {
    if (typeof rpc !== 'function') return
    var meta = {
      ip_hash:  _hashIp(),
      ua:       (navigator.userAgent || '').slice(0, 500),
      referrer: (document.referrer || '').slice(0, 500),
    }
    rpc('lp_consent_log', { p_slug: slug, p_consents: rec, p_meta: meta }).catch(function () {})
  }

  window.LPBLgpdBanner = Object.freeze({
    maybeShow:         maybeShow,
    getStoredConsent:  getStoredConsent,
    reset:             reset,
  })
})()
