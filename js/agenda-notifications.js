/**
 * ClinicAI — Agenda Notifications
 *
 * Extraído de api.js. Gerencia o sistema de toast de notificação
 * e o sino (bell) de alertas do header.
 *
 * Funções públicas (window.*):
 *   _showToast(title, subtitle, type)
 *   _dismissToast(el)
 *   _renderNotificationBell()
 *
 * Depende de (globals de api.js):
 *   window._apptGetAll        — acessa lista de agendamentos
 *   window.openFinalizarModal — abre modal de finalização ao clicar no item
 *   window.aprovarUsuario     — aprovação de usuário (auth.js / users-admin.js)
 *   window.rejeitarUsuario    — rejeição de usuário (auth.js / users-admin.js)
 *   window.featherIn          — renderiza ícones feather
 *
 * NOTA: Este arquivo é carregado APÓS api.js.
 */

;(function () {
  'use strict'

  // ── Helper local ──────────────────────────────────────────────
  function _getAppts() {
    return window._apptGetAll
      ? window._apptGetAll()
      : JSON.parse(localStorage.getItem('clinicai_appointments') || '[]')
  }

  function _fmtDate(iso) {
    return window._apptFmtDate ? window._apptFmtDate(iso) : iso
  }

  // ── _showToast ────────────────────────────────────────────────
  function _showToast(title, subtitle, type) {
    type = type || 'info'
    const icons = {
      success: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
      warning: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      error:   `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      info:    `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    }

    const toast = document.createElement('div')
    toast.className = 'clinic-toast toast-' + type
    toast.innerHTML = `
      <span class="clinic-toast-icon">${icons[type] || icons.info}</span>
      <div class="clinic-toast-body">
        <div class="clinic-toast-title">${title}</div>
        ${subtitle ? '<div class="clinic-toast-sub">' + subtitle + '</div>' : ''}
      </div>
      <button class="clinic-toast-close" onclick="_dismissToast(this.closest('.clinic-toast'))">&times;</button>`
    document.body.appendChild(toast)

    // Auto-remover após 5 s
    const timer = setTimeout(function () { _dismissToast(toast) }, 5000)
    toast._timer = timer
  }

  // ── _dismissToast ─────────────────────────────────────────────
  function _dismissToast(el) {
    if (!el || !document.body.contains(el)) return
    clearTimeout(el._timer)
    el.classList.add('hiding')
    setTimeout(function () { el.remove() }, 300)
  }

  // ── _renderNotificationBell ───────────────────────────────────
  function _renderNotificationBell() {
    const appts      = _getAppts()
    const pending    = appts.filter(function (a) { return a.pendente_finalizar && a.status !== 'finalizado' })
    const pendingReg = JSON.parse(localStorage.getItem('clinic_pending_users') || '[]')
    const totalBadge = pending.length + pendingReg.length

    const wrapper = document.getElementById('notifDropdown')
    if (!wrapper) return

    const btn = wrapper.querySelector('button')

    // Badge de contagem
    let badge = wrapper.querySelector('.badge')
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'badge badge-danger'
      if (btn) btn.appendChild(badge)
    }
    if (totalBadge > 0) {
      badge.textContent = totalBadge > 9 ? '9+' : totalBadge
      badge.style.display = ''
    } else {
      badge.style.display = 'none'
    }

    // Animação do sino
    const bellIcon = wrapper.querySelector('svg, i[data-feather="bell"]')
    const bellEl   = bellIcon || btn
    if (bellEl) {
      if (totalBadge > 0) bellEl.classList.add('bell-ringing')
      else                 bellEl.classList.remove('bell-ringing')
    }

    // Itens no menu
    const menu = document.getElementById('notifMenu')
    if (!menu) return
    menu.querySelectorAll('.notif-finalizar-alert,.notif-reg-alert').forEach(function (el) { el.remove() })

    // Cadastros pendentes de aprovação
    pendingReg.forEach(function (u) {
      const item = document.createElement('div')
      item.className = 'notif-item notif-unread notif-reg-alert'
      item.innerHTML = `
        <div class="notif-icon" style="background:#FEF3C7;color:#D97706;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-feather="user-plus" style="width:15px;height:15px"></i>
        </div>
        <div class="notif-content" style="flex:1;min-width:0">
          <p class="notif-title" style="margin:0;font-size:12px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Cadastro: ${u.name}</p>
          <p class="notif-desc" style="margin:2px 0 0;font-size:11px;color:#6B7280">${u.email} &middot; ${u.role || '—'}</p>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button onclick="event.stopPropagation();aprovarUsuario('${u.id}')"
              style="padding:3px 10px;background:#10B981;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">
              &#10003; Aprovar
            </button>
            <button onclick="event.stopPropagation();rejeitarUsuario('${u.id}')"
              style="padding:3px 10px;background:#EF4444;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">
              &#10007; Rejeitar
            </button>
          </div>
        </div>`
      const header = menu.querySelector('.dropdown-header')
      if (header) header.after(item)
      else menu.prepend(item)
    })

    // Finalizações pendentes
    pending.forEach(function (a) {
      const item = document.createElement('div')
      item.className = 'notif-item notif-unread notif-finalizar-alert'
      item.style.cursor = 'pointer'
      item.innerHTML = `
        <div class="notif-icon notif-icon-danger"><i data-feather="alert-circle"></i></div>
        <div class="notif-content">
          <p class="notif-title">Finalizar: ${a.pacienteNome || 'Paciente'}</p>
          <p class="notif-desc">${_fmtDate(a.data)} ${a.horaInicio} &mdash; ${a.procedimento || 'Sem procedimento'}</p>
          <p class="notif-time">Atendimento pendente de finalização</p>
        </div>`
      item.addEventListener('click', function () {
        menu.classList.remove('show')
        if (typeof openFinalizarModal === 'function') openFinalizarModal(a.id)
      })
      const header = menu.querySelector('.dropdown-header')
      if (header) header.after(item)
      else menu.prepend(item)
    })

    if (typeof featherIn === 'function') featherIn(wrapper)

    // Re-anima o sino com feather substituído
    setTimeout(function () {
      const svg = wrapper.querySelector('svg')
      if (svg) {
        if (pending.length > 0) svg.classList.add('bell-ringing')
        else                     svg.classList.remove('bell-ringing')
      }
    }, 50)
  }

  // ── Exposição global ──────────────────────────────────────────
  window._showToast              = _showToast
  window._dismissToast           = _dismissToast
  window._renderNotificationBell = _renderNotificationBell

})()
