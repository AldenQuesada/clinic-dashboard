/**
 * ClinicAI — Automations Engine
 *
 * Executa regras de wa_agenda_automations.
 * Substitui o hardcoded de scheduleAutomations(), _execAuto(), _enviarConsentimento().
 *
 * Entry points (chamados pelos hooks existentes):
 *   processAppointment(appt)            — ao criar/remarcar agendamento
 *   processStatusChange(appt, status)   — ao mudar status via apptTransition()
 *   processTag(entityId, tagId, vars)   — ao aplicar tag via TagEngine
 *   processFinalize(appt)               — ao finalizar consulta
 *
 * Despacha por canal:
 *   whatsapp → wa_outbox_schedule_automation (server-side, n8n envia)
 *   alert    → toast/popup no dashboard
 *   task     → clinic_op_tasks (localStorage)
 *
 * Depende de:
 *   AgendaAutomationsService — regras + renderTemplate
 *   window._sbShared         — Supabase client
 *   window._showToast        — toast UI
 */
;(function () {
  'use strict'

  if (window._clinicaiAutoEngineLoaded) return
  window._clinicaiAutoEngineLoaded = true

  var _svc = function () { return window.AgendaAutomationsService }
  var _initialized = false

  // ── Init: load rules on first use ──────────────────────────
  async function _ensureLoaded() {
    if (_initialized) return
    _initialized = true
    if (_svc() && _svc().loadAll) await _svc().loadAll()
  }

  // ── Build variables from appointment ───────────────────────
  function _apptVars(appt) {
    var clinica = window._getClinicaNome ? _getClinicaNome() : 'Clinica'
    return {
      nome:          appt.pacienteNome || 'Paciente',
      data:          appt.data ? _fmtDate(appt.data) : '',
      hora:          appt.horaInicio || '',
      profissional:  appt.profissionalNome || '',
      procedimento:  appt.procedimento || appt.tipoConsulta || '',
      clinica:       clinica,
      link_anamnese: '',
      status:        appt.status || '',
      obs:           appt.obs || '',
    }
  }

  function _fmtDate(isoDate) {
    if (!isoDate) return ''
    var p = isoDate.split('-')
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : isoDate
  }

  // ── Get phone from lead ────────────────────────────────────
  function _getPhone(appt) {
    try {
      var leads = window.LeadsService
        ? LeadsService.getLocal()
        : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
      var l = leads.find(function (x) { return x.id === appt.pacienteId || (x.nome || x.name || '') === appt.pacienteNome })
      return (l && (l.whatsapp || l.phone || l.telefone)) || ''
    } catch (e) { return '' }
  }

  // ══════════════════════════════════════════════════════════
  //  ENTRY POINT 1: processAppointment
  //  Called when appointment is created or rescheduled.
  //  Handles: d_before, d_zero, min_before (time-based scheduling)
  // ══════════════════════════════════════════════════════════
  async function processAppointment(appt) {
    await _ensureLoaded()
    var svc = _svc()
    if (!svc) return

    var dt = new Date(appt.data + 'T' + (appt.horaInicio || '09:00') + ':00')
    if (isNaN(dt.getTime())) return

    var phone = (_getPhone(appt) || '').replace(/\D/g, '')
    var vars = _apptVars(appt)

    // Cancel previous scheduled automations for this appointment
    if (window._sbShared && appt.id) {
      window._sbShared.rpc('wa_outbox_cancel_by_appt', { p_appt_ref: appt.id })
    }

    // Process time-based rules
    var timeRules = svc.getActive().filter(function (r) {
      return ['d_before', 'd_zero', 'min_before'].indexOf(r.trigger_type) >= 0
    })

    timeRules.forEach(function (rule) {
      var scheduledAt = _calcScheduledAt(rule, dt)
      if (!scheduledAt) return

      // WhatsApp: enqueue in wa_outbox
      if (_channelIncludes(rule.channel, 'whatsapp') && phone && rule.content_template) {
        var content = svc.renderTemplate(rule.content_template, vars)
        _enqueueWA(phone, content, appt, scheduledAt, rule.name)
      }

      // Alert: schedule client-side (only fires if dashboard open)
      if (_channelIncludes(rule.channel, 'alert') && rule.alert_title) {
        _scheduleAlert(rule, vars, scheduledAt, appt.id)
      }

      // Task: create operational task
      if (_channelIncludes(rule.channel, 'task') && rule.task_title) {
        _scheduleTask(rule, vars, scheduledAt, appt.id)
      }
    })
  }

  // ══════════════════════════════════════════════════════════
  //  ENTRY POINT 2: processStatusChange
  //  Called from apptTransition() when status changes.
  //  Handles: on_status rules
  // ══════════════════════════════════════════════════════════
  async function processStatusChange(appt, newStatus) {
    await _ensureLoaded()
    var svc = _svc()
    if (!svc) return

    var rules = svc.getByStatus(newStatus)
    if (!rules.length) return

    var phone = (_getPhone(appt) || '').replace(/\D/g, '')
    var vars = _apptVars(appt)
    vars.status = newStatus

    rules.forEach(function (rule) {
      _executeRule(rule, vars, phone, appt)
    })
  }

  // ══════════════════════════════════════════════════════════
  //  ENTRY POINT 3: processFinalize
  //  Called when appointment is finalized.
  //  Handles: on_finalize rules + d_after scheduling
  // ══════════════════════════════════════════════════════════
  async function processFinalize(appt) {
    await _ensureLoaded()
    var svc = _svc()
    if (!svc) return

    var phone = (_getPhone(appt) || '').replace(/\D/g, '')
    var vars = _apptVars(appt)

    // on_finalize rules (immediate)
    var finalizeRules = svc.getByTrigger('on_finalize')
    finalizeRules.forEach(function (rule) {
      _executeRule(rule, vars, phone, appt)
    })

    // d_after rules (scheduled for future)
    var afterRules = svc.getByTrigger('d_after')
    var now = new Date()
    afterRules.forEach(function (rule) {
      var cfg = rule.trigger_config || {}
      var scheduledAt = new Date(now)
      scheduledAt.setDate(scheduledAt.getDate() + (cfg.days || 1))
      scheduledAt.setHours(cfg.hour || 10, cfg.minute || 0, 0, 0)

      if (_channelIncludes(rule.channel, 'whatsapp') && phone && rule.content_template) {
        var content = svc.renderTemplate(rule.content_template, vars)
        _enqueueWA(phone, content, appt, scheduledAt, rule.name)
      }
      if (_channelIncludes(rule.channel, 'task') && rule.task_title) {
        _scheduleTask(rule, vars, scheduledAt, appt.id)
      }
    })
  }

  // ══════════════════════════════════════════════════════════
  //  ENTRY POINT 4: processTag
  //  Called from TagEngine.applyTag() when a tag is applied.
  //  Handles: on_tag rules
  // ══════════════════════════════════════════════════════════
  async function processTag(entityId, entityType, tagId, vars) {
    await _ensureLoaded()
    var svc = _svc()
    if (!svc) return

    var rules = svc.getByTag(tagId)
    if (!rules.length) return

    vars = vars || {}
    if (!vars.nome) vars.nome = 'Paciente'
    if (!vars.clinica) vars.clinica = window._getClinicaNome ? _getClinicaNome() : 'Clinica'

    // Get phone from lead
    var phone = ''
    try {
      var leads = window.LeadsService ? LeadsService.getLocal() : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
      var lead = leads.find(function (l) { return l.id === entityId })
      if (lead) {
        phone = ((lead.whatsapp || lead.phone || lead.telefone) || '').replace(/\D/g, '')
        if (!vars.nome || vars.nome === 'Paciente') vars.nome = lead.nome || lead.name || 'Paciente'
      }
    } catch (e) { /* silencioso */ }

    rules.forEach(function (rule) {
      _executeRule(rule, vars, phone, { id: entityId, pacienteId: entityId, pacienteNome: vars.nome })
    })
  }

  // ══════════════════════════════════════════════════════════
  //  DISPATCHERS (private)
  // ══════════════════════════════════════════════════════════

  function _executeRule(rule, vars, phone, appt) {
    var svc = _svc()

    // WhatsApp
    if (_channelIncludes(rule.channel, 'whatsapp') && phone && rule.content_template) {
      var content = svc.renderTemplate(rule.content_template, vars)
      _enqueueWA(phone, content, appt, new Date(), rule.name)
    }

    // Alert
    if (_channelIncludes(rule.channel, 'alert') && rule.alert_title) {
      var title = svc.renderTemplate(rule.alert_title, vars)
      _fireAlert(title, rule.alert_type)
    }

    // Task
    if (_channelIncludes(rule.channel, 'task') && rule.task_title) {
      var taskTitle = svc.renderTemplate(rule.task_title, vars)
      _createTask(taskTitle, rule.task_assignee, rule.task_priority, rule.task_deadline_hours, appt)
    }
  }

  // ── WhatsApp: enqueue in wa_outbox (server-side) ───────────
  function _enqueueWA(phone, content, appt, scheduledAt, ruleName) {
    if (!window._sbShared || !phone) return
    window._sbShared.rpc('wa_outbox_schedule_automation', {
      p_phone:        phone,
      p_content:      content,
      p_lead_id:      appt.pacienteId || '',
      p_lead_name:    appt.pacienteNome || 'Paciente',
      p_scheduled_at: scheduledAt.toISOString(),
      p_appt_ref:     appt.id || null,
    }).then(function (res) {
      if (res.error) console.error('[Engine] WA falha:', ruleName, res.error.message)
    }).catch(function (e) { console.error('[Engine] WA exception:', e) })
  }

  // ── Alert: toast in dashboard ──────────────────────────────
  function _fireAlert(title, type) {
    if (window._showToast) {
      var icon = { info: 'info', warning: 'alert-triangle', success: 'check-circle', error: 'alert-circle' }[type] || 'info'
      _showToast('Automacao', title, type || 'info')
    }
  }

  // ── Alert: scheduled (client-side queue) ───────────────────
  function _scheduleAlert(rule, vars, scheduledAt, apptId) {
    var q = JSON.parse(localStorage.getItem('clinicai_automations_queue') || '[]')
    q.push({
      id:          'aut_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      apptId:      apptId,
      trigger:     rule.trigger_type,
      type:        'engine_alert',
      scheduledAt: scheduledAt.toISOString(),
      executed:    false,
      payload:     { title: _svc().renderTemplate(rule.alert_title, vars), alertType: rule.alert_type },
    })
    try { localStorage.setItem('clinicai_automations_queue', JSON.stringify(q)) } catch (e) { /* quota */ }
  }

  // ── Task: create operational task ──────────────────────────
  function _createTask(title, assignee, priority, deadlineHours, appt) {
    var tasks = JSON.parse(localStorage.getItem('clinic_op_tasks') || '[]')
    tasks.push({
      id:          'task_auto_' + Date.now(),
      tipo:        'automacao',
      titulo:      title,
      descricao:   '',
      responsavel: assignee || 'sdr',
      status:      'pendente',
      prioridade:  priority || 'normal',
      prazo:       deadlineHours ? new Date(Date.now() + deadlineHours * 3600000).toISOString() : null,
      apptId:      appt ? appt.id : null,
      pacienteNome: appt ? appt.pacienteNome : '',
      createdAt:   new Date().toISOString(),
    })
    try { localStorage.setItem('clinic_op_tasks', JSON.stringify(tasks)) } catch (e) { /* quota */ }
  }

  // ── Task: scheduled (future) ───────────────────────────────
  function _scheduleTask(rule, vars, scheduledAt, apptId) {
    var q = JSON.parse(localStorage.getItem('clinicai_automations_queue') || '[]')
    q.push({
      id:          'aut_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      apptId:      apptId,
      trigger:     rule.trigger_type,
      type:        'engine_task',
      scheduledAt: scheduledAt.toISOString(),
      executed:    false,
      payload:     { title: _svc().renderTemplate(rule.task_title, vars), assignee: rule.task_assignee, priority: rule.task_priority, deadlineHours: rule.task_deadline_hours },
    })
    try { localStorage.setItem('clinicai_automations_queue', JSON.stringify(q)) } catch (e) { /* quota */ }
  }

  // ── Helpers ────────────────────────────────────────────────
  function _channelIncludes(channel, type) {
    if (!channel) return false
    if (channel === type) return true
    if (channel === 'both') return type === 'whatsapp' || type === 'alert'
    if (channel === 'all') return true
    if (channel === 'whatsapp_alert') return type === 'whatsapp' || type === 'alert'
    if (channel === 'whatsapp_task') return type === 'whatsapp' || type === 'task'
    if (channel === 'alert_task') return type === 'alert' || type === 'task'
    return false
  }

  function _calcScheduledAt(rule, appointmentDate) {
    var cfg = rule.trigger_config || {}
    var d

    switch (rule.trigger_type) {
      case 'd_before':
        d = new Date(appointmentDate)
        d.setDate(d.getDate() - (cfg.days || 1))
        d.setHours(cfg.hour || 10, cfg.minute || 0, 0, 0)
        return d

      case 'd_zero':
        d = new Date(appointmentDate)
        d.setHours(cfg.hour || 8, cfg.minute || 0, 0, 0)
        return d

      case 'min_before':
        d = new Date(appointmentDate)
        d.setMinutes(d.getMinutes() - (cfg.minutes || 30))
        return d

      default:
        return null
    }
  }

  // ── Public API ─────────────────────────────────────────────
  window.AutomationsEngine = Object.freeze({
    processAppointment:  processAppointment,
    processStatusChange: processStatusChange,
    processFinalize:     processFinalize,
    processTag:          processTag,
  })
})()
