/**
 * ClinicAI — Mira Service
 *
 * Orquestrador da Mira: recebe mensagem do profissional, autentica,
 * detecta intent (regex Tier 1 + Claude Haiku Tier 2 fallback),
 * chama RPC apropriada, formata resposta.
 *
 * MODULAR: deps so de MiraRepository. Zero acoplamento com Lara.
 *
 * Tier 1 (regex puro): handles 80% das queries comuns instantaneo, R$ 0
 * Tier 2 (Claude Haiku): so quando regex nao bate, ~R$ 0.001/query
 */
;(function () {
  'use strict'
  if (window._clinicaiMiraSvcLoaded) return
  window._clinicaiMiraSvcLoaded = true

  function _repo() { return window.MiraRepository || null }

  // ── Intent Parser Tier 1: regex ───────────────────────────

  var INTENT_PATTERNS = [
    // HELP
    { intent: 'help',           re: /^\s*(\/?ajuda|\/?help|comandos|menu|opcoes|opções)\s*$/i },
    { intent: 'greeting',       re: /^\s*(oi|ola|olá|bom dia|boa tarde|boa noite|hey|hello|e ai)\s*[!?.]*\s*$/i },

    // AGENDA
    { intent: 'agenda_today',   re: /(agenda|horario|atendimento).*(hoje|do dia)|tenho hoje|tenho agenda hoje|quem.*hoje/i },
    { intent: 'agenda_tomorrow',re: /(agenda|horario|atendimento).*(amanha|amanhã)|tenho amanha|tenho amanhã/i },
    { intent: 'agenda_week',    re: /(agenda|horario).*(semana|esta semana)|minha semana/i },
    { intent: 'agenda_free',    re: /(horario|horarios).*(livre|livres|disponivel|disponiveis|vazio)|tem horario|esta livre/i },

    // PACIENTES
    { intent: 'patient_lookup', re: /(paciente|cliente|quem e|quem é).*([A-Z][a-z]+)/i },
    { intent: 'patient_phone',  re: /(telefone|contato|whats|whatsapp).*(de|do|da)\s+([A-Z][a-z]+)/i },
    { intent: 'patient_balance',re: /(quanto|saldo|deve|devendo).*([A-Z][a-z]+)/i },

    // FINANCEIRO
    { intent: 'finance_revenue',re: /(faturei|faturamento|receita|fatura|recebi).*(hoje|semana|mes|mês)/i },
    { intent: 'finance_commission', re: /(minha\s+)?comissao|comissão|quanto\s+ganhei/i },
    { intent: 'finance_coverage',   re: /cobertura|fixo|gasto fixo|cobrir.*despesa/i },
    { intent: 'finance_meta',   re: /(minha\s+)?meta|atingindo.*meta|bati.*meta/i },
  ]

  function parseIntent(text) {
    if (!text) return { intent: 'unknown', confidence: 0 }
    var t = String(text).trim()

    for (var i = 0; i < INTENT_PATTERNS.length; i++) {
      var p = INTENT_PATTERNS[i]
      var match = t.match(p.re)
      if (match) {
        return {
          intent: p.intent,
          confidence: 1.0,
          tier: 'regex',
          match: match,
          text: t,
        }
      }
    }

    return { intent: 'unknown', confidence: 0, tier: 'none', text: t }
  }

  // ── Formatador de respostas (WhatsApp markdown) ───────────

  function _bold(s) { return '*' + s + '*' }
  function _line() { return '─────────────' }

  function formatHelp(profName) {
    return ''
      + 'Oi ' + (profName || 'Doutor(a)') + '! 👋\n\n'
      + 'Tenho 4 areas de informacao:\n'
      + '📋 ' + _bold('/pacientes')  + '  — busca, saldo, historico\n'
      + '📅 ' + _bold('/agenda')     + '     — sua agenda, horarios livres\n'
      + '💰 ' + _bold('/financeiro') + ' — receita, comissao, cobertura\n'
      + '❓ ' + _bold('/ajuda')      + '      — todos os comandos\n\n'
      + 'Pode me perguntar em portugues normal, sem comando.'
  }

  function formatGreeting(profName) {
    return 'Oi ' + (profName || 'Doutor(a)') + '! Sou a Mira, sua assistente. Diga ' + _bold('/ajuda') + ' pra ver o que posso fazer.'
  }

  function formatUnknown() {
    return ''
      + '🤔 Nao entendi, mas estou aprendendo!\n\n'
      + 'Por enquanto eu entendo perguntas como:\n'
      + '• "tenho agenda hoje?"\n'
      + '• "quanto faturei essa semana?"\n'
      + '• "qual minha comissao do mes?"\n'
      + '• "quem e a Maria Silva?"\n\n'
      + 'Digite ' + _bold('/ajuda') + ' pra mais comandos.'
  }

  function formatNotImplemented(intent) {
    return ''
      + '⏳ Ja entendi voce — intent: ' + _bold(intent) + '\n\n'
      + 'Essa consulta esta sendo construida na proxima fase do sprint da Mira. '
      + 'Por enquanto so reconheco. Em breve ja estarei respondendo.'
  }

  function formatRateLimited(count, max) {
    return ''
      + '⛔ Voce atingiu o limite de ' + max + ' queries por dia (' + count + '/' + max + ').\n\n'
      + 'O contador zera automatico amanha. Se for urgente, peca ao admin pra liberar.'
  }

  function formatUnauthorized() {
    return '🚫 Numero nao autorizado. Peca ao admin pra cadastrar voce na lista de profissionais Mira.'
  }

  // ── Orquestrador principal ────────────────────────────────

  /**
   * handleMessage(phone, text) → { ok, response, intent, ms }
   * Funciona em dois modos:
   *   - Real: validacao + auth + rate limit + log
   *   - Test: bypass auth se opts.bypassAuth=true
   */
  async function handleMessage(phone, text, opts) {
    opts = opts || {}
    var startedAt = Date.now()

    if (!text || !String(text).trim()) {
      return { ok: false, response: 'Mensagem vazia', intent: 'empty' }
    }

    var repo = _repo()
    if (!repo) {
      return { ok: false, response: 'MiraRepository nao disponivel', intent: 'error' }
    }

    var prof = null
    var waNumberId = null

    // 1. Autenticacao
    if (!opts.bypassAuth) {
      var authRes = await repo.authenticate(phone)
      if (!authRes.ok || !authRes.data || !authRes.data.ok) {
        return {
          ok: false,
          response: formatUnauthorized(),
          intent: 'unauthorized',
          ms: Date.now() - startedAt,
        }
      }
      prof = {
        id:           authRes.data.professional_id,
        name:         authRes.data.name,
        access_scope: authRes.data.access_scope,
      }
      waNumberId = authRes.data.wa_number_id

      // 2. Rate limit
      var rlRes = await repo.checkRateLimit(prof.id)
      if (!rlRes.ok || !rlRes.data || !rlRes.data.ok) {
        var rl = (rlRes && rlRes.data) || {}
        return {
          ok: false,
          response: formatRateLimited(rl.count || 0, rl.max || 50),
          intent: 'rate_limited',
          ms: Date.now() - startedAt,
        }
      }
    } else {
      prof = opts.testProfessional || { id: null, name: 'Tester', access_scope: 'full' }
    }

    // 3. Parse intent (Tier 1: regex)
    var parsed = parseIntent(text)

    // 4. Roteamento de respostas
    var response = ''
    switch (parsed.intent) {
      case 'help':
        response = formatHelp(prof.name)
        break
      case 'greeting':
        response = formatGreeting(prof.name)
        break
      case 'agenda_today':
      case 'agenda_tomorrow':
      case 'agenda_week':
      case 'agenda_free':
      case 'patient_lookup':
      case 'patient_phone':
      case 'patient_balance':
      case 'finance_revenue':
      case 'finance_commission':
      case 'finance_coverage':
      case 'finance_meta':
        // Tier 1 reconheceu mas a fase de execucao ainda nao foi codada
        response = formatNotImplemented(parsed.intent)
        break
      default:
        response = formatUnknown()
    }

    var elapsedMs = Date.now() - startedAt

    // 5. Log (sempre, se autenticado)
    if (!opts.bypassAuth && prof.id) {
      repo.logQuery({
        phone:           phone,
        professional_id: prof.id,
        wa_number_id:    waNumberId,
        query:           text,
        intent:          parsed.intent,
        response:        response,
        success:         true,
        response_ms:     elapsedMs,
      }).catch(function(e) { console.warn('[Mira] log fail:', e) })
    }

    return {
      ok: true,
      response: response,
      intent: parsed.intent,
      tier: parsed.tier,
      professional: prof,
      ms: elapsedMs,
    }
  }

  window.MiraService = Object.freeze({
    handleMessage: handleMessage,
    parseIntent:   parseIntent,
    formatHelp:    formatHelp,
    formatGreeting: formatGreeting,
    formatUnknown: formatUnknown,
    listNumbers:   function() { return _repo() ? _repo().listNumbers() : Promise.resolve({ ok: false, data: [] }) },
    registerNumber: function(p) { return _repo() ? _repo().registerNumber(p) : Promise.resolve({ ok: false }) },
  })
})()
