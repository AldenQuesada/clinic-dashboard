/**
 * fm-mouse.js — Interaction + canvas management (split from fm-canvas.js)
 */
;(function () {
  'use strict'

  var FM = window._FM

  FM._viewMode = FM._viewMode || '1x'  // '1x' or '2x'

  FM._imgCache = {}  // { angle: { url, img } }

  FM._initCanvas = function () {
    FM._canvas = document.getElementById('fmCanvas')
    if (!FM._canvas || !FM._photoUrls[FM._activeAngle]) return

    FM._ctx = FM._canvas.getContext('2d')
    var ang = FM._activeAngle || 'front'
    var url = FM._photoUrls[ang]

    // Reuse cached image if URL unchanged (eliminates flicker)
    var cached = FM._imgCache[ang]
    if (cached && cached.url === url && cached.img.complete) {
      FM._img = cached.img
      _onImgReady()
    } else {
      FM._img = new Image()
      FM._img.onload = function () {
        FM._imgCache[ang] = { url: url, img: FM._img }
        _onImgReady()
      }
      FM._img.src = url
    }

    function _onImgReady() {
      var area = document.getElementById('fmCanvasArea')
      var isFS = area && area.classList.contains('fm-fullscreen')

      // Use actual area dimensions for precise fit
      var areaW = isFS ? window.innerWidth : (area ? area.clientWidth : 800)
      var areaH = isFS ? window.innerHeight : (area ? area.clientHeight : 600)

      var is2x = FM._viewMode === '2x'
      var maxW = is2x ? (areaW / 2 - 16) : (areaW - 8)
      var maxH = areaH  // fill available height completely
      var scale = Math.min(maxW / FM._img.width, maxH / FM._img.height)

      FM._imgW = Math.round(FM._img.width * scale)
      FM._imgH = Math.round(FM._img.height * scale)
      // No extra margin — proportions bar draws inside the image area
      FM._canvas.width = FM._imgW
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
    var inSimetria = FM._activeTab === 'simetria'

    // Canvas1 (ANTES) — may not exist if ANTES was deleted
    if (!FM._canvas || !FM._ctx || !FM._img) {
      // Skip canvas1 drawing, but still draw canvas2 below
    } else {
    FM._ctx.fillStyle = '#000000'
    FM._ctx.fillRect(0, 0, FM._canvas.width, FM._canvas.height)

    FM._ctx.drawImage(FM._img, 0, 0, FM._imgW, FM._imgH)

    // Wireframe overlay (any analysis sub-mode)
    if (FM._editorMode === 'analysis' && FM._drawWireframe) {
      FM._drawWireframe()
    }

    // Draw mode-specific overlays — strictly per editorMode
    if (FM._editorMode === 'vectors') {
      // NEW: Force vector system
      if (FM._drawAllForceVectors) {
        FM._drawAllForceVectors(FM._ctx, FM._vecAge || 25, FM._imgW, FM._imgH)
        // Collagen bar at bottom of canvas
        if (FM._drawCollagenBar) FM._drawCollagenBar(FM._ctx, 10, FM._imgH - 18, FM._imgW - 20, 8, FM._vecAge || 25)
      }
    } else if (FM._editorMode === 'analysis') {
      // Metrics (H/V lines, angles) — ONLY in analysis mode
      var hasLines = FM._metricLines && (FM._metricLines.h.length > 0 || FM._metricLines.v.length > 0)
      var hasPoints = FM._metricPoints && FM._metricPoints.length > 0
      var hasAngles = FM._metricAngles && FM._metricAngles.points
      if (hasLines || hasPoints || hasAngles) {
        if (FM._drawMetrics) FM._drawMetrics()
        if (FM._drawAngles) FM._drawAngles()
      }
      // Ricketts
      if (FM._analysisSubMode === 'ricketts' && FM._activeAngle === 'lateral' && FM._rickettsPoints) {
        FM._drawRicketts()
      }
      // Heatmap
      if (FM._activeHeatmap && FM._heatmapImages && FM._heatmapImages[FM._activeHeatmap]) {
        FM._ctx.globalAlpha = 0.55
        FM._ctx.drawImage(FM._heatmapImages[FM._activeHeatmap], 0, 0, FM._imgW, FM._imgH)
        FM._ctx.globalAlpha = 1.0
      }
    } else if (FM._editorMode === 'zones') {
      // Guide lines (thin, H=green, V=blue — same as simetria but thinner)
      if (FM._guideLines) {
        var gW = FM._imgW, gH = FM._imgH
        FM._ctx.save()

        // H guides (green)
        FM._guideLines.h.forEach(function (g, i) {
          var gy = g.pos * gH
          FM._ctx.beginPath()
          FM._ctx.strokeStyle = 'rgba(16,185,129,0.7)'
          FM._ctx.lineWidth = 1
          FM._ctx.setLineDash([6, 4])
          FM._ctx.moveTo(0, gy)
          FM._ctx.lineTo(gW, gy)
          FM._ctx.stroke()
          FM._ctx.setLineDash([])
          // Small dot handle
          FM._ctx.beginPath()
          FM._ctx.fillStyle = '#10B981'
          FM._ctx.arc(6, gy, 3, 0, Math.PI * 2)
          FM._ctx.fill()
        })

        // V guides (blue)
        FM._guideLines.v.forEach(function (g, i) {
          var gx = g.pos * gW
          FM._ctx.beginPath()
          FM._ctx.strokeStyle = 'rgba(59,130,246,0.7)'
          FM._ctx.lineWidth = 1
          FM._ctx.setLineDash([6, 4])
          FM._ctx.moveTo(gx, 0)
          FM._ctx.lineTo(gx, gH)
          FM._ctx.stroke()
          FM._ctx.setLineDash([])
          FM._ctx.beginPath()
          FM._ctx.fillStyle = '#3B82F6'
          FM._ctx.arc(gx, gH - 6, 3, 0, Math.PI * 2)
          FM._ctx.fill()
        })

        // Proportions bar on right edge (H guides only, if >= 2)
        if (FM._guideLines.h.length >= 2) {
          var hSorted = FM._guideLines.h.slice().sort(function (a, b) { return a.pos - b.pos })
          var barX = gW - 18
          var barW = 12
          var firstY = hSorted[0].pos * gH
          var lastY = hSorted[hSorted.length - 1].pos * gH
          var totalSpan = lastY - firstY
          if (totalSpan > 10) {
            for (var si = 0; si < hSorted.length - 1; si++) {
              var segTop = hSorted[si].pos * gH
              var segBot = hSorted[si + 1].pos * gH
              var segH2 = segBot - segTop
              var segPct = Math.round((segH2 / totalSpan) * 100)
              var idealPct = Math.round(100 / (hSorted.length - 1))
              var tol = idealPct * 0.3
              var segColor = Math.abs(segPct - idealPct) <= tol ? '#10B981' : Math.abs(segPct - idealPct) <= tol * 2 ? '#F59E0B' : '#EF4444'
              FM._ctx.globalAlpha = 0.5
              FM._ctx.fillStyle = segColor
              FM._ctx.fillRect(barX, segTop, barW, segH2)
              FM._ctx.globalAlpha = 1
              FM._ctx.strokeStyle = segColor
              FM._ctx.lineWidth = 0.5
              FM._ctx.strokeRect(barX, segTop, barW, segH2)
              if (segH2 > 16) {
                FM._ctx.font = '700 8px Inter, sans-serif'
                FM._ctx.fillStyle = '#fff'
                FM._ctx.textAlign = 'center'
                FM._ctx.fillText(segPct + '%', barX + barW / 2, segTop + segH2 / 2 + 3)
              }
            }
          }
        }

        FM._ctx.restore()
      }
      // Zones mode ONLY — draw polygon/ellipse annotations
      var anns = FM._annotations.filter(function (a) { return a.angle === FM._activeAngle })
      anns.forEach(function (ann) {
        if (ann.shape && ann.shape.type === 'polygon') {
          FM._drawPolygon(ann)
        } else {
          FM._drawEllipseClean(ann)
        }
      })
      // Draw in-progress polygon preview
      if (FM._polyDrawing && FM._polyPoints.length > 0) {
        FM._drawPolyPreview()
      }
    }

    // Selection handles
    if (FM._selAnn) {
      if (FM._selAnn.shape && FM._selAnn.shape.type === 'polygon') {
        FM._drawPolygonHandles(FM._selAnn)
      } else {
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

    } // end canvas1 guard

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

      // Force vectors on canvas2
      if (FM._editorMode === 'vectors' && FM._drawAllForceVectors) {
        FM._drawAllForceVectors(FM._ctx2, FM._vecAge || 25, FM._imgW2, FM._imgH2)
        if (FM._drawCollagenBar) FM._drawCollagenBar(FM._ctx2, 10, FM._imgH2 - 18, FM._imgW2 - 20, 8, FM._vecAge || 25)
      }

      // Draw canvas2's own metrics — always when lines exist in simetria
      var has2Lines = FM._metric2Lines && (FM._metric2Lines.h.length > 0 || FM._metric2Lines.v.length > 0)
      var has2Points = FM._metric2Points && FM._metric2Points.length > 0
      var has2Angles = FM._metric2Angles && FM._metric2Angles.points
      if (inSimetria && (has2Lines || has2Points || has2Angles)) {
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
    var anns = FM._annotations.filter(function (a) {
      return a.angle === FM._activeAngle && (!a.shape.type)  // only legacy ellipses
    })
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

    // VECTORS MODE — drag force vector origin or tip
    if (FM._editorMode === 'vectors' && FM._vecDrawnPositions) {
      var hitThreshold = 18
      for (var vi = 0; vi < FM._vecDrawnPositions.length; vi++) {
        var vp = FM._vecDrawnPositions[vi]
        // Hit tip (arrowhead) — stretch
        var tipDist = Math.sqrt(Math.pow(mx - vp.tipX, 2) + Math.pow(my - vp.tipY, 2))
        if (tipDist < hitThreshold) {
          FM._vecDrag = { key: vp.key, part: 'tip', defId: vp.defId }
          FM._mode = 'move'
          FM._canvas.style.cursor = 'crosshair'
          return
        }
        // Hit origin — move center
        var originDist = Math.sqrt(Math.pow(mx - vp.cx, 2) + Math.pow(my - vp.cy, 2))
        if (originDist < hitThreshold) {
          FM._vecDrag = { key: vp.key, part: 'origin', defId: vp.defId, startCx: vp.cx, startCy: vp.cy }
          FM._mode = 'move'
          FM._canvas.style.cursor = 'grab'
          return
        }
      }
    }

    // GUIDE LINES — add/drag ONLY when unlocked and guideTool active
    if (FM._editorMode === 'zones' && FM._guideTool && !FM._polyDrawing && !FM._guideLocked) {
      var w = FM._imgW, h = FM._imgH
      if (FM._guideTool === 'hguide') {
        for (var gi = 0; gi < FM._guideLines.h.length; gi++) {
          if (Math.abs(my - FM._guideLines.h[gi].pos * h) < 10) {
            if (e.detail >= 2) { FM._guideLines.h.splice(gi, 1); FM._redraw(); return }
            FM._guideDrag = { type: 'hguide', index: gi }
            FM._mode = 'move'
            return
          }
        }
        FM._guideLines.h.push({ pos: my / h, id: FM._guideNextId++ })
        FM._redraw()
        return
      } else if (FM._guideTool === 'vguide') {
        for (var gj = 0; gj < FM._guideLines.v.length; gj++) {
          if (Math.abs(mx - FM._guideLines.v[gj].pos * w) < 10) {
            if (e.detail >= 2) { FM._guideLines.v.splice(gj, 1); FM._redraw(); return }
            FM._guideDrag = { type: 'vguide', index: gj }
            FM._mode = 'move'
            return
          }
        }
        FM._guideLines.v.push({ pos: mx / w, id: FM._guideNextId++ })
        FM._redraw()
        return
      }
    }

    // ZONES MODE — handle drag, region move, or click-to-select
    // (only intercept if NOT in polygon drawing mode and no zone selected for polygon)
    if (FM._editorMode === 'zones' && FM._regionPaths && Object.keys(FM._regionPaths).length > 0 && !FM._polyDrawing && !FM._selectedZone) {
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

    // 1. If dragging a polygon point on selected annotation
    if (FM._selAnn && FM._selAnn.shape && FM._selAnn.shape.type === 'polygon' && !FM._metricLocked) {
      var ptIdx = FM._hitPolygonPoint(mx, my, FM._selAnn)
      if (ptIdx >= 0) {
        FM._pushUndo()
        FM._dragPolyPoint = { annId: FM._selAnn.id, pointIndex: ptIdx }
        FM._mode = 'move'
        FM._canvas.style.cursor = 'grabbing'
        return
      }
      // 1a. Check edge hit → insert new point on edge
      var edgeHit = FM._hitPolygonEdge(mx, my, FM._selAnn)
      if (edgeHit) {
        FM._pushUndo()
        FM._selAnn.shape.points.splice(edgeHit.index + 1, 0, { x: mx / FM._imgW, y: my / FM._imgH })
        FM._dragPolyPoint = { annId: FM._selAnn.id, pointIndex: edgeHit.index + 1 }
        FM._mode = 'move'
        FM._canvas.style.cursor = 'grabbing'
        FM._redraw()
        return
      }
      // 1b. Click inside selected polygon (not on point/edge) → drag whole polygon
      if (FM._pointInPolygon(mx, my, FM._selAnn.shape.points, FM._imgW, FM._imgH)) {
        FM._pushUndo()
        FM._dragPolyWhole = {
          annId: FM._selAnn.id,
          startX: mx,
          startY: my,
          origPoints: FM._selAnn.shape.points.map(function (p) { return { x: p.x, y: p.y } })
        }
        FM._mode = 'move'
        FM._canvas.style.cursor = 'grabbing'
        return
      }
    }

    // 1c. Check resize handles for legacy ellipses (locked = no resize)
    if (FM._selAnn && FM._selAnn.shape && !FM._selAnn.shape.type && !FM._metricLocked) {
      var handle = FM._hitHandle(mx, my)
      if (handle) {
        FM._pushUndo()
        FM._mode = 'resize'
        FM._resizeHandle = handle
        return
      }
    }

    // 2. Hit existing polygon annotation -> select it
    var polyHit = FM._hitPolygon(mx, my)
    if (polyHit && !FM._metricLocked) {
      if (FM._polyDrawing) { FM._cancelPoly() }
      FM._selAnn = polyHit
      FM._mode = 'idle'
      FM._canvas.style.cursor = 'grab'
      FM._redraw()
      FM._refreshToolbar()
      return
    }

    // 2b. Hit existing ellipse annotation -> move (legacy)
    var ellipseHit = FM._hitEllipse(mx, my)
    if (ellipseHit && !FM._metricLocked) {
      if (FM._polyDrawing) { FM._cancelPoly() }
      FM._pushUndo()
      FM._selAnn = ellipseHit
      FM._mode = 'move'
      FM._moveStart = { x: mx - ellipseHit.shape.x, y: my - ellipseHit.shape.y }
      FM._canvas.style.cursor = 'grabbing'
      FM._redraw()
      return
    }

    // 3. Polygon drawing mode (zones + selected zone + on canvas)
    if (FM._selectedZone && !inLabelArea && FM._editorMode === 'zones') {
      FM._selAnn = null
      if (!FM._polyDrawing) {
        // Start new polygon
        FM._polyPoints = [{ x: mx, y: my }]
        FM._polyDrawing = true
      } else {
        // Check if closing (click near first point)
        var first = FM._polyPoints[0]
        var dist = Math.sqrt(Math.pow(mx - first.x, 2) + Math.pow(my - first.y, 2))
        if (dist < 15 && FM._polyPoints.length >= 3) {
          FM._closePolygon()
        } else {
          FM._polyPoints.push({ x: mx, y: my })
        }
      }
      FM._redraw()
      return
    }

    // 4. Click on empty -> deselect
    if (FM._selAnn) {
      FM._selAnn = null
      FM._mode = 'idle'
      FM._redraw()
      FM._refreshToolbar()
      return
    }
  }

  FM._onMouseMove = function (e) {
    var mx = e.offsetX, my = e.offsetY

    // GUIDE LINE drag
    if (FM._guideDrag && FM._mode === 'move') {
      if (FM._guideDrag.type === 'hguide') {
        FM._guideLines.h[FM._guideDrag.index].pos = Math.max(0.01, Math.min(0.99, my / FM._imgH))
      } else {
        FM._guideLines.v[FM._guideDrag.index].pos = Math.max(0.01, Math.min(0.99, mx / FM._imgW))
      }
      FM._redraw()
      return
    }

    // VECTORS MODE drag — move/stretch force vectors
    if (FM._editorMode === 'vectors' && FM._vecDrag && FM._mode === 'move') {
      var w = FM._imgW, h = FM._imgH
      var key = FM._vecDrag.key

      if (FM._vecDrag.part === 'tip') {
        // Stretch: update custom offset for this vector
        // Find center from drawn positions
        var vp = FM._vecDrawnPositions.find(function (p) { return p.key === key })
        if (vp) {
          if (!FM._vecCustomOffsets) FM._vecCustomOffsets = {}
          FM._vecCustomOffsets[key] = { dx: (mx - vp.cx) / w, dy: (my - vp.cy) / h }
        }
      } else if (FM._vecDrag.part === 'origin') {
        // Move: update center position in default centers
        var centers = FM.FORCE_DEFAULT_CENTERS
        if (centers[key]) {
          centers[key] = { x: mx / w, y: my / h }
        }
      }
      FM._redraw()
      return
    }

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

    // Polygon point drag
    if (FM._mode === 'move' && FM._dragPolyPoint) {
      var ann = FM._annotations.find(function (a) { return a.id === FM._dragPolyPoint.annId })
      if (ann && ann.shape && ann.shape.type === 'polygon') {
        ann.shape.points[FM._dragPolyPoint.pointIndex] = { x: mx / FM._imgW, y: my / FM._imgH }
        FM._redraw()
      }
      return
    }

    // Whole polygon drag
    if (FM._mode === 'move' && FM._dragPolyWhole) {
      var wAnn = FM._annotations.find(function (a) { return a.id === FM._dragPolyWhole.annId })
      if (wAnn && wAnn.shape && wAnn.shape.type === 'polygon') {
        var dxN = (mx - FM._dragPolyWhole.startX) / FM._imgW
        var dyN = (my - FM._dragPolyWhole.startY) / FM._imgH
        wAnn.shape.points = FM._dragPolyWhole.origPoints.map(function (p) {
          return { x: p.x + dxN, y: p.y + dyN }
        })
        FM._redraw()
      }
      return
    }

    // Legacy ellipse move
    if (FM._mode === 'move' && FM._selAnn && FM._selAnn.shape && !FM._selAnn.shape.type) {
      FM._selAnn.shape.x = mx - FM._moveStart.x
      FM._selAnn.shape.y = my - FM._moveStart.y
      FM._redraw()
      return
    }

    // Legacy ellipse resize
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

    // Polygon drawing preview (update mouse position for dashed line)
    if (FM._polyDrawing) {
      FM._polyMousePos = { x: mx, y: my }
      FM._redraw()
      return
    }

    // Region handle drag (zones mode)
    if (FM._editorMode === 'zones' && FM._regionHandleDrag && FM._mode === 'move') {
      FM._moveRegionHandle(mx, my)
      return
    }

    // Region hover detection (zones mode with landmarks, skip when drawing polygon or zone selected)
    if (FM._editorMode === 'zones' && FM._regionPaths && Object.keys(FM._regionPaths).length > 0 && !FM._polyDrawing && !FM._selectedZone) {
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
    if (FM._selAnn && FM._selAnn.shape && FM._selAnn.shape.type === 'polygon') {
      var pHit = FM._hitPolygonPoint(mx, my, FM._selAnn)
      var eHit = pHit < 0 ? FM._hitPolygonEdge(mx, my, FM._selAnn) : null
      FM._canvas.style.cursor = pHit >= 0 ? 'grab' : (eHit ? 'copy' : (FM._pointInPolygon(mx, my, FM._selAnn.shape.points, FM._imgW, FM._imgH) ? 'grab' : (FM._hitPolygon(mx, my) ? 'grab' : (FM._selectedZone ? 'crosshair' : 'default'))))
    } else if (FM._selAnn && FM._selAnn.shape && !FM._selAnn.shape.type && FM._hitHandle(mx, my)) {
      var h = FM._hitHandle(mx, my)
      FM._canvas.style.cursor = (h === 'n' || h === 's') ? 'ns-resize' : 'ew-resize'
    } else if (FM._hitPolygon(mx, my) || FM._hitEllipse(mx, my)) {
      FM._canvas.style.cursor = 'grab'
    } else {
      FM._canvas.style.cursor = FM._selectedZone ? 'crosshair' : 'default'
    }

    // Tooltip on hover (zones mode, not drawing)
    if (FM._editorMode === 'zones' && !FM._polyDrawing) {
      var hoverAnn = FM._hitPolygon(mx, my)
      FM._showPolyTooltip(hoverAnn, mx, my)
    } else {
      FM._showPolyTooltip(null)
    }
  }

  FM._onMouseUp = function () {
    // Guide line drag end
    if (FM._guideDrag) {
      FM._guideDrag = null
      FM._mode = 'idle'
      return
    }
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
      if (FM._vecDrag) { FM._vecDrag = null; FM._autoSave() }
      FM._mode = 'idle'
      FM._canvas.style.cursor = 'default'
      FM._redraw()
      return
    }
    if (FM._mode === 'move' || FM._mode === 'resize') {
      // End polygon point drag
      if (FM._dragPolyPoint) {
        FM._dragPolyPoint = null
      }
      // End whole polygon drag
      if (FM._dragPolyWhole) {
        FM._dragPolyWhole = null
      }
      FM._mode = 'idle'
      FM._canvas.style.cursor = FM._selectedZone ? 'crosshair' : 'default'
      FM._autoSave()
      FM._redraw()
      FM._refreshToolbar()
      return
    }
  }

  // ── Polygon tooltip on hover ──────────────────────────────
  FM._showPolyTooltip = function (ann, mx, my) {
    var tip = document.getElementById('fmPolyTooltip')
    if (!ann) {
      if (tip) tip.style.display = 'none'
      return
    }
    if (!tip) {
      tip = document.createElement('div')
      tip.id = 'fmPolyTooltip'
      tip.style.cssText = 'position:absolute;z-index:99999;pointer-events:none;padding:4px 8px;border-radius:6px;' +
        'background:rgba(0,0,0,0.85);border:1px solid rgba(200,169,126,0.3);font-size:10px;color:#F5F0E8;' +
        'font-family:Inter,Montserrat,sans-serif;white-space:nowrap;display:none'
      document.body.appendChild(tip)
    }
    var z = FM.ZONES.find(function (x) { return x.id === ann.zone })
    var label = z ? z.label : ann.zone
    var unit = z && z.unit === 'U' ? 'U' : 'mL'
    tip.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' +
      FM._zoneColor(ann.zone) + ';margin-right:4px"></span>' + label + ' &middot; ' + ann.ml + unit
    var rect = FM._canvas.getBoundingClientRect()
    tip.style.left = (rect.left + mx + 14) + 'px'
    tip.style.top = (rect.top + my - 10 + window.scrollY) + 'px'
    tip.style.display = 'block'
  }

  // ── Close polygon and create annotation ──────────────────
  FM._closePolygon = function () {
    if (!FM._polyPoints || FM._polyPoints.length < 3) {
      FM._cancelPoly()
      return
    }

    var mlInput = document.getElementById('fmMl')
    var productInput = document.getElementById('fmProduct')
    var sideSelect = document.getElementById('fmSide')
    var w = FM._imgW, h = FM._imgH

    var zDef = FM.ZONES.find(function (x) { return x.id === FM._selectedZone })
    // Use zone defaults: product, reticulation, quantity
    var qty = zDef && zDef.defaultQty ? zDef.defaultQty : (zDef ? zDef.min : 0.5)
    var product = zDef && zDef.defaultProduct ? zDef.defaultProduct : ''
    var reticulation = zDef && zDef.reticulation ? zDef.reticulation : ''
    var treatment = zDef && zDef.defaultTx ? zDef.defaultTx : 'ah'

    // Normalize to 0-1 coordinates
    var normPoints = FM._polyPoints.map(function (p) {
      return { x: p.x / w, y: p.y / h }
    })

    var newAnn = {
      id: FM._nextId++,
      angle: FM._activeAngle,
      zone: FM._selectedZone,
      treatment: treatment,
      ml: qty,
      product: product,
      reticulation: reticulation,
      side: 'bilateral',
      shape: { type: 'polygon', points: normPoints },
    }
    FM._pushUndo()
    FM._annotations.push(newAnn)
    FM._selAnn = newAnn
    FM._simPhotoUrl = null

    // Reset poly state
    FM._polyPoints = []
    FM._polyDrawing = false
    FM._polyMousePos = null

    FM._autoSave()
    FM._redraw()
    FM._refreshToolbar()
  }

})()
