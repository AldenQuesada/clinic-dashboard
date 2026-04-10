/**
 * ClinicAI — Inbox Service
 *
 * Camada de negocio para o modulo Inbox (WhatsApp).
 * Orquestra chamadas ao InboxRepository e disparo de mensagens
 * via Evolution API.
 *
 * Depende de:
 *   InboxRepository  (inbox.repository.js)
 *
 * API publica (window.InboxService):
 *   loadInbox()
 *   loadConversation(id)
 *   assumeConversation(id)
 *   releaseConversation(id)
 *   sendMessage(id, content)
 *   resolveConversation(id)
 */

;(function () {
  'use strict'

  if (window._clinicaiInboxServiceLoaded) return
  window._clinicaiInboxServiceLoaded = true

  // ── Evolution API config ──────────────────────────────────────

  const EVOLUTION_URL      = 'https://evolution.aldenquesada.site'
  const EVOLUTION_KEY      = '429683C4C977415CAAFCCE10F7D57E11'
  const EVOLUTION_INSTANCE = 'Mih'

  // ── Helpers ───────────────────────────────────────────────────

  function _repo() { return window.InboxRepository || null }

  async function _logError(source, errorType, phone, content, errorMsg) {
    try {
      var url = (window.ClinicEnv?.SUPABASE_URL || '') + '/rest/v1/rpc/wa_log_error'
      var key = window.ClinicEnv?.SUPABASE_KEY || ''
      await fetch(url, {
        method: 'POST',
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_source: source,
          p_error_type: errorType,
          p_phone: phone || null,
          p_payload: content ? { content: String(content).substring(0, 200) } : null,
          p_error_msg: String(errorMsg || '').substring(0, 500)
        })
      })
    } catch (e) { console.error('[InboxService] Falha ao logar erro:', e.message) }
  }

  async function _sendEvolution(phone, content) {
    try {
      const r = await fetch(EVOLUTION_URL + '/message/sendText/' + EVOLUTION_INSTANCE, {
        method: 'POST',
        headers: {
          'apikey': EVOLUTION_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number: phone, text: content }),
      })
      if (!r.ok) {
        const e = await r.text()
        console.warn('[InboxService] Evolution API error:', e)
        return { ok: false, error: e }
      }
      const data = await r.json()
      return { ok: true, data }
    } catch (e) {
      console.warn('[InboxService] Evolution API exception:', e.message)
      return { ok: false, error: e.message }
    }
  }

  // ── Public API ────────────────────────────────────────────────

  async function loadInbox() {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.list()
  }

  async function loadConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.getConversation(id)
  }

  async function assumeConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.assume(id)
  }

  async function releaseConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.release(id)
  }

  async function sendMessage(id, content) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }

    const result = await repo.send(id, content)
    if (!result.ok) return result

    // Dispara mensagem via Evolution API
    const phone = result.data?.phone || result.data?.remoteJid || null
    if (phone) {
      const evoResult = await _sendEvolution(phone, content)
      if (!evoResult.ok) {
        // Marcar como falha no banco
        var msgId = result.data?.message_id
        if (msgId && repo.updateMessageStatus) {
          await repo.updateMessageStatus(msgId, 'failed')
        }
        // Logar erro
        _logError('inbox_send', 'evolution_failed', phone, content, evoResult.error)
        return { ok: true, data: result.data, sendFailed: true, sendError: evoResult.error }
      }
      // Marcar como enviado
      var msgId2 = result.data?.message_id
      if (msgId2 && repo.updateMessageStatus) {
        await repo.updateMessageStatus(msgId2, 'sent')
      }
    } else {
      console.warn('[InboxService] Sem telefone no resultado RPC, Evolution API nao chamada')
      return { ok: true, data: result.data, sendFailed: true, sendError: 'Telefone nao encontrado' }
    }

    return result
  }

  async function resolveConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.resolve(id)
  }

  async function archiveConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.archive(id)
  }

  async function reopenConversation(id) {
    const repo = _repo()
    if (!repo) return { ok: false, data: null, error: 'InboxRepository nao disponivel' }
    return repo.reopen(id)
  }

  // ── Expose ────────────────────────────────────────────────────

  window.InboxService = Object.freeze({
    loadInbox,
    loadConversation,
    assumeConversation,
    releaseConversation,
    sendMessage,
    sendText: _sendEvolution,
    resolveConversation,
    archiveConversation,
    reopenConversation,
  })
})()
