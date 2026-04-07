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
  FM._activeTab = 'zones'  // 'simetria' | 'zones' | 'vectors' | 'analysis'
  FM._viewMode = '1x'     // '1x' | '2x'
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
  FM._exportCanvas = null
  FM._landmarkData = null   // MediaPipe 468 landmarks
  FM._skinAnalysis = null   // OpenCV skin scores

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

  // ── Undo / Redo ────────────────────────────────────────────

  // Push current state to undo stack (call BEFORE making a change)
  FM._pushUndo = function () {
    FM._undoStack.push(JSON.stringify(FM._annotations))
    if (FM._undoStack.length > FM._MAX_UNDO) FM._undoStack.shift()
    FM._redoStack = [] // clear redo on new action
  }

  FM._undo = function () {
    if (FM._undoStack.length === 0) return
    // Save current to redo
    FM._redoStack.push(JSON.stringify(FM._annotations))
    // Restore previous
    FM._annotations = JSON.parse(FM._undoStack.pop())
    FM._selAnn = null
    FM._simPhotoUrl = null
    FM._redraw()
    FM._refreshToolbar()
    FM._autoSave()
  }

  FM._redo = function () {
    if (FM._redoStack.length === 0) return
    // Save current to undo
    FM._undoStack.push(JSON.stringify(FM._annotations))
    // Restore next
    FM._annotations = JSON.parse(FM._redoStack.pop())
    FM._selAnn = null
    FM._simPhotoUrl = null
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
