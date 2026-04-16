/**
 * ClinicAI — Agenda Automations UI
 *
 * Pagina de configuracao de automacoes da agenda.
 * Baseada na estrutura de broadcast.ui.js.
 *
 * Layout: lista de regras (centro) + editor no painel lateral + preview WhatsApp
 *
 * Depende de:
 *   AgendaAutomationsService (agenda-automations.service.js)
 *   AgendaAutomationsRepository (agenda-automations.repository.js)
 */
;(function () {
  'use strict'
  if (window._clinicaiAgendaAutoUILoaded) return
  window._clinicaiAgendaAutoUILoaded = true

  var _esc = function(s) { return (s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  var _feather = function(n, s) { return window._clinicaiHelpers ? window._clinicaiHelpers.feather(n, s) : '' }

  // ── State ──────────────────────────────────────────────────
  var _rules = []
  var _loading = false
  var _saving = false
  var _selectedId = null
  var _editingRule = null // rule object being edited (null = new)
  var _form = _emptyForm()
  var _deleteConfirm = null
  var _funnelTab = 'agendamento'  // pre_agendamento | agendamento | paciente | orcamento | paciente_orcamento | perdido
  var _momentPill = 'all'         // all | pre | atend | pos
  var _isCreating = false          // mantido p/ compat — true quando modal aberto
  var _modalOpen = false           // true = overlay modal de criacao visivel
  var _speakingAlexa = false        // pulse animation no device quando falando

  // Preload voices do speechSynthesis (async em alguns browsers)
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    // Trigger load — em Chrome primeira chamada e async
    try { window.speechSynthesis.getVoices() } catch (e) {}
    window.speechSynthesis.onvoiceschanged = function () {
      // Voices carregadas; nada a fazer aqui, ja fica disponivel
    }
  }

  function _pickVoice(lang) {
    if (!('speechSynthesis' in window)) return null
    var voices = window.speechSynthesis.getVoices() || []
    var pref = voices.find(function (v) { return v.lang && v.lang.indexOf(lang) === 0 && /female|mulher|feminin/i.test(v.name) })
    if (pref) return pref
    var any = voices.find(function (v) { return v.lang && v.lang.indexOf(lang) === 0 })
    return any || null
  }

  function _speakAlexa(text) {
    if (!('speechSynthesis' in window)) {
      if (window._showToast) window._showToast('Navegador sem suporte', 'speechSynthesis nao disponivel', 'warning')
      return
    }
    window.speechSynthesis.cancel()
    var u = new SpeechSynthesisUtterance(text || '(mensagem vazia)')
    u.lang = 'pt-BR'
    u.rate = 0.95
    u.pitch = 1.0
    var voice = _pickVoice('pt')
    if (voice) u.voice = voice
    u.onstart = function () {
      _speakingAlexa = true
      var ring = document.querySelector('.aa-alexa-ring')
      if (ring) ring.classList.add('aa-alexa-speaking')
    }
    u.onend = u.onerror = function () {
      _speakingAlexa = false
      var ring = document.querySelector('.aa-alexa-ring')
      if (ring) ring.classList.remove('aa-alexa-speaking')
    }
    window.speechSynthesis.speak(u)
  }

  // Metadata das 6 categorias do funil (copiado do templates-editor)
  var FUNNEL_CATS = {
    pre_agendamento:    { label: 'Pre-agendamento',        color: '#7C3AED' },
    agendamento:        { label: 'Agendamento',            color: '#059669' },
    paciente:           { label: 'Paciente',               color: '#0891B2' },
    orcamento:          { label: 'Orcamento',              color: '#D97706' },
    paciente_orcamento: { label: 'Paciente + Orcamento',   color: '#2563EB' },
    perdido:            { label: 'Perdido',                color: '#9CA3AF' },
  }

  // Mapeia cada regra para categoria do funil (nivel 1)
  function _ruleFunnelCategory(rule) {
    var t = rule && rule.trigger_type
    var cfg = rule && rule.trigger_config || {}
    var tag = cfg.tag || ''
    var status = cfg.status || ''

    if (t === 'on_tag') {
      if (tag === 'lead_novo' || tag === 'lead_novo_fullface' || tag === 'lead_novo_olheiras') return 'pre_agendamento'
      if (tag === 'perdido') return 'perdido'
      if (tag === 'aguardando_retorno') return 'paciente'
      if (tag === 'encaixe') return 'agendamento'
      if (tag === 'orcamento-aberto' || tag === 'em_negociacao' || tag === 'orcamento_enviado') return 'orcamento'
      if (tag === 'orcamento_fechado' || tag === 'fechado') return 'paciente_orcamento'
      // on_tag nao mapeado → agendamento fallback
      return 'agendamento'
    }
    if (t === 'd_after' || t === 'on_finalize') return 'paciente'
    if (t === 'd_before' || t === 'd_zero' || t === 'min_before' || t === 'daily_summary') return 'agendamento'
    if (t === 'on_status') return 'agendamento'
    return 'agendamento'
  }

  // Mapeia categoria do funil para pill (nivel 2)
  function _catToMoment(cat) {
    if (cat === 'pre_agendamento' || cat === 'perdido') return 'pre'
    if (cat === 'agendamento') return 'atend'
    return 'pos'  // paciente, orcamento, paciente_orcamento
  }

  // Canais compostos mapeados para bucket (mantido para compat)
  var _MULTI_CHANNELS = {
    whatsapp_alert: 1, whatsapp_task: 1, whatsapp_alexa: 1,
    alert_task: 1, alert_alexa: 1, all: 1, both: 1,
  }

  function _emptyForm() {
    return {
      name: '',
      description: '',
      category: 'before',
      trigger_type: 'd_before',
      trigger_config: { days: 1, hour: 10, minute: 0 },
      recipient_type: 'patient',
      channel: 'whatsapp',
      content_template: '',
      attachment_url: '',
      alert_title: '',
      alert_type: 'info',
      task_title: '',
      task_assignee: 'sdr',
      task_priority: 'normal',
      task_deadline_hours: 24,
      alexa_message: '',
      alexa_target: 'sala',
      is_active: true,
      sort_order: 0,
    }
  }

  // Preview debounce timer
  var _previewTimer = null
  function _schedulePreviewUpdate() {
    if (_previewTimer) clearTimeout(_previewTimer)
    _previewTimer = setTimeout(function () {
      _refreshPreview()
    }, 100)
  }

  function _refreshPreview() {
    var prev = document.getElementById('aaPhonePreview')
    if (!prev) return
    var vars = _sampleVars()
    var rendered = _svc().renderTemplate(_form.content_template, vars)
    prev.outerHTML = _renderPhonePreview(rendered, _form.attachment_url, _form.attachment_above_text !== false)
  }

  function _sampleVars() {
    var svc = _svc()
    var vars = {}
    ;(svc.TEMPLATE_VARS || []).forEach(function (v) {
      vars[v.id] = v.example || ''
    })
    return vars
  }

  var _svc = function() { return window.AgendaAutomationsService }

  function _channelIncludes(channel, type) {
    if (!channel) return false
    if (channel === type) return true
    if (channel === 'both') return type === 'whatsapp' || type === 'alert'
    if (channel === 'all') return true
    if (channel === 'whatsapp_alert') return type === 'whatsapp' || type === 'alert'
    if (channel === 'whatsapp_task') return type === 'whatsapp' || type === 'task'
    if (channel === 'whatsapp_alexa') return type === 'whatsapp' || type === 'alexa'
    if (channel === 'alert_task') return type === 'alert' || type === 'task'
    if (channel === 'alert_alexa') return type === 'alert' || type === 'alexa'
    return false
  }

  // ── Status & Trigger labels ────────────────────────────────
  var STATUS_OPTIONS = [
    { id:'agendado', label:'Agendado' },
    { id:'aguardando_confirmacao', label:'Aguard. Confirmacao' },
    { id:'confirmado', label:'Confirmado' },
    { id:'aguardando', label:'Aguardando' },
    { id:'na_clinica', label:'Na Clinica' },
    { id:'em_consulta', label:'Em Consulta' },
    { id:'finalizado', label:'Finalizado' },
    { id:'remarcado', label:'Remarcado' },
    { id:'cancelado', label:'Cancelado' },
    { id:'no_show', label:'No-show' },
  ]

  var CATEGORY_COLORS = { captacao:'#6366F1', before:'#3B82F6', during:'#7C3AED', after:'#10B981', pos:'#0891B2', orcamento:'#F59E0B' }
  var CATEGORY_LABELS = { captacao:'Captacao', before:'Antes', during:'Durante', after:'Depois', pos:'Pos', orcamento:'Orcamento' }
  var CHANNEL_ICONS   = { whatsapp:'messageCircle', alert:'bell', task:'clipboard', alexa:'speaker', whatsapp_alert:'radio', whatsapp_task:'radio', whatsapp_alexa:'radio', alert_task:'radio', alert_alexa:'radio', all:'radio', both:'radio' }
  var CHANNEL_LABELS  = { whatsapp:'WhatsApp', alert:'Alerta', task:'Tarefa', alexa:'Alexa', whatsapp_alert:'WA+Alerta', whatsapp_task:'WA+Tarefa', whatsapp_alexa:'WA+Alexa', alert_task:'Alerta+Tarefa', alert_alexa:'Alerta+Alexa', all:'Todos', both:'WA+Alerta' }
  var RECIPIENT_ICONS = { patient:'user', professional:'briefcase', both:'users' }

  // ── Load ───────────────────────────────────────────────────
  async function _load() {
    _loading = true; _render()
    _rules = await _svc().loadAll()
    _loading = false; _render()
  }

  // ── Main render ────────────────────────────────────────────
  var _root = null

  function render(rootId) {
    var el = document.getElementById(rootId || 'agenda-automations-root')
    if (!el) return
    // Se o root mudou (primeira vez ou re-init), rebinda eventos
    if (_root !== el) {
      _root = el
      _bindEvents(_root)
    }
    _root.innerHTML = _renderPage()
  }

  function _render() { render() }

  function _renderPage() {
    if (_loading) {
      return '<div class="aa-page">'
        + _renderTopHeader()
        + '<div class="aa-loading">Carregando automacoes...</div>'
        + '</div>'
    }

    return '<div class="aa-page">'
      + _renderTopHeader()
      + _renderChannelTabs()
      + _renderMomentPills()
      + '<div class="aa-grid">'
      +   '<div class="aa-col-list">' + _renderRulesList() + '</div>'
      +   '<div class="aa-col-editor">' + _renderEditorColumn() + '</div>'
      +   '<div class="aa-col-preview">' + _renderPreviewColumn() + '</div>'
      + '</div>'
      + (_modalOpen ? _renderCreateModal() : '')
      + '</div>'
  }

  // ── Modal de criacao de nova regra ─────────────────────────
  // Grid 2 col: editor (esquerda) + preview live (direita). Em <900px colapsa.
  function _renderCreateModal() {
    return '<div class="aa-modal-overlay" data-action="modal-backdrop">'
      +   '<div class="aa-modal aa-modal-wide" role="dialog" aria-modal="true">'
      +     '<div class="aa-modal-header">'
      +       '<div class="aa-modal-title">' + _feather('plus', 16) + ' Nova automacao</div>'
      +       '<button type="button" class="aa-btn-icon" data-action="modal-close" title="Fechar">' + _feather('x', 16) + '</button>'
      +     '</div>'
      +     '<div class="aa-modal-body aa-modal-body-split">'
      +       '<div class="aa-modal-editor">' + _renderEditor() + '</div>'
      +       '<div class="aa-modal-preview">' + _renderLivePreview(_form) + '</div>'
      +     '</div>'
      +     '<div class="aa-modal-footer">'
      +       '<button type="button" class="aa-btn aa-btn-cancel" data-action="modal-close">Cancelar</button>'
      +       '<button type="button" class="aa-btn aa-btn-save" data-action="save">' + (_saving ? 'Salvando...' : 'Criar automacao') + '</button>'
      +     '</div>'
      +   '</div>'
      + '</div>'
  }

  function _renderTopHeader() {
    var total = _rules.length
    var active = _rules.filter(function (r) { return r.is_active }).length
    return '<div class="aa-top">'
      +   '<div class="aa-top-left">'
      +     '<div class="aa-title">Automacoes da Agenda</div>'
      +     '<div class="aa-subtitle">' + active + ' de ' + total + ' regras ativas</div>'
      +   '</div>'
      +   '<button type="button" class="aa-btn-new" data-action="new">' + _feather('plus', 14) + ' Nova automacao</button>'
      + '</div>'
  }

  // ── Nivel 1: tabs por CATEGORIA DO FUNIL (padrao Templates) ──
  function _renderChannelTabs() {
    var cats = Object.keys(FUNNEL_CATS)
    var html = cats.map(function (cid) {
      var meta = FUNNEL_CATS[cid]
      var ruleList = _rules.filter(function (r) { return _ruleFunnelCategory(r) === cid })
      var total = ruleList.length
      var active = _funnelTab === cid ? ' te-tab-active' : ''

      // Badge extra só para 'agendamento' (imitando o N:x R:x O:x do Templates)
      var subDetail = ''
      if (cid === 'agendamento' && total > 0) {
        var n = ruleList.filter(function(r){ return (r.trigger_config && r.trigger_config.tag === 'lead_novo_fullface') || (r.trigger_config && r.trigger_config.status === 'agendado') }).length
        var r0 = ruleList.filter(function(r){ return r.trigger_config && r.trigger_config.status === 'remarcado' }).length
        var o0 = total - n - r0
        subDetail = ' <span class="te-tab-sub">(N:' + n + ' R:' + r0 + ' O:' + (o0 > 0 ? o0 : 0) + ')</span>'
      }

      return '<button type="button" class="te-tab' + active + '" data-action="tab" data-tab="' + cid + '">'
        + meta.label
        + ' <span class="te-tab-count">' + total + '</span>'
        + subDetail
        + '</button>'
    }).join('')
    return '<div class="te-tabs">' + html + '</div>'
  }

  // ── Nivel 2: pills PRE / ATENDIMENTO / POS ─────────────────
  function _renderMomentPills() {
    var pills = [
      { id: 'all',   label: 'TODAS' },
      { id: 'pre',   label: 'PRE-ATENDIMENTO' },
      { id: 'atend', label: 'ATENDIMENTO' },
      { id: 'pos',   label: 'POS-ATENDIMENTO' },
    ]
    var rulesInTab = _rulesInCurrentFunnel()
    var html = pills.map(function (p) {
      var count = p.id === 'all' ? rulesInTab.length
        : rulesInTab.filter(function (r) { return _catToMoment(_ruleFunnelCategory(r)) === p.id }).length
      var active = _momentPill === p.id ? ' aa-mom-pill-active' : ''
      return '<button type="button" class="aa-mom-pill' + active + '" data-moment="' + p.id + '">'
        + p.label + ' <span class="aa-mom-count">' + count + '</span></button>'
    }).join('')
    return '<div class="aa-mom-pills">' + html + '</div>'
  }

  function _rulesInCurrentFunnel() {
    return _rules.filter(function (r) { return _ruleFunnelCategory(r) === _funnelTab })
  }

  function _filteredRules() {
    var list = _rulesInCurrentFunnel()
    if (_momentPill !== 'all') {
      list = list.filter(function (r) { return _catToMoment(_ruleFunnelCategory(r)) === _momentPill })
    }
    // Ordena igual Templates: por minutos totais (day + delay_hours + delay_minutes)
    list.sort(function (a, b) {
      var cfgA = a.trigger_config || {}
      var cfgB = b.trigger_config || {}
      var ma = ((parseInt(cfgA.delay_days) || 0) * 1440) + ((parseInt(cfgA.delay_hours) || cfgA.hour || 0) * 60) + (parseInt(cfgA.delay_minutes) || cfgA.minute || 0)
      var mb = ((parseInt(cfgB.delay_days) || 0) * 1440) + ((parseInt(cfgB.delay_hours) || cfgB.hour || 0) * 60) + (parseInt(cfgB.delay_minutes) || cfgB.minute || 0)
      return ma - mb
    })
    return list
  }

  // ── Coluna 1: lista de regras ──────────────────────────────
  function _renderRulesList() {
    var rules = _filteredRules()
    if (!rules.length) {
      return '<div class="aa-list-empty">'
        + 'Nenhuma regra neste canal/momento.<br>Clique em <b>+ Nova automacao</b> para criar.'
        + '</div>'
    }
    var html = '<div class="aa-list">'
    rules.forEach(function (r, idx) {
      html += _renderRuleCard(r, idx + 1)
    })
    html += '</div>'
    return html
  }

  function _renderRuleCard(r, num) {
    var sel = _selectedId === r.id ? ' aa-card-selected' : ''
    var inactive = r.is_active ? '' : ' aa-card-inactive'

    // Delete confirmation (mostrado no card)
    if (_deleteConfirm === r.id) {
      return '<div class="aa-card aa-card-delete">'
        + '<div style="font-size:12px;font-weight:600;color:#DC2626;margin-bottom:8px">Excluir "' + _esc(r.name) + '"?</div>'
        + '<div style="display:flex;gap:6px">'
        + '<button type="button" class="aa-btn-sm aa-btn-danger" data-confirm-delete="' + r.id + '">Excluir</button>'
        + '<button type="button" class="aa-btn-sm" data-cancel-delete>Cancelar</button>'
        + '</div></div>'
    }

    var statusLabel = r.is_active ? 'ON' : 'OFF'
    var statusClass = r.is_active ? 'aa-card-status-on' : 'aa-card-status-off'
    var subLabel = _triggerLabel(r)

    return '<div class="aa-card' + sel + inactive + '" data-select="' + r.id + '">'
      + '<div class="aa-card-num">' + num + '</div>'
      + '<div class="aa-card-body">'
      +   '<div class="aa-card-name">' + _esc(r.name) + '</div>'
      +   '<div class="aa-card-sub">' + _esc(subLabel) + '</div>'
      + '</div>'
      + '<div class="aa-card-status ' + statusClass + '">' + statusLabel + '</div>'
      + '</div>'
  }

  // ── Coluna 2: editor ───────────────────────────────────────
  // Simplificado: sem regra selecionada = estado vazio; com regra = edicao direta.
  // Criacao de nova regra acontece em modal (veja _renderCreateModal).
  function _renderEditorColumn() {
    if (!_selectedId) return _renderEditorEmpty()

    var r = _rules.find(function (x) { return x.id === _selectedId })
    if (!r) return _renderEditorEmpty()

    // Carrega form com a regra selecionada (para render do _renderEditor)
    // Se o usuario ainda nao editou nada, _form e' a regra. Se editou, _form mantem alteracoes locais.
    if (!_editingRule || _editingRule.id !== r.id) {
      _editingRule = r
      _form = {
        name: r.name, description: r.description||'', category: r.category,
        trigger_type: r.trigger_type, trigger_config: r.trigger_config||{},
        recipient_type: r.recipient_type, channel: r.channel,
        content_template: r.content_template||'', attachment_url: r.attachment_url||'',
        attachment_above_text: r.attachment_above_text !== false,
        alert_title: r.alert_title||'',
        alert_type: r.alert_type||'info', task_title: r.task_title||'',
        task_assignee: r.task_assignee||'sdr', task_priority: r.task_priority||'normal',
        task_deadline_hours: r.task_deadline_hours||24, alexa_message: r.alexa_message||'',
        alexa_target: r.alexa_target||'sala', is_active: r.is_active, sort_order: r.sort_order||0,
      }
    }

    return _renderEditorHeader(r)
      + '<div class="aa-editor-body">' + _renderEditor() + '</div>'
      + _renderEditorFooter(r)
  }

  function _renderEditorEmpty() {
    return '<div class="aa-editor-header">'
      +   '<div class="aa-editor-title">' + _feather('edit3', 16) + '<span>Editor</span></div>'
      + '</div>'
      + '<div class="aa-editor-body"><div class="aa-empty-col">'
      +   _feather('mousePointer', 24)
      +   '<br>Selecione uma regra na lista para editar'
      +   '<br>ou clique em <b>+ Nova automacao</b> para criar.'
      + '</div></div>'
  }

  // Header do editor — mostra nome + toggle ativo + botao excluir
  function _renderEditorHeader(r) {
    var title = _esc((r && r.name) || 'Editar regra')
    return '<div class="aa-editor-header">'
      +   '<div class="aa-editor-title">' + _feather('edit3', 16) + '<span class="aa-editor-title-text">' + title + '</span></div>'
      +   '<div style="display:flex;gap:8px;align-items:center">'
      +     (r ? '<label class="aa-switch" title="Ativar/desativar"><input type="checkbox" ' + (r.is_active?'checked':'') + ' data-toggle="' + r.id + '"><span class="aa-slider"></span></label>' : '')
      +   '</div>'
      + '</div>'
  }

  function _renderReadOnlyBody(r) {
    var vars = _sampleVars()
    var html = '<div class="aa-field">'
      + '<label>Descricao</label>'
      + '<div style="font-size:13px;color:var(--text-secondary);padding:4px 0">' + _esc(r.description || '—') + '</div>'
      + '</div>'
      + '<div class="aa-field"><label>Gatilho</label>'
      + '<div style="font-size:13px;color:var(--text-primary);font-weight:600">' + _esc(_triggerLabel(r)) + '</div>'
      + '</div>'
      + '<div class="aa-field"><label>Canal</label>'
      + '<div style="font-size:13px">' + (CHANNEL_LABELS[r.channel] || r.channel) + '</div>'
      + '</div>'

    if (_channelIncludes(r.channel, 'whatsapp') && r.content_template) {
      html += '<div class="aa-field"><label>Mensagem</label>'
        + '<div style="font-size:13px;white-space:pre-wrap;background:var(--bg-secondary);padding:10px;border-radius:8px;line-height:1.5">'
        + _esc(r.content_template) + '</div></div>'
    }
    if (_channelIncludes(r.channel, 'alexa') && r.alexa_message) {
      html += '<div class="aa-field"><label>Mensagem Alexa (device: ' + (r.alexa_target || 'sala') + ')</label>'
        + '<div style="font-size:13px;color:#0E7490;font-style:italic;padding:8px;background:#ECFEFF;border-radius:8px">"' + _esc(r.alexa_message) + '"</div>'
        + '</div>'
    }
    if (_channelIncludes(r.channel, 'task') && r.task_title) {
      var pColor = { urgente:'#DC2626', alta:'#F59E0B', normal:'#3B82F6', baixa:'#6B7280' }[r.task_priority] || '#3B82F6'
      html += '<div class="aa-field"><label>Tarefa</label>'
        + '<div style="font-size:13px;padding:8px;border-left:3px solid ' + pColor + ';background:' + pColor + '08;border-radius:0 8px 8px 0">'
        + _esc(r.task_title) + ' — ' + (r.task_assignee||'sdr') + ' / ' + (r.task_priority||'normal') + ' / ' + (r.task_deadline_hours||24) + 'h'
        + '</div></div>'
    }
    if (_channelIncludes(r.channel, 'alert') && r.alert_title) {
      html += '<div class="aa-field"><label>Alerta</label>'
        + '<div style="font-size:13px">' + _esc(r.alert_title) + ' (' + (r.alert_type||'info') + ')</div>'
        + '</div>'
    }
    return html
  }

  // ── Coluna 3: preview ──────────────────────────────────────
  function _renderPreviewColumn() {
    // Quando modal esta aberto, preview fica DENTRO do modal — oculta a coluna 3
    if (_modalOpen) {
      return '<div class="aa-col-preview-empty">'
        + _feather('smartphone', 28)
        + '<br>Preview disponivel no modal'
        + '</div>'
    }
    var isEditing = _isCreating || !!_editingRule

    // Modo edicao: preview do _form em tempo real
    if (isEditing) {
      return _renderLivePreview(_form)
    }

    // Modo visualizacao: preview da regra selecionada
    if (_selectedId) {
      var r = _rules.find(function (x) { return x.id === _selectedId })
      if (r) return _renderLivePreview(r)
    }

    return '<div class="aa-col-preview-empty">'
      + _feather('smartphone', 28)
      + '<br>Preview aparece aqui'
      + '<br>ao selecionar ou criar uma regra'
      + '</div>'
  }

  // Router de preview por canal — adaptativo
  function _renderLivePreview(rule) {
    var vars = _sampleVars()
    var html = ''

    if (_channelIncludes(rule.channel, 'whatsapp')) {
      var txt = _svc().renderTemplate(rule.content_template || '', vars)
      html += _renderPhonePreview(txt, rule.attachment_url, rule.attachment_above_text !== false)
    }

    if (_channelIncludes(rule.channel, 'alexa')) {
      html += _renderAlexaPreview(rule, vars)
    }

    if (_channelIncludes(rule.channel, 'task')) {
      html += _renderTaskCardPreview(rule, vars)
    }

    if (_channelIncludes(rule.channel, 'alert')) {
      html += _renderAlertPreviewLive(rule, vars)
    }

    if (!html) html = '<div class="aa-col-preview-empty">Preview vazio — escolha um canal e preencha a mensagem.</div>'
    return html
  }

  // ── Preview Alexa (Echo Dot + reproduzir voz) ───────────────
  function _renderAlexaPreview(rule, vars) {
    var msg = _svc().renderTemplate(rule.alexa_message || '', vars)
    var targetLabel = rule.alexa_target === 'recepcao' ? 'Recepcao'
      : rule.alexa_target === 'todos' ? 'Todos'
      : rule.alexa_target === 'profissional' ? 'Profissional' : 'Sala'

    var deviceSvg = '<svg viewBox="0 0 100 100" width="100" height="100">'
      +   '<defs><radialGradient id="aaDotGrad" cx="50%" cy="50%" r="50%">'
      +     '<stop offset="0%" stop-color="#0EA5E9"/><stop offset="100%" stop-color="#0369A1"/>'
      +   '</radialGradient></defs>'
      +   '<circle cx="50" cy="50" r="46" fill="#1E293B"/>'
      +   '<circle cx="50" cy="50" r="40" fill="none" stroke="url(#aaDotGrad)" stroke-width="4" class="aa-alexa-ring"/>'
      +   '<circle cx="50" cy="50" r="6" fill="#0EA5E9"/>'
      + '</svg>'

    return '<div class="aa-alexa-preview">'
      +   '<div class="aa-alexa-header">'
      +     '<div class="aa-alexa-title">' + _feather('speaker', 14) + ' Alexa · ' + _esc(targetLabel) + '</div>'
      +   '</div>'
      +   '<div class="aa-alexa-device">' + deviceSvg + '</div>'
      +   '<div class="aa-alexa-msg">"' + _esc(msg || '(sem mensagem — preencha acima)') + '"</div>'
      +   '<button type="button" class="aa-alexa-play-btn" data-action="speak-alexa" title="Reproduzir via voz do navegador">'
      +     _feather('play', 12) + ' Reproduzir voz'
      +   '</button>'
      + '</div>'
  }

  // ── Preview Alerta (card + botao simular) ───────────────────
  function _renderAlertPreviewLive(rule, vars) {
    var typeMap = {
      info:    { color: '#3B82F6', bg: '#EFF6FF', icon: 'info',           label: 'Info' },
      warning: { color: '#F59E0B', bg: '#FEF3C7', icon: 'alertTriangle',  label: 'Aviso' },
      success: { color: '#10B981', bg: '#D1FAE5', icon: 'checkCircle',    label: 'Sucesso' },
      error:   { color: '#DC2626', bg: '#FEE2E2', icon: 'alertCircle',    label: 'Erro' },
    }
    var t = typeMap[rule.alert_type] || typeMap.info
    var title = _svc().renderTemplate(rule.alert_title || '', vars)

    return '<div class="aa-alert-preview" style="--ac:' + t.color + ';background:' + t.bg + ';border-color:' + t.color + '">'
      +   '<div class="aa-alert-preview-header">'
      +     '<div class="aa-alert-preview-title">' + _feather(t.icon, 16) + ' Alerta ' + t.label + '</div>'
      +   '</div>'
      +   '<div class="aa-alert-preview-body">' + _esc(title || '(sem titulo — preencha acima)') + '</div>'
      +   '<button type="button" class="aa-alert-sim-btn" data-action="simulate-alert" title="Disparar o toast ao vivo por 3s">'
      +     _feather('zap', 12) + ' Simular alerta'
      +   '</button>'
      + '</div>'
  }

  // ── Preview Tarefa (card estilo dashboard) ─────────────────
  function _renderTaskCardPreview(rule, vars) {
    var pri = rule.task_priority || 'normal'
    var pColor = { urgente:'#DC2626', alta:'#F59E0B', normal:'#3B82F6', baixa:'#6B7280' }[pri] || '#3B82F6'
    var pLabel = { urgente:'URGENTE', alta:'ALTA', normal:'NORMAL', baixa:'BAIXA' }[pri] || 'NORMAL'
    var assignee = rule.task_assignee || 'sdr'
    var aLabel = { sdr:'SDR / Comercial', secretaria:'Secretaria', cs:'CS / Pos-venda', clinica:'Equipe Clinica', gestao:'Gestao' }[assignee] || assignee
    var title = _svc().renderTemplate(rule.task_title || '', vars)
    var deadline = rule.task_deadline_hours || 24
    var prazoLabel = deadline < 24 ? deadline + 'h'
      : deadline === 24 ? '1 dia'
      : deadline < 168 ? Math.round(deadline / 24) + ' dias'
      : Math.round(deadline / 168) + ' sem'

    return '<div class="aa-task-card-preview" style="border-left-color:' + pColor + '">'
      +   '<div class="aa-task-card-header">'
      +     _feather('clipboard', 14)
      +     '<span class="aa-task-card-pri" style="background:' + pColor + '20;color:' + pColor + '">' + pLabel + '</span>'
      +   '</div>'
      +   '<div class="aa-task-card-title">' + _esc(title || '(sem titulo — preencha acima)') + '</div>'
      +   '<div class="aa-task-card-meta">'
      +     '<span>' + _feather('user', 11) + ' ' + _esc(aLabel) + '</span>'
      +     '<span>' + _feather('clock', 11) + ' Prazo ' + prazoLabel + '</span>'
      +   '</div>'
      + '</div>'
  }

  // Compat: antigos nomes esperados por linkage (caso existam chamadas leg)
  function _renderCenterPanel() { return '' }
  function _renderSlidePanel()  { return '' }
  function _renderPreviewSelected() { return _renderPreviewColumn() }

  function _triggerLabel(r) {
    var cfg = r.trigger_config || {}
    switch (r.trigger_type) {
      case 'd_before':      return 'D-' + (cfg.days||1) + ' as ' + _fmtTime(cfg)
      case 'd_zero':        return 'Mesmo dia ' + _fmtTime(cfg)
      case 'min_before':    return (cfg.minutes||30) + ' min antes'
      case 'on_status':     return 'Status: ' + (cfg.status||'—')
      case 'on_tag':        return 'Tag: ' + (cfg.tag||'—')
      case 'on_finalize':   return 'Ao finalizar'
      case 'd_after':       return 'D+' + (cfg.days||1) + ' as ' + _fmtTime(cfg)
      case 'daily_summary': return 'Diario ' + _fmtTime(cfg)
      default: return r.trigger_type
    }
  }

  function _fmtTime(cfg) {
    return String(cfg.hour||8).padStart(2,'0') + ':' + String(cfg.minute||0).padStart(2,'0')
  }

  function _delayHintText(cfg) {
    var d = parseInt(cfg && cfg.delay_days) || 0
    var h = parseInt(cfg && cfg.delay_hours) || 0
    var m = parseInt(cfg && cfg.delay_minutes) || 0
    if (!d && !h && !m) return 'Dispara imediatamente quando a tag for aplicada.'
    var parts = []
    if (d) parts.push(d + (d === 1 ? ' dia' : ' dias'))
    if (h) parts.push(h + (h === 1 ? ' hora' : ' horas'))
    if (m) parts.push(m + (m === 1 ? ' minuto' : ' minutos'))
    return 'Dispara ' + parts.join(' e ') + ' apos a tag ser aplicada.'
  }

  // ── Phone Preview (WhatsApp mockup — classes .bc-* do Templates) ────
  function _renderPhonePreview(text, imageUrl, imageAbove) {
    var formatted = _waFormat(text)
    formatted = formatted.replace(/\{\{([^}]+)\}\}/g, '<span class="bc-wa-tag">{{$1}}</span>')

    var now = new Date()
    var hhmm = (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes()
    var tick = '<svg width="14" height="8" viewBox="0 0 16 8" fill="none" stroke="#53bdeb" stroke-width="1.5"><polyline points="1 4 4 7 9 2"/><polyline points="5 4 8 7 13 2"/></svg>'

    var imgBubble = imageUrl
      ? '<div class="bc-wa-bubble bc-wa-img-bubble"><img class="bc-wa-preview-img" src="' + _esc(imageUrl) + '" alt="media"></div>'
      : ''
    var textBubble = formatted
      ? '<div class="bc-wa-bubble"><div class="bc-wa-bubble-text">' + formatted + '</div><div class="bc-wa-bubble-time">' + hhmm + ' ' + tick + '</div></div>'
      : ''

    var above = imageAbove !== false // default true
    var chatContent = above ? (imgBubble + textBubble) : (textBubble + imgBubble)
    if (!chatContent) chatContent = '<div class="bc-wa-empty">Escreva a mensagem ao lado</div>'

    return '<div class="bc-phone" id="aaPhonePreview">'
      + '<div class="bc-phone-notch"><span class="bc-phone-notch-time">' + hhmm + '</span></div>'
      + '<div class="bc-wa-header">'
      +   '<div class="bc-wa-avatar"><svg width="18" height="18" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'
      +   '<div><div class="bc-wa-name">Clinica Mirian de Paula</div><div class="bc-wa-status">online</div></div>'
      + '</div>'
      + '<div class="bc-wa-chat">' + chatContent + '</div>'
      + '<div class="bc-wa-bottom"><div class="bc-wa-input-mock">Mensagem</div><div class="bc-wa-send-mock"><svg width="16" height="16" fill="#fff" viewBox="0 0 24 24"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg></div></div>'
      + '<div class="bc-phone-home"></div>'
      + '</div>'
  }

  function _waFormat(text) {
    if (!text) return ''
    var s = _esc(text)
    s = s.replace(/\n/g, '<br>')
    s = s.replace(/\*([^*]+)\*/g, '<b>$1</b>')
    s = s.replace(/_([^_]+)_/g, '<i>$1</i>')
    s = s.replace(/~([^~]+)~/g, '<s>$1</s>')
    return s
  }

  // ── Combina array de canais em valor unico para persistir ─
  function _combineChannels(arr) {
    if (!arr || !arr.length) return ''
    if (arr.length === 1) return arr[0]
    if (arr.length >= 3) return 'all'
    var s = arr.slice().sort().join('_')
    var map = {
      'alert_whatsapp': 'whatsapp_alert',
      'alexa_whatsapp': 'whatsapp_alexa',
      'task_whatsapp':  'whatsapp_task',
      'alert_task':     'alert_task',
      'alert_alexa':    'alert_alexa',
      'alexa_task':     'all', // sem variante dedicada no schema
    }
    return map[s] || 'all'
  }

  // ── Editor (4 secoes top-down) ─────────────────────────────
  function _renderEditor() {
    return _renderSectionIdent()
      + _renderSectionWhen()
      + _renderSectionHow()
      + _renderSectionAdvanced()
  }

  // SECAO 1 — Identificacao
  function _renderSectionIdent() {
    var f = _form
    return '<div class="aa-form-section">'
      +   '<div class="aa-form-section-title">' + _feather('tag', 12) + ' Identificacao</div>'
      +   '<div class="aa-field"><label>Nome</label>'
      +     '<input type="text" id="aaName" value="' + _esc(f.name) + '" placeholder="Ex: Confirmacao D-1"></div>'
      +   '<div class="aa-field"><label>Descricao</label>'
      +     '<input type="text" id="aaDesc" value="' + _esc(f.description) + '" placeholder="Breve descricao (opcional)"></div>'
      + '</div>'
  }

  // SECAO 2 — Quando disparar
  function _renderSectionWhen() {
    var f = _form
    var svc = _svc()
    var triggerOpts = svc.TRIGGER_TYPES.map(function(t) {
      var sel = f.trigger_type === t.id ? ' selected' : ''
      return '<option value="' + t.id + '"' + sel + '>' + t.label + '</option>'
    }).join('')

    return '<div class="aa-form-section">'
      +   '<div class="aa-form-section-title">' + _feather('clock', 12) + ' Quando disparar</div>'
      +   '<div class="aa-field"><label>Gatilho</label>'
      +     '<select id="aaTrigger">' + triggerOpts + '</select></div>'
      +   '<div id="aaTriggerConfig">' + _renderTriggerConfig(f.trigger_type, f.trigger_config) + '</div>'
      + '</div>'
  }

  // SECAO 3 — Como avisa (canais + config por canal marcado)
  function _renderSectionHow() {
    var f = _form
    var channels = [
      { id: 'whatsapp', label: 'WhatsApp', icon: 'messageCircle' },
      { id: 'alexa',    label: 'Alexa',    icon: 'speaker' },
      { id: 'task',     label: 'Tarefa',   icon: 'clipboard' },
      { id: 'alert',    label: 'Alerta',   icon: 'bell' },
    ]
    var checks = channels.map(function(ch) {
      var checked = _channelIncludes(f.channel, ch.id) ? ' checked' : ''
      return '<label class="aa-channel-check"><input type="checkbox" name="aaChannelMulti" value="' + ch.id + '"' + checked + '>'
        + _feather(ch.icon, 14) + ' <span>' + ch.label + '</span></label>'
    }).join('')

    var html = '<div class="aa-form-section">'
      +   '<div class="aa-form-section-title">' + _feather('zap', 12) + ' Como avisar</div>'
      +   '<div class="aa-channel-checks">' + checks + '</div>'

    // Config por canal marcado (aparece empilhada)
    if (_channelIncludes(f.channel, 'whatsapp')) html += _renderChannelConfigWhatsapp(f)
    if (_channelIncludes(f.channel, 'alexa'))    html += _renderChannelConfigAlexa(f)
    if (_channelIncludes(f.channel, 'task'))     html += _renderChannelConfigTask(f)
    if (_channelIncludes(f.channel, 'alert'))    html += _renderChannelConfigAlert(f)

    html += '</div>'
    return html
  }

  // SECAO 4 — Avancado (destinatario + fase) colapsavel
  function _renderSectionAdvanced() {
    var f = _form
    var svc = _svc()

    var recipRadios = svc.RECIPIENT_TYPES.map(function(r) {
      var checked = f.recipient_type === r.id ? ' checked' : ''
      return '<label class="aa-radio"><input type="radio" name="aaRecipient" value="' + r.id + '"' + checked + '> '
        + _feather(RECIPIENT_ICONS[r.id], 12) + ' ' + r.label + '</label>'
    }).join('')

    var catRadios = svc.CATEGORIES.map(function(c) {
      var checked = f.category === c.id ? ' checked' : ''
      return '<label class="aa-radio" style="--ac:' + c.color + '"><input type="radio" name="aaCategory" value="' + c.id + '"' + checked + '> ' + c.label + '</label>'
    }).join('')

    return '<details class="aa-form-section aa-advanced">'
      +   '<summary class="aa-form-section-title">' + _feather('settings', 12) + ' Avancado</summary>'
      +   '<div style="margin-top:8px">'
      +     '<div class="aa-field"><label>Destinatario</label>'
      +       '<div class="aa-radio-group">' + recipRadios + '</div></div>'
      +     '<div class="aa-field"><label>Fase (interna)</label>'
      +       '<div class="aa-radio-group">' + catRadios + '</div></div>'
      +   '</div>'
      + '</details>'
  }

  // ── Subsecoes por canal ────────────────────────────────────
  function _renderChannelConfigWhatsapp(f) {
    var svc = _svc()
    var chips = svc.TEMPLATE_VARS.map(function(v) {
      var tip = v.label + (v.example ? ' — ex.: "' + v.example + '"' : '')
      return '<button type="button" class="aa-tag-btn" data-var="' + v.id + '" title="' + _esc(tip) + '">{{' + v.id + '}}</button>'
    }).join('')

    var html = '<div class="aa-channel-block">'
      +   '<div class="aa-channel-block-title">' + _feather('messageCircle', 12) + ' Mensagem WhatsApp</div>'
      +   '<div class="aa-tags-bar">' + chips + '</div>'
      +   '<div class="aa-fmt-bar">'
      +     '<button type="button" class="aa-fmt-btn" data-fmt="*" title="Negrito"><b>B</b></button>'
      +     '<button type="button" class="aa-fmt-btn" data-fmt="_" title="Italico"><i>I</i></button>'
      +     '<button type="button" class="aa-fmt-btn" data-fmt="~" title="Tachado"><s>S</s></button>'
      +   '</div>'
      +   '<textarea id="aaContent" rows="8" placeholder="Digite a mensagem...">' + _esc(f.content_template) + '</textarea>'
      +   '<div class="aa-attach">'

    if (f.attachment_url) {
      html += '<div class="aa-attach-preview">'
        +   '<img src="' + _esc(f.attachment_url) + '" alt="anexo">'
        +   '<button type="button" class="aa-attach-remove" data-action="remove-image" title="Remover imagem">' + _feather('x', 14) + '</button>'
        + '</div>'
    } else {
      html += '<button type="button" class="aa-btn-attach" data-action="pick-image">'
        +   _feather('image', 14) + ' Anexar imagem'
        + '</button>'
        + '<div class="aa-attach-hint">JPG, PNG, WEBP ou GIF — max 10 MB</div>'
    }
    html += '<input type="file" id="aaAttachInput" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none">'
    html += '</div>'
    html += '</div>'
    return html
  }

  function _renderChannelConfigAlexa(f) {
    var svc = _svc()
    var targetOpts = svc.ALEXA_TARGETS.map(function(t) {
      var sel = (f.alexa_target||'sala') === t.id ? ' selected' : ''
      return '<option value="' + t.id + '"' + sel + '>' + t.label + '</option>'
    }).join('')
    var chips = svc.TEMPLATE_VARS.map(function(v) {
      var tip = v.label + (v.example ? ' — ex.: "' + v.example + '"' : '')
      return '<button type="button" class="aa-tag-btn" data-alexa-var="' + v.id + '" title="' + _esc(tip) + '">{{' + v.id + '}}</button>'
    }).join('')

    return '<div class="aa-channel-block">'
      +   '<div class="aa-channel-block-title">' + _feather('speaker', 12) + ' Alexa</div>'
      +   '<div class="aa-field"><label>Dispositivo alvo</label>'
      +     '<select id="aaAlexaTarget">' + targetOpts + '</select></div>'
      +   '<div class="aa-field"><label>Mensagem</label>'
      +     '<div class="aa-tags-bar">' + chips + '</div>'
      +     '<textarea id="aaAlexaMsg" rows="3" placeholder="Ex: Dra {{profissional}}, sua proxima paciente {{nome}} esta na recepcao.">' + _esc(f.alexa_message) + '</textarea>'
      +   '</div>'
      + '</div>'
  }

  function _renderChannelConfigTask(f) {
    var svc = _svc()
    var assignees = svc.TASK_ASSIGNEES.map(function(a) {
      return '<option value="' + a.id + '"' + ((f.task_assignee||'sdr')===a.id?' selected':'') + '>' + a.label + '</option>'
    }).join('')
    var priorities = svc.TASK_PRIORITIES.map(function(p) {
      return '<option value="' + p.id + '"' + ((f.task_priority||'normal')===p.id?' selected':'') + '>' + p.label + '</option>'
    }).join('')

    return '<div class="aa-channel-block">'
      +   '<div class="aa-channel-block-title">' + _feather('clipboard', 12) + ' Tarefa</div>'
      +   '<div class="aa-field"><label>Titulo</label>'
      +     '<input type="text" id="aaTaskTitle" value="' + _esc(f.task_title || '') + '" placeholder="Ex: Confirmar presenca do paciente"></div>'
      +   '<div class="aa-field-row">'
      +     '<div class="aa-field"><label>Responsavel</label><select id="aaTaskAssignee">' + assignees + '</select></div>'
      +     '<div class="aa-field"><label>Prioridade</label><select id="aaTaskPriority">' + priorities + '</select></div>'
      +     '<div class="aa-field"><label>Prazo (h)</label>'
      +       '<input type="number" id="aaTaskDeadline" min="1" max="720" value="' + (f.task_deadline_hours||24) + '"></div>'
      +   '</div>'
      + '</div>'
  }

  function _renderChannelConfigAlert(f) {
    return '<div class="aa-channel-block">'
      +   '<div class="aa-channel-block-title">' + _feather('bell', 12) + ' Alerta Visual</div>'
      +   '<div class="aa-field"><label>Titulo</label>'
      +     '<input type="text" id="aaAlertTitle" value="' + _esc(f.alert_title) + '" placeholder="Ex: Paciente chegou: {{nome}}"></div>'
      +   '<div class="aa-field"><label>Tipo</label>'
      +     '<select id="aaAlertType">'
      +       '<option value="info"'    + (f.alert_type==='info'   ?' selected':'') + '>Info</option>'
      +       '<option value="warning"' + (f.alert_type==='warning'?' selected':'') + '>Aviso</option>'
      +       '<option value="success"' + (f.alert_type==='success'?' selected':'') + '>Sucesso</option>'
      +       '<option value="error"'   + (f.alert_type==='error'  ?' selected':'') + '>Erro</option>'
      +     '</select></div>'
      + '</div>'
  }

  function _renderTriggerConfig(type, cfg) {
    cfg = cfg || {}
    var html = '<div class="aa-trigger-config">'

    if (type === 'd_before' || type === 'd_after') {
      html += '<div class="aa-field-row">'
        + '<div class="aa-field"><label>Dias</label><input type="number" id="aaCfgDays" min="1" max="30" value="' + (cfg.days||1) + '"></div>'
        + '<div class="aa-field"><label>Hora</label><input type="number" id="aaCfgHour" min="0" max="23" value="' + (cfg.hour||10) + '"></div>'
        + '<div class="aa-field"><label>Min</label><input type="number" id="aaCfgMin" min="0" max="59" value="' + (cfg.minute||0) + '"></div>'
        + '</div>'
    } else if (type === 'd_zero' || type === 'daily_summary') {
      html += '<div class="aa-field-row">'
        + '<div class="aa-field"><label>Hora</label><input type="number" id="aaCfgHour" min="0" max="23" value="' + (cfg.hour||8) + '"></div>'
        + '<div class="aa-field"><label>Min</label><input type="number" id="aaCfgMin" min="0" max="59" value="' + (cfg.minute||0) + '"></div>'
        + '</div>'
    } else if (type === 'min_before') {
      html += '<div class="aa-field"><label>Minutos antes</label>'
        + '<input type="number" id="aaCfgMinutes" min="5" max="120" value="' + (cfg.minutes||30) + '"></div>'
    } else if (type === 'on_status') {
      html += '<div class="aa-field"><label>Quando mudar para</label><select id="aaCfgStatus">'
      STATUS_OPTIONS.forEach(function(s) {
        html += '<option value="' + s.id + '"' + (cfg.status===s.id?' selected':'') + '>' + s.label + '</option>'
      })
      html += '</select></div>'
    } else if (type === 'on_tag') {
      html += '<div class="aa-field"><label>Tag</label>'
        + '<input type="text" id="aaCfgTag" value="' + _esc(cfg.tag||'') + '" placeholder="ex: orcamento-aberto"></div>'

      // Delay escalonado: dispara X dias/horas/minutos APOS aplicar a tag.
      // Se tudo zero = imediato.
      html += '<div class="aa-delay-block">'
        + '<div class="aa-delay-title">' + _feather('clock', 12) + ' Quando disparar apos aplicar a tag</div>'
        + '<div class="aa-field-row">'
        + '<div class="aa-field"><label>Dias</label><input type="number" id="aaCfgDelayDays" min="0" max="365" value="' + (parseInt(cfg.delay_days)||0) + '"></div>'
        + '<div class="aa-field"><label>Horas</label><input type="number" id="aaCfgDelayHours" min="0" max="23" value="' + (parseInt(cfg.delay_hours)||0) + '"></div>'
        + '<div class="aa-field"><label>Minutos</label><input type="number" id="aaCfgDelayMin" min="0" max="59" value="' + (parseInt(cfg.delay_minutes)||0) + '"></div>'
        + '</div>'
        + '<div class="aa-delay-hint" id="aaDelayHint">' + _delayHintText(cfg) + '</div>'
        + '</div>'
    }
    // on_finalize has no config

    html += '</div>'
    return html
  }

  function _renderEditorFooter(r) {
    var id = r && r.id ? r.id : ''
    return '<div class="aa-editor-footer">'
      + (id ? '<button type="button" class="aa-btn-delete-edit" data-action="delete" data-delete="' + id + '" title="Excluir regra">' + _feather('trash2', 14) + ' Excluir</button>' : '')
      + '<div style="flex:1"></div>'
      + '<button type="button" class="aa-btn aa-btn-save" data-action="save">' + (_saving ? 'Salvando...' : 'Salvar alteracoes') + '</button>'
      + '</div>'
  }

  // ── Read form from DOM ─────────────────────────────────────
  function _readForm() {
    var el = function(id) { return document.getElementById(id) }
    var val = function(id) { var e = el(id); return e ? e.value : '' }

    _form.name = val('aaName')
    _form.description = val('aaDesc')
    _form.content_template = val('aaContent')
    _form.alert_title = val('aaAlertTitle')
    _form.alert_type = val('aaAlertType') || 'info'
    _form.task_title = val('aaTaskTitle')
    _form.task_assignee = val('aaTaskAssignee') || 'sdr'
    _form.task_priority = val('aaTaskPriority') || 'normal'
    _form.task_deadline_hours = parseInt(val('aaTaskDeadline')) || 24
    _form.alexa_message = val('aaAlexaMsg')
    _form.alexa_target = val('aaAlexaTarget') || 'sala'

    var cat = document.querySelector('input[name=aaCategory]:checked')
    if (cat) _form.category = cat.value

    _form.trigger_type = val('aaTrigger')

    var recipient = document.querySelector('input[name=aaRecipient]:checked')
    if (recipient) _form.recipient_type = recipient.value

    // Canal: checkboxes multi-select (combinados em valor unico pro DB)
    var checked = Array.prototype.slice.call(document.querySelectorAll('input[name=aaChannelMulti]:checked'))
      .map(function(el){ return el.value })
    _form.channel = _combineChannels(checked)

    // Read trigger config
    var cfg = {}
    var tt = _form.trigger_type
    if (tt === 'd_before' || tt === 'd_after') {
      cfg.days = parseInt(val('aaCfgDays')) || 1
      cfg.hour = parseInt(val('aaCfgHour')) || 10
      cfg.minute = parseInt(val('aaCfgMin')) || 0
    } else if (tt === 'd_zero' || tt === 'daily_summary') {
      cfg.hour = parseInt(val('aaCfgHour')) || 8
      cfg.minute = parseInt(val('aaCfgMin')) || 0
    } else if (tt === 'min_before') {
      cfg.minutes = parseInt(val('aaCfgMinutes')) || 30
    } else if (tt === 'on_status') {
      cfg.status = val('aaCfgStatus')
    } else if (tt === 'on_tag') {
      cfg.tag = val('aaCfgTag')
      var dd = parseInt(val('aaCfgDelayDays')) || 0
      var dh = parseInt(val('aaCfgDelayHours')) || 0
      var dm = parseInt(val('aaCfgDelayMin')) || 0
      if (dd) cfg.delay_days = dd
      if (dh) cfg.delay_hours = dh
      if (dm) cfg.delay_minutes = dm
    }
    _form.trigger_config = cfg
  }

  // ── Events ─────────────────────────────────────────────────
  function _bindEvents(root) {
    if (!root) return
    // ESC fecha modal
    if (!window._clinicaiAaEscBound) {
      window._clinicaiAaEscBound = true
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && _modalOpen) {
          _modalOpen = false; _isCreating = false; _editingRule = null
          _form = _emptyForm(); _render()
        }
      })
    }
    root.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]')
      if (btn) {
        var action = btn.dataset.action
        if (action === 'new') {
          _form = _emptyForm()
          _form.channel = 'whatsapp'
          // Trigger coerente com a tab atual
          if (_funnelTab === 'pre_agendamento') { _form.trigger_type = 'on_tag'; _form.trigger_config = { tag: 'lead_novo' } }
          else if (_funnelTab === 'perdido') { _form.trigger_type = 'on_tag'; _form.trigger_config = { tag: 'perdido' } }
          else if (_funnelTab === 'orcamento') { _form.trigger_type = 'on_tag'; _form.trigger_config = { tag: 'orcamento-aberto' } }
          else if (_funnelTab === 'paciente_orcamento') { _form.trigger_type = 'on_tag'; _form.trigger_config = { tag: 'orcamento_fechado' } }
          else if (_funnelTab === 'paciente') { _form.trigger_type = 'd_after'; _form.trigger_config = { days: 1, hour: 10, minute: 0 } }
          _editingRule = null
          _isCreating = true
          _modalOpen = true
          _render()
          return
        }
        if (action === 'modal-close' || action === 'modal-backdrop') {
          // Backdrop so fecha se click for direto no backdrop (nao em filhos)
          if (action === 'modal-backdrop' && e.target !== btn) return
          _modalOpen = false
          _isCreating = false
          _editingRule = null
          _form = _emptyForm()
          _render()
          return
        }
        if (action === 'cancel') { _isCreating = false; _editingRule = null; _render(); return }
        if (action === 'save') { _handleSave(); return }
        if (action === 'speak-alexa') {
          _readForm()
          var vars = _sampleVars()
          var msg = _svc().renderTemplate(_form.alexa_message || '', vars)
          _speakAlexa(msg || 'Mensagem de exemplo. Preencha o texto da Alexa no editor.')
          return
        }
        if (action === 'simulate-alert') {
          _readForm()
          var v2 = _sampleVars()
          var title = _svc().renderTemplate(_form.alert_title || '', v2) || 'Alerta de exemplo'
          if (window._showToast) {
            window._showToast('Automacao', title, _form.alert_type || 'info')
          }
          return
        }
        if (action === 'pick-image') {
          var inp = document.getElementById('aaAttachInput')
          if (inp) inp.click()
          return
        }
        if (action === 'remove-image') {
          _readForm()
          _form.attachment_url = ''
          _render()
          return
        }
        if (action === 'test-wa') {
          _readForm()
          _refreshPreview()
          if (window._showToast) _showToast('Preview', 'Renderizado com dados de exemplo (nao enviado)', 'info')
          return
        }
        if (action === 'tab') {
          _funnelTab = btn.dataset.tab
          _selectedId = null
          _isCreating = false
          _editingRule = null
          _render()
          return
        }
        // data-action desconhecido: nao retorna — deixa outros handlers processarem
      }

      // Toggle
      var toggle = e.target.closest('[data-toggle]')
      if (toggle) {
        e.stopPropagation()
        var id = toggle.dataset.toggle || e.target.dataset.toggle
        if (id) _svc().toggle(id).then(_load)
        return
      }

      // Select rule
      var sel = e.target.closest('[data-select]')
      if (sel) { _selectedId = sel.dataset.select; _isCreating = false; _editingRule = null; _render(); return }

      // Edit
      var edit = e.target.closest('[data-edit]')
      if (edit) {
        var r = _rules.find(function(x){return x.id===edit.dataset.edit})
        if (r) {
          _editingRule = r
          _form = {
            name: r.name, description: r.description||'', category: r.category,
            trigger_type: r.trigger_type, trigger_config: r.trigger_config||{},
            recipient_type: r.recipient_type, channel: r.channel,
            content_template: r.content_template||'', attachment_url: r.attachment_url||'',
            alert_title: r.alert_title||'',
            alert_type: r.alert_type||'info', task_title: r.task_title||'',
            task_assignee: r.task_assignee||'sdr', task_priority: r.task_priority||'normal',
            task_deadline_hours: r.task_deadline_hours||24, alexa_message: r.alexa_message||'',
            alexa_target: r.alexa_target||'sala', is_active: r.is_active, sort_order: r.sort_order||0,
          }
          _isCreating = true; _selectedId = r.id; _render()
        }
        return
      }

      // Delete
      var del = e.target.closest('[data-delete]')
      if (del) { _deleteConfirm = del.dataset.delete; _render(); return }

      var confirmDel = e.target.closest('[data-confirm-delete]')
      if (confirmDel) { _svc().remove(confirmDel.dataset.confirmDelete).then(function(){ _deleteConfirm = null; _load() }); return }

      var cancelDel = e.target.closest('[data-cancel-delete]')
      if (cancelDel) { _deleteConfirm = null; _render(); return }

      // Test Alexa
      var testAlexa = e.target.closest('[data-test-alexa]')
      if (testAlexa) { _testAlexaRule(testAlexa.dataset.testAlexa); return }

      // Moment pill click (PRE/ATEND/POS)
      var momPill = e.target.closest('[data-moment]')
      if (momPill) { _momentPill = momPill.dataset.moment; _render(); return }

      // Variable insertion
      var varBtn = e.target.closest('[data-var]')
      if (varBtn) {
        var ta = document.getElementById('aaContent')
        if (ta) {
          var tag = '{{' + varBtn.dataset.var + '}}'
          var start = ta.selectionStart
          ta.value = ta.value.slice(0, start) + tag + ta.value.slice(ta.selectionEnd)
          ta.selectionStart = ta.selectionEnd = start + tag.length
          ta.focus()
          _form.content_template = ta.value
        }
        return
      }

      // Alexa variable insertion
      var alexaVarBtn = e.target.closest('[data-alexa-var]')
      if (alexaVarBtn) {
        var ta3 = document.getElementById('aaAlexaMsg')
        if (ta3) {
          var atag = '{{' + alexaVarBtn.dataset.alexaVar + '}}'
          var astart = ta3.selectionStart
          ta3.value = ta3.value.slice(0, astart) + atag + ta3.value.slice(ta3.selectionEnd)
          ta3.selectionStart = ta3.selectionEnd = astart + atag.length
          ta3.focus()
          _form.alexa_message = ta3.value
        }
        return
      }

      // Format buttons
      var fmt = e.target.closest('[data-fmt]')
      if (fmt) {
        var ta2 = document.getElementById('aaContent')
        if (ta2) {
          var wrap = fmt.dataset.fmt
          var s = ta2.selectionStart, e2 = ta2.selectionEnd
          var selected = ta2.value.slice(s, e2)
          if (selected) {
            ta2.value = ta2.value.slice(0, s) + wrap + selected + wrap + ta2.value.slice(e2)
            ta2.selectionStart = s; ta2.selectionEnd = e2 + wrap.length * 2
          }
          ta2.focus()
          _form.content_template = ta2.value
        }
        return
      }
    })

    // Trigger type change → update config panel
    root.addEventListener('change', function(e) {
      if (e.target.id === 'aaTrigger') {
        _readForm()
        _form.trigger_config = {}
        var cfgDiv = document.getElementById('aaTriggerConfig')
        if (cfgDiv) cfgDiv.innerHTML = _renderTriggerConfig(_form.trigger_type, _form.trigger_config)
      }
      // Channel change (checkboxes) → re-render editor para mostrar/esconder config
      if (e.target.name === 'aaChannelMulti') {
        _readForm()
        _render()
      }
    })

    // Live preview on content input + delay hint update
    root.addEventListener('input', function(e) {
      if (e.target.id === 'aaContent') {
        _form.content_template = e.target.value
        _schedulePreviewUpdate()
      }
      if (e.target.id === 'aaAlexaMsg') {
        _form.alexa_message = e.target.value
      }
      if (e.target.id === 'aaCfgDelayDays' || e.target.id === 'aaCfgDelayHours' || e.target.id === 'aaCfgDelayMin') {
        var hint = document.getElementById('aaDelayHint')
        if (hint) {
          hint.textContent = _delayHintText({
            delay_days: document.getElementById('aaCfgDelayDays') ? document.getElementById('aaCfgDelayDays').value : 0,
            delay_hours: document.getElementById('aaCfgDelayHours') ? document.getElementById('aaCfgDelayHours').value : 0,
            delay_minutes: document.getElementById('aaCfgDelayMin') ? document.getElementById('aaCfgDelayMin').value : 0,
          })
        }
      }
    })

    // Image upload handler
    root.addEventListener('change', function(e) {
      if (e.target.id === 'aaAttachInput') {
        var file = e.target.files && e.target.files[0]
        if (!file) return
        _uploadAttachment(file)
      }
    })
  }

  async function _uploadAttachment(file) {
    if (!window._sbShared) { _toastErr('Supabase nao disponivel'); return }
    var MAX = 10 * 1024 * 1024
    if (file.size > MAX) { _toastErr('Imagem maior que 10 MB'); return }

    _readForm()
    if (window._showToast) _showToast('Upload', 'Enviando imagem...', 'info')

    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    var key = 'auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext

    try {
      var up = await window._sbShared.storage.from('wa-automations').upload(key, file, {
        contentType: file.type || 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      })
      if (up.error) { _toastErr('Upload falhou: ' + up.error.message); return }

      var publicUrl = window._sbShared.storage.from('wa-automations').getPublicUrl(key).data.publicUrl
      _form.attachment_url = publicUrl
      if (window._showToast) _showToast('Imagem anexada', 'Pronta para enviar', 'success')
      _render()
    } catch (e) {
      _toastErr('Upload erro: ' + e.message)
    }
  }

  async function _testAlexaRule(ruleId) {
    var r = _rules.find(function(x) { return x.id === ruleId })
    if (!r || !r.alexa_message) return

    var config = window.AlexaNotificationService ? await AlexaNotificationService.getConfig() : null
    if (!config || !config.webhook_url || !config.auth_token) {
      if (window._showToast) _showToast('Alexa', 'Configure URL e Token em Settings > Alexa', 'warning')
      return
    }

    var vars = { nome: 'Maria Silva', data: '15/04/2026', hora: '14:30', profissional: 'Dra. Mirian', procedimento: 'Bioestimulador', clinica: 'Clinica', sala: 'Consultorio 02' }
    var message = _svc().renderTemplate(r.alexa_message, vars)
    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.auth_token }

    // Resolver devices dinamicamente pelo target (sem hardcode)
    var devices = []
    var target = r.alexa_target || 'sala'

    // Buscar devices do AlexaDevicesRepository
    var allDevices = []
    if (window.AlexaDevicesRepository) {
      var devRes = await AlexaDevicesRepository.getAll()
      if (devRes.ok && devRes.data) allDevices = devRes.data.filter(function(d) { return d.is_active && d.device_name })
    }
    // Fallback: devices das salas
    if (!allDevices.length) {
      var rooms = typeof getRooms === 'function' ? getRooms() : []
      rooms.forEach(function(rm) { if (rm.alexa_device_name) allDevices.push({ device_name: rm.alexa_device_name, location_label: rm.nome, room_id: rm.id }) })
    }

    if (target === 'recepcao') {
      var rec = allDevices.find(function(d) { var l = (d.location_label||'').toLowerCase(); return l.indexOf('recepc') >= 0 })
      if (rec) devices.push(rec.device_name)
      else if (allDevices.length) devices.push(allDevices[0].device_name)
    } else if (target === 'sala') {
      var rooms2 = typeof getRooms === 'function' ? getRooms() : []
      for (var i = 0; i < rooms2.length; i++) {
        if (rooms2[i].alexa_device_name) { devices.push(rooms2[i].alexa_device_name); break }
      }
      if (!devices.length) {
        var nonRec = allDevices.find(function(d) { var l = (d.location_label||'').toLowerCase(); return l.indexOf('recepc') < 0 })
        if (nonRec) devices.push(nonRec.device_name)
      }
    } else if (target === 'todos') {
      allDevices.forEach(function(d) { devices.push(d.device_name) })
    } else if (target === 'profissional') {
      var rooms3 = typeof getRooms === 'function' ? getRooms() : []
      for (var j = 0; j < rooms3.length; j++) {
        if (rooms3[j].alexa_device_name) { devices.push(rooms3[j].alexa_device_name); break }
      }
    }

    if (!devices.length) {
      if (window._showToast) _showToast('Alexa', 'Nenhum dispositivo encontrado para "' + target + '". Cadastre devices em Settings > Alexa.', 'warning')
      return
    }

    var sent = 0, failed = 0
    for (var d = 0; d < devices.length; d++) {
      try {
        var resp = await fetch(config.webhook_url, {
          method: 'POST', headers: headers,
          body: JSON.stringify({ device: devices[d], message: message, type: 'announce' })
        })
        if (resp.ok) sent++
        else { failed++; console.error('[Alexa] Teste falhou:', devices[d], resp.status) }
      } catch (e) { failed++; console.error('[Alexa] Teste erro:', devices[d], e.message) }
      if (d < devices.length - 1) await new Promise(function(res) { setTimeout(res, 2000) })
    }

    if (window._showToast) {
      if (sent > 0 && failed === 0) _showToast('Alexa', 'Teste OK: ' + sent + ' device(s) — "' + message.substring(0, 40) + '..."', 'success')
      else if (sent > 0) _showToast('Alexa', sent + ' OK, ' + failed + ' falhou', 'warning')
      else _showToast('Alexa', 'Teste falhou em ' + failed + ' device(s)', 'error')
    }
  }

  async function _handleSave() {
    _readForm()
    if (!_form.name.trim()) { _toastWarn('Nome obrigatorio'); return }
    if (!_form.channel) { _toastWarn('Marque ao menos 1 canal'); return }
    var needsWaContent = _channelIncludes(_form.channel, 'whatsapp')
    var needsAlexaContent = _channelIncludes(_form.channel, 'alexa')
    var isAlertOnly = _form.channel === 'alert'
    var isAlexaOnly = _form.channel === 'alexa'
    if (!isAlertOnly && !isAlexaOnly && needsWaContent && !_form.content_template.trim()) { _toastWarn('Mensagem WhatsApp obrigatoria'); return }
    if (needsAlexaContent && !_form.alexa_message.trim()) { _toastWarn('Mensagem Alexa obrigatoria'); return }

    _saving = true; _render()

    var data = Object.assign({}, _form)
    if (_editingRule) data.id = _editingRule.id
    // Alexa-only nao usa content_template, mas coluna e NOT NULL
    if (!data.content_template || !data.content_template.trim()) data.content_template = data.alexa_message || '-'

    var res = await _svc().save(data)
    _saving = false

    if (res.ok) {
      _modalOpen = false
      _isCreating = false
      // Se criou nova (nao era edit), seleciona a recem-criada
      var wasCreating = !_editingRule
      _editingRule = null
      if (res.data && res.data.id) _selectedId = res.data.id
      if (window._showToast) _showToast('Salvo', _form.name + (wasCreating ? ' criada' : ' atualizada') + ' com sucesso', 'success')
      await _load()
    } else {
      _toastErr('Erro: ' + (res.error||'desconhecido'))
      _render()
    }
  }

  // ── Init ───────────────────────────────────────────────────
  // Evita flash triplo: render inicial ja em estado de loading,
  // depois _load substitui pelo conteudo real (2 renders em vez de 3).
  function init(rootId) {
    var el = document.getElementById(rootId || 'agenda-automations-root')
    if (!el) return
    if (_root !== el) { _root = el; _bindEvents(_root) }
    _loading = true
    _root.innerHTML = _renderPage()
    _load()
  }

  window.AgendaAutomationsUI = Object.freeze({ init, render })
})()
