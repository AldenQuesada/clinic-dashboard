;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════════
//  ClinicAI — Agenda Validation Engine  v1.0
//  Camada 1 (Frontend): todas as regras de negócio da agenda
//  Referência: spec de validações seções 1-21
// ══════════════════════════════════════════════════════════════════

// ── Constantes de status ──────────────────────────────────────────
const BLOCKS_CALENDAR = new Set([
  'agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_consulta'
])
const FREE_STATUSES = new Set(['cancelado','no_show','finalizado','remarcado'])
const LOCKED_STATUSES = new Set(['finalizado','em_consulta','na_clinica'])
const NO_DRAG_STATUSES = new Set(['finalizado','em_consulta','na_clinica'])

// Motivos padrão para cancelamento/no-show
const CANCEL_REASONS = [
  'Desistência',
  'Problema financeiro',
  'Imprevisto pessoal',
  'Doença',
  'Conflito de horário',
  'Remarcação solicitada pelo paciente',
  'Cancelado pela clínica',
  'Outro',
]
const NOSHOW_REASONS = [
  'Não compareceu sem aviso',
  'Sem resposta às tentativas de contato',
  'Imprevisto de última hora (informado depois)',
  'Esquecimento',
  'Problema de transporte',
  'Outro',
]

// ── Utilitários internos ──────────────────────────────────────────
function _toMins(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function _overlap(s1, e1, s2, e2) {
  return s1 < e2 && e1 > s2
}

function _isPastDate(dateStr) {
  if (!dateStr) return false
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(dateStr + 'T12:00')
  return d < today
}

function _isPastTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false
  return new Date(`${dateStr}T${timeStr}:00`) < new Date()
}

function _todayIso() {
  return new Date().toISOString().slice(0,10)
}

function _getAppts() {
  return window.getAppointments ? window.getAppointments() : []
}

function _getProf(idx) {
  const profs = window.getProfessionals ? window.getProfessionals() : []
  return (idx !== null && idx !== undefined && idx !== '') ? profs[parseInt(idx)] || null : null
}

function _getRoom(idx) {
  const rooms = window.getRooms ? window.getRooms() : []
  return (idx !== null && idx !== undefined && idx !== '') ? rooms[parseInt(idx)] || null : null
}

function _getClinicHours() {
  try {
    const cfg = JSON.parse(localStorage.getItem('clinic_config') || '{}')
    return { inicio: cfg.horarioInicio || '08:00', fim: cfg.horarioFim || '19:00' }
  } catch { return { inicio: '08:00', fim: '19:00' } }
}

// ── Validador principal ───────────────────────────────────────────
const AgendaValidator = {

  // ─────────────────────────────────────────────────────────────────
  // 1. Campos obrigatórios
  // ─────────────────────────────────────────────────────────────────
  validateRequiredFields(data) {
    const errs = []
    if (!data.pacienteNome?.trim() && !data.pacienteId) {
      errs.push('Paciente é obrigatório.')
    }
    if (!data.pacienteId) {
      errs.push('Selecione um paciente cadastrado. Não é possível agendar sem patient_id.')
    }
    if (!data.data) errs.push('Data é obrigatória.')
    if (!data.horaInicio) errs.push('Horário inicial é obrigatório.')
    if (!data.horaFim) errs.push('Horário final é obrigatório.')
    if (data.profissionalIdx === undefined || data.profissionalIdx === null || data.profissionalIdx === '') {
      errs.push('Profissional é obrigatório.')
    }
    if (!data.tipoConsulta) errs.push('Tipo de atendimento é obrigatório.')
    if (!data.status) errs.push('Status inicial é obrigatório.')
    if (!data.origem) errs.push('Origem do agendamento é obrigatória.')
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 2. Validações de horário
  // ─────────────────────────────────────────────────────────────────
  validateTime(data, isEdit = false) {
    const errs = []
    const { data: dateStr, horaInicio, horaFim } = data
    if (!dateStr || !horaInicio || !horaFim) return errs

    if (!isEdit) {
      if (_isPastDate(dateStr)) {
        errs.push('Não é possível agendar em data passada.')
      } else if (dateStr === _todayIso() && _isPastTime(dateStr, horaInicio)) {
        errs.push('Não é possível agendar em horário passado.')
      }
    }

    const s = _toMins(horaInicio)
    const e = _toMins(horaFim)
    if (e <= s) errs.push('Horario final deve ser posterior ao horario inicial.')
    var duracao = e - s
    if (duracao <= 0) errs.push('Duracao nao pode ser zero.')
    if (duracao > 480) errs.push('Duracao maxima e 8 horas (480 min). Atual: ' + duracao + ' min.')

    const hf = _getClinicHours()
    const hfS = _toMins(hf.inicio)
    const hfE = _toMins(hf.fim)
    if (s < hfS) errs.push(`Horário ${horaInicio} está fora do funcionamento da clínica (${hf.inicio}–${hf.fim}).`)
    if (e > hfE) errs.push(`Término ${horaFim} está fora do funcionamento da clínica (${hf.inicio}–${hf.fim}).`)

    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 3. Validações de profissional
  // ─────────────────────────────────────────────────────────────────
  validateProfessional(data) {
    const errs = []
    const prof = _getProf(data.profissionalIdx)
    if (!prof) { errs.push('Profissional não encontrado.'); return errs }
    if (prof.ativo === false || prof.status === 'inativo') {
      errs.push(`${prof.nome} está inativo e não pode receber agendamentos.`)
    }
    if (prof.emFerias || prof.status === 'ferias') {
      errs.push(`${prof.nome} está em férias/bloqueado.`)
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 4. Conflito por profissional
  // ─────────────────────────────────────────────────────────────────
  checkProfConflict(data, excludeId = null) {
    const errs = []
    const { profissionalIdx, data: dateStr, horaInicio, horaFim } = data
    if (profissionalIdx === null || profissionalIdx === undefined || profissionalIdx === '') return errs
    if (!dateStr || !horaInicio || !horaFim) return errs

    const s = _toMins(horaInicio), e = _toMins(horaFim)
    const conflicts = _getAppts().filter(a => {
      if (excludeId && a.id === excludeId) return false
      if (String(a.profissionalIdx) !== String(profissionalIdx)) return false
      if (a.data !== dateStr) return false
      if (!BLOCKS_CALENDAR.has(a.status)) return false
      return a.horaInicio && a.horaFim && _overlap(s, e, _toMins(a.horaInicio), _toMins(a.horaFim))
    })
    if (conflicts.length) {
      const prof = _getProf(profissionalIdx)
      const detalhes = conflicts.map(c => `${c.pacienteNome||'Paciente'} (${c.horaInicio}–${c.horaFim})`).join(', ')
      errs.push(`Conflito: ${prof?.nome||'Profissional'} já está ocupado — ${detalhes}.`)
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 5. Conflito por sala
  // ─────────────────────────────────────────────────────────────────
  checkRoomConflict(data, excludeId = null) {
    const errs = []
    const { salaIdx, data: dateStr, horaInicio, horaFim } = data
    if (salaIdx === null || salaIdx === undefined || salaIdx === '') return errs
    if (!dateStr || !horaInicio || !horaFim) return errs

    const s = _toMins(horaInicio), e = _toMins(horaFim)
    const conflicts = _getAppts().filter(a => {
      if (excludeId && a.id === excludeId) return false
      if (String(a.salaIdx) !== String(salaIdx)) return false
      if (a.data !== dateStr) return false
      if (!BLOCKS_CALENDAR.has(a.status)) return false
      return a.horaInicio && a.horaFim && _overlap(s, e, _toMins(a.horaInicio), _toMins(a.horaFim))
    })
    if (conflicts.length) {
      const room = _getRoom(salaIdx)
      const detalhes = conflicts.map(c => `${c.pacienteNome||'Paciente'} (${c.horaInicio}–${c.horaFim})`).join(', ')
      errs.push(`Conflito de sala: ${room?.nome||'Sala'} já está ocupada — ${detalhes}.`)
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 6. Conflito por paciente
  // ─────────────────────────────────────────────────────────────────
  checkPatientConflict(data, excludeId = null) {
    const errs = []
    const { pacienteId, data: dateStr, horaInicio, horaFim } = data
    if (!pacienteId || !dateStr || !horaInicio || !horaFim) return errs

    const s = _toMins(horaInicio), e = _toMins(horaFim)
    const conflicts = _getAppts().filter(a => {
      if (excludeId && a.id === excludeId) return false
      if (a.pacienteId !== pacienteId) return false
      if (a.data !== dateStr) return false
      if (!BLOCKS_CALENDAR.has(a.status)) return false
      return a.horaInicio && a.horaFim && _overlap(s, e, _toMins(a.horaInicio), _toMins(a.horaFim))
    })
    if (conflicts.length) {
      const horarios = conflicts.map(c => `${c.horaInicio}–${c.horaFim}`).join(', ')
      errs.push(`Paciente já possui agendamento neste horário: ${horarios}.`)
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 7. Validação de transição de status
  // ─────────────────────────────────────────────────────────────────
  validateTransition(appt, newStatus) {
    const errs = []
    if (!appt) return ['Agendamento não encontrado.']
    const SM = window.STATE_MACHINE || {}
    const allowed = SM[appt.status] || []
    if (!allowed.includes(newStatus)) {
      const SL = window.STATUS_LABELS || {}
      errs.push(`Transição inválida: ${SL[appt.status]||appt.status} → ${SL[newStatus]||newStatus}. Fluxo não permitido.`)
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 8. Validação de cancelamento / no-show
  // ─────────────────────────────────────────────────────────────────
  validateCancelOrNoShow(appt, reason) {
    const errs = []
    if (!reason?.trim()) errs.push('Motivo é obrigatório para cancelamento ou no-show.')
    if (appt.status === 'finalizado') errs.push('Agendamento finalizado não pode ser cancelado.')
    if (appt.status === 'em_consulta') {
      errs.push('Paciente em consulta — finalize o atendimento antes de cancelar.')
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 9. Validação de finalização
  // ─────────────────────────────────────────────────────────────────
  validateFinalize(appt, finData) {
    const errs = []
    const allowedForFinalize = ['na_clinica','em_consulta','aguardando','confirmado','agendado']
    if (!allowedForFinalize.includes(appt.status)) {
      errs.push(`Status "${appt.status}" não permite finalização direta.`)
    }
    if (appt.status === 'finalizado') {
      errs.push('Atendimento já foi finalizado.')
      return errs
    }
    const { tipoConsulta, tipoAvaliacao, valor, statusPagamento } = finData || {}
    if (tipoConsulta === 'avaliacao' && tipoAvaliacao === 'paga') {
      if (!valor || Number(valor) <= 0) {
        errs.push('Avaliação paga exige valor definido.')
      }
      if (statusPagamento === 'pendente') {
        errs.push('Avaliação paga: registre o pagamento (parcial ou total) antes de finalizar.')
      }
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 10. Validação de drag & drop
  // ─────────────────────────────────────────────────────────────────
  validateDragDrop(appt, newDate, newTime, newEndTime) {
    const errs = []
    if (!appt) return ['Agendamento não encontrado.']

    if (appt.status === 'finalizado') {
      return ['Atendimento finalizado não pode ser movido. Use "Duplicar" para novo agendamento.']
    }
    if (appt.status === 'em_consulta') {
      return ['Paciente em consulta — não é possível mover o agendamento.']
    }
    if (appt.status === 'na_clinica') {
      return ['Paciente já está na clínica — use a ação de remarcação formal com justificativa.']
    }
    if (!newDate || !newTime || !newEndTime) return errs

    if (_isPastDate(newDate)) return ['Não é possível mover para data passada.']
    if (newDate === _todayIso() && _isPastTime(newDate, newTime)) {
      return ['Não é possível mover para horário passado.']
    }

    const newData = { profissionalIdx: appt.profissionalIdx, salaIdx: appt.salaIdx,
      pacienteId: appt.pacienteId, data: newDate, horaInicio: newTime, horaFim: newEndTime }

    errs.push(...this.checkProfConflict(newData, appt.id))
    errs.push(...this.checkRoomConflict(newData, appt.id))
    errs.push(...this.checkPatientConflict(newData, appt.id))

    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 11. Validação completa para salvar (novo ou edição)
  // ─────────────────────────────────────────────────────────────────
  validateSave(data, excludeId = null) {
    const isEdit = !!excludeId
    const errs = []

    errs.push(...this.validateRequiredFields(data))
    if (errs.length) return { ok: false, errors: errs }

    errs.push(...this.validateTime(data, isEdit))
    errs.push(...this.validateProfessional(data))
    errs.push(...this.checkProfConflict(data, excludeId))
    errs.push(...this.checkRoomConflict(data, excludeId))
    errs.push(...this.checkPatientConflict(data, excludeId))

    return { ok: errs.length === 0, errors: errs }
  },

  // ─────────────────────────────────────────────────────────────────
  // 12. Verificar se agendamento pode ser editado
  // ─────────────────────────────────────────────────────────────────
  canEdit(appt) {
    if (!appt) return { ok: false, errors: ['Agendamento não encontrado.'] }
    if (appt.status === 'finalizado') {
      return { ok: false, errors: ['Agendamento finalizado não pode ser editado diretamente.'] }
    }
    return { ok: true, errors: [] }
  },

  // ─────────────────────────────────────────────────────────────────
  // 13. Verificar se pode arrastar (drag)
  // ─────────────────────────────────────────────────────────────────
  canDrag(appt) {
    if (!appt) return false
    return !NO_DRAG_STATUSES.has(appt.status)
  },
}

// ── UI: Exibir erros de validação ─────────────────────────────────
function showValidationErrors(errors, title) {
  if (!errors || !errors.length) return
  let modal = document.getElementById('validationErrorModal')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'validationErrorModal'
    document.body.appendChild(modal)
  }
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px'
  modal.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="background:#EF4444;padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style="font-size:13px;font-weight:800;color:#fff">${title || 'Não foi possível salvar'}</span>
        </div>
        <button onclick="document.getElementById('validationErrorModal').style.display='none'" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">×</button>
      </div>
      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow-y:auto">
        ${errors.map(e => `
          <div style="display:flex;align-items:flex-start;gap:9px;padding:9px 11px;background:#FEF2F2;border-radius:8px;border-left:3px solid #EF4444">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" style="flex-shrink:0;margin-top:1px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            <span style="font-size:12px;color:#7F1D1D;line-height:1.4">${e}</span>
          </div>`).join('')}
      </div>
      <div style="padding:12px 18px;border-top:1px solid #F3F4F6">
        <button onclick="document.getElementById('validationErrorModal').style.display='none'" style="width:100%;padding:10px;background:#EF4444;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:700">Corrigir e tentar novamente</button>
      </div>
    </div>`
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none' })
}

// ── Modal: Cancelamento com motivo ────────────────────────────────
function openCancelModal(apptId, statusAlvo) {
  const appts = window.getAppointments ? window.getAppointments() : []
  const appt  = appts.find(a => a.id === apptId)
  if (!appt) return

  const isNoShow   = statusAlvo === 'no_show'
  const title      = isNoShow ? 'Registrar No-show' : 'Cancelar Agendamento'
  const cor        = isNoShow ? '#DC2626' : '#EF4444'
  const reasons    = isNoShow ? NOSHOW_REASONS : CANCEL_REASONS
  const SL         = window.STATUS_LABELS || {}

  let m = document.getElementById('cancelReasonModal')
  if (!m) { m = document.createElement('div'); m.id = 'cancelReasonModal'; document.body.appendChild(m) }

  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9700;display:flex;align-items:center;justify-content:center;padding:16px'
  m.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:440px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="background:${cor};padding:14px 18px">
        <div style="font-size:14px;font-weight:800;color:#fff">${title}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:2px">${appt.pacienteNome||'Paciente'} · ${appt.data||''} ${appt.horaInicio||''}</div>
      </div>
      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:11px;font-weight:700;color:#374151;display:block;margin-bottom:6px">Motivo <span style="color:#EF4444">*</span></label>
          <select id="cancelReasonSel" style="width:100%;padding:9px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;color:#111;background:#fff">
            <option value="">Selecione o motivo...</option>
            ${reasons.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#374151;display:block;margin-bottom:6px">Observação complementar</label>
          <textarea id="cancelReasonObs" rows="2" placeholder="Detalhes adicionais (opcional)..."
            style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;resize:none;font-family:inherit;color:#374151"></textarea>
        </div>
        ${isNoShow ? `
        <div style="padding:10px 12px;background:#FEF2F2;border-radius:8px;font-size:11px;color:#7F1D1D;line-height:1.5">
          O agendamento permanecerá visível na data com cor diferenciada. Uma tarefa de recuperação será criada automaticamente.
        </div>` : `
        <div style="padding:10px 12px;background:#FFF7ED;border-radius:8px;font-size:11px;color:#92400E;line-height:1.5">
          O agendamento será mantido no histórico e não excluído. O slot ficará liberado para novos agendamentos.
        </div>`}
      </div>
      <div style="padding:12px 18px;border-top:1px solid #F3F4F6;display:flex;gap:8px">
        <button onclick="document.getElementById('cancelReasonModal').style.display='none'" style="flex:1;padding:10px;border:1.5px solid #E5E7EB;background:#fff;color:#374151;border-radius:9px;cursor:pointer;font-size:12px;font-weight:700">Voltar</button>
        <button onclick="confirmCancelWithReason('${apptId}','${statusAlvo}')" style="flex:2;padding:10px;background:${cor};color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:800">${title}</button>
      </div>
    </div>`
  m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none' })
}

function confirmCancelWithReason(apptId, statusAlvo) {
  const reasonSel = document.getElementById('cancelReasonSel')?.value?.trim()
  const reasonObs = document.getElementById('cancelReasonObs')?.value?.trim()

  if (!reasonSel) {
    const el = document.getElementById('cancelReasonSel')
    if (el) { el.style.borderColor = '#EF4444'; setTimeout(()=>el.style.borderColor='#E5E7EB',2000) }
    return
  }

  const appts = window.getAppointments ? window.getAppointments() : []
  const idx   = appts.findIndex(a => a.id === apptId)
  if (idx < 0) return

  const appt      = appts[idx]
  const motivo    = reasonSel + (reasonObs ? ` — ${reasonObs}` : '')
  const at        = new Date().toISOString()

  // Validar transição
  if (window.AgendaValidator) {
    const errs = AgendaValidator.validateCancelOrNoShow(appt, motivo)
    if (errs.length) { showValidationErrors(errs, 'Não foi possível processar'); return }
  }

  // Registrar histórico
  if (!appts[idx].historicoStatus) appts[idx].historicoStatus = []
  appts[idx].historicoStatus.push({ status: statusAlvo, at, by: 'manual', motivo })

  // Registrar log de alteração
  if (!appts[idx].historicoAlteracoes) appts[idx].historicoAlteracoes = []
  appts[idx].historicoAlteracoes.push({
    action_type:  statusAlvo === 'no_show' ? 'no_show' : 'cancelamento',
    old_value:    { status: appt.status },
    new_value:    { status: statusAlvo, motivo },
    changed_by:   'secretaria',
    changed_at:   at,
    reason:       motivo,
  })

  if (statusAlvo === 'cancelado') {
    appts[idx].canceladoEm   = at
    appts[idx].motivoCancelamento = motivo
  } else {
    appts[idx].noShowEm      = at
    appts[idx].motivoNoShow  = motivo
  }
  appts[idx].status = statusAlvo

  if (window.saveAppointments) saveAppointments(appts)

  // Sync Supabase (dispara trigger de phase change)
  if (window.AppointmentsService) {
    AppointmentsService.syncOne(appts[idx])
  }

  // Fechar modal
  const m = document.getElementById('cancelReasonModal')
  if (m) m.style.display = 'none'

  // Cancelar automações pendentes + aplicar tag + abrir recuperação
  if (window.apptTransition) {
    // Já salvamos diretamente — apenas disparar efeitos colaterais
  }
  if (window._applyStatusTag && appts[idx].pacienteId) {
    const tagMap = { cancelado: 'cancelado', no_show: 'falta' }
    const tagId  = tagMap[statusAlvo]
    if (tagId) _applyStatusTag(appts[idx], tagId, 'manual')
  }

  // Mudar fase do lead pra cancelado/perdido
  if (appts[idx].pacienteId && window.SdrService && SdrService.changePhase) {
    if (statusAlvo === 'cancelado') {
      SdrService.changePhase(appts[idx].pacienteId, 'cancelado', 'cancelamento: ' + motivo)
    }
    // No-show: manter fase atual (lead pode reagendar), criar task de recuperacao
  }

  // Cancelar automações futuras
  if (window._getQueue) {
    const q = _getQueue().map(x => x.apptId === apptId ? { ...x, executed: true } : x)
    if (window._saveQueue) _saveQueue(q)
  }

  if (window.renderAgenda) renderAgenda()

  // Abrir fluxo de recuperação
  if (window._openRecovery) setTimeout(() => _openRecovery(appts[idx]), 300)
}

// ── Audit log helper ──────────────────────────────────────────────
function addAuditLog(appt, actionType, oldValue, newValue, reason) {
  if (!appt.historicoAlteracoes) appt.historicoAlteracoes = []
  appt.historicoAlteracoes.push({
    action_type:  actionType,
    old_value:    oldValue,
    new_value:    newValue,
    changed_by:   'secretaria',
    changed_at:   new Date().toISOString(),
    reason:       reason || '',
  })
  return appt
}

// ── Toast de erro rápido ──────────────────────────────────────────
function showErrorToast(msg) {
  let t = document.getElementById('agendaErrToast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'agendaErrToast'
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99999;pointer-events:none'
    document.body.appendChild(t)
  }
  t.innerHTML = `<div style="background:#EF4444;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 4px 16px rgba(239,68,68,.4);animation:fadeIn .15s ease">${msg}</div>`
  clearTimeout(t._tm)
  t._tm = setTimeout(() => { t.innerHTML = '' }, 3500)
}

// ── Expose ────────────────────────────────────────────────────────
window.AgendaValidator      = AgendaValidator
window.BLOCKS_CALENDAR      = BLOCKS_CALENDAR
window.FREE_STATUSES        = FREE_STATUSES
window.LOCKED_STATUSES      = LOCKED_STATUSES
window.NO_DRAG_STATUSES     = NO_DRAG_STATUSES
window.CANCEL_REASONS       = CANCEL_REASONS
window.NOSHOW_REASONS       = NOSHOW_REASONS
window.showValidationErrors  = showValidationErrors
window.openCancelModal       = openCancelModal
window.confirmCancelWithReason = confirmCancelWithReason
window.addAuditLog           = addAuditLog
window.showErrorToast        = showErrorToast

})()
