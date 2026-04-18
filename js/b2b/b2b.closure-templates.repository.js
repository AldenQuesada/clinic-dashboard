/**
 * ClinicAI — B2B Closure Templates Repository
 *
 * I/O puro dos templates de carta de encerramento.
 * Expõe window.B2BClosureTemplatesRepository.
 */
;(function () {
  'use strict'
  if (window.B2BClosureTemplatesRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }

  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function list()                        { return _rpc('b2b_closure_templates_list') }
  function get(key)                      { return _rpc('b2b_closure_template_get', { p_key: key || 'default' }) }
  function upsert(key, subject, body)    {
    return _rpc('b2b_closure_template_upsert', {
      p_key:     key,
      p_subject: subject || null,
      p_body:    body,
    })
  }
  function remove(key)                   { return _rpc('b2b_closure_template_delete', { p_key: key }) }

  window.B2BClosureTemplatesRepository = Object.freeze({
    list:   list,
    get:    get,
    upsert: upsert,
    remove: remove,
  })
})()
