/**
 * VPI Embaixadora - Badges Grid
 *
 * Renderiza grid 4xN (2 em mobile <360) com todos badges do catalogo.
 * Desbloqueados usam .unlocked + badge animacao pulse gold se
 * unlocked_at < 24h. Bloqueados em greyscale + tooltip criterio.
 *
 * Expoe window.VPIEmbBadges.
 */
;(function () {
  'use strict'
  if (window._vpiEmbBadgesLoaded) return
  window._vpiEmbBadgesLoaded = true

  function _app() { return window.VPIEmbApp }
  function _sb()  { return window._sbShared || null }
  function _esc(s){ return _app() ? _app().esc(s) : (s == null ? '' : String(s)) }

  var _state = {
    catalog:  [],
    unlocked: [], // [{code, unlocked_at}]
    loaded:   false,
  }

  function _ico(name, sz) {
    sz = sz || 28
    if (window.feather && window.feather.icons && window.feather.icons[name]) {
      return window.feather.icons[name].toSvg({ width: sz, height: sz, 'stroke-width': 2 })
    }
    if (window.feather && window.feather.icons && window.feather.icons.award) {
      return window.feather.icons.award.toSvg({ width: sz, height: sz, 'stroke-width': 2 })
    }
    return ''
  }

  function _isRecent(iso) {
    if (!iso) return false
    var t = new Date(iso).getTime()
    if (isNaN(t)) return false
    return (Date.now() - t) < 24 * 3600 * 1000
  }

  function _renderGrid() {
    var slot = document.getElementById('vpi-badges-slot')
    if (!slot) return
    if (!_state.loaded) {
      slot.innerHTML = ''
      return
    }
    if (!_state.catalog.length) {
      slot.innerHTML = ''
      return
    }

    var unlockedMap = {}
    _state.unlocked.forEach(function (u) { unlockedMap[u.code] = u.unlocked_at })

    var items = _state.catalog.map(function (c) {
      var at = unlockedMap[c.code]
      var unlocked = !!at
      var recent = unlocked && _isRecent(at)
      var cls = 'vpi-badge ' + (unlocked ? 'unlocked' : 'locked') + (recent ? ' recent' : '')
      var tooltip = c.criterio_descricao || c.descricao || ''
      return '<div class="' + cls + '" tabindex="0" aria-label="' + _esc(c.nome) + '">' +
        _ico(c.icone || 'award', 28) +
        '<div class="label">' + _esc(c.nome) + '</div>' +
        (tooltip ? '<div class="vpi-badge-tooltip">' + _esc(tooltip) + '</div>' : '') +
      '</div>'
    }).join('')

    slot.innerHTML =
      '<div class="vpi-section">' +
        '<div class="vpi-section-title">Conquistas</div>' +
        '<div class="vpi-section-sub">' +
          _state.unlocked.length + ' de ' + _state.catalog.length + ' desbloqueados' +
        '</div>' +
        '<div class="vpi-badges-grid">' + items + '</div>' +
      '</div>'

    slot.querySelectorAll('.vpi-badge').forEach(function (el) {
      el.addEventListener('click', function () {
        slot.querySelectorAll('.vpi-badge.show-tip').forEach(function (x) {
          if (x !== el) x.classList.remove('show-tip')
        })
        el.classList.toggle('show-tip')
      })
    })

    if (window.feather && window.feather.replace) {
      try { window.feather.replace() } catch (_) {}
    }
  }

  async function _fetch() {
    var sb = _sb()
    var token = _app() ? _app().getToken() : null
    if (!sb || !token) return

    try {
      var r = await sb.rpc('vpi_pub_get_badges', { p_token: token })
      if (r.error) { console.warn('[VPIEmbBadges] rpc error:', r.error.message); return }
      var d = r.data || {}
      if (d.error) return
      _state.catalog  = d.catalog  || []
      _state.unlocked = d.unlocked || []
      _state.loaded   = true
      _renderGrid()
    } catch (e) {
      console.warn('[VPIEmbBadges] fetch fail:', e && e.message)
    }
  }

  // Usado pelo realtime quando um novo badge e detectado
  function addUnlocked(code, unlockedAt) {
    if (!code) return
    if (_state.unlocked.find(function (u) { return u.code === code })) return
    _state.unlocked.push({ code: code, unlocked_at: unlockedAt || new Date().toISOString() })
    _renderGrid()
    try {
      var meta = _state.catalog.find(function (c) { return c.code === code })
      if (meta && _app()) _app().toast('Novo badge: ' + meta.nome)
    } catch (_) {}
  }

  async function init() {
    // Espera estrutura do cartao estar no DOM
    var tries = 0
    var wait = setInterval(function () {
      tries++
      if (document.getElementById('vpi-badges-slot') || tries > 20) {
        clearInterval(wait)
        _fetch()
      }
    }, 120)
  }

  function refresh() { return _fetch() }

  // Re-render quando cartao virar reenderizado
  window.addEventListener('vpi-emb-rendered', function () {
    if (_state.loaded) _renderGrid()
    else _fetch()
  })

  window.VPIEmbBadges = {
    init:    init,
    refresh: refresh,
    addUnlocked: addUnlocked,
    getState: function () { return _state },
  }
})()
