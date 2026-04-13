/**
 * ClinicAI — Templates Editor UI v2
 *
 * Layout 2 colunas: lista lateral + editor com phone preview.
 * Mesmas features do Disparos: toolbar formatacao, emojis, variaveis,
 * preview WhatsApp em tempo real, config de envio.
 *
 * Depende de:
 *   window.TemplatesRepository  (templates.repository.js)
 *   CSS: css/templates-editor.css + css/automations.css (phone preview)
 */

;(function () {
  'use strict'

  if (window._clinicaiTemplatesEditorLoaded) return
  window._clinicaiTemplatesEditorLoaded = true

  var _templates   = []
  var _loading     = false
  var _selectedId  = null
  var _activeTab   = 'pre_agendamento'
  var _tagCounts   = {}
  var _dirty       = {}
  var _saving      = {}

  // Tags do funil — grupos principais
  var CATEGORY_META = {
    pre_agendamento:     { label: 'Pre-agendamento',     color: '#7C3AED' },
    agendamento:         { label: 'Agendamento',         color: '#059669' },
    paciente:            { label: 'Paciente',            color: '#0891B2' },
    orcamento:           { label: 'Orcamento',           color: '#D97706' },
    paciente_orcamento:  { label: 'Paciente + Orcamento',color: '#2563EB' },
    perdido:             { label: 'Perdido',             color: '#9CA3AF' },
  }

  // Status por grupo de tag
  var STATUS_POR_GRUPO = {
    pre_agendamento: [
      'Lead Novo','Em Conversa','Lead Frio','Lead Morno','Lead Quente',
      'Sem Resposta','Qualificado','Desqualificado','Follow-up','Prioritario'
    ],
    agendamento: [
      'Agendado','Aguardando Confirmacao','Confirmado','Reagendado',
      'Cancelado','Falta (No-show)','Encaixe','Prioridade na Agenda'
    ],
    paciente: [
      'Paciente Ativo','Consulta Realizada','Procedimento Realizado',
      'Pos-consulta','Pos-procedimento','Aguardando Retorno',
      'Avaliacao Pendente','Avaliacao Realizada'
    ],
    orcamento: [
      'Orcamento em Aberto','Orcamento Enviado','Em Negociacao',
      'Follow-up Pendente','Aprovado — Agendar'
    ],
    paciente_orcamento: [
      'Orcamento Aberto','Orcamento Enviado','Em Negociacao',
      'Follow-up','Fechado'
    ],
    perdido: ['Perdido'],
  }

  var PREVIEW_VARS = {
    '{nome}':              'Maria Silva',
    '{clinica}':           'Clinica Mirian de Paula',
    '{queixa_principal}':  'bigode chines',
    '{data}':              'terca-feira, 15 de abril de 2026',
    '{data_consulta}':     '15/04/2026',
    '{hora}':              '14:30',
    '{hora_consulta}':     '14:30',
    '{endereco}':          'Av. Carneiro Leao, 296 - Sala 806, Centro Comercial Monumental - Maringa/PR',
    '{endereco_clinica}':  'Av. Carneiro Leao, 296 - Sala 806, Centro Comercial Monumental - Maringa/PR',
    '{link_maps}':         'https://maps.app.goo.gl/VCxLkAL6m15JLnaV7',
    '{procedimento}':      'Bioestimulador de Colageno',
    '{profissional}':      'Dra. Mirian de Paula',
    '{valor}':             'R$ 1.500,00',
    '{link}':              'https://miriandpaula.br',
    '{link_anamnese}':     'https://clinicai-dashboard.px1hdq.easypanel.host/form-render.html?slug=abc123',
    '{linha_procedimento}': '\n💆 *Procedimento:* Bioestimulador de Colageno',
    '{menu_clinica}':       'https://clinicai-dashboard.px1hdq.easypanel.host/menu-clinica.html',
  }

  var EMOJIS = '😊😍🔥✨💜🌟❤️👏🎉💪👋🙏💋😉🥰💎🌸⭐📍📅⏰📞💰🎁✅❌⚡🏆💡🤝👨‍⚕️💆🪞💄🌺💫'.match(/./gu) || []

  var ALL_VARS = Object.keys(PREVIEW_VARS)

  function _fmtDelay(day, hours, mins) {
    var d = parseInt(day) || 0
    var h = parseInt(hours) || 0
    var m = parseInt(mins) || 0
    if (d === 0 && h === 0 && m === 0) return 'imediata'
    var time = (h > 0 || m > 0) ? ' as ' + h + ':' + (m < 10 ? '0' : '') + m : ''
    if (d < 0) return Math.abs(d) + 'd antes' + time
    if (d > 0) return d + 'd depois' + time
    return 'no dia' + time
  }

  function _root() { return document.getElementById('templates-editor-root') }
  function _esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
  function _catMeta(c) { return CATEGORY_META[c] || CATEGORY_META.pre_agendamento }

  function _selected() {
    if (!_selectedId) return null
    return _templates.find(function (t) { return t.id === _selectedId }) || null
  }

  function _getContent(tpl) {
    var d = _dirty[tpl.id]
    return d ? d.content : tpl.content
  }

  function _getActive(tpl) {
    var d = _dirty[tpl.id]
    return d ? d.is_active : tpl.is_active
  }

  function _previewContent(content) {
    var text = content || ''
    for (var key in PREVIEW_VARS) text = text.split(key).join(PREVIEW_VARS[key])
    return text
  }

  function _fmtWa(text) {
    if (!text) return ''
    var h = _esc(text)
    h = h.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    h = h.replace(/_([^_\n]+)_/g, '<em>$1</em>')
    h = h.replace(/~([^~\n]+)~/g, '<del>$1</del>')
    h = h.replace(/\{(\w+)\}/g, '<span class="bc-wa-tag">[$1]</span>')
    h = h.replace(/\n/g, '<br>')
    return h
  }

  // ── Init ─────────────────────────────────────────────────────
  async function init() {
    if (_loading) return
    _loading = true
    _render()
    if (window.TemplatesRepository) {
      var r = await TemplatesRepository.list()
      if (r.ok) { _templates = r.data || []; _dirty = {} }
    }
    // Carregar contagem de leads por tag
    if (window._sbShared) {
      try {
        var rc = await window._sbShared.rpc('wa_tag_counts')
        if (rc.data) _tagCounts = rc.data
      } catch(e) {}
    }
    _loading = false
    if (_templates.length && !_selectedId) _selectedId = _templates[0].id
    _render()
  }

  // ── Render ───────────────────────────────────────────────────
  function _render() {
    var root = _root()
    if (!root) return

    if (_loading) {
      root.innerHTML = '<div class="te-page"><div class="te-loading"><div class="te-spinner"></div>Carregando templates...</div></div>'
      return
    }

    var tabs = _renderTabs()
    var filtered = _filteredTemplates()
    var list = _renderList(filtered)
    var editor = _renderEditor()

    root.innerHTML = '<div class="te-page">' +
      '<div class="te-header"><div class="te-header-left">' +
        '<h2 class="te-title">Templates de Mensagem</h2>' +
        '<p class="te-subtitle">' + _templates.filter(function(t){return _getActive(t)}).length +
          ' de ' + _templates.length + ' templates ativos</p>' +
      '</div>' +
      '<button class="te-new-btn" data-action="create">+ Novo Template</button>' +
      '</div>' +
      tabs +
      '<div class="te-layout">' +
        '<div class="te-sidebar">' + list + '</div>' +
        '<div class="te-main">' + editor + '</div>' +
      '</div>' +
    '</div>'

    _attachEvents(root)
  }

  function _renderTabs() {
    // Tabs fixas = exatamente os 6 grupos de tags do sistema
    var cats = Object.keys(CATEGORY_META)
    var html = '<div class="te-tabs">'
    cats.forEach(function (c) {
      var meta = _catMeta(c)
      var active = _activeTab === c ? ' te-tab-active' : ''
      var tplCount = _templates.filter(function(t){return (t.category||'pre_agendamento')===c}).length
      var leadCount = _tagCounts[c] || 0
      html += '<button class="te-tab' + active + '" data-action="tab" data-tab="' + c + '">' +
        meta.label + ' <span class="te-tab-count" title="' + leadCount + ' leads / ' + tplCount + ' msgs">' + leadCount + '</span></button>'
    })
    html += '</div>'
    return html
  }

  function _totalMinutes(t) {
    return ((parseInt(t.day) || 0) * 1440) + ((parseInt(t.delay_hours) || 0) * 60) + (parseInt(t.delay_minutes) || 0)
  }

  function _filteredTemplates() {
    var list = _templates.filter(function (t) { return (t.category || 'pre_agendamento') === _activeTab })
    list.sort(function (a, b) { return _totalMinutes(a) - _totalMinutes(b) })
    return list
  }

  function _renderList(items) {
    if (!items.length) return '<div class="te-empty-list">Nenhum template nesta categoria</div>'
    var html = ''
    items.forEach(function (t) {
      var meta = _catMeta(t.category || 'pre_agendamento')
      var sel = t.id === _selectedId ? ' te-item-selected' : ''
      var inactive = _getActive(t) ? '' : ' te-item-inactive'
      var delay = _fmtDelay(t.day, t.delay_hours, t.delay_minutes)
      var idx = items.indexOf(t)
      html += '<div class="te-item' + sel + inactive + '" data-action="select" data-id="' + _esc(t.id) + '">' +
        '<div class="te-item-order">' + (idx + 1) + '</div>' +
        '<div class="te-item-info">' +
          '<div class="te-item-name">' + _esc(t.name) + '</div>' +
          '<div class="te-item-cat">' + delay + '</div>' +
        '</div>' +
        '<div class="te-item-status">' + (_getActive(t) ? '<span class="te-badge-on">ON</span>' : '<span class="te-badge-off">OFF</span>') + '</div>' +
      '</div>'
    })
    return html
  }

  function _renderEditor() {
    var tpl = _selected()
    if (!tpl) return '<div class="te-no-selection">Selecione um template na lista</div>'

    var content = _getContent(tpl)
    var isActive = _getActive(tpl)
    var saving = _saving[tpl.id]
    var previewText = _fmtWa(_previewContent(content))
    var now = new Date()
    var timeStr = (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes()

    // Phone preview
    var imgBubble = mediaUrl ? '<div class="bc-wa-bubble bc-wa-img-bubble"><img class="bc-wa-preview-img" src="' + _esc(mediaUrl) + '" alt="media"></div>' : ''
    var textBubble = previewText ? '<div class="bc-wa-bubble"><div class="bc-wa-bubble-text">' + previewText + '</div><div class="bc-wa-bubble-time">' + timeStr + ' <svg width="14" height="8" viewBox="0 0 16 8" fill="none" stroke="#53bdeb" stroke-width="1.5"><polyline points="1 4 4 7 9 2"/><polyline points="5 4 8 7 13 2"/></svg></div></div>' : ''
    var chatContent = (mediaPos === 'below') ? (textBubble + imgBubble) : (imgBubble + textBubble)

    var phone = '<div class="bc-phone">' +
      '<div class="bc-phone-notch"><span class="bc-phone-notch-time">' + timeStr + '</span></div>' +
      '<div class="bc-wa-header">' +
        '<div class="bc-wa-avatar"><svg width="18" height="18" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>' +
        '<div><div class="bc-wa-name">Clinica Mirian de Paula</div><div class="bc-wa-status">online</div></div>' +
      '</div>' +
      '<div class="bc-wa-chat" id="tePhoneChat">' +
        (chatContent || '<div class="bc-wa-empty">Escreva a mensagem ao lado</div>') +
      '</div>' +
      '<div class="bc-wa-bottom"><div class="bc-wa-input-mock">Mensagem</div><div class="bc-wa-send-mock"><svg width="16" height="16" fill="#fff" viewBox="0 0 24 24"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg></div></div>' +
      '<div class="bc-phone-home"></div>' +
    '</div>'

    // Toolbar
    var toolbar = '<div class="te-toolbar">' +
      '<div class="bc-tags-bar">' +
        '<button class="bc-fmt-btn" data-action="fmt" data-fmt="bold" title="Negrito">B</button>' +
        '<button class="bc-fmt-btn" data-action="fmt" data-fmt="italic" title="Italico"><em>I</em></button>' +
        '<button class="bc-fmt-btn" data-action="fmt" data-fmt="strike" title="Riscado"><s>S</s></button>' +
        '<button class="bc-fmt-btn" data-action="fmt" data-fmt="mono" title="Mono">&lt;/&gt;</button>' +
        '<span class="bc-fmt-sep"></span>' +
        '<button class="bc-fmt-btn" data-action="emoji-toggle" title="Emojis">😊</button>' +
      '</div>' +
      '<div class="te-emoji-picker" id="teEmojiPicker" style="display:none"><div class="bc-emoji-picker">' +
        EMOJIS.map(function(e){ return '<button class="bc-emoji-btn" data-action="emoji" data-emoji="' + e + '">' + e + '</button>' }).join('') +
      '</div></div>' +
    '</div>'

    // Media section
    var mediaUrl = (d && d.media_url !== undefined) ? d.media_url : (tpl.metadata && tpl.metadata.media_url || '')
    var mediaPos = (d && d.media_position) ? d.media_position : (tpl.metadata && tpl.metadata.media_position || 'above')
    var mediaHtml = '<div class="te-media-section">' +
      '<div class="te-media-row">' +
        '<button type="button" class="bc-media-upload-btn" data-action="media-upload" style="font-size:12px;padding:6px 12px">Enviar imagem</button>' +
        '<input type="file" id="teMediaFile" accept="image/*" style="display:none">' +
        '<input type="text" class="te-config-input" data-action="media-url" data-id="' + _esc(tpl.id) + '" placeholder="https://... (URL da imagem)" value="' + _esc(mediaUrl) + '" style="flex:1;font-size:12px">' +
      '</div>' +
      (mediaUrl ? '<div class="te-media-preview">' +
        '<img src="' + _esc(mediaUrl) + '" alt="preview" style="max-height:120px;border-radius:8px">' +
        '<button class="bc-media-remove" data-action="media-remove" data-id="' + _esc(tpl.id) + '" title="Remover" style="position:absolute;top:4px;right:4px">x</button>' +
      '</div>' +
      '<div class="te-media-pos">' +
        '<label style="font-size:11px;cursor:pointer"><input type="radio" name="teMediaPos" value="above"' + (mediaPos === 'above' ? ' checked' : '') + ' data-action="media-pos" data-id="' + _esc(tpl.id) + '"> Acima do texto</label>' +
        '<label style="font-size:11px;cursor:pointer;margin-left:12px"><input type="radio" name="teMediaPos" value="below"' + (mediaPos === 'below' ? ' checked' : '') + ' data-action="media-pos" data-id="' + _esc(tpl.id) + '"> Abaixo do texto</label>' +
      '</div>' : '') +
    '</div>'

    // Variables — inline com toolbar
    var varsHtml = '<div class="te-vars-row">' +
      ALL_VARS.map(function(v){ return '<span class="te-var-tag" data-action="insert-var" data-var="' + _esc(v) + '">' + _esc(v.replace(/[{}]/g, '')) + '</span>' }).join('') +
    '</div>'

    // Config section
    var d = _dirty[tpl.id] || {}
    var dayVal = d.day !== undefined ? d.day : (tpl.day != null ? tpl.day : '')
    var catVal = d.category || tpl.category || 'pre_agendamento'
    var nameVal = d.name || tpl.name || ''

    var catOptions = Object.keys(CATEGORY_META).map(function (k) {
      return '<option value="' + k + '"' + (catVal === k ? ' selected' : '') + '>' + CATEGORY_META[k].label + '</option>'
    }).join('')

    var TYPE_OPTIONS = [
      { v: '',              l: 'Sem objetivo', icon: '' },
      { v: 'confirmacao',   l: 'Confirmacao',             icon: '✓' },
      { v: 'lembrete',      l: 'Lembrete',                icon: '⏰' },
      { v: 'engajamento',   l: 'Engajamento',             icon: '⚡' },
      { v: 'boas_vindas',   l: 'Boas-Vindas',             icon: '👋' },
      { v: 'consent_img',   l: 'Consentimento de Imagem', icon: '📸' },
      { v: 'consent_info',  l: 'Consentimento Informado', icon: '📋' },
      { v: 'report_imagem', l: 'Report Facial — Imagem',  icon: '📊' },
      { v: 'report_html',   l: 'Report Facial — HTML',    icon: '📎' },
      { v: 'recuperacao',   l: 'Recuperacao',              icon: '🔄' },
    ]
    var typeVal = d.type !== undefined ? d.type : (tpl.type || '')
    var typeOptions = TYPE_OPTIONS.map(function (o) {
      return '<option value="' + o.v + '"' + (typeVal === o.v ? ' selected' : '') + '>' + (o.icon ? o.icon + ' ' : '') + o.l + '</option>'
    }).join('')

    var delayHours = d.delay_hours !== undefined ? d.delay_hours : (tpl.delay_hours || 0)
    var delayMins = d.delay_minutes !== undefined ? d.delay_minutes : (tpl.delay_minutes || 0)
    var triggerPhase = d.trigger_phase !== undefined ? d.trigger_phase : (tpl.trigger_phase || '')

    // Status dinamico baseado na categoria do template
    var statusList = STATUS_POR_GRUPO[catVal] || []
    var statusOptions = '<option value="">Todos (dispara na tag)</option>' +
      statusList.map(function (s) {
        var sv = s.toLowerCase().replace(/[^a-z0-9]+/g, '_')
        return '<option value="' + sv + '"' + (triggerPhase === sv ? ' selected' : '') + '>' + s + '</option>'
      }).join('')

    var configHtml = '<div class="te-config">' +
      '<div class="te-config-row">' +
        '<label class="te-config-label">Objetivo</label>' +
        '<select class="te-config-select" data-action="edit-type" data-id="' + _esc(tpl.id) + '" style="flex:1">' + typeOptions + '</select>' +
      '</div>' +
      '<div class="te-config-row">' +
        '<label class="te-config-label">Nome</label>' +
        '<input type="text" class="te-config-input" data-action="edit-name" data-id="' + _esc(tpl.id) + '" value="' + _esc(nameVal) + '">' +
      '</div>' +
      '<div class="te-config-row">' +
        '<label class="te-config-label">Status</label>' +
        '<select class="te-config-select" data-action="edit-trigger-phase" data-id="' + _esc(tpl.id) + '" style="flex:1">' + statusOptions + '</select>' +
      '</div>' +
      '<div class="te-config-row">' +
        '<label class="te-config-label">Quando</label>' +
        (function() {
          var isAgendamento = catVal === 'agendamento'
          var dayN = parseInt(dayVal) || 0
          var mode = (dayN === 0 && delayHours === 0 && delayMins === 0) ? 'imediata'
                   : (dayN === 0) ? 'no_dia'
                   : (dayN < 0) ? 'dias_antes'
                   : 'dias_depois'

          var modeOptions = isAgendamento
            ? '<option value="imediata"' + (mode==='imediata'?' selected':'') + '>Imediata</option>' +
              '<option value="no_dia"' + (mode==='no_dia'?' selected':'') + '>No dia da consulta</option>' +
              '<option value="dias_antes"' + (mode==='dias_antes'?' selected':'') + '>Dias antes da consulta</option>'
            : '<option value="imediata"' + (mode==='imediata'?' selected':'') + '>Imediata</option>' +
              '<option value="no_dia"' + (mode==='no_dia'?' selected':'') + '>No mesmo dia</option>' +
              '<option value="dias_depois"' + (mode==='dias_depois'?' selected':'') + '>Dias depois</option>'

          var html = '<div style="display:flex;gap:6px;align-items:center;flex:1;flex-wrap:wrap">' +
            '<select class="te-config-select" data-action="edit-delay-mode" data-id="' + _esc(tpl.id) + '">' + modeOptions + '</select>'

          if (mode === 'dias_antes') {
            html += '<input type="number" class="te-config-input" data-action="edit-day" data-id="' + _esc(tpl.id) + '" value="' + Math.abs(dayN) + '" min="1" max="30" style="width:50px;text-align:center">' +
              '<span style="font-size:11px;color:var(--text-muted)">dia(s)</span>'
          }
          if (mode === 'dias_depois') {
            html += '<input type="number" class="te-config-input" data-action="edit-day-pos" data-id="' + _esc(tpl.id) + '" value="' + Math.abs(dayN) + '" min="1" max="365" style="width:50px;text-align:center">' +
              '<span style="font-size:11px;color:var(--text-muted)">dia(s)</span>'
          }
          if (mode !== 'imediata') {
            html += '<span style="font-size:11px;color:var(--text-muted)">as</span>' +
              '<input type="number" class="te-config-input" data-action="edit-delay-hours" data-id="' + _esc(tpl.id) + '" value="' + delayHours + '" min="0" max="23" style="width:45px;text-align:center">' +
              '<span style="font-size:11px;color:var(--text-muted)">:</span>' +
              '<input type="number" class="te-config-input" data-action="edit-delay-minutes" data-id="' + _esc(tpl.id) + '" value="' + delayMins + '" min="0" max="59" style="width:45px;text-align:center">'
          }
          html += '</div>'
          return html
        })() +
      '</div>' +
      '<div class="te-config-row">' +
        '<label class="te-config-label">Status</label>' +
        '<label class="te-toggle"><input type="checkbox" class="te-toggle-input" data-action="toggle" data-id="' + _esc(tpl.id) + '"' + (isActive ? ' checked' : '') + '><span class="te-toggle-track"></span></label>' +
        '<span class="te-config-hint">' + (isActive ? 'Ativo' : 'Inativo') + '</span>' +
      '</div>' +
      '<div class="te-config-row">' +
        '<label class="te-config-label">Slug</label>' +
        '<code class="te-slug">' + _esc(tpl.slug) + '</code>' +
      '</div>' +
    '</div>'

    // Action buttons
    var saveBtn = '<div class="te-save-row">' +
      '<button class="te-delete-btn" data-action="delete" data-id="' + _esc(tpl.id) + '" title="Excluir template">Excluir</button>' +
      '<button class="te-save-btn' + (saving === 'ok' ? ' te-save-btn-success' : '') + '" data-action="save" data-id="' + _esc(tpl.id) + '"' + (saving === true ? ' disabled' : '') + '>' +
        (saving === true ? 'Salvando...' : saving === 'ok' ? 'Salvo' : 'Salvar alteracoes') +
      '</button>' +
    '</div>'

    return '<div class="te-editor-layout">' +
      '<div class="te-editor-left">' +
        '<h3 class="te-editor-title">' + _esc(tpl.name) + '</h3>' +
        toolbar +
        varsHtml +
        '<textarea class="te-content-area" id="teContent" data-action="edit" data-id="' + _esc(tpl.id) + '" rows="8">' + _esc(content) + '</textarea>' +
        mediaHtml +
        configHtml +
        saveBtn +
      '</div>' +
      '<div class="te-editor-right">' + phone + '</div>' +
    '</div>'
  }

  // ── Events ───────────────────────────────────────────────────
  function _attachEvents(root) {
    root.onclick = function (e) {
      var el = e.target.closest('[data-action]')
      if (!el) return
      var action = el.dataset.action
      if (action === 'tab') { _activeTab = el.dataset.tab; _render() }
      else if (action === 'select') { _selectedId = el.dataset.id; _render() }
      else if (action === 'toggle') { _onToggle(el.dataset.id, el.checked) }
      else if (action === 'save') { _onSave(el.dataset.id) }
      else if (action === 'insert-var') { _insertAtCursor(el.dataset.var) }
      else if (action === 'fmt') { _applyFmt(el.dataset.fmt) }
      else if (action === 'emoji-toggle') { var p = document.getElementById('teEmojiPicker'); if (p) p.style.display = p.style.display === 'none' ? '' : 'none' }
      else if (action === 'emoji') { _insertAtCursor(el.dataset.emoji); var pk = document.getElementById('teEmojiPicker'); if (pk) pk.style.display = 'none' }
      else if (action === 'create') { _onCreate() }
      else if (action === 'delete') { _onDelete(el.dataset.id) }
      else if (action === 'media-upload') { var fi = document.getElementById('teMediaFile'); if (fi) fi.click() }
      else if (action === 'media-remove') { _onEditField(el.dataset.id, 'media_url', ''); _render() }
      else if (action === 'media-pos') {
        _onEditField(el.dataset.id, 'media_position', el.value)
        var ta = document.getElementById('teContent')
        if (ta) _updatePhonePreview(ta.value)
      }
    }
    root.oninput = function (e) {
      var a = e.target.dataset.action, id = e.target.dataset.id
      if (a === 'edit') _onEdit(id, e.target.value)
      else if (a === 'edit-name') _onEditField(id, 'name', e.target.value)
    }
    root.onchange = function (e) {
      var a = e.target.dataset.action, id = e.target.dataset.id
      if (a === 'edit-delay-mode') {
        var mode = e.target.value
        if (mode === 'imediata') { _onEditField(id, 'day', 0); _onEditField(id, 'delay_hours', 0); _onEditField(id, 'delay_minutes', 0) }
        else if (mode === 'no_dia') { _onEditField(id, 'day', 0); _onEditField(id, 'delay_hours', 10); _onEditField(id, 'delay_minutes', 0) }
        else if (mode === 'dias_antes') { _onEditField(id, 'day', -1); _onEditField(id, 'delay_hours', 12); _onEditField(id, 'delay_minutes', 30) }
        else if (mode === 'dias_depois') { _onEditField(id, 'day', 1); _onEditField(id, 'delay_hours', 10); _onEditField(id, 'delay_minutes', 0) }
        _render(); return
      }
      else if (a === 'edit-day') _onEditField(id, 'day', -(parseInt(e.target.value) || 1))
      else if (a === 'edit-day-pos') _onEditField(id, 'day', parseInt(e.target.value) || 1)
      else if (a === 'edit-delay-hours') _onEditField(id, 'delay_hours', parseInt(e.target.value) || 0)
      else if (a === 'edit-delay-minutes') _onEditField(id, 'delay_minutes', parseInt(e.target.value) || 0)
      else if (a === 'edit-trigger-phase') _onEditField(id, 'trigger_phase', e.target.value)
      else if (a === 'edit-type') _onEditField(id, 'type', e.target.value)
      else if (a === 'edit-category') _onEditField(id, 'category', e.target.value)
      else if (a === 'toggle') _onToggle(id, e.target.checked)
      else if (a === 'media-url') {
        _onEditField(id, 'media_url', e.target.value)
        _render()
      }
      else if (e.target.id === 'teMediaFile') { _handleMediaUpload(e.target) }
    }
  }

  function _onEdit(id, value) {
    var tpl = _templates.find(function(t){return t.id===id})
    if (!tpl) return
    if (!_dirty[id]) _dirty[id] = { content: tpl.content, is_active: tpl.is_active }
    _dirty[id].content = value
    _updatePhonePreview(value)
  }

  function _updatePhonePreview(content) {
    var chat = document.getElementById('tePhoneChat')
    if (!chat) return
    var tpl = _selected()
    var d = tpl ? (_dirty[tpl.id] || {}) : {}
    var mediaUrl = d.media_url !== undefined ? d.media_url : (tpl && tpl.metadata && tpl.metadata.media_url || '')
    var mediaPos = d.media_position || (tpl && tpl.metadata && tpl.metadata.media_position || 'above')

    var now = new Date()
    var ts = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0')
    var checkSvg = '<svg width="14" height="8" viewBox="0 0 16 8" fill="none" stroke="#53bdeb" stroke-width="1.5"><polyline points="1 4 4 7 9 2"/><polyline points="5 4 8 7 13 2"/></svg>'

    var imgBubble = ''
    if (mediaUrl) {
      imgBubble = '<div class="bc-wa-bubble bc-wa-img-bubble"><img src="' + _esc(mediaUrl) + '" class="bc-wa-preview-img"><div class="bc-wa-bubble-time">' + ts + ' ' + checkSvg + '</div></div>'
    }

    var textBubble = ''
    var text = _fmtWa(_previewContent(content))
    if (text) {
      textBubble = '<div class="bc-wa-bubble"><div class="bc-wa-bubble-text">' + text + '</div><div class="bc-wa-bubble-time">' + ts + ' ' + checkSvg + '</div></div>'
    }

    if (!textBubble && !imgBubble) {
      chat.innerHTML = '<div class="bc-wa-empty">Escreva a mensagem ao lado</div>'
    } else {
      chat.innerHTML = (mediaPos === 'below') ? textBubble + imgBubble : imgBubble + textBubble
    }
  }

  async function _handleMediaUpload(fileInput) {
    if (!fileInput.files || !fileInput.files[0]) return
    var file = fileInput.files[0]
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      if (window._toastWarn) _toastWarn('Selecione imagem ou video'); return
    }
    var tpl = _selected()
    if (!tpl) return
    var env = window.ClinicEnv || {}
    var sbUrl = env.SUPABASE_URL || 'https://oqboitkpcvuaudouwvkl.supabase.co'
    var sbKey = env.SUPABASE_KEY || ''
    var ts = Date.now()
    var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    var path = 'templates/' + ts + '-' + safeName
    try {
      var resp = await fetch(sbUrl + '/storage/v1/object/media/' + path, {
        method: 'POST',
        headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey, 'Content-Type': file.type, 'x-upsert': 'true' },
        body: file
      })
      if (!resp.ok) throw new Error('Upload falhou: ' + resp.status)
      var publicUrl = sbUrl + '/storage/v1/object/public/media/' + path
      _onEditField(tpl.id, 'media_url', publicUrl)
      _render()
      if (window._showToast) _showToast('Midia enviada', safeName, 'success')
    } catch (err) {
      if (window._toastErr) _toastErr('Erro no upload: ' + err.message)
    }
    fileInput.value = ''
  }

  function _onEditField(id, field, value) {
    var tpl = _templates.find(function(t){return t.id===id})
    if (!tpl) return
    if (!_dirty[id]) _dirty[id] = { content: tpl.content, is_active: tpl.is_active }
    _dirty[id][field] = value
  }

  function _onCreate() {
    var defaultCat = _activeTab || 'agendamento'
    var catOptions = Object.keys(CATEGORY_META).map(function (k) {
      return '<option value="' + k + '"' + (k === defaultCat ? ' selected' : '') + '>' + CATEGORY_META[k].label + '</option>'
    }).join('')

    var overlay = document.createElement('div')
    overlay.className = 'te-create-overlay'
    overlay.innerHTML = '<div class="te-create-modal">' +
      '<h3 style="margin:0 0 16px;font-size:16px;font-weight:700;color:var(--text-primary)">Novo Template</h3>' +
      '<div style="margin-bottom:12px"><label class="te-config-label" style="display:block;margin-bottom:4px">Nome</label>' +
        '<input type="text" id="teNewName" class="te-config-input" style="width:100%" placeholder="Ex: Lembrete 48h antes" autofocus></div>' +
      '<div style="margin-bottom:16px"><label class="te-config-label" style="display:block;margin-bottom:4px">Categoria</label>' +
        '<select id="teNewCat" class="te-config-select" style="width:100%">' + catOptions + '</select></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="teNewCancel" style="padding:8px 16px;font-size:13px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--card);color:var(--text-secondary);cursor:pointer">Cancelar</button>' +
        '<button id="teNewConfirm" style="padding:8px 20px;font-size:13px;font-weight:600;border:none;border-radius:var(--radius-md);background:var(--accent-gold);color:#fff;cursor:pointer">Criar</button>' +
      '</div>' +
    '</div>'

    document.body.appendChild(overlay)
    var nameInput = document.getElementById('teNewName')
    if (nameInput) nameInput.focus()

    document.getElementById('teNewCancel').onclick = function () { overlay.remove() }
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove() }

    document.getElementById('teNewConfirm').onclick = async function () {
      var name = (document.getElementById('teNewName').value || '').trim()
      var cat = document.getElementById('teNewCat').value || 'pre_agendamento'
      if (!name) { if (window._toastWarn) _toastWarn('Informe o nome do template'); return }
      var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

      this.disabled = true
      this.textContent = 'Criando...'

      var r = await TemplatesRepository.create({
        name: name, slug: slug, category: cat,
        content: 'Ola, {nome}! ', is_active: true,
      })
      overlay.remove()

      if (r.ok) {
        _templates.push(r.data)
        _selectedId = r.data.id
        _activeTab = cat
        _render()
        if (window._showToast) _showToast('Template criado', name, 'success')
      } else {
        if (window._toastErr) _toastErr('Erro ao criar: ' + (r.error || ''))
      }
    }

    if (nameInput) nameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('teNewConfirm').click()
      if (e.key === 'Escape') overlay.remove()
    })
  }

  async function _onDelete(id) {
    var tpl = _templates.find(function(t){return t.id===id})
    if (!tpl) return
    if (!confirm('Excluir "' + tpl.name + '"? Essa acao nao pode ser desfeita.')) return
    var r = await TemplatesRepository.remove(id)
    if (r.ok) {
      _templates = _templates.filter(function(t){return t.id!==id})
      delete _dirty[id]
      if (_selectedId === id) _selectedId = _templates.length ? _templates[0].id : null
      _render()
      if (window._showToast) _showToast('Template excluido', tpl.name, 'success')
    } else {
      if (window._toastErr) _toastErr('Erro ao excluir: ' + (r.error || ''))
    }
  }

  function _onToggle(id, checked) {
    var tpl = _templates.find(function(t){return t.id===id})
    if (!tpl) return
    if (!_dirty[id]) _dirty[id] = { content: tpl.content, is_active: tpl.is_active }
    _dirty[id].is_active = checked
    _render()
  }

  function _insertAtCursor(text) {
    var ta = document.getElementById('teContent')
    if (!ta) return
    var s = ta.selectionStart, e = ta.selectionEnd
    ta.value = ta.value.substring(0, s) + text + ta.value.substring(e)
    ta.selectionStart = ta.selectionEnd = s + text.length
    ta.focus()
    _onEdit(ta.dataset.id, ta.value)
  }

  function _applyFmt(fmt) {
    var ta = document.getElementById('teContent')
    if (!ta) return
    var s = ta.selectionStart, e = ta.selectionEnd
    var sel = ta.value.substring(s, e)
    if (!sel) return
    var wrap = { bold: '*', italic: '_', strike: '~', mono: '```' }
    var w = wrap[fmt] || '*'
    ta.value = ta.value.substring(0, s) + w + sel + w + ta.value.substring(e)
    ta.selectionStart = s + w.length
    ta.selectionEnd = e + w.length
    ta.focus()
    _onEdit(ta.dataset.id, ta.value)
  }

  async function _onSave(id) {
    if (_saving[id]) return
    var d = _dirty[id]
    var tpl = _templates.find(function(t){return t.id===id})
    if (!tpl) return
    var content = d ? d.content : tpl.content
    var isActive = d ? d.is_active : tpl.is_active
    var extras = {}
    if (d && d.day !== undefined) extras.day = d.day
    if (d && d.category) extras.category = d.category
    if (d && d.name) extras.name = d.name
    if (d && d.type !== undefined) extras.type = d.type
    if (d && d.delay_hours !== undefined) extras.delay_hours = d.delay_hours
    if (d && d.delay_minutes !== undefined) extras.delay_minutes = d.delay_minutes
    if (d && d.trigger_phase !== undefined) extras.trigger_phase = d.trigger_phase
    // Persist media in metadata
    if (d && (d.media_url !== undefined || d.media_position)) {
      var meta = Object.assign({}, tpl.metadata || {})
      if (d.media_url !== undefined) meta.media_url = d.media_url
      if (d.media_position) meta.media_position = d.media_position
      extras.metadata = meta
    }
    _saving[id] = true
    _render()
    var r = await TemplatesRepository.update(id, content, isActive, Object.keys(extras).length ? extras : undefined)
    if (r.ok) {
      tpl.content = content; tpl.is_active = isActive
      if (extras.day !== undefined) tpl.day = extras.day
      if (extras.category) tpl.category = extras.category
      if (extras.name) tpl.name = extras.name
      if (extras.type !== undefined) tpl.type = extras.type
      if (extras.delay_hours !== undefined) tpl.delay_hours = extras.delay_hours
      if (extras.delay_minutes !== undefined) tpl.delay_minutes = extras.delay_minutes
      if (extras.trigger_phase !== undefined) tpl.trigger_phase = extras.trigger_phase
      delete _dirty[id]
      _saving[id] = 'ok'
      _render()
      if (window._showToast) _showToast('Template salvo', tpl.name, 'success')
      setTimeout(function(){ if (_saving[id]==='ok'){ delete _saving[id]; _render() } }, 2000)
    } else {
      delete _saving[id]
      _render()
      if (window._toastErr) _toastErr('Erro ao salvar: ' + (r.error||'desconhecido'))
    }
  }

  window.TemplatesEditorUI = Object.freeze({ init: init })
})()
