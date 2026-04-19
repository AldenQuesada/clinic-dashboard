/**
 * ClinicAI — B2B Voucher WA Templates Repository
 *
 * CRUD direto na tabela b2b_voucher_wa_templates + preview via RPC.
 * Soft delete (active = false).
 * Expõe window.B2BTemplateRepository.
 */
;(function () {
  'use strict'
  if (window.B2BTemplateRepository) return

  var TABLE = 'b2b_voucher_wa_templates'

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }

  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  /**
   * Lista templates ativos.
   * Se partnershipId vier, inclui:
   *   - templates da partnership (scope=partnership)
   *   - templates globais (scope=global)
   * Ordena partnership primeiro, depois default global, depois resto.
   * Sem partnershipId: só globais.
   */
  async function list(partnershipId) {
    var q = _sb()
      .from(TABLE)
      .select('id, scope, partnership_id, name, body, is_default, active, created_at, updated_at')
      .eq('active', true)

    if (partnershipId) {
      // Escapa string pra or — partnership OR global
      q = q.or('partnership_id.eq.' + partnershipId + ',scope.eq.global')
    } else {
      q = q.eq('scope', 'global')
    }

    var r = await q.order('is_default', { ascending: false }).order('created_at', { ascending: true })
    if (r.error) throw new Error('[templates.list] ' + r.error.message)

    var rows = r.data || []
    // Reordena: partnership primeiro, depois global default, depois globais
    rows.sort(function (a, b) {
      var ra = a.partnership_id ? 0 : (a.is_default ? 1 : 2)
      var rb = b.partnership_id ? 0 : (b.is_default ? 1 : 2)
      if (ra !== rb) return ra - rb
      return new Date(a.created_at) - new Date(b.created_at)
    })
    return rows
  }

  /**
   * UPSERT manual: se payload.id existe → UPDATE; senão INSERT.
   * Normaliza campos obrigatórios.
   */
  async function upsert(payload) {
    payload = payload || {}
    if (!payload.name || !String(payload.name).trim()) {
      throw new Error('name é obrigatório')
    }
    if (!payload.body || !String(payload.body).trim()) {
      throw new Error('body é obrigatório')
    }
    var scope = payload.scope === 'partnership' ? 'partnership' : 'global'
    if (scope === 'partnership' && !payload.partnership_id) {
      throw new Error('partnership_id é obrigatório quando scope=partnership')
    }

    var row = {
      scope:          scope,
      partnership_id: scope === 'partnership' ? payload.partnership_id : null,
      name:           String(payload.name).trim(),
      body:           String(payload.body),
      is_default:     !!payload.is_default,
      active:         true,
    }

    var sb = _sb()
    var r
    if (payload.id) {
      r = await sb.from(TABLE).update(row).eq('id', payload.id).select().single()
    } else {
      r = await sb.from(TABLE).insert(row).select().single()
    }
    if (r.error) throw new Error('[templates.upsert] ' + r.error.message)
    return r.data
  }

  /**
   * Soft delete: active = false.
   */
  async function remove(id) {
    if (!id) throw new Error('id é obrigatório')
    var r = await _sb().from(TABLE).update({ active: false }).eq('id', id).select().single()
    if (r.error) throw new Error('[templates.delete] ' + r.error.message)
    return r.data
  }

  /**
   * Preview: se voucherId vier, chama RPC real de composição.
   * Sem voucherId, substitui placeholders com mocks client-side usando o body
   * do template passado (para preview ao vivo enquanto edita).
   */
  async function preview(templateOrId, voucherId) {
    // Se veio só o id + voucherId, busca composição real
    if (voucherId && typeof templateOrId === 'string') {
      var r = await _rpc('b2b_voucher_compose_message', {
        p_voucher_id: voucherId,
        p_link_base:  window.location.origin,
      })
      return r
    }

    // Preview local com mocks
    var body = typeof templateOrId === 'string'
      ? templateOrId
      : (templateOrId && templateOrId.body) || ''
    return _previewMock(body)
  }

  function _previewMock(body) {
    var mocks = {
      '{nome}':           'Maria',
      '{parceiro}':       'Cazza Flor',
      '{combo}':          'Veu Noiva e Anovator',
      '{validade_dias}':  '30',
      '{link}':           (window.location.origin || 'https://clinica.com') + '/voucher.html?t=test',
      '{mirian}':         'Mirian de Paula',
    }
    var out = String(body || '')
    Object.keys(mocks).forEach(function (k) {
      out = out.split(k).join(mocks[k])
    })
    return { ok: true, message: out, preview_mock: true }
  }

  window.B2BTemplateRepository = Object.freeze({
    list:    list,
    upsert:  upsert,
    delete:  remove,
    preview: preview,
  })
})()
