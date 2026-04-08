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
      landmarksL: [54, 103, 67, 109, 10],
      landmarksR: [284, 332, 297, 338, 10],
      shapeType: 'organic',
      scale: 0.7,
      hasVectors: true,
      vectorDir: { angle: -60, strength: 0.8 },
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

  FM._getRegionState = function (regionId) {
    if (!FM._regionState[regionId]) {
      var r = REGIONS[regionId]
      FM._regionState[regionId] = {
        active: false,
        intensity: r ? r.defaultIntensity : 60,
        treatment: r && FM.ZONES ? (FM.ZONES.find(function (z) { return z.id === regionId }) || {}).defaultTx || 'ah' : 'ah',
        ml: '0.5',
        product: '',
        side: 'bilateral',
      }
    }
    return FM._regionState[regionId]
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

      if (r.shapeType === 'infraorbital') {
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
      else if (r.landmarksL && r.landmarksR) {
        paths.push(_lmPoints(lm, r.landmarksL, w, h))
        paths.push(_lmPoints(lm, r.landmarksR, w, h))
      }
      else if (r.landmarks) {
        paths.push(_lmPoints(lm, r.landmarks, w, h))
      }

      // Compute centroids for each path
      paths.forEach(function (path) {
        var cx = 0, cy = 0
        path.forEach(function (p) { cx += p.x; cy += p.y })
        path._cx = cx / path.length
        path._cy = cy / path.length
        var maxR = 0
        path.forEach(function (p) {
          var d = Math.sqrt((p.x - path._cx) * (p.x - path._cx) + (p.y - path._cy) * (p.y - path._cy))
          if (d > maxR) maxR = d
        })
        path._radius = maxR
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

      // Draw vectors for lifting regions
      if (r.hasVectors && r.vectorDir) {
        paths.forEach(function (path) {
          _drawRegionVector(ctx, path, r, intensity)
        })
      }

      // Label (only on selected or hovered)
      if (isSelected || isHovered) {
        paths.forEach(function (path) {
          _drawRegionLabel(ctx, path, r, st, isSelected)
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
    var y = path._cy - path._radius - 12

    // Background pill
    ctx.font = '600 10px Montserrat, sans-serif'
    var text = region.label
    var tw = ctx.measureText(text).width + 16
    var th = 22

    ctx.fillStyle = _rgba('#0A0A0A', 0.85)
    ctx.beginPath()
    _roundRect(ctx, x - tw / 2, y - th / 2, tw, th, 6)
    ctx.fill()

    // Color accent bar
    ctx.fillStyle = region.color
    ctx.fillRect(x - tw / 2, y - th / 2, 3, th)

    // Text
    ctx.fillStyle = '#F5F0E8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)

    // Dose info below (when selected)
    if (isSelected && state.ml && state.ml !== '0') {
      var zone = FM.ZONES ? FM.ZONES.find(function (z) { return z.id === region.label.toLowerCase() }) : null
      var unit = zone ? zone.unit : 'mL'
      var treatment = FM.TREATMENTS ? FM.TREATMENTS.find(function (t) { return t.id === state.treatment }) : null
      var txLabel = treatment ? treatment.label : state.treatment

      ctx.font = '400 9px Montserrat, sans-serif'
      var detail = state.ml + unit + ' | ' + txLabel
      var dw = ctx.measureText(detail).width + 14

      ctx.fillStyle = _rgba('#0A0A0A', 0.75)
      ctx.beginPath()
      _roundRect(ctx, x - dw / 2, y + th / 2 + 2, dw, 18, 4)
      ctx.fill()

      ctx.fillStyle = _rgba(region.color, 0.8)
      ctx.textAlign = 'center'
      ctx.fillText(detail, x, y + th / 2 + 11)
    }

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

  // ── Annotation Bridge ──────────────────────────────────────
  // Convert active regionState to annotations array for totals/export

  FM._regionAnnotations = function () {
    var anns = []
    Object.keys(FM._regionState).forEach(function (id) {
      var st = FM._regionState[id]
      if (!st.active || !st.ml || st.ml === '0') return
      var r = REGIONS[id]
      if (!r) return
      var paths = FM._regionPaths[id]
      var cx = 0, cy = 0
      if (paths && paths.length > 0) {
        cx = paths[0]._cx || 0
        cy = paths[0]._cy || 0
      }
      anns.push({
        id: 'reg_' + id,
        zone: id,
        angle: FM._activeAngle,
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
    Object.keys(FM._regionState).forEach(function (id) {
      var st = FM._regionState[id]
      if (!st.active || !st.ml || parseFloat(st.ml) === 0) return
      var r = REGIONS[id]
      if (!r) return
      var z = FM.ZONES ? FM.ZONES.find(function (zz) { return zz.id === id }) : null
      var key = id
      if (!totals[key]) {
        totals[key] = { label: r.label, color: r.color, ml: 0, unit: z ? z.unit : 'mL' }
      }
      totals[key].ml += parseFloat(st.ml) || 0
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
    } else {
      FM._drawEllipseClean(ann)
    }
  }

})()
