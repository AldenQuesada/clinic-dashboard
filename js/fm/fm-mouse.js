/**
 * fm-mouse.js — Interaction + canvas management (split from fm-canvas.js)
 */
;(function () {
  'use strict'

  var FM = window._FM

  FM._viewMode = FM._viewMode || '1x'  // '1x' or '2x'

  FM._initCanvas = function () {
    FM._canvas = document.getElementById('fmCanvas')
    if (!FM._canvas || !FM._photoUrls[FM._activeAngle]) return

    FM._ctx = FM._canvas.getContext('2d')
    FM._img = new Image()
    FM._img.onload = function () {
      var area = document.getElementById('fmCanvasArea')
      var isFS = area && area.classList.contains('fm-fullscreen')

      // Use actual area dimensions for precise fit
      var areaW = isFS ? window.innerWidth : (area ? area.clientWidth : 800)
      var areaH = isFS ? window.innerHeight : (area ? area.clientHeight : 600)

      var is2x = FM._viewMode === '2x'
      var maxW = is2x ? (areaW / 2 - 16) : (areaW - 8)
      var maxH = areaH - 64  // fill available height with bottom margin
      var scale = Math.min(maxW / FM._img.width, maxH / FM._img.height)

      FM._imgW = Math.round(FM._img.width * scale)
      FM._imgH = Math.round(FM._img.height * scale)
      // Extra margin for proportions bar
      var barMargin = 30
      FM._canvas.width = FM._imgW + barMargin
      FM._canvas.height = FM._imgH
      // Restore cached scan data for this angle
      var ang = FM._activeAngle || 'front'
      if (FM._scanDataByAngle && FM._scanDataByAngle[ang]) {
        FM._scanData = FM._scanDataByAngle[ang]
        FM._landmarkData = FM._scanDataByAngle[ang]
      }
      // Recompute region paths with current dimensions + scan data
      if (FM._computeRegionPaths) FM._computeRegionPaths()
      // Single redraw (no duplicate)
      FM._redraw()
      // Reinit canvas2 (debounced)
      if (FM._viewMode === '2x' && FM._initCanvas2) {
        clearTimeout(FM._canvas2InitTimer)
        FM._canvas2InitTimer = setTimeout(FM._initCanvas2, 150)
      }
      // Auto-scan: only on frontal, only if no cached data (silent — no overlay/toast)
      if (!FM._scanData && FM._scanEnabled && ang === 'front' && FM._autoAnalyze) {
        FM._autoAnalyze(true)
      }
    }
    FM._img.src = FM._photoUrls[FM._activeAngle]

    FM._canvas.addEventListener('mousedown', FM._onMouseDown)
    FM._canvas.addEventListener('mousemove', FM._onMouseMove)
    FM._canvas.addEventListener('mouseup', FM._onMouseUp)

    FM._canvas.addEventListener('touchstart', function (e) {
      e.preventDefault()
      var t = e.touches[0]
      FM._onMouseDown({ offsetX: t.clientX - FM._canvas.getBoundingClientRect().left, offsetY: t.clientY - FM._canvas.getBoundingClientRect().top })
    })
    FM._canvas.addEventListener('touchmove', function (e) {
      e.preventDefault()
      var t = e.touches[0]
      FM._onMouseMove({ offsetX: t.clientX - FM._canvas.getBoundingClientRect().left, offsetY: t.clientY - FM._canvas.getBoundingClientRect().top })
    })
    FM._canvas.addEventListener('touchend', function (e) {
      e.preventDefault()
      FM._onMouseUp()
    })
  }

  FM._redraw = function () {
    if (!FM._ctx || !FM._img) return
    FM._ctx.fillStyle = '#000000'
    FM._ctx.fillRect(0, 0, FM._canvas.width, FM._canvas.height)

    FM._ctx.drawImage(FM._img, 0, 0, FM._imgW, FM._imgH)

    // Wireframe overlay (any analysis sub-mode)
    if (FM._editorMode === 'analysis' && FM._drawWireframe) {
      FM._drawWireframe()
    }

    // Metric lines overlay — draw when in simetria tab OR analysis+metrics mode
    var isMetrics = (FM._activeTab === 'simetria' && FM._analysisSubMode === 'metrics') ||
                    (FM._editorMode === 'analysis' && FM._analysisSubMode === 'metrics')
    if (isMetrics) {
      if (FM._drawMetrics) FM._drawMetrics()
      if (FM._drawAngles) FM._drawAngles()
    }

    // Heatmap overlay (if active)
    if (FM._activeHeatmap && FM._heatmapImages && FM._heatmapImages[FM._activeHeatmap]) {
      FM._ctx.globalAlpha = 0.55
      FM._ctx.drawImage(FM._heatmapImages[FM._activeHeatmap], 0, 0, FM._imgW, FM._imgH)
      FM._ctx.globalAlpha = 1.0
    }

    // Draw mode-specific overlays (no label area — everything on the photo)
    if (FM._editorMode === 'vectors') {
      FM._vectors.forEach(function (vec) { FM._drawVector(vec) })
      if (FM._selVec) {
        FM._ctx.save()
        FM._ctx.fillStyle = '#fff'
        FM._ctx.strokeStyle = '#C8A97E'
        FM._ctx.lineWidth = 2
        FM._ctx.beginPath()
        FM._ctx.arc(FM._selVec.start.x, FM._selVec.start.y, 6, 0, Math.PI * 2)
        FM._ctx.fill(); FM._ctx.stroke()
        FM._ctx.beginPath()
        FM._ctx.arc(FM._selVec.end.x, FM._selVec.end.y, 6, 0, Math.PI * 2)
        FM._ctx.fill(); FM._ctx.stroke()
        FM._ctx.restore()
      }
    } else if (FM._editorMode === 'analysis') {
      // Draw ricketts in its specific sub-mode (tercos removed)
      if (FM._analysisSubMode === 'ricketts' && FM._activeAngle === 'lateral' && FM._rickettsPoints) {
        FM._drawRicketts()
      }
      // metrics sub-mode: drawn by _drawMetrics/_drawAngles (earlier in redraw)
    } else {
      // Zones mode — draw anatomical region overlays from landmarks
      if (FM._drawAllRegions && FM._regionPaths && Object.keys(FM._regionPaths).length > 0) {
        FM._drawAllRegions()
      }
      // Also draw legacy annotations (manual ellipses) if any exist
      var anns = FM._annotations.filter(function (a) { return a.angle === FM._activeAngle })
      anns.forEach(function (ann) {
        // Skip if this zone has an active region overlay
        var st = FM._regionState && FM._regionState[ann.zone]
        if (st && st.active && FM._regionPaths && FM._regionPaths[ann.zone]) return
        FM._drawEllipseClean(ann)
      })
    }

    // Selection handles
    if (FM._selAnn) {
      var s = FM._selAnn.shape
      var color = FM._zoneColor(FM._selAnn.zone)
      FM._ctx.save()
      FM._ctx.strokeStyle = '#fff'
      FM._ctx.lineWidth = 1.5
      FM._ctx.setLineDash([5, 3])
      FM._ctx.beginPath()
      FM._ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
      FM._ctx.stroke()
      FM._ctx.setLineDash([])

      var handles = FM._getHandles(s)
      handles.forEach(function (h) {
        FM._ctx.fillStyle = '#fff'
        FM._ctx.strokeStyle = color
        FM._ctx.lineWidth = 2
        FM._ctx.beginPath()
        FM._ctx.arc(h.x, h.y, 5, 0, Math.PI * 2)
        FM._ctx.fill()
        FM._ctx.stroke()
      })
      FM._ctx.restore()
    }

    // Draw current shape being drawn
    if (FM._mode === 'draw' && FM._drawStart) {
      var drawColor = FM._zoneColor(FM._selectedZone)
      FM._ctx.save()
      FM._ctx.beginPath()
      FM._ctx.strokeStyle = drawColor
      FM._ctx.lineWidth = 2
      FM._ctx.setLineDash([6, 4])
      var cx = (FM._drawStart.x + FM._drawStart.ex) / 2
      var cy = (FM._drawStart.y + FM._drawStart.ey) / 2
      var rx = Math.abs(FM._drawStart.ex - FM._drawStart.x) / 2
      var ry = Math.abs(FM._drawStart.ey - FM._drawStart.y) / 2
      if (rx > 2 && ry > 2) {
        FM._ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        FM._ctx.stroke()
      }
      FM._ctx.restore()
    }

    // Redraw canvas2 (DEPOIS) with its OWN independent metrics
    if (FM._viewMode === '2x' && FM._ctx2 && FM._img2) {
      FM._ctx2.fillStyle = '#000000'
      FM._ctx2.fillRect(0, 0, FM._imgW2, FM._imgH2)
      FM._ctx2.drawImage(FM._img2, 0, 0, FM._imgW2, FM._imgH2)

      // Wireframe on canvas2 too
      if (FM._showWireframe && FM._scanData && FM._scanData.landmarks && FM._drawWireframe) {
        var saveCtx = FM._ctx, saveW = FM._imgW, saveH = FM._imgH
        FM._ctx = FM._ctx2; FM._imgW = FM._imgW2; FM._imgH = FM._imgH2
        FM._drawWireframe()
        FM._ctx = saveCtx; FM._imgW = saveW; FM._imgH = saveH
      }

      // Draw canvas2's own metrics by temporarily swapping state
      var is2xMetrics = (FM._activeTab === 'simetria' && FM._analysisSubMode === 'metrics') ||
                        (FM._editorMode === 'analysis' && FM._analysisSubMode === 'metrics')
      if (is2xMetrics) {
        var save = {
          ctx: FM._ctx, imgW: FM._imgW, imgH: FM._imgH,
          lines: FM._metricLines, points: FM._metricPoints,
          midline: FM._metricMidline, angles: FM._metricAngles,
          drag: FM._metricDrag
        }
        FM._ctx = FM._ctx2
        FM._imgW = FM._imgW2
        FM._imgH = FM._imgH2
        FM._metricLines = FM._metric2Lines
        FM._metricPoints = FM._metric2Points
        FM._metricMidline = FM._metric2Midline
        FM._metricAngles = FM._metric2Angles
        FM._metricDrag = FM._metric2Drag

        if (FM._drawMetrics) FM._drawMetrics()
        if (FM._drawAngles) FM._drawAngles()

        FM._ctx = save.ctx
        FM._imgW = save.imgW
        FM._imgH = save.imgH
        FM._metricLines = save.lines
        FM._metricPoints = save.points
        FM._metricMidline = save.midline
        FM._metricAngles = save.angles
        FM._metricDrag = save.drag
      }

      // Ricketts on canvas2 (DEPOIS lateral) — independent points
      if (FM._analysisSubMode === 'ricketts' && FM._activeAngle === 'lateral' && FM._ricketts2Points && FM._drawRicketts) {
        var saveR = { ctx: FM._ctx, imgW: FM._imgW, imgH: FM._imgH, pts: FM._rickettsPoints }
        FM._ctx = FM._ctx2; FM._imgW = FM._imgW2; FM._imgH = FM._imgH2
        FM._rickettsPoints = FM._ricketts2Points
        FM._drawRicketts()
        FM._ctx = saveR.ctx; FM._imgW = saveR.imgW; FM._imgH = saveR.imgH
        FM._rickettsPoints = saveR.pts
      }
    }
  }

  FM._hitHandle = function (x, y) {
    if (!FM._selAnn) return null
    var handles = FM._getHandles(FM._selAnn.shape)
    for (var i = 0; i < handles.length; i++) {
      var dx = x - handles[i].x, dy = y - handles[i].y
      if (dx * dx + dy * dy <= 64) return handles[i].id
    }
    return null
  }

  FM._hitEllipse = function (x, y) {
    var anns = FM._annotations.filter(function (a) { return a.angle === FM._activeAngle })
    for (var i = anns.length - 1; i >= 0; i--) {
      var s = anns[i].shape
      var dx = (x - s.x) / s.rx
      var dy = (y - s.y) / s.ry
      if (dx * dx + dy * dy <= 1) return anns[i]
    }
    return null
  }

  FM._hitVector = function (x, y) {
    for (var i = FM._vectors.length - 1; i >= 0; i--) {
      var v = FM._vectors[i]
      var ds = Math.sqrt(Math.pow(x - v.start.x, 2) + Math.pow(y - v.start.y, 2))
      if (ds < 10) return { vec: v, part: 'start' }
      var de = Math.sqrt(Math.pow(x - v.end.x, 2) + Math.pow(y - v.end.y, 2))
      if (de < 10) return { vec: v, part: 'end' }
      var mx = (v.start.x + v.end.x) / 2
      var my = (v.start.y + v.end.y) / 2
      var dm = Math.sqrt(Math.pow(x - mx, 2) + Math.pow(y - my, 2))
      if (dm < 20) return { vec: v, part: 'start' }
    }
    return null
  }

  // ── Mouse handlers ────────────────────────────────────────

  FM._onMouseDown = function (e) {
    var mx = e.offsetX, my = e.offsetY
    var inLabelArea = mx > FM._imgW

    // METRICS MODE — Simetria tab or analysis+metrics
    var isMetricsMode = (FM._activeTab === 'simetria' && FM._analysisSubMode === 'metrics') ||
                        (FM._editorMode === 'analysis' && FM._analysisSubMode === 'metrics')
    if (isMetricsMode) {
      if (FM._onMetricMouseDown && FM._onMetricMouseDown(mx, my)) {
        FM._mode = 'move'
        return
      }
    }

    // RICKETTS MODE (only when in ricketts sub-mode, not metrics)
    if (FM._editorMode === 'analysis' && FM._analysisSubMode === 'ricketts') {
      if (FM._activeAngle === 'lateral') {
        var nDist = Math.sqrt(Math.pow(mx - FM._rickettsPoints.nose.x * FM._imgW, 2) + Math.pow(my - FM._rickettsPoints.nose.y * FM._imgH, 2))
        if (nDist < 15) { FM._pushUndo(); FM._analysisDrag = 'nose'; FM._mode = 'move'; FM._canvas.style.cursor = 'grab'; return }
        var cDist = Math.sqrt(Math.pow(mx - FM._rickettsPoints.chin.x * FM._imgW, 2) + Math.pow(my - FM._rickettsPoints.chin.y * FM._imgH, 2))
        if (cDist < 15) { FM._pushUndo(); FM._analysisDrag = 'chin'; FM._mode = 'move'; FM._canvas.style.cursor = 'grab'; return }
      }
      FM._analysisDrag = null
      FM._redraw()
      return
    }

    // ZONES MODE — handle drag, region move, or click-to-select
    if (FM._editorMode === 'zones' && FM._regionPaths && Object.keys(FM._regionPaths).length > 0) {
      // 1. Check control handle hit first (selected region only)
      if (FM._hitTestRegionHandle && !FM._regionLocked) {
        var handleHit = FM._hitTestRegionHandle(mx, my)
        if (handleHit) {
          FM._startRegionHandleDrag(handleHit, mx, my)
          FM._mode = 'move'
          FM._canvas.style.cursor = handleHit.type === 'rotation' ? 'crosshair' : (
            handleHit.type === 'n' || handleHit.type === 's' ? 'ns-resize' : 'ew-resize'
          )
          return
        }
      }
      // 2. Click on selected region → drag to move it
      if (FM._hitTestRegion && !FM._regionLocked) {
        var regionHit = FM._hitTestRegion(mx, my)
        if (regionHit && regionHit === FM._selectedRegion) {
          // Drag to move the selected region
          var paths = FM._regionPaths[regionHit]
          var pcx = paths && paths[0] ? paths[0]._cx : mx
          var pcy = paths && paths[0] ? paths[0]._cy : my
          FM._startRegionHandleDrag({ type: 'move', regionId: regionHit, cx: pcx, cy: pcy }, mx, my)
          FM._mode = 'move'
          FM._canvas.style.cursor = 'grabbing'
          return
        }
        // 3. Click on different region → select it
        if (regionHit) {
          FM._selectedRegion = regionHit
          FM._redraw()
          FM._refreshToolbar()
          return
        }
      }
      // 4. Click outside all regions → deselect
      FM._selectedRegion = null
      FM._redraw()
      FM._refreshToolbar()
      return
    }

    // VECTOR MODE
    if (FM._editorMode === 'vectors') {
      var hit = FM._hitVector(mx, my)
      if (hit && !FM._metricLocked) {
        FM._pushUndo()
        FM._selVec = hit.vec
        FM._vecDragPart = hit.part
        FM._mode = 'move'
        FM._canvas.style.cursor = 'grabbing'
      } else {
        FM._selVec = null
      }
      FM._redraw()
      return
    }

    // 1. Check resize handles (locked = no resize)
    if (FM._selAnn && !FM._metricLocked) {
      var handle = FM._hitHandle(mx, my)
      if (handle) {
        FM._pushUndo()
        FM._mode = 'resize'
        FM._resizeHandle = handle
        return
      }
    }

    // 2. Hit existing annotation -> move (locked = no move)
    var hit = FM._hitEllipse(mx, my)
    if (hit && !FM._metricLocked) {
      FM._pushUndo()
      FM._selAnn = hit
      FM._mode = 'move'
      FM._moveStart = { x: mx - hit.shape.x, y: my - hit.shape.y }
      FM._canvas.style.cursor = 'grabbing'
      FM._redraw()
      return
    }

    // 3. Click on empty -> deselect
    if (FM._selAnn && !FM._selectedZone) {
      FM._selAnn = null
      FM._mode = 'idle'
      FM._redraw()
      return
    }

    // 4. Draw new ellipse
    if (FM._selectedZone && !inLabelArea) {
      FM._selAnn = null
      FM._mode = 'draw'
      FM._drawing = true
      FM._drawStart = { x: mx, y: my, ex: mx, ey: my }
    }
  }

  FM._onMouseMove = function (e) {
    var mx = e.offsetX, my = e.offsetY

    // METRICS MODE drag
    if (((FM._activeTab === 'simetria' && FM._analysisSubMode === 'metrics') || (FM._editorMode === 'analysis' && FM._analysisSubMode === 'metrics')) && FM._mode === 'move') {
      if (FM._onMetricMouseMove && FM._onMetricMouseMove(mx, my)) return
    }

    // ANALYSIS MODE drag
    if (FM._editorMode === 'analysis' && FM._mode === 'move' && FM._analysisDrag) {
      if (FM._activeAngle === 'lateral') {
        if (FM._analysisDrag === 'nose') {
          FM._rickettsPoints.nose.x = Math.max(0.01, Math.min(0.99, mx / FM._imgW))
          FM._rickettsPoints.nose.y = Math.max(0.01, Math.min(0.99, my / FM._imgH))
        } else if (FM._analysisDrag === 'chin') {
          FM._rickettsPoints.chin.x = Math.max(0.01, Math.min(0.99, mx / FM._imgW))
          FM._rickettsPoints.chin.y = Math.max(0.01, Math.min(0.99, my / FM._imgH))
        }
        FM._redraw()
        return
      }
    }

    if (FM._editorMode === 'analysis') {
      if (FM._activeAngle === 'lateral') {
        var nD = Math.sqrt(Math.pow(mx - FM._rickettsPoints.nose.x * FM._imgW, 2) + Math.pow(my - FM._rickettsPoints.nose.y * FM._imgH, 2))
        var cD = Math.sqrt(Math.pow(mx - FM._rickettsPoints.chin.x * FM._imgW, 2) + Math.pow(my - FM._rickettsPoints.chin.y * FM._imgH, 2))
        FM._canvas.style.cursor = (nD < 15 || cD < 15) ? 'grab' : 'default'
      }
      return
    }

    // VECTOR MODE drag
    if (FM._editorMode === 'vectors' && FM._mode === 'move' && FM._selVec) {
      if (FM._vecDragPart === 'end') {
        FM._selVec.end.x = mx
        FM._selVec.end.y = my
      } else {
        var dx = mx - FM._selVec.start.x
        var dy = my - FM._selVec.start.y
        FM._selVec.start.x += dx; FM._selVec.start.y += dy
        FM._selVec.end.x += dx; FM._selVec.end.y += dy
      }
      FM._redraw()
      return
    }

    if (FM._editorMode === 'vectors') {
      var h = FM._hitVector(mx, my)
      FM._canvas.style.cursor = h ? (h.part === 'end' ? 'crosshair' : 'grab') : 'default'
      return
    }

    if (FM._mode === 'move' && FM._selAnn) {
      FM._selAnn.shape.x = mx - FM._moveStart.x
      FM._selAnn.shape.y = my - FM._moveStart.y
      FM._redraw()
      return
    }

    if (FM._mode === 'resize' && FM._selAnn && FM._resizeHandle) {
      var s = FM._selAnn.shape
      switch (FM._resizeHandle) {
        case 'n': s.ry = Math.max(8, s.y - my); break
        case 's': s.ry = Math.max(8, my - s.y); break
        case 'e': s.rx = Math.max(8, mx - s.x); break
        case 'w': s.rx = Math.max(8, s.x - mx); break
      }
      FM._redraw()
      return
    }

    if (FM._mode === 'draw' && FM._drawStart) {
      FM._drawStart.ex = mx
      FM._drawStart.ey = my
      FM._redraw()
      return
    }

    // Region handle drag (zones mode)
    if (FM._editorMode === 'zones' && FM._regionHandleDrag && FM._mode === 'move') {
      FM._moveRegionHandle(mx, my)
      return
    }

    // Region hover detection (zones mode with landmarks)
    if (FM._editorMode === 'zones' && FM._regionPaths && Object.keys(FM._regionPaths).length > 0) {
      // Check handle cursor
      if (FM._hitTestRegionHandle && !FM._regionLocked) {
        var hHandle = FM._hitTestRegionHandle(mx, my)
        if (hHandle) {
          FM._canvas.style.cursor = hHandle.type === 'rotation' ? 'crosshair' : (
            hHandle.type === 'n' || hHandle.type === 's' ? 'ns-resize' : 'ew-resize'
          )
          return
        }
      }

      var prevHover = FM._hoveredRegion
      FM._hoveredRegion = FM._hitTestRegion ? FM._hitTestRegion(mx, my) : null
      if (FM._hoveredRegion !== prevHover || FM._hoveredRegion) {
        if (FM._hoveredRegion === FM._selectedRegion && FM._hoveredRegion && !FM._regionLocked) {
          FM._canvas.style.cursor = 'grab'
        } else {
          FM._canvas.style.cursor = FM._hoveredRegion ? 'pointer' : 'default'
        }
        if (FM._hoveredRegion !== prevHover) FM._redraw()
      }
      return
    }

    // Cursor hint
    if (FM._selAnn && FM._hitHandle(mx, my)) {
      var h = FM._hitHandle(mx, my)
      FM._canvas.style.cursor = (h === 'n' || h === 's') ? 'ns-resize' : 'ew-resize'
    } else if (FM._hitEllipse(mx, my)) {
      FM._canvas.style.cursor = 'grab'
    } else {
      FM._canvas.style.cursor = FM._selectedZone ? 'crosshair' : 'default'
    }
  }

  FM._onMouseUp = function () {
    // Region handle drag end
    if (FM._regionHandleDrag) {
      FM._endRegionHandleDrag()
      FM._mode = 'idle'
      FM._canvas.style.cursor = 'default'
      FM._redraw()
      FM._refreshToolbar()
      return
    }
    if (FM._editorMode === 'analysis') {
      if (FM._onMetricMouseUp) FM._onMetricMouseUp()
      FM._mode = 'idle'
      FM._analysisDrag = null
      FM._canvas.style.cursor = 'default'
      FM._redraw()
      FM._refreshToolbar()
      FM._autoSave()
      return
    }
    if (FM._editorMode === 'vectors') {
      FM._mode = 'idle'
      FM._canvas.style.cursor = 'default'
      FM._redraw()
      return
    }
    if (FM._mode === 'move' || FM._mode === 'resize') {
      FM._mode = 'idle'
      FM._canvas.style.cursor = FM._selectedZone ? 'crosshair' : 'default'
      FM._autoSave()
      FM._redraw()
      return
    }

    if (FM._mode === 'draw' && FM._drawStart) {
      FM._drawing = false
      FM._mode = 'idle'

      var cx = (FM._drawStart.x + FM._drawStart.ex) / 2
      var cy = (FM._drawStart.y + FM._drawStart.ey) / 2
      var rx = Math.abs(FM._drawStart.ex - FM._drawStart.x) / 2
      var ry = Math.abs(FM._drawStart.ey - FM._drawStart.y) / 2

      if (rx < 8 || ry < 8) {
        FM._drawStart = null
        FM._redraw()
        return
      }

      var mlInput = document.getElementById('fmMl')
      var productInput = document.getElementById('fmProduct')
      var sideSelect = document.getElementById('fmSide')

      var zDef = FM.ZONES.find(function (x) { return x.id === FM._selectedZone })
      var qty = parseFloat(mlInput ? mlInput.value : FM._selectedMl) || (zDef ? zDef.min : 0.5)

      if (zDef && qty < zDef.min) {
        qty = zDef.min
        if (mlInput) { mlInput.value = qty; mlInput.style.borderColor = '#EF4444'; setTimeout(function () { mlInput.style.borderColor = '' }, 1500) }
      }

      var newAnn = {
        id: FM._nextId++,
        angle: FM._activeAngle,
        zone: FM._selectedZone,
        treatment: FM._selectedTreatment,
        ml: qty,
        product: productInput ? productInput.value : FM._selectedProduct,
        side: sideSelect ? sideSelect.value : FM._selectedSide,
        shape: { x: cx, y: cy, rx: rx, ry: ry },
      }
      FM._pushUndo()
      FM._annotations.push(newAnn)
      FM._selAnn = newAnn
      FM._simPhotoUrl = null
      FM._autoSave()

      FM._drawStart = null
      FM._redraw()
      FM._refreshToolbar()
    }
  }

})()
