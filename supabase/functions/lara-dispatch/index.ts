/**
 * Edge Function: lara-dispatch
 *
 * Processa fila anatomy_quiz_lara_dispatch · chama Anthropic Haiku + Evolution API.
 * Invocada pelo pg_cron a cada 1 min OU por trigger AFTER INSERT (fire-and-forget).
 *
 * Env vars (configurar via supabase secrets set):
 *   ANTHROPIC_API_KEY
 *   EVOLUTION_API_KEY
 *   EVOLUTION_BASE_URL
 *   EVOLUTION_INSTANCE
 *   SUPABASE_URL          (auto-provided)
 *   SUPABASE_SERVICE_ROLE_KEY (auto-provided)
 */
import { createClient } from "jsr:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY")!
const EVOLUTION_URL = Deno.env.get("EVOLUTION_BASE_URL")!
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE")!

const TEMPLATES: Record<string, string> = {
  aq_novo_lead: 'NOVO LEAD (msg 1 de 5 · Onboarding+Rapport+Permissao): Apresente-se como Lara · agradeca a confianca · cite as 2 queixas · peca permissao pra fazer 2 perguntinhas (que vai ajudar a separar o protocolo certo). Nao agende nada nesta msg.',
  aq_lead_frio: 'LEAD FRIO retornando (msg 1 de 4 · Reconexao+Permissao): Apresente-se como Lara · "que bom te ver de novo" · cite que dessa vez marcou as queixas X+Y · peca uma pergunta sem julgamento.',
  aq_orcamento_aberto: 'ORCAMENTO ABERTO (msg unica): Apresente-se como Lara · "olha que coincidencia" · queixas atuais ja entram no orcamento que separamos · com 1 plano resolve tudo · se fechar essa semana, encaixa no mes atual · pergunta se pode mandar detalhes.',
  aq_agendado_futuro: 'JA AGENDADA (msg unica): Apresente-se como Lara · "que otimo" · cite queixas + ja esta agendada com a Dra. dia [DATA] · vai ser o espaco pra tirar duvidas · 30 dias depois vai ver rosto se transformar em camera lenta · pergunta se tem duvida pra adiantar antes do dia.',
  aq_paciente_ativo: 'PACIENTE ATIVA (msg unica): Apresente-se como Lara · "que alegria te ver de volta" · ela ja viveu o processo · agora as queixas X+Y entraram no radar · Dra. gosta de reavaliacao a cada 6 meses · oferece reservar horario · PS curto mencionando os protocolos.',
  aq_requiz_recente: 'RE-QUIZ <24H (msg unica · com humor leve): Apresente-se como Lara · "voltou? ta pensando carinhosamente na sua pele" 😊 · anotou as novas queixas · ja mandou mensagem ontem · oferece reservar horario · pergunta "topa?".',
}

interface DispatchRow {
  id: string
  phone: string
  name: string | null
  template_key: string
  lifecycle: string
  queixas: Array<{ key: string, label: string, protocol: string, weight: number }>
  context: any
}

async function callAnthropic(system: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
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
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 500)}`)
  }
  const data = await res.json()
  const text = data?.content?.[0]?.text
  if (!text) throw new Error("Anthropic respondeu vazio")
  return text
}

async function sendWhatsApp(phone: string, text: string): Promise<any> {
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: "POST",
    headers: {
      "apikey": EVOLUTION_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({ number: phone, text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Evolution ${res.status}: ${JSON.stringify(data).slice(0, 500)}`)
  }
  return data
}

function buildPrompt(d: DispatchRow): { system: string, user: string } {
  const firstName = String(d.name || "").split(" ")[0] || "Olá"
  const q1 = d.queixas?.[0]?.label || "(sem queixa)"
  const q2 = d.queixas?.[1]?.label
  const p1 = d.queixas?.[0]?.protocol || ""
  const p2 = d.queixas?.[1]?.protocol
  const queixasStr = q1 + (q2 ? " e " + q2 : "")
  const protosStr = p1 + (p2 ? " / " + p2 : "")

  const system = `Voce eh a Lara, assistente da Dra. Mirian de Paula (Clinica Mirian de Paula em Maringa/PR · medicina estetica facial). ` +
    `Voce conversa via WhatsApp · sempre se apresenta como Lara · usa portugues brasileiro coloquial profissional. ` +
    `NUNCA usa "se quiser" ou "sem compromisso" (Never Split the Difference). Sempre tem CTA claro. ` +
    `Tom acolhedor + autoridade da Dra. Mirian + foco em conversao SDR. ` +
    `Maximo 6 linhas. Pode usar 1 emoji 💛. Sem hashtags. ` +
    `Mencione SEMPRE as queixas: ${queixasStr}. Mencione o protocolo da Dra. quando fizer sentido: ${protosStr}.`

  let templateInstr = TEMPLATES[d.template_key] || TEMPLATES.aq_novo_lead
  if (d.template_key === "aq_agendado_futuro") {
    const data = d.context?.lifecycle?.scheduled_for || "(sem data)"
    templateInstr = templateInstr.replace("[DATA]", data)
  }

  const user = `Contexto: NOME=${firstName} · TEMPLATE=${d.template_key} · LIFECYCLE=${d.lifecycle} · QUEIXAS=${queixasStr}\n\nGere a mensagem da Lara seguindo:\n\n${templateInstr}`

  return { system, user }
}

async function processOne(sb: any, d: DispatchRow): Promise<{ ok: boolean, msg?: string, error?: string }> {
  // Marca processing
  await sb.from("anatomy_quiz_lara_dispatch")
    .update({ status: "processing", attempts: undefined })
    .eq("id", d.id)
  await sb.rpc("_aq_increment_attempts", { p_id: d.id }).catch(() => null)

  try {
    const { system, user } = buildPrompt(d)
    const msgText = await callAnthropic(system, user)
    const evoData = await sendWhatsApp(d.phone, msgText)
    await sb.from("anatomy_quiz_lara_dispatch")
      .update({
        status: "dispatched",
        dispatched_at: new Date().toISOString(),
        message_text: msgText,
        evolution_response: evoData,
      })
      .eq("id", d.id)
    return { ok: true, msg: msgText.slice(0, 100) }
  } catch (err: any) {
    await sb.from("anatomy_quiz_lara_dispatch")
      .update({
        status: "failed",
        error_message: String(err.message || err).slice(0, 500),
      })
      .eq("id", d.id)
    return { ok: false, error: err.message }
  }
}

Deno.serve(async (_req: Request) => {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // Reset zumbis (>5 min em processing)
  await sb.from("anatomy_quiz_lara_dispatch")
    .update({ status: "pending" })
    .eq("status", "processing")
    .lt("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())

  const { data: pending, error } = await sb
    .from("anatomy_quiz_lara_dispatch")
    .select("id, phone, name, template_key, lifecycle, queixas, context")
    .eq("status", "pending")
    .lte("next_send_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(10)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
  if (!pending || pending.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 })
  }

  const results: any[] = []
  for (const d of pending as DispatchRow[]) {
    const r = await processOne(sb, d)
    results.push({ id: d.id, ...r })
  }

  return new Response(
    JSON.stringify({ processed: pending.length, results }, null, 2),
    { status: 200, headers: { "content-type": "application/json" } }
  )
})
