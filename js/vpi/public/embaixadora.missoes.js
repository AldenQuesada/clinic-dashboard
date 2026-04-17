/**
 * VPI Embaixadora - Missao Atual (Card Pulsante)
 *
 * Card destaque abaixo do cartao principal, mostrando a missao
 * ativa (titulo + desc + progresso + recompensa + countdown).
 * Some se nao ha missao ativa ou valid_until expirou.
 *
 * Expoe window.VPIEmbMissoes.
 */
;(function () {
  'use strict'
  if (window._vpiEmbMissoesLoaded) return
  window._vpiEmbMissoesLoaded = true

  function _app() { return window.VPIEmbApp }
  function _sb()  { return window._sbShared || null }
  function _esc(s){ return _app() ? _app().esc(s) : (s == null ? '' : String(s)) }

  var _state = {
    missao: null,
    loaded: false,
  }
  var _countdownTimer = null

  function _ico(name, sz) {
    sz = sz || 14
    if (window.feather && window.feather.icons && window.feather.icons[name]) {
      return window.feather.icons[name].toSvg({ width: sz, height: sz, 'stroke-width': 2 })
    }
    return ''
  }

  function _fmtCountdown(validUntil) {
    if (!validUntil) return ''
    var end = new Date(validUntil).getTime()
    var now = Date.now()
    var ms = end - now
    if (ms <= 0) return 'Encerrada'
    var d = Math.floor(ms / 86400000)
    var h = Math.floor((ms % 86400000) / 3600000)
    var m = Math.floor((ms % 3600000) / 60000)
    if (d > 0) return d + 'd ' + h + 'h'
    if (h > 0) return h + 'h ' + m + 'min'
    return m + ' min'
  }

  function _render() {
    var slot = document.getElementById('vpi-missao-slot')
    if (!slot) return
    var m = _state.missao
    if (!m) { slot.innerHTML = ''; return }

    // Se a missao expirou, remove
    if (m.valid_until && new Date(m.valid_until).getTime() < Date.now()) {
      slot.innerHTML = ''
      return
    }

    var progresso = Math.max(0, m.progresso || 0)
    var target    = Math.max(1, m.target || 1)
    var pct       = Math.min(100, (progresso / target) * 100)
    var completed = m.completed || progresso >= target

    // Fase 9 Entrega 6: haptic + som quando missao recem-completou
    try {
      if (completed && _state._lastCompleted === false) {
        if (window.VPIEmbHaptic && window.VPIEmbHaptic.fire) {
          window.VPIEmbHaptic.fire('mission')
        }
      }
      _state._lastCompleted = completed
    } catch (_) {}

    slot.innerHTML =
      '<div class="vpi-missao-card ' + (completed ? 'completed' : '') + '">' +
        '<div class="vpi-missao-head">' +
          _ico('target', 14) +
          '<span class="kicker">Missao da Semana</span>' +
          (m.valid_until
            ? '<span class="vpi-missao-countdown" data-until="' + _esc(m.valid_until) + '">' +
                _fmtCountdown(m.valid_until) + ' restantes' +
              '</span>'
            : '') +
        '</div>' +
        '<h3 class="vpi-missao-title">' + _esc(m.titulo) + '</h3>' +
        '<div class="vpi-missao-desc">' + _esc(m.descricao) + '</div>' +
        '<div class="vpi-missao-progress">' +
          '<div class="vpi-missao-bar"><div class="fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
          '<span class="vpi-missao-count">' + progresso + ' / ' + target + '</span>' +
        '</div>' +
        (m.recompensa_texto
          ? '<div class="vpi-missao-reward">Recompensa: ' + _esc(m.recompensa_texto) + '</div>'
          : '') +
      '</div>'

    if (window.feather && window.feather.replace) {
      try { window.feather.replace() } catch (_) {}
    }

    _startCountdown()
  }

  function _startCountdown() {
    if (_countdownTimer) clearInterval(_countdownTimer)
    _countdownTimer = setInterval(function () {
      var el = document.querySelector('.vpi-missao-countdown')
      if (!el) { clearInterval(_countdownTimer); _countdownTimer = null; return }
      var until = el.getAttribute('data-until')
      if (!until) return
      var rem = _fmtCountdown(until)
      el.textContent = rem === 'Encerrada' ? 'Encerrada' : rem + ' restantes'
      if (new Date(until).getTime() < Date.now()) _render()
    }, 60000)
  }

  async function _fetch() {
    var sb = _sb()
    var token = _app() ? _app().getToken() : null
    if (!sb || !token) return

    try {
      var r = await sb.rpc('vpi_pub_get_missao_atual', { p_token: token })
      if (r.error) { console.warn('[VPIEmbMissoes] rpc error:', r.error.message); return }
      var d = r.data || {}
      if (d.error) return
      _state.missao = d.missao || null
      _state.loaded = true
      _render()
    } catch (e) {
      console.warn('[VPIEmbMissoes] fetch fail:', e && e.message)
    }
  }

  async function init() {
    var tries = 0
    var wait = setInterval(function () {
      tries++
      if (document.getElementById('vpi-missao-slot') || tries > 20) {
        clearInterval(wait)
        _fetch()
      }
    }, 120)
  }

  function refresh() { return _fetch() }

  window.addEventListener('vpi-emb-rendered', function () {
    if (_state.loaded) _render()
    else _fetch()
  })

  window.VPIEmbMissoes = {
    init:    init,
    refresh: refresh,
    getState: function () { return _state },
  }
})()
