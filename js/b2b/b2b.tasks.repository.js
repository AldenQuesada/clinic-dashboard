/**
 * ClinicAI — B2B Tasks Repository
 *
 * I/O puro das tarefas B2B. Zero DOM.
 * Expõe window.B2BTasksRepository.
 */
;(function () {
  'use strict'
  if (window.B2BTasksRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function list(filters) {
    filters = filters || {}
    return _rpc('b2b_tasks_list', {
      p_status: filters.status || 'open',
      p_kind:   filters.kind   || null,
      p_owner:  filters.owner  || null,
      p_limit:  filters.limit  || 200,
    })
  }
  function assign(id, owner) {
    return _rpc('b2b_task_assign', { p_id: id, p_owner: owner || null })
  }
  function resolve(id, status) {
    return _rpc('b2b_task_resolve', { p_id: id, p_status: status || 'done' })
  }

  // ─── WA ações ──────────────────────────────────────────────
  function briefSend(partnershipId, taskId) {
    return _rpc('b2b_brief_send', { p_partnership_id: partnershipId, p_task_id: taskId || null })
  }
  function briefSendAllActive() {
    return _rpc('b2b_brief_send_all_active')
  }

  window.B2BTasksRepository = Object.freeze({
    list: list,
    resolve: resolve,
    assign: assign,
    briefSend: briefSend,
    briefSendAllActive: briefSendAllActive,
  })
})()
