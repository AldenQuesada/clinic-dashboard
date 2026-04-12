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
  bloqueado:              ['cancelado'],  // Block time: almoco, ferias, manutencao
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
  bloqueado:              'Bloqueado',
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
  bloqueado:              { color:'#6B7280', bg:'#F3F4F6' },
}

// ── Block Time: criar bloqueio de horario ─────────────────────
const BLOCK_REASONS = [
  { id:'almoco',      label:'Almoco' },
  { id:'intervalo',   label:'Intervalo' },
  { id:'reuniao',     label:'Reuniao' },
  { id:'manutencao',  label:'Manutencao' },
  { id:'ferias',      label:'Ferias' },
  { id:'pessoal',     label:'Pessoal' },
  { id:'outro',       label:'Outro' },
]

function createBlockTime(data, horaInicio, horaFim, profissionalIdx, motivo) {
  if (!window.getAppointments || !window.saveAppointments) return null
  var appts = getAppointments()
  var profs = window.getProfessionals ? getProfessionals() : []
  var prof = profs[profissionalIdx] || {}
  var block = {
    id:               'block_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
    pacienteNome:     motivo || 'Bloqueado',
    pacienteId:       '',
    data:             data,
    horaInicio:       horaInicio,
    horaFim:          horaFim,
    profissionalIdx:  profissionalIdx,
    profissionalNome: prof.nome || prof.display_name || '',
    status:           'bloqueado',
    tipoConsulta:     'bloqueio',
    procedimento:     (BLOCK_REASONS.find(function(r){return r.id===motivo})||{}).label || motivo || 'Bloqueado',
    obs:              '',
    createdAt:        new Date().toISOString(),
  }
  appts.push(block)
  saveAppointments(appts)
  if (window.renderAgenda) renderAgenda()
  return block
}

window.createBlockTime = createBlockTime
window.BLOCK_REASONS   = BLOCK_REASONS

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

function _getQueue()    { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch(e) { return [] } }
function _saveQueue(q)  { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); if (window.sbSave) sbSave(QUEUE_KEY, q) } catch(e) { if (e.name === 'QuotaExceededError') { _clearOldLogs(); try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch(e2) { /* quota full */ } } } }
function _clearOldLogs() { try { var logs = JSON.parse(localStorage.getItem('clinicai_auto_logs')||'[]'); if (logs.length > 100) localStorage.setItem('clinicai_auto_logs', JSON.stringify(logs.slice(-50))); } catch(e) { /* silencioso */ } }

// ── Inline validation alert (replaces browser alert()) ──────
function _showInlineAlert(title, items, parentId) {
  var containerId = 'finValidationAlert'
  var old = document.getElementById(containerId); if (old) old.remove()
  var target = parentId ? document.getElementById(parentId) : document.querySelector('#smartFinalizeModal > div > div:nth-child(2)')
  if (!target) { if (window._showToast) _showToast(title, Array.isArray(items) ? items[0] : items, 'error'); else console.warn('[Validation]', title, items); return }
  var html = '<div id="' + containerId + '" style="position:sticky;top:0;z-index:10;margin:-18px -18px 12px;padding:12px 16px;background:#FEF2F2;border-bottom:2px solid #FCA5A5;animation:slideDown .2s ease">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div style="font-size:12px;font-weight:700;color:#991B1B">' + title + '</div>'
    + '<button onclick="document.getElementById(\'' + containerId + '\').remove()" style="background:none;border:none;cursor:pointer;color:#991B1B;font-size:16px">x</button>'
    + '</div>'
  if (Array.isArray(items) && items.length) {
    html += '<ul style="margin:6px 0 0;padding-left:18px;font-size:11px;color:#DC2626;line-height:1.8">'
    items.forEach(function(e) { html += '<li>' + e + '</li>' })
    html += '</ul>'
  } else if (items) {
    html += '<div style="font-size:11px;color:#DC2626;margin-top:4px">' + items + '</div>'
  }
  html += '</div>'
  target.insertAdjacentHTML('afterbegin', html)
  document.getElementById(containerId).scrollIntoView({ behavior:'smooth', block:'nearest' })
}

function scheduleAutomations(appt) {
  const dt = new Date(`${appt.data}T${appt.horaInicio}:00`)
  if (isNaN(dt.getTime())) return

  // ── Delegate to AutomationsEngine (reads rules from DB) ──
  // Engine is async (loads rules on first call). We call it fire-and-forget
  // but catch errors to prevent silent failures.
  if (window.AutomationsEngine) {
    AutomationsEngine.processAppointment(appt).catch(function(e) {
      console.error('[Agenda] Engine.processAppointment falhou:', e)
    })
  }

  // ── Client-side only: status change queue ──
  const q = _getQueue().filter(x => x.apptId !== appt.id)
  const push = (trigger, date, type) => q.push({
    id:          'aut_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
    apptId:      appt.id,
    trigger, type,
    scheduledAt: date.toISOString(),
    executed:    false,
    payload:     { pacienteNome: appt.pacienteNome, pacienteId: appt.pacienteId }
  })

  const d30 = new Date(dt); d30.setMinutes(d30.getMinutes()-30)
  push('30min_antes', d30, 'status_aguardando')

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
  if (['cancelado','no_show','finalizado'].includes(appt.status)) {
    _logAuto(appt.id, item.type, 'pulado')
    return
  }

  // WhatsApp messages are now handled server-side (wa_outbox with scheduled_at).
  // Only client-side actions remain here.

  if (item.type === 'status_aguardando' && ['confirmado','agendado','aguardando_confirmacao'].includes(appt.status)) {
    // 30min antes: mudar status para aguardando (client-side only)
    apptTransition(appt.id, 'aguardando', 'automacao')
    _logAuto(appt.id, item.type, 'executado')
    return
  }
  if (item.type === 'notif_interna') {
    _logAuto(appt.id, item.type, 'notificado')
    return
  }
  // Engine-scheduled alerts and tasks
  if (item.type === 'engine_alert' && item.payload) {
    if (window._showToast) _showToast('Automacao', item.payload.title || 'Alerta', item.payload.alertType || 'info')
    _logAuto(appt.id, item.type, 'executado')
    return
  }
  if (item.type === 'engine_task' && item.payload) {
    var tasks = JSON.parse(localStorage.getItem('clinic_op_tasks') || '[]')
    tasks.push({ id:'task_auto_'+Date.now(), tipo:'automacao', titulo:item.payload.title||'', responsavel:item.payload.assignee||'sdr', status:'pendente', prioridade:item.payload.priority||'normal', prazo:item.payload.deadlineHours ? new Date(Date.now()+item.payload.deadlineHours*3600000).toISOString() : null, apptId:item.apptId, createdAt:new Date().toISOString() })
    try { localStorage.setItem('clinic_op_tasks', JSON.stringify(tasks)); if (window.sbSave) sbSave('clinic_op_tasks', tasks) } catch(e) { /* quota */ }
    _logAuto(appt.id, item.type, 'executado')
    return
  }
  _logAuto(appt.id, item.type, 'ignorado')
}

function _logAuto(apptId, type, status) {
  const logs = JSON.parse(localStorage.getItem('clinicai_auto_logs') || '[]')
  logs.push({ id:'log_'+Date.now(), apptId, type, status, at:new Date().toISOString() })
  try { localStorage.setItem('clinicai_auto_logs', JSON.stringify(logs)) } catch(e) { /* quota */ }
}

// ── State Machine Transition ──────────────────────────────────────
// Alerta secretaria quando paciente chega na clinica e ha pagamento em aberto
function _alertPagamentoAberto(appt) {
  if (!appt) return
  var pagamentos = Array.isArray(appt.pagamentos) ? appt.pagamentos : []
  var abertos = pagamentos.filter(function(p) { return p.status !== 'pago' })
  // Compat: appts antigos so tem statusPagamento
  var statusLegacy = appt.statusPagamento
  var temAberto = abertos.length > 0 || (pagamentos.length === 0 && (statusLegacy === 'aberto' || statusLegacy === 'pendente' || statusLegacy === 'parcial'))
  if (!temAberto) return

  var totalAberto = abertos.reduce(function(s, p) { return s + (parseFloat(p.valor) || 0) }, 0)
  if (totalAberto === 0 && pagamentos.length === 0) {
    totalAberto = parseFloat(appt.valor) || 0
  }
  if (totalAberto <= 0) return

  var nome = appt.pacienteNome || 'Paciente'
  var msg = nome + ' chegou na clinica com PAGAMENTO EM ABERTO de R$ ' + totalAberto.toFixed(2).replace('.', ',') + '. Cobrar antes de iniciar o atendimento.'

  if (window.Modal) {
    Modal.alert({ title: 'Pagamento em aberto', message: msg, tone: 'warn' })
  } else if (window._showToast) {
    _showToast('Pagamento em aberto', msg, 'warning')
  }
}

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

  // Alerta de pagamento em aberto quando paciente chega na clinica
  if (newStatus === 'na_clinica') _alertPagamentoAberto(appt)

  // Aplicar tag correspondente ao status (cérebro do sistema)
  const tagId = STATUS_TAG_MAP[newStatus]
  if (tagId) _applyStatusTag(appt, tagId, by || 'automação')

  // Automações por transição
  if (newStatus === 'agendado' || newStatus === 'remarcado') scheduleAutomations(appt)
  if (newStatus === 'cancelado' || newStatus === 'no_show') {
    const q = _getQueue().map(x => x.apptId === id ? {...x, executed:true} : x)
    _saveQueue(q)
    if (window._sbShared) {
      window._sbShared.rpc('wa_outbox_cancel_by_appt', { p_appt_ref: id })
        .catch(function(e) { console.warn('[Agenda] cancel_by_appt falhou:', e) })
    }
  }

  // ── AutomationsEngine: dispatch on_status rules ──
  if (window.AutomationsEngine) {
    AutomationsEngine.processStatusChange(appt, newStatus).catch(function(e) { console.error('[Agenda] Engine.processStatusChange falhou:', e) })
    if (newStatus === 'finalizado') AutomationsEngine.processFinalize(appt).catch(function(e) { console.error('[Agenda] Engine.processFinalize falhou:', e) })
  }

  // Hook SDR unificado: disparar regras (fase muda APENAS no confirmFinalize, nao aqui)
  if (appt.pacienteId && window.SdrService) {
    if (newStatus === 'finalizado') {
      SdrService.onLeadAttended(appt.pacienteId)
      // NAO mudar fase aqui — fase muda no confirmFinalize() apos check do modal
    }
  }

  // Alexa: boas-vindas na recepcao + aviso na sala
  if (newStatus === 'na_clinica' && window.AlexaNotificationService) {
    AlexaNotificationService.notifyArrival(appt).catch(function(e) { console.warn('[Agenda] Alexa notify falhou:', e) })
  }

  // Documentos legais: auto-gerar por status
  if (window.LegalDocumentsService) {
    LegalDocumentsService.autoSendForStatus(newStatus, appt).catch(function(e) { console.warn('[Agenda] Legal docs falhou:', e) })
  }

  // Ações contextuais (checklists + recovery modals only)
  if (newStatus === 'na_clinica') setTimeout(() => _showChecklist(appt, 'na_clinica'), 200)
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
  try { localStorage.setItem('clinic_op_tasks', JSON.stringify(tasks)) } catch(e) { /* quota */ }
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

// ── Envio automatico de consentimentos via WhatsApp ─────────
function _enviarConsentimento(appt, tipo) {
  var phone = (_getPhone(appt) || '').replace(/\D/g, '')
  if (!phone || !window._sbShared) return

  var nome = appt.pacienteNome || 'Paciente'
  var clinica = window._getClinicaNome ? _getClinicaNome() : 'Clinica'

  var msgs = {
    imagem: 'Ola, *' + nome + '*!\n\nPara darmos continuidade ao seu atendimento, precisamos do seu consentimento para uso de imagem.\n\nPor favor, leia e confirme respondendo *ACEITO*:\n\nAutorizo o uso de imagens do meu rosto para fins de acompanhamento clinico e documentacao do tratamento.\n\n*' + clinica + '*',
    procedimento: 'Ola, *' + nome + '*!\n\nSegue o termo de consentimento do procedimento realizado hoje.\n\nPor favor, leia e confirme respondendo *ACEITO*:\n\nDeclaro que fui informada sobre o procedimento, seus beneficios, riscos e cuidados pos.\n\n*' + clinica + '*',
    pagamento: 'Ola, *' + nome + '*!\n\nSegue o termo de consentimento referente a forma de pagamento acordada (boleto/parcelamento).\n\nPor favor, confirme respondendo *ACEITO*:\n\nDeclaro que estou ciente das condicoes de pagamento acordadas.\n\n*' + clinica + '*',
  }

  var msg = msgs[tipo]
  if (!msg) return

  window._sbShared.rpc('wa_outbox_enqueue_appt', {
    p_phone: phone,
    p_content: msg,
    p_lead_name: nome
  }).then(function(res) {
    if (!res.error && window._showToast) {
      var labels = { imagem: 'Consent. Imagem', procedimento: 'Consent. Procedimento', pagamento: 'Consent. Pagamento' }
      _showToast('Consentimento enviado', (labels[tipo] || tipo) + ' para ' + nome, 'success')
    }
  }).catch(function(e) { console.warn('[Agenda] wa_enqueue consentimento falhou:', e) })

  _logAuto(appt.id, 'wa_consentimento_' + tipo, 'enviado')
}

// ── Documentos Legais — badge readonly (atualiza automaticamente) ──
function _docRow(label, isDone, doneText, pendingText) {
  var dot = isDone
    ? '<span style="width:8px;height:8px;border-radius:50%;background:#10B981;flex-shrink:0"></span>'
    : '<span style="width:8px;height:8px;border-radius:50%;background:#F59E0B;flex-shrink:0;animation:pulse 1.5s infinite"></span>'
  var statusText = isDone ? doneText : pendingText
  var statusColor = isDone ? '#10B981' : '#F59E0B'
  var borderColor = isDone ? '#BBF7D0' : '#FDE68A'
  var bgColor = isDone ? '#F0FDF4' : '#FFFBEB'
  return '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:' + bgColor + ';border-radius:6px;border:1px solid ' + borderColor + '">' +
    dot +
    '<div style="flex:1"><div style="font-size:11px;font-weight:600;color:#374151">' + label + '</div></div>' +
    '<span style="font-size:10px;font-weight:700;color:' + statusColor + '">' + statusText + '</span>' +
  '</div>'
}

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

  const procs = window.ApptSchema ? window.ApptSchema.getProcs(a) : (a.procedimentos || a.procedimentosRealizados || [])

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

    <div style="margin-top:14px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:12px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span style="font-size:10px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.06em">Documentos Legais</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${_docRow('Ficha de Anamnese', a.anamneseRespondida, 'Preenchida', 'Pendente')}
        ${_docRow('Consentimento de Imagem', a.consentimentoImagem === 'assinado' || a.consentimentoImagem === true, 'Assinado', 'Pendente')}
        ${_docRow('Consentimento de Procedimento', a.consentimentoProcedimento === 'assinado', 'Assinado', 'Pendente')}
        ${(a.formaPagamento==='boleto'||a.formaPagamento==='parcelado'||a.formaPagamento==='entrada_saldo') ? _docRow('Consentimento de Pagamento', a.consentimentoPagamento === 'assinado', 'Assinado', 'Pendente') : ''}
      </div>
      <button onclick="window._sendManualConsent('${a.id}')" style="width:100%;margin-top:8px;padding:7px;background:linear-gradient(135deg,#C9A96E,#D4B978);color:#1a1a2e;border:none;border-radius:7px;font-size:10px;font-weight:700;cursor:pointer">Enviar Consentimento Manual</button>
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
  mudanca_status:        'Mudança de status',
  edicao:                'Edição de dados',
  remarcacao_drag:       'Remarcação (drag & drop)',
  reagendamento_manual:  'Reagendamento (botão Reagendar)',
  remarcacao:            'Remarcação',
  cancelamento:          'Cancelamento',
  no_show:               'No-show',
  finalizacao:           'Finalização',
  fluxo_avaliacao_google: 'Fluxo: Avaliação Google',
  fluxo_parceria:        'Fluxo: Parceria',
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
        if (window.showValidationErrors) showValidationErrors(errs, 'Transicao nao permitida')
        else if (window._showToast) _showToast('Transicao bloqueada', errs[0], 'error')
        return
      }
    }
  }

  const ok = apptTransition(id, newStatus, 'manual')
  if (!ok) {
    if (window._showToast) _showToast('Transicao bloqueada', 'Transicao nao permitida no fluxo atual.', 'error')
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
let _finalAppt  = null

function openFinalizeModal(id) {
  _finalProcs = []
  _finalAppt  = null
  if (!window.getAppointments) return
  const appt = getAppointments().find(a=>a.id===id)
  if (!appt) return
  _finalAppt = appt
  // Pre-carrega procedimentos ja agendados (se houver) para iniciar o desconto
  if (Array.isArray(appt.procedimentos) && appt.procedimentos.length > 0) {
    _finalProcs = appt.procedimentos.map(function(p) { return { nome: p.nome, valor: parseFloat(p.valor) || 0 } })
  }
  _buildFinModal(id, appt)
}

// Calcula valor da consulta em aberto (paga ainda nao quitada)
function _finConsultaAberta(appt) {
  if (!appt) return 0
  if (appt.tipoConsulta !== 'avaliacao' || appt.tipoAvaliacao !== 'paga') return 0
  var pagamentos = Array.isArray(appt.pagamentos) ? appt.pagamentos : []
  if (pagamentos.length === 0) {
    return (appt.statusPagamento === 'pago') ? 0 : (parseFloat(appt.valor) || 0)
  }
  return pagamentos
    .filter(function(p) { return p.status !== 'pago' })
    .reduce(function(s, p) { return s + (parseFloat(p.valor) || 0) }, 0)
}

function _buildFinModal(id, appt) {
  let m = document.getElementById('smartFinalizeModal')
  if (!m) { m = document.createElement('div'); m.id = 'smartFinalizeModal'; document.body.appendChild(m) }

  const pmOpts = PAYMENT_METHODS.map(pm=>`<option value="${pm.id}" ${appt.formaPagamento===pm.id?'selected':''}>${pm.label}</option>`).join('')
  const isAvalPaga = appt.tipoConsulta==='avaliacao' && appt.tipoAvaliacao==='paga'

  // Build procedures catalog (nome → preco)
  var _finProcCatalog = {}
  try {
    var _techs = typeof getTechnologies === 'function' ? getTechnologies() : []
    var _procs = typeof getProcedimentos === 'function' ? getProcedimentos() : JSON.parse(localStorage.getItem('clinic_procedimentos') || '[]')
    _techs.forEach(function(t) { if (t.nome) _finProcCatalog[t.nome] = { preco: t.preco||0, preco_promo: t.preco_promo||0 } })
    _procs.forEach(function(p) { var n = p.nome||p.name; if (n) _finProcCatalog[n] = { preco: p.preco||0, preco_promo: p.preco_promo||0 } })
  } catch(e) { /* silencioso */ }
  window._finProcCatalog = _finProcCatalog
  var _finProcOpts = '<datalist id="apptProcList">' + Object.keys(_finProcCatalog).map(function(n){return '<option value="'+n+'"/>'}).join('') + '</datalist>'

  m.style.cssText = ''
  m.className = ''
  m.innerHTML = _finProcOpts + `
    <div class="modal-overlay modal-lg open dialog" onclick="if(event.target===this)closeFinalizeModal()">
      <div class="modal-box">
        <div class="modal-header">
          <div class="modal-header-info">
            <div class="modal-header-icon" style="background:#10B98115;color:#10B981">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div class="modal-title">Finalizar Atendimento</div>
              <div class="modal-subtitle">${appt.pacienteNome} · ${appt.data?_fmtD(appt.data):''} ${appt.horaInicio||''}</div>
            </div>
          </div>
          <button class="modal-close" onclick="closeFinalizeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:18px">

        <!-- ════ COLUNA ESQUERDA: Procedimentos + Financeiro ════ -->
        <div style="display:flex;flex-direction:column;gap:16px">

          <!-- Procedimentos -->
          <div>
            <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:7px">Procedimentos Realizados</div>
            <div id="finProcList">${_renderFinProcs()}</div>
            <div style="display:flex;gap:6px;margin-top:6px;align-items:center">
              <select id="finProcNome" onchange="finProcAutoPrice()" style="flex:1;padding:8px 10px;border:1.5px solid #7C3AED40;border-radius:8px;font-size:12px;outline:none;box-sizing:border-box;background:#fff">
                <option value="">Selecione o procedimento...</option>
                ${_buildFinProcOptions()}
              </select>
              <input id="finProcValor" type="text" readonly placeholder="R$" style="width:75px;padding:8px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;text-align:right;background:#F9FAFB;color:#10B981;font-weight:600;box-sizing:border-box">
              <button onclick="addFinProc()" style="padding:8px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700">+</button>
            </div>
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#F59E0B;cursor:pointer;margin-top:6px">
              <input type="checkbox" id="finDescontoCb" onchange="var r=document.getElementById('finDescontoRow');r.style.display=this.checked?'block':'none'" style="accent-color:#F59E0B;width:13px;height:13px"> Aplicar desconto
            </label>
            <div id="finDescontoRow" style="display:none;margin-top:4px">
              <input id="finDescontoVal" type="number" placeholder="Valor do desconto (R$)" step="0.01" style="width:100%;padding:7px 9px;border:1px solid #F59E0B40;border-radius:7px;font-size:12px;box-sizing:border-box">
            </div>
            <div id="finProcTotal" style="margin-top:8px;padding:8px 10px;background:#F5F3FF;border-radius:8px;font-size:13px;font-weight:700;color:#5B21B6;display:none"></div>
            <div id="finConsultaAlert" style="margin-top:8px;display:none"></div>
          </div>

          <!-- Financeiro -->
          <div style="background:#F9FAFB;padding:13px;border-radius:10px">
            <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:10px">Financeiro</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
              <div>
                <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Valor Total (R$)</label>
                <input id="finValor" type="number" step="0.01" placeholder="0,00" value="${appt.valor||''}" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:13px;font-weight:700" oninput="finPayChanged()">
              </div>
              <div>
                <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Forma de Pagamento</label>
                <select id="finFormaPag" onchange="finPayChanged()" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px">${pmOpts}</select>
              </div>
            </div>
            <div id="finPayDetails" style="margin-top:10px"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:9px">
              <div>
                <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Valor Pago (R$)</label>
                <input id="finPago" type="number" step="0.01" placeholder="0,00" value="${appt.valorPago||''}" oninput="finUpdateBalance()" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:13px">
              </div>
              <div>
                <label style="font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px">Status</label>
                <select id="finStatusPag" onchange="finPayChanged()" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px">
                  <option value="pendente" ${appt.statusPagamento==='pendente'?'selected':''}>Pendente</option>
                  <option value="parcial"  ${appt.statusPagamento==='parcial'?'selected':''}>Parcial</option>
                  <option value="pago"     ${appt.statusPagamento==='pago'?'selected':''}>Pago</option>
                </select>
              </div>
            </div>
            <div id="finBalInfo" style="margin-top:7px;font-size:11px;font-weight:600"></div>
          </div>

          ${isAvalPaga?`<div style="padding:9px 12px;background:#FFFBEB;border-radius:8px;border:1.5px solid #F59E0B"><div style="font-size:11px;font-weight:700;color:#92400E">Avaliacao Paga — confirme o pagamento antes de finalizar</div></div>`:''}

        </div>

        <!-- ════ COLUNA DIREITA: Fluxos + Routing + Obs ════ -->
        <div style="display:flex;flex-direction:column;gap:16px">

          <!-- Bloco 3: Fluxos pos-atendimento -->
          <div style="background:#F0FDF4;padding:13px;border-radius:10px;border:1px solid #D1FAE5">
            <div style="font-size:11px;font-weight:800;color:#065F46;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Fluxos Pos-Atendimento</div>
            <div id="finFlowChecks" style="display:flex;flex-direction:column;gap:7px" onchange="_finAutoRoute()">
              ${_buildFinFlowChecks()}
            </div>
          </div>

        <!-- Bloco 4: Routing de tags (próximo estado do paciente) -->
        <div style="background:#F5F3FF;padding:13px;border-radius:10px;border:1px solid #DDD6FE">
          <div style="font-size:11px;font-weight:800;color:#4C1D95;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Bloco 4 — Proximo Estado do Paciente</div>
          <div id="finRouteHint" style="display:none;font-size:11px;color:#D97706;font-weight:600;margin-bottom:8px;padding:6px 8px;background:#FFFBEB;border-radius:6px;border:1px solid #FDE68A"></div>
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

          <!-- Queixas do paciente -->
          <div id="finComplaintsSection" style="margin-bottom:12px">
            <label style="font-size:10px;font-weight:700;color:#7C3AED;display:block;margin-bottom:6px">QUEIXAS TRATADAS NESTA CONSULTA</label>
            <div id="finComplaintsList" style="font-size:11px;color:#9CA3AF">Carregando queixas...</div>
          </div>

          <div>
            <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:4px">Observa&#231;&#245;es Finais</label>
            <textarea id="finObs" rows="3" placeholder="Notas sobre o atendimento..." style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;resize:none;font-family:inherit">${appt.obsFinal||''}</textarea>
          </div>

        </div>
        <!-- ════ FIM COLUNA DIREITA ════ -->

      </div>

      </div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-ghost" onclick="closeFinalizeModal()">Cancelar</button>
        <button class="modal-btn modal-btn-primary" onclick="confirmFinalize('${id}')" style="flex:2">Confirmar Finaliza&#231;&#227;o</button>
      </div>
    </div></div>`

  // Renderiza alerta de consulta + atualiza total inicial
  setTimeout(function() { _finUpdateTotal() }, 0)

  // Carregar queixas do paciente async
  setTimeout(async function() {
    var el = document.getElementById('finComplaintsList')
    if (!el || !window.ComplaintsPanel) { if (el) el.innerHTML = '<span style="font-size:10px;color:#9CA3AF">Sistema de queixas nao disponivel</span>'; return }

    var patientId = appt.pacienteId || appt.patient_id || ''
    // Fallback: buscar lead ID pelo nome
    if (!patientId) {
      try {
        var leads = JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
        var nome = (appt.pacienteNome || appt.patient_name || '').toLowerCase()
        var lead = leads.find(function(l) { return (l.name||l.nome||'').toLowerCase() === nome })
        if (lead) patientId = lead.id
      } catch(e) {}
    }
    if (!patientId) { el.innerHTML = '<span style="font-size:10px;color:#9CA3AF">Paciente sem ID</span>'; return }

    try {
      var complaints = await ComplaintsPanel.loadComplaints(patientId)
      var pendentes = (complaints || []).filter(function(c) { return c.status === 'pendente' || c.status === 'em_tratamento' })

      if (!pendentes.length) { el.innerHTML = '<span style="font-size:10px;color:#9CA3AF">Nenhuma queixa pendente</span>'; return }

      // Carregar procedimentos
      var procs = []
      try {
        if (window._sbShared) { var r = await window._sbShared.from('clinic_procedimentos').select('nome').eq('ativo', true).order('nome'); procs = r.data || [] }
      } catch(e) {}
      var procOpts = '<option value="">Procedimento...</option>' + procs.map(function(p) { return '<option value="' + p.nome.replace(/"/g,'&quot;') + '">' + p.nome.replace(/</g,'&lt;') + '</option>' }).join('') + '<option value="__outro__">Outro</option>'
      var retouchOpts = '<option value="7">1 semana</option><option value="15">15 dias</option><option value="30">1 m&#234;s</option><option value="60">2 meses</option><option value="90">3 meses</option><option value="120" selected>4 meses</option><option value="150">5 meses</option><option value="180">6 meses</option><option value="365">1 ano</option>'

      var html = ''
      pendentes.forEach(function(c) {
        html += '<div style="padding:6px 0;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;gap:8px">'
          + '<input type="checkbox" class="finComplaintCb" data-cid="' + c.id + '" style="width:14px;height:14px;accent-color:#7C3AED" />'
          + '<span style="font-size:11px;color:#111;font-weight:500;flex:1">' + (c.complaint||'').replace(/</g,'&lt;') + '</span>'
          + '<select class="finComplaintProc" data-cid="' + c.id + '" style="padding:4px 6px;border:1px solid #E5E7EB;border-radius:4px;font-size:10px;max-width:140px">' + procOpts + '</select>'
          + '<select class="finComplaintRetouch" data-cid="' + c.id + '" style="padding:4px 6px;border:1px solid #E5E7EB;border-radius:4px;font-size:10px;width:80px">' + retouchOpts + '</select>'
          + '</div>'
      })
      el.innerHTML = html
    } catch (e) {
      el.innerHTML = '<span style="font-size:10px;color:#EF4444">Erro: ' + e.message + '</span>'
    }
  }, 100)
}

function _buildFinFlowChecks() {
  var checks = []
  var _lbl = 'display:flex;align-items:center;gap:7px;font-size:12px;color:#374151;cursor:pointer'
  var _chk = 'width:14px;height:14px;accent-color:#10B981'

  // Dynamic: load on_finalize + d_after rules from AutomationsEngine cache
  if (window.AgendaAutomationsService) {
    var rules = AgendaAutomationsService.getActive().filter(function(r) {
      return r.trigger_type === 'on_finalize' || r.trigger_type === 'd_after'
    })
    rules.forEach(function(r) {
      var icon = r.channel === 'whatsapp' ? 'WhatsApp' : r.channel === 'alert' ? 'Alerta' : r.channel === 'task' ? 'Tarefa' : 'Auto'
      var label = r.name
      if (r.trigger_type === 'd_after') {
        var cfg = r.trigger_config || {}
        label += ' (D+' + (cfg.days||1) + ')'
      }
      checks.push({
        id: 'finAuto_' + r.id.replace(/-/g,'').slice(0,8),
        ruleId: r.id,
        label: icon + ': ' + label,
        checked: r.is_active,
        fromEngine: true,
      })
    })
  }

  // Fallback fixed checks if engine not loaded
  if (!checks.length) {
    checks = [
      { id:'finWAPos',          label:'Enviar WhatsApp p\u00f3s-atendimento (cuidados)', checked:true },
      { id:'finAvalGoogle',     label:'Solicitar avalia\u00e7\u00e3o Google',                  checked:true },
      { id:'finGerarRetorno',   label:'Gerar retorno / pr\u00f3ximo agendamento',         checked:true },
      { id:'finFluxoParceria',  label:'Fluxo de parceria / indica\u00e7\u00e3o',               checked:false },
      { id:'finEnviarOrcamento',label:'Enviar or\u00e7amento',                            checked:true },
    ]
  }

  // Always ensure "Enviar orcamento" exists and is checked by default
  var hasOrc = checks.some(function(c) { return c.id === 'finEnviarOrcamento' || /orcamento/i.test(c.label) })
  if (!hasOrc) {
    checks.push({ id:'finEnviarOrcamento', label:'Enviar orcamento', checked:true })
  }

  return checks.map(function(c) {
    return '<label style="' + _lbl + '">' +
      '<input type="checkbox" id="' + c.id + '" ' + (c.checked?'checked ':'') +
      (c.ruleId ? 'data-rule-id="' + c.ruleId + '" ' : '') +
      'style="' + _chk + '"> ' + c.label + '</label>'
  }).join('')
}

function _renderFinProcs() {
  if (!_finalProcs.length) return '<div style="font-size:11px;color:#9CA3AF;padding:4px 0">Nenhum procedimento adicionado</div>'
  return _finalProcs.map(function(p,i) {
    var descontoInfo = ''
    if (p.desconto > 0) {
      var pct = p.precoOriginal > 0 ? Math.round((p.desconto / p.precoOriginal) * 100) : 0
      descontoInfo = '<div style="font-size:10px;color:#F59E0B;font-weight:600">Desc: -R$ ' + _fmtBRL(p.desconto) + ' (' + pct + '%)</div>'
    }
    var valorFinal = ((p.precoOriginal || 0) - (p.desconto || 0)) * (p.qtd || 1)
    return '<div style="display:flex;align-items:center;gap:7px;padding:6px 0;border-bottom:1px solid #F3F4F6">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:12px;font-weight:600;color:#374151">' + (window.escHtml||String)(p.nome) + ' <span style="color:#9CA3AF;font-weight:400">x' + p.qtd + '</span></div>' +
        (p.precoOriginal > 0 ? '<div style="font-size:11px;color:#10B981;font-weight:600">R$ ' + _fmtBRL(p.precoOriginal) + '/un</div>' : '') +
        descontoInfo +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
        (valorFinal > 0 ? '<div style="font-size:13px;font-weight:800;color:#5B21B6">R$ ' + _fmtBRL(valorFinal) + '</div>' : '') +
        '<div style="display:flex;gap:3px;margin-top:2px">' +
          '<button onclick="finProcDesconto(' + i + ')" style="background:none;border:1px solid #E5E7EB;border-radius:4px;cursor:pointer;color:#F59E0B;font-size:10px;padding:1px 5px;font-weight:600" title="Desconto">%</button>' +
          '<button onclick="removeFinProc(' + i + ')" style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:16px;line-height:1;padding:0 2px">x</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  }).join('')
}

function addFinProc() {
  var sel = document.getElementById('finProcNome')
  var n = (sel?.value||'').trim()
  if (!n) return
  var info = _findProcInCatalog(n) || {}
  var preco = info.preco || 0
  _finalProcs.push({ nome:n, qtd:1, precoOriginal:preco, desconto:0 })
  document.getElementById('finProcList').innerHTML = _renderFinProcs()
  if (sel) sel.value = ''
  var valEl = document.getElementById('finProcValor')
  if (valEl) valEl.value = ''
  _finUpdateTotal()
  _finAutoRoute()
}

function removeFinProc(i) {
  _finalProcs.splice(i,1)
  document.getElementById('finProcList').innerHTML = _renderFinProcs()
  _finUpdateTotal()
  _finAutoRoute()
}

// Auto-route logic:
// - Procedimento pago     → paciente
// - Procedimento cortesia → orcamento (registra proc, mas nao e paciente ate pagar)
// - Procedimento + orcamento check → pac_orcamento (se pago) ou orcamento (se cortesia)
// - Sem procedimento      → orcamento (consulta + orcamento)
function _finAutoRoute() {
  var hasProc = _finalProcs.length > 0
  var forma = document.getElementById('finFormaPag')?.value || ''
  var isCortesia = forma === 'cortesia'

  var hasOrc = false
  // Check for orcamento in fixed or dynamic checks
  var orcCheck = document.getElementById('finEnviarOrcamento')
  if (orcCheck && orcCheck.checked) hasOrc = true
  document.querySelectorAll('#finFlowChecks input[type=checkbox]').forEach(function(cb) {
    if (cb.labels && cb.labels[0] && /orcamento/i.test(cb.labels[0].textContent) && cb.checked) hasOrc = true
  })

  var target = 'nenhum'
  if (hasProc && isCortesia) {
    // Cortesia: procedimento registrado mas vai pra orcamento (nao e paciente ate pagar)
    target = 'orcamento'
  } else if (hasProc && hasOrc) {
    target = 'pac_orcamento'
  } else if (hasProc) {
    target = 'paciente'
  } else {
    // Sem procedimento = consulta, vai pra orcamento
    target = 'orcamento'
  }

  var radio = document.querySelector('input[name="finRoute"][value="' + target + '"]')
  if (radio) { radio.checked = true; finRouteChange() }

  // Show hint about cortesia routing
  var hint = document.getElementById('finRouteHint')
  if (hint) {
    if (hasProc && isCortesia) {
      hint.style.display = 'block'
      hint.textContent = 'Cortesia: procedimento registrado, mas so vira Paciente quando pagar.'
    } else {
      hint.style.display = 'none'
    }
  }
}

function _buildFinProcOptions() {
  var cat = window._finProcCatalog || {}
  var byCategoria = {}
  // Agrupar por categoria
  try {
    var procs = typeof getProcedimentos === 'function' ? getProcedimentos() : JSON.parse(localStorage.getItem('clinic_procedimentos') || '[]')
    procs.forEach(function(p) {
      var c = p.categoria || 'outro'
      if (!byCategoria[c]) byCategoria[c] = []
      byCategoria[c].push(p.nome || p.name || '')
    })
  } catch(e) {}

  // Se nao tem categorias, usar catalogo flat
  if (!Object.keys(byCategoria).length) {
    return Object.keys(cat).map(function(n) { return '<option value="' + n.replace(/"/g,'&quot;') + '">' + n.replace(/</g,'&lt;') + '</option>' }).join('')
  }

  var html = ''
  var catLabels = { injetavel:'Injet\u00e1veis', tecnologia:'Tecnologias', manual:'Manuais', integrativo:'Integrativos' }
  Object.keys(byCategoria).forEach(function(c) {
    html += '<optgroup label="' + (catLabels[c] || c.charAt(0).toUpperCase() + c.slice(1)) + '">'
    byCategoria[c].forEach(function(n) { html += '<option value="' + n.replace(/"/g,'&quot;') + '">' + n.replace(/</g,'&lt;') + '</option>' })
    html += '</optgroup>'
  })
  return html
}

function _findProcInCatalog(nome) {
  var cat = window._finProcCatalog || {}
  if (cat[nome]) return cat[nome]
  var nLow = (nome||'').toLowerCase()
  var keys = Object.keys(cat)
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === nLow) return cat[keys[i]]
  }
  for (var j = 0; j < keys.length; j++) {
    if (keys[j].toLowerCase().indexOf(nLow) >= 0 || nLow.indexOf(keys[j].toLowerCase()) >= 0) return cat[keys[j]]
  }
  return null
}

function finProcAutoPrice() {
  var n = (document.getElementById('finProcNome')?.value||'').trim()
  var info = _findProcInCatalog(n)
  var valEl = document.getElementById('finProcValor')
  if (valEl && info && info.preco > 0) {
    valEl.value = 'R$ ' + _fmtBRL(info.preco)
  } else if (valEl) {
    valEl.value = ''
  }
}

function finProcDesconto(i) {
  var p = _finalProcs[i]; if (!p) return
  var atual = p.desconto || 0
  var input = prompt('Valor do desconto (R$) para "' + p.nome + '":\n(Preco original: R$ ' + _fmtBRL(p.precoOriginal) + ')', atual.toFixed(2))
  if (input === null) return
  var val = parseFloat(input.replace(',','.')) || 0
  if (val < 0) val = 0
  if (val > p.precoOriginal) val = p.precoOriginal
  _finalProcs[i].desconto = val
  document.getElementById('finProcList').innerHTML = _renderFinProcs()
  _finUpdateTotal()
}

function _finUpdateTotal() {
  var total = 0
  _finalProcs.forEach(function(p) { total += ((p.precoOriginal||0) - (p.desconto||0)) * (p.qtd||1) })
  var consultaAberta = _finConsultaAberta(_finalAppt)
  // Quando ha procedimentos adicionados, a consulta paga vira "cortesia"
  // (descontada do total dos procedimentos)
  var totalFinal = total
  if (_finalProcs.length > 0 && consultaAberta > 0) {
    totalFinal = Math.max(0, total - consultaAberta)
  }
  var el = document.getElementById('finProcTotal')
  if (el) {
    if (_finalProcs.length && total > 0) {
      el.style.display = 'block'
      var info = 'Total Procedimentos: R$ ' + _fmtBRL(total)
      if (consultaAberta > 0) {
        info += '<br><span style="font-size:11px;color:#16A34A">- Consulta R$ ' + _fmtBRL(consultaAberta) + ' (cortesia ao fechar procedimento)</span>'
        info += '<br><span style="color:#5B21B6">= Total a cobrar: R$ ' + _fmtBRL(totalFinal) + '</span>'
      }
      el.innerHTML = info
    } else {
      el.style.display = 'none'
    }
  }
  // Auto-fill financial total (com desconto da consulta aplicado)
  var finValor = document.getElementById('finValor')
  if (finValor && totalFinal > 0) finValor.value = totalFinal.toFixed(2)
  _finRenderConsultaAlert()
}

// Mostra alerta quando finalizando consulta paga sem procedimento adicionado
function _finRenderConsultaAlert() {
  var holder = document.getElementById('finConsultaAlert')
  if (!holder) return
  var consultaAberta = _finConsultaAberta(_finalAppt)
  if (consultaAberta > 0 && _finalProcs.length === 0) {
    holder.style.display = 'block'
    holder.innerHTML =
      '<div style="padding:10px 12px;background:#FEF3C7;border:1.5px solid #F59E0B;border-radius:8px">' +
        '<div style="font-size:12px;font-weight:800;color:#92400E;margin-bottom:3px">Cobrar consulta antes de finalizar</div>' +
        '<div style="font-size:11px;color:#92400E">Consulta paga em aberto: R$ ' + _fmtBRL(consultaAberta) + '. Adicione um procedimento para descontar ou registre o pagamento abaixo.</div>' +
      '</div>'
    var finValor = document.getElementById('finValor')
    if (finValor && (!finValor.value || parseFloat(finValor.value) === 0)) {
      finValor.value = consultaAberta.toFixed(2)
    }
  } else {
    holder.style.display = 'none'
    holder.innerHTML = ''
  }
}

// ── Dynamic payment fields per method ─────────────────────────────
function finPayChanged() {
  var forma = document.getElementById('finFormaPag')?.value || ''
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var el = document.getElementById('finPayDetails')
  if (!el) return

  var s = 'font-size:10px;color:#9CA3AF;font-weight:700;display:block;margin-bottom:3px'
  var inp = 'width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px'
  var html = ''

  if (forma === 'credito') {
    html = '<div style="background:#EFF6FF;padding:10px;border-radius:8px;border:1px solid #BFDBFE">' +
      '<div style="font-size:10px;font-weight:800;color:#1D4ED8;margin-bottom:8px">CARTAO DE CREDITO</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:6px">' +
        '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="radio" name="finCredTipo" value="avista" checked onchange="finCredChanged()"> A Vista</label>' +
        '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="radio" name="finCredTipo" value="parcelado" onchange="finCredChanged()"> Parcelado</label>' +
      '</div>' +
      '<div id="finCredParc" style="display:none">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div><label style="'+s+'">Parcelas</label><select id="finCredNParc" onchange="finCredCalc()" style="'+inp+'">' +
            [2,3,4,5,6,7,8,9,10,11,12].map(function(n){return '<option value="'+n+'">'+n+'x</option>'}).join('') +
          '</select></div>' +
          '<div><label style="'+s+'">Valor Parcela</label><input id="finCredValParc" type="text" readonly style="'+inp+';background:#F3F4F6;font-weight:700"></div>' +
        '</div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'parcelado') {
    html = '<div style="background:#FFF7ED;padding:10px;border-radius:8px;border:1px solid #FED7AA">' +
      '<div style="font-size:10px;font-weight:800;color:#C2410C;margin-bottom:8px">PARCELAMENTO</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
        '<div><label style="'+s+'">Parcelas</label><select id="finParcN" onchange="finParcCalc()" style="'+inp+'">' +
          [2,3,4,5,6,7,8,9,10,11,12].map(function(n){return '<option value="'+n+'">'+n+'x</option>'}).join('') +
        '</select></div>' +
        '<div><label style="'+s+'">Valor Parcela</label><input id="finParcVal" type="text" readonly style="'+inp+';background:#F3F4F6;font-weight:700"></div>' +
        '<div><label style="'+s+'">1o Vencimento</label><input id="finParcData" type="date" style="'+inp+'"></div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'entrada_saldo') {
    html = '<div style="background:#F0FDF4;padding:10px;border-radius:8px;border:1px solid #BBF7D0">' +
      '<div style="font-size:10px;font-weight:800;color:#166534;margin-bottom:8px">ENTRADA + SALDO</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label style="'+s+'">Valor Entrada (R$)</label><input id="finEntradaVal" type="number" step="0.01" placeholder="0,00" oninput="finEntradaCalc()" style="'+inp+'"></div>' +
        '<div><label style="'+s+'">Forma Entrada</label><select id="finEntradaForma" style="'+inp+'">' +
          '<option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="debito">Debito</option><option value="credito">Credito</option></select></div>' +
        '<div><label style="'+s+'">Saldo Restante</label><input id="finSaldoVal" type="text" readonly style="'+inp+';background:#F3F4F6;font-weight:700;color:#DC2626"></div>' +
        '<div><label style="'+s+'">Forma Saldo</label><select id="finSaldoForma" style="'+inp+'">' +
          '<option value="boleto">Boleto</option><option value="pix">PIX</option><option value="credito">Credito</option><option value="parcelado">Parcelado</option></select></div>' +
        '<div style="grid-column:span 2"><label style="'+s+'">Vencimento Saldo</label><input id="finSaldoData" type="date" style="'+inp+'"></div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'boleto') {
    html = '<div style="background:#FFFBEB;padding:10px;border-radius:8px;border:1px solid #FDE68A">' +
      '<div style="font-size:10px;font-weight:800;color:#92400E;margin-bottom:8px">BOLETO</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
        '<div><label style="'+s+'">Parcelas</label><select id="finBoletoN" onchange="finBoletoCalc()" style="'+inp+'">' +
          [1,2,3,4,5,6].map(function(n){return '<option value="'+n+'">'+(n===1?'A vista':n+'x')+'</option>'}).join('') +
        '</select></div>' +
        '<div><label style="'+s+'">Valor Parcela</label><input id="finBoletoVal" type="text" readonly style="'+inp+';background:#F3F4F6;font-weight:700"></div>' +
        '<div><label style="'+s+'">1o Vencimento</label><input id="finBoletoData" type="date" style="'+inp+'"></div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'dinheiro') {
    html = '<div style="background:#ECFDF5;padding:10px;border-radius:8px;border:1px solid #A7F3D0">' +
      '<div style="font-size:10px;font-weight:800;color:#065F46;margin-bottom:8px">DINHEIRO</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label style="'+s+'">Recebido (R$)</label><input id="finDinRecebido" type="number" step="0.01" oninput="finDinCalc()" style="'+inp+'"></div>' +
        '<div><label style="'+s+'">Troco</label><input id="finDinTroco" type="text" readonly style="'+inp+';background:#F3F4F6;font-weight:700;color:#059669"></div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'cortesia') {
    html = '<div style="background:#FEF2F2;padding:10px;border-radius:8px;border:1px solid #FECACA">' +
      '<div style="font-size:10px;font-weight:800;color:#991B1B;margin-bottom:8px">CORTESIA</div>' +
      '<div><label style="'+s+'">Motivo da cortesia (obrigatorio)</label><input id="finCortesiaMotivo" type="text" placeholder="Ex: primeira consulta, parceria..." style="'+inp+'"></div>' +
    '</div>'
  }

  else if (forma === 'convenio') {
    html = '<div style="background:#EDE9FE;padding:10px;border-radius:8px;border:1px solid #C4B5FD">' +
      '<div style="font-size:10px;font-weight:800;color:#5B21B6;margin-bottom:8px">CONVENIO</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label style="'+s+'">Nome do Convenio</label><input id="finConvNome" type="text" placeholder="Ex: Unimed, Amil..." style="'+inp+'"></div>' +
        '<div><label style="'+s+'">N. Autorizacao</label><input id="finConvAuth" type="text" placeholder="Numero" style="'+inp+'"></div>' +
      '</div>' +
    '</div>'
  }

  else if (forma === 'link') {
    html = '<div style="background:#F0F9FF;padding:10px;border-radius:8px;border:1px solid #BAE6FD">' +
      '<div style="font-size:10px;font-weight:800;color:#0369A1;margin-bottom:8px">LINK DE PAGAMENTO</div>' +
      '<div><label style="'+s+'">URL do Link</label><input id="finLinkUrl" type="url" placeholder="https://..." style="'+inp+'"></div>' +
    '</div>'
  }

  el.innerHTML = html

  // Auto-calc on render
  if (forma === 'credito') finCredChanged()
  if (forma === 'parcelado') finParcCalc()
  if (forma === 'boleto') finBoletoCalc()
  if (forma === 'cortesia') {
    var pago = document.getElementById('finPago'); if (pago) pago.value = '0'
    var stat = document.getElementById('finStatusPag'); if (stat) stat.value = 'pago'
  }

  finUpdateBalance()
  _finAutoRoute()
}

// ── Credit card: a vista / parcelado toggle ──
function finCredChanged() {
  var tipo = document.querySelector('input[name="finCredTipo"]:checked')?.value
  var parcDiv = document.getElementById('finCredParc')
  if (parcDiv) parcDiv.style.display = tipo === 'parcelado' ? 'block' : 'none'
  if (tipo === 'parcelado') finCredCalc()
}

function finCredCalc() {
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var n = parseInt(document.getElementById('finCredNParc')?.value || '2')
  var el = document.getElementById('finCredValParc')
  if (el && total > 0) el.value = 'R$ ' + _fmtBRL(total / n)
}

// ── Parcelado calc ──
function finParcCalc() {
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var n = parseInt(document.getElementById('finParcN')?.value || '2')
  var el = document.getElementById('finParcVal')
  if (el && total > 0) el.value = 'R$ ' + _fmtBRL(total / n)
}

// ── Boleto calc ──
function finBoletoCalc() {
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var n = parseInt(document.getElementById('finBoletoN')?.value || '1')
  var el = document.getElementById('finBoletoVal')
  if (el && total > 0) el.value = 'R$ ' + _fmtBRL(total / n)
}

// ── Entrada + Saldo calc ──
function finEntradaCalc() {
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var entrada = parseFloat(document.getElementById('finEntradaVal')?.value || '0')
  var saldo = total - entrada
  var el = document.getElementById('finSaldoVal')
  if (el) el.value = saldo > 0 ? 'R$ ' + _fmtBRL(saldo) : 'R$ 0,00'
  // Auto-fill valor pago = entrada
  var pago = document.getElementById('finPago')
  if (pago) { pago.value = entrada.toFixed(2); finUpdateBalance() }
}

// ── Dinheiro: troco ──
function finDinCalc() {
  var total = parseFloat(document.getElementById('finValor')?.value || '0')
  var recebido = parseFloat(document.getElementById('finDinRecebido')?.value || '0')
  var troco = recebido - total
  var el = document.getElementById('finDinTroco')
  if (el) el.value = troco > 0 ? 'R$ ' + _fmtBRL(troco) : '—'
  // Auto-fill valor pago
  var pago = document.getElementById('finPago')
  if (pago && recebido > 0) { pago.value = Math.min(recebido, total).toFixed(2); finUpdateBalance() }
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

function closeFinalizeModal(force) {
  if (!force) {
    // Perguntar antes de fechar — dados podem ser perdidos
    var hasData = _finalProcs.length > 0 || parseFloat(document.getElementById('finValor')?.value||'0') > 0
    if (hasData) {
      if (!confirm('Tem dados preenchidos. Deseja sair sem finalizar?\n\nOs dados serao perdidos.')) return
    }
  }
  const m = document.getElementById('smartFinalizeModal'); if(m) m.style.display='none'
}

var _finalizingInProgress = false

// Converte um pagamento "classic" (forma + pagDetalhes object) pra
// uma linha do array pagamentos[] canônico.
function _detalhesToPagamento(forma, valorTotal, valorPago, statusPag, det) {
  if (!forma) return null
  det = det || {}
  var status = (statusPag === 'pago' || valorPago >= valorTotal) ? 'pago' : 'aberto'
  var parcelas = 1
  if (forma === 'credito' && det.tipo === 'parcelado') parcelas = parseInt(det.parcelas) || 1
  else if (forma === 'parcelado') parcelas = parseInt(det.parcelas) || 1
  else if (forma === 'boleto' && det.parcelas) parcelas = parseInt(det.parcelas) || 1
  var valorParcela = parcelas > 0 ? Math.round((valorTotal / parcelas) * 100) / 100 : valorTotal

  var pag = {
    forma: forma,
    valor: parseFloat(valorTotal) || 0,
    status: status,
    parcelas: parcelas,
    valorParcela: valorParcela,
    comentario: '',
  }
  if (forma === 'cortesia') pag.motivoCortesia = det.motivo || ''
  if (forma === 'convenio') { pag.convenioNome = det.convenioNome || ''; pag.autorizacao = det.autorizacao || '' }
  if (forma === 'link')     pag.linkUrl = det.linkUrl || ''
  if (forma === 'dinheiro') { pag.recebido = parseFloat(det.recebido) || 0; pag.troco = parseFloat(det.troco) || 0 }
  if (det.primeiroVencimento) pag.primeiroVencimento = det.primeiroVencimento

  // Caso entrada_saldo: retorna 2 linhas seria mais correto, mas aqui
  // mantemos 1 linha com metadata pra não quebrar o array. O render lê ambas.
  if (forma === 'entrada_saldo') {
    pag.entrada = parseFloat(det.entrada) || 0
    pag.saldo = parseFloat(det.saldo) || (valorTotal - pag.entrada)
    pag.formaEntrada = det.formaEntrada || 'pix'
    pag.formaSaldo = det.formaSaldo || 'boleto'
    pag.vencimentoSaldo = det.vencimentoSaldo || ''
  }
  return pag
}

function confirmFinalize(id) {
  // Idempotency guard: prevent double-click
  if (_finalizingInProgress) return
  _finalizingInProgress = true

  // Re-enable after 3s safety timeout (in case of error)
  setTimeout(function() { _finalizingInProgress = false }, 3000)

  if (!window.getAppointments) { _finalizingInProgress = false; return }
  const appts = getAppointments()
  const idx = appts.findIndex(a=>a.id===id); if(idx<0) { _finalizingInProgress = false; return }
  const appt = appts[idx]

  // Already finalized? Prevent re-processing
  if (appt.status === 'finalizado') { _finalizingInProgress = false; _showInlineAlert('Consulta ja finalizada', 'Esta consulta ja foi finalizada anteriormente.'); return }

  const valor    = parseFloat(document.getElementById('finValor')?.value||'0')
  const pago     = parseFloat(document.getElementById('finPago')?.value||'0')
  const forma    = document.getElementById('finFormaPag')?.value
  const statusP  = document.getElementById('finStatusPag')?.value
  const obs      = document.getElementById('finObs')?.value?.trim()
  const waPos    = document.getElementById('finWAPos')?.checked
  const avalGoogle = document.getElementById('finAvalGoogle')?.checked
  const parceria = document.getElementById('finFluxoParceria')?.checked
  const route    = document.querySelector('input[name="finRoute"]:checked')?.value || 'nenhum'

  // ── Validacao completa ──
  var erros = []
  if (forma !== 'cortesia' && valor <= 0) erros.push('Informe o valor total')
  if (forma !== 'cortesia' && forma !== 'link' && statusP === 'pago' && pago <= 0) erros.push('Status "Pago" mas valor pago e zero')
  if (forma === 'cortesia') {
    var motivo = document.getElementById('finCortesiaMotivo')?.value?.trim()
    if (!motivo) erros.push('Informe o motivo da cortesia')
  }
  if (forma === 'convenio') {
    if (!(document.getElementById('finConvNome')?.value?.trim())) erros.push('Informe o nome do convenio')
  }
  if (forma === 'entrada_saldo') {
    var entVal = parseFloat(document.getElementById('finEntradaVal')?.value||'0')
    if (entVal <= 0) erros.push('Informe o valor da entrada')
    if (!(document.getElementById('finSaldoData')?.value)) erros.push('Informe o vencimento do saldo')
  }
  if (forma === 'parcelado' || (forma === 'credito' && document.querySelector('input[name="finCredTipo"]:checked')?.value === 'parcelado')) {
    // ok, auto-calculated
  }
  if (forma === 'boleto' && parseInt(document.getElementById('finBoletoN')?.value||'1') > 1) {
    if (!(document.getElementById('finBoletoData')?.value)) erros.push('Informe o 1o vencimento do boleto')
  }
  var routeVal = document.querySelector('input[name="finRoute"]:checked')?.value || 'nenhum'
  if (routeVal === 'nenhum') erros.push('Selecione o proximo estado do paciente (Bloco 4)')

  if (erros.length) {
    _finalizingInProgress = false
    _showInlineAlert('Corrija antes de finalizar', erros)
    return
  }

  // ── Confirmacao de seguranca ──
  var nomePac = appt.pacienteNome || 'Paciente'
  var routeLabel = { paciente:'Paciente', pac_orcamento:'Paciente + Or\u00e7amento', orcamento:'Or\u00e7amento', nenhum:'\u2014' }[routeVal] || routeVal
  var resumo = 'Tem certeza que quer finalizar a consulta de *' + nomePac + '*?\n\n'
    + 'Procedimentos: ' + (_finalProcs.length ? _finalProcs.map(function(p){return p.nome}).join(', ') : 'nenhum') + '\n'
    + 'Valor: R$ ' + _fmtBRL(valor) + '\n'
    + 'Pagamento: ' + (forma||'—') + '\n'
    + 'Destino: ' + routeLabel

  if (!confirm(resumo)) { _finalizingInProgress = false; return }

  // Collect payment details per method
  var pagDetalhes = { forma }
  if (forma === 'credito') {
    var credTipo = document.querySelector('input[name="finCredTipo"]:checked')?.value || 'avista'
    pagDetalhes.tipo = credTipo
    if (credTipo === 'parcelado') {
      pagDetalhes.parcelas = parseInt(document.getElementById('finCredNParc')?.value||'2')
      pagDetalhes.valorParcela = valor / pagDetalhes.parcelas
    }
  } else if (forma === 'parcelado') {
    pagDetalhes.parcelas = parseInt(document.getElementById('finParcN')?.value||'2')
    pagDetalhes.valorParcela = valor / pagDetalhes.parcelas
    pagDetalhes.primeiroVencimento = document.getElementById('finParcData')?.value || ''
  } else if (forma === 'entrada_saldo') {
    pagDetalhes.entrada = parseFloat(document.getElementById('finEntradaVal')?.value||'0')
    pagDetalhes.formaEntrada = document.getElementById('finEntradaForma')?.value || 'pix'
    pagDetalhes.saldo = valor - pagDetalhes.entrada
    pagDetalhes.formaSaldo = document.getElementById('finSaldoForma')?.value || 'boleto'
    pagDetalhes.vencimentoSaldo = document.getElementById('finSaldoData')?.value || ''
  } else if (forma === 'boleto') {
    pagDetalhes.parcelas = parseInt(document.getElementById('finBoletoN')?.value||'1')
    pagDetalhes.valorParcela = valor / pagDetalhes.parcelas
    pagDetalhes.primeiroVencimento = document.getElementById('finBoletoData')?.value || ''
  } else if (forma === 'dinheiro') {
    pagDetalhes.recebido = parseFloat(document.getElementById('finDinRecebido')?.value||'0')
    pagDetalhes.troco = Math.max(0, pagDetalhes.recebido - valor)
  } else if (forma === 'cortesia') {
    pagDetalhes.motivo = document.getElementById('finCortesiaMotivo')?.value || ''
    if (!pagDetalhes.motivo.trim()) { _finalizingInProgress = false; _showInlineAlert('Campo obrigatorio', 'Informe o motivo da cortesia'); return }
  } else if (forma === 'convenio') {
    pagDetalhes.convenioNome = document.getElementById('finConvNome')?.value || ''
    pagDetalhes.autorizacao = document.getElementById('finConvAuth')?.value || ''
  } else if (forma === 'link') {
    pagDetalhes.linkUrl = document.getElementById('finLinkUrl')?.value || ''
  }

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
    _finalizingInProgress = false; _showInlineAlert('Avaliacao paga', 'Registre o pagamento antes de finalizar.'); return
  }

  // Determinar status pagamento automático
  let spFinal = statusP
  if (pago>0 && valor>0 && pago>=valor) spFinal = 'pago'
  else if (pago>0) spFinal = 'parcial'

  // ═══ SCHEMA CANÔNICO ═══
  // Merge procedimentos: preserva agendamento (cortesia, retorno, motivo)
  // e marca os realizados com realizado=true + realizadoEm.
  const S = window.ApptSchema
  const procsAgendados = S ? S.getProcs(appt) : (appt.procedimentos || appt.procedimentosRealizados || [])
  const procsRealizados = _finalProcs.length ? _finalProcs.map(function(p) {
    return {
      nome:   p.nome || '',
      valor:  parseFloat(p.valor || p.preco || 0) || 0,
      qtd:    p.qtd || 1,
      realizado:   true,
      realizadoEm: new Date().toISOString(),
    }
  }) : procsAgendados
  const procsMerged = S ? S.mergeProcs(procsAgendados, procsRealizados) : procsRealizados

  // Merge pagamentos: converte pagDetalhes pro array canônico e faz append
  // Se o appt já tem pagamentos[] do agendamento, usa eles como base
  var pagamentosCanon = (appt.pagamentos && appt.pagamentos.length)
    ? appt.pagamentos.slice()
    : (S ? S.getPagamentos(appt) : [])
  // Adiciona o pagamento registrado na finalização
  var pagNovo = _detalhesToPagamento(forma, valor, pago, spFinal, pagDetalhes)
  if (pagNovo) {
    // Se já tem 1 linha sem forma (placeholder), substitui; senão, faz append
    if (pagamentosCanon.length === 1 && !pagamentosCanon[0].forma) {
      pagamentosCanon[0] = pagNovo
    } else {
      pagamentosCanon.push(pagNovo)
    }
  }

  // Agregados de cortesia (consumidos por relatórios Mira/cashflow)
  var valorCortesia = S ? S.deriveValorCortesia(procsMerged) : 0
  var qtdProcsCortesia = procsMerged.filter(function(p) { return p.cortesia }).length
  var motivoCortesia = procsMerged.filter(function(p) { return p.cortesia && p.cortesiaMotivo })
    .map(function(p) { return p.nome + ': ' + p.cortesiaMotivo }).join(' | ')

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
    // Schema canônico (nomes únicos em todo o sistema):
    procedimentos:          procsMerged,
    pagamentos:             pagamentosCanon,
    valorCortesia:          valorCortesia,
    qtdProcsCortesia:       qtdProcsCortesia,
    motivoCortesia:         motivoCortesia,
    // Derivados legacy pra compat retroativa:
    formaPagamento:         S ? S.deriveFormaPagamento(pagamentosCanon) : forma,
    statusPagamento:        S ? S.deriveStatusPagamento(pagamentosCanon) : spFinal,
    // Campos específicos da finalização:
    obsFinal:               obs,
    routingFinal:           route,
    finalizadoEm:           at,
    historicoStatus:        [...(appt.historicoStatus||[]),{status:'finalizado',at,by:'manual'}],
    historicoAlteracoes:    auditLog,
    // Legacy: manter temporariamente pra não quebrar consumidores antigos
    procedimentosRealizados: procsMerged,
    pagamentoDetalhes:       pagDetalhes,
  }
  saveAppointments(appts)

  const apptFinal = appts[idx]

  // Sync pro Supabase: garante que professional_id, value, status e
  // demais campos saiam do localStorage pro banco. Sem isso, o appointment
  // finalizado vive so local e relatorios por profissional/financeiros
  // ficam vazios.
  if (window.AppointmentsService && window.AppointmentsService.syncOne) {
    window.AppointmentsService.syncOne(apptFinal).catch(function(e) {
      console.warn('[Agenda] syncOne finalize falhou:', e)
    })
  }

  // Cashflow: cria entrada(s) automaticamente se houve pagamento
  if (window.CashflowService && pago > 0) {
    window.CashflowService.createFromAppointment({
      id:             apptFinal.id,
      date:           apptFinal.date || apptFinal.dataAgendamento,
      patient_id:     apptFinal.pacienteId || apptFinal.patient_id,
      pacienteName:   apptFinal.pacienteNome || apptFinal.patient_name,
      procedimento:   (procs[0] && (procs[0].nome || procs[0])) || 'Atendimento',
      valorPago:      pago,
      formaPagamento: forma,
      pagamentoDetalhes: pagDetalhes,
    }).catch(function(e) { console.warn('[Agenda] Cashflow create falhou:', e) })
  }

  // Queixas: atualizar queixas marcadas como tratadas
  if (window.ComplaintsPanel) {
    var cbs = document.querySelectorAll('.finComplaintCb:checked')
    cbs.forEach(function(cb) {
      var cid = cb.dataset.cid
      var procSel = document.querySelector('.finComplaintProc[data-cid="' + cid + '"]')
      var retouchSel = document.querySelector('.finComplaintRetouch[data-cid="' + cid + '"]')
      var proc = procSel ? procSel.value : ''
      if (proc === '__outro__') proc = 'Outro'
      var retouch = retouchSel ? parseInt(retouchSel.value) : 120
      if (proc) {
        ComplaintsPanel.saveComplaint({
          p_id: cid,
          p_status: 'em_tratamento',
          p_treatment_procedure: proc,
          p_treatment_date: new Date().toISOString(),
          p_retouch_interval_days: retouch,
          p_professional_name: apptFinal.profissionalNome || apptFinal.professional_name || '',
          p_appointment_id: apptFinal.id,
        }).catch(function(e) { console.warn('[Agenda] Complaint update falhou:', e) })
      }
    })
  }

  // Consentimentos: verificar se procedimento realizado tem TCLE pendente
  if (window.LegalDocumentsService && procs.length) {
    var _procNames = procs.map(function(p) { return p.nome || p }).filter(Boolean)
    _procNames.forEach(function(procName) {
      LegalDocumentsService.autoSendForStatus('na_clinica', {
        pacienteNome: apptFinal.pacienteNome || apptFinal.patient_name || '',
        pacienteTelefone: _getPhone(apptFinal),
        procedimento: procName,
        profissionalIdx: apptFinal.profissionalIdx,
        professional_id: apptFinal.professional_id,
        appointmentId: apptFinal.id,
      }).catch(function(e) { console.warn('[Agenda] Consent on finalize falhou:', e) })
    })
  }

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

  // Bloco 4: Routing — muda fase do lead baseado no resultado da consulta
  // Regra de negocio:
  //   procedimento realizado → paciente
  //   avaliacao + orcamento → orcamento
  //   paciente + orcamento → paciente (ja fez procedimento)
  //   nenhum (nao fez, pressao alta, urgencia) → mantem fase atual
  if (apptFinal.pacienteId && window.SdrService && SdrService.changePhase) {
    if (route === 'paciente' || route === 'pac_orcamento') {
      SdrService.changePhase(apptFinal.pacienteId, 'paciente', 'finalizacao')
    } else if (route === 'orcamento') {
      SdrService.changePhase(apptFinal.pacienteId, 'orcamento', 'finalizacao')
    }
    // route === 'nenhum' → NAO muda fase (compareceu mas nao realizou procedimento)
  }
  if (apptFinal.pacienteId) {

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

  // Enviar consentimento de procedimento automaticamente
  _enviarConsentimento(apptFinal, 'procedimento')

  // Enviar consentimento de pagamento se boleto/parcelado/entrada_saldo
  if (['boleto','parcelado','entrada_saldo'].includes(forma)) {
    _enviarConsentimento(apptFinal, 'pagamento')
  }

  // ── Payment tracking: criar tarefas de follow-up para pagamentos pendentes ──
  if (spFinal !== 'pago' && valor > 0 && ['boleto','parcelado','entrada_saldo','link'].includes(forma)) {
    var det = pagDetalhes || {}
    var venc = det.primeiroVencimento || det.vencimentoSaldo || ''
    var prazoH = venc ? Math.max(24, Math.round((new Date(venc+'T12:00:00').getTime() - Date.now()) / 3600000)) : 168 // 7 dias default
    var descPag = forma === 'boleto' ? (det.parcelas||1) + 'x boleto' :
                  forma === 'parcelado' ? (det.parcelas||1) + 'x parcelado' :
                  forma === 'entrada_saldo' ? 'Entrada R$ ' + _fmtBRL(det.entrada||0) + ' + saldo R$ ' + _fmtBRL(det.saldo||0) :
                  'Link pagamento'
    var payTasks = JSON.parse(localStorage.getItem('clinic_op_tasks') || '[]')
    payTasks.push({
      id:           'task_pay_' + Date.now(),
      tipo:         'pagamento',
      titulo:       'Follow-up pagamento: ' + (apptFinal.pacienteNome||'Paciente') + ' — ' + descPag,
      descricao:    'Valor total: R$ ' + _fmtBRL(valor) + ' | Pago: R$ ' + _fmtBRL(pago) + ' | Saldo: R$ ' + _fmtBRL(valor-pago) + (venc ? ' | Venc: ' + venc : ''),
      responsavel:  'secretaria',
      status:       'pendente',
      prioridade:   'alta',
      prazo:        new Date(Date.now() + prazoH * 3600000).toISOString(),
      apptId:       id,
      pacienteNome: apptFinal.pacienteNome,
      createdAt:    new Date().toISOString(),
    })
    try { localStorage.setItem('clinic_op_tasks', JSON.stringify(payTasks)) } catch(e) { /* quota */ }
  }

  _finalizingInProgress = false
  closeFinalizeModal(true)
  if (window._showToast) _showToast('Finalizado', apptFinal.pacienteNome + ' finalizado com sucesso', 'success')
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

// ── Resumo Diario — WhatsApp as 8h para o responsavel ────────────
var DAILY_SENT_KEY = 'clinicai_daily_summary_sent'

function _checkDailySummary() {
  var now = new Date()
  var todayIso = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0')
  var hora = now.getHours()
  var minuto = now.getMinutes()

  // So envia entre 8:00 e 8:05
  if (hora !== 8 || minuto > 5) return

  // Verificar se ja enviou hoje
  var lastSent = localStorage.getItem(DAILY_SENT_KEY)
  if (lastSent === todayIso) return

  // Marcar como enviado ANTES de enviar (evita duplicados)
  localStorage.setItem(DAILY_SENT_KEY, todayIso)

  // Buscar agendamentos do dia
  var appts = window.getAppointments ? getAppointments() : []
  var today = appts.filter(function(a) {
    return a.data === todayIso && a.status !== 'cancelado' && a.status !== 'no_show'
  }).sort(function(a, b) { return (a.horaInicio || '').localeCompare(b.horaInicio || '') })

  if (!today.length) return // Sem agendamentos, nao envia

  // Buscar telefone do responsavel
  var profs = window.getProfessionals ? getProfessionals() : []
  // Buscar primeiro profissional com telefone (nao hardcodar nome)
  var responsavel = profs.find(function(p) { return !!(p.phone || p.whatsapp || p.telefone) }) || profs[0]
  var phone = responsavel && (responsavel.phone || responsavel.whatsapp || responsavel.telefone)
  if (!phone || !window._sbShared) return

  // Formatar mensagem elegante
  var clinica = window._getClinicaNome ? _getClinicaNome() : 'Clinica'
  var dias = ['Domingo','Segunda-feira','Terca-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sabado']
  var dia = dias[now.getDay()]
  var dataFmt = String(now.getDate()).padStart(2,'0') + '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear()

  var header = '*' + clinica + ' — Agenda do Dia*\n'
  header += dia + ', ' + dataFmt + '\n'
  header += today.length + ' agendamento' + (today.length > 1 ? 's' : '') + '\n'
  header += '━━━━━━━━━━━━━━\n\n'

  var body = today.map(function(a, i) {
    var nome = a.pacienteNome || 'Paciente'
    var proc = a.procedimento || a.tipoConsulta || '—'
    var hora = (a.horaInicio || '') + (a.horaFim ? ' - ' + a.horaFim : '')
    var obs = a.obs ? '\n   Obs: ' + a.obs : ''
    var status = (STATUS_LABELS[a.status] || a.status)

    return (i + 1) + '. *' + nome + '*\n' +
           '   ' + proc + '\n' +
           '   ' + hora + ' | ' + status +
           obs
  }).join('\n\n')

  var footer = '\n\n━━━━━━━━━━━━━━\n'
  footer += 'Bom dia e sucesso Dra. Mirian!'

  var msg = header + body + footer

  // Enviar (dividir se necessario — max ~4000 chars por msg)
  var parts = []
  if (msg.length <= 3800) {
    parts.push(msg)
  } else {
    // Dividir pacientes em grupos de 3
    var grupos = []
    for (var g = 0; g < today.length; g += 3) {
      grupos.push(today.slice(g, g + 3))
    }
    grupos.forEach(function(grupo, gi) {
      var partHeader = '*Agenda do Dia (' + (gi + 1) + '/' + grupos.length + ')*\n' + dia + ', ' + dataFmt + '\n━━━━━━━━━━━━━━\n\n'
      var partBody = grupo.map(function(a, i) {
        var idx = gi * 3 + i + 1
        var nome = a.pacienteNome || 'Paciente'
        var proc = a.procedimento || a.tipoConsulta || '—'
        var hora = (a.horaInicio || '') + (a.horaFim ? ' - ' + a.horaFim : '')
        var obs = a.obs ? '\n   Obs: ' + a.obs : ''
        return idx + '. *' + nome + '*\n   ' + proc + '\n   ' + hora + obs
      }).join('\n\n')
      if (gi === grupos.length - 1) partBody += '\n\n━━━━━━━━━━━━━━\nBom dia e sucesso Dra. Mirian!'
      parts.push(partHeader + partBody)
    })
  }

  // Enviar cada parte
  parts.forEach(function(part, pi) {
    setTimeout(function() {
      window._sbShared.rpc('wa_outbox_enqueue_appt', {
        p_phone: phone.replace(/\D/g, ''),
        p_content: part,
        p_lead_name: 'Sistema ClinicAI'
      })
    }, pi * 2000) // 2s entre cada mensagem
  })

  _logAuto('daily_summary', 'resumo_diario', 'enviado')
}

// ── Auto-sync appointments to Supabase ───────────────────────────
var APPT_SYNC_KEY = 'clinicai_appt_synced_v1'
function _autoSyncAppointments() {
  if (localStorage.getItem(APPT_SYNC_KEY) === 'done') return
  if (!window.AppointmentsService?.syncBatch) return
  AppointmentsService.syncBatch().then(function(res) {
    if (res && res.ok) {
      localStorage.setItem(APPT_SYNC_KEY, 'done')
      console.info('[AutoSync] Appointments synced to Supabase:', res)
    } else {
      console.warn('[AutoSync] Appointments sync failed:', res?.error)
    }
  }).catch(function(e) { console.warn('[AutoSync] Exception:', e) })
}

// ── Init ──────────────────────────────────────────────────────────
var _queueInterval = null
var _dailyInterval = null

function _init() {
  processQueue()
  _checkDailySummary()
  _autoSyncAppointments()
  // Clear previous intervals (prevents leak on re-init/navigation)
  if (_queueInterval) clearInterval(_queueInterval)
  if (_dailyInterval) clearInterval(_dailyInterval)
  _queueInterval = setInterval(processQueue, 60_000)
  _dailyInterval = setInterval(_checkDailySummary, 60_000)
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
window.openFinalizarModal     = openFinalizeModal  // Bridge: legacy name → canonical
window.closeFinalizeModal     = closeFinalizeModal
window.confirmFinalize        = confirmFinalize
window.addFinProc             = addFinProc
window.removeFinProc          = removeFinProc
window.finUpdateBalance       = finUpdateBalance
window.finProcAutoPrice       = finProcAutoPrice
window.finProcDesconto        = finProcDesconto
window._finAutoRoute          = _finAutoRoute
window.finPayChanged          = finPayChanged
window.finCredChanged         = finCredChanged
window.finCredCalc            = finCredCalc
window.finParcCalc            = finParcCalc
window.finBoletoCalc          = finBoletoCalc
window.finEntradaCalc         = finEntradaCalc
window.finDinCalc             = finDinCalc
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
