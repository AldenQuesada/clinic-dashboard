/**
 * LP Builder · Webhook Engine (Onda 27)
 *
 * Núcleo PURO. Sem fetch, sem DOM (apenas usa Web Crypto API se presente).
 *
 *   · validateUrl(url) → bool (exige https em produção)
 *   · buildPayload(event, data, meta) → objeto canônico (X-LP-Event header)
 *   · signPayload(secret, payloadString) → Promise<string> (HMAC-SHA256 hex)
 *   · validateConfig(cfg) → { ok, reason }
 *   · KNOWN_EVENTS — lista de eventos disponíveis
 */
;(function () {
  'use strict'
  if (window.LPBWebhookEngine) return

  var KNOWN_EVENTS = [
    { id: 'lead.created',        label: 'Lead capturado',           desc: 'Form submission em LP' },
    { id: 'page.published',      label: 'LP publicada',             desc: 'Quando publish acontece' },
    { id: 'page.expired',        label: 'LP expirou',               desc: 'unpublish_at atingido' },
    { id: 'consent.recorded',    label: 'Consentimento LGPD',       desc: 'Visitante decidiu cookies' },
  ]

  function validateUrl(url) {
    if (!url || typeof url !== 'string') return false
    try {
      var u = new URL(url)
      return u.protocol === 'https:' || u.protocol === 'http:'
    } catch (_) { return false }
  }

  function validateConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return { ok: false, reason: 'config_invalid' }
    if (!validateUrl(cfg.url))           return { ok: false, reason: 'url_invalid' }
    if (!Array.isArray(cfg.events) || !cfg.events.length) return { ok: false, reason: 'events_required' }
    var unknown = cfg.events.filter(function (e) {
      return !KNOWN_EVENTS.some(function (k) { return k.id === e })
    })
    if (unknown.length) return { ok: false, reason: 'unknown_events:' + unknown.join(',') }
    if (cfg.headers && typeof cfg.headers !== 'object') return { ok: false, reason: 'headers_invalid' }
    return { ok: true }
  }

  function buildPayload(event, data, meta) {
    return {
      event:     event,
      timestamp: new Date().toISOString(),
      data:      data || {},
      meta:      meta || {},
    }
  }

  // HMAC-SHA256 via Web Crypto (browser); retorna hex
  async function signPayload(secret, payloadString) {
    if (!secret || !payloadString) return ''
    if (!window.crypto || !window.crypto.subtle) return ''
    try {
      var enc = new TextEncoder()
      var key = await window.crypto.subtle.importKey(
        'raw', enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
      )
      var sig = await window.crypto.subtle.sign('HMAC', key, enc.encode(payloadString))
      var arr = Array.from(new Uint8Array(sig))
      return arr.map(function (b) { return b.toString(16).padStart(2, '0') }).join('')
    } catch (_) { return '' }
  }

  // Constrói headers HTTP finais (mistura headers do user com sistema)
  async function buildHeaders(cfg, payloadString) {
    var h = Object.assign({
      'Content-Type':   'application/json',
      'User-Agent':     'ClinicAI-LP-Builder/1.0',
      'X-LP-Webhook-Id': cfg.id || '',
    }, cfg.headers || {})
    if (cfg.secret) {
      var sig = await signPayload(cfg.secret, payloadString)
      if (sig) h['X-LP-Signature'] = 'sha256=' + sig
    }
    return h
  }

  window.LPBWebhookEngine = Object.freeze({
    KNOWN_EVENTS: KNOWN_EVENTS,
    validateUrl:    validateUrl,
    validateConfig: validateConfig,
    buildPayload:   buildPayload,
    signPayload:    signPayload,
    buildHeaders:   buildHeaders,
  })
})()
