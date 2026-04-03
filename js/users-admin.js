/**
 * ClinicAI — Users Admin Module (Sprint 2: Multi-User)
 *
 * API pública (window.*):
 *   loadUsersAdmin()        — carrega lista de staff
 *   loadPendingInvites()    — carrega convites pendentes
 *   openInviteModal()       — abre modal de convite
 *   openEditProfileModal()  — edita perfil do usuário logado
 *
 * Todas as operações críticas passam por RPCs com SECURITY DEFINER no backend.
 * O frontend nunca modifica tabelas diretamente — exceto profiles (update próprio).
 */

;(function () {
'use strict'

// ─── Supabase client (singleton compartilhado) ────────────────────────────────
// Config (lê de window.ClinicEnv — centralizado em js/config/env.js)
const _env = window.ClinicEnv || {}
const SUPABASE_URL = _env.SUPABASE_URL || ''
const SUPABASE_KEY = _env.SUPABASE_KEY || ''

let _sbInstance = null
function _sb() {
  if (!_sbInstance) {
    _sbInstance = window._sbShared
      || (window.supabase?.createClient
          ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
          : null)
  }
  return _sbInstance
}

// ─── Configuração de roles ────────────────────────────────────────────────────
const ROLE_CONFIG = {
  owner:        { label: 'Proprietário', bg: '#F5F3FF', color: '#7C3AED' },
  admin:        { label: 'Administrador', bg: '#FEF2F2', color: '#DC2626' },
  therapist:    { label: 'Terapeuta',    bg: '#F0FDF4', color: '#16A34A' },
  receptionist: { label: 'Recepcionista',bg: '#EFF6FF', color: '#2563EB' },
  viewer:       { label: 'Visualizador', bg: '#F9FAFB', color: '#6B7280' },
}

const ERROR_MESSAGES = {
  insufficient_permissions:        'Sem permissão para realizar esta ação.',
  invalid_role:                    'Nível de acesso inválido.',
  only_owner_can_invite_admin:     'Apenas o proprietário pode convidar administradores.',
  already_member:                  'Este e-mail já é membro ativo da clínica.',
  clinic_not_found:                'Clínica não encontrada. Recarregue a página.',
  cannot_change_owner:             'Não é possível alterar o proprietário por este fluxo.',
  user_not_found_or_already_active:'Usuário não encontrado ou já está ativo.',
  invite_not_found:                'Convite não encontrado ou já foi cancelado.',
}

function _errMsg(code) {
  return ERROR_MESSAGES[code] || code || 'Erro desconhecido'
}

// ─── Escape HTML para evitar XSS ─────────────────────────────────────────────
function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── Toast de feedback ────────────────────────────────────────────────────────
function _toast(msg, type) {
  const t = document.createElement('div')
  const bg = type === 'error' ? '#FEF2F2' : type === 'warn' ? '#FFFBEB' : '#F0FDF4'
  const cl = type === 'error' ? '#DC2626' : type === 'warn' ? '#D97706' : '#15803D'
  t.style.cssText = `position:fixed;bottom:24px;right:24px;background:${bg};color:${cl};padding:12px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-width:320px`
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3500)
}

// ─── Modal base ───────────────────────────────────────────────────────────────
function _createModal(id, content) {
  document.getElementById(id)?.remove()
  const overlay = document.createElement('div')
  overlay.id = id
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:24px'
  overlay.innerHTML = `<div class="_modal-card" style="background:#fff;border-radius:18px;padding:32px;width:100%;max-width:440px;box-shadow:0 24px 80px rgba(0,0,0,0.25)">${content}</div>`
  // Fecha apenas se clicar no overlay (não no card)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })
  document.body.appendChild(overlay)
  return overlay
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTA DE STAFF
// ─────────────────────────────────────────────────────────────────────────────
async function loadUsersAdmin() {
  const container = document.getElementById('usersAdminList')
  if (!container) return

  container.innerHTML = _skeletonRows(3)

  try {
    const { data, error } = await _sb().rpc('list_staff')
    if (error) throw error
    if (!data?.ok) throw new Error(_errMsg(data?.error))

    _renderUserList(container, data.staff || [])
  } catch (e) {
    container.innerHTML = `
      <div style="padding:24px;text-align:center;color:#EF4444;font-size:13px;background:#FEF2F2;border-radius:10px">
        ${_esc(e.message)}
      </div>`
  }
}
window.loadUsersAdmin = loadUsersAdmin

function _renderUserList(container, staff) {
  const myProfile = window.getCurrentProfile?.() || {}
  const canAdmin  = window.PermissionsService?.can('users:deactivate') ?? false

  if (!staff.length) {
    container.innerHTML = `
      <div style="padding:48px;text-align:center;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:12px">
        Nenhum usuário cadastrado ainda.
      </div>`
    return
  }

  container.innerHTML = ''

  staff.forEach(u => {
    const rc       = ROLE_CONFIG[u.role] || { label: u.role, bg: '#F3F4F6', color: '#374151' }
    const first    = (u.first_name || '').trim()
    const last     = (u.last_name  || '').trim()
    const initials = ((first[0] || '') + (last[0] || '')).toUpperCase()
                  || (u.email || 'U')[0].toUpperCase()
    const name     = [first, last].filter(Boolean).join(' ') || u.email
    const isSelf   = u.id === myProfile.id
    const isOwner  = u.role === 'owner'
    const canManage = canAdmin && !isSelf && !isOwner

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:14px;padding:14px 16px;background:#fff;border:1px solid #F3F4F6;border-radius:12px;margin-bottom:8px'

    row.innerHTML = `
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#5B21B6);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${_esc(initials)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;color:#111;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>${_esc(name)}</span>
          ${isSelf ? '<span style="background:#EFF6FF;color:#2563EB;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700">Você</span>' : ''}
          ${!u.is_active ? '<span style="background:#FEF2F2;color:#DC2626;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700">Inativo</span>' : ''}
        </div>
        <div style="font-size:12px;color:#9CA3AF;margin-top:1px">${_esc(u.email)}</div>
      </div>
      <span style="background:${rc.bg};color:${rc.color};padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap">${_esc(rc.label)}</span>
      <div class="_user-actions" style="display:flex;gap:6px"></div>`

    // Botões via addEventListener — sem string interpolation no onclick (evita XSS)
    const actionsEl = row.querySelector('._user-actions')

    if (canManage) {
      const btnRole = document.createElement('button')
      btnRole.title = 'Alterar nível de acesso'
      btnRole.style.cssText = 'padding:6px 10px;background:#F3F4F6;border:none;border-radius:7px;cursor:pointer;color:#374151;font-size:12px;font-weight:600'
      btnRole.innerHTML = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-1px"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> Role`
      btnRole.addEventListener('click', () => openChangeRoleModal(u.id, u.role, name))
      actionsEl.appendChild(btnRole)

      if (u.is_active) {
        const btnDeact = document.createElement('button')
        btnDeact.title = 'Desativar acesso'
        btnDeact.style.cssText = 'padding:6px 10px;background:#FEF2F2;border:none;border-radius:7px;cursor:pointer;color:#DC2626;font-size:12px;font-weight:600'
        btnDeact.innerHTML = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-1px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Desativar`
        btnDeact.addEventListener('click', () => confirmDeactivate(u.id, name))
        actionsEl.appendChild(btnDeact)
      } else {
        const btnAct = document.createElement('button')
        btnAct.title = 'Reativar acesso'
        btnAct.style.cssText = 'padding:6px 10px;background:#F0FDF4;border:none;border-radius:7px;cursor:pointer;color:#16A34A;font-size:12px;font-weight:600'
        btnAct.innerHTML = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-1px"><polyline points="20 6 9 17 4 12"/></svg> Reativar`
        btnAct.addEventListener('click', () => confirmActivate(u.id, name))
        actionsEl.appendChild(btnAct)
      }
    }

    container.appendChild(row)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: CONVIDAR USUÁRIO
// ─────────────────────────────────────────────────────────────────────────────
function openInviteModal() {
  if (!window.PermissionsService?.can('users:invite')) {
    _toast('Apenas proprietários e administradores podem convidar usuários.', 'warn')
    return
  }

  const canInviteAdmin = window.PermissionsService?.isAtLeast('owner') ?? false
  const roleOptions = Object.entries(ROLE_CONFIG)
    .filter(([r]) => r !== 'owner' && (canInviteAdmin || r !== 'admin'))
    .map(([r, cfg]) => `<option value="${r}">${_esc(cfg.label)}</option>`)
    .join('')

  const modal = _createModal('inviteModal', `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h3 style="font-size:16px;font-weight:700;color:#111">Convidar usuário</h3>
      <button id="_inviteCloseBtn" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div id="_inviteErr" style="display:none;background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px"></div>
    <div id="_inviteOk"  style="display:none;background:#F0FDF4;color:#15803D;padding:14px;border-radius:10px;font-size:13px;margin-bottom:16px;line-height:1.6"></div>
    <div style="margin-bottom:14px">
      <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px">E-mail</label>
      <input id="_inviteEmail" type="email" placeholder="colaborador@clinica.com"
        style="width:100%;padding:10px 12px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;outline:none" />
    </div>
    <div style="margin-bottom:24px">
      <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px">Nível de acesso</label>
      <select id="_inviteRole" style="width:100%;padding:10px 12px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;outline:none;background:#fff">
        ${roleOptions}
      </select>
    </div>
    <div style="display:flex;gap:10px">
      <button id="_inviteCancelBtn" style="flex:1;padding:11px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer">Cancelar</button>
      <button id="_inviteSubmitBtn" style="flex:2;padding:11px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer">Enviar convite</button>
    </div>`)

  modal.querySelector('#_inviteCloseBtn').addEventListener('click',  () => modal.remove())
  modal.querySelector('#_inviteCancelBtn').addEventListener('click', () => modal.remove())
  modal.querySelector('#_inviteSubmitBtn').addEventListener('click', () => _submitInvite(modal))
  modal.querySelector('#_inviteEmail')?.focus()
}
window.openInviteModal = openInviteModal

async function _submitInvite(modal) {
  const emailInput = modal.querySelector('#_inviteEmail')
  const roleInput  = modal.querySelector('#_inviteRole')
  const errEl      = modal.querySelector('#_inviteErr')
  const okEl       = modal.querySelector('#_inviteOk')
  const btn        = modal.querySelector('#_inviteSubmitBtn')

  const email = (emailInput?.value || '').trim().toLowerCase()
  const role  = roleInput?.value || ''

  // Validação de email básica
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (errEl) { errEl.textContent = 'Informe um e-mail válido'; errEl.style.display = 'block' }
    return
  }

  if (errEl) errEl.style.display = 'none'
  if (okEl)  okEl.style.display  = 'none'
  if (btn)   { btn.disabled = true; btn.textContent = 'Enviando...' }

  try {
    const { data, error } = await _sb().rpc('invite_staff', { p_email: email, p_role: role })
    if (error) throw error
    if (!data?.ok) throw new Error(_errMsg(data?.error))

    const joinUrl = `${window.location.origin}/join.html?token=${data.raw_token}`

    if (okEl) {
      okEl.innerHTML = `
        <strong>Convite gerado!</strong> Envie o link para <strong>${_esc(data.email)}</strong>:<br>
        <div style="background:#fff;border:1px solid #D1FAE5;border-radius:6px;padding:8px 10px;margin:8px 0;word-break:break-all;font-size:11px;font-family:monospace">${_esc(joinUrl)}</div>
        <button id="_copyInviteBtn" style="padding:6px 14px;background:#16A34A;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Copiar link</button>
        <span style="margin-left:8px;font-size:11px;color:#6B7280">Válido por 48 horas</span>`
      okEl.style.display = 'block'

      okEl.querySelector('#_copyInviteBtn').addEventListener('click', function () {
        navigator.clipboard.writeText(joinUrl).then(() => { this.textContent = 'Copiado!' })
      })
    }

    if (btn)  { btn.disabled = false; btn.textContent = 'Enviar outro convite' }
    if (errEl) errEl.style.display = 'none'

    setTimeout(() => { loadUsersAdmin(); loadPendingInvites() }, 600)
  } catch (e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block' }
    if (btn)   { btn.disabled = false; btn.textContent = 'Enviar convite' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: ALTERAR ROLE
// ─────────────────────────────────────────────────────────────────────────────
function openChangeRoleModal(userId, currentRole, name) {
  const canInviteAdmin = window.PermissionsService?.isAtLeast('owner') ?? false

  const roleOptions = Object.entries(ROLE_CONFIG)
    .filter(([r]) => r !== 'owner' && (canInviteAdmin || r !== 'admin'))
    .map(([r, cfg]) => `<option value="${r}" ${r === currentRole ? 'selected' : ''}>${_esc(cfg.label)}</option>`)
    .join('')

  const modal = _createModal('changeRoleModal', `
    <h3 style="font-size:15px;font-weight:700;color:#111;margin-bottom:6px">Alterar nível de acesso</h3>
    <p style="font-size:13px;color:#6B7280;margin-bottom:20px">${_esc(name)}</p>
    <div id="_changeRoleErr" style="display:none;background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px"></div>
    <select id="_newRoleSelect" style="width:100%;padding:10px 12px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;outline:none;background:#fff;margin-bottom:20px">
      ${roleOptions}
    </select>
    <div style="display:flex;gap:10px">
      <button id="_changeRoleCancelBtn" style="flex:1;padding:10px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
      <button id="_changeRoleSaveBtn"   style="flex:2;padding:10px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Salvar</button>
    </div>`)

  modal.querySelector('#_changeRoleCancelBtn').addEventListener('click', () => modal.remove())
  modal.querySelector('#_changeRoleSaveBtn').addEventListener('click', async () => {
    const newRole = modal.querySelector('#_newRoleSelect')?.value
    const errEl   = modal.querySelector('#_changeRoleErr')
    const btn     = modal.querySelector('#_changeRoleSaveBtn')

    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...' }
    if (errEl) errEl.style.display = 'none'

    try {
      const { data, error } = await _sb().rpc('update_staff_role', { p_user_id: userId, p_new_role: newRole })
      if (error) throw error
      if (!data?.ok) throw new Error(_errMsg(data?.error))

      modal.remove()
      _toast('Role atualizado com sucesso.', 'success')
      loadUsersAdmin()
    } catch (e) {
      if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block' }
      if (btn)   { btn.disabled = false; btn.textContent = 'Salvar' }
    }
  })
}
window.openChangeRoleModal = openChangeRoleModal

// ─────────────────────────────────────────────────────────────────────────────
// DESATIVAR / REATIVAR USUÁRIO
// ─────────────────────────────────────────────────────────────────────────────
async function confirmDeactivate(userId, name) {
  if (!confirm(`Desativar acesso de "${name}"?\n\nO usuário não conseguirá mais entrar no sistema.`)) return

  try {
    const { data, error } = await _sb().rpc('deactivate_staff', { p_user_id: userId })
    if (error) throw error
    if (!data?.ok) throw new Error(_errMsg(data?.error))
    _toast(`Acesso de ${name} desativado.`, 'warn')
    loadUsersAdmin()
  } catch (e) {
    _toast('Erro: ' + e.message, 'error')
  }
}

async function confirmActivate(userId, name) {
  if (!confirm(`Reativar acesso de "${name}"?`)) return

  try {
    const { data, error } = await _sb().rpc('activate_staff', { p_user_id: userId })
    if (error) throw error
    if (!data?.ok) throw new Error(_errMsg(data?.error))
    _toast(`Acesso de ${name} reativado.`, 'success')
    loadUsersAdmin()
  } catch (e) {
    _toast('Erro: ' + e.message, 'error')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVITES PENDENTES
// ─────────────────────────────────────────────────────────────────────────────
async function loadPendingInvites() {
  const container = document.getElementById('pendingInvitesList')
  if (!container) return

  try {
    const { data, error } = await _sb().rpc('list_pending_invites')
    if (error) throw error
    if (!data?.ok) throw new Error(_errMsg(data?.error))

    const invites = data.data || []

    if (!invites.length) {
      container.innerHTML = `
        <div style="padding:16px;text-align:center;color:#9CA3AF;font-size:12px;background:#F9FAFB;border-radius:10px">
          Nenhum convite pendente
        </div>`
      return
    }

    container.innerHTML = ''
    invites.forEach(inv => {
      const rc       = ROLE_CONFIG[inv.role] || { label: inv.role, bg: '#F3F4F6', color: '#374151' }
      const expires  = new Date(inv.expires_at)
      const hoursLeft = Math.max(0, Math.round((expires - Date.now()) / 3600000))

      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;margin-bottom:8px'
      row.innerHTML = `
        <svg width="16" height="16" fill="none" stroke="#D97706" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(inv.email)}</div>
          <div style="font-size:11px;color:#9CA3AF;margin-top:1px">Expira em ${hoursLeft}h</div>
        </div>
        <span style="background:${rc.bg};color:${rc.color};padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap">${_esc(rc.label)}</span>
        <button class="_revokeBtn" style="padding:5px 8px;background:#FEF2F2;border:none;border-radius:6px;cursor:pointer;color:#DC2626;font-size:11px;font-weight:600;white-space:nowrap">Cancelar</button>`

      row.querySelector('._revokeBtn').addEventListener('click', () => _revokeInvite(inv.id, inv.email))
      container.appendChild(row)
    })
  } catch (e) {
    container.innerHTML = `<div style="padding:16px;text-align:center;color:#EF4444;font-size:12px">${_esc(e.message)}</div>`
  }
}
window.loadPendingInvites = loadPendingInvites

async function _revokeInvite(inviteId, email) {
  if (!confirm(`Cancelar convite para ${email}?`)) return

  try {
    const { data, error } = await _sb().rpc('revoke_invite', { p_invite_id: inviteId })
    if (error) throw error
    if (!data?.ok) throw new Error(_errMsg(data?.error))
    _toast('Convite cancelado.', 'warn')
    loadPendingInvites()
  } catch (e) {
    _toast('Erro: ' + e.message, 'error')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: EDITAR PERFIL PRÓPRIO
// ─────────────────────────────────────────────────────────────────────────────
function openEditProfileModal() {
  const profile = window.getCurrentProfile?.() || {}

  const modal = _createModal('editProfileModal', `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h3 style="font-size:15px;font-weight:700;color:#111">Editar perfil</h3>
      <button id="_editProfileCloseBtn" style="background:none;border:none;cursor:pointer;color:#9CA3AF">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div id="_editProfileErr" style="display:none;background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px"></div>
    <div style="margin-bottom:14px">
      <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px">Nome</label>
      <input id="_editFirstName" type="text" value="${_esc(profile.first_name || '')}"
        style="width:100%;padding:10px 12px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;outline:none" />
    </div>
    <div style="margin-bottom:20px">
      <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px">Sobrenome</label>
      <input id="_editLastName" type="text" value="${_esc(profile.last_name || '')}"
        style="width:100%;padding:10px 12px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;outline:none" />
    </div>
    <div style="display:flex;gap:10px">
      <button id="_editProfileCancelBtn" style="flex:1;padding:10px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
      <button id="_editProfileSaveBtn"   style="flex:2;padding:10px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Salvar</button>
    </div>`)

  modal.querySelector('#_editProfileCloseBtn').addEventListener('click',  () => modal.remove())
  modal.querySelector('#_editProfileCancelBtn').addEventListener('click', () => modal.remove())
  modal.querySelector('#_editProfileSaveBtn').addEventListener('click', async () => {
    const firstName = (modal.querySelector('#_editFirstName')?.value || '').trim()
    const lastName  = (modal.querySelector('#_editLastName')?.value  || '').trim()
    const errEl     = modal.querySelector('#_editProfileErr')
    const btn       = modal.querySelector('#_editProfileSaveBtn')

    if (!firstName) {
      if (errEl) { errEl.textContent = 'Informe seu nome'; errEl.style.display = 'block' }
      return
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...' }
    if (errEl) errEl.style.display = 'none'

    try {
      const profile = window.getCurrentProfile?.() || {}
      const { error } = await _sb()
        .from('profiles')
        .update({ first_name: firstName, last_name: lastName })
        .eq('id', profile.id)
      if (error) throw error

      // Atualiza cache local
      const updated = { ...profile, first_name: firstName, last_name: lastName }
      sessionStorage.setItem('clinicai_profile', JSON.stringify(updated))

      modal.remove()
      _toast('Perfil atualizado.', 'success')
      window._updateSidebarUser?.(updated)
    } catch (e) {
      if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block' }
      if (btn)   { btn.disabled = false; btn.textContent = 'Salvar' }
    }
  })

  modal.querySelector('#_editFirstName')?.focus()
}
window.openEditProfileModal = openEditProfileModal

// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE VISIBILIDADE DE SENHA (helper compartilhado)
// ─────────────────────────────────────────────────────────────────────────────
function togglePassVis(inputId, eyeId) {
  const input = document.getElementById(inputId)
  const eye   = document.getElementById(eyeId)
  if (!input) return
  const showing = input.type === 'text'
  input.type = showing ? 'password' : 'text'
  if (eye) {
    eye.innerHTML = showing
      ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
      : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
  }
}
window.togglePassVis = togglePassVis

// ─────────────────────────────────────────────────────────────────────────────
// MEU PERFIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
function showMyProfileModal() {
  document.getElementById('_myProfileModal')?.remove()
  const profile = window.getCurrentProfile?.() || {}

  const first    = (profile.first_name || '').trim()
  const last     = (profile.last_name  || '').trim()
  const name     = [first, last].filter(Boolean).join(' ') || profile.email || 'Usuário'
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const ROLE_LABELS = { owner: 'Proprietário', admin: 'Administrador', therapist: 'Terapeuta', receptionist: 'Recepcionista', viewer: 'Visualizador', gestor: 'Gestor', comercial: 'Comercial', atendimento: 'Atendimento', esteticista: 'Esteticista', financeiro: 'Financeiro', marketing: 'Marketing' }
  const roleLabel = ROLE_LABELS[profile.role] || profile.role || ''

  const m = document.createElement('div')
  m.id = '_myProfileModal'
  m.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9000;padding:16px">
      <div style="background:#fff;border-radius:18px;width:100%;max-width:440px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.22)">
        <div style="background:linear-gradient(135deg,#7C3AED,#5B21B6);padding:28px;text-align:center;position:relative">
          <button onclick="document.getElementById('_myProfileModal').remove()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.18);border:none;border-radius:50%;width:30px;height:30px;color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div style="width:68px;height:68px;background:rgba(255,255,255,0.22);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;margin-bottom:12px">${_esc(initials)}</div>
          <div style="font-size:17px;font-weight:700;color:#fff">${_esc(name)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.78);margin-top:3px">${_esc(roleLabel)}</div>
        </div>
        <div style="padding:22px 24px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
            <div>
              <div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">E-mail</div>
              <div style="font-size:13px;color:#111;font-weight:500;word-break:break-all">${_esc(profile.email || '—')}</div>
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Perfil</div>
              <div style="font-size:13px;color:#111;font-weight:500">${_esc(roleLabel || '—')}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button onclick="document.getElementById('_myProfileModal').remove();openEditProfileModal()"
              style="width:100%;padding:10px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Editar Nome
            </button>
            <button onclick="document.getElementById('_myProfileModal').remove();showChangePasswordModal()"
              style="width:100%;padding:10px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Alterar Senha
            </button>
          </div>
        </div>
      </div>
    </div>`
  document.body.appendChild(m)
}
window.showMyProfileModal = showMyProfileModal

// ─────────────────────────────────────────────────────────────────────────────
// ALTERAR SENHA MODAL
// ─────────────────────────────────────────────────────────────────────────────
function showChangePasswordModal() {
  document.getElementById('_changePwModal')?.remove()
  const m = document.createElement('div')
  m.id = '_changePwModal'
  m.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9000;padding:16px">
      <div style="background:#fff;border-radius:18px;width:100%;max-width:400px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.22)">
        <div style="padding:20px 24px;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0;font-size:15px;font-weight:700;color:#111">Alterar Senha</h2>
          <button onclick="document.getElementById('_changePwModal').remove()" style="background:#F3F4F6;border:none;border-radius:50%;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#6B7280">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style="padding:22px 24px">
          <div id="_cpwErr" style="display:none;background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px"></div>
          <div id="_cpwOk"  style="display:none;background:#F0FDF4;color:#15803D;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px"></div>
          ${_cpwField('_cpw_current','_cpw_e1','Senha Atual')}
          ${_cpwField('_cpw_new','_cpw_e2','Nova Senha','Mínimo 6 caracteres')}
          ${_cpwField('_cpw_confirm','_cpw_e3','Confirmar Nova Senha','Repita a nova senha')}
          <div style="display:flex;gap:10px;margin-top:6px">
            <button onclick="document.getElementById('_changePwModal').remove()" style="flex:1;padding:10px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
            <button id="_cpwBtn" onclick="doChangePassword()" style="flex:2;padding:10px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Salvar Nova Senha</button>
          </div>
        </div>
      </div>
    </div>`
  document.body.appendChild(m)
}
window.showChangePasswordModal = showChangePasswordModal

function _cpwField(id, eyeId, label, placeholder) {
  return `
    <div style="margin-bottom:14px">
      <label style="display:block;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">${label}</label>
      <div style="position:relative">
        <input id="${id}" type="password" placeholder="${placeholder || '••••••'}"
          style="width:100%;padding:9px 38px 9px 12px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;font-family:inherit"/>
        <button type="button" onclick="togglePassVis('${id}','${eyeId}')"
          style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9CA3AF;padding:0;display:flex;align-items:center">
          <svg id="${eyeId}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
    </div>`
}

async function doChangePassword() {
  const current = document.getElementById('_cpw_current')?.value?.trim()
  const newPw   = document.getElementById('_cpw_new')?.value?.trim()
  const confirm = document.getElementById('_cpw_confirm')?.value?.trim()
  const errEl   = document.getElementById('_cpwErr')
  const okEl    = document.getElementById('_cpwOk')
  const btn     = document.getElementById('_cpwBtn')

  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block' } if (okEl) okEl.style.display = 'none' }

  if (!current || !newPw || !confirm) { showErr('Preencha todos os campos'); return }
  if (newPw.length < 6) { showErr('A nova senha deve ter pelo menos 6 caracteres'); return }
  if (newPw !== confirm) { showErr('As senhas não coincidem'); return }

  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...' }
  if (errEl) errEl.style.display = 'none'

  try {
    const profile = window.getCurrentProfile?.() || {}
    // Verifica senha atual fazendo re-autenticação
    const { error: signInErr } = await _sb().auth.signInWithPassword({
      email: profile.email,
      password: current
    })
    if (signInErr) { showErr('Senha atual incorreta'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar Nova Senha' }; return }

    // Altera para nova senha
    const { error: updateErr } = await _sb().auth.updateUser({ password: newPw })
    if (updateErr) throw updateErr

    if (okEl) { okEl.textContent = 'Senha alterada com sucesso!'; okEl.style.display = 'block' }
    setTimeout(() => document.getElementById('_changePwModal')?.remove(), 1600)
  } catch (e) {
    showErr(e.message || 'Erro ao alterar senha')
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar Nova Senha' }
  }
}
window.doChangePassword = doChangePassword

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON LOADER
// ─────────────────────────────────────────────────────────────────────────────
function _skeletonRows(n) {
  return Array.from({ length: n }, () => `
    <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:#F9FAFB;border-radius:12px;margin-bottom:8px;animation:pulse 1.5s ease-in-out infinite">
      <div style="width:40px;height:40px;border-radius:50%;background:#E5E7EB;flex-shrink:0"></div>
      <div style="flex:1">
        <div style="width:160px;height:13px;background:#E5E7EB;border-radius:6px;margin-bottom:7px"></div>
        <div style="width:220px;height:11px;background:#F3F4F6;border-radius:6px"></div>
      </div>
      <div style="width:80px;height:22px;background:#E5E7EB;border-radius:20px"></div>
    </div>`).join('')
}

})()
