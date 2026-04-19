/**
 * ClinicAI — B2B Partner Panel Repository (WOW #2)
 *
 * I/O puro do painel público do parceiro. Zero DOM.
 * Expõe window.B2BPartnerPanelRepository.
 */
;(function () {
  'use strict'
  if (window.B2BPartnerPanelRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function issueToken(partnershipId) {
    return _rpc('b2b_partner_panel_issue_token', { p_partnership_id: partnershipId })
  }
  function revokeToken(partnershipId) {
    return _rpc('b2b_partner_panel_revoke', { p_partnership_id: partnershipId })
  }
  function getByToken(token) {
    return _rpc('b2b_partner_panel_get', { p_token: token })
  }

  window.B2BPartnerPanelRepository = Object.freeze({
    issueToken: issueToken,
    revokeToken: revokeToken,
    getByToken: getByToken,
  })
})()
