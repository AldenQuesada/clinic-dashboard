/**
 * fm-nasal.js — Nasal Angular Analysis (self-contained module)
 *
 * Namespace: FM.Nasal
 * Tab: 'nasal'
 * Storage: localStorage key "fm_nasal_{leadId}" — ISOLATED
 *
 * 3 independent measurements per slot (antes/depois):
 *   - nasofrontal (azul)   : glabella / radix / tip
 *   - nasolabial  (dourado): tip / subnasal / lipUpper
 *   - nasofacial  (roxo)   : glabella / tip / pogonion
 * Each measurement has its OWN points and enabled flag.
 *
 * Features:
 *   - Upload independente por slot
 *   - Zoom/pan/lock por slot + toggle sincronizar no 2x
 *   - Raio adaptativo do arco (cabe dentro dos raios)
 *   - Conduta clínica sugerida por medição (baseada em boas práticas de rinomodelação)
 */
;(function () {
  'use strict'

  var FM = window._FM
  if (!FM) return

  var Nasal = {}

  // ── Measurement definitions ──────────────────────────────────
  var MEASUREMENTS = [
    {
      id: 'nasofrontal',
      label: 'Nasofrontal',
      short: 'NF',
      color: '#3B82F6',
      points: [
        { id: 'glabella', label: 'Glabela',  defX: 0.60, defY: 0.22 },
        { id: 'radix',    label: 'Radix',    defX: 0.58, defY: 0.30 },
        { id: 'tip',      label: 'Ponta',    defX: 0.44, defY: 0.50 },
      ],
      vertex: 'radix', ray1: 'glabella', ray2: 'tip',
    },
    {
      id: 'nasolabial',
      label: 'Nasolabial',
      short: 'NL',
      color: '#C8A97E',
      points: [
        { id: 'tip',      label: 'Ponta',          defX: 0.44, defY: 0.50 },
        { id: 'subnasal', label: 'Subnasal',       defX: 0.52, defY: 0.60 },
        { id: 'lipUpper', label: 'Labio superior', defX: 0.54, defY: 0.65 },
      ],
      vertex: 'subnasal', ray1: 'tip', ray2: 'lipUpper',
    },
    {
      id: 'nasofacial',
      label: 'Nasofacial',
      short: 'NFC',
      color: '#A855F7',
      type: 'angle',
      points: [
        { id: 'glabella', label: 'Glabela',  defX: 0.60, defY: 0.22 },
        { id: 'tip',      label: 'Ponta',    defX: 0.44, defY: 0.50 },
        { id: 'pogonion', label: 'Pogonio',  defX: 0.56, defY: 0.88 },
      ],
      vertex: 'glabella', ray1: 'pogonion', ray2: 'tip',
    },
    {
      id: 'ricketts',
      label: 'Linha de Ricketts (E-line)',
      short: 'LR',
      color: '#0EA5E9',
      type: 'line',
      points: [
        { id: 'tip',      label: 'Ponta',          defX: 0.44, defY: 0.50 },
        { id: 'pogonion', label: 'Pogonio',        defX: 0.56, defY: 0.88 },
        { id: 'lipUpper', label: 'Labio superior', defX: 0.54, defY: 0.65 },
        { id: 'lipLower', label: 'Labio inferior', defX: 0.54, defY: 0.72 },
      ],
      lineA: 'tip', lineB: 'pogonion',
      targets: ['lipUpper', 'lipLower'],
    },
  ]

  // Add type tag to angle measurements for backward compat
  MEASUREMENTS.forEach(function (m) { if (!m.type) m.type = 'angle' })

  var MEAS_BY_ID = {}
  MEASUREMENTS.forEach(function (m) { MEAS_BY_ID[m.id] = m })

  var IDEAL = {
    F: {
      nasofrontal: [120, 130],
      nasolabial:  [100, 110],
      nasofacial:  [30, 35],
      // Ricketts: labios atras da linha (valor NEGATIVO em mm). F: lipUpper ~-2mm, lipLower ~0mm
      ricketts:    { lipUpper: [-4, -1], lipLower: [-3, 0] },
    },
    M: {
      nasofrontal: [115, 125],
      nasolabial:  [90, 95],
      nasofacial:  [36, 40],
      ricketts:    { lipUpper: [-4, -2], lipLower: [-4, -1] },
    },
  }

  // Assumed anatomical reference: tip→pogonion distance ≈ 52mm in adults.
  // Used to convert pixel distances to mm. Can be calibrated in a future sprint.
  var TIP_POGONION_MM_DEFAULT = 52

  // Clinical conduct matrix (rinomodelação — HA + complementos)
  var CONDUCT = {
    nasofrontal: {
      fechado: {
        anatomic: 'Giba dorsal / dorso nasal proeminente. Transicao fronto-nasal abrupta.',
        action: 'Preencher radix (HA supraperiosteal, 0.2–0.4 ml) para suavizar a transicao fronto-nasal e camuflar o dorso alto. Microbolus no supratip pode refinar.',
        procedures: ['HA radix', 'HA supratip (camuflagem)'],
      },
      aberto: {
        anatomic: 'Raiz nasal baixa ou plana (perfil em sela).',
        action: 'Preencher radix (HA supraperiosteal, 0.2–0.4 ml) para elevar a raiz e criar projecao harmonica com a fronte.',
        procedures: ['HA radix'],
      },
    },
    nasolabial: {
      fechado: {
        anatomic: 'Ponta nasal caida (hiporrotacionada). Angulo columelo-labial agudo.',
        action: 'Elevar a ponta: HA na espinha nasal / base da columela (0.2–0.4 ml, bolus profundo). Avaliar botox em musculo depressor septi nasi (LLSAN) se a ponta caer ao sorrir. Fios PDO columelares como sustentacao complementar.',
        procedures: ['HA columela', 'HA espinha nasal', 'Botox depressor septi', 'Fios PDO'],
      },
      aberto: {
        anatomic: 'Ponta hiperrotacionada (arrebitada). Exposicao excessiva das narinas no perfil.',
        action: 'Preencher supratip (microbolus 0.1–0.2 ml) para alongar visualmente o dorso e reduzir a rotacao. Rotacao extrema requer avaliacao de rinoplastia.',
        procedures: ['HA supratip', 'Avaliacao cirurgica se limite ultrapassado'],
      },
    },
    nasofacial: {
      fechado: {
        anatomic: 'Projecao nasal reduzida / nariz pouco projetado.',
        action: 'Aumentar projecao: HA na ponta (0.1–0.2 ml supraperichondrial) + radix. Avaliar mento: se retraido (retrognatia), preencher pogonio para equilibrar o perfil antero-posterior.',
        procedures: ['HA ponta', 'HA radix', 'HA pogonio (se retrognata)'],
      },
      aberto: {
        anatomic: 'Nariz muito projetado em relacao ao plano facial.',
        action: 'Camuflagem: preencher pogonio se houver retrognatia para equilibrar o perfil; preencher supratip se houver convexidade. Reducao real da projecao requer rinoplastia cirurgica.',
        procedures: ['HA pogonio', 'HA supratip', 'Avaliacao cirurgica para reducao'],
      },
    },
    // Ricketts uses per-lip conduct (protruso = labio a frente da linha, retroverso = muito atras)
    ricketts: {
      lipUpper: {
        protruso: {
          anatomic: 'Labio superior projetado alem da E-line — biprotrusao labial ou mento/nariz retraidos.',
          action: 'Avaliar mento (pogonio): se retraido, preencher. Em biprotrusao real, encaminhar para ortodontia/cirurgia. Evitar preenchimento labial volumetrico.',
          procedures: ['HA pogonio (se retrognata)', 'Encaminhamento ortodontia', 'Avaliar rinoplastia de aumento'],
        },
        retroverso: {
          anatomic: 'Labio superior aquem do ideal — labio retraido ou projecao nasal/mento excessiva.',
          action: 'Preencher labio superior (HA, 0.3–0.6 ml total) respeitando o filtro. Reavaliar projecao nasal e do mento — se exagerada, pode ser a causa.',
          procedures: ['HA labio superior', 'Reavaliar nasofacial / mento'],
        },
      },
      lipLower: {
        protruso: {
          anatomic: 'Labio inferior projetado alem da E-line — protrusao labial inferior ou mento retraido.',
          action: 'Avaliar mento: preencher pogonio se retrognatia. Se protrusao dentaria, encaminhar para ortodontia. Evitar volumetrizacao do labio inferior.',
          procedures: ['HA pogonio', 'Encaminhamento ortodontia'],
        },
        retroverso: {
          anatomic: 'Labio inferior muito atras da linha — labio retraido ou mento projetado excessivo.',
          action: 'Preencher labio inferior (HA, 0.3–0.7 ml). Avaliar projecao do mento — se excessiva, considerar camuflagem no terco medio.',
          procedures: ['HA labio inferior', 'Reavaliar mento'],
        },
      },
    },
  }

  var SLOTS = ['antes', 'depois']
  var SLOT_LABEL = { antes: 'ANTES', depois: 'DEPOIS' }
  var SLOT_ACCENT = { antes: '#EF4444', depois: '#10B981' }

  // ── State ────────────────────────────────────────────────────
  var _state = null

  function _newMeasurementState(measDef) {
    var pts = {}
    measDef.points.forEach(function (p) { pts[p.id] = { x: p.defX, y: p.defY } })
    return { enabled: true, points: pts }
  }

  function _newSlotState() {
    var meas = {}
    MEASUREMENTS.forEach(function (m) { meas[m.id] = _newMeasurementState(m) })
    return {
      photoB64: null, photoUrl: null, img: null,
      imgW: 0, imgH: 0,
      zoom: 1, panX: 0, panY: 0, locked: false,
      measurements: meas,
    }
  }

  function _newState(leadId) {
    return {
      leadId: leadId,
      gender: 'F',
      syncViews: false,
      antes: _newSlotState(),
      depois: _newSlotState(),
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
      function _slotPayload(s) {
        var meas = {}
        MEASUREMENTS.forEach(function (m) {
          var ms = s.measurements[m.id]
          meas[m.id] = { enabled: ms.enabled, points: ms.points }
        })
        return {
          photoB64: s.photoB64,
          zoom: s.zoom, panX: s.panX, panY: s.panY, locked: s.locked,
          measurements: meas,
        }
      }
      var payload = {
        gender: _state.gender,
        syncViews: _state.syncViews,
        antes:  _slotPayload(_state.antes),
        depois: _slotPayload(_state.depois),
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem(_storageKey(_state.leadId), JSON.stringify(payload))
    } catch (e) { /* silent */ }
  }

  function _migrateLegacy(saved, target) {
    // Legacy formats:
    //  v0 (flat): { photoB64, points:{glabella,radix,tip,subnasal,lipUpper,pogonion}, gender, ... }
    //  v1 (per slot): { gender, antes:{photoB64, points:{...}, zoom,...}, depois:{...} }
    // Both store SHARED points across all 3 measurements. Migrate by copying relevant pts.
    function _copyLegacyPoints(slot, legacySlot) {
      if (!legacySlot || !legacySlot.points) return
      MEASUREMENTS.forEach(function (m) {
        var ms = slot.measurements[m.id]
        m.points.forEach(function (pd) {
          var legacyPt = legacySlot.points[pd.id]
          if (legacyPt) ms.points[pd.id] = { x: legacyPt.x, y: legacyPt.y }
        })
      })
    }
    // v0
    if (saved.photoB64 && !saved.antes) {
      target.antes.photoB64 = saved.photoB64
      target.antes.photoUrl = saved.photoB64
      _copyLegacyPoints(target.antes, saved)
    }
  }

  function _ensureLoaded() {
    var leadId = _currentLeadId()
    if (_state && _state.leadId === leadId) return
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
    if (!saved) return

    _state.gender = saved.gender || 'F'
    _state.syncViews = !!saved.syncViews

    // v0 flat legacy
    if (saved.photoB64 && !saved.antes) { _migrateLegacy(saved, _state); return }

    SLOTS.forEach(function (slotKey) {
      var savedSlot = saved[slotKey]
      if (!savedSlot) return
      var target = _state[slotKey]
      target.photoB64 = savedSlot.photoB64 || null
      target.photoUrl = savedSlot.photoB64 || null
      target.zoom  = (typeof savedSlot.zoom === 'number' && savedSlot.zoom > 0) ? savedSlot.zoom : 1
      target.panX  = savedSlot.panX || 0
      target.panY  = savedSlot.panY || 0
      target.locked = !!savedSlot.locked

      // v1 legacy: had single points on slot — migrate to each measurement
      if (savedSlot.points && !savedSlot.measurements) {
        _migrateLegacy({ photoB64: savedSlot.photoB64, points: savedSlot.points }, { antes: target, depois: target })
        return
      }

      // v2 current: measurements per id
      if (savedSlot.measurements) {
        MEASUREMENTS.forEach(function (m) {
          var savedMeas = savedSlot.measurements[m.id]
          if (!savedMeas) return
          var targetMeas = target.measurements[m.id]
          targetMeas.enabled = (savedMeas.enabled !== false)
          if (savedMeas.points) {
            m.points.forEach(function (pd) {
              var sp = savedMeas.points[pd.id]
              if (sp) targetMeas.points[pd.id] = { x: sp.x, y: sp.y }
            })
          }
        })
      }
    })
  }

  // ── Public API ───────────────────────────────────────────────
  Nasal.init = function () { _ensureLoaded() }

  Nasal.hasPhoto = function (slot) {
    _ensureLoaded()
    slot = slot || 'antes'
    return !!(_state[slot] && _state[slot].photoUrl)
  }

  Nasal.hasData = function (slot) {
    _ensureLoaded()
    slot = slot || 'antes'
    if (!_state[slot] || !_state[slot].photoUrl) return false
    return MEASUREMENTS.some(function (m) {
      var ms = _state[slot].measurements[m.id]
      if (!ms || !ms.enabled || !ms.points) return false
      return Object.keys(ms.points).length === m.points.length
    })
  }

  Nasal.getGender = function () { _ensureLoaded(); return _state.gender }

  Nasal.setGender = function (g) {
    _ensureLoaded()
    _state.gender = (g === 'M') ? 'M' : 'F'
    _saveToStorage()
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  Nasal.reset = function (slot, measId) {
    _ensureLoaded()
    slot = slot || 'antes'
    var s = _state[slot]
    if (measId) {
      var m = MEAS_BY_ID[measId]
      if (m) s.measurements[measId] = _newMeasurementState(m)
    } else {
      MEASUREMENTS.forEach(function (m) { s.measurements[m.id] = _newMeasurementState(m) })
    }
    _saveToStorage()
    _redrawAll()
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  Nasal.toggleMeasurement = function (slot, measId) {
    _ensureLoaded()
    slot = slot || 'antes'
    var ms = _state[slot].measurements[measId]
    if (!ms) return
    ms.enabled = !ms.enabled
    _saveToStorage()
    _redrawAll()
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
    s.photoUrl = null; s.photoB64 = null; s.img = null
    // Reset measurements to defaults on photo removal
    MEASUREMENTS.forEach(function (m) { s.measurements[m.id] = _newMeasurementState(m) })
    _saveToStorage()
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  // ── Zoom / Pan / Lock / Sync ─────────────────────────────────
  var MIN_ZOOM = 0.3, MAX_ZOOM = 6
  function _clampZoom(z) { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)) }

  function _zoomAt(slot, factor, cx, cy) {
    var s = _state[slot]
    var newZoom = _clampZoom(s.zoom * factor)
    var actual = newZoom / s.zoom
    s.panX = cx - (cx - s.panX) * actual
    s.panY = cy - (cy - s.panY) * actual
    s.zoom = newZoom
    return actual
  }

  function _otherSlot(slot) { return slot === 'antes' ? 'depois' : 'antes' }

  Nasal.zoomIn  = function (slot) { _doZoomStep(slot || 'antes', 1.2) }
  Nasal.zoomOut = function (slot) { _doZoomStep(slot || 'antes', 1 / 1.2) }

  function _doZoomStep(slot, factor) {
    _ensureLoaded()
    var s = _state[slot]
    if (!s.photoUrl || s.locked) return
    var actual = _zoomAt(slot, factor, s.imgW / 2, s.imgH / 2)
    if (_state.syncViews) {
      var os = _state[_otherSlot(slot)]
      if (!os.locked && os.photoUrl) _zoomAt(_otherSlot(slot), actual, os.imgW / 2, os.imgH / 2)
    }
    _redrawAll()
    _saveToStorage()
  }

  Nasal.fitView = function (slot) {
    _ensureLoaded()
    slot = slot || 'antes'
    var s = _state[slot]
    if (!s.photoUrl || s.locked) return
    s.zoom = 1; s.panX = 0; s.panY = 0
    if (_state.syncViews) {
      var os = _state[_otherSlot(slot)]
      if (!os.locked && os.photoUrl) { os.zoom = 1; os.panX = 0; os.panY = 0 }
    }
    _redrawAll()
    _saveToStorage()
  }

  Nasal.toggleLock = function (slot) {
    _ensureLoaded()
    slot = slot || 'antes'
    _state[slot].locked = !_state[slot].locked
    _saveToStorage()
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  Nasal.toggleSync = function () {
    _ensureLoaded()
    _state.syncViews = !_state.syncViews
    _saveToStorage()
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  Nasal.onWheel = function (e, canvasEl) {
    if (FM._activeTab !== 'nasal' || !canvasEl) return
    var slot = _detectTargetSlot(canvasEl)
    var s = _state[slot]
    if (!s.photoUrl || s.locked) return
    e.preventDefault()
    var rect = canvasEl.getBoundingClientRect()
    var mx = e.clientX - rect.left
    var my = e.clientY - rect.top
    var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    var actual = _zoomAt(slot, factor, mx, my)
    if (_state.syncViews) {
      var os = _state[_otherSlot(slot)]
      if (!os.locked && os.photoUrl) _zoomAt(_otherSlot(slot), actual, os.imgW / 2, os.imgH / 2)
    }
    _redrawAll()
    _saveToStorage()
  }

  // ── Compute (per measurement) ────────────────────────────────
  // Returns:
  //   - angle type: number (degrees)
  //   - line  type: { lipUpperMm, lipLowerMm } distances in mm (neg = behind line)
  Nasal.compute = function (slot, measId) {
    _ensureLoaded()
    slot = slot || 'antes'
    var m = MEAS_BY_ID[measId]
    if (!m) return null
    var ms = _state[slot].measurements[measId]
    if (!ms || !ms.enabled || !ms.points) return null
    var pts = ms.points

    if (m.type === 'line') {
      var lA = pts[m.lineA], lB = pts[m.lineB]
      if (!lA || !lB) return null
      var slotState = _state[slot]
      var w = slotState.imgW || 1, h = slotState.imgH || 1
      // Reference: distance A-B in pixels ≈ TIP_POGONION_MM_DEFAULT mm
      var abPx = _dist(lA, lB, w, h)
      if (abPx <= 0) return null
      var mmPerPx = TIP_POGONION_MM_DEFAULT / abPx

      var out = {}
      m.targets.forEach(function (tid) {
        var tp = pts[tid]
        if (!tp) return
        // Signed perpendicular distance from target to line A-B.
        // Sign convention: NEGATIVE = behind line (toward face, posterior)
        //                  POSITIVE = in front of line (protrusion, anterior)
        var d = _perpSignedPx(tp, lA, lB, w, h)
        out[tid] = Math.round(d * mmPerPx * 10) / 10
      })
      return out
    }

    // Default: angle
    var pv = pts[m.vertex], p1 = pts[m.ray1], p2 = pts[m.ray2]
    if (!pv || !p1 || !p2) return null
    var ang = _angleAt(pv, p1, p2)
    return Math.round(ang * 10) / 10
  }

  // Signed perpendicular distance (pixels).
  // For a face looking LEFT in the image (lower x = front), "in front of E-line"
  // means the target point has a more anterior (lower) x than the line projection.
  // We compute cross product; sign convention adjusted so positive = protruso (frente).
  function _perpSignedPx(p, a, b, w, h) {
    var ax = a.x * w, ay = a.y * h
    var bx = b.x * w, by = b.y * h
    var px = p.x * w, py = p.y * h
    var dx = bx - ax, dy = by - ay
    var len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return 0
    // cross product / len gives signed perpendicular distance
    var cross = (px - ax) * dy - (py - ay) * dx
    var d = cross / len
    // Orientation heuristic: if the line goes from tip (top) to pogonion (bottom),
    // dy > 0 and a positive cross means the point is to the LEFT of the line (in image).
    // For a face looking left, left-of-line = BEHIND (nariz/mento já à esquerda da linha).
    // Invert so that NEGATIVE = atras (ideal), POSITIVE = a frente (protruso).
    return -d
  }

  function _status(val, range) {
    if (val < range[0]) return 'fechado'
    if (val > range[1]) return 'aberto'
    return 'normal'
  }

  function _statusLabel(st) {
    return st === 'fechado' ? 'Fechado' : (st === 'aberto' ? 'Aberto' : 'Normal')
  }

  function _statusColor(st) {
    if (st === 'normal') return '#10B981'
    return '#F59E0B'  // warn for both desvio directions; vermelho reservado para extremo
  }

  function _statusColorExtreme(val, range) {
    var lo = range[0], hi = range[1]
    if (val >= lo && val <= hi) return '#10B981'
    var margin = (hi - lo) * 0.8
    if (val < lo - margin || val > hi + margin) return '#EF4444'
    return '#F59E0B'
  }

  // ── Render (per measurement, per slot) ───────────────────────
  function _renderSlotOverlays(ctx, slot, w, h) {
    var s = _state[slot]
    if (!s) return
    var gender = _state.gender

    MEASUREMENTS.forEach(function (m) {
      var ms = s.measurements[m.id]
      if (!ms || !ms.enabled) return
      var pts = ms.points

      if (m.type === 'line') {
        _renderRickettsOverlay(ctx, slot, m, pts, w, h, gender)
        return
      }

      // angle type
      var pv = pts[m.vertex], p1 = pts[m.ray1], p2 = pts[m.ray2]
      if (!pv || !p1 || !p2) return
      _drawLine(ctx, pv, p1, w, h, _withAlpha(m.color, 0.55), 1.4)
      _drawLine(ctx, pv, p2, w, h, _withAlpha(m.color, 0.55), 1.4)
      if (m.id === 'nasofacial') {
        _drawLine(ctx, pv, p1, w, h, _withAlpha('#64A0FF', 0.28), 1.1, [5, 4])
      }
      var ang = _angleAt(pv, p1, p2)
      var d1 = _dist(pv, p1, w, h)
      var d2 = _dist(pv, p2, w, h)
      var radius = Math.min(d1, d2) * 0.28
      radius = Math.max(18, Math.min(38, radius))
      _drawAngleArc(ctx, pv, p1, p2, w, h, radius, m.color, ang.toFixed(0) + '\u00B0')
    })

    // Points on top
    MEASUREMENTS.forEach(function (m) {
      var ms = s.measurements[m.id]
      if (!ms || !ms.enabled) return
      var pts = ms.points
      m.points.forEach(function (pd) {
        var pt = pts[pd.id]
        if (!pt) return
        var active = (Nasal._hoverPoint && Nasal._hoverPoint.slot === slot && Nasal._hoverPoint.measId === m.id && Nasal._hoverPoint.id === pd.id) ||
                     (Nasal._dragPoint && Nasal._dragPoint.slot === slot && Nasal._dragPoint.measId === m.id && Nasal._dragPoint.id === pd.id)
        _drawPoint(ctx, pt.x * w, pt.y * h, active, pd.label, m.color)
      })
    })
  }

  function _renderRickettsOverlay(ctx, slot, m, pts, w, h, gender) {
    var lA = pts[m.lineA], lB = pts[m.lineB]
    if (!lA || !lB) return
    // The E-line itself
    _drawLine(ctx, lA, lB, w, h, _withAlpha(m.color, 0.85), 1.8, [6, 4])

    // Compute once to avoid recalc
    var abPx = _dist(lA, lB, w, h)
    if (abPx <= 0) return
    var mmPerPx = TIP_POGONION_MM_DEFAULT / abPx
    var rRange = IDEAL[gender].ricketts

    m.targets.forEach(function (tid) {
      var tp = pts[tid]
      if (!tp) return
      // Foot of perpendicular from tp onto line A-B
      var ax = lA.x * w, ay = lA.y * h
      var bx = lB.x * w, by = lB.y * h
      var px = tp.x * w, py = tp.y * h
      var dx = bx - ax, dy = by - ay
      var len2 = dx * dx + dy * dy
      if (len2 === 0) return
      var t = ((px - ax) * dx + (py - ay) * dy) / len2
      var fx = ax + t * dx, fy = ay + t * dy

      // Draw perpendicular segment from point to its foot on the line
      ctx.save()
      ctx.strokeStyle = _withAlpha(m.color, 0.55)
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(fx, fy)
      ctx.stroke()
      ctx.restore()

      // Label with mm distance
      var distPx = _perpSignedPx(tp, lA, lB, w, h)
      var mm = Math.round(distPx * mmPerPx * 10) / 10
      var range = rRange[tid]
      var st = _statusRicketts(mm, range)
      var col = (st === 'ideal') ? '#10B981' : (st === 'protruso' ? '#EF4444' : '#F59E0B')
      var sign = mm > 0 ? '+' : ''
      var text = sign + mm.toFixed(1) + ' mm'

      // Position label near the point, offset outward
      var labelX = px + (px > fx ? 10 : -10)
      var labelY = py
      var align = px > fx ? 'left' : 'right'

      ctx.save()
      ctx.font = 'bold 10px Montserrat, sans-serif'
      ctx.textAlign = align
      ctx.textBaseline = 'middle'
      ctx.strokeStyle = 'rgba(20,18,16,0.95)'
      ctx.lineWidth = 3
      ctx.strokeText(text, labelX, labelY)
      ctx.fillStyle = col
      ctx.fillText(text, labelX, labelY)
      ctx.restore()
    })
  }

  function _statusRicketts(mm, range) {
    // range is [lo, hi] with lo <= hi, typically both negative (behind line)
    if (mm >= range[0] && mm <= range[1]) return 'ideal'
    if (mm > range[1]) return 'protruso'  // mais à frente que o permitido
    return 'retroverso'                    // muito atrás da linha
  }

  // Called from FM._redraw for canvas 1 (antes)
  Nasal.render = function (ctx) {
    if (!ctx) return
    if (FM._activeTab !== 'nasal') return
    _ensureLoaded()
    var s = _state.antes
    if (!s.photoUrl || !s.img) return
    ctx.save()
    ctx.translate(s.panX, s.panY)
    ctx.scale(s.zoom, s.zoom)
    ctx.drawImage(s.img, 0, 0, s.imgW, s.imgH)
    _renderSlotOverlays(ctx, 'antes', s.imgW, s.imgH)
    ctx.restore()
    _drawBadges(ctx, s, ctx.canvas.width)
  }

  Nasal.render2 = function (ctx) {
    if (!ctx) return
    if (FM._activeTab !== 'nasal') return
    _ensureLoaded()
    var s = _state.depois
    if (!s.photoUrl || !s.img) return
    ctx.save()
    ctx.translate(s.panX, s.panY)
    ctx.scale(s.zoom, s.zoom)
    ctx.drawImage(s.img, 0, 0, s.imgW, s.imgH)
    _renderSlotOverlays(ctx, 'depois', s.imgW, s.imgH)
    ctx.restore()
    _drawBadges(ctx, s, ctx.canvas.width)
  }

  function _drawBadges(ctx, s, canvasW) {
    if (!s.locked && Math.abs(s.zoom - 1) < 0.01) return
    ctx.save()
    var parts = []
    if (Math.abs(s.zoom - 1) >= 0.01) parts.push(Math.round(s.zoom * 100) + '%')
    if (s.locked) parts.push('TRAVADO')
    var text = parts.join(' \u00B7 ')
    ctx.font = 'bold 10px Montserrat, sans-serif'
    var tw = ctx.measureText(text).width + 14
    var bx = canvasW - tw - 8, by = 8
    ctx.fillStyle = s.locked ? 'rgba(239,68,68,0.92)' : 'rgba(26,24,22,0.85)'
    ctx.strokeStyle = s.locked ? '#fff' : 'rgba(200,169,126,0.4)'
    ctx.lineWidth = 1
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, tw, 20, 4); ctx.fill(); ctx.stroke() }
    else { ctx.fillRect(bx, by, tw, 20); ctx.strokeRect(bx, by, tw, 20) }
    ctx.fillStyle = '#fff'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, bx + 7, by + 10)
    ctx.restore()
  }

  // ── Mouse handling ───────────────────────────────────────────
  Nasal._dragPoint = null   // { slot, measId, id }
  Nasal._hoverPoint = null
  Nasal._panDrag = null     // { slot, lastMx, lastMy }

  function _detectTargetSlot(canvasEl) {
    if (!canvasEl) return null
    if (canvasEl.id === 'fmNasalCanvas2') return 'depois'
    return 'antes'
  }

  function _slotDims(slot) {
    var s = _state[slot]
    return { w: s.imgW, h: s.imgH }
  }

  function _hitTest(slot, mx, my, w, h) {
    var s = _state[slot]
    var threshold = 14
    var closest = null, bestDist = threshold
    MEASUREMENTS.forEach(function (m) {
      var ms = s.measurements[m.id]
      if (!ms || !ms.enabled) return
      m.points.forEach(function (pd) {
        var pt = ms.points[pd.id]
        if (!pt) return
        var sx = pt.x * w * s.zoom + s.panX
        var sy = pt.y * h * s.zoom + s.panY
        var d = Math.sqrt(Math.pow(mx - sx, 2) + Math.pow(my - sy, 2))
        if (d < bestDist) { bestDist = d; closest = { measId: m.id, id: pd.id } }
      })
    })
    return closest
  }

  Nasal.onMouseDown = function (mx, my, canvasEl) {
    if (FM._activeTab !== 'nasal') return false
    _ensureLoaded()
    var slot = _detectTargetSlot(canvasEl)
    if (!slot || !_state[slot].photoUrl) return false
    var dims = _slotDims(slot)
    var hit = _hitTest(slot, mx, my, dims.w, dims.h)
    if (hit) {
      Nasal._dragPoint = { slot: slot, measId: hit.measId, id: hit.id }
      if (canvasEl) canvasEl.style.cursor = 'grabbing'
      return true
    }
    if (!_state[slot].locked) {
      Nasal._panDrag = { slot: slot, lastMx: mx, lastMy: my }
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
    var s = _state[slot]

    if (Nasal._dragPoint && Nasal._dragPoint.slot === slot) {
      var imgX = (mx - s.panX) / (dims.w * s.zoom)
      var imgY = (my - s.panY) / (dims.h * s.zoom)
      var pt = s.measurements[Nasal._dragPoint.measId].points[Nasal._dragPoint.id]
      pt.x = Math.max(0, Math.min(1, imgX))
      pt.y = Math.max(0, Math.min(1, imgY))
      _redrawAll()
      _refreshPanelValues()
      _saveToStorage()
      return true
    }

    if (Nasal._panDrag && Nasal._panDrag.slot === slot) {
      var dx = mx - Nasal._panDrag.lastMx
      var dy = my - Nasal._panDrag.lastMy
      s.panX += dx; s.panY += dy
      if (_state.syncViews) {
        var os = _state[_otherSlot(slot)]
        if (!os.locked && os.photoUrl) { os.panX += dx; os.panY += dy }
      }
      Nasal._panDrag.lastMx = mx; Nasal._panDrag.lastMy = my
      _redrawAll()
      _saveToStorage()
      return true
    }

    var hit = _hitTest(slot, mx, my, dims.w, dims.h)
    var next = hit ? { slot: slot, measId: hit.measId, id: hit.id } : null
    var changed = (next && !Nasal._hoverPoint) ||
                  (!next && Nasal._hoverPoint) ||
                  (next && Nasal._hoverPoint && (next.slot !== Nasal._hoverPoint.slot || next.measId !== Nasal._hoverPoint.measId || next.id !== Nasal._hoverPoint.id))
    if (changed) {
      Nasal._hoverPoint = next
      if (canvasEl) canvasEl.style.cursor = hit ? 'grab' : (s.locked ? 'crosshair' : 'grab')
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
    if (Nasal._panDrag) {
      Nasal._panDrag = null
      if (canvasEl) canvasEl.style.cursor = 'grab'
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
    Nasal.render2(ctx2)
  }

  // ── Canvas area ──────────────────────────────────────────────
  Nasal.renderCanvasArea = function () {
    _ensureLoaded()
    var is2x = FM._viewMode === '2x'
    return is2x ? _renderDualCanvas() : _renderSingleCanvas()
  }

  function _renderSingleCanvas() {
    if (!_state.antes.photoUrl) return _emptySlotArea('antes')
    return '<div class="fm-canvas-area" id="fmCanvasArea" style="display:flex;flex-direction:column;background:#0A0A0A;border-radius:8px;overflow:hidden;position:relative">' +
      _slotHeader('antes') +
      '<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">' +
        '<canvas id="fmCanvas" style="max-width:100%;max-height:100%;cursor:grab"></canvas>' +
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
      '<div style="padding:6px 10px;background:' + _withAlpha(accent, 0.12) + ';display:flex;justify-content:space-between;align-items:center;gap:6px">' +
        '<span style="font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:' + accent + ';letter-spacing:0.1em;flex-shrink:0">' + label + '</span>' +
        _slotControls(slot) +
      '</div>' +
      '<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">' +
        '<canvas id="' + canvasId + '" style="max-width:100%;max-height:100%;cursor:grab"></canvas>' +
      '</div>' +
    '</div>'
  }

  function _slotHeader(slot) {
    var accent = SLOT_ACCENT[slot]
    var label = SLOT_LABEL[slot]
    return '<div style="padding:6px 14px;background:' + _withAlpha(accent, 0.12) + ';display:flex;justify-content:space-between;align-items:center;gap:6px">' +
      '<span style="font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:' + accent + ';letter-spacing:0.1em;flex-shrink:0">' + label + ' \u2014 PERFIL</span>' +
      _slotControls(slot) +
    '</div>'
  }

  function _slotControls(slot) {
    var locked = !!_state[slot].locked
    var btn = 'font-size:11px;padding:3px 8px;min-width:24px;line-height:1;display:inline-flex;align-items:center;justify-content:center'
    return '<div style="display:flex;gap:3px;align-items:center">' +
      '<button class="fm-btn" onclick="FaceMapping._nasalZoomOut(\'' + slot + '\')" title="Diminuir zoom" style="' + btn + '">\u2212</button>' +
      '<button class="fm-btn" onclick="FaceMapping._nasalZoomIn(\'' + slot + '\')" title="Aumentar zoom" style="' + btn + '">+</button>' +
      '<button class="fm-btn" onclick="FaceMapping._nasalFit(\'' + slot + '\')" title="Ajustar" style="' + btn + ';font-size:9px">Fit</button>' +
      '<button class="fm-btn" onclick="FaceMapping._nasalToggleLock(\'' + slot + '\')" title="' + (locked ? 'Destravar vista' : 'Travar vista') + '" style="' + btn + ';' + (locked ? 'background:#EF4444;border-color:#EF4444;color:#fff' : '') + '">' +
        (locked ? '\uD83D\uDD12' : '\uD83D\uDD13') +
      '</button>' +
      '<button class="fm-btn" onclick="FaceMapping._uploadNasalPhoto(\'' + slot + '\')" title="Substituir" style="font-size:9px;padding:3px 8px;margin-left:6px">Trocar</button>' +
      '<button class="fm-btn" onclick="FaceMapping._deleteNasalPhoto(\'' + slot + '\')" title="Remover" style="font-size:9px;padding:3px 8px;border-color:#EF4444;color:#EF4444">\u00D7</button>' +
    '</div>'
  }

  function _emptySlotArea(slot) {
    var accent = SLOT_ACCENT[slot]
    var label = SLOT_LABEL[slot]
    return '<div class="fm-canvas-area" id="fmCanvasArea" style="display:flex;align-items:center;justify-content:center;background:#0A0A0A;border-radius:8px">' +
      '<div style="text-align:center;max-width:420px;padding:40px 20px">' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:24px;font-style:italic;color:#C8A97E;margin-bottom:8px">Analise Angular do Nariz</div>' +
        '<div style="font-size:13px;color:rgba(245,240,232,0.6);line-height:1.6;margin-bottom:24px">Esta analise usa uma foto lateral dedicada. 3 medicoes independentes: Nasofrontal, Nasolabial e Nasofacial.</div>' +
        '<button onclick="FaceMapping._uploadNasalPhoto(\'' + slot + '\')" style="padding:14px 28px;border:none;border-radius:8px;background:' + accent + ';color:#fff;font-family:Montserrat,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer">Carregar Foto Lateral</button>' +
      '</div>' +
    '</div>'
  }

  // ── Canvas init ──────────────────────────────────────────────
  Nasal.initCanvas = function () {
    _ensureLoaded()
    _initSlotCanvas('antes', 'fmCanvas')
    if (FM._viewMode === '2x') _initSlotCanvas('depois', 'fmNasalCanvas2')
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
    canvas.addEventListener('mouseleave', function () { Nasal._panDrag = null })
    canvas.addEventListener('wheel', function (e) { Nasal.onWheel(e, canvas) }, { passive: false })
  }

  function _withTarget(e, canvas) {
    return { offsetX: e.offsetX, offsetY: e.offsetY, _canvas: canvas }
  }

  // ── Panel (right sidebar) ────────────────────────────────────
  Nasal.renderPanel = function () {
    _ensureLoaded()
    var gender = _state.gender
    var is2x = FM._viewMode === '2x'
    var slot = 'antes'  // panel focuses ANTES for clinical plan; DEPOIS acts as comparative

    var html = '<div class="fm-toolbar" style="overflow-y:auto">'

    html += '<div class="fm-tool-section" style="padding-bottom:8px">' +
      '<div class="fm-tool-section-title">Analise Angular do Nariz</div>' +
      '<div style="font-size:10px;color:rgba(200,169,126,0.5);line-height:1.5;margin-top:4px">' +
        '3 medicoes independentes. Cada uma tem seus proprios pontos e conduta clinica sugerida.' +
      '</div>' +
    '</div>'

    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Genero de referencia</div>' +
      '<div style="display:flex;gap:3px">' +
        '<button class="fm-zone-btn' + (gender === 'F' ? ' active' : '') + '" onclick="FaceMapping._setNasalGender(\'F\')" style="flex:1;justify-content:center">Feminino</button>' +
        '<button class="fm-zone-btn' + (gender === 'M' ? ' active' : '') + '" onclick="FaceMapping._setNasalGender(\'M\')" style="flex:1;justify-content:center">Masculino</button>' +
      '</div>' +
    '</div>'

    if (is2x) {
      var syncOn = !!_state.syncViews
      html += '<div class="fm-tool-section">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div>' +
            '<div class="fm-tool-section-title" style="margin:0">Sincronizar vistas</div>' +
            '<div style="font-size:9px;color:rgba(200,169,126,0.4);margin-top:2px">Zoom e pan replicam entre ANTES e DEPOIS</div>' +
          '</div>' +
          '<div onclick="FaceMapping._toggleNasalSync()" style="width:36px;height:18px;border-radius:9px;cursor:pointer;position:relative;background:' + (syncOn ? '#10B981' : 'rgba(200,169,126,0.15)') + ';transition:background .2s;flex-shrink:0">' +
            '<div style="width:14px;height:14px;border-radius:50%;background:#fff;position:absolute;top:2px;left:' + (syncOn ? '20px' : '2px') + ';transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    }

    html += '<div id="fmNasalMeasurements">' + _renderMeasurementsBlock(slot, gender, is2x) + '</div>'

    if (_state.antes.photoUrl || (is2x && _state.depois.photoUrl)) {
      html += '<div class="fm-tool-section" style="font-size:10px;color:rgba(200,169,126,0.5);line-height:1.5">' +
        '<div class="fm-tool-section-title">Navegacao</div>' +
        '<div>\u00B7 Roda do mouse: zoom no cursor</div>' +
        '<div>\u00B7 Arrastar area vazia: mover foto</div>' +
        '<div>\u00B7 Cadeado: trava zoom/pan, so pontos editaveis</div>' +
      '</div>'
    }

    html += '</div>'
    return html
  }

  function _renderMeasurementsBlock(slot, gender, is2x) {
    var html = ''
    MEASUREMENTS.forEach(function (m) {
      html += _renderMeasurementCard(m, slot, gender, is2x)
    })
    return html
  }

  function _renderMeasurementCard(m, slot, gender, is2x) {
    if (m.type === 'line') return _renderRickettsCard(m, slot, gender, is2x)
    var ms = _state[slot].measurements[m.id]
    var range = IDEAL[gender][m.id]
    var valAntes = Nasal.compute('antes', m.id)
    var valDepois = is2x ? Nasal.compute('depois', m.id) : null
    var st = (valAntes != null) ? _status(valAntes, range) : null
    var stColor = st ? _statusColorExtreme(valAntes, range) : '#999'
    var conduct = (st && st !== 'normal') ? CONDUCT[m.id][st] : null

    var delta = (valAntes != null && valDepois != null) ? (valDepois - valAntes) : null
    var deltaStr = delta != null ? ((delta > 0 ? '+' : '') + (Math.round(delta * 10) / 10) + '\u00B0') : ''
    var deltaColor = delta == null ? 'rgba(200,169,126,0.4)' : (Math.abs(delta) < 1 ? 'rgba(200,169,126,0.5)' : (delta > 0 ? '#10B981' : '#F59E0B'))

    var html = '<div class="fm-tool-section" style="border-left:3px solid ' + m.color + ';padding-left:10px">'

    // Header: measurement name + toggle
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-family:Montserrat,sans-serif;font-size:11px;font-weight:700;color:' + m.color + ';letter-spacing:0.06em">' + m.label + '</span>' +
      '</div>' +
      '<div onclick="FaceMapping._toggleNasalMeasurement(\'' + slot + '\',\'' + m.id + '\')" title="Ativar / desativar" style="width:30px;height:15px;border-radius:8px;cursor:pointer;position:relative;background:' + (ms.enabled ? m.color : 'rgba(200,169,126,0.15)') + ';transition:background .2s;flex-shrink:0">' +
        '<div style="width:11px;height:11px;border-radius:50%;background:#fff;position:absolute;top:2px;left:' + (ms.enabled ? '16px' : '2px') + ';transition:left .2s"></div>' +
      '</div>' +
    '</div>'

    if (!ms.enabled) {
      html += '<div style="font-size:10px;color:rgba(200,169,126,0.35);font-style:italic">Desativada</div>'
      html += '</div>'
      return html
    }

    // Metrics row: measured | ideal | status
    if (valAntes == null) {
      html += '<div style="font-size:10px;color:rgba(200,169,126,0.4)">Posicione os pontos para calcular.</div>'
    } else {
      var showDelta = is2x && valDepois != null
      html += '<div style="display:flex;gap:10px;align-items:baseline;margin-bottom:6px;flex-wrap:wrap">' +
        '<div style="flex:0 0 auto">' +
          '<div style="font-size:8px;color:rgba(200,169,126,0.5);letter-spacing:0.1em;font-weight:700">MEDIDO</div>' +
          '<div style="font-size:20px;font-weight:700;color:' + stColor + ';font-family:Montserrat,sans-serif;line-height:1">' + valAntes + '\u00B0</div>' +
        '</div>' +
        (showDelta
          ? '<div style="flex:0 0 auto">' +
              '<div style="font-size:8px;color:' + SLOT_ACCENT.depois + ';letter-spacing:0.1em;font-weight:700">DEPOIS</div>' +
              '<div style="font-size:16px;font-weight:700;color:' + _statusColorExtreme(valDepois, range) + ';font-family:Montserrat,sans-serif;line-height:1">' + valDepois + '\u00B0</div>' +
            '</div>' +
            '<div style="flex:0 0 auto">' +
              '<div style="font-size:8px;color:rgba(200,169,126,0.5);letter-spacing:0.1em;font-weight:700">DELTA</div>' +
              '<div style="font-size:14px;font-weight:700;color:' + deltaColor + ';font-family:Montserrat,sans-serif;line-height:1">' + deltaStr + '</div>' +
            '</div>'
          : '') +
        '<div style="flex:1;min-width:0;text-align:right">' +
          '<div style="font-size:8px;color:rgba(200,169,126,0.5);letter-spacing:0.1em;font-weight:700">IDEAL</div>' +
          '<div style="font-size:11px;color:rgba(245,240,232,0.7);font-family:Montserrat,sans-serif">' + range[0] + '\u2013' + range[1] + '\u00B0</div>' +
        '</div>' +
      '</div>'

      // Status badge
      var badgeBg = (st === 'normal') ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'
      var badgeBorder = (st === 'normal') ? '#10B981' : '#F59E0B'
      html += '<div style="display:inline-block;padding:3px 10px;border-radius:4px;background:' + badgeBg + ';border:1px solid ' + badgeBorder + ';margin-bottom:8px">' +
        '<span style="font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:' + badgeBorder + ';letter-spacing:0.1em;text-transform:uppercase">' + _statusLabel(st) + '</span>' +
      '</div>'

      // Clinical interpretation + conduct
      if (conduct) {
        html += '<div style="margin-top:6px;padding:8px 10px;background:rgba(200,169,126,0.04);border-radius:6px">' +
          '<div style="font-family:Cormorant Garamond,serif;font-size:12px;font-style:italic;color:rgba(245,240,232,0.85);line-height:1.5;margin-bottom:6px">' + conduct.anatomic + '</div>' +
          '<div style="font-size:10px;color:rgba(245,240,232,0.7);line-height:1.5;margin-bottom:6px"><strong style="color:' + m.color + '">Conduta:</strong> ' + conduct.action + '</div>' +
          (conduct.procedures && conduct.procedures.length
            ? '<div style="display:flex;flex-wrap:wrap;gap:3px">' +
                conduct.procedures.map(function (p) {
                  return '<span style="font-size:9px;padding:2px 6px;border-radius:10px;background:' + _withAlpha(m.color, 0.12) + ';border:1px solid ' + _withAlpha(m.color, 0.35) + ';color:' + m.color + ';font-weight:600">' + p + '</span>'
                }).join('') +
              '</div>'
            : '') +
        '</div>'
      }
    }

    // Reset button
    html += '<div style="margin-top:6px"><button class="fm-btn" style="width:100%;font-size:9px;padding:3px 6px" onclick="FaceMapping._resetNasalMeasurement(\'' + slot + '\',\'' + m.id + '\')">Reposicionar pontos</button></div>'

    html += '</div>'
    return html
  }

  function _renderRickettsCard(m, slot, gender, is2x) {
    var ms = _state[slot].measurements[m.id]
    var rRange = IDEAL[gender].ricketts
    var antes  = Nasal.compute('antes', m.id)
    var depois = is2x ? Nasal.compute('depois', m.id) : null

    var html = '<div class="fm-tool-section" style="border-left:3px solid ' + m.color + ';padding-left:10px">'
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
      '<span style="font-family:Montserrat,sans-serif;font-size:11px;font-weight:700;color:' + m.color + ';letter-spacing:0.06em">' + m.label + '</span>' +
      '<div onclick="FaceMapping._toggleNasalMeasurement(\'' + slot + '\',\'' + m.id + '\')" style="width:30px;height:15px;border-radius:8px;cursor:pointer;position:relative;background:' + (ms.enabled ? m.color : 'rgba(200,169,126,0.15)') + ';transition:background .2s;flex-shrink:0">' +
        '<div style="width:11px;height:11px;border-radius:50%;background:#fff;position:absolute;top:2px;left:' + (ms.enabled ? '16px' : '2px') + ';transition:left .2s"></div>' +
      '</div>' +
    '</div>'

    if (!ms.enabled) {
      html += '<div style="font-size:10px;color:rgba(200,169,126,0.35);font-style:italic">Desativada</div></div>'
      return html
    }

    if (!antes) {
      html += '<div style="font-size:10px;color:rgba(200,169,126,0.4)">Posicione os pontos (ponta, pogonio, labios sup/inf) para calcular.</div>'
      html += '<div style="margin-top:6px"><button class="fm-btn" style="width:100%;font-size:9px;padding:3px 6px" onclick="FaceMapping._resetNasalMeasurement(\'' + slot + '\',\'' + m.id + '\')">Reposicionar pontos</button></div></div>'
      return html
    }

    html += '<div style="font-size:9px;color:rgba(200,169,126,0.45);margin-bottom:8px;line-height:1.5">Distancia perpendicular dos labios a linha ponta\u2192pogonio. Valores <strong>negativos</strong> = atras da linha (ideal).</div>'

    function _lipRow(tid, label) {
      var mm = antes[tid]
      var mmD = depois ? depois[tid] : null
      var range = rRange[tid]
      var st = _statusRicketts(mm, range)
      var stColor = (st === 'ideal') ? '#10B981' : (st === 'protruso' ? '#EF4444' : '#F59E0B')
      var stLabel = (st === 'ideal') ? 'Ideal' : (st === 'protruso' ? 'Protruso' : 'Retroverso')
      var conduct = (st !== 'ideal') ? CONDUCT.ricketts[tid][st] : null

      var delta = (mm != null && mmD != null) ? (mmD - mm) : null
      var deltaStr = delta != null ? ((delta > 0 ? '+' : '') + (Math.round(delta * 10) / 10) + ' mm') : ''
      var deltaColor = delta == null ? 'rgba(200,169,126,0.4)' : (Math.abs(delta) < 0.5 ? 'rgba(200,169,126,0.5)' : (delta > 0 ? '#EF4444' : '#10B981'))

      var inner = '<div style="padding:8px 10px;background:rgba(200,169,126,0.04);border-radius:6px;margin-bottom:8px;border-left:2px solid ' + stColor + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">' +
          '<span style="font-family:Montserrat,sans-serif;font-size:10px;font-weight:600;color:rgba(245,240,232,0.8);letter-spacing:0.04em">' + label + '</span>' +
          '<span style="font-size:14px;font-weight:700;color:' + stColor + ';font-family:Montserrat,sans-serif">' + (mm >= 0 ? '+' : '') + mm.toFixed(1) + ' mm</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:9px;color:rgba(200,169,126,0.5);margin-bottom:4px">' +
          '<span>Ideal: ' + range[0] + ' a ' + range[1] + ' mm</span>' +
          '<span style="color:' + stColor + ';font-weight:700;text-transform:uppercase;letter-spacing:0.1em">' + stLabel + '</span>' +
        '</div>' +
        (depois != null && mmD != null
          ? '<div style="display:flex;gap:10px;font-size:9px;margin-top:4px">' +
              '<span style="color:' + SLOT_ACCENT.depois + ';font-weight:600">Depois: ' + (mmD >= 0 ? '+' : '') + mmD.toFixed(1) + ' mm</span>' +
              '<span style="color:' + deltaColor + ';font-weight:700">Delta: ' + deltaStr + '</span>' +
            '</div>'
          : '') +
        (conduct
          ? '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(200,169,126,0.1)">' +
              '<div style="font-family:Cormorant Garamond,serif;font-size:11px;font-style:italic;color:rgba(245,240,232,0.8);line-height:1.5;margin-bottom:4px">' + conduct.anatomic + '</div>' +
              '<div style="font-size:10px;color:rgba(245,240,232,0.7);line-height:1.5;margin-bottom:4px"><strong style="color:' + m.color + '">Conduta:</strong> ' + conduct.action + '</div>' +
              (conduct.procedures && conduct.procedures.length
                ? '<div style="display:flex;flex-wrap:wrap;gap:3px">' +
                    conduct.procedures.map(function (p) {
                      return '<span style="font-size:9px;padding:2px 6px;border-radius:10px;background:' + _withAlpha(m.color, 0.12) + ';border:1px solid ' + _withAlpha(m.color, 0.35) + ';color:' + m.color + ';font-weight:600">' + p + '</span>'
                    }).join('') +
                  '</div>'
                : '') +
            '</div>'
          : '') +
      '</div>'
      return inner
    }

    html += _lipRow('lipUpper', 'Labio superior')
    html += _lipRow('lipLower', 'Labio inferior')
    html += '<div style="font-size:8px;color:rgba(200,169,126,0.35);margin-top:-4px;margin-bottom:6px;font-style:italic">Calculo baseado em ponta\u2192pogonio \u2248 52 mm (referencia adulta).</div>'
    html += '<button class="fm-btn" style="width:100%;font-size:9px;padding:3px 6px" onclick="FaceMapping._resetNasalMeasurement(\'' + slot + '\',\'' + m.id + '\')">Reposicionar pontos</button>'
    html += '</div>'
    return html
  }

  function _refreshPanelValues() {
    var el = document.getElementById('fmNasalMeasurements')
    if (!el) return
    el.innerHTML = _renderMeasurementsBlock('antes', _state.gender, FM._viewMode === '2x')
  }

  // ── Report section ───────────────────────────────────────────
  Nasal.getReportData = function () {
    _ensureLoaded()
    if (!Nasal.hasData('antes')) return null
    var gender = _state.gender
    var is2x = FM._viewMode === '2x' && Nasal.hasData('depois')
    var rows = [], rickettsData = null
    MEASUREMENTS.forEach(function (m) {
      var ms = _state.antes.measurements[m.id]
      if (!ms || !ms.enabled) return
      var va = Nasal.compute('antes', m.id)
      var vd = is2x ? Nasal.compute('depois', m.id) : null
      if (va == null) return

      if (m.type === 'line') {
        rickettsData = { id: m.id, label: m.label, color: m.color, antes: va, depois: vd, ranges: IDEAL[gender].ricketts }
        return
      }

      var range = IDEAL[gender][m.id]
      var st = _status(va, range)
      var conduct = (st !== 'normal') ? CONDUCT[m.id][st] : null
      rows.push({
        id: m.id, label: m.label, color: m.color,
        antes: va, depois: vd, range: range, status: st, conduct: conduct,
      })
    })
    if (rows.length === 0 && !rickettsData) return null
    return { gender: gender, rows: rows, ricketts: rickettsData, is2x: is2x }
  }

  Nasal.renderReportSection = function () {
    var data = Nasal.getReportData()
    if (!data) return ''
    var head = 'padding:11px 14px;text-align:left;font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:#C8A97E;letter-spacing:0.12em;text-transform:uppercase'
    var cell = 'padding:11px 14px;border-bottom:1px solid rgba(200,169,126,0.1);font-family:Montserrat,sans-serif;vertical-align:top'

    var colSpan = data.is2x ? 6 : 5
    var rowsHtml = data.rows.map(function (r) {
      var stColor = _statusColorExtreme(r.antes, r.range)
      var dcell, dstr
      if (data.is2x && r.depois != null) {
        var dv = r.depois - r.antes
        dstr = (dv > 0 ? '+' : '') + (Math.round(dv * 10) / 10) + '\u00B0'
        dcell = '<td style="' + cell + ';font-size:14px;font-weight:700;color:' + _statusColorExtreme(r.depois, r.range) + '">' + r.depois + '\u00B0</td>' +
                '<td style="' + cell + ';font-size:13px;font-weight:700;color:' + (Math.abs(dv) < 1 ? 'rgba(200,169,126,0.5)' : (dv > 0 ? '#10B981' : '#F59E0B')) + '">' + dstr + '</td>'
      } else {
        dcell = data.is2x ? '<td style="' + cell + '">\u2014</td><td style="' + cell + '">\u2014</td>' : ''
      }
      var conductHtml = r.conduct
        ? '<div style="font-family:Cormorant Garamond,serif;font-size:12px;font-style:italic;color:rgba(245,240,232,0.85);margin-bottom:3px">' + r.conduct.anatomic + '</div>' +
          '<div style="font-size:11px;color:rgba(245,240,232,0.75);line-height:1.5">' + r.conduct.action + '</div>'
        : '<div style="font-size:11px;color:rgba(16,185,129,0.8)">Dentro da faixa ideal — manter.</div>'

      return '<tr>' +
        '<td style="' + cell + ';font-size:12px;color:rgba(245,240,232,0.88);border-left:3px solid ' + r.color + '"><strong style="color:' + r.color + '">' + r.label + '</strong></td>' +
        '<td style="' + cell + ';font-size:14px;font-weight:700;color:' + stColor + '">' + r.antes + '\u00B0</td>' +
        dcell +
        '<td style="' + cell + ';font-size:11px;color:rgba(200,169,126,0.7)">' + r.range[0] + '\u2013' + r.range[1] + '\u00B0</td>' +
        '<td style="' + cell + ';font-size:10px;font-weight:700;color:' + (r.status === 'normal' ? '#10B981' : '#F59E0B') + ';text-transform:uppercase;letter-spacing:0.1em">' + _statusLabel(r.status) + '</td>' +
      '</tr>' +
      '<tr><td colspan="' + colSpan + '" style="padding:4px 14px 14px 20px;border-bottom:1px solid rgba(200,169,126,0.1)">' + conductHtml + '</td></tr>'
    }).join('')

    var cols = data.is2x
      ? '<th style="' + head + '">Angulo</th>' +
        '<th style="' + head + ';color:' + SLOT_ACCENT.antes + '">Antes</th>' +
        '<th style="' + head + ';color:' + SLOT_ACCENT.depois + '">Depois</th>' +
        '<th style="' + head + '">Delta</th>' +
        '<th style="' + head + '">Ideal</th>' +
        '<th style="' + head + '">Status</th>'
      : '<th style="' + head + '">Angulo</th>' +
        '<th style="' + head + '">Medido</th>' +
        '<th style="' + head + '">Ideal</th>' +
        '<th style="' + head + '">Status</th>'

    var angleTable = data.rows.length
      ? '<table style="width:100%;border-collapse:collapse;background:rgba(20,18,16,0.5);border-radius:8px;overflow:hidden">' +
          '<thead><tr style="background:rgba(200,169,126,0.08)">' + cols + '</tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>'
      : ''

    var rickettsBlock = ''
    if (data.ricketts) {
      var r = data.ricketts
      function _lipRow(tid, label) {
        var mm = r.antes[tid]
        var mmD = r.depois ? r.depois[tid] : null
        var range = r.ranges[tid]
        var st = _statusRicketts(mm, range)
        var stColor = (st === 'ideal') ? '#10B981' : (st === 'protruso' ? '#EF4444' : '#F59E0B')
        var stLabel = (st === 'ideal') ? 'Ideal' : (st === 'protruso' ? 'Protruso' : 'Retroverso')
        var conduct = (st !== 'ideal') ? CONDUCT.ricketts[tid][st] : null
        var deltaStr = ''
        if (mmD != null) {
          var dv = mmD - mm
          deltaStr = (dv > 0 ? '+' : '') + (Math.round(dv * 10) / 10) + ' mm'
        }
        var conductHtml = conduct
          ? '<div style="font-family:Cormorant Garamond,serif;font-size:12px;font-style:italic;color:rgba(245,240,232,0.85);margin-bottom:3px">' + conduct.anatomic + '</div>' +
            '<div style="font-size:11px;color:rgba(245,240,232,0.75);line-height:1.5">' + conduct.action + '</div>'
          : '<div style="font-size:11px;color:rgba(16,185,129,0.8)">Dentro da faixa ideal — manter.</div>'
        return '<tr>' +
          '<td style="' + cell + ';font-size:12px;color:rgba(245,240,232,0.88);border-left:3px solid ' + r.color + '"><strong>' + label + '</strong></td>' +
          '<td style="' + cell + ';font-size:14px;font-weight:700;color:' + stColor + '">' + (mm >= 0 ? '+' : '') + mm.toFixed(1) + ' mm</td>' +
          (data.is2x ? ('<td style="' + cell + ';font-size:14px;font-weight:700">' + (mmD != null ? (mmD >= 0 ? '+' : '') + mmD.toFixed(1) + ' mm' : '\u2014') + '</td>' +
                        '<td style="' + cell + ';font-size:13px;font-weight:700">' + deltaStr + '</td>') : '') +
          '<td style="' + cell + ';font-size:11px;color:rgba(200,169,126,0.7)">' + range[0] + ' a ' + range[1] + ' mm</td>' +
          '<td style="' + cell + ';font-size:10px;font-weight:700;color:' + stColor + ';text-transform:uppercase;letter-spacing:0.1em">' + stLabel + '</td>' +
        '</tr>' +
        '<tr><td colspan="' + (data.is2x ? 6 : 5) + '" style="padding:4px 14px 14px 20px;border-bottom:1px solid rgba(200,169,126,0.1)">' + conductHtml + '</td></tr>'
      }

      var rickettsCols = data.is2x
        ? '<th style="' + head + '">Labio</th><th style="' + head + ';color:' + SLOT_ACCENT.antes + '">Antes</th><th style="' + head + ';color:' + SLOT_ACCENT.depois + '">Depois</th><th style="' + head + '">Delta</th><th style="' + head + '">Ideal</th><th style="' + head + '">Status</th>'
        : '<th style="' + head + '">Labio</th><th style="' + head + '">Medido</th><th style="' + head + '">Ideal</th><th style="' + head + '">Status</th>'

      rickettsBlock = '<div style="margin-top:20px">' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:16px;font-style:italic;color:' + r.color + ';margin-bottom:6px">' + r.label + '</div>' +
        '<div style="font-size:10px;color:rgba(200,169,126,0.5);margin-bottom:8px;line-height:1.5">Distancia perpendicular dos labios a linha ponta\u2192pogonio. Valores negativos = atras da linha (ideal). Calculo baseado em ponta\u2192pogonio \u2248 52 mm.</div>' +
        '<table style="width:100%;border-collapse:collapse;background:rgba(20,18,16,0.5);border-radius:8px;overflow:hidden">' +
          '<thead><tr style="background:rgba(200,169,126,0.08)">' + rickettsCols + '</tr></thead>' +
          '<tbody>' + _lipRow('lipUpper', 'Labio superior') + _lipRow('lipLower', 'Labio inferior') + '</tbody>' +
        '</table>' +
      '</div>'
    }

    return '<section style="margin:32px 0;padding:24px;background:rgba(26,24,22,0.55);border:1px solid rgba(200,169,126,0.12);border-radius:12px">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:22px;font-style:italic;color:#C8A97E;margin-bottom:4px">Analise Angular do Nariz</div>' +
      '<div style="font-size:11px;color:rgba(200,169,126,0.55);margin-bottom:16px;letter-spacing:0.06em">Referencia: ' + (data.gender === 'F' ? 'Feminino' : 'Masculino') + (data.is2x ? ' \u00B7 Comparativo Antes/Depois' : '') + '</div>' +
      angleTable +
      rickettsBlock +
    '</section>'
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

  function _dist(a, b, w, h) {
    var dx = (b.x - a.x) * w, dy = (b.y - a.y) * h
    return Math.sqrt(dx * dx + dy * dy)
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

  function _drawPoint(ctx, x, y, active, label, color) {
    ctx.save()
    var grad = ctx.createRadialGradient(x, y, 0, x, y, active ? 14 : 10)
    grad.addColorStop(0, _withAlpha(color, active ? 0.6 : 0.35))
    grad.addColorStop(1, _withAlpha(color, 0))
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(x, y, active ? 14 : 10, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = active ? color : _withAlpha(color, 0.30)
    ctx.strokeStyle = active ? '#1a1816' : _withAlpha(color, 0.85)
    ctx.lineWidth = active ? 1.8 : 1.3
    ctx.beginPath(); ctx.arc(x, y, active ? 6 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

    if (active && label) {
      ctx.font = 'bold 11px Montserrat, sans-serif'
      var tw = ctx.measureText(label).width + 12
      ctx.fillStyle = 'rgba(26,24,22,0.92)'
      ctx.strokeStyle = _withAlpha(color, 0.55)
      ctx.lineWidth = 1
      var bx = x + 10, by = y - 20
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, tw, 18, 4); ctx.fill(); ctx.stroke() }
      else { ctx.fillRect(bx, by, tw, 18); ctx.strokeRect(bx, by, tw, 18) }
      ctx.fillStyle = color
      ctx.textBaseline = 'middle'
      ctx.fillText(label, bx + 6, by + 9)
    }
    ctx.restore()
  }

  function _drawAngleArc(ctx, vertex, p1, p2, w, h, radius, color, numberText) {
    var vx = vertex.x * w, vy = vertex.y * h
    var ang1 = Math.atan2(p1.y * h - vy, p1.x * w - vx)
    var ang2 = Math.atan2(p2.y * h - vy, p2.x * w - vx)

    var diff = ang2 - ang1
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    var anticlockwise = diff < 0

    ctx.save()
    ctx.fillStyle = _withAlpha(color, 0.30)
    ctx.beginPath()
    ctx.moveTo(vx, vy)
    ctx.arc(vx, vy, radius, ang1, ang2, anticlockwise)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = _withAlpha(color, 0.75)
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.arc(vx, vy, radius, ang1, ang2, anticlockwise)
    ctx.stroke()

    var midAng = ang1 + diff / 2
    var tx = vx + Math.cos(midAng) * (radius * 0.58)
    var ty = vy + Math.sin(midAng) * (radius * 0.58)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 12px Montserrat, sans-serif'
    ctx.strokeStyle = 'rgba(20,18,16,0.75)'
    ctx.lineWidth = 2.5
    ctx.strokeText(numberText, tx, ty)
    ctx.fillStyle = '#F5F0E8'
    ctx.fillText(numberText, tx, ty)

    ctx.restore()
  }

  FM.Nasal = Nasal
  FM._renderNasalPanel = Nasal.renderPanel
  FM._renderNasalCanvasArea = Nasal.renderCanvasArea
  FM._initNasalCanvas = Nasal.initCanvas

})()
