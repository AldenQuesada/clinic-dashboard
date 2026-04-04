/**
 * ClinicAI — Birthday UI (main)
 *
 * State management, render orchestration, dashboard + upcoming list.
 * Delega templates para birthday-templates.ui.js e events para birthday-events.ui.js.
 *
 * Depende de: BirthdayService, BirthdayTemplatesUI, BirthdayEvents
 */
;(function () {
  'use strict'
  if (window._clinicaiBirthdayUILoaded) return
  window._clinicaiBirthdayUILoaded = true

  // ── Helpers ────────────────────────────────────────────────
  function _esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML }
  function _ico(name, size) {
    if (typeof feather !== 'undefined' && feather.icons && feather.icons[name])
      return feather.icons[name].toSvg({ width: size || 16, height: size || 16, 'stroke-width': 1.8 })
    return ''
  }

  // ── State ──────────────────────────────────────────────────
  var _tab = 'dashboard'
  var _segFilter = null
  var _loading = false
  var _selectedCampaign = null

  function getState() {
    return { tab: _tab, segFilter: _segFilter, loading: _loading, selectedCampaign: _selectedCampaign }
  }
  function setState(key, val) {
    if (key === 'tab') _tab = val
    if (key === 'segFilter') _segFilter = val
    if (key === 'loading') _loading = val
    if (key === 'selectedCampaign') _selectedCampaign = val
  }

  // ── Main render ────────────────────────────────────────────
  function render() {
    var root = document.getElementById('birthday-root')
    if (!root) return
    var svc = window.BirthdayService
    if (!svc) return

    var html = '<div class="bday-module">'

    // Header
    html += '<div class="bday-header">'
    html += '<div class="bday-title">' + _ico('gift', 22) + ' <span>Aniversarios</span></div>'
    html += '<div class="bday-tabs">'
    html += _tabBtn('dashboard', 'bar-chart-2', 'Painel')
    html += _tabBtn('timeline', 'git-branch', 'Timeline')
    html += _tabBtn('campaigns', 'users', 'Campanhas')
    html += '</div>'
    var paused = window.BirthdayService.isPaused()
    if (paused) {
      html += '<button class="bday-pause-btn bday-pause-active" id="bdayResumeBtn">' + _ico('play', 14) + ' Retomar todas</button>'
    } else {
      html += '<button class="bday-pause-btn" id="bdayPauseBtn">' + _ico('pause', 14) + ' Pausar todas</button>'
    }
    html += '<button class="bday-scan-btn" id="bdayScanBtn">' + _ico('refresh-cw', 14) + ' Escanear</button>'
    html += '</div>'

    if (_loading) {
      html += '<div class="bday-loading">' + _ico('loader', 18) + ' Carregando...</div></div>'
      root.innerHTML = html
      if (window.BirthdayEvents) window.BirthdayEvents.attach()
      return
    }

    if (_tab === 'dashboard') html += _renderDashboard()
    else if (_tab === 'timeline') html += window.BirthdayTemplatesUI ? window.BirthdayTemplatesUI.render() : ''
    else if (_tab === 'campaigns') html += _renderCampaigns()

    html += '</div>'
    root.innerHTML = html
    if (window.BirthdayEvents) window.BirthdayEvents.attach()
  }

  function _tabBtn(key, icon, label) {
    return '<button class="bday-tab' + (_tab === key ? ' active' : '') + '" data-tab="' + key + '">' + _ico(icon, 14) + ' ' + label + '</button>'
  }

  // ── Dashboard ──────────────────────────────────────────────
  function _renderDashboard() {
    var s = window.BirthdayService.getStats()
    var upcoming = window.BirthdayService.getUpcoming()
    var html = ''

    // KPIs
    html += '<div class="bday-kpis">'
    html += _kpi(s.upcoming_30d || 0, 'Prox. 30 dias', '#2563EB', 'calendar')
    html += _kpi(s.total_campaigns || 0, 'Campanhas', '#10B981', 'send')
    html += _kpi(s.sending || 0, 'Enviando', '#F59E0B', 'loader')
    html += _kpi(s.responded || 0, 'Responderam', '#8B5CF6', 'message-circle')
    html += _kpi((s.response_rate || 0) + '%', 'Taxa resp.', '#C9A96E', 'trending-up')
    html += _kpi(s.with_open_budget || 0, 'Orc. aberto', '#EF4444', 'alert-circle')
    html += '</div>'

    // Segment breakdown
    html += '<div class="bday-segments">'
    html += _segCard(s.segment_paciente || 0, 'Paciente', '#10B981')
    html += _segCard(s.segment_paciente_orcamento || 0, 'Paciente + Orc.', '#F59E0B')
    html += _segCard(s.segment_orcamento || 0, 'Orcamento', '#2563EB')
    html += '</div>'

    // Upcoming list
    html += '<div class="bday-section-title">' + _ico('calendar', 16) + ' Proximos aniversarios</div>'
    html += '<div class="bday-upcoming-list">'

    if (!upcoming.length) {
      html += '<div class="bday-empty">Nenhum aniversario nos proximos 60 dias</div>'
    } else {
      upcoming.forEach(function (u) {
        html += _renderUpcomingCard(u)
      })
    }
    html += '</div>'
    return html
  }

  function _kpi(val, label, color, icon) {
    return '<div class="bday-kpi">'
      + '<div class="bday-kpi-icon" style="background:' + color + '15;color:' + color + '">' + _ico(icon, 16) + '</div>'
      + '<span class="bday-kpi-val" style="color:' + color + '">' + val + '</span>'
      + '<span class="bday-kpi-lbl">' + label + '</span></div>'
  }

  function _segCard(val, label, color) {
    return '<div class="bday-seg-card" style="border-top:3px solid ' + color + '">'
      + '<span class="bday-seg-val">' + val + '</span>'
      + '<span class="bday-seg-lbl">' + label + '</span></div>'
  }

  function _renderUpcomingCard(u) {
    var bd = u.birth_date ? new Date(u.birth_date + 'T12:00:00') : null
    var dayLabel = bd ? (bd.getDate().toString().padStart(2, '0') + '/' + (bd.getMonth() + 1).toString().padStart(2, '0')) : '-'
    var urgency = u.days_until <= 3 ? 'bday-critical' : u.days_until <= 7 ? 'bday-urgent' : u.days_until <= 14 ? 'bday-soon' : ''

    var html = '<div class="bday-up-card ' + urgency + '">'
    html += '<div class="bday-up-avatar">' + _esc((u.name || '?')[0].toUpperCase()) + '</div>'
    html += '<div class="bday-up-info">'
    html += '<span class="bday-up-name">' + _esc(u.name) + '</span>'
    html += '<span class="bday-up-detail">' + dayLabel + ' &middot; ' + (u.age_turning || '?') + ' anos</span>'
    html += '</div>'

    html += '<div class="bday-up-tags">'
    if (u.has_open_budget) {
      html += '<span class="bday-tag bday-tag-budget">' + _ico('file-text', 11) + ' Orc. R$ ' + (u.budget_total || 0) + '</span>'
    }
    html += '</div>'

    html += '<div class="bday-up-countdown">'
    html += '<span class="bday-up-days-num">' + u.days_until + '</span>'
    html += '<span class="bday-up-days-label">dias</span>'
    html += '</div>'

    html += '<div class="bday-up-status">'
    if (u.has_campaign) {
      html += '<span class="bday-badge bday-badge-ok">' + _ico('check', 12) + '</span>'
    } else {
      html += '<span class="bday-badge bday-badge-wait">' + _ico('clock', 12) + '</span>'
    }
    html += '</div>'
    html += '</div>'
    return html
  }

  // ── Campaigns ──────────────────────────────────────────────
  function _renderCampaigns() {
    var campaigns = _segFilter
      ? window.BirthdayService.getCampaignsBySegment(_segFilter)
      : window.BirthdayService.getCampaigns()
    var html = ''

    // Filters + actions
    html += '<div class="bday-camp-topbar">'
    html += '<div class="bday-camp-filters">'
    html += _filterBtn('', 'Todos')
    html += _filterBtn('paciente', 'Paciente')
    html += _filterBtn('paciente_orcamento', 'Paciente + Orc.')
    html += _filterBtn('orcamento', 'Orcamento')
    html += '</div>'
    html += '<button class="bday-rules-btn" id="bdayAutoExclude">' + _ico('shield', 13) + ' Aplicar regras</button>'
    html += '</div>'

    // Stats bar
    var s = window.BirthdayService.getStats()
    if (s.excluded > 0) {
      html += '<div class="bday-excluded-bar">' + _ico('alert-triangle', 13) + ' '
        + s.excluded + ' lead' + (s.excluded > 1 ? 's' : '') + ' exclu\u00eddo' + (s.excluded > 1 ? 's' : '')
        + ' (' + (s.excluded_auto || 0) + ' auto, ' + (s.excluded_manual || 0) + ' manual)</div>'
    }

    html += '<div class="bday-camp-list">'
    if (!campaigns.length) {
      html += '<div class="bday-empty">Nenhuma campanha' + (_segFilter ? ' neste segmento' : '') + '</div>'
    } else {
      campaigns.forEach(function (c) {
        html += _renderCampaignCard(c)
      })
    }
    html += '</div>'
    return html
  }

  function _filterBtn(seg, label) {
    var active = (_segFilter || '') === seg
    return '<button class="bday-seg-filter' + (active ? ' active' : '') + '" data-seg="' + seg + '">' + label + '</button>'
  }

  function _renderCampaignCard(c) {
    var statusMap = { pending: 'Pendente', sending: 'Enviando', paused: 'Pausada', completed: 'Concluida', responded: 'Respondeu', cancelled: 'Cancelada' }
    var segMap = { paciente: 'Paciente', orcamento: 'Orcamento', paciente_orcamento: 'Pac + Orc' }
    var bd = c.birth_date ? new Date(c.birth_date + 'T12:00:00') : null
    var dayLabel = bd ? (bd.getDate().toString().padStart(2, '0') + '/' + (bd.getMonth() + 1).toString().padStart(2, '0')) : '-'
    var progress = c.total_messages > 0 ? Math.round((c.sent_messages / c.total_messages) * 100) : 0

    var isExcluded = c.is_excluded === true
    var reasonMap = {
      open_budget: 'Or\u00e7amento em aberto',
      recent_procedure: 'Procedimento recente',
      upcoming_appointment: 'Agendamento pr\u00f3ximo',
      human_channel: 'Atendimento humano',
      no_opt_in: 'WhatsApp desativado',
      no_phone: 'Sem telefone',
      manual: 'Desativado manualmente'
    }

    var html = '<div class="bday-camp-card' + (isExcluded ? ' bday-camp-excluded' : '') + '">'

    // Toggle switch
    html += '<label class="bday-switch"><input type="checkbox" ' + (!isExcluded ? 'checked' : '') + ' data-toggle-lead="' + c.id + '"><span class="bday-slider"></span></label>'

    // Avatar + info
    html += '<div class="bday-camp-avatar">' + _esc((c.lead_name || '?')[0].toUpperCase()) + '</div>'
    html += '<div class="bday-camp-info">'
    html += '<span class="bday-camp-name">' + _esc(c.lead_name) + '</span>'
    html += '<span class="bday-camp-meta">' + dayLabel + ' &middot; ' + (c.age_turning || '?') + 'a &middot; ' + (segMap[c.segment] || c.segment) + '</span>'
    if (c.queixas && c.queixas !== 'aquelas coisinhas') {
      html += '<span class="bday-camp-queixas">' + _ico('clipboard', 10) + ' ' + _esc(c.queixas).substring(0, 50) + '</span>'
    }
    if (isExcluded && c.exclude_reason) {
      html += '<span class="bday-camp-reason">' + _ico('alert-triangle', 10) + ' ' + (reasonMap[c.exclude_reason] || c.exclude_reason)
        + (c.excluded_by === 'auto' ? ' (auto)' : '') + '</span>'
    }
    html += '</div>'

    // Progress
    html += '<div class="bday-camp-progress">'
    html += '<div class="bday-progress-bar"><div class="bday-progress-fill" style="width:' + progress + '%"></div></div>'
    html += '<span class="bday-progress-label">' + (c.sent_messages || 0) + '/' + (c.total_messages || 0) + '</span>'
    html += '</div>'

    // Right: budget alert + status
    html += '<div class="bday-camp-end">'
    if (c.has_open_budget) {
      html += '<span class="bday-tag bday-tag-budget">' + _ico('alert-circle', 11) + ' R$ ' + (c.budget_total || 0) + '</span>'
    }
    html += '<span class="bday-camp-status bday-st-' + c.status + '">' + (statusMap[c.status] || c.status) + '</span>'
    html += '</div>'

    html += '</div>'
    return html
  }

  // ── Mount ──────────────────────────────────────────────────
  var _mounted = false
  async function mount() {
    if (_mounted) return
    _mounted = true
    _loading = true
    render()
    await window.BirthdayService.loadAll()
    _loading = false
    render()
  }

  function unmount() { _mounted = false }

  // Auto-mount on page visibility
  document.addEventListener('DOMContentLoaded', function () {
    // Listen for sidebar navigation
    document.addEventListener('clinicai:page-change', function (e) {
      if (e.detail === 'birthday-campaigns') mount()
    })
    // Fallback: check periodically if page is active (for navigateTo compatibility)
    var _checkInterval = setInterval(function () {
      var page = document.getElementById('page-birthday-campaigns')
      if (page && page.style.display !== 'none' && page.offsetParent !== null) {
        clearInterval(_checkInterval)
        mount()
      }
    }, 500)
    // Clear after 30s to avoid infinite polling
    setTimeout(function () { clearInterval(_checkInterval) }, 30000)
  })

  // ── Expose ─────────────────────────────────────────────────
  window.BirthdayUI = Object.freeze({
    render: render,
    mount: mount,
    unmount: unmount,
    getState: getState,
    setState: setState,
    esc: _esc,
    ico: _ico,
  })
})()
