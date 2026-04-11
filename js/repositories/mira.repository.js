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
        p_permissions:     payload.permissions || { agenda: true, pacientes: true, financeiro: true },
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

  // ── Bloco B: queries (pacientes, agenda, financeiro) ─────

  async function patientSearch(phone, query, limit) {
    try {
      const { data, error } = await _sb().rpc('wa_pro_patient_search', {
        p_phone: phone, p_query: query, p_limit: limit || 5,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function patientBalance(phone, patientQuery) {
    try {
      const { data, error } = await _sb().rpc('wa_pro_patient_balance', {
        p_phone: phone, p_patient_query: patientQuery,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function agenda(phone, date) {
    try {
      const { data, error } = await _sb().rpc('wa_pro_agenda', {
        p_phone: phone, p_date: date,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function agendaFreeSlots(phone, date) {
    try {
      const { data, error } = await _sb().rpc('wa_pro_agenda_free_slots', {
        p_phone: phone, p_date: date,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function financeSummary(phone, startDate, endDate) {
    try {
      const { data, error } = await _sb().rpc('wa_pro_finance_summary', {
        p_phone: phone, p_start_date: startDate, p_end_date: endDate,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  async function listProfessionals() {
    try {
      const { data, error } = await _sb()
        .from('professional_profiles')
        .select('id,display_name,specialty,is_active,phone,telefone,whatsapp')
        .eq('is_active', true)
        .order('display_name', { ascending: true })
      if (error) return _err(error.message || error)
      return _ok(data || [])
    } catch (e) { return _err(e.message || e) }
  }

  async function financeCommission(phone, startDate, endDate) {
    try {
      const { data, error } = await _sb().rpc('wa_pro_finance_commission', {
        p_phone: phone, p_start_date: startDate, p_end_date: endDate,
      })
      if (error) return _err(error.message || error)
      return _ok(data || {})
    } catch (e) { return _err(e.message || e) }
  }

  window.MiraRepository = Object.freeze({
    authenticate:     authenticate,
    checkRateLimit:   checkRateLimit,
    logQuery:         logQuery,
    registerNumber:   registerNumber,
    listNumbers:      listNumbers,
    listProfessionals: listProfessionals,
    patientSearch:    patientSearch,
    patientBalance:   patientBalance,
    agenda:           agenda,
    agendaFreeSlots:  agendaFreeSlots,
    financeSummary:   financeSummary,
    financeCommission: financeCommission,
  })
})()
