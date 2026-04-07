/**
 * fm-crop.js — Crop modal, pan/zoom, optional background removal via Python API
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

    var boxW = Math.min(520, window.innerWidth - 80)
    var boxH = Math.min(480, window.innerHeight - 200)

    overlay.innerHTML =
      '<div class="fm-crop-modal">' +
        '<div class="fm-crop-header">' +
          '<span class="fm-crop-title">Recortar — ANTES ' + (FM.ANGLES.find(function (a) { return a.id === angle }) || {}).label + '</span>' +
          '<button class="fm-crop-close" onclick="document.getElementById(\'fmCropOverlay\').remove()">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="fm-crop-body">' +
          '<div style="font-size:10px;color:#C8A97E;text-align:center;margin-bottom:6px">Enquadre o rosto — use zoom para aproximar</div>' +
          '<div id="fmCropBox" class="fm-crop-box" style="width:' + boxW + 'px;height:' + boxH + 'px">' +
            '<canvas id="fmCropCanvas" style="position:absolute;top:0;left:0"></canvas>' +
            '<div class="fm-crop-guide"></div>' +
          '</div>' +
          '<div class="fm-crop-zoom-row">' +
            '<span class="fm-crop-zoom-label">Zoom</span>' +
            '<input type="range" id="fmCropZoom" class="fm-crop-slider" min="0.3" max="3" step="0.02" value="1">' +
            '<span id="fmCropZoomLabel" class="fm-crop-zoom-label" style="min-width:36px">100%</span>' +
          '</div>' +
          '<div class="fm-crop-actions">' +
            '<button class="fm-crop-btn-cancel" onclick="document.getElementById(\'fmCropOverlay\').remove()">Cancelar</button>' +
            '<button id="fmCropConfirm" class="fm-crop-btn-confirm" style="flex:1;background:linear-gradient(135deg,#8A9E88,#6B8B6A)">' + FM._icon('zap', 16) + ' Salvar + Remover Fundo</button>' +
            '<button id="fmCropRaw" class="fm-crop-btn-confirm" style="opacity:0.5;font-size:10px">' + FM._icon('check', 14) + ' Sem processar</button>' +
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

      // Auto-zoom to face via scanner API
      FM._cropAutoZoomFace(boxW, boxH)
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

    // Pan
    box.addEventListener('mousedown', function (e) {
      FM._cropDragging = true
      FM._cropDragStart = { x: e.clientX - FM._cropPanX, y: e.clientY - FM._cropPanY }
      box.style.cursor = 'grabbing'
    })
    document.addEventListener('mousemove', FM._cropMouseMove)
    document.addEventListener('mouseup', function () { FM._cropDragging = false; if (box) box.style.cursor = 'grab' })

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

    // Zoom
    slider.addEventListener('input', function () {
      var oldZoom = FM._cropZoom
      FM._cropZoom = parseFloat(this.value)
      label.textContent = Math.round(FM._cropZoom * 100) + '%'
      var cx = boxW / 2, cy = boxH / 2
      FM._cropPanX = cx - (cx - FM._cropPanX) * (FM._cropZoom / oldZoom)
      FM._cropPanY = cy - (cy - FM._cropPanY) * (FM._cropZoom / oldZoom)
      FM._cropRedraw()
    })

    // Shared: render hi-res crop from original image
    function _renderHiRes() {
      var dpr = Math.max(window.devicePixelRatio || 1, 2)
      var outW = boxW * dpr, outH = boxH * dpr
      if (FM._cropImg && FM._cropImg.width > outW) {
        var s = FM._cropImg.width / (boxW * FM._cropZoom)
        outW = Math.round(boxW * s); outH = Math.round(boxH * s)
      }
      if (outW > 2048) { var r = 2048 / outW; outW = 2048; outH = Math.round(outH * r) }

      var c = document.createElement('canvas')
      c.width = outW; c.height = outH
      var ctx = c.getContext('2d')
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, outW, outH)
      if (FM._cropImg) {
        var sx = outW / (boxW * dpr)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(FM._cropImg, FM._cropPanX * sx, FM._cropPanY * sx,
          FM._cropImg.width * FM._cropZoom * sx, FM._cropImg.height * FM._cropZoom * sx)
      } else {
        ctx.drawImage(FM._cropCanvas, 0, 0, outW, outH)
      }
      return c
    }

    function _finishCrop(blob) {
      if (FM._photoUrls[FM._pendingCropAngle]) URL.revokeObjectURL(FM._photoUrls[FM._pendingCropAngle])
      FM._photoUrls[FM._pendingCropAngle] = URL.createObjectURL(blob)
      FM._photos[FM._pendingCropAngle] = blob
      if (!FM._activeAngle) FM._activeAngle = FM._pendingCropAngle
      var ov = document.getElementById('fmCropOverlay')
      if (ov) ov.remove()
      FM._render()
      FM._autoSave()
      if (FM._activeAngle === FM._pendingCropAngle) setTimeout(FM._initCanvas, 50)
    }

    // Helper: convert b64 to blob and finish
    function _b64ToBlob(b64) {
      var bin = atob(b64)
      var arr = new Uint8Array(bin.length)
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
      return new Blob([arr], { type: 'image/png' })
    }

    // Primary button: Salvar + Remover Fundo (auto-pipeline)
    document.getElementById('fmCropConfirm').addEventListener('click', function () {
      var canvas = _renderHiRes()
      var b64 = canvas.toDataURL('image/png').split(',')[1]
      var apiUrl = FM.FACIAL_API_URL

      FM._showLoading('Removendo fundo com IA...')
      var ov = document.getElementById('fmCropOverlay')
      if (ov) ov.style.display = 'none'

      fetch(apiUrl + '/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_base64: b64 }),
      })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.success && d.image_b64) {
          FM._hideLoading()
          _finishCrop(_b64ToBlob(d.image_b64))
          FM._showToast('Fundo removido com sucesso', 'success')
        } else {
          FM._hideLoading()
          canvas.toBlob(function (b) { _finishCrop(b) }, 'image/png')
          FM._showToast('Falha no bg removal — salvo original', 'warn')
        }
      })
      .catch(function () {
        FM._hideLoading()
        canvas.toBlob(function (b) { _finishCrop(b) }, 'image/png')
        FM._showToast('API offline — salvo sem processamento', 'warn')
      })
    })

    // Secondary button: Sem processar (raw save)
    var rawBtn = document.getElementById('fmCropRaw')
    if (rawBtn) {
      rawBtn.addEventListener('click', function () {
        var canvas = _renderHiRes()
        canvas.toBlob(function (blob) { _finishCrop(blob) }, 'image/png')
      })
    }
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

  // ── Auto-zoom to face in crop modal ─────────────────────────

  FM._cropAutoZoomFace = function (boxW, boxH) {
    if (!FM._cropImg) return

    // Send image to scanner to detect face rect
    var c = document.createElement('canvas')
    var maxDim = 640 // downscale for speed
    var ratio = Math.min(maxDim / FM._cropImg.width, maxDim / FM._cropImg.height, 1)
    c.width = Math.round(FM._cropImg.width * ratio)
    c.height = Math.round(FM._cropImg.height * ratio)
    c.getContext('2d').drawImage(FM._cropImg, 0, 0, c.width, c.height)
    var b64 = c.toDataURL('image/jpeg', 0.7).split(',')[1]

    var apiUrl = FM.FACIAL_API_URL
    if (!apiUrl) return

    fetch(apiUrl + '/landmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_base64: b64 }),
    })
    .then(function (r) { return r.json() })
    .then(function (data) {
      if (!data.success || !data.face_rect) return

      // face_rect is in pixels of the downscaled image — scale back to original
      var fr = data.face_rect
      var fx = fr.x / ratio
      var fy = fr.y / ratio
      var fw = fr.w / ratio
      var fh = fr.h / ratio

      // Add margin (30% around face for context — forehead, chin)
      var margin = Math.max(fw, fh) * 0.35
      var cx = fx + fw / 2
      var cy = fy + fh / 2
      var viewW = fw + margin * 2
      var viewH = fh + margin * 2

      // Calculate zoom to fill the crop box with the face
      var zoomX = boxW / viewW
      var zoomY = boxH / viewH
      var newZoom = Math.min(zoomX, zoomY)

      // Clamp zoom to slider range
      var slider = document.getElementById('fmCropZoom')
      if (slider) {
        newZoom = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), newZoom))
      }

      // Calculate pan to center the face
      FM._cropZoom = newZoom
      FM._cropPanX = boxW / 2 - cx * newZoom
      FM._cropPanY = boxH / 2 - cy * newZoom

      // Update slider
      if (slider) {
        slider.value = newZoom
        var label = document.getElementById('fmCropZoomLabel')
        if (label) label.textContent = Math.round(newZoom * 100) + '%'
      }

      FM._cropRedraw()
    })
    .catch(function () { /* silent — keep default zoom if API fails */ })
  }

})()
