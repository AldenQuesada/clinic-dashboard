/**
 * ClinicAI — B2B Repository
 *
 * I/O puro do Supabase pra tabelas b2b_*. Zero DOM, zero lógica de negócio.
 * Expõe window.B2BRepository.
 *
 * Todas as funções retornam Promises. Erros da RPC são propagados (throw).
 * Nunca chama outros módulos. Testável isolado (mock de _sbShared).
 */
;(function () {
  'use strict'
  if (window.B2BRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }

  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  // ─── Parcerias ──────────────────────────────────────────────
  function list(filters) {
    filters = filters || {}
    return _rpc('b2b_partnership_list', {
      p_status: filters.status || null,
      p_tier:   filters.tier   || null,
      p_pillar: filters.pillar || null,
    })
  }

  function get(id) {
    return _rpc('b2b_partnership_get', { p_id: id })
  }

  function upsert(slug, payload) {
    return _rpc('b2b_partnership_upsert', { p_slug: slug, p_payload: payload })
  }

  function setStatus(id, status, reason) {
    return _rpc('b2b_partnership_set_status', {
      p_id: id, p_status: status, p_reason: reason || null,
    })
  }

  // ─── Scout config (toggle master + budget) ──────────────────
  function scoutConfigGet() {
    return _rpc('b2b_scout_config_get')
  }

  function scoutConfigUpdate(payload, user) {
    return _rpc('b2b_scout_config_update', { p_payload: payload, p_user: user || null })
  }

  // ─── Export (Fraqueza #10) ──────────────────────────────────
  function exportAll(status) {
    return _rpc('b2b_partnership_export', { p_status: status || null })
  }

  // ─── Meta mensal da clínica ─────────────────────────────────
  function monthlyTargetGet(monthISO) {
    return _rpc('b2b_monthly_target_get', { p_month: monthISO || null })
  }

  function monthlyTargetSet(monthISO, count, tierFocus) {
    return _rpc('b2b_monthly_target_set', {
      p_month: monthISO,
      p_target_count: count,
      p_tier_focus: tierFocus || [1],
    })
  }

  // ─── API pública ────────────────────────────────────────────
  window.B2BRepository = Object.freeze({
    list: list,
    get: get,
    upsert: upsert,
    setStatus: setStatus,
    exportAll: exportAll,
    scoutConfigGet: scoutConfigGet,
    scoutConfigUpdate: scoutConfigUpdate,
    monthlyTargetGet: monthlyTargetGet,
    monthlyTargetSet: monthlyTargetSet,
  })
})()
