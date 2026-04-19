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
  function _warn(msg)        { if (window._showToast) _showToast('Atenção', msg, 'warn'); else alert(msg) }
  function _checkConflict(a, all) { return window._apptCheckConflict ? window._apptCheckConflict(a, all) : { conflict: false } }
  function _setLeadStatus(id, s, skip) { if (window._apptSetLeadStatus) window._apptSetLeadStatus(id, s, skip) }
  // _enviarMsg removido: engine dispara regras de confirmacao via processAppointment

  // ── Event delegation: centraliza data-action em vez de onclick=fn ─
  // Vantagem: bindings sobrevivem ao re-render, menos globals no window
  // e um único ponto de dispatch para todas as interações dos cards.
  var _apptDelegationBound = false
  function _bindApptDelegation() {
    if (_apptDelegationBound) return
    var modal = document.getElementById('apptModal')
    if (!modal) return
    _apptDelegationBound = true
    modal.addEventListener('click', _apptHandleDelegated)
    modal.addEventListener('input', _apptHandleDelegated)
    modal.addEventListener('change', _apptHandleDelegated)
  }
  function _apptHandleDelegated(e) {
    var el = e.target.closest('[data-action]')
    if (!el) return
    var action = el.dataset.action
    var idx = parseInt(el.dataset.idx)
    var field = el.dataset.field
    var value = el.dataset.value

    // input/change → somente para elementos editáveis
    if (e.type === 'input' || e.type === 'change') {
      if (action === 'apptPagamentoField') apptUpdatePagamento(idx, field, el.value)
      else if (action === 'apptProcField') apptProcUpdate(idx, field, el.value)
      return
    }
    // click → botões
    if (e.type !== 'click') return
    if (action === 'apptPagamentoRemove')  apptRemovePagamento(idx)
    else if (action === 'apptPagamentoToggle') apptTogglePago(idx)
    else if (action === 'apptProcRemove')  apptRemoveProc(idx)
    else if (action === 'apptProcSetCortesia') apptProcUpdate(idx, 'cortesia', value === 'true')
    else if (action === 'apptProcSetRetorno')  apptProcUpdate(idx, 'retornoTipo', value)
  }

  // ── openApptModal ─────────────────────────────────────────────
  function openApptModal(id, date, time, profIdx) {
    _bindApptDelegation()
    const modal = document.getElementById('apptModal')
    if (!modal) return

    // Estado limpo a cada abertura. Splice preserva refs compartilhadas
    // (_apptProcs -> _apptState.procs, _apptPagamentos -> _apptState.pagamentos).
    // Deve rodar antes de carregar dados de edicao (linha ~154).
    _apptStateReset()
    _apptCleanupHandlers()
    _apptEnableSave()

    // Preenche profissionais. Mantem o indice original do array de getProfessionals()
    // como value (appointments.profissionalIdx referencia esse indice) e omite
    // membros sem espaco na agenda (agenda_enabled=false) — social media, financeiro etc.
    const profSel = document.getElementById('appt_prof')
    if (profSel) {
      const profs = typeof getProfessionals === 'function' ? getProfessionals() : []
      profSel.innerHTML = '<option value="">Selecione...</option>' +
        profs.map((p, i) => p && p.agenda_enabled === false
          ? ''
          : `<option value="${i}">${p.nome}${p.especialidade ? ' – ' + p.especialidade : ''}</option>`
        ).join('')
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
      const indEl  = document.getElementById('appt_indicado_por'); if (indEl) indEl.value = a.indicadoPor || ''
      const indIdEl= document.getElementById('appt_indicado_por_id'); if (indIdEl) indIdEl.value = a.indicadoPorId || ''
      apptLoadPagamentos(a.pagamentos, a.formaPagamento, a.valor)
      if (a.tipoAvaliacao) {
        const rad = document.querySelector(`input[name="appt_tipo_aval"][value="${a.tipoAvaliacao}"]`)
        if (rad) rad.checked = true
        apptSetAval(a.tipoAvaliacao)
      }
      const motEl = document.getElementById('appt_cortesia_motivo'); if (motEl) motEl.value = a.cortesiaMotivo || ''
      // Carrega procedimentos salvos com todos os campos novos.
      // Push in-place para preservar a ref compartilhada com _apptState.procs
      // (_apptStateReset ja limpou o array no topo de openApptModal).
      if (Array.isArray(a.procedimentos) && a.procedimentos.length > 0) {
        a.procedimentos.forEach(function(p) {
          _apptProcs.push({
            nome:             p.nome || '',
            valor:            parseFloat(p.valor) || 0,
            cortesia:         !!p.cortesia,
            cortesiaMotivo:   p.cortesiaMotivo || '',
            retornoTipo:      p.retornoTipo === 'retorno' ? 'retorno' : 'avulso',
            retornoIntervalo: parseInt(p.retornoIntervalo) || 0,
          })
        })
        _renderApptProcs()
      }
      if (a.tipoConsulta === 'avaliacao' || a.tipoConsulta === 'procedimento') apptSetTipo(a.tipoConsulta)
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
      apptResetPagamentos()
      apptTipoChange()
      if (profIdx != null && profSel) {
        profSel.value = profIdx
      } else if (profSel) {
        // Pré-seleção do profissional principal (Mirian) quando secretária ou
        // dona está logada — vista semana não tem coluna por profissional,
        // então abre no slot sem profIdx e cai aqui. Poupa um clique.
        var _principalIdx = _apptFindPrincipalIdx()
        if (_principalIdx >= 0) profSel.value = _principalIdx
      }
      if (deleteBtn) deleteBtn.style.display = 'none'
    }

    document.getElementById('apptPatientDrop').style.display = 'none'
    document.getElementById('appt_paciente_warn').style.display = 'none'
    // Reset novos campos — tipoPaciente é auto-detectado a partir do historico
    var tipoPac = document.getElementById('appt_tipo_paciente'); if (tipoPac) tipoPac.value = 'novo'
    var pacIdAtual = document.getElementById('appt_paciente_id') && document.getElementById('appt_paciente_id').value
    if (pacIdAtual) apptDetectTipoPaciente(pacIdAtual)
    var indicado = document.getElementById('appt_indicado_por'); if (indicado) indicado.value = ''
    var indicadoId = document.getElementById('appt_indicado_por_id'); if (indicadoId) indicadoId.value = ''
    var indicadoDrop = document.getElementById('apptIndicadoDrop'); if (indicadoDrop) indicadoDrop.style.display = 'none'
    var procsList = document.getElementById('apptProcsList'); if (procsList) procsList.innerHTML = ''
    var procsTotal = document.getElementById('apptProcsTotal'); if (procsTotal) procsTotal.textContent = ''
    // Reset tipo buttons
    var avalRow = document.getElementById('apptTipoAvalRow'); if (avalRow) avalRow.style.display = 'none'
    var pagaRow = document.getElementById('apptPagaRow'); if (pagaRow) pagaRow.style.display = 'none'
    var procRow = document.getElementById('apptProcRow'); if (procRow) procRow.style.display = 'none'
    modal.style.display = 'flex'
    document.body.style.overflow = 'hidden'
    apptUpdateEndTime()

    // Auto-preencher sala + valor de consulta do profissional selecionado.
    // skipIfFilled=true preserva valor salvo em agendamentos antigos (edit).
    apptAutoSala()
    apptAutoValorConsulta({ skipIfFilled: true })

    // Restaurar draft se novo (sem id) e existe draft salvo.
    // Campos passados explicitamente pelo caller (slot da agenda) tem precedencia.
    if (!id) {
      var skipFields = []
      if (date) skipFields.push('appt_data')
      if (time) skipFields.push('appt_inicio')
      if (profIdx != null) skipFields.push('appt_prof')
      _restoreDraft({ skipFields: skipFields })
    }
    _bindDraftListeners()

    // Carregar procedimentos da BD (async, popula select quando pronto)
    _cachedClinicProcs = null
    _loadClinicProcs().then(function(procs) { _populateProcSelect(procs) })
  }

  // ── closeApptModal ────────────────────────────────────────────
  function closeApptModal() {
    _saveDraft()
    const m = document.getElementById('apptModal')
    if (m) m.style.display = 'none'
    document.body.style.overflow = ''
    _apptCleanupHandlers()
    _apptEnableSave()
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

  // ── Estado consolidado do modal de agendamento ───────────────
  var _apptState = {
    procs: [],
    pagamentos: [],
    multiProcChoice: null,
  }
  function _apptStateReset() {
    _apptState.procs.splice(0)
    _apptState.pagamentos.splice(0)
    _apptState.multiProcChoice = null
  }

  // ── Profissional principal default para secretária/dona ──────
  // Mirian é sócia/dona; no fluxo de agendamento, quando a secretária
  // (role=receptionist) ou a própria Mirian (role=owner) está logada,
  // o select de Profissional abre já com ela selecionada.
  // Retorna o índice no array de getProfessionals() ou -1 se não aplica.
  function _apptFindPrincipalIdx() {
    try {
      var profile = typeof getCurrentProfile === 'function' ? getCurrentProfile() : null
      if (!profile) return -1
      if (profile.role !== 'owner' && profile.role !== 'receptionist') return -1
      var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
      if (!profs.length) return -1
      // Prioridade 1: profissional vinculado ao próprio owner logado.
      if (profile.role === 'owner' && profile.id) {
        var byUser = profs.findIndex(function(p) { return p && p.user_id === profile.id && p.ativo !== false && p.agenda_enabled !== false })
        if (byUser >= 0) return byUser
      }
      // Prioridade 2: primeiro sócio ativo com espaço na agenda (cobre secretária).
      var bySocio = profs.findIndex(function(p) { return p && (p.nivel || 'funcionario') === 'socio' && p.ativo !== false && p.agenda_enabled !== false })
      return bySocio
    } catch (_) { return -1 }
  }

  // ── Listeners ativos do modal (cleanup preventivo de memory leak) ─
  // Qualquer addEventListener em document/window feito enquanto o modal
  // esta aberto deve ser registrado aqui; closeApptModal / _apptDetailClose
  // iteram e removem tudo na saida.
  var _apptActiveHandlers = []
  function _apptRegisterHandler(target, type, handler, options) {
    target.addEventListener(type, handler, options)
    _apptActiveHandlers.push({ target: target, type: type, handler: handler, options: options })
  }
  function _apptCleanupHandlers() {
    while (_apptActiveHandlers.length) {
      var h = _apptActiveHandlers.pop()
      try { h.target.removeEventListener(h.type, h.handler, h.options) } catch (e) { /* noop */ }
    }
  }

  // ── Controle de duplo submit / validacao inline ──────────────
  // Botao #apptSaveBtn e desabilitado durante sync + enquanto houver
  // erros inline ativos (bordas em var(--danger) marcadas por _inlineValidate).
  function _apptSaveBtn() { return document.getElementById('apptSaveBtn') }
  function _apptDisableSave(reason) {
    var btn = _apptSaveBtn()
    if (!btn) return
    btn.disabled = true
    btn.style.opacity = '0.6'
    btn.style.cursor = 'not-allowed'
    if (reason === 'syncing') {
      var lbl = btn.querySelector('[data-appt-save-label]')
      if (lbl) lbl.textContent = 'Salvando...'
    }
  }
  function _apptEnableSave() {
    var btn = _apptSaveBtn()
    if (!btn) return
    btn.disabled = false
    btn.style.opacity = ''
    btn.style.cursor = ''
    var lbl = btn.querySelector('[data-appt-save-label]')
    if (lbl) lbl.textContent = 'Salvar'
  }
  // Varre campos do modal por borda danger (erro inline) — bloqueia save
  // quando houver erro visivel ao usuario.
  function _apptHasInlineErrors() {
    var modal = document.getElementById('apptModal')
    if (!modal) return false
    var fields = modal.querySelectorAll('input, select, textarea')
    for (var i = 0; i < fields.length; i++) {
      var s = fields[i].style && fields[i].style.borderColor
      if (s && /var\(--danger\)|#DC2626|#EF4444|rgb\(220,\s*38,\s*38\)/i.test(s)) return true
    }
    return false
  }

  // ── Auto-save draft ─────────────────────────────────────────
  var DRAFT_KEY = 'clinicai_appt_draft'
  var _draftTimer = null

  function _draftFieldIds() {
    return ['appt_paciente_q','appt_paciente_id','appt_paciente_phone','appt_data',
            'appt_inicio','appt_duracao','appt_prof','appt_sala','appt_proc',
            'appt_tipo','appt_origem','appt_valor','appt_obs',
            'appt_cortesia_motivo','appt_indicado_por','appt_indicado_por_id',
            'appt_tipo_paciente','appt_status']
  }

  function _saveDraft() {
    var editId = document.getElementById('appt_id')
    if (editId && editId.value) return
    var draft = {}
    _draftFieldIds().forEach(function (fid) {
      var el = document.getElementById(fid)
      if (el) draft[fid] = el.value || ''
    })
    var rad = document.querySelector('input[name="appt_tipo_aval"]:checked')
    draft._tipoAval = rad ? rad.value : ''
    draft._confirmacao = !!(document.getElementById('appt_confirmacao') || {}).checked
    draft._consentimento = !!(document.getElementById('appt_consentimento') || {}).checked
    draft._procs = JSON.parse(JSON.stringify(_apptState.procs))
    draft._pagamentos = JSON.parse(JSON.stringify(_apptState.pagamentos))
    draft._ts = Date.now()
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch (e) { /* quota */ }
  }

  function _scheduleDraftSave() {
    if (_draftTimer) clearTimeout(_draftTimer)
    _draftTimer = setTimeout(_saveDraft, 2000)
  }

  function _clearDraft() {
    localStorage.removeItem(DRAFT_KEY)
    if (_draftTimer) { clearTimeout(_draftTimer); _draftTimer = null }
  }

  function _restoreDraft(opts) {
    try {
      var raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return false
      var d = JSON.parse(raw)
      // Janela reduzida: 5 min. Senao o rascunho fica perseguindo o user.
      if (Date.now() - d._ts > 300000) { _clearDraft(); return false }
      // So restaura se o rascunho tiver conteudo real (paciente preenchido OU procs OU pagamentos)
      var hasPaciente = !!(d.appt_paciente_q || d.appt_paciente_id)
      var hasProcs    = Array.isArray(d._procs) && d._procs.length
      var hasPagto    = Array.isArray(d._pagamentos) && d._pagamentos.length
      if (!hasPaciente && !hasProcs && !hasPagto) { _clearDraft(); return false }
      // Campos que o caller passou explicitamente nao devem ser sobrescritos
      // pelo rascunho (ex: clique em slot da agenda define data/hora/profissional).
      var skipFields = (opts && Array.isArray(opts.skipFields)) ? opts.skipFields : []
      _draftFieldIds().forEach(function (fid) {
        if (skipFields.indexOf(fid) >= 0) return
        var el = document.getElementById(fid)
        if (el && d[fid]) el.value = d[fid]
      })
      if (d._tipoAval) {
        var rad = document.querySelector('input[name="appt_tipo_aval"][value="' + d._tipoAval + '"]')
        if (rad) rad.checked = true
      }
      var confEl = document.getElementById('appt_confirmacao')
      if (confEl) confEl.checked = !!d._confirmacao
      var consEl = document.getElementById('appt_consentimento')
      if (consEl) consEl.checked = !!d._consentimento
      if (Array.isArray(d._procs) && d._procs.length) {
        _apptState.procs.length = 0
        d._procs.forEach(function (p) { _apptState.procs.push(p) })
        _renderApptProcs()
      }
      if (Array.isArray(d._pagamentos) && d._pagamentos.length) {
        _apptState.pagamentos.length = 0
        d._pagamentos.forEach(function (p) { _apptState.pagamentos.push(p) })
        if (typeof apptRenderPagamentos === 'function') apptRenderPagamentos()
      }
      if (d.appt_tipo) apptSetTipo(d.appt_tipo)
      if (d._tipoAval) apptSetAval(d._tipoAval)
      apptTipoChange()
      apptUpdateEndTime()
      if (window._showToast) _showToast('Rascunho restaurado', 'Dados do agendamento anterior foram recuperados', 'info')
      return true
    } catch (e) { _clearDraft(); return false }
  }

  function _bindDraftListeners() {
    var modal = document.getElementById('apptModal')
    if (!modal || modal._draftBound) return
    modal._draftBound = true
    modal.addEventListener('input', _scheduleDraftSave)
    modal.addEventListener('change', _scheduleDraftSave)
    modal.addEventListener('change', _inlineValidate)
  }

  function _inlineValidate(e) {
    var id = e.target.id
    if (id === 'appt_data') {
      var val = e.target.value
      var today = new Date().toISOString().slice(0, 10)
      var editId = (document.getElementById('appt_id') || {}).value
      if (!editId && val && val < today) {
        e.target.style.borderColor = 'var(--danger)'
        e.target.title = 'Data no passado'
      } else {
        e.target.style.borderColor = ''
        e.target.title = ''
      }
    }
    if (id === 'appt_inicio') {
      var dataEl = document.getElementById('appt_data')
      var today2 = new Date().toISOString().slice(0, 10)
      var editId2 = (document.getElementById('appt_id') || {}).value
      if (!editId2 && dataEl && dataEl.value === today2) {
        var now = new Date()
        var parts = e.target.value.split(':')
        var chosen = new Date(today2 + 'T' + e.target.value + ':00')
        if (chosen < now) {
          e.target.style.borderColor = 'var(--danger)'
          e.target.title = 'Horario ja passou'
        } else {
          e.target.style.borderColor = ''
          e.target.title = ''
        }
      }
    }
  }

  // ── Toggle Consulta / Procedimento ─────────────────────────
  var _apptProcs = _apptState.procs

  function _apptHasConsultaData() {
    var aval = document.getElementById('appt_taval_hidden') && document.getElementById('appt_taval_hidden').value
    var val  = document.getElementById('appt_valor') && document.getElementById('appt_valor').value
    var mot  = document.getElementById('appt_cortesia_motivo') && document.getElementById('appt_cortesia_motivo').value
    var hasPag = _apptPagamentos.some(function(p) { return p.forma || p.valor })
    return !!(aval || val || mot || hasPag)
  }

  function _apptHasProcedimentoData() {
    return Array.isArray(_apptProcs) && _apptProcs.length > 0
  }

  function _apptClearConsultaData() {
    var hidden = document.getElementById('appt_taval_hidden'); if (hidden) hidden.value = ''
    var rPaga = document.getElementById('appt_taval_paga'); if (rPaga) rPaga.checked = false
    var rCort = document.getElementById('appt_taval_cortesia'); if (rCort) rCort.checked = false
    var btnCort = document.getElementById('appt_aval_cortesia'); if (btnCort) { btnCort.style.background = '#fff'; btnCort.style.borderColor = '#BBF7D0' }
    var btnPaga = document.getElementById('appt_aval_paga'); if (btnPaga) { btnPaga.style.background = '#fff'; btnPaga.style.borderColor = '#FECACA' }
    var valEl = document.getElementById('appt_valor'); if (valEl) valEl.value = ''
    var motEl = document.getElementById('appt_cortesia_motivo'); if (motEl) motEl.value = ''
    apptResetPagamentos()
  }

  function _apptClearProcedimentoData() {
    _apptProcs.splice(0)  // muta in-place; preserva ref compartilhada com _apptState.procs
    var procsList = document.getElementById('apptProcsList'); if (procsList) procsList.innerHTML = ''
    var procsTotal = document.getElementById('apptProcsTotal'); if (procsTotal) procsTotal.textContent = ''
    var procSel = document.getElementById('appt_proc_select'); if (procSel) procSel.value = ''
    var procVal = document.getElementById('appt_proc_valor'); if (procVal) procVal.value = ''
  }

  function apptSetTipo(tipo) {
    var btnC = document.getElementById('appt_tipo_btn_consulta')
    var btnP = document.getElementById('appt_tipo_btn_proc')
    var avalRow = document.getElementById('apptTipoAvalRow')
    var pagaRow = document.getElementById('apptPagaRow')
    var cortRow = document.getElementById('apptCortesiaRow')
    var procRow = document.getElementById('apptProcRow')
    var tipoSel = document.getElementById('appt_tipo')
    var tipoAtual = tipoSel && tipoSel.value

    // Confirma antes de descartar dados do outro lado
    if (tipo === 'avaliacao' && tipoAtual === 'procedimento' && _apptHasProcedimentoData()) {
      if (!confirm('Trocar para Consulta vai apagar os procedimentos adicionados. Continuar?')) return
      _apptClearProcedimentoData()
    } else if (tipo === 'procedimento' && tipoAtual === 'avaliacao' && _apptHasConsultaData()) {
      if (!confirm('Trocar para Procedimento vai apagar os dados da consulta. Continuar?')) return
      _apptClearConsultaData()
    }
    // Clear adicional: sempre zera valor/pagamentos ao trocar tipo,
    // evita "cruzamento" de dados quando confirm skip (ex: valor 0).
    if (tipoAtual && tipoAtual !== tipo) {
      var valEl = document.getElementById('appt_valor'); if (valEl) valEl.value = ''
      apptResetPagamentos()
    }

    if (tipo === 'avaliacao') {
      if (tipoSel) tipoSel.value = 'avaliacao'
      if (btnC) { btnC.style.background = '#EEF2FF'; btnC.style.borderColor = '#4F46E5'; btnC.style.color = '#4F46E5' }
      if (btnP) { btnP.style.background = '#fff'; btnP.style.borderColor = '#C7D2FE'; btnP.style.color = '#4F46E5' }
      if (avalRow) avalRow.style.display = ''
      if (procRow) procRow.style.display = 'none'
      if (pagaRow) pagaRow.style.display = 'none'
      if (cortRow) cortRow.style.display = 'none'
    } else {
      if (tipoSel) tipoSel.value = 'procedimento'
      if (btnP) { btnP.style.background = '#EEF2FF'; btnP.style.borderColor = '#4F46E5'; btnP.style.color = '#4F46E5' }
      if (btnC) { btnC.style.background = '#fff'; btnC.style.borderColor = '#C7D2FE'; btnC.style.color = '#4F46E5' }
      if (avalRow) avalRow.style.display = 'none'
      if (procRow) procRow.style.display = ''
      if (pagaRow) pagaRow.style.display = 'none'
      if (cortRow) cortRow.style.display = 'none'
    }
    apptShowPagamentosBlock()
  }

  function apptSetAval(val) {
    var btnCort = document.getElementById('appt_aval_cortesia')
    var btnPaga = document.getElementById('appt_aval_paga')
    var pagaRow = document.getElementById('apptPagaRow')
    var cortRow = document.getElementById('apptCortesiaRow')
    var hiddenEl = document.getElementById('appt_taval_hidden')
    var radioPaga = document.getElementById('appt_taval_paga')
    var radioCort = document.getElementById('appt_taval_cortesia')

    if (val === 'cortesia') {
      if (btnCort) { btnCort.style.background = '#F0FDF4'; btnCort.style.borderColor = '#16A34A' }
      if (btnPaga) { btnPaga.style.background = '#fff'; btnPaga.style.borderColor = '#FECACA' }
      if (pagaRow) pagaRow.style.display = 'none'
      if (cortRow) cortRow.style.display = ''
      if (radioCort) radioCort.checked = true
      // Limpa valor/pagamentos (não se aplicam à cortesia)
      var valEl = document.getElementById('appt_valor'); if (valEl) valEl.value = ''
      apptResetPagamentos()
    } else {
      if (btnPaga) { btnPaga.style.background = '#FEF2F2'; btnPaga.style.borderColor = '#DC2626' }
      if (btnCort) { btnCort.style.background = '#fff'; btnCort.style.borderColor = '#BBF7D0' }
      if (pagaRow) pagaRow.style.display = ''
      if (cortRow) cortRow.style.display = 'none'
      if (radioPaga) radioPaga.checked = true
      // Limpa motivo cortesia (não se aplica a paga)
      var motEl = document.getElementById('appt_cortesia_motivo'); if (motEl) motEl.value = ''
      if (_apptPagamentos.length === 0) apptResetPagamentos()
      // Se valor está vazio (típico voltando de cortesia que zerou), repreenche
      // com o valor_consulta do profissional selecionado. skipIfFilled respeita
      // se o user já digitou valor customizado antes.
      var valElP = document.getElementById('appt_valor')
      if (valElP && !valElP.value) apptAutoValorConsulta({ skipIfFilled: true })
      if (valElP && valElP.value && _apptPagamentos.length === 1 && !_apptPagamentos[0].valor) {
        _apptPagamentos[0].valor = parseFloat(valElP.value) || 0
      }
    }
    if (hiddenEl) hiddenEl.value = val
    apptShowPagamentosBlock()
  }

  // ── Carregar procedimentos da BD ─────────────────────────────
  var _cachedClinicProcs = null

  async function _loadClinicProcs() {
    if (_cachedClinicProcs) return _cachedClinicProcs
    var procs = []

    // Carregar procedimentos do Supabase
    if (window.ProcedimentosRepository) {
      var res = await ProcedimentosRepository.getAll(true)
      if (res.ok && Array.isArray(res.data)) {
        res.data.forEach(function(p) {
          procs.push({
            nome: p.nome,
            categoria: p.categoria || 'Procedimentos',
            valor: parseFloat(p.preco) || 0,
            duracao: parseInt(p.duracao_min) || 60,
            sessoes: parseInt(p.sessoes) || 0,
            intervalo_sessoes_dias: parseInt(p.intervalo_sessoes_dias) || 0,
            fases: Array.isArray(p.fases) ? p.fases : [],
          })
        })
      }
    }

    // Carregar injetaveis do Supabase
    if (window.InjetaveisRepository) {
      var res2 = await InjetaveisRepository.getAll(true)
      if (res2.ok && Array.isArray(res2.data)) {
        res2.data.forEach(function(inj) {
          procs.push({ nome: inj.nome, categoria: 'Injetaveis', valor: parseFloat(inj.preco || inj.preco_custo) || 0, duracao: 60 })
        })
      }
    }

    // Carregar technologies (aparelhos)
    if (typeof getTechnologies === 'function') {
      getTechnologies().forEach(function(t) {
        // Evitar duplicados
        if (!procs.find(function(p) { return p.nome === t.nome })) {
          procs.push({ nome: t.nome, categoria: 'Tecnologias', valor: 0, duracao: parseInt(t.duracao) || 60 })
        }
      })
    }

    // Se BD vazia, usar catalogo fallback
    if (!procs.length) {
      procs = [
        { nome:'Toxina Botulinica (Botox)', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Labios', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Olheiras', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Bigode Chines', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Malar', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Mandibula', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Queixo', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'Bioestimulador - Sculptra', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'Bioestimulador - Radiesse', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'Bio Remodelador de Colageno', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'Fotona 4D', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Fotona - Intimo', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Fotona - Capilar', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Fotona - Corporal', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Peeling Quimico', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Microagulhamento', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Limpeza de Pele', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Hidratacao Facial', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Lifting 5D - Protocolo Completo', categoria:'Lifting 5D', valor:0, duracao:60 },
        { nome:'Lifting 5D - Sessao Fotona', categoria:'Lifting 5D', valor:0, duracao:60 },
        { nome:'Lifting 5D - Sessao Injetaveis', categoria:'Lifting 5D', valor:0, duracao:60 },
        { nome:'Veu de Noiva', categoria:'Lifting 5D', valor:0, duracao:60 },
      ]
    }

    _cachedClinicProcs = procs
    return procs
  }

  function _populateProcSelect(procs) {
    var sel = document.getElementById('appt_proc_select')
    if (!sel) return

    // Agrupar por categoria
    var cats = {}
    procs.forEach(function(p) {
      var cat = p.categoria || 'Outros'
      if (!cats[cat]) cats[cat] = []
      cats[cat].push(p)
    })

    var html = '<option value="">Selecionar procedimento...</option>'
    Object.keys(cats).forEach(function(cat) {
      html += '<optgroup label="' + cat.replace(/"/g, '&quot;') + '">'
      cats[cat].forEach(function(p) {
        var sessoes = p.sessoes || 0
        var intervalo = p.intervalo_sessoes_dias || 0
        var fasesArr = Array.isArray(p.fases) ? p.fases : []
        var fasesAttr = fasesArr.length
          ? JSON.stringify(fasesArr).replace(/"/g, '&quot;')
          : ''
        html += '<option value="' + (p.nome || '').replace(/"/g, '&quot;')
          + '" data-valor="' + (p.valor || 0)
          + '" data-dur="' + (p.duracao || 60)
          + '" data-sessoes="' + sessoes
          + '" data-intervalo="' + intervalo + '"'
          + (fasesAttr ? ' data-fases="' + fasesAttr + '"' : '')
          + '>'
          + (p.nome || '').replace(/</g, '&lt;')
          + (p.valor > 0 ? ' — R$ ' + p.valor.toLocaleString('pt-BR') : '')
          + '</option>'
      })
      html += '</optgroup>'
    })
    sel.innerHTML = html
  }

  // ── Selecionar procedimento do catalogo ─────────────────────
  function apptProcSelected(sel) {
    if (!sel.value) return
    var opt = sel.options[sel.selectedIndex]
    var valor = opt && opt.dataset.valor ? parseFloat(opt.dataset.valor) : 0

    // Preencher valor da tabela
    var valorEl = document.getElementById('appt_proc_valor')
    if (valorEl && valor > 0) valorEl.value = valor

    // Preencher campo hidden pra compatibilidade
    var procHidden = document.getElementById('appt_proc')
    if (procHidden) procHidden.value = sel.value
  }

  // ── Adicionar procedimento a lista ─────────────────────────
  // Escala de intervalos de retorno (compartilhada com o prontuario)
  var APPT_RETORNO_INTERVALS = [
    { value: 7,   label: '1 semana' },
    { value: 15,  label: '15 dias' },
    { value: 30,  label: '1 mês' },
    { value: 60,  label: '2 meses' },
    { value: 90,  label: '3 meses' },
    { value: 120, label: '4 meses' },
    { value: 150, label: '5 meses' },
    { value: 180, label: '6 meses' },
    { value: 365, label: '1 ano' },
  ]

  function _apptRetornoOpts(selected) {
    return '<option value="">Sem retorno</option>' +
      APPT_RETORNO_INTERVALS.map(function(r) {
        var sel = parseInt(selected) === r.value ? ' selected' : ''
        return '<option value="' + r.value + '"' + sel + '>' + r.label + '</option>'
      }).join('')
  }

  // Sincroniza o valor total do pagamento com o total a pagar
  // (consulta ou soma dos procs). Só afeta quando há 1 linha única —
  // se o usuário já dividiu em múltiplas formas, não mexe.
  function apptSyncPagamentoTotal() {
    if (_apptPagamentos.length !== 1) return
    _apptPagamentos[0].valor = _apptValorTotalPagar()
    apptRenderPagamentos()
  }

  function apptAddProc() {
    var selEl = document.getElementById('appt_proc_select')
    var nameEl = document.getElementById('appt_proc')
    var valorEl = document.getElementById('appt_proc_valor')
    var name = (selEl && selEl.value) || (nameEl && nameEl.value.trim())
    var valor = valorEl ? parseFloat(valorEl.value || '0') : 0
    if (!name) return
    // Captura defaults de recorrencia do catalogo (data-sessoes/data-intervalo/data-fases)
    var defaultSessoes = 0, defaultIntervalo = 0, defaultFases = null
    if (selEl && selEl.selectedOptions && selEl.selectedOptions[0]) {
      var opt = selEl.selectedOptions[0]
      defaultSessoes = parseInt(opt.dataset.sessoes) || 0
      defaultIntervalo = parseInt(opt.dataset.intervalo) || 0
      if (opt.dataset.fases) {
        try { defaultFases = JSON.parse(opt.dataset.fases) } catch(e) { defaultFases = null }
      }
    }
    _apptProcs.push({
      nome: name,
      valor: valor,
      cortesia: false,
      cortesiaMotivo: '',
      retornoTipo: 'avulso',
      retornoIntervalo: 0,
      fases: defaultFases || null,
    })
    if (selEl) selEl.value = ''
    if (nameEl) nameEl.value = ''
    if (valorEl) valorEl.value = ''
    _renderApptProcs()
    apptShowPagamentosBlock()
    apptSyncPagamentoTotal()

    // Auto-preenche recorrencia se procedimento tem defaults no catalogo
    // (so em novo agendamento, nao em edit)
    var isEdit = (document.getElementById('appt_id') || {}).value
    // Multi-fase tem prioridade — total vem do somatorio, intervalo da 1a fase
    var hasFases = Array.isArray(defaultFases) && defaultFases.length > 0
    var totalDerivado = hasFases ? _recTotalFromFases(defaultFases) : defaultSessoes
    var intervaloInicial = hasFases ? (parseInt(defaultFases[0].intervalo_dias) || defaultIntervalo) : defaultIntervalo

    if (!isEdit && totalDerivado > 1 && intervaloInicial > 0) {
      var recCheck = document.getElementById('appt_rec_check')
      var recInterval = document.getElementById('appt_rec_interval')
      var recTotal = document.getElementById('appt_rec_total')
      var recProcSel = document.getElementById('appt_rec_proc')
      if (recCheck && !recCheck.checked) {
        recCheck.checked = true
        apptToggleRecurrence(recCheck)
      }
      if (recInterval) {
        recInterval.value = intervaloInicial
        // Multi-fase: o intervalo unico nao representa a serie (desabilita edicao
        // e deixa claro que a cadencia vem das fases).
        recInterval.disabled = !!hasFases
        recInterval.title = hasFases
          ? 'Cadencia controlada pelas fases do procedimento'
          : ''
      }
      if (recTotal) {
        recTotal.value = totalDerivado
        recTotal.disabled = !!hasFases
        recTotal.title = hasFases
          ? 'Total derivado das fases do procedimento'
          : ''
      }
      // Aponta o select do procedimento recorrente pro que acabou de ser adicionado
      if (recProcSel) {
        var newIdx = _apptProcs.length - 1
        recProcSel.value = String(newIdx)
      }
      _apptRecurrenceUpdatePreview()
      var msg = hasFases
        ? name + ': ' + _recFasesLabel(defaultFases) + ' (' + totalDerivado + ' sessoes)'
        : name + ': ' + defaultSessoes + ' sessoes a cada ' + defaultIntervalo + ' dias'
      if (window._showToast) window._showToast('Recorrencia sugerida', msg, 'info')
    }

    // Alerta se mais de 1 procedimento em 1h
    if (_apptProcs.length > 1) _checkMultiProcAlert()
  }

  function apptRemoveProc(i) {
    _apptProcs.splice(i, 1)
    _renderApptProcs()
    apptShowPagamentosBlock()
    apptSyncPagamentoTotal()
    apptUpdatePagamentosTotal()
  }

  // ── Alerta multi-procedimento ──────────────────────────────
  // BLOCKING modal: decisão obrigatória (não fecha com × / Esc /
  // click-fora). Única saída é escolher uma das 3 opções e clicar
  // Confirmar. Estado vive em _apptState.multiProcChoice.

  function _checkMultiProcAlert() {
    var durEl = document.getElementById('appt_duracao')
    var durAtual = durEl ? parseInt(durEl.value) : 60
    if (durAtual > 60) return // ja aumentou, nao alertar

    _multiProcCloseAlert() // garante limpeza de instancia anterior
    _apptState.multiProcChoice = null

    var alert = document.createElement('div')
    alert.id = 'multiProcAlert'
    alert.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px'
    alert.innerHTML =
      '<div id="multiProcInner" role="alertdialog" aria-modal="true" aria-labelledby="multiProcTitle" style="background:#fff;border-radius:16px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)">' +
        '<div style="background:#F59E0B;padding:14px 18px">' +
          '<div id="multiProcTitle" style="font-size:14px;font-weight:800;color:#fff">Mais de 1 procedimento</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,.85);margin-top:2px">' + _apptProcs.length + ' procedimentos na mesma sessao — decisão obrigatória</div>' +
        '</div>' +
        '<div style="padding:16px 18px">' +
          '<div style="font-size:13px;color:#374151;line-height:1.55;margin-bottom:14px">O tempo pode nao ser suficiente para todos os procedimentos. Escolha uma opção para continuar:</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px" id="multiProcOpts">' +
            _multiProcOpt(60,  'Manter 1h') +
            _multiProcOpt(90,  'Aumentar pra 1h30') +
            _multiProcOpt(120, 'Aumentar pra 2h') +
          '</div>' +
          '<div style="display:flex;margin-top:16px">' +
            '<button type="button" id="multiProcConfirmBtn" onclick="_multiProcConfirm()" disabled style="flex:1;padding:10px 16px;background:#9CA3AF;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:not-allowed;opacity:.6">Selecione uma opção</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    // NÃO há click-fora nem Esc — decisão obrigatória.
    document.body.appendChild(alert)
  }

  function _multiProcOpt(dur, label) {
    return '<button type="button" onclick="_multiProcPick(' + dur + ')" id="multiProcOpt_' + dur + '"' +
      ' style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border:1.5px solid #E5E7EB;border-radius:9px;cursor:pointer;text-align:left;width:100%;transition:all .15s">' +
      '<span style="width:14px;height:14px;border:1.5px solid #D1D5DB;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center" id="multiProcDot_' + dur + '"></span>' +
      '<span style="font-size:13px;font-weight:600;color:#374151">' + label + '</span>' +
      '</button>'
  }

  function _multiProcPick(dur) {
    _apptState.multiProcChoice = dur
    // Repinta visual
    [60, 90, 120].forEach(function(d) {
      var btn = document.getElementById('multiProcOpt_' + d)
      var dot = document.getElementById('multiProcDot_' + d)
      if (!btn || !dot) return
      var sel = d === dur
      btn.style.background = sel ? '#FFFBEB' : '#fff'
      btn.style.borderColor = sel ? '#F59E0B' : '#E5E7EB'
      dot.style.borderColor = sel ? '#F59E0B' : '#D1D5DB'
      dot.innerHTML = sel ? '<span style="width:7px;height:7px;background:#F59E0B;border-radius:50%"></span>' : ''
    })
    // Habilita Confirmar
    var btnConfirm = document.getElementById('multiProcConfirmBtn')
    if (btnConfirm) {
      btnConfirm.disabled = false
      btnConfirm.style.background = '#F59E0B'
      btnConfirm.style.cursor = 'pointer'
      btnConfirm.style.opacity = '1'
      btnConfirm.textContent = 'Confirmar'
    }
  }

  function _multiProcConfirm() {
    var dur = _apptState.multiProcChoice
    if (!dur) return
    var durEl = document.getElementById('appt_duracao')
    if (durEl) durEl.value = dur
    apptUpdateEndTime()
    _multiProcCloseAlert()

    // Validacao escondida: se manteve 1h com multiplos procs, dispara
    // double-check via WhatsApp para o responsavel da agenda confirmar
    // que o tempo é suficiente. Roda apos fechar o modal pra nao travar
    // a UI se createDoubleCheck lancar erro.
    if (dur === 60 && _apptProcs.length > 1) {
      try {
        var paciente = (document.getElementById('appt_paciente_q') && document.getElementById('appt_paciente_q').value) || 'Paciente'
        var procsNomes = _apptProcs.map(function(p) { return p.nome }).join(', ')
        var msg = paciente + ' tem ' + _apptProcs.length + ' procedimentos (' + procsNomes + ') agendados em 1 hora.\nPor favor revise e confirme se o tempo e suficiente.'

        var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
        var responsavel = profs.find(function(p) { return /mirian/i.test(p.nome || p.display_name || '') }) || profs[0]
        var respPhone = responsavel && (responsavel.phone || responsavel.whatsapp || responsavel.telefone) || ''
        var respName = responsavel && (responsavel.display_name || responsavel.nome) || 'Responsavel'

        if (window.createDoubleCheck) {
          createDoubleCheck('multi_proc', 'Multiplos procedimentos em 1h', msg, respPhone, respName)
        }
      } catch (e) { console.error('[multi_proc double-check]', e) }
    }
  }

  // Chamado APENAS pelo _multiProcConfirm após o usuário escolher.
  // Não há outro caminho de fechamento — modal é blocking.
  function _multiProcCloseAlert() {
    var alertEl = document.getElementById('multiProcAlert')
    if (alertEl) alertEl.remove()
    _apptState.multiProcChoice = null
  }

  function apptProcUpdate(i, field, value) {
    var p = _apptProcs[i]
    if (!p) return
    if (field === 'valor')             p.valor = parseFloat(value) || 0
    else if (field === 'retornoIntervalo') p.retornoIntervalo = parseInt(value) || 0
    else                                p[field] = value
    if (field === 'cortesia') {
      // Limpa motivo se voltou pra paga; limpa valor se virou cortesia
      if (!value) p.cortesiaMotivo = ''
    }
    if (field === 'retornoTipo' && value !== 'retorno') p.retornoIntervalo = 0
    _renderApptProcs()
    _updateApptTotalWithDiscount()
    apptShowPagamentosBlock()
    apptSyncPagamentoTotal()
    apptUpdatePagamentosTotal()
  }

  function _renderApptProcs() {
    var list = document.getElementById('apptProcsList')
    var totalEl = document.getElementById('apptProcsTotal')
    if (!list) return
    if (!_apptProcs.length) {
      list.innerHTML = '<div style="font-size:11px;color:#9CA3AF;padding:4px 0">Nenhum procedimento adicionado</div>'
      if (totalEl) totalEl.textContent = ''
      _updateApptTotalWithDiscount()
      return
    }
    // Onclick direto (mais robusto que delegation pra este caso)
    // html`` continua escapando valores interpolados.
    var H = window.html
    list.innerHTML = _apptProcs.map(function(p, i) {
      var cortesia = !!p.cortesia
      var bgCard = cortesia ? '#F0FDF4' : '#fff'
      var bdCard = cortesia ? '#86EFAC' : '#E5E7EB'
      var btnCortBg = cortesia ? '#16A34A' : '#fff'
      var btnCortFg = cortesia ? '#fff'    : '#16A34A'
      var btnPagaBg = !cortesia ? '#4F46E5' : '#fff'
      var btnPagaFg = !cortesia ? '#fff'    : '#4F46E5'

      var motivoHtml = cortesia
        ? H`<input type="text" placeholder="Motivo da cortesia *" value="${p.cortesiaMotivo || ''}" oninput="apptProcUpdate(${i}, 'cortesiaMotivo', this.value)" style="width:100%;margin-top:4px;padding:5px 7px;border:1px solid #86EFAC;border-radius:5px;font-size:11px;outline:none;box-sizing:border-box;background:#fff"/>`
        : ''

      var retorno = p.retornoTipo || 'avulso'
      var btnAvBg = retorno === 'avulso' ? '#7C3AED' : '#fff'
      var btnAvFg = retorno === 'avulso' ? '#fff'    : '#7C3AED'
      var btnRtBg = retorno === 'retorno' ? '#7C3AED' : '#fff'
      var btnRtFg = retorno === 'retorno' ? '#fff'    : '#7C3AED'
      var intervaloHtml = retorno === 'retorno'
        ? H`<select onchange="apptProcUpdate(${i}, 'retornoIntervalo', this.value)" style="flex:1;padding:5px 7px;border:1px solid #DDD6FE;border-radius:5px;font-size:11px;background:#fff;outline:none">${H.raw(_apptRetornoOpts(p.retornoIntervalo))}</select>`
        : ''

      var valorStr = p.valor ? p.valor.toFixed(2) : ''
      var valorOrTag = cortesia
        ? H`<span style="font-size:10px;font-weight:700;color:#16A34A">CORTESIA</span>`
        : H`<input type="number" step="0.01" value="${valorStr}" oninput="apptProcUpdate(${i}, 'valor', this.value)" style="width:75px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;text-align:right;outline:none"/>`

      return H`<div data-proc-row="${i}" style="background:${bgCard};border:1px solid ${bdCard};border-radius:8px;padding:7px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="flex:1;font-size:11px;font-weight:700;color:#374151">${p.nome || ''}</span>
          ${H.raw(valorOrTag)}
          <button type="button" onclick="apptRemoveProc(${i})" style="background:#FEE2E2;color:#DC2626;border:none;border-radius:5px;font-size:12px;font-weight:700;width:22px;height:22px;cursor:pointer;line-height:1">×</button>
        </div>
        <div style="display:flex;gap:5px;margin-top:5px">
          <button type="button" onclick="apptProcUpdate(${i}, 'cortesia', false)" style="flex:1;padding:4px 8px;background:${btnPagaBg};color:${btnPagaFg};border:1px solid #C7D2FE;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer">Pago</button>
          <button type="button" onclick="apptProcUpdate(${i}, 'cortesia', true)" style="flex:1;padding:4px 8px;background:${btnCortBg};color:${btnCortFg};border:1px solid #BBF7D0;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer">Cortesia</button>
        </div>
        ${H.raw(motivoHtml)}
        <div style="display:flex;gap:5px;margin-top:5px">
          <button type="button" onclick="apptProcUpdate(${i}, 'retornoTipo', 'avulso')" style="flex:1;padding:4px 8px;background:${btnAvBg};color:${btnAvFg};border:1px solid #DDD6FE;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer">Sessão Avulsa</button>
          <button type="button" onclick="apptProcUpdate(${i}, 'retornoTipo', 'retorno')" style="flex:1;padding:4px 8px;background:${btnRtBg};color:${btnRtFg};border:1px solid #DDD6FE;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer">Com Retorno</button>
          ${H.raw(intervaloHtml)}
        </div>
      </div>`
    }).join('')

    _updateApptTotalWithDiscount()
    // Recorrencia visivel so se houver procedimentos
    if (typeof _apptUpdateRecurrenceVisibility === 'function') _apptUpdateRecurrenceVisibility()
  }

  // ── Desconto ───────────────────────────────────────────────
  function apptToggleDesconto(cb) {
    var row = document.getElementById('apptDescontoRow')
    if (row) row.style.display = cb.checked ? '' : 'none'
    if (!cb.checked) {
      var inp = document.getElementById('appt_desconto_valor')
      if (inp) inp.value = ''
    }
    _updateApptTotalWithDiscount()
  }

  function apptCalcDesconto() {
    _updateApptTotalWithDiscount()
    apptSyncPagamentoTotal()
    apptUpdatePagamentosTotal()
  }

  function _updateApptTotalWithDiscount() {
    var totalEl = document.getElementById('apptProcsTotal')
    // Cortesias não entram no subtotal financeiro
    var subtotal = _apptProcs.reduce(function(s, p) { return s + (p.cortesia ? 0 : (p.valor || 0)) }, 0)
    var descontoVal = parseFloat((document.getElementById('appt_desconto_valor') || {}).value || '0') || 0
    var total = Math.max(0, subtotal - descontoVal)
    var pct = subtotal > 0 ? Math.round((descontoVal / subtotal) * 100) : 0

    var pctEl = document.getElementById('appt_desconto_pct')
    if (pctEl) pctEl.textContent = descontoVal > 0 ? '(' + pct + '% de desconto)' : ''

    if (totalEl) {
      if (subtotal <= 0) { totalEl.textContent = ''; return }
      var html = 'Subtotal: R$ ' + subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      if (descontoVal > 0) {
        html += '  —  Desconto: R$ ' + descontoVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' (' + pct + '%)'
        html += '  —  <strong style="color:#10B981">Total: R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</strong>'
      }
      totalEl.innerHTML = html
    }

    // Atualizar campo valor principal
    var valorPrincipal = document.getElementById('appt_valor')
    if (valorPrincipal) valorPrincipal.value = total || ''
  }

  // ── Auto-preencher sala ao selecionar profissional ─────────
  // ── apptOnProfChange — handler único para troca de profissional ──
  // Cascata: auto-sala + auto-valor (puxa valor_consulta padrão).
  function apptOnProfChange() {
    apptAutoSala()
    apptAutoValorConsulta()
  }

  function apptAutoValorConsulta(opts) {
    var skipIfFilled = !!(opts && opts.skipIfFilled)
    var profSel = document.getElementById('appt_prof')
    if (!profSel) return
    var profIdx = parseInt(profSel.value)
    if (isNaN(profIdx)) return
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var prof = profs[profIdx]
    if (!prof) return
    var v = parseFloat(prof.valor_consulta) || 0
    if (v <= 0) return
    var valEl = document.getElementById('appt_valor')
    if (!valEl) return
    // Na abertura do modal (skipIfFilled), preserva valor existente —
    // agendamentos antigos podem ter valor cobrado diferente do default atual.
    // Na troca manual do select (sem flag), sobrescreve com valor do novo prof.
    if (skipIfFilled && valEl.value && parseFloat(valEl.value) > 0) return
    valEl.value = v.toFixed(2)
    // Só mexe nos pagamentos se o tipo for consulta (ou indefinido).
    // Em procedimento, o total vem da soma dos procs, não da consulta.
    var tipoEl = document.getElementById('appt_tipo')
    var tipo = tipoEl && tipoEl.value
    if (tipo === 'procedimento') return
    if (_apptPagamentos.length === 1 && (!_apptPagamentos[0].valor || _apptPagamentos[0].valor === 0)) {
      _apptPagamentos[0].valor = v
      apptRenderPagamentos()
    }
    apptUpdatePagamentosTotal()
  }

  // ── Pagamentos múltiplos (Consulta Paga ou Procedimento) ────
  // Estrutura: _apptPagamentos = [{
  //   forma, valor, status: 'aberto'|'pago',
  //   parcelas, valorParcela, comentario
  // }]
  // Ref alias do _apptState.pagamentos (mesma identidade — reset
  // coordenado em _apptStateReset)
  var _apptPagamentos = _apptState.pagamentos

  var FORMAS_PAGAMENTO = [
    { value: 'pix',           label: 'PIX' },
    { value: 'dinheiro',      label: 'Dinheiro' },
    { value: 'debito',        label: 'Débito' },
    { value: 'credito',       label: 'Crédito' },
    { value: 'parcelado',     label: 'Parcelado' },
    { value: 'entrada_saldo', label: 'Entrada + Saldo' },
    { value: 'boleto',        label: 'Boleto' },
    { value: 'link',          label: 'Link Pagamento' },
    { value: 'convenio',      label: 'Convênio' },
  ]

  function _apptFormaTemParcelas(forma) {
    return forma === 'credito' || forma === 'parcelado'
  }

  function _formaOptions(selected) {
    return '<option value="">Forma...</option>' +
      FORMAS_PAGAMENTO.map(function(f) {
        var sel = f.value === selected ? ' selected' : ''
        return '<option value="' + f.value + '"' + sel + '>' + f.label + '</option>'
      }).join('')
  }

  // Total a pagar = consulta (appt_valor) ou soma dos procedimentos
  // (excluindo cortesias) com desconto
  function _apptValorTotalPagar() {
    var tipoEl = document.getElementById('appt_tipo')
    var tipo = tipoEl && tipoEl.value
    if (tipo === 'procedimento') {
      var subtotal = _apptProcs.reduce(function(s, p) {
        return s + (p.cortesia ? 0 : (parseFloat(p.valor) || 0))
      }, 0)
      var desc = parseFloat((document.getElementById('appt_desconto_valor') || {}).value || '0') || 0
      return Math.max(0, subtotal - desc)
    }
    var valEl = document.getElementById('appt_valor')
    return parseFloat((valEl && valEl.value) || '0') || 0
  }

  function apptResetPagamentos() {
    _apptPagamentos.length = 0
    _apptPagamentos.push({ forma: '', valor: 0, status: 'aberto', parcelas: 1, valorParcela: 0, comentario: '' })
    apptRenderPagamentos()
  }

  function apptLoadPagamentos(arr, fallbackForma, fallbackValor) {
    _apptPagamentos.length = 0
    if (Array.isArray(arr) && arr.length > 0) {
      arr.forEach(function(p) {
        _apptPagamentos.push({
          forma:        p.forma || '',
          valor:        parseFloat(p.valor) || 0,
          status:       p.status === 'pago' ? 'pago' : 'aberto',
          parcelas:     parseInt(p.parcelas) || 1,
          valorParcela: parseFloat(p.valorParcela) || 0,
          comentario:   p.comentario || '',
        })
      })
    } else {
      _apptPagamentos.push({
        forma: fallbackForma || '',
        valor: parseFloat(fallbackValor) || 0,
        status: 'aberto',
        parcelas: 1,
        valorParcela: parseFloat(fallbackValor) || 0,
        comentario: '',
      })
    }
    apptRenderPagamentos()
  }

  function apptAddPagamento() {
    _apptPagamentos.push({ forma: '', valor: 0, status: 'aberto', parcelas: 1, valorParcela: 0, comentario: '' })
    apptRenderPagamentos()
  }

  function apptRemovePagamento(idx) {
    if (_apptPagamentos.length <= 1) return
    _apptPagamentos.splice(idx, 1)
    apptRenderPagamentos()
  }

  function apptUpdatePagamento(idx, field, value) {
    var p = _apptPagamentos[idx]
    if (!p) return
    if (field === 'valor')          p.valor = parseFloat(value) || 0
    else if (field === 'parcelas') {
      var n = parseInt(value) || 1
      if (n < 1) n = 1
      if (n > 24) n = 24
      p.parcelas = n
    }
    else if (field === 'valorParcela') p.valorParcela = parseFloat(value) || 0
    else                            p[field] = value
    // Recalcula valorParcela quando valor ou parcelas mudam
    if (field === 'valor' || field === 'parcelas' || field === 'forma') {
      if (_apptFormaTemParcelas(p.forma) && p.parcelas > 0) {
        p.valorParcela = window.Money ? window.Money.div(p.valor, p.parcelas) : +(p.valor / p.parcelas).toFixed(2)
      } else {
        p.valorParcela = p.valor
      }
    }
    if (field === 'forma') apptRerenderPagamentoRow(idx)
    else apptUpdatePagamentosTotal()
  }

  // Re-renderiza UMA linha de pagamento in-place — preserva foco
  // dos outros inputs (comentário, valor) enquanto o usuário edita.
  function apptRerenderPagamentoRow(idx) {
    var row = document.querySelector('[data-pagamento-row="' + idx + '"]')
    if (!row) { apptRenderPagamentos(); return }
    var H = window.html
    var canRemove = _apptPagamentos.length > 1
    var p = _apptPagamentos[idx]
    if (!p) return
    var pago = p.status === 'pago'
    var bg   = pago ? '#F0FDF4' : '#fff'
    var bd   = pago ? '#86EFAC' : '#E5E7EB'
    var btnTxt = pago ? '✓ Pago'  : '○ Aberto'
    var btnBg  = pago ? '#16A34A' : '#F3F4F6'
    var btnFg  = pago ? '#fff'    : '#6B7280'
    var temParcelas = _apptFormaTemParcelas(p.forma)
    var valorStr = p.valor ? p.valor.toFixed(2) : ''
    var valorParcelaStr = p.valorParcela ? p.valorParcela.toFixed(2) : ''

    var parcelasHtml = temParcelas
      ? H`<div style="display:flex;gap:5px;align-items:center;margin-top:5px">
          <label style="font-size:10px;font-weight:700;color:#6B7280">Parcelas</label>
          <input type="number" min="1" max="24" value="${p.parcelas || 1}" oninput="apptUpdatePagamento(${idx}, 'parcelas', this.value)" style="width:50px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;outline:none"/>
          <span style="font-size:10px;color:#6B7280">x R$</span>
          <input type="number" step="0.01" value="${valorParcelaStr}" oninput="apptUpdatePagamento(${idx}, 'valorParcela', this.value)" style="width:80px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;outline:none"/>
        </div>`
      : ''
    var removeBtn = canRemove
      ? H`<button type="button" onclick="apptRemovePagamento(${idx})" style="padding:5px 7px;background:#FEE2E2;color:#DC2626;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;line-height:1">×</button>`
      : ''

    row.style.background = bg
    row.style.borderColor = bd
    row.innerHTML = H`<div style="display:flex;gap:5px;align-items:center">
        <select onchange="apptUpdatePagamento(${idx}, 'forma', this.value)" style="flex:1;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;background:#fff;outline:none">${H.raw(_formaOptions(p.forma))}</select>
        <input type="number" step="0.01" placeholder="0,00" value="${valorStr}" oninput="apptUpdatePagamento(${idx}, 'valor', this.value)" style="width:75px;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none"/>
        <button type="button" onclick="apptTogglePago(${idx})" style="padding:5px 8px;background:${btnBg};color:${btnFg};border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">${btnTxt}</button>
        ${H.raw(removeBtn)}
      </div>
      ${H.raw(parcelasHtml)}
      <input type="text" placeholder="Comentário (opcional)" value="${p.comentario || ''}" oninput="apptUpdatePagamento(${idx}, 'comentario', this.value)" style="width:100%;margin-top:5px;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none;box-sizing:border-box"/>`
    apptUpdatePagamentosTotal()
  }

  function apptTogglePago(idx) {
    if (!_apptPagamentos[idx]) return
    _apptPagamentos[idx].status = _apptPagamentos[idx].status === 'pago' ? 'aberto' : 'pago'
    apptRenderPagamentos()
  }

  function apptShowPagamentosBlock() {
    var block = document.getElementById('apptPagamentosBlock')
    if (!block) return
    var tipoEl = document.getElementById('appt_tipo')
    var tipo = tipoEl && tipoEl.value
    var avalEl = document.getElementById('appt_taval_hidden')
    var aval = avalEl && avalEl.value
    var consultaPaga = tipo === 'avaliacao' && aval === 'paga'
    // Procedimento: só mostra pagamento se houver ao menos 1 NÃO cortesia
    var procWithPaid = tipo === 'procedimento' && _apptProcs.some(function(p) { return !p.cortesia })
    block.style.display = (consultaPaga || procWithPaid) ? '' : 'none'
    if (consultaPaga || procWithPaid) {
      if (_apptPagamentos.length === 0) apptResetPagamentos()
      else apptRenderPagamentos()
    }
  }

  function apptRenderPagamentos() {
    var list = document.getElementById('apptPagamentosList')
    if (!list) return
    var H = window.html
    var canRemove = _apptPagamentos.length > 1
    list.innerHTML = _apptPagamentos.map(function(p, i) {
      var pago = p.status === 'pago'
      var bg   = pago ? '#F0FDF4' : '#fff'
      var bd   = pago ? '#86EFAC' : '#E5E7EB'
      var btnTxt = pago ? '✓ Pago'  : '○ Aberto'
      var btnBg  = pago ? '#16A34A' : '#F3F4F6'
      var btnFg  = pago ? '#fff'    : '#6B7280'
      var temParcelas = _apptFormaTemParcelas(p.forma)
      var valorStr = p.valor ? p.valor.toFixed(2) : ''
      var valorParcelaStr = p.valorParcela ? p.valorParcela.toFixed(2) : ''

      var parcelasHtml = temParcelas
        ? H`<div style="display:flex;gap:5px;align-items:center;margin-top:5px">
            <label style="font-size:10px;font-weight:700;color:#6B7280">Parcelas</label>
            <input type="number" min="1" max="24" value="${p.parcelas || 1}" oninput="apptUpdatePagamento(${i}, 'parcelas', this.value)" style="width:50px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;outline:none"/>
            <span style="font-size:10px;color:#6B7280">x R$</span>
            <input type="number" step="0.01" value="${valorParcelaStr}" oninput="apptUpdatePagamento(${i}, 'valorParcela', this.value)" style="width:80px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;outline:none"/>
          </div>`
        : ''

      var removeBtn = canRemove
        ? H`<button type="button" onclick="apptRemovePagamento(${i})" style="padding:5px 7px;background:#FEE2E2;color:#DC2626;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;line-height:1">×</button>`
        : ''

      return H`<div data-pagamento-row="${i}" style="background:${bg};border:1px solid ${bd};border-radius:8px;padding:7px">
        <div style="display:flex;gap:5px;align-items:center">
          <select onchange="apptUpdatePagamento(${i}, 'forma', this.value)" style="flex:1;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;background:#fff;outline:none">${H.raw(_formaOptions(p.forma))}</select>
          <input type="number" step="0.01" placeholder="0,00" value="${valorStr}" oninput="apptUpdatePagamento(${i}, 'valor', this.value)" style="width:75px;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none"/>
          <button type="button" onclick="apptTogglePago(${i})" style="padding:5px 8px;background:${btnBg};color:${btnFg};border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">${btnTxt}</button>
          ${H.raw(removeBtn)}
        </div>
        ${H.raw(parcelasHtml)}
        <input type="text" placeholder="Comentário (opcional)" value="${p.comentario || ''}" oninput="apptUpdatePagamento(${i}, 'comentario', this.value)" style="width:100%;margin-top:5px;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none;box-sizing:border-box"/>
      </div>`
    }).join('')
    apptUpdatePagamentosTotal()
  }

  function apptUpdatePagamentosTotal() {
    var totalEl = document.getElementById('apptPagamentosTotal')
    if (!totalEl) return
    var M = window.Money
    var total = M ? M.sum(_apptPagamentos.map(function(p) { return p.valor })) : _apptPagamentos.reduce(function(s, p) { return s + (parseFloat(p.valor) || 0) }, 0)
    var valor = _apptValorTotalPagar()
    var diff = M ? M.sub(valor, total) : +(valor - total).toFixed(2)
    var fmt = M ? M.format : function(v) { return 'R$ ' + (parseFloat(v)||0).toFixed(2) }
    if (M ? M.isZero(diff) : Math.abs(diff) < 0.01) {
      totalEl.style.color = '#16A34A'
      totalEl.textContent = 'Alocado: ' + fmt(total) + ' / ' + fmt(valor)
    } else if (diff > 0) {
      totalEl.style.color = '#DC2626'
      totalEl.textContent = 'Falta alocar ' + fmt(diff) + ' (alocado: ' + fmt(total) + ' / ' + fmt(valor) + ')'
    } else {
      totalEl.style.color = '#DC2626'
      totalEl.textContent = 'Excesso de ' + fmt(Math.abs(diff)) + ' (alocado: ' + fmt(total) + ' / ' + fmt(valor) + ')'
    }
  }

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

  // ── Fuzzy search helpers ────────────────────────────────────
  function _normalize(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }
  function _fuzzyMatch(query, target) {
    var qi = 0
    for (var ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) qi++
    }
    return qi === query.length
  }

  // ── apptSearchPatient (debounced 300ms) ──────────────────────
  var _searchTimer = null
  var _leadsCache = null

  function apptSearchPatient(q) {
    if (_searchTimer) clearTimeout(_searchTimer)
    _searchTimer = setTimeout(function() { _doPatientSearch(q) }, 300)
  }

  function _doPatientSearch(q) {
    const drop = document.getElementById('apptPatientDrop')
    const warn = document.getElementById('appt_paciente_warn')
    if (!q.trim()) { drop.style.display = 'none'; warn.style.display = 'none'; return }
    // Cache leads to avoid reloading on every keystroke
    if (!_leadsCache) {
      _leadsCache = window.LeadsService
        ? LeadsService.getLocal()
        : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
      // Invalidate cache after 30s
      setTimeout(function() { _leadsCache = null }, 30000)
    }
    const leads = _leadsCache
    const ql = _normalize(q)
    const matches = leads
      .map(function (l) {
        var nome = _normalize(l.nome || l.name || '')
        var phone = l.phone || l.whatsapp || ''
        if (nome.includes(ql)) return { l: l, score: 0 }
        if (phone.includes(q)) return { l: l, score: 1 }
        if (_fuzzyMatch(ql, nome)) return { l: l, score: 2 }
        return null
      })
      .filter(Boolean)
      .sort(function (a, b) { return a.score - b.score })
      .map(function (m) { return m.l })
      .slice(0, 8)

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
    // Use event delegation with single handler (prevents listener accumulation)
    drop.onclick = function(e) {
      var el = e.target.closest('[data-lead-id]')
      if (el) selectApptPatient(el.dataset.leadId, el.dataset.leadName, el.dataset.leadPhone)
    }
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
    apptDetectTipoPaciente(id)
  }

  // ── apptIndicadoSearch / apptIndicadoSelect ──────────────────
  // Dropdown de busca para "Indicado por". Forca selecao da lista —
  // o usuario nao pode digitar nome livre. Reusa _leadsCache.
  var _indicadoTimer = null

  function apptIndicadoSearch(q) {
    var idEl = document.getElementById('appt_indicado_por_id')
    if (idEl) idEl.value = ''
    if (_indicadoTimer) clearTimeout(_indicadoTimer)
    _indicadoTimer = setTimeout(function() { _doIndicadoSearch(q) }, 200)
  }

  function _doIndicadoSearch(q) {
    var drop = document.getElementById('apptIndicadoDrop')
    if (!drop) return
    if (!_leadsCache) {
      _leadsCache = window.LeadsService
        ? LeadsService.getLocal()
        : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
      setTimeout(function() { _leadsCache = null }, 30000)
    }
    var pacienteAtualId = (document.getElementById('appt_paciente_id') && document.getElementById('appt_paciente_id').value) || ''
    var query = (q || '').trim().toLowerCase()
    var matches = _leadsCache
      .filter(function(l) { return (l.id || '') !== pacienteAtualId })
      .filter(function(l) {
        if (!query) return true
        var nome = (l.nome || l.name || '').toLowerCase()
        return nome.includes(query)
      })
      .slice(0, 8)

    if (!matches.length) { drop.style.display = 'none'; return }

    drop.innerHTML = matches.map(function(l) {
      var nome = l.nome || l.name || 'Paciente'
      var phone = l.phone || l.whatsapp || ''
      return '<div data-ind-id="' + (l.id || '') + '" data-ind-name="' + nome.replace(/"/g, '&quot;') + '"' +
        ' style="padding:8px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid #F3F4F6"' +
        ' onmouseover="this.style.background=\'#F9FAFB\'" onmouseout="this.style.background=\'\'">' +
        '<div style="font-weight:600;color:#111">' + nome.replace(/</g, '&lt;') + '</div>' +
        (phone ? '<div style="font-size:10px;color:#9CA3AF">' + phone.replace(/</g, '&lt;') + '</div>' : '') +
        '</div>'
    }).join('')
    drop.onclick = function(e) {
      var el = e.target.closest('[data-ind-id]')
      if (el) apptIndicadoSelect(el.dataset.indId, el.dataset.indName)
    }
    drop.style.display = 'block'
  }

  function apptIndicadoSelect(id, nome) {
    var inp = document.getElementById('appt_indicado_por')
    var idEl = document.getElementById('appt_indicado_por_id')
    if (inp) inp.value = nome
    if (idEl) idEl.value = id
    var drop = document.getElementById('apptIndicadoDrop')
    if (drop) drop.style.display = 'none'
  }

  // Fecha dropdown ao clicar fora
  document.addEventListener('click', function(e) {
    var drop = document.getElementById('apptIndicadoDrop')
    var inp = document.getElementById('appt_indicado_por')
    if (!drop || drop.style.display === 'none') return
    if (e.target === inp || drop.contains(e.target)) return
    drop.style.display = 'none'
    // Se digitou algo mas nao selecionou, limpa
    if (inp && !document.getElementById('appt_indicado_por_id').value) inp.value = ''
  })

  // ── apptDetectTipoPaciente ───────────────────────────────────
  // Regra: se o paciente ja tem >=1 atendimento finalizado, é "retorno".
  // Caso contrario, "novo". Ignora o appointment em edição.
  function apptDetectTipoPaciente(pacienteId) {
    var tipoEl = document.getElementById('appt_tipo_paciente')
    if (!tipoEl || !pacienteId) return
    var editId = (document.getElementById('appt_id') && document.getElementById('appt_id').value) || ''
    var all = _getAppts()
    var jaAtendido = all.some(function(a) {
      return a.id !== editId && a.pacienteId === pacienteId && a.status === 'finalizado'
    })
    tipoEl.value = jaAtendido ? 'retorno' : 'novo'
  }

  // ── saveAppt ──────────────────────────────────────────────────
  // Fluxo: validar → salvar localStorage otimistico → syncOneAwait →
  //        toast+close+refresh (sucesso) OU reverter localStorage (falha).
  // Botao disable impede duplo submit. Se houver erros inline, aborta
  // imediatamente sem submit.
  async function saveAppt() {
    // Guard de duplo submit: se ja esta rodando, ignora.
    var _saveBtn = _apptSaveBtn()
    if (_saveBtn && _saveBtn.disabled) return
    // Guard de erros inline: nao submete se houver campos com borda danger.
    if (_apptHasInlineErrors()) {
      _warn('Corrija os campos destacados em vermelho antes de salvar.')
      return
    }
    const nome = document.getElementById('appt_paciente_q') && document.getElementById('appt_paciente_q').value.trim()
    if (!nome) { _warn('Selecione o paciente'); return }
    const data   = document.getElementById('appt_data') && document.getElementById('appt_data').value
    const inicio = document.getElementById('appt_inicio') && document.getElementById('appt_inicio').value
    if (!data || !inicio) { _warn('Informe data e horario'); return }

    // Validar horario passado (camada obrigatoria — independe do AgendaValidator)
    var todayIso = new Date().toISOString().slice(0, 10)
    var editId0 = document.getElementById('appt_id') && document.getElementById('appt_id').value
    if (!editId0) {
      if (data < todayIso) { _warn('Nao e possivel agendar em data passada.'); return }
      if (data === todayIso && new Date(data + 'T' + inicio + ':00') < new Date()) {
        _warn('Nao e possivel agendar em horario que ja passou.'); return
      }
    }

    const duracao = parseInt((document.getElementById('appt_duracao') && document.getElementById('appt_duracao').value) || '60')
    const fim     = _addMins(inicio, duracao)
    const profIdx = parseInt(((document.getElementById('appt_prof') && document.getElementById('appt_prof').value) || '0')) || 0
    const salaIdx = parseInt((document.getElementById('appt_sala') && document.getElementById('appt_sala').value) || '')
    const profs   = typeof getProfessionals === 'function' ? getProfessionals() : []

    // Validação tipo de atendimento (Consulta vs Procedimento — exclusivos)
    const tipoAtend = (document.getElementById('appt_tipo') && document.getElementById('appt_tipo').value) || ''
    if (!tipoAtend) { _warn('Selecione o tipo de atendimento (Consulta ou Procedimento).'); return }

    const tipoAvalEl = document.querySelector('input[name="appt_tipo_aval"]:checked')
    const tipoAvalVal = tipoAvalEl && tipoAvalEl.value || ''
    const cortesiaMotivo = (document.getElementById('appt_cortesia_motivo') && document.getElementById('appt_cortesia_motivo').value.trim()) || ''

    if (tipoAtend === 'avaliacao') {
      if (!tipoAvalVal) { _warn('Indique se a consulta e Cortesia ou Paga.'); return }
      if (tipoAvalVal === 'cortesia' && !cortesiaMotivo) {
        _warn('Informe o motivo da cortesia.'); return
      }
    }
    if (tipoAtend === 'procedimento' && (!_apptProcs || _apptProcs.length === 0)) {
      _warn('Adicione ao menos um procedimento.'); return
    }
    if (tipoAtend === 'procedimento') {
      var procSemMotivo = _apptProcs.find(function(p) { return p.cortesia && !(p.cortesiaMotivo && p.cortesiaMotivo.trim()) })
      if (procSemMotivo) { _warn('Informe o motivo da cortesia em "' + procSemMotivo.nome + '".'); return }
      var procSemIntervalo = _apptProcs.find(function(p) { return p.retornoTipo === 'retorno' && (!p.retornoIntervalo || p.retornoIntervalo <= 0) })
      if (procSemIntervalo) { _warn('Selecione o intervalo de retorno em "' + procSemIntervalo.nome + '".'); return }
    }

    // Validação pagamentos (Consulta Paga OU Procedimento)
    const valorTotal = parseFloat((document.getElementById('appt_valor') && document.getElementById('appt_valor').value) || '0') || 0
    const consultaPaga = tipoAtend === 'avaliacao' && tipoAvalVal === 'paga'
    const procWithItems = tipoAtend === 'procedimento' && _apptProcs.length > 0
    if (consultaPaga && valorTotal <= 0) { _warn('Informe o valor da consulta.'); return }
    if (consultaPaga || procWithItems) {
      if (!_apptPagamentos.length) { _warn('Adicione ao menos uma forma de pagamento.'); return }
      var faltaForma = _apptPagamentos.find(function(p) { return !p.forma })
      if (faltaForma) { _warn('Selecione a forma de cada pagamento.'); return }
      var faltaParcelas = _apptPagamentos.find(function(p) {
        return _apptFormaTemParcelas(p.forma) && (!p.parcelas || p.parcelas < 1)
      })
      if (faltaParcelas) { _warn('Informe o numero de parcelas para pagamento parcelado/credito.'); return }
      var parcelasExcede = _apptPagamentos.find(function(p) {
        return _apptFormaTemParcelas(p.forma) && p.parcelas > 24
      })
      if (parcelasExcede) { _warn('Numero maximo de parcelas: 24.'); return }
      var M = window.Money
      var somaPag = M ? M.sum(_apptPagamentos.map(function(p) { return p.valor })) : _apptPagamentos.reduce(function(s, p) { return s + (parseFloat(p.valor) || 0) }, 0)
      var totalEsperado = _apptValorTotalPagar()
      var matches = M ? M.eq(somaPag, totalEsperado) : Math.abs(somaPag - totalEsperado) < 0.01
      if (!matches) {
        _warn('A soma dos pagamentos (' + (M ? M.format(somaPag) : 'R$ ' + somaPag.toFixed(2)) + ') deve ser igual ao total (' + (M ? M.format(totalEsperado) : 'R$ ' + totalEsperado.toFixed(2)) + ').'); return
      }
    }

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
      tipoConsulta:        tipoAtend,
      tipoAvaliacao:       tipoAtend === 'avaliacao' ? tipoAvalVal : '',
      cortesiaMotivo:      (tipoAtend === 'avaliacao' && tipoAvalVal === 'cortesia') ? cortesiaMotivo : '',
      origem:              (document.getElementById('appt_origem') && document.getElementById('appt_origem').value) || '',
      valor:               (consultaPaga || procWithItems) ? _apptValorTotalPagar() : 0,
      pagamentos:          (consultaPaga || procWithItems)
        ? _apptPagamentos.map(function(p) {
            return {
              forma:        p.forma,
              valor:        parseFloat(p.valor) || 0,
              status:       p.status === 'pago' ? 'pago' : 'aberto',
              parcelas:     _apptFormaTemParcelas(p.forma) ? (parseInt(p.parcelas) || 1) : 1,
              valorParcela: _apptFormaTemParcelas(p.forma) ? (parseFloat(p.valorParcela) || 0) : (parseFloat(p.valor) || 0),
              comentario:   p.comentario || '',
            }
          })
        : [],
      formaPagamento:      (function() {
        if (!consultaPaga && !procWithItems) return ''
        if (_apptPagamentos.length === 1) return _apptPagamentos[0].forma || ''
        return 'misto'
      })(),
      statusPagamento:     (function() {
        if (!consultaPaga && !procWithItems) return 'pendente'
        var pagos = _apptPagamentos.filter(function(p) { return p.status === 'pago' }).length
        if (pagos === 0) return 'aberto'
        if (pagos === _apptPagamentos.length) return 'pago'
        return 'parcial'
      })(),
      confirmacaoEnviada:  (document.getElementById('appt_confirmacao') && document.getElementById('appt_confirmacao').checked) || false,
      consentimentoImagem: (document.getElementById('appt_consentimento') && document.getElementById('appt_consentimento').checked) ? 'assinado' : 'pendente',
      obs:                 (document.getElementById('appt_obs') && document.getElementById('appt_obs').value.trim()) || '',
      tipoPaciente:        (document.getElementById('appt_tipo_paciente') && document.getElementById('appt_tipo_paciente').value) || 'novo',
      indicadoPor:         (document.getElementById('appt_indicado_por') && document.getElementById('appt_indicado_por').value.trim()) || '',
      indicadoPorId:       (document.getElementById('appt_indicado_por_id') && document.getElementById('appt_indicado_por_id').value) || '',
      procedimentos:       tipoAtend === 'procedimento' && _apptProcs.length
        ? _apptProcs.map(function(p) {
            return {
              nome:             p.nome,
              valor:            parseFloat(p.valor) || 0,
              cortesia:         !!p.cortesia,
              cortesiaMotivo:   p.cortesia ? (p.cortesiaMotivo || '') : '',
              retornoTipo:      p.retornoTipo === 'retorno' ? 'retorno' : 'avulso',
              retornoIntervalo: p.retornoTipo === 'retorno' ? (parseInt(p.retornoIntervalo) || 0) : 0,
            }
          })
        : [],
      // Agregados de cortesia (alimentam relatórios financeiros)
      valorCortesia: (function() {
        if (tipoAtend !== 'procedimento') return 0
        var M = window.Money
        var cortValores = _apptProcs.filter(function(p) { return p.cortesia }).map(function(p) { return p.valor })
        return M ? M.sum(cortValores) : cortValores.reduce(function(s, v) { return s + (parseFloat(v) || 0) }, 0)
      })(),
      qtdProcsCortesia: tipoAtend === 'procedimento'
        ? _apptProcs.filter(function(p) { return p.cortesia }).length
        : 0,
      motivoCortesia: (function() {
        if (tipoAtend !== 'procedimento') return ''
        var motivos = _apptProcs.filter(function(p) { return p.cortesia && p.cortesiaMotivo }).map(function(p) { return p.nome + ': ' + p.cortesiaMotivo })
        return motivos.join(' | ')
      })(),
      // Recurrence: injetado por _apptPersistSeries / apptCreateNextSessionOnly
      // via window.__apptPendingRecurrence — nao afeta saves normais.
      recurrenceGroupId:     (window.__apptPendingRecurrence && window.__apptPendingRecurrence.groupId) || null,
      recurrenceIndex:       (window.__apptPendingRecurrence && window.__apptPendingRecurrence.index) || null,
      recurrenceTotal:       (window.__apptPendingRecurrence && window.__apptPendingRecurrence.total) || null,
      recurrenceProcedure:   (window.__apptPendingRecurrence && window.__apptPendingRecurrence.procName) || null,
      recurrenceIntervalDays:(window.__apptPendingRecurrence && window.__apptPendingRecurrence.interval) || null,
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
      if (conflict) { _warn('Conflito de horario: ' + confReason); return }
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
        var _auditFields = ['data','horaInicio','horaFim','profissionalIdx','profissionalNome','salaIdx','procedimento','tipoConsulta','tipoAvaliacao','origem','valor','formaPagamento','statusPagamento','status','confirmacaoEnviada','consentimentoImagem','obs','pacienteId','indicadoPor','tipoPaciente','cortesiaMotivo','valorCortesia','qtdProcsCortesia']
        var _oldVals = {}, _newVals = {}, _hasChanges = false
        _auditFields.forEach(function(f) {
          if (String(old[f] || '') !== String(apptData[f] || '')) {
            _oldVals[f] = old[f]; _newVals[f] = apptData[f]; _hasChanges = true
          }
        })
        var _oldProcsJson = JSON.stringify(old.procedimentos || [])
        var _newProcsJson = JSON.stringify(apptData.procedimentos || [])
        if (_oldProcsJson !== _newProcsJson) { _oldVals.procedimentos = old.procedimentos; _newVals.procedimentos = apptData.procedimentos; _hasChanges = true }
        var _oldPagsJson = JSON.stringify(old.pagamentos || [])
        var _newPagsJson = JSON.stringify(apptData.pagamentos || [])
        if (_oldPagsJson !== _newPagsJson) { _oldVals.pagamentos = old.pagamentos; _newVals.pagamentos = apptData.pagamentos; _hasChanges = true }
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

    // Snapshot pra rollback em caso de falha de sync.
    // prevAppts restaura localStorage; prevState restaura procs+pagamentos
    // do modal (importante quando usuario tenta novamente).
    const prevAppts = JSON.parse(JSON.stringify(_getAppts()))
    const prevState = {
      procs:      JSON.parse(JSON.stringify(_apptState.procs)),
      pagamentos: JSON.parse(JSON.stringify(_apptState.pagamentos)),
    }

    // 1) Grava otimisticamente no localStorage (UX rapida)
    _saveAppts(appts)
    _apptDisableSave('syncing')

    // 2) Sincroniza com Supabase ANTES de fechar/toast/refresh.
    // Se falhar, reverte localStorage e state do modal; nao fecha.
    const savedId = editId || novoId
    const saved = appts.find(a => a.id === savedId)
    try {
      if (window.AppointmentsService && saved) {
        const result = await AppointmentsService.syncOneAwait(saved)
        if (!result.ok && !result.queued) {
          // Rollback duro: sem conexao mas servidor rejeitou (ex: validacao, RLS)
          _saveAppts(prevAppts)
          _apptState.procs.splice(0); prevState.procs.forEach(function(p) { _apptState.procs.push(p) })
          _apptState.pagamentos.splice(0); prevState.pagamentos.forEach(function(p) { _apptState.pagamentos.push(p) })
          _refresh()
          if (window._showToast) _showToast('Falha ao sincronizar com servidor', (result.error || 'Tente novamente.'), 'error')
          _apptEnableSave()
          return
        }
        // Se result.queued (offline), avisa mas segue o fluxo — fica no offline queue
        if (result.queued) {
          if (window._showToast) _showToast('Salvo offline', 'Sera sincronizado quando voltar a conexao.', 'info')
        }
      }
    } catch (err) {
      // Defesa extra: excecao inesperada
      _saveAppts(prevAppts)
      _apptState.procs.splice(0); prevState.procs.forEach(function(p) { _apptState.procs.push(p) })
      _apptState.pagamentos.splice(0); prevState.pagamentos.forEach(function(p) { _apptState.pagamentos.push(p) })
      _refresh()
      if (window._showToast) _showToast('Falha ao sincronizar com servidor', (err && err.message) || 'Tente novamente.', 'error')
      _apptEnableSave()
      return
    }

    // 3) Sucesso: fecha modal, limpa draft, toast e refresca
    closeApptModal()
    _refresh()
    _clearDraft()
    if (window._showToast) _showToast(isNew ? 'Agendamento criado' : 'Agendamento atualizado', nome, 'success')

    // 4) Automacoes e hooks pos-save (best-effort; nao quebra fluxo)
    if (isNew) {
      const apptCompleto = Object.assign({}, apptData, { id: novoId, profissionalNome: profs[profIdx] && profs[profIdx].nome || '' })
      const isNovo = (apptCompleto.tipoPaciente || 'novo') !== 'retorno'
      const linkPromise = (isNovo && typeof _gerarLinkAnamnese === 'function')
        ? _gerarLinkAnamnese(apptCompleto.id, apptCompleto.pacienteId).catch(function(e) { console.warn('[Agenda-modal] falha link:', e); return null })
        : Promise.resolve(null)
      // Exporta a promise das automacoes pra que series de recorrencia possam
      // aguardar a msg universal de Agendamento ser enfileirada antes de disparar
      // a msg consolidada da serie (senao ha race e a consolidada pode ir primeiro).
      var autoPromise = linkPromise.then(function(link) {
        if (link) apptCompleto.link_anamnese = link
        if (typeof scheduleAutomations === 'function') scheduleAutomations(apptCompleto)
        if (window.AutomationsEngine && window.AutomationsEngine.processStatusChange) {
          return AutomationsEngine.processStatusChange(apptCompleto, apptCompleto.status || 'agendado')
            .catch(function(e) { console.error('[Agenda-modal] processStatusChange inicial falhou:', e) })
        }
      })
      window.__apptLastAutomationsPromise = autoPromise
      if (typeof _applyStatusTag === 'function' && apptCompleto.pacienteId) {
        _applyStatusTag(apptCompleto, 'agendado', 'criacao')
      }
      if (apptCompleto.pacienteId) {
        _setLeadStatus(apptCompleto.pacienteId, 'scheduled', ['patient', 'attending'])
      }
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
  // ── apptReagendar — dialog dedicado de reagendamento ─────────
  // Abre um mini-dialog com nova data/hora/motivo, valida via
  // AgendaValidator, grava histórico, aplica nova data, dispara
  // scheduleAutomations (WhatsApp) e refresca a agenda.
  function apptReagendar(id) {
    var a = _getAppts().find(function(x) { return x.id === id })
    if (!a) return
    // Guarda: status que bloqueiam reagendamento
    var blocked = ['finalizado', 'cancelado', 'no_show']
    if (blocked.indexOf(a.status) !== -1) {
      _warn('Atendimentos com status "' + a.status + '" nao podem ser reagendados.')
      return
    }

    var existing = document.getElementById('apptReagendarDlg')
    if (existing) existing.remove()

    var H = window.html
    var fmtD = _fmtDate(a.data)

    var dlg = document.createElement('div')
    dlg.id = 'apptReagendarDlg'
    dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10015;display:flex;align-items:center;justify-content:center;padding:16px'
    dlg.innerHTML = H`<div id="apptReagendarInner" role="dialog" aria-modal="true" aria-labelledby="apptReagendarTitle" style="background:#fff;border-radius:14px;width:100%;max-width:440px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="background:#3B82F6;padding:14px 18px;color:#fff;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div id="apptReagendarTitle" style="font-size:14px;font-weight:800">Reagendar consulta</div>
          <div style="font-size:11px;color:rgba(255,255,255,.85);margin-top:2px">${a.pacienteNome || 'Paciente'}</div>
        </div>
        <button type="button" onclick="document.getElementById('apptReagendarDlg').remove()" aria-label="Fechar" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:16px;font-weight:700;line-height:1">×</button>
      </div>
      <div style="padding:18px">
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:10px 12px;margin-bottom:14px">
          <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Agendamento atual</div>
          <div style="font-size:13px;font-weight:700;color:#111">${fmtD} &nbsp;${a.horaInicio}–${a.horaFim}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div>
            <label style="font-size:10px;font-weight:700;color:#6B7280;display:block;margin-bottom:4px">NOVA DATA *</label>
            <input id="rg_data" type="date" value="${a.data}" style="width:100%;padding:8px 10px;border:1.5px solid #BFDBFE;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box"/>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:#6B7280;display:block;margin-bottom:4px">NOVO HORÁRIO *</label>
            <input id="rg_hora" type="time" value="${a.horaInicio}" style="width:100%;padding:8px 10px;border:1.5px solid #BFDBFE;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box"/>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label style="font-size:10px;font-weight:700;color:#6B7280;display:block;margin-bottom:4px">MOTIVO <span style="color:#9CA3AF">(opcional, registrado na timeline)</span></label>
          <textarea id="rg_motivo" rows="2" placeholder="Ex: paciente pediu adiar, conflito de agenda..." style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;outline:none;box-sizing:border-box;font-family:inherit;resize:vertical"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" onclick="document.getElementById('apptReagendarDlg').remove()" style="padding:9px 16px;background:#F3F4F6;color:#6B7280;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Cancelar</button>
          <button type="button" onclick="apptReagendarConfirm('${id}')" style="padding:9px 20px;background:#3B82F6;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Confirmar reagendamento</button>
        </div>
      </div>
    </div>`
    dlg.addEventListener('click', function(e) {
      var inner = document.getElementById('apptReagendarInner')
      if (inner && !inner.contains(e.target)) dlg.remove()
    })
    document.body.appendChild(dlg)
    setTimeout(function() {
      var dataEl = document.getElementById('rg_data')
      if (dataEl) dataEl.focus()
    }, 0)
  }

  function apptReagendarConfirm(id) {
    var appts = _getAppts()
    var idx = appts.findIndex(function(x) { return x.id === id })
    if (idx < 0) return
    var a = appts[idx]

    var novaData  = (document.getElementById('rg_data') || {}).value
    var novaHora  = (document.getElementById('rg_hora') || {}).value
    var motivo    = ((document.getElementById('rg_motivo') || {}).value || '').trim()

    if (!novaData || !novaHora) {
      _warn('Informe a nova data e hora.')
      return
    }

    // Validação: data/hora no futuro
    var todayIso = new Date().toISOString().slice(0, 10)
    if (novaData < todayIso) {
      _warn('Nao e possivel reagendar para data passada.')
      return
    }
    if (novaData === todayIso && new Date(novaData + 'T' + novaHora + ':00') < new Date()) {
      _warn('Nao e possivel reagendar para horario que ja passou.')
      return
    }

    // Calcula nova hora fim preservando a duração
    var oldStart = a.horaInicio.split(':').map(Number)
    var oldEnd   = a.horaFim.split(':').map(Number)
    var duration = (oldEnd[0] * 60 + oldEnd[1]) - (oldStart[0] * 60 + oldStart[1])
    var novaHoraFim = _addMins(novaHora, duration)

    // Validação via AgendaValidator (mesmo pipeline do drag & drop)
    if (window.AgendaValidator && AgendaValidator.validateDragDrop) {
      var errs = AgendaValidator.validateDragDrop(a, novaData, novaHora, novaHoraFim)
      if (errs && errs.length) {
        if (window.showValidationErrors) showValidationErrors(errs, 'Reagendamento não permitido')
        else _warn(errs.join('. '))
        return
      }
    } else {
      // Fallback legado: checa conflito
      var provisional = Object.assign({}, a, { data: novaData, horaInicio: novaHora, horaFim: novaHoraFim })
      var conf = _checkConflict(provisional, appts)
      if (conf && conf.conflict) {
        _warn('Conflito de horario: ' + (conf.reason || 'Outro agendamento no mesmo horario.'))
        return
      }
    }

    // Registra histórico completo
    if (!appts[idx].historicoAlteracoes) appts[idx].historicoAlteracoes = []
    appts[idx].historicoAlteracoes.push({
      action_type: 'reagendamento_manual',
      old_value:   { data: a.data, horaInicio: a.horaInicio, horaFim: a.horaFim },
      new_value:   { data: novaData, horaInicio: novaHora, horaFim: novaHoraFim },
      changed_by:  'secretaria',
      changed_at:  new Date().toISOString(),
      reason:      motivo || 'Reagendamento manual via botão',
    })
    if (!appts[idx].historicoStatus) appts[idx].historicoStatus = []
    appts[idx].historicoStatus.push({
      status: appts[idx].status,
      at:     new Date().toISOString(),
      by:     'reagendar_btn',
      motivo: 'Reagendado de ' + a.data + ' ' + a.horaInicio + ' para ' + novaData + ' ' + novaHora + (motivo ? ' — ' + motivo : ''),
    })

    // Aplica nova data/hora preservando duração
    appts[idx].data          = novaData
    appts[idx].horaInicio    = novaHora
    appts[idx].horaFim       = novaHoraFim
    appts[idx].lastRescheduledAt = new Date().toISOString()
    appts[idx].rescheduledCount  = (appts[idx].rescheduledCount || 0) + 1
    if (motivo) appts[idx].reagendamentoMotivo = motivo

    _saveAppts(appts)

    // Sync Supabase
    if (window.AppointmentsService && window.AppointmentsService.syncOne) {
      AppointmentsService.syncOne(appts[idx])
    }
    // Reaplica automações (WhatsApp de confirmação, 24h/30min antes)
    if (window.scheduleAutomations) scheduleAutomations(appts[idx])
    // Tag de reagendado
    if (window._applyStatusTag && appts[idx].pacienteId) {
      _applyStatusTag(appts[idx], 'reagendado', 'reagendar_btn')
    }
    // SDR hook
    if (window.SdrService && appts[idx].pacienteId) {
      SdrService.onLeadScheduled(appts[idx].pacienteId, appts[idx])
    }

    // Fecha dialogs e refresca
    var dlg = document.getElementById('apptReagendarDlg'); if (dlg) dlg.remove()
    var detail = document.getElementById('apptDetailDlg'); if (detail) detail.remove()
    _refresh()

    // Toast de sucesso
    if (window.Modal) {
      Modal.alert({
        title: 'Reagendado com sucesso',
        message: appts[idx].pacienteNome + ' — novo horário: ' + _fmtDate(novaData) + ' ' + novaHora + '. Mensagem de confirmação WhatsApp reagendada automaticamente.',
        tone: 'success'
      })
    }
  }

  // ── Modal de detalhe — estado e renderizacao ─────────────────
  // Estrutura: 4 abas (resumo, detalhes, financeiro, obs). Modo view por
  // padrao, edicao requer dupla confirmacao (checkbox + botao).
  var _apptDetailState = { id: null, mode: 'view', tab: 'resumo' }

  var _APPT_STATUS_OPTS = [
    ['agendado','Agendado'],['aguardando_confirmacao','Aguard. Confirmacao'],
    ['confirmado','Confirmado'],['aguardando','Aguardando'],['na_clinica','Na Clinica'],
    ['em_consulta','Em Consulta'],['em_atendimento','Em Atendimento'],
    ['finalizado','Finalizado'],['remarcado','Remarcado'],
    ['cancelado','Cancelado'],['no_show','No-show']
  ]
  var _APPT_TIPO_PAC_OPTS = [['novo','Novo'],['retorno','Retorno']]
  var _APPT_TIPO_ATEND_OPTS = [['avaliacao','Consulta'],['procedimento','Procedimento']]
  var _APPT_ORIGEM_OPTS = [['','—'],['whatsapp','WhatsApp'],['instagram','Instagram'],['indicacao','Indicacao'],['site','Site'],['direto','Direto']]
  var _APPT_DURACAO_OPTS = [30,45,60,90,120,150,180]
  var _APPT_FORMA_PAG_OPTS = [['','—'],['pix','PIX'],['dinheiro','Dinheiro'],['debito','Debito'],['credito','Credito'],['parcelado','Parcelado'],['boleto','Boleto'],['transferencia','Transferencia'],['misto','Misto']]

  function _selOpts(opts, selected) {
    return opts.map(function(o) {
      var v = Array.isArray(o) ? o[0] : o
      var l = Array.isArray(o) ? o[1] : (v + ' min')
      return '<option value="' + v + '"' + (String(v) === String(selected || '') ? ' selected' : '') + '>' + l + '</option>'
    }).join('')
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function(c) { return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c] }) }

  // openApptDetail agora async: sincroniza com Supabase antes de renderizar
  // para evitar versao stale quando outra aba/dispositivo editou.
  // Fallback: se sync falha, renderiza versao local com warning.
  async function openApptDetail(id) {
    var apptsPre = _getAppts()
    var aPre = apptsPre.find(function(x) { return x.id === id })
    if (!aPre) return

    // Overlay leve de sync (nao bloqueia se renderizacao vier rapido)
    var syncOverlay = null
    try {
      syncOverlay = document.createElement('div')
      syncOverlay.id = 'apptDetailSyncOverlay'
      syncOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;z-index:9997'
      syncOverlay.innerHTML = '<div style="background:#fff;padding:14px 22px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);font-size:13px;color:#374151;display:flex;align-items:center;gap:10px">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2.5" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'
        + '<span>Sincronizando agendamento...</span>'
        + '</div>'
        + '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>'
      document.body.appendChild(syncOverlay)
    } catch (e) { /* noop */ }

    // Tenta sincronizar pelo periodo da data do appt (loadForPeriod mescla
    // local + Supabase e atualiza localStorage). Se falhar, usa versao local.
    try {
      if (window.AppointmentsService && window.AppointmentsService.loadForPeriod && aPre.data) {
        await window.AppointmentsService.loadForPeriod(aPre.data, aPre.data)
      }
    } catch (err) {
      console.warn('[openApptDetail] sync falhou, usando versao local:', err && err.message || err)
      if (window._showToast) _showToast('Aviso', 'Nao foi possivel sincronizar com servidor — exibindo versao local.', 'warn')
    } finally {
      if (syncOverlay && syncOverlay.parentNode) syncOverlay.parentNode.removeChild(syncOverlay)
    }

    // Re-le pos-sync (Supabase pode ter trazido versao mais nova)
    const appts = _getAppts()
    const a = appts.find(x => x.id === id)
    if (!a) return

    // Inicializar campos de documentos se ausentes
    let changed = false
    if (a.anamneseRespondida === undefined) { a.anamneseRespondida = false; changed = true }
    if (!a.consentimentoImagem) { a.consentimentoImagem = 'pendente'; changed = true }
    if (!a.consentimentoProcedimento) { a.consentimentoProcedimento = 'pendente'; changed = true }
    if (changed) _saveAppts(appts)

    _apptDetailState.id = id
    _apptDetailState.mode = 'view'
    _apptDetailState.tab = 'resumo'
    _renderApptDetail()
  }

  function _renderApptDetail() {
    var id = _apptDetailState.id
    var mode = _apptDetailState.mode
    var tab = _apptDetailState.tab
    var a = _getAppts().find(function(x) { return x.id === id })
    if (!a) { var ex0 = document.getElementById('apptDetailDlg'); if (ex0) ex0.remove(); return }

    var APPT_STATUS_CFG = _statusCfg()
    var s = APPT_STATUS_CFG[a.status] || APPT_STATUS_CFG.agendado || {}
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var salas = typeof getRooms === 'function' ? getRooms() : []
    var profNome = a.profissionalNome || (profs[a.profissionalIdx] && profs[a.profissionalIdx].nome) || '—'
    var salaNome = (salas[a.salaIdx] && salas[a.salaIdx].nome) || '—'

    var canFinish = ['agendado','confirmado','em_atendimento'].includes(a.status)
    var canReagendar = !['finalizado','cancelado','no_show'].includes(a.status)
    var canEditRules = true
    if (window.AgendaValidator && AgendaValidator.canEdit) {
      var ce = AgendaValidator.canEdit(a)
      canEditRules = !!(ce && ce.ok)
    }

    var existing = document.getElementById('apptDetailDlg')
    if (existing) existing.remove()
    // Limpa handlers da render anterior (ex: keydown esc) antes de re-registrar
    _apptCleanupHandlers()

    var dlg = document.createElement('div')
    dlg.id = 'apptDetailDlg'
    dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9998'
    dlg.innerHTML = _apptDetailHTML(a, s, profs, salas, profNome, salaNome, mode, tab, canFinish, canReagendar, canEditRules)

    dlg.addEventListener('click', function (e) {
      if (e.target === dlg && mode === 'view') dlg.remove()
    })
    // Keydown handler registrado no _apptActiveHandlers para cleanup em _apptDetailClose.
    // Evita acumulo de listeners quando detail e reaberto multiplas vezes.
    var escHandler = function(e) {
      if (e.key !== 'Escape') return
      if (_apptDetailState.mode === 'edit') {
        if (confirm('Descartar alteracoes em andamento?')) {
          _apptDetailState.mode = 'view'; _renderApptDetail()
        }
      } else {
        _apptDetailClose()
      }
    }
    _apptRegisterHandler(document, 'keydown', escHandler)
    document.body.appendChild(dlg)
  }

  function _apptDetailHTML(a, s, profs, salas, profNome, salaNome, mode, tab, canFinish, canReagendar, canEditRules) {
    var id = a.id
    var isEdit = mode === 'edit'
    var tabBtn = function(key, label) {
      var active = tab === key
      return '<button data-tab="' + key + '" onclick="_apptDetailSetTab(\'' + key + '\')" '
        + 'style="flex:1;padding:9px 8px;border:none;background:' + (active ? '#fff' : 'transparent')
        + ';border-bottom:2px solid ' + (active ? '#7C3AED' : 'transparent')
        + ';font-size:11px;font-weight:700;cursor:pointer;color:' + (active ? '#7C3AED' : '#6B7280')
        + ';transition:all .15s">' + label + '</button>'
    }

    var consentSel = function(field, val) {
      var opts = field === 'procedimento'
        ? [['pendente','Pendente'],['assinado','Assinado']]
        : [['pendente','Pendente'],['assinado','Assinado'],['recusado','Recusado']]
      return '<select onchange="_setConsent(\'' + id + '\',\'' + field + '\',this.value)" '
        + 'style="font-size:10px;padding:3px 5px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer">'
        + opts.map(function(o) { return '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + o[1] + '</option>' }).join('')
        + '</select>'
    }
    var consentBadge = function(val) {
      if (val === 'assinado') return '<span style="color:#059669;font-size:11px;font-weight:700">&#10003; Assinado</span>'
      if (val === 'recusado') return '<span style="color:#DC2626;font-size:11px;font-weight:700">&#10007; Recusado</span>'
      return '<span style="color:#D97706;font-size:11px;font-weight:700">&#9711; Pendente</span>'
    }
    var docBool = function(val, t, f) {
      return val
        ? '<span style="color:#059669;font-size:11px;font-weight:700">&#10003; ' + t + '</span>'
        : '<span style="color:#D97706;font-size:11px;font-weight:700">&#9711; ' + f + '</span>'
    }

    // ── Aba Resumo ───────────────────────────────────────────────
    var tabResumo = ''
    if (isEdit) {
      tabResumo = ''
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Data</div>'
        +     '<input id="sd_data" type="date" value="' + _esc(a.data) + '" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box"></div>'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Inicio</div>'
        +     '<input id="sd_inicio" type="time" value="' + _esc(a.horaInicio) + '" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box"></div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Duracao</div>'
        +     '<select id="sd_duracao" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff">'
        +       _selOpts(_APPT_DURACAO_OPTS, _apptDetailDur(a)) + '</select></div>'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Status</div>'
        +     '<select id="sd_status" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff">'
        +       _selOpts(_APPT_STATUS_OPTS, a.status) + '</select></div>'
        + '</div>'
        + '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Procedimento</div>'
        +   '<input id="sd_proc" type="text" value="' + _esc(a.procedimento) + '" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box"></div>'
        + '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Profissional</div>'
        +   '<select id="sd_prof" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff">'
        +     '<option value="">Selecione...</option>'
        +     profs.map(function(p,i) { return '<option value="' + i + '"' + (i === a.profissionalIdx ? ' selected' : '') + '>' + _esc(p.nome) + '</option>' }).join('')
        +   '</select></div>'
    } else {
      tabResumo = ''
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Procedimento</div>'
        +     '<div style="font-size:13px;font-weight:600;color:#111827">' + _esc(a.procedimento || '—') + '</div></div>'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Profissional</div>'
        +     '<div style="font-size:13px;font-weight:600;color:#111827">' + _esc(profNome) + '</div></div>'
        + '</div>'
    }

    tabResumo += ''
      + '<div style="background:#F9FAFB;border-radius:10px;padding:14px">'
      +   '<div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Documentos &amp; Consentimentos</div>'
      +   '<div style="display:flex;flex-direction:column;gap:9px">'
      +     '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
      +       '<span style="font-size:12px;color:#374151;flex:1">Ficha de Anamnese</span>'
      +       '<div style="display:flex;align-items:center;gap:6px">'
      +         docBool(a.anamneseRespondida, 'Respondida', 'Pendente')
      +         '<button onclick="_toggleAnamnese(\'' + id + '\')" style="font-size:10px;padding:3px 8px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer;color:#6B7280">' + (a.anamneseRespondida ? 'Desfazer' : 'Marcar') + '</button>'
      +       '</div></div>'
      +     '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
      +       '<span style="font-size:12px;color:#374151;flex:1">Consentimento de Imagem</span>'
      +       '<div style="display:flex;align-items:center;gap:6px">' + consentBadge(a.consentimentoImagem) + consentSel('imagem', a.consentimentoImagem) + '</div></div>'
      +     '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
      +       '<span style="font-size:12px;color:#374151;flex:1">Consentimento do Procedimento</span>'
      +       '<div style="display:flex;align-items:center;gap:6px">' + consentBadge(a.consentimentoProcedimento) + consentSel('procedimento', a.consentimentoProcedimento) + '</div></div>'
      +   '</div></div>'

    // ── Aba Detalhes ─────────────────────────────────────────────
    var fieldRO = function(label, val) {
      return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6">'
        + '<span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.04em">' + label + '</span>'
        + '<span style="font-size:13px;color:#111827;font-weight:500;text-align:right">' + _esc(val || '—') + '</span></div>'
    }
    var fieldEdit = function(label, html) {
      return '<div style="display:flex;flex-direction:column;gap:4px">'
        + '<label style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.04em">' + label + '</label>'
        + html + '</div>'
    }
    var inputCss = 'width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box;background:#fff'

    var tabDetalhes
    if (isEdit) {
      tabDetalhes = '<div style="display:flex;flex-direction:column;gap:12px">'
        + fieldEdit('Sala', '<select id="sd_sala" style="' + inputCss + '"><option value="">Selecione...</option>'
            + salas.map(function(r,i) { return '<option value="' + i + '"' + (i === a.salaIdx ? ' selected' : '') + '>' + _esc(r.nome) + '</option>' }).join('') + '</select>')
        + fieldEdit('Tipo Paciente', '<select id="sd_tipo_pac" style="' + inputCss + '">' + _selOpts(_APPT_TIPO_PAC_OPTS, a.tipoPaciente) + '</select>')
        + fieldEdit('Indicado Por', '<input id="sd_indicado" type="text" value="' + _esc(a.indicadoPor) + '" style="' + inputCss + '">')
        + fieldEdit('Tipo Atendimento', '<select id="sd_tipo_atend" style="' + inputCss + '">' + _selOpts(_APPT_TIPO_ATEND_OPTS, a.tipoConsulta) + '</select>')
        + fieldEdit('Origem', '<select id="sd_origem" style="' + inputCss + '">' + _selOpts(_APPT_ORIGEM_OPTS, a.origem) + '</select>')
      + '</div>'
    } else {
      tabDetalhes = '<div>'
        + fieldRO('Sala', salaNome)
        + fieldRO('Tipo Paciente', a.tipoPaciente === 'retorno' ? 'Retorno' : (a.tipoPaciente === 'novo' ? 'Novo' : '—'))
        + fieldRO('Indicado Por', a.indicadoPor)
        + fieldRO('Duracao', _apptDetailDur(a) + ' min')
        + fieldRO('Tipo Atendimento', a.tipoConsulta === 'avaliacao' ? 'Consulta' : (a.tipoConsulta === 'procedimento' ? 'Procedimento' : '—'))
        + fieldRO('Origem', a.origem)
      + '</div>'
    }

    // ── Aba Financeiro ───────────────────────────────────────────
    var hasMultiPag = Array.isArray(a.pagamentos) && a.pagamentos.length > 1
    var hasMultiProc = Array.isArray(a.procedimentos) && a.procedimentos.length > 1
    var fmtBR = function(v) { return 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',') }
    var statusPagLabel = { aberto: 'Aberto', pago: 'Pago', parcial: 'Parcial', pendente: 'Pendente' }
    var tabFin
    var pagsList = ''
    if (Array.isArray(a.pagamentos) && a.pagamentos.length) {
      pagsList = '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #E5E7EB">'
        + '<div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:6px">Pagamentos (' + a.pagamentos.length + ')</div>'
        + a.pagamentos.map(function(p) {
            return '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:#374151">'
              + '<span>' + _esc(p.forma || '—') + (p.parcelas > 1 ? ' (' + p.parcelas + 'x)' : '') + '</span>'
              + '<span style="font-weight:600">' + fmtBR(p.valor) + ' · ' + (p.status === 'pago' ? '<span style="color:#059669">pago</span>' : '<span style="color:#D97706">aberto</span>') + '</span>'
              + '</div>'
          }).join('')
        + '</div>'
    }
    var procsList = ''
    if (Array.isArray(a.procedimentos) && a.procedimentos.length) {
      procsList = '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #E5E7EB">'
        + '<div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:6px">Procedimentos (' + a.procedimentos.length + ')</div>'
        + a.procedimentos.map(function(p) {
            return '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:#374151">'
              + '<span>' + _esc(p.nome) + (p.cortesia ? ' <span style="color:#16A34A;font-weight:700">· cortesia</span>' : '') + '</span>'
              + '<span style="font-weight:600">' + fmtBR(p.valor) + '</span>'
              + '</div>'
          }).join('')
        + '</div>'
    }

    if (isEdit) {
      var canEditValor = !hasMultiPag && !hasMultiProc
      var lockNote = (hasMultiPag || hasMultiProc)
        ? '<div style="font-size:10px;color:#92400E;background:#FEF3C7;padding:6px 8px;border-radius:6px;margin-top:6px;line-height:1.4">'
            + 'Pagamentos ou procedimentos multiplos detectados. Para alterar valores e pagamentos, abra o modal completo (botao "Editar" do agendamento original).</div>'
        : ''
      tabFin = '<div style="display:flex;flex-direction:column;gap:12px">'
        + fieldEdit('Valor Total', '<input id="sd_valor" type="number" step="0.01" value="' + _esc(a.valor || 0) + '"'
            + (canEditValor ? '' : ' disabled')
            + ' style="' + inputCss + (canEditValor ? '' : ';background:#F3F4F6;color:#9CA3AF') + '">')
        + fieldEdit('Forma de Pagamento', '<select id="sd_forma_pag" style="' + inputCss + (canEditValor ? '' : ';background:#F3F4F6;color:#9CA3AF') + '"'
            + (canEditValor ? '' : ' disabled') + '>' + _selOpts(_APPT_FORMA_PAG_OPTS, a.formaPagamento) + '</select>')
        + lockNote
        + pagsList + procsList
      + '</div>'
    } else {
      tabFin = '<div>'
        + fieldRO('Valor Total', a.valor ? fmtBR(a.valor) : '—')
        + fieldRO('Forma Pagamento', a.formaPagamento)
        + fieldRO('Status Pagamento', statusPagLabel[a.statusPagamento] || a.statusPagamento || '—')
        + pagsList + procsList
      + '</div>'
    }

    // ── Aba Observacoes ──────────────────────────────────────────
    var tabObs
    if (isEdit) {
      tabObs = fieldEdit('Observacoes',
        '<textarea id="sd_obs" rows="6" style="' + inputCss + ';resize:vertical;font-family:inherit">' + _esc(a.obs) + '</textarea>')
    } else {
      tabObs = '<div style="white-space:pre-wrap;font-size:13px;color:#374151;line-height:1.5;min-height:100px;background:#F9FAFB;padding:12px;border-radius:8px">'
        + (a.obs ? _esc(a.obs) : '<span style="color:#9CA3AF">Sem observacoes.</span>')
        + '</div>'
    }
    if (a.cortesiaMotivo) {
      tabObs += '<div style="margin-top:10px;padding:10px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px">'
        + '<div style="font-size:10px;font-weight:700;color:#16A34A;text-transform:uppercase;margin-bottom:3px">Motivo da Cortesia</div>'
        + '<div style="font-size:12px;color:#374151">' + _esc(a.cortesiaMotivo) + '</div></div>'
    }

    var tabContent = tab === 'detalhes' ? tabDetalhes : (tab === 'financeiro' ? tabFin : (tab === 'obs' ? tabObs : tabResumo))

    // ── Footer ───────────────────────────────────────────────────
    var footer
    if (isEdit) {
      footer = '<div style="display:flex;gap:8px;justify-content:flex-end">'
        + '<button onclick="_apptDetailEditCancel()" style="padding:10px 18px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px">Cancelar</button>'
        + '<button onclick="_apptDetailEditSave()" style="padding:10px 22px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:800;font-size:13px;box-shadow:0 4px 12px rgba(124,58,237,.3)">Salvar Alteracoes</button>'
      + '</div>'
    } else {
      footer = '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + (canFinish ? '<button onclick="document.getElementById(\'apptDetailDlg\').remove();openFinalizarModal(\'' + id + '\')" style="flex:2 1 100%;padding:11px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:13px">Finalizar Atendimento</button>' : '')
        + (canReagendar ? '<button onclick="apptReagendar(\'' + id + '\')" style="flex:1;padding:11px;background:#3B82F6;color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>'
            + 'Reagendar</button>' : '')
      + '</div>'
    }

    var editBtn = canEditRules && !isEdit
      ? '<button onclick="_apptDetailEditRequest()" title="Editar agendamento" style="padding:5px 10px;border:1px solid #E5E7EB;border-radius:7px;background:#fff;cursor:pointer;font-size:11px;font-weight:700;color:#7C3AED;display:flex;align-items:center;gap:4px">'
        + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
        + 'Editar</button>'
      : ''
    var modeBadge = isEdit
      ? '<span style="font-size:10px;font-weight:800;color:#fff;background:#7C3AED;padding:4px 10px;border-radius:20px">EDITANDO</span>'
      : '<span style="font-size:10px;font-weight:700;color:' + (s.color || '#6B7280') + ';background:' + (s.bg || '#F3F4F6') + ';padding:4px 10px;border-radius:20px">' + (s.label || a.status) + '</span>'

    return ''
      + '<div style="background:#fff;border-radius:16px;width:92%;max-width:540px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25)">'
      +   '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #E5E7EB;flex-shrink:0">'
      +     '<div>'
      +       '<div style="font-size:17px;font-weight:800;color:#111827">' + _esc(a.pacienteNome || 'Paciente') + '</div>'
      +       '<div style="font-size:12px;color:#6B7280;margin-top:2px">' + _esc(_fmtDate(a.data)) + '&nbsp;&nbsp;' + _esc(a.horaInicio) + '&ndash;' + _esc(a.horaFim) + '</div>'
      +     '</div>'
      +     '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
      +       modeBadge + editBtn
      +       '<button onclick="_apptDetailClose()" style="width:30px;height:30px;border-radius:50%;border:none;background:#F3F4F6;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:#6B7280">&times;</button>'
      +     '</div>'
      +   '</div>'
      +   '<div style="display:flex;background:#F9FAFB;border-bottom:1px solid #E5E7EB;flex-shrink:0">'
      +     tabBtn('resumo', 'Resumo') + tabBtn('detalhes', 'Detalhes') + tabBtn('financeiro', 'Financeiro') + tabBtn('obs', 'Observacoes')
      +   '</div>'
      +   '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:14px;overflow-y:auto;flex:1">' + tabContent + '</div>'
      +   '<div style="padding:14px 20px;border-top:1px solid #F3F4F6;flex-shrink:0">' + footer + '</div>'
      + '</div>'
  }

  function _apptDetailDur(a) {
    if (!a.horaInicio || !a.horaFim) return 60
    var hi = a.horaInicio.split(':').map(Number)
    var hf = a.horaFim.split(':').map(Number)
    var d = (hf[0]*60 + hf[1]) - (hi[0]*60 + hi[1])
    return d > 0 ? d : 60
  }

  function _apptDetailSetTab(t) {
    // Antes de trocar de aba em modo edit, capturar os valores atuais
    // pra nao perder edicoes ao re-renderizar.
    if (_apptDetailState.mode === 'edit') _apptDetailCaptureEdits()
    _apptDetailState.tab = t
    _renderApptDetail()
    _apptDetailRestoreCaptured()
  }

  // Buffer pra preservar valores entre re-renders durante edicao
  var _apptDetailEditBuf = {}
  function _apptDetailCaptureEdits() {
    var ids = ['sd_data','sd_inicio','sd_duracao','sd_status','sd_proc','sd_prof',
               'sd_sala','sd_tipo_pac','sd_indicado','sd_tipo_atend','sd_origem',
               'sd_valor','sd_forma_pag','sd_obs']
    ids.forEach(function(id) {
      var el = document.getElementById(id)
      if (el) _apptDetailEditBuf[id] = el.value
    })
  }
  function _apptDetailRestoreCaptured() {
    Object.keys(_apptDetailEditBuf).forEach(function(id) {
      var el = document.getElementById(id)
      if (el) el.value = _apptDetailEditBuf[id]
    })
  }

  function _apptDetailClose() {
    if (_apptDetailState.mode === 'edit') {
      if (!confirm('Descartar alteracoes em andamento?')) return
    }
    _apptDetailState.mode = 'view'
    _apptDetailEditBuf = {}
    _apptCleanupHandlers()
    var dlg = document.getElementById('apptDetailDlg')
    if (dlg) dlg.remove()
  }

  // ── Confirmacao dupla pra entrar em modo edit ────────────────
  function _apptDetailEditRequest() {
    var a = _getAppts().find(function(x) { return x.id === _apptDetailState.id })
    if (!a) return
    if (window.AgendaValidator && AgendaValidator.canEdit) {
      var ce = AgendaValidator.canEdit(a)
      if (ce && !ce.ok) {
        if (typeof showValidationErrors === 'function') showValidationErrors(ce.errors, 'Edicao nao permitida')
        else _warn('Este agendamento nao pode ser editado.')
        return
      }
    }

    var ex = document.getElementById('apptEditConfirmDlg')
    if (ex) ex.remove()
    var c = document.createElement('div')
    c.id = 'apptEditConfirmDlg'
    c.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999'
    c.innerHTML = ''
      + '<div style="background:#fff;border-radius:14px;padding:22px 24px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
      +   '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
      +     '<div style="width:36px;height:36px;border-radius:50%;background:#FEF3C7;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
      +       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
      +     '</div>'
      +     '<div style="font-size:15px;font-weight:800;color:#111827">Editar agendamento</div>'
      +   '</div>'
      +   '<div style="font-size:13px;color:#6B7280;line-height:1.5;margin-bottom:14px">'
      +     'Voce esta prestes a editar dados de um agendamento ja confirmado. As alteracoes sao registradas no historico e podem afetar lembretes automaticos.'
      +   '</div>'
      +   '<label style="display:flex;align-items:flex-start;gap:8px;padding:10px;background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer;margin-bottom:14px" onmouseover="this.style.borderColor=\'#7C3AED\'" onmouseout="this.style.borderColor=\'#E5E7EB\'">'
      +     '<input type="checkbox" id="apptEditConfirmCk" onchange="document.getElementById(\'apptEditConfirmGo\').disabled=!this.checked;document.getElementById(\'apptEditConfirmGo\').style.opacity=this.checked?\'1\':\'.45\'" style="margin-top:2px;width:15px;height:15px;accent-color:#7C3AED;cursor:pointer;flex-shrink:0">'
      +     '<span style="font-size:12px;color:#374151;font-weight:600">Confirmo que quero editar este agendamento e entendo que as alteracoes serao registradas.</span>'
      +   '</label>'
      +   '<div style="display:flex;gap:8px;justify-content:flex-end">'
      +     '<button onclick="document.getElementById(\'apptEditConfirmDlg\').remove()" style="padding:9px 16px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:12px">Cancelar</button>'
      +     '<button id="apptEditConfirmGo" disabled onclick="_apptDetailEditStart()" style="padding:9px 18px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:800;font-size:12px;opacity:.45">Iniciar edicao</button>'
      +   '</div>'
      + '</div>'
    c.addEventListener('click', function(e) { if (e.target === c) c.remove() })
    document.body.appendChild(c)
  }

  function _apptDetailEditStart() {
    var c = document.getElementById('apptEditConfirmDlg')
    if (c) c.remove()
    _apptDetailEditBuf = {}
    _apptDetailState.mode = 'edit'
    _renderApptDetail()
  }

  function _apptDetailEditCancel() {
    if (!confirm('Descartar alteracoes em andamento?')) return
    _apptDetailEditBuf = {}
    _apptDetailState.mode = 'view'
    _renderApptDetail()
  }

  function _apptDetailEditSave() {
    _apptDetailCaptureEdits()
    var b = _apptDetailEditBuf
    var id = _apptDetailState.id
    var appts = _getAppts()
    var idx = appts.findIndex(function(x) { return x.id === id })
    if (idx < 0) { _warn('Agendamento nao encontrado.'); return }
    var old = Object.assign({}, appts[idx])

    // Validacao basica
    var data = b.sd_data || old.data
    var inicio = b.sd_inicio || old.horaInicio
    var duracao = parseInt(b.sd_duracao || _apptDetailDur(old), 10) || 60
    if (!data || !inicio) { _warn('Informe data e horario.'); return }
    var todayIso = new Date().toISOString().slice(0, 10)
    if (data < todayIso && !['finalizado','cancelado','no_show'].includes(old.status)) {
      if (!confirm('Data esta no passado. Salvar mesmo assim?')) return
    }

    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var profIdx = b.sd_prof !== undefined && b.sd_prof !== '' ? parseInt(b.sd_prof, 10) : old.profissionalIdx
    if (isNaN(profIdx)) profIdx = old.profissionalIdx
    var salaIdx = b.sd_sala !== undefined && b.sd_sala !== '' ? parseInt(b.sd_sala, 10) : (old.salaIdx == null ? null : old.salaIdx)
    if (b.sd_sala === '') salaIdx = null

    var hasMultiPag = Array.isArray(old.pagamentos) && old.pagamentos.length > 1
    var hasMultiProc = Array.isArray(old.procedimentos) && old.procedimentos.length > 1
    var canEditValor = !hasMultiPag && !hasMultiProc

    var fim = _addMins(inicio, duracao)
    var novo = Object.assign({}, old, {
      data: data,
      horaInicio: inicio,
      horaFim: fim,
      status: b.sd_status || old.status,
      procedimento: b.sd_proc != null ? b.sd_proc : old.procedimento,
      profissionalIdx: profIdx,
      profissionalNome: profs[profIdx] && profs[profIdx].nome || old.profissionalNome,
      salaIdx: salaIdx,
      tipoPaciente: b.sd_tipo_pac || old.tipoPaciente,
      indicadoPor: b.sd_indicado != null ? b.sd_indicado : old.indicadoPor,
      tipoConsulta: b.sd_tipo_atend || old.tipoConsulta,
      origem: b.sd_origem != null ? b.sd_origem : old.origem,
      obs: b.sd_obs != null ? b.sd_obs : old.obs,
    })
    if (canEditValor) {
      novo.valor = parseFloat(b.sd_valor) || 0
      novo.formaPagamento = b.sd_forma_pag || ''
      // Sincroniza pagamento unico se existir
      if (Array.isArray(novo.pagamentos) && novo.pagamentos.length === 1) {
        novo.pagamentos = [Object.assign({}, novo.pagamentos[0], {
          forma: novo.formaPagamento || novo.pagamentos[0].forma,
          valor: novo.valor,
        })]
      }
    }

    // Validacao de conflito (camada 1)
    if (window.AgendaValidator && AgendaValidator.validateSave) {
      var vr = AgendaValidator.validateSave(novo, id)
      if (!vr.ok) {
        if (typeof showValidationErrors === 'function') showValidationErrors(vr.errors, 'Nao foi possivel editar')
        else _warn(vr.errors && vr.errors[0] || 'Validacao falhou.')
        return
      }
    }

    // Audit log
    if (!novo.historicoAlteracoes) novo.historicoAlteracoes = []
    var auditFields = ['data','horaInicio','horaFim','profissionalIdx','profissionalNome','salaIdx','procedimento','tipoConsulta','origem','valor','formaPagamento','status','obs','indicadoPor','tipoPaciente']
    var oldVals = {}, newVals = {}, hasChanges = false
    auditFields.forEach(function(f) {
      if (String(old[f] || '') !== String(novo[f] || '')) {
        oldVals[f] = old[f]; newVals[f] = novo[f]; hasChanges = true
      }
    })
    if (!hasChanges) {
      _apptDetailState.mode = 'view'
      _apptDetailEditBuf = {}
      _renderApptDetail()
      if (window._showToast) _showToast('Sem alteracoes', 'Nada para salvar', 'info')
      return
    }
    novo.historicoAlteracoes.push({
      action_type: 'edicao',
      old_value: oldVals,
      new_value: newVals,
      changed_by: 'secretaria',
      changed_at: new Date().toISOString(),
      reason: 'Edicao inline (modal lateral)',
    })

    appts[idx] = novo
    var prev = JSON.parse(JSON.stringify(_getAppts()))
    _saveAppts(appts)

    // Reagendar automacoes se data/hora mudou
    if ((old.data !== novo.data || old.horaInicio !== novo.horaInicio) && typeof scheduleAutomations === 'function') {
      if (window._getQueue && window._saveQueue) {
        var q = _getQueue().map(function(x) { return x.apptId === id ? Object.assign({}, x, { executed: true }) : x })
        _saveQueue(q)
      }
      scheduleAutomations(novo)
    }

    _refresh()
    _apptDetailEditBuf = {}
    _apptDetailState.mode = 'view'
    _renderApptDetail()
    if (window._showToast) _showToast('Agendamento atualizado', novo.pacienteNome || '', 'success')

    // Sync Supabase com rollback
    if (window.AppointmentsService && AppointmentsService.syncOneAwait) {
      AppointmentsService.syncOneAwait(novo).then(function(result) {
        if (!result.ok && !result.queued) {
          _saveAppts(prev)
          _refresh()
          if (window._showToast) _showToast('Erro ao sincronizar', result.error || 'Falha no servidor — revertido', 'error')
        }
      })
    }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.openApptModal     = openApptModal
  window.closeApptModal    = closeApptModal
  window.saveAppt          = saveAppt
  window.deleteAppt        = deleteAppt
  window.openApptDetail    = openApptDetail
  window._apptDetailSetTab     = _apptDetailSetTab
  window._apptDetailClose      = _apptDetailClose
  window._apptDetailEditRequest = _apptDetailEditRequest
  window._apptDetailEditStart  = _apptDetailEditStart
  window._apptDetailEditCancel = _apptDetailEditCancel
  window._apptDetailEditSave   = _apptDetailEditSave
  window.apptSearchPatient = apptSearchPatient
  window.selectApptPatient = selectApptPatient
  window.apptIndicadoSearch = apptIndicadoSearch
  window.apptIndicadoSelect = apptIndicadoSelect
  window.apptOnProfChange   = apptOnProfChange
  window.apptReagendar      = apptReagendar
  window.apptReagendarConfirm = apptReagendarConfirm
  window.apptAddPagamento   = apptAddPagamento
  window.apptRemovePagamento = apptRemovePagamento
  window.apptUpdatePagamento = apptUpdatePagamento
  window.apptTogglePago     = apptTogglePago
  window.apptUpdatePagamentosTotal = apptUpdatePagamentosTotal
  window.apptProcUpdate     = apptProcUpdate
  window.apptProcAutofill  = apptProcAutofill
  window.apptTipoChange    = apptTipoChange
  window.apptUpdateEndTime = apptUpdateEndTime
  window.apptSetTipo       = apptSetTipo
  window.apptSetAval       = apptSetAval
  window.apptAddProc       = apptAddProc
  window.apptRemoveProc    = apptRemoveProc
  window.apptAutoSala       = apptAutoSala
  window.apptProcSelected   = apptProcSelected
  window.apptToggleDesconto = apptToggleDesconto
  window.apptCalcDesconto   = apptCalcDesconto
  window._multiProcPick     = _multiProcPick
  window._multiProcConfirm  = _multiProcConfirm
  window._multiProcCloseAlert = _multiProcCloseAlert

  // ═══════════════════════════════════════════════════════════════
  // ── RECORRENCIA DE SESSOES ─────────────────────────────────────
  // Permite criar uma serie de appointments (ex: 8 sessoes a cada 7 dias)
  // linkados por recurrence_group_id. Cada appt individual fica editavel.
  // Paciente recebe uma WA consolidada com todas as datas via regra
  // on_recurrence_created em wa_agenda_automations.
  // ═══════════════════════════════════════════════════════════════

  function _recUuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  function _recFmtShort(iso) {
    try {
      var d = new Date(iso + 'T12:00:00')
      var dn = ['dom','seg','ter','qua','qui','sex','sab'][d.getDay()]
      return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + ' (' + dn + ')'
    } catch(e) { return iso }
  }

  // Gera cronograma da serie.
  // - Se fases esta preenchido (array com sessoes+intervalo_dias por fase),
  //   respeita a cadencia mista (ex: 8 semanais + 2 quinzenais).
  //   O total e ignorado — vem do somatorio das fases.
  // - Senao, usa intervalDays fixo por total sessoes.
  function _recGenerateDates(baseDateStr, intervalDays, total, fases) {
    var dates = []
    var cursor = new Date(baseDateStr + 'T12:00:00')
    dates.push(cursor.toISOString().slice(0, 10))

    if (fases && fases.length) {
      fases.forEach(function(fase, fIdx) {
        var n = parseInt(fase.sessoes) || 0
        var gap = parseInt(fase.intervalo_dias) || 7
        // Primeira fase: (n-1) gaps (a primeira sessao e a base).
        // Demais fases: n gaps (gap da transicao + gaps internos).
        var count = (fIdx === 0) ? Math.max(0, n - 1) : n
        for (var i = 0; i < count; i++) {
          cursor.setDate(cursor.getDate() + gap)
          dates.push(cursor.toISOString().slice(0, 10))
        }
      })
      return dates
    }

    for (var i = 1; i < total; i++) {
      cursor.setDate(cursor.getDate() + intervalDays)
      dates.push(cursor.toISOString().slice(0, 10))
    }
    return dates
  }

  function _recTotalFromFases(fases) {
    if (!fases || !fases.length) return 0
    return fases.reduce(function(sum, f) { return sum + (parseInt(f.sessoes) || 0) }, 0)
  }

  function _recFasesLabel(fases) {
    if (!fases || !fases.length) return ''
    return fases.map(function(f) {
      var lbl = f.nome || 'Fase'
      return lbl + ' ' + (f.sessoes || 0) + 'x/' + (f.intervalo_dias || 0) + 'd'
    }).join(' → ')
  }

  function _apptUpdateRecurrenceVisibility() {
    var block = document.getElementById('apptRecurrenceBlock')
    if (!block) return
    var hasProcs = _apptProcs && _apptProcs.length > 0
    block.style.display = hasProcs ? '' : 'none'
    // Se editando appt ja salvo, esconde (recorrencia so no primeiro save)
    var editId = (document.getElementById('appt_id') || {}).value
    if (editId) { block.style.display = 'none'; return }
    // Popula select do procedimento recorrente
    var procSel = document.getElementById('appt_rec_proc')
    var procWrap = document.getElementById('apptRecurrenceProcWrap')
    if (procSel && hasProcs) {
      procSel.innerHTML = _apptProcs.map(function(p, i) {
        return '<option value="' + i + '">' + (p.nome || 'Procedimento ' + (i+1)) + '</option>'
      }).join('')
    }
    if (procWrap) procWrap.style.display = (_apptProcs || []).length > 1 ? '' : 'none'
    _apptRecurrenceUpdatePreview()
  }

  function apptToggleRecurrence(cb) {
    var fields = document.getElementById('apptRecurrenceFields')
    if (fields) fields.style.display = cb.checked ? '' : 'none'
    _apptRecurrenceUpdatePreview()
  }

  function _apptRecurrenceUpdatePreview() {
    var previewEl = document.getElementById('apptRecurrencePreview')
    if (!previewEl) return
    var check = document.getElementById('appt_rec_check')
    var baseDate = (document.getElementById('appt_data') || {}).value || ''
    if (!check || !check.checked || !baseDate) { previewEl.innerHTML = ''; return }
    var interval = parseInt((document.getElementById('appt_rec_interval') || {}).value) || 7
    var total = parseInt((document.getElementById('appt_rec_total') || {}).value) || 8
    if (total < 2) total = 2
    if (total > 52) total = 52

    // Se o procedimento selecionado tem fases, usa multi-fase
    var procIdx = parseInt((document.getElementById('appt_rec_proc') || {}).value || '0') || 0
    var selectedProc = _apptProcs[procIdx]
    var fases = (selectedProc && Array.isArray(selectedProc.fases) && selectedProc.fases.length)
      ? selectedProc.fases : null

    var dates = _recGenerateDates(baseDate, interval, total, fases)
    var shown = dates.slice(0, 5).map(function(d, i) {
      return '<b>' + (i+1) + '.</b> ' + _recFmtShort(d)
    }).join(' &nbsp;&middot;&nbsp; ')
    if (dates.length > 5) shown += ' &nbsp;&middot;&nbsp; <i>(+' + (dates.length - 5) + ' mais)</i>'
    var prefixo = fases
      ? '<span style="background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-right:6px">MULTI-FASE</span>' +
        '<span style="color:#6B7280;font-size:11px">' + _recFasesLabel(fases) + '</span><br/>'
      : ''
    previewEl.innerHTML = prefixo + 'Serie: ' + shown
  }

  // Bind change events pra recalcular preview
  document.addEventListener('DOMContentLoaded', function() {
    ['appt_data', 'appt_rec_interval', 'appt_rec_total', 'appt_rec_proc'].forEach(function(id) {
      var el = document.getElementById(id)
      if (el) el.addEventListener('change', _apptRecurrenceUpdatePreview)
      if (el) el.addEventListener('input', _apptRecurrenceUpdatePreview)
    })
  })

  function _apptCheckSeriesConflicts(datesArray, inicio, duracao, profIdx, salaIdx, excludeId) {
    var all = _getAppts()
    var fim = _addMins(inicio, duracao)
    var conflicts = []
    datesArray.forEach(function(dateIso, idx) {
      var test = {
        id: 'rec_test_' + idx, data: dateIso, horaInicio: inicio, horaFim: fim,
        profissionalIdx: profIdx, salaIdx: salaIdx, status: 'agendado',
      }
      var check = _checkConflict(test, all.filter(function(a) { return a.id !== excludeId }))
      if (check && check.conflict) {
        conflicts.push({ index: idx, date: dateIso, reason: check.message || check.reason || 'Conflito de horario' })
      }
    })
    return conflicts
  }

  // Modal de resolucao de conflitos — cada conflito vira linha com acoes
  function _apptShowConflictModal(conflicts, onResolve) {
    var existing = document.getElementById('apptConflictModal')
    if (existing) existing.remove()
    var overlay = document.createElement('div')
    overlay.id = 'apptConflictModal'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.7);z-index:9500;display:flex;align-items:center;justify-content:center;padding:20px'
    var rows = conflicts.map(function(c) {
      return '<tr data-c-row="' + c.index + '">'
        + '<td style="padding:8px 10px;font-size:12px;color:#0F172A">Sessao <b>' + (c.index+1) + '</b></td>'
        + '<td style="padding:8px 10px;font-size:12px">' + _recFmtShort(c.date) + '</td>'
        + '<td style="padding:8px 10px;font-size:11px;color:#DC2626">' + c.reason + '</td>'
        + '<td style="padding:8px 10px">'
        +   '<select data-c-action="' + c.index + '" style="padding:5px 8px;border:1px solid #E2E8F0;border-radius:6px;font-size:11px;background:#fff">'
        +     '<option value="skip">Pular essa sessao</option>'
        +     '<option value="next">Tentar +1 dia</option>'
        +     '<option value="keep">Manter (resolver depois)</option>'
        +   '</select>'
        + '</td>'
        + '</tr>'
    }).join('')
    overlay.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:700px;width:100%;max-height:80vh;display:flex;flex-direction:column">'
      + '<div style="padding:16px 20px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;gap:8px">'
      +   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      +   '<div style="font-size:14px;font-weight:700;color:#0F172A">'+conflicts.length+' conflito(s) de horario na serie</div>'
      + '</div>'
      + '<div style="padding:16px 20px;overflow-y:auto;flex:1">'
      +   '<div style="font-size:12px;color:#475569;margin-bottom:12px;line-height:1.5">Escolha como resolver cada sessao conflitada. Sessoes sem conflito sao criadas normalmente.</div>'
      +   '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      +     '<thead><tr style="background:#F8FAFC">'
      +       '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0">Sessao</th>'
      +       '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0">Data</th>'
      +       '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0">Motivo</th>'
      +       '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0">Acao</th>'
      +     '</tr></thead>'
      +     '<tbody>' + rows + '</tbody>'
      +   '</table>'
      + '</div>'
      + '<div style="padding:12px 20px;border-top:1px solid #F1F5F9;display:flex;gap:8px;justify-content:flex-end">'
      +   '<button type="button" data-c-cancel style="padding:8px 16px;background:#fff;color:#64748B;border:1px solid #E2E8F0;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Cancelar tudo</button>'
      +   '<button type="button" data-c-confirm style="padding:8px 20px;background:#7C3AED;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer">Continuar</button>'
      + '</div>'
      + '</div>'
    document.body.appendChild(overlay)
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) { overlay.remove(); if (onResolve) onResolve(null); return }
      if (e.target.closest('[data-c-cancel]')) { overlay.remove(); if (onResolve) onResolve(null); return }
      if (e.target.closest('[data-c-confirm]')) {
        var decisions = {}
        conflicts.forEach(function(c) {
          var sel = overlay.querySelector('[data-c-action="' + c.index + '"]')
          decisions[c.index] = sel ? sel.value : 'skip'
        })
        overlay.remove()
        if (onResolve) onResolve(decisions)
      }
    })
  }

  function _apptCloneForSeries(base, newDateIso, indexInSeries, total, groupId, interval, procName) {
    var child = Object.assign({}, base)
    child.id = _genId()
    child.data = newDateIso
    child.status = 'agendado'
    child.recurrenceGroupId = groupId
    child.recurrenceIndex = indexInSeries
    child.recurrenceTotal = total
    child.recurrenceProcedure = procName
    child.recurrenceIntervalDays = interval
    // Limpa campos que nao devem se repetir em sessoes futuras
    child.confirmacaoEnviada = false
    child.consentimentoImagem = 'pendente'
    child.presenca = null
    child.chegadaEm = null
    child.canceladoEm = null
    child.motivoCancelamento = null
    child.noShowEm = null
    child.motivoNoShow = null
    child.historicoStatus = []
    child.historicoAlteracoes = []
    child.obsFinal = ''
    // Pagamentos so no primeiro (base) — sessoes futuras nao replicam pagamento
    child.pagamentos = []
    child.valor = 0
    child.formaPagamento = ''
    child.statusPagamento = 'pendente'
    return child
  }

  async function apptSaveWithSeries() {
    var check = document.getElementById('appt_rec_check')
    if (!check || !check.checked) { _warn('Marque "Agendar sessoes recorrentes" primeiro'); return }
    var baseDateStr = (document.getElementById('appt_data') || {}).value
    if (!baseDateStr) { _warn('Informe a data'); return }
    var interval = parseInt((document.getElementById('appt_rec_interval') || {}).value) || 7
    var total = parseInt((document.getElementById('appt_rec_total') || {}).value) || 8
    if (total < 2 || total > 52) { _warn('Total de sessoes deve estar entre 2 e 52'); return }
    if (interval < 1 || interval > 365) { _warn('Intervalo deve estar entre 1 e 365 dias'); return }
    var procIdx = parseInt((document.getElementById('appt_rec_proc') || {}).value || '0') || 0
    var procRef = _apptProcs[procIdx] || {}
    var procName = procRef.nome || ''
    if (!procName) { _warn('Selecione o procedimento recorrente'); return }
    var inicio = (document.getElementById('appt_inicio') || {}).value
    var duracao = parseInt((document.getElementById('appt_duracao') || {}).value) || 60
    var profIdx = parseInt((document.getElementById('appt_prof') || {}).value || '0') || 0
    var salaIdx = parseInt((document.getElementById('appt_sala') || {}).value)

    var fasesProc = Array.isArray(procRef.fases) && procRef.fases.length ? procRef.fases : null
    var dates = _recGenerateDates(baseDateStr, interval, total, fasesProc)
    // Multi-fase: total real vem da serie gerada
    if (fasesProc) total = dates.length
    var childrenDates = dates.slice(1)
    var conflicts = _apptCheckSeriesConflicts(childrenDates, inicio, duracao, profIdx, isNaN(salaIdx) ? null : salaIdx, null)

    async function proceed(decisions) {
      await _apptPersistSeries({
        dates: dates, interval: interval, total: total, procName: procName,
        decisions: decisions || {}, inicio: inicio, duracao: duracao,
      })
    }

    if (conflicts.length) {
      _apptShowConflictModal(conflicts, function(decisions) {
        if (!decisions) return // cancelado
        proceed(decisions)
      })
    } else {
      await proceed({})
    }
  }

  // Persiste serie de recorrencia com sync transacional.
  // Sequencia: salva base (via saveAppt async) -> cria filhos em memoria ->
  // grava localStorage otimistico -> syncOneAwait de cada filho -> se QUALQUER
  // falhar, reverte TUDO (base + filhos) e restaura prevAppts.
  // So dispara processRecurrenceCreated depois de todas confirmadas.
  async function _apptPersistSeries(opts) {
    var dates = opts.dates, interval = opts.interval, total = opts.total, procName = opts.procName
    var decisions = opts.decisions || {}

    // Snapshot pre-operacao (rollback completo se algo falhar)
    var prevAppts = JSON.parse(JSON.stringify(_getAppts()))

    // 1. Salva o appt base via saveAppt (agora async) injetando recurrence fields
    var groupId = _recUuid()
    window.__apptPendingRecurrence = {
      groupId: groupId, index: 1, total: total, procName: procName, interval: interval,
    }
    try {
      await saveAppt()
    } finally {
      window.__apptPendingRecurrence = null
    }

    // Re-le pra pegar o appt base salvo. Se saveAppt falhou/revertou,
    // a base nao estara la e abortamos.
    var all = _getAppts()
    var base = all.filter(function(a) { return a.recurrenceGroupId === groupId && a.recurrenceIndex === 1 })[0]
    if (!base) {
      // saveAppt ja mostrou erro de sync/rollback; so abortamos a serie
      if (window._showToast) _showToast('Serie cancelada', 'Falha ao salvar primeira sessao — reverta manualmente se necessario.', 'error')
      return
    }

    // 2. Gera filhos em memoria
    var created = [{ iso: dates[0], appt: base }]
    var skipped = []
    var childrenOnly = []
    for (var i = 1; i < dates.length; i++) {
      var decision = decisions[i - 1] || 'create'
      if (decision === 'skip') { skipped.push(dates[i]); continue }
      var childDate = dates[i]
      if (decision === 'next') {
        var d = new Date(childDate + 'T12:00:00'); d.setDate(d.getDate() + 1)
        childDate = d.toISOString().slice(0, 10)
      }
      var child = _apptCloneForSeries(base, childDate, i + 1, total, groupId, interval, procName)
      all.push(child)
      created.push({ iso: childDate, appt: child })
      childrenOnly.push(child)
    }
    _saveAppts(all)

    // 3. Sync de cada filho em paralelo. Se qualquer um falhar de forma dura
    // (nao ok E nao queued), reverte TUDO — incluindo a base.
    if (window.AppointmentsService && window.AppointmentsService.syncOneAwait && childrenOnly.length) {
      try {
        var results = await Promise.all(childrenOnly.map(function(c) {
          return AppointmentsService.syncOneAwait(c)
        }))
        var hardFailure = results.find(function(r) { return !r.ok && !r.queued })
        if (hardFailure) {
          // Rollback completo: apaga base + filhos
          _saveAppts(prevAppts)
          _refresh()
          if (window._showToast) _showToast('Falha ao sincronizar serie', (hardFailure.error || 'Servidor rejeitou uma das sessoes.') + ' Tente novamente.', 'error')
          return
        }
      } catch (err) {
        _saveAppts(prevAppts)
        _refresh()
        if (window._showToast) _showToast('Falha ao sincronizar serie', (err && err.message) || 'Erro inesperado.', 'error')
        return
      }
    }

    // 4. Aguarda a msg universal de Agendamento da BASE ser enfileirada PRIMEIRO.
    //    Sem isso, a consolidada da serie pode ir no wa_outbox antes da universal
    //    (linkPromise e processStatusChange rodam em background apos saveAppt).
    if (window.__apptLastAutomationsPromise) {
      try { await window.__apptLastAutomationsPromise } catch (_) { /* best-effort */ }
      window.__apptLastAutomationsPromise = null
    }

    // 5. So agora dispara msg WA consolidada — todas as sessoes confirmadas
    //    E a universal ja foi enfileirada.
    if (window.AutomationsEngine && window.AutomationsEngine.processRecurrenceCreated) {
      try {
        window.AutomationsEngine.processRecurrenceCreated({
          appt: base,
          procedureName: procName,
          intervalDays: interval,
          totalSessions: created.length,
          dates: created.map(function(c) { return c.iso }),
          inicio: opts.inicio,
        })
      } catch (e) { console.warn('[recurrence] processRecurrenceCreated falhou:', e) }
    }

    if (window._showToast) {
      var msg = created.length + ' sessoes agendadas'
      if (skipped.length) msg += ' (' + skipped.length + ' pulada(s))'
      _showToast('Serie criada', msg, 'success')
    }
    _refresh()
  }

  async function apptCreateNextSessionOnly() {
    var baseDateStr = (document.getElementById('appt_data') || {}).value
    if (!baseDateStr) { _warn('Informe a data'); return }
    var interval = parseInt((document.getElementById('appt_rec_interval') || {}).value) || 7
    var procIdx = parseInt((document.getElementById('appt_rec_proc') || {}).value || '0') || 0
    var procName = (_apptProcs[procIdx] || {}).nome || ''
    if (!procName) { _warn('Selecione o procedimento recorrente'); return }
    var inicio = (document.getElementById('appt_inicio') || {}).value
    var duracao = parseInt((document.getElementById('appt_duracao') || {}).value) || 60
    var profIdx = parseInt((document.getElementById('appt_prof') || {}).value || '0') || 0
    var salaIdx = parseInt((document.getElementById('appt_sala') || {}).value)

    var nextDate = new Date(baseDateStr + 'T12:00:00')
    nextDate.setDate(nextDate.getDate() + interval)
    var nextIso = nextDate.toISOString().slice(0, 10)

    var conflicts = _apptCheckSeriesConflicts([nextIso], inicio, duracao, profIdx, isNaN(salaIdx) ? null : salaIdx, null)

    // Sync transacional: se sync do filho falhar, reverte base + filho.
    async function proceed() {
      var prevAppts = JSON.parse(JSON.stringify(_getAppts()))
      var groupId = _recUuid()
      window.__apptPendingRecurrence = { groupId: groupId, index: 1, total: 2, procName: procName, interval: interval }
      try {
        await saveAppt()
      } finally {
        window.__apptPendingRecurrence = null
      }

      var all = _getAppts()
      var base = all.filter(function(a) { return a.recurrenceGroupId === groupId && a.recurrenceIndex === 1 })[0]
      if (!base) {
        if (window._showToast) _showToast('Erro', 'Falha ao criar proxima sessao', 'error')
        return
      }
      var child = _apptCloneForSeries(base, nextIso, 2, 2, groupId, interval, procName)
      all.push(child)
      _saveAppts(all)

      // Sync do filho com rollback se falhar
      if (window.AppointmentsService && window.AppointmentsService.syncOneAwait) {
        try {
          var r = await AppointmentsService.syncOneAwait(child)
          if (!r.ok && !r.queued) {
            _saveAppts(prevAppts)
            _refresh()
            if (window._showToast) _showToast('Falha ao sincronizar', (r.error || 'Proxima sessao revertida.') + ' Tente novamente.', 'error')
            return
          }
        } catch (err) {
          _saveAppts(prevAppts)
          _refresh()
          if (window._showToast) _showToast('Falha ao sincronizar', (err && err.message) || 'Erro inesperado.', 'error')
          return
        }
      }

      // Aguarda universal de Agendamento da base ANTES da consolidada (anti-race)
      if (window.__apptLastAutomationsPromise) {
        try { await window.__apptLastAutomationsPromise } catch (_) { /* best-effort */ }
        window.__apptLastAutomationsPromise = null
      }

      if (window.AutomationsEngine && window.AutomationsEngine.processRecurrenceCreated) {
        try {
          window.AutomationsEngine.processRecurrenceCreated({
            appt: base, procedureName: procName, intervalDays: interval, totalSessions: 2,
            dates: [baseDateStr, nextIso], inicio: inicio,
          })
        } catch(e) { console.warn('[recurrence] processRecurrenceCreated falhou:', e) }
      }
      if (window._showToast) _showToast('Proxima sessao agendada', _recFmtShort(nextIso), 'success')
      _refresh()
    }

    if (conflicts.length) {
      _apptShowConflictModal(conflicts, function(decisions) {
        if (!decisions) return
        if (decisions[0] === 'skip') return
        if (decisions[0] === 'next') {
          var d = new Date(nextIso + 'T12:00:00'); d.setDate(d.getDate() + 1)
          nextIso = d.toISOString().slice(0, 10)
        }
        proceed()
      })
    } else {
      await proceed()
    }
  }

  window.apptToggleRecurrence     = apptToggleRecurrence
  window.apptSaveWithSeries       = apptSaveWithSeries
  window.apptCreateNextSessionOnly = apptCreateNextSessionOnly
  window._apptUpdateRecurrenceVisibility = _apptUpdateRecurrenceVisibility

})()
