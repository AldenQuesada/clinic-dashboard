/**
 * ClinicAI — Team Management UI (Premium)
 * Gerenciamento de equipe, acessos e convites.
 *
 * Tabs:
 *   1. Equipe (membros ativos/inativos, roles, acoes)
 *   2. Convites (pendentes, revogar, reenviar)
 *
 * Usa UsersRepository (RPCs: list_staff, invite_staff, update_staff_role,
 *   deactivate_staff, activate_staff, list_pending_invites, revoke_invite)
 *
 * Renderiza em #teamManageRoot
 */
;(function () {
  'use strict'
  if (window._clinicaiTeamManageLoaded) return
  window._clinicaiTeamManageLoaded = true

  var _root = null
  var _tab = 'team'
  var _loading = false
  var _staff = []
  var _invites = []
  var _filter = 'all' // all | owner | admin | therapist | receptionist | viewer | inactive

  var ROLES = {
    owner:        { label: 'Proprietario', icon: 'crown',    color: '#C9A96E', bg: '#FEF3C7', desc: 'Acesso irrestrito a todo o sistema' },
    admin:        { label: 'Administrador', icon: 'shield',  color: '#7C3AED', bg: '#EDE9FE', desc: 'Acesso total, gerencia equipe e config' },
    therapist:    { label: 'Especialista', icon: 'heart',    color: '#10b981', bg: '#D1FAE5', desc: 'Agenda, pacientes, prontuario, face mapping' },
    receptionist: { label: 'Secretaria',  icon: 'phone',    color: '#3b82f6', bg: '#DBEAFE', desc: 'Agenda, pacientes, WhatsApp, leads' },
    viewer:       { label: 'Visualizador', icon: 'eye',     color: '#6b7280', bg: '#F3F4F6', desc: 'Somente leitura em todo o sistema' },
  }

  // ── Helpers ───────────────────────────────────────────────────

  function _esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function _feather(n, s) { s = s || 16; return '<i data-feather="' + n + '" style="width:' + s + 'px;height:' + s + 'px"></i>' }
  function _replaceIcons() { if (_root && window.feather) feather.replace({ root: _root }) }

  function _initials(f, l) {
    var a = (f || '').charAt(0).toUpperCase()
    var b = (l || '').charAt(0).toUpperCase()
    return (a + b) || '?'
  }

  function _fullName(m) {
    var n = ((m.first_name || '') + ' ' + (m.last_name || '')).trim()
    return n || m.email || '--'
  }

  function _timeAgo(iso) {
    if (!iso) return '--'
    var d = new Date(iso), now = new Date(), diff = Math.floor((now - d) / 86400000)
    if (diff === 0) return 'hoje'
    if (diff === 1) return 'ontem'
    if (diff < 30) return diff + ' dias atras'
    return d.toLocaleDateString('pt-BR')
  }

  function _roleBadge(role) {
    var r = ROLES[role] || ROLES.viewer
    return '<span class="tm-role-badge" style="color:' + r.color + ';background:' + r.bg + '">' + _feather(r.icon, 12) + ' ' + r.label + '</span>'
  }

  // ── Skeleton ──────────────────────────────────────────────────

  function _skeleton(w, h) { return '<div class="tm-skeleton" style="width:' + (w || '100%') + ';height:' + (h || '20px') + '"></div>' }

  function _renderSkeleton() {
    var cards = ''
    for (var i = 0; i < 4; i++) {
      cards += '<div class="tm-card" style="padding:20px">'
        + '<div style="display:flex;gap:14px;align-items:center">'
          + _skeleton('44px', '44px')
          + '<div style="flex:1">' + _skeleton('140px', '16px') + '<div style="margin-top:6px">' + _skeleton('100px', '12px') + '</div></div>'
        + '</div></div>'
    }
    return '<div class="tm-kpi-grid">'
      + _skeleton('100%', '72px') + _skeleton('100%', '72px') + _skeleton('100%', '72px') + _skeleton('100%', '72px')
      + '</div><div style="margin-top:16px">' + cards + '</div>'
  }

  // ── Init ──────────────────────────────────────────────────────

  async function init() {
    _root = document.getElementById('teamManageRoot')
    if (!_root) return
    _loading = true
    _render()
    await _loadData()
    _loading = false
    _render()
  }

  async function _loadData() {
    var repo = window.UsersRepository
    if (!repo) return
    var results = await Promise.all([repo.getStaff(), repo.getPendingInvites()])
    if (results[0].ok) _staff = results[0].data || []
    if (results[1].ok) _invites = results[1].data || []
  }

  // ── Main render ───────────────────────────────────────────────

  function _render() {
    if (!_root) return

    var tabs = [
      { id: 'team', icon: 'users', label: 'Equipe', count: _staff.filter(function (s) { return s.is_active }).length },
      { id: 'invites', icon: 'mail', label: 'Convites', count: _invites.length },
    ]

    var tabsHtml = tabs.map(function (t) {
      var active = t.id === _tab
      var badge = t.count > 0 ? '<span class="tm-tab-badge">' + t.count + '</span>' : ''
      return '<button class="tm-tab' + (active ? ' tm-tab-active' : '') + '" data-tab="' + t.id + '">'
        + _feather(t.icon, 15) + '<span>' + t.label + '</span>' + badge
        + '</button>'
    }).join('')

    var body = _loading ? _renderSkeleton()
      : _tab === 'team' ? _renderTeam()
      : _renderInvites()

    _root.innerHTML = ''
      + '<div class="tm-page">'
        + '<div class="tm-header">'
          + '<div>'
            + '<h2 class="tm-title">' + _feather('shield', 22) + ' Equipe e Acessos</h2>'
            + '<p class="tm-subtitle">Gerencie quem tem acesso ao sistema e suas permissoes</p>'
          + '</div>'
          + '<button id="tmBtnInvite" class="tm-btn-gold">' + _feather('user-plus', 15) + ' Convidar</button>'
        + '</div>'
        + '<div class="tm-tabs">' + tabsHtml + '</div>'
        + '<div class="tm-body">' + body + '</div>'
      + '</div>'
      + _styles()

    // Tab events
    _root.querySelectorAll('.tm-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { _tab = btn.getAttribute('data-tab'); _render() })
    })
    document.getElementById('tmBtnInvite')?.addEventListener('click', _openInviteModal)
    _replaceIcons()
    _bindEvents()
  }

  // ── Tab: Team ─────────────────────────────────────────────────

  function _renderTeam() {
    var active = _staff.filter(function (s) { return s.is_active })
    var inactive = _staff.filter(function (s) { return !s.is_active })

    // KPIs
    var roleCounts = {}
    active.forEach(function (s) { roleCounts[s.role] = (roleCounts[s.role] || 0) + 1 })

    var kpis = [
      { label: 'Total Ativos', value: active.length, icon: 'users', color: '#C9A96E' },
      { label: 'Especialistas', value: roleCounts.therapist || 0, icon: 'heart', color: '#10b981' },
      { label: 'Secretarias', value: roleCounts.receptionist || 0, icon: 'phone', color: '#3b82f6' },
      { label: 'Inativos', value: inactive.length, icon: 'user-x', color: '#9ca3af' },
    ]

    var kpiHtml = kpis.map(function (k, i) {
      return '<div class="tm-kpi tm-fade" style="animation-delay:' + (i * 50) + 'ms">'
        + '<div class="tm-kpi-icon" style="background:' + k.color + '15;color:' + k.color + '">' + _feather(k.icon, 18) + '</div>'
        + '<div class="tm-kpi-value">' + k.value + '</div>'
        + '<div class="tm-kpi-label">' + k.label + '</div>'
        + '</div>'
    }).join('')

    // Filter pills
    var filters = [
      { id: 'all', label: 'Todos' },
      { id: 'admin', label: 'Admin' },
      { id: 'therapist', label: 'Especialistas' },
      { id: 'receptionist', label: 'Secretarias' },
      { id: 'viewer', label: 'Visualizadores' },
      { id: 'inactive', label: 'Inativos' },
    ]
    var pillsHtml = filters.map(function (f) {
      return '<button class="tm-pill' + (_filter === f.id ? ' tm-pill-active' : '') + '" data-filter="' + f.id + '">' + f.label + '</button>'
    }).join('')

    // Filter staff
    var filtered = _filter === 'all' ? active
      : _filter === 'inactive' ? inactive
      : active.filter(function (s) { return s.role === _filter })

    // Cards
    var cardsHtml = filtered.length === 0
      ? _renderEmpty('users', 'Nenhum membro encontrado', 'Ajuste o filtro ou convide novos membros.')
      : filtered.map(function (m, idx) {
        var r = ROLES[m.role] || ROLES.viewer
        var isOwner = m.role === 'owner'
        return '<div class="tm-member-card tm-fade" style="animation-delay:' + (idx * 40) + 'ms">'
          + '<div class="tm-member-left">'
            + '<div class="tm-avatar" style="background:' + r.bg + ';color:' + r.color + '">' + _initials(m.first_name, m.last_name) + '</div>'
            + '<div class="tm-member-info">'
              + '<div class="tm-member-name">' + _esc(_fullName(m)) + '</div>'
              + '<div class="tm-member-email">' + _esc(m.email || '') + '</div>'
            + '</div>'
          + '</div>'
          + '<div class="tm-member-right">'
            + _roleBadge(m.role)
            + '<div class="tm-member-since">' + _feather('clock', 12) + ' ' + _timeAgo(m.created_at) + '</div>'
            + (isOwner ? '' : '<div class="tm-member-actions">'
              + '<button class="tm-btn-icon tm-edit-role" data-id="' + m.id + '" data-role="' + m.role + '" data-name="' + _esc(_fullName(m)) + '" title="Alterar acesso">' + _feather('edit-2', 14) + '</button>'
              + (m.is_active
                ? '<button class="tm-btn-icon tm-btn-icon-danger tm-deactivate" data-id="' + m.id + '" data-name="' + _esc(_fullName(m)) + '" title="Desativar">' + _feather('user-x', 14) + '</button>'
                : '<button class="tm-btn-icon tm-activate" data-id="' + m.id + '" data-name="' + _esc(_fullName(m)) + '" title="Reativar">' + _feather('user-check', 14) + '</button>')
            + '</div>')
          + '</div>'
          + '</div>'
      }).join('')

    return '<div class="tm-kpi-grid">' + kpiHtml + '</div>'
      + '<div class="tm-pills">' + pillsHtml + '</div>'
      + cardsHtml
  }

  // ── Tab: Invites ──────────────────────────────────────────────

  function _renderInvites() {
    if (_invites.length === 0) {
      return _renderEmpty('mail', 'Nenhum convite pendente', 'Convites aceitos ou expirados nao aparecem aqui.')
    }

    return _invites.map(function (inv, idx) {
      var r = ROLES[inv.role] || ROLES.viewer
      var expired = inv.expires_at && new Date(inv.expires_at) < new Date()
      return '<div class="tm-invite-card tm-fade" style="animation-delay:' + (idx * 40) + 'ms">'
        + '<div class="tm-member-left">'
          + '<div class="tm-avatar" style="background:' + r.bg + ';color:' + r.color + '">' + _feather('mail', 18) + '</div>'
          + '<div class="tm-member-info">'
            + '<div class="tm-member-name">' + _esc(inv.email) + '</div>'
            + '<div class="tm-member-email">' + _roleBadge(inv.role) + (expired ? ' <span class="tm-expired">Expirado</span>' : ' <span class="tm-pending">Pendente</span>') + '</div>'
          + '</div>'
        + '</div>'
        + '<div class="tm-member-right">'
          + '<div class="tm-member-since">' + _feather('clock', 12) + ' Enviado ' + _timeAgo(inv.created_at) + '</div>'
          + '<button class="tm-btn-icon tm-btn-icon-danger tm-revoke" data-id="' + inv.id + '" data-email="' + _esc(inv.email) + '" title="Revogar convite">' + _feather('x', 14) + '</button>'
        + '</div>'
        + '</div>'
    }).join('')
  }

  function _renderEmpty(icon, title, desc) {
    return '<div class="tm-empty tm-fade">'
      + '<div class="tm-empty-icon">' + _feather(icon, 40) + '</div>'
      + '<div class="tm-empty-title">' + title + '</div>'
      + '<div class="tm-empty-desc">' + desc + '</div>'
      + '</div>'
  }

  // ── Events ────────────────────────────────────────────────────

  function _bindEvents() {
    if (!_root) return
    _root.querySelectorAll('.tm-pill').forEach(function (btn) {
      btn.addEventListener('click', function () { _filter = btn.getAttribute('data-filter'); _render() })
    })
    _root.querySelectorAll('.tm-edit-role').forEach(function (btn) {
      btn.addEventListener('click', function () { _openRoleModal(btn.dataset.id, btn.dataset.role, btn.dataset.name) })
    })
    _root.querySelectorAll('.tm-deactivate').forEach(function (btn) {
      btn.addEventListener('click', function () { _confirmAction('deactivate', btn.dataset.id, btn.dataset.name) })
    })
    _root.querySelectorAll('.tm-activate').forEach(function (btn) {
      btn.addEventListener('click', function () { _confirmAction('activate', btn.dataset.id, btn.dataset.name) })
    })
    _root.querySelectorAll('.tm-revoke').forEach(function (btn) {
      btn.addEventListener('click', function () { _confirmAction('revoke', btn.dataset.id, btn.dataset.email) })
    })
  }

  // ── Modal helpers ─────────────────────────────────────────────

  function _openModal(html) {
    var old = document.getElementById('tmModalBackdrop')
    if (old) old.remove()
    document.body.insertAdjacentHTML('beforeend',
      '<div id="tmModalBackdrop" class="tm-modal-backdrop"><div class="tm-modal tm-modal-enter">' + html + '</div></div>')
    if (window.feather) feather.replace({ root: document.getElementById('tmModalBackdrop') })
    document.querySelectorAll('.tm-modal-close').forEach(function (b) { b.addEventListener('click', _closeModal) })
    document.getElementById('tmModalBackdrop')?.addEventListener('click', function (e) { if (e.target.id === 'tmModalBackdrop') _closeModal() })
    document.addEventListener('keydown', _escHandler)
  }

  function _closeModal() {
    var m = document.getElementById('tmModalBackdrop')
    if (m) { m.style.opacity = '0'; setTimeout(function () { m.remove() }, 200) }
    document.removeEventListener('keydown', _escHandler)
  }

  function _escHandler(e) { if (e.key === 'Escape') _closeModal() }

  // ── Modal: Invite ─────────────────────────────────────────────

  function _openInviteModal() {
    var roleOpts = ['admin', 'therapist', 'receptionist', 'viewer'].map(function (r) {
      var cfg = ROLES[r]
      return '<option value="' + r + '">' + cfg.label + ' — ' + cfg.desc + '</option>'
    }).join('')

    _openModal(''
      + '<div class="tm-modal-header">'
        + '<div><h3 class="tm-modal-title">Convidar Membro</h3><p class="tm-modal-desc">O convite e enviado por email e expira em 48h</p></div>'
        + '<button class="tm-modal-close tm-btn-icon">' + _feather('x', 18) + '</button>'
      + '</div>'
      + '<div class="tm-modal-body">'
        + '<div><label class="tm-form-label">Email</label>'
          + '<input type="email" id="tmInvEmail" class="tm-input" style="width:100%" placeholder="email@clinica.com"></div>'
        + '<div><label class="tm-form-label">Nivel de acesso</label>'
          + '<select id="tmInvRole" class="tm-input" style="width:100%">' + roleOpts + '</select></div>'
        + '<div id="tmInvRoleDesc" class="tm-role-desc"></div>'
      + '</div>'
      + '<div class="tm-modal-footer">'
        + '<button class="tm-modal-close tm-btn">Cancelar</button>'
        + '<button id="tmInvSend" class="tm-btn-gold">Enviar Convite</button>'
      + '</div>')

    var descEl = document.getElementById('tmInvRoleDesc')
    var selEl = document.getElementById('tmInvRole')
    function updateDesc() {
      var r = ROLES[selEl.value] || {}
      if (descEl) descEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:' + (r.bg || '#f3f4f6') + ';border-radius:10px;font-size:12px;color:' + (r.color || '#6b7280') + ';font-weight:600">' + _feather(r.icon || 'info', 14) + ' ' + (r.desc || '') + '</div>'
      if (window.feather && descEl) feather.replace({ root: descEl })
    }
    updateDesc()
    selEl?.addEventListener('change', updateDesc)

    document.getElementById('tmInvSend')?.addEventListener('click', async function () {
      var email = (document.getElementById('tmInvEmail') || {}).value || ''
      var role = (document.getElementById('tmInvRole') || {}).value || ''
      if (!email || !email.includes('@')) { _toast('Email invalido', 'warn'); return }

      var btn = document.getElementById('tmInvSend')
      if (btn) { btn.disabled = true; btn.innerHTML = _feather('loader', 14) + ' Enviando...' }

      var r = await window.UsersRepository.inviteStaff(email, role)
      if (r.ok) {
        _toast('Convite enviado para ' + email, 'ok')
        _closeModal()
        await _loadData()
        _tab = 'invites'
        _render()
      } else {
        _toast('Erro: ' + (r.error || 'desconhecido'), 'error')
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar Convite' }
      }
    })
  }

  // ── Modal: Change Role ────────────────────────────────────────

  function _openRoleModal(userId, currentRole, name) {
    var roleOpts = ['admin', 'therapist', 'receptionist', 'viewer'].map(function (r) {
      var cfg = ROLES[r]
      return '<label class="tm-role-option' + (r === currentRole ? ' tm-role-option-active' : '') + '">'
        + '<input type="radio" name="tmNewRole" value="' + r + '"' + (r === currentRole ? ' checked' : '') + ' class="tm-radio">'
        + '<div class="tm-role-option-inner">'
          + '<div style="display:flex;align-items:center;gap:8px">'
            + '<span style="color:' + cfg.color + '">' + _feather(cfg.icon, 16) + '</span>'
            + '<strong>' + cfg.label + '</strong>'
          + '</div>'
          + '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + cfg.desc + '</div>'
        + '</div>'
        + '</label>'
    }).join('')

    _openModal(''
      + '<div class="tm-modal-header">'
        + '<div><h3 class="tm-modal-title">Alterar Acesso</h3><p class="tm-modal-desc">' + _esc(name) + '</p></div>'
        + '<button class="tm-modal-close tm-btn-icon">' + _feather('x', 18) + '</button>'
      + '</div>'
      + '<div class="tm-modal-body"><div class="tm-role-list">' + roleOpts + '</div></div>'
      + '<div class="tm-modal-footer">'
        + '<button class="tm-modal-close tm-btn">Cancelar</button>'
        + '<button id="tmRoleSave" class="tm-btn-gold">Salvar</button>'
      + '</div>')

    // Highlight on selection
    document.querySelectorAll('.tm-role-option input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        document.querySelectorAll('.tm-role-option').forEach(function (o) { o.classList.remove('tm-role-option-active') })
        inp.closest('.tm-role-option').classList.add('tm-role-option-active')
      })
    })

    document.getElementById('tmRoleSave')?.addEventListener('click', async function () {
      var sel = document.querySelector('input[name="tmNewRole"]:checked')
      if (!sel) return
      var newRole = sel.value
      if (newRole === currentRole) { _closeModal(); return }

      var btn = document.getElementById('tmRoleSave')
      if (btn) { btn.disabled = true; btn.innerHTML = _feather('loader', 14) + ' Salvando...' }

      var r = await window.UsersRepository.updateRole(userId, newRole)
      if (r.ok) { _toast('Acesso alterado!', 'ok'); _closeModal(); await _loadData(); _render() }
      else { _toast('Erro: ' + (r.error || 'desconhecido'), 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar' } }
    })
  }

  // ── Modal: Confirm Action ─────────────────────────────────────

  function _confirmAction(action, id, nameOrEmail) {
    var config = {
      deactivate: { title: 'Desativar Membro', desc: 'Remover acesso de <strong>' + _esc(nameOrEmail) + '</strong> ao sistema?', icon: 'user-x', btnLabel: 'Desativar', btnClass: 'tm-btn-danger' },
      activate:   { title: 'Reativar Membro',  desc: 'Restaurar acesso de <strong>' + _esc(nameOrEmail) + '</strong>?', icon: 'user-check', btnLabel: 'Reativar', btnClass: 'tm-btn-gold' },
      revoke:     { title: 'Revogar Convite',   desc: 'Cancelar convite para <strong>' + _esc(nameOrEmail) + '</strong>?', icon: 'x-circle', btnLabel: 'Revogar', btnClass: 'tm-btn-danger' },
    }[action]

    _openModal(''
      + '<div style="padding:32px;text-align:center">'
        + '<div class="tm-confirm-icon">' + _feather(config.icon, 28) + '</div>'
        + '<h3 class="tm-modal-title" style="margin-top:16px">' + config.title + '</h3>'
        + '<p style="margin:8px 0 0;font-size:13px;color:#6b7280">' + config.desc + '</p>'
      + '</div>'
      + '<div class="tm-modal-footer" style="justify-content:center">'
        + '<button class="tm-modal-close tm-btn">Cancelar</button>'
        + '<button id="tmConfirmBtn" class="' + config.btnClass + '">' + config.btnLabel + '</button>'
      + '</div>')

    document.getElementById('tmConfirmBtn')?.addEventListener('click', async function () {
      var btn = document.getElementById('tmConfirmBtn')
      if (btn) { btn.disabled = true; btn.innerHTML = _feather('loader', 14) + ' ...' }

      var repo = window.UsersRepository
      var r = action === 'deactivate' ? await repo.deactivateStaff(id)
        : action === 'activate' ? await repo.activateStaff(id)
        : await repo.revokeInvite(id)

      if (r.ok) { _toast(config.title + ' concluido!', 'ok'); _closeModal(); await _loadData(); _render() }
      else { _toast('Erro: ' + (r.error || 'desconhecido'), 'error'); if (btn) { btn.disabled = false; btn.textContent = config.btnLabel } }
    })
  }

  // ── Toast ─────────────────────────────────────────────────────

  function _toast(msg, type) {
    var colors = { ok: '#059669', warn: '#92400e', error: '#DC2626' }
    var bg = { ok: '#D1FAE5', warn: '#FEF3C7', error: '#FEE2E2' }
    var icons = { ok: 'check-circle', warn: 'alert-circle', error: 'x-circle' }
    var t = document.createElement('div')
    t.className = 'tm-toast tm-toast-enter'
    t.innerHTML = '<span style="display:flex;align-items:center;gap:8px">' + _feather(icons[type] || 'info', 16) + ' ' + _esc(msg) + '</span>'
    t.style.color = colors[type] || '#374151'
    t.style.background = bg[type] || '#F3F4F6'
    document.body.appendChild(t)
    if (window.feather) feather.replace({ root: t })
    setTimeout(function () { t.classList.add('tm-toast-exit') }, 2500)
    setTimeout(function () { t.remove() }, 3000)
  }

  // ── Styles ────────────────────────────────────────────────────

  function _styles() {
    return '<style>'
      + '@keyframes tmFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}'
      + '@keyframes tmShimmer{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}'
      + '@keyframes tmModalIn{from{opacity:0;transform:scale(.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}'
      + '@keyframes tmToastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}'

      + '.tm-page{padding:28px 32px;max-width:900px;margin:0 auto}'
      + '.tm-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:16px;flex-wrap:wrap}'
      + '.tm-title{margin:0;font-size:22px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px}'
      + '.tm-subtitle{margin:4px 0 0;font-size:13px;color:#6b7280}'
      + '.tm-fade{animation:tmFadeUp .4s ease both}'
      + '.tm-skeleton{background:linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%);background-size:200px 100%;animation:tmShimmer 1.5s infinite;border-radius:8px}'

      // Tabs
      + '.tm-tabs{display:flex;gap:4px;margin-bottom:24px;border-bottom:2px solid #e5e7eb}'
      + '.tm-tab{background:none;border:none;padding:10px 18px;font-size:13px;font-weight:600;color:#6b7280;cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-2px;display:flex;align-items:center;gap:7px;transition:all .2s}'
      + '.tm-tab:hover{color:#111827;background:rgba(201,169,110,.04);border-radius:8px 8px 0 0}'
      + '.tm-tab-active{color:#C9A96E;border-bottom-color:#C9A96E}'
      + '.tm-tab-badge{background:#C9A96E;color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:4px}'

      // KPIs
      + '.tm-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}'
      + '.tm-kpi{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px;display:flex;align-items:center;gap:14px;transition:all .25s}'
      + '.tm-kpi:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(201,169,110,.1);border-color:rgba(201,169,110,.3)}'
      + '.tm-kpi-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
      + '.tm-kpi-value{font-size:24px;font-weight:800;color:#111827;line-height:1}'
      + '.tm-kpi-label{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.3px}'

      // Filter pills
      + '.tm-pills{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}'
      + '.tm-pill{background:#fff;border:1.5px solid #e5e7eb;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;color:#6b7280;cursor:pointer;transition:all .2s}'
      + '.tm-pill:hover{border-color:#C9A96E;color:#C9A96E}'
      + '.tm-pill-active{background:#C9A96E;border-color:#C9A96E;color:#fff}'

      // Member cards
      + '.tm-member-card,.tm-invite-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px 20px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:16px;transition:all .2s;flex-wrap:wrap}'
      + '.tm-member-card:hover,.tm-invite-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.05);border-color:rgba(201,169,110,.2)}'
      + '.tm-member-left{display:flex;align-items:center;gap:14px;min-width:0}'
      + '.tm-member-right{display:flex;align-items:center;gap:12px;flex-shrink:0;flex-wrap:wrap}'
      + '.tm-avatar{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;flex-shrink:0}'
      + '.tm-member-info{min-width:0}'
      + '.tm-member-name{font-size:14px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.tm-member-email{font-size:12px;color:#9ca3af;margin-top:2px}'
      + '.tm-member-since{font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:4px;white-space:nowrap}'
      + '.tm-member-actions{display:flex;gap:4px}'

      // Role badge
      + '.tm-role-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.2px}'
      + '.tm-pending{color:#D97706;font-size:11px;font-weight:600}'
      + '.tm-expired{color:#DC2626;font-size:11px;font-weight:600}'

      // Role selector (modal)
      + '.tm-role-list{display:flex;flex-direction:column;gap:8px}'
      + '.tm-role-option{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border:1.5px solid #e5e7eb;border-radius:12px;cursor:pointer;transition:all .2s}'
      + '.tm-role-option:hover{border-color:#C9A96E;background:rgba(201,169,110,.03)}'
      + '.tm-role-option-active{border-color:#C9A96E;background:rgba(201,169,110,.06);box-shadow:0 0 0 3px rgba(201,169,110,.1)}'
      + '.tm-role-option-inner{flex:1}'
      + '.tm-radio{accent-color:#C9A96E;width:18px;height:18px;margin-top:2px;flex-shrink:0}'
      + '.tm-role-desc{margin-top:8px}'

      // Buttons
      + '.tm-btn{background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:6px}'
      + '.tm-btn:hover{border-color:#C9A96E;color:#C9A96E;transform:translateY(-1px)}'
      + '.tm-btn-gold{background:linear-gradient(135deg,#C9A96E,#a8894f);color:#fff;border:none;padding:9px 18px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .2s;box-shadow:0 2px 8px rgba(201,169,110,.3)}'
      + '.tm-btn-gold:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(201,169,110,.4)}'
      + '.tm-btn-gold:disabled{opacity:.6;pointer-events:none}'
      + '.tm-btn-danger{background:#fff;color:#DC2626;border:1.5px solid #FCA5A5;padding:8px 18px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:6px}'
      + '.tm-btn-danger:hover{background:#FEE2E2;transform:translateY(-1px)}'
      + '.tm-btn-icon{background:none;border:1.5px solid #e5e7eb;color:#6b7280;width:34px;height:34px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .2s}'
      + '.tm-btn-icon:hover{border-color:#C9A96E;color:#C9A96E;background:rgba(201,169,110,.04)}'
      + '.tm-btn-icon-danger:hover{border-color:#FCA5A5;color:#DC2626;background:#FEF2F2}'

      // Input
      + '.tm-input{padding:9px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;outline:none;background:#fff;transition:all .2s}'
      + '.tm-input:focus{border-color:#C9A96E;box-shadow:0 0 0 3px rgba(201,169,110,.1)}'
      + '.tm-form-label{display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px}'

      // Modal
      + '.tm-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;transition:opacity .2s}'
      + '.tm-modal{background:#fff;border-radius:18px;width:100%;max-width:520px;box-shadow:0 25px 60px rgba(0,0,0,.2);overflow:hidden}'
      + '.tm-modal-enter{animation:tmModalIn .25s ease}'
      + '.tm-modal-header{padding:22px 24px;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;justify-content:space-between}'
      + '.tm-modal-title{margin:0;font-size:18px;font-weight:700;color:#111827}'
      + '.tm-modal-desc{margin:3px 0 0;font-size:12px;color:#6b7280}'
      + '.tm-modal-body{padding:24px;display:flex;flex-direction:column;gap:16px}'
      + '.tm-modal-footer{padding:16px 24px;border-top:1px solid #f3f4f6;display:flex;gap:8px;justify-content:flex-end}'
      + '.tm-confirm-icon{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#FEE2E2,#FECACA);display:inline-flex;align-items:center;justify-content:center;color:#DC2626}'

      // Empty
      + '.tm-empty{text-align:center;padding:60px 20px}'
      + '.tm-empty-icon{color:#d1d5db;margin-bottom:12px}'
      + '.tm-empty-title{font-size:16px;font-weight:700;color:#374151;margin-bottom:6px}'
      + '.tm-empty-desc{font-size:13px;color:#9ca3af;max-width:360px;margin:0 auto;line-height:1.5}'

      // Toast
      + '.tm-toast{position:fixed;bottom:24px;right:24px;z-index:10000;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.12);transition:all .3s}'
      + '.tm-toast-enter{animation:tmToastIn .3s ease}'
      + '.tm-toast-exit{opacity:0;transform:translateX(20px)}'

      + '</style>'
  }

  window.TeamManageUI = Object.freeze({ init: init })
})()
