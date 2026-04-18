/**
 * ClinicAI — B2B Partnership Comments Repository
 *
 * I/O puro dos comentários/notas por parceria. Zero DOM, zero lógica.
 * Expõe window.B2BCommentsRepository.
 */
;(function () {
  'use strict'
  if (window.B2BCommentsRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }

  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function add(partnershipId, author, body) {
    return _rpc('b2b_comment_add', {
      p_partnership_id: partnershipId,
      p_author:         author || null,
      p_body:           body,
    })
  }

  function list(partnershipId) {
    return _rpc('b2b_comments_list', { p_partnership_id: partnershipId })
  }

  function remove(id) {
    return _rpc('b2b_comment_delete', { p_id: id })
  }

  window.B2BCommentsRepository = Object.freeze({
    add:    add,
    list:   list,
    remove: remove,
  })
})()
