/**
 * fm-regions.js — Anatomical Region Overlay Engine
 * Replaces generic ellipses with anatomically accurate bezier shapes
 * calculated from MediaPipe 478 landmarks.
 *
 * Each region:
 * - Computed from specific landmark groups
 * - Rendered as bezier/spline path with gradient fill
 * - Editable control points (draggable)
 * - Unique color per region (brandbook)
 * - Supports intensity slider
 */
;(function () {
  'use strict'

  var FM = window._FM

  // ── Region Definitions ──────────────────────────────────

  var REGIONS = {
    'olheira': {
      label: 'Olheira',
      color: '#7ECF7E',
      alpha: 0.25,
      // Infraorbital landmarks (under-eye curve)
      landmarksL: [33, 7, 163, 144, 145, 153, 154, 155, 133],
      landmarksR: [362, 382, 381, 380, 374, 373, 390, 249, 263],
      type: 'infraorbital',
      offsetY: 0.012,  // shift down from eye
    },
    'temporal': {
      label: 'Temporal',
      color: '#9B6FC7',
      alpha: 0.25,
      landmarksL: [54, 103, 67, 109, 10],
      landmarksR: [284, 332, 297, 338, 10],
      type: 'organic_oval',
      scale: 0.7,
    },
    'zigoma-lateral': {
      label: 'Zigoma Lateral',
      color: '#5B7FC7',
      alpha: 0.25,
      landmarksL: [93, 132, 58, 172],
      landmarksR: [323, 361, 288, 397],
      type: 'angular_polygon',
    },
    'zigoma-anterior': {
      label: 'Zigoma Anterior',
      color: '#6BBF8A',
      alpha: 0.22,
      landmarksL: [93, 132, 234, 127],
      landmarksR: [323, 361, 454, 356],
      type: 'soft_polygon',
    },
    'sulco': {
      label: 'Sulco Nasogeniano',
      color: '#E8A86B',
      alpha: 0.28,
      landmarksL: [129, 49, 48, 115, 131, 198, 236, 3, 196, 122, 6],
      landmarksR: [358, 279, 278, 344, 360, 420, 456, 3, 419, 351, 6],
      type: 's_curve',
      width: 0.015,
    },
    'marionete': {
      label: 'Marionete',
      color: '#D98BA3',
      alpha: 0.25,
      landmarksL: [61, 146, 91, 181, 84],
      landmarksR: [291, 375, 321, 405, 314],
      type: 'vertical_curve',
      width: 0.012,
    },
    'mandibula': {
      label: 'Mandibula',
      color: '#C9A96E',
      alpha: 0.22,
      landmarksL: [132, 58, 172, 136, 150, 149, 176, 148, 152],
      landmarksR: [361, 288, 397, 365, 379, 378, 400, 377, 152],
      type: 'angular_jaw',
    },
    'mento': {
      label: 'Mento',
      color: '#D4A857',
      alpha: 0.25,
      landmarks: [152, 377, 400, 378, 379, 365, 397, 288, 361,
                   132, 58, 172, 136, 150, 149, 176, 148],
      type: 'rounded_triangle',
    },
    'labio': {
      label: 'Labios',
      color: '#E07B7B',
      alpha: 0.22,
      landmarks: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
                   409, 270, 269, 267, 0, 37, 39, 40, 185],
      type: 'lip_contour',
    },
    'nariz-dorso': {
      label: 'Nariz',
      color: '#A8B4C8',
      alpha: 0.20,
      landmarks: [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 327],
      type: 'nose_contour',
    },
    'frontal': {
      label: 'Testa',
      color: '#8ECFC4',
      alpha: 0.18,
      landmarks: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323,
                   93, 234, 127, 162, 21, 54, 103, 67, 109],
      type: 'forehead',
    },
    'glabela': {
      label: 'Glabela',
      color: '#7BA3CF',
      alpha: 0.25,
      landmarks: [9, 107, 66, 105, 63, 70, 46, 53, 52, 65,
                   55, 336, 296, 334, 293, 300, 276, 283, 282, 295, 285],
      type: 'between_brows',
    },
    'periorbital': {
      label: 'Pes de Galinha',
      color: '#6BAED6',
      alpha: 0.22,
      landmarksL: [33, 246, 161, 160, 159, 158, 157, 173],
      landmarksR: [263, 466, 388, 387, 386, 385, 384, 398],
      type: 'crow_feet',
      extend: 0.02,
    },
  }

  // ── Draw anatomical region ──────────────────────────────

  FM._drawAnatomicalRegion = function (regionId, annotation) {
    if (!FM._ctx || !FM._scanData || !FM._scanData.landmarks) return
    var region = REGIONS[regionId]
    if (!region) return

    var ctx = FM._ctx
    var w = FM._imgW
    var h = FM._imgH
    var lm = FM._scanData.landmarks

    ctx.save()

    // Get path points based on region type
    var paths = _getRegionPaths(region, lm, w, h, annotation)

    paths.forEach(function (path) {
      if (path.length < 3) return

      // Create gradient fill
      var cx = 0, cy = 0
      path.forEach(function (p) { cx += p.x; cy += p.y })
      cx /= path.length
      cy /= path.length

      var maxR = 0
      path.forEach(function (p) {
        var d = Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy))
        if (d > maxR) maxR = d
      })

      // Radial gradient (center opaque, edges transparent)
      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.2)
      var baseColor = _hexToRgba(region.color, region.alpha * 1.2)
      var edgeColor = _hexToRgba(region.color, region.alpha * 0.3)
      grad.addColorStop(0, baseColor)
      grad.addColorStop(0.6, baseColor)
      grad.addColorStop(1, edgeColor)

      // Draw smooth bezier path
      ctx.beginPath()
      _drawSmoothPath(ctx, path)
      ctx.closePath()

      ctx.fillStyle = grad
      ctx.fill()

      // Subtle border
      ctx.strokeStyle = _hexToRgba(region.color, 0.3)
      ctx.lineWidth = 1
      ctx.stroke()
    })

    // Label
    if (annotation) {
      var s = annotation.shape
      ctx.font = '500 9px Montserrat, sans-serif'
      ctx.fillStyle = _hexToRgba(region.color, 0.8)
      ctx.textAlign = 'center'
      ctx.fillText(region.label, s.x, s.y - Math.max(s.ry, 15) - 6)

      var z = FM.ZONES.find(function (zz) { return zz.id === regionId })
      if (z && annotation.ml) {
        ctx.font = '400 8px Montserrat, sans-serif'
        ctx.fillText(annotation.ml + (z.unit || 'mL'), s.x, s.y - Math.max(s.ry, 15) - 18)
      }
    }

    ctx.restore()
  }

  // ── Get region paths from landmarks ─────────────────────

  function _getRegionPaths(region, lm, w, h, annotation) {
    var paths = []

    if (region.type === 'infraorbital') {
      // Olheira: shifted-down eye contour
      var offY = region.offsetY || 0.01
      if (region.landmarksL) {
        paths.push(_landmarkPoints(lm, region.landmarksL, w, h, 0, offY))
      }
      if (region.landmarksR) {
        paths.push(_landmarkPoints(lm, region.landmarksR, w, h, 0, offY))
      }
    }
    else if (region.type === 'organic_oval' || region.type === 'angular_polygon' || region.type === 'soft_polygon') {
      if (region.landmarksL) {
        paths.push(_landmarkPoints(lm, region.landmarksL, w, h))
      }
      if (region.landmarksR) {
        paths.push(_landmarkPoints(lm, region.landmarksR, w, h))
      }
    }
    else if (region.type === 's_curve' || region.type === 'vertical_curve') {
      // Sulco/Marionete: take center points and expand into a region
      var width = (region.width || 0.015) * w
      if (region.landmarksL) {
        var centerL = _landmarkPoints(lm, region.landmarksL, w, h)
        paths.push(_expandCurve(centerL, width))
      }
      if (region.landmarksR) {
        var centerR = _landmarkPoints(lm, region.landmarksR, w, h)
        paths.push(_expandCurve(centerR, width))
      }
    }
    else if (region.type === 'angular_jaw') {
      if (region.landmarksL) {
        paths.push(_landmarkPoints(lm, region.landmarksL, w, h))
      }
      if (region.landmarksR) {
        paths.push(_landmarkPoints(lm, region.landmarksR, w, h))
      }
    }
    else if (region.landmarks) {
      // Single region (mento, labio, nariz, frontal, glabela)
      paths.push(_landmarkPoints(lm, region.landmarks, w, h))
    }
    else if (region.type === 'crow_feet') {
      var ext = (region.extend || 0.02) * w
      if (region.landmarksL) {
        var ptsL = _landmarkPoints(lm, region.landmarksL, w, h)
        // Extend outward
        ptsL.forEach(function (p) { p.x -= ext * 0.5 })
        paths.push(ptsL)
      }
      if (region.landmarksR) {
        var ptsR = _landmarkPoints(lm, region.landmarksR, w, h)
        ptsR.forEach(function (p) { p.x += ext * 0.5 })
        paths.push(ptsR)
      }
    }

    // If annotation has custom position, shift paths toward it
    if (annotation && annotation.shape && paths.length > 0) {
      var s = annotation.shape
      paths.forEach(function (path) {
        var cx = 0, cy = 0
        path.forEach(function (p) { cx += p.x; cy += p.y })
        cx /= path.length
        cy /= path.length

        // Blend: 70% landmark-based, 30% annotation position
        var blendX = (s.x - cx) * 0.3
        var blendY = (s.y - cy) * 0.3
        path.forEach(function (p) { p.x += blendX; p.y += blendY })
      })
    }

    return paths
  }

  function _landmarkPoints(lm, indices, w, h, offX, offY) {
    offX = offX || 0
    offY = offY || 0
    var pts = []
    indices.forEach(function (idx) {
      if (idx < lm.length) {
        pts.push({
          x: lm[idx].x * w + offX * w,
          y: lm[idx].y * h + offY * h,
        })
      }
    })
    return pts
  }

  function _expandCurve(centerPoints, width) {
    // Expand a center line into a closed region
    var left = [], right = []
    centerPoints.forEach(function (p, i) {
      var nx = 0, ny = 1 // default normal
      if (i < centerPoints.length - 1) {
        var dx = centerPoints[i + 1].x - p.x
        var dy = centerPoints[i + 1].y - p.y
        var len = Math.sqrt(dx * dx + dy * dy) || 1
        nx = -dy / len
        ny = dx / len
      }
      left.push({ x: p.x + nx * width * 0.5, y: p.y + ny * width * 0.5 })
      right.unshift({ x: p.x - nx * width * 0.5, y: p.y - ny * width * 0.5 })
    })
    return left.concat(right)
  }

  // ── Smooth bezier path drawing ──────────────────────────

  function _drawSmoothPath(ctx, points) {
    if (points.length < 2) return

    ctx.moveTo(points[0].x, points[0].y)

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y)
      return
    }

    // Catmull-Rom to Bezier conversion (smooth curves through all points)
    for (var i = 0; i < points.length; i++) {
      var p0 = points[(i - 1 + points.length) % points.length]
      var p1 = points[i]
      var p2 = points[(i + 1) % points.length]
      var p3 = points[(i + 2) % points.length]

      var tension = 0.3
      var cp1x = p1.x + (p2.x - p0.x) * tension
      var cp1y = p1.y + (p2.y - p0.y) * tension
      var cp2x = p2.x - (p3.x - p1.x) * tension
      var cp2y = p2.y - (p3.y - p1.y) * tension

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
    }
  }

  // ── Main draw function (replaces ellipse for zones with landmarks) ──

  FM._drawRegionOrEllipse = function (ann) {
    var region = REGIONS[ann.zone]

    // If we have landmarks AND region definition, draw anatomical shape
    if (region && FM._scanData && FM._scanData.landmarks && FM._scanData.landmarks.length >= 468) {
      FM._drawAnatomicalRegion(ann.zone, ann)
    } else {
      // Fallback: original ellipse
      FM._drawEllipseClean(ann)
    }
  }

  // ── Helpers ─────────────────────────────────────────────

  function _hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16)
    var g = parseInt(hex.slice(3, 5), 16)
    var b = parseInt(hex.slice(5, 7), 16)
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
  }

  // Expose REGIONS for external use
  FM._ANATOMICAL_REGIONS = REGIONS

})()
