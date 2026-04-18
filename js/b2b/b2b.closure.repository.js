/**
 * ClinicAI — B2B Closure Repository
 * I/O puro. Expõe window.B2BClosureRepository.
 */
;(function () {
  'use strict'
  if (window.B2BClosureRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function detectInactive()                { return _rpc('b2b_closure_detect_inactive') }
  function listPending()                   { return _rpc('b2b_closure_list_pending') }
  function approve(id, reason, templateKey) {
    return _rpc('b2b_closure_approve', {
      p_id: id,
      p_reason: reason || null,
      p_template_key: templateKey || 'default',
    })
  }
  function dismiss(id, note)               { return _rpc('b2b_closure_dismiss', { p_id: id, p_note: note || null }) }

  window.B2BClosureRepository = Object.freeze({
    detectInactive: detectInactive,
    listPending: listPending,
    approve: approve,
    dismiss: dismiss,
  })
})()
