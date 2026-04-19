/**
 * LP Builder · Schedule Engine (Onda 23)
 *
 * Núcleo PURO. Calcula status efetivo da página com base em
 * status atual + publish_at + unpublish_at + agora.
 *
 * Sem DOM, sem fetch.
 *
 * Estados retornados:
 *   · 'live'              — published, sem schedule
 *   · 'draft'             — draft, sem schedule
 *   · 'scheduled'         — vai publicar em publish_at futuro
 *   · 'live-temp'         — published até unpublish_at (campanha)
 *   · 'expired'           — passou de unpublish_at mas ainda flagged
 *   · 'archived'          — status archived
 *
 * API:
 *   LPBScheduleEngine.computeState(page, now?) → { state, message, until, since }
 *   LPBScheduleEngine.validateRange(publishAt, unpublishAt, now?) → { ok, reason }
 *   LPBScheduleEngine.formatRelative(date, now?) → 'em 2 horas' | 'há 3 dias'
 */
;(function () {
  'use strict'
  if (window.LPBScheduleEngine) return

  // ──────────────────────────────────────────────────────────
  // Compute state
  // ──────────────────────────────────────────────────────────
  function computeState(page, nowOverride) {
    var now = nowOverride ? new Date(nowOverride) : new Date()
    if (!page) return { state: 'unknown', message: '—', until: null, since: null }

    var status = page.status || 'draft'
    var publishAt   = page.publish_at   ? new Date(page.publish_at)   : null
    var unpublishAt = page.unpublish_at ? new Date(page.unpublish_at) : null

    if (status === 'archived') {
      return { state: 'archived', message: 'Arquivada', until: null, since: null }
    }

    // Caso: scheduled para publicar
    if (publishAt && publishAt > now) {
      return {
        state:   'scheduled',
        message: 'Publica ' + formatRelative(publishAt, now),
        until:   null,
        since:   publishAt.toISOString(),
      }
    }

    // Caso: agendado pra arquivar (campanha)
    if (unpublishAt) {
      if (unpublishAt > now) {
        return {
          state:   'live-temp',
          message: 'Expira ' + formatRelative(unpublishAt, now),
          until:   unpublishAt.toISOString(),
          since:   null,
        }
      }
      // unpublish já passou — deveria estar archived (cron pega)
      return {
        state:   'expired',
        message: 'Expirada ' + formatRelative(unpublishAt, now),
        until:   unpublishAt.toISOString(),
        since:   null,
      }
    }

    if (status === 'published') {
      return { state: 'live',  message: 'Publicada', until: null, since: page.published_at || null }
    }
    return { state: 'draft', message: 'Rascunho', until: null, since: null }
  }

  // ──────────────────────────────────────────────────────────
  // Validação: unpublish > publish, ambos futuro
  // ──────────────────────────────────────────────────────────
  function validateRange(publishAt, unpublishAt, nowOverride) {
    var now = nowOverride ? new Date(nowOverride) : new Date()
    var p = publishAt   ? new Date(publishAt)   : null
    var u = unpublishAt ? new Date(unpublishAt) : null

    if (p && isNaN(p.getTime())) return { ok: false, reason: 'publish_at_invalid' }
    if (u && isNaN(u.getTime())) return { ok: false, reason: 'unpublish_at_invalid' }
    if (p && u && u <= p)        return { ok: false, reason: 'unpublish_before_publish' }
    if (p && p <= now)           return { ok: false, reason: 'publish_at_past' }
    if (u && u <= now)           return { ok: false, reason: 'unpublish_at_past' }
    return { ok: true }
  }

  // ──────────────────────────────────────────────────────────
  // Format relativo
  // ──────────────────────────────────────────────────────────
  function formatRelative(date, nowOverride) {
    var now = nowOverride ? new Date(nowOverride) : new Date()
    var d   = (date instanceof Date) ? date : new Date(date)
    if (isNaN(d.getTime())) return '—'
    var deltaMs = d - now
    var future = deltaMs > 0
    var abs = Math.abs(deltaMs)
    var mins = Math.floor(abs / 60000)
    var hrs  = Math.floor(mins / 60)
    var days = Math.floor(hrs / 24)

    var rel
    if (mins < 1)        rel = 'agora'
    else if (mins < 60)  rel = 'em ' + mins + ' min'
    else if (hrs < 24)   rel = 'em ' + hrs + 'h'
    else if (days < 30)  rel = 'em ' + days + ' dia' + (days === 1 ? '' : 's')
    else {
      try {
        rel = 'em ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
      } catch (_) { rel = 'em ' + Math.floor(days / 30) + ' mês(es)' }
    }
    if (!future) {
      rel = rel.replace(/^em /, 'há ')
    }
    return rel
  }

  // ──────────────────────────────────────────────────────────
  // Helper: ISO string pra <input type="datetime-local">
  // ──────────────────────────────────────────────────────────
  function toLocalInput(date) {
    if (!date) return ''
    var d = (date instanceof Date) ? date : new Date(date)
    if (isNaN(d.getTime())) return ''
    var pad = function (n) { return n < 10 ? '0' + n : '' + n }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  }

  function fromLocalInput(str) {
    if (!str) return null
    var d = new Date(str)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  window.LPBScheduleEngine = Object.freeze({
    computeState:    computeState,
    validateRange:   validateRange,
    formatRelative:  formatRelative,
    toLocalInput:    toLocalInput,
    fromLocalInput:  fromLocalInput,
  })
})()
