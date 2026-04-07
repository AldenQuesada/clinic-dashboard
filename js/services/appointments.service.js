/**
 * ClinicAI — Appointments Service
 *
 * Camada de negócio para agendamentos.
 * Gerencia sincronização bidirecional Supabase ↔ localStorage.
 * Graceful degradation: funciona offline (só localStorage).
 *
 * Depende de:
 *   AppointmentsRepository  (appointments.repository.js)
 *   PermissionsService      (permissions.service.js)
 *   AgendaAccessService     (agenda-access.service.js)  — para resolver professional_id
 *
 * API pública (window.AppointmentsService):
 *   loadForPeriod(dateFrom, dateTo)   — Supabase → merge localStorage → retorna array
 *   syncOne(appt)                     — fire-and-forget: push único para Supabase
 *   softDelete(id)                    — fire-and-forget: soft delete no Supabase
 *   syncBatch()                       — migração completa localStorage → Supabase
 *   getLocalForPeriod(dateFrom, dateTo) — lê localStorage filtrado (para overview)
 *   normalizeForOverview(appts)       — transforma para o formato esperado por agenda-overview.js
 *   getLocalLeadsAsPatients()         — deriva "patients" de clinicai_leads (para overview)
 *   getBirthdays(dateFrom, dateTo)    — aniversariantes de leads no período
 *   canCreate()                       — boolean: usuário pode criar agendamentos?
 *
 * Padrão de sync:
 *   • localStorage é escrito SEMPRE primeiro (operação síncrona, UX imediato)
 *   • Supabase é chamado depois como fire-and-forget (não bloqueia UI)
 *   • loadForPeriod() é chamado no init da página para trazer dados de outros dispositivos
 *   • Conflito: Supabase ganha (fonte de verdade multi-dispositivo)
 */

;(function () {
  'use strict'

  if (window._clinicaiApptServiceLoaded) return
  window._clinicaiApptServiceLoaded = true

  const APPT_KEY = 'clinicai_appointments'

  // ── Helpers de acesso ─────────────────────────────────────────
  function _repo()  { return window.AppointmentsRepository || null }

  function _canCreate() {
    const perms = window.PermissionsService
    return perms ? perms.can('agenda:create') : true  // fallback permissivo
  }

  // ── Mapeamento de status: localStorage → formato de overview ─
  // agenda-overview.js foi escrito com nomes da API externa.
  // Esta tabela faz a tradução sem tocar no código original.
  const _STATUS_TO_OVERVIEW = {
    agendado:               'scheduled',
    aguardando_confirmacao: 'scheduled',
    confirmado:             'confirmed',
    aguardando:             'confirmed',
    na_clinica:             'attended',
    em_consulta:            'attended',
    em_atendimento:         'attended',
    finalizado:             'attended',
    cancelado:              'cancelled',
    no_show:                'no_show',
    remarcado:              'rescheduled',
  }

  // Inverso: status da overview (ou do que o usuário clica) → localStorage
  const _OVERVIEW_TO_STATUS = {
    confirmed: 'confirmado',
    attended:  'na_clinica',
  }

  // ── Resolver professional_id a partir do índice ───────────────
  function _resolveProfessionalId(profissionalIdx) {
    try {
      const svc = window.AgendaAccessService
      if (!svc) return null
      const profs = svc.getAll()
      if (!Array.isArray(profs) || profissionalIdx == null) return null
      return profs[profissionalIdx]?.id || null
    } catch { return null }
  }

  // ── Prepara agendamento para Supabase (adiciona _professionalId) ─
  function _enrichForSupabase(appt) {
    const enriched = { ...appt }
    const profId = _resolveProfessionalId(appt.profissionalIdx)
    if (profId) enriched._professionalId = profId
    // Resolver phone do paciente se nao veio no appt
    if (!enriched.pacientePhone && enriched.pacienteId && window.LeadsService) {
      var leads = LeadsService.getLocal()
      var lead = leads.find(function(l) { return l.id === enriched.pacienteId })
      if (lead) enriched.pacientePhone = lead.phone || lead.whatsapp || ''
    }
    return enriched
  }

  // ── localStorage helpers ──────────────────────────────────────
  function _readLocal() {
    try { return JSON.parse(localStorage.getItem(APPT_KEY) || '[]') } catch { return [] }
  }

  function _writeLocal(arr) {
    try { localStorage.setItem(APPT_KEY, JSON.stringify(arr)) } catch (e) {
      if (e.name !== 'QuotaExceededError') console.warn('[AppointmentsService] localStorage:', e)
    }
  }

  // ── loadForPeriod ─────────────────────────────────────────────
  /**
   * Busca agendamentos de um período no Supabase e mescla com localStorage.
   * Supabase ganha em caso de conflito (fonte de verdade multi-dispositivo).
   * Usa cache local como fallback se Supabase indisponível.
   *
   * @param {string} dateFrom  YYYY-MM-DD
   * @param {string} dateTo    YYYY-MM-DD
   * @returns {Promise<object[]>}  array mesclado (mesmo formato localStorage)
   */
  async function loadForPeriod(dateFrom, dateTo) {
    const repo  = _repo()
    const local = _readLocal()

    if (!repo) return local.filter(a => a.data >= dateFrom && a.data <= dateTo)

    const result = await repo.listForPeriod(dateFrom, dateTo)

    if (!result.ok) {
      console.warn('[AppointmentsService] Supabase indisponível, usando localStorage:', result.error)
      return local.filter(a => a.data >= dateFrom && a.data <= dateTo)
    }

    const remote = result.data   // formato já é o do localStorage (o RPC retorna assim)

    if (!remote.length) {
      // Nenhum dado no Supabase para o período — retorna local
      return local.filter(a => a.data >= dateFrom && a.data <= dateTo)
    }

    // Mescla: Supabase ganha por ID; registros locais não presentes no remote são mantidos
    const remoteById = {}
    remote.forEach(r => { remoteById[r.id] = r })

    const merged = [
      // Registros remotos (Supabase ganha)
      ...remote,
      // Registros locais fora do período buscado (mantidos intactos)
      ...local.filter(l => l.data < dateFrom || l.data > dateTo),
      // Registros locais no período que NÃO existem no Supabase (ainda não sincronizados)
      ...local.filter(l => l.data >= dateFrom && l.data <= dateTo && !remoteById[l.id]),
    ]

    // Backup antes de sobrescrever (rollback em caso de dados corrompidos)
    try { localStorage.setItem(APPT_KEY + '_backup', localStorage.getItem(APPT_KEY) || '[]') } catch(e) { /* quota */ }
    _writeLocal(merged)
    return remote
  }

  // ── syncOne ───────────────────────────────────────────────────
  /**
   * Envia um agendamento para o Supabase (fire-and-forget).
   * Chamado após saveAppointments() em api.js.
   * Silencia erros — localStorage sempre prevalece como cache local.
   *
   * @param {object} appt  — agendamento no formato localStorage
   */
  function syncOne(appt) {
    const repo = _repo()
    if (!repo || !appt?.id) return

    const enriched = _enrichForSupabase(appt)
    repo.upsert(enriched).then(function(result) {
      if (result && !result.ok) {
        console.error('[AppointmentsService] syncOne ERRO:', result.error, '| appt:', appt.id)
        // Retry uma vez apos 3s
        setTimeout(function() {
          repo.upsert(enriched).then(function(r2) {
            if (r2 && !r2.ok) console.error('[AppointmentsService] syncOne retry FALHOU:', r2.error)
            else console.log('[AppointmentsService] syncOne retry OK:', appt.id)
          }).catch(function(e) { console.error('[AppointmentsService] syncOne retry exception:', e) })
        }, 3000)
      }
    }).catch(function(err) {
      console.error('[AppointmentsService] syncOne exception:', err.message || err, '| appt:', appt.id)
    })
  }

  // ── softDelete ────────────────────────────────────────────────
  /**
   * Dispara soft delete no Supabase (fire-and-forget).
   * Chamado após deleteAppt() em api.js.
   *
   * @param {string} id  — appt_... ID
   */
  function softDelete(id) {
    const repo = _repo()
    if (!repo || !id) return

    repo.remove(id).catch(err => {
      console.warn('[AppointmentsService] softDelete falhou silenciosamente:', err)
    })
  }

  // ── syncBatch ─────────────────────────────────────────────────
  /**
   * Migra TODOS os agendamentos do localStorage para Supabase.
   * Idempotente. Destinado à execução única na primeira integração.
   *
   * @returns {Promise<{ok, inserted, updated, errors, error?}>}
   */
  async function syncBatch() {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'Supabase não disponível' }

    const local = _readLocal()
    if (!local.length) return { ok: true, inserted: 0, updated: 0, errors: 0 }

    // Enriquece com _professionalId quando disponível
    const enriched = local.map(_enrichForSupabase)

    const result = await repo.syncBatch(enriched)
    if (!result.ok) return { ok: false, error: result.error }

    return { ok: true, ...result.data }
  }

  // ── getLocalForPeriod ─────────────────────────────────────────
  /**
   * Lê agendamentos do localStorage filtrados por data.
   * Usado por agenda-overview.js para KPIs sem chamada de rede.
   *
   * @param {Date} dateFrom
   * @param {Date} dateTo
   * @returns {object[]}
   */
  function getLocalForPeriod(dateFrom, dateTo) {
    const from = dateFrom instanceof Date ? dateFrom.toISOString().slice(0, 10) : String(dateFrom)
    const to   = dateTo   instanceof Date ? dateTo.toISOString().slice(0, 10)   : String(dateTo)
    return _readLocal().filter(a => {
      const d = a.data || ''
      return d >= from && d <= to
    })
  }

  // ── normalizeForOverview ──────────────────────────────────────
  /**
   * Transforma array de agendamentos (formato localStorage) para o formato
   * esperado pelas funções _aoRenderKpis, _aoRenderStats, _aoRenderTimeline, etc.
   * em agenda-overview.js.
   *
   * A função agenda-overview.js foi escrita usando a API externa e espera:
   *   a.status:       'scheduled' | 'confirmed' | 'attended' | 'no_show' | 'cancelled' | 'rescheduled'
   *   a.scheduledAt:  ISO timestamp para ordenação e grouping
   *   a.procedure:    { price: number, name: string }
   *   a.patient:      { name: string, leadId: string }
   *   a.professional: { name: string }
   *
   * @param {object[]} appts  — formato localStorage
   * @returns {object[]}       — formato agenda-overview
   */
  function normalizeForOverview(appts) {
    return appts.map(a => ({
      ...a,
      // Status traduzido
      status:       _STATUS_TO_OVERVIEW[a.status] || a.status,
      // ISO timestamp que as funções de gráfico/agrupamento usam
      scheduledAt:  a.data ? `${a.data}T${a.horaInicio || '00:00'}:00` : null,
      // Objeto procedure (para _aoRenderKpis: a.procedure?.price)
      procedure:    { price: a.valor || 0, name: a.procedimento || '' },
      // Objeto patient (para flyouts de paciente)
      patient:      { name: a.pacienteNome || '', leadId: a.pacienteId || '' },
      // Objeto professional (para ranking)
      professional: { name: a.profissionalNome || '' },
    }))
  }

  // ── getLocalLeadsAsPatients ───────────────────────────────────
  /**
   * Deriva lista de "patients" de clinicai_leads enriquecida com
   * data do último agendamento — para a seção "sem retorno" da overview.
   *
   * @returns {object[]}
   */
  function getLocalLeadsAsPatients() {
    try {
      const leads = JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
      const appts = _readLocal()

      // Última consulta por lead
      const lastApptByLead = {}
      for (const a of appts) {
        if (!a.pacienteId || ['cancelado','no_show','remarcado'].includes(a.status)) continue
        if (!lastApptByLead[a.pacienteId] || a.data > lastApptByLead[a.pacienteId]) {
          lastApptByLead[a.pacienteId] = a.data
        }
      }

      return leads.map(l => ({
        id:          l.id,
        leadId:      l.id,
        name:        l.name || l.nome || '—',
        phone:       l.phone || l.whatsapp || '',
        email:       l.email || '',
        birthdate:   l.dataNascimento || l.nascimento || l.birthdate || null,
        lastApptAt:  lastApptByLead[l.id] || null,
        status:      l.status || 'active',
      }))
    } catch { return [] }
  }

  // ── getBirthdays ──────────────────────────────────────────────
  /**
   * Retorna aniversariantes de clinicai_leads cujo aniversário cai
   * dentro do período [dateFrom, dateTo] (compara mês+dia, ignora ano).
   *
   * @param {Date} dateFrom
   * @param {Date} dateTo
   * @returns {object[]}
   */
  function getBirthdays(dateFrom, dateTo) {
    try {
      const from   = dateFrom instanceof Date ? dateFrom : new Date(dateFrom + 'T00:00:00')
      const to     = dateTo   instanceof Date ? dateTo   : new Date(dateTo   + 'T23:59:59')
      const leads  = JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
      const result = []

      const now = new Date()
      const year = now.getFullYear()

      for (const l of leads) {
        const bd = l.dataNascimento || l.nascimento || l.birthdate
        if (!bd) continue

        // Tenta parsear como YYYY-MM-DD ou DD/MM/YYYY
        let month, day
        const matchISO = String(bd).match(/^(\d{4})-(\d{2})-(\d{2})/)
        const matchBR  = String(bd).match(/^(\d{2})\/(\d{2})\/(\d{4})/)

        if (matchISO) {
          month = parseInt(matchISO[2], 10)
          day   = parseInt(matchISO[3], 10)
        } else if (matchBR) {
          day   = parseInt(matchBR[1], 10)
          month = parseInt(matchBR[2], 10)
        } else continue

        // Constrói data de aniversário no ano corrente para comparação
        const bdThisYear = new Date(year, month - 1, day)
        if (bdThisYear >= from && bdThisYear <= to) {
          result.push({
            id:        l.id,
            leadId:    l.id,
            name:      l.name || l.nome || '—',
            phone:     l.phone || l.whatsapp || '',
            birthdate: bd,
            age:       year - (matchISO ? parseInt(matchISO[1], 10) : parseInt(matchBR[3], 10)),
            bdDate:    bdThisYear.toISOString().slice(0, 10),
          })
        }
      }

      return result.sort((a, b) => a.bdDate.localeCompare(b.bdDate))
    } catch { return [] }
  }

  // ── updateLocalStatus ─────────────────────────────────────────
  /**
   * Atualiza o status de um agendamento no localStorage e dispara
   * sync para Supabase (fire-and-forget).
   * Usado por aoConfirmAppt e aoMarkAttended em agenda-overview.js.
   *
   * @param {string} id              — appt_... ID
   * @param {string} overviewStatus  — 'confirmed' | 'attended'
   * @returns {{ ok: boolean, appt?: object }}
   */
  function updateLocalStatus(id, overviewStatus) {
    const newStatus = _OVERVIEW_TO_STATUS[overviewStatus]
    if (!newStatus) return { ok: false }

    const appts = _readLocal()
    const idx   = appts.findIndex(a => a.id === id)
    if (idx < 0) return { ok: false }

    appts[idx] = { ...appts[idx], status: newStatus }
    _writeLocal(appts)
    syncOne(appts[idx])

    return { ok: true, appt: appts[idx] }
  }

  // ── canCreate ─────────────────────────────────────────────────
  function canCreate() { return _canCreate() }

  // ── Auto-init: carrega período atual ao autenticar ────────────
  document.addEventListener('clinicai:auth-success', () => {
    // Carrega o mês atual em background para popular localStorage com dados do Supabase
    const now   = new Date()
    const from  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const to    = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
    loadForPeriod(from, to).catch(e => console.warn("[appointments.service]", e.message || e))
  })

  // ── Exposição global ──────────────────────────────────────────
  window.AppointmentsService = Object.freeze({
    loadForPeriod,
    syncOne,
    softDelete,
    syncBatch,
    getLocalForPeriod,
    normalizeForOverview,
    getLocalLeadsAsPatients,
    getBirthdays,
    updateLocalStatus,
    canCreate,
  })

})()
