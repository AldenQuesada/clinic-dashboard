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
  var _isCreating = false

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
    prev.outerHTML = _renderPhonePreview(rendered, _form.attachment_url)
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
      +   '<button class="aa-btn-new" data-action="new">' + _feather('plus', 14) + ' Nova automacao</button>'
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

      return '<button class="te-tab' + active + '" data-action="tab" data-tab="' + cid + '">'
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
      return '<button class="aa-mom-pill' + active + '" data-moment="' + p.id + '">'
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
        + '<button class="aa-btn-sm aa-btn-danger" data-confirm-delete="' + r.id + '">Excluir</button>'
        + '<button class="aa-btn-sm" data-cancel-delete>Cancelar</button>'
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
  function _renderEditorColumn() {
    var isEditing = _isCreating || !!_editingRule

    if (!isEditing && !_selectedId) {
      return _renderEditorEmpty()
    }

    // Se ha selecao mas nao esta editando, mostra header minimo com botoes de acao
    if (!isEditing && _selectedId) {
      var r = _rules.find(function (x) { return x.id === _selectedId })
      if (!r) return _renderEditorEmpty()
      return _renderSelectedHeader(r)
    }

    // Modo de edicao (editor completo)
    return _renderEditorHeader()
      + '<div class="aa-editor-body">' + _renderEditor() + '</div>'
      + _renderEditorFooter()
  }

  function _renderEditorEmpty() {
    return '<div class="aa-editor-header">'
      +   '<div class="aa-editor-title">' + _feather('edit3', 16) + '<span>Editor</span></div>'
      + '</div>'
      + '<div class="aa-editor-body"><div class="aa-empty-col">'
      +   _feather('mousePointer', 24)
      +   '<br>Selecione uma regra na lista para visualizar'
      +   '<br>ou clique em <b>+ Nova automacao</b> para criar.'
      + '</div></div>'
  }

  function _renderSelectedHeader(r) {
    var title = _esc(r.name)
    return '<div class="aa-editor-header">'
      +   '<div class="aa-editor-title">' + _feather('eye', 16) + '<span class="aa-editor-title-text">' + title + '</span></div>'
      +   '<div style="display:flex;gap:6px">'
      +     '<label class="aa-switch" title="Ativar/desativar"><input type="checkbox" ' + (r.is_active?'checked':'') + ' data-toggle="' + r.id + '"><span class="aa-slider"></span></label>'
      +     '<button class="aa-btn-icon" data-edit="' + r.id + '" title="Editar">' + _feather('edit2', 14) + '</button>'
      +     '<button class="aa-btn-icon" data-delete="' + r.id + '" title="Excluir">' + _feather('trash2', 14) + '</button>'
      +   '</div>'
      + '</div>'
      + '<div class="aa-editor-body">' + _renderReadOnlyBody(r) + '</div>'
  }

  function _renderEditorHeader() {
    var title = _editingRule ? 'Editar: ' + _esc(_editingRule.name) : 'Nova automacao'
    return '<div class="aa-editor-header">'
      +   '<div class="aa-editor-title">' + _feather('edit3', 16) + '<span class="aa-editor-title-text">' + title + '</span></div>'
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

  function _renderLivePreview(rule) {
    var vars = _sampleVars()
    var html = ''

    if (_channelIncludes(rule.channel, 'whatsapp')) {
      var txt = _svc().renderTemplate(rule.content_template || '', vars)
      html += _renderPhonePreview(txt, rule.attachment_url)
    }

    if (_channelIncludes(rule.channel, 'alexa') && rule.alexa_message) {
      var alexaMsg = _svc().renderTemplate(rule.alexa_message, vars)
      var targetLabel = rule.alexa_target === 'recepcao' ? 'Recepcao'
        : rule.alexa_target === 'todos' ? 'Todos'
        : rule.alexa_target === 'profissional' ? 'Profissional' : 'Sala'
      html += '<div style="margin-top:12px;padding:14px;border-radius:12px;border-left:4px solid #06B6D4;background:#ECFEFF;font-size:13px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
        +   '<div style="display:flex;align-items:center;gap:6px;font-weight:700;color:#0891B2">'
        +     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0891B2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg>'
        +     ' Alexa (' + targetLabel + ')'
        +   '</div>'
        + '</div>'
        + '<div style="color:#0E7490;font-style:italic">"' + _esc(alexaMsg) + '"</div>'
        + '</div>'
    }

    if (_channelIncludes(rule.channel, 'task') && rule.task_title) {
      var pColor = { urgente:'#DC2626', alta:'#F59E0B', normal:'#3B82F6', baixa:'#6B7280' }[rule.task_priority] || '#3B82F6'
      html += '<div style="margin-top:12px;padding:12px;border-radius:10px;border-left:4px solid ' + pColor + ';background:' + pColor + '08;font-size:13px">'
        + '<div style="font-weight:700;color:' + pColor + ';display:flex;align-items:center;gap:4px;margin-bottom:4px">' + _feather('clipboard', 14) + ' Tarefa</div>'
        + '<div>' + _esc(rule.task_title) + '</div>'
        + '<div style="margin-top:2px;color:var(--text-secondary);font-size:11px">Para: ' + (rule.task_assignee||'sdr') + ' · Prazo: ' + (rule.task_deadline_hours||24) + 'h · ' + (rule.task_priority||'normal') + '</div>'
        + '</div>'
    }

    if (_channelIncludes(rule.channel, 'alert') && rule.alert_title) {
      var aColor = { info:'#3B82F6', warning:'#F59E0B', success:'#10B981', error:'#DC2626' }[rule.alert_type] || '#3B82F6'
      var aTitle = _svc().renderTemplate(rule.alert_title, vars)
      html += '<div style="margin-top:12px;padding:12px;border-radius:10px;border-left:4px solid ' + aColor + ';background:' + aColor + '10;font-size:13px">'
        + '<div style="font-weight:700;color:' + aColor + ';display:flex;align-items:center;gap:4px;margin-bottom:4px">' + _feather('bell', 14) + ' Alerta</div>'
        + '<div>' + _esc(aTitle) + '</div>'
        + '</div>'
    }

    if (!html) html = '<div class="aa-col-preview-empty">Preview vazio — preencha a regra.</div>'
    return html
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

  // ── Phone Preview (WhatsApp mockup) ────────────────────────
  function _renderPhonePreview(text, imageUrl) {
    var formatted = _waFormat(text)
    // Highlight {{vars}} remaining
    formatted = formatted.replace(/\{\{([^}]+)\}\}/g, '<span class="aa-wa-tag">{{$1}}</span>')

    var now = new Date()
    var hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    var imgHtml = imageUrl
      ? '<div class="aa-wa-img"><img src="' + _esc(imageUrl) + '" alt="anexo" loading="lazy"></div>'
      : ''

    var bubble
    if (imgHtml && formatted) {
      bubble = '<div class="aa-wa-bubble aa-wa-bubble-img">' + imgHtml + '<div class="aa-wa-text">' + formatted + '</div><div class="aa-wa-time">' + hhmm + ' \u2713\u2713</div></div>'
    } else if (imgHtml) {
      bubble = '<div class="aa-wa-bubble aa-wa-bubble-img">' + imgHtml + '<div class="aa-wa-time">' + hhmm + ' \u2713\u2713</div></div>'
    } else if (formatted) {
      bubble = '<div class="aa-wa-bubble">' + formatted + '<div class="aa-wa-time">' + hhmm + ' \u2713\u2713</div></div>'
    } else {
      bubble = '<div class="aa-wa-empty">Sem mensagem configurada</div>'
    }

    return '<div class="aa-phone" id="aaPhonePreview">'
      + '<div class="aa-phone-notch"></div>'
      + '<div class="aa-wa-header">'
      + '<div class="aa-wa-avatar"></div>'
      + '<div><div class="aa-wa-name">Clinica</div><div class="aa-wa-status">online</div></div>'
      + '</div>'
      + '<div class="aa-wa-chat">' + bubble + '</div>'
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

      // Variable tags bar (com tooltip explicativo)
      html += '<div class="aa-tags-bar">'
      svc.TEMPLATE_VARS.forEach(function(v) {
        var tip = v.label + (v.example ? ' — ex.: "' + v.example + '"' : '')
        html += '<button class="aa-tag-btn" data-var="' + v.id + '" title="' + _esc(tip) + '">{{' + v.id + '}}</button>'
      })
      html += '</div>'

      // Formatting toolbar
      html += '<div class="aa-fmt-bar">'
        + '<button class="aa-fmt-btn" data-fmt="*" title="Negrito"><b>B</b></button>'
        + '<button class="aa-fmt-btn" data-fmt="_" title="Italico"><i>I</i></button>'
        + '<button class="aa-fmt-btn" data-fmt="~" title="Tachado"><s>S</s></button>'
        + '</div>'

      html += '<textarea id="aaContent" rows="8" placeholder="Digite a mensagem...">' + _esc(f.content_template) + '</textarea>'

      // Image attachment area
      html += '<div class="aa-attach">'
      if (f.attachment_url) {
        html += '<div class="aa-attach-preview">'
          + '<img src="' + _esc(f.attachment_url) + '" alt="anexo">'
          + '<button type="button" class="aa-attach-remove" data-action="remove-image" title="Remover imagem">' + _feather('x', 14) + '</button>'
          + '</div>'
      } else {
        html += '<button type="button" class="aa-btn-attach" data-action="pick-image">'
          + _feather('image', 14) + ' Anexar imagem'
          + '</button>'
          + '<div class="aa-attach-hint">JPG, PNG, WEBP ou GIF — max 10 MB</div>'
      }
      html += '<input type="file" id="aaAttachInput" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none">'
      html += '</div>'

      html += '</div>'

      // Live preview
      html += _renderPhonePreview(_svc().renderTemplate(f.content_template, _sampleVars()), f.attachment_url)

      // Testar envio (dry-run — so mostra preview completo)
      html += '<div style="margin-top:8px;display:flex;justify-content:flex-end">'
        + '<button type="button" class="aa-btn-test" data-action="test-wa" title="Renderiza a mensagem final com dados de exemplo sem enviar">'
        + _feather('eye', 12) + ' Testar renderizacao'
        + '</button>'
        + '</div>'
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
        var tip = v.label + (v.example ? ' — ex.: "' + v.example + '"' : '')
        html += '<button class="aa-tag-btn" data-alexa-var="' + v.id + '" title="' + _esc(tip) + '">{{' + v.id + '}}</button>'
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
    root.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]')
      if (btn) {
        var action = btn.dataset.action
        if (action === 'new') {
          _form = _emptyForm()
          _form.channel = 'whatsapp' // default para nova regra
          // Inicia com trigger_type condizente com a tab atual
          if (_funnelTab === 'pre_agendamento') { _form.trigger_type = 'on_tag'; _form.trigger_config = { tag: 'lead_novo' } }
          else if (_funnelTab === 'perdido') { _form.trigger_type = 'on_tag'; _form.trigger_config = { tag: 'perdido' } }
          else if (_funnelTab === 'orcamento') { _form.trigger_type = 'on_tag'; _form.trigger_config = { tag: 'orcamento-aberto' } }
          else if (_funnelTab === 'paciente_orcamento') { _form.trigger_type = 'on_tag'; _form.trigger_config = { tag: 'orcamento_fechado' } }
          else if (_funnelTab === 'paciente') { _form.trigger_type = 'd_after'; _form.trigger_config = { days: 1, hour: 10, minute: 0 } }
          _editingRule = null
          _isCreating = true
          _render()
        }
        if (action === 'cancel') { _isCreating = false; _editingRule = null; _render() }
        if (action === 'save') _handleSave()
        if (action === 'pick-image') {
          var inp = document.getElementById('aaAttachInput')
          if (inp) inp.click()
        }
        if (action === 'remove-image') {
          _readForm()
          _form.attachment_url = ''
          _render()
        }
        if (action === 'test-wa') {
          _readForm()
          _refreshPreview()
          if (window._showToast) _showToast('Preview', 'Renderizado com dados de exemplo (nao enviado)', 'info')
        }
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

      // Category filter tabs
      // Funnel tab click (data-action=tab, data-tab=cid)
      var funnelTab = e.target.closest('[data-action="tab"]')
      if (funnelTab) {
        _funnelTab = funnelTab.dataset.tab
        _selectedId = null
        _isCreating = false
        _editingRule = null
        _render()
        return
      }

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
      // Channel change → re-render editor
      if (e.target.name === 'aaChannel') {
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
      _isCreating = false
      _editingRule = null
      // Seleciona a regra recem criada/editada se vier id
      if (res.data && res.data.id) _selectedId = res.data.id
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
