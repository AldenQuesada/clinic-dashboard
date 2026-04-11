/**
 * ClinicAI — Mira Repository
 * Camada de acesso ao Supabase via RPCs wa_pro_*
 *
 * MODULAR: zero dependencia de outros repos. Usado apenas pelo
 * mira.service.js. Nao mexe em wa_messages (que e da Lara).
 */
;(function () {
  'use strict'
  if (window._clinicaiMiraRepoLoaded) return
  window._clinicaiMiraRepoLoaded = true

  function _sb() {
    var sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) nao inicializado')
    return sb
  }
  function _ok(data) { return { ok: true, data: data, error: null } }
  function _err(e)   { return { ok: false, data: null, error: String(e || 'erro') } }

  async function authenticate(phone) {
    try {
      const { data, error } = await _sb().rpc('wa_pro_authenticate', { p_phone: phone })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function checkRateLimit(professionalId) {
    try {
      const { data, error } = await _sb().rpc('wa_pro_check_rate_limit', { p_professional_id: professionalId })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function logQuery(payload) {
    try {
      const { data, error } = await _sb().rpc('wa_pro_log_query', {
        p_phone:           payload.phone,
        p_professional_id: payload.professional_id,
        p_wa_number_id:    payload.wa_number_id || null,
        p_query:           payload.query,
        p_intent:          payload.intent || null,
        p_response:        payload.response || null,
        p_success:         payload.success !== false,
        p_error:           payload.error || null,
        p_tokens_used:     payload.tokens_used || 0,
        p_response_ms:     payload.response_ms || null,
      })
      if (error) return _err(error.message || error)
      return _ok(data)
    } catch (e) { return _err(e.message || e) }
  }

  async function registerNumber(payload) {
    try {
      const { data, error } = await _sb().rpc('wa_pro_register_number', {
        p_phone:           payload.phone,
        p_professional_id: payload.professional_id,
        p_label:           payload.label || null,
        p_access_scope:    payload.access_scope || 'own',
      })
      if (error) return _err(error.message || error)
      return _ok(data)
    } catch (e) { return _err(e.message || e) }
  }

  async function listNumbers() {
    try {
      const { data, error } = await _sb().rpc('wa_pro_list_numbers')
      if (error) return _err(error.message || error)
      return _ok(data || [])
    } catch (e) { return _err(e.message || e) }
  }

  window.MiraRepository = Object.freeze({
    authenticate:    authenticate,
    checkRateLimit:  checkRateLimit,
    logQuery:        logQuery,
    registerNumber:  registerNumber,
    listNumbers:     listNumbers,
  })
})()
