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
  var _panelOpen = true
  var _panelTab = 'list' // list | editor
  var _editingRule = null // rule object being edited (null = new)
  var _form = _emptyForm()
  var _deleteConfirm = null
  var _filterCategory = 'all' // all | before | during | after

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
    return '<div class="aa-page">'
      + _renderCenterPanel()
      + _renderSlidePanel()
      + '</div>'
  }

  // ── Center: rules list ─────────────────────────────────────
  function _renderCenterPanel() {
    var cats = ['all','captacao','before','during','after','pos','orcamento']
    var tabs = cats.map(function(c) {
      var active = _filterCategory === c ? ' aa-tab-active' : ''
      var label = c === 'all' ? 'Todas' : CATEGORY_LABELS[c]
      var count = c === 'all' ? _rules.length : _rules.filter(function(r){return r.category===c}).length
      return '<button class="aa-tab' + active + '" data-cat="' + c + '">'
        + label + ' <span class="aa-tab-count">' + count + '</span></button>'
    }).join('')

    var header = '<div class="aa-header">'
      + '<div class="aa-title">' + _feather('zap', 18) + ' Automacoes da Agenda</div>'
      + '<div class="aa-tabs">' + tabs + '</div>'
      + '</div>'

    var filtered = _filterCategory === 'all' ? _rules : _rules.filter(function(r){return r.category===_filterCategory})

    if (_loading) {
      return '<div class="aa-center">' + header + '<div class="aa-loading">Carregando...</div></div>'
    }

    var groups = {}
    filtered.forEach(function(r) {
      var cat = r.category || 'before'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(r)
    })

    var list = ''
    var order = ['before','during','after','summary']
    order.forEach(function(cat) {
      var items = groups[cat]
      if (!items || !items.length) return
      var color = CATEGORY_COLORS[cat] || '#6B7280'
      list += '<div class="aa-group">'
        + '<div class="aa-group-title" style="color:' + color + '">'
        + (CATEGORY_LABELS[cat]||cat).toUpperCase() + ' DA CONSULTA'
        + '</div>'
      items.forEach(function(r) { list += _renderRuleCard(r) })
      list += '</div>'
    })

    if (!list) list = '<div class="aa-empty">' + _feather('inbox', 32) + '<br>Nenhuma automacao configurada</div>'

    return '<div class="aa-center">' + header + '<div class="aa-list">' + list + '</div></div>'
  }

  function _renderRuleCard(r) {
    var color = CATEGORY_COLORS[r.category] || '#6B7280'
    var sel = _selectedId === r.id ? ' aa-card-selected' : ''
    var inactive = r.is_active ? '' : ' aa-card-inactive'

    var triggerLabel = _triggerLabel(r)
    var recipientIcon = RECIPIENT_ICONS[r.recipient_type] || 'user'
    var channelIcon = CHANNEL_ICONS[r.channel] || 'messageCircle'

    var recipientLabel = r.recipient_type === 'patient' ? 'Paciente' : r.recipient_type === 'professional' ? 'Profissional' : 'Ambos'
    var channelLabel = CHANNEL_LABELS[r.channel] || r.channel

    // Delete confirmation
    if (_deleteConfirm === r.id) {
      return '<div class="aa-card aa-card-delete">'
        + '<div style="font-size:12px;font-weight:600;color:#DC2626;margin-bottom:8px">Excluir "' + _esc(r.name) + '"?</div>'
        + '<div style="display:flex;gap:6px">'
        + '<button class="aa-btn-sm aa-btn-danger" data-confirm-delete="' + r.id + '">Excluir</button>'
        + '<button class="aa-btn-sm" data-cancel-delete>Cancelar</button>'
        + '</div></div>'
    }

    return '<div class="aa-card' + sel + inactive + '" data-rule-id="' + r.id + '">'
      + '<div class="aa-card-left">'
      + '<div class="aa-card-dot" style="background:' + color + '"></div>'
      + '<div class="aa-card-toggle">'
      + '<label class="aa-switch"><input type="checkbox" ' + (r.is_active?'checked':'') + ' data-toggle="' + r.id + '"><span class="aa-slider"></span></label>'
      + '</div>'
      + '</div>'
      + '<div class="aa-card-body" data-select="' + r.id + '">'
      + '<div class="aa-card-name">' + _esc(r.name) + '</div>'
      + '<div class="aa-card-meta">'
      + '<span class="aa-chip" style="background:' + color + '15;color:' + color + '">' + _feather('clock', 10) + ' ' + triggerLabel + '</span>'
      + '<span class="aa-chip">' + _feather(recipientIcon, 10) + ' ' + recipientLabel + '</span>'
      + '<span class="aa-chip">' + _feather(channelIcon, 10) + ' ' + channelLabel + '</span>'
      + '</div>'
      + '</div>'
      + '<div class="aa-card-actions">'
      + '<button class="aa-btn-icon" data-edit="' + r.id + '" title="Editar">' + _feather('edit2', 14) + '</button>'
      + '<button class="aa-btn-icon" data-delete="' + r.id + '" title="Excluir">' + _feather('trash2', 14) + '</button>'
      + '</div>'
      + '</div>'
  }

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

  // ── Slide Panel ────────────────────────────────────────────
  function _renderSlidePanel() {
    if (!_panelOpen) return ''

    var isEditor = _panelTab === 'editor'
    var title = isEditor ? (_editingRule ? 'Editar Regra' : 'Nova Regra') : 'Automacoes'

    return '<div class="aa-panel">'
      + '<div class="aa-panel-header">'
      + '<span class="aa-panel-title">' + title + '</span>'
      + '<div style="display:flex;gap:6px">'
      + (isEditor ? '' : '<button class="aa-btn-new" data-action="new">' + _feather('plus', 14) + ' Nova</button>')
      + '</div>'
      + '</div>'
      + '<div class="aa-panel-body">'
      + (isEditor ? _renderEditor() : _renderPreviewSelected())
      + '</div>'
      + (isEditor ? _renderEditorFooter() : '')
      + '</div>'
  }

  // ── Preview selected ───────────────────────────────────────
  function _renderPreviewSelected() {
    if (!_selectedId) {
      return '<div class="aa-empty-panel">' + _feather('mousePointer', 24)
        + '<br>Selecione uma regra para ver o preview<br>ou clique em <b>Nova</b></div>'
    }
    var r = _rules.find(function(x){return x.id===_selectedId})
    if (!r) return ''

    var vars = { nome:'Maria Silva', data:'15/04/2026', hora:'14:30', profissional:'Dra. Mirian', procedimento:'Bioestimulador', clinica:'Clinica', link_anamnese:'https://...', status:r.trigger_config?.status||'agendado', obs:'' }
    var rendered = _svc().renderTemplate(r.content_template, vars)

    var html = '<div style="margin-bottom:16px">'
      + '<div style="font-weight:600;font-size:14px;margin-bottom:4px">' + _esc(r.name) + '</div>'
      + '<div style="font-size:12px;color:var(--text-secondary)">' + _esc(r.description) + '</div>'
      + '</div>'

    // Show WhatsApp preview if channel includes whatsapp
    if (_channelIncludes(r.channel, 'whatsapp')) {
      html += _renderPhonePreview(rendered)
    }

    // Show alert preview if channel includes alert
    if (_channelIncludes(r.channel, 'task') && r.task_title) {
      var tColor = { urgente:'#DC2626', alta:'#F59E0B', normal:'#3B82F6', baixa:'#6B7280' }[r.task_priority] || '#3B82F6'
      html += '<div style="margin-top:12px;padding:12px;border-radius:8px;border-left:4px solid ' + tColor + ';background:' + tColor + '08;font-size:13px">'
        + '<div style="font-weight:600;color:' + tColor + '">' + _feather('clipboard', 14) + ' Tarefa</div>'
        + '<div style="margin-top:4px">' + _esc(r.task_title) + '</div>'
        + '<div style="margin-top:2px;font-size:11px;color:var(--text-secondary)">Para: ' + (r.task_assignee||'sdr') + ' | Prazo: ' + (r.task_deadline_hours||24) + 'h | ' + (r.task_priority||'normal') + '</div>'
        + '</div>'
    }

    if (_channelIncludes(r.channel, 'alert')) {
      var alertColor = { info:'#3B82F6', warning:'#F59E0B', success:'#10B981', error:'#DC2626' }[r.alert_type] || '#3B82F6'
      var alertTitle = _svc().renderTemplate(r.alert_title, vars)
      html += '<div style="margin-top:12px;padding:12px;border-radius:8px;border-left:4px solid ' + alertColor + ';background:' + alertColor + '10;font-size:13px">'
        + '<div style="font-weight:600;color:' + alertColor + '">' + _feather('bell', 14) + ' Alerta Visual</div>'
        + '<div style="margin-top:4px">' + _esc(alertTitle) + '</div>'
        + '</div>'
    }

    if (_channelIncludes(r.channel, 'alexa') && r.alexa_message) {
      var alexaMsg = _svc().renderTemplate(r.alexa_message, vars)
      var targetLabel = r.alexa_target === 'recepcao' ? 'Recepcao' : r.alexa_target === 'todos' ? 'Todos' : r.alexa_target === 'profissional' ? 'Profissional' : 'Sala'
      html += '<div style="margin-top:12px;padding:12px;border-radius:10px;border-left:4px solid #06B6D4;background:#ECFEFF;font-size:13px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between">'
        + '<div style="display:flex;align-items:center;gap:6px;font-weight:600;color:#0891B2">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0891B2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg>'
        + ' Alexa (' + targetLabel + ')</div>'
        + '<button data-test-alexa="' + r.id + '" style="padding:4px 10px;background:#0891B2;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px">'
        + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Testar</button>'
        + '</div>'
        + '<div style="margin-top:4px;color:#0E7490;font-style:italic">"' + _esc(alexaMsg) + '"</div>'
        + '</div>'
    }

    return html
  }

  // ── Phone Preview (WhatsApp mockup) ────────────────────────
  function _renderPhonePreview(text) {
    var formatted = _waFormat(text)
    // Highlight {{vars}} remaining
    formatted = formatted.replace(/\{\{([^}]+)\}\}/g, '<span class="aa-wa-tag">{{$1}}</span>')

    return '<div class="aa-phone">'
      + '<div class="aa-phone-notch"></div>'
      + '<div class="aa-wa-header">'
      + '<div class="aa-wa-avatar"></div>'
      + '<div><div class="aa-wa-name">Clinica</div><div class="aa-wa-status">online</div></div>'
      + '</div>'
      + '<div class="aa-wa-chat">'
      + (formatted
        ? '<div class="aa-wa-bubble">' + formatted + '<div class="aa-wa-time">08:00 ✓✓</div></div>'
        : '<div class="aa-wa-empty">Sem mensagem configurada</div>')
      + '</div>'
      + '<div class="aa-wa-bottom"><div class="aa-wa-input">Mensagem</div><div class="aa-wa-send">' + _feather('send', 14) + '</div></div>'
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

  // ── Editor ─────────────────────────────────────────────────
  function _renderEditor() {
    var f = _form
    var svc = _svc()

    // Name
    var html = '<div class="aa-field"><label>Nome</label>'
      + '<input type="text" id="aaName" value="' + _esc(f.name) + '" placeholder="Ex: Confirmacao D-1"></div>'

    // Description
    html += '<div class="aa-field"><label>Descricao</label>'
      + '<input type="text" id="aaDesc" value="' + _esc(f.description) + '" placeholder="Breve descricao"></div>'

    // Category
    html += '<div class="aa-field"><label>Fase</label><div class="aa-radio-group">'
    svc.CATEGORIES.forEach(function(c) {
      var checked = f.category === c.id ? ' checked' : ''
      html += '<label class="aa-radio" style="--ac:' + c.color + '"><input type="radio" name="aaCategory" value="' + c.id + '"' + checked + '> ' + c.label + '</label>'
    })
    html += '</div></div>'

    // Trigger type
    html += '<div class="aa-field"><label>Gatilho</label><select id="aaTrigger">'
    svc.TRIGGER_TYPES.forEach(function(t) {
      var sel = f.trigger_type === t.id ? ' selected' : ''
      html += '<option value="' + t.id + '"' + sel + '>' + t.label + '</option>'
    })
    html += '</select></div>'

    // Trigger config (dynamic)
    html += '<div id="aaTriggerConfig">' + _renderTriggerConfig(f.trigger_type, f.trigger_config) + '</div>'

    // Recipient
    html += '<div class="aa-field"><label>Destinatario</label><div class="aa-radio-group">'
    svc.RECIPIENT_TYPES.forEach(function(r) {
      var checked = f.recipient_type === r.id ? ' checked' : ''
      html += '<label class="aa-radio"><input type="radio" name="aaRecipient" value="' + r.id + '"' + checked + '> ' + _feather(RECIPIENT_ICONS[r.id], 12) + ' ' + r.label + '</label>'
    })
    html += '</div></div>'

    // Channel
    html += '<div class="aa-field"><label>Canal</label><div class="aa-radio-group">'
    svc.CHANNELS.forEach(function(c) {
      var checked = f.channel === c.id ? ' checked' : ''
      html += '<label class="aa-radio"><input type="radio" name="aaChannel" value="' + c.id + '"' + checked + '> ' + _feather(CHANNEL_ICONS[c.id], 12) + ' ' + c.label + '</label>'
    })
    html += '</div></div>'

    // Content template (show if channel includes whatsapp)
    if (_channelIncludes(f.channel, 'whatsapp')) {
      html += '<div class="aa-field"><label>Mensagem WhatsApp</label>'

      // Variable tags bar
      html += '<div class="aa-tags-bar">'
      svc.TEMPLATE_VARS.forEach(function(v) {
        html += '<button class="aa-tag-btn" data-var="' + v.id + '">{{' + v.id + '}}</button>'
      })
      html += '</div>'

      // Formatting toolbar
      html += '<div class="aa-fmt-bar">'
        + '<button class="aa-fmt-btn" data-fmt="*" title="Negrito"><b>B</b></button>'
        + '<button class="aa-fmt-btn" data-fmt="_" title="Italico"><i>I</i></button>'
        + '<button class="aa-fmt-btn" data-fmt="~" title="Tachado"><s>S</s></button>'
        + '</div>'

      html += '<textarea id="aaContent" rows="8" placeholder="Digite a mensagem...">' + _esc(f.content_template) + '</textarea>'
      html += '</div>'

      // Live preview
      html += _renderPhonePreview(_svc().renderTemplate(f.content_template, { nome:'Maria Silva', data:'15/04/2026', hora:'14:30', profissional:'Dra. Mirian', procedimento:'Bioestimulador', clinica:'Clinica' }))
    }

    // Alert config (show if channel includes alert)
    if (_channelIncludes(f.channel, 'alert')) {
      html += '<div class="aa-section-title">' + _feather('bell', 14) + ' Alerta Visual</div>'
      html += '<div class="aa-field"><label>Titulo do Alerta</label>'
        + '<input type="text" id="aaAlertTitle" value="' + _esc(f.alert_title) + '" placeholder="Ex: Paciente chegou: {{nome}}">'
        + '</div>'
      html += '<div class="aa-field"><label>Tipo</label><select id="aaAlertType">'
        + '<option value="info"' + (f.alert_type==='info'?' selected':'') + '>Info</option>'
        + '<option value="warning"' + (f.alert_type==='warning'?' selected':'') + '>Aviso</option>'
        + '<option value="success"' + (f.alert_type==='success'?' selected':'') + '>Sucesso</option>'
        + '<option value="error"' + (f.alert_type==='error'?' selected':'') + '>Erro</option>'
        + '</select></div>'
    }

    // Task config (show if channel includes task)
    if (_channelIncludes(f.channel, 'task')) {
      html += '<div class="aa-section-title">' + _feather('clipboard', 14) + ' Tarefa</div>'
      html += '<div class="aa-field"><label>Titulo da Tarefa</label>'
        + '<input type="text" id="aaTaskTitle" value="' + _esc(f.task_title || '') + '" placeholder="Ex: Confirmar presenca do paciente">'
        + '</div>'
      html += '<div class="aa-field-row">'
      html += '<div class="aa-field"><label>Responsavel</label><select id="aaTaskAssignee">'
      svc.TASK_ASSIGNEES.forEach(function(a) {
        html += '<option value="' + a.id + '"' + ((f.task_assignee||'sdr')===a.id?' selected':'') + '>' + a.label + '</option>'
      })
      html += '</select></div>'
      html += '<div class="aa-field"><label>Prioridade</label><select id="aaTaskPriority">'
      svc.TASK_PRIORITIES.forEach(function(p) {
        html += '<option value="' + p.id + '"' + ((f.task_priority||'normal')===p.id?' selected':'') + '>' + p.label + '</option>'
      })
      html += '</select></div>'
      html += '<div class="aa-field"><label>Prazo (h)</label>'
        + '<input type="number" id="aaTaskDeadline" min="1" max="720" value="' + (f.task_deadline_hours||24) + '">'
        + '</div>'
      html += '</div>'

      // Task preview
      var taskPrevColor = { urgente:'#DC2626', alta:'#F59E0B', normal:'#3B82F6', baixa:'#6B7280' }[f.task_priority||'normal'] || '#3B82F6'
      html += '<div style="margin-top:8px;padding:10px;border-radius:8px;border-left:4px solid ' + taskPrevColor + ';background:' + taskPrevColor + '08;font-size:12px">'
        + '<div style="font-weight:700;color:' + taskPrevColor + '">' + _feather('clipboard', 12) + ' Preview Tarefa</div>'
        + '<div style="margin-top:4px">' + _esc(f.task_title || 'Titulo da tarefa') + '</div>'
        + '<div style="margin-top:2px;color:var(--text-secondary);font-size:11px">Para: ' + (f.task_assignee||'sdr') + ' | Prazo: ' + (f.task_deadline_hours||24) + 'h | ' + (f.task_priority||'normal') + '</div>'
        + '</div>'
    }

    // Alexa config (show if channel includes alexa)
    if (_channelIncludes(f.channel, 'alexa')) {
      html += '<div class="aa-section-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg> Alexa</div>'

      // Target device
      html += '<div class="aa-field"><label>Dispositivo Alvo</label><select id="aaAlexaTarget">'
      svc.ALEXA_TARGETS.forEach(function(t) {
        var sel = (f.alexa_target||'sala') === t.id ? ' selected' : ''
        html += '<option value="' + t.id + '"' + sel + '>' + t.label + '</option>'
      })
      html += '</select></div>'

      // Message template
      html += '<div class="aa-field"><label>Mensagem Alexa</label>'
      html += '<div class="aa-tags-bar">'
      svc.TEMPLATE_VARS.forEach(function(v) {
        html += '<button class="aa-tag-btn" data-alexa-var="' + v.id + '">{{' + v.id + '}}</button>'
      })
      html += '</div>'
      html += '<textarea id="aaAlexaMsg" rows="3" placeholder="Ex: Dra {{profissional}}, sua proxima paciente {{nome}} esta na recepcao.">' + _esc(f.alexa_message) + '</textarea>'
      html += '</div>'

      // Alexa preview
      var alexaPreviewMsg = _svc().renderTemplate(f.alexa_message || 'Mensagem Alexa...', { nome:'Maria Silva', data:'15/04/2026', hora:'14:30', profissional:'Dra. Mirian', procedimento:'Bioestimulador', clinica:'Clinica' })
      var alexaTargetLabel = (svc.ALEXA_TARGETS.find(function(t){return t.id===(f.alexa_target||'sala')})||{}).label || 'Sala'
      html += '<div style="margin-top:8px;padding:12px;border-radius:10px;border-left:4px solid #06B6D4;background:#ECFEFF;font-size:12px">'
        + '<div style="display:flex;align-items:center;gap:6px;font-weight:700;color:#0891B2;margin-bottom:6px">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0891B2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg>'
        + ' Preview Alexa (' + _esc(alexaTargetLabel) + ')</div>'
        + '<div style="color:#0E7490;font-style:italic">"' + _esc(alexaPreviewMsg) + '"</div>'
        + '</div>'
    }

    return html
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
    }
    // on_finalize has no config

    html += '</div>'
    return html
  }

  function _renderEditorFooter() {
    return '<div class="aa-panel-footer">'
      + '<button class="aa-btn aa-btn-cancel" data-action="cancel">Cancelar</button>'
      + '<button class="aa-btn aa-btn-save" data-action="save">' + (_saving ? 'Salvando...' : 'Salvar') + '</button>'
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

    var channel = document.querySelector('input[name=aaChannel]:checked')
    if (channel) _form.channel = channel.value

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
    }
    _form.trigger_config = cfg
  }

  // ── Events ─────────────────────────────────────────────────
  function _bindEvents(root) {
    if (!root) return
    root.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]')
      if (btn) {
        var action = btn.dataset.action
        if (action === 'new') { _form = _emptyForm(); _editingRule = null; _panelTab = 'editor'; _render() }
        if (action === 'cancel') { _panelTab = 'list'; _editingRule = null; _render() }
        if (action === 'save') _handleSave()
        return
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
      if (sel) { _selectedId = sel.dataset.select; _panelTab = 'list'; _render(); return }

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
            content_template: r.content_template||'', alert_title: r.alert_title||'',
            alert_type: r.alert_type||'info', task_title: r.task_title||'',
            task_assignee: r.task_assignee||'sdr', task_priority: r.task_priority||'normal',
            task_deadline_hours: r.task_deadline_hours||24, alexa_message: r.alexa_message||'',
            alexa_target: r.alexa_target||'sala', is_active: r.is_active, sort_order: r.sort_order||0,
          }
          _panelTab = 'editor'; _render()
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

      // Category filter tabs
      var tab = e.target.closest('[data-cat]')
      if (tab) { _filterCategory = tab.dataset.cat; _render(); return }

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
      // Channel change → re-render editor
      if (e.target.name === 'aaChannel') {
        _readForm()
        _panelTab = 'editor'; _render()
      }
    })

    // Live preview on content input
    root.addEventListener('input', function(e) {
      if (e.target.id === 'aaContent') {
        _form.content_template = e.target.value
      }
      if (e.target.id === 'aaAlexaMsg') {
        _form.alexa_message = e.target.value
      }
    })
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
      _panelTab = 'list'
      _editingRule = null
      if (window._showToast) _showToast('Salvo', _form.name + ' salva com sucesso', 'success')
      await _load()
    } else {
      _toastErr('Erro: ' + (res.error||'desconhecido'))
      _render()
    }
  }

  // ── Init ───────────────────────────────────────────────────
  function init(rootId) {
    render(rootId)
    _load()
  }

  window.AgendaAutomationsUI = Object.freeze({ init, render })
})()
