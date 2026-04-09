/**
 * ClinicAI — Legal Documents Service
 *
 * Gerencia templates, requests e assinaturas de documentos legais.
 * Renderiza variaveis do paciente/profissional nos templates.
 *
 * Depende de:
 *   window._sbShared      — Supabase client
 *   getRooms()            — cache de salas
 *   getProfessionals()    — cache de profissionais
 */
;(function () {
  'use strict'

  if (window._clinicaiLegalDocsLoaded) return
  window._clinicaiLegalDocsLoaded = true

  var _templates = null
  var _baseUrl = ''

  // ── Detectar base URL do dashboard ─────────────────────────
  function _getBaseUrl() {
    if (_baseUrl) return _baseUrl
    _baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/')
    return _baseUrl
  }

  // ── Render template com variaveis ──────────────────────────
  function renderTemplate(content, vars) {
    if (!content) return ''
    return content.replace(/\{\{(\w+)\}\}/g, function (_, key) {
      return vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : ''
    })
  }

  // ── Construir variaveis a partir de appointment + profissional
  function buildVars(opts) {
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var prof = null
    if (opts.profissionalIdx !== undefined && profs[opts.profissionalIdx]) {
      prof = profs[opts.profissionalIdx]
    } else if (opts.professional_id) {
      prof = profs.find(function (p) { return p.id === opts.professional_id })
    }

    var clinicName = ''
    if (window._getClinicaNome) clinicName = _getClinicaNome()
    else if (window.ClinicEnv && ClinicEnv.CLINIC_NAME) clinicName = ClinicEnv.CLINIC_NAME

    // Dados da clinica
    var clinicData = {}
    try { clinicData = JSON.parse(localStorage.getItem('clinicai_clinic_data') || '{}') } catch (e) {}

    // Endereco paciente (se disponivel no lead)
    var pacienteEndereco = opts.endereco || opts.patient_address || ''
    if (!pacienteEndereco && opts.data && opts.data.endereco) pacienteEndereco = opts.data.endereco

    return {
      nome:                    opts.pacienteNome || opts.patient_name || '',
      cpf:                     opts.pacienteCpf || opts.patient_cpf || '',
      data:                    new Date().toLocaleDateString('pt-BR'),
      data_extenso:            _dataExtenso(),
      profissional:            prof ? (prof.display_name || prof.nome || '') : (opts.profissionalNome || opts.professional_name || ''),
      registro_profissional:   prof ? (prof.crm || '') : '',
      especialidade:           prof ? (prof.specialty || prof.cargo || '') : '',
      procedimento:            opts.procedimento || opts.procedure_name || '',
      clinica:                 clinicName,
      hora:                    opts.horaInicio || opts.start_time || '',
      cnpj:                    clinicData.cnpj || '',
      endereco_clinica:        clinicData.endereco || '',
      endereco_paciente:       pacienteEndereco,
    }
  }

  function _dataExtenso() {
    var d = new Date()
    var meses = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
    return d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear()
  }

  // ══════════════════════════════════════════════════════════
  //  TEMPLATES
  // ══════════════════════════════════════════════════════════

  async function loadTemplates() {
    if (!window._sbShared) return []
    var res = await window._sbShared.rpc('legal_doc_list_templates', {})
    if (res.data && res.data.ok) {
      _templates = res.data.data || []
      return _templates
    }
    return []
  }

  function getTemplates() { return _templates || [] }

  async function saveTemplate(data) {
    if (!window._sbShared) return { ok: false, error: 'Supabase nao disponivel' }
    var res = await window._sbShared.rpc('legal_doc_upsert_template', {
      p_id: data.id || null,
      p_slug: data.slug || null,
      p_name: data.name,
      p_doc_type: data.doc_type || 'custom',
      p_content: data.content,
      p_variables: data.variables || null,
      p_is_active: data.is_active !== false,
      p_trigger_status: data.trigger_status || null,
      p_trigger_procedures: data.trigger_procedures || null,
    })
    if (res.error) return { ok: false, error: res.error.message }
    if (res.data && !res.data.ok) return { ok: false, error: res.data.error || 'Erro desconhecido' }
    return { ok: true, id: res.data ? res.data.id : null }
  }

  // ══════════════════════════════════════════════════════════
  //  REQUESTS (gerar documento para paciente)
  // ══════════════════════════════════════════════════════════

  async function createRequest(templateId, apptOrOpts) {
    if (!window._sbShared) return { ok: false, error: 'Supabase nao disponivel' }

    // Carregar template se necessario
    if (!_templates) await loadTemplates()
    var tmpl = (_templates || []).find(function (t) { return t.id === templateId })
    if (!tmpl) return { ok: false, error: 'Template nao encontrado' }

    // Construir variaveis
    var vars = buildVars(apptOrOpts)

    // Renderizar snapshot
    var snapshot = renderTemplate(tmpl.content, vars)

    var res = await window._sbShared.rpc('legal_doc_create_request', {
      p_template_id: templateId,
      p_patient_id: apptOrOpts.patient_id || apptOrOpts.id || null,
      p_patient_name: vars.nome,
      p_patient_cpf: vars.cpf || null,
      p_patient_phone: apptOrOpts.pacienteTelefone || apptOrOpts.patient_phone || null,
      p_appointment_id: apptOrOpts.appointmentId || apptOrOpts.appointment_id || null,
      p_professional_name: vars.profissional,
      p_professional_reg: vars.registro_profissional || null,
      p_professional_spec: vars.especialidade || null,
      p_content_snapshot: snapshot,
      p_expires_hours: 48,
    })

    if (res.error) return { ok: false, error: res.error.message }
    if (res.data && !res.data.ok) return { ok: false, error: res.data.error || 'Erro' }

    var slug = res.data.slug
    var token = res.data.token
    var link = _getBaseUrl() + 'legal-document.html#slug=' + slug + '&token=' + token

    return { ok: true, id: res.data.id, slug: slug, token: token, link: link }
  }

  // ── Listar requests ────────────────────────────────────────
  async function listRequests(opts) {
    if (!window._sbShared) return { ok: false }
    opts = opts || {}
    var res = await window._sbShared.rpc('legal_doc_list_requests', {
      p_patient_id: opts.patient_id || null,
      p_appointment_id: opts.appointment_id || null,
      p_status: opts.status || null,
      p_limit: opts.limit || 50,
    })
    if (res.error) return { ok: false, error: res.error.message }
    if (res.data && res.data.ok) return { ok: true, data: res.data.data || [] }
    return { ok: false }
  }

  // ── Revogar ────────────────────────────────────────────────
  async function revokeRequest(id) {
    if (!window._sbShared) return { ok: false }
    var res = await window._sbShared.rpc('legal_doc_revoke', { p_id: id })
    if (res.error) return { ok: false, error: res.error.message }
    return { ok: true }
  }

  // ══════════════════════════════════════════════════════════
  //  CONVENIENCE: criar e obter link em um passo
  // ══════════════════════════════════════════════════════════

  async function generateLink(templateSlugOrId, apptOrOpts) {
    if (!_templates) await loadTemplates()

    var tmpl = (_templates || []).find(function (t) {
      return t.id === templateSlugOrId || t.slug === templateSlugOrId
    })
    if (!tmpl) return { ok: false, error: 'Template "' + templateSlugOrId + '" nao encontrado' }

    return createRequest(tmpl.id, apptOrOpts)
  }

  // ══════════════════════════════════════════════════════════
  //  AUTO-SEND: gerar docs automaticamente por status/procedimento
  // ══════════════════════════════════════════════════════════

  async function autoSendForStatus(status, apptOrOpts) {
    if (!_templates) await loadTemplates()
    var matching = (_templates || []).filter(function (t) {
      if (!t.is_active || !t.trigger_status) return false
      if (t.trigger_status !== status) return false
      // Se tem trigger_procedures, verificar match
      if (t.trigger_procedures && t.trigger_procedures.length > 0) {
        var proc = (apptOrOpts.procedimento || apptOrOpts.procedure_name || '').toLowerCase()
        var match = t.trigger_procedures.some(function (p) { return proc.indexOf(p.toLowerCase()) >= 0 })
        if (!match) return false
      }
      return true
    })

    if (!matching.length) return []

    var results = []
    for (var i = 0; i < matching.length; i++) {
      var res = await createRequest(matching[i].id, apptOrOpts)
      results.push({ template: matching[i].name, ok: res.ok, link: res.link, error: res.error })

      if (res.ok && window._showToast) {
        _showToast('Documento', matching[i].name + ' gerado para ' + (apptOrOpts.pacienteNome || ''), 'success')
      }
    }
    return results
  }

  // ── Public API ─────────────────────────────────────────────
  window.LegalDocumentsService = Object.freeze({
    loadTemplates:    loadTemplates,
    getTemplates:     getTemplates,
    saveTemplate:     saveTemplate,
    createRequest:    createRequest,
    listRequests:     listRequests,
    revokeRequest:    revokeRequest,
    generateLink:     generateLink,
    autoSendForStatus: autoSendForStatus,
    renderTemplate:   renderTemplate,
    buildVars:        buildVars,
  })
})()
