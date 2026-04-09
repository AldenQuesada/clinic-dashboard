/**
 * fm-regions.js — Anatomical Region Overlay Engine v2
 *
 * Auto-generates anatomical region masks from MediaPipe 468 landmarks.
 * Each region: bezier shape, gradient fill, intensity control, hover glow,
 * vector arrows for lifting zones. Medical design tool, not a drawing tool.
 */
;(function () {
  'use strict'

  var FM = window._FM

  // ── Region Definitions ──────────────────────────────────────
  // Each region: landmarks for L/R (bilateral) or single (midline)
  // shapeType: how to generate the path from landmarks
  // hasVectors: show lifting direction arrows when active
  // vectorDir: { angle (degrees), strength (0-1) } for arrow direction

  var REGIONS = {
    'olheira': {
      label: 'Olheira',
      color: '#7ECF7E',
      landmarksL: [33, 7, 163, 144, 145, 153, 154, 155, 133],
      landmarksR: [362, 382, 381, 380, 374, 373, 390, 249, 263],
      shapeType: 'infraorbital',
      offsetY: 0.012,
      hasVectors: false,
      defaultIntensity: 60,
      order: 1,
    },
    'temporal': {
      label: 'Temporal',
      color: '#9B6FC7',
      // Anchor landmarks for shape computation (not raw polygon)
      // L: temple top(54), temple mid(103), brow outer(70), brow peak(63),
      //    orbital outer(130), zygomatic(93), forehead edge(21), hairline area(71)
      landmarksL: {
        templeTop: 54, templeMid: 103, browOuter: 70, browPeak: 63,
        orbitalOuter: 130, zygomatic: 93, foreheadEdge: 21, browEdge: 71,
      },
      landmarksR: {
        templeTop: 284, templeMid: 332, browOuter: 300, browPeak: 293,
        orbitalOuter: 359, zygomatic: 323, foreheadEdge: 251, browEdge: 301,
      },
      shapeType: 'temporal',
      tiltAngle: 25,  // degrees posterior
      heightRatio: 1.6,  // height = 1.6x width
      hasVectors: true,
      vectors: [
        { angle: -50, strength: 0.7, offset: -0.25 },  // lower vector
        { angle: -45, strength: 0.85, offset: 0 },      // mid vector (main)
        { angle: -40, strength: 0.6, offset: 0.25 },    // upper vector
      ],
      defaultIntensity: 65,
      order: 2,
    },
    'zigoma-lateral': {
      label: 'Zigoma Lateral',
      color: '#5B7FC7',
      landmarksL: [93, 132, 58, 172],
      landmarksR: [323, 361, 288, 397],
      shapeType: 'angular',
      hasVectors: true,
      vectorDir: { angle: -45, strength: 0.7 },
      defaultIntensity: 70,
      order: 3,
    },
    'zigoma-anterior': {
      label: 'Zigoma Anterior',
      color: '#6BBF8A',
      landmarksL: [93, 132, 234, 127],
      landmarksR: [323, 361, 454, 356],
      shapeType: 'soft',
      hasVectors: true,
      vectorDir: { angle: -50, strength: 0.6 },
      defaultIntensity: 60,
      order: 4,
    },
    'sulco': {
      label: 'Sulco Nasogeniano',
      color: '#E8A86B',
      landmarksL: [129, 49, 48, 115, 131, 198, 236, 3, 196, 122, 6],
      landmarksR: [358, 279, 278, 344, 360, 420, 456, 3, 419, 351, 6],
      shapeType: 's_curve',
      curveWidth: 0.015,
      hasVectors: false,
      defaultIntensity: 55,
      order: 5,
    },
    'marionete': {
      label: 'Marionete',
      color: '#D98BA3',
      landmarksL: [61, 146, 91, 181, 84],
      landmarksR: [291, 375, 321, 405, 314],
      shapeType: 'vertical_curve',
      curveWidth: 0.012,
      hasVectors: false,
      defaultIntensity: 50,
      order: 6,
    },
    'pre-jowl': {
      label: 'Pre-Jowl',
      color: '#E8B8C8',
      landmarksL: [176, 148, 152, 149, 150, 136],
      landmarksR: [400, 377, 152, 378, 379, 365],
      shapeType: 'concave',
      hasVectors: false,
      defaultIntensity: 50,
      order: 7,
    },
    'mandibula': {
      label: 'Mandibula',
      color: '#C9A96E',
      landmarksL: [132, 58, 172, 136, 150, 149, 176, 148, 152],
      landmarksR: [361, 288, 397, 365, 379, 378, 400, 377, 152],
      shapeType: 'angular_jaw',
      hasVectors: true,
      vectorDir: { angle: -30, strength: 0.6 },
      defaultIntensity: 65,
      order: 8,
    },
    'mento': {
      label: 'Mento',
      color: '#D4A857',
      landmarks: [152, 377, 400, 378, 379, 365, 397, 288, 361,
                   132, 58, 172, 136, 150, 149, 176, 148],
      shapeType: 'rounded',
      hasVectors: true,
      vectorDir: { angle: 0, strength: 0.5 },
      defaultIntensity: 60,
      order: 9,
    },
    'labio': {
      label: 'Labios',
      color: '#E07B7B',
      landmarks: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
                   409, 270, 269, 267, 0, 37, 39, 40, 185],
      shapeType: 'lip',
      hasVectors: false,
      defaultIntensity: 55,
      order: 10,
    },
    'nariz-dorso': {
      label: 'Nariz',
      color: '#A8B4C8',
      landmarks: [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 327],
      shapeType: 'nose',
      hasVectors: false,
      defaultIntensity: 50,
      order: 11,
    },
    'frontal': {
      label: 'Testa',
      color: '#8ECFC4',
      landmarks: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323,
                   93, 234, 127, 162, 21, 54, 103, 67, 109],
      shapeType: 'forehead',
      hasVectors: false,
      defaultIntensity: 45,
      order: 12,
    },
    'glabela': {
      label: 'Glabela',
      color: '#7BA3CF',
      landmarks: [9, 107, 66, 105, 63, 70, 46, 53, 52, 65,
                   55, 336, 296, 334, 293, 300, 276, 283, 282, 295, 285],
      shapeType: 'between_brows',
      hasVectors: false,
      defaultIntensity: 50,
      order: 13,
    },
    'periorbital': {
      label: 'Pes de Galinha',
      color: '#6BAED6',
      landmarksL: [33, 246, 161, 160, 159, 158, 157, 173],
      landmarksR: [263, 466, 388, 387, 386, 385, 384, 398],
      shapeType: 'crow_feet',
      extend: 0.02,
      hasVectors: false,
      defaultIntensity: 50,
      order: 14,
    },
  }

  // Expose for external use
  FM._ANATOMICAL_REGIONS = REGIONS

  // ── Region State Helpers ───────────────────────────────────

  FM._getRegionState = function (regionId, angle) {
    var ang = angle || FM._activeAngle || 'front'
    var key = ang + '_' + regionId
    if (!FM._regionState[key]) {
      var r = REGIONS[regionId]
      FM._regionState[key] = {
        active: false,
        intensity: r ? r.defaultIntensity : 60,
        treatment: r && FM.ZONES ? (FM.ZONES.find(function (z) { return z.id === regionId }) || {}).defaultTx || 'ah' : 'ah',
        ml: '0.5',
        product: '',
        side: 'bilateral',
        scaleX: 1.0,
        scaleY: 1.0,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
      }
    }
    return FM._regionState[key]
  }

  FM._toggleRegion = function (regionId) {
    var st = FM._getRegionState(regionId)
    FM._pushUndo()
    st.active = !st.active
    if (st.active && !FM._selectedRegion) FM._selectedRegion = regionId
    FM._computeRegionPaths()
    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
  }

  FM._selectRegion = function (regionId) {
    FM._selectedRegion = regionId
    FM._refreshToolbar()
  }

  FM._setRegionIntensity = function (regionId, val) {
    var st = FM._getRegionState(regionId)
    st.intensity = Math.max(0, Math.min(100, parseInt(val) || 0))
    FM._redraw()
    FM._autoSave()
  }

  FM._setRegionTreatment = function (regionId, field, val) {
    var st = FM._getRegionState(regionId)
    st[field] = val
    FM._refreshToolbar()
    FM._autoSave()
  }

  FM._activateAllRegions = function () {
    FM._pushUndo()
    Object.keys(REGIONS).forEach(function (id) {
      FM._getRegionState(id).active = true
    })
    FM._computeRegionPaths()
    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
  }

  FM._deactivateAllRegions = function () {
    FM._pushUndo()
    Object.keys(REGIONS).forEach(function (id) {
      FM._getRegionState(id).active = false
    })
    FM._selectedRegion = null
    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
  }

  // ── Path Computation ───────────────────────────────────────

  FM._computeRegionPaths = function () {
    FM._regionPaths = {}
    if (!FM._scanData || !FM._scanData.landmarks || FM._scanData.landmarks.length < 468) return

    var lm = FM._scanData.landmarks
    var w = FM._imgW
    var h = FM._imgH

    Object.keys(REGIONS).forEach(function (id) {
      var r = REGIONS[id]
      var st = FM._getRegionState(id)
      if (!st.active) return

      var paths = []

      if (r.shapeType === 'temporal') {
        // Advanced temporal shape from anchor landmarks
        if (r.landmarksL && typeof r.landmarksL === 'object' && !Array.isArray(r.landmarksL)) {
          paths.push(_computeTemporalShape(lm, r.landmarksL, w, h, 'left', r))
        }
        if (r.landmarksR && typeof r.landmarksR === 'object' && !Array.isArray(r.landmarksR)) {
          paths.push(_computeTemporalShape(lm, r.landmarksR, w, h, 'right', r))
        }
      }
      else if (r.shapeType === 'infraorbital') {
        if (r.landmarksL) paths.push(_lmPoints(lm, r.landmarksL, w, h, 0, r.offsetY || 0))
        if (r.landmarksR) paths.push(_lmPoints(lm, r.landmarksR, w, h, 0, r.offsetY || 0))
      }
      else if (r.shapeType === 's_curve' || r.shapeType === 'vertical_curve') {
        var cw = (r.curveWidth || 0.015) * w
        if (r.landmarksL) paths.push(_expandCurve(_lmPoints(lm, r.landmarksL, w, h), cw))
        if (r.landmarksR) paths.push(_expandCurve(_lmPoints(lm, r.landmarksR, w, h), cw))
      }
      else if (r.shapeType === 'crow_feet') {
        var ext = (r.extend || 0.02) * w
        if (r.landmarksL) {
          var pL = _lmPoints(lm, r.landmarksL, w, h)
          pL.forEach(function (p) { p.x -= ext * 0.5 })
          paths.push(pL)
        }
        if (r.landmarksR) {
          var pR = _lmPoints(lm, r.landmarksR, w, h)
          pR.forEach(function (p) { p.x += ext * 0.5 })
          paths.push(pR)
        }
      }
      else if (r.landmarksL && r.landmarksR && Array.isArray(r.landmarksL)) {
        paths.push(_lmPoints(lm, r.landmarksL, w, h))
        paths.push(_lmPoints(lm, r.landmarksR, w, h))
      }
      else if (r.landmarks) {
        paths.push(_lmPoints(lm, r.landmarks, w, h))
      }

      // Compute centroids, then apply transforms (scale, rotation)
      paths.forEach(function (path) {
        var cx = 0, cy = 0
        path.forEach(function (p) { cx += p.x; cy += p.y })
        cx /= path.length; cy /= path.length

        // Apply scale + rotation from region state
        var sx = st.scaleX != null ? st.scaleX : 1
        var sy = st.scaleY != null ? st.scaleY : 1
        var rot = (st.rotation || 0) * Math.PI / 180

        if (sx !== 1 || sy !== 1 || rot !== 0) {
          var cosR = Math.cos(rot), sinR = Math.sin(rot)
          path.forEach(function (p) {
            var dx = p.x - cx, dy = p.y - cy
            dx *= sx; dy *= sy
            p.x = cx + dx * cosR - dy * sinR
            p.y = cy + dx * sinR + dy * cosR
          })
        }

        // Apply position offset
        var offX = st.offsetX || 0
        var offY = st.offsetY || 0
        if (offX !== 0 || offY !== 0) {
          path.forEach(function (p) { p.x += offX; p.y += offY })
          cx += offX; cy += offY
        }

        path._cx = cx; path._cy = cy
        var maxR = 0
        path.forEach(function (p) {
          var d = Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy))
          if (d > maxR) maxR = d
        })
        path._radius = maxR

        // Compute bounding box for control handles
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        path.forEach(function (p) {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
        })
        path._bbox = { minX: minX, maxX: maxX, minY: minY, maxY: maxY }
      })

      FM._regionPaths[id] = paths
    })
  }

  // ── Drawing Engine ─────────────────────────────────────────

  FM._drawAllRegions = function () {
    if (!FM._ctx) return
    var ctx = FM._ctx

    // Sort by order (back to front)
    var ids = Object.keys(FM._regionPaths).sort(function (a, b) {
      return (REGIONS[a].order || 99) - (REGIONS[b].order || 99)
    })

    ids.forEach(function (id) {
      var r = REGIONS[id]
      var st = FM._getRegionState(id)
      if (!st.active) return

      var paths = FM._regionPaths[id]
      if (!paths || paths.length === 0) return

      var isHovered = FM._hoveredRegion === id
      var isSelected = FM._selectedRegion === id
      var intensity = st.intensity / 100

      paths.forEach(function (path) {
        if (path.length < 3) return
        _drawRegionPath(ctx, path, r, intensity, isHovered, isSelected)
      })

      // Draw vectors for lifting regions (single or multiple)
      if (r.hasVectors) {
        if (r.vectors && r.vectors.length > 0) {
          // Multiple vectors
          paths.forEach(function (path) {
            r.vectors.forEach(function (vec) {
              _drawRegionVectorMulti(ctx, path, r, intensity, vec)
            })
          })
        } else if (r.vectorDir) {
          // Legacy single vector
          paths.forEach(function (path) {
            _drawRegionVector(ctx, path, r, intensity)
          })
        }
      }

      // Labels — only when global toggle is ON
      if (FM._showRegionLabels) {
        paths.forEach(function (path) {
          _drawRegionLabel(ctx, path, r, st, isSelected)
        })
      }

      // Control handles (only on selected, unlocked)
      if (isSelected && !FM._regionLocked) {
        paths.forEach(function (path) {
          _drawControlHandles(ctx, path, r.color)
        })
      }
    })
  }

  function _drawRegionPath(ctx, path, region, intensity, hovered, selected) {
    ctx.save()

    // Glow effect on hover/selection
    if (hovered || selected) {
      ctx.shadowColor = region.color
      ctx.shadowBlur = selected ? 18 : 12
    }

    // Compute gradient
    var grad = ctx.createRadialGradient(
      path._cx, path._cy, 0,
      path._cx, path._cy, path._radius * 1.3
    )

    var baseAlpha = intensity * 0.35
    var edgeAlpha = intensity * 0.08

    if (hovered) { baseAlpha *= 1.4; edgeAlpha *= 1.4 }
    if (selected) { baseAlpha *= 1.6; edgeAlpha *= 1.5 }

    grad.addColorStop(0, _rgba(region.color, baseAlpha))
    grad.addColorStop(0.55, _rgba(region.color, baseAlpha * 0.8))
    grad.addColorStop(1, _rgba(region.color, edgeAlpha))

    // Draw smooth bezier path
    ctx.beginPath()
    _smoothBezierPath(ctx, path)
    ctx.closePath()

    ctx.fillStyle = grad
    ctx.fill()

    // Border
    ctx.shadowBlur = 0
    var borderAlpha = selected ? 0.7 : (hovered ? 0.5 : 0.2)
    ctx.strokeStyle = _rgba(region.color, borderAlpha)
    ctx.lineWidth = selected ? 2 : 1
    ctx.stroke()

    // Inner highlight (subtle)
    if (selected) {
      ctx.beginPath()
      _smoothBezierPath(ctx, path)
      ctx.closePath()
      ctx.strokeStyle = _rgba('#ffffff', 0.12)
      ctx.lineWidth = 1
      ctx.setLineDash([4, 6])
      ctx.stroke()
      ctx.setLineDash([])
    }

    ctx.restore()
  }

  function _drawRegionVector(ctx, path, region, intensity) {
    if (!region.vectorDir || intensity < 0.1) return

    ctx.save()

    var dir = region.vectorDir
    var rad = dir.angle * Math.PI / 180
    var len = path._radius * 0.6 * dir.strength * intensity

    var sx = path._cx
    var sy = path._cy
    var ex = sx + Math.cos(rad) * len
    var ey = sy + Math.sin(rad) * len

    // Arrow shaft with gradient
    var grad = ctx.createLinearGradient(sx, sy, ex, ey)
    grad.addColorStop(0, _rgba(region.color, 0.15))
    grad.addColorStop(0.4, _rgba(region.color, 0.5 * intensity))
    grad.addColorStop(1, _rgba(region.color, 0.8 * intensity))

    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.strokeStyle = grad
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.stroke()

    // Arrowhead
    var headLen = 8
    var headAngle = 0.45
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - headLen * Math.cos(rad - headAngle), ey - headLen * Math.sin(rad - headAngle))
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - headLen * Math.cos(rad + headAngle), ey - headLen * Math.sin(rad + headAngle))
    ctx.strokeStyle = _rgba(region.color, 0.8 * intensity)
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.restore()
  }

  function _drawRegionLabel(ctx, path, region, state, isSelected) {
    ctx.save()

    var x = path._cx
    var y = path._cy - path._radius - 10

    // Build label text: name + dose (no treatment name)
    var zone = FM.ZONES ? FM.ZONES.find(function (z) { return z.id === Object.keys(REGIONS).find(function (k) { return REGIONS[k] === region }) }) : null
    var unit = zone ? zone.unit : 'mL'
    var hasDose = state.ml && parseFloat(state.ml) > 0
    var text = region.label
    if (hasDose) text += ' | ' + state.ml + unit

    ctx.font = (isSelected ? '600' : '500') + ' 9px Montserrat, sans-serif'
    var tw = ctx.measureText(text).width + 14
    var th = 20

    // Background pill
    ctx.fillStyle = _rgba('#0A0A0A', isSelected ? 0.88 : 0.75)
    ctx.beginPath()
    _roundRect(ctx, x - tw / 2, y - th / 2, tw, th, 5)
    ctx.fill()

    // Color accent bar
    ctx.fillStyle = region.color
    ctx.fillRect(x - tw / 2, y - th / 2, 2.5, th)

    // Text
    ctx.fillStyle = isSelected ? '#F5F0E8' : _rgba('#F5F0E8', 0.8)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)

    ctx.restore()
  }

  // ── Hit Testing (point-in-polygon for hover/click) ─────────

  FM._hitTestRegion = function (mx, my) {
    // Check all active regions, return the smallest one that contains the point
    var hit = null
    var hitSize = Infinity

    Object.keys(FM._regionPaths).forEach(function (id) {
      var paths = FM._regionPaths[id]
      if (!paths) return
      var st = FM._getRegionState(id)
      if (!st.active) return

      paths.forEach(function (path) {
        if (path.length < 3) return
        // Quick radius check
        var dx = mx - path._cx
        var dy = my - path._cy
        var dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > path._radius * 1.5) return

        // Point-in-polygon (ray casting)
        if (_pointInPolygon(mx, my, path)) {
          var size = path._radius
          if (size < hitSize) {
            hit = id
            hitSize = size
          }
        }
      })
    })

    return hit
  }

  function _pointInPolygon(x, y, polygon) {
    var inside = false
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var xi = polygon[i].x, yi = polygon[i].y
      var xj = polygon[j].x, yj = polygon[j].y
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside
      }
    }
    return inside
  }

  // ── Control Handles Drawing ─────────────────────────────────

  function _drawControlHandles(ctx, path, color) {
    if (!path._bbox) return
    var bb = path._bbox
    var cx = path._cx, cy = path._cy

    var handles = _getRegionHandles(path)

    ctx.save()

    handles.forEach(function (h) {
      // Handle circle
      ctx.beginPath()
      ctx.arc(h.x, h.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
    })

    // Rotation handle — above N handle
    var nHandle = handles.find(function (h) { return h.id === 'n' })
    if (nHandle) {
      var rotY = nHandle.y - 22
      // Dashed line from N to rotation handle
      ctx.beginPath()
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = _rgba(color, 0.4)
      ctx.lineWidth = 1
      ctx.moveTo(nHandle.x, nHandle.y)
      ctx.lineTo(nHandle.x, rotY)
      ctx.stroke()
      ctx.setLineDash([])

      // Rotation circle (smaller, different style)
      ctx.beginPath()
      ctx.arc(nHandle.x, rotY, 4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    ctx.restore()
  }

  function _getRegionHandles(path) {
    if (!path._bbox) return []
    var bb = path._bbox
    var cx = path._cx, cy = path._cy
    return [
      { id: 'n', x: cx, y: bb.minY },
      { id: 's', x: cx, y: bb.maxY },
      { id: 'e', x: bb.maxX, y: cy },
      { id: 'w', x: bb.minX, y: cy },
    ]
  }

  // ── Handle Hit Test ────────────────────────────────────────

  FM._hitTestRegionHandle = function (mx, my) {
    if (!FM._selectedRegion || FM._regionLocked) return null
    var paths = FM._regionPaths[FM._selectedRegion]
    if (!paths) return null

    for (var pi = 0; pi < paths.length; pi++) {
      var path = paths[pi]
      var handles = _getRegionHandles(path)

      // Check rotation handle first
      var nH = handles.find(function (h) { return h.id === 'n' })
      if (nH) {
        var rotY = nH.y - 22
        if (Math.sqrt((mx - nH.x) * (mx - nH.x) + (my - rotY) * (my - rotY)) < 8) {
          return { type: 'rotation', cx: path._cx, cy: path._cy }
        }
      }

      // Check cardinal handles
      for (var i = 0; i < handles.length; i++) {
        var h = handles[i]
        if (Math.sqrt((mx - h.x) * (mx - h.x) + (my - h.y) * (my - h.y)) < 8) {
          return { type: h.id, cx: path._cx, cy: path._cy, bbox: path._bbox }
        }
      }
    }
    return null
  }

  // ── Handle Drag ────────────────────────────────────────────

  FM._regionHandleDrag = null  // { type, regionId, startMouse, startState }

  FM._startRegionHandleDrag = function (handleInfo, mx, my) {
    var rid = handleInfo.regionId || FM._selectedRegion
    var st = FM._getRegionState(rid)
    FM._pushUndo()
    FM._regionHandleDrag = {
      type: handleInfo.type,
      regionId: rid,
      startX: mx,
      startY: my,
      cx: handleInfo.cx,
      cy: handleInfo.cy,
      bbox: handleInfo.bbox,
      origScaleX: st.scaleX || 1,
      origScaleY: st.scaleY || 1,
      origRotation: st.rotation || 0,
      origOffsetX: st.offsetX || 0,
      origOffsetY: st.offsetY || 0,
    }
  }

  FM._moveRegionHandle = function (mx, my) {
    var drag = FM._regionHandleDrag
    if (!drag) return

    var st = FM._getRegionState(drag.regionId)

    if (drag.type === 'move') {
      // Move the entire region
      st.offsetX = drag.origOffsetX + (mx - drag.startX)
      st.offsetY = drag.origOffsetY + (my - drag.startY)
    } else if (drag.type === 'rotation') {
      var startAngle = Math.atan2(drag.startY - drag.cy, drag.startX - drag.cx)
      var curAngle = Math.atan2(my - drag.cy, mx - drag.cx)
      var delta = (curAngle - startAngle) * 180 / Math.PI
      st.rotation = Math.round(drag.origRotation + delta)
    } else if (drag.type === 'e' || drag.type === 'w') {
      var origDistX = Math.abs(drag.type === 'e' ? drag.bbox.maxX - drag.cx : drag.cx - drag.bbox.minX)
      var curDistX = Math.abs(mx - drag.cx)
      if (origDistX > 5) {
        st.scaleX = Math.max(0.3, Math.min(3, drag.origScaleX * (curDistX / origDistX)))
      }
    } else if (drag.type === 'n' || drag.type === 's') {
      var origDistY = Math.abs(drag.type === 's' ? drag.bbox.maxY - drag.cy : drag.cy - drag.bbox.minY)
      var curDistY = Math.abs(my - drag.cy)
      if (origDistY > 5) {
        st.scaleY = Math.max(0.3, Math.min(3, drag.origScaleY * (curDistY / origDistY)))
      }
    }

    FM._computeRegionPaths()
    FM._redraw()
  }

  FM._endRegionHandleDrag = function () {
    FM._regionHandleDrag = null
    FM._autoSave()
  }

  // ── Toggle Labels ──────────────────────────────────────────

  FM._setRegionTransform = function (regionId, field, val) {
    var st = FM._getRegionState(regionId)
    FM._pushUndo()
    st[field] = val
    FM._computeRegionPaths()
    FM._redraw()
    FM._autoSave()
  }

  FM._resetRegionTransform = function (regionId) {
    var st = FM._getRegionState(regionId)
    FM._pushUndo()
    st.scaleX = 1.0
    st.scaleY = 1.0
    st.rotation = 0
    st.offsetX = 0
    st.offsetY = 0
    FM._computeRegionPaths()
    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
  }

  FM._toggleRegionLabels = function () {
    FM._showRegionLabels = !FM._showRegionLabels
    FM._redraw()
    FM._refreshToolbar()
  }

  FM._toggleRegionLock = function () {
    FM._toggleLock('zones', '1x')
  }

  // ── Annotation Bridge ──────────────────────────────────────
  // Convert active regionState to annotations array for totals/export

  FM._regionAnnotations = function () {
    var anns = []
    var ang = FM._activeAngle || 'front'
    var prefix = ang + '_'
    Object.keys(FM._regionState).forEach(function (key) {
      if (key.indexOf(prefix) !== 0) return
      var st = FM._regionState[key]
      if (!st.active || !st.ml || st.ml === '0') return
      var regionId = key.substring(prefix.length)
      var r = REGIONS[regionId]
      if (!r) return
      var paths = FM._regionPaths[regionId]
      var cx = 0, cy = 0
      if (paths && paths.length > 0) {
        cx = paths[0]._cx || 0
        cy = paths[0]._cy || 0
      }
      anns.push({
        id: 'reg_' + key,
        zone: regionId,
        angle: ang,
        treatment: st.treatment,
        ml: st.ml,
        product: st.product,
        side: st.side,
        shape: { x: cx, y: cy, rx: 30, ry: 20 },
      })
    })
    return anns
  }

  // ── Calc Totals (override for zones tab) ───────────────────

  FM._calcRegionTotals = function () {
    var totals = {}
    var ang = FM._activeAngle || 'front'
    var prefix = ang + '_'
    Object.keys(FM._regionState).forEach(function (key) {
      if (key.indexOf(prefix) !== 0) return
      var st = FM._regionState[key]
      if (!st.active || !st.ml || parseFloat(st.ml) === 0) return
      var regionId = key.substring(prefix.length)
      var r = REGIONS[regionId]
      if (!r) return
      var z = FM.ZONES ? FM.ZONES.find(function (zz) { return zz.id === regionId }) : null
      if (!totals[regionId]) {
        totals[regionId] = { label: r.label, color: r.color, ml: 0, unit: z ? z.unit : 'mL' }
      }
      totals[regionId].ml += parseFloat(st.ml) || 0
    })
    return Object.keys(totals).map(function (k) { return totals[k] })
  }

  // ── Smooth Bezier Path (Catmull-Rom) ───────────────────────

  function _smoothBezierPath(ctx, pts) {
    if (pts.length < 2) return
    ctx.moveTo(pts[0].x, pts[0].y)
    if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); return }

    var tension = 0.3
    for (var i = 0; i < pts.length; i++) {
      var p0 = pts[(i - 1 + pts.length) % pts.length]
      var p1 = pts[i]
      var p2 = pts[(i + 1) % pts.length]
      var p3 = pts[(i + 2) % pts.length]
      ctx.bezierCurveTo(
        p1.x + (p2.x - p0.x) * tension,
        p1.y + (p2.y - p0.y) * tension,
        p2.x - (p3.x - p1.x) * tension,
        p2.y - (p3.y - p1.y) * tension,
        p2.x, p2.y
      )
    }
  }

  // ── Temporal Shape Generator ─────────────────────────────

  function _computeTemporalShape(lm, anchors, w, h, side, region) {
    // Get anchor positions
    var p = {}
    Object.keys(anchors).forEach(function (key) {
      var idx = anchors[key]
      if (idx < lm.length) {
        p[key] = { x: lm[idx].x * w, y: lm[idx].y * h }
      }
    })

    if (!p.templeTop || !p.templeMid || !p.browOuter || !p.zygomatic) return []

    var flip = side === 'right' ? -1 : 1

    // Compute the temporal fossa center
    var cx = (p.templeTop.x + p.templeMid.x + p.browOuter.x) / 3
    var cy = (p.templeTop.y + p.templeMid.y + p.browOuter.y) / 3

    // Compute dimensions from landmarks
    var eyeToTemple = Math.abs(p.templeMid.x - p.browOuter.x)
    var regionWidth = eyeToTemple * 0.85
    var regionHeight = regionWidth * (region.heightRatio || 1.6)

    // Tilt angle (posterior lean)
    var tilt = (region.tiltAngle || 25) * Math.PI / 180

    // Build 8 control points forming the anatomical temporal shape
    // Points go clockwise from top
    var pts = []

    // 1. TOP — slightly posterior and above lateral eyebrow
    pts.push({
      x: cx + flip * regionWidth * 0.05 * Math.cos(tilt) - regionHeight * 0.48 * Math.sin(tilt),
      y: cy - regionHeight * 0.48 * Math.cos(tilt) - flip * regionWidth * 0.05 * Math.sin(tilt),
    })

    // 2. UPPER OUTER — convex toward hairline
    pts.push({
      x: cx + flip * regionWidth * 0.45 - regionHeight * 0.3 * Math.sin(tilt),
      y: cy - regionHeight * 0.3 * Math.cos(tilt),
    })

    // 3. MID OUTER — maximum width point
    pts.push({
      x: cx + flip * regionWidth * 0.5,
      y: cy - regionHeight * 0.05,
    })

    // 4. LOWER OUTER — slight inward taper
    pts.push({
      x: cx + flip * regionWidth * 0.35 + regionHeight * 0.2 * Math.sin(tilt),
      y: cy + regionHeight * 0.25 * Math.cos(tilt),
    })

    // 5. BOTTOM — above zygomatic arch (tapered)
    pts.push({
      x: cx + flip * regionWidth * 0.1 + regionHeight * 0.35 * Math.sin(tilt),
      y: cy + regionHeight * 0.45 * Math.cos(tilt),
    })

    // 6. INNER LOWER — concave following orbital
    pts.push({
      x: cx - flip * regionWidth * 0.2 + regionHeight * 0.15 * Math.sin(tilt),
      y: cy + regionHeight * 0.2 * Math.cos(tilt),
    })

    // 7. INNER MID — concave curve (key for realism)
    pts.push({
      x: cx - flip * regionWidth * 0.3,
      y: cy + regionHeight * 0.02,
    })

    // 8. INNER UPPER — returns to top
    pts.push({
      x: cx - flip * regionWidth * 0.15 - regionHeight * 0.25 * Math.sin(tilt),
      y: cy - regionHeight * 0.35 * Math.cos(tilt),
    })

    return pts
  }

  // ── Multi-Vector Drawing ──────────────────────────────────

  function _drawRegionVectorMulti(ctx, path, region, intensity, vecDef) {
    if (intensity < 0.1) return

    ctx.save()

    var rad = vecDef.angle * Math.PI / 180
    var len = path._radius * 0.5 * vecDef.strength * intensity

    // Offset along the perpendicular to the vector direction
    var perpRad = rad + Math.PI / 2
    var offsetDist = (vecDef.offset || 0) * path._radius

    var sx = path._cx + Math.cos(perpRad) * offsetDist
    var sy = path._cy + Math.sin(perpRad) * offsetDist
    var ex = sx + Math.cos(rad) * len
    var ey = sy + Math.sin(rad) * len

    // Thin arrow shaft with gradient
    var grad = ctx.createLinearGradient(sx, sy, ex, ey)
    grad.addColorStop(0, _rgba(region.color, 0.08))
    grad.addColorStop(0.3, _rgba(region.color, 0.3 * intensity))
    grad.addColorStop(1, _rgba(region.color, 0.6 * intensity))

    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.strokeStyle = grad
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    ctx.stroke()

    // Soft glow
    ctx.shadowColor = region.color
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.strokeStyle = _rgba(region.color, 0.15 * intensity)
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.shadowBlur = 0

    // Small arrowhead
    var headLen = 6
    var headAngle = 0.4
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - headLen * Math.cos(rad - headAngle), ey - headLen * Math.sin(rad - headAngle))
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - headLen * Math.cos(rad + headAngle), ey - headLen * Math.sin(rad + headAngle))
    ctx.strokeStyle = _rgba(region.color, 0.7 * intensity)
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.stroke()

    ctx.restore()
  }

  // ── Helpers ────────────────────────────────────────────────

  function _lmPoints(lm, indices, w, h, offX, offY) {
    offX = offX || 0; offY = offY || 0
    var pts = []
    indices.forEach(function (idx) {
      if (idx < lm.length) {
        pts.push({ x: lm[idx].x * w + offX * w, y: lm[idx].y * h + offY * h })
      }
    })
    return pts
  }

  function _expandCurve(center, width) {
    var left = [], right = []
    center.forEach(function (p, i) {
      var nx = 0, ny = 1
      if (i < center.length - 1) {
        var dx = center[i + 1].x - p.x
        var dy = center[i + 1].y - p.y
        var len = Math.sqrt(dx * dx + dy * dy) || 1
        nx = -dy / len; ny = dx / len
      }
      left.push({ x: p.x + nx * width * 0.5, y: p.y + ny * width * 0.5 })
      right.unshift({ x: p.x - nx * width * 0.5, y: p.y - ny * width * 0.5 })
    })
    return left.concat(right)
  }

  function _rgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16)
    var g = parseInt(hex.slice(3, 5), 16)
    var b = parseInt(hex.slice(5, 7), 16)
    return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.min(1, Math.max(0, alpha)).toFixed(3) + ')'
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
  }

  // Legacy compatibility — still used by export/report
  FM._drawRegionOrEllipse = function (ann) {
    var region = REGIONS[ann.zone]
    if (region && FM._scanData && FM._scanData.landmarks && FM._scanData.landmarks.length >= 468) {
      // Draw single annotation as anatomical shape
      var paths = FM._regionPaths[ann.zone]
      if (paths && paths.length > 0) {
        var ctx = FM._ctx
        paths.forEach(function (path) {
          if (path.length < 3) return
          _drawRegionPath(ctx, path, region, 0.6, false, false)
        })
      }
    } else if (ann.shape && ann.shape.type === 'polygon') {
      FM._drawPolygon(ann)
    } else {
      FM._drawEllipseClean(ann)
    }
  }

})()
