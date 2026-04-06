// ── ClinicAI — Painel do Dia ─────────────────────────────────────
// Pipeline visual dos agendamentos de hoje com alertas e acoes rapidas
// Depende: agenda-smart.js (STATUS_LABELS, STATUS_COLORS, STATE_MACHINE, apptTransition)

;(function () {
'use strict'

// ── Constantes ───────────────────────────────────────────────────
var PIPELINE_PHASES = [
  { id:'aguardando_confirmacao', label:'Aguard. Confirmacao', icon:'clock' },
  { id:'confirmado',             label:'Confirmados',         icon:'check-circle' },
  { id:'aguardando',             label:'Aguardando',          icon:'user' },
  { id:'na_clinica',             label:'Na Clinica',          icon:'home' },
  { id:'em_consulta',            label:'Em Consulta',         icon:'activity' },
  { id:'finalizado',             label:'Finalizados',         icon:'check' },
]

var ALERT_CHECK_INTERVAL = 30000 // 30s
var _alertTimer = null
var _activeAlerts = new Map()
var _dismissedAlerts = new Set()

// ── Renderizar Painel do Dia ─────────────────────────────────────
function renderDayPanel(container) {
  if (!container) return
  var today = new Date().toISOString().slice(0, 10)
  var allAppts = window.getAppointments ? getAppointments() : []
  var appts = allAppts.filter(function(a) {
    return a.data === today && a.status !== 'cancelado' && a.status !== 'no_show' && a.status !== 'remarcado'
  })

  // Agrupar por fase do pipeline
  var groups = {}
  PIPELINE_PHASES.forEach(function(p) { groups[p.id] = [] })
  groups['agendado'] = []

  appts.forEach(function(a) {
    var status = a.status || 'agendado'
    if (status === 'agendado') {
      groups['aguardando_confirmacao'].push(a) // agendado vai pra primeira coluna
    } else if (groups[status]) {
      groups[status].push(a)
    }
  })

  // Sort cada grupo por hora
  Object.keys(groups).forEach(function(k) {
    groups[k].sort(function(a, b) { return (a.horaInicio || '') > (b.horaInicio || '') ? 1 : -1 })
  })

  // KPIs do dia
  var total = appts.length
  var confirmados = appts.filter(function(a) { return ['confirmado','aguardando','na_clinica','em_consulta','finalizado'].includes(a.status) }).length
  var finalizados = groups['finalizado'].length
  var emAndamento = groups['na_clinica'].length + groups['em_consulta'].length
  var aguardando = groups['aguardando_confirmacao'].length + groups['aguardando'].length

  // Calcular alertas
  var alerts = _checkAlerts(appts)

  var html = ''

  // ── Header KPIs ─────────────────────────────────────────────
  html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">'
  html += '<div style="flex-shrink:0"><h2 style="font-size:18px;font-weight:800;color:#111;margin:0">Painel do Dia</h2>'
  html += '<p style="font-size:12px;color:#6B7280;margin:2px 0 0">' + _formatDateBR(today) + '</p></div>'
  html += '<div style="flex:1"></div>'
  html += _kpiBadge(total, 'Total', '#374151')
  html += _kpiBadge(confirmados, 'Confirmados', '#10B981')
  html += _kpiBadge(emAndamento, 'Em Andamento', '#7C3AED')
  html += _kpiBadge(finalizados, 'Finalizados', '#374151')
  html += _kpiBadge(aguardando, 'Pendentes', '#F59E0B')
  html += '</div>'

  // ── Alertas ─────────────────────────────────────────────────
  if (alerts.length > 0) {
    html += '<div id="dayPanelAlerts" style="margin-bottom:14px;display:flex;flex-direction:column;gap:6px">'
    alerts.forEach(function(alert) {
      if (_dismissedAlerts.has(alert.id)) return
      var colors = alert.type === 'danger' ? { bg:'#FEF2F2', border:'#FECACA', text:'#DC2626', icon:'#EF4444' }
                 : alert.type === 'warning' ? { bg:'#FFFBEB', border:'#FDE68A', text:'#92400E', icon:'#F59E0B' }
                 : { bg:'#ECFDF5', border:'#A7F3D0', text:'#065F46', icon:'#10B981' }

      html += '<div data-alert-id="' + alert.id + '" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:' + colors.bg + ';border:1px solid ' + colors.border + ';border-radius:10px;animation:fadeIn .3s ease">'
      html += '<div style="flex-shrink:0;width:8px;height:8px;border-radius:50%;background:' + colors.icon + ';animation:' + (alert.type === 'danger' ? 'pulse 1.5s infinite' : 'none') + '"></div>'
      html += '<div style="flex:1;min-width:0">'
      html += '<div style="font-size:12px;font-weight:700;color:' + colors.text + '">' + _escHtml(alert.title) + '</div>'
      html += '<div style="font-size:11px;color:' + colors.text + ';opacity:.8;margin-top:1px">' + _escHtml(alert.message) + '</div>'
      html += '</div>'
      if (alert.action) {
        html += '<button onclick="' + alert.action + '" style="flex-shrink:0;padding:5px 10px;background:#fff;border:1px solid ' + colors.border + ';border-radius:6px;font-size:10px;font-weight:700;color:' + colors.text + ';cursor:pointer">' + _escHtml(alert.actionLabel || 'Ver') + '</button>'
      }
      html += '<button onclick="dismissDayAlert(\'' + alert.id + '\')" style="flex-shrink:0;background:none;border:none;cursor:pointer;color:' + colors.text + ';opacity:.5;font-size:16px;padding:0 4px">x</button>'
      html += '</div>'
    })
    html += '</div>'
  }

  // ── Pipeline Kanban ─────────────────────────────────────────
  html += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;min-height:300px">'
  PIPELINE_PHASES.forEach(function(phase) {
    var items = groups[phase.id] || []
    var sc = window.STATUS_COLORS ? STATUS_COLORS[phase.id] || { color:'#374151', bg:'#F3F4F6' } : { color:'#374151', bg:'#F3F4F6' }

    html += '<div style="background:#FAFAFA;border-radius:12px;border:1px solid #F3F4F6;display:flex;flex-direction:column;min-height:200px">'

    // Column header
    html += '<div style="padding:10px 12px;border-bottom:2px solid ' + sc.color + ';display:flex;align-items:center;justify-content:space-between">'
    html += '<div style="font-size:11px;font-weight:800;color:' + sc.color + ';text-transform:uppercase;letter-spacing:.04em">' + phase.label + '</div>'
    html += '<span style="font-size:11px;font-weight:800;color:#fff;background:' + sc.color + ';border-radius:10px;padding:1px 7px;min-width:18px;text-align:center">' + items.length + '</span>'
    html += '</div>'

    // Cards
    html += '<div style="flex:1;padding:8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;max-height:500px">'
    if (!items.length) {
      html += '<div style="text-align:center;color:#D1D5DB;font-size:11px;padding:20px 0">Nenhum</div>'
    }
    items.forEach(function(a) {
      html += _renderApptCard(a, phase.id)
    })
    html += '</div></div>'
  })
  html += '</div>'

  // ── CSS Animations ─────────────────────────────────────────
  if (!document.getElementById('dayPanelStyles')) {
    var style = document.createElement('style')
    style.id = 'dayPanelStyles'
    style.textContent = '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}'
    document.head.appendChild(style)
  }

  container.innerHTML = html

  // Iniciar timer de alertas
  _startAlertTimer()
}

// ── Card de agendamento ──────────────────────────────────────────
function _renderApptCard(a, phaseId) {
  var sc = window.STATUS_COLORS ? STATUS_COLORS[a.status] || { color:'#374151', bg:'#F3F4F6' } : { color:'#374151', bg:'#F3F4F6' }
  var timeLeft = _getTimeLeft(a)
  var isUrgent = timeLeft !== null && timeLeft <= 10 && timeLeft > 0 && ['em_consulta','na_clinica'].includes(a.status)
  var borderColor = isUrgent ? '#EF4444' : '#E5E7EB'

  var html = '<div onclick="openApptDetail(\'' + a.id + '\')" style="background:#fff;border-radius:8px;border:1.5px solid ' + borderColor + ';padding:8px 10px;cursor:pointer;transition:all .15s'
  if (isUrgent) html += ';animation:pulse 2s infinite'
  html += '" onmouseenter="this.style.boxShadow=\'0 2px 8px rgba(0,0,0,.08)\'" onmouseleave="this.style.boxShadow=\'none\'">'

  // Nome + hora
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
  html += '<div style="font-size:12px;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px">' + _escHtml(a.pacienteNome || 'Paciente') + '</div>'
  html += '<div style="font-size:10px;font-weight:700;color:' + sc.color + '">' + (a.horaInicio || '') + '</div>'
  html += '</div>'

  // Procedimento
  if (a.procedimento) {
    html += '<div style="font-size:10px;color:#6B7280;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _escHtml(a.procedimento) + '</div>'
  }

  // Profissional
  if (a.profissionalNome) {
    html += '<div style="font-size:9px;color:#9CA3AF;margin-top:2px">' + _escHtml(a.profissionalNome) + '</div>'
  }

  // Time left indicator
  if (timeLeft !== null && ['em_consulta','na_clinica','aguardando'].includes(a.status)) {
    var tlColor = timeLeft <= 0 ? '#EF4444' : timeLeft <= 10 ? '#F59E0B' : '#6B7280'
    var tlText = timeLeft <= 0 ? 'Tempo excedido' : timeLeft + ' min restantes'
    html += '<div style="font-size:9px;font-weight:700;color:' + tlColor + ';margin-top:4px">' + tlText + '</div>'
  }

  // Botoes de acao rapida
  var allowed = window.STATE_MACHINE ? (STATE_MACHINE[a.status] || []).filter(function(s) { return s !== 'cancelado' && s !== 'no_show' && s !== 'remarcado' }) : []
  if (allowed.length > 0) {
    html += '<div style="display:flex;gap:3px;margin-top:5px;flex-wrap:wrap">'
    allowed.slice(0, 2).forEach(function(ns) {
      var nsc = window.STATUS_COLORS ? STATUS_COLORS[ns] || { color:'#374151' } : { color:'#374151' }
      var nsl = window.STATUS_LABELS ? STATUS_LABELS[ns] || ns : ns
      html += '<button onclick="event.stopPropagation();dayPanelTransition(\'' + a.id + '\',\'' + ns + '\')" style="font-size:9px;font-weight:700;padding:2px 6px;border:1px solid ' + nsc.color + ';background:' + (nsc.bg || '#F3F4F6') + ';color:' + nsc.color + ';border-radius:4px;cursor:pointer">' + nsl + '</button>'
    })
    html += '</div>'
  }

  // Finalizar (acao especial)
  if (a.status === 'em_consulta') {
    html += '<button onclick="event.stopPropagation();openFinalizeModal(\'' + a.id + '\')" style="margin-top:5px;width:100%;font-size:10px;font-weight:800;padding:4px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:5px;cursor:pointer">Finalizar</button>'
  }

  html += '</div>'
  return html
}

// ── Alertas ──────────────────────────────────────────────────────
function _checkAlerts(appts) {
  var alerts = []
  var now = new Date()
  var nowMinutes = now.getHours() * 60 + now.getMinutes()

  appts.forEach(function(a) {
    if (!a.horaInicio || !a.horaFim) return
    var parts = a.horaInicio.split(':')
    var startMin = parseInt(parts[0]) * 60 + parseInt(parts[1])
    var endParts = a.horaFim.split(':')
    var endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1])

    // Alerta: 10 min antes de finalizar
    var minsToEnd = endMin - nowMinutes
    if (minsToEnd > 0 && minsToEnd <= 10 && ['em_consulta','na_clinica'].includes(a.status)) {
      alerts.push({
        id: 'end10_' + a.id,
        type: 'danger',
        title: 'Faltam ' + minsToEnd + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: a.procedimento + ' com ' + (a.profissionalNome || '') + ' termina as ' + a.horaFim,
        action: "openApptDetail('" + a.id + "')",
        actionLabel: 'Abrir',
        priority: 1,
      })
    }

    // Alerta: paciente atrasado (passou horario, ainda aguardando)
    if (nowMinutes > startMin + 15 && ['agendado','aguardando_confirmacao','confirmado','aguardando'].includes(a.status)) {
      var atraso = nowMinutes - startMin
      alerts.push({
        id: 'late_' + a.id,
        type: 'warning',
        title: 'Atrasado ' + atraso + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: 'Agendado para ' + a.horaInicio + '. Confirmar presenca ou remarcar.',
        action: "openApptDetail('" + a.id + "')",
        actionLabel: 'Ver',
        priority: 2,
      })
    }

    // Alerta: nao confirmou (30min antes do horario e ainda nao confirmado)
    var minsToStart = startMin - nowMinutes
    if (minsToStart > 0 && minsToStart <= 30 && ['agendado','aguardando_confirmacao'].includes(a.status)) {
      alerts.push({
        id: 'noconf_' + a.id,
        type: 'warning',
        title: 'Sem confirmacao — ' + (a.pacienteNome || 'Paciente'),
        message: 'Consulta as ' + a.horaInicio + '. Paciente nao confirmou presenca.',
        action: "openApptDetail('" + a.id + "')",
        actionLabel: 'Contatar',
        priority: 3,
      })
    }

    // Alerta: proximo paciente (em 15 min)
    if (minsToStart > 0 && minsToStart <= 15 && ['confirmado','aguardando'].includes(a.status)) {
      alerts.push({
        id: 'next_' + a.id,
        type: 'info',
        title: 'Proximo em ' + minsToStart + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: a.procedimento + ' as ' + a.horaInicio + ' com ' + (a.profissionalNome || ''),
        priority: 4,
      })
    }

    // Alerta: tempo excedido (passou do horario final e nao finalizou)
    if (nowMinutes > endMin && ['em_consulta','na_clinica'].includes(a.status)) {
      var excedido = nowMinutes - endMin
      alerts.push({
        id: 'over_' + a.id,
        type: 'danger',
        title: 'Tempo excedido ' + excedido + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: 'Deveria ter finalizado as ' + a.horaFim + '. Verificar com profissional.',
        action: "openFinalizeModal('" + a.id + "')",
        actionLabel: 'Finalizar',
        priority: 0,
      })
    }
  })

  // Sort por prioridade
  alerts.sort(function(a, b) { return a.priority - b.priority })
  return alerts
}

// ── Timer de alertas ─────────────────────────────────────────────
function _startAlertTimer() {
  if (_alertTimer) clearInterval(_alertTimer)
  _alertTimer = setInterval(function() {
    var container = document.getElementById('dayPanelRoot')
    if (container && container.offsetParent !== null) {
      _refreshAlerts()
    }
  }, ALERT_CHECK_INTERVAL)
}

function _refreshAlerts() {
  var today = new Date().toISOString().slice(0, 10)
  var allAppts = window.getAppointments ? getAppointments() : []
  var appts = allAppts.filter(function(a) {
    return a.data === today && a.status !== 'cancelado' && a.status !== 'no_show' && a.status !== 'remarcado'
  })
  var alerts = _checkAlerts(appts)
  var el = document.getElementById('dayPanelAlerts')
  if (!el) return

  // Atualizar alertas existentes e adicionar novos
  var newAlerts = alerts.filter(function(a) { return !_dismissedAlerts.has(a.id) })
  if (newAlerts.length === 0) {
    el.innerHTML = ''
    return
  }

  // Re-render alerts section
  var html = ''
  newAlerts.forEach(function(alert) {
    var colors = alert.type === 'danger' ? { bg:'#FEF2F2', border:'#FECACA', text:'#DC2626', icon:'#EF4444' }
               : alert.type === 'warning' ? { bg:'#FFFBEB', border:'#FDE68A', text:'#92400E', icon:'#F59E0B' }
               : { bg:'#ECFDF5', border:'#A7F3D0', text:'#065F46', icon:'#10B981' }

    html += '<div data-alert-id="' + alert.id + '" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:' + colors.bg + ';border:1px solid ' + colors.border + ';border-radius:10px">'
    html += '<div style="flex-shrink:0;width:8px;height:8px;border-radius:50%;background:' + colors.icon + ';animation:' + (alert.type === 'danger' ? 'pulse 1.5s infinite' : 'none') + '"></div>'
    html += '<div style="flex:1;min-width:0">'
    html += '<div style="font-size:12px;font-weight:700;color:' + colors.text + '">' + _escHtml(alert.title) + '</div>'
    html += '<div style="font-size:11px;color:' + colors.text + ';opacity:.8;margin-top:1px">' + _escHtml(alert.message) + '</div>'
    html += '</div>'
    if (alert.action) {
      html += '<button onclick="' + alert.action + '" style="flex-shrink:0;padding:5px 10px;background:#fff;border:1px solid ' + colors.border + ';border-radius:6px;font-size:10px;font-weight:700;color:' + colors.text + ';cursor:pointer">' + _escHtml(alert.actionLabel || 'Ver') + '</button>'
    }
    html += '<button onclick="dismissDayAlert(\'' + alert.id + '\')" style="flex-shrink:0;background:none;border:none;cursor:pointer;color:' + colors.text + ';opacity:.5;font-size:16px;padding:0 4px">x</button>'
    html += '</div>'
  })
  el.innerHTML = html

  // Notificacao sonora para alertas danger novos
  newAlerts.forEach(function(alert) {
    if (alert.type === 'danger' && !_activeAlerts.has(alert.id)) {
      _playAlertSound()
    }
    _activeAlerts.set(alert.id, true)
  })
}

function _playAlertSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)()
    var osc = ctx.createOscillator()
    var gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800
    gain.gain.value = 0.15
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.stop(ctx.currentTime + 0.3)
  } catch(e) { /* silencioso se audio nao disponivel */ }
}

// ── Helpers ──────────────────────────────────────────────────────
function _getTimeLeft(a) {
  if (!a.horaFim) return null
  var now = new Date()
  var parts = a.horaFim.split(':')
  var endMin = parseInt(parts[0]) * 60 + parseInt(parts[1])
  var nowMin = now.getHours() * 60 + now.getMinutes()
  return endMin - nowMin
}

function _kpiBadge(value, label, color) {
  return '<div style="text-align:center;padding:6px 14px;background:' + color + '0D;border-radius:8px;border:1px solid ' + color + '22">' +
    '<div style="font-size:18px;font-weight:800;color:' + color + '">' + value + '</div>' +
    '<div style="font-size:9px;font-weight:700;color:' + color + ';text-transform:uppercase;letter-spacing:.03em">' + label + '</div></div>'
}

function _formatDateBR(iso) {
  var d = new Date(iso + 'T12:00:00')
  var dias = ['Domingo','Segunda','Terca','Quarta','Quinta','Sexta','Sabado']
  return dias[d.getDay()] + ', ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function _escHtml(s) { return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

// ── Acoes publicas ───────────────────────────────────────────────
function dayPanelTransition(id, newStatus) {
  if (window.smartTransition) smartTransition(id, newStatus)
  // Re-render o painel
  var container = document.getElementById('dayPanelRoot')
  if (container) renderDayPanel(container)
}

function dismissDayAlert(alertId) {
  _dismissedAlerts.add(alertId)
  var el = document.querySelector('[data-alert-id="' + alertId + '"]')
  if (el) el.style.display = 'none'
}

function toggleDayPanel() {
  var root = document.getElementById('dayPanelRoot')
  if (!root) return
  if (root.style.display === 'none') {
    root.style.display = ''
    renderDayPanel(root)
  } else {
    root.style.display = 'none'
  }
}

// ── Guard: impedir navegacao sem finalizar consulta ──────────────
function _checkPendingConsulta(targetPageId) {
  // Permitir navegar dentro da agenda
  if (targetPageId && targetPageId.startsWith('agenda')) return true

  var today = new Date().toISOString().slice(0, 10)
  var appts = window.getAppointments ? getAppointments() : []
  var emConsulta = appts.filter(function(a) {
    return a.data === today && a.status === 'em_consulta'
  })

  if (emConsulta.length === 0) return true // nenhum em consulta, pode navegar

  var nomes = emConsulta.map(function(a) { return a.pacienteNome || 'Paciente' }).join(', ')

  // Mostrar modal de bloqueio
  var existing = document.getElementById('pendingConsultaModal')
  if (existing) existing.remove()

  var modal = document.createElement('div')
  modal.id = 'pendingConsultaModal'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9900;display:flex;align-items:center;justify-content:center;padding:16px'
  modal.innerHTML =
    '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">' +
      '<div style="background:#EF4444;padding:14px 18px">' +
        '<div style="font-size:14px;font-weight:800;color:#fff">Consulta em andamento</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:2px">' + _escHtml(nomes) + '</div>' +
      '</div>' +
      '<div style="padding:16px 18px">' +
        '<div style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:14px">' +
          'Existem <strong>' + emConsulta.length + ' paciente(s)</strong> com consulta em andamento. ' +
          'Finalize o atendimento antes de sair da agenda.' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button onclick="document.getElementById(\'pendingConsultaModal\').remove();openFinalizeModal(\'' + emConsulta[0].id + '\')" style="flex:2;padding:10px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">Finalizar Atendimento</button>' +
          '<button onclick="document.getElementById(\'pendingConsultaModal\').remove()" style="flex:1;padding:10px;border:1px solid #E5E7EB;background:#fff;color:#374151;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Voltar</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove() })
  document.body.appendChild(modal)

  return false // bloquear navegacao
}

// ── Expose ───────────────────────────────────────────────────────
window.renderDayPanel        = renderDayPanel
window.dayPanelTransition    = dayPanelTransition
window.dismissDayAlert       = dismissDayAlert
window.toggleDayPanel        = toggleDayPanel
window._checkPendingConsulta = _checkPendingConsulta

})()
