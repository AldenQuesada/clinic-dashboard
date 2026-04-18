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
      p_limit:  filters.limit  || 200,
    })
  }
  function resolve(id, status) {
    return _rpc('b2b_task_resolve', { p_id: id, p_status: status || 'done' })
  }

  window.B2BTasksRepository = Object.freeze({
    list: list,
    resolve: resolve,
  })
})()
