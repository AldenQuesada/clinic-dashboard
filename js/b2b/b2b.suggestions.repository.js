/**
 * ClinicAI — B2B Suggestions Repository
 *
 * I/O puro. Consome RPC b2b_suggestions_snapshot.
 * Expõe window.B2BSuggestionsRepository.
 */
;(function () {
  'use strict'
  if (window.B2BSuggestionsRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function snapshot() { return _rpc('b2b_suggestions_snapshot') }

  window.B2BSuggestionsRepository = Object.freeze({ snapshot: snapshot })
})()
