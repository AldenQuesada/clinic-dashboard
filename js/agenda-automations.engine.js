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

      // Alexa: schedule announcement
      if (_channelIncludes(rule.channel, 'alexa') && rule.alexa_message) {
        _scheduleAlexa(rule, vars, scheduledAt, appt)
      }
    })

    // Campanha por fase — NAO disparar aqui.
    // A confirmacao ja e enviada por _enviarMsgAgendamento() no modal.
    // Campanhas disparam via processStatusChange() quando o status muda.
  }

  // ══════════════════════════════════════════════════════════
  //  ENTRY POINT 2: processStatusChange
  //  Called from apptTransition() when status changes.
  //  Handles: on_status rules
  // ══════════════════════════════════════════════════════════
  async function processStatusChange(appt, newStatus) {
    await _ensureLoaded()
    var svc = _svc()

    // 1. Regras manuais de automacao (existentes)
    if (svc) {
      var rules = svc.getByStatus(newStatus)
      var phone = (_getPhone(appt) || '').replace(/\D/g, '')
      var vars = _apptVars(appt)
      vars.status = newStatus
      rules.forEach(function (rule) {
        _executeRule(rule, vars, phone, appt)
      })
    }

    // 2. Campanha por fase: busca templates vinculados a esta fase
    _enqueueCampaignForPhase(appt, newStatus)
  }

  async function _enqueueCampaignForPhase(appt, phase) {
    if (!window._sbShared) return
    var phone = (_getPhone(appt) || '').replace(/\D/g, '')
    if (!phone) return

    // Normalizar: "Agendado" → "agendado", "Na Clinica" → "na_clinica"
    var phaseSlug = (phase || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (!phaseSlug) return

    try {
      var res = await window._sbShared.rpc('wa_templates_for_phase', { p_phase: phaseSlug })
      if (res.error || !res.data) return
      var templates = Array.isArray(res.data) ? res.data : []
      if (!templates.length) return

      var vars = _apptVars(appt)
      var _cfg = {}; try { _cfg = JSON.parse(localStorage.getItem('clinicai_clinic_settings') || '{}') } catch(e) {}
      var _end = [_cfg.rua, _cfg.num].filter(Boolean).join(', ')
      if (_cfg.comp) _end += ' - ' + _cfg.comp
      if (_cfg.cidade) _end += ' - ' + _cfg.cidade
      vars.endereco = _end || ''
      vars.endereco_clinica = _end || ''
      vars.link_maps = _cfg.maps || ''
      vars.menu_clinica = (window.location.origin || '') + '/menu-clinica.html'
      vars.link = _cfg.site || ''

      var apptDate = appt.data ? new Date(appt.data + 'T00:00:00') : null
      if (!apptDate || isNaN(apptDate.getTime())) return
      var now = new Date()
      templates.forEach(function (tpl) {
        var content = (tpl.content || '').replace(/\{(\w+)\}/g, function (_, k) {
          return vars[k] != null ? String(vars[k]) : ''
        })
        if (!content.trim()) return

        var days = parseInt(tpl.day) || 0
        var hours = parseInt(tpl.delay_hours) || 0
        var mins = parseInt(tpl.delay_minutes) || 0
        var scheduledAt = new Date(apptDate)
        scheduledAt.setDate(scheduledAt.getDate() + days)
        scheduledAt.setHours(hours, mins, 0, 0)

        if (scheduledAt.getTime() <= now.getTime()) return

        _enqueueWA(phone, content, appt, scheduledAt, 'campaign:' + phaseSlug + ':' + (tpl.slug || tpl.name))
      })

      if (templates.length && window._showToast) {
        _showToast('Campanha disparada', templates.length + ' mensagen' + (templates.length > 1 ? 's' : '') + ' agendada' + (templates.length > 1 ? 's' : '') + ' para "' + phaseSlug + '"', 'info')
      }
    } catch (e) {
      console.error('[Engine] campanha fase erro:', e)
    }
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

    // Alexa
    if (_channelIncludes(rule.channel, 'alexa') && rule.alexa_message) {
      var alexaMsg = svc.renderTemplate(rule.alexa_message, vars)
      _fireAlexa(alexaMsg, rule.alexa_target, appt, rule.name)
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
    try { localStorage.setItem('clinic_op_tasks', JSON.stringify(tasks)); if (window.sbSave) sbSave('clinic_op_tasks', tasks) } catch (e) { /* quota */ }
  }

  // ── Alexa: scheduled (client-side queue) ────────────────────
  function _scheduleAlexa(rule, vars, scheduledAt, appt) {
    var q = JSON.parse(localStorage.getItem('clinicai_automations_queue') || '[]')
    q.push({
      id:          'aut_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      apptId:      appt ? appt.id : null,
      trigger:     rule.trigger_type,
      type:        'engine_alexa',
      scheduledAt: scheduledAt.toISOString(),
      executed:    false,
      payload:     {
        message:    _svc().renderTemplate(rule.alexa_message, vars),
        target:     rule.alexa_target || 'sala',
        ruleName:   rule.name,
        appt:       appt ? { pacienteNome: appt.pacienteNome, profissionalNome: appt.profissionalNome, salaIdx: appt.salaIdx, profissionalIdx: appt.profissionalIdx } : null,
      },
    })
    try { localStorage.setItem('clinicai_automations_queue', JSON.stringify(q)) } catch (e) { /* quota */ }
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
    if (channel === 'whatsapp_alexa') return type === 'whatsapp' || type === 'alexa'
    if (channel === 'alert_task') return type === 'alert' || type === 'task'
    if (channel === 'alert_alexa') return type === 'alert' || type === 'alexa'
    return false
  }

  // ── Alexa: announce via webhook ─────────────────────────────
  async function _fireAlexa(message, target, appt, ruleName) {
    if (!window.AlexaNotificationService) {
      console.warn('[Engine] AlexaNotificationService nao disponivel para:', ruleName)
      return
    }

    var config = await AlexaNotificationService.getConfig()
    if (!config || !config.is_active || !config.webhook_url) {
      console.log('[Engine] Alexa desativada ou sem config')
      return
    }

    // Resolve target devices
    var devices = []
    if (window.AlexaDevicesRepository) {
      var res = await AlexaDevicesRepository.getAll()
      if (res.ok) devices = res.data || []
    }

    var targetDevices = []
    var targetType = target || 'sala'

    if (targetType === 'recepcao') {
      targetDevices = devices.filter(function(d) {
        var loc = (d.location_label || '').toLowerCase()
        return d.is_active && (loc.indexOf('recepc') >= 0 || loc.indexOf('recepç') >= 0)
      })
      // Fallback: usar reception_device_name da config global
      if (!targetDevices.length && config.reception_device_name) {
        targetDevices = [{ device_name: config.reception_device_name }]
      }
    } else if (targetType === 'sala') {
      // Buscar device vinculado a sala do appointment
      var rooms = typeof getRooms === 'function' ? getRooms() : []
      var room = null
      if (appt && appt.salaIdx !== undefined && appt.salaIdx !== null && rooms[appt.salaIdx]) {
        room = rooms[appt.salaIdx]
      }
      if (room) {
        targetDevices = devices.filter(function(d) { return d.is_active && d.room_id === room.id })
        // Fallback: usar alexa_device_name da sala
        if (!targetDevices.length && room.alexa_device_name) {
          targetDevices = [{ device_name: room.alexa_device_name }]
        }
      }
    } else if (targetType === 'profissional') {
      // Buscar device vinculado ao profissional
      var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
      var prof = appt && appt.profissionalIdx !== undefined ? profs[appt.profissionalIdx] : null
      if (prof) {
        targetDevices = devices.filter(function(d) { return d.is_active && d.professional_id === prof.id })
      }
    } else if (targetType === 'todos') {
      targetDevices = devices.filter(function(d) { return d.is_active })
    } else {
      // UUID de device especifico
      var specific = devices.find(function(d) { return d.id === targetType })
      if (specific) targetDevices = [specific]
    }

    // Enviar sequencialmente com delay (rate limit) e retry
    var headers = { 'Content-Type': 'application/json' }
    if (config.auth_token) headers['Authorization'] = 'Bearer ' + config.auth_token

    var sent = 0, failed = 0, cookieExpired = false

    for (var di = 0; di < targetDevices.length; di++) {
      var device = targetDevices[di]
      var payload = {
        device:   device.device_name,
        message:  message,
        type:     'announce',
      }

      // Retry com backoff (3 tentativas)
      var ok = false
      for (var attempt = 1; attempt <= 3; attempt++) {
        try {
          var r = await fetch(config.webhook_url, {
            method: 'POST', headers: headers, body: JSON.stringify(payload),
          })
          if (r.ok) { ok = true; break }
          var body = null
          try { body = await r.json() } catch (e) { /* ignore */ }
          if (body && body.code === 'COOKIE_EXPIRED') { cookieExpired = true; break }
          if (r.status === 429 || r.status >= 500) {
            await new Promise(function(res) { setTimeout(res, attempt * 2000) })
            continue
          }
          break // 4xx — nao retenta
        } catch (e) {
          if (attempt < 3) { await new Promise(function(res) { setTimeout(res, attempt * 2000) }); continue }
        }
      }

      if (ok) { sent++; console.log('[Engine] Alexa OK:', device.device_name, ruleName) }
      else { failed++; console.error('[Engine] Alexa falhou:', device.device_name, ruleName) }

      // Rate limit: 2s entre devices
      if (di < targetDevices.length - 1) await new Promise(function(res) { setTimeout(res, 2000) })
    }

    // Toast honesto
    if (window._showToast) {
      if (cookieExpired) {
        _showToast('Alexa', 'Cookie expirado! Re-autenticar no bridge.', 'error')
      } else if (sent > 0 && failed === 0) {
        _showToast('Alexa', ruleName + ': ' + sent + ' device(s) OK', 'success')
      } else if (sent > 0 && failed > 0) {
        _showToast('Alexa', ruleName + ': ' + sent + ' OK, ' + failed + ' falhou', 'warning')
      } else if (failed > 0) {
        _showToast('Alexa', ruleName + ': falhou em ' + failed + ' device(s)', 'error')
      }
    }
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

  // ── Camada 2: dispatch para lead phase changes ─────────────
  async function dispatchCampaignForLead(leadId, phase, leadName, leadPhone) {
    if (!window._sbShared || !leadPhone) return
    var phaseSlug = (phase || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (!phaseSlug) return

    var phone = leadPhone.replace(/\D/g, '')
    if (!phone) return

    try {
      var res = await window._sbShared.rpc('wa_templates_for_phase', { p_phase: phaseSlug })
      if (res.error || !res.data) return
      var templates = Array.isArray(res.data) ? res.data : []
      if (!templates.length) return

      var clinica = window._getClinicaNome ? _getClinicaNome() : 'Clinica'
      var _cfg = {}; try { _cfg = JSON.parse(localStorage.getItem('clinicai_clinic_settings') || '{}') } catch(e) {}
      var _end = [_cfg.rua, _cfg.num].filter(Boolean).join(', ')
      if (_cfg.comp) _end += ' - ' + _cfg.comp
      if (_cfg.cidade) _end += ' - ' + _cfg.cidade

      var vars = {
        nome: leadName || 'Paciente',
        clinica: clinica,
        endereco: _end || '',
        endereco_clinica: _end || '',
        link_maps: _cfg.maps || '',
        menu_clinica: (window.location.origin || '') + '/menu-clinica.html',
        link: _cfg.site || '',
        data: '', hora: '', profissional: '', procedimento: '',
        linha_procedimento: '', link_anamnese: '', valor: '',
      }

      var now = new Date()
      var fakeAppt = { id: 'lead_' + leadId, pacienteId: leadId, pacienteNome: leadName || '' }

      templates.forEach(function (tpl) {
        var content = (tpl.content || '').replace(/\{(\w+)\}/g, function (_, k) {
          return vars[k] != null ? String(vars[k]) : ''
        })
        if (!content.trim()) return

        var scheduledAt = new Date(now)
        scheduledAt.setDate(scheduledAt.getDate() + (parseInt(tpl.day) || 0))
        scheduledAt.setHours(scheduledAt.getHours() + (parseInt(tpl.delay_hours) || 0))
        scheduledAt.setMinutes(scheduledAt.getMinutes() + (parseInt(tpl.delay_minutes) || 0))

        _enqueueWA(phone, content, fakeAppt, scheduledAt, 'campaign:lead:' + phaseSlug + ':' + (tpl.slug || ''))
      })

      if (templates.length && window._showToast) {
        _showToast('Campanha', templates.length + ' msg para "' + phaseSlug + '"', 'info')
      }
    } catch (e) {
      console.error('[Engine] campanha lead erro:', e)
    }
  }

  // ── Camada 3: dispatch para tag application ───────────────
  async function dispatchCampaignForTag(entityId, entityType, tagSlug, vars) {
    if (!window._sbShared) return
    var phaseSlug = (tagSlug || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (!phaseSlug) return

    // Buscar telefone do lead
    var phone = ''
    if (vars && vars.phone) {
      phone = vars.phone
    } else if (window.LeadsService) {
      var leads = LeadsService.getLocal()
      var lead = leads.find(function(l) { return l.id === entityId })
      if (lead) phone = lead.phone || lead.whatsapp || ''
    }
    phone = (phone || '').replace(/\D/g, '')
    if (!phone) return

    try {
      var res = await window._sbShared.rpc('wa_templates_for_phase', { p_phase: phaseSlug })
      if (res.error || !res.data) return
      var templates = Array.isArray(res.data) ? res.data : []
      if (!templates.length) return

      var leadName = (vars && vars.nome) || 'Paciente'
      var fakeAppt = { id: 'tag_' + entityId, pacienteId: entityId, pacienteNome: leadName }

      var clinica = window._getClinicaNome ? _getClinicaNome() : 'Clinica'
      var tplVars = Object.assign({
        nome: leadName, clinica: clinica,
        data: '', hora: '', profissional: '', procedimento: '',
      }, vars || {})

      var now = new Date()
      templates.forEach(function (tpl) {
        var content = (tpl.content || '').replace(/\{(\w+)\}/g, function (_, k) {
          return tplVars[k] != null ? String(tplVars[k]) : ''
        })
        if (!content.trim()) return

        var scheduledAt = new Date(now)
        scheduledAt.setDate(scheduledAt.getDate() + (parseInt(tpl.day) || 0))
        scheduledAt.setHours(scheduledAt.getHours() + (parseInt(tpl.delay_hours) || 0))
        scheduledAt.setMinutes(scheduledAt.getMinutes() + (parseInt(tpl.delay_minutes) || 0))

        _enqueueWA(phone, content, fakeAppt, scheduledAt, 'campaign:tag:' + phaseSlug + ':' + (tpl.slug || ''))
      })
    } catch (e) {
      console.error('[Engine] campanha tag erro:', e)
    }
  }

  // ── Public API ─────────────────────────────────────────────
  window.AutomationsEngine = Object.freeze({
    processAppointment:       processAppointment,
    processStatusChange:      processStatusChange,
    processFinalize:          processFinalize,
    processTag:               processTag,
    dispatchCampaignForLead:  dispatchCampaignForLead,
    dispatchCampaignForTag:   dispatchCampaignForTag,
  })
})()
