/**
 * ClinicAI — B2B Attribution Repository (registro + conversão)
 *
 * I/O puro das atribuições. Zero DOM.
 * Expõe window.B2BAttributionRepository.
 */
;(function () {
  'use strict'
  if (window.B2BAttributionRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function roi(partnershipId)       { return _rpc('b2b_partnership_roi', { p_partnership_id: partnershipId }) }
  function leads(partnershipId, limit) {
    return _rpc('b2b_partnership_leads_history', {
      p_partnership_id: partnershipId, p_limit: limit || 100,
    })
  }
  function scan(days) { return _rpc('b2b_attribution_scan', { p_days: days || 180 }) }

  window.B2BAttributionRepository = Object.freeze({
    roi: roi,
    leads: leads,
    scan: scan,
  })
})()
