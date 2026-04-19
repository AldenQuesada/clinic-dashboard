/**
 * ClinicAI — B2B Partnership Applications Repository
 *
 * I/O puro das candidaturas de parceria (Fluxo A da Mira).
 * Zero DOM.
 * Expõe window.B2BApplicationRepository.
 */
;(function () {
  'use strict'
  if (window.B2BApplicationRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }

  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function list(status, limit) {
    return _rpc('b2b_applications_list', {
      p_status: status == null ? 'pending' : status,
      p_limit:  limit  || 50,
    })
  }

  function create(payload) {
    return _rpc('b2b_application_create', { p_payload: payload || {} })
  }

  function approve(id, note) {
    return _rpc('b2b_application_approve', {
      p_application_id: id,
      p_note:           note || null,
    })
  }

  function reject(id, reason) {
    return _rpc('b2b_application_reject', {
      p_application_id: id,
      p_reason:         reason || null,
    })
  }

  window.B2BApplicationRepository = Object.freeze({
    list:    list,
    create:  create,
    approve: approve,
    reject:  reject,
  })
})()
