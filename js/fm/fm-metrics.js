/**
 * fm-metrics.js — Facial Metrification System
 * Unlimited horizontal/vertical lines + measurement points + midline + asymmetry
 *
 * Features:
 * - Unlimited horizontal lines (draggable, labeled with % and px)
 * - Unlimited vertical lines (draggable, labeled with % and px)
 * - Midline (vertical center reference for asymmetry)
 * - Measurement points (click to place, shows distance between pairs)
 * - Asymmetry calculation (deviation from midline per landmark)
 * - Panel with all measurements listed
 * - Before/After comparison of measurements
 */
;(function () {
  'use strict'

  var FM = window._FM

  // State
  FM._metricLines = FM._metricLines || { h: [], v: [] }  // {y: 0.5, label: 'custom'} normalized
  FM._metricPoints = FM._metricPoints || []  // {x, y, id, label}
  FM._metricMidline = FM._metricMidline || null  // {x: 0.5} normalized
  FM._metricNextPointId = FM._metricNextPointId || 1
  FM._metricNextLineId = FM._metricNextLineId || 1
  FM._metricDrag = null  // {type: 'hline'|'vline'|'point'|'midline', index: n}
  FM._metricTool = 'hline'  // active tool: 'hline', 'vline', 'point', 'midline'
  FM._metricShowMidline = true

  // ── Draw all metric overlays ────────────────────────────

  FM._drawMetrics = function () {
    if (!FM._ctx || !FM._imgW) return
    var ctx = FM._ctx
    var w = FM._imgW
    var h = FM._imgH

    ctx.save()

    // Draw midline
    if (FM._metricShowMidline) {
      var mx = FM._metricMidline ? FM._metricMidline.x * w : w / 2
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(139,92,246,0.6)'  // purple
      ctx.lineWidth = 1.5
      ctx.setLineDash([8, 4])
      ctx.moveTo(mx, 0)
      ctx.lineTo(mx, h)
      ctx.stroke()
      ctx.setLineDash([])

      // Midline label
      ctx.font = '600 9px Inter, sans-serif'
      ctx.fillStyle = 'rgba(139,92,246,0.8)'
      ctx.textAlign = 'center'
      ctx.fillText('MIDLINE', mx, 12)

      // Midline handle
      ctx.beginPath()
      ctx.fillStyle = '#8B5CF6'
      ctx.arc(mx, 20, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Draw horizontal lines
    FM._metricLines.h.forEach(function (line, i) {
      var y = line.y * h
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(16,185,129,0.7)'  // green
      ctx.lineWidth = 1.5
      ctx.setLineDash([])
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()

      // Handle
      ctx.beginPath()
      ctx.fillStyle = '#10B981'
      ctx.arc(12, y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Label with percentage
      var pct = Math.round(line.y * 100)
      ctx.font = '600 10px Inter, sans-serif'
      ctx.fillStyle = '#10B981'
      ctx.textAlign = 'left'
      ctx.fillText('H' + (i + 1) + ': ' + pct + '%', 22, y - 4)

      // Distance to previous line
      if (i > 0) {
        var prevY = FM._metricLines.h[i - 1].y * h
        var dist = Math.abs(y - prevY)
        var distPct = Math.round(Math.abs(line.y - FM._metricLines.h[i - 1].y) * 100)
        ctx.fillStyle = 'rgba(16,185,129,0.5)'
        ctx.font = '400 9px Inter, sans-serif'
        ctx.fillText(distPct + '% (' + Math.round(dist) + 'px)', 22, (y + prevY) / 2 + 3)

        // Bracket line
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(16,185,129,0.2)'
        ctx.lineWidth = 1
        ctx.moveTo(8, prevY)
        ctx.lineTo(8, y)
        ctx.stroke()
      }
    })

    // Draw vertical lines
    FM._metricLines.v.forEach(function (line, i) {
      var x = line.x * w
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(59,130,246,0.7)'  // blue
      ctx.lineWidth = 1.5
      ctx.setLineDash([])
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()

      // Handle
      ctx.beginPath()
      ctx.fillStyle = '#3B82F6'
      ctx.arc(x, h - 12, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Label
      var pct = Math.round(line.x * 100)
      ctx.font = '600 10px Inter, sans-serif'
      ctx.fillStyle = '#3B82F6'
      ctx.textAlign = 'center'
      ctx.fillText('V' + (i + 1) + ': ' + pct + '%', x, h - 22)

      // Asymmetry from midline
      if (FM._metricShowMidline) {
        var midX = FM._metricMidline ? FM._metricMidline.x : 0.5
        var deviation = Math.round(Math.abs(line.x - midX) * 100)
        var side = line.x < midX ? 'E' : 'D'
        ctx.fillStyle = 'rgba(59,130,246,0.5)'
        ctx.font = '400 9px Inter, sans-serif'
        ctx.fillText(side + ' ' + deviation + '%', x, h - 34)
      }
    })

    // Draw measurement points
    FM._metricPoints.forEach(function (pt, i) {
      var px = pt.x * w
      var py = pt.y * h

      // Point circle
      ctx.beginPath()
      ctx.fillStyle = '#F59E0B'
      ctx.arc(px, py, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      // Point label
      ctx.font = '700 8px Inter, sans-serif'
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.fillText('P' + pt.id, px, py + 3)

      // Asymmetry from midline
      if (FM._metricShowMidline) {
        var midX = FM._metricMidline ? FM._metricMidline.x : 0.5
        var devPx = Math.round(Math.abs(pt.x - midX) * w)
        var devSide = pt.x < midX ? 'E' : (pt.x > midX ? 'D' : 'C')
        ctx.font = '400 9px Inter, sans-serif'
        ctx.fillStyle = 'rgba(245,158,11,0.7)'
        ctx.fillText(devSide + devPx + 'px', px + 10, py - 8)
      }
    })

    // Draw connections between consecutive point pairs (P1-P2, P3-P4, etc.)
    for (var j = 0; j + 1 < FM._metricPoints.length; j += 2) {
      var a = FM._metricPoints[j]
      var b = FM._metricPoints[j + 1]
      var ax = a.x * w, ay = a.y * h
      var bx = b.x * w, by = b.y * h

      // Connection line
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,158,11,0.6)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
      ctx.setLineDash([])

      // Horizontal reference line (shows Y difference = vertical asymmetry)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(239,68,68,0.4)'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 2])
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, ay)  // horizontal from A to B's X at A's height
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(bx, ay)
      ctx.lineTo(bx, by)  // vertical from A's height to B
      ctx.stroke()
      ctx.setLineDash([])

      var dx = Math.abs(bx - ax)
      var dy = Math.abs(by - ay)
      var dist = Math.sqrt(dx * dx + dy * dy)
      var midPx = (ax + bx) / 2
      var midPy = (ay + by) / 2

      // Total distance
      ctx.font = '600 10px Inter, sans-serif'
      ctx.fillStyle = '#F59E0B'
      ctx.textAlign = 'center'
      ctx.fillText(Math.round(dist) + 'px', midPx, midPy - 16)

      // Vertical asymmetry (dy) — KEY metric for structure comparison
      if (dy > 2) {
        var higherSide = ay < by ? 'E' : 'D'
        ctx.font = '700 11px Inter, sans-serif'
        ctx.fillStyle = dy > 10 ? '#EF4444' : dy > 5 ? '#F59E0B' : '#10B981'
        ctx.fillText('↕ ' + Math.round(dy) + 'px (' + higherSide + ' mais alto)', midPx, midPy - 2)
      }

      // Horizontal difference (dx)
      if (dx > 2) {
        ctx.font = '400 9px Inter, sans-serif'
        ctx.fillStyle = 'rgba(245,158,11,0.6)'
        ctx.fillText('↔ ' + Math.round(dx) + 'px', midPx, midPy + 12)
      }
    }

    ctx.restore()
  }

  // ── Mouse interaction for metrics ───────────────────────

  FM._onMetricMouseDown = function (mx, my) {
    var w = FM._imgW, h = FM._imgH
    var threshold = 12

    // Check angle points (Gonial E, Gonial D, Mento, Zigoma E, Zigoma D)
    if (FM._metricAngles && FM._metricAngles.points) {
      var pts = FM._metricAngles.points
      var angleKeys = ['gonial_left', 'gonial_right', 'mento', 'zigoma_left', 'zigoma_right']
      for (var ai = 0; ai < angleKeys.length; ai++) {
        var ak = angleKeys[ai]
        var ap = pts[ak]
        if (!ap) continue
        var apx = ap.x * w, apy = ap.y * h
        if (Math.sqrt(Math.pow(mx - apx, 2) + Math.pow(my - apy, 2)) < threshold) {
          FM._metricDrag = { type: 'angle_point', key: ak }
          return true
        }
      }
    }

    // Check midline handle
    if (FM._metricShowMidline) {
      var midX = (FM._metricMidline ? FM._metricMidline.x : 0.5) * w
      if (Math.abs(mx - midX) < threshold && my < 30) {
        FM._metricDrag = { type: 'midline' }
        return true
      }
    }

    // Check horizontal lines
    for (var i = 0; i < FM._metricLines.h.length; i++) {
      var ly = FM._metricLines.h[i].y * h
      if (Math.abs(my - ly) < threshold && mx < w) {
        FM._metricDrag = { type: 'hline', index: i }
        return true
      }
    }

    // Check vertical lines
    for (var j = 0; j < FM._metricLines.v.length; j++) {
      var lx = FM._metricLines.v[j].x * w
      if (Math.abs(mx - lx) < threshold && my < h) {
        FM._metricDrag = { type: 'vline', index: j }
        return true
      }
    }

    // Check points
    for (var k = 0; k < FM._metricPoints.length; k++) {
      var px = FM._metricPoints[k].x * w
      var py = FM._metricPoints[k].y * h
      if (Math.sqrt(Math.pow(mx - px, 2) + Math.pow(my - py, 2)) < threshold) {
        FM._metricDrag = { type: 'point', index: k }
        return true
      }
    }

    // If tool is active and click is on image, add new element
    if (mx > 0 && mx < w && my > 0 && my < h) {
      if (FM._metricTool === 'hline') {
        FM._metricLines.h.push({ y: my / h, id: FM._metricNextLineId++ })
        FM._metricLines.h.sort(function (a, b) { return a.y - b.y })
        FM._redraw()
        FM._refreshToolbar()
        return true
      } else if (FM._metricTool === 'vline') {
        FM._metricLines.v.push({ x: mx / w, id: FM._metricNextLineId++ })
        FM._metricLines.v.sort(function (a, b) { return a.x - b.x })
        FM._redraw()
        FM._refreshToolbar()
        return true
      } else if (FM._metricTool === 'point') {
        FM._metricPoints.push({ x: mx / w, y: my / h, id: FM._metricNextPointId++ })
        FM._redraw()
        FM._refreshToolbar()
        return true
      }
    }

    return false
  }

  FM._onMetricMouseMove = function (mx, my) {
    if (!FM._metricDrag) return false
    var w = FM._imgW, h = FM._imgH

    if (FM._metricDrag.type === 'angle_point') {
      var key = FM._metricDrag.key
      FM._metricAngles.points[key].x = Math.max(0.01, Math.min(0.99, mx / w))
      FM._metricAngles.points[key].y = Math.max(0.01, Math.min(0.99, my / h))
      // Recalculate angles with new positions
      _recalcAngles()
      FM._redraw()
      return true
    }
    if (FM._metricDrag.type === 'midline') {
      if (!FM._metricMidline) FM._metricMidline = { x: 0.5 }
      FM._metricMidline.x = Math.max(0.1, Math.min(0.9, mx / w))
      FM._redraw()
      return true
    }
    if (FM._metricDrag.type === 'hline') {
      FM._metricLines.h[FM._metricDrag.index].y = Math.max(0.01, Math.min(0.99, my / h))
      FM._redraw()
      return true
    }
    if (FM._metricDrag.type === 'vline') {
      FM._metricLines.v[FM._metricDrag.index].x = Math.max(0.01, Math.min(0.99, mx / w))
      FM._redraw()
      return true
    }
    if (FM._metricDrag.type === 'point') {
      FM._metricPoints[FM._metricDrag.index].x = Math.max(0.01, Math.min(0.99, mx / w))
      FM._metricPoints[FM._metricDrag.index].y = Math.max(0.01, Math.min(0.99, my / h))
      FM._redraw()
      return true
    }
    return false
  }

  FM._onMetricMouseUp = function () {
    if (FM._metricDrag) {
      FM._metricDrag = null
      FM._autoSave()
      return true
    }
    return false
  }

  // ── Tool management ─────────────────────────────────────

  FM._setMetricTool = function (tool) {
    FM._metricTool = tool
    FM._refreshToolbar()
  }

  FM._clearMetricLines = function (type) {
    if (type === 'h') FM._metricLines.h = []
    else if (type === 'v') FM._metricLines.v = []
    else if (type === 'points') FM._metricPoints = []
    else if (type === 'all') {
      FM._metricLines = { h: [], v: [] }
      FM._metricPoints = []
      FM._metricMidline = null
    }
    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
  }

  FM._removeLastMetric = function (type) {
    if (type === 'hline' && FM._metricLines.h.length > 0) FM._metricLines.h.pop()
    else if (type === 'vline' && FM._metricLines.v.length > 0) FM._metricLines.v.pop()
    else if (type === 'point' && FM._metricPoints.length > 0) FM._metricPoints.pop()
    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
  }

  // ── Auto-place metric lines from landmarks ──────────────

  FM._autoMetricLines = function () {
    if (!FM._scanData || !FM._scanData.key_points) {
      FM._showToast('Execute Auto Analise primeiro', 'warn')
      return
    }

    var kp = FM._scanData.key_points

    // Horizontal lines at key anatomical points
    FM._metricLines.h = [
      { y: kp.forehead_top.y, id: FM._metricNextLineId++, label: 'Trichion' },
      { y: kp.left_brow_top.y, id: FM._metricNextLineId++, label: 'Sobrancelha' },
      { y: kp.left_eye_top.y, id: FM._metricNextLineId++, label: 'Olho sup.' },
      { y: kp.left_eye_bottom.y, id: FM._metricNextLineId++, label: 'Olho inf.' },
      { y: kp.nose_tip.y, id: FM._metricNextLineId++, label: 'Ponta nariz' },
      { y: kp.nose_base.y, id: FM._metricNextLineId++, label: 'Base nariz' },
      { y: kp.upper_lip_top.y, id: FM._metricNextLineId++, label: 'Labio sup.' },
      { y: kp.lower_lip_bottom.y, id: FM._metricNextLineId++, label: 'Labio inf.' },
      { y: kp.chin.y, id: FM._metricNextLineId++, label: 'Mento' },
    ]
    FM._metricLines.h.sort(function (a, b) { return a.y - b.y })

    // Vertical lines at key lateral points
    FM._metricLines.v = [
      { x: kp.left_eye_outer.x, id: FM._metricNextLineId++, label: 'Olho E ext' },
      { x: kp.left_eye_inner.x, id: FM._metricNextLineId++, label: 'Olho E int' },
      { x: kp.nose_tip.x, id: FM._metricNextLineId++, label: 'Centro nariz' },
      { x: kp.right_eye_inner.x, id: FM._metricNextLineId++, label: 'Olho D int' },
      { x: kp.right_eye_outer.x, id: FM._metricNextLineId++, label: 'Olho D ext' },
    ]
    FM._metricLines.v.sort(function (a, b) { return a.x - b.x })

    // Midline from nose bridge
    FM._metricMidline = { x: kp.nose_bridge.x }

    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
    FM._showToast('9 linhas H + 5 linhas V + midline posicionadas via landmarks', 'success')
  }

  // ── Get measurements summary ────────────────────────────

  FM._getMetricsSummary = function () {
    var w = FM._imgW || 1
    var h = FM._imgH || 1
    var midX = FM._metricMidline ? FM._metricMidline.x : 0.5

    var summary = {
      horizontal_distances: [],
      vertical_distances: [],
      point_distances: [],
      asymmetry: [],
    }

    // H line distances
    for (var i = 1; i < FM._metricLines.h.length; i++) {
      var prev = FM._metricLines.h[i - 1]
      var curr = FM._metricLines.h[i]
      summary.horizontal_distances.push({
        from: 'H' + i,
        to: 'H' + (i + 1),
        pct: Math.round(Math.abs(curr.y - prev.y) * 100),
        px: Math.round(Math.abs(curr.y - prev.y) * h),
      })
    }

    // V line asymmetry from midline
    FM._metricLines.v.forEach(function (line, i) {
      var dev = line.x - midX
      summary.asymmetry.push({
        line: 'V' + (i + 1),
        label: line.label || '',
        side: dev < 0 ? 'E' : 'D',
        deviation_pct: Math.round(Math.abs(dev) * 100),
        deviation_px: Math.round(Math.abs(dev) * w),
      })
    })

    // Point pair distances + asymmetry
    for (var j = 0; j + 1 < FM._metricPoints.length; j += 2) {
      var a = FM._metricPoints[j]
      var b = FM._metricPoints[j + 1]
      var pdx = (b.x - a.x) * w
      var pdy = (b.y - a.y) * h
      var absDy = Math.abs(pdy)
      var absDx = Math.abs(pdx)
      summary.point_distances.push({
        from: 'P' + a.id,
        to: 'P' + b.id,
        distance_px: Math.round(Math.sqrt(pdx * pdx + pdy * pdy)),
        vertical_diff_px: Math.round(absDy),
        horizontal_diff_px: Math.round(absDx),
        higher_side: pdy < 0 ? 'Esquerdo' : (pdy > 0 ? 'Direito' : 'Alinhado'),
        severity: absDy > 10 ? 'evidente' : absDy > 5 ? 'moderada' : 'leve',
      })
    }

    // Mandibular angles
    if (FM._metricAngles) {
      summary.angles = FM._metricAngles
    }

    return summary
  }

  // ── Mandibular Angle System ─────────────────────────────

  FM._metricAngles = null  // {amf, rmz, aij_left, aij_right, classification}

  FM._autoAngles = function () {
    if (!FM._scanData || !FM._scanData.key_points) {
      FM._showToast('Execute Auto Analise primeiro', 'warn')
      return
    }

    var kp = FM._scanData.key_points
    var w = FM._imgW || 1
    var h = FM._imgH || 1

    // Key points for mandibular analysis
    var gonialL = kp.jaw_left_angle || kp.jaw_left
    var gonialR = kp.jaw_right_angle || kp.jaw_right
    var mento = kp.chin
    var zigomaL = kp.left_zygomatic
    var zigomaR = kp.right_zygomatic

    if (!gonialL || !gonialR || !mento) {
      FM._showToast('Landmarks insuficientes para angulos', 'error')
      return
    }

    // 1. AMF — Angulo Mandibular Frontal (Gonial E → Mento → Gonial D)
    var amf = _calcAngle3Points(gonialL, mento, gonialR)

    // 2. RMZ — Ratio Mandibula / Zigoma
    var mandW = Math.sqrt(Math.pow((gonialR.x - gonialL.x) * w, 2) + Math.pow((gonialR.y - gonialL.y) * h, 2))
    var zigoW = Math.sqrt(Math.pow((zigomaR.x - zigomaL.x) * w, 2) + Math.pow((zigomaR.y - zigomaL.y) * h, 2))
    var rmz = zigoW > 0 ? mandW / zigoW : 0

    // 3. AIJ — Angulo de Inclinacao do Jawline (cada lado)
    // Angulo da linha gonial→mento vs horizontal
    var aijL = Math.abs(Math.atan2((mento.y - gonialL.y) * h, (mento.x - gonialL.x) * w) * 180 / Math.PI)
    var aijR = Math.abs(Math.atan2((mento.y - gonialR.y) * h, (gonialR.x - mento.x) * w) * 180 / Math.PI)

    // Classification
    var classification
    if (amf > 150) classification = { label: 'Mandibula Arredondada', color: '#EF4444', level: 1 }
    else if (amf > 135) classification = { label: 'Mandibula Suave', color: '#F59E0B', level: 2 }
    else if (amf > 115) classification = { label: 'Mandibula Definida', color: '#10B981', level: 3 }
    else classification = { label: 'Mandibula Angular', color: '#3B82F6', level: 4 }

    // Jawline tension classification
    var avgAij = (aijL + aijR) / 2
    var jawlineTension
    if (avgAij > 35) jawlineTension = { label: 'Jawline Caida', color: '#EF4444' }
    else if (avgAij > 25) jawlineTension = { label: 'Jawline Suave', color: '#F59E0B' }
    else jawlineTension = { label: 'Jawline Tensa', color: '#10B981' }

    FM._metricAngles = {
      amf: Math.round(amf * 10) / 10,
      rmz: Math.round(rmz * 1000) / 1000,
      aij_left: Math.round(aijL * 10) / 10,
      aij_right: Math.round(aijR * 10) / 10,
      aij_avg: Math.round(avgAij * 10) / 10,
      classification: classification,
      jawline: jawlineTension,
      points: {
        gonial_left: { x: gonialL.x, y: gonialL.y },
        gonial_right: { x: gonialR.x, y: gonialR.y },
        mento: { x: mento.x, y: mento.y },
        zigoma_left: { x: zigomaL.x, y: zigomaL.y },
        zigoma_right: { x: zigomaR.x, y: zigomaR.y },
      },
    }

    FM._showToast(
      'AMF: ' + FM._metricAngles.amf + '° (' + classification.label + ') | ' +
      'Jawline: ' + FM._metricAngles.aij_avg + '° (' + jawlineTension.label + ') | ' +
      'Ratio M/Z: ' + FM._metricAngles.rmz,
      'success'
    )
    FM._redraw()
    FM._refreshToolbar()
  }

  // Draw mandibular angles on canvas
  FM._drawAngles = function () {
    if (!FM._metricAngles || !FM._ctx) return
    var ctx = FM._ctx
    var w = FM._imgW
    var h = FM._imgH
    var pts = FM._metricAngles.points

    ctx.save()

    var gLx = pts.gonial_left.x * w
    var gLy = pts.gonial_left.y * h
    var gRx = pts.gonial_right.x * w
    var gRy = pts.gonial_right.y * h
    var mx = pts.mento.x * w
    var my = pts.mento.y * h
    var zLx = pts.zigoma_left.x * w
    var zLy = pts.zigoma_left.y * h
    var zRx = pts.zigoma_right.x * w
    var zRy = pts.zigoma_right.y * h

    // Draw jawline (Gonial L → Mento → Gonial R)
    ctx.beginPath()
    ctx.strokeStyle = FM._metricAngles.classification.color
    ctx.lineWidth = 2.5
    ctx.setLineDash([])
    ctx.moveTo(gLx, gLy)
    ctx.lineTo(mx, my)
    ctx.lineTo(gRx, gRy)
    ctx.stroke()

    // Draw zigoma line (reference)
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(200,169,126,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.moveTo(zLx, zLy)
    ctx.lineTo(zRx, zRy)
    ctx.stroke()

    // Draw mandibula line (reference)
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(200,169,126,0.3)'
    ctx.lineWidth = 1
    ctx.moveTo(gLx, gLy)
    ctx.lineTo(gRx, gRy)
    ctx.stroke()
    ctx.setLineDash([])

    // AMF arc at mento
    var arcRadius = 25
    var angleL = Math.atan2(gLy - my, gLx - mx)
    var angleR = Math.atan2(gRy - my, gRx - mx)
    ctx.beginPath()
    ctx.strokeStyle = FM._metricAngles.classification.color
    ctx.lineWidth = 2
    ctx.arc(mx, my, arcRadius, angleR, angleL)
    ctx.stroke()

    // AMF label
    ctx.font = '700 12px Inter, sans-serif'
    ctx.fillStyle = FM._metricAngles.classification.color
    ctx.textAlign = 'center'
    ctx.fillText(FM._metricAngles.amf + '°', mx, my + arcRadius + 16)
    ctx.font = '600 9px Inter, sans-serif'
    ctx.fillText(FM._metricAngles.classification.label, mx, my + arcRadius + 30)

    // Points with labels
    var anglePoints = [
      { x: gLx, y: gLy, label: 'Gonial E', color: '#C8A97E' },
      { x: gRx, y: gRy, label: 'Gonial D', color: '#C8A97E' },
      { x: mx, y: my, label: 'Mento', color: FM._metricAngles.classification.color },
      { x: zLx, y: zLy, label: 'Zigoma E', color: 'rgba(200,169,126,0.6)' },
      { x: zRx, y: zRy, label: 'Zigoma D', color: 'rgba(200,169,126,0.6)' },
    ]

    anglePoints.forEach(function (p) {
      ctx.beginPath()
      ctx.fillStyle = p.color
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.font = '500 9px Inter, sans-serif'
      ctx.fillStyle = p.color
      ctx.textAlign = 'center'
      ctx.fillText(p.label, p.x, p.y - 10)
    })

    // AIJ labels on each side
    ctx.font = '400 10px Inter, sans-serif'
    ctx.fillStyle = FM._metricAngles.jawline.color
    ctx.textAlign = 'right'
    ctx.fillText('AIJ: ' + FM._metricAngles.aij_left + '°', (gLx + mx) / 2 - 5, (gLy + my) / 2 - 5)
    ctx.textAlign = 'left'
    ctx.fillText('AIJ: ' + FM._metricAngles.aij_right + '°', (gRx + mx) / 2 + 5, (gRy + my) / 2 - 5)

    ctx.restore()
  }

  function _recalcAngles() {
    if (!FM._metricAngles || !FM._metricAngles.points) return
    var pts = FM._metricAngles.points
    var w = FM._imgW || 1
    var h = FM._imgH || 1

    // AMF
    FM._metricAngles.amf = Math.round(_calcAngle3Points(pts.gonial_left, pts.mento, pts.gonial_right) * 10) / 10

    // RMZ
    var mandW = Math.sqrt(Math.pow((pts.gonial_right.x - pts.gonial_left.x) * w, 2) + Math.pow((pts.gonial_right.y - pts.gonial_left.y) * h, 2))
    var zigoW = Math.sqrt(Math.pow((pts.zigoma_right.x - pts.zigoma_left.x) * w, 2) + Math.pow((pts.zigoma_right.y - pts.zigoma_left.y) * h, 2))
    FM._metricAngles.rmz = Math.round((zigoW > 0 ? mandW / zigoW : 0) * 1000) / 1000

    // AIJ
    var aijL = Math.abs(Math.atan2((pts.mento.y - pts.gonial_left.y) * h, (pts.mento.x - pts.gonial_left.x) * w) * 180 / Math.PI)
    var aijR = Math.abs(Math.atan2((pts.mento.y - pts.gonial_right.y) * h, (pts.gonial_right.x - pts.mento.x) * w) * 180 / Math.PI)
    FM._metricAngles.aij_left = Math.round(aijL * 10) / 10
    FM._metricAngles.aij_right = Math.round(aijR * 10) / 10
    FM._metricAngles.aij_avg = Math.round((aijL + aijR) / 2 * 10) / 10

    // Reclassify
    var amf = FM._metricAngles.amf
    if (amf > 150) FM._metricAngles.classification = { label: 'Mandibula Arredondada', color: '#EF4444', level: 1 }
    else if (amf > 135) FM._metricAngles.classification = { label: 'Mandibula Suave', color: '#F59E0B', level: 2 }
    else if (amf > 115) FM._metricAngles.classification = { label: 'Mandibula Definida', color: '#10B981', level: 3 }
    else FM._metricAngles.classification = { label: 'Mandibula Angular', color: '#3B82F6', level: 4 }

    var avgAij = FM._metricAngles.aij_avg
    if (avgAij > 35) FM._metricAngles.jawline = { label: 'Jawline Caida', color: '#EF4444' }
    else if (avgAij > 25) FM._metricAngles.jawline = { label: 'Jawline Suave', color: '#F59E0B' }
    else FM._metricAngles.jawline = { label: 'Jawline Tensa', color: '#10B981' }
  }

  function _calcAngle3Points(a, b, c) {
    // Angle at point B formed by lines BA and BC
    var baX = a.x - b.x
    var baY = a.y - b.y
    var bcX = c.x - b.x
    var bcY = c.y - b.y
    var dot = baX * bcX + baY * bcY
    var magBA = Math.sqrt(baX * baX + baY * baY)
    var magBC = Math.sqrt(bcX * bcX + bcY * bcY)
    if (magBA === 0 || magBC === 0) return 0
    var cosAngle = dot / (magBA * magBC)
    cosAngle = Math.max(-1, Math.min(1, cosAngle))
    return Math.acos(cosAngle) * 180 / Math.PI
  }

})()
