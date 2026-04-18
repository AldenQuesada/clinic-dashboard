/**
 * ClinicAI — B2B Scout Scan Edge Function
 *
 * Orquestra a varredura de candidatos:
 *   1) Valida via RPC b2b_scout_can_scan (toggle + budget + rate limit)
 *   2) Chama Apify Google Maps Scraper pra categoria+cidade
 *   3) Para cada resultado (top N): envia payload pro Claude que gera:
 *      { dna_score, dna_justification, fit_reasons[], risk_flags[], approach_message }
 *   4) Registra candidato (b2b_candidate_register) + custo (b2b_scout_usage_log)
 *   5) Retorna { ok, created, costs }
 *
 * Env vars (configurar via `supabase secrets set`):
 *   APIFY_TOKEN         — https://console.apify.com/account/integrations
 *   ANTHROPIC_API_KEY   — console.anthropic.com
 *   ANTHROPIC_MODEL     — (opcional) default claude-haiku-4-5-20251001
 *   SUPABASE_URL        — auto
 *   SUPABASE_SERVICE_ROLE_KEY — auto
 *
 * POST body:
 *   { category: "salao_premium", city?: "Maringá, PR", tier_target?: 1, limit?: 15 }
 */

// deno-lint-ignore no-explicit-any
const _APIFY_TOKEN = Deno.env.get('APIFY_TOKEN') || ''
const _ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const _MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001'
const _SB_URL = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Apify actor: compass/crawler-google-places (Google Maps Scraper)
const APIFY_ACTOR = 'compass~crawler-google-places'

// Custos referência (alinhados com comentário na tabela b2b_scout_usage)
const COSTS = {
  google_maps_scan: 0.40,
  instagram_enrich: 0.15,
  claude_dna:       0.08,
  claude_approach:  0.05,
}

const CATEGORY_TO_QUERY: Record<string, string> = {
  salao_premium:        'salão de beleza premium',
  endocrino_menopausa:  'endocrinologista menopausa',
  acim_confraria:       'associação comercial mulheres empreendedoras',
  fotografo_casamento:  'fotógrafo de casamento',
  joalheria:            'joalheria alta joalheria',
  perfumaria_nicho:     'perfumaria importados nicho',
  psicologia_40plus:    'psicologia feminina coaching',
  ortomolecular:        'medicina ortomolecular integrativa',
  nutri_funcional:      'nutricionista funcional',
  otica_premium:        'ótica premium grifes',
  vet_boutique:         'veterinário boutique',
  fotografo_familia:    'fotógrafo família retrato',
  atelier_noiva:        'atelier vestido de noiva',
  farmacia_manipulacao: 'farmácia de manipulação dermatológica',
  floricultura_assinatura: 'floricultura boutique',
  personal_stylist:     'personal stylist',
  spa_wellness:         'spa day wellness',
}

// ─── CORS ───────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
function err(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ─── Supabase RPC via REST ──────────────────────────────────
async function rpc(name: string, args: Record<string, unknown>) {
  const resp = await fetch(`${_SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'apikey': _SB_KEY,
      'Authorization': `Bearer ${_SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`[${name}] ${resp.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

// ─── Apify: run actor sync and get items ────────────────────
// deno-lint-ignore no-explicit-any
async function apifyRunSync(query: string, limit: number): Promise<any[]> {
  if (!_APIFY_TOKEN) throw new Error('APIFY_TOKEN ausente')

  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${_APIFY_TOKEN}`
  const body = {
    searchStringsArray: [query],
    locationQuery: 'Maringá, PR, Brazil',
    maxCrawledPlacesPerSearch: limit,
    language: 'pt-BR',
    countryCode: 'br',
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`Apify falhou ${resp.status}: ${t.slice(0, 200)}`)
  }
  return await resp.json()
}

// ─── Claude: score DNA + fit + risks ────────────────────────
// deno-lint-ignore no-explicit-any
async function claudeScore(candidate: any, category: string) {
  if (!_ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY ausente')

  const system = `Você é um estrategista de growth avaliando parceiros B2B pra uma clínica premium de estética feminina em Maringá-PR (Clínica Mirian de Paula). Avalie o fit com o DNA do programa:

DNA obrigatório:
- Excelência (qualidade técnica e reputação)
- Estética (identidade visual, branding, apresentação)
- Propósito (alinhamento com cuidado feminino integrativo premium)

Público-alvo comum: mulheres 40-55, classe A/B, que cuidam da imagem e bem-estar.

Responda ESTRITAMENTE em JSON válido com:
{
  "dna_score": 1-10 (média subjetiva, use 7 como piso pra aceitação),
  "dna_justification": "1 frase curta (<140 chars)",
  "fit_reasons": ["até 3 razões pelas quais faz sentido"],
  "risk_flags": ["até 3 riscos/alertas"],
  "approach_message": "mensagem de abordagem WhatsApp (max 280 chars), tom elegante, propondo uma conversa"
}

Nada fora do JSON. Sem preâmbulo.`

  const userMsg = `Categoria buscada: ${category}

Candidato:
- Nome: ${candidate.title || candidate.name || '?'}
- Endereço: ${candidate.address || '?'}
- Categoria Google: ${candidate.categoryName || candidate.category || '?'}
- Rating: ${candidate.totalScore || '?'} (${candidate.reviewsCount || 0} reviews)
- Site: ${candidate.website || '—'}
- Telefone: ${candidate.phone || '—'}
- Descrição: ${(candidate.description || '').slice(0, 300)}`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': _ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: _MODEL,
      max_tokens: 800,
      system,
      messages: [
        { role: 'user', content: userMsg },
        { role: 'assistant', content: '{' },
      ],
      stop_sequences: ['\n\n'],
    }),
  })
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`Claude falhou ${resp.status}: ${t.slice(0, 200)}`)
  }
  const data = await resp.json()
  const rawText = (data?.content?.[0]?.text || '').trim()
  const text = '{' + rawText

  const json = _extractJson(text)
  if (!json) {
    return {
      dna_score: null,
      dna_justification: 'Resposta IA nao parseavel',
      fit_reasons: [],
      risk_flags: ['Parse falhou. Raw: ' + rawText.slice(0, 120)],
      approach_message: null,
    }
  }
  return {
    dna_score: Number(json.dna_score) || null,
    dna_justification: String(json.dna_justification || '').slice(0, 200),
    fit_reasons: Array.isArray(json.fit_reasons) ? json.fit_reasons.slice(0, 3) : [],
    risk_flags: Array.isArray(json.risk_flags) ? json.risk_flags.slice(0, 3) : [],
    approach_message: String(json.approach_message || '').slice(0, 500),
  }
}

// deno-lint-ignore no-explicit-any
function _extractJson(text: string): any | null {
  try { return JSON.parse(text) } catch (_) {}
  const md = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (md) { try { return JSON.parse(md[1].trim()) } catch (_) {} }
  const first = text.indexOf('{')
  const last  = text.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)) } catch (_) {}
  }
  return null
}

// ─── Handler principal ──────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: corsHeaders })
  if (req.method !== 'POST')    return err('Método inválido', 405)

  let body: { category?: string; tier_target?: number; limit?: number }
  try { body = await req.json() } catch { return err('JSON inválido') }

  const category = body.category
  if (!category) return err('category obrigatório')
  const limit = Math.min(Math.max(body.limit || 15, 1), 30)
  const query = CATEGORY_TO_QUERY[category] || category.replace(/_/g, ' ')

  // 1) Gate — pode rodar?
  try {
    const canScan = await rpc('b2b_scout_can_scan', { p_category: category })
    if (!canScan?.ok) return err(`Bloqueado: ${canScan?.reason || 'unknown'}`, 403)
  } catch (e) {
    return err(`Falha validação: ${(e as Error).message}`, 500)
  }

  // 2) Varredura Google Maps via Apify
  // deno-lint-ignore no-explicit-any
  let places: any[] = []
  try {
    places = await apifyRunSync(query, limit)
  } catch (e) {
    return err(`Apify falhou: ${(e as Error).message}`, 502)
  }

  // 3) Log custo da varredura (independente de quantos resultados)
  try {
    await rpc('b2b_scout_usage_log', {
      p_event_type: 'google_maps_scan',
      p_cost_brl:   COSTS.google_maps_scan,
      p_category:   category,
      p_candidate_id: null,
      p_meta:       { query, results: places.length },
    })
  } catch (_) { /* segue mesmo se log falhar */ }

  let created = 0
  let failed = 0
  let totalCost = COSTS.google_maps_scan
  const createdIds: string[] = []

  // 4) Enrich + register
  for (const place of places) {
    try {
      const enrichment = await claudeScore(place, category)
      totalCost += COSTS.claude_dna

      const payload = {
        category,
        tier_target: body.tier_target || null,
        name: place.title || place.name || 'Sem nome',
        address: place.address || null,
        phone: place.phone || null,
        whatsapp: null,
        email: null,
        instagram_handle: null,
        website: place.website || null,
        google_rating: place.totalScore || null,
        google_reviews: place.reviewsCount || null,
        source: 'google_maps',
        raw_data: place,
        dna_score: enrichment.dna_score,
        dna_justification: enrichment.dna_justification,
        fit_reasons: enrichment.fit_reasons,
        risk_flags: enrichment.risk_flags,
        approach_message: enrichment.approach_message,
      }

      const r = await rpc('b2b_candidate_register', { p_payload: payload })
      if (r?.ok && r.id) {
        created++
        createdIds.push(r.id)
        await rpc('b2b_scout_usage_log', {
          p_event_type: 'claude_dna',
          p_cost_brl:   COSTS.claude_dna,
          p_category:   category,
          p_candidate_id: r.id,
          p_meta:       { model: _MODEL },
        })
      }
    } catch (_e) {
      failed++
    }
  }

  return ok({
    ok: true,
    category,
    query,
    results: places.length,
    created,
    failed,
    total_cost_brl: totalCost.toFixed(2),
    candidate_ids: createdIds.slice(0, 10),
  })
})
