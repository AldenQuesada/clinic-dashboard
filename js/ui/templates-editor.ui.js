/**
 * ClinicAI — Templates Editor UI
 *
 * Tela Settings > Templates de Mensagem para editar templates WhatsApp.
 * Renderiza na div #templates-editor-root da page-settings-templates.
 *
 * Funcionalidades:
 *   - Listar templates agrupados por categoria
 *   - Editar conteudo inline (textarea)
 *   - Toggle ativo/inativo por template
 *   - Salvar alteracoes por template
 *   - Preview com substituicao de variaveis
 *
 * Depende de:
 *   window.TemplatesRepository  (templates.repository.js)
 */

;(function () {
  'use strict'

  if (window._clinicaiTemplatesEditorLoaded) return
  window._clinicaiTemplatesEditorLoaded = true

  // ── Estado ──────────────────────────────────────────────────

  let _templates   = []
  let _loading     = false
  let _initialized = false
  let _dirty       = {}       // { [id]: { content, is_active } }
  let _saving      = {}       // { [id]: true }
  let _previewing  = {}       // { [id]: true }
  let _collapsed   = {}       // { [category]: true }

  // ── Constantes ──────────────────────────────────────────────

  const CATEGORY_META = {
    onboarding:   { label: 'Onboarding',              color: '#7C3AED', icon: 'zap' },
    follow_up:    { label: 'Follow-up',               color: '#2563EB', icon: 'refreshCw' },
    agendamento:  { label: 'Agendamento',             color: '#059669', icon: 'calendar' },
    pos_consulta: { label: 'Pos-consulta',            color: '#0891B2', icon: 'heart' },
    recuperacao:  { label: 'Recuperacao',              color: '#D97706', icon: 'userPlus' },
    broadcasting: { label: 'Broadcasting',            color: '#DC2626', icon: 'radio' },
    geral:        { label: 'Geral',                   color: '#6B7280', icon: 'messageCircle' },
  }

  const PREVIEW_VARS = {
    '{nome}':             'Maria Silva',
    '{queixa_principal}': 'bigode chines',
    '{data_consulta}':    '15/04/2026',
    '{hora_consulta}':    '14:30',
    '{endereco_clinica}': 'Av. Paulista, 1000 - Sao Paulo',
    '{procedimento}':     'Bioestimulador de Colageno',
    '{valor}':            'R$ 1.500,00',
    '{link}':             'https://clinica.com.br/agendar',
  }

  // ── Root ─────────────────────────────────────────────────────

  function _root() { return document.getElementById('templates-editor-root') }

  // ── Init (chamado pelo sidebar ao navegar para a pagina) ─────

  async function init() {
    if (_loading) return
    _loading = true
    _render()
    await _fetchTemplates()
    _loading = false
    _render()
    _initialized = true
  }

  // ── Fetch ────────────────────────────────────────────────────

  async function _fetchTemplates() {
    if (!window.TemplatesRepository) {
      console.warn('[TemplatesEditorUI] TemplatesRepository nao encontrado')
      return
    }
    const result = await window.TemplatesRepository.list()
    if (result.ok) {
      _templates = result.data || []
      _dirty = {}
    } else {
      console.warn('[TemplatesEditorUI] list:', result.error)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function _feather(name, size) {
    size = size || 14
    return '<svg width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">' + _featherPath(name) + '</svg>'
  }

  function _featherPath(name) {
    var paths = {
      zap:            '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      refreshCw:      '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
      calendar:       '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
      heart:          '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
      userPlus:       '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
      radio:          '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>',
      messageCircle:  '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
      chevronDown:    '<polyline points="6 9 12 15 18 9"/>',
      check:          '<polyline points="20 6 9 17 4 12"/>',
      eye:            '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
      save:           '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    }
    return paths[name] || ''
  }

  function _catMeta(cat) {
    return CATEGORY_META[cat] || CATEGORY_META.geral
  }

  function _groupByCategory(templates) {
    var groups = {}
    var order  = []
    for (var i = 0; i < templates.length; i++) {
      var t   = templates[i]
      var cat = t.category || 'geral'
      if (!groups[cat]) {
        groups[cat] = []
        order.push(cat)
      }
      groups[cat].push(t)
    }
    return { groups: groups, order: order }
  }

  function _getDirty(id) {
    return _dirty[id] || null
  }

  function _previewContent(content) {
    var text = content || ''
    for (var key in PREVIEW_VARS) {
      text = text.split(key).join(PREVIEW_VARS[key])
    }
    return text
  }

  function _extractVars(content) {
    var matches = (content || '').match(/\{[a-z_]+\}/g)
    if (!matches) return []
    var unique = []
    for (var i = 0; i < matches.length; i++) {
      if (unique.indexOf(matches[i]) === -1) unique.push(matches[i])
    }
    return unique
  }

  // ── Render ──────────────────────────────────────────────────

  function _render() {
    var root = _root()
    if (!root) return

    if (_loading) {
      root.innerHTML = '<div class="te-page">' +
        _renderHeader() +
        '<div class="te-loading"><div class="te-spinner"></div>Carregando templates...</div>' +
        '</div>'
      return
    }

    if (!_templates.length) {
      root.innerHTML = '<div class="te-page">' +
        _renderHeader() +
        '<div class="te-empty">' +
          '<div class="te-empty-icon">' + _feather('messageCircle', 28) + '</div>' +
          '<div class="te-empty-title">Nenhum template encontrado</div>' +
          '<div class="te-empty-sub">Os templates de mensagem serao listados aqui quando configurados no sistema.</div>' +
        '</div>' +
        '</div>'
      return
    }

    var grouped = _groupByCategory(_templates)
    var html = '<div class="te-page">' + _renderHeader() + '<div class="te-categories">'

    for (var i = 0; i < grouped.order.length; i++) {
      var cat       = grouped.order[i]
      var items     = grouped.groups[cat]
      var meta      = _catMeta(cat)
      var collapsed = _collapsed[cat] ? ' te-collapsed' : ''
      var activeCount = 0
      for (var j = 0; j < items.length; j++) {
        var d = _getDirty(items[j].id)
        var isActive = d ? d.is_active : items[j].is_active
        if (isActive) activeCount++
      }

      html += '<div class="te-category-group' + collapsed + '" data-category="' + _esc(cat) + '">'
      html += '<div class="te-category-header" data-action="toggle-category" data-category="' + _esc(cat) + '">'
      html += '<div class="te-category-icon" style="background:' + meta.color + '15;color:' + meta.color + '">' + _feather(meta.icon, 18) + '</div>'
      html += '<div class="te-category-name">' + _esc(meta.label) + '</div>'
      html += '<div class="te-category-count">' + activeCount + '/' + items.length + ' ativos</div>'
      html += '<div class="te-category-arrow">' + _feather('chevronDown', 14) + '</div>'
      html += '</div>'
      html += '<div class="te-category-body">'

      for (var k = 0; k < items.length; k++) {
        html += _renderCard(items[k])
      }

      html += '</div></div>'
    }

    html += '</div></div>'
    root.innerHTML = html
    _attachEvents()
  }

  function _renderHeader() {
    var total  = _templates.length
    var active = 0
    for (var i = 0; i < _templates.length; i++) {
      var d = _getDirty(_templates[i].id)
      var isActive = d ? d.is_active : _templates[i].is_active
      if (isActive) active++
    }

    return '<div class="te-header">' +
      '<div class="te-header-left">' +
        '<h2 class="te-title">Templates de Mensagem</h2>' +
        '<p class="te-subtitle">' + active + ' de ' + total + ' templates ativos &mdash; edite o conteudo e alterne o status de cada template</p>' +
      '</div>' +
    '</div>'
  }

  function _renderCard(tpl) {
    var dirty    = _getDirty(tpl.id)
    var content  = dirty ? dirty.content : tpl.content
    var isActive = dirty ? dirty.is_active : tpl.is_active
    var saving   = _saving[tpl.id]
    var preview  = _previewing[tpl.id]
    var inactiveCls = isActive ? '' : ' te-card-inactive'
    var vars = _extractVars(content)

    var html = '<div class="te-card' + inactiveCls + '" data-id="' + _esc(tpl.id) + '">'

    // top row
    html += '<div class="te-card-top">'
    html += '<span class="te-card-name">' + _esc(tpl.name) + '</span>'
    html += '<span class="te-card-slug">' + _esc(tpl.slug) + '</span>'
    html += '<span class="te-card-spacer"></span>'
    html += '<div class="te-card-actions">'

    // preview toggle
    html += '<button class="te-preview-toggle' + (preview ? ' te-active' : '') + '" data-action="preview" data-id="' + _esc(tpl.id) + '" title="Preview">'
    html += _feather('eye', 12) + ' Preview'
    html += '</button>'

    // toggle active/inactive
    html += '<label class="te-toggle" title="' + (isActive ? 'Ativo' : 'Inativo') + '">'
    html += '<input type="checkbox" class="te-toggle-input" data-action="toggle" data-id="' + _esc(tpl.id) + '"' + (isActive ? ' checked' : '') + '>'
    html += '<span class="te-toggle-track"></span>'
    html += '</label>'

    // save button
    html += '<button class="te-save-btn' + (saving === 'ok' ? ' te-save-btn-success' : '') + '" data-action="save" data-id="' + _esc(tpl.id) + '"' + (saving === true ? ' disabled' : '') + '>'
    if (saving === true) {
      html += 'Salvando...'
    } else if (saving === 'ok') {
      html += _feather('check', 12) + ' Salvo'
    } else {
      html += _feather('save', 12) + ' Salvar'
    }
    html += '</button>'

    html += '</div></div>'

    // textarea
    html += '<textarea class="te-content-area" data-action="edit" data-id="' + _esc(tpl.id) + '" rows="4">' + _esc(content) + '</textarea>'

    // variables hint
    if (vars.length) {
      html += '<div class="te-vars-hint">Variaveis: '
      for (var i = 0; i < vars.length; i++) {
        html += '<span class="te-var-tag" data-action="insert-var" data-var="' + _esc(vars[i]) + '" data-id="' + _esc(tpl.id) + '">' + _esc(vars[i]) + '</span>'
      }
      html += '</div>'
    }

    // preview box
    if (preview) {
      html += '<div class="te-preview-box">' + _esc(_previewContent(content)) + '</div>'
    }

    html += '</div>'
    return html
  }

  // ── Events ──────────────────────────────────────────────────

  function _attachEvents() {
    var root = _root()
    if (!root) return

    root.addEventListener('click', function (e) {
      var target = e.target.closest('[data-action]')
      if (!target) return
      var action = target.dataset.action
      var id     = target.dataset.id

      if (action === 'toggle-category') {
        _onToggleCategory(target.dataset.category)
      } else if (action === 'toggle') {
        _onToggleActive(id, target.checked)
      } else if (action === 'save') {
        _onSave(id)
      } else if (action === 'preview') {
        _onTogglePreview(id)
      } else if (action === 'insert-var') {
        _onInsertVar(id, target.dataset.var)
      }
    })

    root.addEventListener('input', function (e) {
      var target = e.target
      if (target.dataset.action === 'edit' && target.dataset.id) {
        _onEdit(target.dataset.id, target.value)
      }
    })
  }

  function _onToggleCategory(cat) {
    _collapsed[cat] = !_collapsed[cat]
    _render()
  }

  function _onToggleActive(id, checked) {
    var tpl = _findTemplate(id)
    if (!tpl) return
    if (!_dirty[id]) {
      _dirty[id] = { content: tpl.content, is_active: tpl.is_active }
    }
    _dirty[id].is_active = checked
    _render()
  }

  function _onEdit(id, value) {
    var tpl = _findTemplate(id)
    if (!tpl) return
    if (!_dirty[id]) {
      _dirty[id] = { content: tpl.content, is_active: tpl.is_active }
    }
    _dirty[id].content = value
    // Don't re-render on every keystroke — just update preview if open
    if (_previewing[id]) {
      var previewBox = _root().querySelector('.te-card[data-id="' + id + '"] .te-preview-box')
      if (previewBox) {
        previewBox.textContent = _previewContent(value)
      }
    }
  }

  function _onTogglePreview(id) {
    _previewing[id] = !_previewing[id]
    _render()
  }

  function _onInsertVar(id, varName) {
    var textarea = _root().querySelector('textarea[data-id="' + id + '"]')
    if (!textarea) return
    var start = textarea.selectionStart
    var end   = textarea.selectionEnd
    var val   = textarea.value
    textarea.value = val.substring(0, start) + varName + val.substring(end)
    textarea.selectionStart = textarea.selectionEnd = start + varName.length
    textarea.focus()
    _onEdit(id, textarea.value)
  }

  async function _onSave(id) {
    if (_saving[id] === true) return
    var dirty = _getDirty(id)
    var tpl   = _findTemplate(id)
    if (!tpl) return

    var content  = dirty ? dirty.content  : tpl.content
    var isActive = dirty ? dirty.is_active : tpl.is_active

    _saving[id] = true
    _render()

    var result = await window.TemplatesRepository.update(id, content, isActive)

    if (result.ok) {
      // Update local state
      tpl.content   = content
      tpl.is_active = isActive
      delete _dirty[id]
      _saving[id] = 'ok'
      _render()
      _showToast('Template salvo com sucesso')
      // Clear success state after 2s
      setTimeout(function () {
        if (_saving[id] === 'ok') {
          delete _saving[id]
          _render()
        }
      }, 2000)
    } else {
      delete _saving[id]
      _render()
      _showToast('Erro ao salvar: ' + (result.error || 'erro desconhecido'), true)
    }
  }

  function _findTemplate(id) {
    for (var i = 0; i < _templates.length; i++) {
      if (_templates[i].id === id) return _templates[i]
    }
    return null
  }

  // ── Toast ───────────────────────────────────────────────────

  function _showToast(msg, isError) {
    var existing = document.querySelector('.te-toast')
    if (existing) existing.remove()

    var el = document.createElement('div')
    el.className = 'te-toast' + (isError ? ' te-toast-error' : '')
    el.textContent = msg
    document.body.appendChild(el)

    setTimeout(function () { el.remove() }, 3000)
  }

  // ── Exposicao global ──────────────────────────────────────────
  window.TemplatesEditorUI = Object.freeze({ init: init })

})()
