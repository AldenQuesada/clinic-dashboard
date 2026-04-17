/**
 * ClinicAI - VPIRepository
 *
 * Acesso direto ao Supabase para o Programa de Indicacao.
 * Nao contem regras de negocio - so chamadas RPC.
 *
 * Expoe window.VPIRepository com:
 *   partners.list(search, sort)   - vpi_partner_list
 *   partners.get(id)              - vpi_partner_get
 *   partners.upsert(data)         - vpi_partner_upsert
 *
 *   indications.create(partnerId, leadId, apptId)
 *   indications.close(leadId, apptId, procedimento, isFullFace)
 *
 *   tiers.list()                  - vpi_tier_list
 *   tiers.upsert(data)            - vpi_tier_upsert
 *   tiers.delete(id)              - vpi_tier_delete
 *
 *   kpis()                        - vpi_kpis
 *   highPerfCheck()               - vpi_high_performance_check
 *   getAutomationTemplate(slug)   - busca template por slug em wa_agenda_automations
 */
;(function () {
  'use strict'

  if (window._vpiRepositoryLoaded) return
  window._vpiRepositoryLoaded = true

  function _sb() { return window._sbShared || null }

  async function _rpc(name, args) {
    var sb = _sb()
    if (!sb) throw new Error('Supabase client indisponivel')
    var res = await sb.rpc(name, args || {})
    if (res.error) throw new Error('[VPIRepository] ' + name + ': ' + res.error.message)
    return res.data
  }

  var VPIRepository = {
    // ── Partners ──────────────────────────────
    partners: {
      async list(search, sort) {
        return await _rpc('vpi_partner_list', {
          p_search: search || null,
          p_sort:   sort   || 'ranking',
        }) || []
      },
      async get(id) {
        return await _rpc('vpi_partner_get', { p_id: id })
      },
      async upsert(data) {
        return await _rpc('vpi_partner_upsert', { p_data: data || {} })
      },
    },

    // ── Indications ───────────────────────────
    indications: {
      async create(partnerId, leadId, apptId) {
        return await _rpc('vpi_indication_create', {
          p_partner_id: partnerId,
          p_lead_id:    String(leadId || ''),
          p_appt_id:    apptId ? String(apptId) : null,
        })
      },
      async close(leadId, apptId, procedimento, isFullFace) {
        return await _rpc('vpi_indication_close', {
          p_lead_id:      String(leadId || ''),
          p_appt_id:      apptId ? String(apptId) : null,
          p_procedimento: procedimento || null,
          p_is_full_face: !!isFullFace,
        })
      },
    },

    // ── Tiers ─────────────────────────────────
    tiers: {
      async list()       { return (await _rpc('vpi_tier_list')) || [] },
      async upsert(data) { return await _rpc('vpi_tier_upsert', { p_data: data || {} }) },
      async delete(id)   { return await _rpc('vpi_tier_delete', { p_id: id }) },
    },

    // ── KPIs / Check ──────────────────────────
    async kpis()          { return await _rpc('vpi_kpis') || {} },
    async highPerfCheck() { return await _rpc('vpi_high_performance_check') || {} },

    // ── Convite template WA (busca direta em wa_agenda_automations) ──
    async getAutomationTemplate(slug) {
      var sb = _sb()
      if (!sb) return null
      try {
        var res = await sb
          .from('wa_agenda_automations')
          .select('id, name, content_template, is_active')
          .eq('slug', slug)
          .limit(1)
        if (res.error) return null
        return (res.data && res.data[0]) || null
      } catch (e) { return null }
    },
  }

  window.VPIRepository = VPIRepository
})()
