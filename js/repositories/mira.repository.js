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

  // ── Dashboard Config (queries diretas, sem RPCs extras) ──────

  async function dashboardStats() {
    try {
      var sb = _sb()
      var today = new Date().toISOString().slice(0, 10)
      var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      var monthStart = today.slice(0, 8) + '01'
      var twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()

      // Numeros ativos (via RPC — wa_numbers tem RLS service_role only)
      var rNums = await sb.rpc('wa_pro_list_numbers')
      var numbersActive = (rNums.data || []).filter(function (n) {
        return n.number_type === 'professional_private' && n.is_active
      }).length

      // Queries hoje (rate_limit)
      var rToday = await sb.from('wa_pro_rate_limit')
        .select('query_count')
        .eq('date', today)
      var queriesToday = (rToday.data || []).reduce(function (s, r) { return s + (r.query_count || 0) }, 0)

      // Queries semana
      var rWeek = await sb.from('wa_pro_audit_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekAgo)
      var queriesWeek = rWeek.count || 0

      // Queries mes
      var rMonth = await sb.from('wa_pro_audit_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart)
      var queriesMonth = rMonth.count || 0

      // Avg response ms (7 dias)
      var rMs = await sb.from('wa_pro_audit_log')
        .select('response_ms')
        .gte('created_at', weekAgo)
        .not('response_ms', 'is', null)
        .limit(500)
      var msArr = (rMs.data || []).map(function (r) { return r.response_ms }).filter(Boolean)
      var avgMs = msArr.length > 0 ? Math.round(msArr.reduce(function (s, v) { return s + v }, 0) / msArr.length) : 0

      // Error rate (7 dias)
      var rErr = await sb.from('wa_pro_audit_log')
        .select('success')
        .gte('created_at', weekAgo)
        .limit(1000)
      var errRows = rErr.data || []
      var errorRate = errRows.length > 0
        ? Math.round(1000 * errRows.filter(function (r) { return r.success === false }).length / errRows.length) / 10
        : 0

      // Top intents (30 dias)
      var rIntents = await sb.from('wa_pro_audit_log')
        .select('intent')
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .not('intent', 'is', null)
        .neq('intent', 'unknown')
        .limit(2000)
      var intentMap = {}
      ;(rIntents.data || []).forEach(function (r) {
        if (r.intent) intentMap[r.intent] = (intentMap[r.intent] || 0) + 1
      })
      var topIntents = Object.keys(intentMap).map(function (k) { return { intent: k, total: intentMap[k] } })
        .sort(function (a, b) { return b.total - a.total }).slice(0, 8)

      // Queries by day (14 dias)
      var rDays = await sb.from('wa_pro_audit_log')
        .select('created_at')
        .gte('created_at', twoWeeksAgo)
        .limit(5000)
      var dayMap = {}
      ;(rDays.data || []).forEach(function (r) {
        var d = (r.created_at || '').slice(0, 10)
        if (d) dayMap[d] = (dayMap[d] || 0) + 1
      })
      var queriesByDay = Object.keys(dayMap).sort().map(function (d) { return { day: d, total: dayMap[d] } })

      // Voice count (mes)
      var rVoice = await sb.from('wa_pro_transcripts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart)
      var voiceCount = rVoice.count || 0

      return _ok({
        numbers_active: numbersActive,
        queries_today: queriesToday,
        queries_week: queriesWeek,
        queries_month: queriesMonth,
        avg_response_ms: avgMs,
        error_rate: errorRate,
        top_intents: topIntents,
        queries_by_day: queriesByDay,
        voice_count_month: voiceCount,
      })
    } catch (e) { return _err(e.message || e) }
  }

  async function auditList(limit, offset, phone, intent) {
    try {
      var sb = _sb()
      var query = sb.from('wa_pro_audit_log')
        .select('id, phone, intent, query, response, success, response_ms, created_at, professional_id', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset || 0, (offset || 0) + (limit || 50) - 1)

      if (phone) query = query.ilike('phone', '%' + phone.replace(/\D/g, '').slice(-8))
      if (intent) query = query.eq('intent', intent)

      var r = await query
      if (r.error) return _err(r.error.message)

      // Enriquecer com nome do profissional
      var profIds = []
      ;(r.data || []).forEach(function (row) {
        if (row.professional_id && profIds.indexOf(row.professional_id) === -1) profIds.push(row.professional_id)
      })
      var profMap = {}
      if (profIds.length > 0) {
        var rProf = await sb.from('professional_profiles').select('id, display_name').in('id', profIds)
        ;(rProf.data || []).forEach(function (p) { profMap[p.id] = p.display_name })
      }

      var rows = (r.data || []).map(function (row) {
        row.professional_name = profMap[row.professional_id] || null
        return row
      })

      return _ok({ ok: true, rows: rows, total: r.count || 0, limit: limit, offset: offset })
    } catch (e) { return _err(e.message || e) }
  }

  // updateNumber: reutiliza wa_pro_register_number (SECURITY DEFINER, faz upsert)
  async function updateNumber(waNumberId, updates) {
    try {
      // Precisa phone + professional_id pra chamar o RPC de upsert
      if (!updates.phone || !updates.professional_id) {
        return _ok({ ok: false, error: 'phone_and_professional_required' })
      }
      var { data, error } = await _sb().rpc('wa_pro_register_number', {
        p_phone:           updates.phone,
        p_professional_id: updates.professional_id,
        p_label:           updates.label || null,
        p_access_scope:    updates.access_scope || 'own',
        p_permissions:     updates.permissions || { agenda: true, pacientes: true, financeiro: true },
      })
      if (error) return _err(error.message || error)
      return _ok(data || { ok: true })
    } catch (e) { return _err(e.message || e) }
  }

  // removeNumber: desativa via wa_pro_register_number nao suporta is_active=false,
  // entao usamos delete direto no wa_numbers (via RPC custom se existir, senao fallback)
  async function removeNumber(waNumberId) {
    try {
      // Tenta update direto (funciona se user tem service_role ou RLS permite)
      var r = await _sb().from('wa_numbers')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', waNumberId)
        .eq('number_type', 'professional_private')
        .select()

      if (r.error) return _err(r.error.message)
      if (!r.data || r.data.length === 0) {
        // RLS bloqueou — tenta deletar o registro via delete
        var rd = await _sb().from('wa_numbers')
          .delete()
          .eq('id', waNumberId)
          .eq('number_type', 'professional_private')
        if (rd.error) return _err('Sem permissao para desativar. Contate o admin do banco.')
        return _ok({ ok: true })
      }
      return _ok({ ok: true })
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
    dashboardStats:   dashboardStats,
    auditList:        auditList,
    updateNumber:     updateNumber,
    removeNumber:     removeNumber,
  })
})()
