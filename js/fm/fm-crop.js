/**
 * fm-crop.js — Crop modal, pan/zoom, background removal
 */
;(function () {
  'use strict'

  var FM = window._FM

  FM._openCropModal = function (imgSrc, angle) {
    FM._pendingCropAngle = angle
    FM._cropZoom = 1
    FM._cropPanX = 0
    FM._cropPanY = 0

    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmCropOverlay'

    var boxW = 360, boxH = 300

    overlay.innerHTML =
      '<div class="fm-crop-modal">' +
        '<div class="fm-crop-header">' +
          '<span class="fm-crop-title">Recortar — ANTES ' + (FM.ANGLES.find(function (a) { return a.id === angle }) || {}).label + '</span>' +
          '<button class="fm-crop-close" onclick="document.getElementById(\'fmCropOverlay\').remove()">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="fm-crop-body">' +
          '<div id="fmCropBox" class="fm-crop-box" style="width:' + boxW + 'px;height:' + boxH + 'px">' +
            '<canvas id="fmCropCanvas" style="position:absolute;top:0;left:0"></canvas>' +
          '</div>' +
          '<div class="fm-crop-zoom-row">' +
            '<span class="fm-crop-zoom-label">Zoom</span>' +
            '<input type="range" id="fmCropZoom" class="fm-crop-slider" min="0.3" max="3" step="0.02" value="1">' +
            '<span id="fmCropZoomLabel" class="fm-crop-zoom-label" style="min-width:36px">100%</span>' +
          '</div>' +
          '<div class="fm-crop-actions">' +
            '<button class="fm-crop-btn-cancel" onclick="document.getElementById(\'fmCropOverlay\').remove()">Cancelar</button>' +
            '<button id="fmCropConfirm" class="fm-crop-btn-confirm">' + FM._icon('check', 16) + ' Salvar Recorte</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)

    FM._cropCanvas = document.getElementById('fmCropCanvas')
    FM._cropCtx = FM._cropCanvas.getContext('2d')

    var dpr = Math.max(window.devicePixelRatio || 1, 2)

    FM._cropImg = new Image()
    FM._cropImg.onload = function () {
      FM._cropCanvas.width = boxW * dpr
      FM._cropCanvas.height = boxH * dpr
      FM._cropCanvas.style.width = boxW + 'px'
      FM._cropCanvas.style.height = boxH + 'px'
      FM._cropCtx.scale(dpr, dpr)

      var scaleW = boxW / FM._cropImg.width
      var scaleH = boxH / FM._cropImg.height
      FM._cropZoom = Math.max(scaleW, scaleH)

      var drawW = FM._cropImg.width * FM._cropZoom
      var drawH = FM._cropImg.height * FM._cropZoom
      FM._cropPanX = (boxW - drawW) / 2
      FM._cropPanY = (boxH - drawH) / 2

      var slider = document.getElementById('fmCropZoom')
      slider.min = (FM._cropZoom * 0.5).toFixed(2)
      slider.max = (FM._cropZoom * 5).toFixed(2)
      slider.value = FM._cropZoom
      document.getElementById('fmCropZoomLabel').textContent = Math.round(FM._cropZoom * 100) + '%'

      FM._cropRedraw()
      FM._bindCropEvents(boxW, boxH)
    }
    FM._cropImg.src = imgSrc
  }

  FM._cropRedraw = function () {
    if (!FM._cropCtx || !FM._cropImg) return
    FM._cropCtx.clearRect(0, 0, FM._cropCanvas.width, FM._cropCanvas.height)

    var w = FM._cropImg.width * FM._cropZoom
    var h = FM._cropImg.height * FM._cropZoom
    FM._cropCtx.drawImage(FM._cropImg, FM._cropPanX, FM._cropPanY, w, h)
  }

  FM._bindCropEvents = function (boxW, boxH) {
    var box = document.getElementById('fmCropBox')
    var slider = document.getElementById('fmCropZoom')
    var label = document.getElementById('fmCropZoomLabel')
    var confirm = document.getElementById('fmCropConfirm')

    box.addEventListener('mousedown', function (e) {
      FM._cropDragging = true
      FM._cropDragStart = { x: e.clientX - FM._cropPanX, y: e.clientY - FM._cropPanY }
      box.style.cursor = 'grabbing'
    })
    document.addEventListener('mousemove', FM._cropMouseMove)
    document.addEventListener('mouseup', function () {
      FM._cropDragging = false
      if (box) box.style.cursor = 'grab'
    })

    box.addEventListener('touchstart', function (e) {
      e.preventDefault()
      var t = e.touches[0]
      FM._cropDragging = true
      FM._cropDragStart = { x: t.clientX - FM._cropPanX, y: t.clientY - FM._cropPanY }
    })
    document.addEventListener('touchmove', function (e) {
      if (!FM._cropDragging) return
      var t = e.touches[0]
      FM._cropPanX = t.clientX - FM._cropDragStart.x
      FM._cropPanY = t.clientY - FM._cropDragStart.y
      FM._cropRedraw()
    })
    document.addEventListener('touchend', function () { FM._cropDragging = false })

    slider.addEventListener('input', function () {
      var oldZoom = FM._cropZoom
      FM._cropZoom = parseFloat(this.value)
      label.textContent = Math.round(FM._cropZoom * 100) + '%'

      var cx = boxW / 2, cy = boxH / 2
      FM._cropPanX = cx - (cx - FM._cropPanX) * (FM._cropZoom / oldZoom)
      FM._cropPanY = cy - (cy - FM._cropPanY) * (FM._cropZoom / oldZoom)
      FM._cropRedraw()
    })

    confirm.addEventListener('click', function () {
      // Render crop at HIGH RESOLUTION using the original image
      // (not the small crop canvas which is display-sized)
      var dpr = Math.max(window.devicePixelRatio || 1, 2)
      var outW = boxW * dpr   // e.g. 720
      var outH = boxH * dpr   // e.g. 600

      // If original image is bigger, use it for better quality
      if (FM._cropImg && FM._cropImg.width > outW) {
        var scale = FM._cropImg.width / (boxW * FM._cropZoom)
        outW = Math.round(boxW * scale)
        outH = Math.round(boxH * scale)
      }

      // Cap at 2048 to avoid memory issues
      if (outW > 2048) { var ratio = 2048 / outW; outW = 2048; outH = Math.round(outH * ratio) }

      var outCanvas = document.createElement('canvas')
      outCanvas.width = outW
      outCanvas.height = outH
      var outCtx = outCanvas.getContext('2d')
      outCtx.fillStyle = '#000000'
      outCtx.fillRect(0, 0, outW, outH)

      // Redraw from original image at full resolution
      if (FM._cropImg) {
        var sx = outW / (boxW * dpr)  // scale factor from display to output
        var drawW = FM._cropImg.width * FM._cropZoom * sx
        var drawH = FM._cropImg.height * FM._cropZoom * sx
        var px = FM._cropPanX * sx
        var py = FM._cropPanY * sx
        outCtx.imageSmoothingEnabled = true
        outCtx.imageSmoothingQuality = 'high'
        outCtx.drawImage(FM._cropImg, px, py, drawW, drawH)
      } else {
        // Fallback: copy from crop canvas
        outCtx.drawImage(FM._cropCanvas, 0, 0, outW, outH)
      }

      // Send to Python API for background removal
      var b64 = outCanvas.toDataURL('image/png').split(',')[1]
      var apiUrl = FM.FACIAL_API_URL || 'http://localhost:8101'

      FM._showLoading('Removendo fundo com IA...')
      document.getElementById('fmCropOverlay').style.display = 'none'

      var controller = new AbortController()
      var timeout = setTimeout(function () { controller.abort() }, 10000)

      fetch(apiUrl + '/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ photo_base64: b64 }),
      })
      .then(function (res) { clearTimeout(timeout); return res.json() })
      .then(function (data) {
        FM._hideLoading()
        if (data.success && data.image_b64) {
          // Convert b64 to blob
          var binary = atob(data.image_b64)
          var arr = new Uint8Array(binary.length)
          for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
          var processedBlob = new Blob([arr], { type: 'image/png' })
          _finishCrop(processedBlob)
          FM._showToast('Fundo removido com sucesso', 'success')
        } else {
          // Fallback: use original cropped image
          outCanvas.toBlob(function (blob) { _finishCrop(blob) }, 'image/png')
        }
      })
      .catch(function (err) {
        clearTimeout(timeout)
        FM._hideLoading()
        // Fallback: use original cropped image silently
        outCanvas.toBlob(function (blob) { _finishCrop(blob) }, 'image/jpeg', 0.95)
      })

      function _finishCrop(blob) {
        if (FM._photoUrls[FM._pendingCropAngle]) URL.revokeObjectURL(FM._photoUrls[FM._pendingCropAngle])
        FM._photoUrls[FM._pendingCropAngle] = URL.createObjectURL(blob)
        FM._photos[FM._pendingCropAngle] = blob
        if (!FM._activeAngle) FM._activeAngle = FM._pendingCropAngle
        var overlay = document.getElementById('fmCropOverlay')
        if (overlay) overlay.remove()
        FM._render()
        FM._autoSave()
        if (FM._activeAngle === FM._pendingCropAngle) setTimeout(FM._initCanvas, 50)
      }
    })
  }

  FM._cropMouseMove = function (e) {
    if (!FM._cropDragging) return
    FM._cropPanX = e.clientX - FM._cropDragStart.x
    FM._cropPanY = e.clientY - FM._cropDragStart.y
    FM._cropRedraw()
  }

  FM._recrop = function (angle) {
    if (!FM._photoUrls[angle]) return
    var src = FM._photoUrls[angle]
    if (FM._photos[angle] && FM._photos[angle] instanceof File) {
      src = URL.createObjectURL(FM._photos[angle])
    }
    FM._openCropModal(src, angle)
  }

  // Background removal disabled — use dark background in clinic for best results

})()
