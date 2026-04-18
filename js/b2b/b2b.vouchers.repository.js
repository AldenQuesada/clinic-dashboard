/**
 * ClinicAI — B2B Vouchers Repository
 *
 * I/O puro dos vouchers digitais. Zero DOM.
 * Expõe window.B2BVouchersRepository.
 */
;(function () {
  'use strict'
  if (window.B2BVouchersRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }

  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function issue(payload)                     { return _rpc('b2b_voucher_issue',        { p_payload: payload }) }
  function markDelivered(id)                  { return _rpc('b2b_voucher_mark_delivered', { p_id: id }) }
  function getByToken(token)                  { return _rpc('b2b_voucher_get_by_token', { p_token: token }) }
  function redeem(token, apptId, operator)    { return _rpc('b2b_voucher_redeem',       { p_token: token, p_appointment_id: apptId || null, p_operator: operator || null }) }
  function cancel(id, reason)                 { return _rpc('b2b_voucher_cancel',       { p_id: id, p_reason: reason || null }) }
  function listByPartnership(partnershipId)   { return _rpc('b2b_voucher_list_by_partnership', { p_partnership_id: partnershipId }) }
  function funnel(partnershipId)              { return _rpc('b2b_voucher_funnel',       { p_partnership_id: partnershipId }) }

  window.B2BVouchersRepository = Object.freeze({
    issue: issue,
    markDelivered: markDelivered,
    getByToken: getByToken,
    redeem: redeem,
    cancel: cancel,
    listByPartnership: listByPartnership,
    funnel: funnel,
  })
})()
