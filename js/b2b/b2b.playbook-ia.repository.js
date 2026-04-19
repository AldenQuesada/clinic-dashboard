/**
 * ClinicAI — B2B Playbook IA Repository (WOW #4)
 *
 * I/O puro do gerador IA de conteúdo. Zero DOM.
 * Expõe window.B2BPlaybookIaRepository.
 */
;(function () {
  'use strict'
  if (window.B2BPlaybookIaRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }
  function _env() {
    return (window.ClinicEnv || {})
  }

  async function generate(partnershipId, scope, requestedBy) {
    var env = _env()
    var url = (env.SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/b2b-playbook-ia'
    var key = env.SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('SUPABASE_URL/ANON_KEY ausentes')
    var r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'apikey': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        partnership_id: partnershipId,
        scope: scope || 'all',
        requested_by: requestedBy || null,
      }),
    })
    var text = await r.text()
    if (!r.ok) throw new Error('IA ' + r.status + ': ' + text.slice(0, 200))
    return JSON.parse(text)
  }

  function runs(partnershipId, limit) {
    return _rpc('b2b_playbook_ia_runs_list', {
      p_partnership_id: partnershipId, p_limit: limit || 20,
    })
  }

  window.B2BPlaybookIaRepository = Object.freeze({
    generate: generate,
    runs: runs,
  })
})()
