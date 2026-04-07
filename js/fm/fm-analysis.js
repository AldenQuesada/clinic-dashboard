/**
 * fm-analysis.js — Tercos faciais, Ricketts line, editor mode, vector generation, fullscreen
 */
;(function () {
  'use strict'

  var FM = window._FM

  FM._drawTercos = function () {
    var t = FM._tercoLines
    var y1 = t.hairline * FM._imgH
    var y2 = t.brow * FM._imgH
    var y3 = t.noseBase * FM._imgH
    var y4 = t.chin * FM._imgH

    var totalH = y4 - y1
    var sup = y2 - y1
    var med = y3 - y2
    var inf = y4 - y3
    var pSup = totalH > 0 ? Math.round(sup / totalH * 100) : 33
    var pMed = totalH > 0 ? Math.round(med / totalH * 100) : 33
    var pInf = totalH > 0 ? Math.round(inf / totalH * 100) : 33

    FM._ctx.save()

    var lines = [
      { y: y1, label: 'Linha do cabelo' },
      { y: y2, label: 'Sobrancelha' },
      { y: y3, label: 'Base do nariz' },
      { y: y4, label: 'Mento' },
    ]

    lines.forEach(function (l) {
      FM._ctx.beginPath()
      FM._ctx.strokeStyle = 'rgba(200,169,126,0.7)'
      FM._ctx.lineWidth = 1.5
      FM._ctx.setLineDash([])
      FM._ctx.moveTo(0, l.y)
      FM._ctx.lineTo(FM._imgW, l.y)
      FM._ctx.stroke()

      FM._ctx.beginPath()
      FM._ctx.fillStyle = '#C8A97E'
      FM._ctx.arc(FM._imgW - 15, l.y, 6, 0, Math.PI * 2)
      FM._ctx.fill()
      FM._ctx.strokeStyle = '#fff'
      FM._ctx.lineWidth = 2
      FM._ctx.stroke()
    })

    FM._ctx.setLineDash([])

    var barX = FM._imgW + 15
    var barW = 20
    var idealMin = 28, idealMax = 38

    function _propColor(pct) {
      if (pct >= idealMin && pct <= idealMax) return '#10B981'
      if (pct >= 24 && pct <= 42) return '#F59E0B'
      return '#EF4444'
    }

    var cSup = _propColor(pSup)
    FM._ctx.fillStyle = cSup
    FM._ctx.fillRect(barX, y1, barW, sup)

    var cMed = _propColor(pMed)
    FM._ctx.fillStyle = cMed
    FM._ctx.fillRect(barX, y2, barW, med)

    var cInf = _propColor(pInf)
    FM._ctx.fillStyle = cInf
    FM._ctx.fillRect(barX, y3, barW, inf)

    var lx = barX + barW + 10
    FM._ctx.font = '700 13px Inter, Montserrat, sans-serif'
    FM._ctx.textAlign = 'left'

    FM._ctx.fillStyle = '#F5F0E8'
    FM._ctx.fillText('Terco Superior', lx, y1 + sup / 2 - 2)
    FM._ctx.font = '400 11px Inter, Montserrat, sans-serif'
    FM._ctx.fillStyle = cSup
    FM._ctx.fillText(pSup + '%' + (pSup >= idealMin && pSup <= idealMax ? '' : (pSup < idealMin ? ' <<' : ' >>')), lx, y1 + sup / 2 + 14)

    FM._ctx.font = '700 13px Inter, Montserrat, sans-serif'
    FM._ctx.fillStyle = '#F5F0E8'
    FM._ctx.fillText('Terco Medio', lx, y2 + med / 2 - 2)
    FM._ctx.font = '400 11px Inter, Montserrat, sans-serif'
    FM._ctx.fillStyle = cMed
    FM._ctx.fillText(pMed + '%' + (pMed >= idealMin && pMed <= idealMax ? '' : (pMed < idealMin ? ' <<' : ' >>')), lx, y2 + med / 2 + 14)

    FM._ctx.font = '700 13px Inter, Montserrat, sans-serif'
    FM._ctx.fillStyle = '#F5F0E8'
    FM._ctx.fillText('Terco Inferior', lx, y3 + inf / 2 - 2)
    FM._ctx.font = '400 11px Inter, Montserrat, sans-serif'
    FM._ctx.fillStyle = cInf
    FM._ctx.fillText(pInf + '%' + (pInf >= idealMin && pInf <= idealMax ? '' : (pInf < idealMin ? ' <' : ' >')), lx, y3 + inf / 2 + 14)

    FM._ctx.font = '400 9px Inter, Montserrat, sans-serif'
    FM._ctx.fillStyle = 'rgba(200,169,126,0.5)'
    FM._ctx.fillText('Ideal: 33% cada terco', lx, FM._imgH - 10)

    FM._ctx.restore()
  }

  FM._drawRicketts = function () {
    var np = FM._rickettsPoints.nose
    var cp = FM._rickettsPoints.chin
    var nx = np.x * FM._imgW, ny = np.y * FM._imgH
    var cx = cp.x * FM._imgW, cy = cp.y * FM._imgH

    FM._ctx.save()

    FM._ctx.beginPath()
    FM._ctx.strokeStyle = '#EF4444'
    FM._ctx.lineWidth = 2
    FM._ctx.setLineDash([])
    FM._ctx.moveTo(nx, ny)
    FM._ctx.lineTo(cx, cy)
    FM._ctx.stroke()

    var dx = cx - nx, dy = cy - ny
    var len = Math.sqrt(dx * dx + dy * dy)
    var ux = dx / len, uy = dy / len
    FM._ctx.beginPath()
    FM._ctx.strokeStyle = 'rgba(239,68,68,0.3)'
    FM._ctx.lineWidth = 1.5
    FM._ctx.setLineDash([6, 4])
    FM._ctx.moveTo(nx - ux * 30, ny - uy * 30)
    FM._ctx.lineTo(cx + ux * 30, cy + uy * 30)
    FM._ctx.stroke()
    FM._ctx.setLineDash([])

    FM._ctx.beginPath()
    FM._ctx.strokeStyle = 'rgba(239,68,68,0.4)'
    FM._ctx.lineWidth = 1
    FM._ctx.moveTo(0, ny)
    FM._ctx.lineTo(FM._imgW, ny)
    FM._ctx.stroke()

    FM._ctx.beginPath()
    FM._ctx.strokeStyle = 'rgba(239,68,68,0.4)'
    FM._ctx.lineWidth = 1
    FM._ctx.moveTo(nx, 0)
    FM._ctx.lineTo(nx, FM._imgH)
    FM._ctx.stroke()

    // Nose point
    FM._ctx.beginPath()
    FM._ctx.fillStyle = '#EF4444'
    FM._ctx.arc(nx, ny, 7, 0, Math.PI * 2)
    FM._ctx.fill()
    FM._ctx.strokeStyle = '#fff'
    FM._ctx.lineWidth = 2
    FM._ctx.stroke()
    FM._ctx.font = '600 9px Inter, sans-serif'
    FM._ctx.fillStyle = '#fff'
    FM._ctx.textAlign = 'center'
    FM._ctx.fillText('N', nx, ny + 3)

    // Chin point
    FM._ctx.beginPath()
    FM._ctx.fillStyle = '#EF4444'
    FM._ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    FM._ctx.fill()
    FM._ctx.strokeStyle = '#fff'
    FM._ctx.lineWidth = 2
    FM._ctx.stroke()
    FM._ctx.fillStyle = '#fff'
    FM._ctx.fillText('M', cx, cy + 3)

    // Labels on right panel
    var lx = FM._imgW + 15
    FM._ctx.textAlign = 'left'

    FM._ctx.font = '700 14px Inter, Montserrat, sans-serif'
    FM._ctx.fillStyle = '#F5F0E8'
    FM._ctx.fillText('Linha de Ricketts', lx, 30)

    FM._ctx.font = '400 10px Inter, Montserrat, sans-serif'
    FM._ctx.fillStyle = '#C8A97E'
    FM._ctx.fillText('Linha da beleza do perfil', lx, 48)

    FM._ctx.font = '400 10px Inter, Montserrat, sans-serif'
    FM._ctx.fillStyle = 'rgba(245,240,232,0.6)'
    var lines = [
      'Do ponto mais proeminente',
      'do nariz (N) ate o mento (M).',
      '',
      'Labios devem tocar ou ficar',
      'ligeiramente atras desta linha',
      'para um perfil harmonioso.',
      '',
      'Arraste os pontos N e M',
      'para ajustar ao rosto.',
    ]
    lines.forEach(function (line, i) {
      FM._ctx.fillText(line, lx, 75 + i * 15)
    })

    var angleDeg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI)
    FM._ctx.font = '600 12px Inter, sans-serif'
    FM._ctx.fillStyle = '#EF4444'
    FM._ctx.fillText('Angulo: ' + angleDeg + '\u00B0', lx, 230)

    FM._ctx.font = '400 9px Inter, sans-serif'
    FM._ctx.fillStyle = 'rgba(200,169,126,0.4)'
    FM._ctx.fillText('Frontal = Tercos | Lateral = Ricketts', lx, FM._imgH - 10)

    FM._ctx.restore()
  }

  FM._setEditorMode = function (mode) {
    FM._editorMode = mode
    if (mode === 'vectors') {
      if (FM._photoUrls['45']) {
        FM._activeAngle = '45'
      } else {
        alert('Vetores faciais requer foto de 45\u00B0. Faca o upload primeiro.')
        FM._editorMode = 'zones'
        return
      }
      if (FM._vectors.length === 0) FM._generateVectorsFromAnnotations()
    }
    if (mode === 'analysis') {
      if (FM._photoUrls['front']) {
        FM._activeAngle = 'front'
      } else if (FM._photoUrls['lateral']) {
        FM._activeAngle = 'lateral'
      } else {
        alert('Analise requer foto frontal ou lateral.')
        FM._editorMode = 'zones'
        return
      }
    }
    FM._selAnn = null
    FM._selVec = null
    FM._analysisDrag = null
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  FM._generateVectorsFromAnnotations = function () {
    var anns45 = FM._annotations.filter(function (a) { return a.angle === '45' })
    FM._vectors = []
    FM._nextVecId = 1
    anns45.forEach(function (ann) {
      var preset = FM.VECTOR_PRESETS[ann.zone]
      if (!preset) return
      var s = ann.shape
      FM._vectors.push({
        id: FM._nextVecId++,
        zone: ann.zone,
        start: { x: s.x, y: s.y },
        end: { x: s.x + preset.dx * FM._imgW, y: s.y + preset.dy * FM._imgH },
        curve: preset.curve,
      })
    })
  }

  // ── Auto-analyze via Python API ─────────────────────────────

  FM._autoAnalyze = function () {
    var angle = FM._activeAngle || 'front'
    if (!FM._photoUrls[angle]) {
      FM._showToast('Envie uma foto primeiro.', 'warn')
      return
    }

    FM._showLoading('Analisando rosto com IA...')

    // Convert photo to base64
    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      var apiUrl = FM.FACIAL_API_URL || 'http://localhost:8100'
      var controller = new AbortController()
      var timeout = setTimeout(function () { controller.abort() }, 8000)

      fetch(apiUrl + '/landmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ photo_base64: b64 }),
      })
      .then(function (res) { clearTimeout(timeout); return res.json() })
      .then(function (data) {
        FM._hideLoading()
        if (!data.success) {
          FM._showToast('Nenhum rosto detectado na foto.', 'error')
          return
        }

        // Auto-position terco lines from landmarks
        FM._tercoLines.hairline = data.key_points.forehead.y
        FM._tercoLines.brow = (data.landmarks[70].y + data.landmarks[300].y) / 2
        FM._tercoLines.noseBase = data.landmarks[2].y
        FM._tercoLines.chin = data.key_points.chin.y

        // Auto-position Ricketts points
        FM._rickettsPoints.nose = { x: data.key_points.nose_tip.x, y: data.key_points.nose_tip.y }
        FM._rickettsPoints.chin = { x: data.key_points.chin.x, y: data.key_points.chin.y }

        // Store full landmark data
        FM._landmarkData = data

        FM._showToast('468 pontos faciais detectados! Tercos e Ricketts posicionados.', 'success')
        FM._autoSave()
        FM._redraw()
      })
      .catch(function (err) {
        clearTimeout(timeout)
        FM._hideLoading()
        FM._showToast('API offline. Posicione manualmente.', 'warn')
      })
    }
    img.src = FM._photoUrls[angle]
  }

  FM._autoDetectZones = function () {
    var angle = FM._activeAngle || '45'
    if (!FM._photoUrls[angle]) {
      FM._showToast('Envie uma foto primeiro.', 'warn')
      return
    }

    FM._showLoading('Detectando zonas automaticamente...')

    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      var apiUrl = FM.FACIAL_API_URL || 'http://localhost:8100'
      var controller = new AbortController()
      var timeout = setTimeout(function () { controller.abort() }, 8000)

      fetch(apiUrl + '/auto-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ photo_base64: b64 }),
      })
      .then(function (res) { clearTimeout(timeout); return res.json() })
      .then(function (data) {
        FM._hideLoading()
        if (!data.success || !data.zones || data.zones.length === 0) {
          FM._showToast('Nenhuma zona detectada.', 'warn')
          return
        }

        // Create annotations from detected zones
        FM._pushUndo()
        var imgW = FM._imgW || 400
        var imgH = FM._imgH || 500

        data.zones.forEach(function (z) {
          var zoneDef = FM.ZONES.find(function (zd) { return zd.id === z.zone })
          if (!zoneDef) return

          // Convert normalized coords to canvas coords
          var cx = z.center.x * imgW
          var cy = z.center.y * imgH
          var rx = imgW * 0.06  // default ellipse size
          var ry = imgH * 0.04

          FM._annotations.push({
            id: FM._nextId++,
            angle: angle,
            zone: z.zone,
            treatment: zoneDef.defaultTx || 'ah',
            ml: zoneDef.min || 0.5,
            product: '',
            side: z.side || 'bilateral',
            shape: { x: cx, y: cy, rx: rx, ry: ry },
          })
        })

        FM._simPhotoUrl = null
        FM._autoSave()
        FM._redraw()
        FM._refreshToolbar()
        FM._showToast(data.zones.length + ' zonas detectadas automaticamente!', 'success')
      })
      .catch(function (err) {
        clearTimeout(timeout)
        FM._hideLoading()
        FM._showToast('API offline. Marque manualmente.', 'warn')
      })
    }
    img.src = FM._photoUrls[angle]
  }

  FM._toggleFullscreen = function () {
    var area = document.getElementById('fmCanvasArea')
    if (!area) return
    if (area.classList.contains('fm-fullscreen')) {
      area.classList.remove('fm-fullscreen')
      document.body.style.overflow = ''
      setTimeout(FM._initCanvas, 50)
    } else {
      area.classList.add('fm-fullscreen')
      document.body.style.overflow = 'hidden'
      setTimeout(FM._initCanvas, 50)
    }
  }

})()
