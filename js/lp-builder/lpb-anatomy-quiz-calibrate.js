/**
 * LP Builder · Anatomy Quiz · Visual Calibrator (Onda 30)
 *
 * Modo edição visual sobre o canvas iframe:
 *   · Botão "Calibrar visualmente" no inspector ativa modo
 *   · Hotspots viram drag handles · arrasta pra reposicionar
 *   · Click em área vazia da foto → adiciona novo ponto
 *   · Click no ponto + delete → remove
 *   · Coords salvas em b.props.areas_front/areas_side em tempo real
 *
 * Independente · IIFE · zero acoplamento.
 *
 * API:
 *   LPBAnatomyQuizCalibrate.toggle(blockIdx, view)  // 'front' | 'side'
 *   LPBAnatomyQuizCalibrate.isActive() → bool
 *   LPBAnatomyQuizCalibrate.exit()
 */
;(function () {
  'use strict'
  if (window.LPBAnatomyQuizCalibrate) return

  var _state = {
    active:    false,
    blockIdx:  -1,
    view:      'front',  // 'front' | 'side'
    iframeDoc: null,
    rootEl:    null,     // .blk-aq-photo-wrap dentro do iframe
    pane:      null,     // .aq-view-front ou .aq-view-side
    dragging:  null,     // { hotspotEl, areaIdx, startX, startY }
  }

  function isActive() { return _state.active }

  function _getPane() {
    if (!_state.rootEl) return null
    return _state.rootEl.querySelector('[data-aq-view-pane="' + _state.view + '"]')
  }

  function _getAreasProp() {
    return _state.view === 'side' ? 'areas_side' : 'areas_front'
  }

  // Lê áreas atuais do block (ou retorna [] se vazio · vai criar do zero)
  function _readAreas() {
    var b = LPBuilder.getBlock(_state.blockIdx)
    if (!b || !b.props) return []
    var key = _getAreasProp()
    return Array.isArray(b.props[key]) ? b.props[key].slice() : []
  }

  // Persiste áreas no state · força re-render do canvas
  function _writeAreas(areas) {
    LPBuilder.setBlockProp(_state.blockIdx, _getAreasProp(), areas)
    // re-attach drag handlers após re-render (com micro-delay)
    setTimeout(_rebind, 60)
  }

  // ──────────────────────────────────────────────────────────
  // Bind drag + click vazio + delete
  // ──────────────────────────────────────────────────────────
  function _rebind() {
    if (!_state.active) return
    _state.pane = _getPane()
    if (!_state.pane) return

    // Adiciona overlay ovelay visual (border tracejada champagne)
    if (!_state.rootEl.classList.contains('aq-calibrate-mode')) {
      _state.rootEl.classList.add('aq-calibrate-mode')
    }

    // Bind cada hotspot
    var spots = _state.pane.querySelectorAll('.aq-hotspot')
    spots.forEach(function (sp, idx) {
      if (sp.__calBound) return
      sp.__calBound = true
      // pointer down → começa drag
      sp.addEventListener('pointerdown', function (e) {
        if (!_state.active) return
        e.preventDefault()
        e.stopPropagation()
        sp.setPointerCapture(e.pointerId)
        _state.dragging = { hotspotEl: sp, idx: idx, pointerId: e.pointerId }
        sp.classList.add('is-dragging')
      })
      sp.addEventListener('pointermove', function (e) {
        if (!_state.dragging || _state.dragging.hotspotEl !== sp) return
        var rect = _state.pane.getBoundingClientRect()
        var x = ((e.clientX - rect.left) / rect.width) * 100
        var y = ((e.clientY - rect.top)  / rect.height) * 100
        x = Math.max(0, Math.min(100, x))
        y = Math.max(0, Math.min(100, y))
        sp.style.left = x + '%'
        sp.style.top  = y + '%'
      })
      sp.addEventListener('pointerup', function (e) {
        if (!_state.dragging || _state.dragging.hotspotEl !== sp) return
        sp.releasePointerCapture(e.pointerId)
        sp.classList.remove('is-dragging')
        // Lê coord final + commita no state
        var x = parseFloat(sp.style.left)
        var y = parseFloat(sp.style.top)
        var areas = _readAreas()
        if (areas[idx]) {
          areas[idx] = Object.assign({}, areas[idx], {
            x: x.toFixed(1),
            y: y.toFixed(1),
          })
          _writeAreas(areas)
        }
        _state.dragging = null
      })
      // Right-click ou shift+click → remove
      sp.addEventListener('contextmenu', function (e) {
        if (!_state.active) return
        e.preventDefault()
        e.stopPropagation()
        if (!confirm('Remover este ponto?')) return
        var areas = _readAreas()
        areas.splice(idx, 1)
        _writeAreas(areas)
      })
    })

    // Click em área vazia da foto adiciona novo ponto
    if (!_state.pane.__calClickBound) {
      _state.pane.__calClickBound = true
      _state.pane.addEventListener('click', function (e) {
        if (!_state.active) return
        // ignora clicks em hotspots existentes (eles têm seus próprios handlers)
        if (e.target.closest('.aq-hotspot')) return
        var rect = _state.pane.getBoundingClientRect()
        var x = ((e.clientX - rect.left) / rect.width) * 100
        var y = ((e.clientY - rect.top)  / rect.height) * 100
        var areas = _readAreas()
        // Se vazio · semeia com defaults primeiro pra preservar o que existe
        if (!areas.length) {
          var defaults = (_state.view === 'side')
            ? _seedFromDefaults('side')
            : _seedFromDefaults('front')
          areas = defaults
        }
        areas.push({
          label:    'Nova área ' + (areas.length + 1),
          protocol: 'Configurar protocolo',
          x:        x.toFixed(1),
          y:        y.toFixed(1),
          mirror:   '',
        })
        _writeAreas(areas)
      })
    }
  }

  // Semeia a lista de áreas do user com os defaults da vista
  // (chamado quando user adiciona ponto numa lista vazia)
  function _seedFromDefaults(view) {
    if (!window.LPBBlockAnatomyQuiz) return []
    // Acessamos AREAS_FRONT/SIDE só se exposto; senão retornamos vazio
    var src = (view === 'side') ? LPBBlockAnatomyQuiz.AREAS_SIDE : LPBBlockAnatomyQuiz.AREAS_FRONT
    if (!src) return []
    var out = []
    Object.keys(src).forEach(function (key) {
      var a = src[key]
      ;(a.hotspots || []).forEach(function (pt, i) {
        out.push({
          label:    a.label + (a.hotspots.length > 1 ? ' (' + (i === 0 ? 'esq' : 'dir') + ')' : ''),
          protocol: a.protocol,
          x:        pt[0].toString(),
          y:        pt[1].toString(),
          mirror:   '',
        })
      })
    })
    return out
  }

  // ──────────────────────────────────────────────────────────
  // Toggle modo (entry point)
  // ──────────────────────────────────────────────────────────
  function toggle(blockIdx, view) {
    if (_state.active) { exit(); return false }

    _state.blockIdx = (blockIdx != null) ? blockIdx : LPBuilder.getSelectedIdx()
    _state.view     = view || 'front'

    // Localiza iframe canvas + root do bloco
    var iframe = document.getElementById('lpbIframe')
    if (!iframe || !iframe.contentDocument) {
      LPBToast && LPBToast('Canvas não encontrado · selecione o bloco primeiro', 'error')
      return false
    }
    _state.iframeDoc = iframe.contentDocument
    var blockHost = _state.iframeDoc.querySelector('.lpb-edit-block[data-block-idx="' + _state.blockIdx + '"]')
    if (!blockHost) {
      LPBToast && LPBToast('Bloco não encontrado no canvas', 'error')
      return false
    }
    _state.rootEl = blockHost.querySelector('[data-aq-photo-wrap]')
    if (!_state.rootEl) {
      LPBToast && LPBToast('Esse bloco não é um Quiz Anatômico', 'error')
      return false
    }

    // Garante que está na vista correta
    var wrap = _state.rootEl
    if (wrap.getAttribute('data-aq-view') !== _state.view) {
      wrap.setAttribute('data-aq-view', _state.view)
      wrap.querySelectorAll('[data-aq-view-pane]').forEach(function (pn) {
        pn.hidden = pn.getAttribute('data-aq-view-pane') !== _state.view
      })
    }

    _state.active = true
    _rebind()
    LPBToast && LPBToast('Modo calibrar ATIVO · arraste pontos · clique no rosto pra adicionar · ESC pra sair', 'success')

    // ESC sai
    document.addEventListener('keydown', _onEscape)
    return true
  }

  function _onEscape(e) {
    if (e.key === 'Escape') exit()
  }

  function exit() {
    if (_state.rootEl) _state.rootEl.classList.remove('aq-calibrate-mode')
    document.removeEventListener('keydown', _onEscape)
    LPBToast && LPBToast('Modo calibrar OFF', 'success')
    _state = { active: false, blockIdx: -1, view: 'front', iframeDoc: null, rootEl: null, pane: null, dragging: null }
  }

  // Re-bind quando state-changed (canvas re-render perdeu handlers)
  document.body.addEventListener('lpb:state-changed', function () {
    if (_state.active) setTimeout(_rebind, 50)
  })

  // Atalhos globais · ativa modo calibrar pro bloco anatomy-quiz selecionado
  // Ctrl+Alt+C (primario · safe · sem conflito de browser)
  // Ctrl+Shift+K (legado · alguns browsers como Firefox capturam pro DevTools)
  function _matchShortcut(e) {
    var ctrl = e.ctrlKey || e.metaKey
    if (!ctrl) return false
    var k = (e.key || '').toLowerCase()
    if (e.altKey && k === 'c') return true     // Ctrl+Alt+C (recomendado)
    if (e.shiftKey && k === 'k') return true   // Ctrl+Shift+K (legado)
    return false
  }
  document.addEventListener('keydown', function (e) {
    if (!_matchShortcut(e)) return
    e.preventDefault()
    e.stopPropagation()
    _activateForSelected()
  })

  function _activateForSelected() {
    if (LPBuilder.getView && LPBuilder.getView() !== 'editor') {
      LPBToast && LPBToast('Abra o editor primeiro', 'error')
      return
    }
    var idx = LPBuilder.getSelectedIdx()
    var b = LPBuilder.getBlock(idx)
    if (!b || b.type !== 'anatomy-quiz') {
      LPBToast && LPBToast('Selecione um Quiz Anatômico primeiro · clique no bloco', 'error')
      return
    }
    var iframe = document.getElementById('lpbIframe')
    var view = 'front'
    if (iframe && iframe.contentDocument) {
      var wrap = iframe.contentDocument.querySelector('.lpb-edit-block[data-block-idx="' + idx + '"] [data-aq-photo-wrap]')
      if (wrap) view = wrap.getAttribute('data-aq-view') || 'front'
    }
    toggle(idx, view)
  }

  // Helper global pra debug · chame `calibrateAnatomy()` no console
  window.calibrateAnatomy = _activateForSelected

  window.LPBAnatomyQuizCalibrate = Object.freeze({
    toggle:   toggle,
    exit:     exit,
    isActive: isActive,
  })
})()
