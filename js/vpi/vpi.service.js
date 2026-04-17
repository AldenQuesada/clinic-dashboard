/**
 * ClinicAI - VPIService
 *
 * Regras de negocio, cache e helpers do Programa de Indicacao.
 * Usa VPIRepository para acesso a dados.
 *
 * Expoe window.VPIService:
 *   loadPartners(opts)       - carrega e cacheia
 *   getPartnersSorted(sort)  - sincrono, do cache
 *   getActivePartners()      - so status != inativo
 *   findPartnerByPhone(p)
 *   findPartnerByLeadId(id)
 *   upsertPartner(data)
 *   invalidate()             - reset cache
 *
 *   loadTiers(force)         - carrega tiers
 *   getTiers()               - sincrono do cache
 *   upsertTier(data)
 *   deleteTier(id)
 *
 *   getInviteTemplate()      - busca template slug=vpi_convite_parceiro
 *   renderTemplate(str, vars)
 *
 *   loadKpis()
 *
 * Graceful: se Supabase offline, retorna cache ou vazio, nunca throw
 * publicamente. Os metodos de mutacao propagam erro.
 */
;(function () {
  'use strict'

  if (window._vpiServiceLoaded) return
  window._vpiServiceLoaded = true

  var _cache = {
    partners:        [],
    partnersLoadedAt: 0,
    tiers:           [],
    tiersLoadedAt:   0,
    template:        null,
    templateLoadedAt: 0,
    kpis:            null,
  }

  var CACHE_TTL_MS = 60 * 1000

  function _repo() { return window.VPIRepository }

  function _isFresh(loadedAt) { return Date.now() - loadedAt < CACHE_TTL_MS }

  function _onlyDigits(s) { return String(s || '').replace(/\D/g, '') }

  // ── Partners ─────────────────────────────────────────────
  async function loadPartners(opts) {
    opts = opts || {}
    if (!opts.force && _cache.partners.length && _isFresh(_cache.partnersLoadedAt)) {
      return _cache.partners
    }
    try {
      var list = await _repo().partners.list(opts.search, opts.sort)
      _cache.partners         = Array.isArray(list) ? list : []
      _cache.partnersLoadedAt = Date.now()
    } catch (e) {
      if (window.Logger) Logger.warn('[VPIService] loadPartners:', e.message || e)
    }
    return _cache.partners
  }

  function getPartnersSorted(sort) {
    var arr = (_cache.partners || []).slice()
    switch (sort) {
      case 'name':   return arr.sort(function (a, b) { return (a.nome || '').localeCompare(b.nome || '', 'pt-BR') })
      case 'recent': return arr.sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0) })
      case 'oldest': return arr.sort(function (a, b) { return new Date(a.created_at || 0) - new Date(b.created_at || 0) })
      default:       return arr.sort(function (a, b) { return (b.creditos_total || 0) - (a.creditos_total || 0) })
    }
  }

  function getActivePartners() {
    return (_cache.partners || []).filter(function (p) { return p.status !== 'inativo' })
  }

  function findPartnerByPhone(phone) {
    var d = _onlyDigits(phone)
    if (!d) return null
    return (_cache.partners || []).find(function (p) { return _onlyDigits(p.phone) === d }) || null
  }

  function findPartnerByLeadId(leadId) {
    if (!leadId) return null
    return (_cache.partners || []).find(function (p) { return p.lead_id === leadId }) || null
  }

  async function upsertPartner(data) {
    var id = await _repo().partners.upsert(data)
    invalidatePartners()
    await loadPartners({ force: true })
    return id
  }

  function invalidatePartners() {
    _cache.partnersLoadedAt = 0
  }

  function invalidate() {
    _cache.partnersLoadedAt  = 0
    _cache.tiersLoadedAt     = 0
    _cache.templateLoadedAt  = 0
    _cache.kpis              = null
  }

  // ── Tiers ────────────────────────────────────────────────
  async function loadTiers(force) {
    if (!force && _cache.tiers.length && _isFresh(_cache.tiersLoadedAt)) {
      return _cache.tiers
    }
    try {
      var list = await _repo().tiers.list()
      _cache.tiers         = Array.isArray(list) ? list : []
      _cache.tiersLoadedAt = Date.now()
    } catch (e) {
      if (window.Logger) Logger.warn('[VPIService] loadTiers:', e.message || e)
    }
    return _cache.tiers
  }

  function getTiers() { return (_cache.tiers || []).slice() }

  async function upsertTier(data) {
    var id = await _repo().tiers.upsert(data)
    _cache.tiersLoadedAt = 0
    await loadTiers(true)
    return id
  }

  async function deleteTier(id) {
    var ok = await _repo().tiers.delete(id)
    _cache.tiersLoadedAt = 0
    await loadTiers(true)
    return ok
  }

  // ── Template WA Convite ──────────────────────────────────
  async function getInviteTemplate() {
    if (_cache.template && _isFresh(_cache.templateLoadedAt)) return _cache.template
    try {
      var tpl = await _repo().getAutomationTemplate('vpi_convite_parceiro')
      _cache.template         = tpl
      _cache.templateLoadedAt = Date.now()
    } catch (e) { _cache.template = null }
    return _cache.template
  }

  function renderTemplate(str, vars) {
    if (!str) return ''
    vars = vars || {}
    return String(str).replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (_, k) {
      return (vars[k] !== undefined && vars[k] !== null) ? String(vars[k]) : ''
    })
  }

  // ── KPIs ─────────────────────────────────────────────────
  async function loadKpis() {
    try {
      _cache.kpis = await _repo().kpis()
    } catch (e) {
      if (window.Logger) Logger.warn('[VPIService] loadKpis:', e.message || e)
      _cache.kpis = _cache.kpis || { parceiros_ativos: 0, indicacoes_mes: 0, recompensas_liberadas: 0, taxa_conversao: 0 }
    }
    return _cache.kpis
  }

  window.VPIService = {
    loadPartners:         loadPartners,
    getPartnersSorted:    getPartnersSorted,
    getActivePartners:    getActivePartners,
    findPartnerByPhone:   findPartnerByPhone,
    findPartnerByLeadId:  findPartnerByLeadId,
    upsertPartner:        upsertPartner,
    invalidatePartners:   invalidatePartners,
    invalidate:           invalidate,
    loadTiers:            loadTiers,
    getTiers:             getTiers,
    upsertTier:           upsertTier,
    deleteTier:           deleteTier,
    getInviteTemplate:    getInviteTemplate,
    renderTemplate:       renderTemplate,
    loadKpis:             loadKpis,
  }
})()
