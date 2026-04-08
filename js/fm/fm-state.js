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
  // DEPOIS photos per angle — single source of truth
  FM._afterPhotoByAngle = {} // { front: url, '45': url, lateral: url }
  FM._simPhotoByAngle = {}   // { front: url, '45': url, lateral: url }

  // FM._afterPhotoUrl and FM._simPhotoUrl are now getters/setters
  // that read/write from the per-angle store. No separate variable.
  Object.defineProperty(FM, '_afterPhotoUrl', {
    get: function () { return FM._afterPhotoByAngle[FM._activeAngle || 'front'] || null },
    set: function (v) { FM._afterPhotoByAngle[FM._activeAngle || 'front'] = v },
    configurable: true,
  })
  Object.defineProperty(FM, '_simPhotoUrl', {
    get: function () { return FM._simPhotoByAngle[FM._activeAngle || 'front'] || null },
    set: function (v) { FM._simPhotoByAngle[FM._activeAngle || 'front'] = v },
    configurable: true,
  })

  FM._getAfterUrl = function () {
    return FM._afterPhotoUrl || null
  }

  // ── Per-Angle State Store — AUTOMATIC via getter/setter ──────
  // Every read/write of FM._metricLines etc. automatically routes
  // to the correct angle. Zero manual save/restore needed.
  FM._angleStore = {}  // { front: { metricLines: {...}, ... }, '45': {...}, lateral: {...} }

  // Helper: define a per-angle property with automatic routing
  function _defAngleProp(name, defaultVal) {
    Object.defineProperty(FM, name, {
      get: function () {
        var ang = FM._activeAngle || 'front'
        if (!FM._angleStore[ang]) FM._angleStore[ang] = {}
        if (FM._angleStore[ang][name] === undefined) {
          // Deep copy default to prevent shared references
          FM._angleStore[ang][name] = typeof defaultVal === 'object' && defaultVal !== null
            ? JSON.parse(JSON.stringify(defaultVal))
            : defaultVal
        }
        return FM._angleStore[ang][name]
      },
      set: function (v) {
        var ang = FM._activeAngle || 'front'
        if (!FM._angleStore[ang]) FM._angleStore[ang] = {}
        FM._angleStore[ang][name] = v
      },
      configurable: true,
    })
  }

  // Canvas 1 metrics
  _defAngleProp('_metricLines', { h: [], v: [] })
  _defAngleProp('_metricPoints', [])
  _defAngleProp('_metricMidline', null)
  _defAngleProp('_metricAngles', null)
  _defAngleProp('_metricNextPointId', 1)
  _defAngleProp('_metricNextLineId', 1)

  // Canvas 2 metrics (DEPOIS)
  _defAngleProp('_metric2Lines', { h: [], v: [] })
  _defAngleProp('_metric2Points', [])
  _defAngleProp('_metric2Midline', null)
  _defAngleProp('_metric2Angles', null)
  _defAngleProp('_metric2NextPointId', 1)
  _defAngleProp('_metric2NextLineId', 1)

  // Analysis state
  _defAngleProp('_tercoLines', { hairline: 0.05, brow: 0.33, noseBase: 0.62, chin: 0.95 })
  _defAngleProp('_rickettsPoints', { nose: { x: 0.35, y: 0.38 }, chin: { x: 0.40, y: 0.85 } })

  // Backward compat stubs (no-ops — save/restore is automatic now)
  FM._saveAngleState = function () {}
  FM._restoreAngleState = function () {}
  FM._stateByAngle = FM._angleStore  // alias for persistence
  FM._activeAngle = null
  FM._annotations = []   // [{ id, angle, zone, treatment, ml, product, shape:{x,y,rx,ry}, side }]
  FM._lastAnalysis = null  // GPT analysis result
  FM._editorMode = 'zones' // 'zones' | 'vectors' | 'analysis'
  FM._activeTab = 'zones'  // 'simetria' | 'zones' | 'vectors' | 'analysis'
  FM._viewMode = '1x'     // '1x' | '2x'
  FM._vectors = []       // [{ id, zone, start:{x,y}, end:{x,y}, curve:0.3 }]
  FM._nextVecId = 1
  FM._selVec = null      // selected vector for dragging
  FM._vecDragPart = null // 'end' | 'start' | 'curve'

  // Analysis state (_tercoLines and _rickettsPoints are per-angle getter/setters above)
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
  FM._exportCanvas = null
  FM._landmarkData = null   // MediaPipe 468 landmarks
  FM._skinAnalysis = null   // OpenCV skin scores

  // ── Region Overlay State ──────────────────────────────────
  // { regionId: { active, intensity(0-100), treatment, ml, product, side } }
  FM._regionState = {}
  FM._hoveredRegion = null   // region under cursor
  FM._selectedRegion = null  // clicked region for editing
  FM._regionPaths = {}       // cached computed paths per region (recalc on scan)
  FM._regionAnimFrame = null // hover animation
  FM._showRegionLabels = true  // toggle labels on/off
  FM._scanEnabled = false      // scanner OFF by default — user activates manually
  FM._scanDataByAngle = {}     // cached scan results per angle
  FM._canvas2InitTimer = null  // debounce timer for _initCanvas2

  // ── Granular Lock System ──────────────────────────────────
  // Key: "tab_canvas_angle" (e.g. "simetria_1x_front", "zones_2x_45")
  FM._locks = {}

  FM._lockKey = function (tab, canvas, angle) {
    return (tab || FM._activeTab) + '_' + (canvas || '1x') + '_' + (angle || FM._activeAngle || 'front')
  }

  FM._isLocked = function (tab, canvas, angle) {
    return !!FM._locks[FM._lockKey(tab, canvas, angle)]
  }

  FM._toggleLock = function (tab, canvas, angle) {
    var key = FM._lockKey(tab, canvas, angle)
    FM._locks[key] = !FM._locks[key]
    FM._render()
    setTimeout(FM._initCanvas, 50)
    if (FM._viewMode === '2x') setTimeout(FM._initCanvas2, 100)
  }

  // Backward-compat getters (used in many places)
  Object.defineProperty(FM, '_metricLocked', {
    get: function () { return FM._isLocked('simetria', '1x') },
    set: function (v) { FM._locks[FM._lockKey('simetria', '1x')] = v },
  })
  Object.defineProperty(FM, '_metric2Locked', {
    get: function () { return FM._isLocked('simetria', '2x') },
    set: function (v) { FM._locks[FM._lockKey('simetria', '2x')] = v },
  })
  Object.defineProperty(FM, '_regionLocked', {
    get: function () { return FM._isLocked('zones', '1x') },
    set: function (v) { FM._locks[FM._lockKey('zones', '1x')] = v },
  })

  // Canvas2 metric state — per-angle getter/setters defined above
  FM._metric2Drag = null
  FM._activeCanvas = 1  // 1 = ANTES, 2 = DEPOIS

  // Undo/Redo history (snapshots of annotations)
  FM._undoStack = []
  FM._redoStack = []
  FM._MAX_UNDO = 30

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

  // ── Undo / Redo (universal — all modes) ─────────────────────

  // Snapshot all mutable state across every mode
  FM._snapshotState = function () {
    return JSON.stringify({
      annotations: FM._annotations,
      vectors: FM._vectors,
      nextVecId: FM._nextVecId,
      metricLines: FM._metricLines,
      metricPoints: FM._metricPoints,
      metricMidline: FM._metricMidline,
      metricAngles: FM._metricAngles,
      metricNextPointId: FM._metricNextPointId,
      metricNextLineId: FM._metricNextLineId,
      tercoLines: FM._tercoLines,
      rickettsPoints: FM._rickettsPoints,
      regionState: FM._regionState,
    })
  }

  FM._restoreSnapshot = function (json) {
    var s = JSON.parse(json)
    FM._annotations = s.annotations || []
    FM._vectors = s.vectors || []
    FM._nextVecId = s.nextVecId || 1
    FM._metricLines = s.metricLines || { h: [], v: [] }
    FM._metricPoints = s.metricPoints || []
    FM._metricMidline = s.metricMidline || null
    FM._metricAngles = s.metricAngles || null
    FM._metricNextPointId = s.metricNextPointId || 1
    FM._metricNextLineId = s.metricNextLineId || 1
    FM._tercoLines = s.tercoLines || { hairline: 0.05, brow: 0.33, noseBase: 0.62, chin: 0.95 }
    FM._rickettsPoints = s.rickettsPoints || { nose: { x: 0.35, y: 0.38 }, chin: { x: 0.40, y: 0.85 } }
    FM._regionState = s.regionState || {}
  }

  // Push current state to undo stack (call BEFORE making a change)
  FM._pushUndo = function () {
    FM._undoStack.push(FM._snapshotState())
    if (FM._undoStack.length > FM._MAX_UNDO) FM._undoStack.shift()
    FM._redoStack = [] // clear redo on new action
  }

  FM._undo = function () {
    if (FM._undoStack.length === 0) return
    FM._redoStack.push(FM._snapshotState())
    FM._restoreSnapshot(FM._undoStack.pop())
    FM._selAnn = null
    FM._selVec = null
    FM._simPhotoUrl = null
    FM._metricDrag = null
    FM._analysisDrag = null
    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
  }

  FM._redo = function () {
    if (FM._redoStack.length === 0) return
    FM._undoStack.push(FM._snapshotState())
    FM._restoreSnapshot(FM._redoStack.pop())
    FM._selAnn = null
    FM._selVec = null
    FM._simPhotoUrl = null
    FM._metricDrag = null
    FM._analysisDrag = null
    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
  }

  // Loading overlay
  FM._showLoading = function (msg) {
    FM._hideLoading()
    var el = document.createElement('div')
    el.id = 'fmLoading'
    el.className = 'fm-loading'
    el.innerHTML = '<div class="fm-loading-spinner"></div><div class="fm-loading-text">' + (msg || 'Processando...') + '</div>'
    document.body.appendChild(el)
  }

  FM._hideLoading = function () {
    var el = document.getElementById('fmLoading')
    if (el) el.remove()
  }

  // Toast notification (temporary, top-right)
  FM._showToast = function (msg, type) {
    var existing = document.getElementById('fmToast')
    if (existing) existing.remove()

    var colors = {
      error: { bg: '#991B1B', border: '#EF4444' },
      success: { bg: '#065F46', border: '#10B981' },
      warn: { bg: '#78350F', border: '#F59E0B' },
    }
    var c = colors[type] || colors.warn

    var el = document.createElement('div')
    el.id = 'fmToast'
    el.style.cssText = 'position:fixed;top:80px;right:20px;z-index:99999;padding:12px 18px;border-radius:10px;' +
      'background:' + c.bg + ';border:1px solid ' + c.border + ';color:#F5F0E8;font-size:13px;font-weight:500;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.3);max-width:360px;animation:fmFadeIn .2s ease'
    el.textContent = msg
    document.body.appendChild(el)
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(function () { el.remove() }, 300) }, 4000)
  }

  // Cleanup old sessions from localStorage (keep last 5, delete >7 days)
  FM._cleanupStorage = function () {
    try {
      var keys = []
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i)
        if (k && k.startsWith('fm_session_')) keys.push(k)
      }
      if (keys.length <= 5) return // nothing to clean

      // Parse and sort by savedAt
      var sessions = keys.map(function (k) {
        try {
          var d = JSON.parse(localStorage.getItem(k))
          return { key: k, savedAt: d.savedAt || '2000-01-01' }
        } catch (e) { return { key: k, savedAt: '2000-01-01' } }
      }).sort(function (a, b) { return b.savedAt.localeCompare(a.savedAt) })

      // Keep 5 most recent, delete the rest
      var sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      sessions.forEach(function (s, idx) {
        if (idx >= 5 || s.savedAt < sevenDaysAgo) {
          localStorage.removeItem(s.key)
        }
      })

      // Also estimate total size and warn if >4MB
      var totalSize = 0
      for (var j = 0; j < localStorage.length; j++) {
        var key = localStorage.key(j)
        if (key && key.startsWith('fm_')) {
          totalSize += (localStorage.getItem(key) || '').length
        }
      }
      if (totalSize > 4000000) {
        console.warn('[FaceMapping] localStorage usage high:', Math.round(totalSize / 1024) + 'KB')
      }
    } catch (e) { /* silent */ }
  }

})()
