/**
 * ClinicAI — Agenda Leads Tables (Agendados + Cancelados)
 *
 * Renderiza tabelas de leads filtradas por phase:
 *   - Agendados: phase = agendado | reagendado
 *   - Cancelados: appointments com status cancelado | no_show
 *
 * Reutiliza LeadsService pra dados e renderiza tabela propria.
 */
;(function () {
  'use strict'

  var APPT_KEY = 'clinicai_appointments'

  // ── Status colors ─────────────────────────────────────────────
  var PHASE_CFG = {
    agendado:   { label: 'Agendado',   color: '#7C3AED', bg: '#F5F3FF' },
    reagendado: { label: 'Reagendado', color: '#F59E0B', bg: '#FFFBEB' },
    cancelado:  { label: 'Cancelado',  color: '#EF4444', bg: '#FEF2F2' },
    no_show:    { label: 'No-show',    color: '#6B7280', bg: '#F3F4F6' },
  }

  var TEMP_CFG = {
    cold: { label: 'Frio',   color: '#93c5fd', bg: '#eff6ff' },
    warm: { label: 'Morno',  color: '#f59e0b', bg: '#fffbeb' },
    hot:  { label: 'Quente', color: '#f87171', bg: '#fef2f2' },
  }

  // ── Helpers ────────────────────────────────────────────────────
  function _getLeads() {
    if (window.LeadsService) return LeadsService.getLocal()
    try { return JSON.parse(localStorage.getItem('clinicai_leads') || '[]') } catch { return [] }
  }

  function _getAppts() {
    try { return JSON.parse(localStorage.getItem(APPT_KEY) || '[]') } catch { return [] }
  }

  function _fmtPhone(p) {
    if (!p) return ''
    var d = p.replace(/\D/g, '')
    if (d.length === 13) return '(' + d.slice(2,4) + ') ' + d.slice(4,9) + '-' + d.slice(9)
    if (d.length === 12) return '(' + d.slice(2,4) + ') ' + d.slice(4,8) + '-' + d.slice(8)
    return p
  }

  function _fmtDate(iso) {
    if (!iso) return ''
    try {
      var parts = iso.split('T')[0].split('-')
      return parts[2] + '/' + parts[1] + '/' + parts[0]
    } catch { return iso }
  }

  function _escHtml(s) { return (s || '').replace(/</g, '&lt;').replace(/"/g, '&quot;') }

  // ── Render Agendados ──────────────────────────────────────────
  function renderAgendados() {
    var root = document.getElementById('agendadosRoot')
    if (!root) return

    var leads = _getLeads().filter(function(l) {
      return (l.phase === 'agendado' || l.phase === 'reagendado') && l.is_active !== false
    })

    var appts = _getAppts()

    // Enriquecer leads com dados do agendamento
    leads.forEach(function(l) {
      var appt = appts.find(function(a) {
        return (a.pacienteId === l.id || (a.pacienteNome || '').toLowerCase() === (l.nome || l.name || '').toLowerCase())
          && a.status !== 'cancelado' && a.status !== 'no_show'
      })
      if (appt) {
        l._apptDate = appt.data
        l._apptTime = appt.horaInicio
        l._apptProc = appt.procedimento
        l._apptStatus = appt.status
      }
    })

    // Sort: data mais proxima primeiro
    leads.sort(function(a, b) {
      var da = (a._apptDate || '') + (a._apptTime || '')
      var db = (b._apptDate || '') + (b._apptTime || '')
      return da < db ? -1 : da > db ? 1 : 0
    })

    var html = '<div style="padding:20px">'
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
    html += '<div><h1 style="font-size:20px;font-weight:700;color:#111;margin:0">Agendados</h1>'
    html += '<p style="font-size:13px;color:#6B7280;margin:4px 0 0">Leads com consulta agendada</p></div>'
    html += '<div style="background:#F5F3FF;color:#7C3AED;font-size:13px;font-weight:700;padding:6px 16px;border-radius:20px">' + leads.length + ' leads</div>'
    html += '</div>'

    if (!leads.length) {
      html += '<div style="text-align:center;padding:48px;color:#9CA3AF;font-size:14px">Nenhum lead agendado</div>'
      root.innerHTML = html + '</div>'
      return
    }

    html += '<table style="width:100%;border-collapse:collapse;font-size:13px">'
    html += '<thead><tr style="border-bottom:2px solid #E5E7EB;text-align:left">'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">Nome</th>'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">WhatsApp</th>'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">Temperatura</th>'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">Status</th>'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">Data</th>'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">Horario</th>'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">Procedimento</th>'
    html += '</tr></thead><tbody>'

    leads.forEach(function(l) {
      var nome = l.nome || l.name || 'Lead'
      var phone = l.phone || l.whatsapp || ''
      var temp = TEMP_CFG[l.temperature] || TEMP_CFG.cold
      var phase = PHASE_CFG[l.phase] || PHASE_CFG.agendado

      html += '<tr style="border-bottom:1px solid #F3F4F6;cursor:pointer" onmouseover="this.style.background=\'#F9FAFB\'" onmouseout="this.style.background=\'\'">'
      html += '<td style="padding:10px 12px;font-weight:600;color:#111">' + _escHtml(nome) + '</td>'
      html += '<td style="padding:10px 12px;color:#6B7280">' + _fmtPhone(phone) + '</td>'
      html += '<td style="padding:10px 12px"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;color:' + temp.color + ';background:' + temp.bg + '">' + temp.label + '</span></td>'
      html += '<td style="padding:10px 12px"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;color:' + phase.color + ';background:' + phase.bg + '">' + phase.label + '</span></td>'
      html += '<td style="padding:10px 12px;color:#374151">' + _fmtDate(l._apptDate) + '</td>'
      html += '<td style="padding:10px 12px;color:#374151">' + (l._apptTime || '') + '</td>'
      html += '<td style="padding:10px 12px;color:#374151">' + _escHtml(l._apptProc || '') + '</td>'
      html += '</tr>'
    })

    html += '</tbody></table></div>'
    root.innerHTML = html
  }

  // ── Render Cancelados ─────────────────────────────────────────
  function renderCancelados() {
    var root = document.getElementById('canceladosRoot')
    if (!root) return

    var appts = _getAppts().filter(function(a) {
      return a.status === 'cancelado' || a.status === 'no_show'
    })

    // Sort: mais recentes primeiro
    appts.sort(function(a, b) {
      var da = a.canceladoEm || a.noShowEm || a.data || ''
      var db = b.canceladoEm || b.noShowEm || b.data || ''
      return da > db ? -1 : da < db ? 1 : 0
    })

    var html = '<div style="padding:20px">'
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
    html += '<div><h1 style="font-size:20px;font-weight:700;color:#111;margin:0">Cancelados / No-show</h1>'
    html += '<p style="font-size:13px;color:#6B7280;margin:4px 0 0">Historico de cancelamentos e faltas</p></div>'
    html += '<div style="background:#FEF2F2;color:#EF4444;font-size:13px;font-weight:700;padding:6px 16px;border-radius:20px">' + appts.length + ' registros</div>'
    html += '</div>'

    if (!appts.length) {
      html += '<div style="text-align:center;padding:48px;color:#9CA3AF;font-size:14px">Nenhum cancelamento ou no-show</div>'
      root.innerHTML = html + '</div>'
      return
    }

    html += '<table style="width:100%;border-collapse:collapse;font-size:13px">'
    html += '<thead><tr style="border-bottom:2px solid #E5E7EB;text-align:left">'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">Paciente</th>'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">Status</th>'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">Data Consulta</th>'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">Procedimento</th>'
    html += '<th style="padding:10px 12px;font-weight:600;color:#6B7280">Motivo</th>'
    html += '</tr></thead><tbody>'

    appts.forEach(function(a) {
      var statusCfg = a.status === 'no_show' ? PHASE_CFG.no_show : PHASE_CFG.cancelado
      var motivo = a.motivoCancelamento || a.motivoNoShow || ''

      html += '<tr style="border-bottom:1px solid #F3F4F6">'
      html += '<td style="padding:10px 12px;font-weight:600;color:#111">' + _escHtml(a.pacienteNome || 'Paciente') + '</td>'
      html += '<td style="padding:10px 12px"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;color:' + statusCfg.color + ';background:' + statusCfg.bg + '">' + statusCfg.label + '</span></td>'
      html += '<td style="padding:10px 12px;color:#374151">' + _fmtDate(a.data) + ' ' + (a.horaInicio || '') + '</td>'
      html += '<td style="padding:10px 12px;color:#374151">' + _escHtml(a.procedimento || '') + '</td>'
      html += '<td style="padding:10px 12px;color:#6B7280;font-style:italic">' + _escHtml(motivo || '—') + '</td>'
      html += '</tr>'
    })

    html += '</tbody></table></div>'
    root.innerHTML = html
  }

  // ── Exposicao global ──────────────────────────────────────────
  window.AgendaLeads = Object.freeze({
    renderAgendados: renderAgendados,
    renderCancelados: renderCancelados,
  })

})()
