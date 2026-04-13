/**
 * fm-draw.js — Pure drawing functions (split from fm-canvas.js)
 */
;(function () {
  'use strict'

  var FM = window._FM
  var LABEL_MARGIN = 180

  FM._LABEL_MARGIN = LABEL_MARGIN

  FM._drawEllipseClean = function (ann) {
    var color = FM._zoneColor(ann.zone)
    var s = ann.shape

    FM._ctx.save()

    FM._ctx.beginPath()
    FM._ctx.fillStyle = color + '50'
    FM._ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    FM._ctx.fill()

    FM._ctx.beginPath()
    FM._ctx.strokeStyle = color
    FM._ctx.lineWidth = 2
    FM._ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    FM._ctx.stroke()

    FM._ctx.beginPath()
    FM._ctx.fillStyle = '#fff'
    FM._ctx.arc(s.x, s.y, 3, 0, Math.PI * 2)
    FM._ctx.fill()
    FM._ctx.strokeStyle = color
    FM._ctx.lineWidth = 1
    FM._ctx.stroke()

    FM._ctx.restore()
  }

  FM._drawLabelExternal = function (ann, labelY, labelH) {
    var color = FM._zoneColor(ann.zone)
    var z = FM.ZONES.find(function (x) { return x.id === ann.zone })
    var t = FM.TREATMENTS.find(function (x) { return x.id === ann.treatment }) || FM.TREATMENTS[0]
    var s = ann.shape
    var zUnit = z ? z.unit : 'mL'

    var targetY = Math.max(labelY, s.y - 10)

    FM._ctx.save()

    var lineEndX = FM._imgW + 10
    FM._ctx.beginPath()
    FM._ctx.strokeStyle = '#C8A97E'
    FM._ctx.lineWidth = 1
    FM._ctx.setLineDash([])
    FM._ctx.moveTo(s.x, s.y)
    FM._ctx.lineTo(FM._imgW, s.y)
    if (Math.abs(s.y - (targetY + 8)) > 2) {
      FM._ctx.lineTo(FM._imgW, targetY + 8)
    }
    FM._ctx.lineTo(lineEndX, targetY + 8)
    FM._ctx.stroke()

    FM._ctx.beginPath()
    FM._ctx.fillStyle = color
    FM._ctx.arc(lineEndX, targetY + 8, 3, 0, Math.PI * 2)
    FM._ctx.fill()

    var lx = lineEndX + 8
    FM._ctx.font = '600 11px Inter, Montserrat, sans-serif'
    FM._ctx.textAlign = 'left'
    FM._ctx.fillStyle = '#F5F0E8'
    FM._ctx.fillText(z ? z.label : ann.zone, lx, targetY + 6)

    FM._ctx.font = '400 9px Inter, Montserrat, sans-serif'
    FM._ctx.fillStyle = '#C8A97E'
    FM._ctx.fillText(ann.ml + zUnit + ' \u2022 ' + (z ? z.desc : ''), lx, targetY + 18)

    FM._ctx.restore()

    return targetY + labelH
  }

  // Keep old name for report canvases
  FM._drawEllipse = function (ann) { FM._drawEllipseClean(ann) }

  FM._drawEllipseOn = function (ctx, ann) {
    var color = FM._zoneColor(ann.zone)
    var z = FM.ZONES.find(function (x) { return x.id === ann.zone })
    var t = FM.TREATMENTS.find(function (x) { return x.id === ann.treatment }) || FM.TREATMENTS[0]
    var s = ann.shape

    ctx.save()
    var opacity = typeof ann.opacity === 'number' ? ann.opacity : 0.44
    var opHex = Math.round(opacity * 255).toString(16).padStart(2, '0')
    ctx.beginPath()
    ctx.fillStyle = color + opHex
    ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    ctx.stroke()

    var label = (z ? z.label : ann.zone)
    var zUnit = z ? z.unit : 'mL'
    var detail = t.label + ' \u2022 ' + ann.ml + zUnit
    ctx.font = '600 11px Inter, Montserrat, sans-serif'
    ctx.textAlign = 'center'

    var tw = Math.max(ctx.measureText(label).width, ctx.measureText(detail).width) + 14
    var tx = s.x
    var ty = s.y - s.ry - 20

    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.beginPath()
    ctx.roundRect(tx - tw / 2, ty - 11, tw, 32, 5)
    ctx.fill()

    ctx.fillStyle = color
    ctx.fillRect(tx - tw / 2, ty - 11, 4, 32)

    ctx.fillStyle = '#fff'
    ctx.fillText(label, tx, ty + 3)
    ctx.font = '400 10px Inter, Montserrat, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(detail, tx, ty + 16)

    ctx.beginPath()
    ctx.strokeStyle = color + '80'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.moveTo(s.x, s.y - s.ry)
    ctx.lineTo(s.x, ty + 21)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.restore()
  }

  FM._scaleAnn = function (ann, s) {
    var shape
    if (ann.shape && ann.shape.type === 'polygon') {
      shape = { type: 'polygon', points: ann.shape.points.map(function (p) { return { x: p.x * s, y: p.y * s } }) }
    } else {
      shape = { x: ann.shape.x * s, y: ann.shape.y * s, rx: ann.shape.rx * s, ry: ann.shape.ry * s }
    }
    return {
      id: ann.id, angle: ann.angle, zone: ann.zone, treatment: ann.treatment,
      ml: ann.ml, product: ann.product, side: ann.side,
      shape: shape
    }
  }

  // ── Polygon Drawing ──────────────────────────────────────

  FM._drawPolygon = function (ann) {
    var ctx = FM._ctx
    var pts = ann.shape.points
    if (!pts || pts.length < 3) return
    var color = FM._zoneColor(ann.zone)
    var w = FM._imgW, h = FM._imgH

    ctx.save()

    // Fill
    ctx.beginPath()
    ctx.moveTo(pts[0].x * w, pts[0].y * h)
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h)
    ctx.closePath()
    var opac = FM._polyOpacity != null ? FM._polyOpacity / 100 : 0.5
    ctx.globalAlpha = opac
    ctx.fillStyle = color
    ctx.fill()
    ctx.globalAlpha = 1

    // Border
    ctx.strokeStyle = color + '99'
    ctx.lineWidth = 2
    ctx.stroke()

    // Label at centroid
    var cx = 0, cy = 0
    pts.forEach(function (p) { cx += p.x * w; cy += p.y * h })
    cx /= pts.length; cy /= pts.length

    // No labels on canvas — clean view for markings. Labels show in report only.
    ctx.restore()
  }

  FM._drawPolygonOn = function (ctx, ann, w, h) {
    var pts = ann.shape.points
    if (!pts || pts.length < 3) return
    var color = FM._zoneColor(ann.zone)

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(pts[0].x * w, pts[0].y * h)
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h)
    ctx.closePath()
    ctx.fillStyle = color + '33'
    ctx.fill()
    ctx.strokeStyle = color + '99'
    ctx.lineWidth = 2
    ctx.stroke()

    var cx = 0, cy = 0
    pts.forEach(function (p) { cx += p.x * w; cy += p.y * h })
    cx /= pts.length; cy /= pts.length

    var z = FM.ZONES.find(function (zz) { return zz.id === ann.zone })
    var label = z ? z.label : ann.zone
    var unit = z && z.unit === 'U' ? 'U' : 'mL'
    ctx.font = '600 10px Inter, Montserrat, sans-serif'
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText(label + ' ' + ann.ml + unit, cx, cy + 4)
    ctx.restore()
  }

  FM._drawPolyPreview = function () {
    var ctx = FM._ctx
    var pts = FM._polyPoints
    if (!pts || pts.length === 0) return
    var color = FM._zoneColor(FM._selectedZone)
    var w = FM._imgW, h = FM._imgH

    ctx.save()

    // Semi-transparent fill preview when >= 3 points
    if (pts.length >= 3) {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (var fi = 1; fi < pts.length; fi++) ctx.lineTo(pts[fi].x, pts[fi].y)
      if (FM._polyMousePos) ctx.lineTo(FM._polyMousePos.x, FM._polyMousePos.y)
      ctx.closePath()
      ctx.fillStyle = color + '26'  // 15% opacity
      ctx.fill()
    }

    // Draw connected lines between placed points
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()

    // Dashed preview line from last point to cursor
    if (FM._polyMousePos && pts.length > 0) {
      ctx.beginPath()
      ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
      ctx.lineTo(FM._polyMousePos.x, FM._polyMousePos.y)
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = color + 'AA'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Draw points
    for (var j = 0; j < pts.length; j++) {
      var isFirst = j === 0
      var radius = isFirst ? 8 : 5
      ctx.beginPath()
      ctx.arc(pts[j].x, pts[j].y, radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      // First point: extra ring to indicate "close here"
      if (isFirst && pts.length >= 3) {
        ctx.beginPath()
        ctx.arc(pts[0].x, pts[0].y, 15, 0, Math.PI * 2)
        ctx.strokeStyle = color + '55'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    ctx.restore()
  }

  FM._drawPolygonHandles = function (ann) {
    if (!ann || !ann.shape || ann.shape.type !== 'polygon') return
    var ctx = FM._ctx
    var pts = ann.shape.points
    var w = FM._imgW, h = FM._imgH
    var color = FM._zoneColor(ann.zone)

    ctx.save()

    // Dashed border
    ctx.beginPath()
    ctx.moveTo(pts[0].x * w, pts[0].y * h)
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h)
    ctx.closePath()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 3])
    ctx.stroke()
    ctx.setLineDash([])

    // Point handles
    for (var j = 0; j < pts.length; j++) {
      ctx.beginPath()
      ctx.arc(pts[j].x * w, pts[j].y * h, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
    }

    ctx.restore()
  }

  // Point-in-polygon ray casting
  FM._pointInPolygon = function (px, py, points, w, h) {
    var inside = false
    for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
      var xi = points[i].x * w, yi = points[i].y * h
      var xj = points[j].x * w, yj = points[j].y * h
      var intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }

  FM._hitPolygon = function (x, y) {
    var w = FM._imgW, h = FM._imgH
    var anns = FM._annotations.filter(function (a) {
      return a.angle === FM._activeAngle && a.shape && a.shape.type === 'polygon'
    })
    for (var i = anns.length - 1; i >= 0; i--) {
      if (FM._pointInPolygon(x, y, anns[i].shape.points, w, h)) return anns[i]
    }
    return null
  }

  FM._hitPolygonPoint = function (x, y, ann) {
    if (!ann || !ann.shape || ann.shape.type !== 'polygon') return -1
    var w = FM._imgW, h = FM._imgH
    for (var i = 0; i < ann.shape.points.length; i++) {
      var dx = x - ann.shape.points[i].x * w
      var dy = y - ann.shape.points[i].y * h
      if (dx * dx + dy * dy <= 100) return i  // 10px radius
    }
    return -1
  }

  // Hit test polygon edge — returns { index } if click is within 8px of edge between points[i] and points[i+1]
  FM._hitPolygonEdge = function (x, y, ann) {
    if (!ann || !ann.shape || ann.shape.type !== 'polygon') return null
    var w = FM._imgW, h = FM._imgH
    var pts = ann.shape.points
    for (var i = 0; i < pts.length; i++) {
      var j = (i + 1) % pts.length
      var ax = pts[i].x * w, ay = pts[i].y * h
      var bx = pts[j].x * w, by = pts[j].y * h
      var dx = bx - ax, dy = by - ay
      var lenSq = dx * dx + dy * dy
      if (lenSq < 1) continue
      var t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lenSq))
      var px = ax + t * dx, py = ay + t * dy
      var dist = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2))
      if (dist < 8) return { index: i }
    }
    return null
  }

  // Cancel in-progress polygon
  FM._cancelPoly = function () {
    FM._polyPoints = []
    FM._polyDrawing = false
    FM._polyMousePos = null
    FM._redraw()
  }

  // ── Mirror polygon horizontally (bilateral) ──────────────
  FM._mirrorPolygon = function () {
    if (!FM._selAnn || !FM._selAnn.shape || FM._selAnn.shape.type !== 'polygon') return
    FM._pushUndo()
    var orig = FM._selAnn
    var mirroredPoints = orig.shape.points.map(function (p) { return { x: 1 - p.x, y: p.y } })
    var newAnn = {
      id: FM._nextId++,
      angle: orig.angle,
      zone: orig.zone,
      treatment: orig.treatment,
      ml: orig.ml,
      product: orig.product,
      side: orig.side === 'esquerdo' ? 'direito' : (orig.side === 'direito' ? 'esquerdo' : orig.side),
      shape: { type: 'polygon', points: mirroredPoints }
    }
    FM._annotations.push(newAnn)
    FM._autoSave()
    FM._redraw()
    FM._refreshToolbar()
  }

  FM._drawVector = function (vec) {
    var color = FM._zoneColor(vec.zone)
    var sx = vec.start.x, sy = vec.start.y
    var ex = vec.end.x, ey = vec.end.y

    var mx = (sx + ex) / 2
    var my = (sy + ey) / 2
    var dx = ex - sx, dy = ey - sy
    var len = Math.sqrt(dx * dx + dy * dy)
    var nx = -dy / len * vec.curve * len
    var ny = dx / len * vec.curve * len
    var cpx = mx + nx, cpy = my + ny

    FM._ctx.save()

    FM._ctx.shadowColor = color
    FM._ctx.shadowBlur = 8

    var grad = FM._ctx.createLinearGradient(sx, sy, ex, ey)
    grad.addColorStop(0, color + '40')
    grad.addColorStop(0.3, color + 'CC')
    grad.addColorStop(1, color)

    FM._ctx.beginPath()
    FM._ctx.moveTo(sx, sy)
    FM._ctx.quadraticCurveTo(cpx, cpy, ex, ey)
    FM._ctx.strokeStyle = grad
    FM._ctx.lineWidth = 3.5
    FM._ctx.lineCap = 'round'
    FM._ctx.stroke()

    FM._ctx.shadowBlur = 0

    FM._ctx.beginPath()
    FM._ctx.moveTo(sx, sy)
    FM._ctx.quadraticCurveTo(cpx, cpy, ex, ey)
    FM._ctx.strokeStyle = '#fff'
    FM._ctx.lineWidth = 1
    FM._ctx.globalAlpha = 0.3
    FM._ctx.stroke()
    FM._ctx.globalAlpha = 1

    // Arrowhead
    var angle = Math.atan2(ey - cpy, ex - cpx)
    var aLen = 12
    var aWidth = 5
    FM._ctx.beginPath()
    FM._ctx.moveTo(ex, ey)
    FM._ctx.lineTo(ex - aLen * Math.cos(angle - Math.PI / aWidth), ey - aLen * Math.sin(angle - Math.PI / aWidth))
    FM._ctx.lineTo(ex - aLen * 0.6 * Math.cos(angle), ey - aLen * 0.6 * Math.sin(angle))
    FM._ctx.lineTo(ex - aLen * Math.cos(angle + Math.PI / aWidth), ey - aLen * Math.sin(angle + Math.PI / aWidth))
    FM._ctx.closePath()
    FM._ctx.fillStyle = color
    FM._ctx.fill()

    // Origin dot
    FM._ctx.beginPath()
    FM._ctx.arc(sx, sy, 4, 0, Math.PI * 2)
    FM._ctx.fillStyle = color + '80'
    FM._ctx.fill()
    FM._ctx.strokeStyle = '#fff'
    FM._ctx.lineWidth = 1.5
    FM._ctx.stroke()

    FM._ctx.restore()
  }

  FM._drawVectorLabel = function (vec, labelY, labelH) {
    var z = FM.ZONES.find(function (x) { return x.id === vec.zone })
    var color = z ? z.color : '#C8A97E'
    var preset = FM.VECTOR_PRESETS[vec.zone]
    var desc = preset ? preset.desc : (z ? z.desc : '')

    var targetY = Math.max(labelY, vec.start.y - 10)
    var lineEndX = FM._imgW + 10

    FM._ctx.save()

    FM._ctx.beginPath()
    FM._ctx.strokeStyle = '#C8A97E'
    FM._ctx.lineWidth = 1
    FM._ctx.moveTo(vec.start.x, vec.start.y)
    FM._ctx.lineTo(FM._imgW, vec.start.y)
    if (Math.abs(vec.start.y - (targetY + 8)) > 2) {
      FM._ctx.lineTo(FM._imgW, targetY + 8)
    }
    FM._ctx.lineTo(lineEndX, targetY + 8)
    FM._ctx.stroke()

    FM._ctx.beginPath()
    FM._ctx.fillStyle = color
    FM._ctx.arc(lineEndX, targetY + 8, 3, 0, Math.PI * 2)
    FM._ctx.fill()

    var lx = lineEndX + 8
    FM._ctx.font = '600 11px Inter, Montserrat, sans-serif'
    FM._ctx.textAlign = 'left'
    FM._ctx.fillStyle = '#F5F0E8'
    FM._ctx.fillText(z ? z.label : vec.zone, lx, targetY + 6)

    FM._ctx.font = '400 9px Inter, Montserrat, sans-serif'
    FM._ctx.fillStyle = '#C8A97E'
    FM._ctx.fillText('(' + desc + ')', lx, targetY + 18)

    FM._ctx.restore()
    return targetY + labelH
  }

  FM._getHandles = function (s) {
    return [
      { id: 'n', x: s.x,        y: s.y - s.ry },
      { id: 's', x: s.x,        y: s.y + s.ry },
      { id: 'e', x: s.x + s.rx, y: s.y },
      { id: 'w', x: s.x - s.rx, y: s.y },
    ]
  }

  // ── Force Vector Drawing ──────────────────────────────────

  FM._drawForceArrow = function (ctx, x1, y1, x2, y2, color, thickness, glowColor) {
    var headLen = 18
    var dx = x2 - x1, dy = y2 - y1
    var angle = Math.atan2(dy, dx)
    var len = Math.sqrt(dx * dx + dy * dy)
    if (len < 5) return

    ctx.save()

    // Glow
    if (glowColor) {
      ctx.shadowColor = glowColor
      ctx.shadowBlur = 12
    }

    // Shaft
    ctx.strokeStyle = color
    ctx.lineWidth = thickness || 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2 - Math.cos(angle) * headLen * 0.6, y2 - Math.sin(angle) * headLen * 0.6)
    ctx.stroke()

    // Arrowhead
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4))
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4))
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  // Store last drawn positions for hit-testing
  FM._vecDrawnPositions = []

  FM._drawForceVectorPair = function (ctx, def, center, age, w, h, selected, key) {
    var t = FM._vecAgeFactor(age)
    var cx = center.x * w, cy = center.y * h

    // Check for custom offsets (from user drag)
    var custom = FM._vecCustomOffsets && FM._vecCustomOffsets[key]

    // Compute young and aged endpoints
    var youngX = cx + def.youngDx * w, youngY = cy + def.youngDy * h
    var agedX = cx + def.agedDx * w, agedY = cy + def.agedDy * h

    // Lerp to current age position
    var curX = FM._vecLerp(youngX, agedX, t)
    var curY = FM._vecLerp(youngY, agedY, t)

    // Apply custom offset if user dragged the tip
    if (custom) { curX = cx + custom.dx * w; curY = cy + custom.dy * h }

    // Store for hit-testing
    FM._vecDrawnPositions.push({ key: key, defId: def.id, cx: cx, cy: cy, tipX: curX, tipY: curY })

    // Color based on age factor
    var color = FM._vecAgeColor(t)
    var glow = color + '60'

    // Animated pulse phase
    var pulse = (Math.sin(Date.now() / 400 + cx) + 1) / 2  // 0-1 oscillation

    // Draw origin dot with glow
    ctx.save()
    ctx.fillStyle = def.color
    ctx.shadowColor = def.color + 'A0'
    ctx.shadowBlur = 10 + pulse * 6
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Pulsing ring (animated radius + opacity)
    ctx.strokeStyle = def.color
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.2 + pulse * 0.5
    ctx.beginPath()
    ctx.arc(cx, cy, 10 + pulse * 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.restore()

    // Draw force arrow (wider default)
    FM._drawForceArrow(ctx, cx, cy, curX, curY, color, selected ? 8 : 6, glow)

    // Label
    ctx.save()
    ctx.font = '600 9px Inter, Montserrat, sans-serif'
    ctx.fillStyle = def.color
    ctx.globalAlpha = 0.7
    ctx.textAlign = 'center'
    ctx.fillText(def.label.toUpperCase(), cx, cy - 14)
    ctx.restore()
  }

  // Animation loop for pulsing dots
  FM._vecAnimFrame = null
  FM._startVecAnimation = function () {
    if (FM._vecAnimFrame) return
    function tick() {
      if (FM._editorMode !== 'vectors' || FM._activeTab !== 'vectors') { FM._vecAnimFrame = null; return }
      FM._redraw()
      FM._vecAnimFrame = requestAnimationFrame(tick)
    }
    FM._vecAnimFrame = requestAnimationFrame(tick)
  }
  FM._stopVecAnimation = function () {
    if (FM._vecAnimFrame) { cancelAnimationFrame(FM._vecAnimFrame); FM._vecAnimFrame = null }
  }

  FM._drawAllForceVectors = function (ctx, age, w, h, selectedId, invert) {
    FM._vecDrawnPositions = []
    var centers = FM.FORCE_DEFAULT_CENTERS

    FM.FORCE_VECTORS.forEach(function (def) {
      // For lifting (invert=true): flip dy to point UP instead of DOWN
      var d = def
      if (invert) {
        d = { id: def.id, label: def.label, color: '#10B981',
          youngDx: def.youngDx, youngDy: -Math.abs(def.youngDy),
          agedDx: def.agedDx, agedDy: -Math.abs(def.agedDy) }
      }

      if (def.bilateral) {
        var cL = centers[def.id + '_esq']
        if (cL) FM._drawForceVectorPair(ctx, d, cL, invert ? 70 : age, w, h, selectedId === def.id, def.id + '_esq')

        var cR = centers[def.id + '_dir']
        if (cR) {
          var mirrorD = { id: d.id, label: d.label, color: d.color, youngDx: -d.youngDx, youngDy: d.youngDy, agedDx: -d.agedDx, agedDy: d.agedDy }
          FM._drawForceVectorPair(ctx, mirrorD, cR, invert ? 70 : age, w, h, selectedId === def.id, def.id + '_dir')
        }
      } else {
        var c = centers[def.id]
        if (c) FM._drawForceVectorPair(ctx, d, c, invert ? 70 : age, w, h, selectedId === def.id, def.id)
      }
    })
  }

  FM._drawCollagenBar = function (ctx, x, y, w, h, age) {
    var pct = FM._vecCollagenPct(age) / 100
    var t = FM._vecAgeFactor(age)
    var color = FM._vecAgeColor(t)

    // Track
    ctx.save()
    ctx.fillStyle = '#1a1a26'
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, [4])
    ctx.fill()

    // Fill
    var fillW = Math.max(h, w * Math.max(0.08, pct))
    ctx.fillStyle = color
    ctx.shadowColor = color + '60'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.roundRect(x, y, fillW, h, [4])
    ctx.fill()

    // Label
    ctx.shadowBlur = 0
    ctx.font = '700 10px Inter, sans-serif'
    ctx.fillStyle = '#F5F0E8'
    ctx.textAlign = 'left'
    ctx.fillText(Math.round(pct * 100) + '%', x + fillW + 6, y + h - 2)
    ctx.restore()
  }

})()
