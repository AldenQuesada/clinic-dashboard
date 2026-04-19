/**
 * ClinicAI — B2B Voucher WA Templates Editor (modal)
 *
 * Gerenciador de templates da tabela b2b_voucher_wa_templates com:
 *   - Lista (global default + globais + por parceria)
 *   - Formulário de edição com preview ao vivo (split layout)
 *   - Placeholders: {nome} {parceiro} {combo} {validade_dias} {link} {mirian}
 *   - Ações: Salvar · Duplicar · Desativar (soft delete)
 *
 * Consome: B2BTemplateRepository, B2BRepository.list (partnerships dropdown),
 *          B2BToast.
 *
 * API pública: open(), close(), reload()
 * Expõe window.B2BTemplates.
 */
;(function () {
  'use strict'
  if (window.B2BTemplates) return

  var PLACEHOLDERS = ['{nome}', '{parceiro}', '{combo}', '{validade_dias}', '{link}', '{mirian}']

  var _state = {
    open:         false,
    loading:      false,
    templates:    [],
    partnerships: [],
    editing:      null,   // { id?, scope, partnership_id, name, body, is_default }
    error:        null,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo()   { return window.B2BTemplateRepository }
  function _pRepo()  { return window.B2BRepository }
  function _toast()  { return window.B2BToast }

  // ─── Preview local ──────────────────────────────────────────
  function _previewMock(body) {
    var mocks = {
      '{nome}':           'Maria',
      '{parceiro}':       'Cazza Flor',
      '{combo}':          'Veu Noiva e Anovator',
      '{validade_dias}':  '30',
      '{link}':           (window.location.origin || 'https://clinica.com') + '/voucher.html?t=test',
      '{mirian}':         'Mirian de Paula',
    }
    var out = String(body || '')
    Object.keys(mocks).forEach(function (k) { out = out.split(k).join(mocks[k]) })
    return out
  }

  // ─── Host ──────────────────────────────────────────────────
  function _host() {
    var h = document.getElementById('b2bTplEditorHost')
    if (!h) {
      h = document.createElement('div')
      h.id = 'b2bTplEditorHost'
      document.body.appendChild(h)
    }
    return h
  }

  // ─── Render ────────────────────────────────────────────────
  function _renderPlaceholders() {
    return '<div class="b2b-tpl-placeholders">' +
      '<span style="margin-right:4px">Placeholders:</span>' +
      PLACEHOLDERS.map(function (p) {
        return '<code title="Clique para copiar" data-tpl-ph="' + _esc(p) + '">' + _esc(p) + '</code>'
      }).join('') +
    '</div>'
  }

  function _renderList() {
    if (!_state.templates.length) {
      return '<div class="b2b-empty">Nenhum template cadastrado. Crie o primeiro no formulário ao lado.</div>'
    }

    // Agrupa: partnership primeiro, depois global
    var byParts = _state.templates.filter(function (t) { return t.partnership_id })
    var byGlobs = _state.templates.filter(function (t) { return !t.partnership_id })

    var out = ''
    if (byGlobs.length) {
      out += '<div class="b2b-tpl-list-head"><h3>Globais</h3></div>'
      out += byGlobs.map(_renderListRow).join('')
    }
    if (byParts.length) {
      out += '<div class="b2b-tpl-list-head" style="margin-top:18px"><h3>Por parceria</h3></div>'
      out += byParts.map(_renderListRow).join('')
    }
    return out
  }

  function _renderListRow(t) {
    var isEditing = _state.editing && _state.editing.id === t.id
    var partName = ''
    if (t.partnership_id) {
      var p = _state.partnerships.find(function (x) { return x.id === t.partnership_id })
      partName = p ? p.name : '(parceria removida)'
    }

    return '<div class="b2b-tpl-card' + (isEditing ? ' b2b-tpl-editing' : '') + '">' +
      '<div class="b2b-tpl-hdr">' +
        '<div>' +
          '<strong>' + _esc(t.name) + '</strong>' +
          (t.is_default ? ' <span class="b2b-pill b2b-pill-tier">default</span>' : '') +
          ' <span class="b2b-tpl-scope-badge' + (t.scope === 'partnership' ? ' partnership' : '') + '">' +
            (t.scope === 'partnership' ? 'parceria' : 'global') +
          '</span>' +
          (partName ? '<div style="font-size:11px;color:var(--b2b-text-muted);margin-top:3px">Parceria: ' + _esc(partName) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button type="button" class="b2b-btn" data-tpl-edit data-id="' + _esc(t.id) + '">Editar</button>' +
          '<button type="button" class="b2b-btn" data-tpl-duplicate data-id="' + _esc(t.id) + '">Duplicar</button>' +
          (t.is_default
            ? ''
            : '<button type="button" class="b2b-btn" data-tpl-delete data-id="' + _esc(t.id) + '" data-name="' + _esc(t.name) + '">Desativar</button>') +
        '</div>' +
      '</div>' +
      '<pre class="b2b-tpl-preview" style="max-height:120px">' + _esc(t.body) + '</pre>' +
    '</div>'
  }

  function _renderEditor() {
    var e = _state.editing || { scope:'global', partnership_id:null, name:'', body:'', is_default:false }
    var isNew = !e.id

    var partOpts = _state.partnerships.map(function (p) {
      var sel = p.id === e.partnership_id ? ' selected' : ''
      return '<option value="' + _esc(p.id) + '"' + sel + '>' + _esc(p.name) + '</option>'
    }).join('')

    var scopeSel = e.scope === 'partnership' ? 'partnership' : 'global'

    return '<div class="b2b-tpl-editor">' +
      '<div class="b2b-tpl-editor-form">' +
        '<div class="b2b-tpl-list-head" style="margin:0 0 4px">' +
          '<h3>' + (isNew ? 'Novo template' : 'Editando template') + '</h3>' +
          (isNew ? '' :
            '<button type="button" class="b2b-btn" data-tpl-cancel>Novo em branco</button>') +
        '</div>' +

        '<label class="b2b-field"><span class="b2b-field-lbl">Nome <em>*</em></span>' +
          '<input type="text" class="b2b-input" id="b2bTplEdName" value="' + _esc(e.name || '') + '" placeholder="Ex: Voucher Natal Premium"></label>' +

        '<div class="b2b-tpl-scope-row">' +
          '<label class="b2b-field"><span class="b2b-field-lbl">Escopo</span>' +
            '<select class="b2b-input" id="b2bTplEdScope">' +
              '<option value="global"' + (scopeSel === 'global' ? ' selected' : '') + '>Global</option>' +
              '<option value="partnership"' + (scopeSel === 'partnership' ? ' selected' : '') + '>Por parceria</option>' +
            '</select></label>' +
          '<label class="b2b-field" id="b2bTplEdPartWrap" style="' + (scopeSel === 'partnership' ? '' : 'display:none') + '">' +
            '<span class="b2b-field-lbl">Parceria</span>' +
            '<select class="b2b-input" id="b2bTplEdPart">' +
              '<option value="">— selecione —</option>' +
              partOpts +
            '</select></label>' +
        '</div>' +

        '<label class="b2b-field" style="display:flex;align-items:center;gap:8px;margin-top:4px">' +
          '<input type="checkbox" id="b2bTplEdDefault"' + (e.is_default ? ' checked' : '') + '>' +
          '<span style="font-size:12px;color:var(--b2b-text-dim)">Marcar como default (usado quando nenhum outro match)</span>' +
        '</label>' +

        '<label class="b2b-field" style="margin-top:4px"><span class="b2b-field-lbl">Corpo da mensagem <em>*</em></span>' +
          '<textarea class="b2b-input" id="b2bTplEdBody" rows="10" ' +
            'style="font-family:ui-monospace,monospace;font-size:12px">' + _esc(e.body || '') + '</textarea></label>' +

        _renderPlaceholders() +

        '<div class="b2b-form-actions" style="margin-top:14px">' +
          '<button type="button" class="b2b-btn" data-tpl-cancel>' + (isNew ? 'Limpar' : 'Cancelar edição') + '</button>' +
          '<button type="button" class="b2b-btn b2b-btn-primary" data-tpl-save>Salvar</button>' +
        '</div>' +
      '</div>' +

      '<div class="b2b-tpl-editor-preview">' +
        '<div class="b2b-field-lbl">Preview ao vivo · mocks</div>' +
        '<pre class="b2b-tpl-preview" data-tpl-live-preview>' + _esc(_previewMock(e.body || '')) + '</pre>' +
        '<div style="font-size:10px;color:var(--b2b-text-muted);margin-top:8px">' +
          'nome=Maria · parceiro=Cazza Flor · combo=Veu Noiva e Anovator · validade=30d' +
        '</div>' +
      '</div>' +
    '</div>'
  }

  function _render() {
    var host = _host()
    if (!_state.open) { host.innerHTML = ''; return }

    var inner
    if (_state.loading) {
      inner = '<div class="b2b-empty">Carregando…</div>'
    } else if (_state.error) {
      inner = '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'
    } else {
      inner =
        _renderEditor() +
        '<hr style="border:none;border-top:1px solid var(--b2b-border);margin:24px 0">' +
        '<div class="b2b-list-head" style="margin-bottom:8px">' +
          '<div class="b2b-list-count">Templates existentes</div>' +
        '</div>' +
        _renderList()
    }

    host.innerHTML =
      '<div class="b2b-overlay" data-tpl-overlay>' +
        '<div class="b2b-modal b2b-modal-wide">' +
          '<header class="b2b-modal-hdr">' +
            '<h2>Templates de mensagem WhatsApp</h2>' +
            '<button type="button" class="b2b-close" data-tpl-close>&times;</button>' +
          '</header>' +
          '<div class="b2b-modal-body">' + inner + '</div>' +
        '</div>' +
      '</div>'

    _bind(host)
  }

  function _bind(host) {
    host.querySelectorAll('[data-tpl-close]').forEach(function (el) {
      el.addEventListener('click', close)
    })
    var ov = host.querySelector('[data-tpl-overlay]')
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) close() })

    host.querySelectorAll('[data-tpl-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id')
        var t = _state.templates.find(function (x) { return x.id === id })
        if (!t) return
        _state.editing = {
          id:             t.id,
          scope:          t.scope,
          partnership_id: t.partnership_id,
          name:           t.name,
          body:           t.body,
          is_default:     t.is_default,
        }
        _render()
      })
    })

    host.querySelectorAll('[data-tpl-duplicate]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id')
        var t = _state.templates.find(function (x) { return x.id === id })
        if (!t) return
        _state.editing = {
          scope:          t.scope,
          partnership_id: t.partnership_id,
          name:           t.name + ' (cópia)',
          body:           t.body,
          is_default:     false,
        }
        _render()
      })
    })

    host.querySelectorAll('[data-tpl-delete]').forEach(function (b) {
      b.addEventListener('click', _onDelete)
    })

    var cancelBtn = host.querySelector('[data-tpl-cancel]')
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      _state.editing = null
      _render()
    })
    var saveBtn = host.querySelector('[data-tpl-save]')
    if (saveBtn) saveBtn.addEventListener('click', _onSave)

    // Scope toggle → mostra/esconde dropdown de parcerias
    var scopeSel = host.querySelector('#b2bTplEdScope')
    var partWrap = host.querySelector('#b2bTplEdPartWrap')
    if (scopeSel && partWrap) {
      scopeSel.addEventListener('change', function () {
        partWrap.style.display = scopeSel.value === 'partnership' ? '' : 'none'
      })
    }

    // Live preview ao digitar
    var bodyInput = host.querySelector('#b2bTplEdBody')
    var livePre   = host.querySelector('[data-tpl-live-preview]')
    if (bodyInput && livePre) {
      bodyInput.addEventListener('input', function () {
        livePre.textContent = _previewMock(bodyInput.value || '')
      })
    }

    // Click em placeholder copia pra clipboard
    host.querySelectorAll('[data-tpl-ph]').forEach(function (el) {
      el.addEventListener('click', function () {
        var ph = el.getAttribute('data-tpl-ph')
        if (bodyInput) {
          // Insere na posição do cursor
          var start = bodyInput.selectionStart || 0
          var end   = bodyInput.selectionEnd   || 0
          var cur   = bodyInput.value
          bodyInput.value = cur.slice(0, start) + ph + cur.slice(end)
          bodyInput.focus()
          bodyInput.setSelectionRange(start + ph.length, start + ph.length)
          if (livePre) livePre.textContent = _previewMock(bodyInput.value)
        }
      })
    })
  }

  // ─── Ações ─────────────────────────────────────────────────
  async function _onSave(e) {
    var btn = e.currentTarget
    var host = _host()
    var nameEl  = host.querySelector('#b2bTplEdName')
    var scopeEl = host.querySelector('#b2bTplEdScope')
    var partEl  = host.querySelector('#b2bTplEdPart')
    var bodyEl  = host.querySelector('#b2bTplEdBody')
    var defEl   = host.querySelector('#b2bTplEdDefault')

    var name  = (nameEl.value  || '').trim()
    var scope = scopeEl.value === 'partnership' ? 'partnership' : 'global'
    var partnershipId = scope === 'partnership' ? (partEl.value || null) : null
    var body  = (bodyEl.value || '').trim()
    var isDefault = !!(defEl && defEl.checked)

    if (!name) { _toast() ? _toast().warn('Nome é obrigatório') : alert('Nome obrigatório'); return }
    if (scope === 'partnership' && !partnershipId) {
      _toast() ? _toast().warn('Escolha a parceria') : alert('Escolha a parceria'); return
    }
    if (!body) { _toast() ? _toast().warn('Corpo da mensagem é obrigatório') : alert('Corpo obrigatório'); return }

    btn.disabled = true; btn.textContent = 'Salvando…'
    try {
      var payload = {
        id:             _state.editing && _state.editing.id,
        scope:          scope,
        partnership_id: partnershipId,
        name:           name,
        body:           body,
        is_default:     isDefault,
      }
      var saved = await _repo().upsert(payload)
      _toast() && _toast().success('Template "' + name + '" salvo')
      _state.editing = null
      await _load()
    } catch (err) {
      _toast() ? _toast().error('Erro: ' + err.message) : alert('Erro: ' + err.message)
      btn.disabled = false; btn.textContent = 'Salvar'
    }
  }

  async function _onDelete(e) {
    var b = e.currentTarget
    var id = b.getAttribute('data-id')
    var name = b.getAttribute('data-name')
    var ok = _toast()
      ? await _toast().confirm('Desativar template "' + name + '"? (pode ser reativado via SQL se necessário)',
          { title: 'Confirmar', okLabel: 'Desativar' })
      : confirm('Desativar "' + name + '"?')
    if (!ok) return

    try {
      await _repo().delete(id)
      _toast() && _toast().success('Template desativado')
      if (_state.editing && _state.editing.id === id) _state.editing = null
      await _load()
    } catch (err) {
      _toast() ? _toast().error('Erro: ' + err.message) : alert('Erro: ' + err.message)
    }
  }

  async function _load() {
    _state.loading = true
    _state.error = null
    _render()
    try {
      var results = await Promise.all([
        _repo() ? _repo().list(null) : Promise.resolve([]),
        _pRepo() ? _pRepo().list({}).catch(function () { return [] }) : Promise.resolve([]),
      ])
      _state.templates    = results[0] || []
      _state.partnerships = (results[1] || []).filter(function (p) {
        // só parcerias relevantes (active, review, prospect, contract)
        return !p.status || ['active','review','prospect','contract'].indexOf(p.status) !== -1
      })
    } catch (e) {
      _state.error = e.message || String(e)
      _state.templates = []
    } finally {
      _state.loading = false
      _render()
    }
  }

  // ─── API ───────────────────────────────────────────────────
  function open() {
    if (!_repo()) {
      var t = _toast()
      if (t) t.error('B2BTemplateRepository não carregado')
      return
    }
    _state.open = true
    _state.editing = null
    _load()
  }

  function close() {
    _state.open = false
    _render()
  }

  window.B2BTemplates = Object.freeze({
    open:   open,
    close:  close,
    reload: _load,
  })
})()
