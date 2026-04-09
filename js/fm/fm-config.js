/**
 * fm-config.js,Zone definitions, treatments, angles, presets, icons
 * Creates window._FM shared state object
 */
;(function () {
  'use strict'

  if (window._FM) return
  window._FM = {}
  var FM = window._FM

  // Polyfill: CanvasRenderingContext2D.roundRect (Safari, older browsers)
  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (typeof r === 'number') r = [r, r, r, r]
      var tl = r[0] || 0
      this.moveTo(x + tl, y)
      this.lineTo(x + w - tl, y)
      this.arcTo(x + w, y, x + w, y + tl, tl)
      this.lineTo(x + w, y + h - tl)
      this.arcTo(x + w, y + h, x + w - tl, y + h, tl)
      this.lineTo(x + tl, y + h)
      this.arcTo(x, y + h, x, y + h - tl, tl)
      this.lineTo(x, y + tl)
      this.arcTo(x, y, x + tl, y, tl)
      this.closePath()
      return this
    }
  }

  // ── Python Facial API URL ──────────────────────────────────
  // Local dev: http://localhost:8100
  // Production: set via FM.FACIAL_API_URL = 'https://facial-api.easypanel.host'
  FM.FACIAL_API_URL = localStorage.getItem('fm_api_url') || 'http://localhost:8107'

  // Auto-fix stale localStorage URL (old port references)
  if (FM.FACIAL_API_URL && FM.FACIAL_API_URL.indexOf('localhost') !== -1 && FM.FACIAL_API_URL.indexOf(':8107') === -1) {
    FM.FACIAL_API_URL = 'http://localhost:8107'
    localStorage.setItem('fm_api_url', FM.FACIAL_API_URL)
  }

  // API v2 endpoint paths
  FM.API = {
    // Core (legacy)
    removeBg:       '/remove-bg',
    landmarks:      '/landmarks',
    analyzeSkin:    '/analyze-skin',
    autoZones:      '/auto-zones',
    collagenScore:  '/collagen-score',
    recommendProtocol: '/recommend-protocol',
    // v2: Enhancement
    normalize:      '/enhance/normalize',
    enhanceFull:    '/enhance/full',
    segmentSkin:    '/enhance/segment-skin',
    quality:        '/enhance/quality',
    capabilities:   '/enhance/capabilities',
    // v2: Scanner (478 landmarks)
    scanFace:       '/scanner/scan-face',
    measure:        '/scanner/measure',
    classifyFace:   '/scanner/classify-face',
    zoneCenters:    '/scanner/zone-centers',
    // v2: Skin Analysis
    skinAnalyze:    '/skin/analyze',
    skinHeatmap:    '/skin/heatmap',
    skinZoneReport: '/skin/zone-report',
    // v2: Simulation
    simulatePreview: '/simulate/preview',
    simulateCompare: '/simulate/compare',
  }

  // ── Zone categories ────────────────────────────────────────
  // cat: 'fill' (preenchimento, mL) or 'tox' (rugas/toxina, U)
  // min/max: default ranges (editable, saved to localStorage)

  FM.ZONES_DEFAULT = [
    // Preenchimento (mL),product, reticulation, defaultQty pre-filled
    { id: 'zigoma-lateral',  label: 'Zigoma Lateral',    desc: 'Projecao',            color: '#5B7FC7', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah', defaultProduct: 'Juvederm Voluma', reticulation: 'Retrolinear canula', defaultQty: 1.0 },
    { id: 'zigoma-anterior', label: 'Zigoma Anterior',   desc: 'Preenche sombra',     color: '#6BBF8A', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.0, defaultTx: 'ah', defaultProduct: 'Juvederm Voluma', reticulation: 'Retrolinear canula', defaultQty: 0.5 },
    { id: 'temporal',        label: 'Temporal',           desc: 'Vetor lifting',       color: '#9B6FC7', angles: ['front', '45', 'lateral'], cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah', defaultProduct: 'Juvederm Voluma', reticulation: 'Bolus profundo', defaultQty: 1.0 },
    { id: 'olheira',         label: 'Olheira',           desc: 'Sombra periorbital',  color: '#7ECF7E', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.3, max: 0.5, defaultTx: 'ah', defaultProduct: 'Juvederm Volbella', reticulation: 'Microdroplets canula', defaultQty: 0.3 },
    { id: 'nariz-dorso',     label: 'Nariz Dorso',       desc: 'Projecao dorsal',     color: '#A8B4C8', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.3, max: 1.0, defaultTx: 'ah', defaultProduct: 'Juvederm Volux', reticulation: 'Microbolus agulha', defaultQty: 0.5 },
    { id: 'nariz-base',      label: 'Nariz Base',        desc: 'Base / asa nasal',    color: '#B8C4D8', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.3, max: 0.5, defaultTx: 'ah', defaultProduct: 'Juvederm Volux', reticulation: 'Microbolus agulha', defaultQty: 0.3 },
    { id: 'sulco',           label: 'Sulco Nasogeniano', desc: 'Suavizacao',          color: '#E8A86B', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah', defaultProduct: 'Juvederm Volift', reticulation: 'Retrolinear canula', defaultQty: 0.8 },
    { id: 'marionete',       label: 'Marionete',         desc: 'Refinamento',         color: '#D98BA3', angles: ['45'],              cat: 'fill', unit: 'mL', min: 0.3, max: 1.0, defaultTx: 'ah', defaultProduct: 'Juvederm Volift', reticulation: 'Retrolinear canula', defaultQty: 0.5 },
    { id: 'pre-jowl',        label: 'Pre-jowl',         desc: 'Transicao',           color: '#E8B8C8', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.5, max: 1.0, defaultTx: 'ah', defaultProduct: 'Juvederm Volux', reticulation: 'Retrolinear canula', defaultQty: 0.5 },
    { id: 'mandibula',       label: 'Mandibula',         desc: 'Contorno',            color: '#C9A96E', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 1.0, max: 3.0, defaultTx: 'ah', defaultProduct: 'Juvederm Volux', reticulation: 'Retrolinear canula', defaultQty: 1.5 },
    { id: 'mento',           label: 'Mento',             desc: 'Projecao',            color: '#D4A857', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah', defaultProduct: 'Juvederm Volux', reticulation: 'Bolus profundo', defaultQty: 1.0 },
    { id: 'labio',           label: 'Labios',            desc: 'Volume / contorno',   color: '#E07B7B', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.0, defaultTx: 'ah', defaultProduct: 'Juvederm Volbella', reticulation: 'Retrolinear agulha', defaultQty: 0.5 },
    { id: 'cod-barras',     label: 'Codigo de Barras',  desc: 'Labio superior',      color: '#D4788A', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.3, max: 0.5, defaultTx: 'ah', defaultProduct: 'Juvederm Volbella', reticulation: 'Microdroplets agulha', defaultQty: 0.3 },
    { id: 'pescoco',        label: 'Pescoco',           desc: 'Linhas cervicais',    color: '#B8A8D8', angles: ['front', 'lateral'], cat: 'fill', unit: 'mL', min: 1.0, max: 3.0, defaultTx: 'bio', defaultProduct: 'Radiesse', reticulation: 'Retrolinear canula', defaultQty: 1.5 },
    // Rugas / Toxina (U = unidades)
    { id: 'glabela',         label: 'Glabela',           desc: 'Linhas de expressao', color: '#7BA3CF', angles: ['front'],           cat: 'tox', unit: 'U', min: 10, max: 25, defaultTx: 'botox', defaultProduct: 'Xeomin', reticulation: 'Intramuscular 5 pontos', defaultQty: 20 },
    { id: 'frontal',         label: 'Frontal',           desc: 'Linhas frontais',     color: '#8ECFC4', angles: ['front'],           cat: 'tox', unit: 'U', min: 10, max: 20, defaultTx: 'botox', defaultProduct: 'Xeomin', reticulation: 'Intramuscular 4-6 pontos', defaultQty: 12 },
    { id: 'periorbital',     label: 'Periorbital',       desc: 'Pes de galinha',      color: '#6BAED6', angles: ['front', '45'],     cat: 'tox', unit: 'U', min: 8,  max: 16, defaultTx: 'botox', defaultProduct: 'Xeomin', reticulation: 'Intramuscular 3 pontos', defaultQty: 12 },
    { id: 'gingival',        label: 'Gingival',          desc: 'Sorriso gengival',    color: '#E8879B', angles: ['front'],           cat: 'tox', unit: 'U', min: 2,  max: 4,  defaultTx: 'botox', defaultProduct: 'Xeomin', reticulation: 'Intramuscular 2 pontos', defaultQty: 3 },
    { id: 'dao',             label: 'DAO',               desc: 'Depressao do labio',  color: '#C88EA8', angles: ['front', '45'],     cat: 'tox', unit: 'U', min: 4,  max: 8,  defaultTx: 'botox', defaultProduct: 'Xeomin', reticulation: 'Intramuscular 2 pontos', defaultQty: 6 },
    { id: 'platisma',        label: 'Platisma',          desc: 'Bandas do pescoco',   color: '#A89EC8', angles: ['front', 'lateral'], cat: 'tox', unit: 'U', min: 10, max: 30, defaultTx: 'botox', defaultProduct: 'Xeomin', reticulation: 'Intramuscular bandas', defaultQty: 20 },
  ]

  // SVG mini-icons for zone buttons (contour lines)
  FM.ZONE_ICONS = {
    'zigoma-lateral':  '<path d="M3 6C5 3 9 2 11 5" stroke-width="1.5" fill="none"/>',
    'zigoma-anterior': '<path d="M4 7C6 4 10 4 11 7" stroke-width="1.5" fill="none"/>',
    'temporal':        '<path d="M3 3C5 2 8 2 9 5L8 9" stroke-width="1.5" fill="none"/>',
    'olheira':         '<ellipse cx="6" cy="7" rx="4" ry="2" stroke-width="1.5" fill="none"/>',
    'nariz-dorso':     '<path d="M6 2L6 10" stroke-width="1.5" fill="none"/><path d="M4 10L8 10" stroke-width="1" fill="none"/>',
    'nariz-base':      '<path d="M3 8C4 10 8 10 9 8" stroke-width="1.5" fill="none"/>',
    'sulco':           '<path d="M3 4C4 7 5 9 4 11" stroke-width="1.5" fill="none"/>',
    'marionete':       '<path d="M4 6C3 9 3 11 4 12" stroke-width="1.5" fill="none"/>',
    'pre-jowl':        '<path d="M3 8C4 10 7 11 9 10" stroke-width="1.5" fill="none"/>',
    'mandibula':       '<path d="M2 4C3 8 6 10 10 9" stroke-width="1.5" fill="none"/>',
    'mento':           '<path d="M4 4C3 7 5 9 8 8" stroke-width="1.5" fill="none"/>',
    'labio':           '<path d="M3 6C5 4 7 4 9 6C7 8 5 8 3 6Z" stroke-width="1.5" fill="none"/>',
    'glabela':         '<path d="M3 4L5 6L7 4L9 6" stroke-width="1.5" fill="none"/>',
    'frontal':         '<path d="M2 5L10 5M2 7L10 7M3 9L9 9" stroke-width="1" fill="none"/>',
    'periorbital':     '<path d="M2 6L4 4L6 6L8 4L10 6" stroke-width="1.5" fill="none"/>',
    'gingival':        '<path d="M4 5C5 8 7 8 8 5" stroke-width="1.5" fill="none"/><path d="M4 8L8 8" stroke-width="1" fill="none"/>',
    'dao':             '<path d="M5 4C4 7 3 9 2 10" stroke-width="1.5" fill="none"/><path d="M7 4C8 7 9 9 10 10" stroke-width="1.5" fill="none"/>',
    'platisma':        '<path d="M3 3L3 10M6 2L6 11M9 3L9 10" stroke-width="1.5" fill="none"/>',
    'cod-barras':      '<path d="M3 5L3 9M5 4L5 10M7 5L7 9M9 4L9 10" stroke-width="1" fill="none"/>',
    'pescoco':         '<path d="M2 4C4 6 8 6 10 4M2 7C4 9 8 9 10 7" stroke-width="1.5" fill="none"/>',
  }

  // Vector presets: default start->end direction per zone
  FM.VECTOR_PRESETS = {
    'zigoma-lateral':  { dx: 0.12, dy: -0.08, curve: 0.25, desc: 'Projecao lateral' },
    'zigoma-anterior': { dx: 0.08, dy: -0.10, curve: 0.20, desc: 'Elevacao + projecao' },
    'temporal':        { dx: 0.06, dy: -0.14, curve: 0.30, desc: 'Vetor lifting' },
    'mento':           { dx: 0.10, dy: 0.02,  curve: 0.15, desc: 'Projecao anterior' },
    'mandibula':       { dx: 0.08, dy: -0.03, curve: 0.20, desc: 'Definicao contorno' },
    'nariz-dorso':     { dx: 0.08, dy: -0.04, curve: 0.10, desc: 'Projecao dorsal' },
    'nariz-base':      { dx: 0.06, dy: 0.02,  curve: 0.10, desc: 'Refinamento base' },
    'pre-jowl':        { dx: 0.06, dy: -0.04, curve: 0.20, desc: 'Transicao' },
    'labio':           { dx: 0.04, dy: 0.00,  curve: 0.10, desc: 'Volume anterior' },
    'olheira':         { dx: 0.03, dy: -0.03, curve: 0.15, desc: 'Elevacao' },
    'sulco':           { dx: 0.05, dy: -0.04, curve: 0.20, desc: 'Suavizacao' },
    'marionete':       { dx: 0.04, dy: -0.05, curve: 0.20, desc: 'Elevacao' },
    'cod-barras':      { dx: 0.04, dy: -0.02, curve: 0.10, desc: 'Suavizacao perioral' },
    'pescoco':         { dx: 0.02, dy: -0.08, curve: 0.15, desc: 'Lifting cervical' },
    'glabela':         { dx: 0.00, dy: -0.06, curve: 0.10, desc: 'Relaxamento muscular' },
    'frontal':         { dx: 0.00, dy: -0.08, curve: 0.10, desc: 'Suavizacao linhas' },
    'periorbital':     { dx: 0.05, dy: -0.03, curve: 0.15, desc: 'Suavizacao periocular' },
    'gingival':        { dx: 0.00, dy: -0.03, curve: 0.10, desc: 'Reducao exposicao' },
    'dao':             { dx: 0.03, dy: -0.04, curve: 0.15, desc: 'Elevacao comissura' },
    'platisma':        { dx: 0.02, dy: -0.06, curve: 0.20, desc: 'Suavizacao bandas' },
  }

  FM.TREATMENTS = [
    { id: 'ah',       label: 'Acido Hialuronico',  color: '#3B82F6', unitPrice: 800,  priceUnit: 'mL' },
    { id: 'bio',      label: 'Bioestimulador',     color: '#10B981', unitPrice: 1200, priceUnit: 'mL' },
    { id: 'bioremod', label: 'Bioremodelador',     color: '#14B8A6', unitPrice: 900,  priceUnit: 'mL' },
    { id: 'botox',    label: 'Toxina Botulinica',  color: '#8B5CF6', unitPrice: 25,   priceUnit: 'U' },
    { id: 'laser',    label: 'Laser / Fotona',     color: '#F59E0B', unitPrice: 5000, priceUnit: 'sessao' },
    { id: 'peel',     label: 'Peeling',            color: '#EC4899', unitPrice: 500,  priceUnit: 'sessao' },
    { id: 'fio',      label: 'Fios de PDO',        color: '#06B6D4', unitPrice: 150,  priceUnit: 'fio' },
  ]

  FM.ANGLES = [
    { id: 'front',   label: 'Frontal' },
    { id: '45',      label: '45\u00B0' },
    { id: 'lateral', label: 'Lateral' },
  ]

  // Zone descriptions for GPT prompt
  FM.ZONE_PROMPT_DESC = {
    'zigoma-lateral': 'Slightly increase lateral zygomatic projection, restoring youthful cheek volume',
    'zigoma-anterior': 'Add gentle anterior zygomatic volume to fill the shadow beneath the cheekbone',
    'temporal': 'Restore temporal fossa volume, creating a subtle upward lifting vector',
    'olheira': 'Reduce periorbital shadow by 50%, brighten the tear trough area naturally',
    'nariz-dorso': 'Slightly refine the nasal dorsum projection for better profile balance',
    'nariz-base': 'Subtly refine the nasal base for improved proportion',
    'sulco': 'Soften the nasolabial fold by 40-50%, maintaining some natural expression lines',
    'marionete': 'Soften marionette lines, creating a more relaxed expression',
    'pre-jowl': 'Fill the pre-jowl sulcus for a smooth jaw-to-chin transition',
    'mandibula': 'Define the jawline contour, creating a continuous line from ear to chin',
    'mento': 'Project the chin forward slightly, improving profile balance',
    'labio': 'Add subtle lip volume while maintaining natural shape',
    'cod-barras': 'Smooth perioral lines (barcode lines) above the upper lip',
    'pescoco': 'Smooth cervical lines for a more youthful neck',
    'glabela': 'Relax glabellar lines between the eyebrows',
    'frontal': 'Smooth forehead lines for a more relaxed look',
    'periorbital': 'Soften crow\'s feet around the eyes',
    'gingival': 'Reduce gummy smile appearance',
    'dao': 'Elevate the corners of the mouth for a more positive expression',
    'platisma': 'Soften platysmal bands in the neck',
  }

  // ── Zone range load/save ────────────────────────────────────

  FM._loadZoneRanges = function () {
    var custom = {}
    try { custom = JSON.parse(localStorage.getItem('fm_zone_ranges') || '{}') } catch (e) {}
    return FM.ZONES_DEFAULT.map(function (z) {
      var c = custom[z.id]
      return c ? Object.assign({}, z, { min: c.min != null ? c.min : z.min, max: c.max != null ? c.max : z.max }) : Object.assign({}, z)
    })
  }

  FM._saveZoneRange = function (zoneId, min, max) {
    var custom = {}
    try { custom = JSON.parse(localStorage.getItem('fm_zone_ranges') || '{}') } catch (e) {}
    custom[zoneId] = { min: min, max: max }
    localStorage.setItem('fm_zone_ranges', JSON.stringify(custom))
    FM.ZONES = FM._loadZoneRanges()
  }

  // ── Preset polygon shapes per zone (offsets from center, normalized) ──
  FM.ZONE_PRESETS = {
    'labio': [
      {x:-0.08,y:-0.01},{x:-0.06,y:-0.02},{x:-0.03,y:-0.025},{x:0,y:-0.03},
      {x:0.03,y:-0.025},{x:0.06,y:-0.02},{x:0.08,y:-0.01},
      {x:0.06,y:0.015},{x:0.03,y:0.025},{x:0,y:0.03},
      {x:-0.03,y:0.025},{x:-0.06,y:0.015}
    ],
    'olheira': [
      {x:-0.04,y:-0.01},{x:-0.02,y:-0.015},{x:0.02,y:-0.015},{x:0.04,y:-0.01},
      {x:0.04,y:0.01},{x:0.02,y:0.02},{x:-0.02,y:0.02},{x:-0.04,y:0.01}
    ],
    'temporal': [
      {x:-0.03,y:-0.04},{x:0,y:-0.05},{x:0.03,y:-0.04},
      {x:0.04,y:-0.01},{x:0.03,y:0.03},{x:0,y:0.04},
      {x:-0.03,y:0.03},{x:-0.04,y:-0.01}
    ],
    'zigoma-lateral': [
      {x:-0.04,y:-0.02},{x:0,y:-0.03},{x:0.04,y:-0.02},
      {x:0.05,y:0.01},{x:0.03,y:0.03},{x:-0.03,y:0.03},{x:-0.05,y:0.01}
    ],
    'zigoma-anterior': [
      {x:-0.03,y:-0.02},{x:0.03,y:-0.02},{x:0.04,y:0.01},
      {x:0.02,y:0.025},{x:-0.02,y:0.025},{x:-0.04,y:0.01}
    ],
    'sulco': [
      {x:-0.01,y:-0.05},{x:0.01,y:-0.05},{x:0.02,y:-0.02},
      {x:0.02,y:0.02},{x:0.01,y:0.05},{x:-0.01,y:0.05},
      {x:-0.02,y:0.02},{x:-0.02,y:-0.02}
    ],
    'marionete': [
      {x:-0.01,y:-0.03},{x:0.01,y:-0.03},{x:0.015,y:0},
      {x:0.01,y:0.03},{x:-0.01,y:0.03},{x:-0.015,y:0}
    ],
    'mandibula': [
      {x:-0.08,y:-0.01},{x:-0.04,y:-0.02},{x:0,y:-0.015},{x:0.04,y:-0.02},{x:0.08,y:-0.01},
      {x:0.08,y:0.01},{x:0.04,y:0.02},{x:0,y:0.015},{x:-0.04,y:0.02},{x:-0.08,y:0.01}
    ],
    'mento': [
      {x:-0.03,y:-0.02},{x:0,y:-0.03},{x:0.03,y:-0.02},
      {x:0.03,y:0.02},{x:0,y:0.03},{x:-0.03,y:0.02}
    ],
    'glabela': [
      {x:-0.02,y:-0.015},{x:0.02,y:-0.015},{x:0.025,y:0},{x:0.02,y:0.015},
      {x:-0.02,y:0.015},{x:-0.025,y:0}
    ],
    'frontal': [
      {x:-0.08,y:-0.015},{x:0.08,y:-0.015},{x:0.08,y:0.015},{x:-0.08,y:0.015}
    ],
    'periorbital': [
      {x:-0.03,y:-0.015},{x:0,y:-0.02},{x:0.03,y:-0.015},
      {x:0.03,y:0.01},{x:0,y:0.02},{x:-0.03,y:0.01}
    ],
    'nariz-dorso': [
      {x:-0.01,y:-0.04},{x:0.01,y:-0.04},{x:0.015,y:0},{x:0.01,y:0.04},
      {x:-0.01,y:0.04},{x:-0.015,y:0}
    ],
    'pre-jowl': [
      {x:-0.03,y:-0.015},{x:0.03,y:-0.015},{x:0.035,y:0.01},
      {x:0.02,y:0.025},{x:-0.02,y:0.025},{x:-0.035,y:0.01}
    ],
    'pescoco': [
      {x:-0.06,y:-0.02},{x:0.06,y:-0.02},{x:0.06,y:0.02},{x:-0.06,y:0.02}
    ],
  }

  // Place a preset shape on the canvas
  FM._placePreset = function (zoneId) {
    var preset = FM.ZONE_PRESETS[zoneId]
    if (!preset) return false

    // Find center: use scanner zone_centers if available, else defaults
    var centers = FM._scanData && FM._scanData.zone_centers ? FM._scanData.zone_centers : FM.FORCE_DEFAULT_CENTERS
    var centerKey = zoneId + '_esq'
    var center = centers[centerKey] || centers[zoneId] || { x: 0.5, y: 0.5 }

    var zDef = FM.ZONES.find(function (z) { return z.id === zoneId })
    var points = preset.map(function (p) {
      return { x: center.x + p.x, y: center.y + p.y }
    })

    var newAnn = {
      id: FM._nextId++,
      angle: FM._activeAngle,
      zone: zoneId,
      treatment: zDef && zDef.defaultTx ? zDef.defaultTx : 'ah',
      ml: zDef && zDef.defaultQty ? zDef.defaultQty : 0.5,
      product: zDef && zDef.defaultProduct ? zDef.defaultProduct : '',
      reticulation: zDef && zDef.reticulation ? zDef.reticulation : '',
      side: 'bilateral',
      shape: { type: 'polygon', points: points },
    }

    FM._pushUndo()
    FM._annotations.push(newAnn)
    FM._selAnn = newAnn
    FM._selectedZone = null
    FM._autoSave()
    FM._redraw()
    FM._refreshToolbar()
    return true
  }

  // Initialize ZONES
  FM.ZONES = FM._loadZoneRanges()

  // ── Load real product prices from Injetaveis (Supabase) ──
  FM._loadProductPrices = function () {
    if (!window.InjetaveisRepository) return
    window.InjetaveisRepository.getAll(true).then(function (r) {
      if (!r.ok || !r.data) return
      var products = r.data
      // Build price lookup: product name → custo_unit
      FM._productPrices = {}
      products.forEach(function (p) {
        if (p.nome && p.preco_custo) {
          FM._productPrices[p.nome.toLowerCase()] = {
            custo: parseFloat(p.preco_custo) || 0,
            nome: p.nome,
            marca: p.marca || '',
            unidade: p.unidade || 'mL',
            estoque: p.estoque || 0,
            id: p.id
          }
        }
      })
      // Update TREATMENTS unitPrice from real data
      FM.TREATMENTS.forEach(function (t) {
        FM.ZONES.forEach(function (z) {
          if (z.defaultTx === t.id && z.defaultProduct) {
            var key = z.defaultProduct.toLowerCase()
            if (FM._productPrices[key]) {
              // Use real cost per unit from Supabase
              z._realCost = FM._productPrices[key].custo
            }
          }
        })
      })
      console.log('[FM] Product prices loaded:', Object.keys(FM._productPrices).length, 'products')
    }).catch(function () { /* silent */ })
  }

  // Auto-load on init
  setTimeout(FM._loadProductPrices, 1000)

  // ── Update product price back to Supabase ──
  FM._updateProductPrice = function (productName, newPrice) {
    if (!FM._productPrices || !window.InjetaveisRepository) return
    var key = productName.toLowerCase()
    var prod = FM._productPrices[key]
    if (!prod || !prod.id) return
    prod.custo = newPrice
    window.InjetaveisRepository.upsert({ id: prod.id, preco_custo: newPrice }).then(function (r) {
      if (r.ok) {
        FM._showToast && FM._showToast('Preco atualizado: ' + productName + ' → R$ ' + newPrice.toFixed(2), 'success')
      }
    })
  }

  // ── Force Vector System,Facial Aging Forces ──────────────
  // 7 zone groups with young (lifting) and aged (falling) vector directions
  // Offsets are relative to zone center (normalized 0-1)
  FM.FORCE_VECTORS = [
    { id: 'temporal',    label: 'Temporal',        color: '#9b59b6', bilateral: true,  youngDx: -0.04, youngDy: -0.07, agedDx: 0.03, agedDy: 0.07, curve: 0.2 },
    { id: 'zigoma',      label: 'Zigoma',          color: '#f1c40f', bilateral: true,  youngDx: -0.04, youngDy: -0.06, agedDx: 0.03, agedDy: 0.07, curve: 0.2 },
    { id: 'olheira',     label: 'Olheira',         color: '#3498db', bilateral: true,  youngDx: -0.02, youngDy: -0.04, agedDx: 0.01, agedDy: 0.04, curve: 0.15 },
    { id: 'nasolabial',  label: 'Bigode Chines',   color: '#e67e22', bilateral: true,  youngDx: -0.03, youngDy: -0.06, agedDx: 0.01, agedDy: 0.06, curve: 0.2 },
    { id: 'marionete',   label: 'Marionete',       color: '#e74c3c', bilateral: true,  youngDx: -0.02, youngDy: -0.06, agedDx: 0.00, agedDy: 0.06, curve: 0.2 },
    { id: 'jowl',        label: 'Mandibula',       color: '#8b5e3c', bilateral: true,  youngDx: -0.04, youngDy: -0.06, agedDx: 0.02, agedDy: 0.06, curve: 0.2 },
    { id: 'queixo',      label: 'Queixo',          color: '#7f8c8d', bilateral: false, youngDx: 0,     youngDy: -0.06, agedDx: 0,    agedDy: 0.05, curve: 0.1 },
  ]

  FM.FORCE_REGION_INFO = {
    temporal:   { youngDesc: 'Superolateral',        agedDesc: 'Colapso lateral',        desc: 'Chave do lifting. Perda de volume causa colapso de todo o sistema vetorial.', chain: ['zigoma', 'nasolabial', 'marionete'] },
    zigoma:     { youngDesc: 'Projecao + sustentacao', agedDesc: 'Descida + perda projecao', desc: 'Quando desce, cria sulco nasolabial e sombra infraorbital.', chain: ['nasolabial', 'olheira'] },
    olheira:    { youngDesc: 'Sustentacao orbital',   agedDesc: 'Medial + inferior',       desc: 'Ligamento orbitario perde suporte. Profundidade e aspecto cansado.', chain: [] },
    nasolabial: { youngDesc: 'Sustentacao zigomatica', agedDesc: 'Descendente',             desc: 'NAO e isolado. Consequencia direta da queda do zigoma.', chain: [] },
    marionete:  { youngDesc: 'Sustentacao lateral',   agedDesc: 'Vertical descendente',     desc: 'Expressao triste. Reflexo da perda de sustentacao mandibular.', chain: [] },
    jowl:       { youngDesc: 'Contorno definido',     agedDesc: 'Queda lateral + anterior', desc: 'Perda do contorno facial. Efeito "buldogue".', chain: [] },
    queixo:     { youngDesc: 'Projecao anterior',     agedDesc: 'Encurtamento + retrusao',  desc: 'Perda de projecao altera proporcoes do terco inferior.', chain: [] },
  }

  // Default zone centers (normalized) when scanner is not available
  FM.FORCE_DEFAULT_CENTERS = {
    temporal_esq:  { x: 0.28, y: 0.18 }, temporal_dir:  { x: 0.72, y: 0.18 },
    zigoma_esq:    { x: 0.26, y: 0.38 }, zigoma_dir:    { x: 0.74, y: 0.38 },
    olheira_esq:   { x: 0.36, y: 0.33 }, olheira_dir:   { x: 0.64, y: 0.33 },
    nasolabial_esq:{ x: 0.38, y: 0.52 }, nasolabial_dir:{ x: 0.62, y: 0.52 },
    marionete_esq: { x: 0.38, y: 0.62 }, marionete_dir: { x: 0.62, y: 0.62 },
    jowl_esq:      { x: 0.30, y: 0.70 }, jowl_dir:      { x: 0.70, y: 0.70 },
    queixo:        { x: 0.50, y: 0.78 },
  }

  // Helper functions for force vector system
  FM._vecAgeFactor = function (age) { return Math.max(0, Math.min(1, (age - 25) / 45)) }
  FM._vecLerp = function (a, b, t) { return a + (b - a) * t }

  FM._vecCollagenPct = function (age) {
    if (age <= 25) return 100
    if (age <= 40) return 100 - (age - 25) * 1.2
    if (age <= 55) return 82 - (age - 40) * 2.0
    return 52 - (age - 55) * 2.5
  }

  FM._vecAgeColor = function (t) {
    if (t < 0.3) return '#00e89d'
    if (t < 0.65) return '#d4a853'
    return '#ff4466'
  }

  FM._vecGravityLabel = function (t) {
    if (t < 0.2) return { label: 'Baixa', color: '#00e89d' }
    if (t < 0.5) return { label: 'Moderada', color: '#d4a853' }
    if (t < 0.75) return { label: 'Alta', color: '#ff8844' }
    return { label: 'Severa', color: '#ff4466' }
  }

  FM._vecQuotes = [
    { maxAge: 30, text: 'Vetores de sustentacao em plena atividade. Estrutura firme e colageno abundante.' },
    { maxAge: 40, text: 'Inicio da inversao vetorial. Os primeiros sinais de perda de sustentacao aparecem na regiao temporal.' },
    { maxAge: 50, text: 'Vetores significativamente invertidos. A gravidade domina e os compartimentos de gordura migram.' },
    { maxAge: 60, text: 'Perda estrutural avancada. Os ligamentos nao sustentam mais os compartimentos na posicao original.' },
    { maxAge: 999, text: 'Sistema vetorial colapsado. A reconstrucao de vetores e essencial para resultado natural.' },
  ]

})()
