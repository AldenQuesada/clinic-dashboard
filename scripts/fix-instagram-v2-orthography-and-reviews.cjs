/**
 * Aplica em /instagram-v2:
 *  1) Correcoes de ortografia em multiplos blocos (acentos PT, cedilhas)
 *  2) Substitui 3 testimonials fake pelos 4 reviews reais do Google
 */
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(
  'https://oqboitkpcvuaudouwvkl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
)

// Reviews reais (limpos · sem emoji · ortografia correta)
const REAL_REVIEWS = [
  {
    nome:  'Jackeline Hanelt',
    body:  'Maravilhosa a experiência do início ao fim. A Dra. Mirian é uma profissional experiente, com competência e qualidade de sobra. O ambiente é agradável, as atendentes impecáveis. O procedimento foi tranquilo e o resultado ainda melhor. Estou encantada. Muito obrigada pelo carinho.',
    meta:  'Google · Local Guide · 27 avaliações',
    stars: 5,
  },
  {
    nome:  'Paciente da Clínica',
    body:  'Atendimento de altíssima qualidade, muito feliz com meus resultados. Sou paciente há anos da Mirian.',
    meta:  'Google · há 2 semanas',
    stars: 5,
  },
  {
    nome:  'Elaine Cristina Frameschi',
    body:  'Foi incrível. Pessoas abençoadas estão ali para nos dar o atendimento que merecemos. Amei e voltarei mais e mais vezes — desde a recepção com a Lu até a Dra. Mirian.',
    meta:  'Google · há 3 semanas',
    stars: 5,
  },
  {
    nome:  'Rhayane A. Meneghetti',
    body:  'Atendimento impecável, estou muito satisfeita com todos os procedimentos que fiz!',
    meta:  'Google · 9 avaliações · há 3 semanas',
    stars: 5,
  },
]

;(async () => {
  const { data: page, error } = await sb
    .from('lp_pages').select('id, blocks').eq('slug', 'instagram-v2').single()
  if (error || !page) { console.error(error); process.exit(1) }

  const blocks = (page.blocks || []).map(b => {
    const p = Object.assign({}, b.props || {})

    if (b.type === 'before-after-carousel') {
      p.slides = (p.slides || []).map(s => {
        if (!s) return s
        const out = Object.assign({}, s)
        if (out.detail)    out.detail    = out.detail.replace(/Lifitin/g, 'Lifting').replace(/precisao/g, 'precisão').replace(/apos/g, 'após').replace(/acido/g, 'ácido').replace(/hialuronico/g, 'hialurônico')
        if (out.procedure) out.procedure = out.procedure.replace(/Restauracao/g, 'Restauração').replace(/Lifitin/g, 'Lifting')
        return out
      })
    }

    if (b.type === 'before-after-reveal') {
      if (p.detail)    p.detail    = p.detail.replace(/Lifitin/g, 'Lifting')
      if (p.procedure) p.procedure = p.procedure.replace(/Lifitin/g, 'Lifting')
    }

    if (b.type === 'testimonials') {
      p.eyebrow = 'Quem já viveu a experiência'
      p.h2      = 'Depoimentos'
      p.items   = REAL_REVIEWS
    }

    if (b.type === 'cta-legacy') {
      if (p.subtitle) p.subtitle = p.subtitle.replace(/Avaliacão/g, 'Avaliação')
    }

    if (b.type === 'links-tree') {
      if (p.eyebrow) p.eyebrow = p.eyebrow.replace(/rapido/g, 'rápido')
      p.items = (p.items || []).map(it => {
        if (!it) return it
        const o = Object.assign({}, it)
        if (o.titulo)    o.titulo    = o.titulo.replace(/Localizacao/g, 'Localização')
        if (o.subtitulo) o.subtitulo = o.subtitulo.replace(/clinica/g, 'clínica')
        return o
      })
    }

    if (b.type === 'footer') {
      if (p.copyright) p.copyright = p.copyright.replace(/Clinica/g, 'Clínica')
      if (p.tagline)   p.tagline   = p.tagline.replace(/Precisao/g, 'Precisão')
    }

    return Object.assign({}, b, { props: p })
  })

  const { error: upErr } = await sb
    .from('lp_pages')
    .update({ blocks, updated_at: new Date().toISOString() })
    .eq('id', page.id)
  if (upErr) { console.error(upErr); process.exit(1) }

  console.log('OK · ortografia corrigida + 4 reviews reais aplicados em /instagram-v2')
})()
