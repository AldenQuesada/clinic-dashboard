/**
 * ClinicAI — B2B Insight Repository (WOW #9)
 *
 * I/O puro dos insights semanais. Zero DOM.
 * Expõe window.B2BInsightRepository.
 */
;(function () {
  'use strict'
  if (window.B2BInsightRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function list(limit) { return _rpc('b2b_insights_list', { p_limit: limit || 5 }) }
  function markSeen(id) { return _rpc('b2b_insight_mark_seen', { p_id: id }) }
  function dismiss(id)  { return _rpc('b2b_insight_dismiss',   { p_id: id }) }

  // Força regeneração via edge function (admin on-demand)
  async function generate(force) {
    var env = window.ClinicEnv || {}
    var url = (env.SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/b2b-weekly-insight'
    var key = env.SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('SUPABASE_URL/ANON_KEY ausentes')
    var r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'apikey': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force: !!force }),
    })
    var text = await r.text()
    if (!r.ok) throw new Error('IA ' + r.status + ': ' + text.slice(0, 200))
    return JSON.parse(text)
  }

  window.B2BInsightRepository = Object.freeze({
    list: list, markSeen: markSeen, dismiss: dismiss, generate: generate,
  })
})()
