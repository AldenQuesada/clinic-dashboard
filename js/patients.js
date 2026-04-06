// ── ClinicAI — Patients Module ──
// setText · formatCurrency · formatDate → definidos em utils.js (carrega antes deste arquivo)

// ─── Pacientes ───────────────────────────────────────────────
// Lê direto do localStorage (clinicai_leads + clinicai_appointments).
// Não depende de backend. Dados sincronizados via Supabase.
function loadPatients() {
  // Forcar reload do Supabase pra pegar phases atualizadas
  if (window.LeadsService && LeadsService.loadAll) {
    LeadsService.loadAll().then(function() { _loadPatientsInternal() }).catch(function() { _loadPatientsInternal() })
    return
  }
  _loadPatientsInternal()
}

function _loadPatientsInternal() {
  const nome     = document.getElementById('patientsFilterNome')?.value.trim().toLowerCase() || ''
  const proc     = document.getElementById('patientsFilterProc')?.value.trim().toLowerCase()  || ''
  const period   = document.getElementById('patientsFilterPeriod')?.value                     || ''
  const dateFrom = document.getElementById('patientsFilterDateFrom')?.value                   || ''
  const dateTo   = document.getElementById('patientsFilterDateTo')?.value                     || ''

  // ── Atualiza label de intervalo customizado ────────────────
  if (period === 'custom') {
    const lbl = document.getElementById('patientsDateRangeLabel')
    if (lbl) {
      if (dateFrom && dateTo) {
        const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })
        lbl.textContent = fmt(dateFrom) + ' → ' + fmt(dateTo)
      } else {
        lbl.textContent = dateFrom ? 'A partir de ' + new Date(dateFrom+'T00:00:00').toLocaleDateString('pt-BR') : ''
      }
    }
  }

  // ── Calcula intervalo de dias para filtro de período ───────
  let cutoffDate = null
  if (period && period !== 'custom') {
    cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(period, 10))
  }

  // ── Sprint 7: usa cache Supabase se disponível ────────────
  // PatientsService.getLocal() retorna clinicai_patients (já enriquecido).
  // Se cache disponível, aplica apenas os filtros e renderiza diretamente.
  const cachedPatients = window.PatientsService?.getLocal() || []
  if (cachedPatients.length) {
    const filtered = cachedPatients.filter(p => {
      if (nome && !((p.name || '').toLowerCase().includes(nome))) return false
      if (proc && !((p.proceduresDone || []).some(pd => pd.toLowerCase().includes(proc)))) return false
      if (period === 'custom') {
        const ref = p.lastProcedureAt || p._createdAt || p.createdAt
        if (dateFrom && ref && ref < dateFrom) return false
        if (dateTo   && ref && ref > dateTo + 'T23:59:59') return false
      } else if (cutoffDate) {
        const ref = p.lastProcedureAt || p._createdAt || p.createdAt
        if (!ref) return false
        if (new Date(ref) < cutoffDate) return false
      }
      return true
    })
    renderPatientsTable(filtered)
    return
  }

  // ── Fallback: lê leads com phase=paciente ─
  // Tenta LeadsService primeiro (dados frescos do Supabase), fallback localStorage
  const allLeads = window.LeadsService ? LeadsService.getLocal() : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
  const leads = allLeads.filter(function(l) { return l.phase === 'paciente' })
  const appts = JSON.parse(localStorage.getItem('clinicai_appointments') || '[]')

  // Agrupa agendamentos finalizados por pacienteId
  const apptsByPatient = {}
  for (const a of appts) {
    if (a.status !== 'finalizado') continue
    const pid = a.pacienteId || ''
    if (!apptsByPatient[pid]) apptsByPatient[pid] = []
    apptsByPatient[pid].push(a)
  }

  // ── Enriquece leads com dados de agendamentos ──────────────
  const enriched = leads.map(lead => {
    const patientAppts = apptsByPatient[lead.id] || []
    const procs = [...new Set(patientAppts.map(a => a.procedimento).filter(Boolean))]
    const sorted = patientAppts.slice().sort((a, b) => (b.data || '') > (a.data || '') ? 1 : -1)
    const lastAppt = sorted[0]
    const totalRevenue = patientAppts.reduce((sum, a) => sum + (parseFloat(a.valor) || 0), 0)
    return {
      id:             lead.id,
      name:           lead.name || lead.nome || '—',
      phone:          lead.phone || lead.whatsapp || '—',
      status:         lead.status || 'active',
      proceduresDone: procs,
      lastProcedureAt: lastAppt?.data || null,
      totalRevenue,
      _createdAt:     lead.createdAt || lead.created_at || null,
    }
  })

  // ── Aplica filtros ─────────────────────────────────────────
  const filtered = enriched.filter(p => {
    if (nome && !p.name.toLowerCase().includes(nome)) return false

    if (proc && !p.proceduresDone.some(pd => pd.toLowerCase().includes(proc))) return false

    if (period === 'custom') {
      const ref = p.lastProcedureAt || p._createdAt
      if (dateFrom && ref && ref < dateFrom) return false
      if (dateTo   && ref && ref > dateTo + 'T23:59:59') return false
    } else if (cutoffDate) {
      const ref = p.lastProcedureAt || p._createdAt
      if (!ref) return false
      if (new Date(ref) < cutoffDate) return false
    }

    return true
  })

  renderPatientsTable(filtered)
}

function onPatientsPeriodChange(sel) {
  const dateRange = document.getElementById('patientsDateRange')
  if (!dateRange) return
  if (sel.value === 'custom') {
    dateRange.style.display = 'flex'
    const today    = new Date()
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    const from = document.getElementById('patientsFilterDateFrom')
    const to   = document.getElementById('patientsFilterDateTo')
    if (from && !from.value) from.value = firstDay.toISOString().slice(0, 10)
    if (to   && !to.value)   to.value   = today.toISOString().slice(0, 10)
    loadPatients()
  } else {
    dateRange.style.display = 'none'
    const lbl = document.getElementById('patientsDateRangeLabel')
    if (lbl) lbl.textContent = ''
    loadPatients()
  }
}

function clearPatientsFilters() {
  ;['patientsFilterNome','patientsFilterProc','patientsFilterDateFrom','patientsFilterDateTo']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
  const period = document.getElementById('patientsFilterPeriod')
  if (period) period.value = ''
  const dateRange = document.getElementById('patientsDateRange')
  if (dateRange) dateRange.style.display = 'none'
  const lbl = document.getElementById('patientsDateRangeLabel')
  if (lbl) lbl.textContent = ''
  loadPatients()
}

function renderPatientsTable(patients) {
  const tbody = document.getElementById('patientsTableBody')
  if (!tbody) return

  // Atualizar badge
  var countEl = document.getElementById('patientsCountNum')
  if (countEl) countEl.textContent = patients.length

  // Period bar active state
  var periodBar = document.getElementById('patientsPeriodBar')
  if (periodBar) {
    var currentPeriod = document.getElementById('patientsFilterPeriod')?.value || ''
    periodBar.querySelectorAll('.ao-period-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.period === currentPeriod)
    })
  }

  if (!patients.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9CA3AF">Nenhum paciente encontrado</td></tr>'
    return
  }

  var statusLabel = {
    active: 'Ativo', inactive: 'Inativo', treatment: 'Em Tratamento',
    post_consult: 'Pos-consulta', post_proc: 'Pos-procedimento',
    maintenance: 'Manutencao', reactivation: 'Reativacao',
  }
  var statusColor = {
    active: '#10B981', inactive: '#9CA3AF', treatment: '#7C3AED',
    post_consult: '#3B82F6', post_proc: '#F59E0B',
    maintenance: '#06B6D4', reactivation: '#EF4444',
  }

  function _esc(s) { return (s || '').replace(/</g, '&lt;').replace(/"/g, '&quot;') }
  function _fmtPhone(p) {
    if (!p) return ''
    var d = p.replace(/\D/g, '')
    if (d.length === 13) return '(' + d.slice(2,4) + ') ' + d.slice(4,9) + '-' + d.slice(9)
    if (d.length === 12) return '(' + d.slice(2,4) + ') ' + d.slice(4,8) + '-' + d.slice(8)
    return p
  }

  tbody.innerHTML = patients.map(function(p) {
    var procs = Array.isArray(p.proceduresDone) ? p.proceduresDone.join(', ') : (p.procedures || '')
    var revenue = typeof p.totalRevenue === 'number' && p.totalRevenue > 0
      ? p.totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : ''
    var status = p.status || 'active'
    var color = statusColor[status] || '#6B7280'
    var label = statusLabel[status] || status

    return '<tr style="border-bottom:1px solid #F9FAFB;cursor:pointer;transition:background .1s" onmouseover="this.style.background=\'#FAFAFA\'" onmouseout="this.style.background=\'\'">' +
      '<td style="padding:12px 8px 12px 16px"><input type="checkbox" style="width:14px;height:14px;accent-color:#7C3AED;cursor:pointer" onclick="event.stopPropagation()"></td>' +
      '<td style="padding:12px 16px"><div style="font-size:13px;font-weight:600;color:#111827">' + _esc(p.name || '') + '</div><div style="font-size:12px;color:#6B7280">' + _fmtPhone(p.phone || '') + '</div></td>' +
      '<td style="padding:12px 16px;font-size:12px;color:#6B7280">' + _fmtPhone(p.phone || '') + '</td>' +
      '<td style="padding:12px 16px;font-size:12px;color:#6B7280;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(procs || '—') + '</td>' +
      '<td style="padding:12px 16px;font-size:13px;font-weight:600;color:#111">' + (revenue || '—') + '</td>' +
      '<td style="padding:12px 16px"><span style="display:inline-flex;align-items:center;font-size:12px;font-weight:600;color:' + color + ';background:' + color + '1A;border-radius:6px;padding:3px 10px">' + label + '</span></td>' +
      '<td style="padding:12px 16px;text-align:center"><button onclick="event.stopPropagation();typeof viewLead===\'function\'&&viewLead(\'' + _esc(p.id) + '\')" style="background:none;border:1px solid #E5E7EB;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;color:#374151">Ver</button></td>' +
    '</tr>'
  }).join('')
}

// ── Export CSV ──────────────────────────────────────────────
function exportPatientsCsv() {
  var allLeads = window.LeadsService ? LeadsService.getLocal() : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
  var patients = allLeads.filter(function(l) { return l.phase === 'paciente' })
  if (!patients.length) { alert('Nenhum paciente para exportar'); return }

  var sep = ';'
  var rows = [['Nome', 'Telefone', 'Email', 'Status', 'Temperatura', 'Queixas', 'Data Nascimento', 'CPF', 'Sexo', 'Data Cadastro'].join(sep)]
  patients.forEach(function(p) {
    var queixas = ''
    if (Array.isArray(p.queixas_faciais) && p.queixas_faciais.length) {
      queixas = p.queixas_faciais.join(', ')
    }
    var phone = p.phone || ''
    if (phone.length === 13 && phone.startsWith('55')) {
      phone = '(' + phone.slice(2,4) + ') ' + phone.slice(4,9) + '-' + phone.slice(9)
    }
    var dataNasc = p.dataNascimento || p.birth_date || ''
    if (dataNasc && dataNasc.includes('-')) {
      var parts = dataNasc.split('T')[0].split('-')
      dataNasc = parts[2] + '/' + parts[1] + '/' + parts[0]
    }
    var dataCad = p.created_at || p.createdAt || ''
    if (dataCad) {
      try { dataCad = new Date(dataCad).toLocaleDateString('pt-BR') } catch(e) {}
    }
    var tempLabels = { hot: 'Quente', warm: 'Morno', cold: 'Frio' }

    rows.push([
      (p.name || p.nome || '').replace(/;/g, ','),
      phone,
      (p.email || '').replace(/;/g, ','),
      p.status || 'active',
      tempLabels[p.temperature] || p.temperature || '',
      queixas.replace(/;/g, ','),
      dataNasc,
      p.cpf || '',
      p.sexo || '',
      dataCad
    ].map(function(c) { return '"' + String(c || '').replace(/"/g, '""') + '"' }).join(sep))
  })
  var csv = rows.join('\n')
  var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  var a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'pacientes_' + new Date().toISOString().slice(0, 10) + '.csv'
  a.click()
}

// ── Periodo: botoes com active state + esconder date range ───
function patientsPeriodClick(btn) {
  var period = btn.dataset.period
  document.getElementById('patientsFilterPeriod').value = period === 'custom' ? '' : period

  // Active state
  var bar = document.getElementById('patientsPeriodBar')
  if (bar) bar.querySelectorAll('.ao-period-btn').forEach(function(b) { b.classList.remove('active') })
  btn.classList.add('active')

  // Date range
  var dateRange = document.getElementById('patientsDateRange')
  if (dateRange) dateRange.style.display = period === 'custom' ? 'flex' : 'none'

  if (period !== 'custom') loadPatients()
}

window.loadPatients           = loadPatients
window.onPatientsPeriodChange  = onPatientsPeriodChange
window.clearPatientsFilters   = clearPatientsFilters
window.exportPatientsCsv      = exportPatientsCsv
window.patientsPeriodClick    = patientsPeriodClick

// ─── Helper p/ inputs nas configurações (usado pelo index.html inline) ───────
function settingsInputHtml(id, type, label, placeholder) {
  return `
    <div>
      <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">${label}</label>
      <input id="${id}" type="${type}" placeholder="${placeholder}" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
    </div>`
}
window.settingsInputHtml = settingsInputHtml

// ─── Novo Paciente — Wizard 3 etapas ─────────────────────────
let _npStep = 1
let _cachedProcedures = []

async function showNewPatientModal() {
  document.getElementById('newPatientModal')?.remove()
  _npStep = 1

  // Pré-carregar procedimentos para o step 3
  if (!_cachedProcedures.length) {
    try {
      const procs = await apiFetch('/procedures')
      _cachedProcedures = Array.isArray(procs) ? procs : []
    } catch { _cachedProcedures = [] }
  }

  const procOptions = _cachedProcedures.length
    ? _cachedProcedures.map(p => `<option value="${p.name}" data-price="${p.price}" data-duration="${p.durationMinutes}">${p.name}${p.category ? ' — ' + p.category : ''}</option>`).join('')
    : ''

  const m = document.createElement('div')
  m.id = 'newPatientModal'
  m.innerHTML = `
    <div style="
      position:fixed;inset:0;background:rgba(0,0,0,0.65);
      display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px
    ">
      <div style="
        background:#fff;border-radius:18px;width:100%;max-width:700px;
        max-height:92vh;display:flex;flex-direction:column;overflow:hidden;
        box-shadow:0 24px 80px rgba(0,0,0,0.25);
      ">

        <!-- Header fixo -->
        <div style="padding:22px 28px 0;flex-shrink:0">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
            <div>
              <h2 style="margin:0;font-size:18px;font-weight:700;color:#111">Novo Paciente / Lead</h2>
              <p style="margin:4px 0 0;font-size:13px;color:#9CA3AF">Preencha os dados para cadastrar</p>
            </div>
            <button onclick="document.getElementById('newPatientModal').remove()" style="
              width:34px;height:34px;border-radius:50%;background:#F3F4F6;border:none;
              cursor:pointer;font-size:18px;color:#6B7280;display:flex;align-items:center;justify-content:center;
            ">✕</button>
          </div>

          <!-- Indicadores de etapa -->
          <div style="display:flex;gap:0;margin-bottom:24px">
            ${[{n:1,label:'Dados Pessoais'},{n:2,label:'Endereço e Origem'},{n:3,label:'Dados Clínicos'}].map((s,i) => `
              <div style="flex:1;display:flex;align-items:center">
                <div id="np_step_${s.n}" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;width:100%;background:${s.n===1?'#F5F3FF':'#F9FAFB'}">
                  <div id="np_dot_${s.n}" style="width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:${s.n===1?'#7C3AED':'#E5E7EB'};color:${s.n===1?'#fff':'#9CA3AF'}">${s.n}</div>
                  <span id="np_lbl_${s.n}" style="font-size:12px;font-weight:600;color:${s.n===1?'#7C3AED':'#9CA3AF'}">${s.label}</span>
                </div>
                ${i<2?'<div style="width:16px;height:2px;background:#E5E7EB;flex-shrink:0"></div>':''}
              </div>`).join('')}
          </div>
        </div>

        <!-- Corpo — TODAS as etapas ficam no DOM, só alterna visibilidade -->
        <div style="overflow-y:auto;flex:1;padding:0 28px 8px">

          <!-- ── ETAPA 1: Dados Pessoais ── -->
          <div id="npPage1">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;padding-top:4px">
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Nome *</label>
                <input id="np_firstname" type="text" placeholder="Ex: Ana Carolina" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Sobrenome *</label>
                <input id="np_lastname" type="text" placeholder="Ex: Silva" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Sexo Biológico *</label>
                <input type="hidden" id="np_sex" value=""/>
                <div style="display:flex;gap:8px">
                  <button type="button" id="np_sex_f" onclick="npSetSex('feminino')"
                    style="flex:1;padding:10px 8px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:#fff;color:#6B7280;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="5"/><line x1="12" y1="13" x2="12" y2="21"/><line x1="9" y1="18" x2="15" y2="18"/></svg>
                    Feminino
                  </button>
                  <button type="button" id="np_sex_m" onclick="npSetSex('masculino')"
                    style="flex:1;padding:10px 8px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:#fff;color:#6B7280;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="14" r="5"/><line x1="21" y1="3" x2="15" y2="9"/><polyline points="16 3 21 3 21 8"/></svg>
                    Masculino
                  </button>
                </div>
                <div id="np_sex_err" style="font-size:11px;color:#EF4444;margin-top:4px;display:none">Selecione o sexo biológico</div>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">CPF *</label>
                <input id="np_cpf" type="text" placeholder="000.000.000-00" maxlength="14" oninput="maskCPF(this)" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
                <div id="np_cpf_err" style="font-size:11px;color:#EF4444;margin-top:4px;display:none"></div>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">WhatsApp / Telefone *</label>
                <input id="np_phone" type="text" placeholder="(11) 99999-9999" maxlength="15" oninput="maskPhone(this)" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">E-mail</label>
                <input id="np_email" type="email" placeholder="ana@email.com" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Data de nascimento</label>
                <input id="np_dob" type="date" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">RG</label>
                <input id="np_rg" type="text" placeholder="00.000.000-0" maxlength="12" oninput="maskRG(this)" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
                <div id="np_rg_err" style="font-size:11px;color:#EF4444;margin-top:4px;display:none"></div>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Profissão</label>
                <input id="np_profissao" type="text" placeholder="Ex: Nutricionista, Empresária..." style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Status inicial</label>
                <select id="np_status_init" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                  <option value="new">Novo Lead</option><option value="qualified">Qualificado</option><option value="scheduled">Já Agendado</option><option value="patient">Paciente Direto</option>
                </select>
              </div>
            </div>
          </div>

          <!-- ── ETAPA 2: Endereço e Origem ── -->
          <div id="npPage2" style="display:none">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;padding-top:4px">
              <div style="grid-column:1/span 2"><div style="font-size:12px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Endereço</div></div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">CEP</label>
                <input id="np_cep" type="text" placeholder="00000-000" maxlength="9" oninput="maskCEP(this)" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Rua / Av.</label>
                <input id="np_rua" type="text" placeholder="Rua das Flores" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Número</label>
                <input id="np_num" type="text" placeholder="123" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Complemento</label>
                <input id="np_comp" type="text" placeholder="Apto 42" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Bairro</label>
                <input id="np_bairro" type="text" placeholder="Centro" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Cidade</label>
                <input id="np_cidade" type="text" placeholder="São Paulo" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Estado</label>
                <select id="np_uf" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                  <option value="">UF</option>
                  ${['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(u=>`<option value="${u}">${u}</option>`).join('')}
                </select>
              </div>
              <div style="grid-column:1/span 2;border-top:1px solid #F3F4F6;padding-top:14px;margin-top:4px">
                <div style="font-size:12px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Como chegou até nós</div>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Canal de origem *</label>
                <select id="np_source" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                  <option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option>
                  <option value="google">Google / Pesquisa</option><option value="indicacao">Indicação de paciente</option>
                  <option value="whatsapp">WhatsApp</option><option value="site">Site da clínica</option>
                  <option value="evento">Evento / Feira</option><option value="offline">Presencial / Offline</option>
                  <option value="manual">Cadastro manual</option><option value="outro">Outro</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Indicado por</label>
                <input id="np_indicado_por" type="text" placeholder="Nome do paciente que indicou" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Campanha / UTM</label>
                <input id="np_utm_campaign" type="text" placeholder="Ex: fullface-maio25" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
            </div>
          </div>

          <!-- ── ETAPA 3: Dados Clínicos ── -->
          <div id="npPage3" style="display:none">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;padding-top:4px">
              <div style="grid-column:1/span 2"><div style="font-size:12px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Interesse Clínico</div></div>

              <div style="grid-column:1/span 2">
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Procedimento de interesse</label>
                ${procOptions
                  ? `<select id="np_procedimento" onchange="npFillProcedure(this)" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                      <option value="">Selecionar procedimento...</option>
                      ${procOptions}
                      <option value="__outro__">Outro (digitar)</option>
                    </select>
                    <input id="np_procedimento_txt" type="text" placeholder="Ou escreva o procedimento..." style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;margin-top:8px"/>`
                  : `<input id="np_procedimento_txt" type="text" placeholder="Ex: Full Face 5D, Botox" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>`
                }
              </div>

              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Valor estimado (R$)</label>
                <input id="np_valor" type="number" placeholder="0,00" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Duração da consulta</label>
                <select id="np_duracao" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                  <option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>1 hora</option>
                  <option value="90">1h30</option><option value="120">2 horas</option><option value="180">3 horas</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Lead Score (0–100)</label>
                <input id="np_score" type="number" min="0" max="100" placeholder="0" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box" autocomplete="off"/>
              </div>
              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Prioridade</label>
                <select id="np_prioridade" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                  <option value="normal">Normal</option><option value="alta">Alta</option><option value="vip">VIP</option>
                </select>
              </div>

              <div style="grid-column:1/span 2;border-top:1px solid #F3F4F6;padding-top:14px;margin-top:4px">
                <div style="font-size:12px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Ficha Inicial</div>
              </div>
              <div style="grid-column:1/span 2">
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Queixa principal</label>
                <textarea id="np_queixa" rows="2" placeholder="O que o paciente deseja tratar ou melhorar..." style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;resize:vertical;box-sizing:border-box;font-family:inherit"></textarea>
              </div>
              <div style="grid-column:1/span 2">
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Expectativas</label>
                <textarea id="np_expectativas" rows="2" placeholder="O que o paciente espera alcançar..." style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;resize:vertical;box-sizing:border-box;font-family:inherit"></textarea>
              </div>
              <div style="grid-column:1/span 2">
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Observações internas</label>
                <textarea id="np_obs" rows="2" placeholder="Notas para a equipe (não visível ao paciente)..." style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;resize:vertical;box-sizing:border-box;font-family:inherit"></textarea>
              </div>
            </div>
          </div>

        </div><!-- fim body -->

        <!-- Footer fixo -->
        <div style="padding:16px 28px 22px;border-top:1px solid #F3F4F6;flex-shrink:0;display:flex;justify-content:space-between;align-items:center">
          <button id="npBtnBack" onclick="npGoStep(_npStep - 1)" style="padding:10px 20px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;display:none">← Voltar</button>
          <div style="flex:1"></div>
          <button id="npBtnNext" onclick="npGoStep(_npStep + 1)" style="padding:10px 24px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Próximo →</button>
          <button id="npBtnSave" onclick="saveNewPatient()" style="padding:10px 24px;background:linear-gradient(135deg,#10B981,#059669);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;display:none">✓ Cadastrar Paciente</button>
        </div>
      </div>
    </div>`
  document.body.appendChild(m)
}

// Auto-preencher preço e duração ao selecionar procedimento
// ── Sexo biológico — toggle de botões ─────────────────────────
function npSetSex(value) {
  document.getElementById('np_sex').value = value
  var isFem = value === 'feminino'
  var btnF = document.getElementById('np_sex_f')
  var btnM = document.getElementById('np_sex_m')
  if (!btnF || !btnM) return
  btnF.style.background   = isFem  ? '#FDF2F8' : '#fff'
  btnF.style.borderColor  = isFem  ? '#EC4899' : '#E5E7EB'
  btnF.style.color        = isFem  ? '#BE185D' : '#6B7280'
  btnM.style.background   = !isFem ? '#EFF6FF' : '#fff'
  btnM.style.borderColor  = !isFem ? '#3B82F6' : '#E5E7EB'
  btnM.style.color        = !isFem ? '#1D4ED8' : '#6B7280'
  var err = document.getElementById('np_sex_err')
  if (err) err.style.display = 'none'
}
window.npSetSex = npSetSex

// ── Verifica CPF/RG duplicados (Supabase RPC + fallback localStorage) ─────────────────
async function npCheckDuplicateDoc(cpfRaw, rgRaw, excludeId) {
  var cpfDigits = (cpfRaw || '').replace(/\D/g, '')
  var rgClean   = (rgRaw  || '').replace(/[^0-9xX]/gi, '').toLowerCase()

  // Primário: Supabase com constraint real no banco
  if (window._sbShared) {
    try {
      var result = await window._sbShared.rpc('leads_check_duplicate_doc', {
        p_cpf:        cpfDigits.length === 11 ? cpfDigits : null,
        p_rg:         rgClean.length  >= 5    ? rgClean   : null,
        p_exclude_id: excludeId || null,
      })
      if (!result.error && result.data) {
        if (result.data.found) {
          return { tipo: result.data.tipo, lead: { id: result.data.lead_id, name: result.data.name, phone: result.data.phone } }
        }
        return null  // RPC ok, sem duplicata
      }
    } catch (e) {
      // falha silenciosa → cai no fallback
    }
  }

  // Fallback: localStorage (offline ou RPC indisponível)
  var leads = []
  try { leads = JSON.parse(localStorage.getItem('clinicai_leads') || '[]') } catch { leads = [] }
  for (var i = 0; i < leads.length; i++) {
    if (excludeId && leads[i].id === excludeId) continue
    var cf = leads[i].customFields || {}
    if (cpfDigits.length === 11 && cf.cpf && cf.cpf.replace(/\D/g,'') === cpfDigits) {
      return { tipo: 'CPF', lead: leads[i] }
    }
    if (rgClean.length >= 5 && cf.rg && cf.rg.replace(/[^0-9xX]/gi,'').toLowerCase() === rgClean) {
      return { tipo: 'RG', lead: leads[i] }
    }
  }
  return null
}

function npFillProcedure(sel) {
  const opt = sel.options[sel.selectedIndex]
  const price    = opt.dataset.price
  const duration = opt.dataset.duration
  if (price)    document.getElementById('np_valor').value   = price
  if (duration) {
    const sel2 = document.getElementById('np_duracao')
    if (sel2) sel2.value = duration
  }
}
window.npFillProcedure = npFillProcedure

async function npGoStep(step) {
  if (step < 1 || step > 3) return

  // Validar antes de avançar
  if (_npStep === 1 && step > 1) {
    const firstname = document.getElementById('np_firstname')?.value?.trim()
    const lastname  = document.getElementById('np_lastname')?.value?.trim()
    const sex       = document.getElementById('np_sex')?.value?.trim()
    const cpf       = document.getElementById('np_cpf')?.value?.trim()
    const rg        = document.getElementById('np_rg')?.value?.trim()
    const phone     = document.getElementById('np_phone')?.value?.trim()
    if (!firstname) { npHighlight('np_firstname', 'Nome é obrigatório'); return }
    if (!lastname)  { npHighlight('np_lastname',  'Sobrenome é obrigatório'); return }
    if (!sex) {
      var sexErr = document.getElementById('np_sex_err')
      if (sexErr) { sexErr.style.display = 'block' }
      var bf = document.getElementById('np_sex_f'), bm = document.getElementById('np_sex_m')
      if (bf) bf.style.borderColor = '#EF4444'
      if (bm) bm.style.borderColor = '#EF4444'
      setTimeout(function() {
        if (bf) bf.style.borderColor = '#E5E7EB'
        if (bm) bm.style.borderColor = '#E5E7EB'
        if (sexErr) sexErr.style.display = 'none'
      }, 2500)
      return
    }
    if (!cpf)   { npHighlight('np_cpf',   'CPF é obrigatório'); return }
    if (!phone) { npHighlight('np_phone', 'Telefone é obrigatório'); return }

    // Verifica duplicidade de CPF / RG (async — Supabase + fallback localStorage)
    var nextBtn = document.getElementById('npBtnNext')
    if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Verificando...' }
    var dup = await npCheckDuplicateDoc(cpf, rg)
    if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Próximo →' }

    if (dup) {
      var field = dup.tipo === 'CPF' ? 'np_cpf' : 'np_rg'
      var errEl = document.getElementById(field + '_err')
      if (errEl) { errEl.textContent = dup.tipo + ' já cadastrado — Lead: ' + (dup.lead.name || 'existente'); errEl.style.display = 'block' }
      npHighlight(field, dup.tipo + ' já cadastrado')
      setTimeout(function() { if (errEl) errEl.style.display = 'none' }, 4000)
      return
    }
  }

  // Mostrar/ocultar páginas (dados ficam no DOM!)
  ;[1,2,3].forEach(n => {
    const el = document.getElementById(`npPage${n}`)
    if (el) el.style.display = n === step ? 'block' : 'none'
  })

  _npStep = step

  // Atualizar indicadores
  ;[1,2,3].forEach(n => {
    const dot  = document.getElementById(`np_dot_${n}`)
    const lbl  = document.getElementById(`np_lbl_${n}`)
    const wrap = document.getElementById(`np_step_${n}`)
    if (!dot) return
    const done = n < step, current = n === step
    dot.style.background = done ? '#10B981' : current ? '#7C3AED' : '#E5E7EB'
    dot.style.color      = (done || current) ? '#fff' : '#9CA3AF'
    dot.innerHTML        = done ? '✓' : String(n)
    lbl.style.color      = current ? '#7C3AED' : done ? '#10B981' : '#9CA3AF'
    wrap.style.background = current ? '#F5F3FF' : done ? '#F0FDF4' : '#F9FAFB'
  })

  document.getElementById('npBtnBack').style.display = step > 1 ? 'block' : 'none'
  document.getElementById('npBtnNext').style.display = step < 3 ? 'block' : 'none'
  document.getElementById('npBtnSave').style.display = step === 3 ? 'block' : 'none'
}

function npHighlight(id, msg) {
  const el = document.getElementById(id)
  if (!el) return
  el.style.borderColor = '#EF4444'
  el.focus()
  el.placeholder = msg
  setTimeout(() => { el.style.borderColor = '#E5E7EB' }, 2500)
}

async function saveNewPatient() {
  const btn = document.getElementById('npBtnSave')
  btn.textContent = 'Salvando...'
  btn.disabled = true

  const g  = id => document.getElementById(id)?.value?.trim() || ''
  const firstname = g('np_firstname')
  const lastname  = g('np_lastname')
  const name      = (firstname + ' ' + lastname).trim()
  const sex       = g('np_sex')
  const cpf       = g('np_cpf')
  const phone     = g('np_phone')

  if (!firstname || !lastname || !sex || !cpf || !phone) {
    btn.textContent = '✓ Cadastrar Paciente'
    btn.disabled = false
    npGoStep(1)
    return
  }

  // Bloqueia duplicidade de CPF / RG (segunda barreira — Supabase ou localStorage)
  const rg = g('np_rg')
  const dup = await npCheckDuplicateDoc(cpf, rg)
  if (dup) {
    btn.textContent = '✓ Cadastrar Paciente'
    btn.disabled = false
    alert('Lead já cadastrado!\n\n' + dup.tipo + ' já existe na base.\nNome: ' + (dup.lead.name || 'Lead existente'))
    npGoStep(1)
    return
  }

  // Procedimento: preferir select, fallback para texto livre
  const procSel = document.getElementById('np_procedimento')?.value
  const procTxt = g('np_procedimento_txt')
  const procedimento = (procSel && procSel !== '__outro__') ? procSel : procTxt

  const customFields = {}
  if (g('np_dob'))        customFields.dataNascimento       = g('np_dob')
  if (g('np_cpf'))        customFields.cpf                  = g('np_cpf')
  if (g('np_rg'))         customFields.rg                   = g('np_rg')
  if (g('np_sex'))        customFields.sexo                 = g('np_sex')
  if (g('np_profissao'))  customFields.profissao            = g('np_profissao')

  const addr = {}
  ;['cep','rua','num','comp','bairro','cidade'].forEach(k => { const v=g(`np_${k}`); if(v) addr[{cep:'cep',rua:'rua',num:'numero',comp:'complemento',bairro:'bairro',cidade:'cidade'}[k]] = v })
  if (g('np_uf'))         addr.estado = g('np_uf')
  if (Object.keys(addr).length) customFields.endereco = addr

  if (g('np_indicado_por'))   customFields.indicadoPor          = g('np_indicado_por')
  if (g('np_utm_campaign'))   customFields.utmCampaign           = g('np_utm_campaign')
  if (procedimento)           customFields.procedimentoInteresse = procedimento
  if (g('np_valor'))          customFields.valorEstimado         = parseFloat(g('np_valor')) || 0
  if (g('np_duracao'))        customFields.duracaoConsulta       = parseInt(g('np_duracao')) || 60
  if (g('np_prioridade'))     customFields.prioridade            = g('np_prioridade')
  if (g('np_queixa'))         customFields.queixaPrincipal       = g('np_queixa')
  if (g('np_expectativas'))   customFields.expectativas          = g('np_expectativas')

  const statusInit = g('np_status_init') || 'new'
  const source     = g('np_source') || 'manual'
  const notes      = g('np_obs')
  const email      = g('np_email')
  const score      = parseInt(g('np_score')) || 0

  try {
    const newLead = {
      id:          crypto.randomUUID(),
      name,
      phone:       phone.replace(/\D/g, ''),
      email:       email || null,
      source,
      notes:       notes || null,
      leadScore:   score,
      status:      statusInit,
      temperature: 'hot',
      phase:       'lead',
      source_type: 'manual',
      created_at:  new Date().toISOString(),
      customFields,
    }

    if (window.normalizeLead) normalizeLead(newLead)

    // Persiste em localStorage + dispara sync Supabase (fire-and-forget)
    _syncLeadToCache(newLead)

    // Auto-atribui tag "Lead Novo" — aguarda antes de abrir o modal
    // (evita race condition: getTags no viewLead rodaria antes do assign gravar)
    if (window.SdrService) {
      await window.SdrService.assignTag('lead_novo', 'lead', newLead.id).catch(function(e) { console.warn("[patients]", e.message || e) })
    }

    document.getElementById('newPatientModal')?.remove()

    // Limpa busca para evitar autofill do browser deixar o telefone no filtro
    var _si = document.getElementById('leadsSearchInput')
    if (_si) _si.value = ''

    viewLead(newLead.id)
    loadLeads()
    if (document.getElementById('patientsTableBody')) loadPatients()

  } catch (err) {
    btn.textContent = '✓ Cadastrar Paciente'
    btn.disabled = false
    alert('Erro ao cadastrar: ' + (err.message || 'Tente novamente'))
  }
}

window.showNewPatientModal = showNewPatientModal
window.npGoStep            = npGoStep
window.saveNewPatient      = saveNewPatient
