/**
 * ClinicAI — B2B Impact Repository
 *
 * I/O puro do impact score. Zero DOM.
 * Expõe window.B2BImpactRepository.
 */
;(function () {
  'use strict'
  if (window.B2BImpactRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function byPartnership(id) { return _rpc('b2b_partnership_impact_score', { p_partnership_id: id }) }
  function all()              { return _rpc('b2b_partnership_impact_score', { p_partnership_id: null }) }

  window.B2BImpactRepository = Object.freeze({
    byPartnership: byPartnership,
    all: all,
  })
})()
