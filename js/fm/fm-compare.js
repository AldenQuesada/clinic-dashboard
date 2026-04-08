/**
 * fm-compare.js — Premium ANTES vs DEPOIS comparison tool
 * 3 modes: Slider Reveal, Crossfade, Side-by-Side Zoom
 * Instagrammable export (1080x1080)
 */
;(function () {
  'use strict'

  var FM = window._FM

  // ── State ─────────────────────────────────────────────────
  var _compareMode = 'slider' // slider | fade | sidebyside
  var _sliderPos = 50         // percentage (0-100)
  var _fadeOpacity = 0        // 0-100
  var _zoomLevel = 1
  var _zoomCenter = { x: 50, y: 50 } // percentage
  var _isDragging = false
  var _beforeImg = null
  var _afterImg = null
  var _overlay = null

  // ── Open Comparator ───────────────────────────────────────

  FM._openCompare = function () {
    // Need at least 1 ANTES photo. DEPOIS is optional (uses simulation)
    var beforeAngle = FM._photoUrls['45'] || FM._photoUrls['front'] || FM._photoUrls['lateral']
    if (!beforeAngle) {
      FM._showToast('Envie pelo menos uma foto ANTES para comparar.', 'warn')
      return
    }

    var afterSrc = FM._afterPhotoUrl || FM._simPhotoUrl || null
    if (!afterSrc) {
      // Generate simulation first
      FM._showLoading('Gerando simulacao...')
      FM._generateSimulation(function () {
        FM._hideLoading()
        afterSrc = FM._simPhotoUrl
        if (afterSrc) _buildCompareUI(beforeAngle, afterSrc)
        else FM._showToast('Nenhuma foto DEPOIS ou simulacao disponivel.', 'warn')
      })
      return
    }

    _buildCompareUI(beforeAngle, afterSrc)
  }

  function _buildCompareUI(beforeSrc, afterSrc) {
    // Preload images
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

    _overlay = document.createElement('div')
    _overlay.id = 'fmCompareOverlay'
    _overlay.className = 'fmc-overlay'

    var name = FM._lead ? (FM._lead.nome || FM._lead.name || '') : ''

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
          '</div>' +
          '<div class="fmc-actions">' +
            '<button class="fmc-btn-export" onclick="FaceMapping._exportCompare()">' +
              FM._icon('download', 14) + ' Instagram</button>' +
            '<button class="fmc-btn-close" onclick="FaceMapping._closeCompare()">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +

        // Viewport
        '<div class="fmc-viewport" id="fmcViewport">' +
          // Slider mode
          '<div class="fmc-slider-wrap" id="fmcSliderWrap">' +
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
          '<div class="fmc-fade-wrap" id="fmcFadeWrap" style="display:none">' +
            '<img class="fmc-fade-before" src="' + _beforeImg.src + '" draggable="false">' +
            '<img class="fmc-fade-after" id="fmcFadeAfter" src="' + _afterImg.src + '" draggable="false">' +
            '<span class="fmc-label fmc-label-before" style="left:20px">ANTES</span>' +
            '<span class="fmc-label fmc-label-after" style="right:20px">DEPOIS</span>' +
          '</div>' +

          // Side-by-side (hidden by default)
          '<div class="fmc-side-wrap" id="fmcSideWrap" style="display:none">' +
            '<div class="fmc-side-panel">' +
              '<img src="' + _beforeImg.src + '" draggable="false">' +
              '<span class="fmc-label fmc-label-before">ANTES</span>' +
            '</div>' +
            '<div class="fmc-side-panel">' +
              '<img src="' + _afterImg.src + '" draggable="false">' +
              '<span class="fmc-label fmc-label-after">DEPOIS</span>' +
            '</div>' +
          '</div>' +
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

    _bindCompareEvents()
    _setMode(_compareMode)
    _updateSlider(50)
  }

  // ── Mode Switching ────────────────────────────────────────

  function _setMode(mode) {
    _compareMode = mode

    var sliderWrap = document.getElementById('fmcSliderWrap')
    var fadeWrap = document.getElementById('fmcFadeWrap')
    var sideWrap = document.getElementById('fmcSideWrap')
    var controls = document.getElementById('fmcControls')

    if (sliderWrap) sliderWrap.style.display = mode === 'slider' ? '' : 'none'
    if (fadeWrap) fadeWrap.style.display = mode === 'fade' ? '' : 'none'
    if (sideWrap) sideWrap.style.display = mode === 'sidebyside' ? '' : 'none'

    // Update control
    if (controls) {
      if (mode === 'slider') {
        controls.innerHTML = '<div class="fmc-slider-control"><input type="range" id="fmcRange" min="0" max="100" value="' + _sliderPos + '" class="fmc-range"></div>'
        var range = document.getElementById('fmcRange')
        if (range) range.addEventListener('input', function () { _updateSlider(parseInt(this.value)) })
      } else if (mode === 'fade') {
        controls.innerHTML = '<div class="fmc-fade-control"><span class="fmc-fade-label">ANTES</span><input type="range" id="fmcFadeRange" min="0" max="100" value="' + _fadeOpacity + '" class="fmc-range"><span class="fmc-fade-label">DEPOIS</span></div>'
        var fadeRange = document.getElementById('fmcFadeRange')
        if (fadeRange) fadeRange.addEventListener('input', function () { _updateFade(parseInt(this.value)) })
      } else {
        controls.innerHTML = '<div class="fmc-zoom-control"><span class="fmc-fade-label">Zoom</span><input type="range" id="fmcZoomRange" min="100" max="300" value="' + Math.round(_zoomLevel * 100) + '" class="fmc-range"><span class="fmc-fade-label">' + Math.round(_zoomLevel * 100) + '%</span></div>'
        var zoomRange = document.getElementById('fmcZoomRange')
        if (zoomRange) zoomRange.addEventListener('input', function () {
          _zoomLevel = parseInt(this.value) / 100
          _updateZoom()
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

  function _updateFade(val) {
    _fadeOpacity = val
    var afterEl = document.getElementById('fmcFadeAfter')
    if (afterEl) afterEl.style.opacity = val / 100

    // Update labels
    var labels = document.querySelectorAll('.fmc-fade-wrap .fmc-label')
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

  // ── Events ────────────────────────────────────────────────

  function _bindCompareEvents() {
    // Mode buttons
    document.querySelectorAll('.fmc-mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { _setMode(this.getAttribute('data-mode')) })
    })

    // Slider drag on viewport
    var viewport = document.getElementById('fmcViewport')
    if (viewport) {
      viewport.addEventListener('mousedown', function (e) {
        if (_compareMode !== 'slider') return
        _isDragging = true
        _handleSliderDrag(e)
      })
      document.addEventListener('mousemove', function (e) {
        if (!_isDragging || _compareMode !== 'slider') return
        _handleSliderDrag(e)
      })
      document.addEventListener('mouseup', function () { _isDragging = false })

      // Touch
      viewport.addEventListener('touchstart', function (e) {
        if (_compareMode !== 'slider') return
        _isDragging = true
        _handleSliderDrag(e.touches[0])
      }, { passive: true })
      document.addEventListener('touchmove', function (e) {
        if (!_isDragging || _compareMode !== 'slider') return
        _handleSliderDrag(e.touches[0])
      }, { passive: true })
      document.addEventListener('touchend', function () { _isDragging = false })

      // Side-by-side: sync zoom on mouse move
      viewport.addEventListener('mousemove', function (e) {
        if (_compareMode !== 'sidebyside') return
        var rect = viewport.getBoundingClientRect()
        _zoomCenter.x = ((e.clientX - rect.left) / rect.width) * 100
        _zoomCenter.y = ((e.clientY - rect.top) / rect.height) * 100
        _updateZoom()
      })
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
    if (_compareMode === 'slider') {
      // Left half: ANTES, right half: DEPOIS
      var splitX = size * _sliderPos / 100
      // Before (left)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 80, splitX, size - 160)
      ctx.clip()
      _drawImageCover(ctx, _beforeImg, 0, 80, size, size - 160)
      ctx.restore()
      // After (right)
      ctx.save()
      ctx.beginPath()
      ctx.rect(splitX, 80, size - splitX, size - 160)
      ctx.clip()
      _drawImageCover(ctx, _afterImg, 0, 80, size, size - 160)
      ctx.restore()
      // Divider line
      ctx.fillStyle = '#C8A97E'
      ctx.fillRect(splitX - 1.5, 80, 3, size - 160)
      // Handle
      ctx.beginPath()
      ctx.arc(splitX, size / 2, 20, 0, Math.PI * 2)
      ctx.fillStyle = '#C8A97E'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    } else if (_compareMode === 'sidebyside') {
      var gap = 8
      var pw = (size - gap) / 2
      _drawImageCover(ctx, _beforeImg, 0, 80, pw, size - 160)
      _drawImageCover(ctx, _afterImg, pw + gap, 80, pw, size - 160)
    } else {
      // Fade: just show the after
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
    ctx.font = '300 10px Montserrat, sans-serif'
    ctx.fillStyle = 'rgba(200,169,126,0.3)'
    ctx.textAlign = 'right'
    ctx.fillText('clinicamiriandepaula.com.br', size - 20, size - 12)

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
    if (_overlay) { _overlay.remove(); _overlay = null }
    document.body.style.overflow = ''
  }

})()
