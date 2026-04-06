/**
 * fm-state.js — All state variables and helper functions
 */
;(function () {
  'use strict'

  var FM = window._FM

  // ── State ─────────────────────────────────────────────────
  FM._lead = null
  FM._photos = {}        // { front: File|Blob, '45': ..., lateral: ... }
  FM._photoUrls = {}     // objectURLs (cropped)
  FM._afterPhotoUrl = null   // DEPOIS (resultado atual)
  FM._simPhotoUrl = null     // DEPOIS SIMULADO
  FM._activeAngle = null
  FM._annotations = []   // [{ id, angle, zone, treatment, ml, product, shape:{x,y,rx,ry}, side }]
  FM._lastAnalysis = null  // GPT analysis result
  FM._editorMode = 'zones' // 'zones' | 'vectors' | 'analysis'
  FM._vectors = []       // [{ id, zone, start:{x,y}, end:{x,y}, curve:0.3 }]
  FM._nextVecId = 1
  FM._selVec = null      // selected vector for dragging
  FM._vecDragPart = null // 'end' | 'start' | 'curve'

  // Analysis state
  FM._tercoLines = { hairline: 0.05, brow: 0.33, noseBase: 0.62, chin: 0.95 }
  FM._rickettsPoints = { nose: { x: 0.35, y: 0.38 }, chin: { x: 0.40, y: 0.85 } }
  FM._analysisDrag = null

  // Canvas state
  FM._canvas = null
  FM._ctx = null
  FM._img = null
  FM._imgW = 0
  FM._imgH = 0
  FM._drawing = false
  FM._drawStart = null
  FM._mode = 'idle'       // idle | draw | move | resize
  FM._selAnn = null
  FM._moveStart = null
  FM._resizeHandle = null
  FM._selectedZone = null
  FM._selectedTreatment = 'ah'
  FM._selectedMl = '0.5'
  FM._selectedSide = 'bilateral'
  FM._selectedProduct = ''
  FM._nextId = 1
  FM._doneItems = []
  FM._exportCanvas = null

  // Crop state
  FM._cropImg = null
  FM._cropCanvas = null
  FM._cropCtx = null
  FM._cropZoom = 1
  FM._cropPanX = 0
  FM._cropPanY = 0
  FM._cropDragging = false
  FM._cropDragStart = null
  FM._pendingCropAngle = null

  // Upload state
  FM._pendingUploadAngle = null
  FM._originalFiles = {}
  FM._pendingExtraType = null

  // Auto-save timer
  FM._saveTimer = null

  // ── Feather icon helper ───────────────────────────────────
  FM._icon = function (name, size) {
    size = size || 16
    if (window.feather && window.feather.icons[name]) {
      return window.feather.icons[name].toSvg({ width: size, height: size, 'stroke-width': 1.8 })
    }
    return ''
  }

  // ── Zone color helper ─────────────────────────────────────
  FM._zoneColor = function (zoneId) {
    var z = FM.ZONES.find(function (x) { return x.id === zoneId })
    return z ? z.color : '#999'
  }

  FM._zonesForAngle = function (angleId) {
    // All zones available on all views
    return FM.ZONES
  }

  FM._viewProgress = function () {
    return FM.ANGLES.map(function (a) {
      var hasPhoto = !!FM._photoUrls[a.id]
      var count = FM._annotations.filter(function (ann) { return ann.angle === a.id }).length
      return { id: a.id, label: a.label, hasPhoto: hasPhoto, count: count, complete: hasPhoto && count > 0 }
    })
  }

  FM._allViewsComplete = function () {
    return FM._viewProgress().every(function (v) { return v.complete })
  }

  // ── Escape helper ─────────────────────────────────────────
  FM._esc = function (s) {
    var d = document.createElement('div')
    d.textContent = s || ''
    return d.innerHTML
  }

  FM._formatDate = function (d) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  FM._dateStr = function () {
    return new Date().toISOString().split('T')[0]
  }

  FM._svgCheck = function () {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
  }

  FM._propBar = function (label, pct) {
    var color = (pct >= 28 && pct <= 38) ? '#10B981' : (pct >= 24 && pct <= 42 ? '#F59E0B' : '#EF4444')
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="font-size:11px;font-weight:600;color:var(--text-primary);width:60px">' + label + '</span>' +
      '<div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">' +
        '<div style="width:' + Math.min(pct, 100) + '%;height:100%;background:' + color + ';border-radius:4px"></div>' +
      '</div>' +
      '<span style="font-size:12px;font-weight:700;color:' + color + ';min-width:36px;text-align:right">' + pct + '%</span>' +
    '</div>'
  }

  // Simple hash for dedup (fast, not cryptographic)
  FM._quickHash = function (b64) {
    var hash = 0
    for (var i = 0; i < b64.length; i += 100) {
      hash = ((hash << 5) - hash) + b64.charCodeAt(i)
      hash |= 0
    }
    return 'fh_' + Math.abs(hash).toString(36) + '_' + b64.length
  }

})()
