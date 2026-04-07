/**
 * fm-simulation.js — AI simulation generation (n8n webhook + canvas fallback)
 */
;(function () {
  'use strict'

  var FM = window._FM

  FM._generateSimulation = function (callback) {
    var srcAngle = FM._photoUrls['45'] ? '45' : (FM._photoUrls['front'] ? 'front' : 'lateral')
    if (!FM._photoUrls[srcAngle]) return

    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      var anns = FM._annotations.filter(function (a) { return a.angle === srcAngle })

      var btn = document.querySelector('.fm-btn-primary')
      if (btn) { var origBtn = btn.innerHTML; btn.textContent = 'Analisando com IA...' }

      console.log('[FaceMapping] Calling GPT via n8n webhook...')

      // 5-second timeout via AbortController
      var controller = new AbortController()
      var timeoutId = setTimeout(function () { controller.abort() }, 5000)

      fetch('https://flows.aldenquesada.site/webhook/lara-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          action: 'facial-ai',
          photo_base64: b64,
          annotations: anns.map(function (a) { return { zone: a.zone, treatment: a.treatment, ml: a.ml } }),
          lead_id: FM._lead ? (FM._lead.id || FM._lead.lead_id) : null,
          lead_name: FM._lead ? (FM._lead.nome || FM._lead.name) : 'Paciente',
          source: 'dashboard',
        }),
      })
      .then(function (res) { clearTimeout(timeoutId); return res.json() })
      .then(function (data) {
        console.log('[FaceMapping] GPT response:', data)
        if (data.success && data.analysis) {
          FM._lastAnalysis = data.analysis
          FM._autoSave() // persist analysis
        }
        FM._generateSimulationCanvas(callback)
        if (btn) { btn.innerHTML = origBtn }
      })
      .catch(function (err) {
        clearTimeout(timeoutId)
        console.warn('[FaceMapping] Webhook skipped:', err.name === 'AbortError' ? 'timeout 5s' : err.message)
        FM._generateSimulationCanvas(callback)
        if (btn) { btn.innerHTML = origBtn }
      })
    }
    img.src = FM._photoUrls[srcAngle]
  }

  FM._generateSimulationCanvas = function (callback) {
    var srcAngle = FM._photoUrls['45'] ? '45' : (FM._photoUrls['front'] ? 'front' : 'lateral')
    if (!FM._photoUrls[srcAngle]) return

    var img = new Image()
    img.onload = function () {
      var w = img.width, h = img.height
      var c = document.createElement('canvas')
      c.width = w; c.height = h
      var ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)

      var anns = FM._annotations.filter(function (a) { return a.angle === srcAngle })
      anns.forEach(function (ann) {
        var z = FM.ZONES.find(function (x) { return x.id === ann.zone })
        if (!z) return
        var scale = FM._canvas ? (w / FM._imgW) : 1
        var s = { x: ann.shape.x * scale, y: ann.shape.y * scale, rx: ann.shape.rx * scale, ry: ann.shape.ry * scale }
        ctx.save()
        ctx.beginPath()
        ctx.ellipse(s.x, s.y, s.rx * 1.2, s.ry * 1.2, 0, 0, Math.PI * 2)
        ctx.clip()
        ctx.fillStyle = z.id === 'olheira' ? 'rgba(255,240,230,0.3)' : 'rgba(255,235,220,0.15)'
        ctx.beginPath()
        ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })

      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = 'rgba(255,248,240,0.06)'
      ctx.fillRect(0, 0, w, h)
      ctx.restore()

      c.toBlob(function (blob) {
        if (FM._simPhotoUrl) URL.revokeObjectURL(FM._simPhotoUrl)
        FM._simPhotoUrl = URL.createObjectURL(blob)
        if (callback) callback()
      }, 'image/jpeg', 0.95)
    }
    img.src = FM._photoUrls[srcAngle]
  }

})()
