/**
 * ClinicAI — Agenda Modal
 *
 * Extraído de api.js. Gerencia o modal de Nova / Editar Consulta
 * e o modal de detalhe de agendamento.
 *
 * Funções públicas (window.*):
 *   openApptModal(id, date, time, profIdx)
 *   closeApptModal()
 *   saveAppt()
 *   deleteAppt()
 *   openApptDetail(id)
 *   apptSearchPatient(q)
 *   selectApptPatient(id, nome)
 *   apptProcAutofill(procNome)
 *   apptTipoChange()
 *
 * Depende de (globals de api.js):
 *   window._apptGetAll, _apptSaveAll, _apptGenId, _apptAddMinutes,
 *   window._apptFmtDate, _apptRefresh, _apptStatusCfg, _apptCheckConflict,
 *   window._apptSetLeadStatus, _apptEnviarMsg,
 *   window.getProfessionals, getRooms, getTechnologies,
 *   window.AgendaValidator, AppointmentsService, scheduleAutomations,
 *   window._applyStatusTag, showValidationErrors, _showToast
 *
 * NOTA: Este arquivo é carregado APÓS api.js. Todas as referências a helpers
 * de api.js são feitas via window.* para garantir acesso pós-inicialização.
 */

;(function () {
  'use strict'

  // ── Helpers locais que acessam internals de api.js via window ─
  function _getAppts()       { return window._apptGetAll ? window._apptGetAll() : JSON.parse(localStorage.getItem('clinicai_appointments') || '[]') }
  function _saveAppts(arr)   { if (window._apptSaveAll) window._apptSaveAll(arr) }
  function _genId()          { return window._apptGenId ? window._apptGenId() : ('appt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)) }
  function _addMins(t, m)    { return window._apptAddMinutes ? window._apptAddMinutes(t, m) : t }
  function _fmtDate(iso)     { return window._apptFmtDate ? window._apptFmtDate(iso) : iso }
  function _refresh()        { if (window._apptRefresh) window._apptRefresh() }
  function _statusCfg()      { return window._apptStatusCfg || {} }
  function _checkConflict(a, all) { return window._apptCheckConflict ? window._apptCheckConflict(a, all) : { conflict: false } }
  function _setLeadStatus(id, s, skip) { if (window._apptSetLeadStatus) window._apptSetLeadStatus(id, s, skip) }
  function _enviarMsg(appt)  { if (window._apptEnviarMsg) window._apptEnviarMsg(appt) }

  // ── openApptModal ─────────────────────────────────────────────
  function openApptModal(id, date, time, profIdx) {
    const modal = document.getElementById('apptModal')
    if (!modal) return

    // Preenche profissionais
    const profSel = document.getElementById('appt_prof')
    if (profSel) {
      const profs = typeof getProfessionals === 'function' ? getProfessionals() : []
      profSel.innerHTML = '<option value="">Selecione...</option>' +
        profs.map((p, i) => `<option value="${i}">${p.nome}${p.especialidade ? ' – ' + p.especialidade : ''}</option>`).join('')
    }

    // Preenche salas
    const salaSel = document.getElementById('appt_sala')
    if (salaSel) {
      const salas = typeof getRooms === 'function' ? getRooms() : []
      salaSel.innerHTML = '<option value="">Selecione...</option>' +
        salas.map((s, i) => {
          const resp = Array.isArray(s.responsaveis) ? s.responsaveis : (s.responsavel ? [s.responsavel] : [])
          return `<option value="${i}">${s.nome}${resp.length ? ' – ' + resp.join(', ') : ''}</option>`
        }).join('')
    }

    // Preenche procedimentos (datalist)
    const procList = document.getElementById('apptProcList')
    if (procList) {
      const techs = typeof getTechnologies === 'function' ? getTechnologies() : []
      procList.innerHTML = techs.map(t => `<option value="${t.nome}"/>`).join('')
    }

    const deleteBtn = document.getElementById('apptDeleteBtn')

    if (id) {
      // Editar existente
      const a = _getAppts().find(x => x.id === id)
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
      document.getElementById('appt_consentimento').checked = a.consentimentoImagem === 'assinado' || a.consentimentoImagem === true
      document.getElementById('appt_obs').value = a.obs || ''
      if (profSel && a.profissionalIdx !== undefined) profSel.value = a.profissionalIdx
      if (salaSel && a.salaIdx !== undefined) salaSel.value = a.salaIdx
      // Duração
      const [hs, ms] = a.horaInicio.split(':').map(Number)
      const [he, me] = a.horaFim.split(':').map(Number)
      const dur = (he * 60 + me) - (hs * 60 + ms)
      document.getElementById('appt_duracao').value = dur > 0 ? dur : 60
      // Novos campos
      const tipoEl = document.getElementById('appt_tipo'); if (tipoEl) tipoEl.value = a.tipoConsulta || ''
      const origEl = document.getElementById('appt_origem'); if (origEl) origEl.value = a.origem || ''
      const valEl  = document.getElementById('appt_valor'); if (valEl)  valEl.value  = a.valor || ''
      const pagEl  = document.getElementById('appt_forma_pag'); if (pagEl) pagEl.value = a.formaPagamento || ''
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
      document.getElementById('appt_data').value = date || (new Date().toISOString().slice(0, 10))
      document.getElementById('appt_inicio').value = time || '08:00'
      document.getElementById('appt_status').value = 'agendado'
      document.getElementById('appt_confirmacao').checked = false
      document.getElementById('appt_consentimento').checked = false
      document.getElementById('appt_obs').value = ''
      document.getElementById('appt_duracao').value = 60
      const tipoEl2 = document.getElementById('appt_tipo'); if (tipoEl2) tipoEl2.value = ''
      const origEl2 = document.getElementById('appt_origem'); if (origEl2) origEl2.value = ''
      const valEl2  = document.getElementById('appt_valor'); if (valEl2)  valEl2.value  = ''
      const pagEl2  = document.getElementById('appt_forma_pag'); if (pagEl2) pagEl2.value = ''
      apptTipoChange()
      if (profIdx !== undefined && profSel) profSel.value = profIdx
      if (deleteBtn) deleteBtn.style.display = 'none'
    }

    document.getElementById('apptPatientDrop').style.display = 'none'
    document.getElementById('appt_paciente_warn').style.display = 'none'
    // Reset novos campos
    var tipoPac = document.getElementById('appt_tipo_paciente'); if (tipoPac) tipoPac.value = 'novo'
    var indicado = document.getElementById('appt_indicado_por'); if (indicado) indicado.value = ''
    _apptProcs = []
    var procsList = document.getElementById('apptProcsList'); if (procsList) procsList.innerHTML = ''
    var procsTotal = document.getElementById('apptProcsTotal'); if (procsTotal) procsTotal.textContent = ''
    // Reset tipo buttons
    var avalRow = document.getElementById('apptTipoAvalRow'); if (avalRow) avalRow.style.display = 'none'
    var pagaRow = document.getElementById('apptPagaRow'); if (pagaRow) pagaRow.style.display = 'none'
    var procRow = document.getElementById('apptProcRow'); if (procRow) procRow.style.display = 'none'
    modal.style.display = 'flex'
    document.body.style.overflow = 'hidden'
    apptUpdateEndTime()
  }

  // ── closeApptModal ────────────────────────────────────────────
  function closeApptModal() {
    const m = document.getElementById('apptModal')
    if (m) m.style.display = 'none'
    document.body.style.overflow = ''
  }

  // ── apptProcAutofill ──────────────────────────────────────────
  function apptProcAutofill(procNome) {
    if (!procNome) return
    var techs = typeof getTechnologies === 'function' ? getTechnologies() : []
    var tech = techs.find(function(t) { return t.nome === procNome })
    if (tech && tech.duracao) {
      var dur = parseInt(tech.duracao)
      if (!isNaN(dur) && dur > 0) {
        var el = document.getElementById('appt_duracao')
        if (el) el.value = dur
        apptUpdateEndTime()
      }
    }
    // Auto-preencher valor do procedimento
    var valorEl = document.getElementById('appt_proc_valor')
    if (valorEl && tech && tech.preco) {
      valorEl.value = tech.preco
    }
  }

  // ── apptUpdateEndTime — preview de hora fim em tempo real ─────
  function apptUpdateEndTime() {
    var inicio = document.getElementById('appt_inicio') && document.getElementById('appt_inicio').value
    var duracao = parseInt((document.getElementById('appt_duracao') && document.getElementById('appt_duracao').value) || '60')
    var preview = document.getElementById('appt_fim_preview')
    if (!preview) return
    if (!inicio) { preview.textContent = ''; return }
    var fim = _addMins(inicio, duracao)
    preview.textContent = 'Termina as ' + fim
  }

  // ── apptTipoChange (legacy compat) ──────────────────────────
  function apptTipoChange() {
    var tipo = document.getElementById('appt_tipo') && document.getElementById('appt_tipo').value
    var avalRow = document.getElementById('apptTipoAvalRow')
    var pagaRow = document.getElementById('apptPagaRow')
    var procRow = document.getElementById('apptProcRow')
    if (avalRow) avalRow.style.display = (tipo === 'avaliacao') ? '' : 'none'
    if (pagaRow) pagaRow.style.display = 'none'
    if (procRow) procRow.style.display = (tipo === 'procedimento') ? '' : 'none'
  }

  // ── Toggle Consulta / Procedimento ─────────────────────────
  var _apptProcs = []

  function apptSetTipo(tipo) {
    var btnC = document.getElementById('appt_tipo_btn_consulta')
    var btnP = document.getElementById('appt_tipo_btn_proc')
    var avalRow = document.getElementById('apptTipoAvalRow')
    var pagaRow = document.getElementById('apptPagaRow')
    var procRow = document.getElementById('apptProcRow')
    var tipoSel = document.getElementById('appt_tipo')

    if (tipo === 'avaliacao') {
      if (tipoSel) tipoSel.value = 'avaliacao'
      if (btnC) { btnC.style.background = '#EEF2FF'; btnC.style.borderColor = '#4F46E5'; btnC.style.color = '#4F46E5' }
      if (btnP) { btnP.style.background = '#fff'; btnP.style.borderColor = '#C7D2FE'; btnP.style.color = '#4F46E5' }
      if (avalRow) avalRow.style.display = ''
      if (procRow) procRow.style.display = 'none'
      if (pagaRow) pagaRow.style.display = 'none'
    } else {
      if (tipoSel) tipoSel.value = 'procedimento'
      if (btnP) { btnP.style.background = '#EEF2FF'; btnP.style.borderColor = '#4F46E5'; btnP.style.color = '#4F46E5' }
      if (btnC) { btnC.style.background = '#fff'; btnC.style.borderColor = '#C7D2FE'; btnC.style.color = '#4F46E5' }
      if (avalRow) avalRow.style.display = 'none'
      if (procRow) procRow.style.display = ''
      if (pagaRow) pagaRow.style.display = 'none'
    }
  }

  function apptSetAval(val) {
    var btnCort = document.getElementById('appt_aval_cortesia')
    var btnPaga = document.getElementById('appt_aval_paga')
    var pagaRow = document.getElementById('apptPagaRow')
    var hiddenEl = document.getElementById('appt_taval_hidden')
    var radioPaga = document.getElementById('appt_taval_paga')
    var radioCort = document.getElementById('appt_taval_cortesia')

    if (val === 'cortesia') {
      if (btnCort) { btnCort.style.background = '#F0FDF4'; btnCort.style.borderColor = '#16A34A' }
      if (btnPaga) { btnPaga.style.background = '#fff'; btnPaga.style.borderColor = '#FECACA' }
      if (pagaRow) pagaRow.style.display = 'none'
      if (radioCort) radioCort.checked = true
    } else {
      if (btnPaga) { btnPaga.style.background = '#FEF2F2'; btnPaga.style.borderColor = '#DC2626' }
      if (btnCort) { btnCort.style.background = '#fff'; btnCort.style.borderColor = '#BBF7D0' }
      if (pagaRow) pagaRow.style.display = ''
      if (radioPaga) radioPaga.checked = true
    }
    if (hiddenEl) hiddenEl.value = val
  }

  // ── Adicionar procedimento a lista ─────────────────────────
  function apptAddProc() {
    var nameEl = document.getElementById('appt_proc')
    var valorEl = document.getElementById('appt_proc_valor')
    var name = nameEl && nameEl.value.trim()
    var valor = valorEl ? parseFloat(valorEl.value || '0') : 0
    if (!name) return
    _apptProcs.push({ nome: name, valor: valor })
    if (nameEl) nameEl.value = ''
    if (valorEl) valorEl.value = ''
    _renderApptProcs()
  }

  function apptRemoveProc(i) {
    _apptProcs.splice(i, 1)
    _renderApptProcs()
  }

  function _renderApptProcs() {
    var list = document.getElementById('apptProcsList')
    var totalEl = document.getElementById('apptProcsTotal')
    if (!list) return
    if (!_apptProcs.length) {
      list.innerHTML = '<div style="font-size:11px;color:#9CA3AF;padding:4px 0">Nenhum procedimento adicionado</div>'
      if (totalEl) totalEl.textContent = ''
      return
    }
    list.innerHTML = _apptProcs.map(function(p, i) {
      return '<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:#fff;border:1px solid #E5E7EB;border-radius:6px">' +
        '<span style="flex:1;font-size:11px;font-weight:600;color:#374151">' + (p.nome || '').replace(/</g, '&lt;') + '</span>' +
        (p.valor > 0 ? '<span style="font-size:11px;font-weight:700;color:#10B981">R$ ' + p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</span>' : '') +
        '<button onclick="apptRemoveProc(' + i + ')" style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:14px;padding:0 2px">x</button>' +
      '</div>'
    }).join('')
    var total = _apptProcs.reduce(function(s, p) { return s + (p.valor || 0) }, 0)
    if (totalEl) totalEl.textContent = total > 0 ? 'Total: R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''

    // Atualizar campo valor principal com total
    var valorPrincipal = document.getElementById('appt_valor')
    if (valorPrincipal) valorPrincipal.value = total || ''
  }

  // ── Auto-preencher sala ao selecionar profissional ─────────
  function apptAutoSala() {
    var profSel = document.getElementById('appt_prof')
    var salaSel = document.getElementById('appt_sala')
    if (!profSel || !salaSel) return
    var profIdx = parseInt(profSel.value)
    if (isNaN(profIdx)) return
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var prof = profs[profIdx]
    if (!prof) return
    var rooms = typeof getRooms === 'function' ? getRooms() : []
    for (var i = 0; i < rooms.length; i++) {
      if (prof.sala_id === rooms[i].id || prof.sala === rooms[i].nome) {
        salaSel.value = i
        return
      }
    }
  }

  // ── apptSearchPatient ─────────────────────────────────────────
  function apptSearchPatient(q) {
    const drop = document.getElementById('apptPatientDrop')
    const warn = document.getElementById('appt_paciente_warn')
    if (!q.trim()) { drop.style.display = 'none'; warn.style.display = 'none'; return }
    const leads = window.LeadsService
      ? LeadsService.getLocal()
      : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
    const matches = leads.filter(l => (l.nome || l.name || '').toLowerCase().includes(q.toLowerCase())).slice(0, 8)

    if (!matches.length) {
      drop.style.display = 'none'
      warn.style.display = 'block'
      return
    }

    warn.style.display = 'none'
    drop.innerHTML = matches.map(l => {
      const nome = l.nome || l.name || 'Paciente'
      const phone = l.phone || l.whatsapp || ''
      return `<div data-lead-id="${l.id || ''}" data-lead-name="${nome.replace(/"/g, '&quot;')}" data-lead-phone="${phone}"
        style="padding:10px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #F3F4F6"
        onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background=''">
        <div style="font-weight:600;color:#111">${nome.replace(/</g, '&lt;')}</div>
        ${phone ? `<div style="font-size:11px;color:#9CA3AF">${phone.replace(/</g, '&lt;')}</div>` : ''}
      </div>`
    }).join('')
    drop.addEventListener('click', function(e) {
      var el = e.target.closest('[data-lead-id]')
      if (el) selectApptPatient(el.dataset.leadId, el.dataset.leadName, el.dataset.leadPhone)
    })
    drop.style.display = 'block'
  }

  // ── selectApptPatient ─────────────────────────────────────────
  function selectApptPatient(id, nome, phone) {
    document.getElementById('appt_paciente_q').value = nome
    document.getElementById('appt_paciente_id').value = id
    var phoneEl = document.getElementById('appt_paciente_phone')
    if (phoneEl) phoneEl.value = phone || ''
    document.getElementById('apptPatientDrop').style.display = 'none'
    document.getElementById('appt_paciente_warn').style.display = 'none'
  }

  // ── saveAppt ──────────────────────────────────────────────────
  function saveAppt() {
    const nome = document.getElementById('appt_paciente_q') && document.getElementById('appt_paciente_q').value.trim()
    if (!nome) { alert('Selecione o paciente'); return }
    const data   = document.getElementById('appt_data') && document.getElementById('appt_data').value
    const inicio = document.getElementById('appt_inicio') && document.getElementById('appt_inicio').value
    if (!data || !inicio) { alert('Informe data e horário'); return }

    const duracao = parseInt((document.getElementById('appt_duracao') && document.getElementById('appt_duracao').value) || '60')
    const fim     = _addMins(inicio, duracao)
    const profIdx = parseInt(((document.getElementById('appt_prof') && document.getElementById('appt_prof').value) || '0')) || 0
    const salaIdx = parseInt((document.getElementById('appt_sala') && document.getElementById('appt_sala').value) || '')
    const profs   = typeof getProfessionals === 'function' ? getProfessionals() : []

    const tipoAvalEl = document.querySelector('input[name="appt_tipo_aval"]:checked')
    const apptData = {
      pacienteId:          (document.getElementById('appt_paciente_id') && document.getElementById('appt_paciente_id').value) || '',
      pacienteNome:        nome,
      pacientePhone:       (document.getElementById('appt_paciente_phone') && document.getElementById('appt_paciente_phone').value) || '',
      profissionalIdx:     profIdx,
      profissionalNome:    profs[profIdx] && profs[profIdx].nome || '',
      salaIdx:             isNaN(salaIdx) ? null : salaIdx,
      procedimento:        (document.getElementById('appt_proc') && document.getElementById('appt_proc').value.trim()) || '',
      data,
      horaInicio:          inicio,
      horaFim:             fim,
      status:              (document.getElementById('appt_status') && document.getElementById('appt_status').value) || 'agendado',
      tipoConsulta:        (document.getElementById('appt_tipo') && document.getElementById('appt_tipo').value) || '',
      tipoAvaliacao:       tipoAvalEl && tipoAvalEl.value || '',
      origem:              (document.getElementById('appt_origem') && document.getElementById('appt_origem').value) || '',
      valor:               parseFloat((document.getElementById('appt_valor') && document.getElementById('appt_valor').value) || '0') || 0,
      formaPagamento:      (document.getElementById('appt_forma_pag') && document.getElementById('appt_forma_pag').value) || '',
      statusPagamento:     'pendente',
      confirmacaoEnviada:  (document.getElementById('appt_confirmacao') && document.getElementById('appt_confirmacao').checked) || false,
      consentimentoImagem: (document.getElementById('appt_consentimento') && document.getElementById('appt_consentimento').checked) ? 'assinado' : 'pendente',
      obs:                 (document.getElementById('appt_obs') && document.getElementById('appt_obs').value.trim()) || '',
      tipoPaciente:        (document.getElementById('appt_tipo_paciente') && document.getElementById('appt_tipo_paciente').value) || 'novo',
      indicadoPor:         (document.getElementById('appt_indicado_por') && document.getElementById('appt_indicado_por').value.trim()) || '',
      procedimentos:       _apptProcs.length ? _apptProcs.slice() : [],
    }

    const appts  = _getAppts()
    const editId = document.getElementById('appt_id') && document.getElementById('appt_id').value

    // Validação via AgendaValidator (camada 1)
    if (window.AgendaValidator) {
      const vResult = AgendaValidator.validateSave(apptData, editId || null)
      if (!vResult.ok) {
        if (typeof showValidationErrors === 'function') showValidationErrors(vResult.errors, editId ? 'Não foi possível editar' : 'Não foi possível agendar')
        return
      }
    } else {
      // Fallback: validação básica legada
      const provisional = Object.assign({}, apptData, { id: editId || '__new__' })
      const { conflict, reason: confReason } = _checkConflict(provisional, appts)
      if (conflict) { alert('Conflito de horário: ' + confReason); return }
    }

    // Verificar se edição é permitida
    if (editId && window.AgendaValidator) {
      const existing = appts.find(a => a.id === editId)
      if (existing) {
        const canEdit = AgendaValidator.canEdit(existing)
        if (!canEdit.ok) {
          if (typeof showValidationErrors === 'function') showValidationErrors(canEdit.errors, 'Edição não permitida')
          return
        }
      }
    }

    let isNew  = false
    let novoId = null

    if (editId) {
      const idx = appts.findIndex(a => a.id === editId)
      if (idx >= 0) {
        const old = Object.assign({}, appts[idx])
        appts[idx] = Object.assign({}, appts[idx], apptData)
        // Audit log de edição — registra todos os campos alterados
        if (!appts[idx].historicoAlteracoes) appts[idx].historicoAlteracoes = []
        var _auditFields = ['data','horaInicio','horaFim','profissionalIdx','profissionalNome','salaIdx','procedimento','tipoConsulta','tipoAvaliacao','origem','valor','formaPagamento','status','confirmacaoEnviada','consentimentoImagem','obs']
        var _oldVals = {}, _newVals = {}, _hasChanges = false
        _auditFields.forEach(function(f) {
          if (String(old[f] || '') !== String(apptData[f] || '')) {
            _oldVals[f] = old[f]; _newVals[f] = apptData[f]; _hasChanges = true
          }
        })
        if (_hasChanges) {
          appts[idx].historicoAlteracoes.push({
            action_type: 'edicao',
            old_value:   _oldVals,
            new_value:   _newVals,
            changed_by:  'secretaria',
            changed_at:  new Date().toISOString(),
            reason:      'Edicao manual',
          })
        }
        // Recalcular automações se data/hora mudou — cancela antigas primeiro
        if ((old.data !== apptData.data || old.horaInicio !== apptData.horaInicio) && typeof scheduleAutomations === 'function') {
          if (window._getQueue && window._saveQueue) {
            var q = _getQueue().map(function(x) { return x.apptId === editId ? Object.assign({}, x, { executed: true }) : x })
            _saveQueue(q)
          }
          scheduleAutomations(appts[idx])
        }
      }
    } else {
      novoId = _genId()
      appts.push(Object.assign({ id: novoId, createdAt: new Date().toISOString(), historicoAlteracoes: [] }, apptData))
      isNew = true
    }

    _saveAppts(appts)
    closeApptModal()
    _refresh()

    // Sync Supabase (fire-and-forget)
    if (window.AppointmentsService) {
      if (editId) {
        const saved = appts.find(a => a.id === editId)
        if (saved) AppointmentsService.syncOne(saved)
      } else if (novoId) {
        const saved = appts.find(a => a.id === novoId)
        if (saved) AppointmentsService.syncOne(saved)
      }
    }

    // Ao criar novo agendamento: loop fechado
    if (isNew) {
      const apptCompleto = Object.assign({}, apptData, { id: novoId, profissionalNome: profs[profIdx] && profs[profIdx].nome || '' })
      // 1. Mensagem de confirmacao (WhatsApp)
      _enviarMsg(apptCompleto)
      // 2. Agendar automacoes temporais (D-1, D-0, 30min)
      if (typeof scheduleAutomations === 'function') scheduleAutomations(apptCompleto)
      // 3. Tag 'agendado'
      if (typeof _applyStatusTag === 'function' && apptCompleto.pacienteId) {
        _applyStatusTag(apptCompleto, 'agendado', 'criacao')
      }
      // 4. Status legado
      if (apptCompleto.pacienteId) {
        _setLeadStatus(apptCompleto.pacienteId, 'scheduled', ['patient', 'attending'])
      }
      // 5. Hook SDR unificado: interacao + regras + pipeline (fire-and-forget)
      if (window.SdrService && apptCompleto.pacienteId) {
        SdrService.onLeadScheduled(apptCompleto.pacienteId, apptCompleto)
      }
    }
  }

  // ── deleteAppt ────────────────────────────────────────────────
  function deleteAppt() {
    const id = document.getElementById('appt_id') && document.getElementById('appt_id').value
    if (!id) return
    if (!confirm('Excluir esta consulta?')) return
    const appts = _getAppts().filter(a => a.id !== id)
    _saveAppts(appts)
    closeApptModal()
    _refresh()
    // Soft delete no Supabase (fire-and-forget)
    if (window.AppointmentsService && window.AppointmentsService.softDelete) {
      window.AppointmentsService.softDelete(id)
    }
  }

  // ── openApptDetail ────────────────────────────────────────────
  function openApptDetail(id) {
    const appts = _getAppts()
    const a = appts.find(x => x.id === id)
    if (!a) return

    // Inicializar campos de documentos se ausentes
    let changed = false
    if (a.anamneseRespondida === undefined) { a.anamneseRespondida = false; changed = true }
    if (!a.consentimentoImagem) { a.consentimentoImagem = 'pendente'; changed = true }
    if (!a.consentimentoProcedimento) { a.consentimentoProcedimento = 'pendente'; changed = true }
    if (changed) _saveAppts(appts)

    const APPT_STATUS_CFG = _statusCfg()
    const s = APPT_STATUS_CFG[a.status] || APPT_STATUS_CFG.agendado || {}
    const profs   = typeof getProfessionals === 'function' ? getProfessionals() : []
    const profNome = a.profissionalNome || (profs[a.profissionalIdx] && profs[a.profissionalIdx].nome) || '—'

    const docBool = function (val, trueLabel, falseLabel) {
      return val
        ? `<span style="color:#059669;font-size:11px;font-weight:700">&#10003; ${trueLabel}</span>`
        : `<span style="color:#D97706;font-size:11px;font-weight:700">&#9711; ${falseLabel}</span>`
    }

    const consentBadge = function (val) {
      if (val === 'assinado') return `<span style="color:#059669;font-size:11px;font-weight:700">&#10003; Assinado</span>`
      if (val === 'recusado') return `<span style="color:#DC2626;font-size:11px;font-weight:700">&#10007; Recusado</span>`
      return `<span style="color:#D97706;font-size:11px;font-weight:700">&#9711; Pendente</span>`
    }

    const canFinish = ['agendado', 'confirmado', 'em_atendimento'].includes(a.status)

    const existing = document.getElementById('apptDetailDlg')
    if (existing) existing.remove()

    const dlg = document.createElement('div')
    dlg.id = 'apptDetailDlg'
    dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9998'
    dlg.innerHTML = `
      <div style="background:#fff;border-radius:16px;width:92%;max-width:500px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #E5E7EB">
          <div>
            <div style="font-size:17px;font-weight:800;color:#111827">${a.pacienteNome || 'Paciente'}</div>
            <div style="font-size:12px;color:#6B7280;margin-top:2px">${_fmtDate(a.data)} &nbsp;${a.horaInicio}–${a.horaFim}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            <span style="font-size:10px;font-weight:700;color:${s.color || '#6B7280'};background:${s.bg || '#F3F4F6'};padding:4px 10px;border-radius:20px">${s.label || a.status}</span>
            <button onclick="document.getElementById('apptDetailDlg').remove()"
              style="width:30px;height:30px;border-radius:50%;border:none;background:#F3F4F6;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:#6B7280">&times;</button>
          </div>
        </div>

        <div style="padding:16px 20px;display:flex;flex-direction:column;gap:14px">

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Procedimento</div>
              <div style="font-size:13px;font-weight:600;color:#111827">${a.procedimento || '—'}</div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Profissional</div>
              <div style="font-size:13px;font-weight:600;color:#111827">${profNome}</div>
            </div>
          </div>

          <div style="background:#F9FAFB;border-radius:10px;padding:14px">
            <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Documentos &amp; Consentimentos</div>
            <div style="display:flex;flex-direction:column;gap:9px">

              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                <span style="font-size:12px;color:#374151;flex:1">Ficha de Anamnese</span>
                <div style="display:flex;align-items:center;gap:6px">
                  ${docBool(a.anamneseRespondida, 'Respondida', 'Pendente')}
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
                    <option value="pendente" ${a.consentimentoImagem === 'pendente' ? 'selected' : ''}>Pendente</option>
                    <option value="assinado" ${a.consentimentoImagem === 'assinado' ? 'selected' : ''}>Assinado</option>
                    <option value="recusado" ${a.consentimentoImagem === 'recusado' ? 'selected' : ''}>Recusado</option>
                  </select>
                </div>
              </div>

              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                <span style="font-size:12px;color:#374151;flex:1">Consentimento do Procedimento</span>
                <div style="display:flex;align-items:center;gap:6px">
                  ${consentBadge(a.consentimentoProcedimento)}
                  <select onchange="_setConsent('${id}','procedimento',this.value)"
                    style="font-size:10px;padding:3px 5px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer">
                    <option value="pendente" ${a.consentimentoProcedimento === 'pendente' ? 'selected' : ''}>Pendente</option>
                    <option value="assinado" ${a.consentimentoProcedimento === 'assinado' ? 'selected' : ''}>Assinado</option>
                  </select>
                </div>
              </div>

            </div>
          </div>

          <div style="display:flex;gap:8px">
            ${canFinish ? `<button onclick="document.getElementById('apptDetailDlg').remove();openFinalizarModal('${id}')"
              style="flex:2;padding:11px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:13px">Finalizar Atendimento</button>` : ''}
            <button onclick="document.getElementById('apptDetailDlg').remove();openApptModal('${id}')"
              style="flex:1;padding:11px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px">Editar</button>
          </div>

        </div>
      </div>`

    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.remove() })
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { dlg.remove(); document.removeEventListener('keydown', esc) }
    })
    document.body.appendChild(dlg)
  }

  // ── Exposição global ──────────────────────────────────────────
  window.openApptModal     = openApptModal
  window.closeApptModal    = closeApptModal
  window.saveAppt          = saveAppt
  window.deleteAppt        = deleteAppt
  window.openApptDetail    = openApptDetail
  window.apptSearchPatient = apptSearchPatient
  window.selectApptPatient = selectApptPatient
  window.apptProcAutofill  = apptProcAutofill
  window.apptTipoChange    = apptTipoChange
  window.apptUpdateEndTime = apptUpdateEndTime
  window.apptSetTipo       = apptSetTipo
  window.apptSetAval       = apptSetAval
  window.apptAddProc       = apptAddProc
  window.apptRemoveProc    = apptRemoveProc
  window.apptAutoSala      = apptAutoSala

})()
