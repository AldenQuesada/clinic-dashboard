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

    // Draw midline (green vertical reference line)
    if (FM._metricShowMidline) {
      var mlx = FM._metricMidline ? FM._metricMidline.x * w : w / 2
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(16,185,129,0.5)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.moveTo(mlx, 0)
      ctx.lineTo(mlx, h)
      ctx.stroke()
      ctx.setLineDash([])

      // Drag handle at top
      ctx.beginPath()
      ctx.fillStyle = '#10B981'
      ctx.arc(mlx, 12, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Draw horizontal lines (dashed, clean)
    FM._metricLines.h.forEach(function (line, i) {
      var y = line.y * h
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(16,185,129,0.6)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
      ctx.setLineDash([])

      // Small handle dot
      ctx.beginPath()
      ctx.fillStyle = '#10B981'
      ctx.arc(8, y, 4, 0, Math.PI * 2)
      ctx.fill()

      // Minimal label
      ctx.font = '500 9px Inter, sans-serif'
      ctx.fillStyle = 'rgba(16,185,129,0.7)'
      ctx.textAlign = 'left'
      var label = line.label || ('H' + (i + 1))
      ctx.fillText(label, 16, y - 4)

      // Distance to previous (small, between lines)
      if (i > 0) {
        var prevY = FM._metricLines.h[i - 1].y * h
        var distPct = Math.round(Math.abs(line.y - FM._metricLines.h[i - 1].y) * 100)
        ctx.font = '400 8px Inter, sans-serif'
        ctx.fillStyle = 'rgba(16,185,129,0.4)'
        ctx.fillText(distPct + '%', 16, (y + prevY) / 2 + 3)
      }
    })

    // ── Dynamic proportions bar (right edge) ──────────────
    // Shows colored segments between H lines with % — updates as you drag
    if (FM._metricLines.h.length >= 2) {
      var barX = w - 24
      var barW = 14
      var hLines = FM._metricLines.h  // already sorted by y
      var firstY = hLines[0].y * h
      var lastY = hLines[hLines.length - 1].y * h
      var totalSpan = lastY - firstY

      if (totalSpan > 10) {
        for (var si = 0; si < hLines.length - 1; si++) {
          var segTop = hLines[si].y * h
          var segBot = hLines[si + 1].y * h
          var segH = segBot - segTop
          var segPct = Math.round((segH / totalSpan) * 100)
          var idealPct = Math.round(100 / (hLines.length - 1))
          var tolerance = idealPct * 0.3

          // Color: green if close to ideal, yellow if off, red if way off
          var segColor
          if (Math.abs(segPct - idealPct) <= tolerance) segColor = '#10B981'
          else if (Math.abs(segPct - idealPct) <= tolerance * 2) segColor = '#F59E0B'
          else segColor = '#EF4444'

          // Colored bar segment
          ctx.globalAlpha = 0.6
          ctx.fillStyle = segColor
          ctx.fillRect(barX, segTop, barW, segH)
          ctx.globalAlpha = 1.0

          // Border
          ctx.strokeStyle = segColor
          ctx.lineWidth = 1
          ctx.strokeRect(barX, segTop, barW, segH)

          // Percentage label centered in segment
          if (segH > 18) {
            ctx.font = '700 10px Inter, sans-serif'
            ctx.fillStyle = '#fff'
            ctx.textAlign = 'center'
            ctx.fillText(segPct + '%', barX + barW / 2, segTop + segH / 2 + 4)
          }
        }
      }
    }

    // Draw vertical lines (dashed, clean)
    FM._metricLines.v.forEach(function (line, i) {
      var x = line.x * w
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(59,130,246,0.6)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
      ctx.setLineDash([])

      // Small handle dot
      ctx.beginPath()
      ctx.fillStyle = '#3B82F6'
      ctx.arc(x, h - 8, 4, 0, Math.PI * 2)
      ctx.fill()

      // Minimal label
      var label = line.label || ('V' + (i + 1))
      ctx.font = '500 9px Inter, sans-serif'
      ctx.fillStyle = 'rgba(59,130,246,0.7)'
      ctx.textAlign = 'center'
      ctx.fillText(label, x, h - 16)
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

      // Point label (anatomical name or P#)
      var ptLabel = pt.label || ('P' + pt.id)
      ctx.font = '500 8px Inter, sans-serif'
      ctx.fillStyle = 'rgba(245,240,232,0.8)'
      ctx.textAlign = pt.x < 0.5 ? 'right' : 'left'
      var labelOffX = pt.x < 0.5 ? -10 : 10
      ctx.fillText(ptLabel, px + labelOffX, py - 8)
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
        var higherSide = ay < by ? 'D' : 'E'
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

    var tool = FM._metricTool

    // Angle points — always draggable (they're special)
    if (FM._metricAngles && FM._metricAngles.points) {
      var pts = FM._metricAngles.points
      var angleKeys = ['gonial_left', 'gonial_right', 'mento', 'zigoma_left', 'zigoma_right']
      for (var ai = 0; ai < angleKeys.length; ai++) {
        var ak = angleKeys[ai]
        var ap = pts[ak]
        if (!ap) continue
        var apx = ap.x * w, apy = ap.y * h
        if (Math.sqrt(Math.pow(mx - apx, 2) + Math.pow(my - apy, 2)) < threshold) {
          FM._pushUndo()
          FM._metricDrag = { type: 'angle_point', key: ak }
          return true
        }
      }
    }

    // Only check/add elements matching the selected tool
    if (tool === 'hline') {
      // Drag existing H line
      for (var i = 0; i < FM._metricLines.h.length; i++) {
        var ly = FM._metricLines.h[i].y * h
        if (Math.abs(my - ly) < threshold && mx < w) {
          FM._pushUndo()
          FM._metricDrag = { type: 'hline', index: i }
          return true
        }
      }
      // Add new H line
      if (mx > 0 && mx < w && my > 0 && my < h) {
        FM._pushUndo()
        FM._metricLines.h.push({ y: my / h, id: FM._metricNextLineId++ })
        FM._metricLines.h.sort(function (a, b) { return a.y - b.y })
        FM._redraw()
        FM._refreshToolbar()
        return true
      }
    } else if (tool === 'vline') {
      // Drag existing V line
      for (var j = 0; j < FM._metricLines.v.length; j++) {
        var lx = FM._metricLines.v[j].x * w
        if (Math.abs(mx - lx) < threshold && my < h) {
          FM._pushUndo()
          FM._metricDrag = { type: 'vline', index: j }
          return true
        }
      }
      // Add new V line
      if (mx > 0 && mx < w && my > 0 && my < h) {
        FM._pushUndo()
        FM._metricLines.v.push({ x: mx / w, id: FM._metricNextLineId++ })
        FM._metricLines.v.sort(function (a, b) { return a.x - b.x })
        FM._redraw()
        FM._refreshToolbar()
        return true
      }
    } else if (tool === 'point') {
      // Drag existing point
      for (var k = 0; k < FM._metricPoints.length; k++) {
        var ppx = FM._metricPoints[k].x * w
        var ppy = FM._metricPoints[k].y * h
        if (Math.sqrt(Math.pow(mx - ppx, 2) + Math.pow(my - ppy, 2)) < threshold) {
          FM._pushUndo()
          FM._metricDrag = { type: 'point', index: k }
          return true
        }
      }
      // Add new point
      if (mx > 0 && mx < w && my > 0 && my < h) {
        FM._pushUndo()
        FM._metricPoints.push({ x: mx / w, y: my / h, id: FM._metricNextPointId++ })
        FM._redraw()
        FM._refreshToolbar()
        return true
      }
    }

    // Midline — always draggable
    if (FM._metricShowMidline) {
      var midX = (FM._metricMidline ? FM._metricMidline.x : 0.5) * w
      if (Math.abs(mx - midX) < threshold && my < 30) {
        FM._pushUndo()
        FM._metricDrag = { type: 'midline' }
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
    FM._pushUndo()
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

  // ── Auto Anatomical Pairs ─────────────────────────────────

  // 12 pairs: matching left/right structures for asymmetry measurement
  // MediaPipe "left" = patient's left = viewer's RIGHT in frontal photo
  // So we swap: MediaPipe left_* landmarks get label "D" (viewer's right = patient's left... no)
  // Actually: in a frontal photo, the patient's RIGHT side appears on the LEFT of the image
  // MediaPipe "left_eye" = patient's left eye = RIGHT side of image
  // So: kp "left_*" → label "E" (appears on right of image = patient's left = E)
  // Wait — in medicine, E/D refers to the PATIENT's perspective:
  //   Patient's right (D) = viewer's left in frontal photo
  //   Patient's left (E) = viewer's right in frontal photo
  // MediaPipe uses viewer's perspective: "left" = left side of image = patient's RIGHT
  // So: MediaPipe "left_*" = patient's D (direito), MediaPipe "right_*" = patient's E (esquerdo)
  var ANATOMICAL_PAIRS = [
    { id: 'sobrancelha', label_e: 'Sobrancelha D', label_d: 'Sobrancelha E', kp_e: 'left_brow_top', kp_d: 'right_brow_top' },
    { id: 'olho_ext', label_e: 'Olho Ext D', label_d: 'Olho Ext E', kp_e: 'left_eye_outer', kp_d: 'right_eye_outer' },
    { id: 'olho_int', label_e: 'Olho Int D', label_d: 'Olho Int E', kp_e: 'left_eye_inner', kp_d: 'right_eye_inner' },
    { id: 'zigoma', label_e: 'Zigoma D', label_d: 'Zigoma E', kp_e: 'left_zygomatic', kp_d: 'right_zygomatic' },
    { id: 'nariz', label_e: 'Asa Nasal D', label_d: 'Asa Nasal E', kp_e: 'nose_left', kp_d: 'nose_right' },
    { id: 'comissura', label_e: 'Comissura D', label_d: 'Comissura E', kp_e: 'lip_left', kp_d: 'lip_right' },
    { id: 'mandibula', label_e: 'Mandibula D', label_d: 'Mandibula E', kp_e: 'jaw_left_angle', kp_d: 'jaw_right_angle' },
    { id: 'temple', label_e: 'Temporal D', label_d: 'Temporal E', kp_e: 'left_temple', kp_d: 'right_temple' },
  ]

  FM._autoAsymmetryPairs = function () {
    if (!FM._scanData || !FM._scanData.key_points) {
      FM._showToast('Execute Auto Analise primeiro', 'warn')
      return
    }

    FM._pushUndo()
    var kp = FM._scanData.key_points
    FM._metricPoints = []
    FM._metricNextPointId = 1

    ANATOMICAL_PAIRS.forEach(function (pair) {
      var ptE = kp[pair.kp_e]
      var ptD = kp[pair.kp_d]
      if (!ptE || !ptD) return

      FM._metricPoints.push({
        x: ptE.x, y: ptE.y,
        id: FM._metricNextPointId++,
        label: pair.label_e,
        pair_id: pair.id,
      })
      FM._metricPoints.push({
        x: ptD.x, y: ptD.y,
        id: FM._metricNextPointId++,
        label: pair.label_d,
        pair_id: pair.id,
      })
    })

    // Set midline
    if (kp.nose_bridge) {
      FM._metricMidline = { x: kp.nose_bridge.x }
    }

    // Calculate global asymmetry score
    FM._asymmetryScore = _calcGlobalAsymmetry()

    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
    FM._showToast(FM._metricPoints.length / 2 + ' pares anatomicos | Assimetria global: ' + FM._asymmetryScore.score + '/100', 'success')
  }

  function _calcGlobalAsymmetry() {
    var w = FM._imgW || 1
    var h = FM._imgH || 1
    var midX = FM._metricMidline ? FM._metricMidline.x : 0.5
    var totalDev = 0
    var pairCount = 0
    var details = []

    for (var i = 0; i + 1 < FM._metricPoints.length; i += 2) {
      var a = FM._metricPoints[i]
      var b = FM._metricPoints[i + 1]
      var dy = Math.abs(a.y - b.y) * h
      var dxFromMid_a = Math.abs(a.x - midX) * w
      var dxFromMid_b = Math.abs(b.x - midX) * w
      var dxDiff = Math.abs(dxFromMid_a - dxFromMid_b)

      var deviation = Math.sqrt(dy * dy + dxDiff * dxDiff)
      totalDev += deviation
      pairCount++

      var severity = deviation > 12 ? 'evidente' : deviation > 6 ? 'moderada' : 'leve'
      var sevColor = deviation > 12 ? '#EF4444' : deviation > 6 ? '#F59E0B' : '#10B981'

      details.push({
        pair: a.label ? a.label.replace(' E', '') : 'Par ' + (i / 2 + 1),
        dy: Math.round(dy),
        dx_diff: Math.round(dxDiff),
        total: Math.round(deviation),
        severity: severity,
        color: sevColor,
        higher: a.y < b.y ? 'D' : 'E',
      })
    }

    // Score: 100 = perfect symmetry, 0 = severe asymmetry
    // Average deviation per pair, normalize (max expected ~25px)
    var avgDev = pairCount > 0 ? totalDev / pairCount : 0
    var score = Math.round(Math.max(0, Math.min(100, 100 - avgDev * 4)))

    var classification
    if (score >= 90) classification = { label: 'Simetria Excelente', color: '#10B981' }
    else if (score >= 75) classification = { label: 'Leve Assimetria', color: '#F59E0B' }
    else if (score >= 60) classification = { label: 'Assimetria Moderada', color: '#F97316' }
    else classification = { label: 'Assimetria Evidente', color: '#EF4444' }

    return {
      score: score,
      classification: classification,
      details: details,
      pair_count: pairCount,
      avg_deviation: Math.round(avgDev),
    }
  }

  FM._removeLastMetric = function (type) {
    FM._pushUndo()
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

    FM._pushUndo()
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
        higher_side: pdy < 0 ? 'Direito' : (pdy > 0 ? 'Esquerdo' : 'Alinhado'),
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

    FM._pushUndo()
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
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.moveTo(gLx, gLy)
    ctx.lineTo(mx, my)
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

  // ── Clinical Analysis Panel (drawn in label area) ────────

  FM._drawClinicalAnalysis = function () {
    if (!FM._ctx || !FM._imgW) return
    var ctx = FM._ctx
    var x0 = FM._imgW + 8  // start of label area
    var w = 170  // label area width
    var totalH = FM._imgH || 600

    // Divide into 3 sections
    var sectionH = Math.floor(totalH / 3)
    var y1 = 0
    var y2 = sectionH
    var y3 = sectionH * 2

    ctx.save()

    // Background for each section
    ctx.fillStyle = '#1E1E1E'
    ctx.fillRect(x0 - 4, 0, w + 8, totalH)

    // Section dividers
    ctx.strokeStyle = 'rgba(200,169,126,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, y2)
    ctx.lineTo(x0 + w, y2)
    ctx.moveTo(x0, y3)
    ctx.lineTo(x0 + w, y3)
    ctx.stroke()

    // ── SECTION 1: PLANO VERTICAL ─────────────────────────
    _drawSection(ctx, x0, y1, w, sectionH, 'PLANO VERTICAL', '#10B981', function (x, y, maxW) {
      var lineH = 13
      var data = _getVerticalAnalysis()

      ctx.font = '600 9px Inter, sans-serif'
      ctx.fillStyle = '#F5F0E8'

      data.forEach(function (item) {
        if (item.type === 'header') {
          ctx.font = '700 9px Inter, sans-serif'
          ctx.fillStyle = item.color || '#C8A97E'
          ctx.fillText(item.text, x, y)
          y += lineH
        } else if (item.type === 'value') {
          ctx.font = '400 9px Inter, sans-serif'
          ctx.fillStyle = 'rgba(245,240,232,0.7)'
          ctx.fillText(item.label + ':', x, y)
          ctx.fillStyle = item.color || '#F5F0E8'
          ctx.font = '600 9px Inter, sans-serif'
          ctx.textAlign = 'right'
          ctx.fillText(item.value, x + maxW - 4, y)
          ctx.textAlign = 'left'
          y += lineH
        } else if (item.type === 'text') {
          ctx.font = '400 8px Inter, sans-serif'
          ctx.fillStyle = item.color || 'rgba(245,240,232,0.5)'
          _wrapText(ctx, item.text, x, y, maxW - 4, 10)
          y += Math.ceil(item.text.length / 22) * 10 + 2
        } else if (item.type === 'spacer') {
          y += 4
        } else if (item.type === 'rx') {
          ctx.font = '600 8px Inter, sans-serif'
          ctx.fillStyle = item.color || '#3B82F6'
          ctx.fillText('Rx: ' + item.text, x, y)
          y += lineH
        }
      })
    })

    // ── SECTION 2: PLANO HORIZONTAL ───────────────────────
    _drawSection(ctx, x0, y2, w, sectionH, 'PLANO HORIZONTAL', '#3B82F6', function (x, y, maxW) {
      var lineH = 13
      var data = _getHorizontalAnalysis()

      data.forEach(function (item) {
        if (item.type === 'header') {
          ctx.font = '700 9px Inter, sans-serif'
          ctx.fillStyle = item.color || '#C8A97E'
          ctx.fillText(item.text, x, y)
          y += lineH
        } else if (item.type === 'value') {
          ctx.font = '400 9px Inter, sans-serif'
          ctx.fillStyle = 'rgba(245,240,232,0.7)'
          ctx.fillText(item.label + ':', x, y)
          ctx.fillStyle = item.color || '#F5F0E8'
          ctx.font = '600 9px Inter, sans-serif'
          ctx.textAlign = 'right'
          ctx.fillText(item.value, x + maxW - 4, y)
          ctx.textAlign = 'left'
          y += lineH
        } else if (item.type === 'text') {
          ctx.font = '400 8px Inter, sans-serif'
          ctx.fillStyle = item.color || 'rgba(245,240,232,0.5)'
          _wrapText(ctx, item.text, x, y, maxW - 4, 10)
          y += Math.ceil(item.text.length / 22) * 10 + 2
        } else if (item.type === 'rx') {
          ctx.font = '600 8px Inter, sans-serif'
          ctx.fillStyle = item.color || '#3B82F6'
          ctx.fillText('Rx: ' + item.text, x, y)
          y += lineH
        } else if (item.type === 'spacer') {
          y += 4
        }
      })
    })

    // ── SECTION 3: LINHA MANDIBULAR ───────────────────────
    _drawSection(ctx, x0, y3, w, sectionH, 'LINHA MANDIBULAR', '#C8A97E', function (x, y, maxW) {
      var lineH = 13
      var data = _getMandibularAnalysis()

      data.forEach(function (item) {
        if (item.type === 'header') {
          ctx.font = '700 9px Inter, sans-serif'
          ctx.fillStyle = item.color || '#C8A97E'
          ctx.fillText(item.text, x, y)
          y += lineH
        } else if (item.type === 'value') {
          ctx.font = '400 9px Inter, sans-serif'
          ctx.fillStyle = 'rgba(245,240,232,0.7)'
          ctx.fillText(item.label + ':', x, y)
          ctx.fillStyle = item.color || '#F5F0E8'
          ctx.font = '600 9px Inter, sans-serif'
          ctx.textAlign = 'right'
          ctx.fillText(item.value, x + maxW - 4, y)
          ctx.textAlign = 'left'
          y += lineH
        } else if (item.type === 'text') {
          ctx.font = '400 8px Inter, sans-serif'
          ctx.fillStyle = item.color || 'rgba(245,240,232,0.5)'
          _wrapText(ctx, item.text, x, y, maxW - 4, 10)
          y += Math.ceil(item.text.length / 22) * 10 + 2
        } else if (item.type === 'rx') {
          ctx.font = '600 8px Inter, sans-serif'
          ctx.fillStyle = item.color || '#3B82F6'
          ctx.fillText('Rx: ' + item.text, x, y)
          y += lineH
        } else if (item.type === 'spacer') {
          y += 4
        }
      })
    })

    ctx.restore()
  }

  function _drawSection(ctx, x0, y0, w, h, title, titleColor, contentFn) {
    var pad = 6
    // Title bar
    ctx.fillStyle = titleColor
    ctx.globalAlpha = 0.15
    ctx.fillRect(x0, y0, w, 18)
    ctx.globalAlpha = 1.0

    ctx.font = '700 8px Inter, sans-serif'
    ctx.fillStyle = titleColor
    ctx.textAlign = 'left'
    ctx.letterSpacing = '0.1em'
    ctx.fillText(title, x0 + pad, y0 + 12)

    // Content
    contentFn(x0 + pad, y0 + 26, w - pad * 2)
  }

  function _wrapText(ctx, text, x, y, maxW, lineH) {
    var words = text.split(' ')
    var line = ''
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i] + ' '
      if (ctx.measureText(test).width > maxW && i > 0) {
        ctx.fillText(line.trim(), x, y)
        line = words[i] + ' '
        y += lineH
      } else {
        line = test
      }
    }
    ctx.fillText(line.trim(), x, y)
  }

  // ── Clinical Analysis Data ──────────────────────────────

  function _getVerticalAnalysis() {
    var items = []
    var scan = FM._scanData
    var thirds = scan ? scan.thirds : null

    items.push({ type: 'header', text: 'Proporcoes Faciais', color: '#10B981' })

    if (thirds) {
      var sup = thirds.superior, med = thirds.medio, inf = thirds.inferior
      items.push({ type: 'value', label: 'Terco Superior', value: Math.round(sup) + '%', color: sup >= 28 && sup <= 38 ? '#10B981' : '#F59E0B' })
      items.push({ type: 'value', label: 'Terco Medio', value: Math.round(med) + '%', color: med >= 28 && med <= 38 ? '#10B981' : '#F59E0B' })
      items.push({ type: 'value', label: 'Terco Inferior', value: Math.round(inf) + '%', color: inf >= 28 && inf <= 38 ? '#10B981' : '#F59E0B' })
      items.push({ type: 'value', label: 'Equilibrio', value: thirds.balanced ? 'Sim' : 'Nao', color: thirds.balanced ? '#10B981' : '#EF4444' })
      items.push({ type: 'spacer' })

      // Clinical interpretation
      if (inf > 38) {
        items.push({ type: 'text', text: 'Terco inferior alongado — indica excesso vertical ou mento projetado.', color: 'rgba(245,240,232,0.6)' })
        items.push({ type: 'rx', text: 'Botox masseter (20-30U bilateral) para reduzir volume', color: '#8B5CF6' })
      } else if (inf < 28) {
        items.push({ type: 'text', text: 'Terco inferior curto — indica mento retruido ou mordida profunda.', color: 'rgba(245,240,232,0.6)' })
        items.push({ type: 'rx', text: 'AH mento 1-2mL para projecao', color: '#3B82F6' })
      }
      if (sup < 28) {
        items.push({ type: 'text', text: 'Terco superior curto — linha do cabelo baixa ou testa pequena.', color: 'rgba(245,240,232,0.6)' })
      }
      if (med > 38) {
        items.push({ type: 'text', text: 'Terco medio aumentado — nariz pode parecer longo.', color: 'rgba(245,240,232,0.6)' })
        items.push({ type: 'rx', text: 'AH ponta nasal 0.5mL para encurtar visualmente', color: '#3B82F6' })
      }
      if (thirds.balanced) {
        items.push({ type: 'text', text: 'Proporcoes verticais equilibradas — boa harmonia.', color: '#10B981' })
      }
    } else {
      items.push({ type: 'text', text: 'Execute Auto Analise para obter dados verticais.' })
    }

    // Symmetry
    if (scan && scan.symmetry) {
      items.push({ type: 'spacer' })
      items.push({ type: 'header', text: 'Simetria', color: '#10B981' })
      items.push({ type: 'value', label: 'Global', value: scan.symmetry.overall + '%', color: scan.symmetry.overall >= 85 ? '#10B981' : scan.symmetry.overall >= 70 ? '#F59E0B' : '#EF4444' })
      if (scan.symmetry.overall < 85) {
        items.push({ type: 'rx', text: 'AH compensatorio no lado deficiente', color: '#3B82F6' })
      }
    }

    return items
  }

  function _getHorizontalAnalysis() {
    var items = []
    var scan = FM._scanData
    var shape = scan ? scan.shape : null
    var measurements = scan ? scan.measurements : null

    items.push({ type: 'header', text: 'Morfologia Facial', color: '#3B82F6' })

    if (shape) {
      items.push({ type: 'value', label: 'Biotipo', value: shape.shape, color: '#C8A97E' })
      items.push({ type: 'spacer' })

      // Ratios
      if (shape.ratios) {
        items.push({ type: 'value', label: 'Larg/Alt', value: shape.ratios.width_to_length, color: shape.ratios.width_to_length >= 0.65 && shape.ratios.width_to_length <= 0.85 ? '#10B981' : '#F59E0B' })
        items.push({ type: 'value', label: 'Testa/Mand', value: shape.ratios.forehead_to_jaw, color: Math.abs(shape.ratios.forehead_to_jaw - 1.0) < 0.15 ? '#10B981' : '#F59E0B' })
      }
      items.push({ type: 'spacer' })

      // Treatment by face shape
      if (shape.shape === 'redondo') {
        items.push({ type: 'text', text: 'Rosto redondo: focar em angulacao e definicao para criar contorno.' })
        items.push({ type: 'rx', text: 'AH mandibula 2-3mL bilateral', color: '#3B82F6' })
        items.push({ type: 'rx', text: 'AH mento 1mL projecao', color: '#3B82F6' })
        items.push({ type: 'rx', text: 'Botox masseter 25U bilateral', color: '#8B5CF6' })
      } else if (shape.shape === 'quadrado') {
        items.push({ type: 'text', text: 'Rosto quadrado: suavizar angulos e criar curvas femininas.' })
        items.push({ type: 'rx', text: 'Botox masseter 30U bilateral', color: '#8B5CF6' })
        items.push({ type: 'rx', text: 'AH zigoma 1mL bilateral', color: '#3B82F6' })
        items.push({ type: 'rx', text: 'AH temporal 0.5mL bilateral', color: '#3B82F6' })
      } else if (shape.shape === 'oval') {
        items.push({ type: 'text', text: 'Rosto oval: biotipo ideal. Manter proporcoes, refinar detalhes.' })
        items.push({ type: 'rx', text: 'AH pontual conforme queixas', color: '#3B82F6' })
      } else if (shape.shape === 'oblongo') {
        items.push({ type: 'text', text: 'Rosto oblongo: criar largura para equilibrar comprimento.' })
        items.push({ type: 'rx', text: 'AH zigoma 1.5mL bilateral', color: '#3B82F6' })
        items.push({ type: 'rx', text: 'AH mandibula 1mL bilateral', color: '#3B82F6' })
      } else if (shape.shape === 'coracao') {
        items.push({ type: 'text', text: 'Rosto coracao: equilibrar testa larga com mandibula estreita.' })
        items.push({ type: 'rx', text: 'AH mandibula 2mL bilateral', color: '#3B82F6' })
        items.push({ type: 'rx', text: 'AH mento 1mL', color: '#3B82F6' })
      } else if (shape.shape === 'diamante') {
        items.push({ type: 'text', text: 'Rosto diamante: preencher temporal e mandibula.' })
        items.push({ type: 'rx', text: 'AH temporal 1mL bilateral', color: '#3B82F6' })
        items.push({ type: 'rx', text: 'AH mandibula 1.5mL bilateral', color: '#3B82F6' })
      }
    }

    // Golden ratio
    if (measurements && measurements.golden_ratio_score != null) {
      items.push({ type: 'spacer' })
      items.push({ type: 'value', label: 'Prop. Aurea', value: Math.round(measurements.golden_ratio_score) + '%', color: measurements.golden_ratio_score >= 70 ? '#10B981' : '#F59E0B' })
    }

    return items
  }

  function _getMandibularAnalysis() {
    var items = []
    var ma = FM._metricAngles

    items.push({ type: 'header', text: 'Contorno Mandibular', color: '#C8A97E' })

    if (ma) {
      items.push({ type: 'value', label: 'AMF', value: ma.amf + '\u00B0', color: ma.classification.color })
      items.push({ type: 'value', label: 'Classificacao', value: ma.classification.label, color: ma.classification.color })
      items.push({ type: 'value', label: 'Ratio M/Z', value: ma.rmz + '', color: ma.rmz >= 0.85 && ma.rmz <= 0.95 ? '#10B981' : '#F59E0B' })
      items.push({ type: 'value', label: 'Jawline E', value: ma.aij_left + '\u00B0', color: ma.jawline.color })
      items.push({ type: 'value', label: 'Jawline D', value: ma.aij_right + '\u00B0', color: ma.jawline.color })
      items.push({ type: 'value', label: 'Tensao', value: ma.jawline.label, color: ma.jawline.color })

      // Asymmetry
      var aijDiff = Math.abs(ma.aij_left - ma.aij_right)
      if (aijDiff > 2) {
        var side = ma.aij_left > ma.aij_right ? 'E' : 'D'
        items.push({ type: 'value', label: 'Assimetria', value: '\u0394' + Math.round(aijDiff * 10) / 10 + '\u00B0 (' + side + ')', color: aijDiff > 8 ? '#EF4444' : '#F59E0B' })
      }

      items.push({ type: 'spacer' })

      // Treatment recommendations
      if (ma.classification.level <= 2) {
        // Arredondada ou Suave — precisa definir
        items.push({ type: 'text', text: 'Contorno indefinido. Protocolo de definicao mandibular recomendado.' })
        items.push({ type: 'rx', text: 'AH mandibula 2-3mL bilateral', color: '#3B82F6' })
        items.push({ type: 'rx', text: 'AH mento 1-1.5mL projecao', color: '#3B82F6' })
        if (ma.aij_avg > 30) {
          items.push({ type: 'rx', text: 'AH pre-jowl 0.5mL bilateral', color: '#3B82F6' })
        }
      } else if (ma.classification.level === 3) {
        // Definida — manter ou refinar
        items.push({ type: 'text', text: 'Boa definicao mandibular. Refinar contorno e tratar assimetrias.' })
        if (aijDiff > 4) {
          items.push({ type: 'rx', text: 'AH compensatorio lado ' + side + ' 0.5-1mL', color: '#3B82F6' })
        }
      } else {
        // Angular — pode suavizar se desejado
        items.push({ type: 'text', text: 'Mandibula angular marcada. Considerar suavizacao se desejado.' })
        items.push({ type: 'rx', text: 'Botox masseter 20-25U bilateral', color: '#8B5CF6' })
      }

      // Jawline tension treatment
      if (ma.aij_avg > 30) {
        items.push({ type: 'spacer' })
        items.push({ type: 'text', text: 'Jawline caida — perda de sustentacao. Vetor de lifting necessario.' })
        items.push({ type: 'rx', text: 'AH temporal 1mL vetor lifting', color: '#3B82F6' })
        items.push({ type: 'rx', text: 'Fios PDO 4-6 unidades', color: '#06B6D4' })
      }
    } else {
      items.push({ type: 'text', text: 'Execute Auto Angulos para analise mandibular completa.' })
    }

    return items
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

  // ── Wireframe 478pts overlay ──────────────────────────────

  FM._showWireframe = false

  FM._toggleWireframe = function () {
    FM._showWireframe = !FM._showWireframe
    FM._redraw()
  }

  FM._drawWireframe = function () {
    if (!FM._showWireframe || !FM._scanData || !FM._scanData.landmarks) return
    var ctx = FM._ctx
    var w = FM._imgW
    var h = FM._imgH
    var lm = FM._scanData.landmarks
    if (lm.length < 468) return

    ctx.save()
    ctx.strokeStyle = 'rgba(80,180,220,0.6)'
    ctx.lineWidth = 1.2

    // Face oval
    _drawLP(ctx, lm, [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10], w, h)
    // Left eye
    _drawLP(ctx, lm, [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33], w, h)
    // Right eye
    _drawLP(ctx, lm, [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398,362], w, h)
    // Left eyebrow
    _drawLP(ctx, lm, [70,63,105,66,107,55,65,52,53,46], w, h)
    // Right eyebrow
    _drawLP(ctx, lm, [300,293,334,296,336,285,295,282,283,276], w, h)
    // Nose
    _drawLP(ctx, lm, [168,6,197,195,5,4,1,19,94,2], w, h)
    // Lips outer
    _drawLP(ctx, lm, [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61], w, h)
    // Lips inner
    _drawLP(ctx, lm, [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191,78], w, h)

    // All 468 dots
    ctx.fillStyle = 'rgba(80,180,220,0.5)'
    for (var i = 0; i < Math.min(468, lm.length); i++) {
      ctx.beginPath()
      ctx.arc(lm[i].x * w, lm[i].y * h, 1, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  function _drawLP(ctx, lm, idx, w, h) {
    ctx.beginPath()
    for (var i = 0; i < idx.length; i++) {
      if (idx[i] >= lm.length) continue
      var px = lm[idx[i]].x * w, py = lm[idx[i]].y * h
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }

})()
