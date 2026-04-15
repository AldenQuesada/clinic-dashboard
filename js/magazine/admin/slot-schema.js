/* ============================================================================
 * Beauty & Health Magazine — Admin Slot Schema
 * Fonte-da-verdade dos contratos de cada template/slot (derivado do playbook).
 * Usado pelo editor admin para renderizar campos com labels humanas, hints,
 * limites e subtipos estruturados (listas).
 *
 * Expõe: window.MagazineAdmin.Schema
 *   - SECTION_META[slug].fields[] — meta por campo
 *   - ITEM_SCHEMAS — esquema de itens para list-editors
 *   - getFieldMeta(slug, key) — lookup com fallback
 * ============================================================================ */
;(function () {
  'use strict'

  // Schemas reutilizáveis para list-editors (cada item = linha)
  const ITEM_SCHEMAS = {
    toc_item: [
      { k: 'num',    label: 'Nº',        type: 'text', max: 2,  width: 'xs' },
      { k: 'titulo', label: 'Título',    type: 'text', max: 50, width: 'lg' },
      { k: 'kicker', label: 'Categoria', type: 'text', max: 22, width: 'md' },
    ],
    contato: [
      { k: 'label', label: 'Label', type: 'text', max: 20, width: 'sm' },
      { k: 'valor', label: 'Valor', type: 'text', max: 60, width: 'lg' },
    ],
    qa: [
      { k: 'q', label: 'Pergunta', type: 'textarea', max: 120, rows: 2 },
      { k: 'a', label: 'Resposta', type: 'textarea', wordsMin: 40, wordsMax: 180, rows: 4 },
    ],
    stat: [
      { k: 'valor', label: 'Valor', type: 'text', max: 8,  width: 'sm' },
      { k: 'label', label: 'Label', type: 'text', max: 28, width: 'lg' },
    ],
    marco: [
      { k: 'data',    label: 'Data',    type: 'text',  max: 14, width: 'sm' },
      { k: 'foto',    label: 'Foto',    type: 'image', aspect: '3/4' },
      { k: 'legenda', label: 'Legenda', type: 'text',  max: 100 },
    ],
    recompensa: [
      { k: 'titulo',    label: 'Título',    type: 'text', max: 30 },
      { k: 'descricao', label: 'Descrição', type: 'text', max: 100 },
    ],
    passo: [
      { k: 'titulo',    label: 'Título',    type: 'text',     max: 40 },
      { k: 'descricao', label: 'Descrição', type: 'textarea', max: 180, rows: 2 },
    ],
    mito_fato: [
      { k: 'mito', label: 'Mito', type: 'textarea', max: 120, rows: 2 },
      { k: 'fato', label: 'Fato', type: 'textarea', max: 200, rows: 3 },
    ],
    // item simples (string pura): use scalarItem: true
  }

  // Meta por template — rótulo limpo + hint contextual + limites + tipo
  // Type canônico: 'text' | 'textarea' | 'image' | 'list'
  // Para 'list': itemSchema (ref key em ITEM_SCHEMAS) OU scalarItem: true
  const SECTION_META = {

    // ══════════════════════ CAPAS ══════════════════════
    t01_cover_hero_dark: {
      name: 'Capa · Hero Dark',
      fields: [
        { k: 'titulo',       label: 'Título',          type: 'text',     max: 40, hint: 'Use *palavra* para itálico accent bordô' },
        { k: 'foto_hero',    label: 'Foto hero',       type: 'image', aspect: '3/4', hint: 'Retrato 3/4 ou 4/5 · fundo escuro · ≥1600px' },
        { k: 'edicao_label', label: 'Label da edição', type: 'text',     max: 30, hint: 'Formato: MÊS · ANO · Nº XX (all caps)' },
        { k: 'subtitulo',    label: 'Subtítulo',       type: 'textarea', max: 140, rows: 2, optional: true },
        { k: 'tag',          label: 'Tag',             type: 'text',     max: 18, optional: true, hint: 'All caps · ex: MATÉRIA DE CAPA' },
      ],
    },
    t02_cover_hero_light: {
      name: 'Capa · Hero Light',
      fields: [
        { k: 'titulo',    label: 'Título',    type: 'text',     max: 40, hint: 'Use *palavra* para itálico accent' },
        { k: 'foto_hero', label: 'Foto hero', type: 'image', aspect: '3/4', hint: 'Aspect 3/4 · fundo claro/natural · ≥1600px' },
        { k: 'subtitulo', label: 'Subtítulo', type: 'textarea', max: 140, rows: 2, optional: true },
      ],
    },
    t03_cover_triptych: {
      name: 'Capa · Tripla',
      fields: [
        { k: 'foto_1',   label: 'Foto 1',   type: 'image', aspect: '1/1', hint: 'Quadrado · mesma paleta das 3' },
        { k: 'titulo_1', label: 'Título 1', type: 'text',  max: 22 },
        { k: 'foto_2',   label: 'Foto 2',   type: 'image', aspect: '1/1' },
        { k: 'titulo_2', label: 'Título 2', type: 'text',  max: 22 },
        { k: 'foto_3',   label: 'Foto 3',   type: 'image', aspect: '1/1' },
        { k: 'titulo_3', label: 'Título 3', type: 'text',  max: 22 },
      ],
    },

    // ══════════════════════ ESTRUTURAIS ══════════════════════
    t04_toc_editorial: {
      name: 'Sumário',
      fields: [
        { k: 'titulo', label: 'Título',          type: 'text',     max: 24, hint: 'Ex: "Nesta edição"' },
        { k: 'kicker', label: 'Kicker',          type: 'text',     max: 12, optional: true, hint: 'Antetítulo · ex: SUMÁRIO' },
        { k: 'lede',   label: 'Lede explicativo',type: 'textarea', max: 180, rows: 3, optional: true },
        { k: 'items',  label: 'Itens do sumário',type: 'list', itemSchema: 'toc_item', min: 4, max: 8 },
      ],
    },
    t05_editorial_letter: {
      name: 'Carta Editorial',
      fields: [
        { k: 'titulo',      label: 'Título',      type: 'text',     max: 50 },
        { k: 'foto_autora', label: 'Foto autora', type: 'image', aspect: '3/4', hint: 'Retrato 3/4 · fundo neutro' },
        { k: 'corpo',       label: 'Corpo',       type: 'textarea', wordsMin: 180, wordsMax: 280, rows: 12, hint: '3-4 parágrafos · separe com linha em branco · 1ª pessoa' },
        { k: 'assinatura',  label: 'Assinatura',  type: 'text',     max: 60, hint: 'Nome da autora · ex: "Mirian de Paula"' },
      ],
    },
    t06_back_cta: {
      name: 'Contracapa · CTA',
      fields: [
        { k: 'titulo',         label: 'Título',                type: 'text', max: 50, hint: 'Convite à ação · use *itálico*' },
        { k: 'contatos',       label: 'Contatos',              type: 'list', itemSchema: 'contato', min: 2, max: 4 },
        { k: 'cta_texto',      label: 'CTA texto',             type: 'text', max: 30, hint: 'All caps · ex: "AGENDAR AVALIAÇÃO"' },
        { k: 'cta_link',       label: 'CTA link',              type: 'text', hint: 'URL WhatsApp (wa.me) ou formulário' },
        { k: 'proxima_edicao', label: 'Teaser próxima edição', type: 'text', max: 60, optional: true },
      ],
    },

    // ══════════════════════ MATÉRIAS ══════════════════════
    t07_feature_double: {
      name: 'Matéria · Dupla (texto + foto)',
      fields: [
        { k: 'kicker',    label: 'Kicker',    type: 'text',     max: 22, hint: 'Categoria · all caps' },
        { k: 'titulo',    label: 'Título',    type: 'text',     max: 70, hint: 'Use *palavra* para itálico' },
        { k: 'lede',      label: 'Lede',      type: 'textarea', max: 200, minChars: 140, rows: 3, hint: '1 frase · 140-200 chars' },
        { k: 'corpo',     label: 'Corpo',     type: 'textarea', wordsMin: 400, wordsMax: 700, rows: 15, hint: '4-7 parágrafos · cena concreta no 1º · dado/citação a cada 2 par.' },
        { k: 'foto_hero', label: 'Foto hero', type: 'image', aspect: '3/4', hint: 'Portrait 3/4 ou 4/5 · ≥1600px' },
        { k: 'byline',    label: 'Byline',    type: 'text',     max: 60, optional: true },
      ],
    },
    t08_feature_fullbleed: {
      name: 'Matéria · Full Bleed',
      fields: [
        { k: 'titulo',        label: 'Título',        type: 'text',     max: 60, hint: 'Tom poético/editorial' },
        { k: 'foto_full',     label: 'Foto full',     type: 'image', aspect: '16/10', hint: 'Landscape 16/10 · ≥2000px · área neutra no rodapé' },
        { k: 'lede',          label: 'Lede',          type: 'textarea', max: 160, rows: 2 },
        { k: 'overlay_color', label: 'Cor do overlay',type: 'text',     optional: true, hint: 'Ex: rgba(0,0,0,0.85)' },
      ],
    },
    t09_feature_triptych: {
      name: 'Matéria · 3 Blocos',
      fields: [
        { k: 'foto_1',        label: 'Foto 1',        type: 'image', aspect: '3/4', hint: 'Portrait · mesma paleta da foto 2' },
        { k: 'legenda_1',     label: 'Legenda 1',     type: 'text',  max: 40, optional: true },
        { k: 'texto_central', label: 'Texto central', type: 'textarea', max: 180, rows: 3, hint: 'Quote ou conceito' },
        { k: 'foto_2',        label: 'Foto 2',        type: 'image', aspect: '3/4' },
        { k: 'legenda_2',     label: 'Legenda 2',     type: 'text',  max: 40, optional: true },
      ],
    },
    t10_interview: {
      name: 'Entrevista Q&A',
      fields: [
        { k: 'foto_entrevistado', label: 'Foto entrevistado', type: 'image', aspect: '3/4', hint: 'Retrato 3/4 · fundo neutro' },
        { k: 'titulo',            label: 'Título',            type: 'text', max: 60 },
        { k: 'nome',              label: 'Nome',              type: 'text', max: 40 },
        { k: 'titulo_prof',       label: 'Cargo/credencial',  type: 'text', max: 50, optional: true },
        { k: 'qas',               label: 'Perguntas e respostas', type: 'list', itemSchema: 'qa', min: 3, max: 6 },
      ],
    },
    t11_product_highlight: {
      name: 'Destaque de Tratamento',
      fields: [
        { k: 'titulo',         label: 'Nome do tratamento', type: 'text', max: 40 },
        { k: 'subtitulo',      label: 'Subtítulo',          type: 'text', max: 100, optional: true },
        { k: 'foto',           label: 'Foto',               type: 'image', aspect: '3/4', hint: 'Portrait 3/4' },
        { k: 'beneficios',     label: 'Benefícios',         type: 'list', scalarItem: { label: 'Benefício', max: 80, hint: 'Começar com verbo ativo (Estimula, Redefine, Devolve)' }, min: 3, max: 6 },
        { k: 'preco_sugerido', label: 'Preço sugerido',     type: 'text', optional: true, hint: 'Ex: "a partir de R$ 1.200"' },
        { k: 'cta',            label: 'CTA texto',          type: 'text', max: 30 },
      ],
    },

    // ══════════════════════ VISUAIS ══════════════════════
    t12_before_after_pair: {
      name: 'Antes/Depois · Par',
      fields: [
        { k: 'titulo',      label: 'Título',      type: 'text', max: 50 },
        { k: 'foto_antes',  label: 'Foto antes',  type: 'image', aspect: '3/4', hint: 'Mesmo ângulo/luz/fundo da foto depois' },
        { k: 'foto_depois', label: 'Foto depois', type: 'image', aspect: '3/4', hint: 'Mesmo ângulo/luz/fundo da foto antes' },
        { k: 'meta',        label: 'Meta (ficha técnica)', type: 'text', max: 140, hint: 'Ex: "Smooth Eyes + AH · 3 sessões · 60 dias"' },
        { k: 'stats',       label: 'Stats', type: 'list', itemSchema: 'stat', min: 2, max: 4 },
      ],
    },
    t13_before_after_quad: {
      name: 'Antes/Depois · 2 casos',
      fields: [
        { k: 'caso_1_antes',  label: 'Caso 1 · Foto antes',  type: 'image', aspect: '1/1' },
        { k: 'caso_1_depois', label: 'Caso 1 · Foto depois', type: 'image', aspect: '1/1' },
        { k: 'caso_1_label',  label: 'Caso 1 · Label',       type: 'text', max: 40 },
        { k: 'caso_2_antes',  label: 'Caso 2 · Foto antes',  type: 'image', aspect: '1/1' },
        { k: 'caso_2_depois', label: 'Caso 2 · Foto depois', type: 'image', aspect: '1/1' },
        { k: 'caso_2_label',  label: 'Caso 2 · Label',       type: 'text', max: 40 },
      ],
    },
    t14_mosaic_gallery: {
      name: 'Galeria Mosaico',
      fields: [
        { k: 'titulo',  label: 'Título',  type: 'text', max: 40 },
        { k: 'fotos',   label: 'Fotos',   type: 'list', scalarItem: { label: 'Foto', type: 'image', aspect: '1/1' }, min: 3, max: 5, hint: '1ª foto é a "hero" (maior)' },
        { k: 'legenda', label: 'Legenda', type: 'text', max: 120, optional: true },
      ],
    },
    t25_before_after_slider: {
      name: 'Antes/Depois · Slider',
      fields: [
        { k: 'titulo',      label: 'Título',      type: 'text', max: 50 },
        { k: 'subtitulo',   label: 'Subtítulo',   type: 'text', max: 160, optional: true },
        { k: 'foto_antes',  label: 'Foto antes',  type: 'image', aspect: '3/4' },
        { k: 'foto_depois', label: 'Foto depois', type: 'image', aspect: '3/4' },
        { k: 'meta',        label: 'Meta',        type: 'text', max: 120, optional: true },
      ],
    },
    t15_evolution_timeline: {
      name: 'Timeline de Evolução',
      fields: [
        { k: 'titulo', label: 'Título', type: 'text', max: 50 },
        { k: 'marcos', label: 'Marcos', type: 'list', itemSchema: 'marco', min: 3, max: 6 },
      ],
    },

    // ══════════════════════ INTERATIVOS ══════════════════════
    t16_quiz_cta: {
      name: 'Quiz · CTA',
      fields: [
        { k: 'titulo',      label: 'Título',     type: 'text',     max: 50 },
        { k: 'lede',        label: 'Lede',       type: 'textarea', max: 180, rows: 3 },
        { k: 'quiz_slug',   label: 'Quiz slug',  type: 'text',     hint: 'Aparece em quiz-render.html?q=SLUG' },
        { k: 'recompensas', label: 'Recompensas',type: 'list', itemSchema: 'recompensa', min: 2, max: 4 },
      ],
    },
    t17_poll: {
      name: 'Enquete',
      fields: [
        { k: 'pergunta', label: 'Pergunta', type: 'text', max: 140, hint: 'Termine com "?"' },
        { k: 'opcoes',   label: 'Opções',   type: 'list', scalarItem: { label: 'Opção', max: 50 }, min: 2, max: 4 },
      ],
    },

    // ══════════════════════ EXTRAS ══════════════════════
    t18_stat_feature: {
      name: 'Dado em Destaque',
      fields: [
        { k: 'numero', label: 'Número',   type: 'text',     max: 10, hint: 'Ex: "93%", "3×", "15min"' },
        { k: 'titulo', label: 'Contexto', type: 'textarea', max: 120, rows: 3, hint: 'Use *palavra* para itálico' },
        { k: 'fonte',  label: 'Fonte',    type: 'text',     max: 100, hint: 'Ex: "Estudo interno · n=48 · 2025"' },
      ],
    },
    t19_ritual_steps: {
      name: 'Passos de Ritual',
      fields: [
        { k: 'titulo', label: 'Título', type: 'text', max: 50 },
        { k: 'passos', label: 'Passos', type: 'list', itemSchema: 'passo', min: 3, max: 6 },
      ],
    },
    t20_myth_vs_fact: {
      name: 'Mito vs Fato',
      fields: [
        { k: 'titulo', label: 'Título', type: 'text', max: 40 },
        { k: 'pares',  label: 'Pares',  type: 'list', itemSchema: 'mito_fato', min: 3, max: 5 },
      ],
    },

    // ══════════════════════ SPREADS ══════════════════════
    t21_product_photo_split: {
      name: 'Produto · 2 Fotos Split',
      fields: [
        { k: 'kicker',            label: 'Kicker',               type: 'text', max: 22, hint: 'All caps · deve ser IDÊNTICO ao t22 seguinte' },
        { k: 'nome_produto',      label: 'Nome do produto',      type: 'text', max: 40 },
        { k: 'tagline',           label: 'Tagline',              type: 'text', max: 60, optional: true },
        { k: 'foto_principal',    label: 'Foto principal',       type: 'image', aspect: '3/4', hint: 'Portrait 3/4 · lado esquerdo' },
        { k: 'legenda_principal', label: 'Legenda da principal', type: 'text', max: 80, optional: true },
        { k: 'foto_detalhe',      label: 'Foto detalhe',         type: 'image', aspect: '3/4', hint: 'Portrait 3/4 · lado direito · close/aplicação' },
        { k: 'legenda_detalhe',   label: 'Legenda do detalhe',   type: 'text', max: 80, optional: true },
      ],
    },
    t22_product_feature_text: {
      name: 'Produto · Matéria Texto (par com t21)',
      fields: [
        { k: 'kicker',   label: 'Kicker',   type: 'text',     max: 22, hint: 'IDÊNTICO ao kicker do t21 anterior' },
        { k: 'titulo',   label: 'Título',   type: 'text',     max: 70, hint: 'Use *palavra* para itálico' },
        { k: 'lede',     label: 'Lede',     type: 'textarea', max: 200, minChars: 140, rows: 3 },
        { k: 'corpo',    label: 'Corpo',    type: 'textarea', wordsMin: 400, wordsMax: 700, rows: 15, hint: '2 colunas · drop cap automático · cena concreta no 1º par.' },
        { k: 'destaque', label: 'Pull quote', type: 'text',   max: 140, optional: true, hint: 'Aparece após o 2º parágrafo' },
        { k: 'byline',   label: 'Byline',   type: 'text',     max: 60, optional: true },
      ],
    },
  }

  function getFieldMeta(templateSlug, fieldKey) {
    const sec = SECTION_META[templateSlug]
    if (!sec) return null
    return sec.fields.find(f => f.k === fieldKey) || null
  }

  function getSectionMeta(templateSlug) {
    return SECTION_META[templateSlug] || null
  }

  function getItemSchema(ref) {
    return ITEM_SCHEMAS[ref] || null
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.Schema = {
    SECTION_META,
    ITEM_SCHEMAS,
    getFieldMeta,
    getSectionMeta,
    getItemSchema,
  }
})()
