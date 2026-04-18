/**
 * ClinicAI — B2B Audit Repository (timeline de eventos)
 * I/O puro. Expõe window.B2BAuditRepository.
 */
;(function () {
  'use strict'
  if (window.B2BAuditRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function timeline(partnershipId, limit) {
    return _rpc('b2b_audit_timeline', { p_partnership_id: partnershipId, p_limit: limit || 100 })
  }

  window.B2BAuditRepository = Object.freeze({ timeline: timeline })
})()
