/**
 * ClinicAI — UI Layer: Salas, Tecnologias, Agenda, SDR
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  MÓDULOS NESTE ARQUIVO (após divisão em módulos)             ║
 * ║                                                              ║
 * ║  • Procedimentos  — loadProceduresList, saveProcedure,       ║
 * ║                     deleteProcedure (API backend)            ║
 * ║  • Agenda Core    — APPT_KEY, renderAgenda, openApptModal,   ║
 * ║                     saveAppt, deleteAppt, drag&drop,         ║
 * ║                     finalização, WhatsApp, anamnese          ║
 * ║  • Notificações   — _renderNotificationBell, _showToast      ║
 * ║  • Registro       — showRegisterModal, doRegister,           ║
 * ║                     aprovarUsuario, rejeitarUsuario           ║
 * ║  • Boot/Init      — DOMContentLoaded (verifica login)        ║
 * ║                                                              ║
 * ║  Módulos extraídos para arquivos próprios:                   ║
 * ║    rooms.js · technologies.js · inj-catalog.js               ║
 * ║    agenda-overview.js · sdr.js                               ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  ⚠ GLOBALS OWNED BY OTHER FILES — NÃO DECLARAR AQUI:        ║
 * ║    API_BASE, apiFetch, getToken  → auth.js                   ║
 * ║    STATUS_LABELS, STATUS_COLORS  → agenda-smart.js           ║
 * ║    setText, formatCurrency, formatDate → utils.js            ║
 * ║    getRooms, renderRoomsList     → rooms.js                  ║
 * ║    getTechnologies               → technologies.js           ║
 * ║    loadAgendaOverview, aoSetPeriod → agenda-overview.js      ║
 * ║    sdrLoadFunnel, sdrSaveResp    → sdr.js                    ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  REGRA DE PERSISTÊNCIA:                                      ║
 * ║    Use store.set(KEY, data) — nunca localStorage.setItem()   ║
 * ║    store.set() faz localStorage + Supabase atomicamente      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ─── Helpers ─────────────────────────────────────────────────
// setText · formatCurrency · formatDate → definidos em utils.js (carrega antes deste arquivo)

/** Escapa HTML para prevenir XSS — funcao global unica */
function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
window.escHtml = escHtml

/** Normaliza campos de lead — garantir valores validos para phase, temperature, source_type */
var LEAD_DEFAULTS = {
  VALID_PHASES: ['lead','agendado','reagendado','compareceu','paciente','orcamento','perdido'],
  VALID_TEMPS:  ['hot','warm','cold'],
  VALID_SOURCES:['quiz','manual','import','referral','social'],
  DEFAULT_PHASE: 'lead',
  DEFAULT_TEMP:  'hot',
  DEFAULT_SOURCE:'manual',
}
function normalizeLead(lead) {
  if (!lead) return lead
  // Phase
  if (!lead.phase || LEAD_DEFAULTS.VALID_PHASES.indexOf(lead.phase) === -1) lead.phase = LEAD_DEFAULTS.DEFAULT_PHASE
  // Temperature
  if (!lead.temperature || LEAD_DEFAULTS.VALID_TEMPS.indexOf(lead.temperature) === -1) lead.temperature = LEAD_DEFAULTS.DEFAULT_TEMP
  // Source
  if (!lead.source_type || LEAD_DEFAULTS.VALID_SOURCES.indexOf(lead.source_type) === -1) lead.source_type = LEAD_DEFAULTS.DEFAULT_SOURCE
  // Field name normalization: garantir campos canonicos
  if (!lead.name && lead.nome) lead.name = lead.nome
  if (!lead.phone && lead.telefone) lead.phone = lead.telefone
  if (!lead.phone && lead.whatsapp) lead.phone = lead.whatsapp
  if (!lead.created_at && lead.createdAt) lead.created_at = lead.createdAt
  return lead
}
window.normalizeLead = normalizeLead
window.LEAD_DEFAULTS = LEAD_DEFAULTS

/** Normaliza telefone para WhatsApp (garante 55 + DDD + numero, sem duplicar) */
function formatWaPhone(phone) {
  if (!phone) return ''
  var digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return '55' + digits
}
window.formatWaPhone = formatWaPhone

// ── Rooms → rooms.js | Technologies → technologies.js | Injectables → inj-catalog.js

// ── Procedimentos (API backend) ───────────────────────────────
async function loadProceduresList() {
  const list = document.getElementById('proceduresList')
  if (!list) return
  list.innerHTML = `<div style="text-align:center;padding:24px;color:#9CA3AF">Carregando...</div>`

  try {
    const data = await apiFetch('/procedures?active=all')
    const procs = Array.isArray(data) ? data : []
    _cachedProcedures = procs.filter(p => p.active !== false)

    if (!procs.length) {
      list.innerHTML = `<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:12px">Nenhum procedimento cadastrado</div>`
      return
    }

    // Agrupar por categoria
    const byCategory = {}
    procs.forEach(p => {
      const cat = p.category || 'Sem categoria'
      if (!byCategory[cat]) byCategory[cat] = []
      byCategory[cat].push(p)
    })

    list.innerHTML = Object.entries(byCategory).map(([cat, items]) => `
      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;padding:0 4px">${cat}</div>
        ${items.map(p => `
          <div style="background:#fff;border:1px solid #F3F4F6;border-radius:10px;padding:14px 16px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:13px;font-weight:600;color:${p.active?'#111':'#9CA3AF'};${p.active?'':'text-decoration:line-through'}">${p.name}</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:2px">
                ${p.durationMinutes ? p.durationMinutes + ' min' : ''}
                ${p.description ? ' · ' + p.description : ''}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <div>
                <div style="font-size:14px;font-weight:700;color:#10B981">${formatCurrency(p.price)}</div>
                ${p.promoPrice ? `<div style="font-size:11px;font-weight:600;color:#F59E0B">Promo: ${formatCurrency(p.promoPrice)}</div>` : ''}
              </div>
              <button data-edit-proc="${p.id}" style="display:flex;align-items:center;gap:5px;background:#F3F4F6;border:none;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:600;color:#374151;cursor:pointer"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Ver</button>
              <button data-delete-proc="${p.id}" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:14px;padding:4px">✕</button>
            </div>
          </div>`).join('')}
      </div>`).join('')

    // Event delegation para edit/delete
    list.addEventListener('click', function(e) {
      var editBtn = e.target.closest('[data-edit-proc]')
      if (editBtn) {
        var proc = procs.find(function(p) { return p.id === editBtn.dataset.editProc })
        if (proc) editProcedure(proc.id, proc.name, proc.category || '', proc.price, proc.durationMinutes || 60, proc.description || '', proc.promoPrice || 0)
        return
      }
      var delBtn = e.target.closest('[data-delete-proc]')
      if (delBtn) {
        deleteProcedure(delBtn.dataset.deleteProc)
      }
    })
  } catch (e) {
    list.innerHTML = `<div style="color:#EF4444;padding:16px">Erro ao carregar procedimentos</div>`
  }
}

function showAddProcedureForm() {
  document.getElementById('sprc_id').value = ''
  document.getElementById('addProcedureFormTitle').textContent = 'Novo Procedimento'
  document.getElementById('saveProcedureBtn').textContent = 'Salvar'
  ;['sprc_nome','sprc_categoria','sprc_preco','sprc_preco_promo','sprc_duracao','sprc_descricao'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = id === 'sprc_duracao' ? '60' : ''
  })
  document.getElementById('addProcedureForm').style.display = 'block'
  document.getElementById('addProcedureForm').scrollIntoView({ behavior: 'smooth' })
}

function editProcedure(id, nome, categoria, preco, duracao, descricao, precoPromo) {
  document.getElementById('sprc_id').value             = id
  document.getElementById('sprc_nome').value            = nome
  document.getElementById('sprc_categoria').value       = categoria
  document.getElementById('sprc_preco').value           = preco
  document.getElementById('sprc_preco_promo').value     = precoPromo || ''
  document.getElementById('sprc_duracao').value         = duracao
  document.getElementById('sprc_descricao').value       = descricao
  document.getElementById('addProcedureFormTitle').textContent = 'Editar Procedimento'
  document.getElementById('saveProcedureBtn').textContent = 'Atualizar'
  document.getElementById('addProcedureForm').style.display = 'block'
  document.getElementById('addProcedureForm').scrollIntoView({ behavior: 'smooth' })
}

async function saveProcedure() {
  const nome      = document.getElementById('sprc_nome')?.value?.trim()
  const categoria = document.getElementById('sprc_categoria')?.value?.trim()
  const preco     = parseFloat(document.getElementById('sprc_preco')?.value || '0')
  const precoPromo = parseFloat(document.getElementById('sprc_preco_promo')?.value || '0') || undefined
  const duracao   = parseInt(document.getElementById('sprc_duracao')?.value || '60')
  const desc      = document.getElementById('sprc_descricao')?.value?.trim()
  const id        = document.getElementById('sprc_id')?.value

  if (!nome) { alert('Informe o nome do procedimento'); return }
  if (!categoria) { alert('Informe a categoria'); return }

  const btn = document.getElementById('saveProcedureBtn')
  btn.textContent = 'Salvando...'
  btn.disabled = true

  try {
    if (id) {
      await apiFetch(`/procedures/${id}`, {
        method: 'PUT',
        body: { name: nome, category: categoria, price: preco, promoPrice: precoPromo, durationMinutes: duracao, description: desc || undefined },
      })
    } else {
      await apiFetch('/procedures', {
        method: 'POST',
        body: { name: nome, category: categoria, price: preco, promoPrice: precoPromo, durationMinutes: duracao, description: desc || undefined },
      })
    }
    cancelProcedureForm()
    loadProceduresList()
  } catch (e) {
    btn.textContent = id ? 'Atualizar' : 'Salvar'
    btn.disabled = false
    alert('Erro: ' + e.message)
  }
}

async function deleteProcedure(id) {
  if (!confirm('Remover este procedimento?')) return
  await apiFetch(`/procedures/${id}`, { method: 'DELETE' })
  loadProceduresList()
}

function cancelProcedureForm() {
  document.getElementById('addProcedureForm').style.display = 'none'
  document.getElementById('saveProcedureBtn').disabled = false
}

window.showAddProcedureForm = showAddProcedureForm
window.editProcedure        = editProcedure
window.saveProcedure        = saveProcedure
window.deleteProcedure      = deleteProcedure
window.cancelProcedureForm  = cancelProcedureForm

// ─── Interceptar navegação para carregar dados da página ─────
// Sub-páginas de leads redirecionam todas para leads-all (filtros são na própria página)
const _LEAD_SUBPAGES = new Set([
  'leads-new', 'leads-scheduled', 'leads-attending', 'leads-qualified', 'leads-reactivation',
])

const originalNavigateTo = window.navigateTo
window.navigateTo = function(pageId) {
  // Sub-páginas de leads: redireciona para leads-all sem filtro
  if (_LEAD_SUBPAGES.has(pageId)) {
    originalNavigateTo('leads-all')
    loadLeads()
    return
  }

  originalNavigateTo(pageId)
  if (pageId === 'leads-all') {
    loadLeads()
    if (window.leadsInitTagsFilter) leadsInitTagsFilter()
  }
  if (pageId === 'patients-all')    loadPatients()
  // Orcamentos agora e gerenciado por orcamentos.js via sidebar hook
  // if (pageId === 'orcamentos')      { if (window.renderOrcamentos)     renderOrcamentos() }
  if (pageId === 'patients-budget') { if (window.renderPatientsBudget) renderPatientsBudget() }
  if (pageId === 'settings-tags')   { if (window.renderSettingsTags)   renderSettingsTags() }
  if (pageId === 'settings-clinic') {
    settingsTab('clinic')
    loadClinicSettings()
  }
  if (pageId === 'team-users' || pageId === 'team-profiles' || pageId === 'team-comercial' || pageId === 'team-cs') {
    loadTeam()
  }
}

// ══════════════════════════════════════════════════════════════
//  SISTEMA DE AGENDA — Mês / Semana / Hoje + Drag & Drop
// ══════════════════════════════════════════════════════════════

const APPT_KEY = 'clinicai_appointments'

const AGENDA_SLOTS = (() => {
  const s = []
  for (let h = 7; h <= 20; h++) {
    s.push(`${String(h).padStart(2,'0')}:00`)
    if (h < 20) s.push(`${String(h).padStart(2,'0')}:30`)
  }
  return s
})()

const APPT_STATUS_CFG = {
  agendado:               { label:'Agendado',            color:'#3B82F6', bg:'#EFF6FF', dot:'●' },
  aguardando_confirmacao: { label:'Aguard. Confirmação', color:'#F59E0B', bg:'#FFFBEB', dot:'●' },
  confirmado:             { label:'Confirmado',          color:'#10B981', bg:'#ECFDF5', dot:'●' },
  aguardando:             { label:'Aguardando',          color:'#8B5CF6', bg:'#EDE9FE', dot:'●' },
  na_clinica:             { label:'Na Clínica',          color:'#06B6D4', bg:'#ECFEFF', dot:'●' },
  em_consulta:            { label:'Em Consulta',         color:'#7C3AED', bg:'#F5F3FF', dot:'●' },
  em_atendimento:         { label:'Em Atendimento',      color:'#7C3AED', bg:'#EDE9FE', dot:'●' },
  finalizado:             { label:'Finalizado',          color:'#374151', bg:'#F3F4F6', dot:'●' },
  remarcado:              { label:'Remarcado',           color:'#F97316', bg:'#FFF7ED', dot:'●' },
  cancelado:              { label:'Cancelado',           color:'#EF4444', bg:'#FEF2F2', dot:'●' },
  no_show:                { label:'No-show',             color:'#DC2626', bg:'#FEF2F2', dot:'●' },
}

const MESES_PT   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_PT    = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const DIAS_GRID  = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']

// Estado global da agenda
let _agendaView      = 'semana'   // 'mes' | 'semana' | 'hoje'
let _agendaDate      = new Date()
let _activeAgendaCnt = 'agendaRoot'
let _draggedApptId   = null
let _pendingDrag     = null
let _finishProducts  = []

// ── Helpers ───────────────────────────────────────────────────
function getAppointments() {
  return JSON.parse(localStorage.getItem(APPT_KEY) || '[]')
}
function saveAppointments(arr) {
  store.set(APPT_KEY, arr)
  // Fire-and-forget: não bloqueia UI — falhas são silenciosas
  // O serviço já tem o array completo; para identificar o(s) registro(s)
  // que mudaram sem diff complexo, o chamador deve usar AppointmentsService.syncOne()
  // diretamente quando conhece o objeto. Esta função é o fallback geral.
}
function genApptId() {
  return 'appt_' + Date.now() + '_' + Math.random().toString(36).slice(2,7)
}
function addMinutes(time, mins) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
}
function dateToISO(d) {
  return d.toISOString().slice(0,10)
}
function fmtDate(iso) {
  const [y,m,d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function fmtBRL(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.')
}

// ── Conflito de horário ───────────────────────────────────────
function timeToMin(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function checkConflict(appt, allAppts) {
  const aStart = timeToMin(appt.horaInicio)
  const aEnd   = timeToMin(appt.horaFim)
  for (const b of allAppts) {
    if (b.id === appt.id) continue
    if (b.data !== appt.data) continue
    if (['cancelado','no_show'].includes(b.status)) continue
    const bStart = timeToMin(b.horaInicio)
    const bEnd   = timeToMin(b.horaFim)
    if (aStart >= bEnd || aEnd <= bStart) continue  // sem sobreposição
    const sameProf = appt.profissionalIdx !== undefined && appt.profissionalIdx !== null &&
                     b.profissionalIdx !== undefined && b.profissionalIdx !== null &&
                     String(appt.profissionalIdx) === String(b.profissionalIdx)
    const sameSala = appt.salaIdx !== undefined && appt.salaIdx !== null &&
                     b.salaIdx !== undefined && b.salaIdx !== null &&
                     String(appt.salaIdx) === String(b.salaIdx)
    if (sameProf) return { conflict: true, reason: `Profissional já tem consulta às ${b.horaInicio} (${b.pacienteNome})` }
    if (sameSala) return { conflict: true, reason: `Sala já ocupada às ${b.horaInicio} (${b.pacienteNome})` }
  }
  return { conflict: false }
}

// ── Render unificado ─────────────────────────────────────────
function renderAgenda() {
  const root = document.getElementById('agendaRoot')
  if (!root) return
  const todayIso = dateToISO(new Date())
  const curIso   = dateToISO(_agendaDate)

  // ── Toolbar
  let navLabel = ''
  if (_agendaView === 'mes') {
    navLabel = `${MESES_PT[_agendaDate.getMonth()]} ${_agendaDate.getFullYear()}`
  } else if (_agendaView === 'semana') {
    const ws = _getWeekStart(_agendaDate)
    const we = new Date(ws); we.setDate(ws.getDate() + 6)
    navLabel = `${fmtDate(dateToISO(ws))} — ${fmtDate(dateToISO(we))}`
  } else {
    navLabel = `${fmtDate(curIso)} · ${DIAS_PT[_agendaDate.getDay()]}`
  }

  const viewBtn = (v, label) => {
    const active = _agendaView === v
    return `<button onclick="setAgendaView('${v}')" style="padding:6px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;border:1.5px solid ${active?'#7C3AED':'#E5E7EB'};background:${active?'#7C3AED':'#fff'};color:${active?'#fff':'#374151'}">${label}</button>`
  }

  const toolbar = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <button onclick="navAgenda(-1)" style="${btnOutline()}">‹</button>
      <div style="font-size:14px;font-weight:700;color:#111;min-width:200px;text-align:center">${navLabel}</div>
      <button onclick="navAgenda(1)"  style="${btnOutline()}">›</button>
      <div style="flex:1"></div>
      <div style="display:flex;gap:4px;background:#F3F4F6;padding:4px;border-radius:10px">
        ${viewBtn('mes','Mês')}${viewBtn('semana','Semana')}${viewBtn('hoje','Hoje')}
      </div>
      <button onclick="openApptModal(null,'${todayIso}',null,0)" style="${btnPrimary()}">+ Nova Consulta</button>
    </div>`

  const legend = `<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    ${Object.entries(APPT_STATUS_CFG).map(([,s])=>
      `<span style="font-size:11px;font-weight:600;color:${s.color};background:${s.bg};padding:3px 8px;border-radius:20px">${s.dot} ${s.label}</span>`
    ).join('')}
  </div>`

  let body = ''
  if (_agendaView === 'mes')    body = buildMesGrid()
  if (_agendaView === 'semana') body = buildSemanaGrid()
  if (_agendaView === 'hoje')   body = buildHojeGrid()

  const filterBar = window.renderAgendaFilterBar ? renderAgendaFilterBar() : ''
  root.innerHTML = toolbar + filterBar + legend + body
}

function _getWeekStart(d) {
  const ws = new Date(d)
  const day = ws.getDay()
  ws.setDate(ws.getDate() - (day === 0 ? 6 : day - 1))
  ws.setHours(0,0,0,0)
  return ws
}

// ── Vista Mês ─────────────────────────────────────────────────
function buildMesGrid() {
  const year  = _agendaDate.getFullYear()
  const month = _agendaDate.getMonth()
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const todayIso = dateToISO(new Date())
  const appts = (window.getFilteredAppointments ? getFilteredAppointments() : getAppointments())

  const byDate = {}
  appts.forEach(a => {
    if (!byDate[a.data]) byDate[a.data] = []
    byDate[a.data].push(a)
  })

  const startDay = new Date(first)
  const d0 = startDay.getDay()
  startDay.setDate(startDay.getDate() - (d0 === 0 ? 6 : d0 - 1))

  const cells = []
  const cur = new Date(startDay)
  while (cur <= last || cells.length % 7 !== 0 || cells.length < 35) {
    cells.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
    if (cells.length > 42) break
  }

  const numWeeks = Math.ceil(cells.length / 7)
  // Altura de cada célula para preencher a primeira dobra da página
  const cellH = `calc((100vh - 260px) / ${numWeeks})`

  const header = DIAS_GRID.map(d =>
    `<th style="padding:8px 4px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;text-align:center;border-bottom:2px solid #E5E7EB">${d}</th>`
  ).join('')

  const rows = []
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7)
    const tds = week.map(day => {
      const iso = dateToISO(day)
      const inMonth = day.getMonth() === month
      const isToday = iso === todayIso
      const count = (byDate[iso] || []).length

      const dayNum = `<div style="font-size:13px;font-weight:${isToday?'800':'600'};${isToday?'background:#7C3AED;color:#fff;width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;':'color:'+(inMonth?'#374151':'#D1D5DB')}">${day.getDate()}</div>`

      const countBubble = count > 0
        ? `<div
            onmouseenter="_mesHoverShow('${iso}',event)"
            onmouseleave="_mesHoverTimer=setTimeout(_mesHoverHide,300)"
            onclick="event.stopPropagation();agendaMesModal('${iso}')"
            style="margin-top:10px;width:36px;height:36px;border-radius:50%;background:#7C3AED;color:#fff;font-size:15px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(124,58,237,.35);transition:transform .15s,box-shadow .15s"
            onmouseover="this.style.transform='scale(1.12)';this.style.boxShadow='0 4px 14px rgba(124,58,237,.5)'"
            onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 2px 8px rgba(124,58,237,.35)'">${count}</div>`
        : ''

      const isPastDay = iso < todayIso
      const canClickDay = !isPastDay || count > 0
      return `<td ${canClickDay?'onclick="setAgendaView(\'hoje\');_agendaDate=new Date(\''+iso+'T12:00\');renderAgenda()"':''}
        ${canClickDay?'ondragover="agendaDragOver(event)" ondragleave="agendaDragLeave(event)" ondrop="agendaDrop(event,\''+iso+'\',\'08:00\',0)"':''}
        style="padding:10px 8px;vertical-align:top;border:1px solid #F3F4F6;min-height:${cellH};cursor:${canClickDay?'pointer':'default'};background:${isToday?'#F5F3FF':inMonth?'#fff':'#FAFAFA'};transition:background .1s;${isPastDay&&!count?'opacity:0.4;':''}"
        >
        ${dayNum}
        ${countBubble}
      </td>`
    }).join('')
    rows.push(`<tr>${tds}</tr>`)
  }

  return `<div style="border-radius:12px;border:1px solid #E5E7EB;overflow:hidden">
    <table style="border-collapse:collapse;width:100%;table-layout:fixed">
      <thead><tr>${header}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  </div>`
}

// ── Hover Popover: Agendamentos do dia (Vista Mês) ────────────

var _mesHoverTimer = null

function _mesHoverShow(iso, e) {
  clearTimeout(_mesHoverTimer)
  var old = document.getElementById('_mesHoverPop')
  if (old) old.remove()

  var appts = getAppointments().filter(function(a) { return a.data === iso })
    .sort(function(a, b) { return a.horaInicio.localeCompare(b.horaInicio) })
  if (!appts.length) return

  var pop = document.createElement('div')
  pop.id = '_mesHoverPop'
  pop.style.cssText = 'position:fixed;z-index:9998;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);border:1px solid #E5E7EB;min-width:280px;max-width:340px;overflow:hidden'

  var rows = appts.map(function(a) {
    var s = (window.APPT_STATUS_CFG || {})[a.status] || { color:'#6B7280', bg:'#F9FAFB', label:a.status }
    return '<div onclick="_mesHoverHide();openApptDetail(\'' + a.id + '\')" ' +
      'onmouseenter="this.style.background=\'#F5F3FF\'" onmouseleave="this.style.background=\'\'" ' +
      'style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer">' +
        '<div style="flex-shrink:0;min-width:38px;text-align:center">' +
          '<div style="font-size:11px;font-weight:700;color:#374151">' + a.horaInicio + '</div>' +
          '<div style="font-size:10px;color:#9CA3AF">' + (a.horaFim || '') + '</div>' +
        '</div>' +
        '<div style="width:7px;height:7px;border-radius:50%;background:' + s.color + ';flex-shrink:0"></div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:12px;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (a.pacienteNome || 'Paciente') + '</div>' +
          '<div style="font-size:10px;color:#6B7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (a.procedimento || '—') + '</div>' +
        '</div>' +
        '<span style="font-size:9px;font-weight:700;color:' + s.color + ';background:' + s.bg + ';padding:2px 7px;border-radius:20px;flex-shrink:0">' + (s.label || a.status) + '</span>' +
    '</div>'
  }).join('')

  pop.innerHTML =
    '<div style="padding:9px 12px;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center">' +
      '<div style="font-size:12px;font-weight:700;color:#374151">' + fmtDate(iso) + '</div>' +
      '<div style="font-size:11px;color:#9CA3AF">' + appts.length + ' agendamento' + (appts.length !== 1 ? 's' : '') + '</div>' +
    '</div>' +
    '<div style="padding:6px 4px;max-height:300px;overflow-y:auto">' + rows + '</div>'

  pop.addEventListener('mouseenter', function() { clearTimeout(_mesHoverTimer) })
  pop.addEventListener('mouseleave', function() { _mesHoverTimer = setTimeout(_mesHoverHide, 300) })

  // Posiciona imediatamente abaixo do cursor do mouse
  document.body.appendChild(pop)
  var pw = pop.offsetWidth  || 300
  var ph = pop.offsetHeight || 200
  var cx = (e && e.clientX) ? e.clientX : 0
  var cy = (e && e.clientY) ? e.clientY : 0
  var left = cx - pw / 2
  var top  = cy + 2
  if (left + pw > window.innerWidth  - 8) left = window.innerWidth  - pw - 8
  if (left < 8) left = 8
  if (top  + ph > window.innerHeight - 8) top  = cy - ph - 2
  pop.style.left = left + 'px'
  pop.style.top  = top  + 'px'
}

function _mesHoverHide() {
  clearTimeout(_mesHoverTimer)
  var pop = document.getElementById('_mesHoverPop')
  if (pop) pop.remove()
}

// ── Modal: Agendamentos do dia (Vista Mês) ─────────────────────
function agendaMesModal(iso) {
  const appts = getAppointments().filter(a => a.data === iso)
    .sort((a,b) => a.horaInicio.localeCompare(b.horaInicio))
  const dateStr = fmtDate(iso)

  const rows = appts.length === 0
    ? `<div style="text-align:center;color:#9CA3AF;padding:32px 20px;font-size:13px">Nenhum agendamento neste dia</div>`
    : appts.map(a => {
        const s = APPT_STATUS_CFG[a.status] || APPT_STATUS_CFG.agendado
        return `<div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #F3F4F6">
          <div style="flex-shrink:0;width:48px;text-align:center">
            <div style="font-size:12px;font-weight:700;color:#374151">${a.horaInicio}</div>
            <div style="font-size:10px;color:#9CA3AF">${a.horaFim}</div>
          </div>
          <div style="flex-shrink:0;width:10px;height:10px;border-radius:50%;background:${s.color}"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.pacienteNome||'Paciente'}</div>
            <div style="font-size:11px;color:#6B7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.procedimento||'—'}</div>
          </div>
          <span style="flex-shrink:0;font-size:10px;font-weight:700;color:${s.color};background:${s.bg};padding:3px 9px;border-radius:20px">${s.label||a.status}</span>
          <button onclick="document.getElementById('agendaMesDlg').remove();openApptDetail('${a.id}')"
            style="flex-shrink:0;font-size:11px;padding:5px 11px;background:#7C3AED;color:#fff;border:none;border-radius:7px;cursor:pointer;font-weight:600">Perfil</button>
        </div>`
      }).join('')

  const dlg = document.createElement('div')
  dlg.id = 'agendaMesDlg'
  dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999'
  dlg.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:92%;max-width:520px;max-height:78vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #E5E7EB;flex-shrink:0">
        <div>
          <div style="font-size:16px;font-weight:800;color:#111827">Agendamentos do Dia</div>
          <div style="font-size:12px;color:#6B7280;margin-top:2px">${dateStr} &mdash; ${appts.length} agendamento${appts.length!==1?'s':''}</div>
        </div>
        <button onclick="document.getElementById('agendaMesDlg').remove()"
          style="width:32px;height:32px;border-radius:50%;border:none;background:#F3F4F6;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:#6B7280;flex-shrink:0">&times;</button>
      </div>
      <div style="overflow-y:auto;padding:0 20px 12px;flex:1">${rows}</div>
    </div>`
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.remove() })
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { dlg.remove(); document.removeEventListener('keydown', esc) }
  })
  const existing = document.getElementById('agendaMesDlg')
  if (existing) existing.remove()
  document.body.appendChild(dlg)
}

// ── Vista Semana ──────────────────────────────────────────────
function buildSemanaGrid() {
  const ws = _getWeekStart(_agendaDate)
  const days = Array.from({length:7}, (_,i) => {
    const d = new Date(ws); d.setDate(ws.getDate() + i); return d
  })
  const todayIso = dateToISO(new Date())
  const appts = (window.getFilteredAppointments ? getFilteredAppointments() : getAppointments())

  const cellMap = {}
  appts.forEach(a => {
    const key = `${a.data}_${a.horaInicio}`
    if (!cellMap[key]) cellMap[key] = []
    cellMap[key].push(a)
  })

  const colW = `calc((100% - 72px) / 7)`

  const ths = days.map(d => {
    const iso = dateToISO(d)
    const isToday = iso === todayIso
    return `<th style="width:${colW};padding:8px 6px;font-size:12px;font-weight:700;color:${isToday?'#7C3AED':'#374151'};border-right:1px solid #E5E7EB;text-align:center;background:${isToday?'#F5F3FF':'#F9FAFB'}">
      <div>${DIAS_PT[d.getDay()]}</div>
      <div style="font-size:16px;font-weight:800">${d.getDate()}</div>
    </th>`
  }).join('')

  const bodyRows = AGENDA_SLOTS.map(slot => {
    const isHour = slot.endsWith(':00')
    const tds = days.map(d => {
      const iso = dateToISO(d)
      const key = `${iso}_${slot}`
      const isToday = iso === todayIso
      const cards = (cellMap[key] || []).map(a => apptCardSmall(a)).join('')
      const isPast = iso < todayIso
      const hasCards = cards.length > 0
      const clickable = !isPast || hasCards
      return `<td ${clickable?'ondragover="agendaDragOver(event)" ondragleave="agendaDragLeave(event)" ondrop="agendaDrop(event,\''+iso+'\',\''+slot+'\',0)"':''}
        ${clickable?'onclick="if(!event.target.closest(\'[data-apptid]\'))openApptModal(null,\''+iso+'\',\''+slot+'\',0)"':''}
        style="width:${colW};padding:2px 3px;border-right:1px solid #E5E7EB;border-bottom:1px solid ${isHour?'#E5E7EB':'#F3F4F6'};min-height:34px;vertical-align:top;cursor:${clickable?'pointer':'default'};background:${isToday?'#FEFCE8':isPast&&!hasCards?'#F9FAFB':''};${isPast&&!hasCards?'opacity:0.5;':''}"
        >${cards}</td>`
    }).join('')
    return `<tr style="background:${isHour?'#FAFAFA':'#fff'}">
      <td style="width:72px;padding:4px 10px;font-size:11px;font-weight:${isHour?'700':'400'};color:${isHour?'#374151':'#9CA3AF'};border-right:1px solid #E5E7EB;border-bottom:1px solid ${isHour?'#E5E7EB':'#F3F4F6'};white-space:nowrap;position:sticky;left:0;background:${isHour?'#FAFAFA':'#fff'};z-index:1">${slot}</td>
      ${tds}
    </tr>`
  }).join('')

  return `<div style="width:100%;overflow-x:auto;border-radius:12px;border:1px solid #E5E7EB;box-sizing:border-box">
    <table style="border-collapse:collapse;table-layout:fixed;width:100%;min-width:600px">
      <thead><tr style="background:#F9FAFB">
        <th style="width:72px;padding:10px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;border-right:1px solid #E5E7EB;position:sticky;left:0;background:#F9FAFB;z-index:2">Hora</th>
        ${ths}
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`
}

// ── Vista Hoje (por profissional) ─────────────────────────────
function buildHojeGrid() {
  const iso   = dateToISO(_agendaDate)
  const profs = getProfessionals()
  const appts = (window.getFilteredAppointments ? getFilteredAppointments() : getAppointments()).filter(a => a.data === iso)

  const cellMap = {}
  appts.forEach(a => {
    const key = `${a.horaInicio}_${a.profissionalIdx ?? 0}`
    if (!cellMap[key]) cellMap[key] = []
    cellMap[key].push(a)
  })

  const cols = profs.length ? profs : [{ nome: 'Sem profissional' }]

  const profColW = cols.length > 0 ? `calc((100% - 72px) / ${cols.length})` : '100%'

  const ths = cols.map((p,i) =>
    `<th style="width:${profColW};padding:10px 12px;font-size:12px;font-weight:700;color:#374151;border-right:1px solid #E5E7EB;text-align:center">
      <div>${p.nome}</div>
      ${p.especialidade?`<div style="font-size:10px;font-weight:400;color:#9CA3AF">${p.especialidade}</div>`:''}
    </th>`
  ).join('')

  const bodyRows = AGENDA_SLOTS.map(slot => {
    const isHour = slot.endsWith(':00')
    const tds = cols.map((_,pi) => {
      const key = `${slot}_${pi}`
      const cards = (cellMap[key] || []).map(a => apptCard(a, pi)).join('')
      const isPastDay = iso < todayIso
      const hasAppts = cards.length > 0
      const canClick = !isPastDay || hasAppts
      return `<td ${canClick?'ondragover="agendaDragOver(event)" ondragleave="agendaDragLeave(event)" ondrop="agendaDrop(event,\''+iso+'\',\''+slot+'\','+pi+')"':''}
        ${canClick?'onclick="if(!event.target.closest(\'[data-apptid]\'))openApptModal(null,\''+iso+'\',\''+slot+'\','+pi+')"':''}
        style="width:${profColW};padding:3px 4px;border-right:1px solid #E5E7EB;border-bottom:1px solid ${isHour?'#E5E7EB':'#F3F4F6'};min-height:38px;vertical-align:top;cursor:${canClick?'pointer':'default'};transition:background .1s;${isPastDay&&!hasAppts?'opacity:0.5;':''}"
        >${cards}</td>`
    }).join('')
    return `<tr style="background:${isHour?'#FAFAFA':'#fff'}">
      <td style="width:72px;padding:6px 10px;font-size:11px;font-weight:${isHour?'700':'400'};color:${isHour?'#374151':'#9CA3AF'};border-right:1px solid #E5E7EB;border-bottom:1px solid ${isHour?'#E5E7EB':'#F3F4F6'};white-space:nowrap;position:sticky;left:0;background:${isHour?'#FAFAFA':'#fff'};z-index:1">${slot}</td>
      ${tds}
    </tr>`
  }).join('')

  return `<div style="width:100%;overflow-x:auto;border-radius:12px;border:1px solid #E5E7EB;box-sizing:border-box">
    <table style="border-collapse:collapse;table-layout:fixed;width:100%;min-width:${72 + cols.length * 140}px">
      <thead><tr style="background:#F9FAFB">
        <th style="width:72px;padding:10px 12px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;border-right:1px solid #E5E7EB;position:sticky;left:0;background:#F9FAFB;z-index:2">Hora</th>
        ${ths}
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`
}

// ── Cards ─────────────────────────────────────────────────────
// ── Tooltip de hover nos cards ────────────────────────────────

function _apptTip(e, id) {
  var appts = getAppointments()
  var a = appts.find(function(x) { return x.id === id })
  if (!a) return
  var tip = document.getElementById('_apptHoverTip')
  if (!tip) {
    tip = document.createElement('div')
    tip.id = '_apptHoverTip'
    tip.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;background:#1F2937;color:#fff;border-radius:10px;padding:10px 13px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,0.25);min-width:180px;max-width:260px;transition:opacity .1s'
    document.body.appendChild(tip)
  }
  var s = (window.APPT_STATUS_CFG || {})[a.status] || { label: a.status, color: '#9CA3AF' }
  tip.innerHTML =
    '<div style="font-size:13px;font-weight:700;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (a.pacienteNome || 'Paciente') + '</div>' +
    (a.procedimento ? '<div style="color:#D1D5DB;margin-bottom:3px">' + a.procedimento + '</div>' : '') +
    '<div style="color:#9CA3AF;font-size:11px">' + (a.horaInicio || '') + (a.horaFim ? ' – ' + a.horaFim : '') + '</div>' +
    '<div style="margin-top:5px;display:inline-block;font-size:10px;font-weight:700;color:' + s.color + ';background:rgba(255,255,255,.1);padding:2px 7px;border-radius:20px">' + (s.label || a.status) + '</div>'
  var rect = e.currentTarget.getBoundingClientRect()
  var left = rect.right + 8
  if (left + 270 > window.innerWidth) left = rect.left - 270
  tip.style.left    = left + 'px'
  tip.style.top     = (rect.top + window.scrollY) + 'px'
  tip.style.opacity = '1'
  tip.style.display = 'block'
}

function _apptTipHide() {
  var tip = document.getElementById('_apptHoverTip')
  if (tip) tip.style.display = 'none'
}

function apptCard(a, profIdx) {
  const s = APPT_STATUS_CFG[a.status] || APPT_STATUS_CFG.agendado
  const isCancelado = ['cancelado','no_show','finalizado'].includes(a.status)

  // Determinar se pode arrastar
  const canDrag  = window.AgendaValidator ? AgendaValidator.canDrag(a) : !isCancelado
  const isLocked = ['finalizado','em_consulta','na_clinica'].includes(a.status)

  // Ícone de cadeado para estados travados
  const lockIcon = isLocked
    ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="${s.color}" stroke-width="2.5" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`
    : ''

  // Opacidade e estilo para cancelado/no-show
  const cardOpacity = ['cancelado','no_show'].includes(a.status) ? 'opacity:0.6;' : ''

  // Tag de presença
  const presenca = a.presenca || 'aguardando'
  const presencaTag = !isCancelado ? `
    <div onclick="event.stopPropagation();${presenca === 'aguardando' ? `marcarCompareceu('${a.id}')` : ''}"
      style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;cursor:${presenca==='aguardando'?'pointer':'default'};
             background:${presenca==='compareceu'?'#D1FAE5':'#FEF3C7'};
             color:${presenca==='compareceu'?'#065F46':'#92400E'};
             border:1px solid ${presenca==='compareceu'?'#6EE7B7':'#FCD34D'};
             transition:all .15s" ${presenca==='aguardando'?`title="Clique para confirmar chegada"`:''}
      >
      ${presenca === 'compareceu'
        ? `<span style="width:6px;height:6px;border-radius:50%;background:#10B981;display:inline-block"></span> Compareceu`
        : `<span style="width:6px;height:6px;border-radius:50%;background:#F59E0B;display:inline-block;animation:pulse 1.5s infinite"></span> Aguardando`
      }
    </div>` : ''

  return `<div data-apptid="${a.id}" draggable="${canDrag}"
    ondragstart="${canDrag ? `agendaDragStart(event,'${a.id}')` : `agendaDragStartBlocked(event,'${a.id}')`}"
    onclick="event.stopPropagation();openApptDetail('${a.id}')"
    onmouseenter="_apptTip(event,'${a.id}')" onmouseleave="_apptTipHide()"
    style="background:${s.bg};border-left:3px solid ${s.color};border-radius:6px;padding:5px 7px;margin-bottom:2px;cursor:${canDrag?'grab':'default'};min-width:130px;${cardOpacity}${['cancelado','no_show'].includes(a.status)?'text-decoration-line:none;border-left-style:dashed;':''}">
    <div style="display:flex;align-items:center;gap:4px">
      ${lockIcon}
      <div style="font-size:11px;font-weight:700;color:${s.color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${a.pacienteNome || 'Paciente'}</div>
    </div>
    <div style="font-size:10px;color:#6B7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.procedimento || '—'}</div>
    <div style="font-size:9px;color:#9CA3AF;margin-top:1px">${a.horaInicio}–${a.horaFim}</div>
    ${presencaTag}
    <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
      ${a.status === 'finalizado' ? `<button onclick="event.stopPropagation();openApptDetail('${a.id}')" style="font-size:9px;padding:2px 5px;background:${s.color};color:#fff;border:none;border-radius:4px;cursor:pointer">Detalhes</button>` : ''}
      ${['agendado','confirmado','em_atendimento','na_clinica','em_consulta','aguardando'].includes(a.status) ? `<button onclick="event.stopPropagation();openFinalizeModal('${a.id}')" style="font-size:9px;padding:2px 5px;background:#7C3AED;color:#fff;border:none;border-radius:4px;cursor:pointer">Finalizar</button>` : ''}
    </div>
  </div>`
}

// ── Marcar Compareceu ─────────────────────────────────────────
function marcarCompareceu(id) {
  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return

  const nome = _nomeEnxuto(a.pacienteNome || 'Paciente')

  if (!confirm(`Confirmar chegada de ${nome}?`)) return
  if (!confirm(`Paciente ${nome} está presente e será registrado como "Compareceu". Confirmar?`)) return

  // Atualiza presença + status
  a.presenca = 'compareceu'
  if (a.status === 'agendado' || a.status === 'confirmado') a.status = 'em_atendimento'
  a.chegada_em = new Date().toISOString()
  saveAppointments(appts)
  // Sync Supabase (fire-and-forget)
  window.AppointmentsService?.syncOne(a)

  renderAgenda()

  // ── Mensagem 1: Boas-vindas (imediata) ───────────────────────
  const clinica = _getClinicaNome()
  const msgBoasVindas = _wppMsgBoasVindas(nome, clinica)
  _simularEnvioWpp(a, 'boas_vindas', msgBoasVindas, 0)

  // ── Mensagem 2: Consentimentos (após 1 minuto) ───────────────
  const temProcedimento = !!(a.procedimento && a.procedimento.trim())
  setTimeout(() => {
    const msgImagem = _wppMsgConsentimentoImagem(nome, clinica)
    _simularEnvioWpp(a, 'consent_imagem', msgImagem, 0)

    if (temProcedimento) {
      setTimeout(() => {
        const msgProc = _wppMsgConsentimentoProcedimento(nome, a.procedimento, clinica)
        _simularEnvioWpp(a, 'consent_proc', msgProc, 0)
      }, 8000) // 8 segundos depois do consentimento de imagem
    }
  }, 60000) // 1 minuto depois das boas-vindas

  // Toast imediato de confirmação
  _showToast('Chegada registrada', `${nome} marcado como Compareceu`, 'success')
}

// ── Templates de mensagens WhatsApp ──────────────────────────
function _nomeEnxuto(nomeCompleto) {
  if (!nomeCompleto) return ''
  const partes = nomeCompleto.trim().split(/\s+/)
  if (partes.length <= 1) return partes[0]
  return partes[0] + ' ' + partes[1]
}

function _getClinicaNome() {
  try {
    const cfg = JSON.parse(localStorage.getItem('clinic_settings') || '{}')
    return cfg.nome || cfg.clinicName || 'nossa clínica'
  } catch { return 'nossa clínica' }
}

function _wppMsgBoasVindas(nome, clinica) {
  return `Olá, ${nome}! 😊

Seja bem-vindo(a) à *${clinica}*! ✨

Estamos muito felizes em te receber hoje! Enquanto aguarda seu atendimento, temos a *poltrona de massagem* disponível para você relaxar. 💆‍♀️

Aproveite também nosso *menu virtual*:
👉 ${_getMenuVirtualLink()}

Por lá você pode solicitar água, chá, café ou qualquer outra coisa para tornar sua espera ainda mais confortável. ☕

Em breve nosso time estará com você! 🌟`
}

function _wppMsgConsentimentoImagem(nome, clinica) {
  return `${nome}, para continuarmos com o seu atendimento precisamos do seu *Consentimento de Uso de Imagem*. 📸

Suas fotos serão utilizadas exclusivamente para acompanhar a evolução do seu tratamento e, caso você autorize, poderão ser compartilhadas em nossas redes sociais (sempre preservando sua identidade, se preferir).

*Você autoriza o uso das suas imagens para fins de acompanhamento e divulgação?*

✅ Sim — pode fotografar e divulgar
📷 Parcial — pode fotografar, mas não divulgar
❌ Não — apenas para registro interno

Por favor, responda com uma das opções acima ou informe sua preferência à nossa equipe. 🙏`
}

function _wppMsgConsentimentoProcedimento(nome, procedimento, clinica) {
  return `${nome}, sobre o procedimento de hoje ✨

Você tem agendado: *${procedimento}*

Antes de iniciarmos, pedimos que leia e assine o *Termo de Consentimento Informado* sobre esse procedimento, que contém:

📋 Descrição do procedimento
⚠️ Riscos e contraindicações
✅ Cuidados pré e pós-procedimento
📌 O que esperar dos resultados

Nossa equipe entregará o documento para você assinar na recepção, ou responda *LI E ACEITO* caso já tenha sido orientado(a) anteriormente.

Qualquer dúvida, estamos à disposição! 💜`
}

function _getMenuVirtualLink() {
  try {
    const cfg = JSON.parse(localStorage.getItem('clinic_settings') || '{}')
    return cfg.menu_virtual_link || cfg.site || 'link do menu virtual'
  } catch { return 'link do menu virtual' }
}

// ── Simular envio WhatsApp (mock) ─────────────────────────────
function _simularEnvioWpp(appt, tipo, mensagem, delay) {
  const fila = store.get('clinic_wpp_fila', [])
  const item = {
    id:        'wpp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    appt_id:   appt.id,
    paciente:  appt.pacienteNome,
    tipo,
    mensagem,
    status:    'enviado',
    enviado_em: new Date().toISOString()
  }
  fila.push(item)
  store.set('clinic_wpp_fila', fila)

  // Toast mostrando o envio
  const labels = {
    boas_vindas:    '💬 Boas-vindas enviado',
    consent_imagem: '📸 Consentimento de imagem enviado',
    consent_proc:   '📋 Consentimento do procedimento enviado'
  }
  const subtitles = {
    boas_vindas:    `WhatsApp de boas-vindas para ${_nomeEnxuto(appt.pacienteNome)}`,
    consent_imagem: `Consentimento de imagem para ${_nomeEnxuto(appt.pacienteNome)}`,
    consent_proc:   `Consentimento de "${appt.procedimento}" para ${_nomeEnxuto(appt.pacienteNome)}`
  }
  _showToast(labels[tipo] || 'WhatsApp enviado', subtitles[tipo] || '', 'info')
}

function apptCardSmall(a) {
  const s        = APPT_STATUS_CFG[a.status] || APPT_STATUS_CFG.agendado
  const profs    = getProfessionals()
  const profNome = a.profissionalNome || profs[a.profissionalIdx]?.nome || ''
  const canDrag  = window.AgendaValidator ? AgendaValidator.canDrag(a) : !['finalizado','em_consulta','na_clinica'].includes(a.status)
  const isLocked = ['finalizado','em_consulta','na_clinica'].includes(a.status)
  const cardOpacity = ['cancelado','no_show'].includes(a.status) ? 'opacity:0.6;' : ''

  return `<div data-apptid="${a.id}" draggable="${canDrag}"
    ondragstart="${canDrag ? `agendaDragStart(event,'${a.id}')` : `agendaDragStartBlocked(event,'${a.id}')`}"
    onclick="event.stopPropagation();openApptDetail('${a.id}')"
    onmouseenter="_apptTip(event,'${a.id}')" onmouseleave="_apptTipHide()"
    style="background:${s.bg};border-left:3px solid ${s.color}${['cancelado','no_show'].includes(a.status)?';border-left-style:dashed':''};border-radius:6px;padding:5px 7px;margin-bottom:2px;cursor:${canDrag?'grab':'default'};${cardOpacity}">
    <div style="font-size:11px;font-weight:700;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.pacienteNome||'Paciente'}</div>
    ${a.procedimento ? `<div style="font-size:10px;color:#4B5563;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.procedimento}</div>` : ''}
    ${profNome ? `<div style="font-size:10px;color:#9CA3AF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${profNome}</div>` : ''}
    <span style="display:inline-block;font-size:9px;font-weight:700;color:${s.color};background:rgba(255,255,255,.65);padding:1px 6px;border-radius:10px;margin-top:2px">${s.label||a.status}</span>
  </div>`
}

// ── Drag & Drop com validação ─────────────────────────────────
function agendaDragStart(e, id) {
  _draggedApptId = id
  e.dataTransfer.effectAllowed = 'move'
  e.currentTarget.style.opacity = '0.5'
}

function agendaDragStartBlocked(e, id) {
  e.preventDefault()
  e.stopPropagation()
  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  const SL = window.STATUS_LABELS || {}
  const statusLabel = a ? (SL[a.status] || a.status) : 'desconhecido'
  if (window.showErrorToast) {
    showErrorToast(`Não é possível mover: status "${statusLabel}" está bloqueado.`)
  }
  return false
}

function agendaDragOver(e) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  e.currentTarget.style.background = '#EDE9FE'
}
function agendaDragLeave(e) {
  e.currentTarget.style.background = ''
}
function agendaDrop(e, iso, slot, profIdx) {
  e.preventDefault()
  e.currentTarget.style.background = ''
  if (!_draggedApptId) return
  const appts = getAppointments()
  const a = appts.find(x => x.id === _draggedApptId)
  if (!a) return

  // Calcular nova hora fim mantendo a duração
  const oldStart = a.horaInicio.split(':').map(Number)
  const oldEnd   = a.horaFim.split(':').map(Number)
  const duration = (oldEnd[0]*60+oldEnd[1]) - (oldStart[0]*60+oldStart[1])
  const newFim   = addMinutes(slot, duration)

  // Guardar pendência e mostrar confirmação
  _pendingDrag = { id: a.id, iso, slot, newFim, profIdx, duration,
    oldData: a.data, oldInicio: a.horaInicio, oldFim: a.horaFim, oldProfIdx: a.profissionalIdx }
  _draggedApptId = null
  showDragConfirm(a, iso, slot, newFim, profIdx)
}

function showDragConfirm(a, iso, slot, newFim, profIdx) {
  const m = document.getElementById('agendaDragConfirmModal')
  if (!m) {
    if (_pendingDrag) { _applyDrag(_pendingDrag); _pendingDrag = null }
    return
  }
  const profs = getProfessionals()
  const profNome = profs[profIdx]?.nome || `Prof. ${profIdx}`

  setText('dragConfirmPatient', a.pacienteNome || 'Paciente')
  setText('dragConfirmProc',    a.procedimento || '—')
  setText('dragConfirmFrom',    `${fmtDate(a.data)} ${a.horaInicio}–${a.horaFim}`)
  setText('dragConfirmTo',      `${fmtDate(iso)} ${slot}–${newFim} · ${profNome}`)

  const alert = document.getElementById('dragConflictAlert')
  if (alert) alert.style.display = 'none'

  m.style.display = 'flex'
}

function cancelDragConfirm() {
  _pendingDrag = null
  const m = document.getElementById('agendaDragConfirmModal')
  if (m) m.style.display = 'none'
  refreshCurrentAgenda()
}

function confirmDragReschedule() {
  const m = document.getElementById('agendaDragConfirmModal')
  if (m) m.style.display = 'none'
  if (!_pendingDrag) return
  _applyDrag(_pendingDrag)
  _pendingDrag = null
}

function _applyDrag(pd) {
  const appts = getAppointments()
  const idx   = appts.findIndex(x => x.id === pd.id)
  if (idx < 0) return
  const a = appts[idx]

  // ── Validação via AgendaValidator (camada 1) ──────────────────
  if (window.AgendaValidator) {
    const errs = AgendaValidator.validateDragDrop(a, pd.iso, pd.slot, pd.newFim)
    if (errs.length) {
      if (window.showValidationErrors) showValidationErrors(errs, 'Remarcação não permitida')
      else alert(errs[0])
      refreshCurrentAgenda()
      return
    }
  } else {
    // Fallback: validação de conflito legada
    const provisional = { ...a, data: pd.iso, horaInicio: pd.slot, horaFim: pd.newFim, profissionalIdx: pd.profIdx }
    const { conflict, reason } = checkConflict(provisional, appts)
    if (conflict) {
      alert('Conflito de horário: ' + reason)
      refreshCurrentAgenda()
      return
    }
  }

  // Registrar audit log da remarcação
  if (!appts[idx].historicoAlteracoes) appts[idx].historicoAlteracoes = []
  appts[idx].historicoAlteracoes.push({
    action_type: 'remarcacao_drag',
    old_value:   { data: a.data, horaInicio: a.horaInicio, horaFim: a.horaFim, profissionalIdx: a.profissionalIdx },
    new_value:   { data: pd.iso, horaInicio: pd.slot, horaFim: pd.newFim, profissionalIdx: pd.profIdx },
    changed_by:  'secretaria',
    changed_at:  new Date().toISOString(),
    reason:      'Remarcação por drag & drop',
  })

  // Registrar histórico de status se necessário
  if (!appts[idx].historicoStatus) appts[idx].historicoStatus = []
  appts[idx].historicoStatus.push({
    status: appts[idx].status,
    at:     new Date().toISOString(),
    by:     'drag_drop',
    motivo: `Remarcado de ${a.data} ${a.horaInicio} para ${pd.iso} ${pd.slot}`,
  })

  // Aplicar nova data/hora/profissional
  appts[idx].data          = pd.iso
  appts[idx].horaInicio    = pd.slot
  appts[idx].horaFim       = pd.newFim
  appts[idx].lastRescheduledAt = new Date().toISOString()
  appts[idx].rescheduledCount  = (appts[idx].rescheduledCount || 0) + 1
  if (pd.profIdx !== undefined) appts[idx].profissionalIdx = pd.profIdx

  saveAppointments(appts)

  // Sync Supabase (fire-and-forget)
  if (window.AppointmentsService?.syncOne) {
    AppointmentsService.syncOne(appts[idx])
  }

  // Recalcular automações com os novos dados
  if (window.scheduleAutomations) scheduleAutomations(appts[idx])

  // Aplicar tag de reagendado
  if (window._applyStatusTag && appts[idx].pacienteId) {
    _applyStatusTag(appts[idx], 'reagendado', 'drag_drop')
  }

  // Hook SDR: registrar reagendamento no historico do lead
  if (window.SdrService && appts[idx].pacienteId) {
    SdrService.onLeadScheduled(appts[idx].pacienteId, appts[idx])
  }

  refreshCurrentAgenda()
}

// ── Navegação unificada ───────────────────────────────────────
function setAgendaView(v) {
  _agendaView = v
  renderAgenda()
}

function navAgenda(dir) {
  if (dir === 0) { _agendaDate = new Date(); renderAgenda(); return }
  if (_agendaView === 'mes') {
    _agendaDate.setMonth(_agendaDate.getMonth() + dir)
  } else if (_agendaView === 'semana') {
    _agendaDate.setDate(_agendaDate.getDate() + dir * 7)
  } else {
    _agendaDate.setDate(_agendaDate.getDate() + dir)
  }
  renderAgenda()
}

function refreshCurrentAgenda() {
  const root = document.getElementById('agendaRoot')
  if (root) { renderAgenda(); return }
  // Fallback compatibilidade com IDs antigos
  if (document.getElementById('agendaRoot')?.isConnected) renderAgenda()
}

// ── Style helpers ─────────────────────────────────────────────
function btnOutline() {
  return 'padding:7px 14px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer'
}
function btnPrimary() {
  return 'padding:8px 18px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer'
}

// ── Modal: Nova / Editar consulta ─────────────────────────────
function openApptModal(id, date, time, profIdx) {
  const modal = document.getElementById('apptModal')
  if (!modal) return

  // Preenche profissionais
  const profSel = document.getElementById('appt_prof')
  if (profSel) {
    const profs = getProfessionals()
    profSel.innerHTML = '<option value="">Selecione...</option>' +
      profs.map((p,i) => `<option value="${i}">${p.nome}${p.especialidade?' – '+p.especialidade:''}</option>`).join('')
  }

  // Preenche salas
  const salaSel = document.getElementById('appt_sala')
  if (salaSel) {
    const salas = getRooms()
    salaSel.innerHTML = '<option value="">Selecione...</option>' +
      salas.map((s,i) => { const resp = Array.isArray(s.responsaveis) ? s.responsaveis : (s.responsavel ? [s.responsavel] : []); return `<option value="${i}">${s.nome}${resp.length?' – '+resp.join(', '):''}` + '</option>' }).join('')
  }

  // Preenche procedimentos (datalist)
  const procList = document.getElementById('apptProcList')
  if (procList) {
    const techs = getTechnologies ? getTechnologies() : []
    procList.innerHTML = techs.map(t => `<option value="${t.nome}"/>`).join('')
  }

  const deleteBtn = document.getElementById('apptDeleteBtn')

  if (id) {
    // Editar existente
    const a = getAppointments().find(x => x.id === id)
    if (!a) return
    document.getElementById('apptModalTitle').textContent = 'Editar Consulta'
    document.getElementById('appt_id').value = id
    document.getElementById('appt_paciente_q').value = a.pacienteNome || ''
    document.getElementById('appt_paciente_id').value = a.pacienteId || ''
    document.getElementById('appt_proc').value = a.procedimento || ''
    document.getElementById('appt_data').value = a.data || ''
    document.getElementById('appt_inicio').value = a.horaInicio || ''
    document.getElementById('appt_status').value = a.status || 'agendado'
    document.getElementById('appt_confirmacao').checked = !!a.confirmacaoEnviada
    document.getElementById('appt_consentimento').checked = !!a.consentimentoImagem
    document.getElementById('appt_obs').value = a.obs || ''
    if (profSel && a.profissionalIdx !== undefined) profSel.value = a.profissionalIdx
    if (salaSel && a.salaIdx !== undefined) salaSel.value = a.salaIdx
    // Duração
    const [hs, ms] = a.horaInicio.split(':').map(Number)
    const [he, me] = a.horaFim.split(':').map(Number)
    const dur = (he*60+me) - (hs*60+ms)
    document.getElementById('appt_duracao').value = dur > 0 ? dur : 60
    // Novos campos
    const tipoEl = document.getElementById('appt_tipo'); if(tipoEl) tipoEl.value = a.tipoConsulta || ''
    const origEl = document.getElementById('appt_origem'); if(origEl) origEl.value = a.origem || ''
    const valEl  = document.getElementById('appt_valor'); if(valEl)  valEl.value  = a.valor || ''
    const pagEl  = document.getElementById('appt_forma_pag'); if(pagEl) pagEl.value = a.formaPagamento || ''
    if (a.tipoAvaliacao) {
      const rad = document.querySelector(`input[name="appt_tipo_aval"][value="${a.tipoAvaliacao}"]`)
      if (rad) rad.checked = true
    }
    apptTipoChange()
    if (deleteBtn) deleteBtn.style.display = 'inline-flex'
  } else {
    // Nova
    document.getElementById('apptModalTitle').textContent = 'Nova Consulta'
    document.getElementById('appt_id').value = ''
    document.getElementById('appt_paciente_q').value = ''
    document.getElementById('appt_paciente_id').value = ''
    document.getElementById('appt_proc').value = ''
    document.getElementById('appt_data').value = date || dateToISO(new Date())
    document.getElementById('appt_inicio').value = time || '08:00'
    document.getElementById('appt_status').value = 'agendado'
    document.getElementById('appt_confirmacao').checked = false
    document.getElementById('appt_consentimento').checked = false
    document.getElementById('appt_obs').value = ''
    document.getElementById('appt_duracao').value = 60
    const tipoEl2 = document.getElementById('appt_tipo'); if(tipoEl2) tipoEl2.value = ''
    const origEl2 = document.getElementById('appt_origem'); if(origEl2) origEl2.value = ''
    const valEl2  = document.getElementById('appt_valor'); if(valEl2)  valEl2.value  = ''
    const pagEl2  = document.getElementById('appt_forma_pag'); if(pagEl2) pagEl2.value = ''
    apptTipoChange()
    if (profIdx !== undefined && profSel) profSel.value = profIdx
    if (deleteBtn) deleteBtn.style.display = 'none'
  }

  document.getElementById('apptPatientDrop').style.display = 'none'
  document.getElementById('appt_paciente_warn').style.display = 'none'
  modal.style.display = 'block'
  document.body.style.overflow = 'hidden'
}

function closeApptModal() {
  const m = document.getElementById('apptModal')
  if (m) m.style.display = 'none'
  document.body.style.overflow = ''
}

// Auto-preenche duração ao selecionar procedimento
function apptProcAutofill(procNome) {
  if (!procNome) return
  const techs = typeof getTechnologies === 'function' ? getTechnologies() : []
  const tech = techs.find(t => t.nome === procNome)
  if (tech?.duracao) {
    const dur = parseInt(tech.duracao)
    if (!isNaN(dur) && dur > 0) {
      const el = document.getElementById('appt_duracao')
      if (el) el.value = dur
    }
  }
}

// Mostra/oculta campos de avaliação
function apptTipoChange() {
  const tipo = document.getElementById('appt_tipo')?.value
  const row  = document.getElementById('apptTipoAvalRow')
  if (row) row.style.display = tipo === 'avaliacao' ? '' : 'none'
}

// Busca de pacientes no modal
function apptSearchPatient(q) {
  const drop = document.getElementById('apptPatientDrop')
  const warn = document.getElementById('appt_paciente_warn')
  if (!q.trim()) { drop.style.display = 'none'; warn.style.display = 'none'; return }

  const leads = window.LeadsService
    ? LeadsService.getLocal()
    : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
  const matches = leads.filter(l => (l.nome||l.name||'').toLowerCase().includes(q.toLowerCase())).slice(0,8)

  if (!matches.length) {
    drop.style.display = 'none'
    warn.style.display = 'block'
    return
  }

  warn.style.display = 'none'
  drop.innerHTML = matches.map(l => {
    const nome = l.nome || l.name || 'Paciente'
    return `<div data-select-lead="${l.id||''}" data-select-name="${nome.replace(/"/g,'&quot;')}"
      style="padding:10px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #F3F4F6"
      onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background=''">
      <div style="font-weight:600;color:#111">${nome.replace(/</g,'&lt;')}</div>
      ${l.phone||l.whatsapp?`<div style="font-size:11px;color:#9CA3AF">${(l.phone||l.whatsapp||'').replace(/</g,'&lt;')}</div>`:''}
    </div>`
  }).join('')
  drop.addEventListener('click', function(e) {
    var el = e.target.closest('[data-select-lead]')
    if (el) selectApptPatient(el.dataset.selectLead, el.dataset.selectName)
  })
  drop.style.display = 'block'
}

function selectApptPatient(id, nome) {
  document.getElementById('appt_paciente_q').value = nome
  document.getElementById('appt_paciente_id').value = id
  document.getElementById('apptPatientDrop').style.display = 'none'
  document.getElementById('appt_paciente_warn').style.display = 'none'
}

function saveAppt() {
  const nome = document.getElementById('appt_paciente_q')?.value?.trim()
  if (!nome) { alert('Selecione o paciente'); return }
  const data  = document.getElementById('appt_data')?.value
  const inicio = document.getElementById('appt_inicio')?.value
  if (!data || !inicio) { alert('Informe data e horário'); return }

  const duracao = parseInt(document.getElementById('appt_duracao')?.value || '60')
  const fim     = addMinutes(inicio, duracao)
  const profIdx = parseInt(document.getElementById('appt_prof')?.value ?? '0') || 0
  const salaIdx = parseInt(document.getElementById('appt_sala')?.value ?? '')
  const profs   = getProfessionals()

  const tipoAvalEl = document.querySelector('input[name="appt_tipo_aval"]:checked')
  const apptData = {
    pacienteId:          document.getElementById('appt_paciente_id')?.value || '',
    pacienteNome:        nome,
    pacientePhone:       document.getElementById('appt_paciente_phone')?.value || '',
    profissionalIdx:     profIdx,
    profissionalNome:    profs[profIdx]?.nome || '',
    salaIdx:             isNaN(salaIdx) ? null : salaIdx,
    procedimento:        document.getElementById('appt_proc')?.value?.trim() || '',
    data,
    horaInicio:          inicio,
    horaFim:             fim,
    status:              document.getElementById('appt_status')?.value || 'agendado',
    tipoConsulta:        document.getElementById('appt_tipo')?.value || '',
    tipoAvaliacao:       tipoAvalEl?.value || '',
    origem:              document.getElementById('appt_origem')?.value || '',
    valor:               parseFloat(document.getElementById('appt_valor')?.value || '0') || 0,
    formaPagamento:      document.getElementById('appt_forma_pag')?.value || '',
    statusPagamento:     'pendente',
    confirmacaoEnviada:  document.getElementById('appt_confirmacao')?.checked || false,
    consentimentoImagem: document.getElementById('appt_consentimento')?.checked || false,
    obs:                 document.getElementById('appt_obs')?.value?.trim() || '',
  }

  const appts = getAppointments()
  const editId = document.getElementById('appt_id')?.value

  // ── Validação completa via AgendaValidator (camada 1) ────────────
  if (window.AgendaValidator) {
    const vResult = AgendaValidator.validateSave(apptData, editId || null)
    if (!vResult.ok) {
      showValidationErrors(vResult.errors, editId ? 'Não foi possível editar' : 'Não foi possível agendar')
      return
    }
  } else {
    // Fallback: validação básica legada
    const provisional = { ...apptData, id: editId || '__new__' }
    const { conflict, reason: confReason } = checkConflict(provisional, appts)
    if (conflict) { alert('Conflito de horário: ' + confReason); return }
  }

  // Verificar se edição é permitida
  if (editId && window.AgendaValidator) {
    const existing = appts.find(a => a.id === editId)
    if (existing) {
      const canEdit = AgendaValidator.canEdit(existing)
      if (!canEdit.ok) { showValidationErrors(canEdit.errors, 'Edição não permitida'); return }
    }
  }

  let isNew = false
  let novoId = null

  if (editId) {
    const idx = appts.findIndex(a => a.id === editId)
    if (idx >= 0) {
      const old = { ...appts[idx] }
      appts[idx] = { ...appts[idx], ...apptData }
      // Audit log de edição
      if (!appts[idx].historicoAlteracoes) appts[idx].historicoAlteracoes = []
      appts[idx].historicoAlteracoes.push({
        action_type: 'edicao',
        old_value:   { data: old.data, horaInicio: old.horaInicio, horaFim: old.horaFim, profissionalIdx: old.profissionalIdx, salaIdx: old.salaIdx },
        new_value:   { data: apptData.data, horaInicio: apptData.horaInicio, horaFim: apptData.horaFim, profissionalIdx: apptData.profissionalIdx, salaIdx: apptData.salaIdx },
        changed_by:  'secretaria',
        changed_at:  new Date().toISOString(),
        reason:      'Edição manual',
      })
      // Recalcular automações se data/hora mudou
      if ((old.data !== apptData.data || old.horaInicio !== apptData.horaInicio) && window.scheduleAutomations) {
        scheduleAutomations(appts[idx])
      }
    }
  } else {
    novoId = genApptId()
    appts.push({ id: novoId, createdAt: new Date().toISOString(), historicoAlteracoes: [], ...apptData })
    isNew = true
  }

  saveAppointments(appts)
  closeApptModal()
  refreshCurrentAgenda()

  // ── Sync Supabase (fire-and-forget) ──────────────────────────────
  if (window.AppointmentsService) {
    if (editId) {
      const saved = appts.find(a => a.id === editId)
      if (saved) AppointmentsService.syncOne(saved)
    } else if (novoId) {
      const saved = appts.find(a => a.id === novoId)
      if (saved) AppointmentsService.syncOne(saved)
    }
  }

  // ── Ao criar novo agendamento: iniciar loop fechado ──────────────
  if (isNew) {
    const apptCompleto = { ...apptData, id: novoId, profissionalNome: profs[profIdx]?.nome||'' }
    // 1. Mensagem de boas-vindas
    _enviarMsgAgendamento(apptCompleto)
    // 2. Agendar automações (D-1, dia 08h, 30min, 10min)
    if (window.scheduleAutomations) scheduleAutomations(apptCompleto)
    // 3. Aplicar tag inicial 'agendado' ao paciente
    if (window._applyStatusTag && apptCompleto.pacienteId) {
      _applyStatusTag(apptCompleto, 'agendado', 'criação')
    }
    // 4. Promover lead para 'scheduled' — sai de Todos os Leads → Agendados
    if (apptCompleto.pacienteId) {
      _setLeadStatus(apptCompleto.pacienteId, 'scheduled', ['patient', 'attending'])
    }
  }
}

// ── Atualiza status/phase do lead ────────────────────────────
// Unifica status (legacy localStorage) com phase (SDR canonical).
// skipIf: array de statuses que NAO devem ser rebaixados
var _STATUS_TO_PHASE = { scheduled: 'agendado', patient: 'compareceu', attending: 'em_atendimento' }
function _setLeadStatus(leadId, newStatus, skipIf = []) {
  try {
    var leads = JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
    var idx   = leads.findIndex(function(l) { return l.id === leadId })
    if (idx < 0) return
    if (skipIf.includes(leads[idx].status)) return
    leads[idx].status = newStatus
    store.set('clinicai_leads', leads)
  } catch { /* silencioso */ }
  // Sync with SDR phase system
  var phase = _STATUS_TO_PHASE[newStatus]
  if (phase && window.SdrService) {
    SdrService.changePhase(leadId, phase, 'status-sync').catch(function(e) { console.warn("[api]", e.message || e) })
  }
}

// ── Mensagem automática ao criar agendamento ──────────────────
function _enviarMsgAgendamento(appt) {
  // Busca telefone: 1) do appt, 2) do lead no localStorage
  let telefone = appt.pacientePhone || ''
  if (!telefone) {
    try {
      const leads = window.LeadsService ? LeadsService.getLocal() : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
      const lead = leads.find(function(l) {
        return l.id === appt.pacienteId
          || (l.nome || l.name || '').toLowerCase() === (appt.pacienteNome || '').toLowerCase()
      })
      if (lead) telefone = lead.phone || lead.whatsapp || lead.telefone || ''
    } catch(e) { console.warn('[Agenda] busca lead falhou:', e) }
  }

  const clinica   = _getClinicaNome()
  const nomeEnx   = _nomeEnxuto(appt.pacienteNome || 'Paciente')
  const dataFmt   = _fmtDataPtBr(appt.data)
  const linkAnam  = _gerarLinkAnamnese(appt.id, appt.pacienteId)
  const profNome  = appt.profissionalNome || ''
  const proc      = appt.procedimento || ''

  const mensagem  = _tplMsgAgendamento({
    nome:       nomeEnx,
    clinica,
    data:       dataFmt,
    hora:       appt.horaInicio,
    procedimento: proc,
    profissional: profNome,
    link_anamnese: linkAnam,
    telefone
  })

  // Enviar via wa_outbox (real, nao simulado)
  if (telefone && window._sbShared) {
    window._sbShared.rpc('wa_outbox_enqueue_appt', {
      p_phone: telefone,
      p_content: mensagem,
      p_lead_name: nomeEnx
    }).then(function(res) {
      if (res.error) console.error('[Agenda] wa_outbox_enqueue falhou:', res.error.message)
      else _showToast('WhatsApp enviado', 'Confirmacao para ' + nomeEnx, 'info')
    }).catch(function(e) { console.error('[Agenda] wa_outbox_enqueue exception:', e) })
  } else if (!telefone) {
    console.error('[Agenda] SEM TELEFONE para', nomeEnx, '| pacienteId:', appt.pacienteId)
    _showToast('Sem telefone', nomeEnx + ' nao tem WhatsApp cadastrado', 'warning')
  } else if (!window._sbShared) {
    console.error('[Agenda] Supabase nao disponivel para envio WhatsApp')
  }
}

function _tplMsgAgendamento({ nome, clinica, data, hora, procedimento, profissional, link_anamnese }) {
  const linhaProc  = procedimento  ? `\n💆‍♀️ *Procedimento:* ${procedimento}` : ''
  const linhaProf  = profissional  ? `\n👩‍⚕️ *Profissional:* ${profissional}` : ''

  return `Olá, *${nome}*! 🌸

Seu agendamento na *${clinica}* foi confirmado com sucesso! ✅
${linhaProc}${linhaProf}
📅 *Data:* ${data}
🕐 *Horário:* ${hora}

Para garantirmos o melhor atendimento personalizado, pedimos que preencha sua *Ficha de Anamnese* antes da consulta:

👉 ${link_anamnese}

O preenchimento é rápido (≈5 min) e nos ajuda a entender melhor o seu histórico e objetivos. 😊

Qualquer dúvida estamos à disposição!
*Equipe ${clinica}* 💜`
}

function _fmtDataPtBr(isoDate) {
  if (!isoDate) return '—'
  try {
    const [y, m, d] = isoDate.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    const diasSem = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']
    const meses   = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
    return `${diasSem[dt.getDay()]}, ${d} de ${meses[m-1]} de ${y}`
  } catch { return isoDate }
}

function _gerarLinkAnamnese(apptId, pacienteId) {
  // Gera link mock de anamnese — em produção apontaria para formulário real
  const base = window.location.origin || 'http://localhost:3002'
  const token = btoa(`${apptId}|${pacienteId || ''}|${Date.now()}`).replace(/=/g,'')
  return `${base}/anamnese?t=${token}`
}

// ── Preview do WhatsApp (painel slide-in) ─────────────────────
function _mostrarPreviewWpp(nome, telefone, mensagem, apptId) {
  document.getElementById('wppPreviewPanel')?.remove()

  const _digits = telefone ? telefone.replace(/\D/g,'') : ''
  const _waNum = _digits.startsWith('55') ? _digits : '55' + _digits
  const fmtTel = telefone
    ? `<a href="https://wa.me/${_waNum}?text=${encodeURIComponent(mensagem)}"
         target="_blank"
         style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#25D366;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;text-decoration:none">
         <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
         Abrir no WhatsApp
       </a>`
    : `<div style="font-size:12px;color:#EF4444;padding:8px 12px;background:#FEF2F2;border-radius:8px">⚠ Nenhum telefone cadastrado para este paciente</div>`

  // Converte markdown (*bold*) para exibição
  const msgHtml = mensagem
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')

  const panel = document.createElement('div')
  panel.id = 'wppPreviewPanel'
  panel.style.cssText = `
    position:fixed;right:0;top:0;bottom:0;width:400px;max-width:95vw;z-index:9500;
    background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.15);
    display:flex;flex-direction:column;animation:slideInRight .3s ease
  `
  panel.innerHTML = `
    <div style="padding:16px 20px;background:#075E54;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div style="display:flex;align-items:center;gap:10px">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
        <div>
          <div style="font-size:14px;font-weight:700">Mensagem de Agendamento</div>
          <div style="font-size:11px;opacity:.8">Para: ${nome}${telefone ? ' · ' + telefone : ''}</div>
        </div>
      </div>
      <button onclick="document.getElementById('wppPreviewPanel').remove()"
        style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:0;line-height:1">&times;</button>
    </div>

    <!-- Bolha de mensagem estilo WhatsApp -->
    <div style="flex:1;overflow-y:auto;padding:20px;background:#ECE5DD">
      <div style="max-width:88%;margin-left:auto">
        <div style="background:#DCF8C6;border-radius:12px 2px 12px 12px;padding:12px 14px;font-size:13px;color:#111;line-height:1.6;box-shadow:0 1px 2px rgba(0,0,0,.13)">
          ${msgHtml}
        </div>
        <div style="font-size:10px;color:#9CA3AF;text-align:right;margin-top:4px">
          ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} ✓✓
        </div>
      </div>
    </div>

    <!-- Ações -->
    <div style="padding:16px 20px;border-top:1px solid #F3F4F6;background:#fff;flex-shrink:0">
      <div style="margin-bottom:12px">${fmtTel}</div>
      <button onclick="_copiarMsgWpp('${apptId}')"
        style="width:100%;padding:9px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:#374151">
        📋 Copiar mensagem
      </button>
    </div>
  `
  document.body.appendChild(panel)

  // Garante a animação CSS
  const style = document.getElementById('wppSlideStyle')
  if (!style) {
    const s = document.createElement('style')
    s.id = 'wppSlideStyle'
    s.textContent = '@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}'
    document.head.appendChild(s)
  }
}

function _copiarMsgWpp(apptId) {
  const fila = store.get('clinic_wpp_fila', [])
  const item = [...fila].reverse().find(i => i.appt_id === apptId && i.tipo === 'agendamento_boas_vindas')
  if (!item) return
  navigator.clipboard?.writeText(item.mensagem).then(() => {
    _showToast('Copiado!', 'Mensagem copiada para a área de transferência', 'success')
  }).catch(() => {
    _showToast('Erro', 'Não foi possível copiar automaticamente', 'error')
  })
}

function deleteAppt() {
  const id = document.getElementById('appt_id')?.value
  if (!id) return
  if (!confirm('Excluir esta consulta?')) return
  const appts = getAppointments().filter(a => a.id !== id)
  saveAppointments(appts)
  closeApptModal()
  refreshCurrentAgenda()
  // Soft delete no Supabase (fire-and-forget)
  window.AppointmentsService?.softDelete(id)
}

function openApptDetail(id) {
  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return

  // Inicializar campos de documentos se ausentes
  let changed = false
  if (a.anamneseRespondida === undefined) { a.anamneseRespondida = false; changed = true }
  if (!a.consentimentoImagem) { a.consentimentoImagem = 'pendente'; changed = true }
  if (!a.consentimentoProcedimento) { a.consentimentoProcedimento = 'pendente'; changed = true }
  if (changed) saveAppointments(appts)

  const s = APPT_STATUS_CFG[a.status] || APPT_STATUS_CFG.agendado
  const profs = getProfessionals()
  const profNome = a.profissionalNome || profs[a.profissionalIdx]?.nome || '—'

  const docBool = (val, trueLabel, falseLabel) => val
    ? `<span style="color:#059669;font-size:11px;font-weight:700">&#10003; ${trueLabel}</span>`
    : `<span style="color:#D97706;font-size:11px;font-weight:700">&#9711; ${falseLabel}</span>`

  const consentBadge = (val) => {
    if (val === 'assinado') return `<span style="color:#059669;font-size:11px;font-weight:700">&#10003; Assinado</span>`
    if (val === 'recusado') return `<span style="color:#DC2626;font-size:11px;font-weight:700">&#10007; Recusado</span>`
    return `<span style="color:#D97706;font-size:11px;font-weight:700">&#9711; Pendente</span>`
  }

  const canFinish = ['agendado','confirmado','em_atendimento'].includes(a.status)

  const existing = document.getElementById('apptDetailDlg')
  if (existing) existing.remove()

  const dlg = document.createElement('div')
  dlg.id = 'apptDetailDlg'
  dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9998'
  dlg.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:92%;max-width:500px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #E5E7EB">
        <div>
          <div style="font-size:17px;font-weight:800;color:#111827">${a.pacienteNome||'Paciente'}</div>
          <div style="font-size:12px;color:#6B7280;margin-top:2px">${fmtDate(a.data)} &nbsp;${a.horaInicio}–${a.horaFim}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <span style="font-size:10px;font-weight:700;color:${s.color};background:${s.bg};padding:4px 10px;border-radius:20px">${s.label||a.status}</span>
          <button onclick="document.getElementById('apptDetailDlg').remove()"
            style="width:30px;height:30px;border-radius:50%;border:none;background:#F3F4F6;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:#6B7280">&times;</button>
        </div>
      </div>

      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:14px">

        <!-- Dados principais -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Procedimento</div>
            <div style="font-size:13px;font-weight:600;color:#111827">${a.procedimento||'—'}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Profissional</div>
            <div style="font-size:13px;font-weight:600;color:#111827">${profNome}</div>
          </div>
        </div>

        <!-- Documentos e Consentimentos -->
        <div style="background:#F9FAFB;border-radius:10px;padding:14px">
          <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Documentos &amp; Consentimentos</div>
          <div style="display:flex;flex-direction:column;gap:9px">

            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-size:12px;color:#374151;flex:1">Ficha de Anamnese</span>
              <div style="display:flex;align-items:center;gap:6px">
                ${docBool(a.anamneseRespondida,'Respondida','Pendente')}
                <button onclick="_toggleAnamnese('${id}')"
                  style="font-size:10px;padding:3px 8px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer;color:#6B7280">
                  ${a.anamneseRespondida ? 'Desfazer' : 'Marcar'}
                </button>
              </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-size:12px;color:#374151;flex:1">Consentimento de Imagem</span>
              <div style="display:flex;align-items:center;gap:6px">
                ${consentBadge(a.consentimentoImagem)}
                <select onchange="_setConsent('${id}','imagem',this.value)"
                  style="font-size:10px;padding:3px 5px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer">
                  <option value="pendente" ${a.consentimentoImagem==='pendente'?'selected':''}>Pendente</option>
                  <option value="assinado" ${a.consentimentoImagem==='assinado'?'selected':''}>Assinado</option>
                  <option value="recusado" ${a.consentimentoImagem==='recusado'?'selected':''}>Recusado</option>
                </select>
              </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-size:12px;color:#374151;flex:1">Consentimento do Procedimento</span>
              <div style="display:flex;align-items:center;gap:6px">
                ${consentBadge(a.consentimentoProcedimento)}
                <select onchange="_setConsent('${id}','procedimento',this.value)"
                  style="font-size:10px;padding:3px 5px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer">
                  <option value="pendente" ${a.consentimentoProcedimento==='pendente'?'selected':''}>Pendente</option>
                  <option value="assinado" ${a.consentimentoProcedimento==='assinado'?'selected':''}>Assinado</option>
                </select>
              </div>
            </div>

          </div>
        </div>

        <!-- Ações -->
        <div style="display:flex;gap:8px">
          ${canFinish ? `<button onclick="document.getElementById('apptDetailDlg').remove();openFinalizarModal('${id}')"
            style="flex:2;padding:11px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:13px">Finalizar Atendimento</button>` : ''}
          <button onclick="document.getElementById('apptDetailDlg').remove();openApptModal('${id}')"
            style="flex:1;padding:11px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px">Editar</button>
        </div>

      </div>
    </div>`

  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.remove() })
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { dlg.remove(); document.removeEventListener('keydown', esc) }
  })
  document.body.appendChild(dlg)
}

function _toggleAnamnese(id) {
  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return
  a.anamneseRespondida = !a.anamneseRespondida
  saveAppointments(appts)
  openApptDetail(id)
}

function _setConsent(id, type, val) {
  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return
  if (type === 'imagem') a.consentimentoImagem = val
  if (type === 'procedimento') a.consentimentoProcedimento = val
  saveAppointments(appts)
}

// ── Finalizar consulta ─────────────────────────────────────────
function quickFinish(id) {
  openFinalizarModal(id)
}

// ── Modal: Finalizar Atendimento ───────────────────────────────
function openFinalizarModal(id) {
  const a = getAppointments().find(x => x.id === id)
  if (!a) return

  const existing = document.getElementById('finalizarModalDlg')
  if (existing) existing.remove()

  const dlg = document.createElement('div')
  dlg.id = 'finalizarModalDlg'
  dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:10000'
  dlg.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:92%;max-width:480px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.28)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #E5E7EB">
        <div style="font-size:16px;font-weight:800;color:#111827">Finalizar Atendimento</div>
        <button onclick="_skipFinalizar('${id}');document.getElementById('finalizarModalDlg').remove()"
          style="width:30px;height:30px;border-radius:50%;border:none;background:#F3F4F6;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:#6B7280">&times;</button>
      </div>

      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px">

        <!-- Resumo do paciente -->
        <div style="background:#F5F3FF;border-radius:10px;padding:12px 14px">
          <div style="font-size:14px;font-weight:700;color:#7C3AED">${a.pacienteNome||'Paciente'}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px">${fmtDate(a.data)} ${a.horaInicio} &mdash; ${a.procedimento||'—'}</div>
        </div>

        <!-- Banner VPI -->
        <div style="background:linear-gradient(135deg,#ECFDF5,#D1FAE5);border:1.5px solid #6EE7B7;border-radius:10px;padding:12px 14px;display:flex;align-items:flex-start;gap:10px">
          <svg width="18" height="18" fill="none" stroke="#059669" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <div>
            <div style="font-size:12px;font-weight:700;color:#065F46">Programa de Parceiros VPI</div>
            <div style="font-size:11px;color:#047857;margin-top:2px">Ao finalizar, <strong>${a.pacienteNome||'este paciente'}</strong> será automaticamente inscrito e receberá um convite via WhatsApp em 7 dias.</div>
          </div>
        </div>

        <!-- Procedimentos realizados -->
        <div>
          <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px">
            Procedimentos Realizados <span style="color:#DC2626">*</span>
          </label>
          <textarea id="finalizar_proc" rows="3" placeholder="Descreva os procedimentos realizados..."
            style="width:100%;padding:10px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box">${a.procedimentosRealizados||a.procedimento||''}</textarea>
        </div>

        <!-- Valor total -->
        <div>
          <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px">
            Valor Total <span style="color:#DC2626">*</span>
          </label>
          <input id="finalizar_valor" type="number" min="0" step="0.01" placeholder="R$ 0,00"
            value="${a.valorCobrado||''}"
            style="width:100%;padding:10px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;box-sizing:border-box"/>
        </div>

        <!-- Orçamento / Indicação -->
        <div style="background:#F9FAFB;border-radius:10px;padding:14px">
          <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Orçamento Realizado (Indicação)</div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px">
            <div>
              <label style="font-size:11px;color:#6B7280;display:block;margin-bottom:4px">Indicação para</label>
              <input id="finalizar_indicacao" type="text" placeholder="Ex: Botox, Harmonização..."
                value="${a.orcamentoIndicacao||''}"
                style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;box-sizing:border-box"/>
            </div>
            <div>
              <label style="font-size:11px;color:#6B7280;display:block;margin-bottom:4px">Valor</label>
              <input id="finalizar_ind_valor" type="number" min="0" step="0.01" placeholder="R$ 0,00"
                value="${a.orcamentoValor||''}"
                style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;box-sizing:border-box"/>
            </div>
          </div>
        </div>

        <!-- Mensagem de erro -->
        <div id="finalizar_erro" style="display:none;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:10px 12px;font-size:12px;color:#DC2626;font-weight:600"></div>

        <!-- Ações -->
        <div style="display:flex;gap:8px;padding-top:2px">
          <button onclick="_skipFinalizar('${id}');document.getElementById('finalizarModalDlg').remove()"
            style="flex:1;padding:11px;background:#F3F4F6;color:#6B7280;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600">Pular (criar alerta)</button>
          <button onclick="_confirmFinalizar('${id}')"
            style="flex:2;padding:11px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:13px">Confirmar e Finalizar</button>
        </div>

      </div>
    </div>`

  dlg.addEventListener('click', e => {
    if (e.target === dlg) { _skipFinalizar(id); dlg.remove() }
  })
  document.body.appendChild(dlg)
}

function _confirmFinalizar(id) {
  const proc  = document.getElementById('finalizar_proc')?.value?.trim()
  const valor = parseFloat(document.getElementById('finalizar_valor')?.value || '')
  const errEl = document.getElementById('finalizar_erro')

  if (!proc) {
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Informe os procedimentos realizados.' }
    return
  }
  if (!valor || valor <= 0) {
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Informe o valor total do atendimento.' }
    return
  }

  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return

  a.status = 'finalizado'
  a.procedimentosRealizados = proc
  a.valorCobrado = valor
  a.orcamentoIndicacao = document.getElementById('finalizar_indicacao')?.value?.trim() || ''
  a.orcamentoValor = parseFloat(document.getElementById('finalizar_ind_valor')?.value || '') || 0
  a.pendente_finalizar = false
  saveAppointments(appts)

  // Promover lead para 'patient' — aparece em Pacientes
  if (a.pacienteId) _setLeadStatus(a.pacienteId, 'patient')

  const dlg = document.getElementById('finalizarModalDlg')
  if (dlg) dlg.remove()
  refreshCurrentAgenda()
  _renderNotificationBell()

  // ── VPI: auto-inscrição no Programa de Parceiros ──────────
  if (typeof vpiAutoEnroll === 'function') {
    vpiAutoEnroll(a)
  }
}

function _skipFinalizar(id) {
  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return
  a.pendente_finalizar = true
  saveAppointments(appts)
  _renderNotificationBell()
  _showToast(
    'Alerta criado',
    `Finalização de "${a.pacienteNome||'Paciente'}" pendente`,
    'warning'
  )
}

// ── Toast de notificação ───────────────────────────────────────
function _showToast(title, subtitle, type) {
  type = type || 'info'
  const icons = {
    success: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
    warning: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    error:   `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  }

  const toast = document.createElement('div')
  toast.className = `clinic-toast toast-${type}`
  toast.innerHTML = `
    <span class="clinic-toast-icon">${icons[type]||icons.info}</span>
    <div class="clinic-toast-body">
      <div class="clinic-toast-title">${title}</div>
      ${subtitle ? `<div class="clinic-toast-sub">${subtitle}</div>` : ''}
    </div>
    <button class="clinic-toast-close" onclick="_dismissToast(this.closest('.clinic-toast'))">&times;</button>`
  document.body.appendChild(toast)

  // Auto-remover após 5 s
  const timer = setTimeout(() => _dismissToast(toast), 5000)
  toast._timer = timer
}

function _dismissToast(el) {
  if (!el || !document.body.contains(el)) return
  clearTimeout(el._timer)
  el.classList.add('hiding')
  setTimeout(() => el.remove(), 300)
}

// ── Sino de notificação ────────────────────────────────────────
function _renderNotificationBell() {
  const appts      = getAppointments()
  const pending    = appts.filter(a => a.pendente_finalizar && a.status !== 'finalizado')
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
    btn?.appendChild(badge)
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
  menu.querySelectorAll('.notif-finalizar-alert,.notif-reg-alert').forEach(el => el.remove())

  // Cadastros pendentes de aprovação
  pendingReg.forEach(u => {
    const item = document.createElement('div')
    item.className = 'notif-item notif-unread notif-reg-alert'
    item.innerHTML = `
      <div class="notif-icon" style="background:#FEF3C7;color:#D97706;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i data-feather="user-plus" style="width:15px;height:15px"></i>
      </div>
      <div class="notif-content" style="flex:1;min-width:0">
        <p class="notif-title" style="margin:0;font-size:12px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Cadastro: ${u.name}</p>
        <p class="notif-desc" style="margin:2px 0 0;font-size:11px;color:#6B7280">${u.email} · ${u.role || '—'}</p>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button onclick="event.stopPropagation();aprovarUsuario('${u.id}')"
            style="padding:3px 10px;background:#10B981;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">
            ✓ Aprovar
          </button>
          <button onclick="event.stopPropagation();rejeitarUsuario('${u.id}')"
            style="padding:3px 10px;background:#EF4444;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">
            ✗ Rejeitar
          </button>
        </div>
      </div>`
    const header = menu.querySelector('.dropdown-header')
    if (header) header.after(item)
    else menu.prepend(item)
  })

  // Finalizações pendentes
  pending.forEach(a => {
    const item = document.createElement('div')
    item.className = 'notif-item notif-unread notif-finalizar-alert'
    item.style.cursor = 'pointer'
    item.innerHTML = `
      <div class="notif-icon notif-icon-danger"><i data-feather="alert-circle"></i></div>
      <div class="notif-content">
        <p class="notif-title">Finalizar: ${a.pacienteNome||'Paciente'}</p>
        <p class="notif-desc">${fmtDate(a.data)} ${a.horaInicio} &mdash; ${a.procedimento||'Sem procedimento'}</p>
        <p class="notif-time">Atendimento pendente de finalização</p>
      </div>`
    item.addEventListener('click', () => {
      menu.classList.remove('show')
      openFinalizarModal(a.id)
    })
    const header = menu.querySelector('.dropdown-header')
    if (header) header.after(item)
    else menu.prepend(item)
  })

  featherIn(wrapper)

  // Re-anima o sino com feather substituído (feather cria novo svg)
  setTimeout(() => {
    const svg = wrapper.querySelector('svg')
    if (svg) {
      if (pending.length > 0) svg.classList.add('bell-ringing')
      else                     svg.classList.remove('bell-ringing')
    }
  }, 50)
}

// ── Modal: Fechar o Dia ────────────────────────────────────────
function abrirFecharDia() {
  const appts   = getAppointments()
  const pending = appts.filter(a => a.pendente_finalizar && a.status !== 'finalizado')

  if (pending.length === 0) {
    _showToast('Dia encerrado', 'Todos os atendimentos foram finalizados.', 'success')
    return
  }

  const existing = document.getElementById('fecharDiaDlg')
  if (existing) existing.remove()

  const items = pending.map(a => `
    <div class="fd-alert-item" onclick="document.getElementById('fecharDiaDlg').remove();openFinalizarModal('${a.id}')">
      <div class="fd-alert-dot"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#111827">${a.pacienteNome||'Paciente'}</div>
        <div style="font-size:11px;color:#6B7280">${fmtDate(a.data)} ${a.horaInicio} &mdash; ${a.procedimento||'—'}</div>
      </div>
      <span style="font-size:10px;color:#DC2626;font-weight:700;flex-shrink:0">Finalizar ›</span>
    </div>`).join('')

  const dlg = document.createElement('div')
  dlg.id = 'fecharDiaDlg'
  dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10001'
  dlg.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:92%;max-width:460px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="padding:20px 22px;border-bottom:1px solid #E5E7EB">
        <div style="font-size:18px;font-weight:800;color:#DC2626">&#9888; Fechar o Dia</div>
        <div style="font-size:13px;color:#6B7280;margin-top:4px">Existem <strong>${pending.length}</strong> atendimento${pending.length!==1?'s':''} sem finalização. Registre antes de encerrar o dia.</div>
      </div>
      <div style="padding:18px 22px">
        ${items}
        <div style="display:flex;gap:8px;margin-top:16px">
          <button onclick="document.getElementById('fecharDiaDlg').remove()"
            style="flex:1;padding:11px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px">Fechar e Resolver Depois</button>
        </div>
        <p style="font-size:11px;color:#9CA3AF;text-align:center;margin-top:10px">Os alertas permanecem no sino até serem resolvidos.</p>
      </div>
    </div>`
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.remove() })
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { dlg.remove(); document.removeEventListener('keydown', esc) }
  })
  document.body.appendChild(dlg)
}

// ── Lembrete periódico (a cada 20 min se houver alertas) ──────
setInterval(() => {
  const pending = getAppointments().filter(a => a.pendente_finalizar && a.status !== 'finalizado')
  if (pending.length > 0) {
    _showToast(
      `${pending.length} atendimento${pending.length!==1?'s':''} pendente${pending.length!==1?'s':''}`,
      'Clique no sino para finalizar antes de encerrar o dia.',
      'warning'
    )
  }
}, 20 * 60 * 1000)

// ── Bloqueio ao fechar o navegador com alertas pendentes ──────
window.addEventListener('beforeunload', e => {
  const pending = getAppointments().filter(a => a.pendente_finalizar && a.status !== 'finalizado')
  if (pending.length > 0) {
    const msg = `Você tem ${pending.length} atendimento(s) sem finalização registrada. Deseja realmente sair?`
    e.preventDefault()
    e.returnValue = msg
    return msg
  }
})

// ── Dedução de estoque ao finalizar consulta ──────────────────
// Tenta encontrar o injetável pelo nome do produto e decrementa
// estoque em 1 unidade. Salva via store.set → Supabase automático.
// Silencioso: se não encontrar o produto, ignora sem erro.
function _deductStock(produtos) {
  if (!produtos?.length) return
  try {
    const INJ_KEY = 'clinic_injetaveis'
    const injs = JSON.parse(localStorage.getItem(INJ_KEY) || '[]')
    if (!injs.length) return
    let changed = false
    for (const prod of produtos) {
      const nome = (prod.nome || '').toLowerCase().trim()
      if (!nome) continue
      const idx = injs.findIndex(inj => (inj.nome || '').toLowerCase().trim() === nome)
      if (idx >= 0 && typeof injs[idx].estoque === 'number' && injs[idx].estoque > 0) {
        injs[idx].estoque -= 1
        injs[idx].updated_at = new Date().toISOString()
        changed = true
      }
    }
    if (changed) store.set(INJ_KEY, injs)
  } catch { /* silencioso */ }
}

// ── Modal: Finalizar Consulta ─────────────────────────────────
function openFinishModal(id) {
  const a = getAppointments().find(x => x.id === id)
  if (!a) return

  document.getElementById('finish_appt_id').value = id
  _finishProducts = JSON.parse(JSON.stringify(a.produtos || []))

  // Resumo
  const sum = document.getElementById('finishSummary')
  if (sum) sum.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px">
      <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Paciente</span><br/><strong>${a.pacienteNome}</strong></div>
      <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Procedimento</span><br/><strong>${a.procedimento||'—'}</strong></div>
      <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Data</span><br/><strong>${fmtDate(a.data)} ${a.horaInicio}–${a.horaFim}</strong></div>
      <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Profissional</span><br/><strong>${a.profissionalNome||'—'}</strong></div>
    </div>
  `

  // Valor pago anterior
  const valInput = document.getElementById('finish_valor')
  if (valInput) valInput.value = a.valorCobrado || ''

  // WhatsApp badge
  const badge = document.getElementById('whatsappConfirmBadge')
  if (badge) badge.style.display = a.whatsappFinanceiroEnviado ? 'block' : 'none'

  // Produtos datalist
  const techs = typeof getTechnologies === 'function' ? getTechnologies() : []
  const prodList = document.getElementById('finishProdList')
  if (prodList) prodList.innerHTML = techs.map(t => `<option value="${t.nome}"/>`).join('')

  renderFinishProducts()
  recalcProfit()

  document.getElementById('apptFinishModal').style.display = 'block'
  document.body.style.overflow = 'hidden'
}

function closeFinishModal() {
  const m = document.getElementById('apptFinishModal')
  if (m) m.style.display = 'none'
  document.body.style.overflow = ''
}

function simWhatsappConfirm() {
  const btn = document.querySelector('#apptFinishModal button[onclick="simWhatsappConfirm()"]')
  if (btn) { btn.textContent = '⏳ Enviando...'; btn.disabled = true }
  setTimeout(() => {
    if (btn) { btn.textContent = '✓ Enviado!'; btn.style.background = '#059669' }
    document.getElementById('whatsappConfirmBadge').style.display = 'block'
  }, 1200)
}

function addFinishProduct() {
  const nome  = document.getElementById('finish_prod_nome')?.value?.trim()
  const custo = parseFloat(document.getElementById('finish_prod_custo')?.value || '0')
  if (!nome) return
  _finishProducts.push({ nome, custo: isNaN(custo) ? 0 : custo })
  document.getElementById('finish_prod_nome').value  = ''
  document.getElementById('finish_prod_custo').value = ''
  renderFinishProducts()
  recalcProfit()
}

function removeFinishProduct(i) {
  _finishProducts.splice(i, 1)
  renderFinishProducts()
  recalcProfit()
}

function renderFinishProducts() {
  const list = document.getElementById('finishProductsList')
  if (!list) return
  if (!_finishProducts.length) {
    list.innerHTML = '<div style="font-size:12px;color:#9CA3AF;padding:6px 0">Nenhum produto adicionado</div>'
    return
  }
  list.innerHTML = _finishProducts.map((p,i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:#F9FAFB;border-radius:7px;padding:7px 10px">
      <span style="font-size:13px;color:#374151">${p.nome}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:600;color:#EF4444">${fmtBRL(p.custo)}</span>
        <button onclick="removeFinishProduct(${i})" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:13px;padding:0">✕</button>
      </div>
    </div>
  `).join('')
}

function recalcProfit() {
  const receita = parseFloat(document.getElementById('finish_valor')?.value || '0') || 0
  const custos  = _finishProducts.reduce((s,p) => s + (p.custo || 0), 0)
  const lucro   = receita - custos

  setText('res_receita', fmtBRL(receita))
  setText('res_custos',  fmtBRL(custos))
  const lucroEl = document.getElementById('res_lucro')
  if (lucroEl) {
    lucroEl.textContent = fmtBRL(lucro)
    lucroEl.style.color = lucro >= 0 ? '#10B981' : '#EF4444'
  }
}

function confirmFinishAppt() {
  const id = document.getElementById('finish_appt_id')?.value
  if (!id) return

  const receita = parseFloat(document.getElementById('finish_valor')?.value || '0') || 0
  const custos  = _finishProducts.reduce((s,p) => s + (p.custo || 0), 0)

  const appts = getAppointments()
  const a = appts.find(x => x.id === id)
  if (!a) return

  a.status = 'finalizado'
  a.valorCobrado = receita
  a.produtos     = [..._finishProducts]
  a.custoTotal   = custos
  a.lucro        = receita - custos
  a.whatsappFinanceiroEnviado = document.getElementById('whatsappConfirmBadge')?.style.display !== 'none'

  saveAppointments(appts)
  // Sync Supabase (fire-and-forget)
  window.AppointmentsService?.syncOne(a)

  // Deduz estoque dos injetáveis usados nos produtos
  _deductStock(_finishProducts)

  closeFinishModal()
  refreshCurrentAgenda()

  // Toast de sucesso
  const toast = document.createElement('div')
  toast.style.cssText = 'position:fixed;bottom:28px;right:28px;background:#10B981;color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.15)'
  toast.textContent = `✓ Consulta finalizada · Lucro: ${fmtBRL(a.lucro)}`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 3500)
}


// ── Internals expostos para extração modular ─────────────────────────────────
// Estes helpers são usados por agenda-modal.js, agenda-finalize.js e agenda-notifications.js.
// Não fazem parte da API pública documentada — são infra interna.
window._apptGetAll          = getAppointments
window._apptSaveAll         = saveAppointments
window._apptGenId           = genApptId
window._apptAddMinutes      = addMinutes
window._apptFmtDate         = fmtDate
window._apptFmtBRL          = fmtBRL
window._apptRefresh         = refreshCurrentAgenda
window._apptStatusCfg       = APPT_STATUS_CFG
window._apptCheckConflict   = checkConflict
window._apptSetLeadStatus   = _setLeadStatus
window._apptEnviarMsg       = _enviarMsgAgendamento
window._apptFinishProducts  = function(v) { if (v !== undefined) _finishProducts = v; return _finishProducts }
window._apptDeductStock     = _deductStock

// Expor globais
window.marcarCompareceu     = marcarCompareceu
window._nomeEnxuto          = _nomeEnxuto
window._copiarMsgWpp        = _copiarMsgWpp
window.renderAgenda         = renderAgenda
window.setAgendaView        = setAgendaView
window.navAgenda            = navAgenda
window._apptTip             = _apptTip
window._apptTipHide         = _apptTipHide
window._mesHoverShow        = _mesHoverShow
window._mesHoverHide        = _mesHoverHide
window.openApptModal        = openApptModal
window.closeApptModal       = closeApptModal
window.saveAppt             = saveAppt
window.deleteAppt           = deleteAppt
window.openApptDetail       = openApptDetail
window.apptSearchPatient    = apptSearchPatient
window.apptProcAutofill     = apptProcAutofill
window.selectApptPatient    = selectApptPatient
window.agendaDragStart      = agendaDragStart
window.agendaDragOver       = agendaDragOver
window.agendaDragLeave      = agendaDragLeave
window.agendaDrop           = agendaDrop
window.showDragConfirm      = showDragConfirm
window.cancelDragConfirm    = cancelDragConfirm
window.confirmDragReschedule = confirmDragReschedule
window.quickFinish          = quickFinish
window.openFinishModal      = openFinishModal
window.closeFinishModal     = closeFinishModal
window.simWhatsappConfirm   = simWhatsappConfirm
window.addFinishProduct     = addFinishProduct
window.removeFinishProduct  = removeFinishProduct
window.recalcProfit         = recalcProfit
window.confirmFinishAppt    = confirmFinishAppt
window.openFinalizarModal   = openFinalizarModal
window._confirmFinalizar    = _confirmFinalizar
window._skipFinalizar       = _skipFinalizar
window._toggleAnamnese      = _toggleAnamnese
window._setConsent          = _setConsent
window.agendaMesModal       = agendaMesModal
window.abrirFecharDia       = abrirFecharDia
window._showToast           = _showToast
window._dismissToast        = _dismissToast
// showRegisterModal → definida em auth.js (redireciona para login.html)

// ─── Inicialização ────────────────────────────────────────────
// Usa evento 'clinicai:auth-success' — nunca chamar loadDashboardData() diretamente.
// Isso garante que dashboard.js seja o único dono da sua inicialização.
// ── Migração de status: recalcula status dos leads com base nos agendamentos
// Garante consistência para leads cadastrados antes desta lógica existir.
// Roda uma vez no boot, silenciosamente.
function _migrateLeadStatuses() {
  try {
    const leads = JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
    if (!leads.length) return
    const appts = JSON.parse(localStorage.getItem('clinicai_appointments') || '[]')

    // Mapa: patientId → statuses dos agendamentos
    const apptMap = {}
    for (const a of appts) {
      const pid = a.pacienteId || ''
      if (!pid) continue
      if (!apptMap[pid]) apptMap[pid] = []
      apptMap[pid].push(a.status)
    }

    let changed = 0
    for (const lead of leads) {
      // Não rebaixa quem já foi promovido manualmente
      if (lead.status === 'lost' || lead.status === 'archived') continue

      const statuses = apptMap[lead.id] || []
      const hasFinalizado = statuses.includes('finalizado')
      const hasAgendado   = statuses.some(s => ['agendado','confirmado','em_atendimento','na_clinica','em_consulta','aguardando'].includes(s))

      if (hasFinalizado && lead.status !== 'patient') {
        lead.status = 'patient'; changed++
      } else if (hasAgendado && lead.status !== 'patient' && lead.status !== 'attending') {
        lead.status = 'scheduled'; changed++
      }
    }

    if (changed > 0) {
      store.set('clinicai_leads', leads)
      console.info(`[ClinicAI] Migração de status: ${changed} lead(s) promovido(s).`)
    }
  } catch { /* silencioso */ }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn()) {
    showLoginModal()
  } else {
    _migrateLeadStatuses()  // corrige status de leads existentes no boot
    document.dispatchEvent(new CustomEvent('clinicai:auth-success'))
    // Exibir alertas pendentes de finalização no sino
    setTimeout(() => {
      _renderNotificationBell()
      featherIn(document.getElementById('notifDropdown'))
      // Mostrar seletor de período na página inicial (dashboard)
      const _pd = document.getElementById('periodDropdown')
      if (_pd) _pd.style.display = ''
    }, 600)
  }
})
