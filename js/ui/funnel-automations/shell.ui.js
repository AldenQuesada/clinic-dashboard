/**
 * ClinicAI — Funil Automations Shell (router + layout + modal)
 *
 * Roteia entre 6 modulos self-contained em window.FAModules.
 * Cada modulo renderiza seus proprios trigger fields.
 * Shell cuida de: tabs, lista, editor wrapper, modal, salvamento.
 *
 * Depende de:
 *   window.AAShared                    — componentes compartilhados
 *   window.FAModules[*]                — 6 modulos isolados
 *   window.AgendaAutomationsRepository — save/list/remove/toggle
 */
;(function () {
  'use strict'
  if (window._faShellLoaded) return
  window._faShellLoaded = true

  var S = function() { return window.AAShared }
  var REPO = function() { return window.AgendaAutomationsRepository }

  // Ordem das tabs
  var MODULE_ORDER = ['pre_agendamento', 'agendamento', 'paciente', 'orcamento', 'paciente_orcamento', 'perdido']

  // ── State ──────────────────────────────────────────────────
  var _rules = []
  var _loading = false
  var _saving = false
  var _activeModule = 'agendamento'
  var _selectedId = null
  var _modalOpen = false
  var _form = _emptyForm()
  var _root = null

  function _emptyForm() {
    return {
      // Trigger fields (definidos pelo modulo ativo)
      status: '', when: 'immediate',
      // Campos comuns
      name: '', description: '',
      channel: 'whatsapp',
      content_template: '',
      attachment_url: '',
      attachment_above_text: true,
      alert_title: '', alert_type: 'info',
      task_title: '', task_assignee: 'sdr', task_priority: 'normal', task_deadline_hours: 24,
      alexa_message: '', alexa_target: 'sala',
      is_active: true, sort_order: 0,
      recipient_type: 'patient',
    }
  }

  function _mod() { return window.FAModules && window.FAModules[_activeModule] }
  function _esc(s) { return S().esc(s) }
  function _f(n, sz) { return S().feather(n, sz) }

  // ── Load ───────────────────────────────────────────────────
  async function _load() {
    _loading = true; _render()
    try {
      var res = await REPO().list()
      _rules = (res.ok && Array.isArray(res.data)) ? res.data : []
    } catch (e) { _rules = [] }
    _loading = false; _render()
  }

  function _rulesInModule() {
    var m = _mod()
    if (!m) return []
    return _rules.filter(function(r) { return m.matchesRule(r) })
  }

  // ── Render ─────────────────────────────────────────────────
  function _render() {
    if (!_root) return
    _root.innerHTML = _renderPage()
  }

  function _renderPage() {
    if (_loading) {
      return '<div class="fa-page">' + _renderTopHeader() + '<div class="fa-loading">Carregando...</div></div>'
    }
    return '<div class="fa-page">'
      + _renderTopHeader()
      + _renderTabs()
      + '<div class="fa-grid">'
      +   '<div class="fa-col-list">' + _renderList() + '</div>'
      +   '<div class="fa-col-editor">' + _renderEditorColumn() + '</div>'
      +   '<div class="fa-col-preview">' + _renderPreviewColumn() + '</div>'
      + '</div>'
      + (_modalOpen ? _renderModal() : '')
      + '</div>'
  }

  function _renderTopHeader() {
    var total = _rulesInModule().length
    return '<div class="fa-top">'
      +   '<div class="fa-top-left">'
      +     '<div class="fa-title">Funis de Automacao</div>'
      +     '<div class="fa-subtitle">' + total + ' regras nesta fase · isolamento total</div>'
      +   '</div>'
      +   '<button type="button" class="fa-btn-new" data-action="new">' + _f('plus', 14) + ' Nova automacao</button>'
      + '</div>'
  }

  function _renderTabs() {
    var html = MODULE_ORDER.map(function(id) {
      var m = window.FAModules[id]
      if (!m) return ''
      var count = _rules.filter(function(r) { return m.matchesRule(r) }).length
      var active = _activeModule === id ? ' fa-tab-active' : ''
      return '<button type="button" class="fa-tab' + active + '" data-tab="' + id + '" style="--acc:'+m.color+'">'
        + _f(m.icon, 14) + ' ' + m.label + ' <span class="fa-tab-count">' + count + '</span></button>'
    }).join('')
    return '<div class="fa-tabs">' + html + '</div>'
  }

  function _renderList() {
    var rules = _rulesInModule()
    if (!rules.length) {
      return '<div class="fa-list-empty">'
        + _f('inbox', 24) + '<br>Nenhuma regra nesta fase.<br>Clique em <b>+ Nova automacao</b>.'
        + '</div>'
    }
    return '<div class="fa-list">' + rules.map(function(r, i) { return _renderRuleCard(r, i+1) }).join('') + '</div>'
  }

  function _renderRuleCard(r, num) {
    var sel = _selectedId === r.id ? ' fa-card-selected' : ''
    var inactive = r.is_active ? '' : ' fa-card-inactive'
    var status = r.is_active ? 'ON' : 'OFF'
    var statusCls = r.is_active ? 'fa-status-on' : 'fa-status-off'
    var sub = _ruleSubtitle(r)
    return '<div class="fa-card' + sel + inactive + '" data-select="' + _esc(r.id) + '">'
      +   '<div class="fa-card-num">' + num + '</div>'
      +   '<div class="fa-card-body">'
      +     '<div class="fa-card-name">' + _esc(r.name) + '</div>'
      +     '<div class="fa-card-sub">' + _esc(sub) + '</div>'
      +   '</div>'
      +   '<div class="fa-card-status ' + statusCls + '">' + status + '</div>'
      + '</div>'
  }

  function _ruleSubtitle(r) {
    var m = _mod()
    if (!m) return ''
    var f = m.fromRule(r)
    var status = (m.statuses.find(function(s){return s.id===f.status})||{}).label || f.status || '—'
    var when = (m.timeOptions.find(function(t){return t.id===f.when})||{}).label || ''
    return status + ' · ' + when
  }

  // ── Coluna 2: Editor (regra selecionada) ───────────────────
  function _renderEditorColumn() {
    if (_modalOpen) {
      return '<div class="fa-empty-col">' + _f('edit3', 24) + '<br>Editando no modal</div>'
    }
    if (!_selectedId) {
      return '<div class="fa-empty-col">' + _f('mousePointer', 24)
        + '<br>Selecione uma regra na lista para editar'
        + '<br>ou clique em <b>+ Nova automacao</b>.</div>'
    }
    var r = _rules.find(function(x){return x.id===_selectedId})
    if (!r) return '<div class="fa-empty-col">Regra nao encontrada</div>'

    // Carrega _form a partir da regra
    if (!_form.__loadedFromId || _form.__loadedFromId !== r.id) {
      _form = _formFromRule(r)
      _form.__loadedFromId = r.id
    }

    return '<div class="fa-editor">'
      + _renderEditorHeader(r)
      + '<div class="fa-editor-body">' + _renderForm() + '</div>'
      + _renderEditorFooter(r)
      + '</div>'
  }

  function _renderEditorHeader(r) {
    return '<div class="fa-editor-header">'
      +   '<div class="fa-editor-title">' + _f('edit3', 16) + ' <span>' + _esc(r.name) + '</span></div>'
      +   '<label class="fa-switch"><input type="checkbox" ' + (r.is_active?'checked':'') + ' data-toggle="' + _esc(r.id) + '"><span class="fa-switch-slider"></span></label>'
      + '</div>'
  }

  function _renderEditorFooter(r) {
    return '<div class="fa-editor-footer">'
      +   '<button type="button" class="fa-btn-del" data-delete="' + _esc(r.id) + '">' + _f('trash2', 14) + ' Excluir</button>'
      +   '<div style="flex:1"></div>'
      +   '<button type="button" class="fa-btn-save" data-action="save">' + (_saving?'Salvando...':'Salvar alteracoes') + '</button>'
      + '</div>'
  }

  // ── Form (editor compartilhado modal + coluna central) ─────
  function _renderForm() {
    var m = _mod()
    if (!m) return '<div class="fa-empty-col">Modulo nao carregado</div>'
    var f = _form

    return ''
      // Secao 1 — Identificacao
      + '<div class="fa-section">'
      +   '<div class="fa-section-title">' + _f('tag', 11) + ' Identificacao</div>'
      +   '<div class="fa-field"><label>Nome</label>'
      +     '<input type="text" id="faName" value="'+_esc(f.name)+'" placeholder="Ex: Confirmacao D-1"></div>'
      +   '<div class="fa-field"><label>Descricao</label>'
      +     '<input type="text" id="faDesc" value="'+_esc(f.description)+'" placeholder="(opcional)"></div>'
      + '</div>'
      // Secao 2 — Gatilho (modulo renderiza seus campos)
      + '<div class="fa-section">'
      +   '<div class="fa-section-title">' + _f('zap', 11) + ' Gatilho · ' + m.label + '</div>'
      +   m.renderTriggerFields(f)
      + '</div>'
      // Secao 3 — Canal + config por canal
      + '<div class="fa-section">'
      +   '<div class="fa-section-title">' + _f('send', 11) + ' Como avisar</div>'
      +   S().renderChannelChecks(f.channel)
      +   _renderChannelBlocks(f)
      + '</div>'
  }

  function _renderChannelBlocks(f) {
    var html = ''
    if (S().channelIncludes(f.channel, 'whatsapp')) html += _blockWhatsapp(f)
    if (S().channelIncludes(f.channel, 'alexa'))    html += _blockAlexa(f)
    if (S().channelIncludes(f.channel, 'task'))     html += _blockTask(f)
    if (S().channelIncludes(f.channel, 'alert'))    html += _blockAlert(f)
    return html
  }

  function _blockWhatsapp(f) {
    return '<div class="fa-channel-block">'
      +   '<div class="fa-channel-block-title">' + _f('messageCircle', 12) + ' WhatsApp</div>'
      +   S().renderChipsBar('var')
      +   S().renderFormatToolbar()
      +   '<textarea id="faContent" rows="6" placeholder="Digite a mensagem...">'+_esc(f.content_template)+'</textarea>'
      +   S().renderAttachArea(f.attachment_url)
      + '</div>'
  }

  function _blockAlexa(f) {
    var targets = [
      {id:'sala',label:'Sala'},{id:'recepcao',label:'Recepcao'},
      {id:'profissional',label:'Profissional'},{id:'todos',label:'Todos'},
    ]
    var opts = targets.map(function(t){ return '<option value="'+t.id+'"'+(f.alexa_target===t.id?' selected':'')+'>'+t.label+'</option>' }).join('')
    return '<div class="fa-channel-block">'
      +   '<div class="fa-channel-block-title">' + _f('speaker', 12) + ' Alexa</div>'
      +   '<div class="fa-field"><label>Dispositivo alvo</label><select id="faAlexaTarget">'+opts+'</select></div>'
      +   '<div class="fa-field"><label>Mensagem</label>' + S().renderChipsBar('alexa-var')
      +     '<textarea id="faAlexaMsg" rows="3" placeholder="Ex: Dra {{profissional}}, paciente {{nome}} na recepcao.">'+_esc(f.alexa_message)+'</textarea>'
      +   '</div>'
      + '</div>'
  }

  function _blockTask(f) {
    var assignees = [
      {id:'sdr',label:'SDR / Comercial'},{id:'secretaria',label:'Secretaria'},
      {id:'cs',label:'CS / Pos-venda'},{id:'clinica',label:'Equipe Clinica'},{id:'gestao',label:'Gestao'},
    ]
    var priorities = [
      {id:'urgente',label:'Urgente'},{id:'alta',label:'Alta'},
      {id:'normal',label:'Normal'},{id:'baixa',label:'Baixa'},
    ]
    var aOpts = assignees.map(function(a){ return '<option value="'+a.id+'"'+((f.task_assignee||'sdr')===a.id?' selected':'')+'>'+a.label+'</option>' }).join('')
    var pOpts = priorities.map(function(p){ return '<option value="'+p.id+'"'+((f.task_priority||'normal')===p.id?' selected':'')+'>'+p.label+'</option>' }).join('')
    return '<div class="fa-channel-block">'
      +   '<div class="fa-channel-block-title">' + _f('clipboard', 12) + ' Tarefa</div>'
      +   '<div class="fa-field"><label>Titulo</label>'
      +     '<input type="text" id="faTaskTitle" value="'+_esc(f.task_title||'')+'" placeholder="Ex: Confirmar presenca"></div>'
      +   '<div class="fa-field-row">'
      +     '<div class="fa-field"><label>Responsavel</label><select id="faTaskAssignee">'+aOpts+'</select></div>'
      +     '<div class="fa-field"><label>Prioridade</label><select id="faTaskPriority">'+pOpts+'</select></div>'
      +     '<div class="fa-field"><label>Prazo (h)</label><input type="number" id="faTaskDeadline" min="1" max="720" value="'+(f.task_deadline_hours||24)+'"></div>'
      +   '</div>'
      + '</div>'
  }

  function _blockAlert(f) {
    return '<div class="fa-channel-block">'
      +   '<div class="fa-channel-block-title">' + _f('bell', 12) + ' Alerta Visual</div>'
      +   '<div class="fa-field"><label>Titulo</label>'
      +     '<input type="text" id="faAlertTitle" value="'+_esc(f.alert_title||'')+'" placeholder="Ex: Paciente chegou"></div>'
      +   '<div class="fa-field"><label>Tipo</label><select id="faAlertType">'
      +     '<option value="info"'+(f.alert_type==='info'?' selected':'')+'>Info</option>'
      +     '<option value="warning"'+(f.alert_type==='warning'?' selected':'')+'>Aviso</option>'
      +     '<option value="success"'+(f.alert_type==='success'?' selected':'')+'>Sucesso</option>'
      +     '<option value="error"'+(f.alert_type==='error'?' selected':'')+'>Erro</option>'
      +   '</select></div>'
      + '</div>'
  }

  // ── Coluna 3: Preview ───────────────────────────────────────
  function _renderPreviewColumn() {
    if (_modalOpen) return '<div class="fa-col-preview-empty">' + _f('smartphone', 24) + '<br>Preview no modal</div>'
    if (!_selectedId && !_form.content_template && !_form.alexa_message && !_form.task_title && !_form.alert_title) {
      return '<div class="fa-col-preview-empty">' + _f('smartphone', 24) + '<br>Preview ao vivo aqui</div>'
    }
    return _renderLivePreview(_form)
  }

  function _renderLivePreview(rule) {
    var html = ''
    if (S().channelIncludes(rule.channel, 'whatsapp')) {
      html += S().renderPhonePreview(rule.content_template, rule.attachment_url, rule.attachment_above_text !== false)
    }
    if (S().channelIncludes(rule.channel, 'alexa')) {
      html += S().renderAlexaPreview(rule.alexa_message, rule.alexa_target)
    }
    if (S().channelIncludes(rule.channel, 'task')) {
      html += S().renderTaskPreview(rule.task_title, rule.task_assignee, rule.task_priority, rule.task_deadline_hours)
    }
    if (S().channelIncludes(rule.channel, 'alert')) {
      html += S().renderAlertPreview(rule.alert_title, rule.alert_type)
    }
    return html || '<div class="fa-col-preview-empty">Preview vazio</div>'
  }

  // ── Modal criar nova ───────────────────────────────────────
  function _renderModal() {
    var m = _mod()
    return '<div class="fa-modal-overlay" data-action="modal-backdrop">'
      +   '<div class="fa-modal" role="dialog">'
      +     '<div class="fa-modal-header">'
      +       '<div class="fa-modal-title">' + _f('plus', 16) + ' Nova automacao · ' + (m?m.label:'') + '</div>'
      +       '<button type="button" class="fa-btn-icon" data-action="modal-close">' + _f('x', 16) + '</button>'
      +     '</div>'
      +     '<div class="fa-modal-body">'
      +       '<div class="fa-modal-editor">' + _renderForm() + '</div>'
      +       '<div class="fa-modal-preview">' + _renderLivePreview(_form) + '</div>'
      +     '</div>'
      +     '<div class="fa-modal-footer">'
      +       '<button type="button" class="fa-btn-cancel" data-action="modal-close">Cancelar</button>'
      +       '<button type="button" class="fa-btn-save" data-action="save">' + (_saving?'Salvando...':'Criar automacao') + '</button>'
      +     '</div>'
      +   '</div>'
      + '</div>'
  }

  // ── Form IO ─────────────────────────────────────────────────
  function _formFromRule(r) {
    var m = _mod()
    var triggerForm = m ? m.fromRule(r) : { status: '', when: 'immediate' }
    var out = _emptyForm()
    Object.keys(triggerForm).forEach(function(k){ out[k] = triggerForm[k] })
    out.name = r.name || ''
    out.description = r.description || ''
    out.channel = r.channel || 'whatsapp'
    out.content_template = r.content_template || ''
    out.attachment_url = r.attachment_url || ''
    out.attachment_above_text = r.attachment_above_text !== false
    out.alert_title = r.alert_title || ''
    out.alert_type = r.alert_type || 'info'
    out.task_title = r.task_title || ''
    out.task_assignee = r.task_assignee || 'sdr'
    out.task_priority = r.task_priority || 'normal'
    out.task_deadline_hours = r.task_deadline_hours || 24
    out.alexa_message = r.alexa_message || ''
    out.alexa_target = r.alexa_target || 'sala'
    out.is_active = r.is_active
    out.sort_order = r.sort_order || 0
    out.recipient_type = r.recipient_type || 'patient'
    return out
  }

  function _readForm() {
    function v(id) { var e = document.getElementById(id); return e ? e.value : '' }
    var m = _mod()
    if (m) {
      var triggerForm = m.readTriggerForm()
      Object.keys(triggerForm).forEach(function(k){ _form[k] = triggerForm[k] })
    }
    _form.name = v('faName')
    _form.description = v('faDesc')
    _form.content_template = v('faContent')
    _form.alert_title = v('faAlertTitle')
    _form.alert_type = v('faAlertType') || 'info'
    _form.task_title = v('faTaskTitle')
    _form.task_assignee = v('faTaskAssignee') || 'sdr'
    _form.task_priority = v('faTaskPriority') || 'normal'
    _form.task_deadline_hours = parseInt(v('faTaskDeadline')) || 24
    _form.alexa_message = v('faAlexaMsg')
    _form.alexa_target = v('faAlexaTarget') || 'sala'

    var chs = Array.prototype.slice.call(document.querySelectorAll('input[name=faChannel]:checked'))
      .map(function(el){ return el.value })
    _form.channel = S().combineChannels(chs)
  }

  // ── Save ────────────────────────────────────────────────────
  async function _handleSave() {
    _readForm()
    var m = _mod()
    if (!m) { S().showToast('Erro', 'Modulo nao carregado', 'error'); return }
    if (!_form.name.trim()) { S().showToast('Validacao', 'Nome obrigatorio', 'warning'); return }
    if (!_form.channel) { S().showToast('Validacao', 'Marque ao menos 1 canal', 'warning'); return }
    var v = m.validate(_form)
    if (!v.ok) { S().showToast('Validacao', v.error, 'warning'); return }

    var trig = m.toTrigger(_form)
    var data = {
      name: _form.name,
      description: _form.description,
      channel: _form.channel,
      content_template: _form.content_template || _form.alexa_message || '-',
      attachment_url: _form.attachment_url || null,
      attachment_above_text: _form.attachment_above_text !== false,
      alert_title: _form.alert_title,
      alert_type: _form.alert_type,
      task_title: _form.task_title,
      task_assignee: _form.task_assignee,
      task_priority: _form.task_priority,
      task_deadline_hours: _form.task_deadline_hours,
      alexa_message: _form.alexa_message,
      alexa_target: _form.alexa_target,
      is_active: _form.is_active,
      sort_order: _form.sort_order,
      recipient_type: _form.recipient_type,
      category: _activeModule, // legacy, mantido por compat
      trigger_type: trig.trigger_type,
      trigger_config: trig.trigger_config,
    }
    if (_selectedId && !_modalOpen) data.id = _selectedId

    _saving = true; _render()
    var res = await REPO().upsert(data)
    _saving = false

    if (res.ok) {
      _modalOpen = false
      if (res.data && res.data.id) _selectedId = res.data.id
      _form = _emptyForm()
      S().showToast('Salvo', _form.name + ' gravada', 'success')
      await _load()
    } else {
      S().showToast('Erro', res.error || 'Falha ao salvar', 'error')
      _render()
    }
  }

  // ── Events ──────────────────────────────────────────────────
  function _bindEvents(root) {
    if (!root) return

    // ESC fecha modal
    if (!window._faEscBound) {
      window._faEscBound = true
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && _modalOpen) {
          _modalOpen = false; _form = _emptyForm(); _render()
        }
      })
    }

    root.addEventListener('click', function(e) {
      var el = e.target.closest('[data-action]')
      if (el) {
        var a = el.dataset.action
        if (a === 'new') {
          _form = _emptyForm(); _modalOpen = true; _selectedId = null; _render(); return
        }
        if (a === 'modal-close' || a === 'modal-backdrop') {
          if (a === 'modal-backdrop' && e.target !== el) return
          _modalOpen = false; _form = _emptyForm(); _render(); return
        }
        if (a === 'save') { _handleSave(); return }
        if (a === 'pick-image') { var ai = document.getElementById('faAttachInput'); if (ai) ai.click(); return }
        if (a === 'remove-image') { _readForm(); _form.attachment_url = ''; _render(); return }
        if (a === 'speak-alexa') { _readForm(); S().speakAlexa(S().renderTemplate(_form.alexa_message || 'Mensagem vazia', S().SAMPLE_VARS)); return }
        if (a === 'simulate-alert') { _readForm(); S().showToast('Automacao', S().renderTemplate(_form.alert_title||'Alerta', S().SAMPLE_VARS), _form.alert_type || 'info'); return }
      }

      var tab = e.target.closest('[data-tab]')
      if (tab) { _activeModule = tab.dataset.tab; _selectedId = null; _form = _emptyForm(); _render(); return }

      var sel = e.target.closest('[data-select]')
      if (sel) { _selectedId = sel.dataset.select; _render(); return }

      var tog = e.target.closest('[data-toggle]')
      if (tog) { e.stopPropagation(); REPO().toggle(tog.dataset.toggle).then(_load); return }

      var del = e.target.closest('[data-delete]')
      if (del) {
        if (confirm('Excluir esta regra?')) {
          REPO().remove(del.dataset.delete).then(function(){ _selectedId = null; _load() })
        }
        return
      }

      // Inserir var no textarea
      var varBtn = e.target.closest('[data-var]')
      if (varBtn) {
        var ta = document.getElementById('faContent')
        if (ta) {
          var tag = '{{' + varBtn.dataset.var + '}}'
          var s = ta.selectionStart
          ta.value = ta.value.slice(0,s) + tag + ta.value.slice(ta.selectionEnd)
          ta.selectionStart = ta.selectionEnd = s + tag.length
          ta.focus(); _form.content_template = ta.value
          _refreshPreview()
        }
        return
      }
      var avBtn = e.target.closest('[data-alexa-var]')
      if (avBtn) {
        var ta2 = document.getElementById('faAlexaMsg')
        if (ta2) {
          var tag2 = '{{' + avBtn.dataset.alexaVar + '}}'
          var s2 = ta2.selectionStart
          ta2.value = ta2.value.slice(0,s2) + tag2 + ta2.value.slice(ta2.selectionEnd)
          ta2.selectionStart = ta2.selectionEnd = s2 + tag2.length
          ta2.focus(); _form.alexa_message = ta2.value
        }
        return
      }
      // Formatacao
      var fmt = e.target.closest('[data-fmt]')
      if (fmt) {
        var ta3 = document.getElementById('faContent')
        if (ta3) {
          var w = fmt.dataset.fmt
          var s3 = ta3.selectionStart, e3 = ta3.selectionEnd
          var sel3 = ta3.value.slice(s3, e3)
          if (sel3) {
            ta3.value = ta3.value.slice(0,s3) + w + sel3 + w + ta3.value.slice(e3)
            ta3.selectionStart = s3; ta3.selectionEnd = e3 + w.length * 2
          }
          ta3.focus(); _form.content_template = ta3.value
          _refreshPreview()
        }
        return
      }
    })

    root.addEventListener('input', function(e) {
      if (e.target.id === 'faContent') { _form.content_template = e.target.value; _schedulePreview() }
      if (e.target.id === 'faAlexaMsg') { _form.alexa_message = e.target.value }
      if (e.target.id === 'faName') { _form.name = e.target.value }
    })

    root.addEventListener('change', function(e) {
      // Channel checkbox → re-render
      if (e.target.name === 'faChannel') { _readForm(); _render(); return }
      // When select → re-render (mostra/esconde campos)
      if (e.target.id === 'faWhen') { _readForm(); _render(); return }
      // Upload imagem
      if (e.target.id === 'faAttachInput') {
        var file = e.target.files && e.target.files[0]
        if (!file) return
        _readForm()
        S().showToast('Upload', 'Enviando imagem...', 'info')
        S().uploadAttachment(file).then(function(url) {
          _form.attachment_url = url
          S().showToast('Upload', 'Imagem anexada', 'success')
          _render()
        }).catch(function(err) { S().showToast('Erro', err.message || 'Upload falhou', 'error') })
      }
    })
  }

  var _previewTimer = null
  function _schedulePreview() {
    if (_previewTimer) clearTimeout(_previewTimer)
    _previewTimer = setTimeout(_refreshPreview, 100)
  }
  function _refreshPreview() {
    var preview = document.querySelector(_modalOpen ? '.fa-modal-preview' : '.fa-col-preview')
    if (!preview) return
    preview.innerHTML = _renderLivePreview(_form)
  }

  // ── Init ────────────────────────────────────────────────────
  function init(rootId) {
    var el = document.getElementById(rootId || 'funnel-automations-root')
    if (!el) return
    if (_root !== el) { _root = el; _bindEvents(_root) }
    _loading = true
    _root.innerHTML = _renderPage()
    _load()
  }

  window.FunnelAutomationsUI = Object.freeze({ init: init })
})()
