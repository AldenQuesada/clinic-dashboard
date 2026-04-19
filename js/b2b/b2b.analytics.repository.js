/**
 * ClinicAI — B2B Analytics Repository
 * I/O puro. Zero DOM. Expõe window.B2BAnalyticsRepository.
 */
;(function () {
  'use strict'
  if (window.B2BAnalyticsRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function get(days) { return _rpc('b2b_mira_analytics', { p_days: days || 30 }) }

  window.B2BAnalyticsRepository = Object.freeze({ get: get })
})()
