/**
 * ClinicAI — B2B NPS Repository (WOW #11)
 * Zero DOM.
 */
;(function () {
  'use strict'
  if (window.B2BNpsRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function issue(partnershipId)        { return _rpc('b2b_nps_issue',   { p_partnership_id: partnershipId }) }
  function getByToken(token)           { return _rpc('b2b_nps_get',     { p_token: token }) }
  function submit(token, score, comment) { return _rpc('b2b_nps_submit', { p_token: token, p_score: score, p_comment: comment || null }) }
  function summary(partnershipId)      { return _rpc('b2b_nps_summary', { p_partnership_id: partnershipId || null }) }
  function dispatchQuarterly()         { return _rpc('b2b_nps_quarterly_dispatch', {}) }

  window.B2BNpsRepository = Object.freeze({
    issue: issue, getByToken: getByToken, submit: submit,
    summary: summary, dispatchQuarterly: dispatchQuarterly,
  })
})()
