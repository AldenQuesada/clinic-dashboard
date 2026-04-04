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

  // ── Emoji set ───────────────────────────────────────────────
  var _emojis = ['😊','😍','🔥','✨','💜','🌟','❤️','👏','🎉','💪','👋','🙏','💋','😉','🥰','💎','🌸','⭐','📍','📅','⏰','📞','💰','🎁','✅','❌','⚡','🏆','💡','🤝','👨‍⚕️','💆','🪞','💄','🌺','💫','🎂','🥳','🍰','🎊']

  // ── Edit form ──────────────────────────────────────────────
  function _renderEditForm(t) {
    var resolved = window.BirthdayService.resolveVariables(t.content || '', _previewLead)
    var hour = t.send_hour || 10
    var hourStr = (hour < 10 ? '0' : '') + hour + ':00'

    var html = '<div class="bday-tl-edit">'

    // Top row: label + config
    html += '<div class="bday-form-row">'
    html += '<div class="bday-form-field" style="flex:2"><label>Titulo</label><input class="bday-input" id="bdayTmplLabel" value="' + _esc(t.label || '') + '" placeholder="Ex: Oportunidade"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>D- antes</label><input class="bday-input" id="bdayTmplOffset" type="number" min="1" max="90" value="' + (t.day_offset || 30) + '"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>Hora</label><input class="bday-input" id="bdayTmplHour" type="number" min="0" max="23" value="' + hour + '"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>Ordem</label><input class="bday-input" id="bdayTmplOrder" type="number" min="1" max="99" value="' + (t.sort_order || 1) + '"></div>'
    html += '</div>'

    // Content + live phone preview side-by-side
    html += '<div class="bday-edit-split">'

    // ── Editor (left) ────────────────────────────────────────
    html += '<div class="bday-edit-left">'

    // Textarea with formatting toolbar
    html += '<div class="bday-form-field">'
    html += '<label>Mensagem</label>'
    html += '<textarea class="bday-textarea" id="bdayTmplContent" rows="10" placeholder="Escreva a mensagem aqui...&#10;&#10;Use [nome] para personalizar.&#10;Quebras de linha serao mantidas.">' + _esc(t.content || '') + '</textarea>'

    // Formatting toolbar (identical structure to broadcast)
    html += '<div class="bday-tags-bar">'
    html += '<span class="bday-bar-hint">Inserir:</span>'
    html += '<button type="button" class="bday-bar-tag" data-tag="[nome]">[nome]</button>'
    html += '<button type="button" class="bday-bar-tag" data-tag="[queixas]">[queixas]</button>'
    html += '<button type="button" class="bday-bar-tag" data-tag="[idade]">[idade]</button>'
    html += '<button type="button" class="bday-bar-tag" data-tag="[orcamento]">[orcamento]</button>'
    html += '<span class="bday-bar-sep"></span>'
    html += '<button type="button" class="bday-bar-fmt" data-wrap="*" title="Negrito"><b>N</b></button>'
    html += '<button type="button" class="bday-bar-fmt" data-wrap="_" title="Italico"><i>I</i></button>'
    html += '<button type="button" class="bday-bar-fmt" data-wrap="~" title="Riscado"><s>R</s></button>'
    html += '<button type="button" class="bday-bar-fmt bday-bar-mono" data-wrap="```" title="Monoespaco">{ }</button>'
    html += '<span class="bday-bar-sep"></span>'
    // Emoji picker
    html += '<div class="bday-emoji-wrap">'
    html += '<button type="button" class="bday-bar-fmt bday-emoji-toggle" id="bdayEmojiToggle" title="Emojis">&#128578;</button>'
    html += '<div class="bday-emoji-picker" id="bdayEmojiPicker">'
    _emojis.forEach(function (e) {
      html += '<button type="button" class="bday-emoji-btn" data-emoji="' + e + '">' + e + '</button>'
    })
    html += '</div>'
    html += '</div>'
    html += '</div>' // close tags-bar
    html += '</div>' // close form-field

    // Media: image URL + link
    html += '<div class="bday-form-field">'
    html += '<label>Imagem (URL)</label>'
    html += '<input class="bday-input" id="bdayTmplMedia" value="' + _esc(t.media_url || '') + '" placeholder="https://... (URL da imagem)">'
    html += '</div>'

    // Link field
    html += '<div class="bday-form-field">'
    html += '<label>' + _ico('link', 12) + ' Link (anexado ao final da mensagem)</label>'
    html += '<input class="bday-input" id="bdayTmplLink" value="' + _esc(t.link_url || '') + '" placeholder="https://... (link para agendamento, site, etc)">'
    html += '</div>'

    html += '</div>' // close bday-edit-left

    // ── Phone preview (right, fixed) ─────────────────────────
    html += '<div class="bday-edit-right">'
    html += '<div class="bday-phone-preview bday-phone-sticky">'
    html += '<div class="bday-phone-notch"></div>'
    html += '<div class="bday-phone-header">'
    html += '<div class="bday-phone-avatar">M</div>'
    html += '<div class="bday-phone-name">Clinica Mirian de Paula</div>'
    html += '</div>'
    html += '<div class="bday-phone-chat" id="bdayPhoneChat">'
    html += '<div class="bday-phone-bubble">' + _waFormat(resolved) + '</div>'
    html += '<div class="bday-phone-time">' + hourStr + '</div>'
    html += '</div>'
    html += '</div>'
    html += '</div>' // close bday-edit-right

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
