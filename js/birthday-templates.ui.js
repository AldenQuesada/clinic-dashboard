/**
 * ClinicAI — Birthday Templates UI
 *
 * Timeline visual da sequencia de mensagens + editor inline + phone preview.
 * Permite adicionar/editar/remover mensagens na sequencia.
 *
 * Depende de: BirthdayUI (esc, ico), BirthdayService
 */
;(function () {
  'use strict'
  if (window._clinicaiBirthdayTmplUILoaded) return
  window._clinicaiBirthdayTmplUILoaded = true

  var _esc = function (s) { return window.BirthdayUI ? window.BirthdayUI.esc(s) : s }
  var _ico = function (n, sz) { return window.BirthdayUI ? window.BirthdayUI.ico(n, sz) : '' }

  var _editId = null  // template being edited (null = none, 'new' = creating)
  var _previewLead = { name: 'Maria', queixas: 'flacidez e rugas', age_turning: 45, has_open_budget: true, budget_title: 'Lifting 5D', budget_total: 3500 }

  function getEditId() { return _editId }
  function setEditId(id) { _editId = id }

  // ── WhatsApp text formatting ───────────────────────────────
  function _waFormat(text) {
    var t = _esc(text)
    t = t.replace(/\*_([^_]+)_\*/g, '<b><i>$1</i></b>')
    t = t.replace(/_\*([^\*]+)\*_/g, '<i><b>$1</b></i>')
    t = t.replace(/\*([^\*]+)\*/g, '<b>$1</b>')
    t = t.replace(/_([^_]+)_/g, '<i>$1</i>')
    t = t.replace(/~([^~]+)~/g, '<s>$1</s>')
    t = t.replace(/\n/g, '<br>')
    return t
  }

  // ── Main render ────────────────────────────────────────────
  function render() {
    var svc = window.BirthdayService
    if (!svc) return ''
    var templates = svc.getTemplatesSorted()
    var html = ''

    // Timeline header
    html += '<div class="bday-tl-header">'
    html += '<div class="bday-section-title">' + _ico('git-branch', 16) + ' Sequencia de mensagens</div>'
    html += '<button class="bday-add-tmpl" id="bdayAddTmpl">' + _ico('plus-circle', 14) + ' Adicionar mensagem</button>'
    html += '</div>'

    // Timeline
    html += '<div class="bday-timeline">'

    // Birthday marker (end point)
    html += '<div class="bday-tl-marker bday-tl-birthday">'
    html += '<div class="bday-tl-dot bday-tl-dot-bday"></div>'
    html += '<div class="bday-tl-label">' + _ico('gift', 14) + ' Aniversario</div>'
    html += '</div>'

    if (!templates.length) {
      html += '<div class="bday-empty" style="margin:20px 0">Nenhuma mensagem configurada. Clique em "Adicionar mensagem" para comecar.</div>'
    } else {
      templates.forEach(function (t) {
        var isEditing = _editId === t.id
        html += _renderTimelineNode(t, isEditing)
      })
    }

    // New template (appended at end of timeline)
    if (_editId === 'new') {
      html += _renderTimelineNode({
        id: null, day_offset: 30, send_hour: 10, label: '', content: '',
        media_url: '', is_active: true, sort_order: templates.length + 1
      }, true)
    }

    html += '</div>' // close timeline

    // Variables hint
    html += '<div class="bday-tmpl-vars">'
    html += '<span class="bday-var-title">Variaveis:</span>'
    html += '<code>[nome]</code> Primeiro nome'
    html += '<code>[queixas]</code> Queixas do lead'
    html += '<code>[idade]</code> Idade que faz'
    html += '<code>[orcamento]</code> Orcamento aberto'
    html += '</div>'

    return html
  }

  // ── Timeline node ──────────────────────────────────────────
  function _renderTimelineNode(t, isEditing) {
    var html = '<div class="bday-tl-node' + (t.is_active === false ? ' bday-tl-inactive' : '') + (isEditing ? ' bday-tl-editing' : '') + '" data-tmpl-id="' + (t.id || 'new') + '">'

    // Timeline dot + connector
    html += '<div class="bday-tl-connector"></div>'
    html += '<div class="bday-tl-dot"></div>'

    // Day badge
    html += '<div class="bday-tl-day">D-' + t.day_offset + '</div>'

    // Card
    html += '<div class="bday-tl-card">'

    // Card header
    html += '<div class="bday-tl-card-header">'
    html += '<span class="bday-tl-card-label">' + _esc(t.label || 'Nova mensagem') + '</span>'
    html += '<span class="bday-tl-card-hour">' + _ico('clock', 11) + ' ' + (t.send_hour || 10) + ':00</span>'

    if (t.id) {
      html += '<div class="bday-tl-card-actions">'
      html += '<label class="bday-switch bday-switch-sm"><input type="checkbox" ' + (t.is_active !== false ? 'checked' : '') + ' data-toggle="' + t.id + '"><span class="bday-slider"></span></label>'
      html += '<button class="bday-tl-btn" data-edit="' + t.id + '" title="Editar">' + _ico('edit-2', 12) + '</button>'
      html += '<button class="bday-tl-btn bday-tl-btn-del" data-del="' + t.id + '" title="Remover">' + _ico('trash-2', 12) + '</button>'
      html += '</div>'
    }
    html += '</div>'

    if (isEditing) {
      html += _renderEditForm(t)
    } else {
      // Split view: preview text + phone preview
      html += '<div class="bday-tl-card-body">'

      // Text preview (left)
      html += '<div class="bday-tl-text-preview">' + _esc(t.content || '').substring(0, 120) + (t.content && t.content.length > 120 ? '...' : '') + '</div>'

      // Phone preview (right)
      var resolved = window.BirthdayService.resolveVariables(t.content || '', _previewLead)
      html += '<div class="bday-phone-mini">'
      html += '<div class="bday-phone-mini-header">Clinica Mirian de Paula</div>'
      html += '<div class="bday-phone-mini-bubble">' + _waFormat(resolved).substring(0, 200) + (resolved.length > 200 ? '...' : '') + '</div>'
      html += '</div>'

      html += '</div>'
    }

    html += '</div>' // close card
    html += '</div>' // close node
    return html
  }

  // ── Edit form ──────────────────────────────────────────────
  function _renderEditForm(t) {
    var resolved = window.BirthdayService.resolveVariables(t.content || '', _previewLead)

    var html = '<div class="bday-tl-edit">'

    // Top row: label + config
    html += '<div class="bday-form-row">'
    html += '<div class="bday-form-field" style="flex:2"><label>Titulo</label><input class="bday-input" id="bdayTmplLabel" value="' + _esc(t.label || '') + '" placeholder="Ex: Oportunidade"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>D- antes</label><input class="bday-input" id="bdayTmplOffset" type="number" min="1" max="90" value="' + (t.day_offset || 30) + '"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>Hora</label><input class="bday-input" id="bdayTmplHour" type="number" min="0" max="23" value="' + (t.send_hour || 10) + '"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>Ordem</label><input class="bday-input" id="bdayTmplOrder" type="number" min="1" max="99" value="' + (t.sort_order || 1) + '"></div>'
    html += '</div>'

    // Content + live phone preview side-by-side
    html += '<div class="bday-edit-split">'

    // Editor (left)
    html += '<div class="bday-edit-left">'
    html += '<div class="bday-form-field"><label>Mensagem</label><textarea class="bday-textarea" id="bdayTmplContent" rows="8" placeholder="Escreva a mensagem aqui...">' + _esc(t.content || '') + '</textarea></div>'
    html += '<div class="bday-form-field"><label>Imagem (URL)</label><input class="bday-input" id="bdayTmplMedia" value="' + _esc(t.media_url || '') + '" placeholder="https://..."></div>'
    html += '</div>'

    // Phone preview (right)
    html += '<div class="bday-edit-right">'
    html += '<div class="bday-phone-preview">'
    html += '<div class="bday-phone-notch"></div>'
    html += '<div class="bday-phone-header">'
    html += '<div class="bday-phone-avatar">M</div>'
    html += '<div class="bday-phone-name">Clinica Mirian de Paula</div>'
    html += '</div>'
    html += '<div class="bday-phone-chat" id="bdayPhoneChat">'
    html += '<div class="bday-phone-bubble">' + _waFormat(resolved) + '</div>'
    html += '<div class="bday-phone-time">10:00</div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'

    html += '</div>' // close split

    // Actions
    html += '<div class="bday-form-actions">'
    html += '<button class="bday-btn bday-btn-save" id="bdayTmplSave">' + _ico('check', 14) + ' Salvar</button>'
    html += '<button class="bday-btn bday-btn-cancel" id="bdayTmplCancel">Cancelar</button>'
    html += '</div>'

    html += '</div>'
    return html
  }

  // ── Expose ─────────────────────────────────────────────────
  window.BirthdayTemplatesUI = Object.freeze({
    render: render,
    getEditId: getEditId,
    setEditId: setEditId,
    waFormat: _waFormat,
  })
})()
