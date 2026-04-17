/**
 * Beauty & Health Magazine — AI Generator Edge Function
 *
 * Proxy seguro para Anthropic Claude. Recebe metadados do slot + contexto da
 * página/edição e gera texto respeitando o contrato do playbook editorial.
 *
 * Input (POST JSON):
 *   {
 *     template_slug: "t05_editorial_letter",
 *     field_key: "corpo",
 *     field_meta: { label, hint, max?, minChars?, wordsMin?, wordsMax?, type, ... },
 *     page_slots: { ...slots já preenchidos da página },
 *     edition_context: { title, subtitle, theme, slug },
 *     extra_instruction?: "tom mais direto"
 *   }
 *
 * Output:
 *   { text: "..." }                     — para type text/textarea
 *   { items: [...] }                    — para type list (array de obj ou strings)
 *
 * Env vars necessárias:
 *   ANTHROPIC_API_KEY  — chave da Anthropic (console.anthropic.com)
 *   ANTHROPIC_MODEL    — (opcional) default: claude-sonnet-4-6
 */

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
// Haiku 4.5 = rapido + barato pra campos individuais (titulo, lede, corpo curto).
// Use ANTHROPIC_MODEL env var pra overrride (ex: Sonnet pra geracao complexa).
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PLAYBOOK_GLOBAL = `Princípios globais da revista Beauty & Health:
- Marca: "Beauty & Health" (nunca "ClinicAI Magazine" em conteúdo público).
- Tom editorial, cuidadoso, 2ª pessoa ("você"), nunca jargão médico sem tradução.
- Público 45+, feminino, não-cirúrgico.
- Sem emojis em texto editorial (emojis só em CTA/whatsapp).
- Itálico editorial: use *palavra* para marcar palavra-chave.
- Sem promessas absolutas ("cura", "para sempre").
- Citações/dados devem ser reais e atribuídos.`

const FIELD_TYPE_GUIDANCE: Record<string, string> = {
  corpo:
    '4-7 parágrafos, separados por linha em branco. 1º parágrafo abre concreto (cena, caso, dado — nunca genérico). Citação ou dado numérico a cada 2 parágrafos. Evitar listas dentro do corpo.',
  lede:
    '1 frase só. Resumo do texto que vem abaixo. Não repete o título. Sem "neste artigo" ou "vamos ver".',
  titulo:
    '1 linha. Forte, gancho editorial. Use *palavra* para itálico accent em 1 palavra-chave quando couber.',
  kicker:
    'ALL CAPS, categoria curta. Ex: MATÉRIA DE CAPA, VERDADE OU MITO, RELATO REAL.',
  subtitulo:
    'Prosa curta, não frase de efeito vazia. Complementa o título sem repetir.',
  assinatura:
    'Apenas o nome da autora. Ex: "Mirian de Paula".',
  cta_texto:
    'ALL CAPS. Verbo no imperativo. Ex: AGENDAR AVALIAÇÃO, SAIBA MAIS.',
  beneficios:
    'Cada item começa com verbo ativo (Estimula, Redefine, Devolve). Sem promessas absolutas.',
  qas:
    'Q&A em tom conversacional mas informado. Perguntas diretas (máx 120 chars). Respostas 40-180 palavras. Nunca começar resposta com "Bem,..." ou "Então...".',
  pares:
    'Pares mito vs fato. Mito em 1ª pessoa ou senso comum (máx 120 chars). Fato técnico, claro, curto (máx 200 chars).',
  items:
    'Itens de sumário com num sequencial (01, 02...), titulo e kicker (categoria).',
  passos:
    'Passo-a-passo com titulo (verbo imperativo) e descricao (1-2 frases).',
  recompensas:
    'Recompensas do quiz. titulo curto (ex: "Cashback R$ 50") e descricao (quando aplica).',
}

interface GenerateRequest {
  template_slug: string
  field_key: string
  field_meta: {
    k: string
    label: string
    hint?: string
    type: string
    max?: number
    minChars?: number
    wordsMin?: number
    wordsMax?: number
    optional?: boolean
    itemSchema?: string
    scalarItem?: { label?: string; max?: number; type?: string }
    min?: number
  }
  page_slots: Record<string, unknown>
  edition_context: {
    title?: string
    subtitle?: string
    theme?: string
    slug?: string
  }
  extra_instruction?: string
}

function buildSystemPrompt(req: GenerateRequest): string {
  const fm = req.field_meta
  const guidance = FIELD_TYPE_GUIDANCE[fm.k] || ''

  const limits: string[] = []
  if (fm.max) limits.push(`máximo ${fm.max} caracteres`)
  if (fm.minChars) limits.push(`mínimo ${fm.minChars} caracteres`)
  if (fm.wordsMin) limits.push(`mínimo ${fm.wordsMin} palavras`)
  if (fm.wordsMax) limits.push(`máximo ${fm.wordsMax} palavras`)
  if (fm.type === 'list') {
    if (fm.min) limits.push(`mínimo ${fm.min} itens`)
    if (fm.max) limits.push(`máximo ${fm.max} itens`)
  }

  const responseFormat =
    fm.type === 'list'
      ? fm.scalarItem
        ? `Retorne APENAS um JSON válido no formato: { "items": ["item1", "item2", ...] } — cada string respeitando o limite de ${fm.scalarItem.max || 80} chars.`
        : `Retorne APENAS um JSON válido no formato: { "items": [ {...}, {...} ] } — cada objeto com as chaves definidas pelo schema "${fm.itemSchema}".`
      : `Retorne APENAS um JSON válido no formato: { "text": "..." }`

  return [
    PLAYBOOK_GLOBAL,
    '',
    `Template: ${req.template_slug}`,
    `Campo: ${fm.label} (chave: ${fm.k}, tipo: ${fm.type})`,
    fm.hint ? `Hint do playbook: ${fm.hint}` : null,
    guidance ? `Orientação específica: ${guidance}` : null,
    limits.length ? `Limites: ${limits.join(', ')}` : null,
    '',
    'Contexto da edição:',
    `- Título: ${req.edition_context.title || 'sem título'}`,
    req.edition_context.subtitle ? `- Subtítulo: ${req.edition_context.subtitle}` : null,
    req.edition_context.theme ? `- Tema: ${req.edition_context.theme}` : null,
    '',
    'Outros campos já preenchidos nesta página (use como contexto para manter coerência):',
    JSON.stringify(req.page_slots, null, 2),
    '',
    responseFormat,
    'Nunca adicione comentários, markdown ou texto fora do JSON. APENAS o JSON.',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildUserMessage(req: GenerateRequest): string {
  const extra = req.extra_instruction ? `\n\nInstrução adicional da autora:\n${req.extra_instruction}` : ''
  return `Gere o conteúdo para o campo "${req.field_meta.label}" desta página da revista Beauty & Health, respeitando o playbook editorial e o contexto acima.${extra}`
}

async function callAnthropic(system: string, userMsg: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${txt}`)
  }
  const data = await res.json()
  const content = (data.content || []).find((b: any) => b.type === 'text')
  return (content && content.text) || ''
}

function parseResponse(raw: string, isList: boolean): Record<string, unknown> {
  // Tenta extrair JSON mesmo se o modelo adicionou texto extra
  const match = raw.match(/\{[\s\S]*\}/)
  const jsonStr = match ? match[0] : raw
  try {
    const parsed = JSON.parse(jsonStr)
    if (isList) {
      return { items: Array.isArray(parsed.items) ? parsed.items : [] }
    }
    return { text: typeof parsed.text === 'string' ? parsed.text : raw }
  } catch (e) {
    // fallback: usa raw como texto
    return isList ? { items: [] } : { text: raw }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    })
  }

  try {
    const body = (await req.json()) as GenerateRequest
    if (!body.template_slug || !body.field_meta || !body.field_key) {
      return new Response(JSON.stringify({ error: 'missing required fields' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      })
    }

    const system = buildSystemPrompt(body)
    const userMsg = buildUserMessage(body)
    const raw = await callAnthropic(system, userMsg)
    const isList = body.field_meta.type === 'list'
    const result = parseResponse(raw, isList)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    })
  }
})
