/**
 * ClinicAI — Quiz Design Specs (Repositorio de Seguranca)
 *
 * Fonte unica de verdade para TODAS as regras visuais dos componentes do quiz.
 * Quando um componente e ativado no editor ou renderizado no quiz-render,
 * DEVE respeitar os valores definidos aqui.
 *
 * Uso:
 *   var specs = QuizDesignSpecs.get('intro-logo')
 *   // retorna { width: 44, height: 44, borderRadius: 10, margin: '24px auto 12px' }
 *
 *   QuizDesignSpecs.validate('intro-title', { fontSize: 30 })
 *   // retorna { valid: false, errors: ['fontSize: esperado 26, recebido 30'] }
 */

;(function() {
  'use strict'
  if (window.QuizDesignSpecs) return

  // ============================================================
  // DESIGN SYSTEM — CSS Variables (valores de referencia)
  // ============================================================
  var DESIGN_SYSTEM = {
    bg: {
      main:  '#F4F3F8',
      card:  '#FFFFFF',
      soft:  '#EDECF2',
      hover: '#E5E4EA',
    },
    text: {
      primary:   '#111111',
      secondary: '#6B7280',
      muted:     '#9CA3AF',
      white:     '#FFFFFF',
    },
    btn: {
      primaryBg:   '#111111',
      primaryText: '#FFFFFF',
      secondaryBg:   '#E5E7EB',
      secondaryText: '#374151',
      disabledBg:   '#D1D5DB',
      disabledText: '#9CA3AF',
    },
    option: {
      bg:           '#E9E9EC',
      selectedBg:   '#111111',
      text:         '#111111',
      selectedText: '#FFFFFF',
    },
    ui: {
      checkBg:     '#FFFFFF',
      checkBorder: '#D1D5DB',
      progressActive:   '#111111',
      progressInactive: '#E5E7EB',
    },
    accent: {
      success: '#32D74B',
      warning: '#F59E0B',
      error:   '#FF3B30',
    },
    gradient: {
      primary: 'linear-gradient(135deg, #5B6CFF, #7A5CFF)',
      primaryRgba: 'linear-gradient(135deg, rgba(91,108,255,0.9), rgba(122,92,255,0.9))',
    },
    dark: {
      bg:            '#0D0D0F',
      textPrimary:   '#FFFFFF',
      textSecondary: '#A1A1AA',
      accentGreen:   '#32D74B',
      accentRed:     '#FF3B30',
    },
  }

  // ============================================================
  // COMPONENTES — Specs exatas por componente
  // ============================================================
  var COMPONENTS = {

    // ── TELA DE INICIO (Premium RiseGuide Style) ────────────
    'intro-logo': {
      width: 'auto', height: 'auto',
      borderRadius: 0,
      background: 'transparent',
      margin: '-16px auto -20px',
      imgMaxHeight: 120,
      imgMaxWidth: 280,
      transform: 'scale(1.6)',
    },

    'intro-divider': {
      width: '100%', height: 1,
      background: 'linear-gradient(90deg, transparent, #D1D5DB, transparent)',
      borderRadius: 0,
      margin: '20px auto 24px',
    },

    'intro-title': {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 28, fontWeight: 800,
      lineHeight: '36px',
      letterSpacing: '-0.5px',
      color: '#1a1a2e',
      textAlign: 'center',
      padding: '0 24px',
      marginTop: 0, marginBottom: 10,
    },

    'intro-subtitle': {
      fontSize: 13, fontWeight: 500,
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
      color: '#8B8BA3',
      lineHeight: '18px',
      textAlign: 'center',
      padding: '0 32px',
      marginBottom: 20,
    },

    'intro-section-prompt': {
      fontSize: 18, fontWeight: 500,
      lineHeight: '26px',
      color: '#5B6CFF',
      textAlign: 'center',
      marginTop: 4, marginBottom: 16,
      padding: '0 24px',
    },

    'intro-image': {
      width: 'calc(100% - 32px)',
      maxWidth: 380,
      height: 320,
      objectFit: 'cover',
      borderRadius: 16,
      margin: '0 auto 24px',
      boxShadow: '0 8px 32px rgba(91,108,255,0.12), 0 2px 8px rgba(0,0,0,0.06)',
    },

    'intro-countdown': {
      fontSize: 13, fontWeight: 500,
      color: '#FF3B30',
      textAlign: 'center',
      marginBottom: 16,
    },

    'intro-cta': {
      width: '100%', height: 58,
      borderRadius: 30,
      background: 'linear-gradient(135deg, #5B6CFF 0%, #7B68EE 50%, #9B6DFF 100%)',
      color: '#FFFFFF',
      fontSize: 17, fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '1.5px',
      boxShadow: '0 6px 24px rgba(91,108,255,0.35), 0 2px 8px rgba(91,108,255,0.2)',
      activeScale: 0.97,
    },

    'intro-cta-wrap': {
      marginTop: 'auto',
      position: 'sticky',
      bottom: 0,
      padding: '16px 20px 28px',
      background: 'linear-gradient(180deg, transparent, #EAE7F2 30%)',
    },

    // ── AUTHORITY BADGES (Social Proof — grouped card) ────
    'badge-container': {
      display: 'flex',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12, marginBottom: 20,
      padding: '0 16px',
    },

    'badge-card': {
      display: 'inline-flex',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: '8px 6px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      border: '1px solid #E5E7EB',
      grouping: 'up to 3 per card, dividers between items',
    },

    'badge-item': {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '2px 10px',
      fontSize: 13, fontWeight: 600,
      color: '#111111',
      iconColors: {
        star:    '#00B67A',
        users:   '#6B7280',
        clock:   '#6B7280',
        check:   '#6B7280',
        heart:   '#EF4444',
        shield:  '#6B7280',
        default: '#6B7280',
      },
    },

    'badge-divider': {
      width: 1,
      height: 16,
      background: '#D1D5DB',
    },

    // ── SECTION PROMPT ──────────────────────────────────────
    'section-prompt': {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 18, fontWeight: 500,
      lineHeight: '24px',
      color: '#111111',
      textAlign: 'left',
      marginTop: 8, marginBottom: 12,
      paddingX: 20,
    },

    // ── IMAGE CHOICE CARDS ──────────────────────────────────
    'image-grid': {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginTop: 12,
    },

    'image-card': {
      height: 180,
      borderRadius: 18,
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      hoverTransform: 'translateY(-2px)',
      activeScale: 0.97,
      selectedBoxShadow: '0 0 0 2px #111111',
    },

    'image-card-overlay': {
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      height: '40%',
      background: 'linear-gradient(135deg, rgba(91,108,255,0.9), rgba(122,92,255,0.9))',
    },

    'image-card-label': {
      position: 'absolute',
      bottom: 12, left: 14,
      fontSize: 15, fontWeight: 600,
      color: '#FFFFFF',
    },

    'image-card-arrow': {
      position: 'absolute',
      bottom: 12, right: 14,
      color: '#FFFFFF',
      opacity: 0.9,
    },

    'image-card-behavior': {
      autoAdvance: true,
      autoAdvanceDelay: 150,
      preventDoubleClick: true,
    },

    // ── CHOICE OPTIONS (single/multiple) ────────────────────
    'choice-option': {
      minHeight: 64,
      padding: '0 16px',
      borderRadius: 16,
      background: '#E9E9EC',
      fontSize: 16,
      color: '#111111',
      selectedBg: '#111111',
      selectedColor: '#FFFFFF',
      hoverBg: '#E5E4EA',
      activeScale: 0.985,
      checkSize: 24,
      checkBg: '#C7C7CC',
    },

    // ── TEXT INPUT ───────────────────────────────────────────
    'text-input': {
      padding: '18px 16px',
      borderRadius: 16,
      fontSize: 16,
      color: '#111111',
      background: '#EDECF2',
      focusBg: '#E5E4EA',
      placeholderColor: '#9CA3AF',
    },

    // ── PROGRESS DOTS ───────────────────────────────────────
    'progress-dot': {
      height: 8, width: 8,
      borderRadius: 4,
      background: '#E5E7EB',
      doneBackground: '#9CA3AF',
      activeBackground: '#111111',
      activeWidth: 22,
    },

    // ── NAV BUTTONS ─────────────────────────────────────────
    'nav-back': {
      height: 56, width: 56,
      borderRadius: 16,
      background: '#E5E7EB',
      color: '#374151',
      hoverBg: '#E5E4EA',
      activeScale: 0.95,
    },

    'nav-next': {
      height: 56,
      borderRadius: 16,
      background: '#111111',
      color: '#FFFFFF',
      fontSize: 16, fontWeight: 600,
      lockedBg: '#D1D5DB',
      lockedColor: '#9CA3AF',
      activeScale: 0.98,
    },

    // ── QUESTION TITLE ──────────────────────────────────────
    'question-title': {
      fontSize: 22, fontWeight: 600,
      color: '#111111',
      lineHeight: 1.35,
      marginTop: 24, marginBottom: 20,
    },

    'question-description': {
      fontSize: 14,
      color: '#6B7280',
      lineHeight: 1.65,
      marginBottom: 20,
    },
  }

  // ============================================================
  // ESPACAMENTO — Regras de distancia entre componentes
  // ============================================================
  var SPACING = {
    introFlow: [
      { from: 'logo',      to: 'divider',   gap: 20, note: 'margin-top do divider' },
      { from: 'divider',   to: 'title',     gap: 24, note: 'margin-bottom do divider' },
      { from: 'title',     to: 'subtitle',  gap: 10 },
      { from: 'subtitle',  to: 'badges',    gap: 8 },
      { from: 'badges',    to: 'prompt',    gap: 4, note: 'optional section prompt' },
      { from: 'prompt',    to: 'image',     gap: 16 },
      { from: 'image',     to: 'countdown', gap: 24, note: 'margin-bottom da imagem' },
      { from: 'countdown', to: 'cta',       gap: 16 },
    ],
    questionFlow: [
      { from: 'sectionPrompt', to: 'imageCards', gap: 12 },
      { from: 'title',         to: 'description', gap: 0, note: 'sem gap extra' },
      { from: 'description',   to: 'options',     gap: 20 },
      { from: 'title',         to: 'options',     gap: 20 },
    ],
  }

  // ============================================================
  // API PUBLICA
  // ============================================================

  /** Retorna specs de um componente */
  function get(componentName) {
    return COMPONENTS[componentName] || null
  }

  /** Retorna todas as specs */
  function getAll() {
    return JSON.parse(JSON.stringify(COMPONENTS))
  }

  /** Retorna o design system completo */
  function getDesignSystem() {
    return JSON.parse(JSON.stringify(DESIGN_SYSTEM))
  }

  /** Retorna regras de espacamento */
  function getSpacing(flow) {
    return SPACING[flow] || null
  }

  /** Valida valores contra a spec */
  function validate(componentName, values) {
    var spec = COMPONENTS[componentName]
    if (!spec) return { valid: true, errors: [] }

    var errors = []
    Object.keys(values).forEach(function(key) {
      if (spec[key] !== undefined && values[key] !== spec[key]) {
        errors.push(key + ': esperado ' + spec[key] + ', recebido ' + values[key])
      }
    })
    return { valid: errors.length === 0, errors: errors }
  }

  window.QuizDesignSpecs = Object.freeze({
    get: get,
    getAll: getAll,
    getDesignSystem: getDesignSystem,
    getSpacing: getSpacing,
    validate: validate,
    DESIGN_SYSTEM: DESIGN_SYSTEM,
    COMPONENTS: COMPONENTS,
    SPACING: SPACING,
  })

})()
