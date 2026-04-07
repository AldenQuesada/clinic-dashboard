/**
 * fm-config.js — Zone definitions, treatments, angles, presets, icons
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
    // Preenchimento (mL)
    { id: 'zigoma-lateral',  label: 'Zigoma Lateral',    desc: 'Projecao',            color: '#5B7FC7', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah' },
    { id: 'zigoma-anterior', label: 'Zigoma Anterior',   desc: 'Preenche sombra',     color: '#6BBF8A', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.0, defaultTx: 'ah' },
    { id: 'temporal',        label: 'Temporal',           desc: 'Vetor lifting',       color: '#9B6FC7', angles: ['front', '45', 'lateral'], cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah' },
    { id: 'olheira',         label: 'Olheira',           desc: 'Sombra periorbital',  color: '#7ECF7E', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.3, max: 0.5, defaultTx: 'ah' },
    { id: 'nariz-dorso',     label: 'Nariz Dorso',       desc: 'Projecao dorsal',     color: '#A8B4C8', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.3, max: 1.0, defaultTx: 'ah' },
    { id: 'nariz-base',      label: 'Nariz Base',        desc: 'Base / asa nasal',    color: '#B8C4D8', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.3, max: 0.5, defaultTx: 'ah' },
    { id: 'sulco',           label: 'Sulco Nasogeniano', desc: 'Suavizacao',          color: '#E8A86B', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah' },
    { id: 'marionete',       label: 'Marionete',         desc: 'Refinamento',         color: '#D98BA3', angles: ['45'],              cat: 'fill', unit: 'mL', min: 0.3, max: 1.0, defaultTx: 'ah' },
    { id: 'pre-jowl',        label: 'Pre-jowl',         desc: 'Transicao',           color: '#E8B8C8', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.5, max: 1.0, defaultTx: 'ah' },
    { id: 'mandibula',       label: 'Mandibula',         desc: 'Contorno',            color: '#C9A96E', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 1.0, max: 3.0, defaultTx: 'ah' },
    { id: 'mento',           label: 'Mento',             desc: 'Projecao',            color: '#D4A857', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah' },
    { id: 'labio',           label: 'Labios',            desc: 'Volume / contorno',   color: '#E07B7B', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.0, defaultTx: 'ah' },
    { id: 'cod-barras',     label: 'Codigo de Barras',  desc: 'Labio superior',      color: '#D4788A', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.3, max: 0.5, defaultTx: 'ah' },
    { id: 'pescoco',        label: 'Pescoco',           desc: 'Linhas cervicais',    color: '#B8A8D8', angles: ['front', 'lateral'], cat: 'fill', unit: 'mL', min: 1.0, max: 3.0, defaultTx: 'bio' },
    // Rugas / Toxina (U = unidades)
    { id: 'glabela',         label: 'Glabela',           desc: 'Linhas de expressao', color: '#7BA3CF', angles: ['front'],           cat: 'tox', unit: 'U', min: 10, max: 25, defaultTx: 'botox' },
    { id: 'frontal',         label: 'Frontal',           desc: 'Linhas frontais',     color: '#8ECFC4', angles: ['front'],           cat: 'tox', unit: 'U', min: 10, max: 20, defaultTx: 'botox' },
    { id: 'periorbital',     label: 'Periorbital',       desc: 'Pes de galinha',      color: '#6BAED6', angles: ['front', '45'],     cat: 'tox', unit: 'U', min: 8,  max: 16, defaultTx: 'botox' },
    { id: 'gingival',        label: 'Gingival',          desc: 'Sorriso gengival',    color: '#E8879B', angles: ['front'],           cat: 'tox', unit: 'U', min: 2,  max: 4,  defaultTx: 'botox' },
    { id: 'dao',             label: 'DAO',               desc: 'Depressao do labio',  color: '#C88EA8', angles: ['front', '45'],     cat: 'tox', unit: 'U', min: 4,  max: 8,  defaultTx: 'botox' },
    { id: 'platisma',        label: 'Platisma',          desc: 'Bandas do pescoco',   color: '#A89EC8', angles: ['front', 'lateral'], cat: 'tox', unit: 'U', min: 10, max: 30, defaultTx: 'botox' },
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
    { id: 'ah',       label: 'Acido Hialuronico',  color: '#3B82F6' },
    { id: 'bio',      label: 'Bioestimulador',     color: '#10B981' },
    { id: 'laser',    label: 'Laser / Fotona',     color: '#F59E0B' },
    { id: 'botox',    label: 'Toxina Botulinica',  color: '#8B5CF6' },
    { id: 'peel',     label: 'Peeling',            color: '#EC4899' },
    { id: 'fio',      label: 'Fios de PDO',        color: '#06B6D4' },
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

  // Initialize ZONES
  FM.ZONES = FM._loadZoneRanges()

})()
