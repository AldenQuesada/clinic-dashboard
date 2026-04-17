/**
 * ClinicAI - VPIEngine
 *
 * Hooks publicos chamados pelo fluxo existente:
 *   VPIEngine.autoEnroll(appt)           - apos finalizar atendimento
 *   VPIEngine.closeIndication(appt)      - apos finalizar (se lead tem indicadoPor)
 *   VPIEngine.scheduleInviteWA(partner)  - agenda convite D+1 via wa_outbox
 *   VPIEngine.checkHighPerformance()     - RPC manual/cron
 *
 * Todo metodo deve ser try/catch robusto - NUNCA quebra confirmFinalize.
 *
 * Dependencias: VPIRepository, VPIService, _sbShared.
 */
;(function () {
  'use strict'

  if (window._vpiEngineLoaded) return
  window._vpiEngineLoaded = true

  function _repo() { return window.VPIRepository }
  function _svc()  { return window.VPIService }
  function _sb()   { return window._sbShared }

  function _onlyDigits(s) { return String(s || '').replace(/\D/g, '') }

  function _apptPhone(appt) {
    return _onlyDigits(
      (appt && (appt.pacienteTel || appt.telefone || appt.phone || appt.pacienteTelefone)) || ''
    )
  }

  function _apptLeadId(appt) {
    return String((appt && (appt.pacienteId || appt.patient_id || appt.leadId)) || '')
  }

  function _apptName(appt) {
    return String((appt && (appt.pacienteNome || appt.patient_name || appt.nome)) || '')
  }

  function _apptProcedimento(appt) {
    if (!appt) return ''
    var procs = appt.procedimentos || appt.procedimentosRealizados || []
    if (Array.isArray(procs) && procs.length) {
      return procs.map(function (p) { return (p && (p.nome || p)) || '' }).filter(Boolean).join(', ')
    }
    return appt.procedimento || appt.tipoConsulta || ''
  }

  function _isFullFace(appt) {
    if (!appt) return false
    if (appt.isFullFace === true || appt.full_face === true) return true
    var text = _apptProcedimento(appt).toLowerCase()
    if (/full\s*face/.test(text)) return true
    // Heuristica: total de ml de acido hialuronico >= 10
    var procs = appt.procedimentos || appt.procedimentosRealizados || []
    if (Array.isArray(procs)) {
      var mlTotal = 0
      procs.forEach(function (p) {
        if (!p) return
        var txt = String(p.nome || '').toLowerCase()
        if (/acido hialuronico|hialuronico|filler/.test(txt)) {
          var q = parseFloat(p.qtd || p.ml || 0) || 0
          var n = (String(p.nome || '').match(/(\d+(?:[.,]\d+)?)\s*ml/i) || [])[1]
          var ml = n ? parseFloat(n.replace(',', '.')) : 0
          mlTotal += (q * ml) || q || ml
        }
      })
      if (mlTotal >= 10) return true
    }
    return false
  }

  // ══════════════════════════════════════════════════
  //  autoEnroll
  // ══════════════════════════════════════════════════
  async function autoEnroll(appt) {
    try {
      if (!appt || !_svc() || !_repo()) return null
      var nome = _apptName(appt)
      var phone = _apptPhone(appt)
      if (!nome) return null

      // Carrega cache se vazio
      await _svc().loadPartners({ force: false })

      // Dedup: ja existe pelo phone ou lead_id
      var existing = (phone && _svc().findPartnerByPhone(phone))
        || _svc().findPartnerByLeadId(_apptLeadId(appt))
      if (existing) return existing

      var data = {
        lead_id:   _apptLeadId(appt) || null,
        nome:      nome,
        phone:     phone || null,
        email:     (appt.email || '') || null,
        profissao: (appt.profissao || '') || null,
        cidade:    (appt.cidade    || '') || null,
        tipo:      'paciente',
        origem:    'auto',
        // LGPD: autoEnroll cria em pending_consent ate aceite no WA.
        // O convite ainda e enviado (legitimo interesse + pede ACEITO).
        // So vira 'ativo' via vpi_grant_consent_by_phone ou vpi_admin_grant_consent.
        status:    'pending_consent',
      }

      var id = await _svc().upsertPartner(data)
      if (!id) return null

      // Agenda convite WA D+1 08:00
      await _svc().loadPartners({ force: true })
      var created = (_svc().getPartnersSorted('recent') || []).find(function (p) { return p.id === id })
      if (created) { scheduleInviteWA(created, appt).catch(function () {}) }

      if (window._showToast) {
        _showToast('VPI', nome + ' inscrita no Programa de Indicacao', 'success')
      }
      return created || { id: id }
    } catch (e) {
      console.warn('[VPIEngine] autoEnroll falhou:', e && e.message || e)
      return null
    }
  }

  // ══════════════════════════════════════════════════
  //  Helpers de link do cartao digital
  // ══════════════════════════════════════════════════
  function _cardUrl(partner) {
    // Base URL da clinica (dashboard atual)
    var base = (window.ClinicEnv && window.ClinicEnv.DASHBOARD_URL) ||
               (window.location && window.location.origin) ||
               ''
    if (!base || !partner || !partner.card_token) return ''
    // Remove trailing slash
    base = base.replace(/\/+$/, '')
    return base + '/public_embaixadora.html?token=' + encodeURIComponent(partner.card_token)
  }

  async function _ensureShortLink(partner) {
    try {
      if (!_sb() || !partner) return null
      var cardUrl = _cardUrl(partner)
      if (!cardUrl) return null

      // Slug preferencial do DB; se vazio, gera baseado no token
      var slug = partner.short_link_slug
      if (!slug) {
        var firstRaw = String(partner.nome || 'parceira').toLowerCase().split(' ')[0]
        var first = firstRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g,'')
        var tokHead = String(partner.card_token || '').slice(0,6)
        slug = 'emb-' + (first || 'parceira') + '-' + tokHead
      }

      // Tenta criar o short-link (idempotente via unique_violation=code_exists)
      var res = await _sb().rpc('short_link_create', {
        p_code:   slug,
        p_url:    cardUrl,
        p_title:  'Cartao de Embaixadora - ' + (partner.nome || ''),
        p_pixels: {},
      })
      // Se retornou erro de code_exists, tudo bem - link ja existe
      if (res && res.error) {
        console.warn('[VPIEngine] short_link_create:', res.error.message)
      }
      // Persiste slug no partner (best-effort)
      if (slug && slug !== partner.short_link_slug) {
        try {
          await _sb()
            .from('vpi_partners')
            .update({ short_link_slug: slug })
            .eq('id', partner.id)
        } catch (_) {}
      }
      var origin = (window.location && window.location.origin) || ''
      return (origin || '').replace(/\/+$/, '') + '/r.html?c=' + encodeURIComponent(slug)
    } catch (e) {
      console.warn('[VPIEngine] _ensureShortLink falhou:', e && e.message || e)
      return null
    }
  }

  // ══════════════════════════════════════════════════
  //  scheduleInviteWA
  // ══════════════════════════════════════════════════
  async function scheduleInviteWA(partner, apptRef) {
    try {
      if (!partner || !partner.phone) return null
      if (!_sb()) return null

      var tpl = null
      try { tpl = await _svc().getInviteTemplate() } catch (_) { tpl = null }
      var template = (tpl && tpl.content_template) ||
        'Ola {{nome}}! Voce foi aprovada para o Programa de Parceiros da nossa clinica. A cada 5 amigas que indicar e realizarem um procedimento, voce ganha 1 sessao de Fotona 4D. Seu cartao: {{link_cartao}}'

      // Gera/obtem short-link; fallback para URL direta se falhar
      var cardUrl  = _cardUrl(partner)
      var shortUrl = await _ensureShortLink(partner)
      var linkCartao = shortUrl || cardUrl || ''

      var firstName = String(partner.nome || 'Parceira').split(' ')[0]
      var vars = {
        nome:          firstName,
        nome_completo: partner.nome || '',
        clinica:       'Clinica Mirian de Paula Beauty & Health',
        link_cartao:   linkCartao,
      }
      var content = _svc().renderTemplate(template, vars)

      var scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      scheduledAt.setHours(8, 30, 0, 0)

      var res = await _sb().rpc('wa_outbox_schedule_automation', {
        p_phone:         partner.phone,
        p_content:       content,
        p_lead_id:       String(partner.lead_id || partner.id || ''),
        p_lead_name:     partner.nome || '',
        p_scheduled_at:  scheduledAt.toISOString(),
        p_appt_ref:      apptRef && apptRef.id ? String(apptRef.id) : null,
        p_rule_id:       (tpl && tpl.id) || null,
        p_ab_variant:    null,
        p_vars_snapshot: vars,
      })
      if (res.error) console.warn('[VPIEngine] scheduleInviteWA error:', res.error.message)

      // Atualiza convite_enviado_em no partner (best-effort)
      try {
        await _sb()
          .from('vpi_partners')
          .update({ convite_enviado_em: new Date().toISOString() })
          .eq('id', partner.id)
      } catch (_) {}

      return res && res.data
    } catch (e) {
      console.warn('[VPIEngine] scheduleInviteWA falhou:', e && e.message || e)
      return null
    }
  }

  // ══════════════════════════════════════════════════
  //  closeIndication
  // ══════════════════════════════════════════════════
  async function closeIndication(appt) {
    try {
      if (!appt || !_repo()) return null
      var leadId = _apptLeadId(appt)
      if (!leadId) return null

      var proc = _apptProcedimento(appt)
      var fullFace = _isFullFace(appt)

      var result = await _repo().indications.close(leadId, appt.id || null, proc, fullFace)

      if (result && result.ok && Array.isArray(result.tiers_liberados) && result.tiers_liberados.length) {
        var parts = result.tiers_liberados.map(function (t) { return t.threshold + ' ind -> ' + t.recompensa })
        if (window._showToast) {
          _showToast('VPI Recompensas liberadas!', parts.join(' | '), 'success')
        }
      }

      // Invalida cache para o proximo render
      if (_svc()) _svc().invalidatePartners()

      return result || null
    } catch (e) {
      console.warn('[VPIEngine] closeIndication falhou:', e && e.message || e)
      return null
    }
  }

  // ══════════════════════════════════════════════════
  //  checkHighPerformance
  // ══════════════════════════════════════════════════
  async function checkHighPerformance() {
    try {
      if (!_repo()) return null
      return await _repo().highPerfCheck()
    } catch (e) {
      console.warn('[VPIEngine] checkHighPerformance falhou:', e && e.message || e)
      return null
    }
  }

  window.VPIEngine = {
    autoEnroll:          autoEnroll,
    closeIndication:     closeIndication,
    scheduleInviteWA:    scheduleInviteWA,
    checkHighPerformance: checkHighPerformance,
    cardUrl:             _cardUrl,
    ensureShortLink:     _ensureShortLink,
  }
})()
