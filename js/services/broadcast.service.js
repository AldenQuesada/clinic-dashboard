/**
 * BroadcastService
 *
 * Orquestra operacoes de broadcasting (disparo em massa):
 * CRUD + start/cancel via BroadcastRepository.
 *
 * Dependencias:
 *   BroadcastRepository  (broadcast.repository.js)
 *
 * API publica (window.BroadcastService):
 *   loadBroadcasts()        -> {ok, data:[]}
 *   createBroadcast(data)   -> {ok, data:{id, total_targets}}
 *   startBroadcast(id)      -> {ok, data:{enqueued}}
 *   cancelBroadcast(id)     -> {ok, data:{removed_from_outbox}}
 */
;(function () {
  'use strict'

  if (window.BroadcastService) return

  // ── Helpers ─────────────────────────────────────────────────

  function _repo() { return window.BroadcastRepository }

  function _unavailable() {
    return { ok: false, error: 'BroadcastRepository nao carregado' }
  }

  // ── loadBroadcasts ──────────────────────────────────────────

  async function loadBroadcasts() {
    if (!_repo()) return _unavailable()
    return _repo().list()
  }

  // ── createBroadcast ─────────────────────────────────────────

  async function createBroadcast(data) {
    if (!_repo()) return _unavailable()
    if (!data || !data.name || !data.content) {
      return { ok: false, error: 'name e content sao obrigatorios' }
    }
    return _repo().create(data)
  }

  // ── startBroadcast ──────────────────────────────────────────

  async function startBroadcast(id) {
    if (!_repo()) return _unavailable()
    if (!id) return { ok: false, error: 'broadcast id obrigatorio' }
    return _repo().start(id)
  }

  // ── cancelBroadcast ─────────────────────────────────────────

  async function cancelBroadcast(id) {
    if (!_repo()) return _unavailable()
    if (!id) return { ok: false, error: 'broadcast id obrigatorio' }
    return _repo().cancel(id)
  }

  // ── Expose ──────────────────────────────────────────────────

  window.BroadcastService = Object.freeze({
    loadBroadcasts,
    createBroadcast,
    startBroadcast,
    cancelBroadcast,
  })
})()
