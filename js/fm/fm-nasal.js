/**
 * fm-nasal.js — Nasal Angular Analysis (self-contained module)
 *
 * Namespace: FM.Nasal
 * Tab: 'nasal'
 * Storage: localStorage key "fm_nasal_{leadId}" — ISOLATED from angleStore
 * Photo: OWN uploads (antes / depois), independent from FM._photoUrls
 * Modes: 1x (só ANTES) | 2x (ANTES + DEPOIS side-by-side with delta)
 */
;(function () {
  'use strict'

  var FM = window._FM
  if (!FM) return

  var Nasal = {}

  // ── Point definitions ────────────────────────────────────────
  var POINT_DEFS = [
    { id: 'glabella', label: 'Glabela',          desc: 'Testa mais anterior entre sobrancelhas',   defX: 0.62, defY: 0.22 },
    { id: 'radix',    label: 'Nasion (Radix)',   desc: 'Ponto mais profundo da raiz nasal',        defX: 0.60, defY: 0.30 },
    { id: 'tip',      label: 'Ponta (Pronasal)', desc: 'Ponto mais anterior da ponta do nariz',    defX: 0.46, defY: 0.48 },
    { id: 'subnasal', label: 'Subnasal',         desc: 'Junção entre columela e labio superior',   defX: 0.55, defY: 0.58 },
    { id: 'lipUpper', label: 'Labio Superior',   desc: 'Ponto mais anterior do labio superior',    defX: 0.56, defY: 0.63 },
    { id: 'pogonion', label: 'Pogonio',          desc: 'Ponto mais anterior do mento',             defX: 0.58, defY: 0.88 },
  ]

  var IDEAL = {
    F: { nasofrontal: [120, 130], nasolabial: [100, 110], nasofacial: [30, 35] },
    M: { nasofrontal: [115, 125], nasolabial: [90, 95],   nasofacial: [36, 40] },
  }

  var SLOTS = ['antes', 'depois']
  var SLOT_LABEL = { antes: 'ANTES', depois: 'DEPOIS' }
  var SLOT_ACCENT = { antes: '#EF4444', depois: '#10B981' }

  // ── ISOLATED STATE ───────────────────────────────────────────
  var _state = null

  function _newSlot() {
    return { photoB64: null, photoUrl: null, img: null, points: null, imgW: 0, imgH: 0 }
  }

  function _newState(leadId) {
    return {
      leadId: leadId,
      gender: 'F',
      antes: _newSlot(),
      depois: _newSlot(),
    }
  }

  function _currentLeadId() {
    if (!FM._lead) return 'anon'
    return FM._lead.id || FM._lead.lead_id || 'anon'
  }

  function _storageKey(id) { return 'fm_nasal_' + id }

  function _loadFromStorage(leadId) {
    try {
      var raw = localStorage.getItem(_storageKey(leadId))
      if (!raw) return null
      return JSON.parse(raw)
    } catch (e) { return null }
  }

  function _saveToStorage() {
    if (!_state) return
    try {
      var payload = {
        gender: _state.gender,
        antes:  { points: _state.antes.points,  photoB64: _state.antes.photoB64 },
        depois: { points: _state.depois.points, photoB64: _state.depois.photoB64 },
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem(_storageKey(_state.leadId), JSON.stringify(payload))
    } catch (e) { /* silent */ }
  }

  function _ensureLoaded() {
    var leadId = _currentLeadId()
    if (_state && _state.leadId === leadId) return
    // revoke old objectURLs
    if (_state) {
      SLOTS.forEach(function (k) {
        var s = _state[k]
        if (s && s.photoUrl && s.photoUrl.indexOf('blob:') === 0) {
          try { URL.revokeObjectURL(s.photoUrl) } catch (e) {}
        }
      })
    }
    _state = _newState(leadId)

    var saved = _loadFromStorage(leadId)
    if (saved) {
      _state.gender = saved.gender || 'F'
      // Migrate old flat format → antes slot
      if (saved.photoB64 && !saved.antes) {
        _state.antes.photoB64 = saved.photoB64
        _state.antes.photoUrl = saved.photoB64
        _state.antes.points = saved.points || null
      } else {
        SLOTS.forEach(function (k) {
          if (saved[k]) {
            _state[k].photoB64 = saved[k].photoB64 || null
            _state[k].photoUrl = saved[k].photoB64 || null
            _state[k].points = saved[k].points || null
          }
        })
      }
    }
  }

  function _seedIfEmpty(slotKey) {
    var s = _state[slotKey]
    if (s.points && Object.keys(s.points).length === 6) return
    s.points = {}
    POINT_DEFS.forEach(function (p) { s.points[p.id] = { x: p.defX, y: p.defY } })
  }

  // ── Public API ───────────────────────────────────────────────
  Nasal.init = function () {
    _ensureLoaded()
    // Seed points on whichever slot has a photo (or antes by default)
    SLOTS.forEach(function (k) {
      if (_state[k].photoUrl && !(_state[k].points && Object.keys(_state[k].points).length === 6)) {
        _seedIfEmpty(k)
      }
    })
    if (!_state.antes.points) _seedIfEmpty('antes')
  }

  Nasal.hasPhoto = function (slot) {
    _ensureLoaded()
    slot = slot || 'antes'
    return !!(_state[slot] && _state[slot].photoUrl)
  }

  Nasal.hasData = function (slot) {
    _ensureLoaded()
    slot = slot || 'antes'
    var s = _state[slot]
    return !!(s && s.photoUrl && s.points && Object.keys(s.points).length === 6)
  }

  Nasal.getGender = function () { _ensureLoaded(); return _state.gender }

  Nasal.setGender = function (g) {
    _ensureLoaded()
    _state.gender = (g === 'M') ? 'M' : 'F'
    _saveToStorage()
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  Nasal.reset = function (slot) {
    _ensureLoaded()
    slot = slot || 'antes'
    _state[slot].points = null
    _seedIfEmpty(slot)
    _saveToStorage()
    FM._redraw()
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  Nasal.triggerUpload = function (slot) {
    slot = slot || 'antes'
    var input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = function (e) {
      var f = e.target.files && e.target.files[0]
      if (!f) return
      var reader = new FileReader()
      reader.onload = function (ev) {
        _ensureLoaded()
        var s = _state[slot]
        if (s.photoUrl && s.photoUrl.indexOf('blob:') === 0) {
          try { URL.revokeObjectURL(s.photoUrl) } catch (err) {}
        }
        s.photoB64 = ev.target.result
        s.photoUrl = ev.target.result
        s.img = null
        _seedIfEmpty(slot)
        _saveToStorage()
        FM._render()
        setTimeout(FM._initCanvas, 50)
      }
      reader.readAsDataURL(f)
    }
    input.click()
  }

  Nasal.deletePhoto = function (slot) {
    slot = slot || 'antes'
    var label = SLOT_LABEL[slot] || slot
    if (!confirm('Remover a foto ' + label + ' da analise nasal?')) return
    _ensureLoaded()
    var s = _state[slot]
    if (s.photoUrl && s.photoUrl.indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(s.photoUrl) } catch (e) {}
    }
    s.photoUrl = null
    s.photoB64 = null
    s.img = null
    s.points = null
    _saveToStorage()
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  // ── Angle computation (per slot) ─────────────────────────────
  Nasal.compute = function (slot) {
    _ensureLoaded()
    slot = slot || 'antes'
    var s = _state[slot]
    if (!s || !s.points) return null
    var p = s.points
    if (!p.glabella || !p.radix || !p.tip || !p.subnasal || !p.lipUpper || !p.pogonion) return null

    var nasofrontal = _angleAt(p.radix, p.glabella, p.tip)
    var nasolabial  = _angleAt(p.subnasal, p.tip, p.lipUpper)
    var nasofacial  = _angleBetween(_vec(p.glabella, p.pogonion), _vec(p.glabella, p.tip))

    return {
      nasofrontal: Math.round(nasofrontal * 10) / 10,
      nasolabial:  Math.round(nasolabial * 10) / 10,
      nasofacial:  Math.round(nasofacial * 10) / 10,
    }
  }

  // ── Canvas render (per slot) ─────────────────────────────────
  function _renderSlotCanvas(ctx, slot, w, h) {
    var s = _state[slot]
    if (!s || !s.points) return
    var p = s.points
    var gender = _state.gender
    var ideal = IDEAL[gender]
    var a = Nasal.compute(slot)

    ctx.save()

    _drawLine(ctx, p.glabella, p.pogonion, w, h, 'rgba(100,160,255,0.55)', 1.2, [5, 4])
    _drawLine(ctx, p.glabella, p.radix,    w, h, 'rgba(200,169,126,0.45)', 1)
    _drawLine(ctx, p.radix,    p.tip,      w, h, 'rgba(200,169,126,0.85)', 1.5)
    _drawLine(ctx, p.tip,      p.subnasal, w, h, 'rgba(200,169,126,0.85)', 1.5)
    _drawLine(ctx, p.subnasal, p.lipUpper, w, h, 'rgba(200,169,126,0.85)', 1.5)

    if (a) {
      _drawAngleArc(ctx, p.glabella, p.pogonion, p.tip,      w, h, 80, _statusColor(a.nasofacial,  ideal.nasofacial),  a.nasofacial.toFixed(0)  + '\u00B0', 'Nasofacial')
      _drawAngleArc(ctx, p.radix,    p.glabella, p.tip,      w, h, 64, _statusColor(a.nasofrontal, ideal.nasofrontal), a.nasofrontal.toFixed(0) + '\u00B0', 'Nasofrontal')
      _drawAngleArc(ctx, p.subnasal, p.tip,      p.lipUpper, w, h, 54, _statusColor(a.nasolabial,  ideal.nasolabial),  a.nasolabial.toFixed(0)  + '\u00B0', 'Nasolabial')
    }

    POINT_DEFS.forEach(function (def) {
      var pt = p[def.id]
      if (!pt) return
      var active = (Nasal._hoverPoint && Nasal._hoverPoint.slot === slot && Nasal._hoverPoint.id === def.id) ||
                   (Nasal._dragPoint  && Nasal._dragPoint.slot === slot  && Nasal._dragPoint.id === def.id)
      _drawPoint(ctx, pt.x * w, pt.y * h, active, def.label)
    })

    ctx.restore()
  }

  // Called for canvas 1 (antes) from _redraw
  Nasal.render = function (ctx) {
    if (!ctx) return
    if (FM._activeTab !== 'nasal') return
    _ensureLoaded()
    if (!_state.antes.photoUrl) return
    _renderSlotCanvas(ctx, 'antes', FM._imgW, FM._imgH)
  }

  // Called for canvas 2 (depois) from _redraw2
  Nasal.render2 = function (ctx) {
    if (!ctx) return
    if (FM._activeTab !== 'nasal') return
    _ensureLoaded()
    if (!_state.depois.photoUrl) return
    _renderSlotCanvas(ctx, 'depois', _state.depois.imgW, _state.depois.imgH)
  }

  // ── Mouse handling (per slot via target canvas) ──────────────
  Nasal._dragPoint = null   // { slot, id }
  Nasal._hoverPoint = null  // { slot, id }

  function _hitTestSlot(slot, mx, my, w, h) {
    var pts = _state[slot] && _state[slot].points
    if (!pts || !w) return null
    var threshold = 14, closest = null, bestDist = threshold
    Object.keys(pts).forEach(function (id) {
      var pt = pts[id]
      var d = Math.sqrt(Math.pow(mx - pt.x * w, 2) + Math.pow(my - pt.y * h, 2))
      if (d < bestDist) { bestDist = d; closest = id }
    })
    return closest
  }

  function _detectTargetSlot(canvasEl) {
    if (!canvasEl) return null
    if (canvasEl.id === 'fmNasalCanvas2') return 'depois'
    return 'antes'
  }

  function _slotDims(slot) {
    if (slot === 'antes') return { w: FM._imgW, h: FM._imgH }
    var s = _state.depois
    return { w: s.imgW, h: s.imgH }
  }

  Nasal.onMouseDown = function (mx, my, canvasEl) {
    if (FM._activeTab !== 'nasal') return false
    _ensureLoaded()
    var slot = _detectTargetSlot(canvasEl)
    if (!slot || !_state[slot].photoUrl) return false
    _seedIfEmpty(slot)
    var dims = _slotDims(slot)
    var hit = _hitTestSlot(slot, mx, my, dims.w, dims.h)
    if (hit) {
      Nasal._dragPoint = { slot: slot, id: hit }
      if (canvasEl) canvasEl.style.cursor = 'grabbing'
      return true
    }
    return false
  }

  Nasal.onMouseMove = function (mx, my, canvasEl) {
    if (FM._activeTab !== 'nasal') return false
    _ensureLoaded()
    var slot = _detectTargetSlot(canvasEl)
    if (!slot || !_state[slot].photoUrl) return false
    var dims = _slotDims(slot)

    if (Nasal._dragPoint && Nasal._dragPoint.slot === slot) {
      _state[slot].points[Nasal._dragPoint.id].x = Math.max(0, Math.min(1, mx / dims.w))
      _state[slot].points[Nasal._dragPoint.id].y = Math.max(0, Math.min(1, my / dims.h))
      _redrawAll()
      _refreshPanelValues()
      _saveToStorage()
      return true
    }

    var hit = _hitTestSlot(slot, mx, my, dims.w, dims.h)
    var next = hit ? { slot: slot, id: hit } : null
    var changed = (next && !Nasal._hoverPoint) ||
                  (!next && Nasal._hoverPoint) ||
                  (next && Nasal._hoverPoint && (next.slot !== Nasal._hoverPoint.slot || next.id !== Nasal._hoverPoint.id))
    if (changed) {
      Nasal._hoverPoint = next
      if (canvasEl) canvasEl.style.cursor = hit ? 'grab' : 'crosshair'
      _redrawAll()
    }
    return !!hit
  }

  Nasal.onMouseUp = function (canvasEl) {
    if (Nasal._dragPoint) {
      Nasal._dragPoint = null
      if (canvasEl) canvasEl.style.cursor = 'crosshair'
      _refreshPanelValues()
      return true
    }
    return false
  }

  function _redrawAll() {
    FM._redraw()
    _redrawCanvas2()
  }

  function _redrawCanvas2() {
    var c2 = document.getElementById('fmNasalCanvas2')
    if (!c2 || !_state.depois.img) return
    var ctx2 = c2.getContext('2d')
    ctx2.fillStyle = '#000000'
    ctx2.fillRect(0, 0, c2.width, c2.height)
    ctx2.drawImage(_state.depois.img, 0, 0, _state.depois.imgW, _state.depois.imgH)
    Nasal.render2(ctx2)
  }

  // ── Canvas area (replaces fm canvas area when tab=nasal) ─────
  Nasal.renderCanvasArea = function () {
    _ensureLoaded()
    var is2x = FM._viewMode === '2x'
    if (!is2x) return _renderSingleCanvas()
    return _renderDualCanvas()
  }

  function _renderSingleCanvas() {
    if (!_state.antes.photoUrl) return _emptySlotArea('antes', true)
    return '<div class="fm-canvas-area" id="fmCanvasArea" style="display:flex;flex-direction:column;background:#0A0A0A;border-radius:8px;overflow:hidden;position:relative">' +
      _slotHeader('antes') +
      '<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">' +
        '<canvas id="fmCanvas" style="max-width:100%;max-height:100%;cursor:crosshair"></canvas>' +
      '</div>' +
    '</div>'
  }

  function _renderDualCanvas() {
    return '<div class="fm-canvas-area" id="fmCanvasArea" style="display:flex;flex-direction:row;gap:4px;flex:1;overflow:hidden">' +
      _slotPane('antes') +
      _slotPane('depois') +
    '</div>'
  }

  function _slotPane(slot) {
    var has = !!_state[slot].photoUrl
    var canvasId = slot === 'antes' ? 'fmCanvas' : 'fmNasalCanvas2'
    var accent = SLOT_ACCENT[slot]
    var label = SLOT_LABEL[slot]
    if (!has) {
      return '<div style="flex:1;display:flex;flex-direction:column;background:#0A0A0A;border-radius:8px;overflow:hidden;position:relative">' +
        '<div style="padding:6px 14px;background:' + _withAlpha(accent, 0.1) + ';display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:' + accent + ';letter-spacing:0.1em">' + label + '</span>' +
        '</div>' +
        '<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px">' +
          '<div style="text-align:center">' +
            '<div style="font-family:Cormorant Garamond,serif;font-size:16px;font-style:italic;color:rgba(245,240,232,0.5);margin-bottom:12px">Sem foto ' + label.toLowerCase() + '</div>' +
            '<button onclick="FaceMapping._uploadNasalPhoto(\'' + slot + '\')" style="padding:10px 20px;border:none;border-radius:6px;background:' + accent + ';color:#fff;font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer">Carregar ' + label + '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    }
    return '<div style="flex:1;display:flex;flex-direction:column;background:#0A0A0A;border-radius:8px;overflow:hidden;position:relative">' +
      '<div style="padding:6px 14px;background:' + _withAlpha(accent, 0.12) + ';display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:' + accent + ';letter-spacing:0.1em">' + label + '</span>' +
        '<div style="display:flex;gap:4px">' +
          '<button class="fm-btn" onclick="FaceMapping._uploadNasalPhoto(\'' + slot + '\')" title="Substituir" style="font-size:9px;padding:3px 8px">Trocar</button>' +
          '<button class="fm-btn" onclick="FaceMapping._deleteNasalPhoto(\'' + slot + '\')" title="Remover" style="font-size:9px;padding:3px 8px;border-color:#EF4444;color:#EF4444">\u00D7</button>' +
        '</div>' +
      '</div>' +
      '<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">' +
        '<canvas id="' + canvasId + '" style="max-width:100%;max-height:100%;cursor:crosshair"></canvas>' +
      '</div>' +
    '</div>'
  }

  function _slotHeader(slot) {
    var accent = SLOT_ACCENT[slot]
    var label = SLOT_LABEL[slot]
    return '<div style="padding:6px 14px;background:' + _withAlpha(accent, 0.12) + ';display:flex;justify-content:space-between;align-items:center">' +
      '<span style="font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:' + accent + ';letter-spacing:0.1em">' + label + ' \u2014 PERFIL</span>' +
      '<div style="display:flex;gap:4px">' +
        '<button class="fm-btn" onclick="FaceMapping._uploadNasalPhoto(\'' + slot + '\')" title="Substituir" style="font-size:9px;padding:3px 8px">Trocar</button>' +
        '<button class="fm-btn" onclick="FaceMapping._deleteNasalPhoto(\'' + slot + '\')" title="Remover" style="font-size:9px;padding:3px 8px;border-color:#EF4444;color:#EF4444">\u00D7</button>' +
      '</div>' +
    '</div>'
  }

  function _emptySlotArea(slot, isOnly) {
    var accent = SLOT_ACCENT[slot]
    var label = SLOT_LABEL[slot]
    return '<div class="fm-canvas-area" id="fmCanvasArea" style="display:flex;align-items:center;justify-content:center;background:#0A0A0A;border-radius:8px">' +
      '<div style="text-align:center;max-width:420px;padding:40px 20px">' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:24px;font-style:italic;color:#C8A97E;margin-bottom:8px">Analise Angular do Nariz</div>' +
        '<div style="font-size:13px;color:rgba(245,240,232,0.6);line-height:1.6;margin-bottom:24px">' +
          (isOnly
            ? 'Esta analise usa uma foto lateral dedicada, independente das outras abas.'
            : 'Carregue a foto ' + label.toLowerCase() + '.') +
        '</div>' +
        '<button onclick="FaceMapping._uploadNasalPhoto(\'' + slot + '\')" style="padding:14px 28px;border:none;border-radius:8px;background:' + accent + ';color:#fff;font-family:Montserrat,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer">Carregar Foto ' + label + '</button>' +
        '<div style="margin-top:16px;font-size:10px;color:rgba(200,169,126,0.4);letter-spacing:0.04em">Idealmente vista de perfil 90\u00B0</div>' +
      '</div>' +
    '</div>'
  }

  // ── Canvas init ──────────────────────────────────────────────
  Nasal.initCanvas = function () {
    _ensureLoaded()
    _initSlotCanvas('antes', 'fmCanvas')
    if (FM._viewMode === '2x') {
      _initSlotCanvas('depois', 'fmNasalCanvas2')
    }
  }

  function _initSlotCanvas(slot, canvasId) {
    var s = _state[slot]
    if (!s.photoUrl) return
    var canvas = document.getElementById(canvasId)
    if (!canvas) return

    var onReady = function () {
      var area = document.getElementById('fmCanvasArea')
      var paneW, paneH
      if (FM._viewMode === '2x') {
        paneW = area ? (area.clientWidth / 2 - 8) : 400
        paneH = area ? area.clientHeight - 30 : 600
      } else {
        paneW = area ? area.clientWidth - 8 : 800
        paneH = area ? area.clientHeight - 30 : 600
      }
      var scale = Math.min((paneW - 8) / s.img.width, paneH / s.img.height)
      s.imgW = Math.round(s.img.width * scale)
      s.imgH = Math.round(s.img.height * scale)
      canvas.width = s.imgW + 32
      canvas.height = s.imgH

      if (slot === 'antes') {
        FM._img = s.img
        FM._imgW = s.imgW
        FM._imgH = s.imgH
        FM._canvas = canvas
        FM._ctx = canvas.getContext('2d')
        FM._redraw()
      } else {
        _redrawCanvas2()
      }
    }

    if (s.img && s.img.complete && s.img.naturalWidth > 0) {
      onReady()
    } else {
      s.img = new Image()
      s.img.onload = onReady
      s.img.src = s.photoUrl
    }

    canvas.addEventListener('mousedown', function (e) { FM._onMouseDown(_withTarget(e, canvas)) })
    canvas.addEventListener('mousemove', function (e) { FM._onMouseMove(_withTarget(e, canvas)) })
    canvas.addEventListener('mouseup',   function ()  { FM._onMouseUp() })
  }

  function _withTarget(e, canvas) {
    return { offsetX: e.offsetX, offsetY: e.offsetY, _canvas: canvas }
  }

  // ── Panel ────────────────────────────────────────────────────
  Nasal.renderPanel = function () {
    _ensureLoaded()
    SLOTS.forEach(function (k) { if (_state[k].photoUrl) _seedIfEmpty(k) })

    var gender = _state.gender
    var ideal = IDEAL[gender]
    var is2x = FM._viewMode === '2x'
    var aAntes  = _state.antes.photoUrl  ? (Nasal.compute('antes')  || {}) : {}
    var aDepois = _state.depois.photoUrl ? (Nasal.compute('depois') || {}) : {}

    var html = '<div class="fm-toolbar">'

    html += '<div class="fm-tool-section" style="padding-bottom:8px">' +
      '<div class="fm-tool-section-title">Analise Angular do Nariz</div>' +
      '<div style="font-size:10px;color:rgba(200,169,126,0.5);line-height:1.5;margin-top:4px">' +
        (is2x ? 'Modo 2x: ANTES + DEPOIS. Cada foto tem 6 pontos editaveis independentes.'
              : 'Arraste os 6 pontos sobre a foto. Ative 2x no topo para comparar ANTES x DEPOIS.') +
      '</div>' +
    '</div>'

    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Genero de referencia</div>' +
      '<div style="display:flex;gap:3px">' +
        '<button class="fm-zone-btn' + (gender === 'F' ? ' active' : '') + '" onclick="FaceMapping._setNasalGender(\'F\')" style="flex:1;justify-content:center">Feminino</button>' +
        '<button class="fm-zone-btn' + (gender === 'M' ? ' active' : '') + '" onclick="FaceMapping._setNasalGender(\'M\')" style="flex:1;justify-content:center">Masculino</button>' +
      '</div>' +
    '</div>'

    html += '<div id="fmNasalMetrics" class="fm-tool-section">' +
      _renderMetricsBlock(is2x, aAntes, aDepois, ideal) +
    '</div>'

    html += '<div class="fm-tool-section" style="display:flex;flex-direction:column;gap:4px">' +
      (_state.antes.photoUrl ? '<button class="fm-btn" style="width:100%" onclick="FaceMapping._resetNasal(\'antes\')">Reposicionar pontos ANTES</button>' : '') +
      (is2x && _state.depois.photoUrl ? '<button class="fm-btn" style="width:100%" onclick="FaceMapping._resetNasal(\'depois\')">Reposicionar pontos DEPOIS</button>' : '') +
    '</div>'

    html += '<div class="fm-tool-section" style="font-size:10px;color:rgba(200,169,126,0.55);line-height:1.55">' +
      '<div class="fm-tool-section-title">Pontos</div>' +
      POINT_DEFS.map(function (pt) {
        return '<div style="margin-bottom:4px"><strong style="color:#C8A97E">' + pt.label + ':</strong> ' + pt.desc + '</div>'
      }).join('') +
    '</div>'

    html += '</div>'
    return html
  }

  function _renderMetricsBlock(is2x, aAntes, aDepois, ideal) {
    if (!is2x) {
      return '<div class="fm-tool-section-title">Angulos</div>' +
        _metricRow1x('Nasofrontal', aAntes.nasofrontal, ideal.nasofrontal) +
        _metricRow1x('Nasolabial',  aAntes.nasolabial,  ideal.nasolabial) +
        _metricRow1x('Nasofacial',  aAntes.nasofacial,  ideal.nasofacial)
    }
    return '<div class="fm-tool-section-title">Angulos \u2014 Antes / Depois</div>' +
      _metricRow2x('Nasofrontal', aAntes.nasofrontal, aDepois.nasofrontal, ideal.nasofrontal) +
      _metricRow2x('Nasolabial',  aAntes.nasolabial,  aDepois.nasolabial,  ideal.nasolabial) +
      _metricRow2x('Nasofacial',  aAntes.nasofacial,  aDepois.nasofacial,  ideal.nasofacial)
  }

  function _metricRow1x(label, val, range) {
    if (val == null) return '<div style="font-size:11px;color:rgba(200,169,126,0.4);margin-bottom:10px">' + label + ': —</div>'
    var color = _statusColor(val, range)
    var status = (val >= range[0] && val <= range[1]) ? 'Ideal' : (val < range[0] ? 'Abaixo' : 'Acima')
    return '<div style="margin-bottom:12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">' +
        '<span style="font-size:10px;color:rgba(245,240,232,0.7);letter-spacing:0.03em">' + label + '</span>' +
        '<span style="font-size:16px;font-weight:700;color:' + color + ';font-family:Montserrat,sans-serif">' + val + '\u00B0</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:9px;color:rgba(200,169,126,0.4)">' +
        '<span>Ideal: ' + range[0] + '\u2013' + range[1] + '\u00B0</span>' +
        '<span style="color:' + color + ';font-weight:600">' + status + '</span>' +
      '</div>' +
    '</div>'
  }

  function _metricRow2x(label, a, d, range) {
    var cA = a != null ? _statusColor(a, range) : 'rgba(200,169,126,0.3)'
    var cD = d != null ? _statusColor(d, range) : 'rgba(200,169,126,0.3)'
    var delta = (a != null && d != null) ? (d - a) : null
    var deltaStr = delta != null ? ((delta > 0 ? '+' : '') + (Math.round(delta * 10) / 10) + '\u00B0') : '—'
    var deltaColor = delta == null ? 'rgba(200,169,126,0.4)' : (Math.abs(delta) < 1 ? 'rgba(200,169,126,0.5)' : (delta > 0 ? '#10B981' : '#F59E0B'))
    return '<div style="margin-bottom:14px;padding:8px 10px;background:rgba(200,169,126,0.04);border-radius:6px">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
        '<span style="font-size:10px;color:rgba(245,240,232,0.7);letter-spacing:0.03em;font-weight:600">' + label + '</span>' +
        '<span style="font-size:9px;color:rgba(200,169,126,0.45)">Ideal: ' + range[0] + '\u2013' + range[1] + '\u00B0</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:baseline">' +
        '<div style="flex:1">' +
          '<div style="font-size:8px;color:' + SLOT_ACCENT.antes + ';font-weight:700;letter-spacing:0.1em">ANTES</div>' +
          '<div style="font-size:15px;font-weight:700;color:' + cA + ';font-family:Montserrat,sans-serif">' + (a != null ? a + '\u00B0' : '—') + '</div>' +
        '</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:8px;color:' + SLOT_ACCENT.depois + ';font-weight:700;letter-spacing:0.1em">DEPOIS</div>' +
          '<div style="font-size:15px;font-weight:700;color:' + cD + ';font-family:Montserrat,sans-serif">' + (d != null ? d + '\u00B0' : '—') + '</div>' +
        '</div>' +
        '<div style="flex:1;text-align:right">' +
          '<div style="font-size:8px;color:rgba(200,169,126,0.6);font-weight:700;letter-spacing:0.1em">DELTA</div>' +
          '<div style="font-size:15px;font-weight:700;color:' + deltaColor + ';font-family:Montserrat,sans-serif">' + deltaStr + '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  }

  function _refreshPanelValues() {
    var el = document.getElementById('fmNasalMetrics')
    if (!el) return
    var is2x = FM._viewMode === '2x'
    var aAntes  = _state.antes.photoUrl  ? (Nasal.compute('antes')  || {}) : {}
    var aDepois = _state.depois.photoUrl ? (Nasal.compute('depois') || {}) : {}
    var ideal = IDEAL[Nasal.getGender()]
    el.innerHTML = _renderMetricsBlock(is2x, aAntes, aDepois, ideal)
  }

  // ── Report section ───────────────────────────────────────────
  Nasal.getReportData = function () {
    _ensureLoaded()
    if (!Nasal.hasData('antes')) return null
    var aAntes = Nasal.compute('antes')
    var aDepois = Nasal.hasData('depois') ? Nasal.compute('depois') : null
    var gender = _state.gender
    return {
      gender: gender,
      antes: aAntes,
      depois: aDepois,
      ideal: IDEAL[gender],
      interpretation: _interpret(aAntes, gender),
    }
  }

  Nasal.renderReportSection = function () {
    var data = Nasal.getReportData()
    if (!data) return ''
    var a = data.antes
    var d = data.depois
    var ideal = data.ideal
    var has2x = !!d

    var head = 'padding:11px 16px;text-align:left;font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:#C8A97E;letter-spacing:0.12em;text-transform:uppercase'
    var cell = 'padding:11px 16px;border-bottom:1px solid rgba(200,169,126,0.1);font-family:Montserrat,sans-serif'

    function _row1x(label, val, range) {
      var color = _statusColor(val, range)
      var statusText = (val >= range[0] && val <= range[1]) ? 'Dentro da faixa ideal' : (val < range[0] ? 'Abaixo da faixa' : 'Acima da faixa')
      return '<tr>' +
        '<td style="' + cell + ';font-size:12px;color:rgba(245,240,232,0.85)">' + label + '</td>' +
        '<td style="' + cell + ';font-size:15px;font-weight:700;color:' + color + '">' + val + '\u00B0</td>' +
        '<td style="' + cell + ';font-size:11px;color:rgba(200,169,126,0.65)">' + range[0] + '\u2013' + range[1] + '\u00B0</td>' +
        '<td style="' + cell + ';font-size:11px;color:' + color + '">' + statusText + '</td>' +
      '</tr>'
    }

    function _row2x(label, va, vd, range) {
      var cA = _statusColor(va, range)
      var cD = _statusColor(vd, range)
      var delta = vd - va
      var deltaColor = Math.abs(delta) < 1 ? 'rgba(200,169,126,0.5)' : (delta > 0 ? '#10B981' : '#F59E0B')
      var deltaStr = (delta > 0 ? '+' : '') + (Math.round(delta * 10) / 10) + '\u00B0'
      return '<tr>' +
        '<td style="' + cell + ';font-size:12px;color:rgba(245,240,232,0.85)">' + label + '</td>' +
        '<td style="' + cell + ';font-size:14px;font-weight:700;color:' + cA + '">' + va + '\u00B0</td>' +
        '<td style="' + cell + ';font-size:14px;font-weight:700;color:' + cD + '">' + vd + '\u00B0</td>' +
        '<td style="' + cell + ';font-size:13px;font-weight:700;color:' + deltaColor + '">' + deltaStr + '</td>' +
        '<td style="' + cell + ';font-size:11px;color:rgba(200,169,126,0.65)">' + range[0] + '\u2013' + range[1] + '\u00B0</td>' +
      '</tr>'
    }

    var table
    if (has2x) {
      table = '<table style="width:100%;border-collapse:collapse;background:rgba(20,18,16,0.5);border-radius:8px;overflow:hidden">' +
        '<thead><tr style="background:rgba(200,169,126,0.08)">' +
          '<th style="' + head + '">Angulo</th>' +
          '<th style="' + head + ';color:' + SLOT_ACCENT.antes + '">Antes</th>' +
          '<th style="' + head + ';color:' + SLOT_ACCENT.depois + '">Depois</th>' +
          '<th style="' + head + '">Delta</th>' +
          '<th style="' + head + '">Ideal</th>' +
        '</tr></thead><tbody>' +
          _row2x('Nasofrontal', a.nasofrontal, d.nasofrontal, ideal.nasofrontal) +
          _row2x('Nasolabial',  a.nasolabial,  d.nasolabial,  ideal.nasolabial) +
          _row2x('Nasofacial',  a.nasofacial,  d.nasofacial,  ideal.nasofacial) +
        '</tbody></table>'
    } else {
      table = '<table style="width:100%;border-collapse:collapse;background:rgba(20,18,16,0.5);border-radius:8px;overflow:hidden">' +
        '<thead><tr style="background:rgba(200,169,126,0.08)">' +
          '<th style="' + head + '">Angulo</th>' +
          '<th style="' + head + '">Medido</th>' +
          '<th style="' + head + '">Ideal</th>' +
          '<th style="' + head + '">Status</th>' +
        '</tr></thead><tbody>' +
          _row1x('Nasofrontal', a.nasofrontal, ideal.nasofrontal) +
          _row1x('Nasolabial',  a.nasolabial,  ideal.nasolabial) +
          _row1x('Nasofacial',  a.nasofacial,  ideal.nasofacial) +
        '</tbody></table>'
    }

    return '<section style="margin:32px 0;padding:24px;background:rgba(26,24,22,0.55);border:1px solid rgba(200,169,126,0.12);border-radius:12px">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:22px;font-style:italic;color:#C8A97E;margin-bottom:4px">Analise Angular do Nariz</div>' +
      '<div style="font-size:11px;color:rgba(200,169,126,0.55);margin-bottom:16px;letter-spacing:0.06em">Referencia: ' + (data.gender === 'F' ? 'Feminino' : 'Masculino') + (has2x ? ' \u00B7 Comparativo Antes/Depois' : '') + '</div>' +
      table +
      (data.interpretation ? '<div style="margin-top:16px;padding:14px 18px;background:rgba(200,169,126,0.05);border-left:3px solid #C8A97E;font-family:Cormorant Garamond,serif;font-size:14px;line-height:1.7;color:rgba(245,240,232,0.82);font-style:italic">' + data.interpretation + '</div>' : '') +
    '</section>'
  }

  function _interpret(a, gender) {
    var ideal = IDEAL[gender]
    var parts = []
    function _dir(v, r) { if (v >= r[0] && v <= r[1]) return 'ok'; return v < r[0] ? 'below' : 'above' }
    var nf = _dir(a.nasofrontal, ideal.nasofrontal)
    if (nf === 'below') parts.push('angulo nasofrontal fechado (dorso proeminente ou raiz baixa)')
    else if (nf === 'above') parts.push('angulo nasofrontal aberto (raiz nasal baixa ou testa retraida)')
    var nl = _dir(a.nasolabial, ideal.nasolabial)
    if (nl === 'below') parts.push('ponta nasal hiporotacionada (tendencia a caida)')
    else if (nl === 'above') parts.push('ponta nasal hiperrotacionada (excessivamente elevada)')
    var nfc = _dir(a.nasofacial, ideal.nasofacial)
    if (nfc === 'below') parts.push('projecao nasal reduzida em relacao ao plano facial')
    else if (nfc === 'above') parts.push('projecao nasal acentuada em relacao ao plano facial')
    if (parts.length === 0) {
      return 'Proporcoes nasais alinhadas com os parametros esteticos de referencia ' + (gender === 'F' ? 'femininos' : 'masculinos') + '.'
    }
    return 'Observacoes: ' + parts.join('; ') + '.'
  }

  // ── Geometry helpers ─────────────────────────────────────────
  function _vec(a, b) { return { x: b.x - a.x, y: b.y - a.y } }

  function _angleBetween(v1, v2) {
    var m1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y)
    var m2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y)
    if (m1 === 0 || m2 === 0) return 0
    var cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (m1 * m2)))
    return Math.acos(cos) * 180 / Math.PI
  }

  function _angleAt(vertex, a, b) {
    return _angleBetween(_vec(vertex, a), _vec(vertex, b))
  }

  function _statusColor(val, range) {
    if (val == null) return '#999'
    var lo = range[0], hi = range[1]
    if (val >= lo && val <= hi) return '#10B981'
    var margin = (hi - lo) * 0.6
    if ((val >= lo - margin && val < lo) || (val > hi && val <= hi + margin)) return '#F59E0B'
    return '#EF4444'
  }

  function _withAlpha(hex, alpha) {
    if (typeof hex !== 'string' || hex.charAt(0) !== '#') return hex
    var r = parseInt(hex.substr(1, 2), 16)
    var g = parseInt(hex.substr(3, 2), 16)
    var b = parseInt(hex.substr(5, 2), 16)
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
  }

  // ── Canvas draw primitives ───────────────────────────────────
  function _drawLine(ctx, p1, p2, w, h, color, width, dash) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = width || 1.5
    if (dash) ctx.setLineDash(dash); else ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(p1.x * w, p1.y * h)
    ctx.lineTo(p2.x * w, p2.y * h)
    ctx.stroke()
    ctx.restore()
  }

  function _drawPoint(ctx, x, y, active, label) {
    ctx.save()
    var grad = ctx.createRadialGradient(x, y, 0, x, y, active ? 14 : 10)
    grad.addColorStop(0, active ? 'rgba(200,169,126,0.55)' : 'rgba(200,169,126,0.3)')
    grad.addColorStop(1, 'rgba(200,169,126,0)')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(x, y, active ? 14 : 10, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = active ? '#C8A97E' : '#F5F0E8'
    ctx.strokeStyle = '#1a1816'
    ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.arc(x, y, active ? 6 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

    if (active && label) {
      ctx.font = 'bold 11px Montserrat, sans-serif'
      var tw = ctx.measureText(label).width + 12
      ctx.fillStyle = 'rgba(26,24,22,0.92)'
      ctx.strokeStyle = 'rgba(200,169,126,0.5)'
      ctx.lineWidth = 1
      var bx = x + 10, by = y - 20
      ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(bx, by, tw, 18, 4); else ctx.rect(bx, by, tw, 18)
      ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#C8A97E'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, bx + 6, by + 9)
    }
    ctx.restore()
  }

  function _drawAngleArc(ctx, vertex, p1, p2, w, h, radius, color, numberText, labelText) {
    var vx = vertex.x * w, vy = vertex.y * h
    var ang1 = Math.atan2(p1.y * h - vy, p1.x * w - vx)
    var ang2 = Math.atan2(p2.y * h - vy, p2.x * w - vx)

    var diff = ang2 - ang1
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    var anticlockwise = diff < 0

    ctx.save()
    ctx.fillStyle = _withAlpha(color, 0.22)
    ctx.beginPath()
    ctx.moveTo(vx, vy)
    ctx.arc(vx, vy, radius, ang1, ang2, anticlockwise)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(vx, vy, radius, ang1, ang2, anticlockwise)
    ctx.stroke()

    var midAng = ang1 + diff / 2
    var tx = vx + Math.cos(midAng) * (radius * 0.62)
    var ty = vy + Math.sin(midAng) * (radius * 0.62)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 18px Montserrat, sans-serif'
    ctx.strokeStyle = 'rgba(20,18,16,0.95)'
    ctx.lineWidth = 4
    ctx.strokeText(numberText, tx, ty)
    ctx.fillStyle = color
    ctx.fillText(numberText, tx, ty)

    ctx.font = '600 9px Montserrat, sans-serif'
    ctx.strokeStyle = 'rgba(20,18,16,0.95)'
    ctx.lineWidth = 3
    ctx.strokeText(labelText, tx, ty + 15)
    ctx.fillStyle = 'rgba(245,240,232,0.85)'
    ctx.fillText(labelText, tx, ty + 15)

    ctx.restore()
  }

  FM.Nasal = Nasal
  FM._renderNasalPanel = Nasal.renderPanel
  FM._renderNasalCanvasArea = Nasal.renderCanvasArea
  FM._initNasalCanvas = Nasal.initCanvas

})()
