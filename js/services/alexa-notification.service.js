/**
 * ClinicAI — Alexa Notification Service
 *
 * Envia notificacoes para dispositivos Alexa quando paciente chega na clinica.
 *
 * Fluxo:
 *   1. Secretaria marca "Na Clinica" → apptTransition('na_clinica')
 *   2. Este servico envia webhook para n8n com dados do appointment
 *   3. n8n faz announce nas Alexas:
 *      - Recepcao: boas-vindas ao paciente
 *      - Sala do profissional: aviso de chegada
 *
 * Config: clinic_alexa_config (Supabase) via get_alexa_config RPC
 * Rooms: clinic_rooms.alexa_device_name
 *
 * Depende de:
 *   window._sbShared  — Supabase client
 *   getRooms()        — rooms cache
 */
;(function () {
  'use strict'

  if (window._clinicaiAlexaServiceLoaded) return
  window._clinicaiAlexaServiceLoaded = true

  var _config = null
  var _configLoaded = false

  // ── Load config from Supabase ──────────────────────────────
  async function _ensureConfig() {
    if (_configLoaded) return _config
    _configLoaded = true

    if (!window._sbShared) return null

    try {
      var res = await window._sbShared.rpc('get_alexa_config', {})
      if (res.data && res.data.ok && res.data.data) {
        _config = res.data.data
      }
    } catch (e) {
      console.warn('[Alexa] Falha ao carregar config:', e)
    }
    return _config
  }

  // ── Render template with variables ─────────────────────────
  function _render(template, vars) {
    if (!template) return ''
    return template.replace(/\{\{(\w+)\}\}/g, function (_, key) {
      return vars[key] || ''
    })
  }

  // ── Get room info for appointment ──────────────────────────
  function _getRoomForAppt(appt) {
    var rooms = typeof getRooms === 'function' ? getRooms() : []
    if (appt.salaIdx !== null && appt.salaIdx !== undefined && rooms[appt.salaIdx]) {
      return rooms[appt.salaIdx]
    }
    // Fallback: buscar pela profissional
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var prof = profs[appt.profissionalIdx]
    if (prof) {
      for (var i = 0; i < rooms.length; i++) {
        if (prof.sala_id === rooms[i].id || prof.sala === rooms[i].nome) {
          return rooms[i]
        }
      }
    }
    return null
  }

  // ══════════════════════════════════════════════════════════
  //  MAIN: notifyArrival
  //  Chamado quando paciente chega (status → na_clinica)
  // ══════════════════════════════════════════════════════════
  async function notifyArrival(appt) {
    var config = await _ensureConfig()
    if (!config || !config.is_active || !config.webhook_url) {
      console.log('[Alexa] Notificacao desativada ou sem config')
      return
    }

    var room = _getRoomForAppt(appt)
    var roomDeviceName = room ? room.alexa_device_name : null
    var roomNome = room ? room.nome : 'Sala'

    var vars = {
      nome:         appt.pacienteNome || 'Paciente',
      profissional: appt.profissionalNome || '',
      procedimento: appt.procedimento || appt.tipoConsulta || '',
      sala:         roomNome,
      hora:         appt.horaInicio || '',
    }

    var welcomeMsg = _render(config.welcome_template, vars)
    var roomMsg = _render(config.room_template, vars)

    var payload = {
      event:                'patient_arrived',
      patient_name:         vars.nome,
      professional_name:    vars.profissional,
      procedure:            vars.procedimento,
      room_name:            roomNome,
      appointment_time:     vars.hora,
      reception_device:     config.reception_device_name || 'Recepcao',
      room_device:          roomDeviceName,
      welcome_message:      welcomeMsg,
      room_message:         roomMsg,
      timestamp:            new Date().toISOString(),
    }

    try {
      var response = await fetch(config.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        console.error('[Alexa] Webhook falhou:', response.status, response.statusText)
        return
      }

      console.log('[Alexa] Notificacao enviada:', vars.nome, '→', roomNome)

      // Toast visual no dashboard
      if (window._showToast) {
        _showToast('Alexa', 'Boas-vindas enviada para ' + vars.nome, 'success')
      }
    } catch (e) {
      console.error('[Alexa] Erro ao enviar webhook:', e)
    }
  }

  // ══════════════════════════════════════════════════════════
  //  CONFIG MANAGEMENT
  // ══════════════════════════════════════════════════════════

  async function saveConfig(webhookUrl, receptionDevice, welcomeTemplate, roomTemplate, isActive) {
    if (!window._sbShared) return { ok: false, error: 'Supabase nao disponivel' }

    try {
      var res = await window._sbShared.rpc('upsert_alexa_config', {
        p_webhook_url:           webhookUrl,
        p_reception_device_name: receptionDevice || 'Recepcao',
        p_welcome_template:      welcomeTemplate || null,
        p_room_template:         roomTemplate || null,
        p_is_active:             isActive !== false,
      })

      if (res.error) return { ok: false, error: res.error.message }

      // Refresh cache
      _configLoaded = false
      await _ensureConfig()

      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  async function getConfig() {
    return _ensureConfig()
  }

  function invalidateCache() {
    _configLoaded = false
    _config = null
  }

  // ── Public API ─────────────────────────────────────────────
  window.AlexaNotificationService = Object.freeze({
    notifyArrival:   notifyArrival,
    saveConfig:      saveConfig,
    getConfig:       getConfig,
    invalidateCache: invalidateCache,
  })
})()
