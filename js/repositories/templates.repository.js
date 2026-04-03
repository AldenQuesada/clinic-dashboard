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

  async function update(id, content, isActive) {
    try {
      const { data, error } = await _sb().rpc('wa_template_update', {
        p_id:        id,
        p_content:   content,
        p_is_active: isActive,
      })
      if (error) return _err(error.message || String(error))
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposicao global ──────────────────────────────────────────
  window.TemplatesRepository = Object.freeze({
    list,
    update,
  })

})()
