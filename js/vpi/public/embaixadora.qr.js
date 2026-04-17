/**
 * VPI Embaixadora - QR Code
 *
 * Renderiza QR code apontando pro short-link pessoal no verso
 * do cartao (div#vpi-qr-slot). Tambem expoe API para gerar
 * canvas QR para o Story IG e share modal.
 *
 * Implementacao minima: tenta usar biblioteca qrcode do CDN
 * (carrega lazy). Fallback: exibe link em texto se o CDN falhar.
 *
 * Expoe window.VPIEmbQR.
 */
;(function () {
  'use strict'
  if (window._vpiEmbQRLoaded) return
  window._vpiEmbQRLoaded = true

  function _app() { return window.VPIEmbApp }
  function _esc(s){ return _app() ? _app().esc(s) : (s == null ? '' : String(s)) }

  var _libLoading = null

  function _loadLib() {
    if (window.QRCode) return Promise.resolve(window.QRCode)
    if (_libLoading) return _libLoading
    _libLoading = new Promise(function (resolve) {
      var s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'
      s.async = true
      s.onload  = function () { resolve(window.QRCode || null) }
      s.onerror = function () { resolve(null) }
      document.head.appendChild(s)
    })
    return _libLoading
  }

  function _shareUrl() {
    try {
      var d = _app() && _app().getData()
      if (!d || !d.partner) return window.location.href
      var slug = d.partner.short_link_slug
      if (slug) {
        // Sistema short_links padrao da clinica: redireciona via
        // /r.html?c=<slug>, que incrementa clicks + dispara pixels
        // antes do redirect 302. ENV override permite trocar o host
        // em deploys alternativos sem recompilar.
        var origin = (window.ClinicEnv && window.ClinicEnv.SHORT_LINK_HOST)
                      ? window.ClinicEnv.SHORT_LINK_HOST
                      : window.location.origin
        // Fase 9 Entrega 1: UTMs anexas pro attribution ROI
        // r.html passa tudo no redirect 302; a landing captura utm_*
        // e chama vpi_pub_track_attribution.
        var utm = '&utm_source=vpi' +
                  '&utm_medium=partner_card' +
                  '&utm_campaign=referral' +
                  '&utm_content=' + encodeURIComponent(slug)
        return String(origin).replace(/\/+$/, '') + '/r.html?c=' + encodeURIComponent(slug) + utm
      }
      // Fallback: URL atual com token (ainda funciona, so nao tem tracking)
      return window.location.href
    } catch (_) { return window.location.href }
  }

  /**
   * Renderiza QR num container. Resolve com o elemento criado.
   */
  async function renderInto(el, url, size) {
    if (!el) return null
    url = url || _shareUrl()
    size = size || 140
    var lib = await _loadLib()

    if (!lib) {
      // Fallback: mostra link textual
      el.innerHTML =
        '<div class="vpi-qr-label" style="padding:12px;background:var(--vpi-glass);border-radius:10px;border:1px solid var(--vpi-border);max-width:260px;word-break:break-all;font-size:10px">' +
          _esc(url) +
        '</div>'
      return null
    }

    el.innerHTML = ''
    var wrap = document.createElement('div')
    wrap.className = 'vpi-qr'
    var canvas = document.createElement('canvas')
    wrap.appendChild(canvas)
    var lbl = document.createElement('div')
    lbl.className = 'vpi-qr-label'
    lbl.textContent = 'Escaneie para acessar meu cartão'
    wrap.appendChild(lbl)
    el.appendChild(wrap)

    try {
      await lib.toCanvas(canvas, url, {
        width: size, margin: 1,
        color: { dark: '#0B0813', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      })
    } catch (e) {
      console.warn('[VPIEmbQR] render fail:', e && e.message)
    }
    return canvas
  }

  /**
   * Gera um QR em canvas 1:1 para uso no Story IG (ou similar).
   * Resolve com o canvas.
   */
  async function generateCanvas(url, size) {
    url = url || _shareUrl()
    size = size || 320
    var lib = await _loadLib()
    if (!lib) return null
    var canvas = document.createElement('canvas')
    try {
      await lib.toCanvas(canvas, url, {
        width: size, margin: 1,
        color: { dark: '#0B0813', light: '#FFFFFF' },
        errorCorrectionLevel: 'H',
      })
      return canvas
    } catch (e) {
      console.warn('[VPIEmbQR] generate fail:', e && e.message)
      return null
    }
  }

  async function init() {
    // Renderiza QR no verso do cartao
    var tries = 0
    var wait = setInterval(async function () {
      tries++
      var slot = document.getElementById('vpi-qr-slot')
      if (slot) {
        clearInterval(wait)
        var wrap = document.createElement('div')
        wrap.className = 'vpi-qr-back'
        slot.appendChild(wrap)
        await renderInto(wrap, _shareUrl(), 120)
      } else if (tries > 30) {
        clearInterval(wait)
      }
    }, 150)
  }

  window.addEventListener('vpi-emb-rendered', function () {
    init()
  })

  window.VPIEmbQR = {
    init:          init,
    renderInto:    renderInto,
    generateCanvas: generateCanvas,
    shareUrl:      _shareUrl,
  }
})()
