/**
 * fm-nasal.js — Nasal Angular Analysis (self-contained module)
 *
 * Namespace: FM.Nasal
 * Tab: 'nasal' (always visible)
 * Storage: localStorage key "fm_nasal_{leadId}" — ISOLATED from angleStore
 * Photo: OWN upload, independent from FM._photoUrls (no crosstalk)
 */
;(function () {
  'use strict'

  var FM = window._FM
  if (!FM) return

  var Nasal = {}

  // ── Point definitions (6 lateral landmarks) ──────────────────
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

  // ── ISOLATED STATE (in-memory) ───────────────────────────────
  // Keyed by leadId to support patient switching. Persisted separately.
  var _state = {
    leadId: null,
    points: null,
    gender: 'F',
    photoB64: null,   // data URL for persistence
    photoUrl: null,   // objectURL for canvas (revoked on replace)
    img: null,        // cached Image element for the canvas
  }

  function _currentLeadId() {
    if (!FM._lead) return 'anon'
    return FM._lead.id || FM._lead.lead_id || 'anon'
  }

  function _storageKey(id) {
    return 'fm_nasal_' + id
  }

  function _loadFromStorage(leadId) {
    try {
      var raw = localStorage.getItem(_storageKey(leadId))
      if (!raw) return null
      return JSON.parse(raw)
    } catch (e) { return null }
  }

  function _saveToStorage() {
    var leadId = _currentLeadId()
    try {
      var payload = {
        points: _state.points,
        gender: _state.gender,
        photoB64: _state.photoB64,
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem(_storageKey(leadId), JSON.stringify(payload))
    } catch (e) { /* silent — quota or other */ }
  }

  function _ensureLoaded() {
    var leadId = _currentLeadId()
    if (_state.leadId === leadId) return
    // Switch lead — reset in-memory state
    if (_state.photoUrl) { try { URL.revokeObjectURL(_state.photoUrl) } catch (e) {} }
    _state = {
      leadId: leadId,
      points: null,
      gender: 'F',
      photoB64: null,
      photoUrl: null,
      img: null,
    }
    var saved = _loadFromStorage(leadId)
    if (saved) {
      _state.points = saved.points || null
      _state.gender = saved.gender || 'F'
      if (saved.photoB64) {
        _state.photoB64 = saved.photoB64
        _state.photoUrl = saved.photoB64 // use data URL directly
      }
    }
  }

  function _seedIfEmpty() {
    if (_state.points && Object.keys(_state.points).length === 6) return
    _state.points = {}
    POINT_DEFS.forEach(function (p) { _state.points[p.id] = { x: p.defX, y: p.defY } })
  }

  // ── Public API ───────────────────────────────────────────────
  Nasal.init = function () {
    _ensureLoaded()
    _seedIfEmpty()
  }

  Nasal.hasPhoto = function () {
    _ensureLoaded()
    return !!_state.photoUrl
  }

  Nasal.getPhotoUrl = function () {
    _ensureLoaded()
    return _state.photoUrl
  }

  Nasal.getImage = function () {
    _ensureLoaded()
    return _state.img
  }

  Nasal.setImage = function (img) {
    _state.img = img
  }

  Nasal.hasData = function () {
    _ensureLoaded()
    return !!(_state.points && Object.keys(_state.points).length === 6)
  }

  Nasal.getGender = function () { _ensureLoaded(); return _state.gender }

  Nasal.setGender = function (g) {
    _ensureLoaded()
    _state.gender = (g === 'M') ? 'M' : 'F'
    _saveToStorage()
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  Nasal.reset = function () {
    _ensureLoaded()
    _state.points = null
    _seedIfEmpty()
    _saveToStorage()
    FM._redraw()
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  // Upload triggered from UI — opens file picker
  Nasal.triggerUpload = function () {
    var input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = function (e) {
      var f = e.target.files && e.target.files[0]
      if (!f) return
      var reader = new FileReader()
      reader.onload = function (ev) {
        _ensureLoaded()
        if (_state.photoUrl && _state.photoUrl.indexOf('blob:') === 0) {
          try { URL.revokeObjectURL(_state.photoUrl) } catch (err) {}
        }
        _state.photoB64 = ev.target.result
        _state.photoUrl = ev.target.result
        _state.img = null
        _seedIfEmpty()
        _saveToStorage()
        FM._render()
        setTimeout(FM._initCanvas, 50)
      }
      reader.readAsDataURL(f)
    }
    input.click()
  }

  Nasal.deletePhoto = function () {
    if (!confirm('Remover a foto lateral da analise nasal?')) return
    _ensureLoaded()
    if (_state.photoUrl && _state.photoUrl.indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(_state.photoUrl) } catch (e) {}
    }
    _state.photoUrl = null
    _state.photoB64 = null
    _state.img = null
    _saveToStorage()
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  Nasal.autoSeed = function () {
    FM._showToast('Auto-posicionamento requer landmarks em foto ja carregada. Marque os pontos manualmente.', 'warn')
  }

  // ── Angle computation ────────────────────────────────────────
  Nasal.compute = function () {
    _ensureLoaded()
    if (!_state.points) return null
    var p = _state.points
    if (!p.glabella || !p.radix || !p.tip || !p.subnasal || !p.lipUpper || !p.pogonion) return null

    var nasofrontal = _angleAt(p.radix, p.glabella, p.tip)
    var nasolabial  = _angleAt(p.subnasal, p.tip, p.lipUpper)
    var nasofacial  = _angleBetween(_vec(p.glabella, p.pogonion), _vec(p.glabella, p.tip))
    var lipProj     = _perpSigned(p.lipUpper, p.glabella, p.pogonion)

    return {
      nasofrontal: Math.round(nasofrontal * 10) / 10,
      nasolabial:  Math.round(nasolabial * 10) / 10,
      nasofacial:  Math.round(nasofacial * 10) / 10,
      lipProj:     Math.round(lipProj * 10000) / 10000,
    }
  }

  // ── Canvas render (called from _redraw when tab=nasal) ───────
  Nasal.render = function (ctx) {
    if (!ctx || !FM._img) return
    if (FM._activeTab !== 'nasal') return

    var w = FM._imgW, h = FM._imgH
    _ensureLoaded()
    _seedIfEmpty()
    var p = _state.points
    var gender = _state.gender
    var ideal = IDEAL[gender]
    var a = Nasal.compute()

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
      var active = (Nasal._hoverPoint === def.id || Nasal._dragPoint === def.id)
      _drawPoint(ctx, pt.x * w, pt.y * h, active, def.label)
    })

    ctx.restore()
  }

  // ── Mouse handling ───────────────────────────────────────────
  Nasal._dragPoint = null
  Nasal._hoverPoint = null

  Nasal.onMouseDown = function (mx, my) {
    if (FM._activeTab !== 'nasal') return false
    _ensureLoaded()
    _seedIfEmpty()
    var hit = _hitTest(mx, my, _state.points)
    if (hit) {
      Nasal._dragPoint = hit
      if (FM._canvas) FM._canvas.style.cursor = 'grabbing'
      return true
    }
    return false
  }

  Nasal.onMouseMove = function (mx, my) {
    if (FM._activeTab !== 'nasal') return false
    if (!_state.points) return false
    if (Nasal._dragPoint) {
      _state.points[Nasal._dragPoint].x = Math.max(0, Math.min(1, mx / FM._imgW))
      _state.points[Nasal._dragPoint].y = Math.max(0, Math.min(1, my / FM._imgH))
      FM._redraw()
      _refreshPanelValues()
      _saveToStorage()
      return true
    }
    var hit = _hitTest(mx, my, _state.points)
    if (hit !== Nasal._hoverPoint) {
      Nasal._hoverPoint = hit
      if (FM._canvas) FM._canvas.style.cursor = hit ? 'grab' : 'crosshair'
      FM._redraw()
    }
    return !!hit
  }

  Nasal.onMouseUp = function () {
    if (Nasal._dragPoint) {
      Nasal._dragPoint = null
      if (FM._canvas) FM._canvas.style.cursor = 'crosshair'
      _refreshPanelValues()
      return true
    }
    return false
  }

  // ── Canvas area (replaces fm main canvas when tab=nasal) ─────
  Nasal.renderCanvasArea = function () {
    _ensureLoaded()
    if (!_state.photoUrl) {
      return '<div class="fm-canvas-area" id="fmCanvasArea" style="display:flex;align-items:center;justify-content:center;background:#0A0A0A;border-radius:8px">' +
        '<div style="text-align:center;max-width:420px;padding:40px 20px">' +
          '<div style="font-family:Cormorant Garamond,serif;font-size:24px;font-style:italic;color:#C8A97E;margin-bottom:8px">Analise Angular do Nariz</div>' +
          '<div style="font-size:13px;color:rgba(245,240,232,0.6);line-height:1.6;margin-bottom:24px">' +
            'Esta analise usa uma foto lateral (perfil) dedicada, independente das outras fotos do paciente.' +
          '</div>' +
          '<button onclick="FaceMapping._uploadNasalPhoto()" style="padding:14px 28px;border:none;border-radius:8px;background:#C8A97E;color:#1a1816;font-family:Montserrat,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer">' +
            'Carregar Foto Lateral' +
          '</button>' +
          '<div style="margin-top:16px;font-size:10px;color:rgba(200,169,126,0.4);letter-spacing:0.04em">Idealmente vista de perfil 90\u00B0</div>' +
        '</div>' +
      '</div>'
    }
    return '<div class="fm-canvas-area" id="fmCanvasArea" style="display:flex;flex-direction:column;background:#0A0A0A;border-radius:8px;overflow:hidden;position:relative">' +
      '<div style="padding:6px 14px;background:rgba(200,169,126,0.08);display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:#C8A97E;letter-spacing:0.1em">NARIZ \u2014 PERFIL</span>' +
        '<div style="display:flex;gap:4px">' +
          '<button class="fm-btn" onclick="FaceMapping._uploadNasalPhoto()" title="Substituir foto" style="font-size:9px;padding:3px 8px">Trocar</button>' +
          '<button class="fm-btn" onclick="FaceMapping._deleteNasalPhoto()" title="Remover foto" style="font-size:9px;padding:3px 8px;border-color:#EF4444;color:#EF4444">\u00D7</button>' +
        '</div>' +
      '</div>' +
      '<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">' +
        '<canvas id="fmCanvas" style="max-width:100%;max-height:100%;cursor:crosshair"></canvas>' +
      '</div>' +
    '</div>'
  }

  // ── Canvas init (called from _initCanvas when tab=nasal) ─────
  Nasal.initCanvas = function () {
    _ensureLoaded()
    if (!_state.photoUrl) return

    var canvas = document.getElementById('fmCanvas')
    if (!canvas) return
    FM._canvas = canvas
    FM._ctx = canvas.getContext('2d')

    var onReady = function () {
      var area = document.getElementById('fmCanvasArea')
      var areaW = area ? area.clientWidth : 800
      var areaH = area ? area.clientHeight - 30 : 600
      var scale = Math.min((areaW - 8) / _state.img.width, areaH / _state.img.height)
      FM._imgW = Math.round(_state.img.width * scale)
      FM._imgH = Math.round(_state.img.height * scale)
      FM._img = _state.img
      canvas.width = FM._imgW + 32
      canvas.height = FM._imgH
      FM._redraw()
    }

    if (_state.img && _state.img.complete && _state.img.naturalWidth > 0) {
      onReady()
    } else {
      _state.img = new Image()
      _state.img.onload = onReady
      _state.img.src = _state.photoUrl
    }

    canvas.addEventListener('mousedown', FM._onMouseDown)
    canvas.addEventListener('mousemove', FM._onMouseMove)
    canvas.addEventListener('mouseup', FM._onMouseUp)
  }

  // ── Panel (right sidebar) ────────────────────────────────────
  Nasal.renderPanel = function () {
    _ensureLoaded()
    _seedIfEmpty()
    var gender = _state.gender
    var ideal = IDEAL[gender]
    var hasPhoto = !!_state.photoUrl
    var a = hasPhoto ? (Nasal.compute() || {}) : {}

    var html = '<div class="fm-toolbar">'

    html += '<div class="fm-tool-section" style="padding-bottom:8px">' +
      '<div class="fm-tool-section-title">Analise Angular do Nariz</div>' +
      '<div style="font-size:10px;color:rgba(200,169,126,0.5);line-height:1.5;margin-top:4px">' +
        (hasPhoto
          ? 'Arraste os 6 pontos sobre a foto de perfil para calcular os angulos.'
          : 'Carregue uma foto lateral dedicada para iniciar a analise.') +
      '</div>' +
    '</div>'

    if (!hasPhoto) {
      html += '<div class="fm-tool-section">' +
        '<button class="fm-btn" style="width:100%;background:#C8A97E;color:#1a1816;border:none;font-weight:700" onclick="FaceMapping._uploadNasalPhoto()">Carregar Foto Lateral</button>' +
      '</div>'
    }

    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Genero de referencia</div>' +
      '<div style="display:flex;gap:3px">' +
        '<button class="fm-zone-btn' + (gender === 'F' ? ' active' : '') + '" onclick="FaceMapping._setNasalGender(\'F\')" style="flex:1;justify-content:center">Feminino</button>' +
        '<button class="fm-zone-btn' + (gender === 'M' ? ' active' : '') + '" onclick="FaceMapping._setNasalGender(\'M\')" style="flex:1;justify-content:center">Masculino</button>' +
      '</div>' +
      '<div style="font-size:9px;color:rgba(200,169,126,0.4);margin-top:6px">Define as faixas ideais de referencia.</div>' +
    '</div>'

    html += '<div id="fmNasalMetrics" class="fm-tool-section">' +
      _renderMetricsBlock(a, ideal) +
    '</div>'

    if (hasPhoto) {
      html += '<div class="fm-tool-section" style="display:flex;flex-direction:column;gap:4px">' +
        '<button class="fm-btn" style="width:100%" onclick="FaceMapping._resetNasal()">Reposicionar pontos padrao</button>' +
      '</div>'
    }

    html += '<div class="fm-tool-section" style="font-size:10px;color:rgba(200,169,126,0.55);line-height:1.55">' +
      '<div class="fm-tool-section-title">Pontos</div>' +
      POINT_DEFS.map(function (pt) {
        return '<div style="margin-bottom:4px"><strong style="color:#C8A97E">' + pt.label + ':</strong> ' + pt.desc + '</div>'
      }).join('') +
    '</div>'

    html += '</div>'
    return html
  }

  function _renderMetricsBlock(a, ideal) {
    return '<div class="fm-tool-section-title">Angulos</div>' +
      _metricRow('Nasofrontal', a.nasofrontal, ideal.nasofrontal, '\u00B0') +
      _metricRow('Nasolabial',  a.nasolabial,  ideal.nasolabial,  '\u00B0') +
      _metricRow('Nasofacial',  a.nasofacial,  ideal.nasofacial,  '\u00B0')
  }

  function _metricRow(label, val, range, unit) {
    if (val == null) {
      return '<div style="font-size:11px;color:rgba(200,169,126,0.4);margin-bottom:10px">' + label + ': —</div>'
    }
    var color = _statusColor(val, range)
    var status = (val >= range[0] && val <= range[1]) ? 'Ideal' : (val < range[0] ? 'Abaixo' : 'Acima')
    return '<div style="margin-bottom:12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">' +
        '<span style="font-size:10px;color:rgba(245,240,232,0.7);letter-spacing:0.03em">' + label + '</span>' +
        '<span style="font-size:16px;font-weight:700;color:' + color + ';font-family:Montserrat,sans-serif">' + val + unit + '</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:9px;color:rgba(200,169,126,0.4)">' +
        '<span>Ideal: ' + range[0] + '\u2013' + range[1] + unit + '</span>' +
        '<span style="color:' + color + ';font-weight:600">' + status + '</span>' +
      '</div>' +
    '</div>'
  }

  function _refreshPanelValues() {
    var el = document.getElementById('fmNasalMetrics')
    if (!el) return
    var a = Nasal.compute() || {}
    var ideal = IDEAL[Nasal.getGender()]
    el.innerHTML = _renderMetricsBlock(a, ideal)
  }

  // ── Report section ───────────────────────────────────────────
  Nasal.getReportData = function () {
    if (!Nasal.hasData() || !Nasal.hasPhoto()) return null
    var a = Nasal.compute()
    if (!a) return null
    var gender = _state.gender
    return {
      gender: gender,
      angles: a,
      ideal: IDEAL[gender],
      interpretation: _interpret(a, gender),
    }
  }

  Nasal.renderReportSection = function () {
    var data = Nasal.getReportData()
    if (!data) return ''
    var a = data.angles
    var ideal = data.ideal

    function _row(label, val, range) {
      var color = _statusColor(val, range)
      var statusText = (val >= range[0] && val <= range[1]) ? 'Dentro da faixa ideal' : (val < range[0] ? 'Abaixo da faixa' : 'Acima da faixa')
      var cell = 'padding:11px 16px;border-bottom:1px solid rgba(200,169,126,0.1);font-family:Montserrat,sans-serif'
      return '<tr>' +
        '<td style="' + cell + ';font-size:12px;color:rgba(245,240,232,0.85)">' + label + '</td>' +
        '<td style="' + cell + ';font-size:15px;font-weight:700;color:' + color + '">' + val + '\u00B0</td>' +
        '<td style="' + cell + ';font-size:11px;color:rgba(200,169,126,0.65)">' + range[0] + '\u2013' + range[1] + '\u00B0</td>' +
        '<td style="' + cell + ';font-size:11px;color:' + color + '">' + statusText + '</td>' +
      '</tr>'
    }

    var head = 'padding:11px 16px;text-align:left;font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:#C8A97E;letter-spacing:0.12em;text-transform:uppercase'

    return '<section style="margin:32px 0;padding:24px;background:rgba(26,24,22,0.55);border:1px solid rgba(200,169,126,0.12);border-radius:12px">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:22px;font-style:italic;color:#C8A97E;margin-bottom:4px">Analise Angular do Nariz</div>' +
      '<div style="font-size:11px;color:rgba(200,169,126,0.55);margin-bottom:16px;letter-spacing:0.06em">Referencia: ' + (data.gender === 'F' ? 'Feminino' : 'Masculino') + '</div>' +
      '<table style="width:100%;border-collapse:collapse;background:rgba(20,18,16,0.5);border-radius:8px;overflow:hidden">' +
        '<thead><tr style="background:rgba(200,169,126,0.08)">' +
          '<th style="' + head + '">Angulo</th>' +
          '<th style="' + head + '">Medido</th>' +
          '<th style="' + head + '">Ideal</th>' +
          '<th style="' + head + '">Status</th>' +
        '</tr></thead><tbody>' +
          _row('Nasofrontal', a.nasofrontal, ideal.nasofrontal) +
          _row('Nasolabial',  a.nasolabial,  ideal.nasolabial) +
          _row('Nasofacial',  a.nasofacial,  ideal.nasofacial) +
        '</tbody>' +
      '</table>' +
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

  function _perpSigned(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y
    var len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return 0
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len)
    var proj = { x: a.x + t * dx, y: a.y + t * dy }
    var dist = Math.sqrt(Math.pow(p.x - proj.x, 2) + Math.pow(p.y - proj.y, 2))
    var sign = p.x > proj.x ? 1 : -1
    return sign * dist
  }

  function _hitTest(mx, my, points) {
    if (!points || !FM._imgW) return null
    var threshold = 14, closest = null, bestDist = threshold
    Object.keys(points).forEach(function (id) {
      var pt = points[id]
      var d = Math.sqrt(Math.pow(mx - pt.x * FM._imgW, 2) + Math.pow(my - pt.y * FM._imgH, 2))
      if (d < bestDist) { bestDist = d; closest = id }
    })
    return closest
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
