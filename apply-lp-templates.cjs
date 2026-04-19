/* ============================================================
 * apply-lp-templates.cjs
 *
 * Cria tabela lp_templates + 3 RPCs + seed com 5 playbooks premium.
 *
 * Templates 1 e 2: copia blocks das LPs lifting-5d e smooth-eyes
 *   já existentes no banco, e adiciona testimonials + before-after.
 * Templates 3, 4, 5: criados do zero com copy seed real.
 *
 * Idempotente. Pré-requisito: lp_pages com lifting-5d e smooth-eyes
 *   seedadas (apply-lp-builder.cjs).
 *
 * Uso:
 *   node apply-lp-templates.cjs
 * ============================================================ */

const { Client } = require('pg')

const sqlSchema = `
CREATE TABLE IF NOT EXISTS public.lp_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  description  text,
  category     text NOT NULL DEFAULT 'geral',
  blocks       jsonb NOT NULL DEFAULT '[]'::jsonb,
  tokens_override jsonb DEFAULT '{}'::jsonb,
  sort_order   int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lp_templates_category_chk CHECK (category IN
    ('protocolo','sessao','educativo','promo','social','outro'))
);

CREATE INDEX IF NOT EXISTS idx_lp_templates_category ON public.lp_templates (category);
CREATE INDEX IF NOT EXISTS idx_lp_templates_sort     ON public.lp_templates (sort_order, name);

ALTER TABLE public.lp_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lp_templates_read ON public.lp_templates;
CREATE POLICY lp_templates_read ON public.lp_templates FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.lp_template_list()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',          t.id,
        'slug',        t.slug,
        'name',        t.name,
        'description', t.description,
        'category',    t.category,
        'block_count', jsonb_array_length(t.blocks),
        'block_types', (
          SELECT jsonb_agg(b->>'type')
            FROM jsonb_array_elements(t.blocks) b
        )
      ) ORDER BY t.sort_order, t.name
    )
    FROM public.lp_templates t
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.lp_template_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.lp_templates%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.lp_templates WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object(
    'ok',              true,
    'id',              v.id,
    'slug',            v.slug,
    'name',            v.name,
    'description',     v.description,
    'category',        v.category,
    'blocks',          v.blocks,
    'tokens_override', v.tokens_override
  );
END $$;

CREATE OR REPLACE FUNCTION public.lp_template_use(
  p_id        uuid,
  p_new_slug  text,
  p_new_title text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tpl public.lp_templates%ROWTYPE;
  v_id  uuid;
BEGIN
  IF p_new_slug IS NULL OR length(trim(p_new_slug)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slug_required');
  END IF;
  SELECT * INTO v_tpl FROM public.lp_templates WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'template_not_found');
  END IF;

  INSERT INTO public.lp_pages (slug, title, blocks, tokens_override, status)
  VALUES (
    p_new_slug,
    COALESCE(p_new_title, v_tpl.name),
    v_tpl.blocks,
    COALESCE(v_tpl.tokens_override, '{}'::jsonb),
    'draft'
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'slug_already_exists');
END $$;

GRANT EXECUTE ON FUNCTION public.lp_template_list() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lp_template_get(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lp_template_use(uuid, text, text) TO anon, authenticated;
`

// ────────────────────────────────────────────────────────────
// Seed dos 5 playbooks
// ────────────────────────────────────────────────────────────

// Blocos extras pra adicionar nos templates 1 e 2
const BLOCK_TESTIMONIALS_CAROUSEL = {
  type: 'testimonials',
  props: {
    eyebrow: 'O que dizem',
    h2: 'Pacientes que viveram a mudança.',
    layout: 'carousel',
    show_stars: true,
    bg: 'bege',
    items: [
      {
        body: 'Saí da clínica com a sensação de que tinham olhado pra mim, não pro meu rosto. O resultado veio sem pressa, sem exagero. As pessoas dizem que eu estou descansada — exatamente o que eu queria ouvir.',
        nome: 'Fernanda L.',
        meta: '47 anos · Lifting facial',
        stars: 5,
      },
      {
        body: 'Já tinha feito procedimentos antes, em outras clínicas. A diferença aqui é o cuidado em entender o conjunto. A Dra. me explicou cada passo. Hoje me olho no espelho e me reconheço — só mais leve.',
        nome: 'Carla M.',
        meta: '52 anos · Smooth Eyes',
        stars: 5,
      },
      {
        body: 'Cheguei insegura, com medo de ficar com cara de "feito". Saí com vontade de voltar. O atendimento é tão sereno quanto o resultado.',
        nome: 'Patrícia R.',
        meta: '49 anos · Harmonização',
        stars: 5,
      },
    ],
  },
}

const BLOCK_BEFORE_AFTER = {
  type: 'before-after',
  props: {
    eyebrow: 'Resultados reais',
    h2: 'Ajustes sutis. Diferença visível.',
    intro: 'Arraste a barra pra comparar antes e depois. Pacientes reais, autorizados a aparecer.',
    direction: 'horizontal-lr',
    bg: 'ivory',
    items: [
      {
        before_url: 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=800&q=80',
        after_url:  'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800&q=80',
        caption: 'Resultado após 3 sessões · 60 dias',
      },
    ],
  },
}

const BLOCK_FORM = {
  type: 'form-inline',
  props: {
    eyebrow: 'Quero ser chamada',
    h2: 'Deixe seu contato. A gente entra em contato.',
    intro: 'Em até 24h alguém da clínica responde por WhatsApp.',
    fields: [
      { key: 'nome',      label: 'Nome',      type: 'text',  required: true,  placeholder: 'Como podemos te chamar' },
      { key: 'telefone',  label: 'Telefone',  type: 'phone', required: true,  placeholder: '(11) 9 ____-____' },
      { key: 'interesse', label: 'Interesse', type: 'text',  required: false, placeholder: 'Ex: Olheiras, Lifting' },
    ],
    submit_label:    'Enviar contato',
    success_title:   'Recebido! Em breve respondemos.',
    success_message: 'Sua mensagem chegou. Em até 24h alguém da clínica responde por WhatsApp.',
    bg: 'ivory',
  },
}

// ── Template 3: Educativo ──────────────────────────────────
const TEMPLATE_EDUCATIVO_BLOCKS = [
  {
    type: 'nav',
    props: {
      brand_small: 'Clínica',
      brand_name: 'Mirian de Paula',
      cta_enabled: true,
      cta: { label: 'Conversar', message_wa: 'Olá! Quero entender melhor o tratamento.' },
    },
  },
  {
    type: 'hero-split',
    props: {
      eyebrow: 'Procedimento explicado',
      h1: 'Entender é o primeiro passo. *Decidir vem depois.*',
      lead: 'Esta página foi feita pra quem quer saber como funciona, antes de marcar uma avaliação. Sem pressa, sem pressão.',
      cta_primary:   { label: 'Conversar sem compromisso', message_wa: 'Olá! Tenho dúvidas sobre o procedimento.' },
      cta_secondary: { label: 'Ver como funciona', url: '#como-funciona' },
      visual_placeholder: '◯',
    },
  },
  {
    type: 'problema-center',
    props: {
      eyebrow: 'Pra quem é',
      h2: 'Você ouve falar muito do procedimento. Mas ninguém explica do começo.',
      lead: 'Antes de qualquer agulha, qualquer laser, qualquer aparelho — vale entender o que está sendo proposto. E por quê. E quando faz sentido pra você.',
      bg: 'bege',
    },
  },
  {
    type: 'process-timeline',
    props: {
      eyebrow: 'Processo completo',
      h2: 'Como acontece, do primeiro contato ao resultado.',
      intro: 'Cada etapa cumpre uma função. Nada acontece sem que você entenda antes.',
      layout: 'vertical',
      bg: 'ivory',
      items: [
        { numero: '01', titulo: 'Avaliação de Harmonia', descricao: 'Encontro inicial sereno. Ouvimos sua história, analisamos rosto e identidade. Só depois desenhamos uma proposta.' },
        { numero: '02', titulo: 'Plano personalizado',    descricao: 'Você recebe o protocolo desenhado pra você, com indicação técnica e prazos realistas. Discutimos juntos.' },
        { numero: '03', titulo: 'Execução do tratamento', descricao: 'Sessões agendadas com o tempo necessário. Sem pressa, sem corrida. Cuidado em cada etapa.' },
        { numero: '04', titulo: 'Acompanhamento contínuo', descricao: 'Após o tratamento, você não some. Manutenções leves, retoques quando necessário, prioridade no agendamento.' },
      ],
    },
  },
  BLOCK_BEFORE_AFTER,
  {
    type: 'doctor-block',
    props: {
      eyebrow: 'Sobre a especialista',
      h2: 'Dra. Mirian de Paula',
      foto_initial: 'M',
      bg: 'bege',
      paragrafos: [
        'Há mais de uma década dedicada à harmonia facial de mulheres que já chegaram. Não cria tendências, constrói processos pensados pra durar.',
        'Cada Avaliação começa com escuta antes do protocolo. Só depois de entender quem você é, o que incomoda e onde quer chegar, a proposta é desenhada.',
      ],
    },
  },
  BLOCK_TESTIMONIALS_CAROUSEL,
  {
    type: 'faq',
    props: {
      eyebrow: 'Perguntas frequentes',
      h2: 'O que escutamos antes de cada avaliação.',
      bg: 'ivory',
      items: [
        { pergunta: 'Quanto tempo dura o resultado?', resposta: 'Depende do procedimento e da pele de cada pessoa. Na avaliação explicamos o que esperar no seu caso específico.' },
        { pergunta: 'Tem dor?', resposta: 'Usamos técnicas e anestesia adequadas pra cada etapa. A grande maioria das pacientes descreve como muito tolerável.' },
        { pergunta: 'Como é a recuperação?', resposta: 'Cada caso é individual. Em geral, recuperação rápida com retorno à rotina em 1-2 dias. Detalhes na avaliação.' },
        { pergunta: 'Posso pagar parcelado?', resposta: 'Sim. Conversamos sobre formas de pagamento na consulta, sempre alinhadas ao seu orçamento.' },
        { pergunta: 'Como começo?', resposta: 'Com uma Avaliação personalizada. É um encontro sereno e técnico. Pra agendar, basta nos mandar uma mensagem no WhatsApp.' },
      ],
    },
  },
  BLOCK_FORM,
  {
    type: 'cta-final',
    props: {
      eyebrow: 'Sem pressa',
      h2: 'Quando se sentir pronta, conversamos.',
      lead: 'A avaliação é sem custo de decisão. Você ouve, pergunta, sente. Só depois decide.',
      cta: { label: 'Agendar minha avaliação', message_wa: 'Olá, Dra. Mirian! Gostaria de entender melhor o tratamento.' },
    },
  },
  {
    type: 'footer',
    props: {
      brand_name: 'Clínica Mirian de Paula',
      tagline: 'Harmonia que revela · Precisão que dura',
      copyright: '© Clínica Mirian de Paula · Medicina estética facial com protocolos integrados',
    },
  },
]

// ── Template 4: Promoção temporal ──────────────────────────
const TEMPLATE_PROMO_BLOCKS = [
  {
    type: 'nav',
    props: {
      brand_small: 'Clínica',
      brand_name: 'Mirian de Paula',
      cta_enabled: true,
      cta: { label: 'Garantir vaga', message_wa: 'Olá! Quero garantir minha vaga na janela atual.' },
    },
  },
  {
    type: 'hero-split',
    props: {
      eyebrow: 'Janela limitada',
      h1: 'Uma janela para cuidar de você. *Antes que feche.*',
      lead: 'Vagas limitadas no calendário deste mês. Quem agendar até a data, garante condição especial e prioridade.',
      cta_primary: { label: 'Garantir minha vaga', message_wa: 'Olá! Quero garantir minha vaga na janela especial.' },
      visual_placeholder: '⌚',
    },
  },
  {
    type: 'stats-inline',
    props: {
      eyebrow: 'Por que esta janela',
      h2: 'Cuidado intenso. Tempo certo.',
      columns: '3',
      bg: 'bege',
      items: [
        { valor: '12', label: 'Vagas no mês', desc: 'Pra garantir o tempo de avaliação que cada paciente merece.' },
        { valor: '90 dias', label: 'Resultado completo', desc: 'O programa entrega resultado real em três meses.' },
        { valor: 'R$ 0', label: 'Avaliação inicial', desc: 'O primeiro encontro é sem custo, sereno e técnico.' },
      ],
    },
  },
  {
    type: 'pricing-table',
    props: {
      eyebrow: 'Investimento da janela',
      h2: 'Condição especial só pra esta janela.',
      bg: 'ivory',
      items: [
        {
          kicker: 'Programa essencial',
          titulo: 'Tratamento focado',
          preco: 'R$ 1.500',
          preco_detalhe: 'à vista · 5x sem juros',
          descricao: 'Sessão única com avaliação completa.',
          features: '+ Avaliação personalizada\n+ Procedimento principal\n+ Orientações pós\n- Sessões adicionais (avaliadas separadamente)',
          cta: { label: 'Garantir esta opção', message_wa: 'Olá! Quero o Programa essencial.' },
        },
        {
          kicker: 'Programa completo',
          titulo: 'Protocolo integrado',
          preco: 'R$ 4.500',
          preco_detalhe: '10x sem juros',
          descricao: 'Tratamento mais aprofundado, com manutenção inclusa.',
          features: '+ Tudo do essencial\n+ 3 sessões de manutenção\n+ Acompanhamento facial trimestral\n+ Prioridade no agendamento\n+ Condição especial em retoques',
          cta: { label: 'Quero o protocolo completo', message_wa: 'Olá! Quero o Programa completo.' },
          highlight: true,
        },
      ],
    },
  },
  {
    type: 'countdown',
    props: {
      label: 'Vagas para esta janela encerram em',
      target_at: '',
      show_days: true,
      show_after_zero: 'Esta janela encerrou. A próxima abre em breve.',
      variant: 'minimal',
      bg: 'bege',
    },
  },
  BLOCK_TESTIMONIALS_CAROUSEL,
  {
    type: 'cta-final',
    props: {
      eyebrow: 'Próximo passo',
      h2: 'A vaga é sua até alguém garantir antes.',
      lead: 'Atendimento por ordem de chegada. Mensagem agora, vaga reservada.',
      cta: { label: 'Garantir minha vaga agora', message_wa: 'Olá! Quero reservar minha vaga na janela atual.' },
    },
  },
  {
    type: 'footer',
    props: {
      brand_name: 'Clínica Mirian de Paula',
      tagline: 'Harmonia que revela · Precisão que dura',
      copyright: '© Clínica Mirian de Paula · Medicina estética facial com protocolos integrados',
    },
  },
]

// ── Template 5: Prova social pura ──────────────────────────
const TEMPLATE_SOCIAL_BLOCKS = [
  {
    type: 'nav',
    props: {
      brand_small: 'Clínica',
      brand_name: 'Mirian de Paula',
      cta_enabled: true,
      cta: { label: 'Quero o mesmo resultado', message_wa: 'Olá! Vi os resultados. Quero conversar sobre o meu caso.' },
    },
  },
  {
    type: 'hero-split',
    props: {
      eyebrow: 'Resultados que falam',
      h1: 'O melhor depoimento *é o espelho.*',
      lead: 'Cada paciente tem uma história. O que se vê aqui é o que cada uma viveu — autorizado a aparecer, sem retoque.',
      cta_primary:   { label: 'Quero esse resultado', message_wa: 'Olá! Vi os resultados. Quero conversar sobre o meu caso.' },
      cta_secondary: { label: 'Ver galeria', url: '#galeria' },
      visual_placeholder: '★',
    },
  },
  {
    type: 'galeria-filtrada',
    props: {
      eyebrow: 'Galeria de resultados',
      h2: 'Casos reais. Filtre por procedimento.',
      intro: 'Click em qualquer caso pra ampliar e arrastar a barra de comparação.',
      show_filters: true,
      columns: '3',
      bg: 'bege',
      items: [
        { categoria: 'Olheiras', before_url: 'https://images.unsplash.com/photo-1614283233556-f35b0c801ef1?w=600&q=80', after_url: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=600&q=80', caption: 'Smooth Eyes · 1 sessão' },
        { categoria: 'Lifting',  before_url: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&q=80', after_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&q=80', caption: 'Lifting 5D · 90 dias' },
        { categoria: 'Olheiras', before_url: 'https://images.unsplash.com/photo-1573496799652-408c2ac9fe98?w=600&q=80', after_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&q=80', caption: 'Protocolo de olhar · 60 dias' },
      ],
    },
  },
  {
    type: 'testimonials',
    props: {
      eyebrow: 'Em primeira pessoa',
      h2: 'O que cada uma sentiu.',
      layout: 'carousel',
      show_stars: true,
      bg: 'ivory',
      items: BLOCK_TESTIMONIALS_CAROUSEL.props.items,
    },
  },
  {
    type: 'qa-depoimento',
    props: {
      eyebrow: 'Conversa com paciente',
      h2: 'Antes, durante e depois — como foi pra Carla.',
      bg: 'bege',
      foto_initial: 'C',
      nome: 'Carla M.',
      meta: '52 anos · Smooth Eyes',
      items: [
        { pergunta: 'Por que decidiu começar?', resposta: 'Eu estava cansada de me ver cansada no espelho. Não era o sono — era o reflexo. Quando vi as fotos da clínica, percebi que era possível chegar onde eu queria sem virar outra pessoa.' },
        { pergunta: 'O que mais te marcou no atendimento?', resposta: 'O tempo. Ninguém com pressa. A Dra. me ouviu antes de me examinar. Isso fez toda a diferença na minha confiança.' },
        { pergunta: 'O que diria pra quem está pensando?', resposta: 'Vai sem medo. Você vai sair de lá com uma proposta — e a decisão continua sua. Sem pressão.' },
      ],
    },
  },
  {
    type: 'evolution-timeline',
    props: {
      eyebrow: 'A jornada da Carla',
      h2: 'Como o resultado foi se construindo.',
      bg: 'ivory',
      items: [
        { data: 'Dia 0',   foto: 'https://images.unsplash.com/photo-1573496799652-408c2ac9fe98?w=600&q=80', legenda: 'Avaliação inicial · plano desenhado' },
        { data: '30 dias', foto: 'https://images.unsplash.com/photo-1614283233556-f35b0c801ef1?w=600&q=80', legenda: 'Primeira sessão · ajustes finos' },
        { data: '60 dias', foto: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=600&q=80', legenda: 'Resultado consolidado' },
      ],
    },
  },
  BLOCK_FORM,
  {
    type: 'cta-final',
    props: {
      eyebrow: 'Próximo passo',
      h2: 'Sua história pode começar com uma avaliação.',
      lead: 'Sereno. Técnico. Sem decisão na hora. A primeira conversa abre o caminho.',
      cta: { label: 'Quero conversar', message_wa: 'Olá, Dra. Mirian! Vi os resultados das pacientes. Quero entender meu caso.' },
    },
  },
  {
    type: 'footer',
    props: {
      brand_name: 'Clínica Mirian de Paula',
      tagline: 'Harmonia que revela · Precisão que dura',
      copyright: '© Clínica Mirian de Paula · Medicina estética facial com protocolos integrados',
    },
  },
]

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
    await c.query(sqlSchema)
    console.log('[lp-templates] schema + RPCs aplicados')

    // Limpa seed antigo (idempotente — mantém custom user-created)
    await c.query(`DELETE FROM public.lp_templates WHERE slug LIKE 'tpl-%'`)

    // ── Template 1: Protocolo integrado (base lifting-5d) ─────
    var lifting = await c.query(
      `SELECT blocks FROM public.lp_pages WHERE slug = 'lifting-5d' LIMIT 1`
    )
    if (lifting.rows[0]) {
      var blocks1 = lifting.rows[0].blocks
      // Insere testimonials antes do faq (find por type) e before-after após benefits
      blocks1 = _injectAfter(blocks1, 'benefits-grid', BLOCK_BEFORE_AFTER)
      blocks1 = _injectBefore(blocks1, 'faq', BLOCK_TESTIMONIALS_CAROUSEL)
      blocks1 = _injectBefore(blocks1, 'cta-final', BLOCK_FORM)

      await c.query(
        `INSERT INTO public.lp_templates (slug, name, description, category, blocks, sort_order)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        ['tpl-protocolo-integrado',
          'Protocolo integrado',
          'Long-form premium pra tratamentos high-ticket (Full Face, Lifting). Inclui depoimentos, antes/depois e captura de lead.',
          'protocolo',
          JSON.stringify(blocks1),
          1,
        ]
      )
    }

    // ── Template 2: Sessão única (base smooth-eyes) ───────────
    var smooth = await c.query(
      `SELECT blocks FROM public.lp_pages WHERE slug = 'smooth-eyes' LIMIT 1`
    )
    if (smooth.rows[0]) {
      var blocks2 = smooth.rows[0].blocks
      blocks2 = _injectAfter(blocks2, 'benefits-grid', BLOCK_BEFORE_AFTER)
      blocks2 = _injectBefore(blocks2, 'faq', BLOCK_TESTIMONIALS_CAROUSEL)
      blocks2 = _injectBefore(blocks2, 'cta-final', BLOCK_FORM)

      await c.query(
        `INSERT INTO public.lp_templates (slug, name, description, category, blocks, sort_order)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        ['tpl-sessao-unica',
          'Tratamento de sessão única',
          'Médio ticket, foco em procedimentos isolados (Olheiras, Botox, Smooth Eyes). Inclui carrossel de depoimentos.',
          'sessao',
          JSON.stringify(blocks2),
          2,
        ]
      )
    }

    // ── Template 3: Educativo ─────────────────────────────────
    await c.query(
      `INSERT INTO public.lp_templates (slug, name, description, category, blocks, sort_order)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      ['tpl-educativo',
        'Tratamento educativo',
        'Long-form sem venda pesada. Usa quando o público precisa entender antes de decidir. Process timeline + depoimentos + form.',
        'educativo',
        JSON.stringify(TEMPLATE_EDUCATIVO_BLOCKS),
        3,
      ]
    )

    // ── Template 4: Promoção temporal ─────────────────────────
    await c.query(
      `INSERT INTO public.lp_templates (slug, name, description, category, blocks, sort_order)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      ['tpl-promo-temporal',
        'Promoção temporal',
        'Short-form com countdown discreto e tabela de preços. Pra janelas limitadas, lançamentos sazonais. Inclui depoimentos.',
        'promo',
        JSON.stringify(TEMPLATE_PROMO_BLOCKS),
        4,
      ]
    )

    // ── Template 5: Prova social pura ─────────────────────────
    await c.query(
      `INSERT INTO public.lp_templates (slug, name, description, category, blocks, sort_order)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      ['tpl-prova-social',
        'Prova social pura',
        'Heavy em depoimentos, galeria filtrada, Q&A com paciente, evolution timeline. Pra públicos que precisam ver pra acreditar.',
        'social',
        JSON.stringify(TEMPLATE_SOCIAL_BLOCKS),
        5,
      ]
    )

    await c.query("NOTIFY pgrst, 'reload schema'")

    var t = await c.query(
      `SELECT slug, name, category, jsonb_array_length(blocks) AS n
         FROM public.lp_templates ORDER BY sort_order`
    )
    console.log('[lp-templates] seed:')
    t.rows.forEach(function (r) {
      console.log('  ·', r.slug, '·', r.name, '·', r.category, '·', r.n, 'blocos')
    })
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()

// Helpers de injeção em arrays de blocks
function _injectBefore(blocks, type, newBlock) {
  var arr = (blocks || []).slice()
  var idx = arr.findIndex(function (b) { return b && b.type === type })
  if (idx < 0) {
    arr.push(newBlock)
  } else {
    arr.splice(idx, 0, newBlock)
  }
  return arr
}
function _injectAfter(blocks, type, newBlock) {
  var arr = (blocks || []).slice()
  var idx = arr.findIndex(function (b) { return b && b.type === type })
  if (idx < 0) {
    arr.push(newBlock)
  } else {
    arr.splice(idx + 1, 0, newBlock)
  }
  return arr
}
