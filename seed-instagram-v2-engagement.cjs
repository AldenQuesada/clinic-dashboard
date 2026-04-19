/* ============================================================
 * seed-instagram-v2-engagement.cjs
 *
 * Adiciona os 6 blocos da Onda 29 na LP /instagram-v2 em posições
 * ESTRATÉGICAS de conversão. Não destroi nada · só insere entre os
 * blocos existentes.
 *
 * SEQUÊNCIA FINAL DESEJADA:
 *   1. hero-cover           (já existia)
 *   2. live-counter NOVO    ← prova social ao vivo logo após o hero
 *   3. links-tree           (já existia)
 *   4. anatomy-quiz NOVO    ← CARRO-CHEFE · gera lead com contexto rico
 *   5. divider-legacy       (já existia)
 *   6. before-after-carousel(já existia)
 *   7. transformation-reel NOVO ← vídeo reforça resultados
 *   8. collagen-animation NOVO  ← educa + posiciona Mirian como autoridade
 *   9. testimonials         (já existia)
 *  10. smart-cta NOVO       ← botão contextual final
 *  11. cta-legacy           (já existia)
 *  12. smart-popup NOVO     ← invisível · dispara após 30s ou exit-intent
 *  13. footer               (já existia)
 *
 * Uso: node seed-instagram-v2-engagement.cjs
 * ============================================================ */

const { Client } = require('pg')

// ──────────────────────────────────────────────────────────
// Definição dos novos blocos (props prontas pra uso real)
// ──────────────────────────────────────────────────────────

const blockLiveCounter = {
  type: 'live-counter',
  props: {
    text_template: '{n} mulheres marcaram avaliação esta semana',
    days: '7',
    variant: 'card',
    min_count: '1',  // mostra mesmo com 1 lead recente · evita ficar oculto inicialmente
    bg: 'ivory',
  },
}

const blockAnatomyQuiz = {
  type: 'anatomy-quiz',
  props: {
    eyebrow: 'Quiz personalizado · 60 segundos',
    headline: 'Onde você quer mais cuidado?',
    subtitle: 'Toque nas áreas do rosto · receba um protocolo personalizado da Dra. Mirian',
    cta_label: 'Ver meu protocolo',
    success_text: 'Recebemos. A Dra. Mirian vai te chamar no WhatsApp em breve.',
    bg: 'ivory',
  },
}

const blockTransformationReel = {
  type: 'transformation-reel',
  props: {
    video_url: '',  // VAZIO · você adicionará o link do vídeo via inspector depois
    eyebrow: 'Resultado real',
    headline: '30 dias depois',
    cta_label: 'Quero o meu',
    cta_url: 'https://wa.me/5544998782003',
    aspect: '9/16',
    autoplay: 'yes',
  },
}

const blockCollagenAnimation = {
  type: 'collagen-animation',
  props: {
    eyebrow: 'A ciência por trás',
    headline: 'O que acontece com sua pele',
    lead: 'Cada protocolo da Dra. Mirian estimula a produção natural de colágeno · veja a evolução em 60 dias.',
    cta_label: 'Conversar com a Mirian',
    cta_url: 'https://wa.me/5544998782003',
    bg: 'cream',
  },
}

const blockSmartCTA = {
  type: 'smart-cta',
  props: {
    eyebrow: 'Próximo passo',
    headline: 'Pronta pra ver seu rosto renovado?',
    cta_default_label: 'Conhecer protocolos',
    cta_returning_label: 'Continuar minha avaliação',
    cta_after_social_proof_label: 'Falar com a Dra. Mirian',
    cta_url: 'https://wa.me/5544998782003',
    cta_style: 'whatsapp',
    bg: 'ivory',
  },
}

const blockSmartPopup = {
  type: 'smart-popup',
  props: {
    eyebrow: 'Espera!',
    headline: 'Quer um protocolo personalizado?',
    subtitle: 'Quiz visual de 60s · receba uma sugestão da Dra. Mirian no WhatsApp',
    image_url: '',
    cta_label: 'Fazer quiz',
    cta_url: 'https://wa.me/5544998782003',
    cta_style: 'champagne',
    trigger: 'time',
    after_seconds: '30',
    scroll_percent: '50',
    cooldown_hours: '24',
    variant: 'side',  // lateral direita · não-bloqueante
  },
}

// ──────────────────────────────────────────────────────────
// Execução
// ──────────────────────────────────────────────────────────
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

;(async () => {
  try {
    await c.connect()

    // 1. Pega blocks atuais da /instagram-v2
    const r = await c.query("SELECT id, blocks FROM lp_pages WHERE slug = 'instagram-v2'")
    if (!r.rows.length) { console.error('LP /instagram-v2 não encontrada'); process.exit(1) }
    const pageId = r.rows[0].id
    const current = r.rows[0].blocks

    console.log('═════ Estado atual ═════')
    current.forEach((b, i) => console.log(' ', String(i + 1).padStart(2), b.type))

    // 2. Monta nova sequência cirúrgica (insert após posições específicas)
    //    Posição 0-indexed (índice DEPOIS do qual inserir)
    //    hero(0) → +liveCounter → links(1) → +quiz → div(2) → ba(3) → +reel → +collagen → testim(4) → +smartCTA → cta(5) → +popup → footer(6)
    const novaSequencia = [
      current[0],                  // hero-cover
      blockLiveCounter,            // ← NOVO #2
      current[1],                  // links-tree
      blockAnatomyQuiz,            // ← NOVO #4
      current[2],                  // divider-legacy
      current[3],                  // before-after-carousel
      blockTransformationReel,     // ← NOVO #7
      blockCollagenAnimation,      // ← NOVO #8
      current[4],                  // testimonials
      blockSmartCTA,               // ← NOVO #10
      current[5],                  // cta-legacy
      blockSmartPopup,             // ← NOVO #12 (invisível visual · dispara via runtime)
      current[6],                  // footer
    ]

    console.log('\n═════ Nova sequência ═════')
    novaSequencia.forEach((b, i) => {
      const tag = current.includes(b) ? ' ' : '★'
      console.log(' ', tag, String(i + 1).padStart(2), b.type)
    })
    console.log('\n  ★ = bloco novo da Onda 29\n')

    // 3. Salva
    await c.query(
      "UPDATE lp_pages SET blocks = $1::jsonb, updated_at = now() WHERE id = $2",
      [JSON.stringify(novaSequencia), pageId]
    )
    await c.query("NOTIFY pgrst, 'reload schema'")

    console.log('═════ Resultado ═════')
    console.log('✓ /instagram-v2 atualizada com 6 blocos novos de conversão')
    console.log('✓ URL pública: https://clinicai-dashboard.px1hdq.easypanel.host/lp.html?s=instagram-v2')
    console.log('\nPróximos ajustes opcionais via construtor:')
    console.log('  · Adicionar URL de vídeo no transformation-reel')
    console.log('  · Customizar cores/textos via inspector')
    console.log('  · Trocar trigger do popup pra exit-intent se preferir')
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()
