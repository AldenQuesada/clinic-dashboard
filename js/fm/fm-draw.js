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
    return {
      id: ann.id, angle: ann.angle, zone: ann.zone, treatment: ann.treatment,
      ml: ann.ml, product: ann.product, side: ann.side,
      shape: { x: ann.shape.x * s, y: ann.shape.y * s, rx: ann.shape.rx * s, ry: ann.shape.ry * s }
    }
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
    var headLen = 12
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

  FM._drawForceVectorPair = function (ctx, def, center, age, w, h, selected) {
    var t = FM._vecAgeFactor(age)
    var cx = center.x * w, cy = center.y * h

    // Compute young and aged endpoints
    var youngX = cx + def.youngDx * w, youngY = cy + def.youngDy * h
    var agedX = cx + def.agedDx * w, agedY = cy + def.agedDy * h

    // Lerp to current age position
    var curX = FM._vecLerp(youngX, agedX, t)
    var curY = FM._vecLerp(youngY, agedY, t)

    // Color based on age factor
    var color = FM._vecAgeColor(t)
    var glow = color + '60'

    // Draw origin dot
    ctx.save()
    ctx.fillStyle = def.color
    ctx.shadowColor = def.color + '80'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.fill()

    // Pulsing ring
    ctx.strokeStyle = def.color
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.4
    ctx.beginPath()
    ctx.arc(cx, cy, 10, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.restore()

    // Draw force arrow
    FM._drawForceArrow(ctx, cx, cy, curX, curY, color, selected ? 3.5 : 2.5, glow)

    // Label
    ctx.save()
    ctx.font = '600 9px Inter, Montserrat, sans-serif'
    ctx.fillStyle = def.color
    ctx.globalAlpha = 0.7
    ctx.textAlign = 'center'
    ctx.fillText(def.label.toUpperCase(), cx, cy - 14)
    ctx.restore()
  }

  FM._drawAllForceVectors = function (ctx, age, w, h, selectedId) {
    var centers = FM._scanData && FM._scanData.zone_centers ? FM._scanData.zone_centers : FM.FORCE_DEFAULT_CENTERS

    FM.FORCE_VECTORS.forEach(function (def) {
      if (def.bilateral) {
        // Left
        var cL = centers[def.id + '_esq'] || FM.FORCE_DEFAULT_CENTERS[def.id + '_esq']
        if (cL) FM._drawForceVectorPair(ctx, def, cL, age, w, h, selectedId === def.id)

        // Right (mirror youngDx)
        var cR = centers[def.id + '_dir'] || FM.FORCE_DEFAULT_CENTERS[def.id + '_dir']
        if (cR) {
          var mirrorDef = { label: def.label, color: def.color, youngDx: -def.youngDx, youngDy: def.youngDy, agedDx: -def.agedDx, agedDy: def.agedDy }
          FM._drawForceVectorPair(ctx, mirrorDef, cR, age, w, h, selectedId === def.id)
        }
      } else {
        var c = centers[def.id] || FM.FORCE_DEFAULT_CENTERS[def.id]
        if (c) FM._drawForceVectorPair(ctx, def, c, age, w, h, selectedId === def.id)
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
