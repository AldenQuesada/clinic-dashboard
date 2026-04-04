/**
 * ClinicAI — Birthday Templates UI
 *
 * Timeline visual + editor com toolbar/preview identicos ao broadcast.
 * Reaproveita classes CSS do automations.css (bc-phone, bc-wa-*, bc-tags-bar, bc-fmt-btn).
 *
 * Depende de: BirthdayUI (esc, ico), BirthdayService
 */
;(function () {
  'use strict'
  if (window._clinicaiBirthdayTmplUILoaded) return
  window._clinicaiBirthdayTmplUILoaded = true

  var _esc = function (s) { return window.BirthdayUI ? window.BirthdayUI.esc(s) : s }
  var _ico = function (n, sz) { return window.BirthdayUI ? window.BirthdayUI.ico(n, sz) : '' }

  var _editId = null
  var _previewLead = { name: 'Maria', queixas: 'flacidez e rugas', age_turning: 45, has_open_budget: true, budget_title: 'Lifting 5D', budget_total: 3500 }

  var _emojis = ['😊','😍','🔥','✨','💜','🌟','❤️','👏','🎉','💪','👋','🙏','💋','😉','🥰','💎','🌸','⭐','📍','📅','⏰','📞','💰','🎁','✅','❌','⚡','🏆','💡','🤝','👨‍⚕️','💆','🪞','💄','🌺','💫','🎂','🥳','🍰','🎊']

  function getEditId() { return _editId }
  function setEditId(id) { _editId = id }

  // ── WhatsApp formatting ────────────────────────────────────
  function _waFormat(text) {
    var t = _esc(text)
    t = t.replace(/\*_([^_]+)_\*/g, '<b><i>$1</i></b>')
    t = t.replace(/_\*([^\*]+)\*_/g, '<i><b>$1</b></i>')
    t = t.replace(/\*([^\*]+)\*/g, '<b>$1</b>')
    t = t.replace(/_([^_]+)_/g, '<i>$1</i>')
    t = t.replace(/~([^~]+)~/g, '<s>$1</s>')
    t = t.replace(/```([^`]+)```/g, '<code>$1</code>')
    t = t.replace(/\n/g, '<br>')
    return t
  }

  // ── Main render ────────────────────────────────────────────
  function render() {
    var svc = window.BirthdayService
    if (!svc) return ''
    var templates = svc.getTemplatesSorted()
    var html = ''

    // Header
    html += '<div class="bday-tl-header">'
    html += '<div class="bday-section-title">' + _ico('git-branch', 16) + ' Sequencia de mensagens</div>'
    html += '<button class="bday-add-tmpl" id="bdayAddTmpl">' + _ico('plus-circle', 14) + ' Adicionar mensagem</button>'
    html += '</div>'

    // Layout: timeline left + preview right (when editing)
    var isEditing = _editId !== null
    if (isEditing) {
      html += '<div class="bday-editor-layout">'
    }

    // Timeline
    html += '<div class="bday-timeline' + (isEditing ? ' bday-timeline-editing' : '') + '">'

    // Birthday marker
    html += '<div class="bday-tl-marker bday-tl-birthday">'
    html += '<div class="bday-tl-dot bday-tl-dot-bday"></div>'
    html += '<div class="bday-tl-label">' + _ico('gift', 14) + ' Aniversario</div>'
    html += '</div>'

    if (!templates.length && _editId !== 'new') {
      html += '<div class="bday-empty" style="margin:20px 0">Nenhuma mensagem configurada.</div>'
    }

    templates.forEach(function (t) {
      html += _renderTimelineNode(t, _editId === t.id)
    })

    if (_editId === 'new') {
      html += _renderTimelineNode({
        id: null, day_offset: 30, send_hour: 10, label: '', content: '',
        media_url: '', link_url: '', is_active: true, sort_order: templates.length + 1
      }, true)
    }

    html += '</div>' // close timeline

    // Fixed phone preview (right side, only when editing)
    if (isEditing) {
      var editTmpl = _editId === 'new'
        ? { content: '', media_url: '', send_hour: 10 }
        : templates.find(function (t) { return t.id === _editId }) || { content: '', send_hour: 10 }
      html += _renderFixedPhonePreview(editTmpl)
      html += '</div>' // close bday-editor-layout
    }

    // Variables hint
    html += '<div class="bday-tmpl-vars">'
    html += '<span class="bday-var-title">Variaveis:</span>'
    html += '<code>[nome]</code> Primeiro nome '
    html += '<code>[queixas]</code> Queixas do lead '
    html += '<code>[idade]</code> Idade que faz '
    html += '<code>[orcamento]</code> Orcamento aberto'
    html += '</div>'

    return html
  }

  // ── Timeline node ──────────────────────────────────────────
  function _renderTimelineNode(t, isEditing) {
    var html = '<div class="bday-tl-node' + (t.is_active === false ? ' bday-tl-inactive' : '') + (isEditing ? ' bday-tl-editing' : '') + '" data-tmpl-id="' + (t.id || 'new') + '">'
    html += '<div class="bday-tl-connector"></div>'
    html += '<div class="bday-tl-dot"></div>'
    html += '<div class="bday-tl-day">D-' + t.day_offset + '</div>'

    html += '<div class="bday-tl-card">'
    html += '<div class="bday-tl-card-header">'
    html += '<span class="bday-tl-card-label">' + _esc(t.label || 'Nova mensagem') + '</span>'
    html += '<span class="bday-tl-card-hour">' + _ico('clock', 11) + ' ' + (t.send_hour || 10) + ':00</span>'
    if (t.id) {
      html += '<div class="bday-tl-card-actions">'
      html += '<label class="bday-switch bday-switch-sm"><input type="checkbox" ' + (t.is_active !== false ? 'checked' : '') + ' data-toggle="' + t.id + '"><span class="bday-slider"></span></label>'
      html += '<button class="bday-tl-btn" data-edit="' + t.id + '">' + _ico('edit-2', 12) + '</button>'
      html += '<button class="bday-tl-btn bday-tl-btn-del" data-del="' + t.id + '">' + _ico('trash-2', 12) + '</button>'
      html += '</div>'
    }
    html += '</div>'

    if (isEditing) {
      html += _renderEditForm(t)
    } else {
      // Collapsed preview
      var resolved = window.BirthdayService.resolveVariables(t.content || '', _previewLead)
      html += '<div class="bday-tl-text-preview">' + _waFormat(resolved).substring(0, 180) + (resolved.length > 180 ? '...' : '') + '</div>'
    }

    html += '</div></div>'
    return html
  }

  // ── Edit form (using bc-* classes from broadcast) ──────────
  function _renderEditForm(t) {
    var html = '<div class="bday-tl-edit">'

    // Config row
    html += '<div class="bday-form-row">'
    html += '<div class="bday-form-field" style="flex:2"><label>Titulo</label><input class="am-input" id="bdayTmplLabel" value="' + _esc(t.label || '') + '" placeholder="Ex: Oportunidade"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>D- antes</label><input class="am-input" id="bdayTmplOffset" type="number" min="1" max="90" value="' + (t.day_offset || 30) + '"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>Hora</label><input class="am-input" id="bdayTmplHour" type="number" min="0" max="23" value="' + (t.send_hour || 10) + '"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>Ordem</label><input class="am-input" id="bdayTmplOrder" type="number" min="1" max="99" value="' + (t.sort_order || 1) + '"></div>'
    html += '</div>'

    // Textarea + formatting toolbar (same structure as broadcast)
    html += '<div class="am-field">'
    html += '<label class="am-label">Mensagem *</label>'
    html += '<textarea class="am-input" id="bdayTmplContent" rows="10" placeholder="Digite a mensagem aqui...&#10;&#10;Use [nome] para personalizar.&#10;Quebras de linha serao mantidas.">' + _esc(t.content || '') + '</textarea>'

    // Tags bar (reusing bc-tags-bar classes)
    html += '<div class="bc-tags-bar">'
    html += '<span class="bc-tag-hint">Inserir:</span>'
    html += '<button type="button" class="bc-tag-btn" data-tag="[nome]">[nome]</button>'
    html += '<button type="button" class="bc-tag-btn" data-tag="[queixas]">[queixas]</button>'
    html += '<button type="button" class="bc-tag-btn" data-tag="[idade]">[idade]</button>'
    html += '<button type="button" class="bc-tag-btn" data-tag="[orcamento]">[orcamento]</button>'
    html += '<span class="bc-fmt-sep"></span>'
    html += '<button type="button" class="bc-fmt-btn" data-wrap="*" title="Negrito"><b>N</b></button>'
    html += '<button type="button" class="bc-fmt-btn" data-wrap="_" title="Italico"><i>I</i></button>'
    html += '<button type="button" class="bc-fmt-btn" data-wrap="~" title="Riscado"><s>R</s></button>'
    html += '<button type="button" class="bc-fmt-btn bc-fmt-mono" data-wrap="```" title="Monoespaco">{ }</button>'
    html += '<span class="bc-fmt-sep"></span>'
    html += '<div class="bc-emoji-wrap">'
    html += '<button type="button" class="bc-fmt-btn bc-emoji-toggle" id="bdayEmojiToggle" title="Emojis">&#128578;</button>'
    html += '<div class="bc-emoji-picker" id="bdayEmojiPicker">'
    _emojis.forEach(function (e) {
      html += '<button type="button" class="bc-emoji-btn" data-emoji="' + e + '">' + e + '</button>'
    })
    html += '</div></div>'
    html += '</div>' // close bc-tags-bar
    html += '</div>' // close am-field

    // Image + link
    html += '<div class="am-field">'
    html += '<label class="am-label">Imagem ou Link</label>'
    html += '<div class="bc-media-options">'
    html += '<input class="am-input" id="bdayTmplMedia" placeholder="https://... (URL da imagem)" value="' + _esc(t.media_url || '') + '" style="flex:1">'
    html += '</div>'
    html += '</div>'

    html += '<div class="am-field">'
    html += '<label class="am-label">' + _ico('link', 12) + ' Link (anexado ao final da mensagem)</label>'
    html += '<input class="am-input" id="bdayTmplLink" placeholder="https://... (agendamento, site, etc)" value="' + _esc(t.link_url || '') + '">'
    html += '</div>'

    // Actions
    html += '<div class="bday-form-actions">'
    html += '<button class="am-btn-primary" id="bdayTmplSave" style="display:flex;align-items:center;gap:5px">' + _ico('check', 14) + ' Salvar</button>'
    html += '<button class="am-btn-secondary" id="bdayTmplCancel">Cancelar</button>'
    html += '</div>'

    html += '</div>'
    return html
  }

  // ── Fixed phone preview (right sidebar) ────────────────────
  function _renderFixedPhonePreview(t) {
    var resolved = window.BirthdayService.resolveVariables(t.content || '', _previewLead)
    var hour = t.send_hour || 10
    var hStr = (hour < 10 ? '0' : '') + hour + ':00'
    var checkSvg = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 12 5 16 12 6"/><polyline points="7 12 11 16 18 6"/></svg>'

    // Build bubble content
    var escaped = resolved
    escaped = _waFormat(escaped)
    escaped = escaped.replace(/\[(nome|queixas|idade|orcamento)\]/gi, '<span class="bc-wa-tag">[$1]</span>')

    var html = '<div class="bday-phone-fixed">'
    html += '<div class="bc-phone">'
    html += '<div class="bc-phone-notch"><span class="bc-phone-notch-time">' + hStr + '</span></div>'
    html += '<div class="bc-wa-header">'
    html += '<div class="bc-wa-avatar"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'
    html += '<div><div class="bc-wa-name">Clinica Mirian de Paula</div><div class="bc-wa-status">online</div></div>'
    html += '</div>'
    html += '<div class="bc-wa-chat" id="bdayPhoneChat">'
    if (escaped && escaped.trim()) {
      html += '<div class="bc-wa-bubble"><div class="bc-wa-bubble-text">' + escaped + '</div>'
      html += '<div class="bc-wa-bubble-time">' + hStr + ' ' + checkSvg + '</div></div>'
    } else {
      html += '<div class="bc-wa-empty">Digite a mensagem ao lado para ver o preview</div>'
    }
    html += '</div>'
    html += '<div class="bc-wa-bottom">'
    html += '<div class="bc-wa-input-mock">Mensagem</div>'
    html += '<div class="bc-wa-send-mock"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div>'
    html += '</div>'
    html += '<div class="bc-phone-home"></div>'
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
