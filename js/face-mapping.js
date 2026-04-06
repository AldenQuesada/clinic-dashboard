/**
 * ClinicAI — Face Mapping / Analise Facial
 *
 * Editor 2D com canvas overlay para marcar zonas de tratamento
 * no rosto do paciente. Gera report premium para apresentacao.
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

  var ZONES = [
    { id: 'zigoma-lateral',  label: 'Zigoma Lateral',  desc: 'Projecao' },
    { id: 'zigoma-anterior', label: 'Zigoma Anterior', desc: 'Preenche sombra' },
    { id: 'temporal',        label: 'Temporal',        desc: 'Vetor lifting' },
    { id: 'olheira',         label: 'Olheira',         desc: 'Sombra periorbital' },
    { id: 'sulco',           label: 'Sulco Nasogeniano', desc: 'Suavizacao' },
    { id: 'marionete',       label: 'Marionete',       desc: 'Refinamento' },
    { id: 'pre-jowl',        label: 'Pre-jowl',        desc: 'Transicao' },
    { id: 'mandibula',       label: 'Mandibula',       desc: 'Contorno' },
    { id: 'mento',           label: 'Mento',           desc: 'Projecao' },
    { id: 'labio',           label: 'Labios',          desc: 'Volume / contorno' },
    { id: 'glabela',         label: 'Glabela',         desc: 'Linhas de expressao' },
    { id: 'frontal',         label: 'Frontal',         desc: 'Linhas frontais' },
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
  var _photoUrls = {}     // objectURLs
  var _activeAngle = null
  var _annotations = []   // [{ id, angle, zone, treatment, ml, product, shape:{x,y,rx,ry}, side }]
  var _canvas = null
  var _ctx = null
  var _img = null         // current loaded Image
  var _drawing = false
  var _drawStart = null
  var _selectedZone = null
  var _selectedTreatment = 'ah'
  var _selectedMl = '0.5'
  var _selectedSide = 'bilateral'
  var _selectedProduct = ''
  var _nextId = 1
  var _doneItems = []     // checklist items marked done
  var _exportCanvas = null

  // ── Feather icon helper ───────────────────────────────────

  function _icon(name, size) {
    size = size || 16
    if (window.feather && window.feather.icons[name]) {
      return window.feather.icons[name].toSvg({ width: size, height: size, 'stroke-width': 1.8 })
    }
    return ''
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

    // Navigate to the page
    if (window.navigateTo) window.navigateTo('facial-analysis')

    setTimeout(function () { _render() }, 100)
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
          '<span class="fm-photo-thumb-label">' + a.label + '</span>' +
        '</div>'
      } else {
        html += '<div class="fm-photo-upload" onclick="FaceMapping._triggerUpload(\'' + a.id + '\')">' +
          _icon('camera', 20) +
          '<span>' + a.label + '</span>' +
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
          '<p>Faca o upload das fotos<br>para iniciar a analise</p>' +
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

    // Zone selector
    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Zona Anatomica</div>' +
      '<div class="fm-zone-grid">'

    ZONES.forEach(function (z) {
      html += '<button class="fm-zone-btn' + (_selectedZone === z.id ? ' active' : '') + '" ' +
        'onclick="FaceMapping._selectZone(\'' + z.id + '\')" title="' + z.desc + '">' +
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
      html += '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Desenhe elipses na foto para marcar zonas</div>'
    } else {
      angleAnnotations.forEach(function (ann) {
        var t = TREATMENTS.find(function (x) { return x.id === ann.treatment }) || TREATMENTS[0]
        var z = ZONES.find(function (x) { return x.id === ann.zone })
        html += '<div class="fm-annotation-item">' +
          '<span class="fm-annotation-dot" style="background:' + t.color + '"></span>' +
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
      // Scale to fit
      var maxW = _canvas.parentElement.clientWidth
      var maxH = window.innerHeight - 180
      var scale = Math.min(maxW / _img.width, maxH / _img.height, 1)
      _canvas.width = _img.width * scale
      _canvas.height = _img.height * scale
      _redraw()
    }
    _img.src = _photoUrls[_activeAngle]

    // Drawing events
    _canvas.addEventListener('mousedown', _onMouseDown)
    _canvas.addEventListener('mousemove', _onMouseMove)
    _canvas.addEventListener('mouseup', _onMouseUp)

    // Touch support
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

    // Draw existing annotations for this angle
    var anns = _annotations.filter(function (a) { return a.angle === _activeAngle })
    anns.forEach(function (ann) {
      _drawEllipse(ann)
    })

    // Draw current shape being drawn
    if (_drawing && _drawStart) {
      var t = TREATMENTS.find(function (x) { return x.id === _selectedTreatment }) || TREATMENTS[0]
      _ctx.save()
      _ctx.beginPath()
      _ctx.strokeStyle = t.color
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

  function _drawEllipse(ann) {
    var t = TREATMENTS.find(function (x) { return x.id === ann.treatment }) || TREATMENTS[0]
    var z = ZONES.find(function (x) { return x.id === ann.zone })
    var s = ann.shape

    _ctx.save()

    // Fill
    _ctx.beginPath()
    _ctx.fillStyle = t.color + '60'
    _ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    _ctx.fill()

    // Stroke
    _ctx.beginPath()
    _ctx.strokeStyle = t.color
    _ctx.lineWidth = 2
    _ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    _ctx.stroke()

    // Label
    var label = (z ? z.label : ann.zone)
    var detail = ann.ml + 'mL'
    _ctx.font = '600 11px Inter, Montserrat, sans-serif'
    _ctx.textAlign = 'center'

    // Background for text
    var tw = Math.max(_ctx.measureText(label).width, _ctx.measureText(detail).width) + 12
    var tx = s.x
    var ty = s.y - s.ry - 18

    _ctx.fillStyle = 'rgba(0,0,0,0.7)'
    _ctx.beginPath()
    _ctx.roundRect(tx - tw / 2, ty - 10, tw, 28, 4)
    _ctx.fill()

    _ctx.fillStyle = '#fff'
    _ctx.fillText(label, tx, ty + 2)
    _ctx.font = '400 10px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = t.color
    _ctx.fillText(detail, tx, ty + 14)

    // Leader line
    _ctx.beginPath()
    _ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    _ctx.lineWidth = 1
    _ctx.setLineDash([3, 3])
    _ctx.moveTo(s.x, s.y - s.ry)
    _ctx.lineTo(s.x, ty + 18)
    _ctx.stroke()
    _ctx.setLineDash([])

    _ctx.restore()
  }

  // ── Mouse handlers ────────────────────────────────────────

  function _onMouseDown(e) {
    if (!_selectedZone) return
    _drawing = true
    _drawStart = { x: e.offsetX, y: e.offsetY, ex: e.offsetX, ey: e.offsetY }
  }

  function _onMouseMove(e) {
    if (!_drawing || !_drawStart) return
    _drawStart.ex = e.offsetX
    _drawStart.ey = e.offsetY
    _redraw()
  }

  function _onMouseUp() {
    if (!_drawing || !_drawStart) return
    _drawing = false

    var cx = (_drawStart.x + _drawStart.ex) / 2
    var cy = (_drawStart.y + _drawStart.ey) / 2
    var rx = Math.abs(_drawStart.ex - _drawStart.x) / 2
    var ry = Math.abs(_drawStart.ey - _drawStart.y) / 2

    // Minimum size guard
    if (rx < 8 || ry < 8) {
      _drawStart = null
      _redraw()
      return
    }

    // Read current values from inputs
    var mlInput = document.getElementById('fmMl')
    var productInput = document.getElementById('fmProduct')
    var sideSelect = document.getElementById('fmSide')

    _annotations.push({
      id: _nextId++,
      angle: _activeAngle,
      zone: _selectedZone,
      treatment: _selectedTreatment,
      ml: parseFloat(mlInput ? mlInput.value : _selectedMl) || 0.5,
      product: productInput ? productInput.value : _selectedProduct,
      side: sideSelect ? sideSelect.value : _selectedSide,
      shape: { x: cx, y: cy, rx: rx, ry: ry },
    })

    _drawStart = null
    _redraw()
    _refreshToolbar()
  }

  // ── Actions ───────────────────────────────────────────────

  var _pendingUploadAngle = null

  function _triggerUpload(angle) {
    _pendingUploadAngle = angle
    var input = document.getElementById('fmFileInput')
    if (input) input.click()
  }

  function _bindEvents() {
    var input = document.getElementById('fmFileInput')
    if (input) {
      input.addEventListener('change', function (e) {
        var file = e.target.files[0]
        if (!file || !_pendingUploadAngle) return
        _photos[_pendingUploadAngle] = file
        if (_photoUrls[_pendingUploadAngle]) URL.revokeObjectURL(_photoUrls[_pendingUploadAngle])
        _photoUrls[_pendingUploadAngle] = URL.createObjectURL(file)

        if (!_activeAngle) _activeAngle = _pendingUploadAngle
        _render()

        // Re-init canvas if this angle is active
        if (_activeAngle === _pendingUploadAngle) {
          setTimeout(_initCanvas, 50)
        }
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
    // Update active state
    var btns = document.querySelectorAll('.fm-zone-btn')
    btns.forEach(function (btn) {
      btn.classList.toggle('active', btn.textContent.trim() ===
        (ZONES.find(function (z) { return z.id === zoneId }) || {}).label)
    })
    if (_selectedZone === null) {
      btns.forEach(function (b) { b.classList.remove('active') })
    }
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
    // Re-render just the toolbar section
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

    // Build report overlay
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

          // Header
          '<div class="fm-report-header">' +
            '<div class="fm-report-brand">Clinica Mirian de Paula</div>' +
            '<div class="fm-report-subtitle">Plano de Tratamento Facial</div>' +
            '<div class="fm-report-patient">' + _esc(name) + ' \u2022 ' + _formatDate(new Date()) + '</div>' +
          '</div>' +

          // Photos row
          '<div class="fm-report-photos">'

    ANGLES.forEach(function (a) {
      html += '<div class="fm-report-photo-cell">'
      if (_photoUrls[a.id]) {
        html += '<canvas id="fmReportCanvas_' + a.id + '"></canvas>'
      } else {
        html += '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.3);font-size:12px">Sem foto</div>'
      }
      html += '<span class="fm-report-photo-label">' + a.label + '</span></div>'
    })

    html += '</div>' +

      // Bottom panels
      '<div class="fm-report-panels">' +

        // Left: Done items
        '<div class="fm-report-panel">' +
          '<div class="fm-report-panel-title">O Que Ja Foi Feito</div>' +
          _renderDonePanel() +
        '</div>' +

        // Center: annotated photo (45 or first available)
        '<div class="fm-report-panel" style="padding:12px">' +
          '<div class="fm-report-panel-title" style="padding:0 12px">Mapa de Tratamento</div>' +
          '<div class="fm-report-center-photo">' +
            '<canvas id="fmReportCenterCanvas"></canvas>' +
          '</div>' +
        '</div>' +

        // Right: expected results
        '<div class="fm-report-panel">' +
          '<div class="fm-report-panel-title">Resultado Esperado</div>' +
          _renderExpectedPanel() +
        '</div>' +

      '</div>' +

      // Summary bar
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

    // Render canvases in the report
    setTimeout(function () { _renderReportCanvases() }, 100)
  }

  function _renderDonePanel() {
    // Group annotations already applied (user marks as "done")
    var html = ''
    var doneZones = _doneItems.length > 0 ? _doneItems : []

    if (doneZones.length === 0) {
      // Show all annotations as pending check items
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

        html += '<div class="fm-report-check">' +
          '<span class="fm-report-check-icon pending">' + _svgCheck() + '</span>' +
          '<div class="fm-report-check-text">' +
            '<strong>' + (z ? z.label : zId) + '</strong>' +
            '<span>' + desc + '</span>' +
          '</div>' +
        '</div>'
      })
    }

    return html || '<div style="font-size:12px;color:rgba(245,240,232,0.4)">Nenhum item marcado</div>'
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
      html += '<div class="fm-report-check">' +
        '<span class="fm-report-check-icon done">' + _svgCheck() + '</span>' +
        '<div class="fm-report-check-text">' +
          '<strong>' + r.title + '</strong>' +
          '<span>' + r.desc + '</span>' +
        '</div>' +
      '</div>'
    })

    return html || '<div style="font-size:12px;color:rgba(245,240,232,0.4)">Adicione marcacoes</div>'
  }

  function _renderReportCanvases() {
    // Render each angle photo into its report canvas
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

        // Draw annotations for this angle scaled
        var anns = _annotations.filter(function (ann) { return ann.angle === a.id })
        var origScale = _canvas ? (rc.width / _canvas.width) : 1
        anns.forEach(function (ann) {
          var scaled = {
            id: ann.id, angle: ann.angle, zone: ann.zone, treatment: ann.treatment,
            ml: ann.ml, product: ann.product, side: ann.side,
            shape: {
              x: ann.shape.x * origScale, y: ann.shape.y * origScale,
              rx: ann.shape.rx * origScale, ry: ann.shape.ry * origScale,
            }
          }
          _drawEllipseOn(ctx, scaled)
        })
      }
      img.src = _photoUrls[a.id]
    })

    // Center canvas: use 45 or first available
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
        var scaled = {
          id: ann.id, angle: ann.angle, zone: ann.zone, treatment: ann.treatment,
          ml: ann.ml, product: ann.product, side: ann.side,
          shape: {
            x: ann.shape.x * origScale, y: ann.shape.y * origScale,
            rx: ann.shape.rx * origScale, ry: ann.shape.ry * origScale,
          }
        }
        _drawEllipseOn(ctx, scaled)
      })
    }
    cImg.src = _photoUrls[centerAngle]
  }

  function _drawEllipseOn(ctx, ann) {
    var t = TREATMENTS.find(function (x) { return x.id === ann.treatment }) || TREATMENTS[0]
    var z = ZONES.find(function (x) { return x.id === ann.zone })
    var s = ann.shape

    ctx.save()
    ctx.beginPath()
    ctx.fillStyle = t.color + '60'
    ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.strokeStyle = t.color
    ctx.lineWidth = 2
    ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    ctx.stroke()

    var label = (z ? z.label : ann.zone)
    var detail = ann.ml + 'mL'
    ctx.font = '600 11px Inter, Montserrat, sans-serif'
    ctx.textAlign = 'center'

    var tw = Math.max(ctx.measureText(label).width, ctx.measureText(detail).width) + 12
    var tx = s.x
    var ty = s.y - s.ry - 18

    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.beginPath()
    ctx.roundRect(tx - tw / 2, ty - 10, tw, 28, 4)
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.fillText(label, tx, ty + 2)
    ctx.font = '400 10px Inter, Montserrat, sans-serif'
    ctx.fillStyle = t.color
    ctx.fillText(detail, tx, ty + 14)

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.moveTo(s.x, s.y - s.ry)
    ctx.lineTo(s.x, ty + 18)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.restore()
  }

  function _downloadReport() {
    var report = document.getElementById('fmReportCard')
    if (!report) return

    // Use html2canvas if available, otherwise manual canvas export
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
      // Fallback: screenshot just the center annotated canvas
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
          zone: a.zone,
          treatment: a.treatment,
          ml: a.ml,
          product: a.product,
          side: a.side,
          angle: a.angle,
          shape: a.shape,
        }
      }),
      totals: _calcTotals(),
      done_items: _doneItems,
    }

    // Save to localStorage first (offline fallback)
    try {
      var key = 'fm_sessions_' + (data.lead_id)
      var sessions = JSON.parse(localStorage.getItem(key) || '[]')
      sessions.push(data)
      localStorage.setItem(key, JSON.stringify(sessions))
    } catch (e) { /* ignore */ }

    // Supabase save (async, fire-and-forget)
    if (window._sbShared) {
      window._sbShared.rpc('upsert_facial_analysis', { p_data: data })
        .then(function (res) {
          if (res.error) console.error('[FaceMapping] Save error:', res.error)
        })
        .catch(function (err) { console.error('[FaceMapping] Save failed:', err) })
    }

    // Visual feedback
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

    // Internal (called from onclick)
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

    // Exposed state for inline handlers
    get _selectedMl() { return _selectedMl },
    set _selectedMl(v) { _selectedMl = v },
    get _selectedSide() { return _selectedSide },
    set _selectedSide(v) { _selectedSide = v },
    get _selectedProduct() { return _selectedProduct },
    set _selectedProduct(v) { _selectedProduct = v },
  }

})()
