/**
 * ClinicAI — Broadcast Repository
 *
 * Acesso puro ao Supabase para o modulo de Broadcasting (disparo em massa).
 * Zero logica de negocio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   wa_broadcast_list()
 *   wa_broadcast_create(p_name, p_content, p_media_url, p_media_caption, p_target_filter, p_scheduled_at)
 *   wa_broadcast_start(p_broadcast_id)
 *   wa_broadcast_cancel(p_broadcast_id)
 *
 * Depende de:
 *   window.ClinicEnv — configuracao Supabase (SUPABASE_URL, SUPABASE_KEY)
 */

;(function () {
  'use strict'

  if (window._clinicaiBroadcastRepoLoaded) return
  window._clinicaiBroadcastRepoLoaded = true

  const _url = () => window.ClinicEnv?.SUPABASE_URL || ''
  const _key = () => window.ClinicEnv?.SUPABASE_KEY || ''

  function _headers() {
    const h = { 'apikey': _key(), 'Content-Type': 'application/json' }
    const session = JSON.parse(sessionStorage.getItem('sb-session') || '{}')
    if (session.access_token) h['Authorization'] = 'Bearer ' + session.access_token
    else h['Authorization'] = 'Bearer ' + _key()
    return h
  }

  async function _rpc(name, params = {}) {
    try {
      const r = await fetch(_url() + '/rest/v1/rpc/' + name, {
        method: 'POST', headers: _headers(), body: JSON.stringify(params)
      })
      if (!r.ok) { const e = await r.text(); return { ok: false, data: null, error: e } }
      const data = await r.json()
      return { ok: true, data, error: null }
    } catch (e) { return { ok: false, data: null, error: e.message } }
  }

  // ── Broadcast ─────────────────────────────────────────────────

  async function list() {
    return _rpc('wa_broadcast_list')
  }

  async function create(data) {
    return _rpc('wa_broadcast_create', {
      p_name: data.name,
      p_content: data.content,
      p_media_url: data.media_url || null,
      p_media_caption: data.media_caption || null,
      p_target_filter: data.target_filter || {},
      p_scheduled_at: data.scheduled_at || null,
      p_batch_size: data.batch_size || 10,
      p_batch_interval_min: data.batch_interval_min || 10,
    })
  }

  async function start(id) {
    return _rpc('wa_broadcast_start', { p_broadcast_id: id })
  }

  async function cancel(id) {
    return _rpc('wa_broadcast_cancel', { p_broadcast_id: id })
  }

  // ── Expose ────────────────────────────────────────────────────

  window.BroadcastRepository = Object.freeze({
    list,
    create,
    start,
    cancel,
  })
})()
