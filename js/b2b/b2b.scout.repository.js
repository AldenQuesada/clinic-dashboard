/**
 * ClinicAI — B2B Scout Repository
 *
 * I/O puro do scout (candidatos + usage). Zero DOM, zero lógica.
 * Expõe window.B2BScoutRepository.
 */
;(function () {
  'use strict'
  if (window.B2BScoutRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }

  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  // ─── Candidatos ─────────────────────────────────────────────
  function register(payload)                 { return _rpc('b2b_candidate_register',   { p_payload: payload }) }
  function list(filters) {
    filters = filters || {}
    return _rpc('b2b_candidate_list', {
      p_status:    filters.status    || null,
      p_category:  filters.category  || null,
      p_min_score: filters.minScore  || null,
      p_limit:     filters.limit     || 100,
    })
  }
  function setStatus(id, status, notes)      { return _rpc('b2b_candidate_set_status', { p_id: id, p_status: status, p_notes: notes || null }) }
  function promote(id)                       { return _rpc('b2b_candidate_promote',    { p_id: id }) }
  function addManual(payload)                { return _rpc('b2b_candidate_add_manual', { p_payload: payload }) }
  function evaluatePayload(id)               { return _rpc('b2b_candidate_evaluate_payload', { p_id: id }) }
  function evaluateApply(id, result)         { return _rpc('b2b_candidate_evaluate_apply',  { p_id: id, p_result: result }) }

  // ─── Scout config (toggle/budget) ───────────────────────────
  function consumedCurrentMonth()            { return _rpc('b2b_scout_consumed_current_month') }
  function canScan(category)                 { return _rpc('b2b_scout_can_scan', { p_category: category }) }

  // ─── Usage log (manual — edge function também usa) ─────────
  function usageLog(eventType, costBRL, category, candidateId, meta) {
    return _rpc('b2b_scout_usage_log', {
      p_event_type:   eventType,
      p_cost_brl:     costBRL,
      p_category:     category || null,
      p_candidate_id: candidateId || null,
      p_meta:         meta || null,
    })
  }

  // ─── API pública ────────────────────────────────────────────
  window.B2BScoutRepository = Object.freeze({
    register: register,
    list: list,
    setStatus: setStatus,
    promote: promote,
    addManual: addManual,
    evaluatePayload: evaluatePayload,
    evaluateApply: evaluateApply,
    consumedCurrentMonth: consumedCurrentMonth,
    canScan: canScan,
    usageLog: usageLog,
  })
})()
