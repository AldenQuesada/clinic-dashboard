// ── ClinicAI — Alertas da Agenda + Guard de Navegacao ────────────
// Alertas automaticos para secretaria + bloqueio de saida sem finalizar
// Depende: agenda-smart.js (STATUS_LABELS, STATUS_COLORS, apptTransition)

;(function () {
'use strict'

var ALERT_CHECK_INTERVAL = 30000 // 30s
var _alertTimer = null
var _activeAlerts = new Map()
var _dismissedAlerts = new Set()

// ── Renderizar Alertas do Dia ────────────────────────────────────
function renderDayAlerts() {
  var container = document.getElementById('dayAlertsRoot')
  if (!container) return

  var today = new Date().toISOString().slice(0, 10)
  var allAppts = window.getAppointments ? getAppointments() : []
  var appts = allAppts.filter(function(a) {
    return a.data === today && a.status !== 'cancelado' && a.status !== 'no_show' && a.status !== 'remarcado'
  })

  var alerts = _checkAlerts(appts)
  var visibleAlerts = alerts.filter(function(a) { return !_dismissedAlerts.has(a.id) })

  if (visibleAlerts.length === 0) {
    container.innerHTML = ''
    return
  }

  var html = '<div id="dayPanelAlerts" style="margin-bottom:12px;display:flex;flex-direction:column;gap:6px">'
  visibleAlerts.forEach(function(alert) {
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

  container.innerHTML = html

  // Notificacao sonora para alertas danger novos
  visibleAlerts.forEach(function(alert) {
    if (alert.type === 'danger' && !_activeAlerts.has(alert.id)) {
      _playAlertSound()
    }
    _activeAlerts.set(alert.id, true)
  })
}

// ── Verificar alertas ────────────────────────────────────────────
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

    // Alerta: tempo excedido (passou do horario final e nao finalizou)
    if (nowMinutes > endMin && ['em_consulta','na_clinica'].includes(a.status)) {
      var excedido = nowMinutes - endMin
      alerts.push({
        id: 'over_' + a.id, type: 'danger', priority: 0,
        title: 'Tempo excedido ' + excedido + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: 'Deveria ter finalizado as ' + a.horaFim + '. Verificar com profissional.',
        action: "openFinalizeModal('" + a.id + "')", actionLabel: 'Finalizar',
      })
    }

    // Alerta: 10 min antes de finalizar
    var minsToEnd = endMin - nowMinutes
    if (minsToEnd > 0 && minsToEnd <= 10 && ['em_consulta','na_clinica'].includes(a.status)) {
      alerts.push({
        id: 'end10_' + a.id, type: 'danger', priority: 1,
        title: 'Faltam ' + minsToEnd + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: a.procedimento + ' com ' + (a.profissionalNome || '') + ' termina as ' + a.horaFim,
        action: "openApptDetail('" + a.id + "')", actionLabel: 'Abrir',
      })
    }

    // Alerta: paciente atrasado (passou 15min do horario)
    if (nowMinutes > startMin + 15 && ['agendado','aguardando_confirmacao','confirmado','aguardando'].includes(a.status)) {
      var atraso = nowMinutes - startMin
      alerts.push({
        id: 'late_' + a.id, type: 'warning', priority: 2,
        title: 'Atrasado ' + atraso + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: 'Agendado para ' + a.horaInicio + '. Confirmar presenca ou remarcar.',
        action: "openApptDetail('" + a.id + "')", actionLabel: 'Ver',
      })
    }

    // Alerta: nao confirmou (30min antes do horario)
    var minsToStart = startMin - nowMinutes
    if (minsToStart > 0 && minsToStart <= 30 && ['agendado','aguardando_confirmacao'].includes(a.status)) {
      alerts.push({
        id: 'noconf_' + a.id, type: 'warning', priority: 3,
        title: 'Sem confirmacao — ' + (a.pacienteNome || 'Paciente'),
        message: 'Consulta as ' + a.horaInicio + '. Paciente nao confirmou presenca.',
        action: "openApptDetail('" + a.id + "')", actionLabel: 'Contatar',
      })
    }

    // Alerta: proximo paciente (em 15 min)
    if (minsToStart > 0 && minsToStart <= 15 && ['confirmado','aguardando'].includes(a.status)) {
      alerts.push({
        id: 'next_' + a.id, type: 'info', priority: 4,
        title: 'Proximo em ' + minsToStart + ' min — ' + (a.pacienteNome || 'Paciente'),
        message: a.procedimento + ' as ' + a.horaInicio + ' com ' + (a.profissionalNome || ''),
      })
    }
  })

  alerts.sort(function(a, b) { return a.priority - b.priority })
  return alerts
}

// ── Timer de alertas ─────────────────────────────────────────────
function _startAlertTimer() {
  if (_alertTimer) clearInterval(_alertTimer)
  _alertTimer = setInterval(function() {
    var container = document.getElementById('dayAlertsRoot')
    if (container && container.offsetParent !== null) {
      renderDayAlerts()
    }
  }, ALERT_CHECK_INTERVAL)
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
  } catch(e) {}
}

function _escHtml(s) { return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

// ── Dismiss alerta ───────────────────────────────────────────────
function dismissDayAlert(alertId) {
  _dismissedAlerts.add(alertId)
  var el = document.querySelector('[data-alert-id="' + alertId + '"]')
  if (el) el.style.display = 'none'
}

// ── Guard: impedir navegacao sem finalizar consulta ──────────────
function _checkPendingConsulta(targetPageId) {
  if (targetPageId && targetPageId.startsWith('agenda')) return true

  var today = new Date().toISOString().slice(0, 10)
  var appts = window.getAppointments ? getAppointments() : []
  var emConsulta = appts.filter(function(a) {
    return a.data === today && a.status === 'em_consulta'
  })

  if (emConsulta.length === 0) return true

  var nomes = emConsulta.map(function(a) { return a.pacienteNome || 'Paciente' }).join(', ')

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

  return false
}

// ── CSS Animations ───────────────────────────────────────────────
if (!document.getElementById('dayPanelStyles')) {
  var style = document.createElement('style')
  style.id = 'dayPanelStyles'
  style.textContent = '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}'
  document.head.appendChild(style)
}

// ── Init ─────────────────────────────────────────────────────────
_startAlertTimer()
// Render alertas quando a agenda renderiza
var _origRenderAgenda = window.renderAgenda
if (_origRenderAgenda) {
  window.renderAgenda = function() {
    _origRenderAgenda.apply(this, arguments)
    renderDayAlerts()
  }
}

// ── Expose ───────────────────────────────────────────────────────
window.renderDayAlerts       = renderDayAlerts
window.dismissDayAlert       = dismissDayAlert
window._checkPendingConsulta = _checkPendingConsulta

})()
