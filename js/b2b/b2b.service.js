/**
 * ClinicAI — B2B Service
 *
 * Regras de negócio. Consome Repository; não toca DOM; não conhece UIs.
 * Expõe window.B2BService.
 *
 * Responsabilidades:
 *   - Validação de DNA gate (excelência, estética, propósito — mínimo 7/10)
 *   - Validação de transição de status (máquina de estados)
 *   - Normalização de payload antes de gravar
 *   - Cálculo de saúde derivada (verde/amarelo/vermelho)
 */
;(function () {
  'use strict'
  if (window.B2BService) return

  var PILLARS = [
    'imagem', 'evento', 'institucional', 'fitness',
    'alimentacao', 'saude', 'status', 'rede', 'outros',
  ]
  var TYPES = ['transactional', 'occasion', 'institutional']
  var STATUSES = ['prospect', 'dna_check', 'contract', 'active', 'review', 'paused', 'closed']

  // Máquina de estados — quais transições são permitidas
  var ALLOWED_TRANSITIONS = {
    prospect:   ['dna_check', 'closed'],
    dna_check:  ['contract', 'closed', 'prospect'],
    contract:   ['active', 'paused', 'closed'],
    active:     ['review', 'paused', 'closed'],
    review:     ['active', 'paused', 'closed'],
    paused:     ['active', 'closed'],
    closed:     [],
  }

  var DNA_MIN_SCORE = 7

  function _repo() {
    if (!window.B2BRepository) throw new Error('B2BRepository não carregado')
    return window.B2BRepository
  }

  // ─── Validação DNA ──────────────────────────────────────────
  function validateDNA(partnership) {
    var e = Number(partnership.dna_excelencia || 0)
    var s = Number(partnership.dna_estetica   || 0)
    var p = Number(partnership.dna_proposito  || 0)
    if (!e || !s || !p) {
      return { ok: false, reason: 'dna_incomplete', score: 0 }
    }
    var score = (e + s + p) / 3
    if (score < DNA_MIN_SCORE) {
      return { ok: false, reason: 'dna_below_threshold', score: score }
    }
    return { ok: true, score: score }
  }

  // ─── Máquina de estados ─────────────────────────────────────
  function canTransition(fromStatus, toStatus) {
    if (!STATUSES.indexOf(toStatus) === -1) return false
    var allowed = ALLOWED_TRANSITIONS[fromStatus] || []
    return allowed.indexOf(toStatus) !== -1
  }

  function transitionStatus(partnership, toStatus, reason) {
    var from = partnership.status || 'prospect'
    if (!canTransition(from, toStatus)) {
      return Promise.reject(new Error('Transição inválida: ' + from + ' → ' + toStatus))
    }
    // DNA gate: pra ir pra contract/active, precisa DNA válido
    if (['contract', 'active'].indexOf(toStatus) !== -1) {
      var dna = validateDNA(partnership)
      if (!dna.ok) {
        return Promise.reject(new Error('DNA check falhou: ' + dna.reason + ' (score ' + dna.score.toFixed(1) + ')'))
      }
    }
    return _repo().setStatus(partnership.id, toStatus, reason)
  }

  // ─── Normalização pré-gravação ──────────────────────────────
  function normalizePayload(payload) {
    var p = Object.assign({}, payload)
    // Campos array — garantir que sejam array ou undefined
    ;['voucher_delivery', 'contrapartida', 'sazonais', 'slogans', 'involved_professionals'].forEach(function (k) {
      if (p[k] != null && !Array.isArray(p[k])) {
        if (typeof p[k] === 'string') p[k] = p[k].split(',').map(function (s) { return s.trim() }).filter(Boolean)
      }
    })
    // Valores numéricos vazios viram null
    ;['tier','dna_excelencia','dna_estetica','dna_proposito',
      'voucher_validity_days','voucher_min_notice_days','voucher_monthly_cap',
      'monthly_value_cap_brl','contract_duration_months','review_cadence_months'].forEach(function (k) {
      if (p[k] === '' || p[k] == null) delete p[k]
    })
    // Slug automático se não fornecido
    if (!p.slug && p.name) {
      p.slug = String(p.name).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    }
    return p
  }

  // ─── Cálculo de saúde (derivado, sem RPC por enquanto) ──────
  function calcHealth(partnership, targets, events) {
    if (!partnership) return 'unknown'
    if (partnership.status === 'closed' || partnership.status === 'paused') return 'unknown'

    // Sinais simples pra Fase 1; refinar na Fase 2 com dados reais
    var dna = validateDNA(partnership)
    if (!dna.ok) return 'red'

    if (partnership.status === 'prospect' || partnership.status === 'dna_check') return 'yellow'

    // Se tem eventos vencidos e zero done → amarelo
    if (events && events.length) {
      var overdue = events.filter(function (e) {
        return e.status === 'planned' && e.next_occurrence && new Date(e.next_occurrence) < new Date()
      })
      if (overdue.length >= 2) return 'red'
      if (overdue.length >= 1) return 'yellow'
    }
    return 'green'
  }

  // ─── Agregadores úteis pra UI (sem conhecer a UI) ───────────
  function groupByTier(partnerships) {
    var out = { 1: [], 2: [], 3: [], untiered: [] }
    ;(partnerships || []).forEach(function (p) {
      var t = p.tier
      if (t === 1 || t === 2 || t === 3) out[t].push(p)
      else out.untiered.push(p)
    })
    return out
  }

  function groupByPillar(partnerships) {
    var out = {}
    ;(partnerships || []).forEach(function (p) {
      var k = p.pillar || 'outros'
      out[k] = out[k] || []
      out[k].push(p)
    })
    return out
  }

  // ─── API pública ────────────────────────────────────────────
  window.B2BService = Object.freeze({
    PILLARS: PILLARS,
    TYPES: TYPES,
    STATUSES: STATUSES,
    DNA_MIN_SCORE: DNA_MIN_SCORE,
    validateDNA: validateDNA,
    canTransition: canTransition,
    transitionStatus: transitionStatus,
    normalizePayload: normalizePayload,
    calcHealth: calcHealth,
    groupByTier: groupByTier,
    groupByPillar: groupByPillar,
  })
})()
