/**
 * ClinicAI — Face Mapping / Analise Facial
 *
 * Editor 2D com canvas overlay para marcar zonas de tratamento
 * no rosto do paciente. Gera report premium para apresentacao.
 *
 * v2: cores por ZONA (mapa anatomico), crop/zoom, labels "ANTES"
 *
 * Expoe globalmente:
 *   FaceMapping.init(leadId)        — abre o editor para um lead
 *   FaceMapping.openFromModal(lead) — abre direto do lead-modal
 */

;(function () {
  'use strict'

  if (window._fmLoaded) return
  window._fmLoaded = true

  // ── Config ────────────────────────────────────────────────

  // Cores por ZONA (igual referencia: cada regiao tem cor unica)
  var ZONES = [
    { id: 'zigoma-lateral',  label: 'Zigoma Lateral',    desc: 'Projecao',           color: '#5B7FC7' },
    { id: 'zigoma-anterior', label: 'Zigoma Anterior',   desc: 'Preenche sombra',    color: '#6BBF8A' },
    { id: 'temporal',        label: 'Temporal',           desc: 'Vetor lifting',      color: '#9B6FC7' },
    { id: 'olheira',         label: 'Olheira',           desc: 'Sombra periorbital',  color: '#7ECF7E' },
    { id: 'sulco',           label: 'Sulco Nasogeniano', desc: 'Suavizacao',          color: '#E8A86B' },
    { id: 'marionete',       label: 'Marionete',         desc: 'Refinamento',         color: '#D98BA3' },
    { id: 'pre-jowl',        label: 'Pre-jowl',         desc: 'Transicao',           color: '#E8B8C8' },
    { id: 'mandibula',       label: 'Mandibula',         desc: 'Contorno',            color: '#C9A96E' },
    { id: 'mento',           label: 'Mento',             desc: 'Projecao',            color: '#D4A857' },
    { id: 'labio',           label: 'Labios',            desc: 'Volume / contorno',   color: '#E07B7B' },
    { id: 'glabela',         label: 'Glabela',           desc: 'Linhas de expressao', color: '#7BA3CF' },
    { id: 'frontal',         label: 'Frontal',           desc: 'Linhas frontais',     color: '#8ECFC4' },
  ]

  var TREATMENTS = [
    { id: 'ah',       label: 'Acido Hialuronico',  color: '#3B82F6' },
    { id: 'bio',      label: 'Bioestimulador',     color: '#10B981' },
    { id: 'laser',    label: 'Laser / Fotona',     color: '#F59E0B' },
    { id: 'botox',    label: 'Toxina Botulinica',  color: '#8B5CF6' },
    { id: 'peel',     label: 'Peeling',            color: '#EC4899' },
    { id: 'fio',      label: 'Fios de PDO',        color: '#06B6D4' },
  ]

  var ANGLES = [
    { id: 'front',   label: 'Frontal' },
    { id: '45',      label: '45\u00B0' },
    { id: 'lateral', label: 'Lateral' },
  ]

  // ── State ─────────────────────────────────────────────────

  var _lead = null
  var _photos = {}        // { front: File|Blob, '45': ..., lateral: ... }
  var _photoUrls = {}     // objectURLs (cropped)
  var _activeAngle = null
  var _annotations = []   // [{ id, angle, zone, treatment, ml, product, shape:{x,y,rx,ry}, side }]
  var _canvas = null
  var _ctx = null
  var _img = null         // current loaded Image
  var _drawing = false
  var _drawStart = null
  var _mode = 'idle'       // idle | draw | move | resize
  var _selAnn = null       // selected annotation for move/resize
  var _moveStart = null    // {x,y} offset when dragging
  var _resizeHandle = null // 'n'|'s'|'e'|'w' edge being dragged
  var _selectedZone = null
  var _selectedTreatment = 'ah'
  var _selectedMl = '0.5'
  var _selectedSide = 'bilateral'
  var _selectedProduct = ''
  var _nextId = 1
  var _doneItems = []
  var _exportCanvas = null

  // Crop state
  var _cropImg = null
  var _cropCanvas = null
  var _cropCtx = null
  var _cropZoom = 1
  var _cropPanX = 0
  var _cropPanY = 0
  var _cropDragging = false
  var _cropDragStart = null
  var _pendingCropAngle = null

  // ── Feather icon helper ───────────────────────────────────

  function _icon(name, size) {
    size = size || 16
    if (window.feather && window.feather.icons[name]) {
      return window.feather.icons[name].toSvg({ width: size, height: size, 'stroke-width': 1.8 })
    }
    return ''
  }

  // ── Zone color helper ─────────────────────────────────────

  function _zoneColor(zoneId) {
    var z = ZONES.find(function (x) { return x.id === zoneId })
    return z ? z.color : '#999'
  }

  // ── Init ──────────────────────────────────────────────────

  function init(leadId) {
    var leads = window.LeadsService ? window.LeadsService.getLocal() : []
    var lead = leads.find(function (l) { return l.id === leadId || l.lead_id === leadId })
    if (!lead) lead = { id: leadId, nome: 'Paciente' }
    _lead = lead
    _photos = {}
    _photoUrls = {}
    _annotations = []
    _doneItems = []
    _activeAngle = null
    _nextId = 1

    if (window.navigateTo) window.navigateTo('facial-analysis')
    setTimeout(function () { _render() }, 100)
  }

  function _restorePage() {
    // Called by sidebar hook on page navigate/reload
    // If we have a lead loaded, just re-render
    if (_lead) {
      _render()
      if (_activeAngle) setTimeout(_initCanvas, 50)
      return
    }
    // No lead — show empty picker state
    var root = document.getElementById('facialAnalysisRoot')
    if (!root) return
    root.innerHTML = '<div class="fm-page">' +
      '<div class="fm-header"><div class="fm-header-left">' +
        '<span class="fm-header-title">Analise Facial</span>' +
      '</div></div>' +
      '<div style="flex:1;display:flex;align-items:center;justify-content:center">' +
        '<div style="text-align:center;color:var(--text-muted)">' +
          _icon('image', 48) +
          '<p style="margin-top:12px;font-size:14px">Abra a ficha de um paciente e<br>clique em <strong>Analise Facial</strong> para comecar.</p>' +
        '</div>' +
      '</div>' +
    '</div>'
    if (window.feather) window.feather.replace()
  }

  function openFromModal(lead) {
    _lead = lead
    _photos = {}
    _photoUrls = {}
    _annotations = []
    _doneItems = []
    _activeAngle = null
    _nextId = 1

    if (window.navigateTo) window.navigateTo('facial-analysis')
    setTimeout(function () { _render() }, 100)
  }

  // ── Render ────────────────────────────────────────────────

  function _render() {
    var root = document.getElementById('facialAnalysisRoot')
    if (!root) return

    var name = _lead.nome || _lead.name || 'Paciente'

    root.innerHTML = '<div class="fm-page">' +
      _renderHeader(name) +
      '<div class="fm-body">' +
        _renderPhotoStrip() +
        _renderCanvasArea() +
        _renderToolbar() +
      '</div>' +
    '</div>'

    _bindEvents()
    if (window.feather) window.feather.replace()
  }

  function _renderHeader(name) {
    return '<div class="fm-header">' +
      '<div class="fm-header-left">' +
        '<span class="fm-header-title">Analise Facial</span>' +
        '<span class="fm-patient-badge">' + _icon('user', 14) + ' ' + _esc(name) + '</span>' +
      '</div>' +
      '<div class="fm-header-actions">' +
        '<button class="fm-btn" onclick="FaceMapping._clearAll()" title="Limpar tudo">' + _icon('trash-2', 14) + ' Limpar</button>' +
        '<button class="fm-btn" onclick="FaceMapping._exportReport()">' + _icon('download', 14) + ' Exportar Report</button>' +
        '<button class="fm-btn fm-btn-primary" onclick="FaceMapping._saveToSupabase()">' + _icon('save', 14) + ' Salvar</button>' +
      '</div>' +
    '</div>'
  }

  function _renderPhotoStrip() {
    var html = '<div class="fm-photo-strip">'

    ANGLES.forEach(function (a) {
      if (_photoUrls[a.id]) {
        html += '<div class="fm-photo-thumb' + (_activeAngle === a.id ? ' active' : '') + '" ' +
          'onclick="FaceMapping._selectAngle(\'' + a.id + '\')">' +
          '<img src="' + _photoUrls[a.id] + '" alt="' + a.label + '">' +
          '<span class="fm-photo-thumb-label">ANTES \u2022 ' + a.label + '</span>' +
          '<div class="fm-photo-actions">' +
            '<button class="fm-photo-action-btn" onclick="event.stopPropagation();FaceMapping._recrop(\'' + a.id + '\')" title="Recortar">' +
              _icon('crop', 11) +
            '</button>' +
            '<button class="fm-photo-action-btn fm-photo-delete-btn" onclick="event.stopPropagation();FaceMapping._deletePhoto(\'' + a.id + '\')" title="Excluir foto">' +
              _icon('trash-2', 11) +
            '</button>' +
          '</div>' +
        '</div>'
      } else {
        html += '<div class="fm-photo-upload" onclick="FaceMapping._triggerUpload(\'' + a.id + '\')">' +
          _icon('camera', 20) +
          '<span>ANTES</span>' +
          '<span style="font-size:9px">' + a.label + '</span>' +
        '</div>'
      }
    })

    html += '<input type="file" id="fmFileInput" accept="image/*" style="display:none">'
    html += '</div>'
    return html
  }

  function _renderCanvasArea() {
    if (!_activeAngle || !_photoUrls[_activeAngle]) {
      return '<div class="fm-canvas-area">' +
        '<div class="fm-empty-state">' +
          _icon('image', 48) +
          '<p>Faca o upload das fotos ANTES<br>para iniciar a analise</p>' +
        '</div>' +
      '</div>'
    }

    return '<div class="fm-canvas-area">' +
      '<div class="fm-canvas-wrap drawing" id="fmCanvasWrap">' +
        '<canvas id="fmCanvas"></canvas>' +
      '</div>' +
    '</div>'
  }

  function _renderToolbar() {
    var html = '<div class="fm-toolbar">'

    // Zone selector — with color dots
    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Zona Anatomica</div>' +
      '<div class="fm-zone-grid">'

    ZONES.forEach(function (z) {
      html += '<button class="fm-zone-btn' + (_selectedZone === z.id ? ' active' : '') + '" ' +
        'onclick="FaceMapping._selectZone(\'' + z.id + '\')" title="' + z.desc + '" ' +
        'data-zone="' + z.id + '">' +
        '<span class="fm-zone-dot" style="background:' + z.color + '"></span>' +
        z.label + '</button>'
    })

    html += '</div></div>'

    // Treatment selector
    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Tratamento</div>' +
      '<select class="fm-select" id="fmTreatment" onchange="FaceMapping._onTreatmentChange(this.value)">'

    TREATMENTS.forEach(function (t) {
      html += '<option value="' + t.id + '"' + (_selectedTreatment === t.id ? ' selected' : '') + '>' + t.label + '</option>'
    })

    html += '</select></div>'

    // mL + Side + Product
    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Detalhes</div>' +
      '<div class="fm-input-row" style="margin-bottom:8px">' +
        '<label>mL</label>' +
        '<input class="fm-input" id="fmMl" type="number" step="0.1" min="0" max="20" value="' + _selectedMl + '" ' +
          'onchange="FaceMapping._selectedMl=this.value" style="width:70px">' +
        '<label>Lado</label>' +
        '<select class="fm-select" id="fmSide" onchange="FaceMapping._selectedSide=this.value" style="width:auto">' +
          '<option value="bilateral"' + (_selectedSide === 'bilateral' ? ' selected' : '') + '>Bilateral</option>' +
          '<option value="esquerdo"' + (_selectedSide === 'esquerdo' ? ' selected' : '') + '>Esquerdo</option>' +
          '<option value="direito"' + (_selectedSide === 'direito' ? ' selected' : '') + '>Direito</option>' +
        '</select>' +
      '</div>' +
      '<input class="fm-input" id="fmProduct" placeholder="Produto (ex: Juvederm Voluma)" value="' + _esc(_selectedProduct) + '" ' +
        'onchange="FaceMapping._selectedProduct=this.value">' +
    '</div>'

    // Annotations list
    html += '<div class="fm-tool-section" style="flex:1">' +
      '<div class="fm-tool-section-title">Marcacoes (' + _annotations.length + ')</div>' +
      '<div class="fm-annotations-list">'

    var angleAnnotations = _annotations.filter(function (a) { return a.angle === _activeAngle })
    if (angleAnnotations.length === 0) {
      html += '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Selecione uma zona e desenhe na foto</div>'
    } else {
      angleAnnotations.forEach(function (ann) {
        var t = TREATMENTS.find(function (x) { return x.id === ann.treatment }) || TREATMENTS[0]
        var z = ZONES.find(function (x) { return x.id === ann.zone })
        var zColor = z ? z.color : '#999'
        html += '<div class="fm-annotation-item">' +
          '<span class="fm-annotation-dot" style="background:' + zColor + '"></span>' +
          '<div class="fm-annotation-info">' +
            '<div class="fm-annotation-zone">' + (z ? z.label : ann.zone) + '</div>' +
            '<div class="fm-annotation-detail">' + t.label + ' \u2022 ' + ann.ml + 'mL' + (ann.product ? ' \u2022 ' + ann.product : '') + '</div>' +
          '</div>' +
          '<button class="fm-annotation-remove" onclick="FaceMapping._removeAnnotation(' + ann.id + ')" title="Remover">&times;</button>' +
        '</div>'
      })
    }

    html += '</div></div>'

    // Total summary
    var totals = _calcTotals()
    if (totals.length > 0) {
      html += '<div class="fm-tool-section">' +
        '<div class="fm-tool-section-title">Resumo Total</div>'
      totals.forEach(function (t) {
        html += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">' +
          '<span style="color:' + t.color + ';font-weight:600">' + t.label + '</span>' +
          '<span style="color:var(--text-primary);font-weight:600">' + t.ml.toFixed(1) + ' mL</span>' +
        '</div>'
      })
      html += '</div>'
    }

    html += '</div>'
    return html
  }

  // ── Canvas ────────────────────────────────────────────────

  function _initCanvas() {
    _canvas = document.getElementById('fmCanvas')
    if (!_canvas || !_photoUrls[_activeAngle]) return

    _ctx = _canvas.getContext('2d')
    _img = new Image()
    _img.onload = function () {
      var maxW = _canvas.parentElement.clientWidth
      var maxH = window.innerHeight - 180
      var scale = Math.min(maxW / _img.width, maxH / _img.height, 1)
      _canvas.width = _img.width * scale
      _canvas.height = _img.height * scale
      _redraw()
    }
    _img.src = _photoUrls[_activeAngle]

    _canvas.addEventListener('mousedown', _onMouseDown)
    _canvas.addEventListener('mousemove', _onMouseMove)
    _canvas.addEventListener('mouseup', _onMouseUp)

    _canvas.addEventListener('touchstart', function (e) {
      e.preventDefault()
      var t = e.touches[0]
      _onMouseDown({ offsetX: t.clientX - _canvas.getBoundingClientRect().left, offsetY: t.clientY - _canvas.getBoundingClientRect().top })
    })
    _canvas.addEventListener('touchmove', function (e) {
      e.preventDefault()
      var t = e.touches[0]
      _onMouseMove({ offsetX: t.clientX - _canvas.getBoundingClientRect().left, offsetY: t.clientY - _canvas.getBoundingClientRect().top })
    })
    _canvas.addEventListener('touchend', function (e) {
      e.preventDefault()
      _onMouseUp()
    })
  }

  function _redraw() {
    if (!_ctx || !_img) return
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height)
    _ctx.drawImage(_img, 0, 0, _canvas.width, _canvas.height)

    var anns = _annotations.filter(function (a) { return a.angle === _activeAngle })
    anns.forEach(function (ann) { _drawEllipse(ann) })

    // Selection handles
    if (_selAnn) {
      var s = _selAnn.shape
      var color = _zoneColor(_selAnn.zone)
      _ctx.save()
      _ctx.strokeStyle = '#fff'
      _ctx.lineWidth = 1.5
      _ctx.setLineDash([5, 3])
      _ctx.beginPath()
      _ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
      _ctx.stroke()
      _ctx.setLineDash([])

      // 4 handles: N, S, E, W
      var handles = _getHandles(s)
      handles.forEach(function (h) {
        _ctx.fillStyle = '#fff'
        _ctx.strokeStyle = color
        _ctx.lineWidth = 2
        _ctx.beginPath()
        _ctx.arc(h.x, h.y, 5, 0, Math.PI * 2)
        _ctx.fill()
        _ctx.stroke()
      })
      _ctx.restore()
    }

    // Draw current shape being drawn
    if (_mode === 'draw' && _drawStart) {
      var drawColor = _zoneColor(_selectedZone)
      _ctx.save()
      _ctx.beginPath()
      _ctx.strokeStyle = drawColor
      _ctx.lineWidth = 2
      _ctx.setLineDash([6, 4])
      var cx = (_drawStart.x + _drawStart.ex) / 2
      var cy = (_drawStart.y + _drawStart.ey) / 2
      var rx = Math.abs(_drawStart.ex - _drawStart.x) / 2
      var ry = Math.abs(_drawStart.ey - _drawStart.y) / 2
      if (rx > 2 && ry > 2) {
        _ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        _ctx.stroke()
      }
      _ctx.restore()
    }
  }

  function _getHandles(s) {
    return [
      { id: 'n', x: s.x,        y: s.y - s.ry },
      { id: 's', x: s.x,        y: s.y + s.ry },
      { id: 'e', x: s.x + s.rx, y: s.y },
      { id: 'w', x: s.x - s.rx, y: s.y },
    ]
  }

  function _hitHandle(x, y) {
    if (!_selAnn) return null
    var handles = _getHandles(_selAnn.shape)
    for (var i = 0; i < handles.length; i++) {
      var dx = x - handles[i].x, dy = y - handles[i].y
      if (dx * dx + dy * dy <= 64) return handles[i].id // radius 8px
    }
    return null
  }

  function _hitEllipse(x, y) {
    var anns = _annotations.filter(function (a) { return a.angle === _activeAngle })
    // Check in reverse order (topmost first)
    for (var i = anns.length - 1; i >= 0; i--) {
      var s = anns[i].shape
      var dx = (x - s.x) / s.rx
      var dy = (y - s.y) / s.ry
      if (dx * dx + dy * dy <= 1) return anns[i]
    }
    return null
  }

  function _drawEllipse(ann) {
    var color = _zoneColor(ann.zone)
    var z = ZONES.find(function (x) { return x.id === ann.zone })
    var t = TREATMENTS.find(function (x) { return x.id === ann.treatment }) || TREATMENTS[0]
    var s = ann.shape

    _ctx.save()

    // Fill — zone color with transparency
    _ctx.beginPath()
    _ctx.fillStyle = color + '70'
    _ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    _ctx.fill()

    // Stroke
    _ctx.beginPath()
    _ctx.strokeStyle = color
    _ctx.lineWidth = 2.5
    _ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    _ctx.stroke()

    // Label
    var label = (z ? z.label : ann.zone)
    var detail = t.label + ' \u2022 ' + ann.ml + 'mL'
    _ctx.font = '600 11px Inter, Montserrat, sans-serif'
    _ctx.textAlign = 'center'

    var tw = Math.max(_ctx.measureText(label).width, _ctx.measureText(detail).width) + 14
    var tx = s.x
    var ty = s.y - s.ry - 20

    // Badge background
    _ctx.fillStyle = 'rgba(0,0,0,0.75)'
    _ctx.beginPath()
    _ctx.roundRect(tx - tw / 2, ty - 11, tw, 32, 5)
    _ctx.fill()

    // Color indicator bar
    _ctx.fillStyle = color
    _ctx.fillRect(tx - tw / 2, ty - 11, 4, 32)

    _ctx.fillStyle = '#fff'
    _ctx.fillText(label, tx, ty + 3)
    _ctx.font = '400 10px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = 'rgba(255,255,255,0.7)'
    _ctx.fillText(detail, tx, ty + 16)

    // Leader line
    _ctx.beginPath()
    _ctx.strokeStyle = color + '80'
    _ctx.lineWidth = 1.5
    _ctx.setLineDash([4, 3])
    _ctx.moveTo(s.x, s.y - s.ry)
    _ctx.lineTo(s.x, ty + 21)
    _ctx.stroke()
    _ctx.setLineDash([])

    _ctx.restore()
  }

  // ── Mouse handlers ────────────────────────────────────────

  function _onMouseDown(e) {
    var mx = e.offsetX, my = e.offsetY

    // 1. Check resize handles on selected annotation
    if (_selAnn) {
      var handle = _hitHandle(mx, my)
      if (handle) {
        _mode = 'resize'
        _resizeHandle = handle
        return
      }
    }

    // 2. Check hit on existing annotation → move
    var hit = _hitEllipse(mx, my)
    if (hit) {
      _selAnn = hit
      _mode = 'move'
      _moveStart = { x: mx - hit.shape.x, y: my - hit.shape.y }
      _canvas.style.cursor = 'grabbing'
      _redraw()
      return
    }

    // 3. Click on empty → deselect
    if (_selAnn && !_selectedZone) {
      _selAnn = null
      _mode = 'idle'
      _redraw()
      return
    }

    // 4. Draw new ellipse (zone must be selected)
    if (_selectedZone) {
      _selAnn = null
      _mode = 'draw'
      _drawing = true
      _drawStart = { x: mx, y: my, ex: mx, ey: my }
    }
  }

  function _onMouseMove(e) {
    var mx = e.offsetX, my = e.offsetY

    if (_mode === 'move' && _selAnn) {
      _selAnn.shape.x = mx - _moveStart.x
      _selAnn.shape.y = my - _moveStart.y
      _redraw()
      return
    }

    if (_mode === 'resize' && _selAnn && _resizeHandle) {
      var s = _selAnn.shape
      switch (_resizeHandle) {
        case 'n': s.ry = Math.max(8, s.y - my); break
        case 's': s.ry = Math.max(8, my - s.y); break
        case 'e': s.rx = Math.max(8, mx - s.x); break
        case 'w': s.rx = Math.max(8, s.x - mx); break
      }
      _redraw()
      return
    }

    if (_mode === 'draw' && _drawStart) {
      _drawStart.ex = mx
      _drawStart.ey = my
      _redraw()
      return
    }

    // Cursor hint
    if (_selAnn && _hitHandle(mx, my)) {
      var h = _hitHandle(mx, my)
      _canvas.style.cursor = (h === 'n' || h === 's') ? 'ns-resize' : 'ew-resize'
    } else if (_hitEllipse(mx, my)) {
      _canvas.style.cursor = 'grab'
    } else {
      _canvas.style.cursor = _selectedZone ? 'crosshair' : 'default'
    }
  }

  function _onMouseUp() {
    if (_mode === 'move' || _mode === 'resize') {
      _mode = 'idle'
      _canvas.style.cursor = _selectedZone ? 'crosshair' : 'default'
      _redraw()
      return
    }

    if (_mode === 'draw' && _drawStart) {
      _drawing = false
      _mode = 'idle'

      var cx = (_drawStart.x + _drawStart.ex) / 2
      var cy = (_drawStart.y + _drawStart.ey) / 2
      var rx = Math.abs(_drawStart.ex - _drawStart.x) / 2
      var ry = Math.abs(_drawStart.ey - _drawStart.y) / 2

      if (rx < 8 || ry < 8) {
        _drawStart = null
        _redraw()
        return
      }

      var mlInput = document.getElementById('fmMl')
      var productInput = document.getElementById('fmProduct')
      var sideSelect = document.getElementById('fmSide')

      var newAnn = {
        id: _nextId++,
        angle: _activeAngle,
        zone: _selectedZone,
        treatment: _selectedTreatment,
        ml: parseFloat(mlInput ? mlInput.value : _selectedMl) || 0.5,
        product: productInput ? productInput.value : _selectedProduct,
        side: sideSelect ? sideSelect.value : _selectedSide,
        shape: { x: cx, y: cy, rx: rx, ry: ry },
      }
      _annotations.push(newAnn)
      _selAnn = newAnn  // auto-select after drawing

      _drawStart = null
      _redraw()
      _refreshToolbar()
    }
  }

  // ── Crop Modal ────────────────────────────────────────────

  function _openCropModal(imgSrc, angle) {
    _pendingCropAngle = angle
    _cropZoom = 1
    _cropPanX = 0
    _cropPanY = 0

    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmCropOverlay'

    var boxW = 360, boxH = 300

    overlay.innerHTML =
      '<div style="background:#fff;border-radius:14px;width:420px;box-shadow:0 24px 80px rgba(0,0,0,0.3);overflow:hidden">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #E8EAF0">' +
          '<span style="font-size:14px;font-weight:600;color:#1A1B2E">Recortar — ANTES ' + (ANGLES.find(function (a) { return a.id === angle }) || {}).label + '</span>' +
          '<button onclick="document.getElementById(\'fmCropOverlay\').remove()" style="width:28px;height:28px;border-radius:50%;background:#F3F4F6;border:none;cursor:pointer;color:#6B7280;display:flex;align-items:center;justify-content:center">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;align-items:center;gap:10px">' +
          '<div id="fmCropBox" style="width:' + boxW + 'px;height:' + boxH + 'px;overflow:hidden;border-radius:8px;border:2px solid #E8EAF0;position:relative;cursor:grab;background:#111">' +
            '<canvas id="fmCropCanvas" style="position:absolute;top:0;left:0"></canvas>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;width:100%">' +
            '<span style="font-size:11px;color:#9CA3AF">Zoom</span>' +
            '<input type="range" id="fmCropZoom" min="0.3" max="3" step="0.02" value="1" style="flex:1">' +
            '<span id="fmCropZoomLabel" style="font-size:11px;color:#9CA3AF;min-width:36px">100%</span>' +
          '</div>' +
          '<div style="display:flex;gap:8px;width:100%">' +
            '<button onclick="document.getElementById(\'fmCropOverlay\').remove()" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:10px 16px;border:1px solid #E8EAF0;border-radius:10px;background:#fff;color:#374151;font-size:13px;font-weight:500;cursor:pointer">Cancelar</button>' +
            '<button id="fmCropConfirm" style="flex:2;display:flex;align-items:center;justify-content:center;gap:5px;padding:10px 16px;border:none;border-radius:10px;background:#C8A97E;color:#fff;font-size:14px;font-weight:600;cursor:pointer">' + _icon('check', 16) + ' Salvar Recorte</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)

    _cropCanvas = document.getElementById('fmCropCanvas')
    _cropCtx = _cropCanvas.getContext('2d')

    _cropImg = new Image()
    _cropImg.onload = function () {
      _cropCanvas.width = boxW
      _cropCanvas.height = boxH

      // Fit cover: fill entire box, no black borders
      var scaleW = boxW / _cropImg.width
      var scaleH = boxH / _cropImg.height
      _cropZoom = Math.max(scaleW, scaleH)

      // Center the image (some parts overflow = crop)
      var drawW = _cropImg.width * _cropZoom
      var drawH = _cropImg.height * _cropZoom
      _cropPanX = (boxW - drawW) / 2
      _cropPanY = (boxH - drawH) / 2

      var slider = document.getElementById('fmCropZoom')
      slider.min = (_cropZoom * 0.5).toFixed(2)
      slider.max = (_cropZoom * 5).toFixed(2)
      slider.value = _cropZoom
      document.getElementById('fmCropZoomLabel').textContent = Math.round(_cropZoom * 100) + '%'

      _cropRedraw()
      _bindCropEvents()
    }
    _cropImg.src = imgSrc
  }

  function _cropRedraw() {
    if (!_cropCtx || !_cropImg) return
    _cropCtx.clearRect(0, 0, _cropCanvas.width, _cropCanvas.height)

    var w = _cropImg.width * _cropZoom
    var h = _cropImg.height * _cropZoom
    _cropCtx.drawImage(_cropImg, _cropPanX, _cropPanY, w, h)
  }

  function _bindCropEvents() {
    var box = document.getElementById('fmCropBox')
    var slider = document.getElementById('fmCropZoom')
    var label = document.getElementById('fmCropZoomLabel')
    var confirm = document.getElementById('fmCropConfirm')

    // Drag to pan
    box.addEventListener('mousedown', function (e) {
      _cropDragging = true
      _cropDragStart = { x: e.clientX - _cropPanX, y: e.clientY - _cropPanY }
      box.style.cursor = 'grabbing'
    })
    document.addEventListener('mousemove', _cropMouseMove)
    document.addEventListener('mouseup', function () {
      _cropDragging = false
      if (box) box.style.cursor = 'grab'
    })

    // Touch drag
    box.addEventListener('touchstart', function (e) {
      e.preventDefault()
      var t = e.touches[0]
      _cropDragging = true
      _cropDragStart = { x: t.clientX - _cropPanX, y: t.clientY - _cropPanY }
    })
    document.addEventListener('touchmove', function (e) {
      if (!_cropDragging) return
      var t = e.touches[0]
      _cropPanX = t.clientX - _cropDragStart.x
      _cropPanY = t.clientY - _cropDragStart.y
      _cropRedraw()
    })
    document.addEventListener('touchend', function () { _cropDragging = false })

    // Zoom slider
    slider.addEventListener('input', function () {
      var oldZoom = _cropZoom
      _cropZoom = parseFloat(this.value)
      label.textContent = Math.round(_cropZoom * 100) + '%'

      // Adjust pan to keep center
      var cx = _cropCanvas.width / 2, cy = _cropCanvas.height / 2
      _cropPanX = cx - (cx - _cropPanX) * (_cropZoom / oldZoom)
      _cropPanY = cy - (cy - _cropPanY) * (_cropZoom / oldZoom)
      _cropRedraw()
    })

    // Confirm crop
    confirm.addEventListener('click', function () {
      // Extract the visible area as a new image
      var outCanvas = document.createElement('canvas')
      outCanvas.width = _cropCanvas.width
      outCanvas.height = _cropCanvas.height
      var outCtx = outCanvas.getContext('2d')
      outCtx.drawImage(_cropCanvas, 0, 0)

      outCanvas.toBlob(function (blob) {
        if (_photoUrls[_pendingCropAngle]) URL.revokeObjectURL(_photoUrls[_pendingCropAngle])
        _photoUrls[_pendingCropAngle] = URL.createObjectURL(blob)
        _photos[_pendingCropAngle] = blob

        if (!_activeAngle) _activeAngle = _pendingCropAngle

        document.getElementById('fmCropOverlay').remove()
        _render()
        if (_activeAngle === _pendingCropAngle) setTimeout(_initCanvas, 50)
      }, 'image/jpeg', 0.92)
    })
  }

  function _cropMouseMove(e) {
    if (!_cropDragging) return
    _cropPanX = e.clientX - _cropDragStart.x
    _cropPanY = e.clientY - _cropDragStart.y
    _cropRedraw()
  }

  function _deletePhoto(angle) {
    if (_photoUrls[angle]) URL.revokeObjectURL(_photoUrls[angle])
    delete _photos[angle]
    delete _photoUrls[angle]
    delete _originalFiles[angle]
    // Remove annotations for this angle
    _annotations = _annotations.filter(function (a) { return a.angle !== angle })
    // Switch to another angle if this was active
    if (_activeAngle === angle) {
      _activeAngle = _photoUrls['front'] ? 'front' : (_photoUrls['45'] ? '45' : (_photoUrls['lateral'] ? 'lateral' : null))
    }
    _selAnn = null
    _render()
    if (_activeAngle) setTimeout(_initCanvas, 50)
  }

  function _recrop(angle) {
    if (!_photoUrls[angle]) return
    // Re-open crop with the original photo if we have it, otherwise current
    var src = _photoUrls[angle]
    // Try to use original file
    if (_photos[angle] && _photos[angle] instanceof File) {
      src = URL.createObjectURL(_photos[angle])
    }
    _openCropModal(src, angle)
  }

  // ── Actions ───────────────────────────────────────────────

  var _pendingUploadAngle = null
  var _originalFiles = {}  // keep originals for re-crop

  function _triggerUpload(angle) {
    _pendingUploadAngle = angle
    var input = document.getElementById('fmFileInput')
    if (input) {
      input.value = ''
      input.click()
    }
  }

  function _bindEvents() {
    var input = document.getElementById('fmFileInput')
    if (input) {
      input.addEventListener('change', function (e) {
        var file = e.target.files[0]
        if (!file || !_pendingUploadAngle) return

        // Store original for re-crop
        _originalFiles[_pendingUploadAngle] = file

        // Open crop modal
        var tempUrl = URL.createObjectURL(file)
        _openCropModal(tempUrl, _pendingUploadAngle)
      })
    }

    if (_activeAngle && _photoUrls[_activeAngle]) {
      setTimeout(_initCanvas, 50)
    }
  }

  function _selectAngle(angle) {
    _activeAngle = angle
    _render()
    setTimeout(_initCanvas, 50)
  }

  function _selectZone(zoneId) {
    _selectedZone = (_selectedZone === zoneId) ? null : zoneId
    var btns = document.querySelectorAll('.fm-zone-btn')
    btns.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-zone') === _selectedZone)
    })
  }

  function _onTreatmentChange(val) {
    _selectedTreatment = val
  }

  function _removeAnnotation(id) {
    _annotations = _annotations.filter(function (a) { return a.id !== id })
    _redraw()
    _refreshToolbar()
  }

  function _clearAll() {
    if (!confirm('Limpar todas as marcacoes?')) return
    _annotations = []
    _redraw()
    _refreshToolbar()
  }

  function _refreshToolbar() {
    var toolbar = document.querySelector('.fm-toolbar')
    if (!toolbar) return
    var temp = document.createElement('div')
    temp.innerHTML = _renderToolbar()
    toolbar.parentNode.replaceChild(temp.firstChild, toolbar)
    if (window.feather) window.feather.replace()
  }

  function _calcTotals() {
    var map = {}
    _annotations.forEach(function (a) {
      if (!map[a.treatment]) {
        var t = TREATMENTS.find(function (x) { return x.id === a.treatment })
        map[a.treatment] = { label: t ? t.label : a.treatment, color: t ? t.color : '#999', ml: 0 }
      }
      map[a.treatment].ml += a.ml
    })
    return Object.values(map)
  }

  // ── Export Report ─────────────────────────────────────────

  function _exportReport() {
    if (_annotations.length === 0) {
      alert('Adicione marcacoes antes de exportar.')
      return
    }

    var name = _lead.nome || _lead.name || 'Paciente'
    var totals = _calcTotals()
    var totalMl = totals.reduce(function (s, t) { return s + t.ml }, 0)

    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmExportOverlay'

    var html = '<div class="fm-export-modal">' +
      '<div class="fm-export-header">' +
        '<h3>Report de Analise Facial</h3>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="fm-btn fm-btn-primary" onclick="FaceMapping._downloadReport()">'+
            _icon('download', 14) + ' Baixar PNG</button>' +
          '<button class="fm-btn" onclick="FaceMapping._closeExport()">' +
            _icon('x', 14) + ' Fechar</button>' +
        '</div>' +
      '</div>' +
      '<div class="fm-export-body">' +
        '<div class="fm-report" id="fmReportCard">' +

          '<div class="fm-report-header">' +
            '<div class="fm-report-brand">Clinica Mirian de Paula</div>' +
            '<div class="fm-report-subtitle">Plano de Tratamento Facial</div>' +
            '<div class="fm-report-patient">' + _esc(name) + ' \u2022 ' + _formatDate(new Date()) + '</div>' +
          '</div>' +

          // Photos row — labeled ANTES
          '<div class="fm-report-photos">'

    ANGLES.forEach(function (a) {
      html += '<div class="fm-report-photo-cell">'
      if (_photoUrls[a.id]) {
        html += '<canvas id="fmReportCanvas_' + a.id + '"></canvas>'
      } else {
        html += '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.3);font-size:12px">Sem foto</div>'
      }
      html += '<span class="fm-report-photo-label">ANTES \u2022 ' + a.label + '</span></div>'
    })

    html += '</div>' +

      '<div class="fm-report-panels">' +

        '<div class="fm-report-panel">' +
          '<div class="fm-report-panel-title">O Que Falta Para o Resultado</div>' +
          _renderDonePanel() +
        '</div>' +

        '<div class="fm-report-panel" style="padding:12px">' +
          '<div class="fm-report-panel-title" style="padding:0 12px">Mapa de Tratamento</div>' +
          '<div class="fm-report-center-photo">' +
            '<canvas id="fmReportCenterCanvas"></canvas>' +
          '</div>' +
        '</div>' +

        '<div class="fm-report-panel">' +
          '<div class="fm-report-panel-title">Resultado Esperado</div>' +
          _renderExpectedPanel() +
        '</div>' +

      '</div>' +

      '<div class="fm-report-summary">'

    totals.forEach(function (t) {
      html += '<div class="fm-report-stat">' +
        '<div class="fm-report-stat-value" style="color:' + t.color + '">' + t.ml.toFixed(1) + '</div>' +
        '<div class="fm-report-stat-label">' + t.label + ' (mL)</div>' +
      '</div>'
    })

    html += '<div class="fm-report-stat">' +
      '<div class="fm-report-stat-value">' + totalMl.toFixed(1) + '</div>' +
      '<div class="fm-report-stat-label">Total mL</div>' +
    '</div>' +
    '<div class="fm-report-stat">' +
      '<div class="fm-report-stat-value">' + _annotations.length + '</div>' +
      '<div class="fm-report-stat-label">Zonas Tratadas</div>' +
    '</div>'

    html += '</div></div></div></div>'
    overlay.innerHTML = html
    document.body.appendChild(overlay)

    setTimeout(function () { _renderReportCanvases() }, 100)
  }

  function _renderDonePanel() {
    var html = ''
    var uniqueZones = []
    _annotations.forEach(function (a) {
      if (uniqueZones.indexOf(a.zone) === -1) uniqueZones.push(a.zone)
    })
    uniqueZones.forEach(function (zId) {
      var z = ZONES.find(function (x) { return x.id === zId })
      var anns = _annotations.filter(function (a) { return a.zone === zId })
      var desc = anns.map(function (a) {
        var t = TREATMENTS.find(function (x) { return x.id === a.treatment })
        return (t ? t.label : '') + ' ' + a.ml + 'mL'
      }).join(', ')
      var color = z ? z.color : '#C8A97E'

      html += '<div class="fm-report-check">' +
        '<span class="fm-report-check-icon" style="background:' + color + '">' + _svgCheck() + '</span>' +
        '<div class="fm-report-check-text">' +
          '<strong>' + (z ? z.label : zId) + '</strong>' +
          '<span>' + (z ? z.desc : '') + '</span>' +
        '</div>' +
      '</div>'
    })

    return html || '<div style="font-size:12px;color:rgba(245,240,232,0.4)">Nenhuma zona marcada</div>'
  }

  function _renderExpectedPanel() {
    var results = {
      'zigoma-lateral':  { title: 'Terco medio elevado', desc: 'Efeito lifting natural' },
      'zigoma-anterior': { title: 'Olhar iluminado', desc: 'Sombra preenchida' },
      'temporal':        { title: 'Vetor de sustentacao', desc: 'Lifting sem cirurgia' },
      'olheira':         { title: 'Olhar mais descansado', desc: 'Sombra tratada' },
      'sulco':           { title: 'Sulco suavizado', desc: 'Sem excesso de volume' },
      'marionete':       { title: 'Expressao mais leve', desc: 'Refinamento da marionete' },
      'pre-jowl':        { title: 'Transicao suave', desc: 'Contorno mandibular continuo' },
      'mandibula':       { title: 'Mandibula definida', desc: 'Contorno continuo' },
      'mento':           { title: 'Mento harmonizado', desc: 'Projecao ideal' },
      'labio':           { title: 'Labios naturais', desc: 'Volume harmonico' },
      'glabela':         { title: 'Glabela relaxada', desc: 'Sem linhas de expressao' },
      'frontal':         { title: 'Face mais leve', desc: 'Triangulo invertido restaurado' },
    }

    var html = ''
    var seen = []
    _annotations.forEach(function (a) {
      if (seen.indexOf(a.zone) !== -1) return
      seen.push(a.zone)
      var r = results[a.zone] || { title: a.zone, desc: '' }
      var z = ZONES.find(function (x) { return x.id === a.zone })
      html += '<div class="fm-report-check">' +
        '<span class="fm-report-check-icon" style="background:' + (z ? z.color : '#8A9E88') + '">' + _svgCheck() + '</span>' +
        '<div class="fm-report-check-text">' +
          '<strong>' + r.title + '</strong>' +
          '<span>' + r.desc + '</span>' +
        '</div>' +
      '</div>'
    })

    return html || '<div style="font-size:12px;color:rgba(245,240,232,0.4)">Adicione marcacoes</div>'
  }

  function _renderReportCanvases() {
    ANGLES.forEach(function (a) {
      var rc = document.getElementById('fmReportCanvas_' + a.id)
      if (!rc || !_photoUrls[a.id]) return

      var img = new Image()
      img.onload = function () {
        var scale = 400 / img.width
        rc.width = 400
        rc.height = img.height * scale
        var ctx = rc.getContext('2d')
        ctx.drawImage(img, 0, 0, rc.width, rc.height)

        var anns = _annotations.filter(function (ann) { return ann.angle === a.id })
        var origScale = _canvas ? (rc.width / _canvas.width) : 1
        anns.forEach(function (ann) {
          _drawEllipseOn(ctx, _scaleAnn(ann, origScale))
        })
      }
      img.src = _photoUrls[a.id]
    })

    var centerAngle = _photoUrls['45'] ? '45' : (_photoUrls['front'] ? 'front' : 'lateral')
    var cc = document.getElementById('fmReportCenterCanvas')
    if (!cc || !_photoUrls[centerAngle]) return

    var cImg = new Image()
    cImg.onload = function () {
      var scale = 500 / cImg.width
      cc.width = 500
      cc.height = cImg.height * scale
      var ctx = cc.getContext('2d')
      ctx.drawImage(cImg, 0, 0, cc.width, cc.height)

      var anns = _annotations.filter(function (ann) { return ann.angle === centerAngle })
      var origScale = _canvas ? (cc.width / _canvas.width) : 1
      anns.forEach(function (ann) {
        _drawEllipseOn(ctx, _scaleAnn(ann, origScale))
      })
    }
    cImg.src = _photoUrls[centerAngle]
  }

  function _scaleAnn(ann, s) {
    return {
      id: ann.id, angle: ann.angle, zone: ann.zone, treatment: ann.treatment,
      ml: ann.ml, product: ann.product, side: ann.side,
      shape: { x: ann.shape.x * s, y: ann.shape.y * s, rx: ann.shape.rx * s, ry: ann.shape.ry * s }
    }
  }

  function _drawEllipseOn(ctx, ann) {
    var color = _zoneColor(ann.zone)
    var z = ZONES.find(function (x) { return x.id === ann.zone })
    var t = TREATMENTS.find(function (x) { return x.id === ann.treatment }) || TREATMENTS[0]
    var s = ann.shape

    ctx.save()
    ctx.beginPath()
    ctx.fillStyle = color + '70'
    ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    ctx.stroke()

    var label = (z ? z.label : ann.zone)
    var detail = t.label + ' \u2022 ' + ann.ml + 'mL'
    ctx.font = '600 11px Inter, Montserrat, sans-serif'
    ctx.textAlign = 'center'

    var tw = Math.max(ctx.measureText(label).width, ctx.measureText(detail).width) + 14
    var tx = s.x
    var ty = s.y - s.ry - 20

    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.beginPath()
    ctx.roundRect(tx - tw / 2, ty - 11, tw, 32, 5)
    ctx.fill()

    ctx.fillStyle = color
    ctx.fillRect(tx - tw / 2, ty - 11, 4, 32)

    ctx.fillStyle = '#fff'
    ctx.fillText(label, tx, ty + 3)
    ctx.font = '400 10px Inter, Montserrat, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(detail, tx, ty + 16)

    ctx.beginPath()
    ctx.strokeStyle = color + '80'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.moveTo(s.x, s.y - s.ry)
    ctx.lineTo(s.x, ty + 21)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.restore()
  }

  function _downloadReport() {
    var report = document.getElementById('fmReportCard')
    if (!report) return

    if (window.html2canvas) {
      window.html2canvas(report, {
        backgroundColor: '#2C2C2C',
        scale: 2,
        useCORS: true,
      }).then(function (canvas) {
        var link = document.createElement('a')
        var name = (_lead.nome || _lead.name || 'paciente').replace(/\s+/g, '-').toLowerCase()
        link.download = 'analise-facial-' + name + '-' + _dateStr() + '.png'
        link.href = canvas.toDataURL('image/png')
        link.click()
      })
    } else {
      var cc = document.getElementById('fmReportCenterCanvas')
      if (cc) {
        var link = document.createElement('a')
        var name = (_lead.nome || _lead.name || 'paciente').replace(/\s+/g, '-').toLowerCase()
        link.download = 'mapa-facial-' + name + '-' + _dateStr() + '.png'
        link.href = cc.toDataURL('image/png')
        link.click()
      }
    }
  }

  function _closeExport() {
    var overlay = document.getElementById('fmExportOverlay')
    if (overlay) overlay.remove()
  }

  // ── Save to Supabase ──────────────────────────────────────

  function _saveToSupabase() {
    if (!_lead || !_lead.id) {
      alert('Nenhum paciente selecionado.')
      return
    }

    var data = {
      lead_id: _lead.id || _lead.lead_id,
      session_date: new Date().toISOString().split('T')[0],
      annotations: _annotations.map(function (a) {
        return {
          zone: a.zone, treatment: a.treatment, ml: a.ml,
          product: a.product, side: a.side, angle: a.angle, shape: a.shape,
        }
      }),
      totals: _calcTotals(),
      done_items: _doneItems,
    }

    try {
      var key = 'fm_sessions_' + (data.lead_id)
      var sessions = JSON.parse(localStorage.getItem(key) || '[]')
      sessions.push(data)
      localStorage.setItem(key, JSON.stringify(sessions))
    } catch (e) { /* ignore */ }

    if (window._sbShared) {
      window._sbShared.rpc('upsert_facial_analysis', { p_data: data })
        .then(function (res) {
          if (res.error) console.error('[FaceMapping] Save error:', res.error)
        })
        .catch(function (err) { console.error('[FaceMapping] Save failed:', err) })
    }

    var btn = document.querySelector('.fm-btn-primary')
    if (btn) {
      var orig = btn.innerHTML
      btn.innerHTML = _icon('check', 14) + ' Salvo!'
      btn.style.background = '#10B981'
      btn.style.borderColor = '#10B981'
      setTimeout(function () {
        btn.innerHTML = orig
        btn.style.background = ''
        btn.style.borderColor = ''
      }, 2000)
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  function _esc(s) {
    var d = document.createElement('div')
    d.textContent = s || ''
    return d.innerHTML
  }

  function _formatDate(d) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  function _dateStr() {
    return new Date().toISOString().split('T')[0]
  }

  function _svgCheck() {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
  }

  // ── Public API ────────────────────────────────────────────

  window.FaceMapping = {
    init: init,
    openFromModal: openFromModal,

    _restorePage: _restorePage,
    _selectAngle: _selectAngle,
    _selectZone: _selectZone,
    _onTreatmentChange: _onTreatmentChange,
    _triggerUpload: _triggerUpload,
    _removeAnnotation: _removeAnnotation,
    _clearAll: _clearAll,
    _exportReport: _exportReport,
    _downloadReport: _downloadReport,
    _closeExport: _closeExport,
    _saveToSupabase: _saveToSupabase,
    _recrop: _recrop,
    _deletePhoto: _deletePhoto,

    get _selectedMl() { return _selectedMl },
    set _selectedMl(v) { _selectedMl = v },
    get _selectedSide() { return _selectedSide },
    set _selectedSide(v) { _selectedSide = v },
    get _selectedProduct() { return _selectedProduct },
    set _selectedProduct(v) { _selectedProduct = v },
  }

})()
