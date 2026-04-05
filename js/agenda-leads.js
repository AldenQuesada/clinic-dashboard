/**
 * ClinicAI — Agenda Leads Tables (Agendados + Cancelados)
 *
 * Clone do visual de leads-context com colunas adaptadas:
 *   - Agendados: Nome, WhatsApp, Status, Data, Horario, Procedimento, Acoes
 *   - Cancelados: Nome, Status, Data, Procedimento, Motivo, Acoes
 */
;(function () {
  'use strict'

  var APPT_KEY = 'clinicai_appointments'
  var P_AG = 'agLead_'
  var P_CA = 'caLead_'

  var PHASE_CFG = {
    agendado:   { label: 'Agendado',   color: '#7C3AED', bg: '#F5F3FF' },
    reagendado: { label: 'Reagendado', color: '#F59E0B', bg: '#FFFBEB' },
    confirmado: { label: 'Confirmado', color: '#10B981', bg: '#ECFDF5' },
    cancelado:  { label: 'Cancelado',  color: '#EF4444', bg: '#FEF2F2' },
    no_show:    { label: 'No-show',    color: '#6B7280', bg: '#F3F4F6' },
    perdido:    { label: 'Perdido',    color: '#9CA3AF', bg: '#F9FAFB' },
  }

  function _getLeads() {
    if (window.LeadsService) return LeadsService.getLocal()
    try { return JSON.parse(localStorage.getItem('clinicai_leads') || '[]') } catch { return [] }
  }

  function _getAppts() {
    try { return JSON.parse(localStorage.getItem(APPT_KEY) || '[]') } catch { return [] }
  }

  function _esc(s) { return (s || '').replace(/</g, '&lt;').replace(/"/g, '&quot;') }

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

  // ══════════════════════════════════════════════════
  // AGENDADOS
  // ══════════════════════════════════════════════════

  var _agSearch = ''
  var _agSortField = 'date'
  var _agSortDir = 'asc'

  function renderAgendados() {
    var root = document.getElementById('agendadosRoot')
    if (!root) return

    var leads = _getLeads().filter(function(l) {
      return (l.phase === 'agendado' || l.phase === 'reagendado') && l.is_active !== false
    })

    var appts = _getAppts()

    // Enriquecer com dados do appointment
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
        l._apptId = appt.id
      }
    })

    // Filtrar por busca
    if (_agSearch) {
      var q = _agSearch.toLowerCase()
      leads = leads.filter(function(l) {
        var nome = (l.nome || l.name || '').toLowerCase()
        var phone = (l.phone || '').toLowerCase()
        return nome.includes(q) || phone.includes(q)
      })
    }

    // Sort
    leads.sort(function(a, b) {
      if (_agSortField === 'name') {
        var na = (a.nome || a.name || '').toLowerCase()
        var nb = (b.nome || b.name || '').toLowerCase()
        return _agSortDir === 'asc' ? (na < nb ? -1 : 1) : (na > nb ? -1 : 1)
      }
      var da = (a._apptDate || '') + (a._apptTime || '')
      var db = (b._apptDate || '') + (b._apptTime || '')
      return _agSortDir === 'asc' ? (da < db ? -1 : 1) : (da > db ? -1 : 1)
    })

    var p = P_AG
    var html = '<div style="display:flex;flex-direction:column;height:100%;padding:20px">'

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
    html += '<div>'
    html += '<h1 style="font-size:20px;font-weight:700;color:#111;margin:0">Agendados</h1>'
    html += '<p style="font-size:13px;color:#6B7280;margin:4px 0 0">Leads com consulta agendada ou reagendada</p>'
    html += '</div>'
    html += '<div style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:6px 14px">'
    html += '<span style="font-size:18px;font-weight:800;color:#111">' + leads.length + '</span>'
    html += '<span style="font-size:11px;font-weight:500;color:#9ca3af;text-transform:uppercase">agendados</span>'
    html += '</div></div>'

    // Filtro busca
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">'
    html += '<input id="' + p + 'Search" type="text" autocomplete="off" placeholder="Buscar por nome ou telefone..." value="' + _esc(_agSearch) + '"'
    html += ' style="padding:7px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;font-family:inherit;outline:none;width:280px">'
    html += '</div>'

    // Tabela
    html += '<div style="flex:1;min-height:0;overflow-y:auto">'
    html += '<div style="background:#fff;border-radius:12px;border:1px solid #F3F4F6;overflow:hidden">'
    html += '<table style="width:100%;border-collapse:collapse;table-layout:fixed">'
    html += '<colgroup><col style="width:220px"><col style="width:145px"><col style="width:100px"><col style="width:100px"><col style="width:80px"><col style="width:160px"><col style="width:100px"></colgroup>'
    html += '<thead><tr style="background:#F9FAFB;border-bottom:1px solid #F3F4F6">'

    var thStyle = 'padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em'
    var sortTh = thStyle + ';cursor:pointer;user-select:none'
    html += '<th data-agsort="name" style="' + sortTh + '">Nome ' + (_agSortField === 'name' ? (_agSortDir === 'asc' ? '&#9650;' : '&#9660;') : '') + '</th>'
    html += '<th style="' + thStyle + '">WhatsApp</th>'
    html += '<th style="' + thStyle + '">Status</th>'
    html += '<th data-agsort="date" style="' + sortTh + '">Data ' + (_agSortField === 'date' ? (_agSortDir === 'asc' ? '&#9650;' : '&#9660;') : '') + '</th>'
    html += '<th style="' + thStyle + '">Horario</th>'
    html += '<th style="' + thStyle + '">Procedimento</th>'
    html += '<th style="' + thStyle + ';text-align:center">Acoes</th>'
    html += '</tr></thead><tbody id="' + p + 'Body">'

    if (!leads.length) {
      html += '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9CA3AF;font-size:13px">Nenhum lead agendado</td></tr>'
    } else {
      leads.forEach(function(l) {
        html += _agRow(l)
      })
    }

    html += '</tbody></table></div></div></div>'
    root.innerHTML = html

    // Bind eventos
    var searchEl = document.getElementById(p + 'Search')
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        _agSearch = this.value
        renderAgendados()
      })
    }

    // Sort headers
    root.querySelectorAll('[data-agsort]').forEach(function(th) {
      th.addEventListener('click', function() {
        var field = th.dataset.agsort
        if (_agSortField === field) _agSortDir = _agSortDir === 'asc' ? 'desc' : 'asc'
        else { _agSortField = field; _agSortDir = 'asc' }
        renderAgendados()
      })
    })
  }

  function _agRow(l) {
    var nome = l.nome || l.name || 'Lead'
    var phone = l.phone || l.whatsapp || ''
    var phase = PHASE_CFG[l.phase] || PHASE_CFG.agendado
    var apptStatus = l._apptStatus ? (PHASE_CFG[l._apptStatus] || phase) : phase
    var waLink = phone ? 'https://wa.me/' + phone.replace(/\D/g, '') : '#'

    return '<tr style="border-bottom:1px solid #F3F4F6" onmouseover="this.style.background=\'#F9FAFB\'" onmouseout="this.style.background=\'\'">' +
      '<td style="padding:10px 16px"><div style="font-size:13px;font-weight:600;color:#111">' + _esc(nome) + '</div></td>' +
      '<td style="padding:10px 16px"><a href="' + waLink + '" target="_blank" style="font-size:12px;color:#6B7280;text-decoration:none">' + _fmtPhone(phone) + '</a></td>' +
      '<td style="padding:10px 16px"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;color:' + apptStatus.color + ';background:' + apptStatus.bg + '">' + apptStatus.label + '</span></td>' +
      '<td style="padding:10px 16px;font-size:13px;color:#374151">' + _fmtDate(l._apptDate) + '</td>' +
      '<td style="padding:10px 16px;font-size:13px;color:#374151">' + (l._apptTime || '') + '</td>' +
      '<td style="padding:10px 16px;font-size:13px;color:#374151">' + _esc(l._apptProc || '') + '</td>' +
      '<td style="padding:10px 16px;text-align:center">' +
        (l._apptId ? '<button onclick="openApptDetail(\'' + l._apptId + '\')" style="background:#F3F4F6;border:none;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:600;color:#374151;cursor:pointer">Ver</button>' : '') +
      '</td>' +
    '</tr>'
  }

  // ══════════════════════════════════════════════════
  // CANCELADOS
  // ══════════════════════════════════════════════════

  var _caSearch = ''

  function renderCancelados() {
    var root = document.getElementById('canceladosRoot')
    if (!root) return

    var appts = _getAppts().filter(function(a) {
      return a.status === 'cancelado' || a.status === 'no_show'
    })

    // Filtrar por busca
    if (_caSearch) {
      var q = _caSearch.toLowerCase()
      appts = appts.filter(function(a) {
        return (a.pacienteNome || '').toLowerCase().includes(q)
      })
    }

    // Sort mais recentes primeiro
    appts.sort(function(a, b) {
      var da = a.canceladoEm || a.noShowEm || a.data || ''
      var db = b.canceladoEm || b.noShowEm || b.data || ''
      return da > db ? -1 : da < db ? 1 : 0
    })

    var p = P_CA
    var html = '<div style="display:flex;flex-direction:column;height:100%;padding:20px">'

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
    html += '<div>'
    html += '<h1 style="font-size:20px;font-weight:700;color:#111;margin:0">Cancelados / No-show</h1>'
    html += '<p style="font-size:13px;color:#6B7280;margin:4px 0 0">Historico de cancelamentos e faltas</p>'
    html += '</div>'
    html += '<div style="display:flex;align-items:center;gap:10px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:6px 14px">'
    html += '<span style="font-size:18px;font-weight:800;color:#EF4444">' + appts.length + '</span>'
    html += '<span style="font-size:11px;font-weight:500;color:#EF4444;text-transform:uppercase">registros</span>'
    html += '</div></div>'

    // Filtro busca
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">'
    html += '<input id="' + p + 'Search" type="text" autocomplete="off" placeholder="Buscar por nome..." value="' + _esc(_caSearch) + '"'
    html += ' style="padding:7px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;font-family:inherit;outline:none;width:280px">'
    html += '</div>'

    // Tabela
    html += '<div style="flex:1;min-height:0;overflow-y:auto">'
    html += '<div style="background:#fff;border-radius:12px;border:1px solid #F3F4F6;overflow:hidden">'
    html += '<table style="width:100%;border-collapse:collapse;table-layout:fixed">'
    html += '<colgroup><col style="width:220px"><col style="width:100px"><col style="width:130px"><col style="width:160px"><col><col style="width:100px"></colgroup>'
    html += '<thead><tr style="background:#F9FAFB;border-bottom:1px solid #F3F4F6">'

    var thStyle = 'padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em'
    html += '<th style="' + thStyle + '">Paciente</th>'
    html += '<th style="' + thStyle + '">Status</th>'
    html += '<th style="' + thStyle + '">Data Consulta</th>'
    html += '<th style="' + thStyle + '">Procedimento</th>'
    html += '<th style="' + thStyle + '">Motivo</th>'
    html += '<th style="' + thStyle + ';text-align:center">Acoes</th>'
    html += '</tr></thead><tbody>'

    if (!appts.length) {
      html += '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9CA3AF;font-size:13px">Nenhum cancelamento ou no-show</td></tr>'
    } else {
      appts.forEach(function(a) {
        var statusCfg = PHASE_CFG[a.status] || PHASE_CFG.cancelado
        var motivo = a.motivoCancelamento || a.motivoNoShow || ''
        html += '<tr style="border-bottom:1px solid #F3F4F6" onmouseover="this.style.background=\'#F9FAFB\'" onmouseout="this.style.background=\'\'">'
        html += '<td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111">' + _esc(a.pacienteNome || 'Paciente') + '</td>'
        html += '<td style="padding:10px 16px"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;color:' + statusCfg.color + ';background:' + statusCfg.bg + '">' + statusCfg.label + '</span></td>'
        html += '<td style="padding:10px 16px;font-size:13px;color:#374151">' + _fmtDate(a.data) + ' ' + (a.horaInicio || '') + '</td>'
        html += '<td style="padding:10px 16px;font-size:13px;color:#374151">' + _esc(a.procedimento || '') + '</td>'
        html += '<td style="padding:10px 16px;font-size:12px;color:#6B7280;font-style:italic">' + _esc(motivo || '—') + '</td>'
        html += '<td style="padding:10px 16px;text-align:center">'
        html += '<button onclick="openApptModal(\'' + a.id + '\')" style="background:#F3F4F6;border:none;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:600;color:#374151;cursor:pointer">Remarcar</button>'
        html += '</td></tr>'
      })
    }

    html += '</tbody></table></div></div></div>'
    root.innerHTML = html

    // Bind busca
    var searchEl = document.getElementById(p + 'Search')
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        _caSearch = this.value
        renderCancelados()
      })
    }
  }

  window.AgendaLeads = Object.freeze({
    renderAgendados: renderAgendados,
    renderCancelados: renderCancelados,
  })

})()
