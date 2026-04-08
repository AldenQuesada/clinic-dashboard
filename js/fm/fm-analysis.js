/**
 * fm-analysis.js — Tercos faciais, Ricketts line, editor mode, vector generation, fullscreen
 */
;(function () {
  'use strict'

  var FM = window._FM

  FM._drawTercos = function () {
    var t = FM._tercoLines
    var w = FM._imgW, h = FM._imgH
    var y1 = t.hairline * h
    var y2 = t.brow * h
    var y3 = t.noseBase * h
    var y4 = t.chin * h

    var totalH = y4 - y1
    var sup = y2 - y1
    var med = y3 - y2
    var inf = y4 - y3
    var pSup = totalH > 0 ? Math.round(sup / totalH * 100) : 33
    var pMed = totalH > 0 ? Math.round(med / totalH * 100) : 33
    var pInf = totalH > 0 ? Math.round(inf / totalH * 100) : 33

    var ctx = FM._ctx
    ctx.save()

    var idealMin = 28, idealMax = 38

    function _propColor(pct) {
      if (pct >= idealMin && pct <= idealMax) return '#10B981'
      if (pct >= 24 && pct <= 42) return '#F59E0B'
      return '#EF4444'
    }

    // Horizontal lines across the photo
    var lines = [
      { y: y1, label: 'Trichion' },
      { y: y2, label: 'Glabela' },
      { y: y3, label: 'Subnasal' },
      { y: y4, label: 'Mento' },
    ]

    lines.forEach(function (l) {
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(200,169,126,0.5)'
      ctx.lineWidth = 1
      ctx.setLineDash([6, 4])
      ctx.moveTo(0, l.y)
      ctx.lineTo(w, l.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Drag handle
      ctx.beginPath()
      ctx.fillStyle = '#C8A97E'
      ctx.arc(8, l.y, 4, 0, Math.PI * 2)
      ctx.fill()
    })

    // Color bar on the RIGHT edge of the photo (overlay, inside canvas)
    var barX = w - 28
    var barW = 16

    var cSup = _propColor(pSup)
    ctx.globalAlpha = 0.7
    ctx.fillStyle = cSup
    ctx.fillRect(barX, y1, barW, sup)

    var cMed = _propColor(pMed)
    ctx.fillStyle = cMed
    ctx.fillRect(barX, y2, barW, med)

    var cInf = _propColor(pInf)
    ctx.fillStyle = cInf
    ctx.fillRect(barX, y3, barW, inf)
    ctx.globalAlpha = 1.0

    // Labels inside the bars
    ctx.font = '700 11px Montserrat, sans-serif'
    ctx.textAlign = 'right'

    ctx.fillStyle = '#F5F0E8'
    ctx.fillText('Sup', barX - 6, y1 + sup / 2 - 2)
    ctx.font = '600 10px Montserrat, sans-serif'
    ctx.fillStyle = cSup
    ctx.fillText(pSup + '%', barX - 6, y1 + sup / 2 + 12)

    ctx.font = '700 11px Montserrat, sans-serif'
    ctx.fillStyle = '#F5F0E8'
    ctx.fillText('Med', barX - 6, y2 + med / 2 - 2)
    ctx.font = '600 10px Montserrat, sans-serif'
    ctx.fillStyle = cMed
    ctx.fillText(pMed + '%', barX - 6, y2 + med / 2 + 12)

    ctx.font = '700 11px Montserrat, sans-serif'
    ctx.fillStyle = '#F5F0E8'
    ctx.fillText('Inf', barX - 6, y3 + inf / 2 - 2)
    ctx.font = '600 10px Montserrat, sans-serif'
    ctx.fillStyle = cInf
    ctx.fillText(pInf + '%', barX - 6, y3 + inf / 2 + 12)

    // Ideal reference
    ctx.font = '400 8px Montserrat, sans-serif'
    ctx.fillStyle = 'rgba(200,169,126,0.4)'
    ctx.textAlign = 'right'
    ctx.fillText('Ideal: 33%', barX - 6, h - 6)

    ctx.restore()
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

  FM._setViewMode = function (mode) {
    FM._viewMode = mode
    FM._render()
    setTimeout(FM._initCanvas, 50)
    if (mode === '2x') {
      setTimeout(FM._initCanvas2, 100)
    }
  }

  FM._activeTab = FM._activeTab || 'simetria'
  FM._analysisSubMode = FM._analysisSubMode || 'metrics'

  FM._switchTab = function (tabId) {
    FM._activeTab = tabId
    if (tabId === 'simetria') {
      FM._editorMode = 'analysis'
      if (FM._analysisSubMode !== 'ricketts' && FM._analysisSubMode !== 'metrics') {
        FM._analysisSubMode = 'metrics'
      }
      if (FM._analysisSubMode === 'ricketts' && FM._photoUrls['lateral'] && FM._activeAngle !== 'lateral') {
        if (FM._saveAngleState) FM._saveAngleState()
        FM._activeAngle = 'lateral'
        if (FM._restoreAngleState) FM._restoreAngleState('lateral')
      }
    } else if (tabId === 'zones') {
      FM._editorMode = 'zones'
      if (FM._computeRegionPaths) FM._computeRegionPaths()
    } else if (tabId === 'vectors') {
      FM._editorMode = 'vectors'
    } else if (tabId === 'analysis') {
      FM._editorMode = 'analysis'
      FM._analysisSubMode = 'skin'
    }
    FM._render()
    setTimeout(FM._initCanvas, 50)
    if (FM._viewMode === '2x') {
      setTimeout(FM._initCanvas2, 100)
    }
  }

  FM._setEditorMode = function (mode) {
    FM._editorMode = mode
    if (mode === 'analysis' && !FM._analysisSubMode) {
      FM._analysisSubMode = 'tercos'
    }
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
    FM._pushUndo()
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

  // ── Scanner Toggle ─────────────────────────────────────────

  FM._toggleScan = function () {
    FM._scanEnabled = !FM._scanEnabled
    if (FM._scanEnabled) {
      // Auto-trigger scan if we don't have data for this angle
      FM._autoScanIfNeeded()
    } else {
      FM._scanData = null
      FM._landmarkData = null
    }
    FM._redraw()
    FM._refreshToolbar()
  }

  // Auto-trigger scan when needed (called from _initCanvas)
  FM._autoScanIfNeeded = function () {
    if (!FM._scanEnabled) return
    var angle = FM._activeAngle || 'front'
    if (!FM._photoUrls[angle]) return

    // If we have cached scan data for this angle, restore it
    if (FM._scanDataByAngle[angle]) {
      FM._scanData = FM._scanDataByAngle[angle]
      FM._landmarkData = FM._scanDataByAngle[angle]
      if (FM._computeRegionPaths) FM._computeRegionPaths()
      FM._redraw()
      return
    }

    // No cached data — run the scan
    FM._autoAnalyze()
  }

  // ── Auto-analyze via Python API ─────────────────────────────

  FM._autoAnalyze = function (silent) {
    var angle = FM._activeAngle || 'front'
    if (!FM._photoUrls[angle]) {
      if (!silent) FM._showToast('Envie uma foto primeiro.', 'warn')
      return
    }

    if (!silent) FM._showLoading('Escaneando rosto (478 pontos 3D)...')

    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      var apiUrl = FM.FACIAL_API_URL
      var controller = new AbortController()
      var timeout = setTimeout(function () { controller.abort() }, 12000)

      fetch(apiUrl + FM.API.scanFace, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ photo_base64: b64, include_landmarks: true, include_measurements: true }),
      })
      .then(function (res) { clearTimeout(timeout); return res.json() })
      .then(function (data) {
        if (!silent) FM._hideLoading()
        if (!data.success) {
          if (!silent) FM._showToast('Nenhum rosto detectado na foto.', 'error')
          return
        }

        // Auto-position terco lines from scanner thirds
        if (data.thirds && data.thirds.points) {
          FM._tercoLines.hairline = data.thirds.points.trichion.y
          FM._tercoLines.brow = data.thirds.points.glabela.y
          FM._tercoLines.noseBase = data.thirds.points.subnasal.y
          FM._tercoLines.chin = data.thirds.points.mento.y
        }

        // Auto-position Ricketts points
        if (data.ricketts) {
          FM._rickettsPoints.nose = { x: data.ricketts.nose_point.x, y: data.ricketts.nose_point.y }
          FM._rickettsPoints.chin = { x: data.ricketts.chin_point.x, y: data.ricketts.chin_point.y }
        }

        // Store full scan data (landmarks, symmetry, shape, pose, measurements)
        FM._landmarkData = data
        FM._scanData = data

        // Compute anatomical region paths for Estruturacao tab
        if (FM._computeRegionPaths) FM._computeRegionPaths()

        // Cache scan data for this angle
        FM._scanDataByAngle[angle] = data

        // Auto-enable wireframe when scan completes
        FM._showWireframe = true

        FM._autoSave()

        // Redraw canvas overlays + reinit canvas2 if in 2x mode (debounced)
        FM._redraw()
        if (FM._viewMode === '2x' && FM._initCanvas2) {
          clearTimeout(FM._canvas2InitTimer)
          FM._canvas2InitTimer = setTimeout(FM._initCanvas2, 150)
        }
        FM._refreshToolbar()

        // Auto-trigger skin + collagen + protocol in background
        if (!FM._skinAnalysis) FM._runSkinAnalysis()
        if (!FM._collagenData) FM._runCollagenScore()
        if (!FM._protocolData) FM._runProtocol()
      })
      .catch(function (err) {
        clearTimeout(timeout)
        if (!silent) FM._hideLoading()
        if (!silent) FM._showToast('API offline. Posicione manualmente.', 'warn')
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

    FM._showLoading('Detectando zonas via scanner 478pts...')

    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      var apiUrl = FM.FACIAL_API_URL
      var controller = new AbortController()
      var timeout = setTimeout(function () { controller.abort() }, 12000)

      fetch(apiUrl + FM.API.zoneCenters, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ photo_base64: b64 }),
      })
      .then(function (res) { clearTimeout(timeout); return res.json() })
      .then(function (data) {
        FM._hideLoading()
        if (!data.success || !data.zone_centers) {
          FM._showToast('Nenhum rosto detectado.', 'warn')
          return
        }

        // Map backend zone IDs to frontend zone IDs
        var zoneMap = {
          'temporal_esq': 'temporal', 'temporal_dir': 'temporal',
          'zigoma_lat_esq': 'zigoma-lateral', 'zigoma_lat_dir': 'zigoma-lateral',
          'zigoma_ant_esq': 'zigoma-anterior', 'zigoma_ant_dir': 'zigoma-anterior',
          'olheira_esq': 'olheira', 'olheira_dir': 'olheira',
          'sulco_esq': 'sulco', 'sulco_dir': 'sulco',
          'marionete_esq': 'marionete', 'marionete_dir': 'marionete',
          'mandibula_esq': 'mandibula', 'mandibula_dir': 'mandibula',
          'mento': 'mento',
          'labio': 'labio',
          'nariz': 'nariz-dorso',
          'testa': 'frontal',
          'glabela': 'glabela',
          'pes_galinha_esq': 'periorbital', 'pes_galinha_dir': 'periorbital',
        }

        FM._pushUndo()
        var imgW = FM._imgW || 400
        var imgH = FM._imgH || 500
        var count = 0

        Object.keys(data.zone_centers).forEach(function (backendId) {
          var frontendId = zoneMap[backendId]
          if (!frontendId) return

          var zoneDef = FM.ZONES.find(function (zd) { return zd.id === frontendId })
          if (!zoneDef) return

          // Check if this zone is allowed for the current angle
          if (zoneDef.angles && zoneDef.angles.indexOf(angle) === -1) return

          var center = data.zone_centers[backendId]
          var cx = center.x * imgW
          var cy = center.y * imgH

          // Determine side from backend zone name
          var side = 'bilateral'
          if (backendId.indexOf('_esq') > -1) side = 'esquerdo'
          else if (backendId.indexOf('_dir') > -1) side = 'direito'

          // Scale ellipse size based on zone type
          var rx = imgW * (zoneDef.cat === 'tox' ? 0.04 : 0.06)
          var ry = imgH * (zoneDef.cat === 'tox' ? 0.025 : 0.04)

          FM._annotations.push({
            id: FM._nextId++,
            angle: angle,
            zone: frontendId,
            treatment: zoneDef.defaultTx || 'ah',
            ml: zoneDef.min || 0.5,
            product: '',
            side: side,
            shape: { x: cx, y: cy, rx: rx, ry: ry },
          })
          count++
        })

        FM._simPhotoUrl = null
        FM._autoSave()
        FM._redraw()
        FM._refreshToolbar()
        FM._showToast(count + ' zonas posicionadas via scanner 478pts', 'success')
      })
      .catch(function (err) {
        clearTimeout(timeout)
        FM._hideLoading()
        FM._showToast('API offline. Marque manualmente.', 'warn')
      })
    }
    img.src = FM._photoUrls[angle]
  }

  // ── Run Skin Analysis v2 (standalone) ─────────────────────

  FM._runSkinAnalysis = function () {
    var angle = FM._activeAngle || 'front'
    if (!FM._photoUrls[angle]) {
      FM._showToast('Envie uma foto primeiro.', 'warn')
      return
    }

    FM._showLoading('Analisando pele (6 metricas + idade biologica)...')

    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      var apiUrl = FM.FACIAL_API_URL

      fetch(apiUrl + '/skin/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_base64: b64, generate_heatmaps: false }),
      })
      .then(function (r) { return r.json() })
      .then(function (data) {
        FM._hideLoading()
        if (data.success) {
          FM._skinAnalysis = data.scores
          FM._skinAge = data.skin_age
          FM._zoneScores = data.zone_scores

          var msg = 'Score geral: ' + Math.round(data.scores.overall)
          if (data.skin_age) msg += ' | Idade pele: ' + Math.round(data.skin_age.estimated_age) + ' anos'
          FM._showToast(msg, 'success')
          FM._refreshToolbar()
        } else {
          FM._showToast('Analise falhou.', 'error')
        }
      })
      .catch(function () {
        FM._hideLoading()
        FM._showToast('API offline.', 'warn')
      })
    }
    img.src = FM._photoUrls[angle]
  }

  // ── Run Collagen Score ───────────────────────────────────

  FM._runCollagenScore = function () {
    var angle = FM._activeAngle || 'front'
    if (!FM._photoUrls[angle]) return

    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      fetch(FM.FACIAL_API_URL + '/collagen-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_base64: b64 }),
      })
      .then(function (r) { return r.json() })
      .then(function (data) {
        if (data.success) {
          FM._collagenData = data
          FM._showToast('Colageno: Grade ' + data.grade + ' (' + data.grade_name + ') | Index: ' + data.collagen_index, 'success')
          FM._refreshToolbar()
        }
      })
      .catch(function () {})
    }
    img.src = FM._photoUrls[angle]
  }

  // ── Heatmap overlay management ───────────────────────────

  FM._loadHeatmaps = function () {
    var angle = FM._activeAngle || 'front'
    if (!FM._photoUrls[angle]) return

    FM._showLoading('Gerando heatmaps (rugas, manchas, poros, vermelhidao)...')

    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      console.log('[FaceMapping] Calling /skin/analyze with heatmaps, b64 length:', b64.length)

      fetch(FM.FACIAL_API_URL + '/skin/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_base64: b64, generate_heatmaps: true }),
      })
      .then(function (r) {
        console.log('[FaceMapping] skin/analyze response status:', r.status)
        return r.json()
      })
      .then(function (data) {
        FM._hideLoading()
        console.log('[FaceMapping] skin/analyze result:', data.success, 'heatmaps:', data.heatmaps ? Object.keys(data.heatmaps) : 'none')
        if (!data.success) {
          FM._showToast('Falha: ' + (data.detail || 'erro desconhecido'), 'error')
          return
        }
        if (!data.heatmaps || Object.keys(data.heatmaps).length === 0) {
          FM._showToast('Analise OK mas heatmaps vazios', 'warn')
          // Still save scores
          if (data.scores) FM._skinAnalysis = data.scores
          if (data.skin_age) FM._skinAge = data.skin_age
          FM._refreshToolbar()
          return
        }

        // Store scores
        FM._skinAnalysis = data.scores
        FM._skinAge = data.skin_age

        // Convert heatmap base64 to Image objects
        FM._heatmapImages = {}
        var metrics = ['wrinkles', 'spots', 'pores', 'redness', 'pigmentation', 'firmness']
        var loaded = 0

        metrics.forEach(function (m) {
          if (!data.heatmaps[m]) return
          var hImg = new Image()
          hImg.onload = function () {
            FM._heatmapImages[m] = hImg
            loaded++
            if (loaded === metrics.length) {
              FM._showToast('6 heatmaps carregados — clique para visualizar', 'success')
              FM._refreshToolbar()
            }
          }
          hImg.onerror = function () { loaded++ }
          hImg.src = 'data:image/png;base64,' + data.heatmaps[m]
        })
      })
      .catch(function (err) {
        FM._hideLoading()
        console.error('[FaceMapping] Heatmap error:', err)
        FM._showToast('Erro heatmaps: ' + (err.message || 'API offline'), 'error')
      })
    }
    img.src = FM._photoUrls[angle]
  }

  FM._toggleHeatmap = function (metric) {
    if (FM._activeHeatmap === metric) {
      FM._activeHeatmap = null  // toggle off
    } else {
      FM._activeHeatmap = metric
    }
    FM._redraw()
    FM._refreshToolbar()
  }

  // ── Full Protocol Recommendation ─────────────────────────

  FM._runProtocol = function () {
    var angle = FM._activeAngle || 'front'
    if (!FM._photoUrls[angle]) {
      FM._showToast('Envie uma foto primeiro.', 'warn')
      return
    }

    FM._showLoading('Gerando protocolo de tratamento...')

    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      var name = FM._lead ? (FM._lead.nome || FM._lead.name || 'Paciente') : 'Paciente'

      fetch(FM.FACIAL_API_URL + '/recommend-protocol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_base64: b64, lead_name: name, complaint: '' }),
      })
      .then(function (r) { return r.json() })
      .then(function (data) {
        FM._hideLoading()
        if (data.success) {
          FM._protocolData = data
          FM._showToast(
            'Classificacao: ' + data.classification + ' (' + data.classification_name + ') | ' +
            'AH: ' + data.totals.ah_ml + 'mL | Botox: ' + data.totals.botox_units + 'U | Bio: ' + data.totals.bio_sessions + ' sessoes',
            'success'
          )
          FM._refreshToolbar()
          if (FM._editorMode === 'analysis' && FM._analysisSubMode === 'metrics') {
            FM._render()
            setTimeout(FM._initCanvas, 100)
          }
        } else {
          FM._showToast('Falha no protocolo.', 'error')
        }
      })
      .catch(function () {
        FM._hideLoading()
        FM._showToast('API offline.', 'warn')
      })
    }
    img.src = FM._photoUrls[angle]
  }

  // ── Upload After Photo (for 2x mode) ─────────────────────

  FM._uploadAfterPhoto = function (input) {
    var file = input.files[0]
    if (!file) return

    function _setAfterUrl(url) {
      if (FM._afterPhotoUrl) URL.revokeObjectURL(FM._afterPhotoUrl)
      FM._afterPhotoUrl = url  // setter auto-saves to per-angle store
      FM._render()
      setTimeout(function () { FM._initCanvas(); FM._initCanvas2() }, 100)
    }

    var reader = new FileReader()
    reader.onload = function () {
      var b64 = reader.result.split(',')[1]
      FM._showLoading('Removendo fundo (DEPOIS)...')

      fetch(FM.FACIAL_API_URL + '/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_base64: b64 }),
      })
      .then(function (r) { return r.json() })
      .then(function (d) {
        FM._hideLoading()
        if (d.success && d.image_b64) {
          var bin = atob(d.image_b64)
          var arr = new Uint8Array(bin.length)
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
          _setAfterUrl(URL.createObjectURL(new Blob([arr], { type: 'image/png' })))
          FM._showToast('DEPOIS — fundo removido', 'success')
        } else {
          _setAfterUrl(URL.createObjectURL(file))
          FM._showToast('DEPOIS carregada (sem bg removal)', 'warn')
        }
      })
      .catch(function () {
        FM._hideLoading()
        _setAfterUrl(URL.createObjectURL(file))
        FM._showToast('DEPOIS carregada (API offline)', 'warn')
      })
    }
    reader.readAsDataURL(file)
  }

  // ── Init Canvas 2 (after photo in 2x mode) ─────────────

  FM._initCanvas2 = function () {
    var canvas2 = document.getElementById('fmCanvas2')
    if (!canvas2) return

    var src = FM._afterPhotoUrl || FM._simPhotoUrl
    if (!src) return

    // If canvas2 is already initialized with same src and same DOM element, just redraw
    if (FM._canvas2 === canvas2 && FM._img2 && FM._canvas2Src === src) {
      FM._redraw()
      return
    }

    FM._canvas2Src = src
    var ctx2 = canvas2.getContext('2d')
    var img2 = new Image()
    img2.onload = function () {
      var area = document.getElementById('fmCanvasArea')
      var maxW = area ? (area.clientWidth / 2 - 16) : 400
      var maxH = area ? (area.clientHeight - 64) : 600

      var scale = Math.min(maxW / img2.width, maxH / img2.height)
      var w = Math.round(img2.width * scale)
      var h = Math.round(img2.height * scale)

      canvas2.width = w
      canvas2.height = h

      FM._canvas2 = canvas2
      FM._ctx2 = ctx2
      FM._img2 = img2
      FM._imgW2 = w
      FM._imgH2 = h
      FM._redraw()

      // Mouse events for independent metrification on canvas2
      canvas2.addEventListener('mousedown', FM._onCanvas2MouseDown)
      canvas2.addEventListener('mousemove', FM._onCanvas2MouseMove)
      canvas2.addEventListener('mouseup', FM._onCanvas2MouseUp)
    }
    img2.src = src
  }

  // Canvas2 mouse handlers — swap metric state, delegate to existing handlers, swap back
  FM._onCanvas2MouseDown = function (e) {
    if (FM._editorMode !== 'analysis' || FM._analysisSubMode !== 'metrics') return
    var mx = e.offsetX, my = e.offsetY
    FM._activeCanvas = 2
    _swapToCanvas2()
    if (FM._onMetricMouseDown) FM._onMetricMouseDown(mx, my)
    _swapToCanvas1()
    FM._redraw()
  }

  FM._onCanvas2MouseMove = function (e) {
    if (FM._editorMode !== 'analysis' || FM._analysisSubMode !== 'metrics') return
    if (FM._activeCanvas !== 2) return
    var mx = e.offsetX, my = e.offsetY
    _swapToCanvas2()
    if (FM._onMetricMouseMove) FM._onMetricMouseMove(mx, my)
    _swapToCanvas1()
    FM._redraw()
  }

  FM._onCanvas2MouseUp = function () {
    if (FM._activeCanvas !== 2) return
    _swapToCanvas2()
    if (FM._onMetricMouseUp) FM._onMetricMouseUp()
    _swapToCanvas1()
    FM._activeCanvas = 1
    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
  }

  function _swapToCanvas2() {
    FM._swap1 = {
      ctx: FM._ctx, imgW: FM._imgW, imgH: FM._imgH,
      lines: FM._metricLines, points: FM._metricPoints,
      midline: FM._metricMidline, angles: FM._metricAngles,
      drag: FM._metricDrag, nextPt: FM._metricNextPointId, nextLn: FM._metricNextLineId,
      locked: FM._metricLocked
    }
    FM._ctx = FM._ctx2
    FM._imgW = FM._imgW2
    FM._imgH = FM._imgH2
    FM._metricLines = FM._metric2Lines
    FM._metricPoints = FM._metric2Points
    FM._metricMidline = FM._metric2Midline
    FM._metricAngles = FM._metric2Angles
    FM._metricDrag = FM._metric2Drag
    FM._metricNextPointId = FM._metric2NextPointId
    FM._metricNextLineId = FM._metric2NextLineId
    FM._metricLocked = FM._metric2Locked
  }

  function _swapToCanvas1() {
    // Save canvas2 state back
    FM._metric2Lines = FM._metricLines
    FM._metric2Points = FM._metricPoints
    FM._metric2Midline = FM._metricMidline
    FM._metric2Angles = FM._metricAngles
    FM._metric2Drag = FM._metricDrag
    FM._metric2NextPointId = FM._metricNextPointId
    FM._metric2NextLineId = FM._metricNextLineId
    FM._metric2Locked = FM._metricLocked
    // Restore canvas1 state
    var s = FM._swap1
    FM._ctx = s.ctx
    FM._imgW = s.imgW
    FM._imgH = s.imgH
    FM._metricLines = s.lines
    FM._metricPoints = s.points
    FM._metricMidline = s.midline
    FM._metricAngles = s.angles
    FM._metricDrag = s.drag
    FM._metricNextPointId = s.nextPt
    FM._metricNextLineId = s.nextLn
    FM._metricLocked = s.locked
  }

  // (redrawCanvas2 removed — canvas2 now drawn inline in _redraw with independent metrics)

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
