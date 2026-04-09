/**
 * fm-compare.js — Premium ANTES vs DEPOIS comparison tool
 * Modes: Slider Reveal, Crossfade, Side-by-Side, Horizontal Split
 * Features: Angle tabs, auto timer, synchronized zoom, watermark
 * Instagrammable export (1080x1080)
 */
;(function () {
  'use strict'

  var FM = window._FM

  // ── State ─────────────────────────────────────────────────
  var _compareMode = 'slider' // slider | fade | sidebyside | horizontal
  var _sliderPos = 50         // percentage (0-100)
  var _fadeOpacity = 0        // 0-100
  var _zoomLevel = 1
  var _zoomCenter = { x: 50, y: 50 } // percentage
  var _isDragging = false
  var _isPanning = false
  var _panStart = { x: 0, y: 0 }
  var _panOffset = { x: 0, y: 0 }
  var _beforeImg = null
  var _afterImg = null
  var _overlay = null
  var _currentAngle = null     // 'front' | '45' | 'lateral'
  var _availableAngles = []

  // Auto timer state
  var _autoPlaying = false
  var _autoRAF = null
  var _autoStartTime = 0
  var _autoCycleDuration = 5000 // full cycle in ms (0 -> 100 -> 0)

  // ── Angle helpers ─────────────────────────────────────────

  function _getAvailableAngles() {
    var angles = []
    var angleKeys = ['front', '45', 'lateral']
    var angleLabels = { front: 'Frontal', '45': '45', lateral: 'Lateral' }
    angleKeys.forEach(function (k) {
      var hasBefore = FM._photoUrls && FM._photoUrls[k]
      var hasAfter = FM._afterPhotoByAngle && FM._afterPhotoByAngle[k]
      if (hasBefore && hasAfter) {
        angles.push({ key: k, label: angleLabels[k] })
      }
    })
    return angles
  }

  function _getBeforeSrc(angle) {
    if (angle && FM._photoUrls && FM._photoUrls[angle]) return FM._photoUrls[angle]
    return FM._photoUrls['45'] || FM._photoUrls['front'] || FM._photoUrls['lateral'] || null
  }

  function _getAfterSrc(angle) {
    if (angle && FM._afterPhotoByAngle && FM._afterPhotoByAngle[angle]) return FM._afterPhotoByAngle[angle]
    return FM._afterPhotoUrl || FM._simPhotoUrl || null
  }

  // ── Open Comparator ───────────────────────────────────────

  FM._openCompare = function () {
    _availableAngles = _getAvailableAngles()

    // Pick initial angle: prefer one with both antes/depois, else any antes
    if (_availableAngles.length > 0) {
      _currentAngle = _availableAngles[0].key
    } else {
      _currentAngle = null
    }

    var beforeSrc = _getBeforeSrc(_currentAngle)
    if (!beforeSrc) {
      beforeSrc = FM._photoUrls['45'] || FM._photoUrls['front'] || FM._photoUrls['lateral']
    }
    if (!beforeSrc) {
      FM._showToast('Envie pelo menos uma foto ANTES para comparar.', 'warn')
      return
    }

    var afterSrc = _getAfterSrc(_currentAngle)
    if (!afterSrc) {
      FM._showLoading('Gerando simulacao...')
      FM._generateSimulation(function () {
        FM._hideLoading()
        afterSrc = FM._simPhotoUrl
        if (afterSrc) _buildCompareUI(beforeSrc, afterSrc)
        else FM._showToast('Nenhuma foto DEPOIS ou simulacao disponivel.', 'warn')
      })
      return
    }

    _buildCompareUI(beforeSrc, afterSrc)
  }

  function _buildCompareUI(beforeSrc, afterSrc) {
    _beforeImg = new Image()
    _afterImg = new Image()
    var loaded = 0

    function _onBothLoaded() {
      loaded++
      if (loaded < 2) return
      _renderCompareOverlay()
    }

    _beforeImg.onload = _onBothLoaded
    _afterImg.onload = _onBothLoaded
    _beforeImg.src = beforeSrc
    _afterImg.src = afterSrc
  }

  // ── Render Overlay ────────────────────────────────────────

  function _renderCompareOverlay() {
    if (_overlay) _overlay.remove()
    _stopAutoTimer()

    // Reset zoom/pan
    _zoomLevel = 1
    _panOffset = { x: 0, y: 0 }

    _overlay = document.createElement('div')
    _overlay.id = 'fmCompareOverlay'
    _overlay.className = 'fmc-overlay'

    var name = FM._lead ? (FM._lead.nome || FM._lead.name || '') : ''

    // Build angle tabs HTML
    var angleTabs = ''
    if (_availableAngles.length > 1) {
      angleTabs = '<div class="fmc-angle-tabs" id="fmcAngleTabs">'
      _availableAngles.forEach(function (a) {
        angleTabs += '<button class="fmc-angle-tab' + (a.key === _currentAngle ? ' active' : '') + '" data-angle="' + a.key + '">' + a.label + '</button>'
      })
      angleTabs += '</div>'
    }

    _overlay.innerHTML =
      '<div class="fmc-container">' +
        // Header
        '<div class="fmc-header">' +
          '<div class="fmc-brand">' +
            '<span class="fmc-brand-name">Clinica Mirian de Paula</span>' +
            '<span class="fmc-brand-sub">Resultado do Tratamento</span>' +
          '</div>' +
          '<div class="fmc-modes">' +
            '<button class="fmc-mode-btn' + (_compareMode === 'slider' ? ' active' : '') + '" data-mode="slider">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="8 6 12 2 16 6"/><polyline points="8 18 12 22 16 18"/></svg>' +
              ' Slider</button>' +
            '<button class="fmc-mode-btn' + (_compareMode === 'fade' ? ' active' : '') + '" data-mode="fade">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/></svg>' +
              ' Transicao</button>' +
            '<button class="fmc-mode-btn' + (_compareMode === 'sidebyside' ? ' active' : '') + '" data-mode="sidebyside">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/></svg>' +
              ' Lado a Lado</button>' +
            '<button class="fmc-mode-btn' + (_compareMode === 'horizontal' ? ' active' : '') + '" data-mode="horizontal">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="2" width="18" height="8" rx="1"/><rect x="3" y="14" width="18" height="8" rx="1"/></svg>' +
              ' Horizontal</button>' +
          '</div>' +
          // Auto timer button
          '<button class="fmc-auto-btn" id="fmcAutoBtn" title="Auto play">' +
            '<svg id="fmcAutoIcon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>' +
            '<span class="fmc-auto-label">Auto</span>' +
          '</button>' +
          '<div class="fmc-uploads" style="display:flex;gap:4px;margin-left:8px">' +
            '<label style="display:flex;align-items:center;gap:3px;padding:4px 10px;border:1px solid rgba(239,68,68,0.3);border-radius:6px;color:#EF4444;font-size:9px;cursor:pointer;font-family:Montserrat,sans-serif;font-weight:500">' +
              FM._icon('upload', 11) + ' ANTES<input type="file" accept="image/*" onchange="FaceMapping._compareUpload(\'before\',this)" style="display:none">' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:3px;padding:4px 10px;border:1px solid rgba(16,185,129,0.3);border-radius:6px;color:#10B981;font-size:9px;cursor:pointer;font-family:Montserrat,sans-serif;font-weight:500">' +
              FM._icon('upload', 11) + ' DEPOIS<input type="file" accept="image/*" onchange="FaceMapping._compareUpload(\'after\',this)" style="display:none">' +
            '</label>' +
            '<button style="display:flex;align-items:center;gap:3px;padding:4px 10px;border:1px solid rgba(239,68,68,0.15);border-radius:6px;background:transparent;color:rgba(239,68,68,0.5);font-size:8px;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._compareFromUrl(\'before\')">' +
              FM._icon('link', 9) + ' URL</button>' +
            '<button style="display:flex;align-items:center;gap:3px;padding:4px 10px;border:1px solid rgba(16,185,129,0.15);border-radius:6px;background:transparent;color:rgba(16,185,129,0.5);font-size:8px;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._compareFromUrl(\'after\')">' +
              FM._icon('link', 9) + ' URL</button>' +
          '</div>' +
          '<div class="fmc-actions">' +
            '<button class="fmc-btn-export" onclick="FaceMapping._exportCompare()">' +
              FM._icon('download', 14) + ' Instagram</button>' +
            '<button class="fmc-btn-close" onclick="FaceMapping._closeCompare()">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +

        // Angle tabs
        angleTabs +

        // Viewport
        '<div class="fmc-viewport" id="fmcViewport">' +
          '<div class="fmc-zoom-container" id="fmcZoomContainer">' +
            // Slider mode
            '<div class="fmc-slider-wrap fmc-mode-wrap" id="fmcSliderWrap">' +
              '<div class="fmc-img-before" id="fmcBefore">' +
                '<img src="' + _beforeImg.src + '" draggable="false">' +
                '<span class="fmc-label fmc-label-before">ANTES</span>' +
              '</div>' +
              '<div class="fmc-img-after" id="fmcAfter">' +
                '<img src="' + _afterImg.src + '" draggable="false">' +
                '<span class="fmc-label fmc-label-after">DEPOIS</span>' +
              '</div>' +
              '<div class="fmc-slider-line" id="fmcSliderLine">' +
                '<div class="fmc-slider-handle" id="fmcHandle">' +
                  '<div class="fmc-handle-arrows">' +
                    '<svg width="8" height="12" viewBox="0 0 8 12"><path d="M6 0L0 6l6 6" fill="currentColor"/></svg>' +
                    '<svg width="8" height="12" viewBox="0 0 8 12"><path d="M2 0l6 6-6 6" fill="currentColor"/></svg>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +

            // Fade mode (hidden by default)
            '<div class="fmc-fade-wrap fmc-mode-wrap" id="fmcFadeWrap" style="display:none;opacity:0">' +
              '<img class="fmc-fade-before" src="' + _beforeImg.src + '" draggable="false">' +
              '<img class="fmc-fade-after" id="fmcFadeAfter" src="' + _afterImg.src + '" draggable="false">' +
              '<span class="fmc-label fmc-label-before" style="left:20px">ANTES</span>' +
              '<span class="fmc-label fmc-label-after" style="right:20px">DEPOIS</span>' +
            '</div>' +

            // Side-by-side (hidden by default)
            '<div class="fmc-side-wrap fmc-mode-wrap" id="fmcSideWrap" style="display:none;opacity:0">' +
              '<div class="fmc-side-panel fmc-side-panel-before">' +
                '<img src="' + _beforeImg.src + '" draggable="false">' +
                '<span class="fmc-label fmc-label-before">ANTES</span>' +
              '</div>' +
              '<div class="fmc-side-panel fmc-side-panel-after">' +
                '<img src="' + _afterImg.src + '" draggable="false">' +
                '<span class="fmc-label fmc-label-after">DEPOIS</span>' +
              '</div>' +
            '</div>' +

            // Horizontal split (hidden by default)
            '<div class="fmc-horiz-wrap fmc-mode-wrap" id="fmcHorizWrap" style="display:none;opacity:0">' +
              '<div class="fmc-horiz-before" id="fmcHorizBefore">' +
                '<img src="' + _beforeImg.src + '" draggable="false">' +
                '<span class="fmc-label fmc-label-before">ANTES</span>' +
              '</div>' +
              '<div class="fmc-horiz-after" id="fmcHorizAfter">' +
                '<img src="' + _afterImg.src + '" draggable="false">' +
                '<span class="fmc-label fmc-label-after">DEPOIS</span>' +
              '</div>' +
              '<div class="fmc-horiz-line" id="fmcHorizLine">' +
                '<div class="fmc-horiz-handle" id="fmcHorizHandle">' +
                  '<div class="fmc-handle-arrows fmc-handle-arrows-h">' +
                    '<svg width="12" height="8" viewBox="0 0 12 8"><path d="M0 6L6 0l6 6" fill="currentColor"/></svg>' +
                    '<svg width="12" height="8" viewBox="0 0 12 8"><path d="M0 2l6 6 6-6" fill="currentColor"/></svg>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // Watermark
          '<span class="fmc-watermark">Clinica Mirian de Paula</span>' +

          // Zoom indicator
          '<span class="fmc-zoom-indicator" id="fmcZoomIndicator" style="display:none">1.0x</span>' +
        '</div>' +

        // Controls
        '<div class="fmc-controls" id="fmcControls">' +
          '<div class="fmc-slider-control" id="fmcSliderControl">' +
            '<input type="range" id="fmcRange" min="0" max="100" value="50" class="fmc-range">' +
          '</div>' +
        '</div>' +

        // Footer
        '<div class="fmc-footer">' +
          (name ? '<span class="fmc-patient-name">' + FM._esc(name) + '</span>' : '') +
          '<span class="fmc-date">' + FM._formatDate(new Date()) + '</span>' +
        '</div>' +
      '</div>'

    document.body.appendChild(_overlay)
    document.body.style.overflow = 'hidden'

    // Fade in the active mode
    var activeWrap = _getModeWrap(_compareMode)
    if (activeWrap) {
      activeWrap.style.display = ''
      activeWrap.style.opacity = '0'
      requestAnimationFrame(function () {
        activeWrap.style.opacity = '1'
      })
    }

    _bindCompareEvents()
    _setMode(_compareMode)
    _updateSlider(50)
  }

  // ── Mode Wrap Helper ──────────────────────────────────────

  function _getModeWrap(mode) {
    var map = {
      slider: 'fmcSliderWrap',
      fade: 'fmcFadeWrap',
      sidebyside: 'fmcSideWrap',
      horizontal: 'fmcHorizWrap'
    }
    return document.getElementById(map[mode]) || null
  }

  // ── Mode Switching ────────────────────────────────────────

  function _setMode(mode) {
    var oldMode = _compareMode
    _compareMode = mode
    _stopAutoTimer()

    var allModes = ['slider', 'fade', 'sidebyside', 'horizontal']

    // Fade out old, fade in new
    allModes.forEach(function (m) {
      var wrap = _getModeWrap(m)
      if (!wrap) return
      if (m === mode) {
        wrap.style.display = ''
        // Trigger reflow then fade in
        wrap.offsetHeight // force reflow
        wrap.style.opacity = '1'
      } else {
        wrap.style.opacity = '0'
        // Hide after transition
        ;(function (w) {
          setTimeout(function () {
            if (_compareMode !== m) w.style.display = 'none'
          }, 300)
        })(wrap)
      }
    })

    var controls = document.getElementById('fmcControls')

    if (controls) {
      if (mode === 'slider') {
        controls.innerHTML = '<div class="fmc-slider-control"><input type="range" id="fmcRange" min="0" max="100" value="' + _sliderPos + '" class="fmc-range"></div>'
        var range = document.getElementById('fmcRange')
        if (range) range.addEventListener('input', function () { _updateSlider(parseInt(this.value)) })
      } else if (mode === 'fade') {
        controls.innerHTML = '<div class="fmc-fade-control"><span class="fmc-fade-label">ANTES</span><input type="range" id="fmcFadeRange" min="0" max="100" value="' + _fadeOpacity + '" class="fmc-range"><span class="fmc-fade-label">DEPOIS</span></div>'
        var fadeRange = document.getElementById('fmcFadeRange')
        if (fadeRange) fadeRange.addEventListener('input', function () { _updateFade(parseInt(this.value)) })
      } else if (mode === 'horizontal') {
        controls.innerHTML = '<div class="fmc-slider-control"><input type="range" id="fmcHorizRange" min="0" max="100" value="' + _sliderPos + '" class="fmc-range"></div>'
        var horizRange = document.getElementById('fmcHorizRange')
        if (horizRange) horizRange.addEventListener('input', function () { _updateHorizontalSlider(parseInt(this.value)) })
      } else {
        controls.innerHTML = '<div class="fmc-zoom-control"><span class="fmc-fade-label">Zoom</span><input type="range" id="fmcZoomRange" min="100" max="300" value="' + Math.round(_zoomLevel * 100) + '" class="fmc-range"><span class="fmc-fade-label">' + Math.round(_zoomLevel * 100) + '%</span></div>'
        var zoomRange = document.getElementById('fmcZoomRange')
        if (zoomRange) zoomRange.addEventListener('input', function () {
          _zoomLevel = parseInt(this.value) / 100
          _applySyncZoom()
          this.nextElementSibling.textContent = this.value + '%'
        })
      }
    }

    // Active button
    document.querySelectorAll('.fmc-mode-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode)
    })
  }

  // ── Slider Update ─────────────────────────────────────────

  function _updateSlider(pos) {
    _sliderPos = pos
    var afterEl = document.getElementById('fmcAfter')
    var lineEl = document.getElementById('fmcSliderLine')
    if (afterEl) afterEl.style.clipPath = 'inset(0 0 0 ' + pos + '%)'
    if (lineEl) lineEl.style.left = pos + '%'
  }

  function _updateHorizontalSlider(pos) {
    _sliderPos = pos
    var afterEl = document.getElementById('fmcHorizAfter')
    var lineEl = document.getElementById('fmcHorizLine')
    if (afterEl) afterEl.style.clipPath = 'inset(' + pos + '% 0 0 0)'
    if (lineEl) lineEl.style.top = pos + '%'
  }

  function _updateFade(val) {
    _fadeOpacity = val
    var afterEl = document.getElementById('fmcFadeAfter')
    if (afterEl) afterEl.style.opacity = val / 100

    var labels = document.querySelectorAll('#fmcFadeWrap .fmc-label')
    if (labels[0]) labels[0].style.opacity = 1 - val / 100
    if (labels[1]) labels[1].style.opacity = val / 100
  }

  function _updateZoom() {
    var panels = document.querySelectorAll('.fmc-side-panel img')
    panels.forEach(function (img) {
      img.style.transform = 'scale(' + _zoomLevel + ')'
      img.style.transformOrigin = _zoomCenter.x + '% ' + _zoomCenter.y + '%'
    })
  }

  // ── Synchronized Zoom ─────────────────────────────────────

  function _applySyncZoom() {
    var container = document.getElementById('fmcZoomContainer')
    if (!container) return
    container.style.transform = 'scale(' + _zoomLevel + ') translate(' + _panOffset.x + 'px, ' + _panOffset.y + 'px)'
    container.style.transformOrigin = _zoomCenter.x + '% ' + _zoomCenter.y + '%'

    var indicator = document.getElementById('fmcZoomIndicator')
    if (indicator) {
      if (_zoomLevel > 1.01) {
        indicator.style.display = ''
        indicator.textContent = _zoomLevel.toFixed(1) + 'x'
      } else {
        indicator.style.display = 'none'
      }
    }
  }

  // ── Auto Timer ────────────────────────────────────────────

  function _startAutoTimer() {
    if (_autoPlaying) return
    _autoPlaying = true
    _autoStartTime = performance.now()
    _updateAutoButton()
    _autoTick()
  }

  function _stopAutoTimer() {
    _autoPlaying = false
    if (_autoRAF) {
      cancelAnimationFrame(_autoRAF)
      _autoRAF = null
    }
    _updateAutoButton()
  }

  function _toggleAutoTimer() {
    if (_autoPlaying) _stopAutoTimer()
    else _startAutoTimer()
  }

  function _updateAutoButton() {
    var icon = document.getElementById('fmcAutoIcon')
    var btn = document.getElementById('fmcAutoBtn')
    if (!icon || !btn) return

    if (_autoPlaying) {
      // Pause icon
      icon.innerHTML = '<rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/>'
      btn.classList.add('active')
    } else {
      // Play icon
      icon.innerHTML = '<polygon points="5,3 19,12 5,21"/>'
      btn.classList.remove('active')
    }
  }

  function _autoTick() {
    if (!_autoPlaying) return

    var elapsed = performance.now() - _autoStartTime
    // Sinusoidal easing: pos = 50 + 50 * sin(t)
    // Full cycle = _autoCycleDuration ms
    var t = (elapsed / _autoCycleDuration) * Math.PI * 2
    var pos = 50 + 50 * Math.sin(t)

    if (_compareMode === 'slider') {
      _updateSlider(pos)
      var range = document.getElementById('fmcRange')
      if (range) range.value = pos
    } else if (_compareMode === 'horizontal') {
      _updateHorizontalSlider(pos)
      var horizRange = document.getElementById('fmcHorizRange')
      if (horizRange) horizRange.value = pos
    } else if (_compareMode === 'fade') {
      _updateFade(pos)
      var fadeRange = document.getElementById('fmcFadeRange')
      if (fadeRange) fadeRange.value = pos
    } else if (_compareMode === 'sidebyside') {
      // Pulse highlight alternating panels
      var panelBefore = document.querySelector('.fmc-side-panel-before')
      var panelAfter = document.querySelector('.fmc-side-panel-after')
      if (panelBefore && panelAfter) {
        var sinVal = Math.sin(t) // -1 to 1
        // Before highlighted when sinVal < 0, After when sinVal > 0
        var beforeGlow = Math.max(0, -sinVal) * 0.25
        var afterGlow = Math.max(0, sinVal) * 0.25
        panelBefore.style.boxShadow = 'inset 0 0 60px rgba(239,68,68,' + beforeGlow.toFixed(3) + ')'
        panelAfter.style.boxShadow = 'inset 0 0 60px rgba(16,185,129,' + afterGlow.toFixed(3) + ')'
      }
    }

    _autoRAF = requestAnimationFrame(_autoTick)
  }

  // ── Angle Switching ───────────────────────────────────────

  function _switchAngle(angle) {
    _currentAngle = angle
    _stopAutoTimer()

    var beforeSrc = _getBeforeSrc(angle)
    var afterSrc = _getAfterSrc(angle)
    if (!beforeSrc || !afterSrc) return

    // Load new images with fade transition
    var newBefore = new Image()
    var newAfter = new Image()
    var loaded = 0

    function _onLoaded() {
      loaded++
      if (loaded < 2) return
      _beforeImg = newBefore
      _afterImg = newAfter
      _updateCompareImages()

      // Animate new images in
      var viewport = document.getElementById('fmcViewport')
      if (viewport) {
        viewport.style.opacity = '0'
        requestAnimationFrame(function () {
          viewport.style.opacity = '1'
        })
      }
    }

    newBefore.onload = _onLoaded
    newAfter.onload = _onLoaded
    newBefore.src = beforeSrc
    newAfter.src = afterSrc

    // Update active tab
    document.querySelectorAll('.fmc-angle-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-angle') === angle)
    })
  }

  // ── Events ────────────────────────────────────────────────

  function _bindCompareEvents() {
    // Mode buttons
    document.querySelectorAll('.fmc-mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { _setMode(this.getAttribute('data-mode')) })
    })

    // Angle tabs
    document.querySelectorAll('.fmc-angle-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { _switchAngle(this.getAttribute('data-angle')) })
    })

    // Auto timer button
    var autoBtn = document.getElementById('fmcAutoBtn')
    if (autoBtn) autoBtn.addEventListener('click', _toggleAutoTimer)

    // Slider drag on viewport
    var viewport = document.getElementById('fmcViewport')
    if (viewport) {
      viewport.addEventListener('mousedown', function (e) {
        if (_zoomLevel > 1.01) {
          // Panning mode when zoomed
          _isPanning = true
          _panStart = { x: e.clientX - _panOffset.x, y: e.clientY - _panOffset.y }
          e.preventDefault()
          return
        }
        if (_compareMode === 'slider') {
          _isDragging = true
          _handleSliderDrag(e)
        } else if (_compareMode === 'horizontal') {
          _isDragging = true
          _handleHorizDrag(e)
        }
      })
      document.addEventListener('mousemove', function (e) {
        if (_isPanning) {
          _panOffset.x = e.clientX - _panStart.x
          _panOffset.y = e.clientY - _panStart.y
          // Clamp pan
          var maxPan = (_zoomLevel - 1) * 200
          _panOffset.x = Math.max(-maxPan, Math.min(maxPan, _panOffset.x))
          _panOffset.y = Math.max(-maxPan, Math.min(maxPan, _panOffset.y))
          _applySyncZoom()
          return
        }
        if (!_isDragging) return
        if (_compareMode === 'slider') _handleSliderDrag(e)
        else if (_compareMode === 'horizontal') _handleHorizDrag(e)
      })
      document.addEventListener('mouseup', function () {
        _isDragging = false
        _isPanning = false
      })

      // Touch
      viewport.addEventListener('touchstart', function (e) {
        if (_zoomLevel > 1.01) {
          _isPanning = true
          _panStart = { x: e.touches[0].clientX - _panOffset.x, y: e.touches[0].clientY - _panOffset.y }
          return
        }
        if (_compareMode === 'slider') {
          _isDragging = true
          _handleSliderDrag(e.touches[0])
        } else if (_compareMode === 'horizontal') {
          _isDragging = true
          _handleHorizDrag(e.touches[0])
        }
      }, { passive: true })
      document.addEventListener('touchmove', function (e) {
        if (_isPanning) {
          _panOffset.x = e.touches[0].clientX - _panStart.x
          _panOffset.y = e.touches[0].clientY - _panStart.y
          var maxPan = (_zoomLevel - 1) * 200
          _panOffset.x = Math.max(-maxPan, Math.min(maxPan, _panOffset.x))
          _panOffset.y = Math.max(-maxPan, Math.min(maxPan, _panOffset.y))
          _applySyncZoom()
          return
        }
        if (!_isDragging) return
        if (_compareMode === 'slider') _handleSliderDrag(e.touches[0])
        else if (_compareMode === 'horizontal') _handleHorizDrag(e.touches[0])
      }, { passive: true })
      document.addEventListener('touchend', function () {
        _isDragging = false
        _isPanning = false
      })

      // Side-by-side: sync zoom on mouse move (only for sidebyside legacy zoom)
      viewport.addEventListener('mousemove', function (e) {
        if (_compareMode !== 'sidebyside' || _zoomLevel > 1.01) return
        var rect = viewport.getBoundingClientRect()
        _zoomCenter.x = ((e.clientX - rect.left) / rect.width) * 100
        _zoomCenter.y = ((e.clientY - rect.top) / rect.height) * 100
        _updateZoom()
      })

      // Synchronized zoom on scroll wheel
      viewport.addEventListener('wheel', function (e) {
        e.preventDefault()
        var rect = viewport.getBoundingClientRect()
        _zoomCenter.x = ((e.clientX - rect.left) / rect.width) * 100
        _zoomCenter.y = ((e.clientY - rect.top) / rect.height) * 100

        var delta = e.deltaY > 0 ? -0.15 : 0.15
        _zoomLevel = Math.max(1, Math.min(3, _zoomLevel + delta))

        // Reset pan when zooming out to 1x
        if (_zoomLevel <= 1.01) {
          _panOffset = { x: 0, y: 0 }
        }

        _applySyncZoom()

        // Update zoom range if in sidebyside mode
        var zoomRange = document.getElementById('fmcZoomRange')
        if (zoomRange) {
          zoomRange.value = Math.round(_zoomLevel * 100)
          if (zoomRange.nextElementSibling) zoomRange.nextElementSibling.textContent = Math.round(_zoomLevel * 100) + '%'
        }
      }, { passive: false })
    }

    // Range slider
    var range = document.getElementById('fmcRange')
    if (range) range.addEventListener('input', function () { _updateSlider(parseInt(this.value)) })

    // ESC to close
    document.addEventListener('keydown', function _escHandler(e) {
      if (e.key === 'Escape') {
        FM._closeCompare()
        document.removeEventListener('keydown', _escHandler)
      }
    })
  }

  function _handleSliderDrag(e) {
    var viewport = document.getElementById('fmcViewport')
    if (!viewport) return
    var rect = viewport.getBoundingClientRect()
    var pos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    _updateSlider(pos)
    var range = document.getElementById('fmcRange')
    if (range) range.value = pos
  }

  function _handleHorizDrag(e) {
    var viewport = document.getElementById('fmcViewport')
    if (!viewport) return
    var rect = viewport.getBoundingClientRect()
    var pos = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    _updateHorizontalSlider(pos)
    var horizRange = document.getElementById('fmcHorizRange')
    if (horizRange) horizRange.value = pos
  }

  // ── Export Instagram ──────────────────────────────────────

  FM._exportCompare = function () {
    FM._showLoading('Gerando imagem Instagram...')

    var size = 1080
    var c = document.createElement('canvas')
    c.width = size; c.height = size
    var ctx = c.getContext('2d')

    // Background
    ctx.fillStyle = '#2C2C2C'
    ctx.fillRect(0, 0, size, size)

    // Draw based on mode
    if (_compareMode === 'slider' || _compareMode === 'horizontal') {
      if (_compareMode === 'horizontal') {
        // Top: ANTES, Bottom: DEPOIS
        var splitY = size * _sliderPos / 100
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 80, size, splitY - 80)
        ctx.clip()
        _drawImageCover(ctx, _beforeImg, 0, 80, size, size - 160)
        ctx.restore()
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, splitY, size, size - 60 - splitY)
        ctx.clip()
        _drawImageCover(ctx, _afterImg, 0, 80, size, size - 160)
        ctx.restore()
        ctx.fillStyle = '#C8A97E'
        ctx.fillRect(0, splitY - 1.5, size, 3)
      } else {
        var splitX = size * _sliderPos / 100
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 80, splitX, size - 160)
        ctx.clip()
        _drawImageCover(ctx, _beforeImg, 0, 80, size, size - 160)
        ctx.restore()
        ctx.save()
        ctx.beginPath()
        ctx.rect(splitX, 80, size - splitX, size - 160)
        ctx.clip()
        _drawImageCover(ctx, _afterImg, 0, 80, size, size - 160)
        ctx.restore()
        ctx.fillStyle = '#C8A97E'
        ctx.fillRect(splitX - 1.5, 80, 3, size - 160)
        ctx.beginPath()
        ctx.arc(splitX, size / 2, 20, 0, Math.PI * 2)
        ctx.fillStyle = '#C8A97E'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    } else if (_compareMode === 'sidebyside') {
      var gap = 8
      var pw = (size - gap) / 2
      _drawImageCover(ctx, _beforeImg, 0, 80, pw, size - 160)
      _drawImageCover(ctx, _afterImg, pw + gap, 80, pw, size - 160)
    } else {
      _drawImageCover(ctx, _afterImg, 0, 80, size, size - 160)
    }

    // Labels
    ctx.font = '600 28px Montserrat, Inter, sans-serif'
    ctx.fillStyle = '#fff'
    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur = 8
    if (_compareMode === 'sidebyside') {
      ctx.textAlign = 'center'
      ctx.fillText('ANTES', size / 4, size - 100)
      ctx.fillText('DEPOIS', size * 3 / 4, size - 100)
    } else if (_compareMode === 'horizontal') {
      ctx.textAlign = 'center'
      ctx.fillText('ANTES', size / 2, 120)
      ctx.fillText('DEPOIS', size / 2, size - 100)
    } else {
      ctx.textAlign = 'left'
      ctx.fillText('ANTES', 30, size - 100)
      ctx.textAlign = 'right'
      ctx.fillText('DEPOIS', size - 30, size - 100)
    }
    ctx.shadowBlur = 0

    // Header: brand
    ctx.fillStyle = 'rgba(44,44,44,0.85)'
    ctx.fillRect(0, 0, size, 80)
    ctx.font = '300 26px Cormorant Garamond, serif'
    ctx.fillStyle = '#F5F0E8'
    ctx.textAlign = 'center'
    ctx.fillText('Clinica Mirian de Paula', size / 2, 38)
    ctx.font = '500 11px Montserrat, sans-serif'
    ctx.fillStyle = '#C8A97E'
    ctx.letterSpacing = '0.15em'
    ctx.fillText('RESULTADO DO TRATAMENTO', size / 2, 60)

    // Footer
    ctx.fillStyle = 'rgba(44,44,44,0.85)'
    ctx.fillRect(0, size - 60, size, 60)
    var name = FM._lead ? (FM._lead.nome || FM._lead.name || '') : ''
    ctx.font = '400 13px Montserrat, sans-serif'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.textAlign = 'center'
    ctx.fillText((name ? name + '  •  ' : '') + FM._formatDate(new Date()), size / 2, size - 30)

    // Watermark
    ctx.font = 'italic 300 10px Cormorant Garamond, serif'
    ctx.fillStyle = 'rgba(200,169,126,0.3)'
    ctx.textAlign = 'right'
    ctx.fillText('Clinica Mirian de Paula', size - 20, size - 12)

    // Download
    var link = document.createElement('a')
    var pName = (name || 'paciente').replace(/\s+/g, '-').toLowerCase()
    link.download = 'comparativo-' + pName + '-' + FM._dateStr() + '.png'
    link.href = c.toDataURL('image/png')
    link.click()

    FM._hideLoading()
    FM._showToast('Imagem Instagram exportada!', 'success')
  }

  function _drawImageCover(ctx, img, dx, dy, dw, dh) {
    var sr = img.width / img.height
    var dr = dw / dh
    var sx, sy, sw, sh
    if (sr > dr) {
      sh = img.height; sw = sh * dr
      sx = (img.width - sw) / 2; sy = 0
    } else {
      sw = img.width; sh = sw / dr
      sx = 0; sy = (img.height - sh) / 2
    }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
  }

  // ── Close ─────────────────────────────────────────────────

  FM._closeCompare = function () {
    _stopAutoTimer()
    if (_overlay) { _overlay.remove(); _overlay = null }
    document.body.style.overflow = ''
  }

  // ── Upload photo directly into comparator ──
  FM._compareUpload = function (which, input) {
    var file = input.files[0]
    if (!file) return
    var url = URL.createObjectURL(file)
    var img = new Image()
    img.onload = function () {
      if (which === 'before') {
        _beforeImg = img
      } else {
        _afterImg = img
      }
      _updateCompareImages()
      FM._showToast && FM._showToast((which === 'before' ? 'ANTES' : 'DEPOIS') + ' atualizado', 'success')
    }
    img.src = url
  }

  FM._compareFromUrl = function (which) {
    var label = which === 'before' ? 'ANTES' : 'DEPOIS'
    var url = prompt('Cole a URL da imagem ' + label + ' (Google Drive, link direto):')
    if (!url) return
    var driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
    if (driveMatch) {
      url = 'https://drive.google.com/uc?export=view&id=' + driveMatch[1]
    }
    which = which === 'before' ? 'antes' : 'depois'
    var img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = function () {
      if (which === 'antes') _beforeImg = img
      else _afterImg = img
      _updateCompareImages()
      FM._showToast && FM._showToast((which === 'antes' ? 'ANTES' : 'DEPOIS') + ' carregado da URL', 'success')
    }
    img.onerror = function () {
      FM._showToast && FM._showToast('Erro ao carregar imagem. Verifique a URL.', 'error')
    }
    img.src = url
  }

  function _updateCompareImages() {
    if (!_beforeImg || !_afterImg || !_overlay) return
    // Update all mode images
    var allBefore = _overlay.querySelectorAll('.fmc-img-before img, .fmc-fade-before, .fmc-side-panel-before img, .fmc-horiz-before img')
    var allAfter = _overlay.querySelectorAll('.fmc-img-after img, .fmc-fade-after, .fmc-side-panel-after img, .fmc-horiz-after img')
    allBefore.forEach(function (el) { el.src = _beforeImg.src })
    allAfter.forEach(function (el) { el.src = _afterImg.src })
    // Also update fmcFadeAfter specifically
    var fadeAfter = document.getElementById('fmcFadeAfter')
    if (fadeAfter) fadeAfter.src = _afterImg.src
  }

  // ── Public API ────────────────────────────────────────────
  FM._compareToggleAutoTimer = _toggleAutoTimer
  FM._compareSwitchAngle = _switchAngle

})()
