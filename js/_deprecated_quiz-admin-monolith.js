;(function () {
  'use strict'

  // ── State ────────────────────────────────────────────────────────────────────
  var _quizzes        = []        // array of quiz_template objects from DB
  var _activeQuiz     = null      // currently edited quiz (deep clone)
  var _activeQIdx     = -1        // index of active question in editor (-1 = none)
  var _dirty          = false
  var _saveTimer      = null
  var _clinicId       = null
  var _activeTab      = 'config'  // 'config' | 'questions' | 'appearance' | 'thankyou' | 'analytics'
  var _contextFilter  = null      // 'kanban-fullface' | 'kanban-protocolos' | null (todos)
  var _contextRootId  = 'quizAdminRoot'  // div root a usar na renderização

  // ── Image URL resolver (Google Drive → direct embed) ─────────────────────────
  function _resolveImgUrl(url) {
    if (!url) return url
    var m = url.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/)
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800'
    var m2 = url.match(/drive\.google\.com\/(?:open|uc)\?.*[?&]id=([^&]+)/)
    if (m2) return 'https://drive.google.com/thumbnail?id=' + m2[1] + '&sz=w800'
    return url
  }

  function _resolveVideoEmbedAdmin(url, autoplay) {
    if (!url) return null
    var ap = autoplay ? 1 : 0

    var gd = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]+)/)
    if (gd) return 'https://drive.google.com/file/d/' + gd[1] + '/preview'

    var isShort = url.indexOf('/shorts/') !== -1
    var yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    if (yt) {
      var params = '?autoplay=' + ap + '&mute=1&rel=0'
      if (!isShort) params += '&loop=1&playlist=' + yt[1]
      return 'https://www.youtube-nocookie.com/embed/' + yt[1] + params
    }

    var vim = url.match(/vimeo\.com\/(\d+)/)
    if (vim) return 'https://player.vimeo.com/video/' + vim[1] + '?autoplay=' + ap + '&muted=1&loop=1'
    return null
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function _repo() {
    if (!window.QuizRepository) throw new Error('QuizRepository not loaded')
    return window.QuizRepository
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function _slugify(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60)
  }

  function _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj))
  }

  function _getClinicId() {
    try { var p = JSON.parse(sessionStorage.getItem('clinicai_profile') || 'null'); if (p && p.clinic_id) return p.clinic_id } catch(e) {}
    return '00000000-0000-0000-0000-000000000001'
  }

  // ── Icons (Feather-style SVG inline, no emojis) ───────────────────────────
  var ICON = {
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    grip: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>',
    eye: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    smartphone: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  }

  var KANBAN_OPTIONS = [
    { value: 'kanban-fullface',    label: 'Full Face Premium' },
    { value: 'kanban-protocolos',  label: 'Procedimentos / Protocolos' },
  ]

  var QUESTION_TYPES = [
    { value: 'single_choice',           label: 'Escolha única' },
    { value: 'multiple_choice',         label: 'Múltipla escolha' },
    { value: 'multi_choice_with_image', label: 'Pergunta com imagem (seleção)' },
    { value: 'text_input',              label: 'Texto livre' },
    { value: 'scale',                   label: 'Escala 1–5' },
    { value: 'image_choice',            label: 'Escolha por imagem' },
    { value: 'contact_name',            label: 'Campo: Nome' },
    { value: 'contact_phone',           label: 'Campo: WhatsApp' },
    { value: 'contact_email',           label: 'Campo: E-mail' },
  ]

  var CONTACT_FIELD_TYPES = ['contact_name', 'contact_phone', 'contact_email']

  // ── Default new quiz schema ──────────────────────────────────────────────────
  function _defaultSchema() {
    return {
      intro: {
        title:       '',
        description: '',
        cta_label:   'Começar',
        image_url:   '',
        logo_url:    '',
      },
      questions: [],
      scoring: {
        hot:  { min: 8 },
        warm: { min: 4 },
        cold: { min: 0 },
      },
      outro: {
        title:          'Perfeito!',
        message:        'Nossa equipe entrará em contato em breve.',
        image_url:      '',
        video_url:      '',
        video_autoplay: true,
        btn_label:      '',
        btn_url:        '',
        btn_color:      '#111111',
        btn_text_color: '#ffffff',
        wa_phone:       '',
        wa_message:     'Olá! Acabei de responder o quiz e gostaria de saber mais.',
        wa_btn_label:   'Falar no WhatsApp',
        wa_recovery_msg: 'Oi {nome}, tudo bem? Vi que você começou nosso quiz sobre {quiz} mas não conseguiu finalizar. Aconteceu alguma coisa? Se quiser, posso te ajudar a completar e te enviar o resultado.',
      },
      appearance: {
        primary_color: '#6366F1',
        cover_fit:     'cover',
      },
      pixels: {
        facebook_pixel_id: '',
        google_tag_id:     '',    // G-XXXXXXX ou GTM-XXXXXXX
        google_ads_id:     '',    // AW-XXXXXXX
        google_ads_label:  '',    // label da conversão
        tiktok_pixel_id:   '',
      },
      analytics_thresholds: {
        engagement_green:  60,
        engagement_yellow: 30,
        conversion_green:  60,
        conversion_yellow: 30,
        whatsapp_green:    50,
        whatsapp_yellow:   20,
      },
    }
  }

  function _defaultQuestion() {
    return {
      id:          window.QuizId ? QuizId.generateId() : ('q_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7)),
      title:       'Nova pergunta',
      type:        'single_choice',
      required:    true,
      revised_at:  null,
      options:  [
        { label: 'Opção 1', score: 1 },
        { label: 'Opção 2', score: 0 },
      ],
    }
  }

  // ── Load quizzes ─────────────────────────────────────────────────────────────
  async function _loadQuizzes() {
    _clinicId = _getClinicId()
    if (!_clinicId) {
      _renderError('Clinic ID não encontrado. Faça login novamente.')
      return
    }
    try {
      var res = await _repo().getTemplates(_clinicId)
      if (!res.ok) throw new Error(res.error)
      var all = res.data || []
      _quizzes = _contextFilter
        ? all.filter(function(q) { return q.kanban_target === _contextFilter })
        : all
      render()
    } catch (err) {
      _renderError('Erro ao carregar quizzes: ' + (err.message || err))
    }
  }

  function _renderError(msg) {
    var root = document.getElementById(_contextRootId)
    if (!root) return
    root.innerHTML =
      '<div style="padding:32px;text-align:center;color:#EF4444;font-size:14px">' +
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 12px;display:block">' +
          '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' +
        '</svg>' +
        _esc(msg) +
      '</div>'
  }

  // ── CSS injection (scoped) ───────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('quiz-admin-styles')) return
    var style = document.createElement('style')
    style.id = 'quiz-admin-styles'
    style.textContent = [
      /* Layout */
      '#quizAdminRoot{display:flex;flex-direction:column;height:100%;font-family:"Inter",sans-serif;color:#111827;font-size:14px}',
      '.qa-topbar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#fff;flex-shrink:0}',
      '.qa-topbar-title{font-size:15px;font-weight:700;color:#111827}',
      '.qa-topbar-actions{display:flex;gap:8px;align-items:center}',

      /* Main columns */
      '.qa-body{display:flex;flex:1;overflow:hidden;background:#f9fafb}',
      '.qa-col-left{width:260px;min-width:220px;border-right:1px solid #e5e7eb;overflow-y:auto;background:#fff;flex-shrink:0;display:flex;flex-direction:column}',
      '.qa-col-center{flex:1;overflow-y:auto;display:flex;flex-direction:column}',
      '.qa-col-right{width:280px;min-width:240px;border-left:1px solid #e5e7eb;overflow-y:auto;background:#fff;flex-shrink:0;display:flex;flex-direction:column}',

      /* Responsive: collapse to tabs on <1024px */
      '@media(max-width:1023px){',
        '.qa-body{flex-direction:column}',
        '.qa-col-left,.qa-col-right{width:100%;border:none;border-bottom:1px solid #e5e7eb}',
        '.qa-col-right{display:none}',
        '.qa-mobile-tabs{display:flex!important}',
      '}',
      '.qa-mobile-tabs{display:none;gap:0;border-bottom:1px solid #e5e7eb;background:#fff;flex-shrink:0}',
      '.qa-mobile-tab{flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;color:#6b7280;cursor:pointer;border-bottom:2px solid transparent}',
      '.qa-mobile-tab.active{color:#6366F1;border-color:#6366F1}',

      /* Left column */
      '.qa-left-header{padding:12px 14px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between}',
      '.qa-left-header span{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}',
      '.qa-quiz-list{flex:1;overflow-y:auto}',
      '.qa-quiz-card{padding:12px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background .12s;display:flex;flex-direction:column;gap:4px}',
      '.qa-quiz-card:hover{background:#f5f3ff}',
      '.qa-quiz-card.active{background:#eef2ff;border-left:3px solid #6366F1}',
      '.qa-quiz-card-title{font-size:13px;font-weight:700;color:#111827;display:flex;align-items:center;gap:6px}',
      '.qa-quiz-card-meta{display:flex;align-items:center;gap:6px}',
      '.qa-badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:11px;font-weight:600}',
      '.qa-badge-indigo{background:#eef2ff;color:#4338CA}',
      '.qa-badge-gray{background:#f3f4f6;color:#6b7280}',
      '.qa-badge-green{background:#d1fae5;color:#065f46}',
      '.qa-badge-red{background:#fee2e2;color:#b91c1c}',
      '.qa-card-actions{display:flex;gap:4px;margin-left:auto}',
      '.qa-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;background:none;border-radius:7px;cursor:pointer;color:#6b7280;transition:background .12s,color .12s}',
      '.qa-icon-btn:hover{background:#f3f4f6;color:#111827}',
      '.qa-icon-btn.danger:hover{background:#fee2e2;color:#ef4444}',

      /* Toggle switch */
      '.qa-toggle{position:relative;display:inline-flex;width:34px;height:20px;flex-shrink:0}',
      '.qa-toggle input{opacity:0;width:0;height:0;position:absolute}',
      '.qa-toggle-slider{position:absolute;inset:0;background:#d1d5db;border-radius:20px;cursor:pointer;transition:background .2s}',
      '.qa-toggle-slider::before{content:"";position:absolute;left:2px;top:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}',
      '.qa-toggle input:checked~.qa-toggle-slider{background:#6366F1}',
      '.qa-toggle input:checked~.qa-toggle-slider::before{transform:translateX(14px)}',

      /* Editor area */
      '.qa-editor-topbar{padding:10px 16px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}',
      '.qa-editor-tabs{display:flex;gap:2px}',
      '.qa-editor-tab{padding:6px 12px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:none;color:#6b7280;transition:background .12s,color .12s;font-family:"Inter",sans-serif}',
      '.qa-editor-tab.active{background:#eef2ff;color:#6366F1}',
      '.qa-editor-content{flex:1;overflow-y:auto;padding:16px}',

      /* Form groups */
      '.qa-form-group{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}',
      '.qa-label{font-size:12px;font-weight:600;color:#374151}',
      '.qa-input,.qa-textarea,.qa-select{width:100%;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:"Inter",sans-serif;color:#111827;background:#fff;outline:none;transition:border-color .15s;-webkit-appearance:none}',
      '.qa-input:focus,.qa-textarea:focus,.qa-select:focus{border-color:#6366F1}',
      '.qa-textarea{resize:vertical;min-height:70px}',
      '.qa-select{background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236B7280\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:30px}',
      '.qa-input-row{display:flex;align-items:center;gap:6px}',
      '.qa-link-display{font-size:11px;color:#6366F1;word-break:break-all;flex:1}',
      '.qa-section-title{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;margin-top:18px}',
      '.qa-divider{height:1px;background:#f3f4f6;margin:14px 0}',

      /* Question list */
      '.qa-q-list{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}',
      '.qa-q-item{display:flex;align-items:center;gap:8px;padding:9px 10px;background:#fff;border:1.5px solid #e5e7eb;border-radius:10px;cursor:pointer;transition:border-color .12s}',
      '.qa-q-item:hover{border-color:#a5b4fc}',
      '.qa-q-item.active{border-color:#6366F1;background:#eef2ff}',
      '.qa-q-item-title{font-size:13px;font-weight:600;color:#111827;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
      '.qa-q-item-type{font-size:10px;font-weight:600;color:#6b7280;background:#f3f4f6;padding:2px 6px;border-radius:5px;white-space:nowrap}',
      '.qa-grip{color:#d1d5db;cursor:grab;flex-shrink:0}',

      /* Options editor */
      '.qa-opt-list{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}',
      '.qa-opt-row{display:flex;align-items:center;gap:6px}',
      '.qa-opt-row .qa-input{flex:1}',
      '.qa-opt-score{width:60px;flex-shrink:0}',

      /* Question inline editor */
      '.qa-q-editor{background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:12px;padding:14px;margin-top:4px}',
      '.qa-q-editor-title{font-size:12px;font-weight:700;color:#6366F1;margin-bottom:10px}',

      /* Preview panel */
      '.qa-preview-header{padding:10px 14px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between}',
      '.qa-preview-header span{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}',
      '.qa-preview-wrap{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:20px 14px;background:#f1f5f9}',
      '.qa-phone-frame{width:270px;height:520px;border:8px solid #1f2937;border-radius:32px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden;background:#fff;position:relative;flex-shrink:0}',
      '.qa-phone-screen{height:100%;overflow:hidden;background:#f7f8fc}',
      '.qa-preview-intro{padding:16px;text-align:center}',
      '.qa-preview-logo{width:40px;height:40px;border-radius:10px;background:#e0e7ff;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:16px;font-weight:700;color:#6366F1}',
      '.qa-preview-cover{width:100%;height:100px;object-fit:cover;border-radius:10px;margin-bottom:10px}',
      '.qa-preview-title{font-size:14px;font-weight:700;color:#111827;margin-bottom:5px;line-height:1.3}',
      '.qa-preview-desc{font-size:11px;color:#6b7280;margin-bottom:14px;line-height:1.5}',
      '.qa-preview-cta{display:block;width:100%;padding:10px;background:#6366F1;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;font-family:"Inter",sans-serif;cursor:default}',

      /* Save button / feedback */
      '.qa-save-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:#6366F1;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;font-family:"Inter",sans-serif;cursor:pointer;transition:background .15s}',
      '.qa-save-btn:hover{background:#4f46e5}',
      '.qa-save-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.qa-save-ok{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#059669}',

      /* Empty state */
      '.qa-empty{padding:40px 20px;text-align:center;color:#9ca3af;font-size:13px}',
      '.qa-empty svg{margin:0 auto 10px;display:block;color:#d1d5db}',

      /* Add btn */
      '.qa-add-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border:1.5px dashed #d1d5db;border-radius:9px;font-size:13px;font-weight:600;color:#6b7280;background:none;cursor:pointer;font-family:"Inter",sans-serif;transition:border-color .12s,color .12s;width:100%}',
      '.qa-add-btn:hover{border-color:#6366F1;color:#6366F1}',

      /* Color input */
      '.qa-color-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
      '.qa-color-input{width:36px;height:36px;border:none;border-radius:8px;cursor:pointer;padding:0;background:none}',

      /* Checkbox row */
      '.qa-checkbox-row{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#374151;cursor:pointer;user-select:none}',
      '.qa-checkbox-row input[type=checkbox]{width:15px;height:15px;accent-color:#6366F1;cursor:pointer}',

      /* No quiz selected */
      '.qa-no-selection{flex:1;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px;text-align:center;padding:20px}',

      /* ── Analytics Dashboard ─────────────────────────────── */
      '.qa-analytics-loading{padding:40px;text-align:center;color:#9ca3af;font-size:13px}',
      '.qa-analytics-error{padding:20px;text-align:center;color:#ef4444;font-size:13px;background:#fef2f2;border-radius:10px;margin:16px 0}',

      /* Period selector */
      '.qa-period-bar{display:flex;gap:4px;margin-bottom:16px;flex-wrap:wrap}',
      '.qa-period-btn{padding:5px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid #e5e7eb;background:#fff;color:#6b7280;font-family:"Inter",sans-serif;transition:all .12s}',
      '.qa-period-btn.active{background:#eef2ff;color:#6366F1;border-color:#c7d2fe}',
      '.qa-period-btn:hover{border-color:#a5b4fc}',
      '.qa-date-input{width:130px!important;padding:4px 8px!important;font-size:12px!important;font-weight:600!important}',

      /* KPI cards */
      '.qa-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px}',
      '.qa-kpi-card{background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:14px;text-align:center;transition:border-color .12s;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center}',
      '.qa-kpi-card:hover{border-color:#c7d2fe}',
      '.qa-kpi-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin:0 auto 8px}',
      '.qa-kpi-value{font-size:24px;font-weight:800;color:#111827;line-height:1.2}',
      '.qa-kpi-label{font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;margin-top:4px}',
      '.qa-kpi-sub{font-size:11px;color:#6b7280;margin-top:2px}',

      /* Chart container */
      '.qa-chart-wrap{background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px}',
      '.qa-chart-title{font-size:12px;font-weight:700;color:#374151;margin-bottom:12px;display:flex;align-items:center;gap:6px}',
      '.qa-chart-title svg{color:#6366F1}',
      '.qa-chart-empty{text-align:center;padding:30px 10px;color:#9ca3af;font-size:12px}',

      /* SVG chart */
      '.qa-line-chart{width:100%;height:200px}',
      '.qa-line-chart .grid-line{stroke:#f3f4f6;stroke-width:1}',
      '.qa-line-chart .data-line{fill:none;stroke:#6366F1;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}',
      '.qa-line-chart .data-area{fill:url(#qa-gradient);opacity:.15}',
      '.qa-line-chart .data-dot{fill:#6366F1;stroke:#fff;stroke-width:2}',
      '.qa-line-chart .axis-label{font-size:10px;fill:#9ca3af;font-family:"Inter",sans-serif}',
      '.qa-line-chart .value-label{font-size:9px;fill:#6366F1;font-weight:700;font-family:"Inter",sans-serif}',

      /* Funnel bars */
      '.qa-funnel-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}',
      '.qa-funnel-label{font-size:12px;font-weight:600;color:#374151;min-width:120px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.qa-funnel-bar-wrap{flex:1;height:28px;background:#f3f4f6;border-radius:7px;overflow:hidden;position:relative}',
      '.qa-funnel-bar{height:100%;border-radius:7px;transition:width .4s ease;display:flex;align-items:center;padding:0 8px;min-width:28px}',
      '.qa-funnel-bar-text{font-size:11px;font-weight:700;color:#fff;white-space:nowrap}',
      '.qa-funnel-count{font-size:12px;font-weight:700;color:#374151;min-width:36px;text-align:right}',

      /* Exit points */
      '.qa-exit-row{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff;border:1px solid #fee2e2;border-radius:8px;margin-bottom:6px}',
      '.qa-exit-rank{width:22px;height:22px;border-radius:50%;background:#fef2f2;color:#ef4444;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.qa-exit-label{font-size:12px;font-weight:600;color:#374151;flex:1;display:flex;flex-direction:column;gap:2px}',
      '.qa-exit-count{font-size:13px;font-weight:700;color:#ef4444}',
      '.qa-exit-pct{font-size:11px;color:#9ca3af;margin-left:2px}',
      '.qa-exit-revised{font-size:10px;font-weight:600;color:#22c55e;display:inline-flex;align-items:center;gap:3px}',

      /* Abandoned leads table */
      '.qa-abandoned-tag{display:inline-block;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:700;text-transform:uppercase}',
      '.qa-abandoned-tag.recoverable{background:#dbeafe;color:#1d4ed8}',
      '.qa-abandoned-tag.anonymous{background:#f3f4f6;color:#9ca3af}',
      '.qa-progress-bar{width:60px;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;display:inline-block;vertical-align:middle;margin-right:6px}',
      '.qa-progress-fill{height:100%;border-radius:4px;min-width:4px}',

      /* Leads table */
      '.qa-leads-wrap{max-height:900px;overflow-y:auto;border:1.5px solid #e5e7eb;border-radius:12px}',
      '.qa-leads-table{width:100%;border-collapse:collapse;font-size:12px}',
      '.qa-leads-table th{position:sticky;top:0;background:#f9fafb;padding:8px 10px;text-align:left;font-weight:700;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #e5e7eb}',
      '.qa-leads-table td{padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#374151;vertical-align:top}',
      '.qa-leads-table tr:hover td{background:#f9fafb}',
      '.qa-leads-name{font-weight:700;color:#111827;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.qa-leads-phone{color:#6366F1;font-weight:600}',
      '.qa-leads-temp{display:inline-block;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:700;text-transform:uppercase}',
      '.qa-leads-temp.hot{background:#fef2f2;color:#dc2626}',
      '.qa-leads-temp.warm{background:#fffbeb;color:#d97706}',
      '.qa-leads-temp.cold{background:#eff6ff;color:#2563eb}',
      '.qa-leads-date{color:#9ca3af;font-size:11px;white-space:nowrap}',
      '.qa-leads-answers{font-size:11px;color:#6b7280;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

      /* Refresh btn */
      '.qa-refresh-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:11px;font-weight:600;color:#6b7280;background:#fff;cursor:pointer;font-family:"Inter",sans-serif;transition:all .12s}',
      '.qa-refresh-btn:hover{border-color:#6366F1;color:#6366F1}',

      /* Tooltip */
      '.qa-tooltip-wrap{position:relative;display:inline-flex;cursor:help}',
      '.qa-tooltip{display:none;position:fixed;z-index:9999;background:#1f2937;color:#fff;font-size:11px;font-weight:500;line-height:1.4;padding:8px 12px;border-radius:8px;white-space:normal;width:220px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none}',

      /* Answers popup overlay */
      '.qa-answers-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:100;display:flex;align-items:center;justify-content:center;animation:qa-fade-in .15s ease}',
      '@keyframes qa-fade-in{from{opacity:0}to{opacity:1}}',
      '.qa-answers-modal{background:#fff;border-radius:16px;width:90%;max-width:480px;max-height:80vh;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.2);display:flex;flex-direction:column;animation:qa-slide-up .2s ease}',
      '@keyframes qa-slide-up{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}',
      '.qa-answers-header{padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}',
      '.qa-answers-header-title{font-size:14px;font-weight:700;color:#111827}',
      '.qa-answers-header-sub{font-size:11px;color:#9ca3af;margin-top:2px}',
      '.qa-answers-close{width:28px;height:28px;border:none;background:#f3f4f6;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#6b7280;transition:all .12s;flex-shrink:0}',
      '.qa-answers-close:hover{background:#fee2e2;color:#ef4444}',
      '.qa-answers-body{padding:16px 20px;overflow-y:auto;flex:1}',
      '.qa-answer-item{padding:12px 14px;background:#f9fafb;border-radius:10px;margin-bottom:8px;border:1px solid #f3f4f6}',
      '.qa-answer-q{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px}',
      '.qa-answer-a{font-size:13px;font-weight:600;color:#111827;line-height:1.4}',
      '.qa-answer-score{display:inline-block;margin-left:6px;font-size:10px;font-weight:700;color:#6366F1;background:#eef2ff;padding:1px 6px;border-radius:4px}',

      /* Answers button in table */
      '.qa-answers-btn{padding:4px 10px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:11px;font-weight:600;color:#6366F1;background:#fff;cursor:pointer;font-family:"Inter",sans-serif;transition:all .12s;white-space:nowrap}',
      '.qa-answers-btn:hover{border-color:#6366F1;background:#eef2ff}',

      /* KPI split card (left: metric, divider, right: rate) */
      '.qa-kpi-split{display:flex;height:100%;min-height:110px}',
      '.qa-kpi-split{min-height:120px;height:100%}',
      '.qa-kpi-split-left{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 10px}',
      '.qa-kpi-split-divider{width:1px;background:#e5e7eb;flex-shrink:0;align-self:stretch}',
      '.qa-kpi-split-right{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 10px;gap:4px;border-radius:0 11px 11px 0}',
      '.qa-kpi-rate-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;text-align:center}',
      '.qa-kpi-rate-value{font-size:20px;font-weight:800;line-height:1.2;text-align:center}',

      /* Gear button (threshold config) */
      /* Gear icon inside split cards */
      '.qa-kpi-gear{position:absolute;top:6px;right:6px;width:22px;height:22px;border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#d1d5db;z-index:2;transition:color .12s;padding:0}',
      '.qa-kpi-gear:hover{color:#6366F1}',
    ].join('')
    document.head.appendChild(style)
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  function render() {
    var root = document.getElementById(_contextRootId)
    if (!root) return

    _injectStyles()

    root.innerHTML =
      '<div class="qa-topbar">' +
        '<span class="qa-topbar-title">Quizzes de Captação</span>' +
        '<div class="qa-topbar-actions">' +
          '<div id="qa-save-area"></div>' +
          '<button class="qa-save-btn" id="qa-save-btn" style="display:none">Salvar</button>' +
        '</div>' +
      '</div>' +
      '<div class="qa-mobile-tabs" id="qa-mobile-tabs">' +
        '<div class="qa-mobile-tab active" data-panel="left">Quizzes</div>' +
        '<div class="qa-mobile-tab" data-panel="center">Editor</div>' +
      '</div>' +
      '<div class="qa-body">' +
        '<div class="qa-col-left" id="qa-col-left">' +
          '<div class="qa-left-header">' +
            '<span>Quizzes</span>' +
            '<button class="qa-icon-btn" id="qa-btn-new" title="Novo Quiz">' + ICON.plus + '</button>' +
          '</div>' +
          '<div class="qa-quiz-list" id="qa-quiz-list"></div>' +
        '</div>' +
        '<div class="qa-col-center" id="qa-col-center">' +
          '<div id="qa-editor-area">' +
            '<div class="qa-no-selection">Selecione um quiz ou crie um novo.</div>' +
          '</div>' +
        '</div>' +
        '<div class="qa-col-right" id="qa-col-right">' +
          '<div class="qa-preview-header">' +
            '<span>Preview</span>' +
            '<button class="qa-icon-btn" id="qa-preview-open" title="Abrir no celular">' + ICON.smartphone + '</button>' +
          '</div>' +
          '<div class="qa-preview-wrap" id="qa-preview-wrap">' +
            '<div class="qa-phone-frame"><div class="qa-phone-screen" id="qa-phone-screen"><div style="padding:30px 16px;text-align:center;color:#9ca3af;font-size:12px">Selecione um quiz</div></div></div>' +
          '</div>' +
        '</div>' +
      '</div>'

    _bindTopbarEvents()
    _renderQuizList()
  }

  // ── Topbar events ────────────────────────────────────────────────────────────
  function _bindTopbarEvents() {
    var btnNew  = document.getElementById('qa-btn-new')
    var btnSave = document.getElementById('qa-save-btn')
    var mtabs   = document.getElementById('qa-mobile-tabs')

    if (btnNew) btnNew.onclick = _newQuiz

    if (btnSave) {
      btnSave.onclick = function() { _saveQuiz() }
    }

    // Mobile tabs
    if (mtabs) {
      mtabs.querySelectorAll('.qa-mobile-tab').forEach(function(tab) {
        tab.onclick = function() {
          mtabs.querySelectorAll('.qa-mobile-tab').forEach(function(t) { t.classList.remove('active') })
          tab.classList.add('active')
          var panel = tab.getAttribute('data-panel')
          var left   = document.getElementById('qa-col-left')
          var center = document.getElementById('qa-col-center')
          if (left && center) {
            left.style.display   = panel === 'left'   ? '' : 'none'
            center.style.display = panel === 'center' ? '' : 'none'
          }
        }
      })
    }

    var previewOpen = document.getElementById('qa-preview-open')
    if (previewOpen) {
      previewOpen.onclick = function() {
        if (_activeQuiz && _activeQuiz.slug) {
          window.open('quiz-render.html?q=' + encodeURIComponent(_activeQuiz.slug), '_blank')
        }
      }
    }
  }

  // ── Quiz list ────────────────────────────────────────────────────────────────
  function _renderQuizList() {
    var listEl = document.getElementById('qa-quiz-list')
    if (!listEl) return

    if (!_quizzes.length) {
      listEl.innerHTML = '<div class="qa-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>Nenhum quiz criado.</div>'
      return
    }

    listEl.innerHTML = _quizzes.map(function(q, idx) {
      var isActive = _activeQuiz && _activeQuiz.id === q.id
      var activeCls = isActive ? ' active' : ''
      var kanbanLabel = (KANBAN_OPTIONS.find(function(k) { return k.value === q.kanban_target }) || {}).label || q.kanban_target
      var statusBadge = q.active
        ? '<span class="qa-badge qa-badge-green">Ativo</span>'
        : '<span class="qa-badge qa-badge-gray">Inativo</span>'

      return '<div class="qa-quiz-card' + activeCls + '" data-idx="' + idx + '" id="qa-card-' + idx + '">' +
        '<div class="qa-quiz-card-title">' +
          '<span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + _esc(q.title || q.slug) + '</span>' +
          '<div class="qa-card-actions">' +
            '<label class="qa-toggle" title="Ativar/Desativar" onclick="event.stopPropagation()">' +
              '<input type="checkbox"' + (q.active ? ' checked' : '') + ' data-qid="' + _esc(q.id) + '">' +
              '<span class="qa-toggle-slider"></span>' +
            '</label>' +
            '<button class="qa-icon-btn danger" data-del="' + idx + '" title="Excluir" onclick="event.stopPropagation()">' + ICON.trash + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="qa-quiz-card-meta">' +
          '<span class="qa-badge qa-badge-indigo">' + _esc(kanbanLabel) + '</span>' +
          statusBadge +
        '</div>' +
      '</div>'
    }).join('')

    // Click to select
    listEl.querySelectorAll('.qa-quiz-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.qa-card-actions')) return
        var idx = parseInt(card.getAttribute('data-idx'), 10)
        _selectQuiz(idx)
      })
    })

    // Toggle active
    listEl.querySelectorAll('.qa-toggle input').forEach(function(inp) {
      inp.onchange = function() {
        var qid  = inp.getAttribute('data-qid')
        var quiz = _quizzes.find(function(q) { return q.id === qid })
        if (!quiz) return
        quiz.active = inp.checked
        _repo().updateTemplate(qid, { active: inp.checked })
        _renderQuizList()
        if (_activeQuiz && _activeQuiz.id === qid) {
          _activeQuiz.active = inp.checked
        }
      }
    })

    // Delete
    listEl.querySelectorAll('[data-del]').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation()
        var idx  = parseInt(btn.getAttribute('data-del'), 10)
        var quiz = _quizzes[idx]
        if (!quiz) return
        if (!confirm('Excluir o quiz "' + (quiz.title || quiz.slug) + '"?')) return
        _repo().deleteTemplate(quiz.id).then(function() {
          _quizzes.splice(idx, 1)
          if (_activeQuiz && _activeQuiz.id === quiz.id) {
            _activeQuiz = null
            _activeQIdx = -1
            document.getElementById('qa-editor-area').innerHTML = '<div class="qa-no-selection">Selecione um quiz ou crie um novo.</div>'
            _renderPhonePreview()
          }
          _renderQuizList()
        })
      }
    })
  }

  // ── Select quiz ──────────────────────────────────────────────────────────────
  function _selectQuiz(idx) {
    _activeQuiz = _deepClone(_quizzes[idx])
    if (!_activeQuiz.schema || typeof _activeQuiz.schema !== 'object') {
      _activeQuiz.schema = _defaultSchema()
    }
    // Ensure all keys exist
    var def = _defaultSchema()
    _activeQuiz.schema.intro       = Object.assign({}, def.intro,       _activeQuiz.schema.intro       || {})
    _activeQuiz.schema.outro       = Object.assign({}, def.outro,       _activeQuiz.schema.outro       || {})
    _activeQuiz.schema.scoring     = Object.assign({}, def.scoring,     _activeQuiz.schema.scoring     || {})
    _activeQuiz.schema.appearance  = Object.assign({}, def.appearance,  _activeQuiz.schema.appearance  || {})
    _activeQuiz.schema.pixels               = Object.assign({}, def.pixels,               _activeQuiz.schema.pixels               || {})
    _activeQuiz.schema.analytics_thresholds = Object.assign({}, def.analytics_thresholds, _activeQuiz.schema.analytics_thresholds || {})
    if (!Array.isArray(_activeQuiz.schema.questions)) _activeQuiz.schema.questions = []

    // Migrar perguntas sem ID (quizzes antigos)
    if (window.QuizId && QuizId.ensureIds(_activeQuiz.schema.questions)) {
      _dirty = true
      // Auto-save para persistir os IDs gerados
      _repo().updateTemplate(_activeQuiz.id, { schema: _activeQuiz.schema })
    }

    _activeQIdx = -1
    if (!_dirty) _dirty = false
    _renderQuizList()
    _renderEditor()
    _renderPhonePreview()
  }

  // ── New quiz ─────────────────────────────────────────────────────────────────
  async function _newQuiz() {
    var title  = prompt('Título do quiz:')
    if (!title || !title.trim()) return
    title = title.trim()
    var slug   = _slugify(title)
    var schema = _defaultSchema()

    try {
      var res = await _repo().createTemplate(_clinicId, {
        slug:          slug,
        title:         title,
        kanban_target: _contextFilter || 'kanban-fullface',
        pipeline:      'evolution',
        schema:        schema,
      })
      if (!res.ok) throw new Error(res.error)
      _quizzes.unshift(res.data)
      _renderQuizList()
      _selectQuiz(0)
    } catch (err) {
      alert('Erro ao criar quiz: ' + (err.message || err))
    }
  }

  // ── Save quiz ────────────────────────────────────────────────────────────────
  function _markDirty() {
    _dirty = true
    var saveBtn = document.getElementById('qa-save-btn')
    if (saveBtn) saveBtn.style.display = 'inline-flex'
    var saveArea = document.getElementById('qa-save-area')
    if (saveArea) saveArea.innerHTML = ''
  }

  async function _saveQuiz() {
    if (!_activeQuiz) return
    var saveBtn = document.getElementById('qa-save-btn')
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando...' }

    try {
      var res = await _repo().updateTemplate(_activeQuiz.id, {
        title:         _activeQuiz.title,
        slug:          _activeQuiz.slug,
        kanban_target: _activeQuiz.kanban_target,
        pipeline:      _activeQuiz.pipeline || 'evolution',
        schema:        _activeQuiz.schema,
        active:        _activeQuiz.active,
      })
      if (!res.ok) throw new Error(res.error)

      // Update local list
      var idx = _quizzes.findIndex(function(q) { return q.id === _activeQuiz.id })
      if (idx !== -1) _quizzes[idx] = _deepClone(res.data)
      _activeQuiz = _deepClone(res.data)
      if (!_activeQuiz.schema) _activeQuiz.schema = _defaultSchema()

      _dirty = false
      if (saveBtn) { saveBtn.style.display = 'none'; saveBtn.disabled = false; saveBtn.textContent = 'Salvar' }

      var saveArea = document.getElementById('qa-save-area')
      if (saveArea) {
        saveArea.innerHTML = '<span class="qa-save-ok">' + ICON.check + ' Salvo</span>'
        setTimeout(function() { if (saveArea) saveArea.innerHTML = '' }, 2000)
      }

      _renderQuizList()
    } catch (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar' }
      alert('Erro ao salvar: ' + (err.message || err))
    }
  }

  // ── Editor ───────────────────────────────────────────────────────────────────
  function _renderEditor() {
    var area = document.getElementById('qa-editor-area')
    if (!area || !_activeQuiz) return

    area.innerHTML =
      '<div class="qa-editor-topbar">' +
        '<div class="qa-editor-tabs">' +
          ['config','questions','appearance','thankyou','analytics'].map(function(t) {
            var labels = { config: 'Configurações', questions: 'Perguntas', appearance: 'Aparência', thankyou: 'Tela Final', analytics: 'Estatísticas' }
            return '<button class="qa-editor-tab' + (t === _activeTab ? ' active' : '') + '" data-tab="' + t + '">' + labels[t] + '</button>'
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="qa-editor-content" id="qa-editor-content">' +
        _buildTabContent(_activeTab) +
      '</div>'

    // Tab switch
    area.querySelectorAll('.qa-editor-tab').forEach(function(btn) {
      btn.onclick = function() {
        _activeTab = btn.getAttribute('data-tab')
        area.querySelectorAll('.qa-editor-tab').forEach(function(b) { b.classList.remove('active') })
        btn.classList.add('active')
        var content = document.getElementById('qa-editor-content')
        if (content) content.innerHTML = _buildTabContent(_activeTab)
        _bindTabEvents(_activeTab)
        if (_activeTab === 'questions') _renderQList()
        _togglePreviewPanel(_activeTab)
        _renderPhonePreview()
      }
    })

    _bindTabEvents(_activeTab)
    if (_activeTab === 'questions') _renderQList()
    _togglePreviewPanel(_activeTab)
  }

  function _togglePreviewPanel(tab) {
    var colRight = document.getElementById('qa-col-right')
    if (!colRight) return
    if (tab === 'analytics') {
      colRight.style.display = 'none'
    } else {
      colRight.style.display = ''
    }
  }

  function _buildTabContent(tab) {
    if (tab === 'config')     return _buildConfigTab()
    if (tab === 'questions')  return _buildQuestionsTab()
    if (tab === 'appearance') return _buildAppearanceTab()
    if (tab === 'thankyou')   return _buildThankyouTab()
    if (tab === 'analytics')  return _buildAnalyticsTab()
    return ''
  }

  // ── Config tab ───────────────────────────────────────────────────────────────
  function _buildConfigTab() {
    var q    = _activeQuiz
    var sch  = q.schema || {}
    var intr = sch.intro || {}
    var outr = sch.outro || {}

    var kanbanOpts = KANBAN_OPTIONS.map(function(o) {
      return '<option value="' + _esc(o.value) + '"' + (q.kanban_target === o.value ? ' selected' : '') + '>' + _esc(o.label) + '</option>'
    }).join('')

    var publicLink = 'quiz-render.html?q=' + encodeURIComponent(q.slug || '')

    return '<div class="qa-section-title">Geral</div>' +
      '<div class="qa-form-group"><label class="qa-label">Título do quiz</label><input class="qa-input" id="cfg-title" value="' + _esc(q.title) + '"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Slug (URL)</label><input class="qa-input" id="cfg-slug" value="' + _esc(q.slug) + '"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Kanban destino</label><select class="qa-select" id="cfg-kanban">' + kanbanOpts + '</select></div>' +
      '<div class="qa-form-group"><label class="qa-label">Link público</label>' +
        '<div class="qa-input-row">' +
          '<span class="qa-link-display" id="cfg-link">' + _esc(publicLink) + '</span>' +
          '<button class="qa-icon-btn" id="cfg-copy-link" title="Copiar link">' + ICON.copy + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Tela de Introdução</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Use <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{nome}</code> <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{email}</code> <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{telefone}</code> para inserir dados do lead</div>' +
      '<div class="qa-form-group"><label class="qa-label">Título da intro</label><textarea class="qa-textarea" id="cfg-intro-title">' + _esc(intr.title || '') + '</textarea></div>' +
      '<div class="qa-form-group"><label class="qa-label">Descrição</label><textarea class="qa-textarea" id="cfg-intro-desc">' + _esc(intr.description || '') + '</textarea></div>' +
      '<div class="qa-form-group"><label class="qa-label">Texto do botão CTA</label><input class="qa-input" id="cfg-cta" value="' + _esc(intr.cta_label || 'Começar') + '"></div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Mídia da Introdução</div>' +
      _buildConfigMediaSection(intr) +
      _buildPixelsSection()
  }

  function _buildPixelsSection() {
    var px = (_activeQuiz.schema.pixels) || {}
    return '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Pixels e Rastreamento</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-top:-8px;margin-bottom:10px">Configure os pixels para rastrear eventos do quiz nos gerenciadores de anúncios. Eventos disparados: <strong>PageView</strong>, <strong>InitiateQuiz</strong>, <strong>CompleteQuiz</strong>, <strong>Lead</strong>, <strong>Contact</strong>.</div>' +
      '<div class="qa-form-group"><label class="qa-label">Facebook Pixel ID</label><input class="qa-input" id="cfg-fb-pixel" value="' + _esc(px.facebook_pixel_id || '') + '" placeholder="Ex: 123456789012345"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Google Tag (GA4 ou GTM)</label><input class="qa-input" id="cfg-gtag" value="' + _esc(px.google_tag_id || '') + '" placeholder="Ex: G-XXXXXXXXXX ou GTM-XXXXXXX"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Google Ads Conversion ID</label><input class="qa-input" id="cfg-gads-id" value="' + _esc(px.google_ads_id || '') + '" placeholder="Ex: AW-123456789"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Google Ads Conversion Label</label><input class="qa-input" id="cfg-gads-label" value="' + _esc(px.google_ads_label || '') + '" placeholder="Ex: AbCdEfGhIjK"></div>' +
      '<div class="qa-form-group"><label class="qa-label">TikTok Pixel ID</label><input class="qa-input" id="cfg-tiktok-pixel" value="' + _esc(px.tiktok_pixel_id || '') + '" placeholder="Ex: CXXXXXXXXXXXXXXXXX"></div>'
  }

  function _bindPixelsEvents() {
    var binds = [
      { id: 'cfg-fb-pixel',     key: 'facebook_pixel_id' },
      { id: 'cfg-gtag',         key: 'google_tag_id' },
      { id: 'cfg-gads-id',      key: 'google_ads_id' },
      { id: 'cfg-gads-label',   key: 'google_ads_label' },
      { id: 'cfg-tiktok-pixel', key: 'tiktok_pixel_id' },
    ]
    binds.forEach(function(b) {
      var el = document.getElementById(b.id)
      if (!el) return
      el.addEventListener('input', function() {
        if (!_activeQuiz.schema.pixels) _activeQuiz.schema.pixels = {}
        _activeQuiz.schema.pixels[b.key] = el.value.trim()
        _markDirty()
      })
    })
  }

  function _buildConfigMediaSection(intr) {
    var app      = (_activeQuiz.schema.appearance) || {}
    var coverUrl = intr.image_url || ''
    var logoUrl  = intr.logo_url  || ''
    var vidUrl   = intr.video_url || ''
    var autoplay = intr.video_autoplay !== false
    var aspect   = intr.image_aspect || '16:9'
    var fit      = app.cover_fit || 'cover'

    var aspectH  = aspect === '9:16' ? '200px' : '120px'
    var coverPrev = coverUrl
      ? '<img id="cfg-cover-prev" src="' + _esc(_resolveImgUrl(coverUrl)) + '" style="width:100%;height:' + aspectH + ';object-fit:' + fit + ';border-radius:8px;margin-top:6px;background:#f3f4f6;display:block">'
      : '<div id="cfg-cover-prev" style="display:none"></div>'

    var logoPrev = logoUrl
      ? '<img id="cfg-logo-prev" src="' + _esc(_resolveImgUrl(logoUrl)) + '" style="width:48px;height:48px;object-fit:contain;border-radius:8px;margin-top:6px;background:#f3f4f6;display:block">'
      : '<div id="cfg-logo-prev" style="display:none"></div>'

    var vidEmbed = _resolveVideoEmbedAdmin(vidUrl, false)
    var vidPrev  = vidEmbed
      ? '<div id="cfg-vid-prev" style="width:100%;aspect-ratio:16/9;border-radius:8px;overflow:hidden;margin-top:6px;background:#000"><iframe src="' + _esc(vidEmbed) + '" style="width:100%;height:100%;border:0" allowfullscreen></iframe></div>'
      : '<div id="cfg-vid-prev" style="display:none"></div>'

    return '<div class="qa-form-group">' +
        '<label class="qa-label">URL da imagem de capa</label>' +
        '<input class="qa-input" id="cfg-cover-url" value="' + _esc(coverUrl) + '" placeholder="https://... ou link do Google Drive">' +
        coverPrev +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="qa-form-group" style="flex:1">' +
          '<label class="qa-label">Formato</label>' +
          '<select class="qa-select" id="cfg-cover-aspect">' +
            '<option value="16:9"' + (aspect === '16:9' ? ' selected' : '') + '>Paisagem (16:9)</option>' +
            '<option value="9:16"' + (aspect === '9:16' ? ' selected' : '') + '>Reel / Stories (9:16)</option>' +
          '</select>' +
        '</div>' +
        '<div class="qa-form-group" style="flex:1">' +
          '<label class="qa-label">Ajuste da imagem</label>' +
          '<select class="qa-select" id="cfg-cover-fit">' +
            '<option value="cover"' + (fit === 'cover' ? ' selected' : '') + '>Preencher (cortar)</option>' +
            '<option value="contain"' + (fit === 'contain' ? ' selected' : '') + '>Conter (mostrar tudo)</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="qa-form-group" style="margin-top:4px">' +
        '<label class="qa-label">URL do vídeo (YouTube / Vimeo / Google Drive)</label>' +
        '<input class="qa-input" id="cfg-video-url" value="' + _esc(vidUrl) + '" placeholder="https://youtube.com/watch?v=...">' +
        '<label class="qa-checkbox-row" style="margin-top:8px"><input type="checkbox" id="cfg-video-autoplay"' + (autoplay ? ' checked' : '') + '><span>Autoplay com mudo</span></label>' +
        vidPrev +
      '</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-bottom:12px">Se vídeo e imagem estiverem preenchidos, o vídeo tem prioridade.</div>' +
      '<div class="qa-form-group">' +
        '<label class="qa-label">URL do logo da clínica</label>' +
        '<input class="qa-input" id="cfg-logo-url" value="' + _esc(logoUrl) + '" placeholder="https://... ou link do Google Drive">' +
        logoPrev +
      '</div>'
  }

  function _bindTabEvents(tab) {
    if (tab === 'config')     _bindConfigEvents()
    if (tab === 'appearance') _bindAppearanceEvents()
    if (tab === 'thankyou')   _bindThankyouEvents()
    if (tab === 'analytics')  _bindAnalyticsEvents()
  }

  function _bindConfigEvents() {
    function _bind(id, setter) {
      var el = document.getElementById(id)
      if (!el) return
      el.addEventListener('input', function() {
        setter(el.value)
        _markDirty()
        _renderPhonePreview()
      })
    }

    _bind('cfg-title', function(v) {
      _activeQuiz.title = v
      // Auto-update slug if slug matches old title-derived version
      var slugEl = document.getElementById('cfg-slug')
      if (slugEl) {
        slugEl.value = _slugify(v)
        _activeQuiz.slug = slugEl.value
        _updateLinkDisplay()
      }
    })

    _bind('cfg-slug', function(v) {
      _activeQuiz.slug = _slugify(v)
      var el = document.getElementById('cfg-slug')
      if (el) el.value = _activeQuiz.slug
      _updateLinkDisplay()
    })

    var kanbanEl = document.getElementById('cfg-kanban')
    if (kanbanEl) kanbanEl.onchange = function() { _activeQuiz.kanban_target = kanbanEl.value; _markDirty() }

    _bind('cfg-intro-title', function(v) { _activeQuiz.schema.intro.title = v })
    _bind('cfg-intro-desc',  function(v) { _activeQuiz.schema.intro.description = v })
    _bind('cfg-cta',         function(v) { _activeQuiz.schema.intro.cta_label = v })

    // Media bindings
    _bind('cfg-cover-url', function(v) {
      _activeQuiz.schema.intro.image_url = v
      var prev = document.getElementById('cfg-cover-prev')
      if (prev) {
        if (v) { prev.src = _resolveImgUrl(v); prev.style.display = 'block' }
        else { prev.style.display = 'none' }
      }
    })

    var aspectEl = document.getElementById('cfg-cover-aspect')
    if (aspectEl) aspectEl.onchange = function() {
      _activeQuiz.schema.intro.image_aspect = aspectEl.value
      _markDirty()
      _renderPhonePreview()
      var prev = document.getElementById('cfg-cover-prev')
      if (prev) prev.style.height = aspectEl.value === '9:16' ? '200px' : '120px'
    }

    var fitEl = document.getElementById('cfg-cover-fit')
    if (fitEl) fitEl.onchange = function() {
      _activeQuiz.schema.appearance.cover_fit = fitEl.value
      _markDirty()
      _renderPhonePreview()
      var prev = document.getElementById('cfg-cover-prev')
      if (prev) prev.style.objectFit = fitEl.value
    }

    _bind('cfg-video-url', function(v) {
      _activeQuiz.schema.intro.video_url = v
      var prev = document.getElementById('cfg-vid-prev')
      var embed = _resolveVideoEmbedAdmin(v, false)
      if (prev) {
        if (embed) {
          prev.innerHTML = '<iframe src="' + _esc(embed) + '" style="width:100%;height:100%;border:0" allowfullscreen></iframe>'
          prev.style.display = 'block'
        } else {
          prev.innerHTML = ''
          prev.style.display = 'none'
        }
      }
    })

    var autoplayEl = document.getElementById('cfg-video-autoplay')
    if (autoplayEl) autoplayEl.onchange = function() {
      _activeQuiz.schema.intro.video_autoplay = autoplayEl.checked
      _markDirty()
    }

    _bind('cfg-logo-url', function(v) {
      _activeQuiz.schema.intro.logo_url = v
      var prev = document.getElementById('cfg-logo-prev')
      if (prev) {
        if (v) { prev.src = _resolveImgUrl(v); prev.style.display = 'block' }
        else { prev.style.display = 'none' }
      }
    })

    var copyBtn = document.getElementById('cfg-copy-link')
    if (copyBtn) {
      copyBtn.onclick = function() {
        var link = 'quiz-render.html?q=' + encodeURIComponent(_activeQuiz.slug || '')
        if (navigator.clipboard) navigator.clipboard.writeText(link)
        copyBtn.style.color = '#059669'
        setTimeout(function() { copyBtn.style.color = '' }, 1200)
      }
    }

    // Pixel bindings
    _bindPixelsEvents()
  }

  function _updateLinkDisplay() {
    var el = document.getElementById('cfg-link')
    if (el && _activeQuiz) {
      el.textContent = 'quiz-render.html?q=' + encodeURIComponent(_activeQuiz.slug || '')
    }
  }

  // ── Appearance tab ───────────────────────────────────────────────────────────
  function _buildAppearanceTab() {
    var app      = (_activeQuiz.schema.appearance) || {}
    var intr     = (_activeQuiz.schema.intro) || {}
    var primary  = app.primary_color || '#6366F1'

    var coverFit = app.cover_fit || 'cover'
    var coverPrev = intr.image_url ? '<img id="app-cover-prev" src="' + _esc(_resolveImgUrl(intr.image_url)) + '" style="width:100%;height:80px;object-fit:' + coverFit + ';border-radius:8px;margin-top:6px;background:#f3f4f6;display:block">' : '<div id="app-cover-prev" style="display:none"></div>'
    var logoPrev  = intr.logo_url  ? '<img id="app-logo-prev"  src="' + _esc(_resolveImgUrl(intr.logo_url)) + '" style="width:48px;height:48px;object-fit:contain;border-radius:8px;margin-top:6px;background:#f3f4f6;display:block">' : '<div id="app-logo-prev" style="display:none"></div>'

    return '<div class="qa-section-title">Imagens</div>' +
      '<div class="qa-form-group"><label class="qa-label">URL da imagem de capa (intro)</label><input class="qa-input" id="app-cover" value="' + _esc(intr.image_url || '') + '" placeholder="https://... ou link do Google Drive">' + coverPrev + '</div>' +
      '<div class="qa-form-group" style="margin-top:6px"><label class="qa-label">Ajuste da capa</label><select class="qa-input" id="app-cover-fit"><option value="cover"' + (coverFit==='cover'?' selected':'') + '>Preencher (cortar)</option><option value="contain"' + (coverFit==='contain'?' selected':'') + '>Conter (mostrar tudo)</option></select></div>' +
      '<div class="qa-form-group"><label class="qa-label">URL do logo da clínica</label><input class="qa-input" id="app-logo" value="' + _esc(intr.logo_url || '') + '" placeholder="https://... ou link do Google Drive">' + logoPrev + '</div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Cor primária</div>' +
      '<div class="qa-color-row">' +
        '<input type="color" class="qa-color-input" id="app-color" value="' + _esc(primary) + '">' +
        '<input class="qa-input" id="app-color-text" value="' + _esc(primary) + '" style="width:110px">' +
        '<span style="font-size:12px;color:#6b7280">Cor dos botões e destaques</span>' +
      '</div>'
  }

  function _bindAppearanceEvents() {
    function _bind(id, setter) {
      var el = document.getElementById(id)
      if (!el) return
      el.addEventListener('input', function() { setter(el.value); _markDirty(); _renderPhonePreview() })
      el.addEventListener('change', function() { setter(el.value); _markDirty(); _renderPhonePreview() })
    }

    _bind('app-cover', function(v) {
      _activeQuiz.schema.intro.image_url = v
      var prev = document.getElementById('app-cover-prev')
      if (prev) { prev.src = _resolveImgUrl(v); prev.style.display = v ? 'block' : 'none' }
    })
    _bind('app-logo',  function(v) {
      _activeQuiz.schema.intro.logo_url  = v
      var prev = document.getElementById('app-logo-prev')
      if (prev) { prev.src = _resolveImgUrl(v); prev.style.display = v ? 'block' : 'none' }
    })
    _bind('app-cover-fit', function(v) {
      _activeQuiz.schema.appearance.cover_fit = v
      var prev = document.getElementById('app-cover-prev')
      if (prev) prev.style.objectFit = v
    })

    var colorPicker = document.getElementById('app-color')
    var colorText   = document.getElementById('app-color-text')

    if (colorPicker) {
      colorPicker.oninput = function() {
        _activeQuiz.schema.appearance.primary_color = colorPicker.value
        if (colorText) colorText.value = colorPicker.value
        _markDirty()
        _renderPhonePreview()
      }
    }
    if (colorText) {
      colorText.oninput = function() {
        var v = colorText.value
        if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
          _activeQuiz.schema.appearance.primary_color = v
          if (colorPicker) colorPicker.value = v
          _markDirty()
          _renderPhonePreview()
        }
      }
    }
  }

  // ── Tela Final (Thank You) tab ───────────────────────────────────────────────
  function _buildThankyouTab() {
    var outr         = (_activeQuiz.schema.outro) || {}
    var imgUrl       = outr.image_url      || ''
    var vidUrl       = outr.video_url      || ''
    var autoplay     = outr.video_autoplay !== false
    var btnColor     = outr.btn_color      || '#111111'
    var btnTextColor = outr.btn_text_color || '#ffffff'

    var imgPrev = imgUrl
      ? '<img id="ty-img-prev" src="' + _esc(_resolveImgUrl(imgUrl)) + '" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-top:6px;display:block">'
      : '<div id="ty-img-prev" style="display:none"></div>'

    var varHint = '<div style="font-size:11px;color:#9ca3af;margin-top:-8px;margin-bottom:10px">Variáveis disponíveis: <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{nome}</code> <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{email}</code> <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{telefone}</code></div>'

    return '<div class="qa-section-title">Texto</div>' +
      varHint +
      '<div class="qa-form-group"><label class="qa-label">Título</label><input class="qa-input" id="ty-title" value="' + _esc(outr.title || 'Perfeito!') + '" placeholder="Ex: Parabéns, {nome}!"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Descrição</label><textarea class="qa-textarea" id="ty-message" placeholder="Ex: Olá {nome}, nossa equipe entrará em contato em breve.">' + _esc(outr.message || 'Nossa equipe entrará em contato em breve.') + '</textarea></div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Mídia</div>' +
      '<div class="qa-form-group"><label class="qa-label">URL da imagem</label><input class="qa-input" id="ty-image-url" value="' + _esc(imgUrl) + '" placeholder="https://... ou link do Google Drive">' + imgPrev + '</div>' +
      '<div class="qa-form-group"><label class="qa-label">URL do vídeo (YouTube / Vimeo)</label>' +
        '<input class="qa-input" id="ty-video-url" value="' + _esc(vidUrl) + '" placeholder="https://youtube.com/watch?v=...">' +
        '<label class="qa-checkbox-row" style="margin-top:8px"><input type="checkbox" id="ty-video-autoplay"' + (autoplay ? ' checked' : '') + '><span>Autoplay com mudo</span></label>' +
      '</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-top:-6px;margin-bottom:12px">Se vídeo e imagem estiverem preenchidos, o vídeo tem prioridade.</div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Botão personalizado</div>' +
      '<div class="qa-form-group"><label class="qa-label">Texto do botão (vazio = oculto)</label><input class="qa-input" id="ty-btn-label" value="' + _esc(outr.btn_label || '') + '" placeholder="Ex: Ver resultado completo"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Link do botão</label><input class="qa-input" id="ty-btn-url" value="' + _esc(outr.btn_url || '') + '" placeholder="https://..."></div>' +
      '<div class="qa-color-row">' +
        '<input type="color" class="qa-color-input" id="ty-btn-color" value="' + _esc(btnColor) + '">' +
        '<input class="qa-input" id="ty-btn-color-text" value="' + _esc(btnColor) + '" style="width:110px">' +
        '<span style="font-size:12px;color:#6b7280">Cor de fundo</span>' +
      '</div>' +
      '<div class="qa-color-row">' +
        '<input type="color" class="qa-color-input" id="ty-btn-text-color" value="' + _esc(btnTextColor) + '">' +
        '<input class="qa-input" id="ty-btn-text-color-text" value="' + _esc(btnTextColor) + '" style="width:110px">' +
        '<span style="font-size:12px;color:#6b7280">Cor do texto</span>' +
      '</div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Botão WhatsApp</div>' +
      '<div class="qa-form-group"><label class="qa-label">Número (com DDI+DDD, só números)</label><input class="qa-input" id="ty-wa-phone" value="' + _esc(outr.wa_phone || '') + '" placeholder="5511999990000"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Texto do botão</label><input class="qa-input" id="ty-wa-btn-label" value="' + _esc(outr.wa_btn_label || 'Falar no WhatsApp') + '" placeholder="Falar no WhatsApp"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Mensagem pré-preenchida</label><textarea class="qa-textarea" id="ty-wa-msg">' + _esc(outr.wa_message || 'Olá! Acabei de responder o quiz e gostaria de saber mais.') + '</textarea></div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Recuperação de Abandonos</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-top:-8px;margin-bottom:10px">Mensagem enviada ao clicar no WhatsApp de um lead abandonado. Variáveis: <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{nome}</code> <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{quiz}</code> <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{pergunta}</code></div>' +
      '<div class="qa-form-group"><label class="qa-label">Mensagem de recuperação</label><textarea class="qa-textarea" id="ty-wa-recovery" style="min-height:90px">' + _esc(outr.wa_recovery_msg || 'Oi {nome}, tudo bem? Vi que você começou nosso quiz sobre {quiz} mas não conseguiu finalizar. Aconteceu alguma coisa? Se quiser, posso te ajudar a completar e te enviar o resultado.') + '</textarea></div>'
  }

  function _bindThankyouEvents() {
    function _bind(id, setter) {
      var el = document.getElementById(id)
      if (!el) return
      el.addEventListener('input',  function() { setter(el.value); _markDirty(); _renderPhonePreview() })
      el.addEventListener('change', function() { setter(el.value); _markDirty(); _renderPhonePreview() })
    }

    _bind('ty-title',   function(v) { _activeQuiz.schema.outro.title   = v })
    _bind('ty-message', function(v) { _activeQuiz.schema.outro.message = v })

    _bind('ty-image-url', function(v) {
      _activeQuiz.schema.outro.image_url = v
      var prev = document.getElementById('ty-img-prev')
      if (prev) { prev.src = _resolveImgUrl(v); prev.style.display = v ? 'block' : 'none' }
    })
    _bind('ty-video-url', function(v) { _activeQuiz.schema.outro.video_url = v })

    var autoEl = document.getElementById('ty-video-autoplay')
    if (autoEl) autoEl.onchange = function() { _activeQuiz.schema.outro.video_autoplay = autoEl.checked; _markDirty(); _renderPhonePreview() }

    _bind('ty-btn-label', function(v) { _activeQuiz.schema.outro.btn_label     = v })
    _bind('ty-btn-url',   function(v) { _activeQuiz.schema.outro.btn_url       = v })
    _bind('ty-wa-phone',     function(v) { _activeQuiz.schema.outro.wa_phone      = v.replace(/\D/g, '') })
    _bind('ty-wa-btn-label',  function(v) { _activeQuiz.schema.outro.wa_btn_label    = v })
    _bind('ty-wa-msg',       function(v) { _activeQuiz.schema.outro.wa_message     = v })
    _bind('ty-wa-recovery',  function(v) { _activeQuiz.schema.outro.wa_recovery_msg = v })

    // Cor de fundo do botão
    var bgPicker = document.getElementById('ty-btn-color')
    var bgText   = document.getElementById('ty-btn-color-text')
    if (bgPicker) bgPicker.oninput = function() {
      _activeQuiz.schema.outro.btn_color = bgPicker.value
      if (bgText) bgText.value = bgPicker.value
      _markDirty(); _renderPhonePreview()
    }
    if (bgText) bgText.oninput = function() {
      if (/^#[0-9A-Fa-f]{6}$/.test(bgText.value)) {
        _activeQuiz.schema.outro.btn_color = bgText.value
        if (bgPicker) bgPicker.value = bgText.value
        _markDirty(); _renderPhonePreview()
      }
    }

    // Cor do texto do botão
    var txtPicker = document.getElementById('ty-btn-text-color')
    var txtText   = document.getElementById('ty-btn-text-color-text')
    if (txtPicker) txtPicker.oninput = function() {
      _activeQuiz.schema.outro.btn_text_color = txtPicker.value
      if (txtText) txtText.value = txtPicker.value
      _markDirty(); _renderPhonePreview()
    }
    if (txtText) txtText.oninput = function() {
      if (/^#[0-9A-Fa-f]{6}$/.test(txtText.value)) {
        _activeQuiz.schema.outro.btn_text_color = txtText.value
        if (txtPicker) txtPicker.value = txtText.value
        _markDirty(); _renderPhonePreview()
      }
    }
  }

  // ── Analytics tab ──────────────────────────────────────────────────────────────
  var _analyticsData      = null   // cached analytics response
  var _analyticsLeads     = null   // cached leads list
  var _analyticsAbandoned = null   // cached abandoned leads
  var _analyticsPeriod = '30d'  // 'today' | '7d' | '30d' | '90d' | 'custom'
  var _analyticsCustomFrom = ''
  var _analyticsCustomTo   = ''
  var _analyticsLoading = false

  function _periodDates(period) {
    var now = new Date()
    // Fim do dia de hoje
    var toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    if (period === 'custom' && _analyticsCustomFrom && _analyticsCustomTo) {
      var cf = new Date(_analyticsCustomFrom + 'T00:00:00')
      var ct = new Date(_analyticsCustomTo + 'T23:59:59.999')
      return { from: cf.toISOString(), to: ct.toISOString() }
    }

    var fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    if (period === 'today') {
      // fromDate já é início de hoje
    } else if (period === '7d') {
      fromDate.setDate(fromDate.getDate() - 7)
    } else if (period === '30d') {
      fromDate.setDate(fromDate.getDate() - 30)
    } else if (period === '90d') {
      fromDate.setDate(fromDate.getDate() - 90)
    } else {
      fromDate = new Date('2020-01-01T00:00:00')
    }
    return { from: fromDate.toISOString(), to: toDate.toISOString() }
  }

  function _buildAnalyticsTab() {
    return '<div id="qa-analytics-root">' +
      '<div class="qa-analytics-loading">Carregando estatísticas...</div>' +
    '</div>'
  }

  function _bindAnalyticsEvents() {
    _loadAnalyticsData()
  }

  function _buildFallbackAnalytics(leads) {
    if (!leads || leads.length === 0) return {}

    var completed = leads.length
    var tempDist = {}
    var dayMap = {}

    leads.forEach(function(l) {
      // Temperatura
      var t = l.temperature || 'cold'
      tempDist[t] = (tempDist[t] || 0) + 1

      // Leads por dia
      if (l.submitted_at) {
        var day = l.submitted_at.substring(0, 10)
        dayMap[day] = (dayMap[day] || 0) + 1
      }
    })

    var leadsPerDay = Object.keys(dayMap).sort().map(function(day) {
      return { day: day, total: dayMap[day] }
    })

    return {
      page_views: completed,
      started: completed,
      completed: completed,
      wa_clicks: 0,
      btn_clicks: 0,
      engagement_rate: 100,
      conversion_rate: 100,
      funnel: [],
      leads_per_day: leadsPerDay,
      exit_points: [],
      temperature_dist: tempDist,
    }
  }

  async function _loadAnalyticsData() {
    if (!_activeQuiz) return
    // Cancela carregamento anterior
    _analyticsLoading = true
    var quizIdAtStart = _activeQuiz.id

    var root = document.getElementById('qa-analytics-root')
    if (!root) { _analyticsLoading = false; return }
    root.innerHTML = '<div class="qa-analytics-loading">Carregando estatísticas...</div>'

    var dates = _periodDates(_analyticsPeriod)

    try {
      // Leads (query direta — sempre funciona)
      var leadsRes = await _repo().getResponses(quizIdAtStart, { from: dates.from, to: dates.to, limit: 200 })

      // Se o usuário trocou de quiz enquanto carregava, descarta resultado
      if (!_activeQuiz || _activeQuiz.id !== quizIdAtStart) return

      _analyticsLeads = leadsRes.ok ? leadsRes.data : []

      // Abandoned leads
      var abandonedRes = await _repo().getAbandonedLeads(quizIdAtStart, _clinicId, dates.from, dates.to)
      if (!_activeQuiz || _activeQuiz.id !== quizIdAtStart) return
      _analyticsAbandoned = abandonedRes.ok ? abandonedRes.data : []

      // Analytics RPC (pode falhar se migration não aplicada)
      var analyticsRes = await _repo().getAnalytics(quizIdAtStart, _clinicId, dates.from, dates.to)

      // Checa novamente se o quiz mudou
      if (!_activeQuiz || _activeQuiz.id !== quizIdAtStart) return

      if (analyticsRes.ok && analyticsRes.data) {
        _analyticsData = analyticsRes.data
      } else {
        console.warn('[quiz-analytics] RPC falhou, usando fallback:', analyticsRes.error)
        _analyticsData = _buildFallbackAnalytics(_analyticsLeads)
      }

      _renderAnalyticsDashboard()
    } catch (err) {
      // Se trocou de quiz, ignora o erro
      if (!_activeQuiz || _activeQuiz.id !== quizIdAtStart) return

      console.error('[quiz-analytics] erro:', err)
      if (_analyticsLeads && _analyticsLeads.length > 0) {
        _analyticsData = _buildFallbackAnalytics(_analyticsLeads)
        _renderAnalyticsDashboard()
      } else {
        var errRoot = document.getElementById('qa-analytics-root')
        if (errRoot) errRoot.innerHTML = '<div class="qa-analytics-error">Erro ao carregar: ' + _esc(err.message || 'desconhecido') + '</div>'
      }
    } finally {
      _analyticsLoading = false
    }
  }

  function _renderAnalyticsDashboard() {
    var root = document.getElementById('qa-analytics-root')
    if (!root) return

    var d = _analyticsData || {}
    var leads = _analyticsLeads || []
    var abandoned = _analyticsAbandoned || []
    var recoverableAbandoned = abandoned.filter(function(a) { return a.contact_name || a.contact_phone })
    var pageViews    = d.page_views    || 0
    var started      = d.started      || 0
    var completed    = d.completed    || 0
    var waClicks     = d.wa_clicks    || 0
    var convRate     = d.conversion_rate || 0
    var engRate      = d.engagement_rate || 0
    var funnel       = d.funnel       || []
    var leadsPerDay  = d.leads_per_day || []
    var exitPoints   = d.exit_points  || []

    var periodLabels = { today: 'Hoje', '7d': '7 dias', '30d': '30 dias', '90d': '90 dias', custom: 'Selecionar Período' }

    // Default custom dates if empty
    if (!_analyticsCustomFrom) {
      var d30 = new Date(); d30.setDate(d30.getDate() - 30)
      _analyticsCustomFrom = d30.toISOString().substring(0, 10)
    }
    if (!_analyticsCustomTo) {
      _analyticsCustomTo = new Date().toISOString().substring(0, 10)
    }

    // ── Period selector
    var periodHtml = '<div class="qa-period-bar">' +
      ['today','7d','30d','90d','custom'].map(function(p) {
        return '<button class="qa-period-btn' + (p === _analyticsPeriod ? ' active' : '') + '" data-period="' + p + '">' + periodLabels[p] + '</button>'
      }).join('') +
      (_analyticsPeriod === 'custom'
        ? '<input type="date" class="qa-input qa-date-input" id="qa-date-from" value="' + _analyticsCustomFrom + '">' +
          '<span style="font-size:11px;color:#9ca3af;font-weight:600">a</span>' +
          '<input type="date" class="qa-input qa-date-input" id="qa-date-to" value="' + _analyticsCustomTo + '">' +
          '<button class="qa-refresh-btn" id="qa-date-apply">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
            'Aplicar' +
          '</button>'
        : '') +
      '<button class="qa-refresh-btn" id="qa-analytics-refresh" style="margin-left:auto">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' +
        'Atualizar' +
      '</button>' +
    '</div>'

    // ── Thresholds personalizados deste quiz
    var th = (_activeQuiz.schema.analytics_thresholds) || {}
    var engGreen  = typeof th.engagement_green  === 'number' ? th.engagement_green  : 60
    var engYellow = typeof th.engagement_yellow === 'number' ? th.engagement_yellow : 30
    var convGreen  = typeof th.conversion_green  === 'number' ? th.conversion_green  : 60
    var convYellow = typeof th.conversion_yellow === 'number' ? th.conversion_yellow : 30

    // ── Sugestão inteligente baseada nos pontos de saída
    var topExit = exitPoints.length > 0 ? exitPoints[0] : null
    var engSuggestion = ''
    var convSuggestion = ''

    if (engRate < engYellow) {
      engSuggestion = 'Mude o título, imagem ou texto do botão CTA da tela inicial'
    } else if (engRate < engGreen) {
      engSuggestion = 'Teste uma imagem ou vídeo diferente na intro'
    }

    if (convRate < convYellow && topExit) {
      convSuggestion = 'Maior gargalo: "' + (topExit.last_label || 'Step ' + topExit.last_step) + '" — simplifique ou remova'
    } else if (convRate < convGreen && topExit) {
      convSuggestion = 'Revise: "' + (topExit.last_label || 'Step ' + topExit.last_step) + '" (' + topExit.exits + ' abandonos)'
    }

    // ── KPI Cards (4 cards + botão engrenagem para escalas)
    // ── WhatsApp rate
    var waRate = completed > 0 ? Math.round((waClicks / completed) * 100) : 0
    var waGreen  = typeof th.whatsapp_green  === 'number' ? th.whatsapp_green  : 50
    var waYellow = typeof th.whatsapp_yellow === 'number' ? th.whatsapp_yellow : 20
    var waSuggestion = ''
    if (waRate < waYellow) {
      waSuggestion = 'Teste vídeo, oferta ou presente na tela final'
    } else if (waRate < waGreen) {
      waSuggestion = 'Experimente mudar a mensagem ou o CTA do botão'
    }

    var kpiHtml = '<div class="qa-kpi-grid">' +
      _buildKpiCard('Visualizaram', pageViews, '#fff7ed', '#f97316',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        '', 'Quantas pessoas abriram a página do quiz. Quanto maior esse número, mais alcance sua campanha está tendo.') +
      _buildKpiCardWithRate('Iniciaram', started, '#eff6ff', '#3b82f6',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        engRate, 'engajamento',
        'Engajamento: % de quem abriu e clicou Começar. Verde: acima de ' + engGreen + '%. Amarelo: ' + engYellow + '-' + (engGreen - 1) + '%. Vermelho: abaixo de ' + engYellow + '%.',
        engSuggestion, engGreen, engYellow, 'engagement') +
      _buildKpiCardWithRate('Finalizaram', completed, '#f0fdf4', '#22c55e',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        convRate, 'conversão',
        'Conversão: % de quem iniciou e finalizou. Verde: acima de ' + convGreen + '%. Amarelo: ' + convYellow + '-' + (convGreen - 1) + '%. Vermelho: abaixo de ' + convYellow + '%.',
        convSuggestion, convGreen, convYellow, 'conversion') +
      _buildKpiCardWithRate('WhatsApp', waClicks, '#f0fdf4', '#25D366',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
        waRate, 'engajamento WA',
        'WhatsApp: % dos leads que clicaram no botão. Verde: acima de ' + waGreen + '%. Amarelo: ' + waYellow + '-' + (waGreen - 1) + '%. Vermelho: abaixo de ' + waYellow + '%. Teste vídeo, foto ou presente na tela final para aumentar.',
        waSuggestion, waGreen, waYellow, 'whatsapp') +
      '<div id="qa-kpi-abandoned" style="cursor:pointer">' +
      _buildKpiCard('Abandonos', abandoned.length, '#fef2f2', '#ef4444',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
        recoverableAbandoned.length > 0 ? recoverableAbandoned.length + ' recuperáveis' : '',
        'Leads que iniciaram mas não finalizaram. Clique para ver a lista. Os recuperáveis têm nome e telefone e podem ser contactados diretamente.') +
      '</div>' +
    '</div>'

    // ── Line chart (leads por dia)
    var chartHtml = '<div class="qa-chart-wrap">' +
      '<div class="qa-chart-title">' +
        '<div class="qa-tooltip-wrap">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
          '<div class="qa-tooltip">Gráfico com a quantidade de leads que finalizaram o quiz por dia. Use para identificar tendências, picos após campanhas e sazonalidade.</div>' +
        '</div>' +
        'Leads por período' +
      '</div>' +
      (leadsPerDay.length > 0
        ? '<div id="qa-chart-canvas">' + _buildLineChartSVG(leadsPerDay) + '</div>'
        : '<div class="qa-chart-empty">Nenhum dado no período selecionado</div>') +
    '</div>'

    // ── Funnel
    var maxFunnel = funnel.length > 0 ? Math.max.apply(null, funnel.map(function(f) { return f.views })) : 1
    var funnelHtml = '<div class="qa-chart-wrap">' +
      '<div class="qa-chart-title">' +
        '<div class="qa-tooltip-wrap">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>' +
          '<div class="qa-tooltip">Mostra quantas pessoas viram cada etapa do quiz. A barra vai diminuindo conforme os leads avançam. Quedas bruscas entre etapas indicam perguntas problemáticas que devem ser simplificadas ou removidas.</div>' +
        '</div>' +
        'Funil do Quiz' +
      '</div>' +
      (funnel.length > 0
        ? funnel.map(function(f) {
            var pct = Math.round((f.views / maxFunnel) * 100)
            var colors = ['#6366F1','#818cf8','#a5b4fc','#c7d2fe','#e0e7ff']
            var color = colors[Math.min(f.step_index || 0, colors.length - 1)]
            return '<div class="qa-funnel-row">' +
              '<div class="qa-funnel-label" title="' + _esc(f.step_label || 'Step ' + f.step_index) + '">' + _esc(f.step_label || 'Step ' + f.step_index) + '</div>' +
              '<div class="qa-funnel-bar-wrap"><div class="qa-funnel-bar" style="width:' + pct + '%;background:' + color + '"><span class="qa-funnel-bar-text">' + pct + '%</span></div></div>' +
              '<div class="qa-funnel-count">' + f.views + '</div>' +
            '</div>'
          }).join('')
        : '<div class="qa-chart-empty">Nenhum dado de funil disponível</div>') +
    '</div>'

    // ── Exit points (com comparativo antes/depois de revisão)
    var totalExits = exitPoints.reduce(function(s, e) { return s + (e.exits || 0) }, 0) || 1
    var questions = (_activeQuiz.schema && _activeQuiz.schema.questions) || []

    // Mapear step_index → question revised_at
    function _getRevisionForStep(stepIdx) {
      var q = questions[stepIdx]
      return (q && q.revised_at) ? q.revised_at : null
    }

    // Enriquecer exit points com info de revisão
    var enrichedExits = exitPoints.map(function(e) {
      var revisedAt = _getRevisionForStep(e.last_step)
      var dates = _periodDates(_analyticsPeriod)
      var hasRevision = revisedAt && revisedAt >= dates.from && revisedAt <= dates.to
      return {
        label: e.last_label || 'Step ' + e.last_step,
        exits: e.exits,
        step: e.last_step,
        revised_at: revisedAt,
        revised_in_period: hasRevision,
      }
    })

    var exitHtml = '<div class="qa-chart-wrap">' +
      '<div class="qa-chart-title">' +
        '<div class="qa-tooltip-wrap">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
          '<div class="qa-tooltip">Mostra onde os leads abandonaram o quiz, ordenado pelo maior gargalo. Quando você edita uma pergunta (título ou opções), o sistema marca a data da revisão. Use Selecionar Período para comparar os abandonos antes e depois da mudança e medir se o ajuste funcionou.</div>' +
        '</div>' +
        'Pontos de Saída' +
      '</div>' +
      (enrichedExits.length > 0
        ? enrichedExits.map(function(e, i) {
            var pct = Math.round((e.exits / totalExits) * 100)
            var rank = i + 1
            var revBadge = ''
            if (e.revised_at) {
              var revDate = new Date(e.revised_at).toLocaleDateString('pt-BR')
              revBadge = '<span class="qa-exit-revised" title="Revisada em ' + revDate + '">' +
                '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> revisada ' + revDate +
              '</span>'
            }
            return '<div class="qa-exit-row">' +
              '<div class="qa-exit-rank">' + rank + '</div>' +
              '<div class="qa-exit-label">' + _esc(e.label) + revBadge + '</div>' +
              '<div class="qa-exit-count">' + e.exits + '</div>' +
              '<div class="qa-exit-pct">(' + pct + '%)</div>' +
            '</div>'
          }).join('')
        : '<div class="qa-chart-empty">Nenhum abandono registrado</div>') +
    '</div>'

    // ── Temperatura distribution
    var tempDist = d.temperature_dist || {}
    var tempTotal = (tempDist.hot || 0) + (tempDist.warm || 0) + (tempDist.cold || 0)
    var tempHtml = ''
    if (tempTotal > 0) {
      var tempItems = [
        { key: 'hot',  label: 'Quente', color: '#ef4444', bg: '#fef2f2' },
        { key: 'warm', label: 'Morno',  color: '#f59e0b', bg: '#fffbeb' },
        { key: 'cold', label: 'Frio',   color: '#3b82f6', bg: '#eff6ff' },
      ]
      tempHtml = '<div class="qa-chart-wrap">' +
        '<div class="qa-chart-title">' +
          '<div class="qa-tooltip-wrap">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>' +
            '<div class="qa-tooltip">Classificação automática dos leads baseada no score das respostas. Leads quentes têm maior potencial de conversão e devem ser priorizados pela equipe comercial.</div>' +
          '</div>' +
          'Temperatura dos Leads' +
        '</div>' +
        '<div class="qa-kpi-grid" style="grid-template-columns:repeat(3,1fr)">' +
        tempItems.map(function(t) {
          var cnt = tempDist[t.key] || 0
          var pct = tempTotal > 0 ? Math.round((cnt / tempTotal) * 100) : 0
          return '<div class="qa-kpi-card" style="border-color:' + t.color + '30">' +
            '<div class="qa-kpi-value" style="color:' + t.color + '">' + cnt + '</div>' +
            '<div class="qa-kpi-label">' + t.label + '</div>' +
            '<div class="qa-kpi-sub">' + pct + '% dos leads</div>' +
          '</div>'
        }).join('') +
        '</div>' +
      '</div>'
    }

    // ── Leads table
    var questions = (_activeQuiz.schema && _activeQuiz.schema.questions) || []
    var tableHtml = '<div class="qa-chart-wrap" style="padding-bottom:4px">' +
      '<div class="qa-chart-title">' +
        '<div class="qa-tooltip-wrap">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
          '<div class="qa-tooltip">Lista completa de todos os leads que finalizaram o quiz no período. Clique em Ver respostas para ver exatamente o que cada lead respondeu em cada pergunta.</div>' +
        '</div>' +
        'Leads do Quiz (' + leads.length + ')' +
      '</div>' +
      (leads.length > 0
        ? '<div class="qa-leads-wrap"><table class="qa-leads-table"><thead><tr>' +
          '<th>Nome</th><th>WhatsApp</th><th>Temperatura</th><th>Score</th><th>Respostas</th><th>Data</th>' +
          '</tr></thead><tbody>' +
          leads.map(function(l, li) {
            var tempClass = (l.temperature || 'cold')
            var dateStr = l.submitted_at ? new Date(l.submitted_at).toLocaleDateString('pt-BR') + ' ' + new Date(l.submitted_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'
            var hasAnswers = l.answers && typeof l.answers === 'object' && Object.keys(l.answers).length > 0
            return '<tr>' +
              '<td class="qa-leads-name">' + _esc(l.contact_name || '-') + '</td>' +
              '<td class="qa-leads-phone">' + _esc(l.contact_phone || '-') + '</td>' +
              '<td><span class="qa-leads-temp ' + tempClass + '">' + _esc(tempClass) + '</span></td>' +
              '<td>' + (l.score || 0) + '</td>' +
              '<td>' + (hasAnswers
                ? '<button class="qa-answers-btn" data-lead-idx="' + li + '">Ver respostas</button>'
                : '<span style="color:#9ca3af;font-size:11px">-</span>') + '</td>' +
              '<td class="qa-leads-date">' + dateStr + '</td>' +
            '</tr>'
          }).join('') +
          '</tbody></table></div>'
        : '<div class="qa-chart-empty">Nenhum lead registrado no período</div>') +
    '</div>'

    root.innerHTML = periodHtml + kpiHtml + chartHtml + funnelHtml + exitHtml + tempHtml + tableHtml

    // Bind period buttons
    root.querySelectorAll('.qa-period-btn').forEach(function(btn) {
      btn.onclick = function() {
        var p = btn.getAttribute('data-period')
        _analyticsPeriod = p
        if (p === 'custom') {
          // Re-render para mostrar date pickers, sem recarregar dados
          _renderAnalyticsDashboard()
        } else {
          _loadAnalyticsData()
        }
      }
    })
    // Custom date apply
    var dateApply = document.getElementById('qa-date-apply')
    if (dateApply) {
      dateApply.onclick = function() {
        var fromEl = document.getElementById('qa-date-from')
        var toEl   = document.getElementById('qa-date-to')
        if (fromEl) _analyticsCustomFrom = fromEl.value
        if (toEl)   _analyticsCustomTo   = toEl.value
        _loadAnalyticsData()
      }
    }
    var refreshBtn = document.getElementById('qa-analytics-refresh')
    if (refreshBtn) refreshBtn.onclick = function() { _loadAnalyticsData() }

    // Bind tooltips (position: fixed para não ser cortado)
    root.querySelectorAll('.qa-tooltip-wrap').forEach(function(wrap) {
      var tip = wrap.querySelector('.qa-tooltip')
      if (!tip) return
      wrap.addEventListener('mouseenter', function() {
        var rect = wrap.getBoundingClientRect()
        tip.style.display = 'block'
        // Posiciona abaixo do icone
        var tipRect = tip.getBoundingClientRect()
        var top = rect.bottom + 8
        var left = rect.left + rect.width / 2 - tipRect.width / 2
        // Se sai pela direita, ajusta
        if (left + tipRect.width > window.innerWidth - 8) left = window.innerWidth - tipRect.width - 8
        // Se sai pela esquerda, ajusta
        if (left < 8) left = 8
        // Se sai por baixo, mostra acima
        if (top + tipRect.height > window.innerHeight - 8) top = rect.top - tipRect.height - 8
        tip.style.top = top + 'px'
        tip.style.left = left + 'px'
      })
      wrap.addEventListener('mouseleave', function() {
        tip.style.display = 'none'
      })
    })

    // Bind abandoned KPI → popup
    var abandonedKpi = document.getElementById('qa-kpi-abandoned')
    if (abandonedKpi) abandonedKpi.onclick = function() { _showAbandonedPopup(abandoned, questions) }

    // Bind gear buttons → per-card threshold popup
    root.querySelectorAll('.qa-kpi-gear').forEach(function(btn) {
      btn.onclick = function() {
        var metric = btn.getAttribute('data-metric')
        if (metric) _showThresholdPopup(metric)
      }
    })

    // Bind answer buttons → popup
    root.querySelectorAll('.qa-answers-btn').forEach(function(btn) {
      btn.onclick = function() {
        var idx = parseInt(btn.getAttribute('data-lead-idx'), 10)
        var lead = leads[idx]
        if (lead) _showAnswersPopup(lead, questions)
      }
    })
  }

  function _buildKpiCard(label, value, bgColor, iconColor, iconSvg, sub, tooltip) {
    return '<div class="qa-kpi-card">' +
      '<div class="qa-kpi-icon" style="background:' + bgColor + ';color:' + iconColor + '">' +
        (tooltip
          ? '<div class="qa-tooltip-wrap">' + iconSvg + '<div class="qa-tooltip">' + _esc(tooltip) + '</div></div>'
          : iconSvg) +
      '</div>' +
      '<div class="qa-kpi-value">' + value + '</div>' +
      '<div class="qa-kpi-label">' + _esc(label) + '</div>' +
      (sub ? '<div class="qa-kpi-sub">' + _esc(sub) + '</div>' : '') +
    '</div>'
  }

  function _rateColor(rate, greenMin, yellowMin) {
    if (rate >= greenMin) return 'green'
    if (rate >= yellowMin) return 'yellow'
    return 'red'
  }

  function _buildKpiCardWithRate(label, value, bgColor, iconColor, iconSvg, rate, rateLabel, tooltip, suggestion, greenMin, yellowMin, metricKey) {
    var color = _rateColor(rate, greenMin || 60, yellowMin || 30)
    var rateColors = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }
    var rateBgs    = { green: '#f0fdf4', yellow: '#fefce8', red: '#fef2f2' }
    var rc = rateColors[color] || '#6b7280'
    var rb = rateBgs[color]    || '#f9fafb'
    var gearSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
    // Sugestão vai para o tooltip, não no card
    var fullTooltip = tooltip || ''
    if (suggestion) fullTooltip += (fullTooltip ? ' | Sugestão: ' : 'Sugestão: ') + suggestion
    return '<div class="qa-kpi-card" style="padding:0;overflow:hidden;position:relative">' +
      '<button class="qa-kpi-gear" data-metric="' + (metricKey || '') + '">' + gearSvg + '</button>' +
      '<div class="qa-kpi-split">' +
        '<div class="qa-kpi-split-left">' +
          '<div class="qa-kpi-icon" style="background:' + bgColor + ';color:' + iconColor + '">' +
            (fullTooltip
              ? '<div class="qa-tooltip-wrap">' + iconSvg + '<div class="qa-tooltip">' + _esc(fullTooltip) + '</div></div>'
              : iconSvg) +
          '</div>' +
          '<div class="qa-kpi-value">' + value + '</div>' +
          '<div class="qa-kpi-label">' + _esc(label) + '</div>' +
        '</div>' +
        '<div class="qa-kpi-split-divider"></div>' +
        '<div class="qa-kpi-split-right" style="background:' + rb + '">' +
          '<div class="qa-kpi-rate-label" style="color:' + rc + '">' + _esc(rateLabel) + '</div>' +
          '<div class="qa-kpi-rate-value" style="color:' + rc + '">' + rate + '%</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  }

  function _showAbandonedPopup(initialData, questions) {
    if (!_activeQuiz) return
    var totalQuestions = questions.length || 1
    var quizId = _activeQuiz.id
    var quizTitle = _activeQuiz.title || _activeQuiz.slug || 'quiz'
    var currentPeriod = '30d'
    var currentFilter = 'all'
    var currentData = initialData || []
    var customFrom = ''
    var customTo = ''

    // Mensagem de recuperação configurada no quiz
    var outr = (_activeQuiz.schema && _activeQuiz.schema.outro) || {}
    var waPhone = (outr.wa_phone || '').replace(/\D/g, '')
    var recoveryTemplate = outr.wa_recovery_msg || 'Oi {nome}, tudo bem? Vi que você começou nosso quiz sobre {quiz} mas não conseguiu finalizar. Aconteceu alguma coisa? Se quiser, posso te ajudar a completar e te enviar o resultado.'

    function _buildRecoveryLink(lead) {
      if (!waPhone || !lead.contact_phone) return ''
      var phone = lead.contact_phone.replace(/\D/g, '')
      if (phone.length < 10) return ''
      // Se não tem DDD completo, assume Brasil
      if (phone.length <= 11 && phone.indexOf('55') !== 0) phone = '55' + phone
      var msg = recoveryTemplate
        .replace(/\{nome\}/gi, lead.contact_name || 'tudo bem')
        .replace(/\{quiz\}/gi, quizTitle)
        .replace(/\{pergunta\}/gi, lead.last_step_label || '')
      var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      var base = isMobile
        ? 'https://api.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent(msg)
        : 'https://web.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent(msg)
      return '<a href="' + base + '" target="whatsapp_session" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;color:#25D366;font-weight:700;font-size:11px;text-decoration:none" title="Enviar mensagem de recuperação">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
        'Recuperar</a>'
    }

    function _buildTable(data, filter) {
      var filtered = data
      if (filter === 'recoverable') filtered = data.filter(function(a) { return a.contact_name || a.contact_phone })
      if (filter === 'anonymous') filtered = data.filter(function(a) { return !a.contact_name && !a.contact_phone })

      if (filtered.length === 0) return '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">Nenhum lead neste filtro</div>'

      return '<table class="qa-leads-table"><thead><tr>' +
        '<th>Status</th><th>Nome</th><th>WhatsApp</th><th>Abandonou em</th><th>Progresso</th><th>Data</th>' +
        '</tr></thead><tbody>' +
        filtered.map(function(a) {
          var hasContact = a.contact_name || a.contact_phone
          var tagClass = hasContact ? 'recoverable' : 'anonymous'
          var tagLabel = hasContact ? 'Recuperável' : 'Anônimo'
          var stepsNum = a.steps_completed || 0
          var pct = Math.round((stepsNum / totalQuestions) * 100)
          if (pct > 100) pct = 100
          var progressColor = pct >= 60 ? '#22c55e' : (pct >= 30 ? '#eab308' : '#ef4444')
          var dateStr = a.abandoned_at
            ? new Date(a.abandoned_at).toLocaleDateString('pt-BR') + ' ' + new Date(a.abandoned_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '-'
          var waLink = _buildRecoveryLink(a)
          var phoneCell = a.contact_phone
            ? '<span class="qa-leads-phone">' + _esc(a.contact_phone) + '</span>' + (waLink ? '<br>' + waLink : '')
            : '<span style="color:#9ca3af">-</span>'
          return '<tr>' +
            '<td><span class="qa-abandoned-tag ' + tagClass + '">' + tagLabel + '</span></td>' +
            '<td class="qa-leads-name">' + _esc(a.contact_name || '-') + '</td>' +
            '<td>' + phoneCell + '</td>' +
            '<td style="font-size:12px;color:#374151">' + _esc(a.last_step_label || 'Step ' + a.last_step) + '</td>' +
            '<td style="white-space:nowrap"><span class="qa-progress-bar"><span class="qa-progress-fill" style="width:' + Math.max(pct, 8) + '%;background:' + progressColor + '"></span></span><span style="font-size:11px;font-weight:700;color:' + progressColor + '">' + stepsNum + '/' + totalQuestions + '</span></td>' +
            '<td class="qa-leads-date">' + dateStr + '</td>' +
          '</tr>'
        }).join('') +
        '</tbody></table>'
    }

    function _updateCounts(ov, data) {
      var rec = data.filter(function(a) { return a.contact_name || a.contact_phone }).length
      var anon = data.length - rec
      var titleEl = ov.querySelector('#qa-ab-title')
      var subEl = ov.querySelector('#qa-ab-sub')
      if (titleEl) titleEl.textContent = 'Leads Abandonados (' + data.length + ')'
      if (subEl) subEl.textContent = rec + ' recuperáveis, ' + anon + ' anônimos'
      // Update filter button counts
      var allBtn = ov.querySelector('[data-ab-filter="all"]')
      var recBtn = ov.querySelector('[data-ab-filter="recoverable"]')
      var anonBtn = ov.querySelector('[data-ab-filter="anonymous"]')
      if (allBtn) allBtn.textContent = 'Todos (' + data.length + ')'
      if (recBtn) recBtn.textContent = 'Recuperáveis (' + rec + ')'
      if (anonBtn) anonBtn.textContent = 'Anônimos (' + anon + ')'
    }

    function _renderBody(ov) {
      var body = ov.querySelector('#qa-ab-body')
      if (body) body.innerHTML = '<div class="qa-leads-wrap" style="max-height:none">' + _buildTable(currentData, currentFilter) + '</div>'
    }

    async function _loadPeriod(ov, period) {
      currentPeriod = period
      var dates = _periodDates(period)
      if (period === 'custom' && customFrom && customTo) {
        dates = { from: new Date(customFrom + 'T00:00:00').toISOString(), to: new Date(customTo + 'T23:59:59.999').toISOString() }
      }
      var body = ov.querySelector('#qa-ab-body')
      if (body) body.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">Carregando...</div>'
      var res = await _repo().getAbandonedLeads(quizId, _clinicId, dates.from, dates.to)
      currentData = res.ok ? res.data : []
      _updateCounts(ov, currentData)
      _renderBody(ov)
    }

    // Build overlay
    var periodLabels = { today: 'Hoje', '7d': '7 dias', '30d': '30 dias', '90d': '90 dias', custom: 'Selecionar Período' }
    var recCount = currentData.filter(function(a) { return a.contact_name || a.contact_phone }).length
    var anonCount = currentData.length - recCount

    if (!customFrom) { var d30 = new Date(); d30.setDate(d30.getDate() - 30); customFrom = d30.toISOString().substring(0, 10) }
    if (!customTo) customTo = new Date().toISOString().substring(0, 10)

    var overlay = document.createElement('div')
    overlay.className = 'qa-answers-overlay'
    overlay.innerHTML =
      '<div class="qa-answers-modal" style="max-width:760px;max-height:85vh">' +
        '<div class="qa-answers-header">' +
          '<div>' +
            '<div class="qa-answers-header-title" id="qa-ab-title">Leads Abandonados (' + currentData.length + ')</div>' +
            '<div class="qa-answers-header-sub" id="qa-ab-sub">' + recCount + ' recuperáveis, ' + anonCount + ' anônimos</div>' +
          '</div>' +
          '<button class="qa-answers-close" id="qa-ab-close">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div style="padding:10px 20px 0;display:flex;gap:4px;flex-wrap:wrap;align-items:center" id="qa-ab-periods">' +
          ['today','7d','30d','90d','custom'].map(function(p) {
            return '<button class="qa-period-btn' + (p === currentPeriod ? ' active' : '') + '" data-ab-period="' + p + '">' + periodLabels[p] + '</button>'
          }).join('') +
        '</div>' +
        '<div style="padding:8px 20px 0;gap:4px;align-items:center;display:' + (currentPeriod === 'custom' ? 'flex' : 'none') + '" id="qa-ab-custom-row">' +
          '<input type="date" class="qa-input qa-date-input" id="qa-ab-from" value="' + customFrom + '">' +
          '<span style="font-size:11px;color:#9ca3af;font-weight:600;align-self:center">a</span>' +
          '<input type="date" class="qa-input qa-date-input" id="qa-ab-to" value="' + customTo + '">' +
          '<button class="qa-refresh-btn" id="qa-ab-apply">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Aplicar' +
          '</button>' +
        '</div>' +
        '<div style="padding:8px 20px 0;display:flex;gap:4px">' +
          '<button class="qa-period-btn active" data-ab-filter="all">Todos (' + currentData.length + ')</button>' +
          '<button class="qa-period-btn" data-ab-filter="recoverable">Recuperáveis (' + recCount + ')</button>' +
          '<button class="qa-period-btn" data-ab-filter="anonymous">Anônimos (' + anonCount + ')</button>' +
        '</div>' +
        '<div class="qa-answers-body" id="qa-ab-body" style="padding:10px 20px 20px">' +
          '<div class="qa-leads-wrap" style="max-height:none">' + _buildTable(currentData, 'all') + '</div>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)

    // Close
    overlay.querySelector('#qa-ab-close').onclick = function() { overlay.remove() }
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove() }

    // Period buttons
    overlay.querySelectorAll('[data-ab-period]').forEach(function(btn) {
      btn.onclick = function() {
        overlay.querySelectorAll('[data-ab-period]').forEach(function(b) { b.classList.remove('active') })
        btn.classList.add('active')
        var p = btn.getAttribute('data-ab-period')
        var customRow = overlay.querySelector('#qa-ab-custom-row')
        if (customRow) customRow.style.display = (p === 'custom') ? 'flex' : 'none'
        if (p !== 'custom') _loadPeriod(overlay, p)
      }
    })

    // Custom date apply
    var applyBtn = overlay.querySelector('#qa-ab-apply')
    if (applyBtn) applyBtn.onclick = function() {
      var fEl = overlay.querySelector('#qa-ab-from')
      var tEl = overlay.querySelector('#qa-ab-to')
      if (fEl) customFrom = fEl.value
      if (tEl) customTo = tEl.value
      _loadPeriod(overlay, 'custom')
    }

    // Status filter buttons
    overlay.querySelectorAll('[data-ab-filter]').forEach(function(btn) {
      btn.onclick = function() {
        overlay.querySelectorAll('[data-ab-filter]').forEach(function(b) { b.classList.remove('active') })
        btn.classList.add('active')
        currentFilter = btn.getAttribute('data-ab-filter')
        _renderBody(overlay)
      }
    })
  }

  function _showThresholdPopup(metricKey) {
    if (!_activeQuiz) return
    var th = _activeQuiz.schema.analytics_thresholds || {}

    var configs = {
      engagement: {
        title: 'Engajamento',
        sub: 'Visualizaram \u2192 Iniciaram',
        greenKey: 'engagement_green',
        yellowKey: 'engagement_yellow',
        greenVal: typeof th.engagement_green === 'number' ? th.engagement_green : 60,
        yellowVal: typeof th.engagement_yellow === 'number' ? th.engagement_yellow : 30,
      },
      conversion: {
        title: 'Conversão',
        sub: 'Iniciaram \u2192 Finalizaram',
        greenKey: 'conversion_green',
        yellowKey: 'conversion_yellow',
        greenVal: typeof th.conversion_green === 'number' ? th.conversion_green : 60,
        yellowVal: typeof th.conversion_yellow === 'number' ? th.conversion_yellow : 30,
      },
      whatsapp: {
        title: 'WhatsApp',
        sub: 'Finalizaram \u2192 Clicaram WhatsApp',
        greenKey: 'whatsapp_green',
        yellowKey: 'whatsapp_yellow',
        greenVal: typeof th.whatsapp_green === 'number' ? th.whatsapp_green : 50,
        yellowVal: typeof th.whatsapp_yellow === 'number' ? th.whatsapp_yellow : 20,
      },
    }

    var cfg = configs[metricKey]
    if (!cfg) return

    function buildRow(colorHex, label, id, val) {
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<span style="width:10px;height:10px;border-radius:50%;background:' + colorHex + ';flex-shrink:0"></span>' +
        '<span style="font-size:12px;color:#374151;font-weight:600;min-width:70px">' + label + '</span>' +
        '<input class="qa-input" id="' + id + '" type="number" min="0" max="100" value="' + val + '" style="width:70px;padding:5px 8px;font-size:13px;text-align:center">' +
        '<span style="font-size:12px;color:#9ca3af">%</span>' +
      '</div>'
    }

    var overlay = document.createElement('div')
    overlay.className = 'qa-answers-overlay'
    overlay.innerHTML =
      '<div class="qa-answers-modal" style="max-width:320px">' +
        '<div class="qa-answers-header">' +
          '<div>' +
            '<div class="qa-answers-header-title">' + _esc(cfg.title) + '</div>' +
            '<div class="qa-answers-header-sub">' + _esc(cfg.sub) + '</div>' +
          '</div>' +
          '<button class="qa-answers-close" id="qa-th-close">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="qa-answers-body">' +
          buildRow('#22c55e', 'Verde \u2265', 'th-green', cfg.greenVal) +
          buildRow('#eab308', 'Amarelo \u2265', 'th-yellow', cfg.yellowVal) +
          '<div style="font-size:10px;color:#9ca3af;margin-top:2px;margin-bottom:14px">Vermelho = abaixo do amarelo</div>' +
          '<button class="qa-save-btn" id="qa-th-save" style="width:100%;justify-content:center">Salvar</button>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)

    overlay.querySelector('#qa-th-close').onclick = function() { overlay.remove() }
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove() }

    overlay.querySelector('#qa-th-save').onclick = function() {
      var gEl = overlay.querySelector('#th-green')
      var yEl = overlay.querySelector('#th-yellow')
      var gVal = gEl ? parseInt(gEl.value, 10) : 60
      var yVal = yEl ? parseInt(yEl.value, 10) : 30
      if (isNaN(gVal) || gVal < 0) gVal = 0
      if (gVal > 100) gVal = 100
      if (isNaN(yVal) || yVal < 0) yVal = 0
      if (yVal > 100) yVal = 100

      if (!_activeQuiz.schema.analytics_thresholds) _activeQuiz.schema.analytics_thresholds = {}
      _activeQuiz.schema.analytics_thresholds[cfg.greenKey] = gVal
      _activeQuiz.schema.analytics_thresholds[cfg.yellowKey] = yVal
      _markDirty()
      _renderAnalyticsDashboard()
      overlay.remove()
    }
  }

  function _showAnswersPopup(lead, questions) {
    var items = window.QuizId
      ? QuizId.mapForDisplay(lead.answers || {}, questions)
      : _legacyMapAnswers(lead.answers || {}, questions)

    var itemsHtml = items.map(function(item, i) {
      var val = item.answer
      var ansHtml = ''

      if (Array.isArray(val)) {
        ansHtml = val.map(function(v) {
          var scoreInfo = ''
          var opt = item.options.find(function(o) { return o.label === v })
          if (opt && typeof opt.score === 'number') scoreInfo = '<span class="qa-answer-score">+' + opt.score + ' pts</span>'
          return '<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">' +
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ' +
            _esc(v) + scoreInfo + '</div>'
        }).join('')
      } else if (item.questionType === 'scale') {
        var scaleVal = parseInt(val, 10) || 0
        var dots = ''
        for (var s = 1; s <= 5; s++) {
          dots += '<span style="display:inline-block;width:18px;height:18px;border-radius:50%;margin-right:3px;text-align:center;line-height:18px;font-size:10px;font-weight:700;' +
            (s <= scaleVal ? 'background:#6366F1;color:#fff' : 'background:#f3f4f6;color:#9ca3af') + '">' + s + '</span>'
        }
        ansHtml = dots
      } else {
        var scoreInfo = ''
        if (item.score !== null) scoreInfo = '<span class="qa-answer-score">+' + item.score + ' pts</span>'
        ansHtml = _esc(String(val)) + scoreInfo
      }

      var num = item.index >= 0 ? (item.index + 1) : '?'
      return '<div class="qa-answer-item">' +
        '<div class="qa-answer-q">Pergunta ' + num + ': ' + _esc(item.questionTitle) + '</div>' +
        '<div class="qa-answer-a">' + ansHtml + '</div>' +
      '</div>'
    }).join('')

    // Score e temperatura
    var tempLabels = { hot: 'Quente', warm: 'Morno', cold: 'Frio' }
    var tempColors = { hot: '#ef4444', warm: '#f59e0b', cold: '#3b82f6' }
    var temp = lead.temperature || 'cold'
    var summaryHtml = '<div style="display:flex;gap:10px;margin-bottom:14px">' +
      '<div style="flex:1;padding:10px 12px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;text-align:center">' +
        '<div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:2px">Score</div>' +
        '<div style="font-size:20px;font-weight:800;color:#6366F1">' + (lead.score || 0) + '</div>' +
      '</div>' +
      '<div style="flex:1;padding:10px 12px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;text-align:center">' +
        '<div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:2px">Temperatura</div>' +
        '<div style="font-size:14px;font-weight:800;color:' + (tempColors[temp] || '#6b7280') + '">' + (tempLabels[temp] || temp) + '</div>' +
      '</div>' +
    '</div>'

    var dateStr = lead.submitted_at ? new Date(lead.submitted_at).toLocaleDateString('pt-BR') + ' às ' + new Date(lead.submitted_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

    // Overlay
    var overlay = document.createElement('div')
    overlay.className = 'qa-answers-overlay'
    overlay.innerHTML =
      '<div class="qa-answers-modal">' +
        '<div class="qa-answers-header">' +
          '<div>' +
            '<div class="qa-answers-header-title">' + _esc(lead.contact_name || 'Lead') + '</div>' +
            '<div class="qa-answers-header-sub">' + _esc(lead.contact_phone || '') + (dateStr ? ' \u00B7 ' + dateStr : '') + '</div>' +
          '</div>' +
          '<button class="qa-answers-close" id="qa-answers-close">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="qa-answers-body">' +
          summaryHtml +
          itemsHtml +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)

    // Close handlers
    var closeBtn = overlay.querySelector('#qa-answers-close')
    if (closeBtn) closeBtn.onclick = function() { overlay.remove() }
    overlay.onclick = function(e) {
      if (e.target === overlay) overlay.remove()
    }
  }

  // Fallback se QuizId não carregou
  function _legacyMapAnswers(answers, questions) {
    var items = []
    Object.keys(answers).forEach(function(key) {
      var idx = parseInt(key, 10)
      var q = !isNaN(idx) ? questions[idx] : null
      items.push({
        questionId: key, questionTitle: q ? (q.title || 'Pergunta ' + (idx + 1)) : 'Pergunta ' + key,
        questionType: q ? q.type : 'unknown', answer: answers[key], score: null, options: q ? (q.options || []) : [], index: isNaN(idx) ? -1 : idx,
      })
    })
    return items
  }

  function _formatAnswersPreview(answers, questions) {
    if (!answers || typeof answers !== 'object') return '-'
    var items = window.QuizId
      ? QuizId.mapForDisplay(answers, questions)
      : _legacyMapAnswers(answers, questions)
    var parts = items.map(function(item) {
      var val = Array.isArray(item.answer) ? item.answer.join(', ') : item.answer
      var qLabel = item.questionTitle
      if (qLabel.length > 20) qLabel = qLabel.substring(0, 20) + '...'
      return qLabel + ': ' + val
    })
    return parts.join(' | ') || '-'
  }

  function _buildLineChartSVG(data) {
    if (!data || data.length === 0) return ''

    var W = 520, H = 200, padL = 36, padR = 16, padT = 24, padB = 30
    var chartW = W - padL - padR
    var chartH = H - padT - padB

    var maxVal = Math.max.apply(null, data.map(function(d) { return d.total }))
    if (maxVal === 0) maxVal = 1

    // Build points
    var points = data.map(function(d, i) {
      var x = padL + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW)
      var y = padT + chartH - (d.total / maxVal) * chartH
      return { x: x, y: y, total: d.total, day: d.day }
    })

    var linePath = points.map(function(p, i) { return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1) }).join(' ')
    var areaPath = linePath + ' L' + points[points.length - 1].x.toFixed(1) + ',' + (padT + chartH) + ' L' + points[0].x.toFixed(1) + ',' + (padT + chartH) + ' Z'

    // Grid lines (4 horizontal)
    var gridLines = ''
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (g / 4) * chartH
      var gVal = Math.round(maxVal - (g / 4) * maxVal)
      gridLines += '<line class="grid-line" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '"/>'
      gridLines += '<text class="axis-label" x="' + (padL - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + gVal + '</text>'
    }

    // X-axis labels (show max 8)
    var step = Math.max(1, Math.ceil(data.length / 8))
    var xLabels = ''
    points.forEach(function(p, i) {
      if (i % step === 0 || i === points.length - 1) {
        var dayStr = p.day ? p.day.substring(5).replace('-', '/') : ''
        xLabels += '<text class="axis-label" x="' + p.x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + dayStr + '</text>'
      }
    })

    // Dots and value labels
    var dots = points.map(function(p) {
      return '<circle class="data-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.5"/>' +
        '<text class="value-label" x="' + p.x.toFixed(1) + '" y="' + (p.y - 8).toFixed(1) + '" text-anchor="middle">' + p.total + '</text>'
    }).join('')

    return '<svg class="qa-line-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
      '<defs><linearGradient id="qa-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6366F1"/><stop offset="100%" stop-color="#6366F1" stop-opacity="0"/></linearGradient></defs>' +
      gridLines + xLabels +
      '<path class="data-area" d="' + areaPath + '"/>' +
      '<path class="data-line" d="' + linePath + '"/>' +
      dots +
    '</svg>'
  }

  // ── Questions tab ─────────────────────────────────────────────────────────────
  function _buildQuestionsTab() {
    return '<div id="qa-q-list-wrap"></div>' +
      '<button class="qa-add-btn" id="qa-btn-add-q">' + ICON.plus + ' Adicionar Pergunta</button>' +
      '<div id="qa-q-editor-wrap" style="margin-top:14px"></div>'
  }

  function _renderQList() {
    var wrap = document.getElementById('qa-q-list-wrap')
    if (!wrap || !_activeQuiz) return

    var questions = _activeQuiz.schema.questions || []

    if (!questions.length) {
      wrap.innerHTML = '<div class="qa-empty" style="padding:20px 0"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Nenhuma pergunta ainda.</div>'
    } else {
      wrap.innerHTML = '<div class="qa-q-list" id="qa-q-list">' +
        questions.map(function(q, i) {
          var typeLabel = (QUESTION_TYPES.find(function(t) { return t.value === q.type }) || {}).label || q.type
          var activeCls = i === _activeQIdx ? ' active' : ''
          return '<div class="qa-q-item' + activeCls + '" data-qi="' + i + '">' +
            '<span class="qa-grip">' + ICON.grip + '</span>' +
            '<span class="qa-q-item-title">' + _esc(q.title) + '</span>' +
            '<span class="qa-q-item-type">' + _esc(typeLabel) + '</span>' +
            '<button class="qa-icon-btn danger" data-del-q="' + i + '" title="Remover">' + ICON.x + '</button>' +
          '</div>'
        }).join('') +
      '</div>'

      // Click to edit
      wrap.querySelectorAll('.qa-q-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          if (e.target.closest('[data-del-q]')) return
          var qi = parseInt(item.getAttribute('data-qi'), 10)
          _activeQIdx = qi
          _renderQList()
          _renderQEditor()
          _renderPhonePreview()
        })
      })

      // Delete question
      wrap.querySelectorAll('[data-del-q]').forEach(function(btn) {
        btn.onclick = function(e) {
          e.stopPropagation()
          var qi = parseInt(btn.getAttribute('data-del-q'), 10)
          _activeQuiz.schema.questions.splice(qi, 1)
          if (_activeQIdx >= _activeQuiz.schema.questions.length) _activeQIdx = -1
          _markDirty()
          _renderQList()
          _renderQEditor()
          _renderPhonePreview()
        }
      })

      // Drag to reorder (simple drag-n-drop)
      _initDragDrop(wrap.querySelector('#qa-q-list'))
    }

    // Add button
    var addBtn = document.getElementById('qa-btn-add-q')
    if (addBtn) {
      addBtn.onclick = function() {
        _activeQuiz.schema.questions.push(_deepClone(_defaultQuestion()))
        _activeQIdx = _activeQuiz.schema.questions.length - 1
        _markDirty()
        _renderQList()
        _renderQEditor()
      }
    }
  }

  // ── Drag-n-drop reorder ──────────────────────────────────────────────────────
  function _initDragDrop(listEl) {
    if (!listEl) return
    var dragging = null
    var items    = listEl.querySelectorAll('.qa-q-item')

    items.forEach(function(item) {
      item.setAttribute('draggable', 'true')

      item.addEventListener('dragstart', function(e) {
        dragging = item
        item.style.opacity = '0.4'
        e.dataTransfer.effectAllowed = 'move'
      })

      item.addEventListener('dragend', function() {
        item.style.opacity = ''
        dragging = null
        // Reorder _activeQuiz.schema.questions to match DOM order
        var newOrder = []
        listEl.querySelectorAll('.qa-q-item').forEach(function(el) {
          var qi = parseInt(el.getAttribute('data-qi'), 10)
          newOrder.push(_activeQuiz.schema.questions[qi])
        })
        _activeQuiz.schema.questions = newOrder.filter(Boolean)
        _activeQIdx = -1
        _markDirty()
        _renderQList()
      })

      item.addEventListener('dragover', function(e) {
        e.preventDefault()
        if (!dragging || dragging === item) return
        var rect   = item.getBoundingClientRect()
        var midY   = rect.top + rect.height / 2
        if (e.clientY < midY) {
          listEl.insertBefore(dragging, item)
        } else {
          listEl.insertBefore(dragging, item.nextSibling)
        }
      })
    })
  }

  // ── Question editor ──────────────────────────────────────────────────────────
  function _renderQEditor() {
    var wrap = document.getElementById('qa-q-editor-wrap')
    if (!wrap) return

    if (_activeQIdx < 0 || !_activeQuiz) {
      wrap.innerHTML = ''
      return
    }

    var q        = _activeQuiz.schema.questions[_activeQIdx]
    if (!q) { wrap.innerHTML = ''; return }

    var typeOpts = QUESTION_TYPES.map(function(t) {
      return '<option value="' + t.value + '"' + (q.type === t.value ? ' selected' : '') + '>' + t.label + '</option>'
    }).join('')

    var hasOptions     = ['single_choice','multiple_choice','image_choice'].indexOf(q.type) !== -1
    var isScale        = q.type === 'scale'
    var isContactField = CONTACT_FIELD_TYPES.indexOf(q.type) !== -1
    var isMcwi         = q.type === 'multi_choice_with_image'

    var optionsHtml = ''
    if (hasOptions) {
      var isImage = q.type === 'image_choice'
      optionsHtml = '<div class="qa-section-title" style="margin-top:10px">Opções</div>' +
        '<div class="qa-opt-list" id="qa-opt-list">' +
          (q.options || []).map(function(opt, oi) {
            return '<div class="qa-opt-row" data-oi="' + oi + '">' +
              '<input class="qa-input qa-opt-label" value="' + _esc(opt.label) + '" placeholder="Label da opção">' +
              '<input class="qa-input qa-opt-score" type="number" value="' + (opt.score || 0) + '" placeholder="Score" title="Score">' +
              (isImage ? '<input class="qa-input" style="width:130px" value="' + _esc(opt.image_url || '') + '" placeholder="URL imagem" data-img-url>' : '') +
              '<button class="qa-icon-btn danger" data-del-opt="' + oi + '">' + ICON.x + '</button>' +
            '</div>'
          }).join('') +
        '</div>' +
        '<button class="qa-add-btn" id="qa-btn-add-opt" style="margin-top:4px">' + ICON.plus + ' Opção</button>'
    }

    var scaleHtml = ''
    if (isScale) {
      scaleHtml =
        '<div class="qa-section-title" style="margin-top:10px">Labels da escala</div>' +
        '<div class="qa-form-group"><label class="qa-label">Label mínimo (1)</label><input class="qa-input" id="scale-min-lbl" value="' + _esc(q.scale_min_label || 'Pouco') + '"></div>' +
        '<div class="qa-form-group"><label class="qa-label">Label máximo (5)</label><input class="qa-input" id="scale-max-lbl" value="' + _esc(q.scale_max_label || 'Muito') + '"></div>'
    }

    var contactFieldHtml = ''
    if (isContactField) {
      var _cfLabels = { contact_name: 'Nome completo', contact_phone: 'WhatsApp', contact_email: 'E-mail' }
      var _cfDescs  = {
        contact_name:  'Exibe um campo de texto para o lead informar o nome.',
        contact_phone: 'Exibe um campo de telefone com máscara para o lead informar o WhatsApp.',
        contact_email: 'Exibe um campo de e-mail (opcional — não bloqueia o avanço).',
      }
      contactFieldHtml =
        '<div style="margin-top:10px;padding:10px 12px;background:#EEF2FF;border-radius:8px;font-size:12px;color:#4338CA;line-height:1.5">' +
          '<strong>' + _cfLabels[q.type] + '</strong> — ' + _cfDescs[q.type] + '<br>' +
          '<span style="color:#6B7280;margin-top:4px;display:block">Não requer opções ou pontuação. O campo será exibido como tela individual no quiz.</span>' +
        '</div>'
    }

    var mcwiHtml = ''
    if (isMcwi) {
      // Ensure structure — fixes missing fields on older questions
      if (!q.image)     q.image     = { url: '', alt: '', enabled: false }
      if (!q.selection) q.selection = { mode: 'single', min: 1, max: 1 }
      if (!q.options)   q.options   = []

      var _img        = q.image
      var _sel        = q.selection
      var _imgEnabled = !!_img.enabled   // explicit bool — false when undefined
      var _selMode    = _sel.mode  || 'single'
      var _selMin     = _sel.min   || 1
      var _selMax     = _sel.max   || 1

      var _descPosOpts = function(cur) {
        return '<option value="below"' + (cur !== 'above' ? ' selected' : '') + '>Abaixo da imagem</option>' +
               '<option value="above"' + (cur === 'above' ? ' selected' : '') + '>Acima da imagem</option>'
      }

      mcwiHtml =
        // ── Imagem da pergunta (global, acima das opções)
        '<div class="qa-section-title" style="margin-top:10px">Imagem da pergunta (acima das opções)</div>' +
        '<div class="qa-form-group" style="flex-direction:row;align-items:center;gap:8px">' +
          '<label class="qa-toggle"><input type="checkbox" id="mcwi-img-enabled"' + (_imgEnabled ? ' checked' : '') + '><span class="qa-toggle-slider"></span></label>' +
          '<span class="qa-label" style="margin-bottom:0">Mostrar imagem</span>' +
        '</div>' +
        '<div id="mcwi-img-fields"' + (!_imgEnabled ? ' style="display:none"' : '') + '>' +
          '<div class="qa-form-group"><label class="qa-label">URL da imagem</label><input class="qa-input" id="mcwi-img-url" value="' + _esc(_img.url || '') + '" placeholder="https://..."></div>' +
          (_img.url ? '<div style="margin-bottom:10px"><img src="' + _esc(_img.url) + '" style="width:100%;border-radius:10px;max-height:100px;object-fit:cover" onerror="this.style.display=\'none\'"></div>' : '') +
        '</div>' +
        // ── Seleção
        '<div class="qa-section-title" style="margin-top:10px">Seleção</div>' +
        '<div class="qa-form-group">' +
          '<label class="qa-label">Modo</label>' +
          '<div style="display:flex;gap:14px;margin-top:6px">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">' +
              '<input type="radio" name="mcwi-sel-mode" value="single"' + (_selMode === 'single' ? ' checked' : '') + '> Única' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">' +
              '<input type="radio" name="mcwi-sel-mode" value="multiple"' + (_selMode === 'multiple' ? ' checked' : '') + '> Múltipla' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div id="mcwi-multi-fields"' + (_selMode === 'single' ? ' style="display:none"' : '') + '>' +
          '<div style="display:flex;gap:8px">' +
            '<div class="qa-form-group" style="flex:1"><label class="qa-label">Mín seleções</label><input class="qa-input" type="number" id="mcwi-sel-min" value="' + _selMin + '" min="1"></div>' +
            '<div class="qa-form-group" style="flex:1"><label class="qa-label">Máx seleções</label><input class="qa-input" type="number" id="mcwi-sel-max" value="' + _selMax + '" min="1"></div>' +
          '</div>' +
        '</div>' +
        // ── Opções expandidas (imagem, título, descrição, posição, score)
        '<div class="qa-section-title" style="margin-top:10px">Opções</div>' +
        '<div id="qa-mcwi-opt-list">' +
          (q.options || []).map(function(opt, oi) {
            return '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px" data-oi="' + oi + '">' +
              // Header
              '<div style="display:flex;align-items:center;margin-bottom:8px">' +
                '<span style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">Opção ' + (oi + 1) + '</span>' +
                '<button class="qa-icon-btn danger" data-del-mcwi-opt="' + oi + '" style="margin-left:auto" title="Remover">' + ICON.x + '</button>' +
              '</div>' +
              // Título
              '<div class="qa-form-group" style="margin-bottom:6px"><label class="qa-label">Título</label>' +
                '<input class="qa-input mcwi-opt-label-inp" value="' + _esc(opt.label || '') + '" placeholder="Texto da opção"></div>' +
              // Imagem
              '<div class="qa-form-group" style="margin-bottom:6px"><label class="qa-label">URL da imagem (opcional)</label>' +
                '<input class="qa-input mcwi-opt-img-inp" value="' + _esc(opt.image_url || '') + '" placeholder="https://..."></div>' +
              // Preview mini
              (opt.image_url ? '<div style="margin-bottom:6px"><img src="' + _esc(opt.image_url) + '" style="width:100%;border-radius:8px;max-height:70px;object-fit:cover" onerror="this.style.display=\'none\'"></div>' : '') +
              // Descrição
              '<div class="qa-form-group" style="margin-bottom:6px"><label class="qa-label">Descrição (opcional)</label>' +
                '<input class="qa-input mcwi-opt-desc-inp" value="' + _esc(opt.description || '') + '" placeholder="Texto auxiliar..."></div>' +
              // Posição da descrição
              '<div style="display:flex;gap:8px;align-items:flex-end">' +
                '<div class="qa-form-group" style="flex:1;margin-bottom:0"><label class="qa-label">Posição da descrição</label>' +
                  '<select class="qa-select mcwi-opt-dpos-inp">' + _descPosOpts(opt.desc_position) + '</select>' +
                '</div>' +
                '<div class="qa-form-group" style="width:70px;margin-bottom:0"><label class="qa-label">Score</label>' +
                  '<input class="qa-input mcwi-opt-score-inp" type="number" value="' + (opt.score || 0) + '"></div>' +
              '</div>' +
            '</div>'
          }).join('') +
        '</div>' +
        '<button class="qa-add-btn" id="qa-btn-add-mcwi-opt" style="margin-top:4px">' + ICON.plus + ' Opção</button>'
    }

    wrap.innerHTML =
      '<div class="qa-q-editor">' +
        '<div class="qa-q-editor-title">Editando pergunta ' + (_activeQIdx + 1) + '</div>' +
        '<div class="qa-form-group"><label class="qa-label">Título da pergunta</label><textarea class="qa-textarea" id="qe-title">' + _esc(q.title) + '</textarea>' +
          '<span style="font-size:10px;color:#9ca3af;margin-top:3px">Variáveis: <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px">{nome}</code> <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px">{email}</code> <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px">{telefone}</code></span>' +
        '</div>' +
        '<div class="qa-form-group"><label class="qa-label">Tipo</label><select class="qa-select" id="qe-type">' + typeOpts + '</select></div>' +
        (!isContactField
          ? '<div class="qa-form-group" style="flex-direction:row;align-items:center;gap:8px">' +
              '<label class="qa-toggle"><input type="checkbox" id="qe-required"' + (q.required ? ' checked' : '') + '><span class="qa-toggle-slider"></span></label>' +
              '<span class="qa-label" style="margin-bottom:0">Obrigatória</span>' +
            '</div>'
          : '') +
        (isMcwi ? mcwiHtml : contactFieldHtml + optionsHtml + scaleHtml) +
      '</div>'

    _bindQEditorEvents(q)
  }

  // Marca pergunta como revisada (mudança significativa: título, tipo, opções)
  function _markQuestionRevised(qi) {
    var q = _activeQuiz.schema.questions[qi]
    if (q) q.revised_at = new Date().toISOString()
  }

  function _bindQEditorEvents(q) {
    var qi = _activeQIdx

    function _field(id, setter) {
      var el = document.getElementById(id)
      if (!el) return
      el.addEventListener('input', function() { setter(el.value); _markDirty() })
      el.addEventListener('change', function() { setter(el.value); _markDirty() })
    }

    var titleEl = document.getElementById('qe-title')
    if (titleEl) {
      titleEl.addEventListener('input', function() {
        _activeQuiz.schema.questions[qi].title = titleEl.value
        _markQuestionRevised(qi)
        _markDirty()
        _renderPhonePreview()
      })
    }

    var typeEl = document.getElementById('qe-type')
    if (typeEl) {
      typeEl.onchange = function() {
        var qObj = _activeQuiz.schema.questions[qi]
        qObj.type = typeEl.value
        _markQuestionRevised(qi)
        if (['single_choice','multiple_choice','image_choice'].indexOf(typeEl.value) !== -1) {
          if (!qObj.options || !qObj.options.length) {
            qObj.options = [{ label: 'Opção 1', score: 1 }]
          }
        }
        if (typeEl.value === 'multi_choice_with_image') {
          if (!qObj.image)     qObj.image     = { url: '', alt: '', enabled: false }
          if (!qObj.selection) qObj.selection = { mode: 'single', min: 1, max: 1 }
          if (!qObj.options || !qObj.options.length) qObj.options = [{ label: 'Opção 1', score: 1 }]
        }
        _markDirty()
        _renderQEditor()
        _renderPhonePreview()
      }
    }

    var reqEl = document.getElementById('qe-required')
    if (reqEl) reqEl.onchange = function() { _activeQuiz.schema.questions[qi].required = reqEl.checked; _markDirty() }

    _field('scale-min-lbl', function(v) { _activeQuiz.schema.questions[qi].scale_min_label = v })
    _field('scale-max-lbl', function(v) { _activeQuiz.schema.questions[qi].scale_max_label = v })

    // Options events
    var optList = document.getElementById('qa-opt-list')
    if (optList) {
      optList.querySelectorAll('.qa-opt-row').forEach(function(row) {
        var oi      = parseInt(row.getAttribute('data-oi'), 10)
        var lblInp  = row.querySelector('.qa-opt-label')
        var scrInp  = row.querySelector('.qa-opt-score')
        var imgInp  = row.querySelector('[data-img-url]')
        var delBtn  = row.querySelector('[data-del-opt]')

        if (lblInp) lblInp.oninput = function() {
          _activeQuiz.schema.questions[qi].options[oi].label = lblInp.value
          _markQuestionRevised(qi)
          _markDirty()
        }
        if (scrInp) scrInp.oninput = function() {
          _activeQuiz.schema.questions[qi].options[oi].score = parseInt(scrInp.value, 10) || 0
          _markDirty()
        }
        if (imgInp) imgInp.oninput = function() {
          _activeQuiz.schema.questions[qi].options[oi].image_url = imgInp.value
          _markDirty()
        }
        if (delBtn) delBtn.onclick = function() {
          _activeQuiz.schema.questions[qi].options.splice(oi, 1)
          _markQuestionRevised(qi)
          _markDirty()
          _renderQEditor()
        }
      })
    }

    var addOptBtn = document.getElementById('qa-btn-add-opt')
    if (addOptBtn) {
      addOptBtn.onclick = function() {
        if (!_activeQuiz.schema.questions[qi].options) _activeQuiz.schema.questions[qi].options = []
        _activeQuiz.schema.questions[qi].options.push({ label: 'Nova opção', score: 0 })
        _markQuestionRevised(qi)
        _markDirty()
        _renderQEditor()
      }
    }

    // ── Multi choice with image bindings ─────────────────────────────────────
    var mcwiImgEnabled = document.getElementById('mcwi-img-enabled')
    if (mcwiImgEnabled) {
      mcwiImgEnabled.onchange = function() {
        if (!_activeQuiz.schema.questions[qi].image) _activeQuiz.schema.questions[qi].image = { url: '', alt: '', enabled: false }
        _activeQuiz.schema.questions[qi].image.enabled = mcwiImgEnabled.checked
        var fields = document.getElementById('mcwi-img-fields')
        if (fields) fields.style.display = mcwiImgEnabled.checked ? '' : 'none'
        _markDirty()
      }
    }

    var mcwiImgUrl = document.getElementById('mcwi-img-url')
    if (mcwiImgUrl) {
      mcwiImgUrl.addEventListener('input', function() {
        if (!_activeQuiz.schema.questions[qi].image) _activeQuiz.schema.questions[qi].image = { url: '', alt: '', enabled: true }
        _activeQuiz.schema.questions[qi].image.url = mcwiImgUrl.value.trim()
        _markDirty()
      })
    }

    document.querySelectorAll('input[name="mcwi-sel-mode"]').forEach(function(radio) {
      radio.onchange = function() {
        if (!_activeQuiz.schema.questions[qi].selection) _activeQuiz.schema.questions[qi].selection = { mode: 'single', min: 1, max: 1 }
        _activeQuiz.schema.questions[qi].selection.mode = radio.value
        var multiFields = document.getElementById('mcwi-multi-fields')
        if (multiFields) multiFields.style.display = radio.value === 'multiple' ? '' : 'none'
        if (radio.value === 'single') {
          _activeQuiz.schema.questions[qi].selection.min = 1
          _activeQuiz.schema.questions[qi].selection.max = 1
        }
        _markDirty()
      }
    })

    _field('mcwi-sel-min', function(v) {
      if (!_activeQuiz.schema.questions[qi].selection) _activeQuiz.schema.questions[qi].selection = { mode: 'multiple', min: 1, max: 1 }
      _activeQuiz.schema.questions[qi].selection.min = parseInt(v, 10) || 1
    })
    _field('mcwi-sel-max', function(v) {
      if (!_activeQuiz.schema.questions[qi].selection) _activeQuiz.schema.questions[qi].selection = { mode: 'multiple', min: 1, max: 1 }
      _activeQuiz.schema.questions[qi].selection.max = parseInt(v, 10) || 1
    })

    var mcwiOptList = document.getElementById('qa-mcwi-opt-list')
    if (mcwiOptList) {
      mcwiOptList.querySelectorAll('[data-oi]').forEach(function(block) {
        var oi      = parseInt(block.getAttribute('data-oi'), 10)
        var lblInp  = block.querySelector('.mcwi-opt-label-inp')
        var imgInp  = block.querySelector('.mcwi-opt-img-inp')
        var descInp = block.querySelector('.mcwi-opt-desc-inp')
        var dposInp = block.querySelector('.mcwi-opt-dpos-inp')
        var scrInp  = block.querySelector('.mcwi-opt-score-inp')
        var delBtn  = block.querySelector('[data-del-mcwi-opt]')

        function _opt() { return _activeQuiz.schema.questions[qi].options[oi] }

        if (lblInp)  lblInp.oninput  = function() { _opt().label       = lblInp.value;  _markQuestionRevised(qi); _markDirty() }
        if (imgInp)  imgInp.oninput  = function() { _opt().image_url   = imgInp.value.trim();  _markDirty() }
        if (descInp) descInp.oninput = function() { _opt().description = descInp.value; _markDirty() }
        if (dposInp) dposInp.onchange = function() { _opt().desc_position = dposInp.value; _markDirty() }
        if (scrInp)  scrInp.oninput  = function() { _opt().score       = parseInt(scrInp.value, 10) || 0; _markDirty() }
        if (delBtn)  delBtn.onclick   = function() {
          _activeQuiz.schema.questions[qi].options.splice(oi, 1)
          _markQuestionRevised(qi)
          _markDirty()
          _renderQEditor()
        }
      })
    }

    var addMcwiOptBtn = document.getElementById('qa-btn-add-mcwi-opt')
    if (addMcwiOptBtn) {
      addMcwiOptBtn.onclick = function() {
        if (!_activeQuiz.schema.questions[qi].options) _activeQuiz.schema.questions[qi].options = []
        _activeQuiz.schema.questions[qi].options.push({ label: 'Nova opção', image_url: '', description: '', desc_position: 'below', score: 0 })
        _markQuestionRevised(qi)
        _markDirty()
        _renderQEditor()
      }
    }
  }

  // ── Phone preview ────────────────────────────────────────────────────────────
  function _renderPhonePreview() {
    var screen = document.getElementById('qa-phone-screen')
    if (!screen) return

    if (!_activeQuiz) {
      screen.innerHTML = '<div style="padding:30px 16px;text-align:center;color:#9ca3af;font-size:12px">Selecione um quiz</div>'
      return
    }

    var schema  = _activeQuiz.schema || {}
    var intr    = schema.intro || {}
    var app     = schema.appearance || {}
    var primary = app.primary_color || '#6366F1'

    var clinicName = _activeQuiz.title || 'Quiz'
    var initial    = clinicName.charAt(0).toUpperCase()
    var logoUrl    = intr.logo_url || ''
    var coverUrl   = intr.image_url || ''

    var logoHtml = logoUrl
      ? '<div class="qa-preview-logo"><img src="' + _esc(_resolveImgUrl(logoUrl)) + '" style="width:100%;height:100%;object-fit:contain;border-radius:10px"></div>'
      : '<div class="qa-preview-logo">' + _esc(initial) + '</div>'

    var coverFit  = app.cover_fit || 'cover'
    var coverHtml = coverUrl
      ? '<img class="qa-preview-cover" src="' + _esc(_resolveImgUrl(coverUrl)) + '" style="object-fit:' + coverFit + ';background:#f3f4f6">'
      : ''

    // ── Thankyou preview ─────────────────────────────────────────
    if (_activeTab === 'thankyou') {
      var outr     = schema.outro || {}
      var waPhone  = (outr.wa_phone || '').replace(/\D/g, '')
      var vidUrl   = outr.video_url   || ''
      var imgUrl   = outr.image_url   || ''
      var autoplay = outr.video_autoplay !== false

      var mediaHtml = ''
      if (vidUrl) {
        var embedSrc = _resolveVideoEmbedAdmin(vidUrl, autoplay)
        if (embedSrc) {
          mediaHtml = '<div style="width:55%;max-width:130px;aspect-ratio:9/16;border-radius:8px;overflow:hidden;margin:0 auto 10px">' +
            '<iframe src="' + _esc(embedSrc) + '" style="width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>' +
            '</div>'
        }
      } else if (imgUrl) {
        mediaHtml = '<img src="' + _esc(_resolveImgUrl(imgUrl)) + '" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-bottom:10px;display:block">'
      }

      var customBtnHtml = (outr.btn_label)
        ? '<div style="height:38px;background:' + _esc(outr.btn_color || '#111') + ';color:' + _esc(outr.btn_text_color || '#fff') + ';border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-bottom:8px">' + _esc(outr.btn_label) + '</div>'
        : ''

      var waBtnHtml = waPhone
        ? '<div style="height:38px;background:#25D366;color:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;gap:5px">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>' +
            'WhatsApp' +
          '</div>'
        : ''

      screen.innerHTML =
        '<div style="padding:16px;text-align:center">' +
          '<div style="width:44px;height:44px;border-radius:50%;background:#DCFCE7;display:flex;align-items:center;justify-content:center;margin:0 auto 10px">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</div>' +
          '<div style="font-size:14px;font-weight:700;color:#111;margin-bottom:5px">' + _esc(outr.title || 'Perfeito!') + '</div>' +
          '<div style="font-size:11px;color:#6b7280;margin-bottom:12px;line-height:1.5">' + _esc(outr.message || '') + '</div>' +
          mediaHtml +
          customBtnHtml +
          waBtnHtml +
        '</div>'
      return
    }

    // ── Question preview ──────────────────────────────────────────
    if (_activeTab === 'questions' && _activeQIdx >= 0) {
      var qs    = schema.questions || []
      var q     = qs[_activeQIdx]
      if (q) {
        var total   = qs.length
        var qNum    = _activeQIdx + 1
        var qTitle  = q.title || 'Pergunta ' + qNum
        var qType   = q.type  || 'single_choice'
        var opts    = q.options || []

        // progress dots
        var dotsHtml = '<div style="display:flex;gap:4px;justify-content:center;margin-bottom:10px">' +
          qs.map(function(_, i) {
            var isActive = i === _activeQIdx
            return '<div style="height:4px;border-radius:2px;background:' + (isActive ? primary : '#D1D5DB') + ';width:' + (isActive ? '18px' : '8px') + ';transition:width .2s"></div>'
          }).join('') +
        '</div>'

        // options / input area
        var bodyHtml = ''
        if (qType === 'single_choice' || qType === 'multiple_choice') {
          bodyHtml = opts.slice(0, 5).map(function(o) {
            return '<div style="padding:8px 10px;border-radius:10px;border:1.5px solid #E5E7EB;font-size:11px;color:#111;margin-bottom:6px;background:#fff">' + _esc(o.label || '') + '</div>'
          }).join('')
          if (opts.length > 5) bodyHtml += '<div style="font-size:10px;color:#9ca3af;text-align:center">+' + (opts.length - 5) + ' opções</div>'
        } else if (qType === 'image_choice' || qType === 'multi_choice_with_image') {
          bodyHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
            opts.slice(0, 4).map(function(o) {
              return '<div style="border-radius:8px;border:1.5px solid #E5E7EB;padding:8px 6px;text-align:center;font-size:10px;color:#111;background:#fff">' + _esc(o.label || '') + '</div>'
            }).join('') +
          '</div>'
        } else if (qType === 'scale') {
          bodyHtml = '<div style="display:flex;gap:4px;justify-content:center">' +
            [1,2,3,4,5].map(function(n) {
              return '<div style="width:28px;height:28px;border-radius:8px;border:1.5px solid #E5E7EB;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#111;background:#fff">' + n + '</div>'
            }).join('') +
          '</div>'
        } else {
          // text input / contact fields
          var ph = qType === 'contact_phone' ? '(00) 00000-0000' : qType === 'contact_email' ? 'email@exemplo.com' : 'Digite aqui...'
          bodyHtml = '<div style="border:1.5px solid #E5E7EB;border-radius:10px;padding:8px 10px;font-size:11px;color:#9ca3af;background:#fff">' + ph + '</div>'
        }

        screen.innerHTML =
          '<div style="height:100%;display:flex;flex-direction:column;padding:12px 10px 10px;background:#F7F8FC">' +
            dotsHtml +
            '<div style="font-size:12px;font-weight:700;color:#111;line-height:1.4;margin-bottom:12px">' + _esc(qTitle) + '</div>' +
            '<div style="flex:1;overflow:hidden">' + bodyHtml + '</div>' +
            '<button style="width:100%;height:36px;border-radius:12px;border:none;background:' + _esc(primary) + ';color:#fff;font-size:12px;font-weight:700;cursor:pointer;margin-top:8px">' +
              (qNum < total ? 'Continuar' : 'Finalizar') +
            '</button>' +
          '</div>'
        return
      }
    }

    // ── Intro preview (default) ───────────────────────────────────
    screen.innerHTML =
      '<div class="qa-preview-intro">' +
        logoHtml +
        '<div class="qa-preview-title" style="color:#111827">' + _esc(intr.title || _activeQuiz.title || 'Quiz') + '</div>' +
        '<div class="qa-preview-desc">' + _esc(intr.description || '') + '</div>' +
        coverHtml +
        '<button class="qa-preview-cta" style="background:' + _esc(primary) + '">' + _esc(intr.cta_label || 'Começar') + '</button>' +
      '</div>'
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  var QuizAdmin = Object.freeze({
    /**
     * @param {string|null} context   - 'kanban-fullface' | 'kanban-protocolos' | null (todos)
     * @param {string}      [rootId]  - ID do elemento root (default 'quizAdminRoot')
     */
    init: function(context, rootId) {
      _contextFilter = context || null
      _contextRootId = rootId || (
        context === 'kanban-fullface'   ? 'quizFullFaceRoot'   :
        context === 'kanban-protocolos' ? 'quizProtocolosRoot' :
        'quizAdminRoot'
      )
      _activeQuiz  = null
      _activeQIdx  = -1
      _dirty       = false
      _loadQuizzes()
    },
    render: render,
  })

  window.QuizAdmin = QuizAdmin

})()
