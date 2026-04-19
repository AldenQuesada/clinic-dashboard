/**
 * ClinicAI — Landing Page Builder · Design Tokens (mobile-first)
 *
 * Fonte unica de verdade dos tokens visuais das LPs.
 * Cada token tem 3 valores: { mobile, tablet, desktop }
 *
 * Inspirado em quiz-design-specs.js (pixel-perfect mobile)
 * + paleta atual de css/lp-shared.css (Champagne + Ivory + Graphite).
 *
 * Uso:
 *   var t = LPBTokens.get('typography.h1')
 *     // -> { mobile: 32, tablet: 48, desktop: 64, unit: 'px', ... }
 *
 *   var bp = LPBTokens.getBreakpoint(window.innerWidth)
 *     // -> 'mobile' | 'tablet' | 'desktop'
 *
 *   var css = LPBTokens.toCssVariables({ mobile: true })
 *     // string com :root { --token: value; ... }
 *
 *   var v = LPBTokens.validate('typography.h1', { mobile: 80 })
 *     // -> { valid: false, errors: ['mobile fora da faixa 24-44'] }
 */
;(function () {
  'use strict'
  if (window.LPBTokens) return

  // ============================================================
  // BREAKPOINTS
  // ============================================================
  var BREAKPOINTS = {
    mobile:  { min: 0,    max: 767  },  // celular padrao (>=380px efetivo)
    tablet:  { min: 768,  max: 1023 },  // iPad / tablet
    desktop: { min: 1024, max: Infinity },  // notebook / PC
  }

  function getBreakpoint(width) {
    if (typeof width !== 'number') width = window.innerWidth || 360
    if (width < 768)  return 'mobile'
    if (width < 1024) return 'tablet'
    return 'desktop'
  }

  // ============================================================
  // PALETA · imutavel (cores nao mudam por breakpoint)
  // ============================================================
  var COLORS = {
    // base — paleta clinic mirian
    ivory:        '#FEFCF8',
    bege:         '#F5F0E8',
    bege2:        '#EDE4D5',
    champagne:    '#C8A97E',
    champagneLt:  '#DFC5A0',
    champagneDk:  '#A8895E',
    graphite:     '#2C2C2C',
    graphiteLt:   '#4A4A4A',
    graphiteMute: '#8A7F74',
    sage:         '#8A9E88',
    rosa:         '#C4937A',
    // semantic / utility
    border:       'rgba(168, 137, 94, 0.20)',
    borderSoft:   'rgba(168, 137, 94, 0.10)',
    shadowSoft:   '0 6px 30px rgba(44, 44, 44, 0.06)',
    shadowMid:    '0 10px 40px rgba(44, 44, 44, 0.10)',
    // whatsapp
    waGreen:      '#25D366',
    waDark:       '#1FAF54',
  }

  // ============================================================
  // TIPOGRAFIA · 3 valores por token
  // unit padrao 'px'. line-height: usar number sem unit (multiplica fonte)
  // ============================================================
  var TYPOGRAPHY = {
    // ── Display headings ─────────────────────────────────────
    h1: {
      family: "'Cormorant Garamond', 'Times New Roman', serif",
      weight: 300, italic: true,
      size:       { mobile: 32, tablet: 48, desktop: 64, unit: 'px' },
      lineHeight: { mobile: 1.12, tablet: 1.10, desktop: 1.08 },
      letterSpacing: '-0.01em',
      min: { mobile: 24, tablet: 36, desktop: 48 },
      max: { mobile: 44, tablet: 60, desktop: 84 },
    },
    h2: {
      family: "'Cormorant Garamond', serif",
      weight: 400, italic: false,
      size:       { mobile: 28, tablet: 38, desktop: 48, unit: 'px' },
      lineHeight: { mobile: 1.18, tablet: 1.16, desktop: 1.15 },
      letterSpacing: '-0.01em',
      min: { mobile: 22, tablet: 30, desktop: 36 },
      max: { mobile: 36, tablet: 48, desktop: 60 },
    },
    h3: {
      family: "'Cormorant Garamond', serif",
      weight: 500, italic: false,
      size:       { mobile: 20, tablet: 21, desktop: 22, unit: 'px' },
      lineHeight: { mobile: 1.30, tablet: 1.30, desktop: 1.30 },
      letterSpacing: 'normal',
    },
    h4: {
      family: "'Montserrat', sans-serif",
      weight: 600, italic: false,
      size:       { mobile: 11, tablet: 12, desktop: 12, unit: 'px' },
      lineHeight: { mobile: 1.4, tablet: 1.4, desktop: 1.4 },
      letterSpacing: '3px', textTransform: 'uppercase',
      color: 'champagneDk',
    },
    // ── Eyebrow (kicker pequeno) ─────────────────────────────
    eyebrow: {
      family: "'Montserrat', sans-serif",
      weight: 500, italic: false,
      size:       { mobile: 10, tablet: 11, desktop: 11, unit: 'px' },
      lineHeight: { mobile: 1.4, tablet: 1.4, desktop: 1.4 },
      letterSpacing: '5px', textTransform: 'uppercase',
      color: 'champagneDk',
    },
    // ── Lead (paragrafo destaque, italico Cormorant) ─────────
    lead: {
      family: "'Cormorant Garamond', serif",
      weight: 400, italic: true,
      size:       { mobile: 18, tablet: 22, desktop: 24, unit: 'px' },
      lineHeight: { mobile: 1.5, tablet: 1.5, desktop: 1.5 },
      color: 'graphiteLt',
    },
    // ── Body (paragrafo padrao Montserrat) ───────────────────
    body: {
      family: "'Montserrat', sans-serif",
      weight: 300, italic: false,
      size:       { mobile: 15, tablet: 16, desktop: 16, unit: 'px' },
      lineHeight: { mobile: 1.7, tablet: 1.75, desktop: 1.75 },
      color: 'graphiteLt',
    },
    bodySm: {
      family: "'Montserrat', sans-serif",
      weight: 300, italic: false,
      size:       { mobile: 13, tablet: 14, desktop: 14, unit: 'px' },
      lineHeight: { mobile: 1.6, tablet: 1.65, desktop: 1.65 },
      color: 'graphiteLt',
    },
    // ── Quote (blockquote grande) ────────────────────────────
    quote: {
      family: "'Cormorant Garamond', serif",
      weight: 300, italic: true,
      size:       { mobile: 24, tablet: 32, desktop: 38, unit: 'px' },
      lineHeight: { mobile: 1.4, tablet: 1.4, desktop: 1.4 },
      color: 'graphite',
    },
    // ── Investimento valor (numero gigante) ──────────────────
    investValue: {
      family: "'Cormorant Garamond', serif",
      weight: 400, italic: false,
      size:       { mobile: 36, tablet: 46, desktop: 56, unit: 'px' },
      lineHeight: { mobile: 1, tablet: 1, desktop: 1 },
      color: 'champagneLt',
    },
    // ── Brand name (logo navbar) ─────────────────────────────
    brandName: {
      family: "'Cormorant Garamond', serif",
      weight: 400, italic: false,
      size:       { mobile: 19, tablet: 21, desktop: 22, unit: 'px' },
      lineHeight: { mobile: 1, tablet: 1, desktop: 1 },
      letterSpacing: '-0.01em',
    },
    brandSmall: {
      family: "'Montserrat', sans-serif",
      weight: 500, italic: false,
      size:       { mobile: 8, tablet: 9, desktop: 9, unit: 'px' },
      lineHeight: { mobile: 1, tablet: 1, desktop: 1 },
      letterSpacing: '5px', textTransform: 'uppercase',
      color: 'champagne',
    },
    // ── Button label ─────────────────────────────────────────
    btn: {
      family: "'Montserrat', sans-serif",
      weight: 500, italic: false,
      size:       { mobile: 11, tablet: 12, desktop: 12, unit: 'px' },
      lineHeight: { mobile: 1, tablet: 1, desktop: 1 },
      letterSpacing: '2.5px', textTransform: 'uppercase',
    },
    btnLarge: {
      family: "'Montserrat', sans-serif",
      weight: 500, italic: false,
      size:       { mobile: 12, tablet: 13, desktop: 13, unit: 'px' },
      lineHeight: { mobile: 1, tablet: 1, desktop: 1 },
      letterSpacing: '2.5px', textTransform: 'uppercase',
    },
    // ── FAQ summary ─────────────────────────────────────────
    faqSummary: {
      family: "'Cormorant Garamond', serif",
      weight: 400, italic: false,
      size:       { mobile: 18, tablet: 20, desktop: 22, unit: 'px' },
      lineHeight: { mobile: 1.4, tablet: 1.4, desktop: 1.4 },
      color: 'graphite',
    },
  }

  // ============================================================
  // ESPACAMENTO · paddings / gaps / margins
  // ============================================================
  var SPACING = {
    sectionY: { mobile: 60, tablet: 90, desktop: 120, unit: 'px',
                hint: 'padding vertical de cada section' },
    sectionXMobile: { mobile: 20, tablet: 24, desktop: 24, unit: 'px',
                      hint: 'padding horizontal do container nos breakpoints' },

    container:        { mobile: 100,  tablet: 100,  desktop: 1100, unit: '%/px',
                        hint: 'width 100% no mobile; max 1100px no desktop' },
    containerNarrow:  { mobile: 100,  tablet: 100,  desktop: 780,  unit: '%/px' },

    heroPadTop:    { mobile: 80,  tablet: 120, desktop: 160, unit: 'px' },
    heroPadBottom: { mobile: 60,  tablet: 80,  desktop: 100, unit: 'px' },
    heroGap:       { mobile: 40,  tablet: 60,  desktop: 80,  unit: 'px',
                     hint: 'gap entre coluna texto e coluna visual no hero-split' },

    cardPad:    { mobile: 28, tablet: 32, desktop: 36, unit: 'px' },
    cardGap:    { mobile: 20, tablet: 24, desktop: 30, unit: 'px',
                  hint: 'gap entre cards do grid-2/3' },
    cardNum:    { mobile: 36, tablet: 40, desktop: 42, unit: 'px',
                  hint: 'tamanho do numero "01" no card' },

    blockIntroMb:  { mobile: 40, tablet: 52, desktop: 64, unit: 'px',
                     hint: 'margin-bottom do block-intro' },
    h2Mb:          { mobile: 14, tablet: 16, desktop: 18, unit: 'px' },
    h3Mb:          { mobile: 10, tablet: 12, desktop: 12, unit: 'px' },
    eyebrowMb:     { mobile: 14, tablet: 16, desktop: 18, unit: 'px' },

    btnPadY:       { mobile: 14, tablet: 14, desktop: 14, unit: 'px' },
    btnPadX:       { mobile: 26, tablet: 28, desktop: 28, unit: 'px' },
    btnLargePadY:  { mobile: 16, tablet: 18, desktop: 18, unit: 'px' },
    btnLargePadX:  { mobile: 32, tablet: 38, desktop: 42, unit: 'px' },

    investPad:     { mobile: 36, tablet: 50, desktop: 64, unit: 'px',
                     hint: 'padding interno do card investimento' },

    faqItemPadY:   { mobile: 20, tablet: 22, desktop: 24, unit: 'px' },

    listItemPadY:  { mobile: 18, tablet: 20, desktop: 22, unit: 'px' },
    listGapText:   { mobile: 14, tablet: 18, desktop: 20, unit: 'px',
                     hint: 'gap entre o diamante e o texto do item' },
  }

  // ============================================================
  // BORDERS / RADIUS / SHADOWS
  // ============================================================
  var BORDERS = {
    radiusButton:  2,    // estetica angular (lp-shared atual usa 2px)
    radiusCard:    2,
    radiusBadge:   100,  // pill (cashback-badge)
    radiusInput:   2,
    widthHairline: 1,
    widthAccent:   3,
  }

  // ============================================================
  // TRANSITIONS / EASING
  // ============================================================
  var MOTION = {
    fast:   '0.2s ease',
    base:   '0.25s ease',
    slow:   '0.4s ease',
    reveal: '0.8s ease',  // scroll reveal
  }

  // ============================================================
  // TUDO JUNTO
  // ============================================================
  var TOKENS = {
    breakpoints: BREAKPOINTS,
    colors:      COLORS,
    typography:  TYPOGRAPHY,
    spacing:     SPACING,
    borders:     BORDERS,
    motion:      MOTION,
  }

  // ============================================================
  // API
  // ============================================================
  function _path(obj, dotted) {
    var p = String(dotted || '').split('.')
    var cur = obj
    for (var i = 0; i < p.length; i++) {
      if (cur == null) return null
      cur = cur[p[i]]
    }
    return cur === undefined ? null : cur
  }

  function get(dotted) { return _path(TOKENS, dotted) }
  function getAll() { return JSON.parse(JSON.stringify(TOKENS)) }
  function getColor(key) { return COLORS[key] || null }

  // Resolve um token responsivo pra UM breakpoint especifico.
  //   resolve('typography.h1.size', 'mobile') -> 32
  function resolve(dotted, breakpoint) {
    var v = get(dotted)
    if (v && typeof v === 'object' && breakpoint in v) return v[breakpoint]
    return v
  }

  // Validar que um valor proposto esta dentro dos limites min/max declarados.
  //   validate('typography.h1', { mobile: 80 })
  //     -> { valid: false, errors: ['mobile (80) acima do max (44)'] }
  function validate(dotted, partial) {
    var spec = get(dotted)
    if (!spec || typeof spec !== 'object') {
      return { valid: false, errors: ['token nao encontrado: ' + dotted] }
    }
    var errors = []
    var bps = ['mobile', 'tablet', 'desktop']
    bps.forEach(function (bp) {
      if (!(bp in (partial || {}))) return
      var val = partial[bp]
      var min = spec.min && spec.min[bp]
      var max = spec.max && spec.max[bp]
      if (typeof min === 'number' && val < min) {
        errors.push(bp + ' (' + val + ') abaixo do min (' + min + ')')
      }
      if (typeof max === 'number' && val > max) {
        errors.push(bp + ' (' + val + ') acima do max (' + max + ')')
      }
    })
    return { valid: errors.length === 0, errors: errors }
  }

  // Gera CSS para um breakpoint especifico (ou os 3 com media-queries).
  //   toCssVariables({ breakpoint: 'mobile' })  -> ":root { --color-ivory: #FEFCF8; ... }"
  //   toCssVariables({ all: true })             -> bloco com 3 media-queries
  function toCssVariables(opts) {
    opts = opts || {}
    var lines = []
    // cores (constantes)
    Object.keys(COLORS).forEach(function (k) {
      lines.push('  --color-' + _kebab(k) + ': ' + COLORS[k] + ';')
    })
    // borders
    Object.keys(BORDERS).forEach(function (k) {
      var v = BORDERS[k]
      lines.push('  --' + _kebab(k) + ': ' + (typeof v === 'number' ? v + 'px' : v) + ';')
    })
    // motion
    Object.keys(MOTION).forEach(function (k) {
      lines.push('  --motion-' + _kebab(k) + ': ' + MOTION[k] + ';')
    })

    if (opts.all) {
      // 3 media-queries
      var out = ':root {\n' + lines.join('\n') + '\n}\n\n'
      ;['mobile', 'tablet', 'desktop'].forEach(function (bp) {
        out += _mediaFor(bp) + ' {\n  :root {\n' + _responsiveLines(bp).join('\n') + '\n  }\n}\n\n'
      })
      return out
    }
    var bp = opts.breakpoint || 'mobile'
    return ':root {\n' + lines.concat(_responsiveLines(bp)).join('\n') + '\n}'
  }

  function _responsiveLines(bp) {
    var out = []
    // typography sizes / line-heights
    Object.keys(TYPOGRAPHY).forEach(function (k) {
      var t = TYPOGRAPHY[k]
      if (t.size && t.size[bp] != null) {
        out.push('  --font-' + _kebab(k) + '-size: ' + t.size[bp] + (t.size.unit || 'px') + ';')
      }
      if (t.lineHeight && t.lineHeight[bp] != null) {
        out.push('  --font-' + _kebab(k) + '-lh: ' + t.lineHeight[bp] + ';')
      }
    })
    // spacing
    Object.keys(SPACING).forEach(function (k) {
      var s = SPACING[k]
      if (s[bp] != null) {
        var unit = (s.unit || 'px').split('/')[0]  // se '%/px', usa '%' no mobile
        out.push('  --space-' + _kebab(k) + ': ' + s[bp] + unit + ';')
      }
    })
    return out
  }

  function _mediaFor(bp) {
    var b = BREAKPOINTS[bp]
    if (!b) return '@media all'
    if (bp === 'mobile')  return '@media (max-width: 767px)'
    if (bp === 'tablet')  return '@media (min-width: 768px) and (max-width: 1023px)'
    return '@media (min-width: 1024px)'
  }

  function _kebab(s) {
    return String(s).replace(/([A-Z])/g, '-$1').toLowerCase()
  }

  // Listar todos os tokens (uso pelo painel de inspector)
  function list() {
    var out = []
    Object.keys(TYPOGRAPHY).forEach(function (k) { out.push({ group: 'typography', key: k }) })
    Object.keys(SPACING).forEach(function (k) { out.push({ group: 'spacing', key: k, hint: SPACING[k].hint || '' }) })
    Object.keys(COLORS).forEach(function (k) { out.push({ group: 'colors', key: k, value: COLORS[k] }) })
    return out
  }

  // ============================================================
  // EXPOSE
  // ============================================================
  window.LPBTokens = Object.freeze({
    BREAKPOINTS: BREAKPOINTS,
    COLORS: COLORS,
    TYPOGRAPHY: TYPOGRAPHY,
    SPACING: SPACING,
    BORDERS: BORDERS,
    MOTION: MOTION,
    // API
    get: get,
    getAll: getAll,
    getColor: getColor,
    resolve: resolve,
    validate: validate,
    getBreakpoint: getBreakpoint,
    toCssVariables: toCssVariables,
    list: list,
  })
})()
