/**
 * ClinicAI — B2B Groups Repository
 * I/O puro. Exposições a grupos + stats.
 * Expõe window.B2BGroupsRepository.
 */
;(function () {
  'use strict'
  if (window.B2BGroupsRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function logExposure(payload)        { return _rpc('b2b_group_exposure_log', { p_payload: payload }) }
  function listExposures(partnershipId){ return _rpc('b2b_group_exposures_list', { p_partnership_id: partnershipId }) }
  function stats(partnershipId)        { return _rpc('b2b_group_stats',         { p_partnership_id: partnershipId }) }

  window.B2BGroupsRepository = Object.freeze({
    logExposure: logExposure,
    listExposures: listExposures,
    stats: stats,
  })
})()
