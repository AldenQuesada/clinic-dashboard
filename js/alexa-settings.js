/**
 * ClinicAI — Alexa Settings UI
 *
 * Carrega/salva configuracao de integracao Alexa na aba Settings > Alexa.
 * Usa AlexaNotificationService para persistencia.
 *
 * Depende de:
 *   AlexaNotificationService — CRUD de config
 *   clinicSection()          — troca de aba
 */
;(function () {
  'use strict'

  if (window._clinicaiAlexaSettingsLoaded) return
  window._clinicaiAlexaSettingsLoaded = true

  window._alexaConfigDirty = false

  // ── Load config into form ──────────────────────────────────
  async function loadAlexaConfig() {
    if (!window.AlexaNotificationService) return
    var cfg = await AlexaNotificationService.getConfig()
    if (!cfg) return

    var el = function (id) { return document.getElementById(id) }
    if (el('sc_alexa_active'))    el('sc_alexa_active').checked = cfg.is_active !== false
    if (el('sc_alexa_webhook'))   el('sc_alexa_webhook').value  = cfg.webhook_url || ''
    if (el('sc_alexa_reception')) el('sc_alexa_reception').value = cfg.reception_device_name || 'Recepcao'
    if (el('sc_alexa_welcome'))   el('sc_alexa_welcome').value  = cfg.welcome_template || ''
    if (el('sc_alexa_room_msg'))  el('sc_alexa_room_msg').value = cfg.room_template || ''
    window._alexaConfigDirty = false
  }

  // ── Save config from form ──────────────────────────────────
  async function saveAlexaConfig() {
    if (!window.AlexaNotificationService) {
      if (window._showToast) _showToast('Alexa', 'Servico Alexa nao carregado', 'error')
      return
    }

    var webhookUrl      = (document.getElementById('sc_alexa_webhook')?.value || '').trim()
    var receptionDevice = (document.getElementById('sc_alexa_reception')?.value || '').trim() || 'Recepcao'
    var welcomeTemplate = (document.getElementById('sc_alexa_welcome')?.value || '').trim()
    var roomTemplate    = (document.getElementById('sc_alexa_room_msg')?.value || '').trim()
    var isActive        = document.getElementById('sc_alexa_active')?.checked !== false

    if (!webhookUrl) {
      if (window._showToast) _showToast('Alexa', 'Informe a URL do webhook n8n', 'warning')
      return
    }

    var res = await AlexaNotificationService.saveConfig(
      webhookUrl, receptionDevice, welcomeTemplate, roomTemplate, isActive
    )

    if (res.ok) {
      if (window._showToast) _showToast('Alexa', 'Configuracao salva com sucesso', 'success')
      window._alexaConfigDirty = false
    } else {
      if (window._showToast) _showToast('Alexa', 'Erro: ' + (res.error || 'desconhecido'), 'error')
    }
  }

  // ── Test notification ──────────────────────────────────────
  async function testAlexaNotification() {
    if (!window.AlexaNotificationService) {
      if (window._showToast) _showToast('Alexa', 'Servico Alexa nao carregado', 'error')
      return
    }

    var config = await AlexaNotificationService.getConfig()
    if (!config || !config.webhook_url) {
      if (window._showToast) _showToast('Alexa', 'Salve a configuracao primeiro', 'warning')
      return
    }

    // Simula uma chegada com dados de teste
    var testAppt = {
      id:               'test_' + Date.now(),
      pacienteNome:     'Maria Teste',
      profissionalNome: 'Dra. Mirian',
      profissionalIdx:  0,
      procedimento:     'Avaliacao',
      horaInicio:       new Date().toHours ? new Date().getHours() + ':' + String(new Date().getMinutes()).padStart(2, '0') : '14:00',
      salaIdx:          0,
    }

    await AlexaNotificationService.notifyArrival(testAppt)
    if (window._showToast) _showToast('Alexa', 'Notificacao de teste enviada', 'info')
  }

  // ── Auto-load when Alexa tab is shown ──────────────────────
  var _origClinicSection = window.clinicSection
  if (_origClinicSection) {
    window.clinicSection = function (sec) {
      _origClinicSection(sec)
      if (sec === 'alexa') loadAlexaConfig()
    }
  }

  // ── Expose ─────────────────────────────────────────────────
  window.saveAlexaConfig      = saveAlexaConfig
  window.testAlexaNotification = testAlexaNotification
  window.loadAlexaConfig      = loadAlexaConfig
})()
