/**
 * ClinicAI — B2B Playbook Repository
 * I/O puro. Expõe window.B2BPlaybookRepository.
 */
;(function () {
  'use strict'
  if (window.B2BPlaybookRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function apply(partnershipId) {
    return _rpc('b2b_playbook_apply', { p_partnership_id: partnershipId })
  }

  window.B2BPlaybookRepository = Object.freeze({ apply: apply })
})()
