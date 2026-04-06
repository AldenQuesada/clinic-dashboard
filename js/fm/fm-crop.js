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
      '<div style="background:#fff;border-radius:14px;width:420px;box-shadow:0 24px 80px rgba(0,0,0,0.3);overflow:hidden">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #E8EAF0">' +
          '<span style="font-size:14px;font-weight:600;color:#1A1B2E">Recortar — ANTES ' + (FM.ANGLES.find(function (a) { return a.id === angle }) || {}).label + '</span>' +
          '<button onclick="document.getElementById(\'fmCropOverlay\').remove()" style="width:28px;height:28px;border-radius:50%;background:#F3F4F6;border:none;cursor:pointer;color:#6B7280;display:flex;align-items:center;justify-content:center">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;align-items:center;gap:10px">' +
          '<div id="fmCropBox" style="width:' + boxW + 'px;height:' + boxH + 'px;overflow:hidden;border-radius:8px;border:2px solid #E8EAF0;position:relative;cursor:grab;background:#111">' +
            '<canvas id="fmCropCanvas" style="position:absolute;top:0;left:0"></canvas>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;width:100%">' +
            '<span style="font-size:11px;color:#9CA3AF">Zoom</span>' +
            '<input type="range" id="fmCropZoom" min="0.3" max="3" step="0.02" value="1" style="flex:1">' +
            '<span id="fmCropZoomLabel" style="font-size:11px;color:#9CA3AF;min-width:36px">100%</span>' +
          '</div>' +
          '<div style="display:flex;gap:8px;width:100%">' +
            '<button onclick="document.getElementById(\'fmCropOverlay\').remove()" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:10px 16px;border:1px solid #E8EAF0;border-radius:10px;background:#fff;color:#374151;font-size:13px;font-weight:500;cursor:pointer">Cancelar</button>' +
            '<button id="fmCropConfirm" style="flex:2;display:flex;align-items:center;justify-content:center;gap:5px;padding:10px 16px;border:none;border-radius:10px;background:#C8A97E;color:#fff;font-size:14px;font-weight:600;cursor:pointer">' + FM._icon('check', 16) + ' Salvar Recorte</button>' +
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
      var outCanvas = document.createElement('canvas')
      outCanvas.width = FM._cropCanvas.width
      outCanvas.height = FM._cropCanvas.height
      var outCtx = outCanvas.getContext('2d')
      outCtx.fillStyle = '#000000'
      outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height)
      outCtx.drawImage(FM._cropCanvas, 0, 0)

      var confirmBtn = document.getElementById('fmCropConfirm')
      if (confirmBtn) confirmBtn.textContent = 'Removendo fundo...'

      outCanvas.toBlob(function (blob) {
        FM._removeBackground(blob, function (processedBlob) {
          if (FM._photoUrls[FM._pendingCropAngle]) URL.revokeObjectURL(FM._photoUrls[FM._pendingCropAngle])
          FM._photoUrls[FM._pendingCropAngle] = URL.createObjectURL(processedBlob)
          FM._photos[FM._pendingCropAngle] = processedBlob

          if (!FM._activeAngle) FM._activeAngle = FM._pendingCropAngle

          document.getElementById('fmCropOverlay').remove()
          FM._render()
          FM._autoSave()
          if (FM._activeAngle === FM._pendingCropAngle) setTimeout(FM._initCanvas, 50)
        })
      }, 'image/png')
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

  // ── Background Removal ────────────────────────────────────

  FM._removeBackground = function (blob, callback) {
    var img = new Image()
    img.onload = function () {
      var w = img.width, h = img.height
      var c = document.createElement('canvas')
      c.width = w; c.height = h
      var ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)

      var pixels = ctx.getImageData(0, 0, w, h)
      var data = pixels.data

      var bgSamples = []
      var sampleSize = Math.floor(Math.min(w, h) * 0.05)
      for (var sy = 0; sy < sampleSize; sy++) {
        for (var sx = 0; sx < sampleSize; sx++) {
          var i = (sy * w + sx) * 4
          bgSamples.push([data[i], data[i+1], data[i+2]])
          i = (sy * w + (w - 1 - sx)) * 4
          bgSamples.push([data[i], data[i+1], data[i+2]])
        }
      }

      var avgR = 0, avgG = 0, avgB = 0
      bgSamples.forEach(function (s) { avgR += s[0]; avgG += s[1]; avgB += s[2] })
      avgR = Math.round(avgR / bgSamples.length)
      avgG = Math.round(avgG / bgSamples.length)
      avgB = Math.round(avgB / bgSamples.length)

      var tolerance = 55

      for (var pi = 0; pi < data.length; pi += 4) {
        var dr = Math.abs(data[pi] - avgR)
        var dg = Math.abs(data[pi+1] - avgG)
        var db = Math.abs(data[pi+2] - avgB)
        var dist = Math.sqrt(dr * dr + dg * dg + db * db)

        if (dist < tolerance) {
          data[pi] = 0; data[pi+1] = 0; data[pi+2] = 0
        }
      }

      var softTolerance = tolerance * 1.3
      for (var pi = 0; pi < data.length; pi += 4) {
        if (data[pi] === 0 && data[pi+1] === 0 && data[pi+2] === 0) continue
        var dr = Math.abs(data[pi] - avgR)
        var dg = Math.abs(data[pi+1] - avgG)
        var db = Math.abs(data[pi+2] - avgB)
        var dist = Math.sqrt(dr * dr + dg * dg + db * db)

        if (dist < softTolerance) {
          var blend = (softTolerance - dist) / (softTolerance - tolerance)
          blend = Math.max(0, Math.min(1, blend))
          data[pi] = Math.round(data[pi] * (1 - blend))
          data[pi+1] = Math.round(data[pi+1] * (1 - blend))
          data[pi+2] = Math.round(data[pi+2] * (1 - blend))
        }
      }

      ctx.putImageData(pixels, 0, 0)

      c.toBlob(function (resultBlob) {
        console.log('[FaceMapping] Background removed (canvas method)')
        callback(resultBlob)
      }, 'image/png')
    }
    img.src = URL.createObjectURL(blob)
  }

})()
