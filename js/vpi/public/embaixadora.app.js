/**
 * VPI Embaixadora - Bootstrap e Routing do Token
 *
 * Entrada publica da pagina de cartao. Le ?token=X, chama
 * vpi_pub_get_card(token) via Supabase anon, popula o state
 * e renderiza os modulos disponiveis (card, timeline, badges,
 * missao, realtime, shoutout, impact).
 *
 * Graceful fallback: se rede/Supabase falhar, tenta cache em
 * sessionStorage e exibe toast "offline".
 *
 * Expoe window.VPIEmbApp.
 */
;(function () {
  'use strict'
  if (window._vpiEmbAppLoaded) return
  window._vpiEmbAppLoaded = true

  var CACHE_KEY_PREFIX = 'vpi_emb_cache_'
  var CACHE_TTL_MS = 5 * 60 * 1000

  var _state = {
    token: null,
    data:  null,
    error: null,
    loading: true,
    lastFetch: 0,
    isOffline: false,
  }
  var _listeners = []

  function _sb() { return window._sbShared || null }

  function _getToken() {
    var url = new URL(window.location.href)
    return url.searchParams.get('token') || url.searchParams.get('t') || null
  }

  function _cacheGet(token) {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY_PREFIX + token)
      if (!raw) return null
      var obj = JSON.parse(raw)
      if (!obj || !obj.ts) return null
      return obj
    } catch (_) { return null }
  }
  function _cacheSet(token, data) {
    try {
      sessionStorage.setItem(CACHE_KEY_PREFIX + token, JSON.stringify({
        ts: Date.now(), data: data,
      }))
    } catch (_) { /* ignore quota */ }
  }

  function _initSupabase() {
    if (window._sbShared) return window._sbShared
    try {
      var url = window.ClinicEnv && window.ClinicEnv.SUPABASE_URL
      var key = window.ClinicEnv && window.ClinicEnv.SUPABASE_KEY
      if (!url || !key || !window.supabase) return null
      window._sbShared = window.supabase.createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      return window._sbShared
    } catch (e) {
      console.warn('[VPIEmbApp] supabase init fail:', e && e.message)
      return null
    }
  }

  async function _fetchCard(token) {
    var sb = _initSupabase()
    if (!sb) return { error: 'offline' }
    try {
      var res = await sb.rpc('vpi_pub_get_card', { p_token: token })
      if (res.error) return { error: res.error.message || 'rpc_error' }
      if (!res.data)  return { error: 'no_data' }
      if (res.data && res.data.error) return { error: res.data.error }
      return { data: res.data }
    } catch (e) {
      return { error: (e && e.message) || 'network' }
    }
  }

  function _setState(patch) {
    Object.keys(patch).forEach(function (k) { _state[k] = patch[k] })
    _listeners.forEach(function (fn) {
      try { fn(_state) } catch (e) { console.warn('[VPIEmbApp] listener:', e) }
    })
  }

  function onStateChange(fn) {
    if (typeof fn !== 'function') return function () {}
    _listeners.push(fn)
    return function off() {
      _listeners = _listeners.filter(function (x) { return x !== fn })
    }
  }

  function getState() { return _state }
  function getData()  { return _state.data }
  function getToken() { return _state.token }

  async function refresh() {
    var token = _state.token
    if (!token) return
    var r = await _fetchCard(token)
    if (r.data) {
      _cacheSet(token, r.data)
      _setState({ data: r.data, error: null, loading: false, lastFetch: Date.now(), isOffline: false })
    } else if (r.error) {
      var cached = _cacheGet(token)
      if (cached && cached.data) {
        _setState({ data: cached.data, error: null, loading: false, isOffline: true })
        _toast('Modo offline - atualizado ha ' + _minutesAgo(cached.ts) + 'min')
      } else {
        _setState({ error: r.error, loading: false, data: null })
      }
    }
  }

  function _minutesAgo(ts) {
    return Math.max(0, Math.floor((Date.now() - ts) / 60000))
  }

  function _toast(msg) {
    var el = document.createElement('div')
    el.className = 'vpi-toast'
    el.textContent = msg
    document.body.appendChild(el)
    requestAnimationFrame(function () { el.classList.add('show') })
    setTimeout(function () {
      el.classList.remove('show')
      setTimeout(function () { el.remove() }, 400)
    }, 3200)
  }

  async function boot() {
    var token = _getToken()
    if (!token) {
      _setState({ loading: false, error: 'missing_token' })
      _renderError('Link invalido', 'O endereco usado nao contem um token de cartao.')
      return
    }
    _setState({ token: token, loading: true })

    // 1) Tenta cache imediato para evitar flash
    var cached = _cacheGet(token)
    if (cached && cached.data) {
      _setState({ data: cached.data, loading: false })
    }

    // 2) Busca fresh do servidor
    await refresh()

    if (_state.error === 'not_found') {
      _renderError('Cartao nao encontrado', 'Este link expirou ou foi desativado. Fale com a clinica.')
      return
    }
    if (_state.error && !_state.data) {
      _renderError('Nao conseguimos carregar seu cartao', 'Verifique sua conexao e tente novamente.')
      return
    }

    _renderShell()

    // Modulos opcionais (Fase 2/3) - se carregados, inicializa
    try {
      if (window.VPIEmbMissoes && window.VPIEmbMissoes.init)      window.VPIEmbMissoes.init()
      if (window.VPIEmbBadges && window.VPIEmbBadges.init)        window.VPIEmbBadges.init()
      if (window.VPIEmbShoutout && window.VPIEmbShoutout.init)    window.VPIEmbShoutout.init()
      if (window.VPIEmbShare && window.VPIEmbShare.init)          window.VPIEmbShare.init()
      if (window.VPIEmbRealtime && window.VPIEmbRealtime.init)    window.VPIEmbRealtime.init()
    } catch (e) {
      console.warn('[VPIEmbApp] module init error:', e)
    }

    if (window.feather && window.feather.replace) {
      setTimeout(function () { try { window.feather.replace() } catch (_) {} }, 50)
    }
  }

  function _renderError(title, msg) {
    var root = document.getElementById('vpi-emb-root')
    if (!root) return
    root.innerHTML =
      '<div class="vpi-error">' +
        '<h2>' + _esc(title) + '</h2>' +
        '<p>' + _esc(msg) + '</p>' +
      '</div>'
  }

  function _renderShell() {
    // Delega render dos componentes aos seus modulos
    if (window.VPIEmbCard && window.VPIEmbCard.render) {
      window.VPIEmbCard.render()
    }
  }

  function _esc(s) {
    var d = document.createElement('div')
    d.textContent = s == null ? '' : String(s)
    return d.innerHTML
  }

  window.VPIEmbApp = {
    boot:          boot,
    refresh:       refresh,
    getState:      getState,
    getData:       getData,
    getToken:      getToken,
    onStateChange: onStateChange,
    toast:         _toast,
    esc:           _esc,
  }

  // Auto-boot no DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot() })
  } else {
    boot()
  }
})()
