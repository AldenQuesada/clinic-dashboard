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

  // Helper · acha o hotspot DOM "irmão" de um par mirror (mesmo data-area)
  function _findMirrorPartner(allSpots, currentSpot) {
    var area = currentSpot.getAttribute('data-area')
    for (var i = 0; i < allSpots.length; i++) {
      if (allSpots[i] !== currentSpot && allSpots[i].getAttribute('data-area') === area) {
        return allSpots[i]
      }
    }
    return null
  }

  function _isMirrorFlag(v) {
    return v === '1' || v === 1 || v === true
  }

  // ──────────────────────────────────────────────────────────
  // Bind drag + click vazio + delete
  // ──────────────────────────────────────────────────────────
  function _rebind() {
    if (!_state.active) return

    // CRÍTICO · re-query rootEl do iframe a cada rebind.
    // Após re-render do canvas, o rootEl cacheado vira um nó DOM detached →
    // os novos hotspots ficam órfãos sem handlers. Re-buscamos o ATUAL.
    var iframe = document.getElementById('lpbIframe')
    if (!iframe || !iframe.contentDocument) return
    _state.iframeDoc = iframe.contentDocument
    var blockHost = _state.iframeDoc.querySelector('.lpb-edit-block[data-block-idx="' + _state.blockIdx + '"]')
    if (!blockHost) return
    _state.rootEl = blockHost.querySelector('[data-aq-photo-wrap]')
    if (!_state.rootEl) return

    // Re-render pode ter resetado vista pra "front" · força a vista do calibrador
    if (_state.rootEl.getAttribute('data-aq-view') !== _state.view) {
      _state.rootEl.setAttribute('data-aq-view', _state.view)
      _state.rootEl.querySelectorAll('[data-aq-view-pane]').forEach(function (pn) {
        pn.hidden = pn.getAttribute('data-aq-view-pane') !== _state.view
      })
      _state.rootEl.querySelectorAll('[data-aq-view-btn]').forEach(function (b2) {
        b2.classList.toggle('is-active', b2.getAttribute('data-aq-view-btn') === _state.view)
      })
    }

    _state.pane = _getPane()
    if (!_state.pane) return

    // Overlay visual (border tracejada champagne)
    if (!_state.rootEl.classList.contains('aq-calibrate-mode')) {
      _state.rootEl.classList.add('aq-calibrate-mode')
    }

    // CRÍTICO · garante que existe lista persistida ANTES de bindar handlers
    // Sem isso, drag não consegue salvar (areas[idx] = undefined porque defaults
    // vivem no código, não nos props). Seed primeiro → re-render → rebind chamado de novo.
    var existing = _readAreas()
    if (!existing.length) {
      var seeded = _seedFromDefaults(_state.view)
      if (seeded.length) {
        _writeAreas(seeded)  // dispara re-render → state-changed → _rebind() de novo
        return
      }
    }

    // Mapping DOM hotspot → data item (handles mirror items spanning 2 hotspots)
    var spots = _state.pane.querySelectorAll('.aq-hotspot')
    var domToData = []
    existing.forEach(function (item, dataIdx) {
      domToData.push({ dataIdx: dataIdx, isMirrorRight: false })
      if (_isMirrorFlag(item.mirror)) {
        domToData.push({ dataIdx: dataIdx, isMirrorRight: true })
      }
    })

    // Bind cada hotspot DOM
    spots.forEach(function (sp, domIdx) {
      if (sp.__calBound) return
      sp.__calBound = true

      var mapping = domToData[domIdx] || { dataIdx: domIdx, isMirrorRight: false }

      sp.addEventListener('pointerdown', function (e) {
        if (!_state.active) return
        e.preventDefault(); e.stopPropagation()
        sp.setPointerCapture(e.pointerId)
        _state.dragging = { hotspotEl: sp, mapping: mapping, pointerId: e.pointerId }
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
        // Live mirror · se item é bilateral, espelha o irmão visualmente em tempo real
        var areasNow = _readAreas()
        var item = areasNow[mapping.dataIdx]
        if (item && _isMirrorFlag(item.mirror)) {
          var partner = _findMirrorPartner(spots, sp)
          if (partner) {
            partner.style.left = (100 - x) + '%'
            partner.style.top  = y + '%'
          }
        }
      })
      sp.addEventListener('pointerup', function (e) {
        if (!_state.dragging || _state.dragging.hotspotEl !== sp) return
        sp.releasePointerCapture(e.pointerId)
        sp.classList.remove('is-dragging')
        var x = parseFloat(sp.style.left)
        var y = parseFloat(sp.style.top)
        var areas = _readAreas()
        var item = areas[mapping.dataIdx]
        if (item) {
          // Se arrastou o lado DIREITO de um par mirror, normaliza salvando como
          // anchor esquerdo (x = 100 - x); renderer recria o espelho automaticamente
          var saveX = mapping.isMirrorRight ? (100 - x) : x
          areas[mapping.dataIdx] = Object.assign({}, item, {
            x: saveX.toFixed(1),
            y: y.toFixed(1),
          })
          _writeAreas(areas)
        } else {
          console.warn('[aq-calibrate] item não encontrado · dataIdx=', mapping.dataIdx, 'areas=', areas)
        }
        _state.dragging = null
      })
      sp.addEventListener('contextmenu', function (e) {
        if (!_state.active) return
        e.preventDefault(); e.stopPropagation()
        if (!confirm('Remover este ponto?')) return
        var areas = _readAreas()
        areas.splice(mapping.dataIdx, 1)
        _writeAreas(areas)
      })
    })

    // Click em área vazia da foto adiciona novo ponto
    if (!_state.pane.__calClickBound) {
      _state.pane.__calClickBound = true
      _state.pane.addEventListener('click', function (e) {
        if (!_state.active) return
        if (e.target.closest('.aq-hotspot')) return
        var rect = _state.pane.getBoundingClientRect()
        var x = ((e.clientX - rect.left) / rect.width) * 100
        var y = ((e.clientY - rect.top)  / rect.height) * 100
        var areas = _readAreas()
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
  // Pares bilaterais → 1 item com mirror=1 (renderer cria os 2 hotspots)
  function _seedFromDefaults(view) {
    if (!window.LPBBlockAnatomyQuiz) return []
    var src = (view === 'side') ? LPBBlockAnatomyQuiz.AREAS_SIDE : LPBBlockAnatomyQuiz.AREAS_FRONT
    if (!src) return []
    var out = []
    Object.keys(src).forEach(function (key) {
      var a = src[key]
      var pts = a.hotspots || []
      if (pts.length === 2) {
        // Bilateral · pega o ponto da esquerda (menor x) como anchor + mirror=1
        var sorted = pts.slice().sort(function (p, q) { return p[0] - q[0] })
        out.push({
          label:    a.label,
          protocol: a.protocol,
          x:        sorted[0][0].toString(),
          y:        sorted[0][1].toString(),
          mirror:   '1',
        })
      } else {
        pts.forEach(function (pt) {
          out.push({
            label:    a.label,
            protocol: a.protocol,
            x:        pt[0].toString(),
            y:        pt[1].toString(),
            mirror:   '',
          })
        })
      }
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
