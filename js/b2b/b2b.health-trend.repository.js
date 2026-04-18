/**
 * ClinicAI — B2B Health Trend Repository
 *
 * I/O puro da tendência de saúde (90d). Zero DOM.
 * Expõe window.B2BHealthTrendRepository.
 */
;(function () {
  'use strict'
  if (window.B2BHealthTrendRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function byPartnership(partnershipId, days) {
    return _rpc('b2b_health_trend', {
      p_partnership_id: partnershipId,
      p_days: days || 90,
    })
  }
  function summary(days) {
    return _rpc('b2b_health_trend_summary', { p_days: days || 90 })
  }

  window.B2BHealthTrendRepository = Object.freeze({
    byPartnership: byPartnership,
    summary: summary,
  })
})()
