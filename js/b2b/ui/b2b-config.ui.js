/**
 * ClinicAI — B2B Config UI (tab 'config')
 *
 * Por enquanto só seção "Templates de encerramento" (Fraqueza #13).
 * Lista templates + form novo + preview ao vivo com mocks.
 *
 * Consome: B2BClosureTemplatesRepository, B2BToast.
 * Monta dentro de B2BShell.getTabBody() quando tab==='config'.
 *
 * Expõe window.B2BConfig.
 */
;(function () {
  'use strict'
  if (window.B2BConfig) return

  var _state = {
    templates: [],
    editing: null,     // { key, subject, body } — linha em edição (null = novo/visualização)
    loading: false,
    error: null,
  }

  var MOCK = {
    parceria: 'Fernanda Martins',
    motivo:   'Queda de engajamento nos últimos 90 dias',
    data:     '18/04/2026',
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _repo() { return window.B2BClosureTemplatesRepository }
  function _toast() { return window.B2BToast }

  function _renderVars(txt) {
    if (!txt) return ''
    var out = String(txt)
    out = out.replace(/\{\{parceria\}\}/g, MOCK.parceria)
    out = out.replace(/\{\{motivo\}\}/g,   MOCK.motivo)
    out = out.replace(/\{\{data\}\}/g,     MOCK.data)
    return out
  }

  function _renderTemplateCard(t) {
    var isEditing = _state.editing && _state.editing.key === t.key
    var isDefault = t.key === 'default'
    if (isEditing) return _renderEditor(t)

    return '<div class="b2b-tpl-card">' +
      '<div class="b2b-tpl-hdr">' +
        '<div>' +
          '<strong>' + _esc(t.key) + '</strong>' +
          (isDefault ? ' <span class="b2b-pill b2b-pill-tier">padrão</span>' : '') +
          (t.subject ? '<div style="font-size:11px;color:var(--b2b-text-muted);margin-top:2px">' + _esc(t.subject) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button type="button" class="b2b-btn" data-tpl-action="edit" data-key="' + _esc(t.key) + '">Editar</button>' +
          (isDefault ? '' :
            '<button type="button" class="b2b-btn" data-tpl-action="delete" data-key="' + _esc(t.key) + '">Remover</button>') +
        '</div>' +
      '</div>' +
      '<pre class="b2b-tpl-preview">' + _esc(_renderVars(t.body)) + '</pre>' +
    '</div>'
  }

  function _renderEditor(t) {
    var isNew = !t.key
    return '<div class="b2b-tpl-card b2b-tpl-editing">' +
      '<div class="b2b-tpl-hdr"><strong>' + (isNew ? 'Novo template' : 'Editando: ' + _esc(t.key)) + '</strong></div>' +
      '<label class="b2b-field"><span class="b2b-field-lbl">Key (identificador sem espaço) <em>*</em></span>' +
        '<input type="text" class="b2b-input" id="b2bTplKey" value="' + _esc(t.key || '') + '"' +
          (isNew ? '' : ' readonly') + ' placeholder="ex: amigavel, institucional"></label>' +
      '<label class="b2b-field"><span class="b2b-field-lbl">Subject (opcional)</span>' +
        '<input type="text" class="b2b-input" id="b2bTplSubject" value="' + _esc(t.subject || '') + '" placeholder="ex: Encerramento de ciclo"></label>' +
      '<label class="b2b-field"><span class="b2b-field-lbl">Body <em>*</em> — use {{parceria}} {{motivo}} {{data}}</span>' +
        '<textarea class="b2b-input" id="b2bTplBody" rows="12" style="font-family:ui-monospace,monospace;font-size:12px">' + _esc(t.body || '') + '</textarea></label>' +
      '<div class="b2b-tpl-preview-wrap">' +
        '<div class="b2b-field-lbl" style="margin-bottom:6px">Preview ao vivo (com mocks)</div>' +
        '<pre class="b2b-tpl-preview" data-tpl-preview>' + _esc(_renderVars(t.body || '')) + '</pre>' +
      '</div>' +
      '<div class="b2b-form-actions">' +
        '<button type="button" class="b2b-btn" data-tpl-action="cancel">Cancelar</button>' +
        '<button type="button" class="b2b-btn b2b-btn-primary" data-tpl-action="save">Salvar</button>' +
      '</div>' +
    '</div>'
  }

  function _renderBody() {
    var body = window.B2BShell ? window.B2BShell.getTabBody() : document.getElementById('b2bTabBody')
    if (!body) return

    if (_state.loading) {
      body.innerHTML = (window.B2BUXKit && window.B2BUXKit.skeleton({ rows: 3 })) ||
                       '<div class="b2b-empty">Carregando…</div>'
      return
    }
    if (_state.error) {
      body.innerHTML = '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'
      return
    }

    var isCreatingNew = _state.editing && !_state.editing.key_readonly_orig

    var htmlWa =
      '<div class="b2b-config-sec">' +
        '<div class="b2b-list-head">' +
          '<div>' +
            '<div class="b2b-list-count">Templates de mensagens WhatsApp (vouchers)</div>' +
            '<div style="font-size:11px;color:var(--b2b-text-muted);margin-top:2px">Editor com preview ao vivo · globais ou por parceria · placeholders: {nome} {parceiro} {combo} {validade_dias} {link} {mirian}</div>' +
          '</div>' +
          '<button type="button" class="b2b-btn b2b-btn-primary" data-config-open-wa-templates>Abrir editor de templates WA</button>' +
        '</div>' +
      '</div>'

    var html = htmlWa +
      '<div class="b2b-config-sec">' +
        '<div class="b2b-list-head">' +
          '<div>' +
            '<div class="b2b-list-count">Templates de encerramento</div>' +
            '<div style="font-size:11px;color:var(--b2b-text-muted);margin-top:2px">Carta editável por parceria · vars disponíveis: {{parceria}} {{motivo}} {{data}}</div>' +
          '</div>' +
          (_state.editing ? '' : '<button type="button" class="b2b-btn b2b-btn-primary" data-tpl-action="new">+ Novo template</button>') +
        '</div>' +
        (_state.editing && !_state.editing.key_readonly_orig ? _renderEditor(_state.editing) : '') +
        _state.templates.map(_renderTemplateCard).join('') +
      '</div>'

    body.innerHTML = html
    _bind(body)
  }

  function _bind(root) {
    root.querySelectorAll('[data-tpl-action]').forEach(function (btn) {
      btn.addEventListener('click', _onAction)
    })

    // Abre modal de templates WA
    var waBtn = root.querySelector('[data-config-open-wa-templates]')
    if (waBtn) {
      waBtn.addEventListener('click', function () {
        if (window.B2BTemplates) window.B2BTemplates.open()
        else _toast() && _toast().error('Editor de templates não carregado')
      })
    }

    // Preview ao vivo quando digitar body
    var bodyInput = root.querySelector('#b2bTplBody')
    var previewEl = root.querySelector('[data-tpl-preview]')
    if (bodyInput && previewEl) {
      bodyInput.addEventListener('input', function () {
        previewEl.textContent = _renderVars(bodyInput.value || '')
      })
    }
  }

  async function _onAction(e) {
    var btn = e.currentTarget
    var action = btn.getAttribute('data-tpl-action')
    var key = btn.getAttribute('data-key')

    if (action === 'new') {
      _state.editing = { key: '', subject: '', body: '', key_readonly_orig: false }
      _renderBody()
      return
    }

    if (action === 'edit') {
      var t = _state.templates.find(function (x) { return x.key === key })
      if (!t) return
      _state.editing = { key: t.key, subject: t.subject || '', body: t.body || '', key_readonly_orig: true }
      _renderBody()
      return
    }

    if (action === 'cancel') {
      _state.editing = null
      _renderBody()
      return
    }

    if (action === 'save') {
      var root = document.getElementById('b2bTabBody')
      if (!root) return
      var keyInput     = root.querySelector('#b2bTplKey')
      var subjectInput = root.querySelector('#b2bTplSubject')
      var bodyInput    = root.querySelector('#b2bTplBody')
      var newKey   = (keyInput.value || '').trim()
      var subject  = (subjectInput.value || '').trim()
      var body     = (bodyInput.value || '').trim()

      if (!newKey) { _toast() ? _toast().warn('Key é obrigatória') : alert('Key obrigatória'); return }
      if (!/^[a-z0-9_-]+$/i.test(newKey)) {
        _toast() ? _toast().warn('Key sem espaço/acento: só letras, números, _ e -') : alert('Key inválida')
        return
      }
      if (!body) { _toast() ? _toast().warn('Body é obrigatório') : alert('Body obrigatório'); return }

      btn.disabled = true; btn.textContent = 'Salvando…'
      try {
        var r = await _repo().upsert(newKey, subject || null, body)
        if (!r || !r.ok) throw new Error(r && r.error || 'falha')
        _toast() && _toast().success('Template "' + newKey + '" salvo')
        _state.editing = null
        await _load()
      } catch (err) {
        _toast() ? _toast().error('Erro: ' + err.message) : alert('Erro: ' + err.message)
        btn.disabled = false; btn.textContent = 'Salvar'
      }
      return
    }

    if (action === 'delete') {
      var ok = _toast()
        ? await _toast().confirm('Remover template "' + key + '"?', { title: 'Confirmar', okLabel: 'Remover' })
        : confirm('Remover template "' + key + '"?')
      if (!ok) return
      try {
        var rd = await _repo().remove(key)
        if (!rd || !rd.ok) throw new Error(rd && rd.error || 'falha')
        _toast() && _toast().success('Template removido')
        await _load()
      } catch (err) {
        _toast() ? _toast().error('Erro: ' + err.message) : alert('Erro: ' + err.message)
      }
      return
    }
  }

  async function _load() {
    if (!_repo()) {
      console.warn('[B2BConfig] B2BClosureTemplatesRepository não carregado')
      return
    }
    _state.loading = true
    _state.error = null
    _renderBody()
    try {
      _state.templates = (await _repo().list()) || []
    } catch (e) {
      _state.error = e.message || String(e)
      _state.templates = []
    } finally {
      _state.loading = false
      _renderBody()
    }
  }

  document.addEventListener('b2b:tab-change', function (e) {
    if (e.detail && e.detail.tab === 'config') _load()
  })

  window.B2BConfig = Object.freeze({ reload: _load })
})()
