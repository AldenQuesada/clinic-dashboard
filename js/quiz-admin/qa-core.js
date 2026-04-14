;(function () {
  'use strict'
  if (window.QA) return

  // ── State ────────────────────────────────────────────────────────────────────
  var _quizzes        = []
  var _activeQuiz     = null
  var _activeQIdx     = -1
  var _dirty          = false
  var _saveTimer      = null
  var _clinicId       = null
  var _activeTab      = 'config'
  var _contextFilter  = null
  var _contextRootId  = 'quizAdminRoot'

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
    // Use global escHtml if available, otherwise inline
    if (window.escHtml) return window.escHtml(str)
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
    // Resolve clinic_id from authenticated profile (cached in sessionStorage)
    try {
      var profile = JSON.parse(sessionStorage.getItem('clinicai_profile') || 'null')
      if (profile && profile.clinic_id) return profile.clinic_id
    } catch(e) {}
    // Fallback for legacy/dev — will be removed when all clinics are onboarded
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
    { value: 'text_input',              label: 'Texto livre' },
    { value: 'scale',                   label: 'Escala 1–5' },
    { value: 'image_choice',            label: 'Escolha por imagem' },
    { value: 'contact_name',            label: 'Campo: Nome' },
    { value: 'contact_phone',           label: 'Campo: WhatsApp' },
    { value: 'contact_email',           label: 'Campo: E-mail' },
    { value: 'contact_queixas',         label: 'Campo: Queixas Faciais' },
  ]

  var CONTACT_FIELD_TYPES = ['contact_name', 'contact_phone', 'contact_email', 'contact_queixas']

  // ── Default new quiz schema ──────────────────────────────────────────────────
  function _defaultSchema() {
    return {
      intro: {
        title:       '',
        description: '',
        cta_label:   'Comecar',
        image_url:   '',
        logo_url:    '',
        show_divider: true,
        cta_style:   'gradient',
        cta_color:   '#5B6CFF',
        bg_color:    '#F4F3F8',
        cover_height: 320,
        countdown_seconds: 0,
        badges: [],
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
        google_tag_id:     '',
        google_ads_id:     '',
        google_ads_label:  '',
        tiktok_pixel_id:   '',
      },
      notifications: {
        whatsapp_numbers: '',
        webhook_url:      '',
      },
      meta: {
        objective:    '',
        responsibles: [],  // array de { id, name, role } dos membros da equipe
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

  // ── Dirty / Save ─────────────────────────────────────────────────────────────
  function _markDirty() {
    _dirty = true
    var saveBtn = document.getElementById('qa-save-btn')
    if (saveBtn) saveBtn.style.display = 'inline-flex'
    var saveArea = document.getElementById('qa-save-area')
    if (saveArea) saveArea.innerHTML = ''
  }

  async function _saveQuiz() {
    if (!_activeQuiz) return

    // Validar campos obrigatorios
    var meta = (_activeQuiz.schema && _activeQuiz.schema.meta) || {}
    var errors = []
    if (!_activeQuiz.title || !_activeQuiz.title.trim()) errors.push('Titulo')
    if (!meta.objective || !meta.objective.trim()) errors.push('Descricao / Objetivo')
    if (!meta.responsibles || meta.responsibles.length === 0) errors.push('Responsaveis')

    if (errors.length > 0) {
      // Destacar campos no editor
      var objEl = document.getElementById('cfg-objective')
      if (objEl && (!meta.objective || !meta.objective.trim())) objEl.style.borderColor = '#ef4444'
      var staffWrap = document.getElementById('cfg-responsibles-wrap')
      if (staffWrap && (!meta.responsibles || meta.responsibles.length === 0)) {
        staffWrap.style.outline = '2px solid #ef4444'
        staffWrap.style.borderRadius = '8px'
      }
      _toastErr('Campos obrigatorios faltando: ' + errors.join(', '))
      return
    }

    // Limpar destaques de erro
    var objEl2 = document.getElementById('cfg-objective')
    if (objEl2) objEl2.style.borderColor = ''
    var staffWrap2 = document.getElementById('cfg-responsibles-wrap')
    if (staffWrap2) { staffWrap2.style.outline = ''; staffWrap2.style.borderRadius = '' }

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

      if (window.QAList) QAList.render()
    } catch (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar' }
      _toastErr('Erro ao salvar: ' + (err.message || err))
    }
  }

  // ── Select quiz ──────────────────────────────────────────────────────────────
  async function _selectQuiz(idx) {
    _activeQuiz = _deepClone(_quizzes[idx])
    if (!_activeQuiz.schema || typeof _activeQuiz.schema !== 'object') {
      _activeQuiz.schema = _defaultSchema()
    }
    var def = _defaultSchema()
    _activeQuiz.schema.intro       = Object.assign({}, def.intro,       _activeQuiz.schema.intro       || {})
    _activeQuiz.schema.outro       = Object.assign({}, def.outro,       _activeQuiz.schema.outro       || {})
    _activeQuiz.schema.scoring     = Object.assign({}, def.scoring,     _activeQuiz.schema.scoring     || {})
    _activeQuiz.schema.appearance  = Object.assign({}, def.appearance,  _activeQuiz.schema.appearance  || {})
    _activeQuiz.schema.pixels               = Object.assign({}, def.pixels,               _activeQuiz.schema.pixels               || {})
    _activeQuiz.schema.notifications        = Object.assign({}, def.notifications,        _activeQuiz.schema.notifications        || {})
    var defMeta = def.meta
    var curMeta = _activeQuiz.schema.meta || {}
    _activeQuiz.schema.meta = {
      objective:    curMeta.objective || defMeta.objective,
      responsibles: Array.isArray(curMeta.responsibles) ? curMeta.responsibles : (typeof curMeta.responsibles === 'string' && curMeta.responsibles ? [{ id: null, name: curMeta.responsibles, role: '' }] : []),
    }
    _activeQuiz.schema.analytics_thresholds = Object.assign({}, def.analytics_thresholds, _activeQuiz.schema.analytics_thresholds || {})
    if (!Array.isArray(_activeQuiz.schema.questions)) _activeQuiz.schema.questions = []

    // Normaliza campos que DEVEM ser array — protege contra schema legado salvo como {}
    function _ensureArr(obj, key) { if (!obj || !Array.isArray(obj[key])) obj[key] = [] }
    var intr = _activeQuiz.schema.intro
    var outr = _activeQuiz.schema.outro
    ;['badges','checklists','testimonials','before_after','text_blocks'].forEach(function(k) { _ensureArr(intr, k) })
    ;['badges','checklists','testimonials','before_after','text_blocks'].forEach(function(k) { _ensureArr(outr, k) })

    if (window.QuizId && QuizId.ensureIds(_activeQuiz.schema.questions)) {
      _dirty = true
      await _repo().updateTemplate(_activeQuiz.id, { schema: _activeQuiz.schema })
    }

    _activeQIdx = -1
    if (!_dirty) _dirty = false
    if (window.QAList) QAList.render()
    _renderEditor()
    if (window.QAPreview) QAPreview.render()
    if (window.QAAlerts) QAAlerts.loadBadgeCount()
  }

  // ── New quiz ─────────────────────────────────────────────────────────────────
  async function _newQuiz() {
    var kanbanOpts = KANBAN_OPTIONS.map(function(o) {
      var sel = (_contextFilter && _contextFilter === o.value) ? ' selected' : ''
      return '<option value="' + _esc(o.value) + '"' + sel + '>' + _esc(o.label) + '</option>'
    }).join('')

    // Carregar equipe
    var staff = await _loadStaff()
    var staffHtml = staff.length > 0
      ? staff.map(function(s) {
          var sId = s.user_id || s.id || ''
          var name = ((s.first_name || '') + ' ' + (s.last_name || '')).trim() || s.email || 'Sem nome'
          var role = s.role || ''
          var roleLabel = { admin: 'Admin', therapist: 'Terapeuta', receptionist: 'Recepcionista', viewer: 'Visualizador' }[role] || role
          return '<div style="margin-bottom:6px;padding:6px 8px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6">' +
            '<label class="qa-checkbox-row" style="margin-bottom:4px">' +
              '<input type="checkbox" class="nq-staff-cb" data-staff-id="' + _esc(sId) + '" data-staff-name="' + _esc(name) + '" data-staff-role="' + _esc(role) + '">' +
              '<span style="font-weight:700">' + _esc(name) + '</span>' +
              '<span style="font-size:10px;color:#9ca3af;margin-left:4px">(' + _esc(roleLabel) + ')</span>' +
            '</label>' +
            '<div class="nq-staff-phone-row" style="display:none;align-items:center;gap:6px;margin-left:22px">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>' +
              '<input class="qa-input nq-staff-phone" data-staff-id="' + _esc(sId) + '" value="' + _esc(s.phone || '') + '" placeholder="5511999990000" style="flex:1;padding:4px 8px;font-size:12px">' +
            '</div>' +
          '</div>'
        }).join('')
      : '<div style="font-size:11px;color:#9ca3af">Nenhum membro cadastrado. Cadastre a equipe primeiro.</div>'

    var overlay = document.createElement('div')
    overlay.className = 'qa-answers-overlay'
    overlay.innerHTML =
      '<div class="qa-answers-modal" style="max-width:440px">' +
        '<div class="qa-answers-header">' +
          '<div>' +
            '<div class="qa-answers-header-title">Novo Quiz</div>' +
            '<div class="qa-answers-header-sub">Preencha os dados para criar o quiz</div>' +
          '</div>' +
          '<button class="qa-answers-close" id="qa-nq-close">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="qa-answers-body">' +
          '<div class="qa-form-group"><label class="qa-label">Titulo do quiz *</label><input class="qa-input" id="qa-nq-title" placeholder="Ex: Quiz Lifting 5D"></div>' +
          '<div class="qa-form-group"><label class="qa-label">Descricao / Objetivo *</label><textarea class="qa-textarea" id="qa-nq-objective" placeholder="Ex: Captar leads interessados em procedimentos faciais" style="min-height:60px"></textarea></div>' +
          '<div class="qa-form-group"><label class="qa-label">Responsaveis *</label><div id="qa-nq-staff">' + staffHtml + '</div><div id="qa-nq-staff-error" style="display:none;font-size:11px;color:#ef4444;margin-top:4px">Selecione pelo menos um responsavel</div></div>' +
          '<div class="qa-form-group"><label class="qa-label">Kanban destino</label><select class="qa-select" id="qa-nq-kanban">' + kanbanOpts + '</select></div>' +
          '<button class="qa-save-btn" id="qa-nq-create" style="width:100%;justify-content:center;margin-top:8px">Criar Quiz</button>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)

    overlay.querySelector('#qa-nq-close').onclick = function() { overlay.remove() }
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove() }

    // Toggle phone field on checkbox change
    overlay.querySelectorAll('.nq-staff-cb').forEach(function(cb) {
      cb.onchange = function() {
        var row = cb.closest('div')
        var phoneRow = row ? row.querySelector('.nq-staff-phone-row') : null
        if (phoneRow) phoneRow.style.display = cb.checked ? 'flex' : 'none'
      }
    })

    overlay.querySelector('#qa-nq-create').onclick = async function() {
      var hasError = false

      // Validar titulo
      var titleEl = overlay.querySelector('#qa-nq-title')
      var title = titleEl ? titleEl.value.trim() : ''
      if (!title) { titleEl.style.borderColor = '#ef4444'; hasError = true }
      else { titleEl.style.borderColor = '' }

      // Validar descricao
      var objectiveEl = overlay.querySelector('#qa-nq-objective')
      var objective = objectiveEl ? objectiveEl.value.trim() : ''
      if (!objective) { objectiveEl.style.borderColor = '#ef4444'; hasError = true }
      else { objectiveEl.style.borderColor = '' }

      // Coletar responsaveis com telefone
      var responsibles = []
      overlay.querySelectorAll('.nq-staff-cb:checked').forEach(function(cb) {
        var sId = cb.getAttribute('data-staff-id')
        var phoneInput = overlay.querySelector('.nq-staff-phone[data-staff-id="' + sId + '"]')
        responsibles.push({
          id:    sId,
          name:  cb.getAttribute('data-staff-name'),
          role:  cb.getAttribute('data-staff-role'),
          phone: phoneInput ? phoneInput.value.replace(/\D/g, '') : '',
        })
      })

      // Validar responsaveis
      var staffError = overlay.querySelector('#qa-nq-staff-error')
      if (responsibles.length === 0) {
        if (staffError) staffError.style.display = 'block'
        hasError = true
      } else {
        if (staffError) staffError.style.display = 'none'
      }

      if (hasError) return

      var kanbanEl = overlay.querySelector('#qa-nq-kanban')

      // Auto-gerar whatsapp_numbers dos responsáveis
      var phones = responsibles.map(function(r) { return r.phone }).filter(function(p) { return p.length >= 10 })

      var schema = _defaultSchema()
      schema.meta.objective = objective
      schema.meta.responsibles = responsibles
      schema.notifications.whatsapp_numbers = phones.join(', ')

      var btn = overlay.querySelector('#qa-nq-create')
      btn.disabled = true
      btn.textContent = 'Criando...'

      try {
        var baseSlug = _slugify(title)
        var finalSlug = baseSlug
        var suffix = 2
        while (_quizzes.some(function(qz) { return qz.slug === finalSlug })) {
          finalSlug = baseSlug + '-' + suffix
          suffix++
        }
        var res = await _repo().createTemplate(_clinicId, {
          slug:          finalSlug,
          title:         title,
          kanban_target: kanbanEl ? kanbanEl.value : (_contextFilter || 'kanban-fullface'),
          pipeline:      'evolution',
          schema:        schema,
        })
        if (!res.ok) throw new Error(res.error)
        _quizzes.unshift(res.data)
        overlay.remove()
        if (window.QAList) QAList.render()
        _selectQuiz(0)
      } catch (err) {
        btn.disabled = false
        btn.textContent = 'Criar Quiz'
        _toastErr('Erro ao criar quiz: ' + (err.message || err))
      }
    }
  }

  // ── Staff cache (para seletor de responsáveis) ──────────────────────────────
  var _staffCache = null
  async function _loadStaff() {
    if (_staffCache) return _staffCache
    try {
      // Fonte primaria: professional_profiles (tem telefone, whatsapp, etc.)
      if (window.ProfessionalsRepository) {
        var res = await ProfessionalsRepository.getAll()
        if (res.ok && res.data && res.data.length > 0) {
          _staffCache = res.data
            .filter(function(p) { return p.is_active !== false && p.display_name })
            .map(function(p) {
              return {
                id:         p.id,
                user_id:    p.user_id || p.id,
                first_name: (p.display_name || '').split(' ')[0],
                last_name:  (p.display_name || '').split(' ').slice(1).join(' '),
                email:      p.email || '',
                role:       p.nivel || p.cargo || 'therapist',
                is_active:  true,
                phone:      (p.whatsapp || p.telefone || '').replace(/\D/g, ''),
                display_name: p.display_name,
              }
            })
          return _staffCache
        }
      }
      // Fallback: UsersRepository (sem telefone)
      if (window.UsersRepository) {
        var res2 = await UsersRepository.getStaff()
        _staffCache = res2.ok ? res2.data : []
      } else {
        _staffCache = []
      }
    } catch (e) { _staffCache = [] }
    return _staffCache
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  function render() {
    var root = document.getElementById(_contextRootId)
    if (!root) return

    if (window.QAStyles) QAStyles.inject()

    root.innerHTML =
      '<div class="qa-topbar">' +
        '<span class="qa-topbar-title">Quizzes de Captação</span>' +
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
            '<div style="display:flex;align-items:center;gap:6px">' +
              '<div id="qa-save-area"></div>' +
              '<button class="qa-save-btn" id="qa-save-btn" style="display:none">Salvar</button>' +
              '<button class="qa-icon-btn" id="qa-preview-open" title="Abrir no celular">' + ICON.smartphone + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="qa-preview-wrap" id="qa-preview-wrap">' +
            '<div class="qa-phone-frame"><div class="qa-phone-screen" id="qa-phone-screen"><div style="padding:30px 16px;text-align:center;color:#9ca3af;font-size:12px">Selecione um quiz</div></div></div>' +
          '</div>' +
        '</div>' +
      '</div>'

    _bindTopbarEvents()
    if (window.QAList) QAList.render()
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

  // ── Editor ───────────────────────────────────────────────────────────────────
  function _renderEditor() {
    var area = document.getElementById('qa-editor-area')
    if (!area || !_activeQuiz) return

    area.innerHTML =
      '<div class="qa-editor-topbar">' +
        '<div class="qa-editor-tabs">' +
          ['config','questions','thankyou','analytics','alerts'].map(function(t) {
            var labels = { config: 'Configuracoes', questions: 'Perguntas', thankyou: 'Tela Final', analytics: 'Estatisticas', alerts: 'Alertas' }
            if (t === 'alerts') {
              return '<button class="qa-editor-tab' + (t === _activeTab ? ' active' : '') + '" data-tab="' + t + '" style="position:relative">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>' +
                labels[t] +
                '<span class="qa-alert-badge" id="qa-alerts-badge"></span>' +
              '</button>'
            }
            return '<button class="qa-editor-tab' + (t === _activeTab ? ' active' : '') + '" data-tab="' + t + '">' + labels[t] + '</button>'
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="qa-editor-content" id="qa-editor-content">' +
        _buildTabContent(_activeTab) +
      '</div>'

    area.querySelectorAll('.qa-editor-tab').forEach(function(btn) {
      btn.onclick = function() {
        _activeTab = btn.getAttribute('data-tab')
        area.querySelectorAll('.qa-editor-tab').forEach(function(b) { b.classList.remove('active') })
        btn.classList.add('active')
        var content = document.getElementById('qa-editor-content')
        if (content) content.innerHTML = _buildTabContent(_activeTab)
        _bindTabEvents(_activeTab)
        if (_activeTab === 'questions' && window.QAQuestions) QAQuestions.renderList()
        _togglePreviewPanel(_activeTab)
        if (window.QAPreview) QAPreview.render()
      }
    })

    _bindTabEvents(_activeTab)
    if (_activeTab === 'questions' && window.QAQuestions) QAQuestions.renderList()
    _togglePreviewPanel(_activeTab)
  }

  function _togglePreviewPanel(tab) {
    var colRight = document.getElementById('qa-col-right')
    var colCenter = document.getElementById('qa-col-center')
    if (!colRight) return
    if (tab === 'analytics' || tab === 'alerts') {
      colRight.style.display = 'none'
      if (colCenter) colCenter.style.marginRight = '0'
    } else {
      colRight.style.display = ''
      if (colCenter) colCenter.style.marginRight = '310px'
    }
  }

  function _buildTabContent(tab) {
    if (tab === 'config'     && window.QAEditor)    return QAEditor.buildConfigTab()
    if (tab === 'questions'  && window.QAQuestions)  return QAQuestions.buildTab()
    if (tab === 'appearance' && window.QAEditor)    return QAEditor.buildAppearanceTab()
    if (tab === 'thankyou'   && window.QAEditor)    return QAEditor.buildThankyouTab()
    if (tab === 'analytics'  && window.QAAnalytics) return QAAnalytics.buildTab()
    if (tab === 'alerts'     && window.QAAlerts)    return QAAlerts.buildTab()
    return ''
  }

  function _bindTabEvents(tab) {
    if (tab === 'config'     && window.QAEditor)    QAEditor.bindConfigEvents()
    if (tab === 'appearance' && window.QAEditor)    QAEditor.bindAppearanceEvents()
    if (tab === 'thankyou'   && window.QAEditor)    QAEditor.bindThankyouEvents()
    if (tab === 'analytics'  && window.QAAnalytics) QAAnalytics.bindEvents()
    if (tab === 'alerts'     && window.QAAlerts)    QAAlerts.bindEvents()
  }

  // ── Shared object ────────────────────────────────────────────────────────────
  window.QA = {
    // State accessors
    quiz: function() { return _activeQuiz },
    quizzes: function() { return _quizzes },
    qIdx: function() { return _activeQIdx },
    setQIdx: function(v) { _activeQIdx = v },
    clinicId: function() { return _clinicId },
    tab: function() { return _activeTab },
    dirty: function() { return _dirty },
    contextRootId: function() { return _contextRootId },
    // Shared functions
    esc: _esc,
    repo: _repo,
    slugify: _slugify,
    deepClone: _deepClone,
    resolveImgUrl: _resolveImgUrl,
    resolveVideoEmbed: _resolveVideoEmbedAdmin,
    markDirty: _markDirty,
    renderQuizList: function() { if (window.QAList) QAList.render() },
    renderPreview: function() { if (window.QAPreview) QAPreview.render() },
    renderEditor: _renderEditor,
    renderQList: function() { if (window.QAQuestions) QAQuestions.renderList() },
    selectQuiz: _selectQuiz,
    newQuiz: _newQuiz,
    saveQuiz: _saveQuiz,
    // Constants
    ICON: ICON,
    KANBAN_OPTIONS: KANBAN_OPTIONS,
    QUESTION_TYPES: QUESTION_TYPES,
    CONTACT_FIELD_TYPES: CONTACT_FIELD_TYPES,
    defaultSchema: _defaultSchema,
    defaultQuestion: _defaultQuestion,
    loadStaff: _loadStaff,
    resetStaffCache: function() { _staffCache = null },
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  var QuizAdmin = Object.freeze({
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
