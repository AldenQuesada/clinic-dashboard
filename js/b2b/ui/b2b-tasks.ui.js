/**
 * ClinicAI — B2B Tasks UI
 *
 * Renderiza um banner de "próximas ações" no topo da tab 'active'
 * + modal com lista completa quando clicado.
 *
 * Consome: B2BTasksRepository.
 * Zero conhecimento de outros UIs (comunica via CustomEvent).
 *
 * Eventos ouvidos:
 *   'b2b:tab-change' (tab === 'active') → carrega contagem
 *   'b2b:partnership-saved'              → reload
 *
 * Eventos emitidos:
 *   'b2b:open-detail' { id }             (quando task tem partnership_id)
 *
 * Expõe window.B2BTasks.
 */
;(function () {
  'use strict'
  if (window.B2BTasks) return

  var KIND_LABELS = {
    brief_monthly:    'Brief mensal',
    content_checkin:  'Check-in de conteúdo',
    mid_month:        'Mid-month',
    sazonal:          'Sazonal',
    monthly_report:   'Relatório mensal',
    scout_scan:       'Varredura scout',
    meta_alert:       'Meta em risco',
    health_alert:     'Saúde crítica',
    anniversary:      '🎉 Aniversário',
    welcome_d0:       '✨ Boas-vindas',
    welcome_d2:       '✨ Kit parceria',
    welcome_d7:       '✨ Check-in 1ª semana',
  }

  var _state = {
    tasks: [],
    count: 0,
    loading: false,
    error: null,
    modalOpen: false,
    filterKind: null,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BTasksRepository }
  function _emit(name, detail) { document.dispatchEvent(new CustomEvent(name, { detail: detail || {} })) }

  function _fmtDate(iso) {
    if (!iso) return ''
    try { return new Date(iso).toLocaleDateString('pt-BR') } catch (_) { return '' }
  }

  function _overdueCount() {
    var now = Date.now()
    return _state.tasks.filter(function (t) {
      return t.due_date && new Date(t.due_date).getTime() < now
    }).length
  }

  // ─── Banner compacto (no topo da tab active) ────────────────
  function _renderBanner() {
    if (_state.count === 0) return '<div class="b2b-tasks-banner b2b-tasks-banner-ok">Sem tarefas abertas · operação em dia</div>'
    var overdue = _overdueCount()
    var cls = overdue > 0 ? 'b2b-tasks-banner-warn' : 'b2b-tasks-banner-info'
    return '<div class="b2b-tasks-banner ' + cls + '" data-action="open-tasks">' +
      '<div class="b2b-tasks-banner-left">' +
        '<strong>' + _state.count + ' tarefas abertas</strong>' +
        (overdue > 0 ? ' · <span style="color:#EF4444">' + overdue + ' atrasadas</span>' : '') +
      '</div>' +
      '<button type="button" class="b2b-btn">Ver tarefas</button>' +
    '</div>'
  }

  // ─── Modal com lista completa ───────────────────────────────
  function _renderTaskRow(t) {
    var now = Date.now()
    var isOverdue = t.due_date && new Date(t.due_date).getTime() < now
    var kindLabel = KIND_LABELS[t.kind] || t.kind

    return '<div class="b2b-task-row' + (isOverdue ? ' overdue' : '') + '">' +
      '<div class="b2b-task-body">' +
        '<div class="b2b-task-top">' +
          '<span class="b2b-pill">' + _esc(kindLabel) + '</span>' +
          '<strong>' + _esc(t.title) + '</strong>' +
        '</div>' +
        (t.description ? '<div class="b2b-task-desc">' + _esc(t.description) + '</div>' : '') +
        '<div class="b2b-task-meta">' +
          (t.due_date ? '<span>Prazo: ' + _fmtDate(t.due_date) + (isOverdue ? ' (atrasada)' : '') + '</span>' : '') +
          (t.partnership_name ? '<span>' + _esc(t.partnership_name) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="b2b-task-acts">' +
        (t.kind === 'brief_monthly' && t.partnership_id
          ? '<button class="b2b-btn b2b-btn-primary" data-task-send-brief data-id="' + _esc(t.partnership_id) + '" data-task-id="' + _esc(t.id) + '">Enviar WhatsApp</button>'
          : '') +
        (['brief_monthly','welcome_d0','welcome_d2','welcome_d7','anniversary','content_checkin','mid_month','monthly_report'].indexOf(t.kind) !== -1 && t.partnership_id
          ? '<button class="b2b-btn" data-task-wa-dispatch data-task-id="' + _esc(t.id) + '" title="Enfileira no WhatsApp da clinica (wa_outbox)">Enfileirar WA</button>'
          : '') +
        '<button class="b2b-btn" data-task-assign data-id="' + _esc(t.id) + '" data-owner="' + _esc(t.owner || '') + '">' +
          (t.owner ? 'Atribuído a ' + _esc(t.owner) : 'Atribuir') +
        '</button>' +
        (t.partnership_id ? '<button class="b2b-btn" data-task-open-partnership data-id="' + _esc(t.partnership_id) + '">Abrir parceria</button>' : '') +
        '<button class="b2b-btn" data-task-resolve data-id="' + _esc(t.id) + '" data-status="done">Feito</button>' +
        '<button class="b2b-btn" data-task-resolve data-id="' + _esc(t.id) + '" data-status="dismissed">Dispensar</button>' +
      '</div>' +
    '</div>'
  }

  function _renderKindFilter() {
    var kinds = Object.keys(KIND_LABELS)
    var opts = kinds.map(function (k) {
      return '<option value="' + k + '"' + (_state.filterKind === k ? ' selected' : '') + '>' + _esc(KIND_LABELS[k]) + '</option>'
    }).join('')
    return '<select class="b2b-input" id="b2bTasksKindFilter" style="max-width:220px">' +
      '<option value="">Todos os tipos</option>' + opts +
    '</select>'
  }

  function _renderModal() {
    var pendingBriefs = _state.tasks.filter(function (t) { return t.kind === 'brief_monthly' }).length

    return '<div class="b2b-overlay" data-tasks-overlay>' +
      '<div class="b2b-modal b2b-modal-wide">' +
        '<header class="b2b-modal-hdr">' +
          '<h2>Próximas ações · ' + _state.count + '</h2>' +
          '<button type="button" class="b2b-close" data-tasks-close>&times;</button>' +
        '</header>' +
        '<div class="b2b-modal-body">' +
          '<div class="b2b-tasks-filter">' + _renderKindFilter() +
            (pendingBriefs > 0
              ? '<button type="button" class="b2b-btn b2b-btn-primary" id="b2bBriefSendAll">Enviar ' + pendingBriefs + ' brief(s) agora</button>'
              : '') +
          '</div>' +
          (_state.loading
            ? '<div class="b2b-empty">Carregando…</div>'
            : (_state.tasks.length
                ? '<div class="b2b-task-list">' + _state.tasks.map(_renderTaskRow).join('') + '</div>'
                : '<div class="b2b-empty">Nada pendente no filtro atual.</div>')) +
        '</div>' +
      '</div>' +
    '</div>'
  }

  // ─── Mount / bind ───────────────────────────────────────────
  function _mountBanner() {
    var body = window.B2BShell ? window.B2BShell.getTabBody() : document.getElementById('b2bTabBody')
    if (!body) return
    // Insere banner no topo do body (ou atualiza existente)
    var existing = body.querySelector('[data-tasks-banner-slot]')
    var html = '<div data-tasks-banner-slot>' + _renderBanner() + '</div>'
    if (existing) existing.outerHTML = html
    else body.insertAdjacentHTML('afterbegin', html)

    var banner = body.querySelector('.b2b-tasks-banner')
    if (banner && banner.hasAttribute('data-action')) {
      banner.addEventListener('click', function (e) {
        if (e.target.closest('button') || banner === e.target) _openModal()
      })
    }
  }

  function _mountModal() {
    var host = document.getElementById('b2bTasksOverlayHost')
    if (!host) {
      host = document.createElement('div')
      host.id = 'b2bTasksOverlayHost'
      document.body.appendChild(host)
    }
    if (!_state.modalOpen) { host.innerHTML = ''; return }
    host.innerHTML = _renderModal()
    _bindModal(host)
  }

  function _bindModal(host) {
    host.querySelectorAll('[data-tasks-close]').forEach(function (el) {
      el.addEventListener('click', _closeModal)
    })
    var ov = host.querySelector('[data-tasks-overlay]')
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) _closeModal() })

    var kf = host.querySelector('#b2bTasksKindFilter')
    if (kf) kf.addEventListener('change', function (e) {
      _state.filterKind = e.target.value || null
      _load({ skipBanner: true })
    })

    host.querySelectorAll('[data-task-resolve]').forEach(function (btn) {
      btn.addEventListener('click', _onResolve)
    })
    host.querySelectorAll('[data-task-open-partnership]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _emit('b2b:open-detail', { id: btn.getAttribute('data-id') })
        _closeModal()
      })
    })
    host.querySelectorAll('[data-task-send-brief]').forEach(function (btn) {
      btn.addEventListener('click', _onSendBrief)
    })
    host.querySelectorAll('[data-task-wa-dispatch]').forEach(function (btn) {
      btn.addEventListener('click', _onWaDispatch)
    })
    host.querySelectorAll('[data-task-assign]').forEach(function (btn) {
      btn.addEventListener('click', _onAssign)
    })
    var sendAllBtn = host.querySelector('#b2bBriefSendAll')
    if (sendAllBtn) sendAllBtn.addEventListener('click', _onSendAllBriefs)
  }

  async function _onWaDispatch(e) {
    var btn = e.currentTarget
    var taskId = btn.getAttribute('data-task-id')
    btn.disabled = true
    var orig = btn.textContent
    btn.textContent = 'Enfileirando…'
    try {
      var r = await _repo().briefDispatchToWa(taskId)
      if (!r || !r.ok) {
        var msg = r && r.error === 'partnership_without_phone' ? 'Parceria sem telefone cadastrado'
                : r && r.error === 'task_not_found_or_not_open' ? 'Task já foi resolvida'
                : 'Falha: ' + (r && r.error || 'desconhecida')
        window.B2BToast && window.B2BToast.error(msg)
        btn.disabled = false; btn.textContent = orig
        return
      }
      window.B2BToast && window.B2BToast.success('Mensagem enfileirada no WhatsApp')
      await _load({ skipBanner: true })
    } catch (err) {
      window.B2BToast && window.B2BToast.error('Falha: ' + (err.message || err))
      btn.disabled = false; btn.textContent = orig
    }
  }

  async function _onSendBrief(e) {
    var btn = e.currentTarget
    var partnershipId = btn.getAttribute('data-id')
    var taskId = btn.getAttribute('data-task-id')
    btn.disabled = true; btn.textContent = 'Enviando…'
    try {
      var r = await _repo().briefSend(partnershipId, taskId)
      if (!r || !r.ok) {
        var reason = r && r.error === 'invalid_phone'    ? 'Telefone inválido ou ausente'
                   : r && r.error === 'template_missing' ? 'Template WA não configurado'
                   : r && r.error === 'enqueue_failed'   ? 'Falha ao enfileirar: ' + (r.detail || '')
                   : 'Falha: ' + (r && r.error || 'desconhecida')
        window.B2BToast && window.B2BToast.error(reason)
        btn.disabled = false; btn.textContent = 'Enviar WhatsApp'
        return
      }
      window.B2BToast && window.B2BToast.success('Brief enfileirado')
      await _load()
    } catch (err) {
      window.B2BToast && window.B2BToast.error('Erro: ' + err.message)
      btn.disabled = false; btn.textContent = 'Enviar WhatsApp'
    }
  }

  async function _onSendAllBriefs(e) {
    var btn = e.currentTarget
    var ok = window.B2BToast
      ? await window.B2BToast.confirm(
          'Vai enfileirar os briefs no WhatsApp pra cada parceria ativa.',
          { title: 'Enviar todos os briefs?', okLabel: 'Enviar todos' })
      : confirm('Enviar todos os briefs?')
    if (!ok) return

    btn.disabled = true; btn.textContent = 'Enviando…'
    try {
      var r = await _repo().briefSendAllActive()
      var msg = (r.sent || 0) + ' enviados · ' + (r.failed || 0) + ' falhas'
      if (r.failures && r.failures.length) {
        window.B2BToast && window.B2BToast.warn(msg +
          ' — ' + r.failures.map(function (f) { return f.name }).join(', '),
          { title: 'Briefs enviados com falhas', duration: 8000 })
      } else {
        window.B2BToast && window.B2BToast.success(msg)
      }
      await _load()
    } catch (err) {
      window.B2BToast && window.B2BToast.error('Erro: ' + err.message)
      btn.disabled = false
    }
  }

  async function _onAssign(e) {
    var btn = e.currentTarget
    var id = btn.getAttribute('data-id')
    var current = btn.getAttribute('data-owner') || ''
    var owner = window.B2BToast
      ? await window.B2BToast.prompt('Quem vai cuidar desta tarefa? (email ou nome)', current, { title: 'Atribuir tarefa' })
      : (prompt('Atribuir a:', current) || null)
    if (owner === null) return
    btn.disabled = true
    try {
      await _repo().assign(id, owner || null)
      window.B2BToast && window.B2BToast.success(owner ? 'Atribuído a ' + owner : 'Atribuição removida')
      await _load()
    } catch (err) {
      window.B2BToast && window.B2BToast.error('Falha: ' + err.message)
      btn.disabled = false
    }
  }

  async function _onResolve(e) {
    var btn = e.currentTarget
    var id = btn.getAttribute('data-id')
    var status = btn.getAttribute('data-status')
    btn.disabled = true
    try {
      await _repo().resolve(id, status)
      await _load()
    } catch (err) {
      window.B2BToast && window.B2BToast.error('Falha: ' + err.message)
      btn.disabled = false
    }
  }

  function _openModal() {
    _state.modalOpen = true
    _mountModal()
  }
  function _closeModal() {
    _state.modalOpen = false
    _mountModal()
  }

  async function _load(opts) {
    opts = opts || {}
    _state.loading = true
    if (_state.modalOpen) _mountModal()
    try {
      _state.tasks = await _repo().list({ status: 'open', kind: _state.filterKind }) || []
      if (!_state.filterKind) _state.count = _state.tasks.length
    } catch (e) {
      _state.error = e.message || String(e)
      _state.tasks = []
    } finally {
      _state.loading = false
      if (!opts.skipBanner) _mountBanner()
      if (_state.modalOpen) _mountModal()
    }
  }

  // ─── Bind global ────────────────────────────────────────────
  document.addEventListener('b2b:tab-change', function (e) {
    if (e.detail && e.detail.tab === 'active') {
      // Aguarda a lista renderizar pra inserir o banner por cima
      setTimeout(_load, 50)
    }
  })

  document.addEventListener('b2b:partnership-saved', function () {
    var cur = window.B2BShell && window.B2BShell.getActiveTab()
    if (cur === 'active') setTimeout(_load, 80)
  })

  window.B2BTasks = Object.freeze({
    reload: _load,
    openModal: _openModal,
  })
})()
