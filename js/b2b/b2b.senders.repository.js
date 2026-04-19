/**
 * ClinicAI — B2B Senders Repository
 *
 * I/O puro da whitelist de parceiros autorizados a emitir voucher pela Mira.
 * Zero DOM. Expõe window.B2BSendersRepository.
 */
;(function () {
  'use strict'
  if (window.B2BSendersRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }

  function _last8(phone) {
    return String(phone || '').replace(/\D/g, '').slice(-8)
  }

  async function list(partnershipId) {
    var r = await _sb().from('b2b_partnership_wa_senders')
      .select('id, phone, phone_last8, role, active, created_at')
      .eq('partnership_id', partnershipId)
      .order('created_at', { ascending: false })
    if (r.error) throw new Error(r.error.message)
    return Array.isArray(r.data) ? r.data : []
  }

  async function create(payload) {
    var phone = String(payload.phone || '').trim()
    if (!phone) throw new Error('Telefone obrigatório')
    if (phone.replace(/\D/g, '').length < 10) throw new Error('Telefone inválido')

    var r = await _sb().from('b2b_partnership_wa_senders')
      .insert({
        partnership_id: payload.partnership_id,
        phone: phone,
        role: payload.role || 'owner',
        active: true,
      })
      .select()
      .single()
    if (r.error) {
      if (String(r.error.message).includes('duplicate')) {
        throw new Error('Esse telefone já está na whitelist desta parceria')
      }
      throw new Error(r.error.message)
    }
    return r.data
  }

  async function toggleActive(id, active) {
    var r = await _sb().from('b2b_partnership_wa_senders')
      .update({ active: !!active })
      .eq('id', id)
    if (r.error) throw new Error(r.error.message)
    return { ok: true }
  }

  async function remove(id) {
    var r = await _sb().from('b2b_partnership_wa_senders')
      .delete()
      .eq('id', id)
    if (r.error) throw new Error(r.error.message)
    return { ok: true }
  }

  // Busca global: quem já está whitelisted em qual parceria
  async function lookupByPhone(phone) {
    var r = await _sb().rpc('b2b_wa_sender_lookup', { p_phone: phone })
    if (r.error) throw new Error(r.error.message)
    return r.data
  }

  window.B2BSendersRepository = Object.freeze({
    list: list,
    create: create,
    toggleActive: toggleActive,
    remove: remove,
    lookupByPhone: lookupByPhone,
    _last8: _last8,
  })
})()
