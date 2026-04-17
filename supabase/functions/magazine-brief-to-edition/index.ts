/**
 * Beauty & Health Magazine — Brief to Edition (auto-editor)
 *
 * Recebe um brief completo (texto bruto + fotos + meta) e retorna um JSON plan
 * com 10-14 paginas prontas pra criacao via magazine_add_page, respeitando a
 * ordem canonica do playbook.
 *
 * Input:
 *   {
 *     mode: "brief" | "page-regenerate",
 *     brief: {
 *       theme, tone, objective, month_year,
 *       raw_content: string,
 *       sections_hint: [{ template_slug, raw_content }]  // opcional
 *     },
 *     photos: [{ url, alt, aspect, width, height }],
 *     playbook: string,   // opcional — playbook inteiro em texto pra guidance
 *     // Para mode=page-regenerate:
 *     page: { template_slug, slots },
 *     extra_instruction: string
 *   }
 *
 * Output mode=brief:
 *   { pages: [{ template_slug, slots }] }
 * Output mode=page-regenerate:
 *   { slots: {...} }
 *
 * Env:
 *   ANTHROPIC_API_KEY
 *   ANTHROPIC_MODEL_BRIEF (default: claude-sonnet-4-6)
 */

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const MODEL = Deno.env.get('ANTHROPIC_MODEL_BRIEF') || 'claude-sonnet-4-6'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PLAYBOOK_SUMMARY = `
Playbook Beauty & Health (resumo operacional):

TEMPLATES DISPONIVEIS:
- t01_cover_hero_dark: capa. slots: titulo (40c), foto_hero, edicao_label (30c), subtitulo (140c opc), tag (18c opc)
- t02_cover_hero_light: capa clean. slots: titulo (40c), foto_hero, subtitulo (140c opc)
- t03_cover_triptych: capa tripla. slots: foto_1/2/3, titulo_1/2/3 (22c cada)
- t04_toc_editorial: sumario. slots: titulo (24c), items (4-8 de {num,titulo,kicker}), kicker (12c opc), lede (180c opc)
- t05_editorial_letter: carta editorial. slots: titulo (50c), foto_autora, corpo (180-280 palavras), assinatura
- t06_back_cta: contracapa. slots: titulo (50c), contatos (2-4 {label,valor}), cta_texto (30c), cta_link, proxima_edicao (60c opc)
- t07_feature_double: materia dupla. slots: kicker (22c), titulo (70c), lede (100-200c), corpo (400-700 palavras), foto_hero
- t08_feature_fullbleed: fullbleed. slots: titulo (60c), foto_full landscape, lede (160c)
- t09_feature_triptych: 3 blocos. slots: foto_1, foto_2, texto_central (180c), legenda_1/2 (40c opc)
- t10_interview: entrevista. slots: titulo (60c), foto_entrevistado, nome (40c), qas (3-6 de {q,a})
- t11_product_highlight: destaque tratamento. slots: titulo (40c), foto, beneficios (3-6 strings 80c cada), cta (30c)
- t12_before_after_pair: antes/depois. slots: titulo (50c), foto_antes, foto_depois, meta (140c), stats (2-4 {valor,label})
- t14_mosaic_gallery: galeria. slots: titulo (40c), fotos (3-5)
- t16_quiz_cta: quiz CTA. slots: titulo (50c), lede (180c), quiz_slug, recompensas (2-4 {titulo,descricao})
- t18_stat_feature: dado destaque. slots: numero (10c), titulo (120c), fonte (100c)
- t19_ritual_steps: passos ritual. slots: titulo (50c), passos (3-6 {titulo,descricao})
- t20_myth_vs_fact: mitos/fatos. slots: titulo (40c), pares (3-5 {mito,fato})
- t21_product_photo_split: 2 fotos produto. slots: kicker (22c), nome_produto (40c), foto_principal, foto_detalhe, tagline (60c opc)
- t22_product_feature_text: materia produto (par com t21). slots: kicker (22c identico ao t21), titulo (70c), lede (200c), corpo (400-700 palavras)

ORDEM CANONICA: capa(t01/t02/t03) -> sumario(t04) -> carta(t05) -> materias -> quiz/interativos -> contracapa(t06)

REGRAS DE CONTEUDO:
- Tom editorial 2a pessoa ("voce"), publico 45+, sem jargao medico sem traducao
- SEM EMOJIS em texto editorial (apenas CTAs/WA)
- Italico editorial: use *palavra* pra destaque accent
- Sem promessas absolutas (cura, para sempre)
- Citacoes e dados devem ser reais e atribuidos
- Cada foto precisa ter aspect preservado

ESTRUTURA MINIMA: 6 paginas (capa + sumario + editorial + >=1 materia + CTA + contracapa). Ideal 10-14.
`

interface BriefToEditionRequest {
  mode?: 'brief' | 'page-regenerate'
  brief?: {
    theme?: string
    tone?: string
    objective?: string
    month_year?: string
    raw_content?: string
    sections_hint?: Array<{ template_slug: string; raw_content: string }>
  }
  photos?: Array<{ url: string; alt?: string; aspect?: string; width?: number; height?: number }>
  playbook?: string
  page?: { template_slug: string; slots: Record<string, unknown> }
  extra_instruction?: string
}

function buildBriefSystemPrompt(req: BriefToEditionRequest): string {
  return [
    PLAYBOOK_SUMMARY,
    '',
    'TAREFA: receber um brief editorial e gerar o plano completo de uma edicao.',
    '',
    'Meta do brief:',
    req.brief?.theme ? `- Tema: ${req.brief.theme}` : null,
    req.brief?.tone ? `- Tom: ${req.brief.tone}` : null,
    req.brief?.objective ? `- Objetivo: ${req.brief.objective}` : null,
    req.brief?.month_year ? `- Mes/ano: ${req.brief.month_year}` : null,
    '',
    'Fotos disponiveis:',
    (req.photos || []).map((p, i) => `  [${i}] ${p.url} ${p.aspect ? `(aspect: ${p.aspect})` : ''} ${p.alt ? `- ${p.alt}` : ''}`).join('\n') || '  (sem fotos)',
    '',
    'Brief bruto da autora:',
    '"""',
    req.brief?.raw_content || '',
    '"""',
    '',
    req.brief?.sections_hint && req.brief.sections_hint.length
      ? 'Hints de secao da autora:\n' + req.brief.sections_hint.map((s, i) => `  [${i}] ${s.template_slug}: ${s.raw_content.slice(0, 200)}`).join('\n')
      : null,
    '',
    'INSTRUCOES:',
    '1. Gere entre 10 e 14 paginas na ordem canonica.',
    '2. Use APENAS slugs listados acima.',
    '3. Use as fotos fornecidas (copiando a URL exata no slot correspondente). Se falta foto pra um template, deixe o slot como string vazia OU troque pra template que nao precisa foto.',
    '4. Respeite limites de caracteres/palavras rigorosamente.',
    '5. Tom editorial, sem emojis em texto.',
    '6. Primeira pagina DEVE ser capa (t01/t02/t03). Ultima DEVE ser t06.',
    '7. Pagina t22 deve vir imediatamente apos t21, com kicker identico.',
    '',
    'Retorne APENAS um JSON valido no formato:',
    '{ "pages": [ { "template_slug": "tXX_...", "slots": { ... } } ] }',
    'Nunca adicione texto fora do JSON.',
  ].filter(Boolean).join('\n')
}

function buildPageRegenPrompt(req: BriefToEditionRequest): string {
  return [
    PLAYBOOK_SUMMARY,
    '',
    'TAREFA: regerar os slots de uma pagina existente respeitando o template atual.',
    '',
    `Template: ${req.page?.template_slug}`,
    'Slots atuais:',
    JSON.stringify(req.page?.slots || {}, null, 2),
    '',
    req.extra_instruction
      ? `Instrucao adicional da autora:\n${req.extra_instruction}`
      : '',
    '',
    'INSTRUCOES:',
    '- Use o mesmo template_slug.',
    '- Preencha os slots obrigatorios seguindo limites do playbook.',
    '- Preserve URLs de fotos do original (nao invente URLs).',
    '- Tom editorial, sem emojis em texto.',
    '',
    'Retorne APENAS um JSON valido no formato:',
    '{ "slots": { ... } }',
    'Nunca adicione texto fora do JSON.',
  ].filter(Boolean).join('\n')
}

async function callAnthropic(system: string, userMsg: string, maxTokens = 8000): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
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

function extractJson(raw: string): any {
  const match = raw.match(/\{[\s\S]*\}/)
  const jsonStr = match ? match[0] : raw
  try {
    return JSON.parse(jsonStr)
  } catch (e) {
    throw new Error(`JSON invalido do modelo: ${e.message}`)
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
    const body = (await req.json()) as BriefToEditionRequest
    const mode = body.mode || 'brief'

    if (mode === 'page-regenerate') {
      if (!body.page || !body.page.template_slug) {
        return new Response(JSON.stringify({ error: 'missing page.template_slug' }), {
          status: 400, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
        })
      }
      const system = buildPageRegenPrompt(body)
      const userMsg = `Regere esta pagina conforme instrucoes.`
      const raw = await callAnthropic(system, userMsg, 4000)
      const parsed = extractJson(raw)
      return new Response(JSON.stringify({ slots: parsed.slots || parsed }), {
        status: 200, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      })
    }

    // mode = brief
    if (!body.brief || !body.brief.raw_content) {
      return new Response(JSON.stringify({ error: 'missing brief.raw_content' }), {
        status: 400, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      })
    }

    const system = buildBriefSystemPrompt(body)
    const userMsg = `Gere o plano completo da edicao baseado no brief.`
    const raw = await callAnthropic(system, userMsg, 12000)
    const parsed = extractJson(raw)
    const pages = Array.isArray(parsed.pages) ? parsed.pages : []

    return new Response(JSON.stringify({ pages }), {
      status: 200, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    })
  }
})
