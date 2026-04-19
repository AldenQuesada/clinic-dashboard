/**
 * ClinicAI — B2B Applications UI (tab 'applications')
 *
 * Lista candidaturas de parceria (Fluxo A da Mira) com 3 sub-abas:
 *   Pendentes (default) · Aprovadas · Rejeitadas
 *
 * Cada card tem botões de Aprovar / Rejeitar (pendentes) e dados de resolução
 * (aprovadas/rejeitadas).
 *
 * Consome: B2BApplicationRepository, B2BToast.
 *
 * Eventos ouvidos:
 *   'b2b:tab-change' (tab === 'applications')
 *
 * Eventos emitidos:
 *   'b2b:partnership-saved' { id } — quando aprovar (shell atualiza cobertura)
 *   'b2b:application-changed' {} — qualquer mudança (shell atualiza badge)
 *
 * Expõe window.B2BApplications.
 */
;(function () {
  'use strict'
  if (window.B2BApplications) return

  var SUB_TABS = [
    { id: 'pending',  label: 'Pendentes'  },
    { id: 'approved', label: 'Aprovadas'  },
    { id: 'rejected', label: 'Rejeitadas' },
  ]

  var _state = {
    subTab:   'pending',
    items:    [],
    loading:  false,
    error:    null,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo()  { return window.B2BApplicationRepository }
  function _toast() { return window.B2BToast }
  function _emit(n, d) { document.dispatchEvent(new CustomEvent(n, { detail: d || {} })) }

  function _fmtDate(iso) {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('pt-BR') } catch (_) { return iso }
  }
  function _fmtDateTime(iso) {
    if (!iso) return '—'
    try {
      var d = new Date(iso)
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
    } catch (_) { return iso }
  }

  function _fmtPhone(p) {
    if (!p) return '—'
    var digits = String(p).replace(/\D/g, '')
    if (digits.length === 13 && digits.indexOf('55') === 0) digits = digits.slice(2)
    if (digits.length === 11) return '(' + digits.slice(0,2) + ') ' + digits.slice(2,7) + '-' + digits.slice(7)
    if (digits.length === 10) return '(' + digits.slice(0,2) + ') ' + digits.slice(2,6) + '-' + digits.slice(6)
    return p
  }

  // ─── Cards ──────────────────────────────────────────────────
  function _renderCard(a) {
    var statusPill = ''
    if (a.status === 'pending')  statusPill = '<span class="b2b-pill">pendente</span>'
    if (a.status === 'approved') statusPill = '<span class="b2b-pill b2b-pill-tier">aprovada</span>'
    if (a.status === 'rejected') statusPill = '<span class="b2b-pill" style="background:rgba(217,122,122,0.18);color:var(--b2b-red)">rejeitada</span>'
    if (a.status === 'archived') statusPill = '<span class="b2b-pill">arquivada</span>'

    var meta = []
    meta.push('<span>Solicitado ' + _fmtDateTime(a.created_at) + '</span>')
    if (a.resolved_at) meta.push('<span>Resolvido ' + _fmtDate(a.resolved_at) + '</span>')
    if (a.partnership_id) meta.push('<span>Parceria criada</span>')
    if (a.follow_up_count) meta.push('<span>' + a.follow_up_count + 'x follow-up</span>')

    var extra = ''
    if (a.instagram)    extra += '<div class="b2b-app-line">IG: <strong>' + _esc(a.instagram) + '</strong></div>'
    if (a.address)      extra += '<div class="b2b-app-line">Endereço: ' + _esc(a.address) + '</div>'
    if (a.contact_name) extra += '<div class="b2b-app-line">Contato: ' + _esc(a.contact_name) + '</div>'
    if (a.notes)        extra += '<div class="b2b-app-line">Nota: ' + _esc(a.notes) + '</div>'
    if (a.approval_note)    extra += '<div class="b2b-app-line" style="color:var(--b2b-sage)">Aprovada com nota: ' + _esc(a.approval_note) + '</div>'
    if (a.rejection_reason) extra += '<div class="b2b-app-line" style="color:var(--b2b-red)">Motivo rejeição: ' + _esc(a.rejection_reason) + '</div>'

    var acts = ''
    if (a.status === 'pending') {
      acts =
        '<div class="b2b-app-acts">' +
          '<button type="button" class="b2b-btn" data-app-action="reject" data-id="' + _esc(a.id) + '" data-name="' + _esc(a.name) + '">Rejeitar</button>' +
          '<button type="button" class="b2b-btn b2b-btn-primary" data-app-action="approve" data-id="' + _esc(a.id) + '" data-name="' + _esc(a.name) + '">Aprovar</button>' +
        '</div>'
    }

    return '<div class="b2b-app-card">' +
      '<div class="b2b-app-head">' +
        '<div class="b2b-app-ident">' +
          '<strong>' + _esc(a.name) + '</strong>' +
          (a.category ? '<span class="b2b-pill">' + _esc(a.category) + '</span>' : '') +
          statusPill +
        '</div>' +
        '<div class="b2b-app-contact">' +
          '<span>' + _fmtPhone(a.contact_phone || a.requested_by_phone) + '</span>' +
        '</div>' +
      '</div>' +
      (extra ? '<div class="b2b-app-extra">' + extra + '</div>' : '') +
      '<div class="b2b-app-meta">' + meta.join(' · ') + '</div>' +
      acts +
    '</div>'
  }

  function _renderSubTabs() {
    return '<nav class="b2b-app-tabs">' +
      SUB_TABS.map(function (t) {
        var active = t.id === _state.subTab
        return '<button type="button" class="b2b-app-subtab' + (active ? ' active' : '') + '" data-app-subtab="' + t.id + '">' +
          _esc(t.label) +
        '</button>'
      }).join('') +
    '</nav>'
  }

  function _renderBody() {
    var body = window.B2BShell ? window.B2BShell.getTabBody() : document.getElementById('b2bTabBody')
    if (!body) return

    var head =
      '<div class="b2b-list-head">' +
        '<div>' +
          '<div class="b2b-list-count">Candidaturas de parceria</div>' +
          '<div style="font-size:11px;color:var(--b2b-text-muted);margin-top:2px">Fluxo A · Mira recebe pedidos no WhatsApp e cadastra aqui para aprovação</div>' +
        '</div>' +
      '</div>' +
      _renderSubTabs()

    var inner
    if (_state.loading) {
      inner = (window.B2BUXKit && window.B2BUXKit.skeleton({ rows: 3 })) ||
              '<div class="b2b-empty">Carregando…</div>'
    } else if (_state.error) {
      inner = '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'
    } else if (!_state.items.length) {
      var msg = _state.subTab === 'pending'
        ? 'Nenhuma candidatura pendente. A Mira está quieta por enquanto.'
        : _state.subTab === 'approved'
          ? 'Nenhuma candidatura aprovada ainda.'
          : 'Nenhuma candidatura rejeitada.'
      inner = '<div class="b2b-empty">' + msg + '</div>'
    } else {
      inner = '<div class="b2b-app-list">' + _state.items.map(_renderCard).join('') + '</div>'
    }

    body.innerHTML = head + inner
    _bind(body)
  }

  function _bind(root) {
    root.querySelectorAll('[data-app-subtab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-app-subtab')
        if (tab === _state.subTab) return
        _state.subTab = tab
        _load()
      })
    })

    root.querySelectorAll('[data-app-action]').forEach(function (btn) {
      btn.addEventListener('click', _onAction)
    })
  }

  async function _onAction(e) {
    var btn = e.currentTarget
    var action = btn.getAttribute('data-app-action')
    var id = btn.getAttribute('data-id')
    var name = btn.getAttribute('data-name')

    if (action === 'approve') {
      var note = _toast()
        ? await _toast().prompt(
            'Nota opcional sobre a aprovação (vai para o histórico):', '',
            { title: 'Aprovar "' + name + '"', okLabel: 'Aprovar' })
        : (prompt('Nota opcional:') || '')
      if (note === null) return

      btn.disabled = true; btn.textContent = 'Aprovando…'
      try {
        var r = await _repo().approve(id, note || null)
        if (!r || !r.ok) throw new Error(r && r.error || 'falha')
        _toast() && _toast().success('Parceria criada: ' + (r.partnership_name || name))
        _emit('b2b:partnership-saved', { id: r.partnership_id })
        _emit('b2b:application-changed', {})
        await _load()
      } catch (err) {
        _toast() ? _toast().error('Erro: ' + err.message) : alert('Erro: ' + err.message)
        btn.disabled = false; btn.textContent = 'Aprovar'
      }
      return
    }

    if (action === 'reject') {
      var reason = _toast()
        ? await _toast().prompt(
            'Motivo da rejeição (obrigatório):', '',
            { title: 'Rejeitar "' + name + '"', okLabel: 'Rejeitar' })
        : prompt('Motivo da rejeição:')
      if (reason === null) return
      if (!String(reason || '').trim()) {
        _toast() ? _toast().warn('Motivo é obrigatório') : alert('Motivo é obrigatório')
        return
      }

      btn.disabled = true; btn.textContent = 'Rejeitando…'
      try {
        var rr = await _repo().reject(id, reason.trim())
        if (!rr || !rr.ok) throw new Error(rr && rr.error || 'falha')
        _toast() && _toast().success('Candidatura rejeitada')
        _emit('b2b:application-changed', {})
        await _load()
      } catch (err) {
        _toast() ? _toast().error('Erro: ' + err.message) : alert('Erro: ' + err.message)
        btn.disabled = false; btn.textContent = 'Rejeitar'
      }
    }
  }

  async function _load() {
    if (!_repo()) {
      console.warn('[B2BApplications] B2BApplicationRepository não carregado')
      return
    }
    _state.loading = true
    _state.error = null
    _renderBody()
    try {
      _state.items = (await _repo().list(_state.subTab, 100)) || []
    } catch (e) {
      _state.error = e.message || String(e)
      _state.items = []
    } finally {
      _state.loading = false
      _renderBody()
      // Badge: conta pendentes independente da sub-tab ativa
      _refreshPendingBadge()
    }
  }

  async function _refreshPendingBadge() {
    try {
      var count
      if (_state.subTab === 'pending') {
        count = _state.items.length
      } else {
        var rows = await _repo().list('pending', 100)
        count = (rows || []).length
      }
      document.dispatchEvent(new CustomEvent('b2b:tab-count', {
        detail: { tab: 'applications', count: count }
      }))
    } catch (_) { /* silencioso */ }
  }

  // Expõe também um helper pra contar pendentes (shell usa pra badge)
  async function countPending() {
    if (!_repo()) return 0
    try {
      var rows = await _repo().list('pending', 100)
      return (rows || []).length
    } catch (_) { return 0 }
  }

  document.addEventListener('b2b:tab-change', function (e) {
    if (e.detail && e.detail.tab === 'applications') _load()
  })

  // Quando shell monta, atualiza badge mesmo se não for a aba ativa
  document.addEventListener('b2b:shell-mounted', function () {
    setTimeout(_refreshPendingBadge, 200)
  })

  // Se outra tab trocar uma application (improvável mas seguro), recarrega
  document.addEventListener('b2b:application-changed', function () {
    var cur = window.B2BShell && window.B2BShell.getActiveTab()
    if (cur === 'applications') _load()
  })

  window.B2BApplications = Object.freeze({
    reload:       _load,
    countPending: countPending,
  })
})()
