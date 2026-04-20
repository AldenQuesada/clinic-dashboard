/**
 * Edge Function: lara-dispatch (v2 · sem supabase-js · fetch puro)
 *
 * Processa fila anatomy_quiz_lara_dispatch via Postgres REST API + Anthropic + Evolution.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY")!
const EVOLUTION_URL = Deno.env.get("EVOLUTION_BASE_URL")!
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE")!

const TEMPLATES: Record<string, string> = {
  aq_novo_lead:        "NOVO LEAD (msg 1 de 5 · Onboarding+Rapport+Permissao): Apresente-se como Lara · agradeca a confianca · cite as 2 queixas · peca permissao pra fazer 2 perguntinhas (vai ajudar a separar o protocolo certo). Nao agende nada nesta msg.",
  aq_lead_frio:        "LEAD FRIO retornando (msg 1 de 4): Apresente-se como Lara · 'que bom te ver de novo' · cite que dessa vez marcou as queixas · peca uma pergunta sem julgamento.",
  aq_orcamento_aberto: "ORCAMENTO ABERTO (msg unica): Apresente-se como Lara · 'olha que coincidencia' · queixas atuais ja entram no orcamento · com 1 plano resolve tudo · se fechar essa semana, encaixa no mes atual · pergunta se pode mandar detalhes.",
  aq_agendado_futuro:  "JA AGENDADA (msg unica): Apresente-se como Lara · 'que otimo' · cite queixas + ja esta agendada com a Dra. dia [DATA] · vai ser o espaco pra tirar duvidas · 30 dias depois vai ver rosto se transformar · pergunta se tem duvida pra adiantar.",
  aq_paciente_ativo:   "PACIENTE ATIVA (msg unica): Apresente-se como Lara · 'que alegria te ver de volta' · ela ja viveu o processo · agora as queixas X+Y entraram no radar · Dra. gosta de reavaliacao a cada 6 meses · oferece reservar horario · PS curto com protocolos.",
  aq_requiz_recente:   "RE-QUIZ <24H (msg unica · humor leve): Apresente-se como Lara · 'voltou? ta pensando carinhosamente na sua pele' 😊 · anotou as novas queixas · ja mandou mensagem ontem · oferece reservar horario · pergunta 'topa?'.",
}

const PG_HEADERS = {
  "apikey": SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
}

async function pgSelect(query: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/anatomy_quiz_lara_dispatch?${query}`, { headers: PG_HEADERS })
  if (!r.ok) throw new Error(`pgSelect ${r.status}: ${await r.text()}`)
  return r.json()
}

async function pgUpdate(id: string, payload: Record<string, any>): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/anatomy_quiz_lara_dispatch?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...PG_HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error(`pgUpdate ${r.status}: ${await r.text()}`)
}

async function callAnthropic(system: string, userPrompt: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  })
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 400)}`)
  const data = await r.json()
  const text = data?.content?.[0]?.text
  if (!text) throw new Error("Anthropic respondeu vazio")
  return text
}

async function sendWhatsApp(phone: string, text: string): Promise<any> {
  const r = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: "POST",
    headers: { "apikey": EVOLUTION_KEY, "content-type": "application/json" },
    body: JSON.stringify({ number: phone, text }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Evolution ${r.status}: ${JSON.stringify(data).slice(0, 400)}`)
  return data
}

function buildPrompt(d: any): { system: string, user: string } {
  const firstName = String(d.name || "").split(" ")[0] || "Olá"
  const queixas = Array.isArray(d.queixas) ? d.queixas : []
  const q1 = queixas[0]?.label || "(sem queixa)"
  const q2 = queixas[1]?.label
  const p1 = queixas[0]?.protocol || ""
  const p2 = queixas[1]?.protocol
  const queixasStr = q1 + (q2 ? " e " + q2 : "")
  const protosStr  = p1 + (p2 ? " / " + p2 : "")

  const system =
    "Voce eh a Lara, assistente da Dra. Mirian de Paula (Clinica Mirian de Paula em Maringa/PR · medicina estetica facial). " +
    "Voce conversa via WhatsApp · sempre se apresenta como Lara · usa portugues brasileiro coloquial profissional. " +
    "NUNCA usa 'se quiser' ou 'sem compromisso' (Never Split the Difference). Sempre tem CTA claro. " +
    "Tom acolhedor + autoridade da Dra. Mirian + foco em conversao SDR. " +
    "Maximo 6 linhas. Pode usar 1 emoji 💛. Sem hashtags. " +
    `Mencione SEMPRE as queixas: ${queixasStr}. Mencione protocolo quando fizer sentido: ${protosStr}.`

  let templateInstr = TEMPLATES[d.template_key] || TEMPLATES.aq_novo_lead
  if (d.template_key === "aq_agendado_futuro") {
    const data = d?.context?.lifecycle?.scheduled_for || "(sem data)"
    templateInstr = templateInstr.replace("[DATA]", data)
  }

  const user = `Contexto: NOME=${firstName} · TEMPLATE=${d.template_key} · LIFECYCLE=${d.lifecycle} · QUEIXAS=${queixasStr}\n\nGere a mensagem da Lara seguindo:\n\n${templateInstr}`

  return { system, user }
}

async function processOne(d: any): Promise<any> {
  // Marca processing + incrementa attempts
  await pgUpdate(d.id, { status: "processing", attempts: (d.attempts || 0) + 1 })
  try {
    const { system, user } = buildPrompt(d)
    const msgText = await callAnthropic(system, user)
    const evoData = await sendWhatsApp(d.phone, msgText)
    await pgUpdate(d.id, {
      status: "dispatched",
      dispatched_at: new Date().toISOString(),
      message_text: msgText,
      evolution_response: evoData,
    })
    return { id: d.id, ok: true, preview: msgText.slice(0, 80) }
  } catch (err: any) {
    const msg = String(err?.message || err).slice(0, 500)
    await pgUpdate(d.id, { status: "failed", error_message: msg })
    return { id: d.id, ok: false, error: msg }
  }
}

Deno.serve(async (_req: Request) => {
  try {
    // Reset zumbis · status='processing' há mais de 5 min
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    await fetch(`${SUPABASE_URL}/rest/v1/anatomy_quiz_lara_dispatch?status=eq.processing&created_at=lt.${fiveMinAgo}`, {
      method: "PATCH",
      headers: { ...PG_HEADERS, "Prefer": "return=minimal" },
      body: JSON.stringify({ status: "pending" }),
    })

    const nowIso = new Date().toISOString()
    const pending = await pgSelect(
      `select=id,phone,name,template_key,lifecycle,queixas,context,attempts&status=eq.pending&next_send_at=lte.${nowIso}&order=created_at.asc&limit=10`
    )
    if (pending.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { headers: { "content-type": "application/json" } })
    }

    const results = []
    for (const d of pending) {
      results.push(await processOne(d))
    }

    return new Response(JSON.stringify({ processed: pending.length, results }, null, 2), {
      headers: { "content-type": "application/json" },
    })
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: String(err?.message || err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    )
  }
})
