/**
 * LP Builder · Hero-Cover Drag Handle (Onda 28 · admin only)
 *
 * Adiciona handle visual sobre o bloco hero-cover quando ele está
 * selecionado no editor. Mouse drag vertical → atualiza text_y_pct
 * em tempo real (estilo Elementor).
 *
 * Comportamento:
 *   · Selecionou bloco hero-cover → mostra handle ☰ no topo do texto
 *   · Drag vertical → texto sobe/desce ao vivo
 *   · Solta → comita valor pro state via LPBuilder.setBlockProp
 *   · Snap a 25/50/75 segurando Shift
 *   · Detecta viewport: se está em modo mobile (preview), atualiza
 *     text_y_pct_mobile; senão text_y_pct
 *
 *   LPBHeroCoverDrag.attach(iframeDoc, getCurrentSelectedIdx, getCurrentViewport)
 *   LPBHeroCoverDrag.detach()
 */
;(function () {
  'use strict'
  if (window.LPBHeroCoverDrag) return

  var _doc = null
  var _getSelected = null
  var _getViewport = null
  var _activeBlockEl = null
  var _activeIdx = -1
  var _dragging  = false
  var _startY = 0
  var _startPct = 0
  var _heroH = 0
  var _propKey = 'text_y_pct'  // ou text_y_pct_mobile

  function _findHeroBlocks() {
    if (!_doc) return []
    return Array.from(_doc.querySelectorAll('.blk-hc'))
  }

  function _resolveBlockIdx(heroEl) {
    // sobe pra .lpb-block-host[data-block-idx]
    var host = heroEl.closest('[data-block-idx]')
    if (!host) return -1
    return parseInt(host.dataset.blockIdx, 10)
  }

  function _ensureHandle(heroEl) {
    var existing = heroEl.querySelector('.blk-hc-drag-handle')
    if (existing) return existing
    var h = _doc.createElement('div')
    h.className = 'blk-hc-drag-handle'
    h.title = 'Arraste pra mover o texto verticalmente'
    h.innerHTML = '&#8597;'  // ↕ unicode
    heroEl.appendChild(h)
    return h
  }

  function _readCurrentPct(heroEl) {
    // pega CSS var resolvida
    var styleAttr = heroEl.getAttribute('style') || ''
    var which = (_propKey === 'text_y_pct_mobile') ? '--hc-y-mob' : '--hc-y-desk'
    var m = styleAttr.match(new RegExp(which + ':\\s*([\\d.]+)'))
    return m ? parseFloat(m[1]) : 78
  }

  function _writePct(heroEl, pct) {
    var which = (_propKey === 'text_y_pct_mobile') ? '--hc-y-mob' : '--hc-y-desk'
    var styleAttr = heroEl.getAttribute('style') || ''
    if (styleAttr.indexOf(which) >= 0) {
      styleAttr = styleAttr.replace(new RegExp(which + ':\\s*[\\d.]+%'), which + ':' + pct + '%')
    } else {
      styleAttr += ' ' + which + ':' + pct + '%;'
    }
    heroEl.setAttribute('style', styleAttr)
  }

  function _onMouseDown(ev) {
    if (!_activeBlockEl) return
    if (ev.button !== 0) return
    ev.preventDefault()
    ev.stopPropagation()
    _dragging = true
    _startY   = ev.clientY
    _heroH    = _activeBlockEl.getBoundingClientRect().height || 1
    _startPct = _readCurrentPct(_activeBlockEl)
    // determina viewport ativo no momento (mobile vs desktop)
    var vp = _getViewport ? _getViewport() : 'desktop'
    _propKey = (vp === 'mobile') ? 'text_y_pct_mobile' : 'text_y_pct'
    _activeBlockEl.setAttribute('data-hc-dragging', '1')
    // listeners no doc do iframe e no parent (mouse pode escapar)
    _doc.addEventListener('mousemove', _onMouseMove, true)
    _doc.addEventListener('mouseup',   _onMouseUp,   true)
    document.addEventListener('mousemove', _onMouseMove, true)
    document.addEventListener('mouseup',   _onMouseUp,   true)
  }

  function _onMouseMove(ev) {
    if (!_dragging || !_activeBlockEl) return
    var deltaY = ev.clientY - _startY
    var deltaPct = (deltaY / _heroH) * 100
    var newPct = _startPct + deltaPct
    // snap a múltiplos de 5 por padrão · 25 com Shift
    var snap = ev.shiftKey ? 25 : 5
    newPct = Math.round(newPct / snap) * snap
    newPct = Math.max(5, Math.min(95, newPct))
    _writePct(_activeBlockEl, newPct)
  }

  function _onMouseUp(ev) {
    if (!_dragging) return
    _dragging = false
    _doc.removeEventListener('mousemove', _onMouseMove, true)
    _doc.removeEventListener('mouseup',   _onMouseUp,   true)
    document.removeEventListener('mousemove', _onMouseMove, true)
    document.removeEventListener('mouseup',   _onMouseUp,   true)

    if (_activeBlockEl) {
      _activeBlockEl.removeAttribute('data-hc-dragging')
      var finalPct = _readCurrentPct(_activeBlockEl)
      // commita no state
      if (window.LPBuilder && _activeIdx >= 0 && LPBuilder.setBlockProp) {
        try {
          LPBuilder.setBlockProp(_activeIdx, _propKey, String(finalPct))
        } catch (_) {}
      }
      if (window.LPBToast) {
        var label = (_propKey === 'text_y_pct_mobile') ? 'mobile' : 'desktop'
        LPBToast('Posição (' + label + '): ' + finalPct + '%', 'success')
      }
    }
  }

  function _refreshActive() {
    // remove edit flag de qualquer um anterior
    _findHeroBlocks().forEach(function (el) {
      el.removeAttribute('data-hc-edit')
    })
    _activeBlockEl = null
    _activeIdx = -1

    if (!_doc || !_getSelected) return
    var idx = _getSelected()
    if (idx == null || idx < 0) return

    var heroes = _findHeroBlocks()
    for (var i = 0; i < heroes.length; i++) {
      var bIdx = _resolveBlockIdx(heroes[i])
      if (bIdx === idx) {
        _activeBlockEl = heroes[i]
        _activeIdx = idx
        _activeBlockEl.setAttribute('data-hc-edit', '1')
        var handle = _ensureHandle(_activeBlockEl)
        handle.onmousedown = _onMouseDown
        return
      }
    }
  }

  function attach(iframeDoc, getSelectedFn, getViewportFn) {
    detach()
    _doc = iframeDoc
    _getSelected = getSelectedFn
    _getViewport = getViewportFn
    _refreshActive()
    // Re-checa quando state muda
    document.body.addEventListener('lpb:state-changed', _refreshActive)
    document.body.addEventListener('lpb:viewport-changed', _refreshActive)
  }

  function detach() {
    document.body.removeEventListener('lpb:state-changed', _refreshActive)
    document.body.removeEventListener('lpb:viewport-changed', _refreshActive)
    _findHeroBlocks().forEach(function (el) {
      el.removeAttribute('data-hc-edit')
      el.removeAttribute('data-hc-dragging')
    })
    _doc = null
    _activeBlockEl = null
    _activeIdx = -1
    _dragging = false
  }

  function refresh() {
    _refreshActive()
  }

  window.LPBHeroCoverDrag = Object.freeze({
    attach:  attach,
    detach:  detach,
    refresh: refresh,
  })
})()
