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
      ctx.strokeStyle = 'rgba(245,158,11,0.5)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
      ctx.setLineDash([])

      // Distance label
      var dist = Math.sqrt(Math.pow(bx - ax, 2) + Math.pow(by - ay, 2))
      var midPx = (ax + bx) / 2
      var midPy = (ay + by) / 2
      ctx.font = '600 10px Inter, sans-serif'
      ctx.fillStyle = '#F59E0B'
      ctx.textAlign = 'center'
      ctx.fillText(Math.round(dist) + 'px', midPx, midPy - 6)
    }

    ctx.restore()
  }

  // ── Mouse interaction for metrics ───────────────────────

  FM._onMetricMouseDown = function (mx, my) {
    var w = FM._imgW, h = FM._imgH
    var threshold = 12

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

    // Point pair distances
    for (var j = 0; j + 1 < FM._metricPoints.length; j += 2) {
      var a = FM._metricPoints[j]
      var b = FM._metricPoints[j + 1]
      var dx = (b.x - a.x) * w
      var dy = (b.y - a.y) * h
      summary.point_distances.push({
        from: 'P' + a.id,
        to: 'P' + b.id,
        distance_px: Math.round(Math.sqrt(dx * dx + dy * dy)),
      })
    }

    return summary
  }

})()
