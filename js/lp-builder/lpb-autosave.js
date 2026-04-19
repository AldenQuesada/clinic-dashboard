/**
 * LP Builder · Autosave
 *
 * Salva automaticamente a cada N segundos se a pagina esta dirty
 * E o usuario nao esta digitando no momento (debounce 5s desde
 * ultimo input).
 *
 * Toggle on/off via localStorage (lpb_autosave_enabled).
 * Insere indicador no topbar via lpb:autosave-status event.
 */
;(function () {
  'use strict'
  if (window.LPBAutosave) return

  var INTERVAL_MS    = 8  * 1000  // checa a cada 8s (era 30s · feedback rápido)
  var DEBOUNCE_MS    = 1500       // espera 1.5s sem typing antes de salvar (era 5s)
  var STORAGE_KEY    = 'lpb_autosave_enabled'

  var _enabled = _readEnabled()
  var _lastInputAt = 0
  var _lastSaveAt  = null
  var _timer = null
  var _typingTimer = null

  function _readEnabled() {
    try {
      var v = localStorage.getItem(STORAGE_KEY)
      return v === null ? true : (v === '1')
    } catch (_) { return true }
  }

  function _writeEnabled(v) {
    _enabled = !!v
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch (_) {}
  }

  function _emit(status, extra) {
    document.body.dispatchEvent(new CustomEvent('lpb:autosave-status', {
      detail: Object.assign({ status: status, enabled: _enabled, lastSaveAt: _lastSaveAt }, extra || {})
    }))
  }

  // ────────────────────────────────────────────────────────────
  // Tick: roda a cada INTERVAL_MS
  // ────────────────────────────────────────────────────────────
  async function _tick() {
    if (!_enabled) return
    if (LPBuilder.getView() !== 'editor') return
    if (!LPBuilder.isDirty()) return
    if (LPBuilder.isSaving()) return
    // se digitou ha menos de DEBOUNCE_MS, espera proximo tick
    if (Date.now() - _lastInputAt < DEBOUNCE_MS) return

    try {
      _emit('saving')
      await LPBuilder.savePage()
      _lastSaveAt = new Date()
      _emit('saved')
    } catch (e) {
      _emit('error', { message: e.message })
    }
  }

  function _start() {
    if (_timer) clearInterval(_timer)
    _timer = setInterval(_tick, INTERVAL_MS)
  }
  function _stop() {
    if (_timer) clearInterval(_timer)
    _timer = null
  }

  // detecta typing globalmente
  function _onInput() {
    _lastInputAt = Date.now()
  }

  // ────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────
  function isEnabled() { return _enabled }

  function toggle(v) {
    var next = (typeof v === 'boolean') ? v : !_enabled
    _writeEnabled(next)
    _emit(next ? 'enabled' : 'disabled')
    if (LPBToast) LPBToast(next ? 'Auto-salvamento ativado' : 'Auto-salvamento pausado',
                           next ? 'success' : 'error')
  }

  function getLastSaveAt() { return _lastSaveAt }

  // ────────────────────────────────────────────────────────────
  // Init
  // ────────────────────────────────────────────────────────────
  function init() {
    document.addEventListener('input',    _onInput, true)
    document.addEventListener('keypress', _onInput, true)
    _start()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  // pausa em background tab pra nao bater no banco
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      // Antes de pausar, força um save se dirty (cobre caso user troca aba)
      if (_enabled && LPBuilder.isDirty && LPBuilder.isDirty() && !LPBuilder.isSaving()) {
        try { LPBuilder.savePage() } catch (_) {}
      }
      _stop()
    } else {
      _start()
    }
  })

  // Defesa final: ao sair da página, salva se houver mudanças
  window.addEventListener('beforeunload', function () {
    if (_enabled && LPBuilder.isDirty && LPBuilder.isDirty() && !LPBuilder.isSaving()) {
      try { LPBuilder.savePage() } catch (_) {}
    }
  })

  window.LPBAutosave = {
    isEnabled: isEnabled,
    toggle: toggle,
    getLastSaveAt: getLastSaveAt,
  }
})()
