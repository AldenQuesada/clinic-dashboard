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

  // Tracking de abertura (Fase 8 - Entrega 3)
  // Throttle por sessao: 1 registro por token por aba.
  function _trackCardOpen(token) {
    if (!token) return
    var key = 'vpi_tracked_' + token
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, String(Date.now()))
    } catch (_) { /* ignore private mode */ }

    var sb = _initSupabase()
    if (!sb) return
    // Fire-and-forget
    try {
      sb.rpc('vpi_pub_track_card_open', { p_token: token })
        .then(function () { /* silent ok */ })
        .catch(function (e) {
          // Silencioso — abertura e best-effort
          if (window.console && console.debug) console.debug('[VPIEmbApp] track open skip:', e && e.message)
        })
    } catch (_) { /* ignore */ }
  }

  // Tracking de attribution (Fase 9 - Entrega 1)
  // Gera/reusa session_id por aba e captura UTMs presentes na URL.
  // Dedup server-side por 2h.
  function _trackAttribution(token) {
    if (!token) return
    var sb = _initSupabase()
    if (!sb) return

    var sessionId
    try {
      sessionId = sessionStorage.getItem('vpi_attr_sid')
      if (!sessionId) {
        sessionId = 'sid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
        sessionStorage.setItem('vpi_attr_sid', sessionId)
      }
    } catch (_) {
      sessionId = 'sid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
    }

    var url = new URL(window.location.href)
    var utms = {
      source:   url.searchParams.get('utm_source')   || 'vpi',
      medium:   url.searchParams.get('utm_medium')   || 'partner_card',
      campaign: url.searchParams.get('utm_campaign') || 'referral',
      content:  url.searchParams.get('utm_content')  || null,
    }

    try {
      sb.rpc('vpi_pub_track_attribution', {
        p_token: token, p_session_id: sessionId, p_utm_params: utms,
      })
      .then(function () { /* silent ok */ })
      .catch(function (e) {
        if (window.console && console.debug) console.debug('[VPIEmbApp] track attr skip:', e && e.message)
      })
    } catch (_) { /* ignore */ }
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
        _toast('Modo offline — atualizado há ' + _minutesAgo(cached.ts) + 'min')
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
      _renderError('Link inválido', 'O endereço usado não contém um token de cartão.')
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

    // 2b) Registra abertura (throttle por sessao)
    if (_state.data && !_state.error) {
      _trackCardOpen(token)
      _trackAttribution(token)
    }

    if (_state.error === 'not_found') {
      _renderError('Cartão não encontrado', 'Este link expirou ou foi desativado. Fale com a clínica.')
      return
    }
    if (_state.error && !_state.data) {
      _renderError('Não conseguimos carregar seu cartão', 'Verifique sua conexão e tente novamente.')
      return
    }

    _renderShell()

    // Modulos opcionais (Fase 2/3) - se carregados, inicializa
    try {
      if (window.VPIEmbMissoes && window.VPIEmbMissoes.init)      window.VPIEmbMissoes.init()
      if (window.VPIEmbBadges && window.VPIEmbBadges.init)        window.VPIEmbBadges.init()
      if (window.VPIEmbIndicar && window.VPIEmbIndicar.init)      window.VPIEmbIndicar.init()
      if (window.VPIEmbShoutout && window.VPIEmbShoutout.init)    window.VPIEmbShoutout.init()
      if (window.VPIEmbImpact && window.VPIEmbImpact.init)        window.VPIEmbImpact.init()
      if (window.VPIEmbShare && window.VPIEmbShare.init)          window.VPIEmbShare.init()
      if (window.VPIEmbStory && window.VPIEmbStory.init)          window.VPIEmbStory.init()
      if (window.VPIEmbQR && window.VPIEmbQR.init)                window.VPIEmbQR.init()
      if (window.VPIEmbPonteiras && window.VPIEmbPonteiras.init)  window.VPIEmbPonteiras.init()
      if (window.VPIEmbLineage && window.VPIEmbLineage.init)      window.VPIEmbLineage.init()
      if (window.VPIEmbAttribution && window.VPIEmbAttribution.init) window.VPIEmbAttribution.init()
      if (window.VPIEmbChallenge && window.VPIEmbChallenge.init)   window.VPIEmbChallenge.init()
      if (window.VPIEmbEaster && window.VPIEmbEaster.init)         window.VPIEmbEaster.init()
      if (window.VPIEmbPalette && window.VPIEmbPalette.init)       window.VPIEmbPalette.init()
      if (window.VPIEmbMyImpact && window.VPIEmbMyImpact.init)     window.VPIEmbMyImpact.init()
      if (window.VPIEmbHaptic && window.VPIEmbHaptic.init)         window.VPIEmbHaptic.init()
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
