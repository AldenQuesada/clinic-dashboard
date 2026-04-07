/**
 * fm-canvas.js — Canvas init, redraw, drawing primitives, mouse handlers
 */
;(function () {
  'use strict'

  var FM = window._FM
  var LABEL_MARGIN = 180

  FM._initCanvas = function () {
    FM._canvas = document.getElementById('fmCanvas')
    if (!FM._canvas || !FM._photoUrls[FM._activeAngle]) return

    FM._ctx = FM._canvas.getContext('2d')
    FM._img = new Image()
    FM._img.onload = function () {
      var area = document.getElementById('fmCanvasArea')
      var isFS = area && area.classList.contains('fm-fullscreen')

      var fixedH = isFS ? 44 : 158
      var areaW = isFS ? window.innerWidth : (area ? area.clientWidth : 800)
      var areaH = window.innerHeight - fixedH

      var maxW = areaW - LABEL_MARGIN - 10
      var maxH = areaH
      var scale = Math.min(maxW / FM._img.width, maxH / FM._img.height)
      FM._imgW = Math.round(FM._img.width * scale)
      FM._imgH = Math.round(FM._img.height * scale)
      FM._canvas.width = FM._imgW + LABEL_MARGIN
      FM._canvas.height = FM._imgH
      FM._redraw()
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

    // Label area background (right side)
    FM._ctx.fillStyle = '#2C2C2C'
    FM._ctx.fillRect(FM._imgW, 0, LABEL_MARGIN, FM._canvas.height)

    if (FM._editorMode === 'vectors') {
      var vecLabelY = 20
      var VEC_LABEL_H = 38
      var sortedVecs = FM._vectors.slice().sort(function (a, b) { return a.start.y - b.start.y })
      sortedVecs.forEach(function (vec) {
        FM._drawVector(vec)
        vecLabelY = FM._drawVectorLabel(vec, vecLabelY, VEC_LABEL_H)
      })

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
      if (FM._activeAngle === 'front') {
        FM._drawTercos()
      } else if (FM._activeAngle === 'lateral') {
        FM._drawRicketts()
      }
    } else {
      var anns = FM._annotations.filter(function (a) { return a.angle === FM._activeAngle })
      var sorted = anns.slice().sort(function (a, b) { return a.shape.y - b.shape.y })
      var labelY = 20
      var LABEL_H = 38

      sorted.forEach(function (ann) {
        FM._drawEllipseClean(ann)
        labelY = FM._drawLabelExternal(ann, labelY, LABEL_H)
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
  }

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

  FM._getHandles = function (s) {
    return [
      { id: 'n', x: s.x,        y: s.y - s.ry },
      { id: 's', x: s.x,        y: s.y + s.ry },
      { id: 'e', x: s.x + s.rx, y: s.y },
      { id: 'w', x: s.x - s.rx, y: s.y },
    ]
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

  // ── Vector drawing ─────────────────────────────────────────

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

  FM._drawEllipseOn = function (ctx, ann) {
    var color = FM._zoneColor(ann.zone)
    var z = FM.ZONES.find(function (x) { return x.id === ann.zone })
    var t = FM.TREATMENTS.find(function (x) { return x.id === ann.treatment }) || FM.TREATMENTS[0]
    var s = ann.shape

    ctx.save()
    ctx.beginPath()
    ctx.fillStyle = color + '70'
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

  // ── Mouse handlers ────────────────────────────────────────

  FM._onMouseDown = function (e) {
    var mx = e.offsetX, my = e.offsetY
    var inLabelArea = mx > FM._imgW

    // ANALYSIS MODE
    if (FM._editorMode === 'analysis') {
      if (FM._activeAngle === 'front') {
        var keys = ['hairline', 'brow', 'noseBase', 'chin']
        for (var k = 0; k < keys.length; k++) {
          var ly = FM._tercoLines[keys[k]] * FM._imgH
          if (Math.abs(my - ly) < 12 && mx < FM._imgW) {
            FM._analysisDrag = keys[k]
            FM._mode = 'move'
            FM._canvas.style.cursor = 'ns-resize'
            return
          }
        }
      } else if (FM._activeAngle === 'lateral') {
        var nDist = Math.sqrt(Math.pow(mx - FM._rickettsPoints.nose.x * FM._imgW, 2) + Math.pow(my - FM._rickettsPoints.nose.y * FM._imgH, 2))
        if (nDist < 15) { FM._analysisDrag = 'nose'; FM._mode = 'move'; FM._canvas.style.cursor = 'grab'; return }
        var cDist = Math.sqrt(Math.pow(mx - FM._rickettsPoints.chin.x * FM._imgW, 2) + Math.pow(my - FM._rickettsPoints.chin.y * FM._imgH, 2))
        if (cDist < 15) { FM._analysisDrag = 'chin'; FM._mode = 'move'; FM._canvas.style.cursor = 'grab'; return }
      }
      FM._analysisDrag = null
      FM._redraw()
      return
    }

    // VECTOR MODE
    if (FM._editorMode === 'vectors') {
      var hit = FM._hitVector(mx, my)
      if (hit) {
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

    // 1. Check resize handles
    if (FM._selAnn) {
      var handle = FM._hitHandle(mx, my)
      if (handle) {
        FM._pushUndo()
        FM._mode = 'resize'
        FM._resizeHandle = handle
        return
      }
    }

    // 2. Hit existing annotation -> move
    var hit = FM._hitEllipse(mx, my)
    if (hit) {
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

    // ANALYSIS MODE drag
    if (FM._editorMode === 'analysis' && FM._mode === 'move' && FM._analysisDrag) {
      if (FM._activeAngle === 'front' && FM._analysisDrag) {
        FM._tercoLines[FM._analysisDrag] = Math.max(0.01, Math.min(0.99, my / FM._imgH))
        FM._redraw()
        return
      }
      if (FM._activeAngle === 'lateral') {
        if (FM._analysisDrag === 'nose') {
          FM._rickettsPoints.nose.x = Math.max(0.05, Math.min(0.95, mx / FM._imgW))
          FM._rickettsPoints.nose.y = Math.max(0.05, Math.min(0.95, my / FM._imgH))
        } else if (FM._analysisDrag === 'chin') {
          FM._rickettsPoints.chin.x = Math.max(0.05, Math.min(0.95, mx / FM._imgW))
          FM._rickettsPoints.chin.y = Math.max(0.05, Math.min(0.95, my / FM._imgH))
        }
        FM._redraw()
        return
      }
    }

    if (FM._editorMode === 'analysis') {
      if (FM._activeAngle === 'front') {
        var nearLine = false
        var keys = ['hairline', 'brow', 'noseBase', 'chin']
        for (var ki = 0; ki < keys.length; ki++) {
          if (Math.abs(my - FM._tercoLines[keys[ki]] * FM._imgH) < 12) { nearLine = true; break }
        }
        FM._canvas.style.cursor = nearLine ? 'ns-resize' : 'default'
      } else {
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
    if (FM._editorMode === 'analysis') {
      FM._mode = 'idle'
      FM._analysisDrag = null
      FM._canvas.style.cursor = 'default'
      FM._redraw()
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
