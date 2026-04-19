/**
 * ClinicAI — B2B Mira Router (WhatsApp B2B intent handler)
 *
 * Recebe uma mensagem de WhatsApp e retorna a resposta da Mira
 * (texto + ações a executar).
 *
 * Input POST:
 *   {
 *     phone: "5544998787673",
 *     message: "aprova cazza flor",
 *     message_id?: "wa_xxx",
 *     state?: { ... }   // estado de onboarding multi-turno
 *   }
 *
 * Output:
 *   {
 *     ok: true,
 *     reply: "texto da Mira pra enviar de volta",
 *     reply_to: "5544998787673",
 *     actions: [                  // ações paralelas (notificar, emitir, etc)
 *       { kind: "send_wa", to: "...", content: "..." },
 *       { kind: "send_voucher", phone: "...", template: "..." },
 *     ],
 *     next_state?: { ... }        // estado pra próxima mensagem (onboarding)
 *   }
 *
 * n8n / webhook chama essa edge function e despacha as actions.
 */

const _ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const _MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001'
const _SB_URL = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Admins autorizados a aprovar/rejeitar/consultar (últimos 8 dígitos)
// Evolution pode entregar com 12 ou 13 dígitos (nono dígito opcional BR),
// então aceita ambas as versões do final da Mirian.
const ADMIN_PHONES_LAST8 = ['98782003', '88782003'] // Mirian (ambos formatos)
// Telefone que recebe notificações
const NOTIFY_PHONE = '554498782003' // Mirian (como chega da Evolution)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function ok(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } })
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }),
    { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${_SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`[${name}] ${r.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

function lastDigits(phone: string, n = 8): string {
  return (phone || '').replace(/\D/g, '').slice(-n)
}
function normalize55(phone: string): string {
  const d = (phone || '').replace(/\D/g, '')
  if (d.length === 11 || d.length === 10) return '55' + d
  if (d.length === 13 || d.length === 12) return d.startsWith('55') ? d : ('55' + d.slice(-11))
  return d
}
function firstName(full: string | null | undefined): string {
  if (!full) return ''
  return String(full).trim().split(/\s+/)[0] || ''
}

function extractJson(raw: string): any {
  try { return JSON.parse(raw) } catch { /* continua */ }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) { try { return JSON.parse(fence[1]) } catch { /* continua */ } }
  const i = raw.indexOf('{'); const j = raw.lastIndexOf('}')
  if (i >= 0 && j > i) {
    try { return JSON.parse(raw.slice(i, j + 1)) } catch { /* continua */ }
  }
  return null
}

// ════════════════════════════════════════════════════════════
// Intent Classifier via Haiku
// ════════════════════════════════════════════════════════════

async function classifyIntent(message: string, userRole: string): Promise<any> {
  if (!_ANTHROPIC_KEY) {
    // Fallback regex-based simples
    return ruleBasedFallback(message, userRole)
  }

  const system =
    'Você classifica mensagens de WhatsApp B2B da Clínica Mirian de Paula. ' +
    'Retorna SOMENTE JSON válido com a estrutura especificada. ' +
    'Tom das intents é extraído literalmente da mensagem — não invente nada.'

  const user = `Usuário tem role "${userRole}" (admin|partner|unknown).
Mensagem:
"""
${message}
"""

Classifique em uma das intents:
- b2b.apply          → usuário unknown falando de querer ser parceiro/ter negócio
- b2b.emit_voucher   → role=partner pedindo voucher pra alguém (nome + telefone)
- b2b.admin_approve  → role=admin pedindo aprovar candidatura
- b2b.admin_reject   → role=admin pedindo rejeitar candidatura (geralmente com motivo)
- b2b.admin_query    → role=admin pedindo lista/stats/info
- b2b.other          → qualquer outra coisa

Retorne JSON:
{
  "intent": "b2b.xxx",
  "confidence": 0.0-1.0,
  "entities": {
    "recipient_name": "... (pra emit_voucher)",
    "recipient_phone": "... (pra emit_voucher, só dígitos)",
    "combo": "... (opcional pra emit_voucher)",
    "target_name": "... (pra approve/reject, nome da candidatura)",
    "reason": "... (pra reject)",
    "query_type": "pending|stats|other (pra admin_query)"
  },
  "reasoning": "1-2 palavras sobre por que"
}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': _ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: _MODEL, max_tokens: 512, system,
        messages: [
          { role: 'user', content: user },
          { role: 'assistant', content: '{' },
        ],
      }),
    })
    const text = await r.text()
    if (!r.ok) return ruleBasedFallback(message, userRole)
    const data = JSON.parse(text)
    const raw = '{' + (data?.content?.[0]?.text || '')
    const parsed = extractJson(raw)
    return parsed || ruleBasedFallback(message, userRole)
  } catch {
    return ruleBasedFallback(message, userRole)
  }
}

function ruleBasedFallback(message: string, userRole: string): any {
  const msg = message.toLowerCase()
  const entities: any = {}

  if (userRole === 'admin') {
    if (/aprova|aprovar|aceita|aceitar/.test(msg)) {
      const m = message.match(/(?:aprova|aprovar|aceita|aceitar)\s+(.+)/i)
      if (m) entities.target_name = m[1].trim()
      return { intent: 'b2b.admin_approve', confidence: 0.8, entities }
    }
    if (/rejeita|rejeitar|recusa|recusar|nega|negar/.test(msg)) {
      const m = message.match(/(?:rejeita|rejeitar|recusa|recusar|nega|negar)\s+([^,.]+)(?:[,.]\s*(?:motivo:?\s*)?(.+))?/i)
      if (m) { entities.target_name = m[1].trim(); if (m[2]) entities.reason = m[2].trim() }
      return { intent: 'b2b.admin_reject', confidence: 0.8, entities }
    }
    if (/lista|pendente|stats|status|quantos/.test(msg)) {
      entities.query_type = /stats|status|quantos/.test(msg) ? 'stats' : 'pending'
      return { intent: 'b2b.admin_query', confidence: 0.8, entities }
    }
  }
  if (userRole === 'partner') {
    if (/voucher|presente|cupom/.test(msg)) {
      // Tenta extrair nome + telefone
      const phoneMatch = message.match(/\b\d{2}[\s-]?\d{4,5}[\s-]?\d{4}\b|\b\d{10,11}\b/)
      if (phoneMatch) entities.recipient_phone = phoneMatch[0].replace(/\D/g, '')
      const namePart = message.replace(/voucher|presente|cupom|pra|para/gi, '')
                              .replace(/\d[\d\s-]*\d/g, '').trim()
      if (namePart) entities.recipient_name = namePart.replace(/,|\./g, '').trim().split(',')[0]
      return { intent: 'b2b.emit_voucher', confidence: 0.6, entities }
    }
  }
  if (userRole === 'unknown') {
    if (/parceir|parceria|meu neg[oó]cio|tenho|quero ser/.test(msg)) {
      return { intent: 'b2b.apply', confidence: 0.7, entities: {} }
    }
  }
  return { intent: 'b2b.other', confidence: 0.3, entities: {} }
}

// ════════════════════════════════════════════════════════════
// Resolver role do telefone
// ════════════════════════════════════════════════════════════

async function resolveRole(phone: string): Promise<{ role: string; partnership?: any }> {
  const last8 = lastDigits(phone)
  if (ADMIN_PHONES_LAST8.includes(last8)) return { role: 'admin' }

  try {
    const lookup = await rpc('b2b_wa_sender_lookup', { p_phone: phone })
    if (lookup?.ok) return { role: 'partner', partnership: lookup }
  } catch { /* ignora */ }

  return { role: 'unknown' }
}

// ════════════════════════════════════════════════════════════
// Handlers por intent
// ════════════════════════════════════════════════════════════

async function handleApply(phone: string, message: string, state: any): Promise<any> {
  const s = state || { step: 0, data: {} }
  const name = firstName(s.data?.contact_name) || ''

  // Passo 0 → pergunta 1
  if (s.step === 0) {
    return {
      reply: 'Que bom que você pensou em parceria! Pra começar: qual o nome do seu negócio?',
      next_state: { step: 1, data: {} },
    }
  }
  // Passo 1: recebeu nome do negócio → pergunta 2
  if (s.step === 1) {
    s.data.name = message.trim()
    return {
      reply: `Ótimo nome! E o que a ${s.data.name} entrega de melhor? (em 1 frase — moda, joias, fotografia, etc)`,
      next_state: { step: 2, data: s.data },
    }
  }
  // Passo 2: categoria → pergunta 3
  if (s.step === 2) {
    s.data.category = message.trim()
    return {
      reply: 'Tem Instagram ou site pra eu conhecer melhor?',
      next_state: { step: 3, data: s.data },
    }
  }
  // Passo 3: instagram → pergunta 4
  if (s.step === 3) {
    s.data.instagram = message.trim()
    return {
      reply: 'Qual o seu nome e onde vocês ficam (cidade/bairro)?',
      next_state: { step: 4, data: s.data },
    }
  }
  // Passo 4: contact + address → pergunta 5
  if (s.step === 4) {
    const parts = message.split(/[,;—-]/).map(p => p.trim())
    s.data.contact_name = parts[0] || message.trim()
    s.data.address = parts.slice(1).join(', ') || null
    return {
      reply: 'Última: por que você acha que a gente combinaria?',
      next_state: { step: 5, data: s.data },
    }
  }
  // Passo 5: motivo → salva
  if (s.step === 5) {
    s.data.notes = message.trim()
    try {
      const r = await rpc('b2b_application_create', {
        p_payload: {
          name: s.data.name,
          category: s.data.category,
          instagram: s.data.instagram,
          contact_name: s.data.contact_name,
          contact_phone: phone,
          address: s.data.address,
          notes: s.data.notes,
          requested_by_phone: phone,
        },
      })
      if (!r?.ok) throw new Error(r?.error || 'falha')

      return {
        reply:
          'Perfeito! Passei a candidatura pra aprovação. Em até 48h te dou retorno. ' +
          'Qualquer coisa, é só chamar aqui.',
        actions: [
          { kind: 'notify_admin', content: `Nova candidatura B2B: ${s.data.name} (${s.data.category}). Contato: ${phone}. Pra aprovar, manda "aprova ${s.data.name}".` },
        ],
        next_state: null, // encerra onboarding
      }
    } catch (e) {
      return { reply: 'Dei um problema ao registrar — você pode tentar de novo em alguns minutos?', next_state: s }
    }
  }
  return { reply: 'Não entendi direito. Posso recomeçar o cadastro?', next_state: null }
}

async function handleEmitVoucher(
  phone: string, entities: any, partnership: any,
): Promise<any> {
  const name = entities?.recipient_name
  const rawPhone = entities?.recipient_phone
  const combo = entities?.combo

  if (!name || String(name).length < 2) {
    return { reply: 'Pra quem é o voucher? Me manda o nome da pessoa.', next_state: { pending: 'recipient_name' } }
  }
  if (!rawPhone || rawPhone.length < 10) {
    return { reply: `Beleza, pra ${name}. Qual o WhatsApp dela? (44 9XXXX-XXXX)`, next_state: { pending: 'recipient_phone', data: { recipient_name: name } } }
  }

  const recipientPhone = normalize55(rawPhone)

  try {
    const r = await rpc('b2b_voucher_issue', {
      p_payload: {
        partnership_id: partnership.partnership_id,
        combo: combo || partnership.default_combo,
        recipient_name: name,
        recipient_phone: recipientPhone,
        theme: 'auto', // sazonal automático
        notes: JSON.stringify({ source: 'wa_mira', requested_by: phone }),
      },
    })
    if (!r?.ok) throw new Error(r?.error || 'voucher_issue_failed')

    const compose = await rpc('b2b_voucher_compose_message', { p_voucher_id: r.id })
    const leadMessage = compose?.message || `Oi ${firstName(name)}! Você ganhou um Voucher Presente. ${compose?.link}`

    return {
      reply: `Pronto! Mandei o voucher pra ${firstName(name)} direto no WhatsApp dela. Link pra você acompanhar: ${compose?.link}`,
      actions: [
        { kind: 'send_wa', to: recipientPhone, content: leadMessage },
      ],
      next_state: null,
    }
  } catch (e) {
    return { reply: `Deu erro ao emitir: ${(e as Error).message}. Pode tentar de novo?`, next_state: null }
  }
}

async function handleAdminApprove(entities: any): Promise<any> {
  const target = (entities?.target_name || '').trim().toLowerCase()
  if (!target) {
    const list = await rpc('b2b_applications_list', { p_status: 'pending', p_limit: 10 })
    const arr = Array.isArray(list) ? list : []
    if (!arr.length) return { reply: 'Não tem candidaturas pendentes.', next_state: null }
    const lines = arr.slice(0, 5).map((a: any, i: number) => `${i + 1}. ${a.name} (${a.category || '—'})`).join('\n')
    return { reply: `Qual aprova?\n${lines}\n\nResponde "aprova [nome]".`, next_state: null }
  }
  const list = await rpc('b2b_applications_list', { p_status: 'pending', p_limit: 50 })
  const match = (Array.isArray(list) ? list : []).find((a: any) =>
    String(a.name || '').toLowerCase().includes(target),
  )
  if (!match) return { reply: `Não achei candidatura com "${target}". Manda "lista pendentes" pra ver os nomes exatos.`, next_state: null }

  const r = await rpc('b2b_application_approve', { p_application_id: match.id })
  if (!r?.ok) return { reply: `Deu erro: ${r?.error}`, next_state: null }

  return {
    reply: `Aprovada! ${r.partnership_name} virou prospect. Avisei ela e a Mirian.`,
    actions: [
      { kind: 'send_wa', to: r.notify_applicant_phone, content:
        `Oi! Boas notícias — sua candidatura pra parceira do Círculo Mirian foi aprovada! ` +
        `Em breve a gente te ativa no sistema. Obrigada por confiar na gente.` },
      { kind: 'notify_mirian', content: `Nova parceria aprovada: ${r.partnership_name}.` },
    ],
    next_state: null,
  }
}

async function handleAdminReject(entities: any): Promise<any> {
  const target = (entities?.target_name || '').trim().toLowerCase()
  const reason = (entities?.reason || '').trim()

  if (!target) return { reply: 'Qual candidatura? Manda "lista pendentes".', next_state: null }
  if (!reason) return { reply: 'Me diz o motivo pra eu mandar a mensagem educada pra candidata.', next_state: { pending: 'reject_reason', data: { target } } }

  const list = await rpc('b2b_applications_list', { p_status: 'pending', p_limit: 50 })
  const match = (Array.isArray(list) ? list : []).find((a: any) =>
    String(a.name || '').toLowerCase().includes(target),
  )
  if (!match) return { reply: `Não achei "${target}".`, next_state: null }

  const r = await rpc('b2b_application_reject', { p_application_id: match.id, p_reason: reason })
  if (!r?.ok) return { reply: `Erro: ${r?.error}`, next_state: null }

  return {
    reply: `Rejeitada. Mandei a mensagem educada.`,
    actions: [
      { kind: 'send_wa', to: r.notify_applicant_phone, content:
        `Oi! Agradeço o interesse em ser parceira do Círculo Mirian. ` +
        `Nesse momento não vamos seguir com essa parceria, mas admiro muito o trabalho de vocês. ` +
        `Se quiser ser nossa paciente, te recebemos com o maior carinho.` },
      { kind: 'notify_mirian', content: `Candidatura rejeitada: ${r.partnership_name}. Motivo: ${reason}.` },
    ],
    next_state: null,
  }
}

async function handleAdminQuery(entities: any): Promise<any> {
  const qt = entities?.query_type || 'pending'
  if (qt === 'pending') {
    const list = await rpc('b2b_applications_list', { p_status: 'pending', p_limit: 10 })
    const arr = Array.isArray(list) ? list : []
    if (!arr.length) return { reply: 'Sem candidaturas pendentes.', next_state: null }
    const lines = arr.map((a: any, i: number) =>
      `${i + 1}. ${a.name} (${a.category || '—'}) · ${a.requested_by_phone}`
    ).join('\n')
    return { reply: `${arr.length} candidaturas pendentes:\n${lines}`, next_state: null }
  }
  // stats: resumo do mês
  try {
    const r = await fetch(`${_SB_URL}/rest/v1/rpc/b2b_partnership_impact_score`, {
      method: 'POST',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_partnership_id: null }),
    })
    const arr = await r.json()
    const total = Array.isArray(arr) ? arr.length : 0
    const topName = total ? arr[0].name : '—'
    return { reply: `Stats: ${total} parcerias ativas. Top: ${topName}.`, next_state: null }
  } catch {
    return { reply: 'Não consegui puxar stats agora.', next_state: null }
  }
}

function handleOther(role: string): any {
  if (role === 'admin') {
    return { reply: 'Comandos: `aprova X` · `rejeita X, motivo: Y` · `lista pendentes` · `stats`.', next_state: null }
  }
  if (role === 'partner') {
    return { reply: 'Pra emitir voucher: "voucher pra [nome], [telefone], combo [opcional]". Pra falar com a Lara/clínica, só me dizer.', next_state: null }
  }
  return {
    reply: 'Oi! Sou a Mira, cuido de parcerias da Clínica Mirian de Paula. Quer ser nossa parceira?',
    next_state: { step: 0, data: {} }, // inicia onboarding se responder sim
  }
}

// ════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return err('method_not_allowed', 405)

  try {
    const body = await req.json()
    const phone: string = body?.phone || ''
    const message: string = body?.message || ''
    const state: any = body?.state || null

    if (!phone || !message) return err('phone e message obrigatórios')

    // 1. Resolve role
    const { role, partnership } = await resolveRole(phone)

    // 2. Se está no meio de onboarding, continua
    if (state && typeof state.step === 'number') {
      const result = await handleApply(phone, message, state)
      return ok({ ok: true, reply_to: phone, ...result })
    }
    if (state && state.pending) {
      // Completar dado pendente (ex: recipient_phone, reject_reason)
      if (state.pending === 'recipient_phone' && role === 'partner') {
        const entities = {
          recipient_name: state.data?.recipient_name,
          recipient_phone: message.replace(/\D/g, ''),
        }
        const result = await handleEmitVoucher(phone, entities, partnership)
        return ok({ ok: true, reply_to: phone, ...result })
      }
      if (state.pending === 'reject_reason' && role === 'admin') {
        const result = await handleAdminReject({
          target_name: state.data?.target,
          reason: message.trim(),
        })
        return ok({ ok: true, reply_to: phone, ...result })
      }
    }

    // 3. Classifica intent
    const intent = await classifyIntent(message, role)
    let result: any

    switch (intent?.intent) {
      case 'b2b.apply':
        // Destravado: deixa qualquer role iniciar onboarding.
        // Admin pode usar pra testar sem outro número; parceira ja registrada
        // pode recomeçar se quiser.
        result = await handleApply(phone, message, { step: 0, data: {} })
        break
      case 'b2b.emit_voucher': {
        // Admin pode emitir se estiver na whitelist de alguma parceria
        let p = partnership
        if (!p) {
          try {
            const lookup = await rpc('b2b_wa_sender_lookup', { p_phone: phone })
            if (lookup?.ok) p = lookup
          } catch { /* ignora */ }
        }
        if (!p) {
          result = {
            reply: 'Pra emitir voucher, você precisa estar na whitelist de alguma parceria. ' +
                   'Posso autorizar agora? Me diz qual parceria.',
            next_state: null,
          }
        } else {
          result = await handleEmitVoucher(phone, intent.entities, p)
        }
        break
      }
      case 'b2b.admin_approve':
        if (role !== 'admin') { result = handleOther(role); break }
        result = await handleAdminApprove(intent.entities)
        break
      case 'b2b.admin_reject':
        if (role !== 'admin') { result = handleOther(role); break }
        result = await handleAdminReject(intent.entities)
        break
      case 'b2b.admin_query':
        if (role !== 'admin') { result = handleOther(role); break }
        result = await handleAdminQuery(intent.entities)
        break
      default:
        result = handleOther(role)
    }

    // Enriquece notify_admin / notify_mirian — ambos vão pro NOTIFY_PHONE (Alden)
    // (Mirian hoje É a Mira; notificar ela seria loop. Alden recebe tudo.)
    const actions = (result.actions || []).map((a: any) => {
      if (a.kind === 'notify_admin' || a.kind === 'notify_mirian') {
        return { kind: 'send_wa', to: NOTIFY_PHONE, content: a.content }
      }
      return a
    })

    return ok({
      ok: true,
      reply_to: phone,
      reply: result.reply,
      actions,
      next_state: result.next_state || null,
      intent: intent?.intent,
      role,
    })
  } catch (e) {
    return err((e as Error).message, 500)
  }
})
