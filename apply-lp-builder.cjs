/* ============================================================
 * apply-lp-builder.cjs
 *
 * 1) Aplica migration 20260700000201_lp_builder.sql
 * 2) Seed das 2 LPs existentes (Lifting-5D + Smooth-Eyes) como
 *    paginas published, com TODOS os blocos derivados dos HTMLs.
 * 3) Verifica que as RPCs respondem.
 *
 * Uso:
 *   node apply-lp-builder.cjs
 *
 * IMPORTANTE: HTMLs estaticos (lp-lifting-5d.html, lp-smooth-eye.html)
 * NAO sao tocados. As versoes do banco ficam disponiveis em:
 *   /lp.html?s=lifting-5d
 *   /lp.html?s=smooth-eyes
 * ============================================================ */

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const sql = fs.readFileSync(
  path.join(__dirname, 'supabase/migrations/20260700000201_lp_builder.sql'),
  'utf8'
)

// ────────────────────────────────────────────────────────────
// SVG icons (Feather) reusados nos benefits
// ────────────────────────────────────────────────────────────
const SVG = {
  shield:    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12l4 4L21 2"/><path d="M20 7v5a9 9 0 1 1-5-8"/></svg>',
  globe:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
  layers:    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
  message:   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  align:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  sun:       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  smile:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
  eye:       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  shieldOn:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
}

// ────────────────────────────────────────────────────────────
// Blocos comuns
// ────────────────────────────────────────────────────────────
const NAV = (waMsg) => ({
  type: 'nav',
  props: {
    brand_small: 'Clinica',
    brand_name: 'Mirian de Paula',
    cta_enabled: true,
    cta: { label: 'Agendar avaliacao', message_wa: waMsg },
  },
})

const FOOTER = () => ({
  type: 'footer',
  props: {
    brand_name: 'Clinica Mirian de Paula',
    tagline: 'Harmonia que revela · Precisao que dura',
    copyright: '© Clinica Mirian de Paula · Medicina estetica facial com protocolos integrados',
  },
})

const DOCTOR_LIFTING = (bg) => ({
  type: 'doctor-block',
  props: {
    eyebrow: 'Sobre a especialista',
    h2: 'Dra. Mirian de Paula',
    foto_initial: 'M',
    bg,
    paragrafos: [
      'Ha mais de uma decada dedicada a harmonia facial de mulheres que ja chegaram. Quem conquistou tudo, menos o espelho. Tecnica precisa, olhar de conselheira. Nao cria tendencias, constroi processos pensados pra durar.',
      'Cada Avaliacao de Harmonia Facial comeca com escuta antes do protocolo. So depois de entender quem voce e, o que incomoda e onde quer chegar, a proposta e desenhada. Naturalidade nao e acaso. E projeto.',
    ],
  },
})

const DOCTOR_SMOOTH = (bg) => ({
  type: 'doctor-block',
  props: {
    eyebrow: 'Sobre a especialista',
    h2: 'Dra. Mirian de Paula',
    foto_initial: 'M',
    bg,
    paragrafos: [
      'Trabalha a regiao dos olhos com a mesma precisao que trabalha um rosto inteiro, porque e la que o cansaco fala mais alto, e e la que a suavidade aparece primeiro. Tecnica conservadora, leitura individual e a conviccao de que cada par de olhos carrega uma historia que nao pode ser apagada.',
      'A avaliacao comeca com escuta. Qual era o seu olhar antes? O que incomoda hoje? O que voce quer ver no espelho daqui a cinco anos? So depois o protocolo toma forma.',
    ],
  },
})

// ────────────────────────────────────────────────────────────
// LP Lifting-5D
// ────────────────────────────────────────────────────────────
const LP_LIFTING = {
  slug: 'lifting-5d',
  title: 'Protocolo Lifting 5D · Clinica Mirian de Paula',
  meta_title: 'Protocolo Lifting 5D · Clinica Mirian de Paula',
  meta_description: 'Protocolo integrado de rejuvenescimento facial que une injetaveis de alta performance e Fotona 4D com cashback total. O rejuvenescimento real nao e um evento isolado.',
  blocks: [
    NAV('Ola! Tenho interesse no Protocolo Lifting 5D e gostaria de agendar uma Avaliacao de Harmonia Facial.'),
    {
      type: 'hero-split',
      props: {
        eyebrow: 'Protocolo Lifting 5D · Full Face',
        h1: 'O rejuvenescimento real nao e um evento. E um processo.',
        lead: 'Para mulheres que nao querem apenas melhorar o rosto. Querem reconciliar quem sao por dentro com o que veem no espelho.',
        cta_primary: {
          label: 'Agendar minha avaliacao',
          message_wa: 'Ola! Tenho interesse no Protocolo Lifting 5D e gostaria de agendar minha Avaliacao de Harmonia Facial.',
        },
        cta_secondary: {
          label: 'Entender o protocolo',
          message_wa: '',
          url: '#como-funciona',
        },
        visual_image: '',
        visual_placeholder: '5D',
      },
    },
    {
      type: 'problema-center',
      props: {
        eyebrow: 'Para quem',
        h2: 'Voce reconhece sua lideranca por dentro. O espelho ainda nao.',
        lead: 'A flacidez profunda apareceu. O contorno mudou. Procedimentos isolados dao um resultado, mas no mes seguinte volta a parecer cansada. Voce nao quer transformacao radical. Quer que o espelho volte a te reconhecer.',
        bg: 'bege',
      },
    },
    {
      type: 'cards-2col',
      props: {
        eyebrow: 'O protocolo integrado',
        h2: 'Duas frentes que se complementam e se potencializam.',
        intro: 'Na Clinica Mirian de Paula, nao tratamos procedimentos isolados. O Lifting 5D e um programa integrativo de reestruturacao e rejuvenescimento, pensado como um todo, respeitando o tempo biologico da pele e a identidade de quem esta sendo cuidada.',
        bg: 'ivory',
        cards: [
          {
            numero: '01',
            kicker: 'Frente 1',
            titulo: 'Injetaveis de alta performance',
            paragrafos: [
              '*Acido Hialuronico* para reposicao estrategica de volume.',
              '*Bioremodelador de colageno* para estimular qualidade e sustentacao da pele.',
              '*Bioestimuladores* para garantir firmeza progressiva e espessura dermica.',
              '*Toxina botulinica* para suavizar marcas de expressao, sem congelar a identidade.',
            ],
          },
          {
            numero: '02',
            kicker: 'Frente 2',
            titulo: 'Tecnologia Fotona 4D',
            paragrafos: [
              'Ao fechar o protocolo, voce recebe *3 sessoes de Fotona 4D*, o melhor laser do mundo, uma a cada mes.',
              'Atua em *todas as camadas do rosto*, das estruturas profundas a superficie da pele. Nao apenas trata sinais visiveis: ativa regeneracao real, estimula colageno de forma intensa e devolve firmeza, vico e juventude natural.',
            ],
          },
        ],
      },
    },
    {
      type: 'quote-narrative',
      props: {
        quote: 'Porque o rejuvenescimento de verdade nao e mudar quem voce e. E fazer o espelho voltar a te reconhecer.',
        bg: 'accent',
      },
    },
    {
      type: 'benefits-grid',
      props: {
        eyebrow: 'Resultados',
        h2: 'O que o Lifting 5D entrega.',
        items: [
          { icon_svg: SVG.shield, titulo: 'Lifting e firmeza', desc: 'Efeito lifting nao invasivo tratando a flacidez profunda, com acao que vai de dentro pra fora, incluindo a regiao intraoral.' },
          { icon_svg: SVG.globe, titulo: 'Rejuvenescimento global', desc: '5 modos de laser tratam as 4 camadas da pele em uma unica sessao. Rejuvenescimento completo e uniforme.' },
          { icon_svg: SVG.layers, titulo: 'Producao de colageno', desc: 'Estimula intensamente colageno e elastina. Elasticidade e firmeza que se sustentam a longo prazo.' },
          { icon_svg: SVG.message, titulo: 'Textura e tom uniformes', desc: 'Reduz poros, suaviza cicatrizes de acne, estrias e irregularidades. Pele lisa e macia.' },
          { icon_svg: SVG.align, titulo: 'Reducao de sinais de envelhecimento', desc: 'Rugas e linhas finas suavizadas. Bigode chines tratado com efeito preenchedor sutil.' },
          { icon_svg: SVG.sun, titulo: 'Resultados naturais e com glow', desc: 'Aspecto rejuvenescido com firmeza, elasticidade e brilho proprio. Recuperacao mais rapida que outros lasers.' },
        ],
      },
    },
    {
      type: 'investimento',
      props: {
        eyebrow: 'Investimento consciente',
        h2: 'Full Face com cashback total.',
        valor: 'R$ 12.000 a R$ 15.000',
        sub: 'Valor personalizado conforme protocolo indicado na sua Avaliacao de Harmonia.',
        badge_text: '3 Sessoes Fotona 4D inclusas',
        descricao: 'Cada sessao de Fotona 4D tem custo avulso de R$ 5.000, totalizando R$ 15.000 nas tres sessoes. Ao fechar o Full Face, esse valor volta pra voce integralmente em forma de cashback. Seu investimento nos injetaveis retorna como tecnologia.',
        cta: {
          label: 'Conversar sobre meu protocolo',
          message_wa: 'Ola! Quero conhecer o Protocolo Lifting 5D Full Face e entender o investimento no meu caso.',
        },
        bg_section: 'bege',
      },
    },
    {
      type: 'list-rich',
      props: {
        eyebrow: 'Cuidado continuo',
        h2: 'Nao fazemos procedimentos. Cuidamos do futuro do seu rosto.',
        intro: 'Depois do Full Face, voce entra no programa de cuidado continuo da clinica. O que isso significa:',
        items: [
          { titulo: '40% de beneficio exclusivo em Fotona 4D',
            desc: 'Todos os anos, mantendo o acompanhamento facial, voce garante condicao exclusiva nas sessoes de manutencao, preservando firmeza, colageno e qualidade da pele ao longo do tempo.' },
          { titulo: 'Condicoes permanentes em qualquer Fotona',
            desc: 'Flacidez corporal, estrias, lipedema, intimo, capilar. Qualquer procedimento Fotona tem condicao especial permanente pra quem ja esta no protocolo.' },
          { titulo: 'Retoques e ajustes com prioridade',
            desc: 'Botox, labios, olheiras ou qualquer procedimento complementar. Condicoes especiais permanentes, justamente por voce ja estar no protocolo de cuidado global.' },
        ],
      },
    },
    DOCTOR_LIFTING('bege'),
    {
      type: 'faq',
      props: {
        eyebrow: 'Perguntas frequentes',
        h2: 'As duvidas que escutamos antes de cada protocolo.',
        bg: 'ivory',
        items: [
          { pergunta: 'Quanto tempo dura o protocolo completo?',
            resposta: 'O Full Face com as tres sessoes de Fotona 4D se estende por aproximadamente tres meses. Uma sessao de laser por mes, intercalada com os injetaveis conforme o plano de tratamento personalizado da sua avaliacao.' },
          { pergunta: 'O resultado parece natural mesmo?',
            resposta: 'Essa e a espinha dorsal do nosso trabalho. O protocolo e desenhado pra que ninguem perceba exatamente o que foi feito. Percebam apenas que voce esta descansada, em harmonia. Nunca congelamos expressao. Nunca trocamos sua identidade.' },
          { pergunta: 'Por que o cashback existe?',
            resposta: 'Porque o protocolo completo so faz sentido quando as duas frentes acontecem juntas. Ao incluir o valor das tres sessoes de Fotona como cashback do Full Face, garantimos que voce faca o programa integral, que e o que gera o resultado real e duradouro.' },
          { pergunta: 'Vou precisar repetir isso todo ano?',
            resposta: 'Nao. O Lifting 5D e um investimento-base. Depois dele, entram manutencoes leves anuais com condicoes especiais. Nao sao "comecar do zero" como quando se faz procedimentos isolados.' },
          { pergunta: 'Como e a recuperacao da Fotona 4D?',
            resposta: 'A Fotona tem recuperacao significativamente mais rapida que outros lasers. A maioria das pacientes retoma a rotina social no dia seguinte. Os detalhes do seu caso especifico sao conversados na avaliacao.' },
          { pergunta: 'Como comeco?',
            resposta: 'Com a Avaliacao de Harmonia Facial. E nesse encontro que ouvimos voce, avaliamos tecnicamente e desenhamos o protocolo pra sua historia. So depois disso falamos de investimento e prazos. Para agendar, basta nos mandar uma mensagem aqui no WhatsApp.' },
        ],
      },
    },
    {
      type: 'cta-final',
      props: {
        eyebrow: 'Proximo passo',
        h2: 'Seu rosto deveria mostrar quem voce e, nao quanto tempo passou.',
        lead: 'A Avaliacao de Harmonia Facial e o inicio. Um encontro sereno, tecnico e personalizado pra entender o que o seu rosto precisa e o que merece.',
        cta: {
          label: 'Agendar minha Avaliacao de Harmonia',
          message_wa: 'Ola, Dra. Mirian! Gostaria de agendar minha Avaliacao de Harmonia Facial pra conhecer o Protocolo Lifting 5D.',
        },
      },
    },
    FOOTER(),
  ],
}

// ────────────────────────────────────────────────────────────
// LP Smooth-Eyes
// ────────────────────────────────────────────────────────────
const LP_SMOOTH = {
  slug: 'smooth-eyes',
  title: 'Protocolo de Olheiras e Palpebras · Clinica Mirian de Paula',
  meta_title: 'Protocolo de Olheiras e Palpebras · Clinica Mirian de Paula',
  meta_description: 'Protocolo integrado para tratar o olhar respeitando anatomia e idade biologica. Correcao de olheiras com acido hialuronico + fortalecimento da pele da palpebra com Smooth Eyes (Fotona Dynamis Nx).',
  blocks: [
    NAV('Ola! Tenho interesse no Protocolo de Olheiras e Palpebras e gostaria de agendar minha avaliacao.'),
    {
      type: 'hero-split',
      props: {
        eyebrow: 'Protocolo Olheiras + Smooth Eyes',
        h1: 'Olheiras profundas nao sao frescura. Sao uma questao de harmonizacao.',
        lead: 'Mudam a percepcao de cansaco. Alteram a expressao que voce carrega pro mundo. E respondem muito bem ao protocolo certo, quando quem cuida respeita a anatomia, a idade e o tempo natural da pele.',
        cta_primary: {
          label: 'Agendar minha avaliacao',
          message_wa: 'Ola! Tenho interesse no Protocolo de Olheiras e Palpebras. Gostaria de agendar minha avaliacao.',
        },
        cta_secondary: {
          label: 'Entender o protocolo',
          message_wa: '',
          url: '#como-funciona',
        },
        visual_placeholder: '◉',
      },
    },
    {
      type: 'problema-center',
      props: {
        eyebrow: 'Para quem',
        h2: 'Voce dorme bem. Mas o espelho conta outra historia.',
        lead: 'Olheiras profundas, sulco marcado, palpebra comecando a ceder. Correcoes soltas resolvem por um tempo. Depois a flacidez volta, ou o resultado fica artificial. A regiao dos olhos exige um protocolo que olhe pra pele e pra estrutura ao mesmo tempo.',
        bg: 'bege',
      },
    },
    {
      type: 'list-simple',
      props: {
        eyebrow: 'O que o protocolo entrega',
        h2: 'Tratar o olhar de forma estrategica.',
        items: [
          { texto: 'Corrigir olheiras profundas e sulcos.' },
          { texto: 'Melhorar a qualidade e resistencia da pele da palpebra.' },
          { texto: 'Prevenir a flacidez palpebral futura.' },
          { texto: 'Manter resultado natural, elegante e duradouro.' },
        ],
      },
    },
    {
      type: 'cards-2col',
      props: {
        eyebrow: 'O protocolo completo',
        h2: 'Duas etapas. Uma sessao de 1h30.',
        intro: 'Aqui nao tratamos apenas o problema visivel. Tratamos o processo de envelhecimento do olhar, corrigindo o que aparece hoje e protegendo a pele pro que vem amanha.',
        bg: 'bege',
        cards: [
          {
            numero: '01',
            kicker: 'Etapa 1 · Smooth Eyes',
            titulo: 'Fortalecimento da pele da palpebra',
            paragrafos: [
              'Protocolo com laser *Fotona Dynamis Nx*, voltado para melhorar a qualidade da pele dos parpados.',
              '*Estimula:* producao de colageno · espessamento e fortalecimento · textura e firmeza.',
              '*Indicado para:* 35+ com pele fina e fragil, inicio de flacidez, risco de queda futura.',
            ],
          },
          {
            numero: '02',
            kicker: 'Etapa 2 · Preenchimento',
            titulo: 'Correcao das olheiras com acido hialuronico',
            paragrafos: [
              'Preenchimento com *acido hialuronico especifico para a regiao dos olhos*, escolhido caso a caso conforme profundidade da olheira, qualidade da pele e estrutura ossea.',
              'Corrige o sulco, restaura o suporte perdido com o envelhecimento, suaviza sombras e irregularidades. Tecnica conservadora, priorizando naturalidade e seguranca.',
            ],
          },
        ],
      },
    },
    {
      type: 'quote-narrative',
      props: {
        quote: 'Enquanto muitas clinicas apenas preenchem a olheira, ignorando a qualidade da pele, nosso protocolo associa correcao e prevencao, respeitando a idade biologica.',
        bg: 'accent',
      },
    },
    {
      type: 'benefits-grid',
      props: {
        eyebrow: 'O que voce vai ver',
        h2: 'O resultado esperado.',
        items: [
          { icon_svg: SVG.smile, titulo: 'Olhar leve e descansado', desc: 'Aspecto rejuvenescido sem parecer "feito". O cansaco sai da expressao.' },
          { icon_svg: SVG.eye, titulo: 'Olheiras suavizadas com naturalidade', desc: 'Tecnica conservadora escolhida caso a caso. Nada de cheio, saliente ou artificial.' },
          { icon_svg: SVG.layers, titulo: 'Pele da palpebra firme e resistente', desc: 'Mais colageno, mais espessura, mais sustentacao, a curto e longo prazo.' },
          { icon_svg: SVG.shieldOn, titulo: 'Prevencao da flacidez futura', desc: 'Prolonga o resultado e protege a pele ao longo dos anos, reduzindo intervencoes invasivas.' },
        ],
      },
    },
    {
      type: 'investimento',
      props: {
        eyebrow: 'Investimento',
        h2: 'Protocolo completo em uma unica sessao.',
        valor: 'R$ 1.500',
        sub: 'Duracao: 1h30 · Etapa 1 (Smooth Eyes) + Etapa 2 (acido hialuronico)',
        badge_text: 'Smooth Eyes incluso',
        descricao: 'Uma sessao avulsa de Smooth Eyes custa R$ 2.500 no mercado. Ao fazer o protocolo integrado, voce nao paga a tecnologia separadamente. Ela vem junto, somando os ganhos de ambas as etapas em uma unica experiencia.',
        cta: {
          label: 'Conversar sobre o meu olhar',
          message_wa: 'Ola! Quero agendar o Protocolo de Olheiras e Palpebras. Gostaria de conversar sobre o meu caso.',
        },
        bg_section: 'bege',
      },
    },
    DOCTOR_SMOOTH('ivory'),
    {
      type: 'faq',
      props: {
        eyebrow: 'Perguntas frequentes',
        h2: 'O que escutamos antes de cada protocolo.',
        bg: 'bege',
        items: [
          { pergunta: 'Quanto tempo dura a sessao completa?',
            resposta: 'Aproximadamente 1h30, incluindo as duas etapas em um unico encontro: Smooth Eyes (laser Fotona Dynamis Nx) e o preenchimento com acido hialuronico especifico pra regiao dos olhos.' },
          { pergunta: 'E doloroso?',
            resposta: 'Usamos tecnica e anestesia adequadas pra cada etapa. A regiao e sensivel, mas a grande maioria das pacientes descreve o procedimento como muito toleravel. Detalhes do manejo sao conversados na avaliacao.' },
          { pergunta: 'Quanto tempo dura o resultado?',
            resposta: 'O preenchimento com acido hialuronico especifico pra olhos tem durabilidade que varia conforme cada pele. O Smooth Eyes potencializa a durabilidade e previne a flacidez futura. Quanto mais cedo entra no protocolo, mais longe se chega.' },
          { pergunta: 'Qualquer paciente pode fazer?',
            resposta: 'O protocolo Smooth Eyes e indicado a partir dos 35 anos ou em qualquer paciente com pele fina e fragil na regiao, inicio de flacidez palpebral ou risco futuro de queda. Na avaliacao confirmamos se e o momento certo pra voce.' },
          { pergunta: 'A recuperacao atrapalha minha rotina?',
            resposta: 'A Fotona Dynamis Nx tem recuperacao rapida. Cada caso e individual, mas a maioria das pacientes volta a rotina social sem complicacoes. Na avaliacao explicamos o que esperar no seu perfil especifico.' },
          { pergunta: 'Como comeco?',
            resposta: 'Com uma avaliacao personalizada. Ouvimos voce, analisamos profundidade da olheira, qualidade da pele, estrutura ossea, e so depois desenhamos o protocolo. Para agendar, basta uma mensagem no WhatsApp.' },
        ],
      },
    },
    {
      type: 'cta-final',
      props: {
        eyebrow: 'Proximo passo',
        h2: 'Seu olhar diz quem voce e. Ele merece ser cuidado assim.',
        lead: 'A avaliacao e um encontro sereno, tecnico e personalizado pra entender o que o seu olhar precisa e o que a sua pele comporta. So depois falamos de protocolo e investimento.',
        cta: {
          label: 'Agendar minha avaliacao',
          message_wa: 'Ola, Dra. Mirian! Gostaria de agendar uma avaliacao pra conhecer o Protocolo de Olheiras e Palpebras.',
        },
      },
    },
    FOOTER(),
  ],
}

// ────────────────────────────────────────────────────────────
// Apply
// ────────────────────────────────────────────────────────────
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

;(async () => {
  try {
    await c.connect()
    console.log('[lp-builder] conexao OK')

    // 1) Migration
    await c.query(sql)
    console.log('[lp-builder] migration aplicada')

    // 2) Seed via lp_page_save
    for (const lp of [LP_LIFTING, LP_SMOOTH]) {
      // verifica se ja existe (pra reaplicacoes)
      const existing = await c.query(
        `SELECT id FROM public.lp_pages WHERE slug = $1 LIMIT 1`,
        [lp.slug]
      )
      const id = existing.rows[0] ? existing.rows[0].id : null

      const r = await c.query(
        `SELECT public.lp_page_save(
           $1::uuid, $2::text, $3::text, $4::jsonb, $5::jsonb,
           $6::text, $7::text, $8::text, $9::text
         ) AS result`,
        [
          id,
          lp.slug,
          lp.title,
          JSON.stringify(lp.blocks),
          JSON.stringify({}),  // tokens_override vazio (usa defaults)
          'published',
          lp.meta_title,
          lp.meta_description,
          null,                // og_image_url
        ]
      )
      console.log('[lp-builder] seed', lp.slug, '→', r.rows[0].result)

      // cria revision inicial
      const pageId = r.rows[0].result.id
      if (pageId) {
        await c.query(
          `SELECT public.lp_revision_create($1::uuid, $2, $3) AS result`,
          [pageId, 'initial-seed', 'system']
        )
      }
    }

    // 3) Reload schema (pra RPCs ficarem visiveis pro PostgREST)
    await c.query("NOTIFY pgrst, 'reload schema'")
    console.log('[lp-builder] schema reloaded')

    // 4) Verificacoes
    const tables = await c.query(`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name IN ('lp_pages','lp_revisions')
       ORDER BY table_name
    `)
    console.log('[lp-builder] tabelas:', tables.rows.map(r => r.table_name).join(', '))

    const fns = await c.query(`
      SELECT proname FROM pg_proc
       WHERE proname IN (
         'lp_page_resolve','lp_page_track_view','lp_page_track_conversion',
         'lp_page_list','lp_page_get','lp_page_save','lp_page_delete','lp_page_publish',
         'lp_revision_create','lp_revision_restore','lp_revision_list'
       )
       ORDER BY proname
    `)
    console.log('[lp-builder] RPCs:', fns.rows.map(r => r.proname).join(', '))

    const pages = await c.query(`
      SELECT slug, title, status, jsonb_array_length(blocks) AS n_blocks
        FROM public.lp_pages
       ORDER BY slug
    `)
    console.log('[lp-builder] paginas:')
    pages.rows.forEach(p => {
      console.log('  · /' + p.slug + ' [' + p.status + '] · ' + p.n_blocks + ' blocos · ' + p.title)
    })

    console.log('\n✓ Sprint 1 do LP Builder aplicado.')
    console.log('  Teste: https://clinicai-dashboard.px1hdq.easypanel.host/lp.html?s=lifting-5d')
    console.log('  Teste: https://clinicai-dashboard.px1hdq.easypanel.host/lp.html?s=smooth-eyes')
  } catch (e) {
    console.error('ERROR:', e.message)
    if (e.position) console.error('POSITION:', e.position)
    process.exit(1)
  } finally {
    await c.end()
  }
})()
