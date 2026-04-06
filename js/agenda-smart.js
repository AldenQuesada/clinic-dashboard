;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════════
//  ClinicAI — Agenda Smart System
//  State Machine · Automations · Filters · Detail Panel
//  Financial · WhatsApp · Reports · Closed Loop
//
//  ⚠ GLOBALS OWNED BY THIS FILE — não declarar em outros arquivos:
//    STATUS_LABELS  — labels de status de consultas (agendado, confirmado, etc.)
//    STATUS_COLORS  — cores dos status de consultas
//    STATE_MACHINE  — transições permitidas entre status
//    (exportados para window.STATUS_LABELS / window.STATUS_COLORS no final)
//
//  Status de LEADS/CRM ficam em app.js como LEAD_STATUS_LABELS / LEAD_STATUS_COLORS
// ══════════════════════════════════════════════════════════════════

// ── State Machine ─────────────────────────────────────────────────
const STATE_MACHINE = {
  agendado:               ['aguardando_confirmacao','confirmado','remarcado','cancelado','no_show'],
  aguardando_confirmacao: ['confirmado','remarcado','cancelado','no_show'],
  confirmado:             ['aguardando','remarcado','cancelado','no_show'],
  aguardando:             ['na_clinica','no_show','cancelado'],
  na_clinica:             ['em_consulta'],
  em_consulta:            ['finalizado'],
  em_atendimento:         ['finalizado','cancelado','na_clinica'],  // legado
  finalizado:             [],
  remarcado:              ['agendado','cancelado'],
  cancelado:              [],
  no_show:                [],
}

const STATUS_LABELS = {
  agendado:               'Agendado',
  aguardando_confirmacao: 'Aguard. Confirmação',
  confirmado:             'Confirmado',
  aguardando:             'Aguardando',
  na_clinica:             'Na Clínica',
  em_consulta:            'Em Consulta',
  em_atendimento:         'Em Atendimento',
  finalizado:             'Finalizado',
  remarcado:              'Remarcado',
  cancelado:              'Cancelado',
  no_show:                'No-show',
}

const STATUS_COLORS = {
  agendado:               { color:'#3B82F6', bg:'#EFF6FF' },
  aguardando_confirmacao: { color:'#F59E0B', bg:'#FFFBEB' },
  confirmado:             { color:'#10B981', bg:'#ECFDF5' },
  aguardando:             { color:'#8B5CF6', bg:'#EDE9FE' },
  na_clinica:             { color:'#06B6D4', bg:'#ECFEFF' },
  em_consulta:            { color:'#7C3AED', bg:'#F5F3FF' },
  em_atendimento:         { color:'#7C3AED', bg:'#F5F3FF' },
  finalizado:             { color:'#374151', bg:'#F3F4F6' },
  remarcado:              { color:'#F97316', bg:'#FFF7ED' },
  cancelado:              { color:'#EF4444', bg:'#FEF2F2' },
  no_show:                { color:'#DC2626', bg:'#FEF2F2' },
}

// ── Tag mapping por status ────────────────────────────────────────
const STATUS_TAG_MAP = {
  agendado:               'agendado',
  aguardando_confirmacao: 'aguardando_confirmacao',
  confirmado:             'confirmado',
  remarcado:              'reagendado',
  cancelado:              'cancelado',
  no_show:                'falta',
}

function _applyStatusTag(appt, tagId, by) {
  if (!appt || !appt.pacienteId || !window.TagEngine) return
  try {
    const vars = { nome: appt.pacienteNome||'', data: appt.data||'', hora: appt.horaInicio||'', profissional: appt.profissionalNome||'' }
    TagEngine.applyTag(appt.pacienteId, 'paciente', tagId, by || 'agenda', vars)
  } catch(e) { /* silencioso */ }
}

// ── Payment Methods ───────────────────────────────────────────────
const PAYMENT_METHODS = [
  { id:'pix',           label:'PIX'            },
  { id:'dinheiro',      label:'Dinheiro'        },
  { id:'debito',        label:'Débito'          },
  { id:'credito',       label:'Crédito'         },
  { id:'parcelado',     label:'Parcelado'       },
  { id:'entrada_saldo', label:'Entrada + Saldo' },
  { id:'boleto',        label:'Boleto'          },
  { id:'link',          label:'Link Pagamento'  },
  { id:'cortesia',      label:'Cortesia'        },
  { id:'convenio',      label:'Convênio'        },
]

// ── WhatsApp Templates ────────────────────────────────────────────
const WA_TPLS = {
  agendado: {
    label:'Agendamento Confirmado',
    fn:(v)=>`Olá, *${v.nome}*! 😊\n\nSeu agendamento foi confirmado!\n\n📅 *Data:* ${v.data}\n⏰ *Horário:* ${v.hora}\n👨‍⚕️ *Profissional:* ${v.profissional}\n💆 *Procedimento:* ${v.procedimento}\n\n📍 ${v.clinica}\n\nQualquer dúvida estamos aqui!`
  },
  confirmacao: {
    label:'Confirmação D-1',
    fn:(v)=>`Olá, *${v.nome}*! ✨\n\nAmanhã você tem consulta conosco:\n\n📅 *${v.data}* às *${v.hora}*\n👨‍⚕️ *${v.profissional}*\n\nConfirme sua presença respondendo *SIM* ou entre em contato para remarcar.\n\n📍 ${v.clinica}`
  },
  chegou_o_dia: {
    label:'Chegou o Dia',
    fn:(v)=>`Bom dia, *${v.nome}*! ☀️\n\nHoje é o seu dia! Sua consulta é às *${v.hora}*.\n\n👨‍⚕️ ${v.profissional}\n📍 ${v.clinica}\n\nTe esperamos!`
  },
  antes: {
    label:'30 Min Antes',
    fn:(v)=>`Olá, *${v.nome}*! ⏰\n\nSua consulta começa em *30 minutos* (${v.hora}).\n\nEstamos te aguardando!\n\n📍 ${v.clinica}`
  },
  remarcado: {
    label:'Remarcamento',
    fn:(v)=>`Olá, *${v.nome}*! 📅\n\nSua consulta foi remarcada para:\n\n📅 *${v.data}* às *${v.hora}*\n👨‍⚕️ *${v.profissional}*\n\nQualquer dúvida entre em contato.\n\n📍 ${v.clinica}`
  },
  cancelado: {
    label:'Cancelamento',
    fn:(v)=>`Olá, *${v.nome}*!\n\nSua consulta de ${v.data} foi cancelada.\n\nQueremos te atender em breve! Quando quiser reagendar é só nos chamar. 💜\n\n${v.clinica}`
  },
  no_show: {
    label:'Recuperação No-show',
    fn:(v)=>`Olá, *${v.nome}*! 🌸\n\nNotamos que você não pôde comparecer hoje. Tudo bem?\n\nEstamos à disposição para reagendar quando for melhor para você.\n\n📍 ${v.clinica}`
  },
  pos_atendimento: {
    label:'Pos-Atendimento',
    fn:(v)=>`Ola, *${v.nome}*!\n\nFoi um prazer atender voce hoje!\n\nSe tiver qualquer duvida sobre os cuidados, pode nos chamar.\n\nSua avaliacao significa muito para nos!\n\n*${v.clinica}*`
  },
  avaliacao: {
    label:'Pedir Avaliacao',
    fn:(v)=>`Ola, *${v.nome}*!\n\nEsperamos que esteja se sentindo bem apos o atendimento!\n\nSua opiniao nos ajuda muito a melhorar. Poderia nos avaliar?\n\nhttps://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review\n\nMuito obrigado!\n\n*${v.clinica}*`
  },
}

// ── Automation Queue ──────────────────────────────────────────────
const QUEUE_KEY = 'clinicai_automations_queue'

function _getQueue()    { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') }
function _saveQueue(q)  { store.set(QUEUE_KEY, q) }

function scheduleAutomations(appt) {
  const q = _getQueue().filter(x => x.apptId !== appt.id)
  const dt = new Date(`${appt.data}T${appt.horaInicio}:00`)
  if (isNaN(dt.getTime())) { _saveQueue(q); return }

  const push = (trigger, date, type) => q.push({
    id:          'aut_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
    apptId:      appt.id,
    trigger, type,
    scheduledAt: date.toISOString(),
    executed:    false,
    payload:     { pacienteNome: appt.pacienteNome, pacienteId: appt.pacienteId }
  })

  const d1 = new Date(dt); d1.setDate(d1.getDate()-1); d1.setHours(10,0,0,0)
  push('d_minus_1', d1, 'whatsapp_confirmacao')

  const d0 = new Date(dt); d0.setHours(8,0,0,0)
  push('dia_08h', d0, 'whatsapp_chegou_o_dia')

  const d30 = new Date(dt); d30.setMinutes(d30.getMinutes()-30)
  push('30min_antes', d30, 'status_aguardando')

  const d10 = new Date(dt); d10.setMinutes(d10.getMinutes()-10)
  push('10min_antes', d10, 'notif_interna')

  _saveQueue(q)
}

function processQueue() {
  const now = new Date()
  const q = _getQueue()
  let changed = false
  q.forEach(item => {
    if (item.executed || new Date(item.scheduledAt) > now) return
    item.executed = true; changed = true
    _execAuto(item)
  })
  if (changed) _saveQueue(q)
}

function _execAuto(item) {
  if (!window.getAppointments) return
  const appt = getAppointments().find(a => a.id === item.apptId)
  if (!appt) return
  // Nao executar se ja cancelado/no_show/finalizado
  if (['cancelado','no_show','finalizado'].includes(appt.status)) {
    _logAuto(appt.id, item.type, 'pulado')
    return
  }

  if (item.type === 'whatsapp_confirmacao') {
    // D-1: enviar confirmacao
    sendWATemplate(appt.id, 'confirmacao')
    _logAuto(appt.id, item.type, 'enviado')
    return
  }
  if (item.type === 'whatsapp_chegou_o_dia') {
    // D-0 08h: enviar lembrete do dia
    sendWATemplate(appt.id, 'chegou_o_dia')
    _logAuto(appt.id, item.type, 'enviado')
    return
  }
  if (item.type === 'status_aguardando' && ['confirmado','agendado','aguardando_confirmacao'].includes(appt.status)) {
    // 30min antes: mudar status + enviar msg 30min
    apptTransition(appt.id, 'aguardando', 'automacao')
    sendWATemplate(appt.id, 'antes')
    _logAuto(appt.id, item.type, 'enviado')
    return
  }
  if (item.type === 'notif_interna') {
    // 10min antes: alerta interno para secretaria (handled pelo day panel alerts)
    _logAuto(appt.id, item.type, 'notificado')
    return
  }
  if (item.type === 'whatsapp_avaliacao') {
    // D+3: pedir avaliacao Google
    sendWATemplate(appt.id, 'avaliacao')
    _logAuto(appt.id, item.type, 'enviado')
    return
  }
  _logAuto(appt.id, item.type, 'pendente')
}

function _logAuto(apptId, type, status) {
  const logs = JSON.parse(localStorage.getItem('clinicai_auto_logs') || '[]')
  logs.push({ id:'log_'+Date.now(), apptId, type, status, at:new Date().toISOString() })
  store.set('clinicai_auto_logs', logs)
}

// ── State Machine Transition ──────────────────────────────────────
function apptTransition(id, newStatus, by) {
  if (!window.getAppointments) return false
  const appts = getAppointments()
  const idx = appts.findIndex(a => a.id === id)
  if (idx < 0) return false
  const appt = appts[idx]
  const allowed = STATE_MACHINE[appt.status] || []
  if (!allowed.includes(newStatus)) return false

  const prevStatus = appt.status
  if (!appt.historicoStatus) appt.historicoStatus = []
  appt.historicoStatus.push({ status: newStatus, at: new Date().toISOString(), by: by || 'manual' })
  appt.status = newStatus

  // Audit log de mudança de status
  if (!appt.historicoAlteracoes) appt.historicoAlteracoes = []
  appt.historicoAlteracoes.push({
    action_type: 'mudanca_status',
    old_value:   { status: prevStatus },
    new_value:   { status: newStatus },
    changed_by:  by || 'manual',
    changed_at:  new Date().toISOString(),
    reason:      by || 'manual',
  })

  appts[idx] = appt
  saveAppointments(appts)

  // Sync Supabase (fire-and-forget, nunca bloqueia)
  if (window.AppointmentsService?.syncOne) {
    AppointmentsService.syncOne(appt)
  }

  // Aplicar tag correspondente ao status (cérebro do sistema)
  const tagId = STATUS_TAG_MAP[newStatus]
  if (tagId) _applyStatusTag(appt, tagId, by || 'automação')

  // Automações por transição
  if (newStatus === 'agendado' || newStatus === 'remarcado') scheduleAutomations(appt)
  if (newStatus === 'cancelado' || newStatus === 'no_show') {
    const q = _getQueue().map(x => x.apptId === id ? {...x, executed:true} : x)
    _saveQueue(q)
  }
  if (newStatus === 'no_show') _createNoShowTask(appt)

  // Hook SDR unificado: disparar regras + mudar fase do lead
  if (appt.pacienteId && window.SdrService) {
    if (newStatus === 'finalizado') {
      SdrService.onLeadAttended(appt.pacienteId)
      // Sempre vai pra paciente no minimo (orcamento e tratado no confirmFinalize)
      if (SdrService.changePhase) SdrService.changePhase(appt.pacienteId, 'paciente', 'finalizacao-auto')
    }
  }

  // Ações contextuais
  if (newStatus === 'na_clinica')  setTimeout(() => _showChecklist(appt, 'na_clinica'), 200)
  if (newStatus === 'em_consulta') setTimeout(() => _showChecklist(appt, 'em_consulta'), 200)
  if (newStatus === 'cancelado')   setTimeout(() => _openRecovery(appt), 400)
  if (newStatus === 'no_show')     setTimeout(() => _openRecovery(appt), 400)

  return true
}

function _createNoShowTask(appt) {
  const tasks = JSON.parse(localStorage.getItem('clinic_op_tasks') || '[]')
  tasks.push({
    id:          'task_ns_' + Date.now(),
    tipo:        'no_show',
    titulo:      `No-show: ${appt.pacienteNome}`,
    descricao:   `Paciente não compareceu em ${appt.data} às ${appt.horaInicio}. Contatar para reagendamento.`,
    responsavel: 'sdr',
    status:      'pendente',
    prioridade:  'alta',
    apptId:      appt.id,
    createdAt:   new Date().toISOString(),
  })
  store.set('clinic_op_tasks', tasks)
}

// ── Checklist Contextual ──────────────────────────────────────────
function _showChecklist(appt, phase) {
  const tipo = appt.tipoConsulta || ''

  const items = phase === 'na_clinica' ? [
    { label:'Anestésico preparado',          show: ['injetavel','procedimento'].includes(tipo) },
    { label:'Poltrona de massagem pronta',    show: true },
    { label:'Anovator configurado',           show: tipo === 'procedimento' },
    { label:'Ficha/prontuário impresso',      show: true },
    { label:'Sala preparada e higienizada',   show: true },
    { label:'Kit de acolhimento / café',      show: true },
    { label:'Menu/cardápio disponível',       show: true },
    { label:'Orientação pré-consulta entregue', show: tipo === 'avaliacao' },
  ].filter(i=>i.show) : [
    { label:'Anamnese carregada na tela',     show: true },
    { label:'Motivo da consulta confirmado',  show: true },
    { label:'Material clínico preparado',     show: ['injetavel','procedimento'].includes(tipo) },
    { label:'Apresentação de protocolos pronta', show: tipo === 'avaliacao' },
    { label:'Orientações pós impressas',      show: tipo === 'procedimento' },
    { label:'Lista de consumo pronta',        show: ['injetavel','procedimento'].includes(tipo) },
  ].filter(i=>i.show)

  const existing = document.getElementById('agendaChecklistPanel')
  if (existing) existing.remove()
  const panel = document.createElement('div')
  panel.id = 'agendaChecklistPanel'
  panel.style.cssText = 'position:fixed;top:20px;right:20px;width:300px;background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:9800;border:2px solid '+(phase==='na_clinica'?'#06B6D4':'#7C3AED')+';animation:slideInRight .2s ease'
  const color = phase === 'na_clinica' ? '#06B6D4' : '#7C3AED'
  const label = phase === 'na_clinica' ? 'Paciente Na Clinica' : 'Em Consulta'
  const totalItems = items.length
  panel.innerHTML = `
    <div style="padding:12px 14px;background:${color};border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:13px;font-weight:800;color:#fff">${label} — ${appt.pacienteNome||'Paciente'}</div>
      <span id="ckProgress" style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7)">0/${totalItems}</span>
    </div>
    <div style="padding:12px 14px">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:8px">Checklist de seguranca</div>
      ${items.map((it,i)=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;font-size:12px;color:#374151">
        <input type="checkbox" id="ck_${phase}_${i}" onchange="_ckUpdate()" style="accent-color:${color};width:14px;height:14px"> ${it.label}
      </label>`).join('')}
      <button id="ckDoneBtn" onclick="_ckTryClose()" disabled style="margin-top:10px;width:100%;padding:8px;background:#D1D5DB;color:#fff;border:none;border-radius:8px;cursor:not-allowed;font-size:12px;font-weight:700">Marque todos os itens</button>
      <div id="ckBlockMsg" style="display:none;margin-top:6px;font-size:10px;font-weight:700;color:#DC2626;text-align:center">Complete todos os itens antes de fechar</div>
    </div>`
  document.body.appendChild(panel)
  setTimeout(() => { const p = document.getElementById('agendaChecklistPanel'); if(p) p.style.animation = 'none' }, 300)
}

function _ckUpdate() {
  const panel = document.getElementById('agendaChecklistPanel')
  if (!panel) return
  const cbs = panel.querySelectorAll('input[type=checkbox]')
  const total = cbs.length
  const checked = Array.from(cbs).filter(c => c.checked).length
  const progress = document.getElementById('ckProgress')
  if (progress) progress.textContent = checked + '/' + total
  const btn = document.getElementById('ckDoneBtn')
  const msg = document.getElementById('ckBlockMsg')
  if (checked === total) {
    if (btn) { btn.disabled = false; btn.style.background = panel.style.borderColor.replace('2px solid ','') || '#7C3AED'; btn.style.cursor = 'pointer'; btn.textContent = 'Checklist OK' }
    if (msg) msg.style.display = 'none'
  } else {
    if (btn) { btn.disabled = true; btn.style.background = '#D1D5DB'; btn.style.cursor = 'not-allowed'; btn.textContent = 'Marque todos os itens' }
  }
}

function _ckTryClose() {
  const panel = document.getElementById('agendaChecklistPanel')
  if (!panel) return
  const cbs = panel.querySelectorAll('input[type=checkbox]')
  const allChecked = Array.from(cbs).every(c => c.checked)
  if (allChecked) {
    panel.remove()
  } else {
    var msg = document.getElementById('ckBlockMsg')
    if (msg) msg.style.display = 'block'
  }
}
window._ckUpdate = _ckUpdate
window._ckTryClose = _ckTryClose

// ── Documentos Legais — toggle de checks no detail panel ────
function _docLegalToggle(apptId, field, value) {
  if (!window.getAppointments) return
  var appts = getAppointments()
  var idx = appts.findIndex(function(a) { return a.id === apptId })
  if (idx < 0) return
  appts[idx][field] = value
  saveAppointments(appts)
  if (window.AppointmentsService && AppointmentsService.syncOne) {
    AppointmentsService.syncOne(appts[idx])
  }
  // Re-render o painel pra atualizar cores
  setTimeout(function() { _buildPanel(apptId) }, 100)
}
window._docLegalToggle = _docLegalToggle

// ── Recovery Flow ─────────────────────────────────────────────────
function _openRecovery(appt) {
  const existing = document.getElementById('agendaRecoveryModal')
  if (existing) existing.remove()
  const m = document.createElement('div')
  m.id = 'agendaRecoveryModal'
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9600;display:flex;align-items:center;justify-content:center;padding:16px'
  const isCancelado = window.getAppointments ? getAppointments().find(a=>a.id===appt.id)?.status === 'cancelado' : false
  const cor = isCancelado ? '#EF4444' : '#DC2626'
  const tipo = isCancelado ? 'Cancelamento' : 'No-show'

  m.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden">
      <div style="background:${cor};padding:14px 18px">
        <div style="font-size:14px;font-weight:800;color:#fff">Fluxo de Recuperação — ${tipo}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:2px">${appt.pacienteNome||'Paciente'}</div>
      </div>
      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:12px;color:#6B7280;padding:8px 12px;background:#F9FAFB;border-radius:8px">
          O fluxo de recuperação é iniciado automaticamente. Escolha as ações imediatas:
        </div>
        <button onclick="sendWATemplate('${appt.id}','${isCancelado?'cancelado':'no_show'}');document.getElementById('agendaRecoveryModal').remove()" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:1.5px solid #10B98133;background:#F0FDF4;color:#059669;border-radius:9px;cursor:pointer;font-size:12px;font-weight:700;text-align:left">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.22 0h3a2 2 0 012 1.72 19.79 19.79 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.72 6.72l1.07-1.07a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          Enviar WhatsApp de recuperação
        </button>
        <button onclick="document.getElementById('agendaRecoveryModal').remove();openApptModal('${appt.id}',null,null,null)" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:1.5px solid #3B82F633;background:#EFF6FF;color:#2563EB;border-radius:9px;cursor:pointer;font-size:12px;font-weight:700;text-align:left">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Remarcar agendamento
        </button>
        <button onclick="document.getElementById('agendaRecoveryModal').remove()" style="width:100%;padding:9px;border:1.5px solid #E5E7EB;background:#fff;color:#374151;border-radius:9px;cursor:pointer;font-size:12px;font-weight:600">
          Fechar — tratar depois
        </button>
      </div>
    </div>`
  m.addEventListener('click', e => { if(e.target===m) m.remove() })
  document.body.appendChild(m)
}

// ── Filter State ──────────────────────────────────────────────────
let _filters = { status:'', profissional:'', tipoConsulta:'', statusPag:'', origem:'', tipoAvaliacao:'' }

function setAgendaFilter(key, val) {
  _filters[key] = val
  if (window.renderAgenda) renderAgenda()
}

function clearAgendaFilters() {
  _filters = { status:'', profissional:'', tipoConsulta:'', statusPag:'', origem:'', tipoAvaliacao:'' }
  if (window.renderAgenda) renderAgenda()
}

function getFilteredAppointments() {
  let appts = window.getAppointments ? getAppointments() : []
  if (_filters.status)        appts = appts.filter(a => a.status === _filters.status)
  if (_filters.profissional)  appts = appts.filter(a => String(a.profissionalIdx) === _filters.profissional)
  if (_filters.tipoConsulta)  appts = appts.filter(a => a.tipoConsulta === _filters.tipoConsulta)
  if (_filters.statusPag)     appts = appts.filter(a => a.statusPagamento === _filters.statusPag)
  if (_filters.origem)        appts = appts.filter(a => a.origem === _filters.origem)
  if (_filters.tipoAvaliacao) appts = appts.filter(a => a.tipoAvaliacao === _filters.tipoAvaliacao)
  return appts
}

function _hasFilters() {
  return Object.values(_filters).some(Boolean)
}

function renderAgendaFilterBar() {
  const profs = window.getProfessionals ? getProfessionals() : []
  const sOpts = Object.entries(STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${_filters.status===k?'selected':''}>${v}</option>`).join('')
  const pOpts = profs.map((p,i)=>`<option value="${i}" ${_filters.profissional===String(i)?'selected':''}>${p.nome}</option>`).join('')
  const active = _hasFilters()
  const sel = _fSel()

  return `<div id="agendaFilterBar" style="background:${active?'#F0F9FF':'#F9FAFB'};border-radius:10px;margin-bottom:12px;border:1px solid ${active?'#BAE6FD':'#E5E7EB'};padding:8px 12px">
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${active?'#0284C7':'#9CA3AF'}" stroke-width="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      <select onchange="setAgendaFilter('status',this.value)" style="${sel}">
        <option value="">Todos status</option>${sOpts}
      </select>
      <select onchange="setAgendaFilter('profissional',this.value)" style="${sel}">
        <option value="">Todos profissionais</option>${pOpts}
      </select>
      <select onchange="setAgendaFilter('tipoConsulta',this.value)" style="${sel}">
        <option value="">Tipo de consulta</option>
        <option value="avaliacao"    ${_filters.tipoConsulta==='avaliacao'?'selected':''}>Avaliação</option>
        <option value="retorno"      ${_filters.tipoConsulta==='retorno'?'selected':''}>Retorno</option>
        <option value="procedimento" ${_filters.tipoConsulta==='procedimento'?'selected':''}>Procedimento</option>
        <option value="sessao"       ${_filters.tipoConsulta==='sessao'?'selected':''}>Sessão de Protocolo</option>
        <option value="pos_proc"     ${_filters.tipoConsulta==='pos_proc'?'selected':''}>Pós-procedimento</option>
        <option value="emergencia"   ${_filters.tipoConsulta==='emergencia'?'selected':''}>Emergência</option>
      </select>
      <select onchange="setAgendaFilter('statusPag',this.value)" style="${sel}">
        <option value="">Financeiro</option>
        <option value="pendente" ${_filters.statusPag==='pendente'?'selected':''}>Pendente</option>
        <option value="parcial"  ${_filters.statusPag==='parcial'?'selected':''}>Parcial</option>
        <option value="pago"     ${_filters.statusPag==='pago'?'selected':''}>Pago</option>
      </select>
      <select onchange="setAgendaFilter('origem',this.value)" style="${sel}">
        <option value="">Origem</option>
        <option value="whatsapp"  ${(_filters.origem||'')==='whatsapp'?'selected':''}>WhatsApp</option>
        <option value="instagram" ${(_filters.origem||'')==='instagram'?'selected':''}>Instagram</option>
        <option value="indicacao" ${(_filters.origem||'')==='indicacao'?'selected':''}>Indicação</option>
        <option value="site"      ${(_filters.origem||'')==='site'?'selected':''}>Site</option>
        <option value="direto"    ${(_filters.origem||'')==='direto'?'selected':''}>Direto</option>
      </select>
      <select onchange="setAgendaFilter('tipoAvaliacao',this.value)" style="${sel}">
        <option value="">Avaliação</option>
        <option value="paga"     ${(_filters.tipoAvaliacao||'')==='paga'?'selected':''}>Paga</option>
        <option value="cortesia" ${(_filters.tipoAvaliacao||'')==='cortesia'?'selected':''}>Cortesia</option>
      </select>
      ${active?`<button onclick="clearAgendaFilters()" style="font-size:11px;padding:4px 10px;border:1px solid #EF4444;background:#FEF2F2;color:#EF4444;border-radius:6px;cursor:pointer;font-weight:600">✕ Limpar</button>`:''}
    </div>
  </div>`
}

function _fSel() {
  return 'font-size:12px;padding:5px 8px;border:1px solid #E5E7EB;border-radius:7px;background:#fff;color:#374151;cursor:pointer'
}

// ── Detail Panel (Sidebar deslizante) ─────────────────────────────
let _detailTab = 'resumo'
let _detailId  = null

function openApptDetail(id) {
  _detailId  = id
  _detailTab = 'resumo'
  _buildPanel(id)
}

function setDetailTab(tab) {
  _detailTab = tab
  _buildPanel(_detailId)
}

function closeApptDetail() {
  const p = document.getElementById('apptDetailPanel')
  if (p) { p.style.animation = 'slideOutRight .18s ease forwards'; setTimeout(()=>p.remove(), 180) }
  _detailId = null
}

function _buildPanel(id) {
  const appts = window.getAppointments ? getAppointments() : []
  const appt  = appts.find(a => a.id === id)
  if (!appt) return

  let panel = document.getElementById('apptDetailPanel')
  if (!panel) {
    panel = document.createElement('div')
    panel.id = 'apptDetailPanel'
    document.body.appendChild(panel)
  }

  const sc  = STATUS_COLORS[appt.status] || STATUS_COLORS.agendado
  const sLb = STATUS_LABELS[appt.status] || appt.status
  const isLocked   = ['finalizado','em_consulta','na_clinica'].includes(appt.status)
  const isDimmed   = ['cancelado','no_show'].includes(appt.status)
  // Filtrar transições — nunca mostrar cancel/no-show direto (exigem modal com motivo)
  const rawAllowed = STATE_MACHINE[appt.status] || []
  const allowed    = rawAllowed.filter(s => !['cancelado','no_show'].includes(s))
  const cancelOpts = rawAllowed.filter(s => ['cancelado','no_show'].includes(s))

  panel.style.cssText = 'position:fixed;top:0;right:0;width:380px;max-width:100vw;height:100vh;background:#fff;box-shadow:-4px 0 32px rgba(0,0,0,.15);z-index:9300;display:flex;flex-direction:column;overflow:hidden;animation:slideInRight .2s ease'

  const tabs = [['resumo','Resumo'],['financeiro','Financeiro'],['historico','Histórico'],['acoes','Ações']]

  panel.innerHTML = `
    <style>
      @keyframes slideInRight{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}
      @keyframes slideOutRight{from{transform:translateX(0);opacity:1}to{transform:translateX(40px);opacity:0}}
    </style>
    <!-- Header -->
    <div style="padding:16px 18px;border-bottom:1px solid #E5E7EB;flex-shrink:0;background:#FAFAFA">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:800;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${appt.pacienteNome||'Paciente'}</div>
          <div style="margin-top:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;color:${sc.color};background:${sc.bg};padding:2px 9px;border-radius:20px">${sLb}</span>
            <span style="font-size:11px;color:#9CA3AF">${appt.data?_fmtD(appt.data):''} ${appt.horaInicio||''}</span>
          </div>
        </div>
        <button onclick="closeApptDetail()" style="background:none;border:none;cursor:pointer;font-size:20px;color:#9CA3AF;flex-shrink:0;line-height:1;padding:2px 4px">✕</button>
      </div>
      ${isLocked ? `<div style="margin-top:8px;display:flex;align-items:center;gap:6px;padding:7px 10px;background:#FEF2F2;border-radius:8px;border:1px solid #FECACA">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        <span style="font-size:11px;color:#DC2626;font-weight:700">${appt.status==='finalizado'?'Atendimento finalizado — somente leitura':appt.status==='em_consulta'?'Em consulta — aguarde finalização':'Paciente na clínica'}</span>
      </div>` : ''}
      ${!isLocked && allowed.length ? `<div style="margin-top:10px;display:flex;gap:5px;flex-wrap:wrap">
        ${allowed.map(ns=>{const nc=STATUS_COLORS[ns]||{color:'#374151',bg:'#F3F4F6'};return`<button onclick="smartTransition('${id}','${ns}')" style="font-size:10px;font-weight:700;padding:4px 10px;border:1.5px solid ${nc.color};background:${nc.bg};color:${nc.color};border-radius:20px;cursor:pointer">${STATUS_LABELS[ns]||ns}</button>`}).join('')}
      </div>` : ''}
      ${!isLocked && cancelOpts.length ? `<div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">
        ${cancelOpts.map(ns=>{
          const lbl = ns==='cancelado'?'Cancelar':'No-show'
          const cor = ns==='cancelado'?'#EF4444':'#DC2626'
          return`<button onclick="openCancelModal('${id}','${ns}')" style="font-size:10px;font-weight:700;padding:4px 10px;border:1.5px solid ${cor};background:#FEF2F2;color:${cor};border-radius:20px;cursor:pointer">${lbl}</button>`
        }).join('')}
      </div>` : ''}
    </div>
    <!-- Tabs -->
    <div style="display:flex;border-bottom:2px solid #E5E7EB;flex-shrink:0">
      ${tabs.map(([t,l])=>`<button onclick="setDetailTab('${t}')" style="flex:1;padding:10px 4px;font-size:11px;font-weight:700;border:none;background:none;cursor:pointer;color:${_detailTab===t?'#7C3AED':'#6B7280'};border-bottom:2.5px solid ${_detailTab===t?'#7C3AED':'transparent'};margin-bottom:-2px;transition:color .15s">${l}</button>`).join('')}
    </div>
    <!-- Content -->
    <div style="flex:1;overflow-y:auto;padding:18px">
      ${_detailTab==='resumo'     ? _tabResumo(appt)     : ''}
      ${_detailTab==='financeiro' ? _tabFin(appt)        : ''}
      ${_detailTab==='historico'  ? _tabHist(appt)       : ''}
      ${_detailTab==='acoes'      ? _tabAcoes(appt, id)  : ''}
    </div>`
}

function _fmtD(iso) {
  const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`
}

function _row(label, value) {
  return value === undefined || value === null || value === '' ? '' :
    `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:1px solid #F3F4F6">
      <span style="font-size:11px;color:#9CA3AF;font-weight:500;flex-shrink:0;margin-right:12px">${label}</span>
      <span style="font-size:12px;color:#111;font-weight:600;text-align:right">${value}</span>
    </div>`
}

function _tabResumo(a) {
  const profs  = window.getProfessionals ? getProfessionals() : []
  const salas  = window.getRooms ? getRooms() : []
  const prof   = profs[a.profissionalIdx]?.nome || a.profissionalNome || '—'
  const sala   = salas[a.salaIdx]?.nome || '—'
  const tipoMap = { avaliacao:'Avaliação', retorno:'Retorno', procedimento:'Procedimento', emergencia:'Emergência' }
  const origMap = { whatsapp:'WhatsApp', instagram:'Instagram', indicacao:'Indicação', site:'Site', direto:'Direto' }
  const tipoPMap= { novo:'Novo', retorno:'Retorno', vip:'VIP' }

  const procs = a.procedimentosRealizados || []

  return `
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-bottom:6px">Consulta</div>
    ${_row('Data',      a.data ? _fmtD(a.data) : '')}
    ${_row('Horário',   a.horaInicio && a.horaFim ? `${a.horaInicio} – ${a.horaFim}` : a.horaInicio||'')}
    ${_row('Proc.',     a.procedimento)}
    ${_row('Profissional', prof)}
    ${_row('Sala',      sala)}
    ${_row('Tipo',      tipoMap[a.tipoConsulta]||'')}
    ${a.tipoConsulta==='avaliacao'?_row('Avaliação', a.tipoAvaliacao==='paga'?'Paga':a.tipoAvaliacao==='cortesia'?'Cortesia':''):''}
    ${_row('Origem',    origMap[a.origem]||a.origem||'')}
    ${_row('Paciente',  tipoPMap[a.tipoP]||'')}
    ${a.obs?`<div style="margin-top:10px;padding:9px;background:#F9FAFB;border-radius:7px;font-size:11px;color:#6B7280;line-height:1.5">${a.obs}</div>`:''}

    <div style="margin-top:14px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span style="font-size:10px;font-weight:800;color:#DC2626;text-transform:uppercase;letter-spacing:.06em">Documentos Legais</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:5px 8px;background:#fff;border-radius:6px;border:1px solid ${a.anamneseRespondida?'#BBF7D0':'#FDE68A'}">
          <input type="checkbox" ${a.anamneseRespondida?'checked':''} onchange="_docLegalToggle('${a.id}','anamneseRespondida',this.checked)" style="width:14px;height:14px;accent-color:#10B981;cursor:pointer"/>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600;color:#374151">Ficha de Anamnese</div>
            <div style="font-size:10px;color:${a.anamneseRespondida?'#10B981':'#F59E0B'};font-weight:600">${a.anamneseRespondida?'Preenchida':'Pendente'}</div>
          </div>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:5px 8px;background:#fff;border-radius:6px;border:1px solid ${(a.consentimentoImagem==='assinado'||a.consentimentoImagem===true)?'#BBF7D0':'#FDE68A'}">
          <input type="checkbox" ${(a.consentimentoImagem==='assinado'||a.consentimentoImagem===true)?'checked':''} onchange="_docLegalToggle('${a.id}','consentimentoImagem',this.checked?'assinado':'pendente')" style="width:14px;height:14px;accent-color:#10B981;cursor:pointer"/>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600;color:#374151">Consentimento de Imagem</div>
            <div style="font-size:10px;color:${(a.consentimentoImagem==='assinado'||a.consentimentoImagem===true)?'#10B981':'#F59E0B'};font-weight:600">${(a.consentimentoImagem==='assinado'||a.consentimentoImagem===true)?'Assinado':'Pendente'}</div>
          </div>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:5px 8px;background:#fff;border-radius:6px;border:1px solid ${a.consentimentoProcedimento==='assinado'?'#BBF7D0':'#FDE68A'}">
          <input type="checkbox" ${a.consentimentoProcedimento==='assinado'?'checked':''} onchange="_docLegalToggle('${a.id}','consentimentoProcedimento',this.checked?'assinado':'pendente')" style="width:14px;height:14px;accent-color:#10B981;cursor:pointer"/>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600;color:#374151">Consentimento de Procedimento</div>
            <div style="font-size:10px;color:${a.consentimentoProcedimento==='assinado'?'#10B981':'#F59E0B'};font-weight:600">${a.consentimentoProcedimento==='assinado'?'Assinado':'Pendente'}</div>
          </div>
        </label>
        ${(a.formaPagamento==='boleto'||a.formaPagamento==='parcelado'||a.formaPagamento==='entrada_saldo')?`
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:5px 8px;background:#fff;border-radius:6px;border:1px solid ${a.consentimentoPagamento==='assinado'?'#BBF7D0':'#FDE68A'}">
          <input type="checkbox" ${a.consentimentoPagamento==='assinado'?'checked':''} onchange="_docLegalToggle('${a.id}','consentimentoPagamento',this.checked?'assinado':'pendente')" style="width:14px;height:14px;accent-color:#10B981;cursor:pointer"/>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600;color:#374151">Consentimento de Pagamento</div>
            <div style="font-size:10px;color:${a.consentimentoPagamento==='assinado'?'#10B981':'#F59E0B'};font-weight:600">${a.consentimentoPagamento==='assinado'?'Assinado':'Pendente'}</div>
          </div>
        </label>`:''}
      </div>
    </div>

    ${procs.length?`
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-top:14px;margin-bottom:6px">Procedimentos Realizados</div>
      ${procs.map(p=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #F3F4F6;font-size:12px"><span style="color:#374151">${p.nome}</span><span style="font-weight:700;color:#111">×${p.qtd||1}</span></div>`).join('')}
    `:''}`
}

function _tabFin(a) {
  const pmMap = { pix:'PIX',dinheiro:'Dinheiro',debito:'Débito',credito:'Crédito',parcelado:'Parcelado',entrada_saldo:'Entrada + Saldo',boleto:'Boleto',link:'Link',cortesia:'Cortesia',convenio:'Convênio' }
  const psMap = { pendente:'Pendente', parcial:'Parcial', pago:'Pago' }
  const psClr = { pendente:'#F59E0B', parcial:'#3B82F6', pago:'#10B981' }
  const ps = a.statusPagamento || 'pendente'
  const pmOpts = PAYMENT_METHODS.map(m=>`<option value="${m.id}" ${a.formaPagamento===m.id?'selected':''}>${m.label}</option>`).join('')

  return `
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-bottom:6px">Financeiro</div>
    ${_row('Valor',    a.valor ? _fmtBRL(a.valor) : '')}
    ${_row('Status',  `<span style="color:${psClr[ps]||'#374151'};font-weight:700">${psMap[ps]||ps}</span>`)}
    ${_row('Forma',    pmMap[a.formaPagamento]||a.formaPagamento||'')}
    ${_row('Pago',     a.valorPago ? _fmtBRL(a.valorPago) : '')}
    ${a.valor&&a.valorPago&&a.valor>a.valorPago?_row('Saldo',`<span style="color:#EF4444;font-weight:700">${_fmtBRL(a.valor-a.valorPago)}</span>`):''}
    ${a.tipoConsulta==='avaliacao'&&a.tipoAvaliacao==='paga'?`<div style="margin-top:10px;padding:9px 12px;background:#FFFBEB;border-radius:8px;font-size:11px;color:#92400E;font-weight:600">⚠ Avaliação paga — confirme o pagamento antes de finalizar</div>`:''}
    <!-- Status buttons -->
    <div style="margin-top:14px">
      <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px">Atualizar Status</div>
      <div style="display:flex;gap:6px">
        ${['pendente','parcial','pago'].map(s=>`<button onclick="updatePayStatus('${a.id}','${s}')" style="flex:1;font-size:11px;padding:6px;border:1.5px solid ${psClr[s]};background:${ps===s?psClr[s]:'#fff'};color:${ps===s?'#fff':psClr[s]};border-radius:7px;cursor:pointer;font-weight:700">${psMap[s]}</button>`).join('')}
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
        <input id="dpValPago" type="number" placeholder="Valor pago..." value="${a.valorPago||''}" style="flex:1;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px">
        <select id="dpFormaPag" style="flex:1;padding:7px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px">${pmOpts}</select>
      </div>
      <button onclick="savePay('${a.id}')" style="margin-top:8px;width:100%;padding:9px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">Salvar Pagamento</button>
    </div>`
}

const _ACTION_LABELS = {
  mudanca_status:    'Mudança de status',
  edicao:            'Edição de dados',
  remarcacao_drag:   'Remarcação (drag & drop)',
  remarcacao:        'Remarcação',
  cancelamento:      'Cancelamento',
  no_show:           'No-show',
  finalizacao:       'Finalização',
  fluxo_avaliacao_google: 'Fluxo: Avaliação Google',
  fluxo_parceria:    'Fluxo: Parceria',
}

function _tabHist(a) {
  const hist = [...(a.historicoStatus||[])].reverse()
  const logs = JSON.parse(localStorage.getItem('clinicai_auto_logs')||'[]').filter(l=>l.apptId===a.id)
  const alteracoes = [...(a.historicoAlteracoes||[])].reverse()
  const autoLbls = { whatsapp_confirmacao:'WA: Confirmação D-1', whatsapp_chegou_o_dia:'WA: Chegou o dia', notif_interna:'Notif. interna 10min', status_aguardando:'Auto: → Aguardando', wa_pos_atendimento:'WA: Pós-atendimento' }

  return `
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-bottom:8px">Histórico de Status</div>
    ${!hist.length?`<div style="text-align:center;color:#9CA3AF;padding:16px;font-size:12px">Sem histórico</div>`:''}
    ${hist.map(h=>{const sc=STATUS_COLORS[h.status]||{color:'#374151'};return`<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #F3F4F6">
      <div style="width:7px;height:7px;border-radius:50%;background:${sc.color};flex-shrink:0;margin-top:3px"></div>
      <div style="flex:1"><div style="font-size:12px;font-weight:700;color:#111">${STATUS_LABELS[h.status]||h.status}</div>
      <div style="font-size:10px;color:#9CA3AF;margin-top:1px">${h.at?new Date(h.at).toLocaleString('pt-BR'):''} · ${h.by||'manual'}${h.motivo?` · ${h.motivo}`:''}</div></div>
    </div>`}).join('')}
    ${alteracoes.length?`
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-top:14px;margin-bottom:6px">Trilha de Auditoria</div>
      ${alteracoes.map(l=>`<div style="padding:7px 0;border-bottom:1px solid #F3F4F6">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <span style="font-size:11px;font-weight:700;color:#374151">${_ACTION_LABELS[l.action_type]||l.action_type}</span>
          <span style="font-size:10px;color:#9CA3AF;white-space:nowrap;margin-left:8px">${l.changed_at?new Date(l.changed_at).toLocaleString('pt-BR'):''}</span>
        </div>
        ${l.reason?`<div style="font-size:10px;color:#6B7280;margin-top:2px">${l.reason}</div>`:''}
      </div>`).join('')}
    `:''}
    ${logs.length?`
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-top:14px;margin-bottom:6px">Automações</div>
      ${logs.map(l=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #F3F4F6;font-size:11px">
        <span style="color:#374151">${autoLbls[l.type]||l.type}</span>
        <span style="color:${l.status==='pendente'?'#F59E0B':l.status==='enviado'?'#10B981':'#9CA3AF'};font-weight:700">${l.status}</span>
      </div>`).join('')}`:''}
  `
}

function _tabAcoes(a, id) {
  return `
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-bottom:10px">WhatsApp</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:18px">
      ${Object.entries(WA_TPLS).map(([key,tpl])=>`<button onclick="sendWATemplate('${id}','${key}')" style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;background:#fff;cursor:pointer;text-align:left;width:100%;transition:background .1s" onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background='#fff'">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.22 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.72 6.72l1.07-1.07a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
        <span style="font-size:12px;font-weight:600;color:#374151">${tpl.label}</span>
      </button>`).join('')}
    </div>
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#9CA3AF;letter-spacing:.06em;margin-bottom:10px">Ações</div>
    <div style="display:flex;flex-direction:column;gap:7px">
      <button onclick="openApptModal('${id}',null,null,null)" style="${_aBtn('#3B82F6')}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar Consulta</button>
      ${a.status!=='finalizado'&&a.status!=='cancelado'?`<button onclick="openFinalizeModal('${id}')" style="${_aBtn('#10B981')}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Finalizar Atendimento</button>`:''}
      <button onclick="closeApptDetail();window.tagsOpenCheckoutModal&&tagsOpenCheckoutModal('${id}','${(a.pacienteNome||'').replace(/'/g,"\\'")}',[])" style="${_aBtn('#8B5CF6')}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Registrar Saída</button>
    </div>`
}

function _aBtn(c) {
  return `display:flex;align-items:center;gap:8px;padding:9px 13px;border:1.5px solid ${c}22;background:${c}10;color:${c};border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;width:100%;text-align:left;transition:background .1s`
}

function _fmtBRL(v) { return 'R$ '+Number(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.') }
function _getPhone(appt) {
  try {
    const leads = window.LeadsService
      ? LeadsService.getLocal()
      : JSON.parse(localStorage.getItem('clinicai_leads')||'[]')
    const l = leads.find(x=>x.id===appt.pacienteId||(x.nome||x.name||'')===appt.pacienteNome)
    return l?.whatsapp||l?.phone||l?.telefone||''
  } catch { return '' }
}
function _waVars(appt) {
  return { nome:appt.pacienteNome||'Paciente', data:appt.data?_fmtD(appt.data):'', hora:appt.horaInicio||'', profissional:appt.profissionalNome||'', procedimento:appt.procedimento||'', clinica:window._getClinicaNome?_getClinicaNome():'Clínica' }
}

function sendWATemplate(apptId, tplKey) {
  const appt = window.getAppointments ? getAppointments().find(a=>a.id===apptId) : null
  if (!appt) return
  const tpl = WA_TPLS[tplKey]; if (!tpl) return
  const text = tpl.fn(_waVars(appt))
  const phone = (_getPhone(appt)||'').replace(/\D/g,'')

  if (!phone) {
    if (window._showToast) _showToast('Sem telefone', (appt.pacienteNome||'Paciente') + ' nao tem WhatsApp', 'warning')
    return
  }

  // Enviar via Evolution API (por baixo, via Supabase RPC)
  if (window._sbShared) {
    window._sbShared.rpc('wa_outbox_enqueue_appt', {
      p_phone: phone,
      p_content: text,
      p_lead_name: appt.pacienteNome || 'Paciente'
    }).then(function(res) {
      if (res.error) {
        console.error('[WA] Falha:', res.error.message)
        // Fallback: abre wa.me se RPC falhar
        window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank')
      } else {
        if (window._showToast) _showToast('WhatsApp enviado', (WA_TPLS[tplKey]||{}).label + ' para ' + (appt.pacienteNome||''), 'success')
      }
    }).catch(function() {
      window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank')
    })
  } else {
    // Sem Supabase: fallback wa.me
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank')
  }

  _logAuto(apptId, 'wa_'+tplKey, 'enviado')
}

// ── Transition from panel ─────────────────────────────────────────
function smartTransition(id, newStatus) {
  // Cancelamento e no-show exigem modal com motivo obrigatório
  if ((newStatus === 'cancelado' || newStatus === 'no_show') && window.openCancelModal) {
    openCancelModal(id, newStatus)
    return
  }

  // Validar transição via AgendaValidator
  if (window.AgendaValidator && window.getAppointments) {
    const appt = getAppointments().find(a => a.id === id)
    if (appt) {
      const errs = AgendaValidator.validateTransition(appt, newStatus)
      if (errs.length) {
        if (window.showValidationErrors) showValidationErrors(errs, 'Transição não permitida')
        else alert(errs[0])
        return
      }
    }
  }

  const ok = apptTransition(id, newStatus, 'manual')
  if (!ok) {
    if (window.showErrorToast) showErrorToast('Transição não permitida no fluxo atual.')
    else alert('Transição não permitida no fluxo atual.')
    return
  }
  if (window.renderAgenda) renderAgenda()
  _buildPanel(id)
}

// ── Payment helpers (from detail panel) ──────────────────────────
function updatePayStatus(id, status) {
  if (!window.getAppointments) return
  const appts = getAppointments()
  const idx = appts.findIndex(a=>a.id===id); if(idx<0) return
  appts[idx].statusPagamento = status
  saveAppointments(appts)
  _buildPanel(id)
}

function savePay(id) {
  if (!window.getAppointments) return
  const appts = getAppointments()
  const idx = appts.findIndex(a=>a.id===id); if(idx<0) return
  const val   = parseFloat(document.getElementById('dpValPago')?.value||'0')
  const forma = document.getElementById('dpFormaPag')?.value
  if (val) appts[idx].valorPago = val
  if (forma) appts[idx].formaPagamento = forma
  if (val && appts[idx].valor && val >= appts[idx].valor) appts[idx].statusPagamento = 'pago'
  else if (val>0) appts[idx].statusPagamento = 'parcial'
  saveAppointments(appts)
  _buildPanel(id)
}

// ── Finalization Modal ────────────────────────────────────────────
let _finalProcs = []

function openFinalizeModal(id) {
  _finalProcs = []
  if (!window.getAppointments) return
  const appt = getAppointments().find(a=>a.id===id)
  if (!appt) return
  _buildFinModal(id, appt)
}

function _buildFinModal(id, appt) {
  let m = document.getElementById('smartFinalizeModal')
  if (!m) { m = document.createElement('div'); m.id = 'smartFinalizeModal'; document.body.appendChild(m) }

  const pmOpts = PAYMENT_METHODS.map(pm=>`<option value="${pm.id}" ${appt.formaPagamento===pm.id?'selected':''}>${pm.label}</option>`).join('')
  const isAvalPaga = appt.tipoConsulta==='avaliacao' && appt.tipoAvaliacao==='paga'

  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px'
  m.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:18px;width:100%;max-width:540px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #E5E7EB;flex-shrink:0">
        <div>
          <div style="font-size:15px;font-weight:800;color:#111">Finalizar Atendimento</div>
          <div style="font-size:11px;color:#9CA3AF;margin-top:2px">${appt.pacienteNome} · ${appt.data?_fmtD(appt.data):''} ${appt.horaInicio||''}</div>
        </div>
        <button onclick="closeFinalizeModal()" style="background:none;border:none;cursor:pointer;font-size:20px;color:#9CA3AF">✕</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:16px">

        <!-- Procedimentos -->
        <div>
          <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:7px">Procedimentos Realizados</div>
          <div id="finProcList">${_renderFinProcs()}</div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <input id="finProcNome" placeholder="Procedimento..." style="flex:1;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px" list="apptProcList">
            <input id="finProcQtd"  type="number" value="1" min="1" style="width:52px;padding:7px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;text-align:center">
            <button onclick="addFinProc()" style="padding:7px 13px;background:#7C3AED;color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700">+</button>
          </div>
        </div>

        <!-- Financeiro -->
        <div style="background:#F9FAFB;padding:13px;border-radius:10px">
          <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:10px">Financeiro</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
            <div>
              <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Valor Total (R$)</label>
              <input id="finValor" type="number" step="0.01" placeholder="0,00" value="${appt.valor||''}" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:13px;font-weight:700">
            </div>
            <div>
              <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Valor Pago (R$)</label>
              <input id="finPago" type="number" step="0.01" placeholder="0,00" value="${appt.valorPago||''}" oninput="finUpdateBalance()" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:13px">
            </div>
            <div>
              <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Forma de Pagamento</label>
              <select id="finFormaPag" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px">${pmOpts}</select>
            </div>
            <div>
              <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Status</label>
              <select id="finStatusPag" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px">
                <option value="pendente" ${appt.statusPagamento==='pendente'?'selected':''}>Pendente</option>
                <option value="parcial"  ${appt.statusPagamento==='parcial'?'selected':''}>Parcial</option>
                <option value="pago"     ${appt.statusPagamento==='pago'?'selected':''}>Pago</option>
              </select>
            </div>
          </div>
          <div id="finBalInfo" style="margin-top:7px;font-size:11px;font-weight:600"></div>
        </div>

        ${isAvalPaga?`<div style="padding:9px 12px;background:#FFFBEB;border-radius:8px;border:1.5px solid #F59E0B"><div style="font-size:11px;font-weight:700;color:#92400E">Avaliação Paga — confirme o pagamento antes de finalizar</div></div>`:''}

        <!-- Bloco 3: Fluxos pós-atendimento -->
        <div style="background:#F0FDF4;padding:13px;border-radius:10px;border:1px solid #D1FAE5">
          <div style="font-size:11px;font-weight:800;color:#065F46;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Bloco 3 — Fluxos Pós-Atendimento</div>
          <div style="display:flex;flex-direction:column;gap:7px">
            <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#374151;cursor:pointer">
              <input type="checkbox" id="finWAPos" checked style="width:14px;height:14px;accent-color:#10B981"> Enviar WhatsApp pós-atendimento (cuidados)
            </label>
            <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#374151;cursor:pointer">
              <input type="checkbox" id="finAvalGoogle" style="width:14px;height:14px;accent-color:#10B981"> Solicitar avaliação Google
            </label>
            <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#374151;cursor:pointer">
              <input type="checkbox" id="finFluxoParceria" style="width:14px;height:14px;accent-color:#10B981"> Fluxo de parceria / indicação
            </label>
            <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#374151;cursor:pointer">
              <input type="checkbox" id="finGerarRetorno" style="width:14px;height:14px;accent-color:#10B981"> Gerar retorno / próximo agendamento
            </label>
            <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#374151;cursor:pointer">
              <input type="checkbox" id="finEnviarOrcamento" style="width:14px;height:14px;accent-color:#10B981"> Enviar orçamento
            </label>
          </div>
        </div>

        <!-- Bloco 4: Routing de tags (próximo estado do paciente) -->
        <div style="background:#F5F3FF;padding:13px;border-radius:10px;border:1px solid #DDD6FE">
          <div style="font-size:11px;font-weight:800;color:#4C1D95;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Bloco 4 — Próximo Estado do Paciente</div>
          <div style="display:flex;flex-direction:column;gap:7px">
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer;padding:8px;border-radius:8px;border:1.5px solid transparent" id="finRouteLabel_paciente">
              <input type="radio" name="finRoute" value="paciente" style="margin-top:2px;accent-color:#10B981" onchange="finRouteChange()">
              <div><div style="font-weight:700;color:#059669">Paciente</div><div style="font-size:10px;color:#9CA3AF">Fez procedimento. Fluxo de pós-atendimento.</div></div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer;padding:8px;border-radius:8px;border:1.5px solid transparent" id="finRouteLabel_pac_orc">
              <input type="radio" name="finRoute" value="pac_orcamento" style="margin-top:2px;accent-color:#8B5CF6" onchange="finRouteChange()">
              <div><div style="font-weight:700;color:#7C3AED">Paciente + Orçamento</div><div style="font-size:10px;color:#9CA3AF">Fez procedimento E saiu com orçamento para outro tratamento.</div></div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer;padding:8px;border-radius:8px;border:1.5px solid transparent" id="finRouteLabel_orc">
              <input type="radio" name="finRoute" value="orcamento" style="margin-top:2px;accent-color:#F59E0B" onchange="finRouteChange()">
              <div><div style="font-weight:700;color:#D97706">Orçamento</div><div style="font-size:10px;color:#9CA3AF">Só consulta, saiu com orçamento. Sem procedimento feito.</div></div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer;padding:8px;border-radius:8px;border:1.5px solid transparent" id="finRouteLabel_nenhum">
              <input type="radio" name="finRoute" value="nenhum" checked style="margin-top:2px;accent-color:#9CA3AF" onchange="finRouteChange()">
              <div><div style="font-weight:700;color:#374151">Apenas finalizar</div><div style="font-size:10px;color:#9CA3AF">Sem roteamento adicional.</div></div>
            </label>
          </div>
        </div>

        <div>
          <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:4px">Observações Finais</label>
          <textarea id="finObs" rows="2" placeholder="Notas sobre o atendimento..." style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;resize:none;font-family:inherit">${appt.obsFinal||''}</textarea>
        </div>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #E5E7EB;display:flex;gap:9px;flex-shrink:0">
        <button onclick="closeFinalizeModal()" style="flex:1;padding:10px;border:1.5px solid #E5E7EB;background:#fff;color:#374151;border-radius:9px;cursor:pointer;font-size:13px;font-weight:700">Cancelar</button>
        <button onclick="confirmFinalize('${id}')" style="flex:2;padding:10px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:800">Confirmar Finalização</button>
      </div>
    </div>`
}

function _renderFinProcs() {
  if (!_finalProcs.length) return '<div style="font-size:11px;color:#9CA3AF;padding:4px 0">Nenhum procedimento adicionado</div>'
  return _finalProcs.map((p,i)=>`<div style="display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid #F3F4F6">
    <span style="flex:1;font-size:12px;color:#374151">${(window.escHtml||String)(p.nome)}</span>
    <span style="font-size:11px;color:#9CA3AF">×${p.qtd}</span>
    <button onclick="removeFinProc(${i})" style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:16px;line-height:1;padding:0 2px">×</button>
  </div>`).join('')
}

function addFinProc() {
  const n = document.getElementById('finProcNome')?.value?.trim()
  const q = parseInt(document.getElementById('finProcQtd')?.value||'1')
  if (!n) return
  _finalProcs.push({ nome:n, qtd:q||1 })
  const el = document.getElementById('finProcList'); if(el) el.innerHTML = _renderFinProcs()
  const inp = document.getElementById('finProcNome'); if(inp) inp.value = ''
}

function removeFinProc(i) {
  _finalProcs.splice(i,1)
  const el = document.getElementById('finProcList'); if(el) el.innerHTML = _renderFinProcs()
}

function finUpdateBalance() {
  const tot = parseFloat(document.getElementById('finValor')?.value||'0')
  const pag = parseFloat(document.getElementById('finPago')?.value||'0')
  const el  = document.getElementById('finBalInfo'); if (!el) return
  if (tot>0&&pag<tot) { el.textContent=`Saldo: ${_fmtBRL(tot-pag)}`; el.style.color='#EF4444' }
  else if (tot>0&&pag>=tot) { el.textContent='Pagamento completo'; el.style.color='#10B981' }
  else el.textContent=''
}

function finRouteChange() {
  const val = document.querySelector('input[name="finRoute"]:checked')?.value
  const map = { paciente:'#10B981', pac_orcamento:'#7C3AED', orcamento:'#F59E0B', nenhum:'#E5E7EB' }
  ;['paciente','pac_orc','orc','nenhum'].forEach(k=>{
    const id = k === 'pac_orc' ? 'finRouteLabel_pac_orc' : k==='orc'?'finRouteLabel_orc':k==='nenhum'?'finRouteLabel_nenhum':'finRouteLabel_paciente'
    const el = document.getElementById(id)
    if (!el) return
    const key = k==='pac_orc'?'pac_orcamento':k==='orc'?'orcamento':k==='nenhum'?'nenhum':'paciente'
    el.style.border = val===key ? `1.5px solid ${map[key]}` : '1.5px solid transparent'
    el.style.background = val===key ? `${map[key]}10` : 'transparent'
  })
}

function closeFinalizeModal() {
  const m = document.getElementById('smartFinalizeModal'); if(m) m.style.display='none'
}

function confirmFinalize(id) {
  if (!window.getAppointments) return
  const appts = getAppointments()
  const idx = appts.findIndex(a=>a.id===id); if(idx<0) return
  const appt = appts[idx]

  const valor    = parseFloat(document.getElementById('finValor')?.value||'0')
  const pago     = parseFloat(document.getElementById('finPago')?.value||'0')
  const forma    = document.getElementById('finFormaPag')?.value
  const statusP  = document.getElementById('finStatusPag')?.value
  const obs      = document.getElementById('finObs')?.value?.trim()
  const waPos    = document.getElementById('finWAPos')?.checked
  const avalGoogle = document.getElementById('finAvalGoogle')?.checked
  const parceria = document.getElementById('finFluxoParceria')?.checked
  const route    = document.querySelector('input[name="finRoute"]:checked')?.value || 'nenhum'

  // Validação completa de finalização via AgendaValidator
  if (window.AgendaValidator) {
    const finValidData = {
      tipoConsulta:   appt.tipoConsulta,
      tipoAvaliacao:  appt.tipoAvaliacao,
      valor,
      statusPagamento: document.getElementById('finStatusPag')?.value || 'pendente',
    }
    const errs = AgendaValidator.validateFinalize(appt, finValidData)
    if (errs.length) {
      if (window.showValidationErrors) showValidationErrors(errs, 'Não foi possível finalizar')
      return
    }
  } else if (appt.tipoConsulta==='avaliacao'&&appt.tipoAvaliacao==='paga'&&statusP==='pendente') {
    alert('Avaliação paga: registre o pagamento antes de finalizar.'); return
  }

  // Determinar status pagamento automático
  let spFinal = statusP
  if (pago>0 && valor>0 && pago>=valor) spFinal = 'pago'
  else if (pago>0) spFinal = 'parcial'

  const procs = _finalProcs.length ? _finalProcs : (appt.procedimentosRealizados||[])

  const at = new Date().toISOString()
  const auditLog = [...(appt.historicoAlteracoes||[]), {
    action_type: 'finalizacao',
    old_value:   { status: appt.status, valor: appt.valor, statusPagamento: appt.statusPagamento },
    new_value:   { status: 'finalizado', valor, statusPagamento: spFinal, route },
    changed_by:  'secretaria',
    changed_at:  at,
    reason:      `Finalização — rota: ${route}`,
  }]

  appts[idx] = {
    ...appt,
    status:                 'finalizado',
    valor,
    valorPago:              pago,
    formaPagamento:         forma,
    statusPagamento:        spFinal,
    obsFinal:               obs,
    procedimentosRealizados:procs,
    routingFinal:           route,
    finalizadoEm:           at,
    historicoStatus:        [...(appt.historicoStatus||[]),{status:'finalizado',at,by:'manual'}],
    historicoAlteracoes:    auditLog,
  }
  saveAppointments(appts)

  const apptFinal = appts[idx]

  // Bloco 3: Fluxos pos
  if (waPos)     sendWATemplate(id, 'pos_atendimento')
  if (avalGoogle) {
    // Agendar pedido de avaliacao para 3 dias depois
    var avalDate = new Date(); avalDate.setDate(avalDate.getDate() + 3); avalDate.setHours(14, 0, 0, 0)
    var q = _getQueue()
    q.push({
      id:          'aut_aval_' + Date.now(),
      apptId:      id,
      trigger:     'd_plus_3',
      type:        'whatsapp_avaliacao',
      scheduledAt: avalDate.toISOString(),
      executed:    false,
      payload:     { pacienteNome: apptFinal.pacienteNome, pacienteId: apptFinal.pacienteId }
    })
    _saveQueue(q)
    _logAuto(id, 'fluxo_avaliacao_google', 'agendado_d3')
  }
  if (parceria)   _logAuto(id, 'fluxo_parceria', 'pendente')

  // Bloco 4: Routing — muda fase do lead + aplica tags
  // Regra: sempre sai como paciente ou orcamento. Nunca fica em compareceu/agendado.
  if (apptFinal.pacienteId) {
    if (route === 'orcamento') {
      if (window.SdrService && SdrService.changePhase) {
        SdrService.changePhase(apptFinal.pacienteId, 'orcamento', 'finalizacao')
      }
    } else {
      // paciente, pac_orcamento, nenhum — todos vao pra paciente
      if (window.SdrService && SdrService.changePhase) {
        SdrService.changePhase(apptFinal.pacienteId, 'paciente', 'finalizacao')
      }
    }

    // Aplicar tags
    if (route === 'paciente' && window.TagEngine) {
      var vars = { nome:apptFinal.pacienteNome||'', data:apptFinal.data||'' }
      try {
        TagEngine.applyTag(apptFinal.pacienteId, 'paciente', 'consulta_realizada', 'finalizacao', vars)
        if (procs.length) TagEngine.applyTag(apptFinal.pacienteId, 'paciente', 'procedimento_realizado', 'finalizacao', vars)
      } catch(e) {}
    }
    if (route === 'pac_orcamento' && window.TagEngine) {
      var vars2 = { nome:apptFinal.pacienteNome||'' }
      try {
        TagEngine.applyTag(apptFinal.pacienteId, 'pac_orcamento', 'orcamento_aberto', 'finalizacao', vars2)
      } catch(e) {}
    }
    if (route === 'orcamento' && window.TagEngine) {
      var vars3 = { nome:apptFinal.pacienteNome||'' }
      try {
        TagEngine.applyTag(apptFinal.pacienteId, 'orcamento', 'orc_em_aberto', 'finalizacao', vars3)
      } catch(e) {}
    }
  }

  closeFinalizeModal()
  if (window.renderAgenda) renderAgenda()
  setTimeout(()=>openApptDetail(id), 80)
}

// ── Reports: Real Data ────────────────────────────────────────────
function getAgendaReportData(period) {
  const appts = window.getAppointments ? getAppointments() : []
  const now   = new Date()
  let start, end

  if (period === 'semana') {
    const day = now.getDay()
    start = new Date(now); start.setDate(now.getDate()-(day===0?6:day-1)); start.setHours(0,0,0,0)
    end   = new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999)
  } else if (period === 'mes') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    end   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999)
  } else {
    const q = Math.floor(now.getMonth()/3)
    start = new Date(now.getFullYear(), q*3, 1)
    end   = new Date(now.getFullYear(), q*3+3, 0, 23,59,59,999)
  }

  const inRange = appts.filter(a=>{ const d=new Date(a.data+'T12:00'); return d>=start&&d<=end })
  const total       = inRange.length
  const realizados  = inRange.filter(a=>a.status==='finalizado').length
  const noshow      = inRange.filter(a=>a.status==='no_show').length
  const cancelados  = inRange.filter(a=>a.status==='cancelado').length
  const remarcados  = inRange.filter(a=>a.status==='remarcado').length
  const confirmados = inRange.filter(a=>['confirmado','na_clinica','em_consulta','em_atendimento','finalizado'].includes(a.status)).length
  const pagos       = inRange.filter(a=>a.statusPagamento==='pago')
  const faturamento = pagos.reduce((s,a)=>s+(a.valor||0),0)
  const ticketMedio = pagos.length ? faturamento/pagos.length : 0

  const pct = (v) => total ? Math.round(v/total*100) : 0

  const porDia = []
  if (period==='semana') {
    const dias = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']
    for(let i=0;i<7;i++){
      const d=new Date(start); d.setDate(start.getDate()+i)
      const iso=d.toISOString().slice(0,10)
      const da=inRange.filter(a=>a.data===iso)
      porDia.push({dia:dias[i],agendados:da.length,realizados:da.filter(a=>a.status==='finalizado').length,noshow:da.filter(a=>a.status==='no_show').length})
    }
  }

  return { total, confirmados, realizados, noshow, cancelados, remarcados, faturamento, ticketMedio,
           txComparecimento:pct(realizados), txConfirmacao:pct(confirmados), txNoshow:pct(noshow), txCancelamento:pct(cancelados), porDia }
}

// ── Init ──────────────────────────────────────────────────────────
function _init() {
  processQueue()
  setInterval(processQueue, 60_000)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init)
} else {
  setTimeout(_init, 0)
}

// ── Expose ────────────────────────────────────────────────────────
window.apptTransition         = apptTransition
window.scheduleAutomations    = scheduleAutomations
window.processQueue           = processQueue
window.openApptDetail         = openApptDetail
window.closeApptDetail        = closeApptDetail
window.setDetailTab           = setDetailTab
window.smartTransition        = smartTransition
window.updatePayStatus        = updatePayStatus
window.savePay                = savePay
window.sendWATemplate         = sendWATemplate
window.openFinalizeModal      = openFinalizeModal
window.closeFinalizeModal     = closeFinalizeModal
window.confirmFinalize        = confirmFinalize
window.addFinProc             = addFinProc
window.removeFinProc          = removeFinProc
window.finUpdateBalance       = finUpdateBalance
window.finRouteChange         = finRouteChange
window.renderAgendaFilterBar  = renderAgendaFilterBar
window.setAgendaFilter        = setAgendaFilter
window.clearAgendaFilters     = clearAgendaFilters
window.getFilteredAppointments= getFilteredAppointments
window.getAgendaReportData    = getAgendaReportData
window._applyStatusTag        = _applyStatusTag
window._openRecovery          = _openRecovery
window._getQueue              = _getQueue
window._saveQueue             = _saveQueue
window.processQueue           = processQueue

// Duplicado removido — _init() ja faz processQueue + setInterval(60s)
window.WA_TPLS                = WA_TPLS
window.STATUS_LABELS          = STATUS_LABELS
window.STATUS_COLORS          = STATUS_COLORS
window.STATE_MACHINE          = STATE_MACHINE
window.PAYMENT_METHODS        = PAYMENT_METHODS

})()
