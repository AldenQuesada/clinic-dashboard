/**
 * fm-simulation.js — Local deterministic simulation via Python API v2
 * Replaces n8n webhook with /simulate/preview (zero cost, <1s, deterministic)
 */
;(function () {
  'use strict'

  var FM = window._FM

  FM._generateSimulation = function (callback) {
    var srcAngle = FM._photoUrls['45'] ? '45' : (FM._photoUrls['front'] ? 'front' : 'lateral')
    if (!FM._photoUrls[srcAngle]) return

    // Capture target angle at START for async safety
    var simTargetAngle = srcAngle

    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      var anns = FM._annotations.filter(function (a) { return a.angle === srcAngle })

      var btn = document.querySelector('.fm-btn-primary')
      if (btn) { var origBtn = btn.innerHTML; btn.textContent = 'Simulando...' }

      FM._showLoading('Simulando resultado do tratamento...')

      // Build zones for the simulation API
      var zones = anns.map(function (a) {
        // Map frontend zone IDs to backend zone IDs
        var backendZone = _mapZoneToBackend(a.zone, a.side)
        return {
          zone: backendZone,
          severity: _mlToSeverity(a.ml, a.zone),
          treatment: (a.treatment || 'ah').toUpperCase(),
        }
      }).filter(function (z) { return z.zone })

      // Call skin analysis v2 in parallel (enrichment — does not block simulation)
      var pyApi = FM.FACIAL_API_URL
      fetch(pyApi + FM.API.skinAnalyze, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_base64: b64, generate_heatmaps: false }),
      })
      .then(function (r) { return r.json() })
      .then(function (skin) {
        if (skin.success) {
          FM._skinAnalysis = skin.scores
          FM._skinAge = skin.skin_age
          FM._zoneScores = skin.zone_scores
        }
      })
      .catch(function () { /* silent — skin analysis is optional enrichment */ })

      // Call /simulate/preview (primary — deterministic, <1s)
      var controller = new AbortController()
      var timeoutId = setTimeout(function () { controller.abort() }, 10000)

      fetch(pyApi + FM.API.simulatePreview, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          photo_base64: b64,
          zones: zones,
          intensity: 0.7,
          use_scanner: true,
        }),
      })
      .then(function (res) { clearTimeout(timeoutId); return res.json() })
      .then(function (data) {
        FM._hideLoading()
        if (data.success && data.image_b64) {
          // Convert base64 to blob URL
          var bin = atob(data.image_b64)
          var arr = new Uint8Array(bin.length)
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
          var blob = new Blob([arr], { type: 'image/png' })

          if (FM._simPhotoByAngle[simTargetAngle]) URL.revokeObjectURL(FM._simPhotoByAngle[simTargetAngle])
          FM._simPhotoByAngle[simTargetAngle] = URL.createObjectURL(blob)

          FM._showToast(data.zones_applied + ' zonas simuladas em ' + data.elapsed_s + 's', 'success')
          FM._autoSave()
          if (callback) callback()
        } else {
          // Fallback: canvas-based simulation
          FM._generateSimulationCanvas(callback)
        }
        if (btn) { btn.innerHTML = origBtn }
      })
      .catch(function (err) {
        clearTimeout(timeoutId)
        FM._hideLoading()
        // Fallback: canvas-based simulation (always works, even offline)
        FM._generateSimulationCanvas(callback)
        if (btn) { btn.innerHTML = origBtn }
      })
    }
    img.src = FM._photoUrls[srcAngle]
  }

  FM._generateSimulationCanvas = function (callback) {
    var srcAngle = FM._photoUrls['45'] ? '45' : (FM._photoUrls['front'] ? 'front' : 'lateral')
    if (!FM._photoUrls[srcAngle]) return

    // Capture target angle at START for async safety
    var canvasTargetAngle = srcAngle

    var img = new Image()
    img.onload = function () {
      var w = img.width, h = img.height
      var c = document.createElement('canvas')
      c.width = w; c.height = h
      var ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)

      var anns = FM._annotations.filter(function (a) { return a.angle === canvasTargetAngle })
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
        if (FM._simPhotoByAngle[canvasTargetAngle]) URL.revokeObjectURL(FM._simPhotoByAngle[canvasTargetAngle])
        FM._simPhotoByAngle[canvasTargetAngle] = URL.createObjectURL(blob)
        if (callback) callback()
      }, 'image/jpeg', 0.95)
    }
    img.src = FM._photoUrls[canvasTargetAngle]
  }

  // ── Helpers ─────────────────────────────────────────────────

  function _mapZoneToBackend(frontendId, side) {
    // Map frontend zone IDs to backend warp engine zone IDs
    var map = {
      'zigoma-lateral':  'zigoma_lat',
      'zigoma-anterior': 'zigoma_ant',
      'temporal':        'temporal',
      'olheira':         'olheira',
      'sulco':           'sulco',
      'marionete':       'marionete',
      'mandibula':       'mandibula',
      'mento':           'mento',
      'labio':           'labio',
      'nariz-dorso':     'nariz',
      'nariz-base':      'nariz',
      'glabela':         'glabela',
      'frontal':         'testa',
      'periorbital':     'pes_galinha',
    }

    var base = map[frontendId]
    if (!base) return null

    // Add side suffix for bilateral zones
    var bilateral = ['temporal', 'zigoma_lat', 'zigoma_ant', 'olheira', 'sulco', 'marionete', 'mandibula', 'pes_galinha']
    if (bilateral.indexOf(base) > -1) {
      if (side === 'esquerdo') return base + '_esq'
      if (side === 'direito') return base + '_dir'
      // bilateral: return both sides as separate zones
      return base + '_esq' // default to left, right will be auto-mirrored
    }
    return base
  }

  function _mlToSeverity(ml, zoneId) {
    // Convert mL/units to severity 0-3 based on zone ranges
    var zoneDef = FM.ZONES.find(function (z) { return z.id === zoneId })
    if (!zoneDef) return 1

    var range = zoneDef.max - zoneDef.min
    if (range <= 0) return 1

    var normalized = (ml - zoneDef.min) / range
    if (normalized <= 0) return 0
    if (normalized <= 0.33) return 1
    if (normalized <= 0.66) return 2
    return 3
  }

  // ── Hybrid Simulation (AI) ─────────────────────────────────
  FM._generateHybrid = function () {
    var srcAngle = FM._photoUrls['front'] ? 'front' : (FM._photoUrls['45'] ? '45' : 'lateral')
    if (!FM._photoUrls[srcAngle]) {
      FM._showToast('Envie uma foto ANTES primeiro', 'warn')
      return
    }

    var targetAngle = srcAngle

    // Load image and send to hybrid API
    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      // Build zones from annotations
      var zones = FM._annotations.filter(function (a) { return a.angle === targetAngle }).map(function (a) {
        return { zone: a.zone, severity: 2, treatment: (a.treatment || 'ah').toUpperCase() }
      })

      FM._showLoading('Gerando DEPOIS com IA hibrida...')

      fetch(FM.FACIAL_API_URL + '/simulate/hybrid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_base64: b64,
          zones: zones.length > 0 ? zones : null,
          intensity: 0.7,
          include_warp: true,
          include_texture: true,
        }),
      })
      .then(function (r) { return r.json() })
      .then(function (data) {
        FM._hideLoading()
        if (data.success && data.image_b64) {
          var bin = atob(data.image_b64)
          var arr = new Uint8Array(bin.length)
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
          var blob = new Blob([arr], { type: 'image/png' })
          if (FM._simPhotoByAngle[targetAngle]) URL.revokeObjectURL(FM._simPhotoByAngle[targetAngle])
          FM._simPhotoByAngle[targetAngle] = URL.createObjectURL(blob)
          FM._showToast('DEPOIS gerado em ' + (data.elapsed_s || '?') + 's', 'success')
          FM._autoSave()
          FM._render()
          if (FM._activeAngle === targetAngle) setTimeout(FM._initCanvas, 50)
          if (FM._viewMode === '2x') setTimeout(FM._initCanvas2, 100)
        } else {
          FM._showToast('Falha na simulacao: ' + (data.detail || 'erro'), 'error')
        }
      })
      .catch(function (err) {
        FM._hideLoading()
        FM._showToast('API offline. Tente novamente.', 'error')
      })
    }
    img.src = FM._photoUrls[srcAngle]
  }

})()
