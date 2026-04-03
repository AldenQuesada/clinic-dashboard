/**
 * ClinicAI — Quiz Admin: Alerts Module
 *
 * Tab Alertas: campaninha com badge, lista de pendentes,
 * histórico de feitos, marcar como feito.
 * Cada alerta é por quiz específico, não global.
 *
 * Expõe: window.QAAlerts = { buildTab, bindEvents, refreshBadge }
 */
;(function () {
  'use strict'
  if (window.QAAlerts) return

  var _alerts = []
  var _alertFilter = 'pending' // 'pending' | 'done' | 'all'
  var _alertCounts = { total: 0, critical: 0, warning: 0, info: 0, positive: 0 }

  // ── Severity config ──────────────────────────────────────────
  var SEVERITY = {
    critical: { label: 'Urgente',  color: '#ef4444', bg: '#fef2f2', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' },
    warning:  { label: 'Atenção',  color: '#f59e0b', bg: '#fffbeb', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
    info:     { label: 'Info',     color: '#3b82f6', bg: '#eff6ff', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' },
    positive: { label: 'Positivo', color: '#22c55e', bg: '#f0fdf4', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
  }

  var TYPE_LABELS = {
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
    event: 'Evento',
  }

  // ── Build tab HTML ────────────────────────────────────────────
  function buildTab() {
    return '<div id="qa-alerts-root">' +
      '<div class="qa-alerts-loading">Carregando alertas...</div>' +
    '</div>'
  }

  // ── Bind events (called on tab switch) ────────────────────────
  function bindEvents() {
    _loadAlerts()
  }

  // ── Load alerts from repository ───────────────────────────────
  async function _loadAlerts() {
    var quiz = QA.quiz()
    if (!quiz) return

    var root = document.getElementById('qa-alerts-root')
    if (!root) return
    root.innerHTML = '<div class="qa-alerts-loading">Carregando alertas...</div>'

    try {
      var res = await QA.repo().getAlerts(quiz.id, QA.clinicId())
      _alerts = res.ok ? res.data : []

      var countsRes = await QA.repo().getAlertCounts(quiz.id, QA.clinicId())
      _alertCounts = countsRes.ok ? countsRes.data : { total: 0, critical: 0, warning: 0, info: 0, positive: 0 }

      _renderAlerts()
      refreshBadge()
    } catch (err) {
      root.innerHTML = '<div class="qa-analytics-error">Erro ao carregar alertas: ' + QA.esc(err.message || '') + '</div>'
    }
  }

  // ── Render alerts list ────────────────────────────────────────
  function _renderAlerts() {
    var root = document.getElementById('qa-alerts-root')
    if (!root) return

    var pending = _alerts.filter(function(a) { return a.status === 'pending' })
    var done = _alerts.filter(function(a) { return a.status === 'done' })
    var filtered = _alertFilter === 'pending' ? pending : (_alertFilter === 'done' ? done : _alerts)

    // Filter bar
    var filterHtml = '<div class="qa-period-bar">' +
      '<button class="qa-period-btn' + (_alertFilter === 'pending' ? ' active' : '') + '" data-alert-filter="pending">Pendentes (' + pending.length + ')</button>' +
      '<button class="qa-period-btn' + (_alertFilter === 'done' ? ' active' : '') + '" data-alert-filter="done">Feitos (' + done.length + ')</button>' +
      '<button class="qa-period-btn' + (_alertFilter === 'all' ? ' active' : '') + '" data-alert-filter="all">Todos (' + _alerts.length + ')</button>' +
      '<div style="margin-left:auto;display:flex;gap:4px">' +
        '<button class="qa-refresh-btn" id="qa-alerts-generate" title="Gerar alertas manualmente (simula o cron das 18h)">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
          'Gerar Agora' +
        '</button>' +
        '<button class="qa-refresh-btn" id="qa-alerts-refresh">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' +
          'Atualizar' +
        '</button>' +
      '</div>' +
    '</div>'

    // Summary cards
    var summaryHtml = '<div style="display:flex;gap:8px;margin-bottom:16px">' +
      _buildCountCard('Urgentes', _alertCounts.critical || 0, SEVERITY.critical) +
      _buildCountCard('Atenção', _alertCounts.warning || 0, SEVERITY.warning) +
      _buildCountCard('Info', _alertCounts.info || 0, SEVERITY.info) +
      _buildCountCard('Positivos', _alertCounts.positive || 0, SEVERITY.positive) +
    '</div>'

    // Alerts list — segmentado por categoria
    var listHtml = ''
    if (filtered.length === 0) {
      listHtml = '<div class="qa-chart-empty" style="padding:40px">' +
        (_alertFilter === 'pending' ? 'Nenhum alerta pendente. Tudo em dia!' : 'Nenhum alerta no filtro selecionado.') +
      '</div>'
    } else {
      var METRIC_GROUPS = [
        { key: 'lead_new',       label: 'Leads Novos',         icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>' },
        { key: 'lead_duplicate', label: 'Leads Repetidos',     icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
        { key: 'lead_recovered', label: 'Leads Recuperados',   icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>' },
        { key: 'temp_changed',   label: 'Temperatura Mudou',   icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"/></svg>' },
        { key: 'abandon_spike',  label: 'Pico de Abandonos',   icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
        { key: 'page_views',     label: 'Visualizações',       icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' },
        { key: 'engagement',     label: 'Engajamento',         icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>' },
        { key: 'conversion',     label: 'Conversão',           icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' },
        { key: 'wa_rate',        label: 'WhatsApp',            icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>' },
        { key: 'abandoned',      label: 'Abandonos',           icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' },
      ]

      listHtml = METRIC_GROUPS.map(function(group) {
        var groupAlerts = filtered.filter(function(a) { return a.metric === group.key })
        if (groupAlerts.length === 0) return ''
        return '<div class="qa-alert-group">' +
          '<div class="qa-alert-group-title">' + group.icon + ' ' + group.label + ' (' + groupAlerts.length + ')</div>' +
          groupAlerts.map(function(a) { return _buildAlertCard(a) }).join('') +
        '</div>'
      }).join('')

      if (!listHtml) listHtml = '<div class="qa-chart-empty" style="padding:40px">Nenhum alerta no filtro selecionado.</div>'
    }

    root.innerHTML = filterHtml + summaryHtml + '<div id="qa-alerts-list">' + listHtml + '</div>'

    // Bind filter buttons
    root.querySelectorAll('[data-alert-filter]').forEach(function(btn) {
      btn.onclick = function() {
        root.querySelectorAll('[data-alert-filter]').forEach(function(b) { b.classList.remove('active') })
        btn.classList.add('active')
        _alertFilter = btn.getAttribute('data-alert-filter')
        _renderAlerts()
      }
    })

    // Generate now
    var genBtn = document.getElementById('qa-alerts-generate')
    if (genBtn) genBtn.onclick = async function() {
      genBtn.disabled = true
      genBtn.textContent = 'Gerando...'
      try {
        await QA.repo().rpc('quiz_alerts_and_notify', { p_alert_type: 'daily' })
      } catch (e) { /* silent */ }
      genBtn.disabled = false
      genBtn.textContent = 'Gerar Agora'
      _loadAlerts()
    }

    // Refresh
    var refreshBtn = document.getElementById('qa-alerts-refresh')
    if (refreshBtn) refreshBtn.onclick = function() { _loadAlerts() }

    // Mark done buttons
    root.querySelectorAll('[data-mark-done]').forEach(function(btn) {
      btn.onclick = function() {
        var alertId = btn.getAttribute('data-mark-done')
        _markDone(alertId)
      }
    })
  }

  // ── Build single alert card ────────────────────────────────────
  function _buildAlertCard(a) {
    var sev = SEVERITY[a.severity] || SEVERITY.info
    var typeLabel = TYPE_LABELS[a.alert_type] || a.alert_type
    var dateStr = a.created_at
      ? new Date(a.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(a.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : ''
    var isDone = a.status === 'done'
    var doneInfo = ''
    if (isDone && a.done_at) {
      var doneDate = new Date(a.done_at).toLocaleDateString('pt-BR') + ' ' + new Date(a.done_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      doneInfo = '<div class="qa-alert-done-info">Feito por ' + QA.esc(a.done_by || 'SDR') + ' em ' + doneDate + '</div>'
    }

    // Data: variação percentual
    var dataHtml = ''
    if (a.data && a.data.variation !== undefined) {
      var variation = a.data.variation
      var varColor = variation > 0 ? '#22c55e' : (variation < 0 ? '#ef4444' : '#9ca3af')
      var varIcon = variation > 0 ? '&#9650;' : (variation < 0 ? '&#9660;' : '&#9654;')
      dataHtml = '<span class="qa-alert-variation" style="color:' + varColor + '">' + varIcon + ' ' + Math.abs(variation) + '%</span>'
    }

    return '<div class="qa-alert-card' + (isDone ? ' qa-alert-done' : '') + '" style="border-left-color:' + sev.color + '">' +
      '<div class="qa-alert-header">' +
        '<div class="qa-alert-severity" style="background:' + sev.bg + ';color:' + sev.color + '">' +
          sev.icon + ' ' + sev.label +
        '</div>' +
        '<span class="qa-alert-type">' + typeLabel + '</span>' +
        dataHtml +
        '<span class="qa-alert-date">' + dateStr + '</span>' +
      '</div>' +
      '<div class="qa-alert-title">' + QA.esc(a.title) + '</div>' +
      (a.description ? '<div class="qa-alert-desc">' + QA.esc(a.description) + '</div>' : '') +
      (a.recommendation
        ? '<div class="qa-alert-recommendation">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
            '<span>' + QA.esc(a.recommendation) + '</span>' +
          '</div>'
        : '') +
      (isDone
        ? doneInfo
        : '<button class="qa-alert-done-btn" data-mark-done="' + a.id + '">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
            'Marcar como feito' +
          '</button>') +
    '</div>'
  }

  // ── Build count mini-card ──────────────────────────────────────
  function _buildCountCard(label, count, sev) {
    return '<div style="flex:1;padding:10px;border-radius:10px;text-align:center;background:' + sev.bg + ';border:1px solid ' + sev.color + '20">' +
      '<div style="font-size:20px;font-weight:800;color:' + sev.color + '">' + count + '</div>' +
      '<div style="font-size:10px;font-weight:600;color:' + sev.color + ';text-transform:uppercase">' + label + '</div>' +
    '</div>'
  }

  // ── Mark alert as done ─────────────────────────────────────────
  async function _markDone(alertId) {
    try {
    var res = await QA.repo().markAlertDone(alertId)
    if (!res.ok) { alert('Erro ao marcar alerta: ' + (res.error || '')); return }
    if (res.ok) {
      // Update local state
      var alert = _alerts.find(function(a) { return a.id === alertId })
      if (alert) {
        alert.status = 'done'
        alert.done_at = new Date().toISOString()
        alert.done_by = 'SDR'
        _alertCounts.total = Math.max(0, (_alertCounts.total || 0) - 1)
        var sev = alert.severity
        if (_alertCounts[sev]) _alertCounts[sev] = Math.max(0, _alertCounts[sev] - 1)
      }
      _renderAlerts()
      refreshBadge()
    }
    } catch(err) { alert('Erro: ' + (err.message || err)) }
  }

  // ── Badge (campaninha) ─────────────────────────────────────────
  function refreshBadge() {
    var badge = document.getElementById('qa-alerts-badge')
    if (!badge) return
    var count = _alertCounts.total || 0
    var tabBtn = badge.parentElement
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count
      badge.style.display = 'flex'
      if (tabBtn) tabBtn.classList.add('qa-bell-active')
    } else {
      badge.style.display = 'none'
      if (tabBtn) tabBtn.classList.remove('qa-bell-active')
    }
  }

  // Load badge count on quiz select (without loading full alerts)
  async function loadBadgeCount() {
    var quiz = QA.quiz()
    if (!quiz) return
    try {
      var res = await QA.repo().getAlertCounts(quiz.id, QA.clinicId())
      _alertCounts = res.ok ? res.data : { total: 0 }
      refreshBadge()
    } catch (e) { /* silent */ }
  }

  // ── Expose ─────────────────────────────────────────────────────
  window.QAAlerts = Object.freeze({
    buildTab:       buildTab,
    bindEvents:     bindEvents,
    refreshBadge:   refreshBadge,
    loadBadgeCount: loadBadgeCount,
  })
})()
