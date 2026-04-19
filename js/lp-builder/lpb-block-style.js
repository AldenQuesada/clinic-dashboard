/**
 * LP Builder · Block Style System
 *
 * Controle absoluto de estilo POR BLOCO:
 *   - Tipografia (tamanho, line-height, letter-spacing por elemento)
 *   - Layout (largura, padding, alinhamento)
 *   - Cores (fundo, texto, accent)
 *
 * Armazenamento: block._style jsonb (livre, não validado rigidamente)
 *
 * Aplicação: CSS scoped via [data-block-idx="N"] { ... }
 * Gerado a cada render e injetado num <style> dedicado.
 *
 * window.LPBBlockStyle
 */
;(function () {
  'use strict'
  if (window.LPBBlockStyle) return

  // ────────────────────────────────────────────────────────────
  // Mapping elemento-field → seletor CSS dentro do bloco
  // ────────────────────────────────────────────────────────────
  var SELECTOR_BY_EL = {
    eyebrow:  '.eyebrow',
    h1:       'h1',
    h2:       'h2',
    h3:       'h3',
    h4:       'h4',
    lead:     '.lead',
    body:     'p',
    quote:    'blockquote',
    btn:      '.btn',
    faq_q:    '.faq-item summary',
    faq_a:    '.faq-item p',
    card_num: '.card-num',
  }

  // ────────────────────────────────────────────────────────────
  // Controles disponíveis por tipo de bloco
  // Gerados automaticamente baseado nos fields presentes.
  // ────────────────────────────────────────────────────────────
  function getControls(blockType) {
    var schema = window.LPBSchema
    if (!schema) return []
    var meta = schema.getBlockMeta(blockType)
    if (!meta) return []

    var controls = []
    var fieldKeys = meta.fields.map(function (f) { return f.k })

    // ── LAYOUT (universal) ───────────────────────────────────
    controls.push({ group: 'Layout' })
    controls.push({
      key: 'layout.container',
      label: 'Largura máxima',
      type: 'select',
      options: [
        { value: 'narrow',  label: 'Estreito (780px)' },
        { value: 'default', label: 'Padrão (1100px)' },
        { value: 'wide',    label: 'Largo (1400px)' },
        { value: 'xwide',   label: 'Extra-largo (1600px)' },
        { value: 'full',    label: 'Total (100%)' },
      ],
    })
    controls.push({
      key: 'layout.padding_y',
      label: 'Espaço vertical',
      type: 'select',
      options: [
        { value: 'xs', label: 'Mínimo' },
        { value: 'sm', label: 'Pequeno' },
        { value: 'md', label: 'Padrão' },
        { value: 'lg', label: 'Grande' },
        { value: 'xl', label: 'Máximo' },
      ],
    })
    controls.push({
      key: 'layout.align',
      label: 'Alinhamento de texto',
      type: 'select',
      options: [
        { value: 'left',   label: 'Esq' },
        { value: 'center', label: 'Centro' },
        { value: 'right',  label: 'Dir' },
      ],
    })

    // ── TIPOGRAFIA (por elemento presente) ───────────────────
    var hasAnyText = fieldKeys.some(function (k) {
      return ['eyebrow','h1','h2','h3','h4','lead','intro','quote','descricao','paragrafos'].indexOf(k) >= 0
        || k.startsWith('titulo') || k.startsWith('texto')
    })
    if (hasAnyText) controls.push({ group: 'Tipografia' })

    if (fieldKeys.indexOf('eyebrow') >= 0) {
      controls.push({ key: 'fonts.eyebrow.size',           label: 'Eyebrow · tamanho',      type: 'num', min: 8,   max: 18,  step: 0.5, unit: 'px' })
      controls.push({ key: 'fonts.eyebrow.letter_spacing', label: 'Eyebrow · espaçamento',  type: 'num', min: 0,   max: 8,   step: 0.5, unit: 'px' })
      controls.push({ key: 'fonts.eyebrow.nowrap',         label: 'Eyebrow em 1 linha',     type: 'bool' })
    }
    if (fieldKeys.indexOf('h1') >= 0) {
      controls.push({ key: 'fonts.h1.size',        label: 'H1 · tamanho',       type: 'num', min: 20,  max: 120, step: 1,    unit: 'px' })
      controls.push({ key: 'fonts.h1.line_height', label: 'H1 · line-height',   type: 'num', min: 0.9, max: 1.6, step: 0.05 })
      controls.push({ key: 'fonts.h1.weight',      label: 'H1 · peso',          type: 'select',
        options: [
          { value: 300, label: 'Light (300)' }, { value: 400, label: 'Regular (400)' },
          { value: 500, label: 'Medium (500)' }, { value: 600, label: 'Semibold (600)' }
        ]
      })
    }
    if (fieldKeys.indexOf('h2') >= 0) {
      controls.push({ key: 'fonts.h2.size',        label: 'H2 · tamanho',       type: 'num', min: 18,  max: 96,  step: 1,    unit: 'px' })
      controls.push({ key: 'fonts.h2.line_height', label: 'H2 · line-height',   type: 'num', min: 0.9, max: 1.6, step: 0.05 })
    }
    if (fieldKeys.indexOf('lead') >= 0) {
      controls.push({ key: 'fonts.lead.size',        label: 'Lead · tamanho',      type: 'num', min: 14, max: 32,  step: 1,    unit: 'px' })
      controls.push({ key: 'fonts.lead.line_height', label: 'Lead · line-height',  type: 'num', min: 1.2, max: 2.0, step: 0.05 })
    }
    if (fieldKeys.indexOf('quote') >= 0) {
      controls.push({ key: 'fonts.quote.size',        label: 'Citação · tamanho',   type: 'num', min: 18, max: 64,  step: 1, unit: 'px' })
    }
    if (fieldKeys.indexOf('valor') >= 0) {
      controls.push({ key: 'fonts.invest_value.size', label: 'Valor · tamanho',     type: 'num', min: 24, max: 96,  step: 1, unit: 'px' })
    }
    // Body (sempre disponivel se bloco tem texto)
    if (hasAnyText) {
      controls.push({ key: 'fonts.body.size',        label: 'Parágrafo · tamanho', type: 'num', min: 12, max: 22,  step: 1,    unit: 'px' })
      controls.push({ key: 'fonts.body.line_height', label: 'Parágrafo · line-height', type: 'num', min: 1.3, max: 2.2, step: 0.05 })
    }

    // H3/H4 (cards, lists)
    if (['cards-2col','list-rich','benefits-grid'].indexOf(blockType) >= 0) {
      controls.push({ key: 'fonts.h3.size',           label: 'H3 (card/item) · tamanho', type: 'num', min: 14, max: 36, step: 1, unit: 'px' })
    }

    // ── FAQ específico ───────────────────────────────────────
    if (blockType === 'faq') {
      controls.push({ key: 'fonts.faq_q.size', label: 'Pergunta · tamanho', type: 'num', min: 14, max: 32, step: 1, unit: 'px' })
      controls.push({ key: 'fonts.faq_a.size', label: 'Resposta · tamanho', type: 'num', min: 12, max: 22, step: 1, unit: 'px' })
    }

    // ── CORES ────────────────────────────────────────────────
    controls.push({ group: 'Cores' })
    controls.push({ key: 'colors.bg',     label: 'Fundo',       type: 'color' })
    controls.push({ key: 'colors.text',   label: 'Texto',       type: 'color' })
    controls.push({ key: 'colors.accent', label: 'Destaque',    type: 'color', hint: 'Aplica em eyebrow, accent, cashback, diamantes, etc.' })

    return controls
  }

  // ────────────────────────────────────────────────────────────
  // Controles POR ELEMENTO (renderizado inline no field do inspector)
  // ────────────────────────────────────────────────────────────
  var ALIGN_OPTIONS = [
    { value: 'left',    label: '←',    title: 'Esquerda'    },
    { value: 'center',  label: '⇔',    title: 'Centralizado' },
    { value: 'right',   label: '→',    title: 'Direita'     },
    { value: 'justify', label: '⇿',    title: 'Justificado'  },
  ]

  function getControlsForElement(elKey) {
    var c = []
    var p = 'fonts.' + elKey
    switch (elKey) {
      case 'eyebrow':
        c.push({ key: p + '.size',           label: 'Tamanho',     type: 'num', min: 8,  max: 18,  step: 0.5, unit: 'px' })
        c.push({ key: p + '.letter_spacing', label: 'Espaçamento', type: 'num', min: 0,  max: 8,   step: 0.5, unit: 'px' })
        c.push({ key: p + '.nowrap',         label: 'Em 1 linha (sem quebra)', type: 'bool' })
        c.push({ key: p + '.align',          label: 'Alinhamento', type: 'align' })
        c.push({ key: p + '.color',          label: 'Cor',         type: 'color' })
        break
      case 'h1':
      case 'h2':
        c.push({ key: p + '.size',         label: 'Tamanho',     type: 'num', min: elKey==='h1'?20:18, max: elKey==='h1'?120:96, step: 1, unit: 'px' })
        c.push({ key: p + '.line_height',  label: 'Line-height', type: 'num', min: 0.9, max: 1.6, step: 0.05 })
        c.push({ key: p + '.weight',       label: 'Peso',        type: 'select',
          options: [
            { value: 300, label: 'Light (300)' }, { value: 400, label: 'Regular (400)' },
            { value: 500, label: 'Medium (500)' }, { value: 600, label: 'Semibold (600)' },
            { value: 700, label: 'Bold (700)' },
          ]
        })
        c.push({ key: p + '.align', label: 'Alinhamento', type: 'align' })
        c.push({ key: p + '.color', label: 'Cor',         type: 'color' })
        break
      case 'h3':
      case 'h4':
        c.push({ key: p + '.size',  label: 'Tamanho',     type: 'num', min: 12, max: 36, step: 1, unit: 'px' })
        c.push({ key: p + '.align', label: 'Alinhamento', type: 'align' })
        c.push({ key: p + '.color', label: 'Cor',         type: 'color' })
        break
      case 'lead':
        c.push({ key: p + '.size',         label: 'Tamanho',     type: 'num', min: 14, max: 32, step: 1, unit: 'px' })
        c.push({ key: p + '.line_height',  label: 'Line-height', type: 'num', min: 1.2, max: 2.0, step: 0.05 })
        c.push({ key: p + '.align',        label: 'Alinhamento', type: 'align' })
        c.push({ key: p + '.color',        label: 'Cor',         type: 'color' })
        c.push({ key: p + '.drop_cap',     label: 'Letra capitular (drop-cap)', type: 'bool',
          hint: 'Primeira letra grande estilo editorial' })
        break
      case 'body':
        c.push({ key: p + '.size',         label: 'Tamanho',     type: 'num', min: 12, max: 22, step: 1, unit: 'px' })
        c.push({ key: p + '.line_height',  label: 'Line-height', type: 'num', min: 1.3, max: 2.2, step: 0.05 })
        c.push({ key: p + '.align',        label: 'Alinhamento', type: 'align' })
        c.push({ key: p + '.color',        label: 'Cor',         type: 'color' })
        c.push({ key: p + '.drop_cap',     label: 'Letra capitular no 1º parágrafo', type: 'bool' })
        break
      case 'quote':
        c.push({ key: p + '.size',  label: 'Tamanho',     type: 'num', min: 18, max: 64, step: 1, unit: 'px' })
        c.push({ key: p + '.align', label: 'Alinhamento', type: 'align' })
        c.push({ key: p + '.color', label: 'Cor',         type: 'color' })
        break
      case 'invest_value':
        c.push({ key: p + '.size',  label: 'Tamanho',     type: 'num', min: 24, max: 96, step: 1, unit: 'px' })
        c.push({ key: p + '.color', label: 'Cor',         type: 'color' })
        break
      case 'faq_q':
        c.push({ key: p + '.size',  label: 'Pergunta · tamanho', type: 'num', min: 14, max: 32, step: 1, unit: 'px' })
        c.push({ key: p + '.color', label: 'Cor da pergunta',    type: 'color' })
        break
      case 'faq_a':
        c.push({ key: p + '.size',  label: 'Resposta · tamanho', type: 'num', min: 12, max: 22, step: 1, unit: 'px' })
        c.push({ key: p + '.color', label: 'Cor da resposta',    type: 'color' })
        break
    }
    return c
  }

  // Mapeia field → elemento de estilo (usado pelo inspector)
  function elementForField(fieldKey) {
    if (fieldKey === 'eyebrow') return 'eyebrow'
    if (fieldKey === 'h1')      return 'h1'
    if (fieldKey === 'h2')      return 'h2'
    if (fieldKey === 'h3')      return 'h3'
    if (fieldKey === 'h4')      return 'h4'
    if (fieldKey === 'lead')    return 'lead'
    if (fieldKey === 'intro')   return 'body'
    if (fieldKey === 'descricao') return 'body'
    if (fieldKey === 'paragrafos') return 'body'
    if (fieldKey === 'quote')   return 'quote'
    if (fieldKey === 'valor')   return 'invest_value'
    return null  // sem mapping
  }

  // Layout/cores globais (section "Ajustes do bloco" — só essenciais agora)
  function getLayoutControls() {
    return [
      { group: 'Animação de entrada' },
      { key: 'animation.type', label: 'Animação ao aparecer', type: 'select',
        options: [
          { value: 'none',       label: 'Nenhuma' },
          { value: 'fade-up',    label: 'Subir suavemente (default)' },
          { value: 'fade-left',  label: 'Vir da esquerda' },
          { value: 'fade-right', label: 'Vir da direita' },
          { value: 'fade-zoom',  label: 'Zoom suave' },
        ] },
      { key: 'animation.delay', label: 'Atraso (ms)', type: 'num',
        min: 0, max: 1500, step: 50, hint: 'Útil pra criar sequência (cada bloco com delay maior)' },
      { group: 'Layout' },
      { key: 'layout.container', label: 'Largura máxima', type: 'select',
        options: [
          { value: 'narrow',  label: 'Estreito (780px)' },
          { value: 'default', label: 'Padrão (1100px)' },
          { value: 'wide',    label: 'Largo (1400px)' },
          { value: 'xwide',   label: 'Extra-largo (1600px)' },
          { value: 'full',    label: 'Total (100%)' },
        ],
      },
      { key: 'layout.padding_y', label: 'Espaço vertical', type: 'select',
        options: [
          { value: 'xs', label: 'Mínimo' },
          { value: 'sm', label: 'Pequeno' },
          { value: 'md', label: 'Padrão' },
          { value: 'lg', label: 'Grande' },
          { value: 'xl', label: 'Máximo' },
        ],
      },
      { key: 'layout.align', label: 'Alinhamento (todos os textos)', type: 'align' },
      { group: 'Cores do bloco' },
      { key: 'colors.bg',     label: 'Fundo',    type: 'color' },
      { key: 'colors.text',   label: 'Texto',    type: 'color' },
      { key: 'colors.accent', label: 'Destaque', type: 'color', hint: 'Eyebrow · números · diamantes' },
    ]
  }

  // ────────────────────────────────────────────────────────────
  // get/set por path (ex: "fonts.h1.size")
  // ────────────────────────────────────────────────────────────
  function getPath(obj, path) {
    if (!obj) return undefined
    var parts = String(path).split('.')
    var cur = obj
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined
      cur = cur[parts[i]]
    }
    return cur
  }
  function setPath(obj, path, value) {
    var parts = String(path).split('.')
    var cur = obj
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}
      cur = cur[parts[i]]
    }
    cur[parts[parts.length - 1]] = value
  }
  function deletePath(obj, path) {
    var parts = String(path).split('.')
    var cur = obj
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur == null) return
      cur = cur[parts[i]]
    }
    if (cur) delete cur[parts[parts.length - 1]]
  }

  // ────────────────────────────────────────────────────────────
  // Layout presets → valores concretos
  // ────────────────────────────────────────────────────────────
  var CONTAINER_PX = {
    narrow: '780px', default: '1100px', wide: '1400px', xwide: '1600px', full: '100%',
  }
  var PADDING_Y_PX = {
    xs: '20px', sm: '40px', md: '80px', lg: '120px', xl: '160px',
  }

  // ────────────────────────────────────────────────────────────
  // Gera CSS scoped pra 1 bloco (baseado no _style)
  // ────────────────────────────────────────────────────────────
  function generateScopedCss(blockIdx, style) {
    if (!style || typeof style !== 'object') return ''
    var sel = '[data-block-idx="' + blockIdx + '"]'
    var out = []

    // Layout
    if (style.layout) {
      var bgSection = style.colors && style.colors.bg
      var padY = style.layout.padding_y
      if (padY && PADDING_Y_PX[padY]) {
        out.push(sel + ' > section, ' + sel + ' > header, ' + sel + ' > footer, ' + sel + ' > .hero, ' + sel + ' > nav, ' + sel + ' section:first-child { padding-top: ' + PADDING_Y_PX[padY] + ' !important; padding-bottom: ' + PADDING_Y_PX[padY] + ' !important; }')
      }
      var cw = style.layout.container
      if (cw && CONTAINER_PX[cw]) {
        out.push(sel + ' .container, ' + sel + ' .container-narrow { max-width: ' + CONTAINER_PX[cw] + ' !important; }')
      }
      var align = style.layout.align
      if (align) {
        out.push(sel + ' { text-align: ' + align + ' !important; }')
      }
    }

    // Animação de entrada
    if (style.animation && style.animation.type && style.animation.type !== 'none') {
      var t = style.animation.type
      var delay = parseInt(style.animation.delay, 10) || 0
      // marca o bloco com data-reveal-anim pra que o JS de reveal aplique a class certa
      // CSS: aplica animation ao adicionar .is-visible
      out.push(sel + '.lpb-anim-' + t + '.is-visible { animation: lpbAnim_' + t + ' .9s cubic-bezier(0.55,0,0.1,1) ' + delay + 'ms both; }')
    }

    // Cores (scoped)
    if (style.colors) {
      if (style.colors.bg) {
        out.push(sel + ', ' + sel + ' > section, ' + sel + ' > header, ' + sel + ' > .hero { background: ' + style.colors.bg + ' !important; }')
      }
      if (style.colors.text) {
        out.push(sel + ', ' + sel + ' p, ' + sel + ' h1, ' + sel + ' h2, ' + sel + ' h3, ' + sel + ' li { color: ' + style.colors.text + ' !important; }')
      }
      if (style.colors.accent) {
        out.push(sel + ' .eyebrow, ' + sel + ' h4, ' + sel + ' .card-num, ' + sel + ' .investimento-valor, ' + sel + ' .cashback-badge { color: ' + style.colors.accent + ' !important; }')
        out.push(sel + ' .divider-diamond, ' + sel + ' .card-num::before { background: ' + style.colors.accent + ' !important; }')
      }
    }

    // Tipografia
    if (style.fonts) {
      Object.keys(style.fonts).forEach(function (el) {
        var spec = style.fonts[el]
        if (!spec || typeof spec !== 'object') return
        var elSel = (el === 'invest_value') ? '.investimento-valor'
                  : SELECTOR_BY_EL[el] || null
        if (!elSel) return
        var props = []
        if (spec.size       != null) props.push('font-size: ' + spec.size + 'px !important;')
        if (spec.line_height!= null) props.push('line-height: ' + spec.line_height + ' !important;')
        if (spec.letter_spacing != null) props.push('letter-spacing: ' + spec.letter_spacing + 'px !important;')
        if (spec.weight     != null) props.push('font-weight: ' + spec.weight + ' !important;')
        if (spec.nowrap === true)    props.push('white-space: nowrap !important;')
        if (spec.align)              props.push('text-align: ' + spec.align + ' !important;')
        if (spec.color)              props.push('color: ' + spec.color + ' !important;')
        if (props.length) {
          out.push(sel + ' ' + elSel + ' { ' + props.join(' ') + ' }')
        }
        // drop_cap: aplica ::first-letter
        if (spec.drop_cap === true) {
          // pra .lead, aplica no proprio elemento; pra body, aplica no primeiro <p>
          var dcSel = el === 'body' ? sel + ' p:first-of-type::first-letter'
                                    : sel + ' ' + elSel + '::first-letter'
          out.push(dcSel + " { float: left; font-family: 'Cormorant Garamond', serif; font-style: italic; font-weight: 400; font-size: 5em; line-height: 0.85; padding: 4px 12px 0 0; color: var(--champagne-dk); }")
        }
      })
    }

    return out.join('\n')
  }

  // Gera CSS de todos os blocos da pagina
  function generateAllCss(blocks) {
    if (!Array.isArray(blocks)) return ''
    return blocks.map(function (b, idx) {
      return b && b._style ? generateScopedCss(idx, b._style) : ''
    }).filter(Boolean).join('\n')
  }

  // ────────────────────────────────────────────────────────────
  // Aplica _style a todos os blocos do mesmo tipo
  // ────────────────────────────────────────────────────────────
  function applyToSiblings(blockType, style) {
    if (!window.LPBuilder) return 0
    var page = LPBuilder.getCurrentPage()
    if (!page) return 0
    var n = 0
    ;(page.blocks || []).forEach(function (b) {
      if (b.type === blockType) {
        b._style = JSON.parse(JSON.stringify(style || {}))
        n++
      }
    })
    return n
  }

  // ────────────────────────────────────────────────────────────
  // Reset (limpa _style do bloco)
  // ────────────────────────────────────────────────────────────
  function resetBlock(blockIdx) {
    if (!window.LPBuilder) return
    var b = LPBuilder.getBlock(blockIdx)
    if (b) delete b._style
  }

  window.LPBBlockStyle = Object.freeze({
    getControls:            getControls,            // legado (com tudo)
    getControlsForElement:  getControlsForElement,  // só do elemento
    getLayoutControls:      getLayoutControls,      // só layout/cores
    elementForField:        elementForField,
    ALIGN_OPTIONS:          ALIGN_OPTIONS,
    getPath:                getPath,
    setPath:                setPath,
    deletePath:             deletePath,
    generateScopedCss:      generateScopedCss,
    generateAllCss:         generateAllCss,
    applyToSiblings:        applyToSiblings,
    resetBlock:             resetBlock,
    CONTAINER_PX:           CONTAINER_PX,
    PADDING_Y_PX:           PADDING_Y_PX,
  })
})()
