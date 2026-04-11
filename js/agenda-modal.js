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
      const indEl  = document.getElementById('appt_indicado_por'); if (indEl) indEl.value = a.indicadoPor || ''
      const indIdEl= document.getElementById('appt_indicado_por_id'); if (indIdEl) indIdEl.value = a.indicadoPorId || ''
      apptLoadPagamentos(a.pagamentos, a.formaPagamento, a.valor)
      if (a.tipoAvaliacao) {
        const rad = document.querySelector(`input[name="appt_tipo_aval"][value="${a.tipoAvaliacao}"]`)
        if (rad) rad.checked = true
        apptSetAval(a.tipoAvaliacao)
      }
      const motEl = document.getElementById('appt_cortesia_motivo'); if (motEl) motEl.value = a.cortesiaMotivo || ''
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
      if (profIdx !== undefined && profSel) profSel.value = profIdx
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

    // Auto-preencher sala do profissional selecionado
    apptAutoSala()

    // Carregar procedimentos da BD (async, popula select quando pronto)
    _cachedClinicProcs = null
    _loadClinicProcs().then(function(procs) { _populateProcSelect(procs) })
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
    _apptProcs = []
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
      // Garante 1 linha default e sincroniza valor com o total
      if (_apptPagamentos.length === 0) apptResetPagamentos()
      var valElP = document.getElementById('appt_valor')
      if (valElP && valElP.value && _apptPagamentos.length === 1 && !_apptPagamentos[0].valor) {
        _apptPagamentos[0].valor = parseFloat(valElP.value) || 0
      }
      apptRenderPagamentos()
    }
    if (hiddenEl) hiddenEl.value = val
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
          procs.push({ nome: p.nome, categoria: p.categoria || 'Procedimentos', valor: parseFloat(p.preco) || 0, duracao: parseInt(p.duracao_min) || 60 })
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
        html += '<option value="' + (p.nome || '').replace(/"/g, '&quot;') + '" data-valor="' + (p.valor || 0) + '" data-dur="' + (p.duracao || 60) + '">' + (p.nome || '').replace(/</g, '&lt;') + (p.valor > 0 ? ' — R$ ' + p.valor.toLocaleString('pt-BR') : '') + '</option>'
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
  function apptAddProc() {
    var selEl = document.getElementById('appt_proc_select')
    var nameEl = document.getElementById('appt_proc')
    var valorEl = document.getElementById('appt_proc_valor')
    var name = (selEl && selEl.value) || (nameEl && nameEl.value.trim())
    var valor = valorEl ? parseFloat(valorEl.value || '0') : 0
    if (!name) return
    _apptProcs.push({ nome: name, valor: valor })
    if (selEl) selEl.value = ''
    if (nameEl) nameEl.value = ''
    if (valorEl) valorEl.value = ''
    _renderApptProcs()

    // Alerta se mais de 1 procedimento em 1h
    if (_apptProcs.length > 1) _checkMultiProcAlert()
  }

  function apptRemoveProc(i) {
    _apptProcs.splice(i, 1)
    _renderApptProcs()
  }

  // ── Alerta multi-procedimento ──────────────────────────────
  function _checkMultiProcAlert() {
    var durEl = document.getElementById('appt_duracao')
    var durAtual = durEl ? parseInt(durEl.value) : 60
    if (durAtual > 60) return // ja aumentou, nao alertar

    var existing = document.getElementById('multiProcAlert')
    if (existing) existing.remove()

    var alert = document.createElement('div')
    alert.id = 'multiProcAlert'
    alert.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px'
    alert.innerHTML =
      '<div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:400px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">' +
        '<div style="background:#F59E0B;padding:14px 18px">' +
          '<div style="font-size:14px;font-weight:800;color:#fff">Mais de 1 procedimento</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:2px">' + _apptProcs.length + ' procedimentos na mesma sessao</div>' +
        '</div>' +
        '<div style="padding:16px 18px">' +
          '<div style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:14px">O tempo pode nao ser suficiente para todos os procedimentos. Deseja aumentar a duracao?</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer" onclick="_multiProcSelect(60)">' +
              '<input type="radio" name="multiProcDur" value="60" style="accent-color:#F59E0B"> <span style="font-size:13px;font-weight:600;color:#374151">Manter 1h</span>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer" onclick="_multiProcSelect(90)">' +
              '<input type="radio" name="multiProcDur" value="90" style="accent-color:#F59E0B"> <span style="font-size:13px;font-weight:600;color:#374151">Aumentar pra 1h30</span>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer" onclick="_multiProcSelect(120)">' +
              '<input type="radio" name="multiProcDur" value="120" style="accent-color:#F59E0B"> <span style="font-size:13px;font-weight:600;color:#374151">Aumentar pra 2h</span>' +
            '</label>' +
          '</div>' +
        '</div>' +
      '</div>'
    document.body.appendChild(alert)
  }

  function _multiProcSelect(dur) {
    var durEl = document.getElementById('appt_duracao')
    if (durEl) durEl.value = dur
    apptUpdateEndTime()

    // Se manteve 1h com multiplos procs, double-check com responsavel
    if (dur === 60 && _apptProcs.length > 1) {
      var paciente = (document.getElementById('appt_paciente_q') && document.getElementById('appt_paciente_q').value) || 'Paciente'
      var procsNomes = _apptProcs.map(function(p) { return p.nome }).join(', ')
      var msg = paciente + ' tem ' + _apptProcs.length + ' procedimentos (' + procsNomes + ') agendados em 1 hora.\nPor favor revise e confirme se o tempo e suficiente.'

      // Buscar telefone do responsavel da agenda (Mirian ou owner)
      var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
      var responsavel = profs.find(function(p) { return /mirian/i.test(p.nome || p.display_name || '') }) || profs[0]
      var respPhone = responsavel && (responsavel.phone || responsavel.whatsapp || responsavel.telefone) || ''
      var respName = responsavel && (responsavel.display_name || responsavel.nome) || 'Responsavel'

      if (window.createDoubleCheck) {
        createDoubleCheck('multi_proc', 'Multiplos procedimentos em 1h', msg, respPhone, respName)
      }
    }

    var alertEl = document.getElementById('multiProcAlert')
    if (alertEl) alertEl.remove()
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
    list.innerHTML = _apptProcs.map(function(p, i) {
      return '<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:#fff;border:1px solid #E5E7EB;border-radius:6px">' +
        '<span style="flex:1;font-size:11px;font-weight:600;color:#374151">' + (p.nome || '').replace(/</g, '&lt;') + '</span>' +
        (p.valor > 0 ? '<span style="font-size:11px;font-weight:700;color:#10B981">R$ ' + p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</span>' : '') +
        '<button onclick="apptRemoveProc(' + i + ')" style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:14px;padding:0 2px">x</button>' +
      '</div>'
    }).join('')

    _updateApptTotalWithDiscount()
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
  }

  function _updateApptTotalWithDiscount() {
    var totalEl = document.getElementById('apptProcsTotal')
    var subtotal = _apptProcs.reduce(function(s, p) { return s + (p.valor || 0) }, 0)
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

  function apptAutoValorConsulta() {
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
    if (valEl) valEl.value = v.toFixed(2)
    // Se ja tem 1 pagamento aberto sem valor, sincroniza com o total
    if (_apptPagamentos.length === 1 && (!_apptPagamentos[0].valor || _apptPagamentos[0].valor === 0)) {
      _apptPagamentos[0].valor = v
      apptRenderPagamentos()
    }
    apptUpdatePagamentosTotal()
  }

  // ── Pagamentos múltiplos (Pix + Cartão etc) ─────────────────
  // Estrutura: _apptPagamentos = [{ forma, valor, status: 'aberto'|'pago' }]
  var _apptPagamentos = []

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

  function _formaOptions(selected) {
    return '<option value="">Forma...</option>' +
      FORMAS_PAGAMENTO.map(function(f) {
        var sel = f.value === selected ? ' selected' : ''
        return '<option value="' + f.value + '"' + sel + '>' + f.label + '</option>'
      }).join('')
  }

  function apptResetPagamentos() {
    _apptPagamentos = [{ forma: '', valor: 0, status: 'aberto' }]
    apptRenderPagamentos()
  }

  function apptLoadPagamentos(arr, fallbackForma, fallbackValor) {
    if (Array.isArray(arr) && arr.length > 0) {
      _apptPagamentos = arr.map(function(p) {
        return {
          forma:  p.forma  || '',
          valor:  parseFloat(p.valor) || 0,
          status: p.status === 'pago' ? 'pago' : 'aberto'
        }
      })
    } else {
      // Fallback compat: appt antigo so tem formaPagamento + valor
      _apptPagamentos = [{
        forma: fallbackForma || '',
        valor: parseFloat(fallbackValor) || 0,
        status: 'aberto'
      }]
    }
    apptRenderPagamentos()
  }

  function apptAddPagamento() {
    _apptPagamentos.push({ forma: '', valor: 0, status: 'aberto' })
    apptRenderPagamentos()
  }

  function apptRemovePagamento(idx) {
    if (_apptPagamentos.length <= 1) return
    _apptPagamentos.splice(idx, 1)
    apptRenderPagamentos()
  }

  function apptUpdatePagamento(idx, field, value) {
    if (!_apptPagamentos[idx]) return
    if (field === 'valor') _apptPagamentos[idx].valor = parseFloat(value) || 0
    else _apptPagamentos[idx][field] = value
    apptUpdatePagamentosTotal()
  }

  function apptTogglePago(idx) {
    if (!_apptPagamentos[idx]) return
    _apptPagamentos[idx].status = _apptPagamentos[idx].status === 'pago' ? 'aberto' : 'pago'
    apptRenderPagamentos()
  }

  function apptRenderPagamentos() {
    var list = document.getElementById('apptPagamentosList')
    if (!list) return
    var canRemove = _apptPagamentos.length > 1
    list.innerHTML = _apptPagamentos.map(function(p, i) {
      var pago = p.status === 'pago'
      var bg   = pago ? '#F0FDF4' : '#fff'
      var bd   = pago ? '#86EFAC' : '#E5E7EB'
      var btnTxt = pago ? '✓ Pago'  : '○ Aberto'
      var btnBg  = pago ? '#16A34A' : '#F3F4F6'
      var btnFg  = pago ? '#fff'    : '#6B7280'
      return '<div style="display:flex;gap:5px;align-items:center;background:' + bg + ';border:1px solid ' + bd + ';border-radius:7px;padding:5px">' +
        '<select onchange="apptUpdatePagamento(' + i + ', \'forma\', this.value)" style="flex:1;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;background:#fff;outline:none">' + _formaOptions(p.forma) + '</select>' +
        '<input type="number" step="0.01" placeholder="0,00" value="' + (p.valor ? p.valor.toFixed(2) : '') + '" oninput="apptUpdatePagamento(' + i + ', \'valor\', this.value)" style="width:75px;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none"/>' +
        '<button type="button" onclick="apptTogglePago(' + i + ')" style="padding:5px 8px;background:' + btnBg + ';color:' + btnFg + ';border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">' + btnTxt + '</button>' +
        (canRemove ? '<button type="button" onclick="apptRemovePagamento(' + i + ')" style="padding:5px 7px;background:#FEE2E2;color:#DC2626;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;line-height:1">×</button>' : '') +
      '</div>'
    }).join('')
    apptUpdatePagamentosTotal()
  }

  function apptUpdatePagamentosTotal() {
    var totalEl = document.getElementById('apptPagamentosTotal')
    if (!totalEl) return
    var total = _apptPagamentos.reduce(function(s, p) { return s + (parseFloat(p.valor) || 0) }, 0)
    var valor = parseFloat((document.getElementById('appt_valor') && document.getElementById('appt_valor').value) || '0') || 0
    var diff = +(valor - total).toFixed(2)
    if (Math.abs(diff) < 0.01) {
      totalEl.style.color = '#16A34A'
      totalEl.textContent = 'Alocado: R$ ' + total.toFixed(2) + ' / R$ ' + valor.toFixed(2)
    } else if (diff > 0) {
      totalEl.style.color = '#DC2626'
      totalEl.textContent = 'Falta alocar R$ ' + diff.toFixed(2) + ' (alocado: R$ ' + total.toFixed(2) + ' / R$ ' + valor.toFixed(2) + ')'
    } else {
      totalEl.style.color = '#DC2626'
      totalEl.textContent = 'Excesso de R$ ' + Math.abs(diff).toFixed(2) + ' (alocado: R$ ' + total.toFixed(2) + ' / R$ ' + valor.toFixed(2) + ')'
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
  function saveAppt() {
    const nome = document.getElementById('appt_paciente_q') && document.getElementById('appt_paciente_q').value.trim()
    if (!nome) { alert('Selecione o paciente'); return }
    const data   = document.getElementById('appt_data') && document.getElementById('appt_data').value
    const inicio = document.getElementById('appt_inicio') && document.getElementById('appt_inicio').value
    if (!data || !inicio) { alert('Informe data e horário'); return }

    // Validar horario passado (camada obrigatoria — independe do AgendaValidator)
    var todayIso = new Date().toISOString().slice(0, 10)
    var editId0 = document.getElementById('appt_id') && document.getElementById('appt_id').value
    if (!editId0) {
      if (data < todayIso) { alert('Nao e possivel agendar em data passada.'); return }
      if (data === todayIso && new Date(data + 'T' + inicio + ':00') < new Date()) {
        alert('Nao e possivel agendar em horario que ja passou.'); return
      }
    }

    const duracao = parseInt((document.getElementById('appt_duracao') && document.getElementById('appt_duracao').value) || '60')
    const fim     = _addMins(inicio, duracao)
    const profIdx = parseInt(((document.getElementById('appt_prof') && document.getElementById('appt_prof').value) || '0')) || 0
    const salaIdx = parseInt((document.getElementById('appt_sala') && document.getElementById('appt_sala').value) || '')
    const profs   = typeof getProfessionals === 'function' ? getProfessionals() : []

    // Validação tipo de atendimento (Consulta vs Procedimento — exclusivos)
    const tipoAtend = (document.getElementById('appt_tipo') && document.getElementById('appt_tipo').value) || ''
    if (!tipoAtend) { alert('Selecione o tipo de atendimento (Consulta ou Procedimento).'); return }

    const tipoAvalEl = document.querySelector('input[name="appt_tipo_aval"]:checked')
    const tipoAvalVal = tipoAvalEl && tipoAvalEl.value || ''
    const cortesiaMotivo = (document.getElementById('appt_cortesia_motivo') && document.getElementById('appt_cortesia_motivo').value.trim()) || ''

    if (tipoAtend === 'avaliacao') {
      if (!tipoAvalVal) { alert('Indique se a consulta é Cortesia ou Paga.'); return }
      if (tipoAvalVal === 'cortesia' && !cortesiaMotivo) {
        alert('Informe o motivo da cortesia.'); return
      }
    }
    if (tipoAtend === 'procedimento' && (!_apptProcs || _apptProcs.length === 0)) {
      alert('Adicione ao menos um procedimento.'); return
    }

    // Validação pagamentos (Consulta Paga)
    const valorTotal = parseFloat((document.getElementById('appt_valor') && document.getElementById('appt_valor').value) || '0') || 0
    if (tipoAtend === 'avaliacao' && tipoAvalVal === 'paga') {
      if (valorTotal <= 0) { alert('Informe o valor da consulta.'); return }
      if (!_apptPagamentos.length) { alert('Adicione ao menos uma forma de pagamento.'); return }
      var faltaForma = _apptPagamentos.find(function(p) { return !p.forma })
      if (faltaForma) { alert('Selecione a forma de cada pagamento.'); return }
      var somaPag = _apptPagamentos.reduce(function(s, p) { return s + (parseFloat(p.valor) || 0) }, 0)
      if (Math.abs(somaPag - valorTotal) >= 0.01) {
        alert('A soma dos pagamentos (R$ ' + somaPag.toFixed(2) + ') deve ser igual ao valor total (R$ ' + valorTotal.toFixed(2) + ').'); return
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
      valor:               (tipoAtend === 'avaliacao' && tipoAvalVal === 'paga') ? valorTotal : 0,
      pagamentos:          (tipoAtend === 'avaliacao' && tipoAvalVal === 'paga') ? _apptPagamentos.map(function(p) { return { forma: p.forma, valor: parseFloat(p.valor) || 0, status: p.status === 'pago' ? 'pago' : 'aberto' } }) : [],
      formaPagamento:      (function() {
        if (tipoAtend !== 'avaliacao' || tipoAvalVal !== 'paga') return ''
        if (_apptPagamentos.length === 1) return _apptPagamentos[0].forma || ''
        return 'misto'
      })(),
      statusPagamento:     (function() {
        if (tipoAtend !== 'avaliacao' || tipoAvalVal !== 'paga') return 'pendente'
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
      procedimentos:       tipoAtend === 'procedimento' && _apptProcs.length ? _apptProcs.slice() : [],
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
  window.apptIndicadoSearch = apptIndicadoSearch
  window.apptIndicadoSelect = apptIndicadoSelect
  window.apptOnProfChange   = apptOnProfChange
  window.apptAddPagamento   = apptAddPagamento
  window.apptRemovePagamento = apptRemovePagamento
  window.apptUpdatePagamento = apptUpdatePagamento
  window.apptTogglePago     = apptTogglePago
  window.apptUpdatePagamentosTotal = apptUpdatePagamentosTotal
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
  window._multiProcSelect   = _multiProcSelect

})()
