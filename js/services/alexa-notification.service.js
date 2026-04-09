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

    var headers = { 'Content-Type': 'application/json' }
    if (config.auth_token) headers['Authorization'] = 'Bearer ' + config.auth_token

    var receptionDevice = config.reception_device_name || 'Echo Spot Recepção'
    var sent = 0

    try {
      // 1. Announce na recepcao (boas-vindas)
      if (welcomeMsg && receptionDevice) {
        var r1 = await fetch(config.webhook_url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ device: receptionDevice, message: welcomeMsg, type: 'announce' }),
        })
        if (r1.ok) { sent++; console.log('[Alexa] Recepcao OK:', receptionDevice) }
        else { console.error('[Alexa] Recepcao falhou:', r1.status) }
      }

      // 2. Announce na sala do profissional (aviso de chegada)
      if (roomMsg && roomDeviceName) {
        var r2 = await fetch(config.webhook_url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ device: roomDeviceName, message: roomMsg, type: 'announce' }),
        })
        if (r2.ok) { sent++; console.log('[Alexa] Sala OK:', roomDeviceName) }
        else { console.error('[Alexa] Sala falhou:', r2.status) }
      }

      if (sent > 0 && window._showToast) {
        _showToast('Alexa', 'Notificacao enviada para ' + vars.nome + ' (' + sent + ' dispositivo' + (sent > 1 ? 's' : '') + ')', 'success')
      }
    } catch (e) {
      console.error('[Alexa] Erro ao enviar:', e)
    }
  }

  // ══════════════════════════════════════════════════════════
  //  CONFIG MANAGEMENT
  // ══════════════════════════════════════════════════════════

  async function saveConfig(webhookUrl, receptionDevice, welcomeTemplate, roomTemplate, isActive, authToken) {
    if (!window._sbShared) return { ok: false, error: 'Supabase nao disponivel' }

    try {
      var res = await window._sbShared.rpc('upsert_alexa_config', {
        p_webhook_url:           webhookUrl,
        p_reception_device_name: receptionDevice || 'Recepcao',
        p_welcome_template:      welcomeTemplate || null,
        p_room_template:         roomTemplate || null,
        p_is_active:             isActive !== false,
        p_auth_token:            authToken || null,
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
