/**
 * ClinicAI — B2B Quick Search (Ctrl+K)
 *
 * Busca global em parcerias (nome, pillar, category, contact_name).
 * Palette-style command. Zero cruzamento com outros módulos.
 *
 * Atalhos:
 *   Ctrl+K (ou Cmd+K) — abre
 *   ESC — fecha
 *   ↑↓ — navega · Enter — abre detail
 *
 * Expõe window.B2BSearch.
 */
;(function () {
  'use strict'
  if (window.B2BSearch) return

  var _state = {
    open: false,
    query: '',
    items: [],
    filtered: [],
    loading: false,
    cursor: 0,
    loaded: false,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BRepository }

  function _normalize(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  function _filter() {
    var q = _normalize(_state.query).trim()
    if (!q) { _state.filtered = _state.items.slice(0, 30); return }
    _state.filtered = _state.items.filter(function (p) {
      var hay = _normalize(
        (p.name || '') + ' ' + (p.pillar || '') + ' ' + (p.category || '') +
        ' ' + (p.contact_name || '') + ' ' + (p.status || '')
      )
      return hay.indexOf(q) !== -1
    }).slice(0, 30)
  }

  var HEALTH_COLORS = { green:'#10B981', yellow:'#F59E0B', red:'#EF4444', unknown:'#9CA3AF' }

  function _renderResults() {
    if (_state.loading) return '<div class="b2b-search-empty">Carregando…</div>'
    if (!_state.filtered.length) {
      return _state.query
        ? '<div class="b2b-search-empty">Sem resultados para "' + _esc(_state.query) + '"</div>'
        : '<div class="b2b-search-empty">Digite pra buscar parcerias…</div>'
    }
    return '<ul class="b2b-search-list">' +
      _state.filtered.map(function (p, i) {
        var active = i === _state.cursor ? ' active' : ''
        var color = HEALTH_COLORS[p.health_color] || HEALTH_COLORS.unknown
        return '<li class="b2b-search-item' + active + '" data-idx="' + i + '" data-id="' + _esc(p.id) + '">' +
          '<span class="b2b-search-dot" style="background:' + color + '"></span>' +
          '<div class="b2b-search-body">' +
            '<div class="b2b-search-name">' + _esc(p.name) + '</div>' +
            '<div class="b2b-search-meta">' +
              _esc(p.pillar || 'outros') +
              (p.tier ? ' · Tier ' + p.tier : '') +
              ' · ' + _esc(p.status) +
              (p.contact_name ? ' · ' + _esc(p.contact_name) : '') +
            '</div>' +
          '</div>' +
        '</li>'
      }).join('') +
    '</ul>'
  }

  function _render() {
    var host = document.getElementById('b2bSearchHost')
    if (!host) {
      host = document.createElement('div')
      host.id = 'b2bSearchHost'
      document.body.appendChild(host)
    }
    if (!_state.open) { host.innerHTML = ''; return }

    host.innerHTML =
      '<div class="b2b-search-overlay" data-search-overlay>' +
        '<div class="b2b-search-modal">' +
          '<div class="b2b-search-input-wrap">' +
            '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
            '<input id="b2bSearchInput" type="text" value="' + _esc(_state.query) + '" placeholder="Buscar parceria por nome, pilar, responsável…" autocomplete="off">' +
            '<kbd>ESC</kbd>' +
          '</div>' +
          '<div class="b2b-search-results">' + _renderResults() + '</div>' +
          '<div class="b2b-search-footer">' +
            '<span><kbd>↑↓</kbd> navegar</span>' +
            '<span><kbd>enter</kbd> abrir</span>' +
            '<span><kbd>esc</kbd> fechar</span>' +
          '</div>' +
        '</div>' +
      '</div>'

    var ov = host.querySelector('[data-search-overlay]')
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) close() })

    var input = host.querySelector('#b2bSearchInput')
    if (input) {
      input.addEventListener('input', function (e) {
        _state.query = e.target.value
        _state.cursor = 0
        _filter()
        _rerenderResults()
      })
      setTimeout(function () { input.focus() }, 20)
    }

    host.querySelectorAll('[data-idx]').forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        _state.cursor = Number(el.getAttribute('data-idx'))
        _rerenderResults()
      })
      el.addEventListener('click', function () {
        _openResult(Number(el.getAttribute('data-idx')))
      })
    })
  }

  function _rerenderResults() {
    var r = document.querySelector('.b2b-search-results')
    if (r) r.innerHTML = _renderResults()
    // re-bind
    document.querySelectorAll('[data-idx]').forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        _state.cursor = Number(el.getAttribute('data-idx'))
        _rerenderResults()
      })
      el.addEventListener('click', function () {
        _openResult(Number(el.getAttribute('data-idx')))
      })
    })
  }

  function _openResult(idx) {
    var item = _state.filtered[idx]
    if (!item) return
    close()
    document.dispatchEvent(new CustomEvent('b2b:open-detail', { detail: { id: item.id } }))
  }

  async function _loadItems() {
    if (_state.loaded) return
    _state.loading = true
    try {
      var list = await _repo().list({})
      _state.items = list || []
      _state.loaded = true
      _filter()
    } catch (_) { _state.items = [] }
    finally { _state.loading = false }
  }

  function open() {
    _state.open = true
    _state.cursor = 0
    _render()
    _loadItems().then(function () { if (_state.open) _rerenderResults() })
  }
  function close() {
    _state.open = false
    _state.query = ''
    _render()
  }

  // Atalho global
  document.addEventListener('keydown', function (e) {
    var isMod = e.ctrlKey || e.metaKey
    if (isMod && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (_state.open) close(); else open()
      return
    }
    if (!_state.open) return
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key === 'Enter') { e.preventDefault(); _openResult(_state.cursor); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      _state.cursor = Math.min(_state.cursor + 1, _state.filtered.length - 1)
      _rerenderResults(); _scrollIntoView()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      _state.cursor = Math.max(_state.cursor - 1, 0)
      _rerenderResults(); _scrollIntoView()
    }
  })

  function _scrollIntoView() {
    var el = document.querySelector('.b2b-search-item.active')
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
  }

  // Reload quando parcerias mudam
  ;['b2b:partnership-saved','b2b:partnership-closed'].forEach(function (ev) {
    document.addEventListener(ev, function () { _state.loaded = false })
  })

  window.B2BSearch = Object.freeze({ open: open, close: close })
})()
