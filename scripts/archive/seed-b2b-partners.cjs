/**
 * Seed dos 6 parceiros atuais (Moinho, Cazza Flor, Mentora, Academia, Mormaii, Osvaldo).
 * Usa b2b_partnership_upsert — idempotente.
 *
 * Uso: node scripts/archive/seed-b2b-partners.cjs
 */
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const client = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

const PARTNERS = [
  {
    slug: 'moinho',
    payload: {
      name: 'Moinho (Buffet de eventos)',
      pillar: 'evento', category: 'buffet_evento', tier: 2, type: 'occasion',
      dna_excelencia: 9, dna_estetica: 9, dna_proposito: 8,
      status: 'active',
      voucher_combo: 'avaliacao_harmonia_pre_noiva',
      voucher_validity_days: 60, voucher_min_notice_days: 15,
      contrapartida: ['indicacao_cruzada', 'co_divulgacao'],
      contrapartida_cadence: 'ad_hoc',
      sazonais: ['temporada_casamento'],
      slogans: ['O Moinho faz seu evento brilhar. A Clínica Mirian de Paula faz você brilhar.'],
      emotional_trigger: 'cuidado começou muito antes do evento',
      involved_professionals: ['mirian'],
    },
  },
  {
    slug: 'cazza-flor',
    payload: {
      name: 'Cazza Flor (Moda & Flores)',
      pillar: 'imagem', category: 'moda_premium', tier: 2, type: 'transactional',
      dna_excelencia: 8, dna_estetica: 10, dna_proposito: 8,
      status: 'active',
      voucher_combo: 'veu_noiva+anovator',
      voucher_validity_days: 30, voucher_min_notice_days: 15,
      contrapartida: ['producao_fotografica_mensal', 'video_institucional'],
      contrapartida_cadence: 'monthly',
      sazonais: ['dia_das_mulheres', 'natal', 'black_friday'],
      slogans: [
        'A Cazza Flor entrega o brilho que encanta, a Clínica Mirian de Paula entrega a beleza que transforma.',
        'Quando moda e estética se unem, o resultado é pura arte.',
        'Cazza Flor & Mirian de Paula — Beleza que brilha por dentro e por fora.',
      ],
      involved_professionals: ['mirian'],
    },
  },
  {
    slug: 'mentora-imagem',
    payload: {
      name: 'Mentora de Imagem (Autoridade feminina integrativa)',
      pillar: 'institucional', category: 'consultoria_imagem', tier: 1, type: 'institutional',
      dna_excelencia: 9, dna_estetica: 9, dna_proposito: 10,
      status: 'active',
      voucher_combo: 'voucher_mentoradas',
      contrapartida: ['conteudo_emocional', 'posicionamento_intelectual', 'acesso_publico_classe_ab'],
      contrapartida_cadence: 'monthly',
      contract_duration_months: 12, review_cadence_months: 3,
      slogans: ['Imagem, presença e refinamento estrutural facial.'],
      narrative_quote: 'Uma integração entre aparência, comportamento, comunicação e estrutura facial, promovendo autoridade feminina integrativa.',
      involved_professionals: ['mirian'],
    },
  },
  {
    slug: 'academia-gamificada',
    payload: {
      name: 'Academia (Gamificação com alunas)',
      pillar: 'fitness', category: 'academia_premium', tier: 2, type: 'institutional',
      dna_excelencia: 8, dna_estetica: 8, dna_proposito: 8,
      status: 'active',
      voucher_combo: 'veu_noiva_ganhadoras',
      voucher_delivery: ['gamified'],
      contrapartida: ['antes_e_depois_ganhadoras', 'reels_cocriados'],
      contrapartida_cadence: 'monthly',
      involved_professionals: ['mirian'],
    },
  },
  {
    slug: 'mormaii',
    payload: {
      name: 'Mormaii (Academia + eventos)',
      pillar: 'fitness', category: 'academia_premium', tier: 2, type: 'institutional',
      dna_excelencia: 8, dna_estetica: 8, dna_proposito: 9,
      status: 'active',
      voucher_combo: 'avaliacao_a51+veu_noiva',
      contrapartida: ['evento_mensal_aulao', 'palestra_dr_quesada', 'demo_protocolo', 'reels_cocriados'],
      contrapartida_cadence: 'monthly',
      sazonais: ['outubro_rosa'],
      slogans: [
        'Você sabia que quem treina aqui ganha estética premium?',
        'O treino agora vem com beleza inclusa.',
        'A gente cuida do seu corpo e da sua autoestima.',
      ],
      involved_professionals: ['mirian', 'quesada'],
    },
  },
  {
    slug: 'osvaldo-junior',
    payload: {
      name: 'Osvaldo Júnior (Juiz de paz & celebrante)',
      pillar: 'evento', category: 'celebrante_casamento', tier: 1, type: 'occasion',
      dna_excelencia: 9, dna_estetica: 8, dna_proposito: 10,
      status: 'active',
      voucher_combo: 'pacote_pre_noiva',
      voucher_validity_days: 60, voucher_min_notice_days: 30,
      contrapartida: ['indicacao_noivas', 'co_presenca_eventos'],
      contrapartida_cadence: 'monthly',
      monthly_value_cap_brl: 60000,
      slogans: [
        'Quando o Osvaldo diz "pode beijar a noiva", nasce um novo capítulo. E a Clínica Mirian de Paula estará lá.',
        'A união de duas artes: a arte de celebrar o amor e a arte de revelar a beleza.',
      ],
      narrative_quote: 'Amar é desejar que o outro floresça. E cada noiva que passa por mim carrega um novo florescer. Agora, com o toque da Clínica Mirian de Paula, esse florescer se torna visível: na pele, no olhar e no brilho de estar viva.',
      narrative_author: 'Osvaldo Júnior',
      emotional_trigger: 'pode beijar a noiva',
      involved_professionals: ['mirian'],
    },
  },
]

async function main() {
  console.log('=== Seed B2B Partners ===\n')
  await client.connect()

  for (var i = 0; i < PARTNERS.length; i++) {
    const p = PARTNERS[i]
    try {
      const r = await client.query(
        'SELECT public.b2b_partnership_upsert($1::text, $2::jsonb) AS r',
        [p.slug, JSON.stringify(p.payload)]
      )
      const out = r.rows[0].r
      console.log('  ✓', p.slug, '→', out.ok ? 'OK (id=' + out.id + ')' : 'FAIL: ' + JSON.stringify(out))
    } catch (e) {
      console.log('  ✗', p.slug, '→ ERRO:', e.message)
    }
  }

  const total = await client.query('SELECT COUNT(*)::int AS c FROM public.b2b_partnerships')
  console.log('\nTotal parcerias na base:', total.rows[0].c)

  await client.end()
  console.log('\n✓ Done.')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
