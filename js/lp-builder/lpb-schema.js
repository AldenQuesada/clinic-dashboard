/**
 * ClinicAI — Landing Page Builder · Block Schema
 *
 * Contratos por tipo de bloco. Inspirado em magazine slot-schema.
 * Cada bloco define seus campos, tipos, limites, hints e comportamento.
 *
 * Tipos de campo:
 *   'text'       — input single-line
 *   'textarea'   — multi-line
 *   'richtext'   — markdown leve (negrito *bold* / italico _italic_)
 *   'image'      — upload/url, com aspect ratio
 *   'svg'        — SVG inline (icones)
 *   'list'       — array de itens (define itemSchema)
 *   'select'     — opcoes fixas (define options[])
 *   'color'      — token color key (ex: 'champagne')
 *   'cta'        — { label, message_wa, url? } — CTA reusavel
 *   'bool'       — checkbox
 *
 * Uso:
 *   var meta = LPBSchema.getBlockMeta('hero-split')
 *   var f = LPBSchema.getFieldMeta('hero-split', 'h1')
 *   LPBSchema.validate('hero-split', { h1: 'Texto', ... })
 *   LPBSchema.defaultProps('hero-split')  // props iniciais ao adicionar
 */
;(function () {
  'use strict'
  if (window.LPBSchema) return

  // ============================================================
  // ITEM SCHEMAS — schemas reutilizaveis para list-editors
  // ============================================================
  var ITEM_SCHEMAS = {
    benefit: [
      { k: 'icon_svg', label: 'Icone (SVG)',  type: 'svg',  hint: 'Cole um SVG inline (Feather/Lucide)' },
      { k: 'titulo',   label: 'Titulo',       type: 'text', max: 50 },
      { k: 'desc',     label: 'Descricao',    type: 'textarea', max: 160, rows: 2 },
    ],
    card_num: [
      { k: 'numero',     label: 'Numero',          type: 'text',     max: 4,   hint: '01, 02, 03...' },
      { k: 'kicker',     label: 'Kicker',          type: 'text',     max: 30,  hint: 'Ex: Etapa 1 / Frente 1' },
      { k: 'titulo',     label: 'Titulo',          type: 'text',     max: 60 },
      { k: 'paragrafos', label: 'Paragrafos',      type: 'list',     scalarItem: true,
        itemMeta: { type: 'richtext', max: 280, rows: 3 },
        hint: 'Cada item vira um <p>. Use *negrito* dentro do paragrafo.' },
    ],
    list_item_rich: [
      { k: 'titulo',  label: 'Titulo',     type: 'text',     max: 70 },
      { k: 'desc',    label: 'Descricao',  type: 'textarea', max: 220, rows: 3 },
    ],
    list_item_simple: [
      { k: 'texto',   label: 'Texto',      type: 'text',     max: 80 },
    ],
    faq_item: [
      { k: 'pergunta', label: 'Pergunta',  type: 'text',     max: 120 },
      { k: 'resposta', label: 'Resposta',  type: 'textarea', max: 600, rows: 4 },
    ],
    before_after_item: [
      { k: 'before_url', label: 'Foto antes',  type: 'image', aspect: '3/4', hint: 'Mesmo aspect ratio das duas fotos' },
      { k: 'after_url',  label: 'Foto depois', type: 'image', aspect: '3/4' },
      { k: 'caption',    label: 'Legenda',     type: 'text',  max: 80, optional: true },
    ],
    stat_item: [
      { k: 'valor', label: 'Número',     type: 'text', max: 8,  hint: 'Ex: 93%, +1.200, R$ 0' },
      { k: 'label', label: 'Label',      type: 'text', max: 40, hint: 'Ex: das pacientes, anos de experiência' },
      { k: 'desc',  label: 'Descrição',  type: 'text', max: 100, optional: true,
        hint: 'Texto opcional abaixo do label' },
    ],
    gallery_photo: [
      { k: 'url',     label: 'Foto',    type: 'image' },
      { k: 'caption', label: 'Legenda', type: 'text', max: 80, optional: true },
    ],
    process_step: [
      { k: 'numero',    label: 'Número',     type: 'text',     max: 4,
        hint: '01, 02, 03... ou ⓘ deixe vazio pra autonumerar' },
      { k: 'titulo',    label: 'Título',     type: 'text',     max: 60 },
      { k: 'descricao', label: 'Descrição',  type: 'textarea', max: 220, rows: 3 },
    ],
    evolution_marker: [
      { k: 'data',    label: 'Marco',    type: 'text',     max: 30,
        hint: 'Ex: Dia 0, 30 dias, 60 dias, 6 meses' },
      { k: 'foto',    label: 'Foto',     type: 'image',    aspect: '3/4' },
      { k: 'legenda', label: 'Legenda',  type: 'textarea', max: 160, rows: 2, optional: true },
    ],
    qa_message: [
      { k: 'pergunta', label: 'Pergunta da paciente', type: 'textarea', max: 120, rows: 2 },
      { k: 'resposta', label: 'Resposta',             type: 'textarea', max: 400, rows: 4 },
    ],
    hotspot_point: [
      { k: 'x',         label: 'Posição X (%)', type: 'text', max: 6,
        hint: '0 (esquerda) a 100 (direita) · ex: 45' },
      { k: 'y',         label: 'Posição Y (%)', type: 'text', max: 6,
        hint: '0 (topo) a 100 (base) · ex: 35' },
      { k: 'label',     label: 'Rótulo curto',  type: 'text', max: 30,
        hint: 'Aparece perto do ponto · ex: Olheira · Mandíbula' },
      { k: 'descricao', label: 'Descrição',     type: 'textarea', max: 180, rows: 3,
        hint: 'Aparece ao clicar · ex: Ácido Hialurônico · 2 sessões' },
    ],
    timeline_checkpoint: [
      { k: 'label',    label: 'Marco',    type: 'text',     max: 24,
        hint: 'Ex: Semana 0, Mês 1, 30 dias' },
      { k: 'foto_url', label: 'Foto',     type: 'image',    aspect: '3/4' },
      { k: 'legenda',  label: 'Legenda',  type: 'text',     max: 80, optional: true },
    ],
    check_item: [
      { k: 'texto', label: 'Item',  type: 'text',     max: 120 },
      { k: 'desc',  label: 'Descrição (opcional)', type: 'textarea', max: 180, rows: 2, optional: true },
    ],
    link_item: [
      { k: 'titulo',   label: 'Título do link',  type: 'text',     max: 50,
        hint: 'Ex: Agende sua avaliação · Instagram · Localização' },
      { k: 'subtitulo',label: 'Subtítulo (opcional)', type: 'text', max: 80, optional: true,
        hint: 'Ex: @clinicamiriandepaula · Avaliação personalizada' },
      { k: 'url',      label: 'URL de destino', type: 'text',  max: 300,
        hint: 'https://wa.me/55... · https://instagram.com/...' },
      { k: 'icon_svg', label: 'Ícone (SVG inline)', type: 'svg', optional: true,
        hint: 'Cole SVG inline (Feather/Lucide). Vazio = sem ícone.' },
    ],
    ba_carousel_slide: [
      { k: 'before_url',   label: 'Foto antes',  type: 'image', aspect: '2/3',
        positioner: true,
        hint: 'Aspect 7/10 · queixo cabe sem ser cortado pelo label' },
      { k: 'before_zoom',  label: 'Antes · zoom', type: 'number', optional: true,
        hidden: true, default: 1 },
      { k: 'before_x',     label: 'Antes · pan X (%)', type: 'number', optional: true,
        hidden: true, default: 0 },
      { k: 'before_y',     label: 'Antes · pan Y (%)', type: 'number', optional: true,
        hidden: true, default: 0 },
      { k: 'before_rot',   label: 'Antes · rotação (°)', type: 'number', optional: true,
        hidden: true, default: 0 },

      { k: 'after_url',    label: 'Foto depois', type: 'image', aspect: '2/3',
        positioner: true },
      { k: 'after_zoom',   label: 'Depois · zoom', type: 'number', optional: true,
        hidden: true, default: 1 },
      { k: 'after_x',      label: 'Depois · pan X (%)', type: 'number', optional: true,
        hidden: true, default: 0 },
      { k: 'after_y',      label: 'Depois · pan Y (%)', type: 'number', optional: true,
        hidden: true, default: 0 },
      { k: 'after_rot',    label: 'Depois · rotação (°)', type: 'number', optional: true,
        hidden: true, default: 0 },

      { k: 'procedure',       label: 'Nome do protocolo', type: 'text', max: 80,
        hint: 'Ex: Lifting 5D + Smooth Eyes' },
      { k: 'procedure_size',  label: 'Procedimento · tamanho', type: 'select',
        options: [
          { value: 'sm', label: 'Pequeno (13px)' },
          { value: 'md', label: 'Médio (15px · default)' },
          { value: 'lg', label: 'Grande (18px)' },
          { value: 'xl', label: 'Extra (22px)' },
        ], default: 'md', optional: true },
      { k: 'procedure_color', label: 'Procedimento · cor (custom)', type: 'color', optional: true,
        hint: 'Vazio = padrão' },

      { k: 'detail',          label: 'Detalhe / tempo', type: 'textarea', max: 180, rows: 2, optional: true,
        hint: 'Ex: Resultado após 30 dias.' },
      { k: 'detail_size',     label: 'Detalhe · tamanho', type: 'select',
        options: [
          { value: 'sm', label: 'Pequeno (10px)' },
          { value: 'md', label: 'Médio (11px · default)' },
          { value: 'lg', label: 'Grande (13px)' },
          { value: 'xl', label: 'Extra (15px)' },
        ], default: 'md', optional: true },
      { k: 'detail_color',    label: 'Detalhe · cor (custom)', type: 'color', optional: true,
        hint: 'Vazio = padrão' },
    ],
    badge_legacy_item: [
      { k: 'icon', label: 'Ícone (emoji ou caractere)', type: 'text', max: 4, optional: true,
        hint: 'Ex: ◆ · ✦ · ❋ · ★ — ou deixe vazio' },
      { k: 'text', label: 'Texto do selo', type: 'text', max: 60,
        hint: 'Ex: 12 anos de experiência · CRM-PE 12.345' },
    ],
    check_legacy_item: [
      { k: 'text', label: 'Item da lista', type: 'text', max: 140,
        hint: 'Ex: Avaliação inicial completa · Acompanhamento de 30 dias' },
    ],
    toc_item: [
      { k: 'titulo',  label: 'Título do item', type: 'text', max: 80,
        hint: 'Ex: Smooth Eyes · Lifting 5D · Carta da Mirian' },
      { k: 'kicker',  label: 'Eyebrow (opcional)', type: 'text', max: 50, optional: true,
        hint: 'Categoria pequena. Ex: TÉCNICA · OPINIÃO · ENTREVISTA' },
      { k: 'anchor',  label: 'Linka para seção', type: 'select-anchor', optional: true,
        hint: 'Escolha um bloco da própria página · vazio = item decorativo (sem click)' },
      { k: 'num',     label: 'Numeração (opcional)', type: 'text', max: 4, optional: true,
        hint: 'Vazio = numera automaticamente 01, 02, 03…' },
      { k: 'page_no', label: 'Página (opcional)', type: 'text', max: 6, optional: true,
        hint: 'Texto livre. Ex: pg 04 · vazio = oculta coluna direita' },
    ],
    button_row_item: [
      { k: 'label', label: 'Texto do botão', type: 'text', max: 40 },
      { k: 'url',   label: 'URL', type: 'text', max: 300, default: 'https://wa.me/55' },
      { k: 'style', label: 'Estilo', type: 'select',
        options: [
          { value: 'whatsapp',  label: 'WhatsApp · verde icônico (com ícone)' },
          { value: 'champagne', label: 'Champagne' },
          { value: 'outline',   label: 'Outline' },
          { value: 'graphite',  label: 'Grafite' },
        ], default: 'whatsapp' },
    ],
    aq_area_item: [
      { k: 'label',    label: 'Nome da área',  type: 'text', max: 50,
        hint: 'Ex: Olheiras · Bigode chinês · Mandíbula' },
      { k: 'protocol', label: 'Protocolo Mirian', type: 'text', max: 120,
        hint: 'Ex: Smooth Eyes (laser fracionado + AH)' },
      { k: 'x',        label: 'Posição X · % esq→dir', type: 'text', max: 5,
        hint: '0 = esquerda · 50 = centro · 100 = direita' },
      { k: 'y',        label: 'Posição Y · % topo→base', type: 'text', max: 5,
        hint: '0 = topo · 50 = meio · 100 = base' },
      { k: 'mirror',   label: 'Espelhar (cria ponto oposto)', type: 'select',
        options: [
          { value: '',  label: 'Não · só este ponto' },
          { value: '1', label: 'Sim · cria ponto automático em (100-X, Y)' },
        ], default: '',
        hint: 'Útil pra áreas pareadas (olheiras, bochechas, mandíbula)' },
    ],
    social_link: [
      { k: 'network', label: 'Rede', type: 'select',
        options: [
          { value: 'auto',      label: 'Auto-detectar (pelo label/URL)' },
          { value: 'instagram', label: 'Instagram' },
          { value: 'whatsapp',  label: 'WhatsApp' },
          { value: 'facebook',  label: 'Facebook' },
          { value: 'youtube',   label: 'YouTube' },
          { value: 'tiktok',    label: 'TikTok' },
          { value: 'linkedin',  label: 'LinkedIn' },
          { value: 'email',     label: 'E-mail' },
          { value: 'phone',     label: 'Telefone' },
          { value: 'site',      label: 'Site / Web' },
          { value: 'map',       label: 'Localização' },
          { value: 'link',      label: 'Genérico' },
        ], default: 'auto',
        hint: 'Se "auto", detecta SVG pelo nome do link ou domínio da URL' },
      { k: 'label', label: 'Nome (acessibilidade)', type: 'text', max: 30,
        hint: 'Ex: Instagram · WhatsApp · YouTube' },
      { k: 'url',   label: 'URL', type: 'text', max: 300,
        hint: 'https://wa.me/55... · https://instagram.com/...' },
    ],
    carousel_slide: [
      { k: 'eyebrow',  label: 'Eyebrow',          type: 'text',     max: 40, optional: true },
      { k: 'titulo',   label: 'Título',           type: 'text',     max: 80, optional: true },
      { k: 'texto',    label: 'Texto',            type: 'textarea', max: 280, rows: 3, optional: true },
      { k: 'foto',     label: 'Foto (opcional)',  type: 'image',    aspect: '4/5', optional: true },
    ],
    testimonial_card: [
      { k: 'body',    label: 'Depoimento', type: 'textarea', max: 320, rows: 4 },
      { k: 'nome',    label: 'Nome',       type: 'text',     max: 40 },
      { k: 'meta',    label: 'Contexto',   type: 'text',     max: 60, optional: true,
        hint: 'Ex: 47 anos · Smooth Eyes' },
      { k: 'foto',    label: 'Foto',       type: 'image',    aspect: '1/1', optional: true },
      { k: 'stars',   label: 'Estrelas',   type: 'select',
        options: [
          { value: 0, label: 'Sem estrelas' },
          { value: 3, label: '3' }, { value: 4, label: '4' }, { value: 5, label: '5' },
        ], default: 5 },
    ],
    badge_item: [
      { k: 'icon_svg',  label: 'Ícone (SVG opcional)', type: 'svg',  optional: true,
        hint: 'Cole SVG inline. Se vazio, usa o ícone padrão.' },
      { k: 'logo_url',  label: 'Logo (URL · alternativa ao SVG)', type: 'image', aspect: '1/1', optional: true },
      { k: 'titulo',    label: 'Título curto', type: 'text', max: 50,
        hint: 'Ex: ANVISA aprovado · 10+ anos · 5000 pacientes' },
      { k: 'descricao', label: 'Descrição',    type: 'text', max: 100, optional: true },
    ],
    media_logo: [
      { k: 'url',  label: 'URL do logo',           type: 'image', aspect: '3/1' },
      { k: 'alt',  label: 'Nome (acessibilidade)', type: 'text',  max: 40 },
      { k: 'link', label: 'Link (opcional)',       type: 'text',  max: 200, optional: true },
    ],
    case_filtered: [
      { k: 'categoria',   label: 'Categoria', type: 'text',  max: 30,
        hint: 'Ex: Olheiras, Lifting, Bigode chinês · agrupa nos filtros' },
      { k: 'before_url',  label: 'Foto antes',  type: 'image', aspect: '3/4' },
      { k: 'after_url',   label: 'Foto depois', type: 'image', aspect: '3/4' },
      { k: 'caption',     label: 'Legenda',     type: 'text',  max: 80, optional: true },
    ],
    form_field: [
      { k: 'key',         label: 'Chave (id interno)', type: 'text', max: 24,
        hint: 'Ex: nome, telefone, email · só letras minúsculas e _' },
      { k: 'label',       label: 'Rótulo',             type: 'text', max: 50 },
      { k: 'type',        label: 'Tipo',               type: 'select',
        options: [
          { value: 'text',     label: 'Texto curto' },
          { value: 'email',    label: 'Email' },
          { value: 'phone',    label: 'Telefone' },
          { value: 'textarea', label: 'Mensagem (multi-linha)' },
          { value: 'select',   label: 'Seleção (dropdown)' },
        ], default: 'text' },
      { k: 'placeholder', label: 'Placeholder',        type: 'text', max: 80, optional: true },
      { k: 'required',    label: 'Obrigatório',        type: 'bool', default: true },
      { k: 'options',     label: 'Opções para Seleção (uma por linha)', type: 'textarea', max: 400, rows: 3, optional: true,
        hint: 'Só usado se tipo for "Seleção"' },
    ],
    agenda_slot: [
      { k: 'data',     label: 'Data',                 type: 'text', max: 30,
        hint: 'Ex: Terça, 20 mai · Quinta, 22 mai' },
      { k: 'horarios', label: 'Horários (vírgula)',    type: 'text', max: 200,
        hint: 'Ex: 09:00, 14:30, 16:00' },
    ],
    pricing_plan: [
      { k: 'kicker',    label: 'Kicker (topo)',  type: 'text', max: 30, optional: true,
        hint: 'Ex: Essencial · Recomendado · Premium' },
      { k: 'titulo',    label: 'Nome do plano',  type: 'text', max: 60 },
      { k: 'preco',     label: 'Preço',          type: 'text', max: 40,
        hint: 'Ex: R$ 1.500 · A partir de R$ 2.000' },
      { k: 'preco_detalhe', label: 'Detalhe do preço', type: 'text', max: 80, optional: true,
        hint: 'Ex: à vista · 10x sem juros' },
      { k: 'descricao', label: 'Descrição curta', type: 'textarea', max: 180, rows: 2, optional: true },
      { k: 'features',  label: 'O que inclui · uma por linha', type: 'textarea', max: 800, rows: 6,
        hint: 'Prefixe com "+ " para item incluso ou "- " para item NÃO incluso. Sem prefixo é considerado incluso.' },
      { k: 'cta',       label: 'CTA', type: 'cta' },
      { k: 'highlight', label: 'Destacar este plano (recomendado)', type: 'bool' },
    ],
    compare_column: [
      { k: 'titulo',    label: 'Nome / Título',   type: 'text', max: 60 },
      { k: 'foto',      label: 'Foto (opcional)', type: 'image', aspect: '1/1', optional: true },
      { k: 'descricao', label: 'Descrição curta', type: 'textarea', max: 160, rows: 2, optional: true },
      { k: 'valores',   label: 'Atributos · linha = rótulo|valor', type: 'textarea', max: 800, rows: 8,
        hint: 'Ex:\nDuração|+ 90 dias\nResultado|Permanente\nDor|- Muito pouca\nRecuperação|3 dias\n\nPrefixe o valor com "+ " (positivo champagne) ou "- " (negativo discreto).' },
      { k: 'cta',       label: 'CTA (opcional)',  type: 'cta', optional: true },
      { k: 'highlight', label: 'Destacar esta opção', type: 'bool' },
    ],
  }

  // ============================================================
  // BLOCK META — 13 blocos canonicos derivados das 2 LPs
  // ============================================================
  var BLOCK_META = {

    // ── 1. NAV (sticky) ─────────────────────────────────────
    'nav': {
      name: 'Nav · Sticky',
      icon: 'menu',
      description: 'Barra de navegacao fixa no topo, com brand e CTA opcional.',
      group: 'estrutura',
      singleton: true,    // so 1 por pagina, sempre no topo
      fields: [
        { k: 'brand_small', label: 'Brand label', type: 'text', max: 16,
          default: 'Clinica', hint: 'Texto pequeno em uppercase acima do nome' },
        { k: 'brand_name',  label: 'Brand nome',  type: 'text', max: 30,
          default: 'Mirian de Paula' },
        { k: 'cta_enabled', label: 'Mostrar CTA',  type: 'bool',  default: true },
        { k: 'cta', label: 'CTA', type: 'cta', optional: true,
          default: { label: 'Agendar avaliacao', message_wa: 'Ola! Tenho interesse e gostaria de agendar minha avaliacao.' } },
      ],
    },

    // ── 2. HERO SPLIT ───────────────────────────────────────
    'hero-split': {
      name: 'Hero · Split (texto + visual)',
      icon: 'columns',
      description: 'Hero principal: 2 colunas no desktop, empilhado no mobile.',
      group: 'hero',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 60,
          hint: 'Texto pequeno acima do titulo · uppercase' },
        { k: 'h1',      label: 'Titulo H1', type: 'richtext', max: 110, rows: 2,
          hint: 'Use *palavra* para italico accent' },
        { k: 'lead',    label: 'Lead', type: 'textarea', max: 240, rows: 3,
          hint: 'Italico Cormorant (ja aplicado)' },
        { k: 'cta_primary',   label: 'CTA Primario',   type: 'cta', optional: false,
          default: { label: 'Agendar minha avaliacao',
                     message_wa: 'Ola! Quero agendar minha avaliacao.' } },
        { k: 'cta_secondary', label: 'CTA Secundario', type: 'cta', optional: true,
          hint: 'Opcional · estilo outline · normalmente "Entender o protocolo"' },
        { k: 'visual_image', label: 'Imagem visual', type: 'image', aspect: '4/5', optional: true,
          hint: 'Se vazio, usa placeholder gradient com letra' },
        { k: 'visual_placeholder', label: 'Placeholder (letra ou icone)',
          type: 'text', max: 4, default: '5D',
          hint: 'Mostrado quando nao ha imagem · ex: "5D", "M", "◉"' },
      ],
    },

    // ── 3. PROBLEMA CENTER ──────────────────────────────────
    'problema-center': {
      name: 'Problema · Centralizado',
      icon: 'align-center',
      description: 'Bloco de problema/diagnose, container narrow, centralizado.',
      group: 'narrativa',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text',     max: 40, default: 'Para quem' },
        { k: 'h2',      label: 'Titulo H2', type: 'text',   max: 100 },
        { k: 'lead',    label: 'Texto', type: 'textarea',   max: 360, rows: 5 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege (section-alt)' },
          ], default: 'bege' },
      ],
    },

    // ── 4. CARDS 2 COLUNAS NUMERADAS ────────────────────────
    'cards-2col': {
      name: 'Cards · 2 colunas numeradas',
      icon: 'grid',
      description: 'Block-intro + 2 cards numerados (etapas, frentes, pilares).',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow',      label: 'Eyebrow',      type: 'text', max: 40 },
        { k: 'h2',           label: 'Titulo H2',    type: 'text', max: 100 },
        { k: 'intro',        label: 'Intro (opcional)', type: 'textarea', max: 280, rows: 3, optional: true },
        { k: 'cards',        label: 'Cards',        type: 'list',
          itemSchema: 'card_num', minItems: 2, maxItems: 3,
          default: [
            { numero: '01', kicker: 'Frente 1', titulo: '', paragrafos: [''] },
            { numero: '02', kicker: 'Frente 2', titulo: '', paragrafos: [''] },
          ] },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim' },
            { value: 'bege',  label: 'Bege (section-alt)' },
          ], default: 'ivory' },
      ],
    },

    // ── 5. QUOTE NARRATIVE ──────────────────────────────────
    'quote-narrative': {
      name: 'Frase · Narrativa',
      icon: 'message-circle',
      description: 'Frase reflexiva de destaque, italico Cormorant grande.',
      group: 'narrativa',
      fields: [
        { k: 'quote', label: 'Frase', type: 'textarea', max: 280, rows: 3,
          hint: 'Mostrada com aspas decorativas em champagne' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'accent', label: 'Accent gradient (default)' },
            { value: 'ivory',  label: 'Marfim' },
            { value: 'bege',   label: 'Bege' },
          ], default: 'accent' },
      ],
    },

    // ── 6. BENEFITS GRID ────────────────────────────────────
    'benefits-grid': {
      name: 'Beneficios · Grid SVG',
      icon: 'check-circle',
      description: 'Grid 2 colunas de beneficios, cada um com SVG + titulo + descricao.',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow',  label: 'Eyebrow',  type: 'text', max: 40, default: 'Resultados' },
        { k: 'h2',       label: 'Titulo H2', type: 'text', max: 100 },
        { k: 'items',    label: 'Beneficios', type: 'list',
          itemSchema: 'benefit', minItems: 2, maxItems: 8 },
      ],
    },

    // ── 7. INVESTIMENTO ─────────────────────────────────────
    'investimento': {
      name: 'Investimento · Card dark',
      icon: 'tag',
      description: 'Card escuro com valor grande, cashback-badge e CTA gold.',
      group: 'oferta',
      fields: [
        { k: 'eyebrow',          label: 'Eyebrow',           type: 'text', max: 40,
          default: 'Investimento consciente' },
        { k: 'h2',               label: 'Titulo H2',         type: 'text', max: 80 },
        { k: 'valor',            label: 'Valor (texto)',     type: 'text', max: 40,
          hint: 'Ex: "R$ 1.500" ou "R$ 12.000 a R$ 15.000"' },
        { k: 'sub',              label: 'Subtexto',          type: 'text', max: 140 },
        { k: 'badge_text',       label: 'Texto do badge',    type: 'text', max: 60, optional: true,
          hint: 'Ex: "3 Sessoes Fotona 4D inclusas"' },
        { k: 'descricao',        label: 'Descricao',         type: 'textarea', max: 360, rows: 4 },
        { k: 'cta',              label: 'CTA',               type: 'cta',
          default: { label: 'Conversar sobre meu protocolo',
                     message_wa: 'Ola! Quero saber mais sobre o investimento.' } },
        { k: 'bg_section', label: 'Fundo da section', type: 'select',
          options: [
            { value: 'bege',  label: 'Bege (default)' },
            { value: 'ivory', label: 'Marfim' },
          ], default: 'bege' },
      ],
    },

    // ── 8. LIST RICH (h3+p por item) ────────────────────────
    'list-rich': {
      name: 'Lista · Rica (titulo + descricao)',
      icon: 'list',
      description: 'Lista com diamante champagne, h3 + paragrafo por item.',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40 },
        { k: 'h2',      label: 'Titulo H2', type: 'text', max: 100 },
        { k: 'intro',   label: 'Intro (opcional)', type: 'textarea', max: 240, rows: 2, optional: true },
        { k: 'items',   label: 'Itens', type: 'list',
          itemSchema: 'list_item_rich', minItems: 1, maxItems: 8 },
      ],
    },

    // ── 9. LIST SIMPLE (texto unico) ────────────────────────
    'list-simple': {
      name: 'Lista · Simples',
      icon: 'list',
      description: 'Lista com diamante champagne, texto unico por item (Cormorant).',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40 },
        { k: 'h2',      label: 'Titulo H2', type: 'text', max: 100 },
        { k: 'items',   label: 'Itens', type: 'list',
          itemSchema: 'list_item_simple', minItems: 2, maxItems: 8 },
      ],
    },

    // ── 10. DOCTOR BLOCK ────────────────────────────────────
    'doctor-block': {
      name: 'Especialista · Bio',
      icon: 'user',
      description: 'Bloco da Dra. com foto + bio em 2 colunas.',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow',       label: 'Eyebrow', type: 'text', max: 40,
          default: 'Sobre a especialista' },
        { k: 'h2',            label: 'Titulo H2', type: 'text', max: 60,
          default: 'Dra. Mirian de Paula' },
        { k: 'foto',          label: 'Foto (3/4)', type: 'image', aspect: '3/4', optional: true },
        { k: 'foto_initial',  label: 'Inicial (placeholder)', type: 'text', max: 2, default: 'M',
          hint: 'Mostrada se nao houver foto' },
        { k: 'paragrafos',    label: 'Paragrafos', type: 'list',
          scalarItem: true,
          itemMeta: { type: 'textarea', max: 320, rows: 4 },
          minItems: 1, maxItems: 4 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'bege',  label: 'Bege (default)' },
            { value: 'ivory', label: 'Marfim' },
          ], default: 'bege' },
      ],
    },

    // ── 11. FAQ ─────────────────────────────────────────────
    'faq': {
      name: 'FAQ · Perguntas frequentes',
      icon: 'help-circle',
      description: 'Acordeao de perguntas/respostas (details/summary).',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40,
          default: 'Perguntas frequentes' },
        { k: 'h2',      label: 'Titulo H2', type: 'text', max: 80 },
        { k: 'items',   label: 'Perguntas', type: 'list',
          itemSchema: 'faq_item', minItems: 3, maxItems: 12 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
          ], default: 'ivory' },
      ],
    },

    // ── 12. CTA FINAL ───────────────────────────────────────
    'cta-final': {
      name: 'CTA Final · Dark',
      icon: 'target',
      description: 'Bloco escuro de fechamento com radial gradient e CTA primary.',
      group: 'cta',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40,
          default: 'Proximo passo' },
        { k: 'h2',      label: 'Titulo H2', type: 'text', max: 120 },
        { k: 'lead',    label: 'Lead',     type: 'textarea', max: 240, rows: 3 },
        { k: 'cta',     label: 'CTA', type: 'cta',
          default: { label: 'Agendar minha avaliacao',
                     message_wa: 'Ola, Dra. Mirian! Gostaria de agendar minha avaliacao.' } },
      ],
    },

    // ── 14. BEFORE & AFTER · slider arrastável (multidirecional) ──
    'before-after': {
      name: 'Antes & Depois · Slider',
      icon: 'sliders',
      description: 'Comparativo antes/depois · 4 direções arrastáveis',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',          type: 'text',     max: 40,  optional: true },
        { k: 'h2',      label: 'Título H2',         type: 'text',     max: 100, optional: true },
        { k: 'intro',   label: 'Intro (opcional)',  type: 'textarea', max: 240, rows: 2, optional: true },
        { k: 'items',   label: 'Comparativos',      type: 'list',
          itemSchema: 'before_after_item', minItems: 1, maxItems: 6 },
        { k: 'direction', label: 'Direção do slider', type: 'select',
          options: [
            { value: 'horizontal-lr', label: 'Horizontal → (default)' },
            { value: 'horizontal-rl', label: 'Horizontal ←' },
            { value: 'vertical-tb',   label: 'Vertical ↓' },
            { value: 'vertical-bt',   label: 'Vertical ↑' },
          ], default: 'horizontal-lr' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
            { value: 'dark',  label: 'Escuro (graphite)' },
          ], default: 'ivory' },
      ],
    },

    // ── 15. STATS INLINE · números grandes ────────────────────
    'stats-inline': {
      name: 'Estatísticas · Números',
      icon: 'bar-chart-2',
      description: 'Números grandes com label · social proof numérico',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',           type: 'text', max: 40, optional: true },
        { k: 'h2',      label: 'Título H2',          type: 'text', max: 100, optional: true },
        { k: 'items',   label: 'Estatísticas',       type: 'list',
          itemSchema: 'stat_item', minItems: 2, maxItems: 4 },
        { k: 'columns', label: 'Colunas', type: 'select',
          options: [
            { value: '2', label: '2 colunas' },
            { value: '3', label: '3 colunas' },
            { value: '4', label: '4 colunas' },
            { value: 'auto', label: 'Automático' },
          ], default: 'auto' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim' },
            { value: 'bege',  label: 'Bege (default)' },
          ], default: 'bege' },
      ],
    },

    // ── 16. GALLERY MOSAIC · grid assimétrico ─────────────────
    'gallery-mosaic': {
      name: 'Galeria · Mosaico',
      icon: 'grid',
      description: 'Grid assimétrico: foto hero grande + menores',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',     type: 'text', max: 40, optional: true },
        { k: 'h2',      label: 'Título H2',    type: 'text', max: 100, optional: true },
        { k: 'items',   label: 'Fotos',        type: 'list',
          itemSchema: 'gallery_photo', minItems: 3, maxItems: 7,
          hint: 'A primeira foto fica grande (hero) · as demais ficam em grid menor' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
          ], default: 'ivory' },
      ],
    },

    // ── 18. PROCESS TIMELINE · passos numerados ───────────────
    'process-timeline': {
      name: 'Processo · Timeline',
      icon: 'arrow-down-right',
      description: 'Passos numerados (Avaliação → Protocolo → Sessão → Acompanhamento)',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40, optional: true },
        { k: 'h2',      label: 'Título H2', type: 'text', max: 100, optional: true },
        { k: 'intro',   label: 'Intro',    type: 'textarea', max: 240, rows: 2, optional: true },
        { k: 'items',   label: 'Etapas',   type: 'list',
          itemSchema: 'process_step', minItems: 2, maxItems: 7 },
        { k: 'layout', label: 'Disposição', type: 'select',
          options: [
            { value: 'vertical',   label: 'Vertical (uma abaixo da outra)' },
            { value: 'horizontal', label: 'Horizontal (lado a lado)' },
          ], default: 'vertical' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
          ], default: 'ivory' },
      ],
    },

    // ── 19. EVOLUTION TIMELINE · fotos por marco temporal ─────
    'evolution-timeline': {
      name: 'Evolução · Linha temporal de fotos',
      icon: 'trending-up',
      description: 'Marcos temporais (Dia 0 → 30d → 60d) com foto por marco',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40, optional: true },
        { k: 'h2',      label: 'Título H2', type: 'text', max: 100, optional: true },
        { k: 'intro',   label: 'Intro',    type: 'textarea', max: 200, rows: 2, optional: true },
        { k: 'items',   label: 'Marcos',   type: 'list',
          itemSchema: 'evolution_marker', minItems: 2, maxItems: 6 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim' },
            { value: 'bege',  label: 'Bege (default)' },
          ], default: 'bege' },
      ],
    },

    // ── 20. Q&A DEPOIMENTO · entrevista com paciente ──────────
    'qa-depoimento': {
      name: 'Depoimento · Q&A com paciente',
      icon: 'user',
      description: 'Entrevista Q/A com foto + nome + perguntas/respostas',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow',  label: 'Eyebrow',  type: 'text', max: 40, optional: true,
          default: 'Conversa com paciente' },
        { k: 'h2',       label: 'Título H2', type: 'text', max: 80, optional: true },
        { k: 'foto',     label: 'Foto da paciente', type: 'image', aspect: '1/1', optional: true },
        { k: 'nome',     label: 'Nome',     type: 'text', max: 40,
          hint: 'Ex: Fernanda L. · pode usar só primeiro nome' },
        { k: 'meta',     label: 'Contexto', type: 'text', max: 60, optional: true,
          hint: 'Ex: 47 anos · Smooth Eyes' },
        { k: 'items',    label: 'Perguntas',type: 'list',
          itemSchema: 'qa_message', minItems: 1, maxItems: 5 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
          ], default: 'ivory' },
      ],
    },

    // ── 21. READING TIME · badge slim ─────────────────────────
    'reading-time': {
      name: 'Tempo de leitura · Badge',
      icon: 'clock',
      description: 'Badge discreto com tempo estimado de leitura da página',
      group: 'estrutura',
      fields: [
        { k: 'prefix',   label: 'Prefixo',   type: 'text', max: 30, default: 'Leitura completa em',
          hint: 'Texto antes do tempo · ex: "Leia em" · "Leitura"' },
        { k: 'show_sections', label: 'Mostrar contagem de seções', type: 'bool', default: true },
        { k: 'align', label: 'Alinhamento', type: 'select',
          options: [
            { value: 'left',   label: 'Esquerda' },
            { value: 'center', label: 'Centro (default)' },
            { value: 'right',  label: 'Direita' },
          ], default: 'center' },
      ],
    },

    // ── 22. HOTSPOTS ANATÔMICOS · foto com pontos interativos ──
    'hotspots-anatomicos': {
      name: 'Anatomia · Hotspots interativos',
      icon: 'target',
      description: 'Foto com pontos pulsantes clicáveis · popover com descrição',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow',  label: 'Eyebrow',   type: 'text', max: 40, optional: true },
        { k: 'h2',       label: 'Título H2',  type: 'text', max: 100, optional: true },
        { k: 'intro',    label: 'Intro',     type: 'textarea', max: 200, rows: 2, optional: true },
        { k: 'foto',     label: 'Foto de fundo', type: 'image', aspect: '3/4',
          hint: 'Foto anatômica · idealmente retrato' },
        { k: 'items',    label: 'Pontos (hotspots)', type: 'list',
          itemSchema: 'hotspot_point', minItems: 1, maxItems: 8,
          hint: 'Cada ponto tem coordenada %, label e descrição' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim' },
            { value: 'bege',  label: 'Bege (default)' },
            { value: 'dark',  label: 'Escuro' },
          ], default: 'bege' },
      ],
    },

    // ── 23. TIMELINE SCRUB · evolução por checkpoints ─────────
    'timeline-scrub': {
      name: 'Timeline · Evolução por checkpoints',
      icon: 'zap',
      description: 'Foto principal + dots clicáveis por marco · crossfade suave',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow',  label: 'Eyebrow',   type: 'text', max: 40, optional: true },
        { k: 'h2',       label: 'Título H2',  type: 'text', max: 100, optional: true },
        { k: 'intro',    label: 'Intro',     type: 'textarea', max: 200, rows: 2, optional: true },
        { k: 'items',    label: 'Checkpoints', type: 'list',
          itemSchema: 'timeline_checkpoint', minItems: 2, maxItems: 8,
          hint: 'Dots aparecem embaixo da foto · click troca com crossfade' },
        { k: 'autoplay', label: 'Autoplay (ciclo automático)', type: 'bool', default: false,
          hint: 'Roda sozinho em loop · boa pra hero de evolução' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
            { value: 'dark',  label: 'Escuro' },
          ], default: 'ivory' },
      ],
    },

    // ── 17. PULL QUOTE · citação editorial ────────────────────
    'pull-quote': {
      name: 'Citação · Editorial',
      icon: 'message-circle',
      description: 'Citação grande italic com aspas decorativas e autoria',
      group: 'narrativa',
      fields: [
        { k: 'quote',  label: 'Citação',         type: 'textarea', max: 280, rows: 3 },
        { k: 'author', label: 'Autor',            type: 'text',     max: 40, optional: true,
          hint: 'Ex: Dra. Mirian de Paula' },
        { k: 'meta',   label: 'Contexto / cargo', type: 'text',     max: 60, optional: true,
          hint: 'Ex: Médica · 10 anos de experiência' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory',  label: 'Marfim' },
            { value: 'bege',   label: 'Bege' },
            { value: 'accent', label: 'Accent gradient (default)' },
            { value: 'dark',   label: 'Escuro' },
          ], default: 'accent' },
      ],
    },

    // ── 24. CHECKLIST · lista verificação ─────────────────────
    'checklist': {
      name: 'Checklist · Lista de verificação',
      icon: 'check-square',
      description: 'Itens com ✓ champagne em círculo · serve pra "o que está incluso"',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40, optional: true },
        { k: 'h2',      label: 'Título H2', type: 'text', max: 100, optional: true },
        { k: 'intro',   label: 'Intro',    type: 'textarea', max: 200, rows: 2, optional: true },
        { k: 'items',   label: 'Itens',    type: 'list',
          itemSchema: 'check_item', minItems: 2, maxItems: 12 },
        { k: 'columns', label: 'Colunas', type: 'select',
          options: [
            { value: '1', label: '1 coluna (lista vertical)' },
            { value: '2', label: '2 colunas' },
          ], default: '1' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
          ], default: 'ivory' },
      ],
    },

    // ── 25. CAROUSEL SLIDES · slider de slides genéricos ──────
    'carousel-slides': {
      name: 'Carrossel · Slides',
      icon: 'film',
      description: 'Carrossel de slides com texto + foto opcional · navegável e auto-play opcional',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow',  label: 'Eyebrow',           type: 'text', max: 40, optional: true },
        { k: 'h2',       label: 'Título H2',          type: 'text', max: 100, optional: true },
        { k: 'slides',   label: 'Slides',             type: 'list',
          itemSchema: 'carousel_slide', minItems: 2, maxItems: 8 },
        { k: 'autoplay',           label: 'Auto-play (loop automático)', type: 'bool', default: false },
        { k: 'autoplay_interval',  label: 'Intervalo (segundos)',         type: 'select',
          options: [
            { value: 4,  label: '4s' },
            { value: 6,  label: '6s (default)' },
            { value: 8,  label: '8s' },
            { value: 12, label: '12s' },
          ], default: 6 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim' },
            { value: 'bege',  label: 'Bege (default)' },
            { value: 'dark',  label: 'Escuro' },
          ], default: 'bege' },
      ],
    },

    // ── 26. TESTIMONIALS · cards depoimentos ──────────────────
    'testimonials': {
      name: 'Depoimentos · Cards',
      icon: 'message-square',
      description: 'Múltiplos depoimentos · grid ou carrossel · com foto + estrelas',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40, optional: true,
          default: 'O que dizem' },
        { k: 'h2',      label: 'Título H2', type: 'text', max: 100, optional: true },
        { k: 'items',   label: 'Depoimentos', type: 'list',
          itemSchema: 'testimonial_card', minItems: 1, maxItems: 9 },
        { k: 'layout', label: 'Disposição', type: 'select',
          options: [
            { value: 'grid',     label: 'Grid (todos visíveis)' },
            { value: 'carousel', label: 'Carrossel (1 por vez · auto-play)' },
          ], default: 'grid' },
        { k: 'columns_grid', label: 'Colunas (modo grid)', type: 'select',
          options: [
            { value: '2', label: '2 colunas' },
            { value: '3', label: '3 colunas (default)' },
          ], default: '3' },
        { k: 'show_stars', label: 'Mostrar estrelas', type: 'bool', default: true },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim' },
            { value: 'bege',  label: 'Bege (default)' },
          ], default: 'bege' },
      ],
    },

    // ── 27. COUNTDOWN · contador regressivo ───────────────────
    'countdown': {
      name: 'Contador · Regressivo',
      icon: 'clock',
      description: 'Timer regressivo discreto · use com critério no tom sereno da clínica',
      group: 'oferta',
      fields: [
        { k: 'label',    label: 'Texto antes',     type: 'text', max: 60, default: 'Reserva a confirmar até',
          hint: 'Ex: "Vagas para abril abrem em" · Evite linguagem de urgência forte' },
        { k: 'target_at', label: 'Data/hora alvo (ISO)', type: 'text', max: 30,
          hint: 'Ex: 2026-05-15T18:00 · use formato AAAA-MM-DDTHH:MM (timezone local)' },
        { k: 'show_days', label: 'Mostrar dias', type: 'bool', default: true },
        { k: 'show_after_zero', label: 'Texto quando expirar', type: 'text', max: 80,
          default: 'Reserva encerrada · próxima janela em breve' },
        { k: 'variant', label: 'Estilo', type: 'select',
          options: [
            { value: 'minimal', label: 'Minimal (texto fluido inline)' },
            { value: 'card',    label: 'Card (digits separados em caixinhas)' },
          ], default: 'minimal' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
            { value: 'dark',  label: 'Escuro' },
          ], default: 'ivory' },
      ],
    },

    // ── 28. SELOS · confiança / certificações ─────────────────
    'selos-confianca': {
      name: 'Selos · Confiança e certificações',
      icon: 'award',
      description: 'Grid de badges com ícone/logo + título · ex: ANVISA, anos de experiência',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40, optional: true,
          default: 'Por que confiar' },
        { k: 'h2',      label: 'Título H2', type: 'text', max: 100, optional: true },
        { k: 'items',   label: 'Selos',    type: 'list',
          itemSchema: 'badge_item', minItems: 2, maxItems: 8 },
        { k: 'columns', label: 'Colunas', type: 'select',
          options: [
            { value: '2', label: '2 colunas' },
            { value: '3', label: '3 colunas (default)' },
            { value: '4', label: '4 colunas' },
            { value: 'auto', label: 'Automático' },
          ], default: '3' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
          ], default: 'ivory' },
      ],
    },

    // ── 29. LOGOS DE IMPRENSA · "mencionado em" ───────────────
    'logos-imprensa': {
      name: 'Imprensa · Logos "mencionado em"',
      icon: 'feather',
      description: 'Bar de logos grayscale com hover · auto-scroll opcional',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40, default: 'Mencionado em' },
        { k: 'items',   label: 'Logos',    type: 'list',
          itemSchema: 'media_logo', minItems: 3, maxItems: 12 },
        { k: 'autoplay', label: 'Auto-scroll horizontal infinito', type: 'bool', default: false,
          hint: 'Logos rolam continuamente · ideal pra muitos logos' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
          ], default: 'ivory' },
      ],
    },

    // ── 30. GALERIA FILTRADA · antes/depois por categoria ─────
    'galeria-filtrada': {
      name: 'Galeria · Antes/Depois por categoria',
      icon: 'grid',
      description: 'Grid de casos antes/depois · filtros por categoria · click abre lightbox',
      group: 'autoridade',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40, optional: true,
          default: 'Resultados reais' },
        { k: 'h2',      label: 'Título H2', type: 'text', max: 100, optional: true },
        { k: 'intro',   label: 'Intro',    type: 'textarea', max: 200, rows: 2, optional: true },
        { k: 'items',   label: 'Casos',    type: 'list',
          itemSchema: 'case_filtered', minItems: 2, maxItems: 24 },
        { k: 'show_filters', label: 'Mostrar tabs de filtro por categoria', type: 'bool', default: true,
          hint: 'Se desativado, mostra todos os casos sem filtro' },
        { k: 'columns', label: 'Colunas', type: 'select',
          options: [
            { value: '2', label: '2 colunas' },
            { value: '3', label: '3 colunas (default)' },
            { value: '4', label: '4 colunas' },
          ], default: '3' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim' },
            { value: 'bege',  label: 'Bege (default)' },
          ], default: 'bege' },
      ],
    },

    // ── 31. FORMULÁRIO INLINE · captura de contato ────────────
    'form-inline': {
      name: 'Formulário · Lead capture',
      icon: 'edit-3',
      description: 'Formulário inline que captura nome+telefone+contexto · grava no banco',
      group: 'cta',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40, optional: true,
          default: 'Quero ser chamada' },
        { k: 'h2',      label: 'Título H2', type: 'text', max: 100,
          default: 'Deixe seu contato. A gente entra em contato.' },
        { k: 'intro',   label: 'Intro',    type: 'textarea', max: 240, rows: 2, optional: true },
        { k: 'fields',  label: 'Campos do formulário', type: 'list',
          itemSchema: 'form_field', minItems: 1, maxItems: 8,
          default: [
            { key: 'nome',      label: 'Nome',     type: 'text',  required: true,  placeholder: 'Como podemos te chamar' },
            { key: 'telefone',  label: 'Telefone', type: 'phone', required: true,  placeholder: '(11) 9 ____-____' },
            { key: 'interesse', label: 'Interesse', type: 'text', required: false, placeholder: 'Ex: Olheiras, Lifting' },
          ] },
        { k: 'submit_label',   label: 'Texto do botão', type: 'text', max: 40, default: 'Enviar contato' },
        { k: 'success_title',  label: 'Título de sucesso', type: 'text', max: 60,
          default: 'Recebido! Em breve respondemos.' },
        { k: 'success_message',label: 'Mensagem de sucesso', type: 'textarea', max: 240, rows: 2,
          default: 'Sua mensagem chegou. Em até 24h alguém da clínica responde por WhatsApp.' },
        { k: 'wa_after_submit', label: 'Abrir WhatsApp após envio', type: 'cta', optional: true,
          hint: 'Opcional · após enviar, sugere abrir o WA pra acelerar' },

        // ── Notificações WhatsApp via Evolution API ───────
        { k: 'wa_auto_reply_enabled', label: 'Enviar resposta automática para o lead', type: 'bool',
          default: false,
          hint: 'Ao enviar form, dispara mensagem WA imediata pro telefone capturado · imediatismo gera percepção premium' },
        { k: 'wa_auto_reply_template', label: 'Mensagem automática (template)', type: 'textarea',
          max: 500, rows: 4, optional: true,
          default: 'Oi {{nome}}! Recebemos seu contato sobre {{interesse}}. Em até 24h alguém da Clínica Mirian conversa com você por aqui.\n\nObrigada pelo interesse.',
          hint: 'Variáveis: {{nome}} · {{phone}} · {{interesse}} · {{titulo}} · {{slug}}' },
        { k: 'wa_staff_phone', label: 'Telefone da staff (notificação interna)', type: 'text',
          max: 20, optional: true,
          hint: 'Ex: 5511999999999 · receberá um WA toda vez que chega novo lead' },
        { k: 'wa_staff_template', label: 'Mensagem para staff (template)', type: 'textarea',
          max: 500, rows: 3, optional: true,
          default: 'Novo lead na LP {{titulo}}\n\nNome: {{nome}}\nTelefone: {{phone}}\nInteresse: {{interesse}}',
          hint: 'Variáveis: {{nome}} · {{phone}} · {{interesse}} · {{titulo}} · {{slug}}' },

        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
            { value: 'dark',  label: 'Escuro' },
          ], default: 'ivory' },
      ],
    },

    // ── 32. AGENDA WIDGET · horários disponíveis ──────────────
    'agenda-widget': {
      name: 'Agenda · Horários disponíveis',
      icon: 'calendar',
      description: 'Cards de horários · click vai pro WhatsApp com mensagem pré-preenchida',
      group: 'cta',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40, optional: true,
          default: 'Próximos horários' },
        { k: 'h2',      label: 'Título H2', type: 'text', max: 100, optional: true,
          default: 'Quando podemos te receber.' },
        { k: 'intro',   label: 'Intro',    type: 'textarea', max: 200, rows: 2, optional: true },
        { k: 'slots',   label: 'Datas e horários', type: 'list',
          itemSchema: 'agenda_slot', minItems: 1, maxItems: 8 },
        { k: 'wa_message_template', label: 'Template WhatsApp', type: 'textarea', max: 240, rows: 2,
          default: 'Olá! Gostaria de agendar para {{data}} às {{horario}}.',
          hint: 'Use {{data}} e {{horario}} como variáveis' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim' },
            { value: 'bege',  label: 'Bege (default)' },
          ], default: 'bege' },
      ],
    },

    // ── 33. MAPA DE LOCALIZAÇÃO · Google Maps embed ───────────
    'mapa-local': {
      name: 'Localização · Mapa',
      icon: 'map-pin',
      description: 'Mapa Google Maps embed + endereço + horário + contato',
      group: 'estrutura',
      fields: [
        { k: 'eyebrow',                label: 'Eyebrow',          type: 'text', max: 40, optional: true,
          default: 'Como chegar' },
        { k: 'h2',                     label: 'Título H2',         type: 'text', max: 100, optional: true,
          default: 'Onde estamos.' },
        { k: 'endereco',               label: 'Endereço completo', type: 'textarea', max: 200, rows: 2,
          hint: 'Ex: Av. Paulista 1000 · 12º andar · São Paulo · SP · 01310-100' },
        { k: 'google_maps_query',      label: 'Busca Google Maps', type: 'text', max: 200,
          hint: 'Ex: Clínica Mirian de Paula, Av. Paulista 1000 · ou cole o nome do estabelecimento' },
        { k: 'horario_funcionamento',  label: 'Horário de funcionamento', type: 'textarea', max: 200, rows: 2, optional: true,
          hint: 'Ex: Seg-Sex 9h-18h · Sáb 9h-13h' },
        { k: 'telefone',               label: 'Telefone',          type: 'text', max: 30, optional: true },
        { k: 'cta',                    label: 'CTA opcional',      type: 'cta', optional: true,
          default: { label: 'Como chegar', message_wa: 'Olá! Pode me orientar como chegar à clínica?' } },
        { k: 'layout', label: 'Disposição', type: 'select',
          options: [
            { value: 'split', label: 'Mapa + info lado a lado' },
            { value: 'wide',  label: 'Mapa largo + info abaixo' },
          ], default: 'split' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
          ], default: 'ivory' },
      ],
    },

    // ── 34. STICKY CTA MOBILE · barra fixa bottom ─────────────
    'sticky-cta-mobile': {
      name: 'Sticky CTA · Barra fixa mobile',
      icon: 'smartphone',
      description: 'Barra fixa no rodapé do mobile · aparece após scroll',
      group: 'cta',
      singleton: true,
      fields: [
        { k: 'text', label: 'Texto curto', type: 'text', max: 50, default: 'Pronta para começar?',
          hint: 'Aparece à esquerda da barra · seja breve' },
        { k: 'cta',  label: 'Botão',       type: 'cta',
          default: { label: 'Agendar agora', message_wa: 'Olá! Quero agendar minha avaliação.' } },
        { k: 'show_after_scroll', label: 'Aparecer após scroll', type: 'select',
          options: [
            { value: '10',  label: '10% (logo no início)' },
            { value: '30',  label: '30% (default)' },
            { value: '50',  label: 'Metade da página' },
          ], default: '30' },
        { k: 'desktop_visible', label: 'Mostrar também no desktop', type: 'bool', default: false,
          hint: 'Por padrão só aparece no mobile · estética premium pede contenção' },
      ],
    },

    // ── 35. SCROLL PROGRESS · barra superior ──────────────────
    'scroll-progress': {
      name: 'Scroll · Barra de progresso',
      icon: 'minus',
      description: 'Barra fina no topo da página que enche conforme rola · sutil',
      group: 'estrutura',
      singleton: true,
      fields: [
        { k: 'altura', label: 'Altura', type: 'select',
          options: [
            { value: '2',  label: '2px (default · sutil)' },
            { value: '3',  label: '3px' },
            { value: '4',  label: '4px' },
            { value: '6',  label: '6px (visível)' },
          ], default: '2' },
        { k: 'cor', label: 'Cor da barra', type: 'select',
          options: [
            { value: 'champagne', label: 'Champagne (default)' },
            { value: 'graphite',  label: 'Graphite' },
            { value: 'sage',      label: 'Sage' },
          ], default: 'champagne' },
      ],
    },

    // ── 36. PARALLAX BANNER · foto fundo + texto sobreposto ───
    'parallax-banner': {
      name: 'Parallax · Banner com foto fundo',
      icon: 'image',
      description: 'Banner full-width com foto de fundo em parallax suave · texto sobreposto',
      group: 'narrativa',
      fields: [
        { k: 'foto',     label: 'Foto de fundo', type: 'image',
          hint: 'Idealmente 16:9 ou 21:9 · ≥1600px largura' },
        { k: 'eyebrow',  label: 'Eyebrow',  type: 'text', max: 40, optional: true },
        { k: 'h2',       label: 'Título',   type: 'text', max: 120 },
        { k: 'lead',     label: 'Lead',     type: 'textarea', max: 240, rows: 2, optional: true },
        { k: 'cta',      label: 'CTA',      type: 'cta', optional: true },
        { k: 'overlay',  label: 'Intensidade do escurecimento (0-100)', type: 'select',
          options: [
            { value: '20', label: 'Sutil (20%)' },
            { value: '40', label: 'Médio (40%)' },
            { value: '55', label: 'Forte (55%) — default' },
            { value: '70', label: 'Muito forte (70%)' },
          ], default: '55' },
        { k: 'altura', label: 'Altura', type: 'select',
          options: [
            { value: 'sm', label: 'Pequena (300px)' },
            { value: 'md', label: 'Média (480px) — default' },
            { value: 'lg', label: 'Grande (640px)' },
            { value: 'fs', label: 'Tela cheia (100vh)' },
          ], default: 'md' },
        { k: 'align', label: 'Alinhamento texto', type: 'select',
          options: [
            { value: 'left',   label: 'Esquerda' },
            { value: 'center', label: 'Centro (default)' },
            { value: 'right',  label: 'Direita' },
          ], default: 'center' },
      ],
    },

    // ── 37. LANGUAGE SWITCHER · seletor de idioma ─────────────
    'language-switcher': {
      name: 'Idioma · Seletor PT/EN/ES/FR',
      icon: 'globe',
      description: 'Botões de troca de idioma · click muda ?lang= e recarrega',
      group: 'estrutura',
      singleton: true,
      fields: [
        { k: 'languages', label: 'Idiomas habilitados', type: 'select',
          options: [
            { value: 'pt-BR,en',          label: 'PT + EN' },
            { value: 'pt-BR,en,es',       label: 'PT + EN + ES' },
            { value: 'pt-BR,en,es,fr',    label: 'PT + EN + ES + FR' },
            { value: 'pt-BR,es',          label: 'PT + ES' },
          ], default: 'pt-BR,en' },
        { k: 'style', label: 'Estilo', type: 'select',
          options: [
            { value: 'pills',  label: 'Pills (botões pequenos)' },
            { value: 'inline', label: 'Inline (texto separado por |)' },
          ], default: 'pills' },
        { k: 'align', label: 'Alinhamento', type: 'select',
          options: [
            { value: 'right',  label: 'Direita (default)' },
            { value: 'center', label: 'Centro' },
            { value: 'left',   label: 'Esquerda' },
          ], default: 'right' },
      ],
    },

    // ── 38. PRICING TABLE · tabela de preços ──────────────────
    'pricing-table': {
      name: 'Preços · Tabela comparativa',
      icon: 'dollar-sign',
      description: 'Cards lado a lado com planos · preço grande + features + CTA',
      group: 'oferta',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40, optional: true,
          default: 'Investimento' },
        { k: 'h2',      label: 'Título H2', type: 'text', max: 100, optional: true },
        { k: 'intro',   label: 'Intro',    type: 'textarea', max: 240, rows: 2, optional: true },
        { k: 'items',   label: 'Planos',   type: 'list',
          itemSchema: 'pricing_plan', minItems: 2, maxItems: 4 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim' },
            { value: 'bege',  label: 'Bege (default)' },
          ], default: 'bege' },
      ],
    },

    // ── 39. CARDS COMPARE · comparativo técnico ───────────────
    'cards-compare': {
      name: 'Comparativo · Cards',
      icon: 'columns',
      description: 'Compara 2-4 opções lado a lado com atributos técnicos',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',  type: 'text', max: 40, optional: true,
          default: 'Compare' },
        { k: 'h2',      label: 'Título H2', type: 'text', max: 100, optional: true },
        { k: 'intro',   label: 'Intro',    type: 'textarea', max: 240, rows: 2, optional: true },
        { k: 'items',   label: 'Opções',   type: 'list',
          itemSchema: 'compare_column', minItems: 2, maxItems: 4 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory', label: 'Marfim (default)' },
            { value: 'bege',  label: 'Bege' },
          ], default: 'ivory' },
      ],
    },

    // ── COLLAGEN-ANIMATION · animação SVG da pele em camadas (Onda 29) ──
    'collagen-animation': {
      name: 'Animação · Linha do Colágeno',
      icon: 'activity',
      description: 'Animação SVG das camadas da pele mostrando estimulação de colágeno em 3 estágios (Hoje · 30 dias · 60 dias)',
      group: 'prova',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true,
          default: 'A ciência por trás' },
        { k: 'headline', label: 'Título', type: 'text', max: 80, optional: true,
          default: 'O que acontece com sua pele' },
        { k: 'lead', label: 'Lead', type: 'textarea', max: 200, rows: 2, optional: true,
          default: 'Cada protocolo da Mirian estimula a produção natural de colágeno · veja a evolução em 60 dias.' },
        { k: 'cta_label', label: 'CTA (opcional)', type: 'text', max: 40, optional: true },
        { k: 'cta_url', label: 'URL do CTA', type: 'text', max: 300, optional: true,
          default: 'https://wa.me/55' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory',    label: 'Marfim (default)' },
            { value: 'cream',    label: 'Creme' },
            { value: 'graphite', label: 'Grafite (escuro)' },
          ], default: 'ivory' },
      ],
    },

    // ── LIVE-COUNTER · prova social ao vivo (Onda 29) ──
    'live-counter': {
      name: 'Live Counter · Prova Social ao Vivo',
      icon: 'users',
      description: 'Mostra count real de leads recentes (últimos 7 dias) · prova social discreta sem urgência manipuladora',
      group: 'prova',
      fields: [
        { k: 'text_template', label: 'Template (use {n} pra número)', type: 'text', max: 120,
          default: '{n} mulheres marcaram avaliação esta semana',
          hint: '{n} é substituído pelo count real do banco' },
        { k: 'days', label: 'Janela (dias)', type: 'select',
          options: [
            { value: '7',  label: '7 dias (default)' },
            { value: '14', label: '14 dias' },
            { value: '30', label: '30 dias' },
          ], default: '7' },
        { k: 'variant', label: 'Variante visual', type: 'select',
          options: [
            { value: 'card',   label: 'Card (centro)' },
            { value: 'pill',   label: 'Pill discreto (inline)' },
            { value: 'fixed',  label: 'Pill fixo no canto (sticky)' },
          ], default: 'card' },
        { k: 'min_count', label: 'Mínimo pra mostrar', type: 'select',
          options: [
            { value: '1', label: '1+ (mostra se houver pelo menos 1)' },
            { value: '3', label: '3+ (mais robusto)' },
            { value: '5', label: '5+ (só com volume)' },
          ], default: '3',
          hint: 'Esconde o bloco se count abaixo deste valor' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory',    label: 'Marfim' },
            { value: 'transparent', label: 'Transparente' },
            { value: 'graphite', label: 'Grafite' },
          ], default: 'ivory' },
      ],
    },

    // ── ANATOMY-QUIZ · quiz facial interativo (Onda 29 · carro-chefe conversão) ──
    'anatomy-quiz': {
      name: 'Quiz Anatômico · Mapa Facial',
      icon: 'user-check',
      description: 'Quiz interativo · paciente clica em áreas do rosto que quer melhorar · no final coleta WhatsApp com contexto rico',
      group: 'cta',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true,
          default: 'Quiz personalizado · 60 segundos' },
        { k: 'headline', label: 'Headline', type: 'textarea', max: 120, rows: 2,
          default: 'Onde você quer mais cuidado?' },
        { k: 'subtitle', label: 'Subtítulo', type: 'text', max: 160, optional: true,
          default: 'Toque nas áreas do rosto · receba um protocolo personalizado da Dra. Mirian' },
        { k: 'cta_label', label: 'Botão final', type: 'text', max: 40, default: 'Ver meu protocolo' },
        { k: 'success_text', label: 'Texto após enviar', type: 'textarea', max: 200, optional: true,
          default: 'Recebemos. A Dra. Mirian vai entrar em contato no WhatsApp em breve.' },
        // Camada 3 · fotos editáveis sem código (ordem ANTES → DEPOIS · sequência didática)
        { k: 'photo_url',             label: '1 · Foto FRONTAL · ANTES (carrega primeiro)', type: 'image', optional: true,
          hint: 'Foto base · com sinais que o tratamento vai cuidar · vazio = usa default' },
        { k: 'photo_url_before',      label: '2 · Foto FRONTAL · DEPOIS (revelada no toggle)', type: 'image', optional: true,
          hint: 'Foto da MESMA pessoa após cuidados (toggle "Ver depois")' },
        { k: 'photo_url_side',        label: '3 · Foto PERFIL · ANTES (carrega primeiro)',  type: 'image', optional: true,
          hint: 'Vista lateral · vazio = usa default' },
        { k: 'photo_url_side_before', label: '4 · Foto PERFIL · DEPOIS (revelada no toggle)', type: 'image', optional: true },
        // Camada 1 · áreas editáveis (override do hardcoded)
        { k: 'areas_front', label: 'Áreas · vista FRONTAL', type: 'list',
          itemSchema: 'aq_area_item', minItems: 0, maxItems: 24,
          hint: 'Vazio = usa as 7 áreas default. Adicione pra sobrescrever (cada item vira um ponto clicável na foto frontal).' },
        { k: 'areas_side',  label: 'Áreas · vista PERFIL',  type: 'list',
          itemSchema: 'aq_area_item', minItems: 0, maxItems: 24,
          hint: 'Vazio = usa as 4 áreas default (dorso/ponta/mento/papada).' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'ivory',    label: 'Marfim (default)' },
            { value: 'cream',    label: 'Creme' },
            { value: 'graphite', label: 'Grafite (escuro)' },
          ], default: 'ivory' },
      ],
    },

    // ── SMART-POPUP · modal temporizado (Onda 29) ──
    'smart-popup': {
      name: 'Pop-up Inteligente',
      icon: 'message-square',
      description: 'Modal temporizado · trigger configurável (tempo/scroll/exit-intent) · cooldown 24h por visitor',
      group: 'cta',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true,
          default: 'Espera!' },
        { k: 'headline', label: 'Headline', type: 'textarea', max: 100, rows: 2,
          default: 'Quer um protocolo personalizado?' },
        { k: 'subtitle', label: 'Subtítulo', type: 'text', max: 160, optional: true,
          default: 'Quiz de 60s · receba uma sugestão da Dra. Mirian' },
        { k: 'image_url', label: 'Imagem/vídeo (URL)', type: 'image', optional: true,
          hint: '.mp4 vira vídeo autoplay muted · imagem fica como hero do popup' },
        { k: 'cta_label', label: 'Texto do botão', type: 'text', max: 40,
          default: 'Fazer quiz' },
        { k: 'cta_url', label: 'URL do botão', type: 'text', max: 300,
          default: 'https://wa.me/55' },
        { k: 'cta_style', label: 'Estilo do botão', type: 'select',
          options: [
            { value: 'whatsapp',  label: 'WhatsApp · verde icônico' },
            { value: 'champagne', label: 'Champagne' },
            { value: 'outline',   label: 'Outline' },
          ], default: 'champagne' },
        { k: 'trigger', label: 'Quando disparar', type: 'select',
          options: [
            { value: 'time',         label: 'Após X segundos' },
            { value: 'scroll',       label: 'Quando scrolla X% da página' },
            { value: 'exit-intent',  label: 'Quando vai sair (mouse pra cima)' },
          ], default: 'time' },
        { k: 'after_seconds', label: 'Disparar após (segundos)', type: 'select',
          options: [
            { value: '15', label: '15s' },
            { value: '30', label: '30s (default)' },
            { value: '45', label: '45s' },
            { value: '60', label: '60s' },
          ], default: '30',
          hint: 'Só usado se trigger = tempo' },
        { k: 'scroll_percent', label: 'Disparar em X% scroll', type: 'select',
          options: [
            { value: '30', label: '30%' },
            { value: '50', label: '50% (default)' },
            { value: '70', label: '70%' },
          ], default: '50',
          hint: 'Só usado se trigger = scroll' },
        { k: 'cooldown_hours', label: 'Cooldown (horas)', type: 'select',
          options: [
            { value: '6',  label: '6h' },
            { value: '24', label: '24h (default)' },
            { value: '72', label: '3 dias' },
          ], default: '24',
          hint: 'Não mostra de novo pro mesmo visitor neste período' },
        { k: 'variant', label: 'Posição', type: 'select',
          options: [
            { value: 'side',   label: 'Lateral direita (default · não-bloqueante)' },
            { value: 'center', label: 'Centro (modal bloqueante)' },
            { value: 'bottom', label: 'Bottom sticky' },
          ], default: 'side' },
      ],
    },

    // ── TRANSFORMATION-REEL · vídeo curto autoplay (Onda 29) ──
    'transformation-reel': {
      name: 'Reel · Vídeo de Transformação',
      icon: 'video',
      description: 'Vídeo curto autoplay sem som · pause quando scrolla pra fora · CTA flutuante',
      group: 'prova',
      fields: [
        { k: 'video_url', label: 'URL do vídeo (.mp4)', type: 'image',
          hint: 'Use vídeo otimizado · 10-20s · sem som ou com legenda' },
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true,
          default: 'Resultado real' },
        { k: 'headline', label: 'Headline', type: 'text', max: 80, optional: true,
          default: '30 dias depois' },
        { k: 'cta_label', label: 'CTA flutuante', type: 'text', max: 30, optional: true,
          default: 'Quero o meu' },
        { k: 'cta_url', label: 'URL do CTA', type: 'text', max: 300, optional: true,
          default: 'https://wa.me/55' },
        { k: 'aspect', label: 'Proporção', type: 'select',
          options: [
            { value: '9/16', label: '9:16 · vertical (story)' },
            { value: '1/1',  label: '1:1 · quadrado' },
            { value: '16/9', label: '16:9 · landscape' },
          ], default: '9/16' },
        { k: 'autoplay', label: 'Autoplay', type: 'select',
          options: [
            { value: 'yes', label: 'Sim (default · sem som)' },
            { value: 'no',  label: 'Não · espera click' },
          ], default: 'yes' },
      ],
    },

    // ── SMART-CTA · CTA contextual (Onda 29) ──
    'smart-cta': {
      name: 'CTA Inteligente · Contextual',
      icon: 'target',
      description: 'Botão muda texto baseado no comportamento do visitor (novo/retorno/após prova social)',
      group: 'cta',
      fields: [
        { k: 'cta_default_label', label: 'Texto padrão (visitor novo)', type: 'text', max: 40,
          default: 'Conhecer protocolos' },
        { k: 'cta_returning_label', label: 'Texto se já visitou', type: 'text', max: 40, optional: true,
          default: 'Continuar minha avaliação' },
        { k: 'cta_after_social_proof_label', label: 'Texto após ver depoimentos', type: 'text', max: 40, optional: true,
          default: 'Falar com a Dra. Mirian' },
        { k: 'cta_url', label: 'URL', type: 'text', max: 300,
          default: 'https://wa.me/55' },
        { k: 'cta_style', label: 'Estilo', type: 'select',
          options: [
            { value: 'whatsapp',  label: 'WhatsApp verde' },
            { value: 'champagne', label: 'Champagne' },
            { value: 'outline',   label: 'Outline' },
          ], default: 'champagne' },
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true },
        { k: 'headline', label: 'Headline', type: 'text', max: 80, optional: true },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'transparent', label: 'Transparente (default)' },
            { value: 'ivory',       label: 'Marfim' },
            { value: 'graphite',    label: 'Grafite' },
          ], default: 'transparent' },
      ],
    },

    // ── HERO-COVER · capa de revista full-bleed (Onda 28) ──
    'hero-cover': {
      name: 'Hero · Capa (full-bleed)',
      icon: 'image',
      description: 'Foto cobre 100% do hero · texto sobreposto com posição Y configurável (drag no canvas como Elementor).',
      group: 'estrutura',
      fields: [
        { k: 'image_url', label: 'Foto de fundo', type: 'image', aspect: '4/5',
          hint: 'Mobile-first: prefira 4/5 (retrato) ou 9/16 (story)' },
        { k: 'eyebrow', label: 'Eyebrow (acima do título)', type: 'text', max: 40, optional: true,
          hint: 'Texto pequeno champagne uppercase. Ex: "Clínica" · "Edição 2026"' },
        { k: 'headline', label: 'Headline principal', type: 'textarea', max: 120, rows: 2,
          hint: 'Cormorant italic grande. Use \\n pra quebra de linha intencional.' },
        { k: 'subheadline', label: 'Subheadline', type: 'textarea', max: 240, rows: 2, optional: true,
          hint: 'Sobre o headline · Montserrat regular' },
        { k: 'cta_label', label: 'CTA (opcional)', type: 'text', max: 40, optional: true,
          hint: 'Ex: "Agendar avaliação". Vazio = sem botão.' },
        { k: 'cta_url',   label: 'URL do CTA', type: 'text', max: 300, optional: true,
          default: 'https://wa.me/55' },
        { k: 'aspect', label: 'Proporção do hero', type: 'select',
          options: [
            { value: '4/5',  label: '4:5 · retrato (mobile-first)' },
            { value: '9/16', label: '9:16 · story (full mobile)' },
            { value: '1/1',  label: '1:1 · quadrado' },
            { value: '16/9', label: '16:9 · landscape (desktop)' },
            { value: '100vh',label: '100vh · viewport completo (full screen)' },
          ], default: '4/5' },
        { k: 'text_y_pct', label: 'Posição vertical · DESKTOP (%)', type: 'select',
          options: [
            { value: '15', label: '15% · topo' },
            { value: '30', label: '30% · alto' },
            { value: '50', label: '50% · centro' },
            { value: '65', label: '65% · meio-baixo' },
            { value: '78', label: '78% · base (default)' },
            { value: '90', label: '90% · próximo ao rodapé' },
          ], default: '78',
          hint: 'Ou arraste o texto direto no canvas com o cursor.' },
        { k: 'text_y_pct_mobile', label: 'Posição vertical · MOBILE (%)', type: 'select',
          options: [
            { value: '15', label: '15% · topo' },
            { value: '30', label: '30% · alto' },
            { value: '50', label: '50% · centro' },
            { value: '65', label: '65% · meio-baixo' },
            { value: '78', label: '78% · base (default)' },
            { value: '90', label: '90% · próximo ao rodapé' },
          ], default: '78',
          hint: 'Mobile pode precisar Y diferente do desktop.' },
        { k: 'text_align', label: 'Alinhamento horizontal', type: 'select',
          options: [
            { value: 'left',   label: 'Esquerda' },
            { value: 'center', label: 'Centro (default)' },
            { value: 'right',  label: 'Direita' },
          ], default: 'center' },
        { k: 'text_color', label: 'Cor BASE do texto', type: 'select',
          options: [
            { value: 'light',  label: 'Branco (foto escura)' },
            { value: 'dark',   label: 'Grafite (foto clara)' },
          ], default: 'light',
          hint: 'Cor padrão · sobrescrita pelos color pickers abaixo se preenchidos' },

        { k: 'eyebrow_size', label: 'Eyebrow · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (9px)' },
            { value: 'md', label: 'Médio (10px · default)' },
            { value: 'lg', label: 'Grande (12px)' },
            { value: 'xl', label: 'Extra (14px)' },
          ], default: 'md' },
        { k: 'eyebrow_color', label: 'Eyebrow · cor (custom)', type: 'color', optional: true,
          hint: 'Vazio = champagne padrão' },

        { k: 'headline_size', label: 'Headline · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (clamp 24-40px)' },
            { value: 'md', label: 'Médio (clamp 32-56px · default)' },
            { value: 'lg', label: 'Grande (clamp 40-72px)' },
            { value: 'xl', label: 'Extra (clamp 48-96px)' },
          ], default: 'md' },
        { k: 'headline_color', label: 'Headline · cor (custom)', type: 'color', optional: true,
          hint: 'Vazio = usa cor base (branco/grafite)' },

        { k: 'subheadline_size', label: 'Subheadline · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (clamp 11-13px)' },
            { value: 'md', label: 'Médio (clamp 13-16px · default)' },
            { value: 'lg', label: 'Grande (clamp 15-19px)' },
            { value: 'xl', label: 'Extra (clamp 17-22px)' },
          ], default: 'md' },
        { k: 'subheadline_color', label: 'Subheadline · cor (custom)', type: 'color', optional: true,
          hint: 'Vazio = usa cor base com 92% opacity' },
        { k: 'overlay', label: 'Overlay sobre a foto', type: 'select',
          options: [
            { value: 'gradient-bottom', label: 'Gradiente embaixo (default · escurece base)' },
            { value: 'gradient-top',    label: 'Gradiente em cima (escurece topo)' },
            { value: 'full-dim',        label: 'Escurecer toda a foto' },
            { value: 'none',            label: 'Nenhum (foto pura)' },
          ], default: 'gradient-bottom' },
        { k: 'overlay_strength', label: 'Intensidade do overlay', type: 'select',
          options: [
            { value: '30',  label: '30% · sutil' },
            { value: '50',  label: '50% · moderado' },
            { value: '70',  label: '70% · forte (default)' },
            { value: '90',  label: '90% · muito escuro' },
            { value: '100', label: '100% · opaco no fundo' },
            { value: '120', label: '120% · extremo · escurece desde o meio' },
            { value: '150', label: '150% · máximo · cobre quase tudo' },
          ], default: '70',
          hint: 'Acima de 100% começa a escurecer mais alto na foto, não só na base' },
      ],
    },

    // ── BEFORE-AFTER-CAROUSEL · 2 fotos lado a lado + carrossel (Onda 28) ──
    // ── 4 blocos de LOCALIZAÇÃO (Onda 31) · WOW disruptivo ──
    'location-map': {
      name: 'Localização · Mapa Imersivo',
      icon: 'map',
      description: 'Mapa SVG faux estilizado em champagne · pin pulsante + card frosted glass + status aberto/fechado dinâmico',
      group: 'localizacao',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true, default: 'Localização' },
        { k: 'titulo',  label: 'Título',  type: 'text', max: 60, optional: true, default: 'Onde nos encontrar' },
        { k: 'address', label: 'Endereço (linha 1)', type: 'text', max: 80, default: 'Av. Carneiro Leão, 296 · Sala 806' },
        { k: 'city',    label: 'Cidade / Estado',     type: 'text', max: 60, default: 'Maringá / PR · CEP 87014-010' },
        { k: 'hours_summary', label: 'Resumo de horários', type: 'text', max: 80, default: 'Seg a Sex 8h-20h · Sáb 8h-14h' },
        { k: 'show_open_status', label: 'Mostrar chip ABERTO/FECHADO', type: 'bool', default: true },
        { k: 'whatsapp_url',   label: 'URL WhatsApp',   type: 'text', default: 'https://wa.me/5544991622986' },
        { k: 'whatsapp_label', label: 'Label WhatsApp', type: 'text', max: 16, default: 'WhatsApp' },
        { k: 'maps_url',       label: 'URL Google Maps', type: 'text', default: 'https://maps.google.com/?q=Clinica+Mirian+Paula+Maringa' },
        { k: 'maps_label',     label: 'Label Maps', type: 'text', max: 16, default: 'Maps' },
        { k: 'show_waze',      label: 'Mostrar botão Waze', type: 'bool', default: true },
        { k: 'waze_url',       label: 'URL Waze', type: 'text', default: 'https://waze.com/ul?q=Av+Carneiro+Leao+296+Maringa' },
        { k: 'waze_label',     label: 'Label Waze', type: 'text', max: 16, default: 'Waze' },
        { k: 'bg', label: 'Fundo do bloco', type: 'select',
          options: [
            { value: 'graphite', label: 'Grafite (escuro · default)' },
            { value: 'ivory',    label: 'Marfim' },
            { value: 'white',    label: 'Branco' },
          ], default: 'graphite' },
      ],
    },

    'location-facade': {
      name: 'Localização · Hero da Fachada',
      icon: 'home',
      description: 'Foto da fachada full-width + endereço + chips de proximidade + botões WhatsApp/Maps',
      group: 'localizacao',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true, default: 'Localização' },
        { k: 'titulo',  label: 'Título',  type: 'text', max: 60, optional: true, default: 'Onde nos encontrar' },
        { k: 'facade_url',  label: 'Foto da fachada', type: 'image', aspect: '4/5', positioner: true,
          hint: 'Foto da clínica · 4/5 portrait · botão Posicionar pra ajustar' },
        { k: 'facade_zoom', label: 'Fachada · zoom', type: 'number', optional: true, hidden: true, default: 1 },
        { k: 'facade_x',    label: 'Fachada · pan X', type: 'number', optional: true, hidden: true, default: 0 },
        { k: 'facade_y',    label: 'Fachada · pan Y', type: 'number', optional: true, hidden: true, default: 0 },
        { k: 'facade_rot',  label: 'Fachada · rotação', type: 'number', optional: true, hidden: true, default: 0 },
        { k: 'address', label: 'Endereço completo', type: 'text', max: 120, default: 'Av. Carneiro Leão, 296 · Sala 806 · Maringá/PR' },
        { k: 'chip_1', label: 'Chip 1', type: 'text', max: 40, default: 'Centro Comercial Monumental' },
        { k: 'chip_2', label: 'Chip 2', type: 'text', max: 40, default: 'Sala 806' },
        { k: 'chip_3', label: 'Chip 3', type: 'text', max: 40, default: 'Zona Armazém · Maringá' },
        { k: 'chip_4', label: 'Chip 4', type: 'text', max: 40, default: 'CEP 87014-010' },
        { k: 'whatsapp_url',   label: 'URL WhatsApp',   type: 'text', default: 'https://wa.me/5544991622986' },
        { k: 'whatsapp_label', label: 'Label WhatsApp', type: 'text', max: 24, default: 'Falar no WhatsApp' },
        { k: 'maps_url',       label: 'URL Google Maps', type: 'text', default: 'https://maps.app.goo.gl/VCxLkAL6m15JLnaV7' },
        { k: 'maps_label',     label: 'Label Maps', type: 'text', max: 24, default: 'Como chegar' },
        { k: 'bg', label: 'Fundo do bloco', type: 'select',
          options: [
            { value: 'graphite', label: 'Grafite (escuro · default)' },
            { value: 'ivory',    label: 'Marfim' },
            { value: 'white',    label: 'Branco' },
          ], default: 'graphite' },
      ],
    },

    'location-story': {
      name: 'Localização · Story Cards',
      icon: 'list',
      description: '3 cards (endereço/horários/como chegar) animados no scroll com chip ABERTO AGORA dinâmico',
      group: 'localizacao',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true, default: 'Localização' },
        { k: 'titulo',  label: 'Título',  type: 'text', max: 60, optional: true, default: 'Estamos perto de você' },
        { k: 'address', label: 'Endereço (multilinha)', type: 'textarea', max: 160, rows: 3,
          default: 'Av. Carneiro Leão, 296\nSala 806 · Centro Comercial Monumental\nMaringá/PR · CEP 87014-010' },
        { k: 'hours_weekday',  label: 'Horário Seg-Sex', type: 'text', max: 60, default: 'Seg a Sex · 08h às 12h e 13h30 às 20h' },
        { k: 'hours_saturday', label: 'Horário Sábado',   type: 'text', max: 60, default: 'Sábado · 08h às 14h' },
        { k: 'hours_sunday',   label: 'Horário Domingo',  type: 'text', max: 60, default: 'Domingo · Fechado' },
        { k: 'chip_1', label: 'Chip 1', type: 'text', max: 40, default: 'Centro Comercial Monumental' },
        { k: 'chip_2', label: 'Chip 2', type: 'text', max: 40, default: 'Zona Armazém · Maringá' },
        { k: 'chip_3', label: 'Chip 3', type: 'text', max: 40, default: 'Atendimento personalizado' },
        { k: 'whatsapp_url',   label: 'URL WhatsApp',   type: 'text', default: 'https://wa.me/5544991622986' },
        { k: 'whatsapp_label', label: 'Label WhatsApp', type: 'text', max: 30, default: 'Agendar pelo WhatsApp' },
        { k: 'bg', label: 'Fundo do bloco', type: 'select',
          options: [
            { value: 'graphite', label: 'Grafite (escuro · default)' },
            { value: 'ivory',    label: 'Marfim' },
            { value: 'white',    label: 'Branco' },
          ], default: 'graphite' },
      ],
    },

    'location-iphone': {
      name: 'Localização · Mockup iPhone Maps',
      icon: 'smartphone',
      description: 'Mockup de iPhone com Apple Maps aberto · tilt 3D no hover · botão abre app nativo',
      group: 'localizacao',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true, default: 'Localização' },
        { k: 'titulo',  label: 'Título',  type: 'text', max: 60, optional: true, default: 'Veja onde estamos' },
        { k: 'clinic_name',  label: 'Nome da clínica',  type: 'text', max: 40, default: 'Clínica Mirian de Paula' },
        { k: 'address',      label: 'Endereço',         type: 'text', max: 100, default: 'Av. Carneiro Leão, 296 · Sala 806 · Maringá/PR' },
        { k: 'rating',       label: 'Nota (rating · você atualiza manual)',    type: 'text', max: 5, default: '5,0' },
        { k: 'reviews_count',label: 'Nº avaliações (você atualiza manual)',    type: 'text', max: 6, default: '0' },
        { k: 'open_status',  label: 'Status horário',   type: 'text', max: 40, default: 'Aberto · Fecha às 20h' },
        { k: 'maps_url',         label: 'URL desktop Maps', type: 'text', default: 'https://maps.app.goo.gl/VCxLkAL6m15JLnaV7' },
        { k: 'ios_maps_url',     label: 'URL iOS Maps',     type: 'text', default: 'maps://?q=Av+Carneiro+Leao+296+Maringa' },
        { k: 'android_geo_url',  label: 'URL Android geo:', type: 'text', default: 'geo:0,0?q=Av+Carneiro+Leao+296+Maringa' },
        { k: 'cta_label',    label: 'Label CTA',        type: 'text', max: 30, default: 'Abrir no meu Maps' },
        { k: 'bg', label: 'Fundo do bloco', type: 'select',
          options: [
            { value: 'graphite', label: 'Grafite (escuro · default)' },
            { value: 'ivory',    label: 'Marfim' },
            { value: 'white',    label: 'Branco' },
          ], default: 'graphite' },
      ],
    },

    // ── before-after-reveal · slider lateral (handle + linha · com carrossel + autoplay) ──
    'before-after-reveal': {
      name: 'Antes & Depois · Slider Revelar',
      icon: 'sliders',
      description: 'Linha vertical central · arraste pra revelar antes vs depois · carrossel multi-slide + autoplay rock opcionais',
      group: 'prova',
      fields: [
        // ── Eyebrow + companions ─────────────────────────
        { k: 'eyebrow',       label: 'Eyebrow', type: 'text', max: 40, optional: true,
          default: 'Resultado real' },
        { k: 'eyebrow_size',  label: 'Eyebrow · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (8px)' },
            { value: 'md', label: 'Médio (9px · default)' },
            { value: 'lg', label: 'Grande (11px)' },
            { value: 'xl', label: 'Extra (13px)' },
          ], default: 'md' },
        { k: 'eyebrow_color', label: 'Eyebrow · cor (custom)', type: 'color', optional: true },
        { k: 'eyebrow_padx',  label: 'Eyebrow · espaçamento lateral', type: 'select',
          options: [
            { value: '0',  label: 'Zero' }, { value: 'sm', label: 'Pequeno' },
            { value: 'md', label: 'Médio (default)' }, { value: 'lg', label: 'Grande' },
            { value: 'xl', label: 'Extra' },
          ], default: 'md' },

        // ── Título + companions ──────────────────────────
        { k: 'titulo',        label: 'Título', type: 'text', max: 60, optional: true,
          default: 'Arraste pra revelar' },
        { k: 'titulo_size',   label: 'Título · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (18px)' },
            { value: 'md', label: 'Médio (24px · default)' },
            { value: 'lg', label: 'Grande (32px)' },
            { value: 'xl', label: 'Extra (40px)' },
          ], default: 'md' },
        { k: 'titulo_color',  label: 'Título · cor (custom)', type: 'color', optional: true },
        { k: 'titulo_padx',   label: 'Título · espaçamento lateral', type: 'select',
          options: [
            { value: '0',  label: 'Zero' }, { value: 'sm', label: 'Pequeno' },
            { value: 'md', label: 'Médio (default)' }, { value: 'lg', label: 'Grande' },
            { value: 'xl', label: 'Extra' },
          ], default: 'md' },

        // ── Foto ANTES + positioner ──────────────────────
        { k: 'before_url',  label: 'Foto antes',  type: 'image', aspect: '2/3', positioner: true,
          hint: 'Aspect 2/3 · mesma do BA-carrossel' },
        { k: 'before_zoom', label: 'Antes · zoom', type: 'number', optional: true, hidden: true, default: 1 },
        { k: 'before_x',    label: 'Antes · pan X (%)', type: 'number', optional: true, hidden: true, default: 0 },
        { k: 'before_y',    label: 'Antes · pan Y (%)', type: 'number', optional: true, hidden: true, default: 0 },
        { k: 'before_rot',  label: 'Antes · rotação (°)', type: 'number', optional: true, hidden: true, default: 0 },

        // ── Foto DEPOIS + positioner ─────────────────────
        { k: 'after_url',  label: 'Foto depois', type: 'image', aspect: '2/3', positioner: true },
        { k: 'after_zoom', label: 'Depois · zoom', type: 'number', optional: true, hidden: true, default: 1 },
        { k: 'after_x',    label: 'Depois · pan X (%)', type: 'number', optional: true, hidden: true, default: 0 },
        { k: 'after_y',    label: 'Depois · pan Y (%)', type: 'number', optional: true, hidden: true, default: 0 },
        { k: 'after_rot',  label: 'Depois · rotação (°)', type: 'number', optional: true, hidden: true, default: 0 },

        // ── Slides extra (opcional · usa este E os top-level acima como slide 0) ──
        { k: 'slides', label: 'Slides ADICIONAIS (carrossel)', type: 'list',
          itemSchema: 'ba_carousel_slide', minItems: 0, maxItems: 8,
          hint: 'Vazio = só usa antes/depois do topo. Adicionar 1+ vira CARROSSEL · slide 0 = topo · 1 = primeiro item etc.' },

        // ── Posição inicial do handle ────────────────────
        { k: 'initial_pos', label: 'Posição inicial do handle (%)', type: 'select',
          options: [
            { value: 25, label: '25% (mostra mais ANTES)' },
            { value: 50, label: '50% (centro · default)' },
            { value: 75, label: '75% (mostra mais DEPOIS)' },
          ], default: 50 },

        // ── Autoplay ROCK (handle balança sozinho) ───────
        { k: 'autoplay_rock', label: 'Auto-rock (handle balança sozinho)', type: 'bool', default: true,
          hint: 'Liga · animacao automatica do handle revelando antes ↔ depois em loop' },
        { k: 'rock_speed', label: 'Velocidade do rock', type: 'select',
          options: [
            { value: 'slow',   label: 'Lenta (6s ciclo)' },
            { value: 'medium', label: 'Média (4s · default)' },
            { value: 'fast',   label: 'Rápida (2s)' },
          ], default: 'medium' },
        { k: 'rock_range', label: 'Amplitude do rock', type: 'select',
          options: [
            { value: 'narrow', label: 'Estreita (35-65%)' },
            { value: 'medium', label: 'Média (25-75% · default)' },
            { value: 'full',   label: 'Total (10-90%)' },
          ], default: 'medium' },

        // ── Autoplay CARROSSEL (troca slides) ────────────
        { k: 'autoplay_slides', label: 'Auto-trocar slides (se tiver mais de 1)', type: 'bool', default: true },
        { k: 'slides_interval', label: 'Intervalo entre slides', type: 'select',
          options: [
            { value: 4,  label: '4s' },
            { value: 6,  label: '6s (default)' },
            { value: 10, label: '10s' },
          ], default: 6 },

        // ── Labels Antes/Depois ──────────────────────────
        { k: 'label_before',       label: 'Texto label "antes"',  type: 'text', max: 16, default: 'Antes' },
        { k: 'label_before_size',  label: 'Label "antes" · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (7px)' }, { value: 'md', label: 'Médio (8px · default)' },
            { value: 'lg', label: 'Grande (10px)' }, { value: 'xl', label: 'Extra (12px)' },
          ], default: 'md' },
        { k: 'label_before_color', label: 'Label "antes" · cor (custom)', type: 'color', optional: true },

        { k: 'label_after',        label: 'Texto label "depois"', type: 'text', max: 16, default: 'Depois' },
        { k: 'label_after_size',   label: 'Label "depois" · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (7px)' }, { value: 'md', label: 'Médio (8px · default)' },
            { value: 'lg', label: 'Grande (10px)' }, { value: 'xl', label: 'Extra (12px)' },
          ], default: 'md' },
        { k: 'label_after_color',  label: 'Label "depois" · cor (custom)', type: 'color', optional: true },

        // ── Procedimento + detalhe ───────────────────────
        { k: 'procedure',       label: 'Nome do protocolo', type: 'text', max: 80, optional: true,
          hint: 'Ex: Lifting 5D · 30 dias' },
        { k: 'procedure_size',  label: 'Procedimento · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (13px)' }, { value: 'md', label: 'Médio (15px · default)' },
            { value: 'lg', label: 'Grande (18px)' }, { value: 'xl', label: 'Extra (22px)' },
          ], default: 'md', optional: true },
        { k: 'procedure_color', label: 'Procedimento · cor', type: 'color', optional: true },

        { k: 'detail',          label: 'Detalhe / tempo', type: 'textarea', max: 180, rows: 2, optional: true },
        { k: 'detail_size',     label: 'Detalhe · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (10px)' }, { value: 'md', label: 'Médio (11px · default)' },
            { value: 'lg', label: 'Grande (13px)' }, { value: 'xl', label: 'Extra (15px)' },
          ], default: 'md', optional: true },
        { k: 'detail_color',    label: 'Detalhe · cor', type: 'color', optional: true },

        // ── Fundo ────────────────────────────────────────
        { k: 'bg', label: 'Fundo do bloco', type: 'select',
          options: [
            { value: 'graphite', label: 'Grafite (escuro · default)' },
            { value: 'ivory',    label: 'Marfim' },
            { value: 'white',    label: 'Branco' },
          ], default: 'graphite' },
      ],
    },

    'before-after-carousel': {
      name: 'Antes & Depois · Carrossel',
      icon: 'columns',
      description: 'Duas fotos lado a lado com labels Antes/Depois. Carrossel automático se >1 slide. Dots em rombo.',
      group: 'prova',
      fields: [
        // ── Eyebrow + companions (size/color/padx) ─────────────
        { k: 'eyebrow',       label: 'Eyebrow', type: 'text', max: 40, optional: true,
          default: 'Resultados reais' },
        { k: 'eyebrow_size',  label: 'Eyebrow · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (8px)' },
            { value: 'md', label: 'Médio (9px · default)' },
            { value: 'lg', label: 'Grande (11px)' },
            { value: 'xl', label: 'Extra (13px)' },
          ], default: 'md' },
        { k: 'eyebrow_color', label: 'Eyebrow · cor (custom)', type: 'color', optional: true,
          hint: 'Vazio = champagne padrão' },
        { k: 'eyebrow_padx',  label: 'Eyebrow · espaçamento lateral', type: 'select',
          options: [
            { value: '0',  label: 'Zero (encostado nas bordas)' },
            { value: 'sm', label: 'Pequeno (0.5rem)' },
            { value: 'md', label: 'Médio (1.5rem · default)' },
            { value: 'lg', label: 'Grande (2.5rem)' },
            { value: 'xl', label: 'Extra (4rem)' },
          ], default: 'md' },

        // ── Título + companions ────────────────────────────────
        { k: 'titulo',        label: 'Título',  type: 'text', max: 60, optional: true,
          default: 'Antes & Depois' },
        { k: 'titulo_size',   label: 'Título · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (18px)' },
            { value: 'md', label: 'Médio (24px · default)' },
            { value: 'lg', label: 'Grande (32px)' },
            { value: 'xl', label: 'Extra (40px)' },
          ], default: 'md' },
        { k: 'titulo_color',  label: 'Título · cor (custom)', type: 'color', optional: true,
          hint: 'Vazio = ivory/grafite conforme fundo' },
        { k: 'titulo_padx',   label: 'Título · espaçamento lateral', type: 'select',
          options: [
            { value: '0',  label: 'Zero' },
            { value: 'sm', label: 'Pequeno (0.5rem)' },
            { value: 'md', label: 'Médio (1.5rem · default)' },
            { value: 'lg', label: 'Grande (2.5rem)' },
            { value: 'xl', label: 'Extra (4rem)' },
          ], default: 'md' },

        // ── Slides ─────────────────────────────────────────────
        { k: 'slides',        label: 'Slides',  type: 'list',
          itemSchema: 'ba_carousel_slide', minItems: 1, maxItems: 12 },

        // ── Label "Antes" + companions ─────────────────────────
        { k: 'label_before',       label: 'Texto label "antes"',  type: 'text', max: 16, default: 'Antes' },
        { k: 'label_before_size',  label: 'Label "antes" · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (7px)' },
            { value: 'md', label: 'Médio (8px · default)' },
            { value: 'lg', label: 'Grande (10px)' },
            { value: 'xl', label: 'Extra (12px)' },
          ], default: 'md' },
        { k: 'label_before_color', label: 'Label "antes" · cor (custom)', type: 'color', optional: true,
          hint: 'Vazio = champagne padrão' },

        // ── Label "Depois" + companions ────────────────────────
        { k: 'label_after',        label: 'Texto label "depois"', type: 'text', max: 16, default: 'Depois' },
        { k: 'label_after_size',   label: 'Label "depois" · tamanho', type: 'select',
          options: [
            { value: 'sm', label: 'Pequeno (7px)' },
            { value: 'md', label: 'Médio (8px · default)' },
            { value: 'lg', label: 'Grande (10px)' },
            { value: 'xl', label: 'Extra (12px)' },
          ], default: 'md' },
        { k: 'label_after_color',  label: 'Label "depois" · cor (custom)', type: 'color', optional: true,
          hint: 'Vazio = champagne padrão' },

        // ── Fundo ──────────────────────────────────────────────
        // Procedure/detail: controles por slide (ver schema ba_carousel_slide)
        { k: 'bg', label: 'Fundo do bloco', type: 'select',
          options: [
            { value: 'graphite', label: 'Grafite (escuro · default do legado)' },
            { value: 'ivory',    label: 'Marfim' },
            { value: 'white',    label: 'Branco' },
          ], default: 'graphite' },
      ],
    },

    // ── LINKS-TREE · LinkTree-style com items dinâmicos (Onda 28) ──
    'links-tree': {
      name: 'Links · LinkTree',
      icon: 'link',
      description: 'Lista de links em botões empilhados (Instagram bio, multi-canal). Items adicionáveis dinamicamente.',
      group: 'cta',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow',     type: 'text', max: 40, optional: true,
          default: 'Acesso rápido', hint: 'Texto pequeno em champagne acima do título' },
        { k: 'titulo',  label: 'Título',      type: 'text', max: 60, optional: true,
          default: 'Links' },
        { k: 'items',   label: 'Links',       type: 'list',
          itemSchema: 'link_item', minItems: 1, maxItems: 12 },
        { k: 'bg', label: 'Fundo do bloco', type: 'select',
          options: [
            { value: 'white', label: 'Branco (default)' },
            { value: 'ivory', label: 'Marfim' },
            { value: 'graphite', label: 'Grafite (escuro)' },
          ], default: 'white' },
      ],
    },

    // ── CTA-LEGACY · CTA grafite com radial gradient + botão (Onda 28) ──
    'cta-legacy': {
      name: 'CTA · Bloco grafite (legado)',
      icon: 'message-circle',
      description: 'Container grafite com radial gradients sutis + headline italic + botão (verde WhatsApp ou champagne).',
      group: 'cta',
      fields: [
        { k: 'eyebrow',     label: 'Eyebrow', type: 'text', max: 40, optional: true,
          default: 'Próximo passo' },
        { k: 'headline',    label: 'Headline (com aspas auto)', type: 'textarea', max: 160, rows: 2,
          hint: 'Cormorant italic ivory · vai entre aspas curvas. Use \\n pra quebra.',
          default: 'Pronta para se reconhecer no espelho?' },
        { k: 'subtitle',    label: 'Subtítulo', type: 'text', max: 120, optional: true,
          default: 'Avaliação personalizada' },
        { k: 'btn_label',   label: 'Texto do botão', type: 'text', max: 40,
          default: 'Conversar no WhatsApp' },
        { k: 'btn_url',     label: 'URL do botão', type: 'text', max: 300,
          default: 'https://wa.me/55' },
        { k: 'btn_style',   label: 'Estilo do botão', type: 'select',
          options: [
            { value: 'whatsapp',  label: 'WhatsApp · verde icônico (com ícone)' },
            { value: 'champagne', label: 'Champagne · neutro premium' },
            { value: 'outline',   label: 'Outline · borda champagne, fill no hover' },
            { value: 'graphite',  label: 'Grafite escuro' },
          ], default: 'whatsapp' },
        { k: 'bg', label: 'Fundo do bloco', type: 'select',
          options: [
            { value: 'graphite', label: 'Grafite (default · com radial gradients)' },
            { value: 'ivory',    label: 'Marfim claro' },
            { value: 'bege',     label: 'Bege' },
          ], default: 'graphite' },
      ],
    },

    // ── BADGES-LEGACY · selos com border-left champagne (Onda 28) ──
    'badges-legacy': {
      name: 'Badges · Selos com barra champagne',
      icon: 'shield',
      description: 'Selos horizontais com border-left champagne (do legado). Mobile vira coluna.',
      group: 'prova',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true },
        { k: 'titulo',  label: 'Título',  type: 'text', max: 60, optional: true },
        { k: 'items',   label: 'Selos',   type: 'list',
          itemSchema: 'badge_legacy_item', minItems: 1, maxItems: 8 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'transparent', label: 'Transparente (default)' },
            { value: 'ivory',       label: 'Marfim' },
            { value: 'bege',        label: 'Bege' },
          ], default: 'transparent' },
      ],
    },

    // ── PRICE-LEGACY · card de preço único com economia (Onda 28) ──
    'price-legacy': {
      name: 'Price · Card de preço (legado)',
      icon: 'tag',
      description: 'Card único com border-top champagne · valor grande Cormorant · parcelas + badge sage de economia.',
      group: 'cta',
      fields: [
        { k: 'label',     label: 'Label (uppercase pequeno)', type: 'text', max: 40, optional: true,
          default: 'Investimento' },
        { k: 'original',  label: 'Preço original (R$)', type: 'text', max: 10, optional: true,
          hint: 'Apenas número. Ex: 4500. Vazio = sem riscado.' },
        { k: 'value',     label: 'Preço final (R$) *', type: 'text', max: 10,
          hint: 'Apenas número. Ex: 3200' },
        { k: 'parcelas',  label: 'Número de parcelas', type: 'select',
          options: [
            { value: '',   label: 'Sem parcelamento' },
            { value: '3',  label: '3x' },
            { value: '6',  label: '6x' },
            { value: '10', label: '10x' },
            { value: '12', label: '12x' },
          ], default: '' },
        { k: 'cta_label', label: 'CTA opcional abaixo', type: 'text', max: 40, optional: true,
          hint: 'Ex: "Garantir minha vaga". Vazio = sem botão.' },
        { k: 'cta_url',   label: 'URL do CTA', type: 'text', max: 300, optional: true,
          default: 'https://wa.me/55' },
        { k: 'cta_style', label: 'Estilo do botão', type: 'select',
          options: [
            { value: 'whatsapp',  label: 'WhatsApp · verde' },
            { value: 'champagne', label: 'Champagne' },
            { value: 'outline',   label: 'Outline' },
            { value: 'graphite',  label: 'Grafite' },
          ], default: 'champagne' },
        { k: 'bg', label: 'Fundo da seção', type: 'select',
          options: [
            { value: 'transparent', label: 'Transparente (default)' },
            { value: 'ivory',       label: 'Marfim' },
            { value: 'bege',        label: 'Bege' },
          ], default: 'transparent' },
      ],
    },

    // ── MAGAZINE-TOC · sumário estilo revista (Onda 28) ──
    'magazine-toc': {
      name: 'Sumário · estilo revista',
      icon: 'list',
      description: 'Sumário 2 colunas (título grande + lista numerada com hover slide). Estilo página 2 da revista premium.',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow', label: 'Kicker (eyebrow)', type: 'text', max: 40, optional: true,
          default: 'Nesta edição' },
        { k: 'h1',      label: 'Título grande', type: 'text', max: 80,
          default: 'O que você vai encontrar' },
        { k: 'lead',    label: 'Lead (parágrafo abaixo)', type: 'textarea', max: 240, rows: 2, optional: true },
        { k: 'items',   label: 'Itens do sumário', type: 'list',
          itemSchema: 'toc_item', minItems: 2, maxItems: 16 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'cream',   label: 'Creme (default · estilo revista)' },
            { value: 'ivory',   label: 'Marfim' },
            { value: 'graphite',label: 'Grafite (escuro)' },
          ], default: 'cream' },
      ],
    },

    // ── DIVIDER · linha bege com rombo champagne (Onda 28) ──
    'divider-legacy': {
      name: 'Divisor · Linha com rombo champagne',
      icon: 'minus',
      description: 'Linha 1px bege com rombo champagne 8×8 no centro · separador discreto e elegante.',
      group: 'estrutura',
      fields: [
        { k: 'spacing', label: 'Espaço acima/abaixo', type: 'select',
          options: [
            { value: 'sm', label: 'Compacto (2rem)' },
            { value: 'md', label: 'Médio (4rem · default)' },
            { value: 'lg', label: 'Amplo (6rem)' },
          ], default: 'md' },
        { k: 'show_mark', label: 'Mostrar rombo central', type: 'select',
          options: [
            { value: 'yes', label: 'Sim · com rombo champagne (default)' },
            { value: 'no',  label: 'Não · só linha pura' },
          ], default: 'yes' },
      ],
    },

    // ── TITLE-LEGACY · section title H2 + lead opcional (Onda 28) ──
    'title-legacy': {
      name: 'Título de seção (legado)',
      icon: 'type',
      description: 'H2 Cormorant clamp(28-44px) + lead opcional · usado pra abrir uma seção.',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true,
          hint: 'Texto pequeno champagne uppercase acima do H2.' },
        { k: 'h2',      label: 'Título H2 *', type: 'textarea', max: 140, rows: 2,
          hint: 'Cormorant 300. Use \\n pra quebrar linha.' },
        { k: 'lead',    label: 'Lead (opcional)', type: 'textarea', max: 240, rows: 2, optional: true },
        { k: 'align',   label: 'Alinhamento', type: 'select',
          options: [
            { value: 'left',   label: 'Esquerda (default · do legado)' },
            { value: 'center', label: 'Centro' },
            { value: 'right',  label: 'Direita' },
          ], default: 'left' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'transparent', label: 'Transparente (default)' },
            { value: 'ivory',       label: 'Marfim' },
            { value: 'bege',        label: 'Bege' },
          ], default: 'transparent' },
      ],
    },

    // ── CHECK-LEGACY · lista de checks com círculo champagne (Onda 28) ──
    'check-legacy': {
      name: 'Lista de checks (legado)',
      icon: 'check',
      description: 'Itens com círculo champagne preenchido + check branco · "o que está incluso".',
      group: 'conteudo',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true },
        { k: 'h2',      label: 'Título H2', type: 'text', max: 100, optional: true,
          hint: 'Ex: O que está incluso' },
        { k: 'items',   label: 'Itens da lista', type: 'list',
          itemSchema: 'check_legacy_item', minItems: 2, maxItems: 16 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'transparent', label: 'Transparente (default)' },
            { value: 'ivory',       label: 'Marfim' },
            { value: 'bege',        label: 'Bege' },
          ], default: 'transparent' },
      ],
    },

    // ── BUTTONS-ROW · vários botões empilhados (Onda 28) ──
    'buttons-row': {
      name: 'Botões empilhados (legado)',
      icon: 'layers',
      description: 'Vários botões verticalmente · cada um com seu próprio estilo (WhatsApp, champagne, outline...).',
      group: 'cta',
      fields: [
        { k: 'eyebrow', label: 'Eyebrow', type: 'text', max: 40, optional: true },
        { k: 'titulo',  label: 'Título', type: 'text', max: 80, optional: true },
        { k: 'items',   label: 'Botões', type: 'list',
          itemSchema: 'button_row_item', minItems: 1, maxItems: 6 },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'transparent', label: 'Transparente (default)' },
            { value: 'ivory',       label: 'Marfim' },
            { value: 'bege',        label: 'Bege' },
            { value: 'graphite',    label: 'Grafite (escuro)' },
          ], default: 'transparent' },
      ],
    },

    // ── 13. FOOTER ──────────────────────────────────────────
    'footer': {
      name: 'Rodapé',
      icon: 'minimize-2',
      description: 'Rodapé com brand + tagline + ícones sociais premium + copyright.',
      group: 'estrutura',
      singleton: true,    // só 1 por página, sempre no fim
      fields: [
        { k: 'clinic_label', label: 'Eyebrow (sobre o nome)', type: 'text', max: 24, optional: true,
          default: 'Clínica',
          hint: 'Texto pequeno em champagne uppercase. Ex: "Clínica" · "Studio" · "Espaço"' },
        { k: 'brand_name', label: 'Nome principal', type: 'text', max: 40,
          default: 'Mirian de Paula' },
        { k: 'tagline',    label: 'Tagline',    type: 'text', max: 80, optional: true,
          default: 'Harmonia que revela · Precisão que dura' },
        { k: 'social',     label: 'Ícones sociais', type: 'list',
          itemSchema: 'social_link', minItems: 0, maxItems: 8 },
        { k: 'copyright',  label: 'Copyright',  type: 'text', max: 140, optional: true,
          default: '© Clínica Mirian de Paula · Medicina estética facial com protocolos integrados' },
        { k: 'bg', label: 'Fundo', type: 'select',
          options: [
            { value: 'graphite', label: 'Grafite (escuro · default do legado)' },
            { value: 'bege',     label: 'Bege claro' },
            { value: 'ivory',    label: 'Marfim' },
          ], default: 'graphite' },
      ],
    },
  }

  // ============================================================
  // GROUPS — agrupamento na palette do editor
  // ============================================================
  var BLOCK_GROUPS = [
    { id: 'estrutura', label: 'Estrutura',  order: 0 },
    { id: 'hero',      label: 'Hero',       order: 1 },
    { id: 'narrativa', label: 'Narrativa',  order: 2 },
    { id: 'conteudo',  label: 'Conteudo',   order: 3 },
    { id: 'autoridade',label: 'Autoridade', order: 4 },
    { id: 'oferta',    label: 'Oferta',     order: 5 },
    { id: 'cta',       label: 'CTA',        order: 6 },
  ]

  // ============================================================
  // API
  // ============================================================
  function getBlockMeta(type) {
    return BLOCK_META[type] || null
  }

  function getFieldMeta(type, key) {
    var meta = BLOCK_META[type]
    if (!meta) return null
    var f = meta.fields.find(function (x) { return x.k === key })
    return f || null
  }

  function listBlockTypes() {
    return Object.keys(BLOCK_META).map(function (k) {
      var m = BLOCK_META[k]
      return { type: k, name: m.name, icon: m.icon, group: m.group,
               singleton: !!m.singleton, description: m.description }
    })
  }

  function listGroups() { return BLOCK_GROUPS.slice() }

  function getItemSchema(refKey) {
    return ITEM_SCHEMAS[refKey] || null
  }

  // Props default ao adicionar um bloco novo
  function defaultProps(type) {
    var meta = BLOCK_META[type]
    if (!meta) return {}
    var props = {}
    meta.fields.forEach(function (f) {
      if ('default' in f) {
        props[f.k] = JSON.parse(JSON.stringify(f.default))
      } else if (f.type === 'list') {
        props[f.k] = []
      } else if (f.type === 'bool') {
        props[f.k] = false
      } else if (f.type === 'cta') {
        props[f.k] = { label: '', message_wa: '' }
      } else {
        props[f.k] = ''
      }
    })
    return props
  }

  // Validacao basica de props contra o schema
  function validate(type, props) {
    var meta = BLOCK_META[type]
    if (!meta) return { valid: false, errors: ['tipo desconhecido: ' + type] }
    var errors = []
    meta.fields.forEach(function (f) {
      var v = props ? props[f.k] : undefined
      var isEmpty = (v == null || v === '' ||
                     (Array.isArray(v) && v.length === 0))
      if (!f.optional && isEmpty) {
        errors.push('campo obrigatorio vazio: ' + f.k)
        return
      }
      if (f.type === 'text' || f.type === 'textarea' || f.type === 'richtext') {
        if (typeof v === 'string' && f.max && v.length > f.max) {
          errors.push(f.k + ': ' + v.length + ' caracteres (max ' + f.max + ')')
        }
      }
      if (f.type === 'list') {
        var n = Array.isArray(v) ? v.length : 0
        if (f.minItems && n < f.minItems) errors.push(f.k + ': minimo ' + f.minItems + ' itens')
        if (f.maxItems && n > f.maxItems) errors.push(f.k + ': maximo ' + f.maxItems + ' itens')
        // valida itens
        if (Array.isArray(v) && f.itemSchema) {
          var itemDef = ITEM_SCHEMAS[f.itemSchema]
          if (itemDef) {
            v.forEach(function (item, i) {
              itemDef.forEach(function (sub) {
                var subVal = item ? item[sub.k] : undefined
                if (sub.max && typeof subVal === 'string' && subVal.length > sub.max) {
                  errors.push(f.k + '[' + i + '].' + sub.k + ': max ' + sub.max)
                }
              })
            })
          }
        }
      }
    })
    return { valid: errors.length === 0, errors: errors }
  }

  // Cria uma estrutura de pagina inicial — nav + hero + cta-final + footer
  function newPageBlocks() {
    return [
      { type: 'nav',       props: defaultProps('nav') },
      { type: 'hero-split',props: defaultProps('hero-split') },
      { type: 'cta-final', props: defaultProps('cta-final') },
      { type: 'footer',    props: defaultProps('footer') },
    ]
  }

  // ============================================================
  // EXPOSE
  // ============================================================
  window.LPBSchema = Object.freeze({
    BLOCK_META: BLOCK_META,
    BLOCK_GROUPS: BLOCK_GROUPS,
    ITEM_SCHEMAS: ITEM_SCHEMAS,
    // API
    getBlockMeta: getBlockMeta,
    getFieldMeta: getFieldMeta,
    listBlockTypes: listBlockTypes,
    listGroups: listGroups,
    getItemSchema: getItemSchema,
    defaultProps: defaultProps,
    validate: validate,
    newPageBlocks: newPageBlocks,
  })
})()
