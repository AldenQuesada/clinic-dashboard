/**
 * ClinicAI — B2B Cost Repository
 *
 * I/O puro do custo real por parceria. Zero DOM.
 * Expõe window.B2BCostRepository.
 */
;(function () {
  'use strict'
  if (window.B2BCostRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function byPartnership(partnershipId) {
    return _rpc('b2b_partnership_cost', { p_partnership_id: partnershipId })
  }
  function summary(limit) {
    return _rpc('b2b_cost_summary', { p_limit: limit || 200 })
  }

  window.B2BCostRepository = Object.freeze({
    byPartnership: byPartnership,
    summary: summary,
  })
})()
