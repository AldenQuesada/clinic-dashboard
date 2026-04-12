/**
 * ClinicAI — Templates Repository
 *
 * Acesso puro ao Supabase para templates de mensagem WhatsApp.
 * Zero logica de negocio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   wa_templates_list()
 *   wa_template_update(p_id, p_content, p_is_active)
 *
 * Depende de:
 *   window._sbShared — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiTemplatesRepoLoaded) return
  window._clinicaiTemplatesRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) nao inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null } }
  function _err(error) { return { ok: false, data: null, error } }

  // ── Listar todos os templates ─────────────────────────────────

  async function list() {
    try {
      const { data, error } = await _sb().rpc('wa_templates_list')
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data?.data ?? data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Atualizar template ────────────────────────────────────────

  async function update(id, content, isActive, extras) {
    try {
      var params = { p_id: id, p_content: content, p_is_active: isActive }
      if (extras && extras.day !== undefined) params.p_day = extras.day
      if (extras && extras.category) params.p_category = extras.category
      if (extras && extras.name) params.p_name = extras.name
      if (extras && extras.metadata) params.p_metadata = extras.metadata
      const { data, error } = await _sb().rpc('wa_template_update', params)
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Criar template ──────────────────────────────────────────

  async function create(tpl) {
    try {
      const { data, error } = await _sb().from('wa_message_templates').insert({
        clinic_id: '00000000-0000-0000-0000-000000000001',
        slug:      tpl.slug,
        name:      tpl.name,
        category:  tpl.category || 'geral',
        content:   tpl.content || '',
        type:      tpl.type || '',
        day:       tpl.day || null,
        is_active: tpl.is_active !== false,
        active:    tpl.is_active !== false,
        sort_order: tpl.sort_order || 50,
      }).select().single()
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Deletar template ─────────────────────────────────────────

  async function remove(id) {
    try {
      const { error } = await _sb().from('wa_message_templates').delete().eq('id', id)
      if (error) return _err(error.message || String(error))
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposicao global ──────────────────────────────────────────
  window.TemplatesRepository = Object.freeze({
    list,
    update,
    create,
    remove,
  })

})()
