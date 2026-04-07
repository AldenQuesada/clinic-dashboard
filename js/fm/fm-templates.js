/**
 * fm-templates.js — Pre-defined protocol templates
 * Quick-apply zone annotations for common treatment protocols
 */
;(function () {
  'use strict'

  var FM = window._FM

  FM.PROTOCOL_TEMPLATES = [
    {
      id: 'fullface-basico',
      name: 'Full Face Basico',
      desc: '8-10mL — Estruturacao + contorno',
      icon: 'star',
      zones: [
        { zone: 'temporal', treatment: 'ah', ml: 0.5, side: 'bilateral' },
        { zone: 'zigoma-lateral', treatment: 'ah', ml: 0.5, side: 'bilateral' },
        { zone: 'sulco', treatment: 'ah', ml: 0.5, side: 'bilateral' },
        { zone: 'labio', treatment: 'ah', ml: 1.0, side: 'bilateral' },
        { zone: 'mandibula', treatment: 'ah', ml: 1.5, side: 'bilateral' },
        { zone: 'mento', treatment: 'ah', ml: 1.0, side: 'bilateral' },
      ],
    },
    {
      id: 'antiage-premium',
      name: 'Anti-Age Premium',
      desc: '14-16mL + Botox — Rejuvenescimento completo',
      icon: 'award',
      zones: [
        { zone: 'temporal', treatment: 'ah', ml: 1.0, side: 'bilateral' },
        { zone: 'zigoma-lateral', treatment: 'ah', ml: 1.0, side: 'bilateral' },
        { zone: 'zigoma-anterior', treatment: 'ah', ml: 0.5, side: 'bilateral' },
        { zone: 'olheira', treatment: 'ah', ml: 0.5, side: 'bilateral' },
        { zone: 'sulco', treatment: 'ah', ml: 1.0, side: 'bilateral' },
        { zone: 'marionete', treatment: 'ah', ml: 0.5, side: 'bilateral' },
        { zone: 'labio', treatment: 'ah', ml: 1.0, side: 'bilateral' },
        { zone: 'pre-jowl', treatment: 'ah', ml: 0.5, side: 'bilateral' },
        { zone: 'mandibula', treatment: 'ah', ml: 2.0, side: 'bilateral' },
        { zone: 'mento', treatment: 'ah', ml: 1.5, side: 'bilateral' },
        { zone: 'glabela', treatment: 'botox', ml: 20, side: 'bilateral' },
        { zone: 'frontal', treatment: 'botox', ml: 15, side: 'bilateral' },
        { zone: 'periorbital', treatment: 'botox', ml: 12, side: 'bilateral' },
      ],
    },
    {
      id: 'perfil-harmonico',
      name: 'Perfil Harmonico',
      desc: '4-6mL — Nariz + mento + labio',
      icon: 'user',
      zones: [
        { zone: 'nariz-dorso', treatment: 'ah', ml: 0.5, side: 'bilateral' },
        { zone: 'nariz-base', treatment: 'ah', ml: 0.5, side: 'bilateral' },
        { zone: 'labio', treatment: 'ah', ml: 0.5, side: 'bilateral' },
        { zone: 'mento', treatment: 'ah', ml: 1.0, side: 'bilateral' },
        { zone: 'pre-jowl', treatment: 'ah', ml: 0.5, side: 'bilateral' },
      ],
    },
    {
      id: 'jawline-definido',
      name: 'Jawline Definido',
      desc: '6-8mL — Mandibula + mento angulado',
      icon: 'triangle',
      zones: [
        { zone: 'mandibula', treatment: 'ah', ml: 2.5, side: 'bilateral' },
        { zone: 'mento', treatment: 'ah', ml: 1.5, side: 'bilateral' },
        { zone: 'pre-jowl', treatment: 'ah', ml: 0.5, side: 'bilateral' },
      ],
    },
    {
      id: 'olhar-descansado',
      name: 'Olhar Descansado',
      desc: '3-4mL + Botox — Periorbital + temporal',
      icon: 'eye',
      zones: [
        { zone: 'olheira', treatment: 'ah', ml: 0.5, side: 'bilateral' },
        { zone: 'temporal', treatment: 'ah', ml: 1.0, side: 'bilateral' },
        { zone: 'glabela', treatment: 'botox', ml: 20, side: 'bilateral' },
        { zone: 'periorbital', treatment: 'botox', ml: 12, side: 'bilateral' },
      ],
    },
  ]

  FM._applyTemplate = function (templateId) {
    var tmpl = FM.PROTOCOL_TEMPLATES.find(function (t) { return t.id === templateId })
    if (!tmpl) return

    var angle = FM._activeAngle || '45'
    if (!FM._photoUrls[angle]) {
      FM._showToast('Envie uma foto primeiro.', 'warn')
      return
    }

    FM._pushUndo()

    // Create annotations in a grid pattern on the current photo
    var imgW = FM._imgW || 400
    var imgH = FM._imgH || 500

    // Zone position map (approximate positions as % of image)
    var posMap = {
      'temporal':        { x: 0.15, y: 0.20 },
      'zigoma-lateral':  { x: 0.20, y: 0.38 },
      'zigoma-anterior': { x: 0.30, y: 0.40 },
      'olheira':         { x: 0.35, y: 0.42 },
      'nariz-dorso':     { x: 0.48, y: 0.45 },
      'nariz-base':      { x: 0.48, y: 0.52 },
      'sulco':           { x: 0.32, y: 0.58 },
      'labio':           { x: 0.48, y: 0.65 },
      'marionete':       { x: 0.30, y: 0.70 },
      'pre-jowl':        { x: 0.25, y: 0.78 },
      'mandibula':       { x: 0.18, y: 0.82 },
      'mento':           { x: 0.48, y: 0.88 },
      'glabela':         { x: 0.48, y: 0.28 },
      'frontal':         { x: 0.48, y: 0.15 },
      'periorbital':     { x: 0.25, y: 0.35 },
      'cod-barras':      { x: 0.48, y: 0.60 },
      'pescoco':         { x: 0.48, y: 0.95 },
    }

    tmpl.zones.forEach(function (z) {
      var pos = posMap[z.zone] || { x: 0.5, y: 0.5 }
      FM._annotations.push({
        id: FM._nextId++,
        angle: angle,
        zone: z.zone,
        treatment: z.treatment,
        ml: z.ml,
        product: '',
        side: z.side || 'bilateral',
        shape: {
          x: pos.x * imgW,
          y: pos.y * imgH,
          rx: imgW * 0.06,
          ry: imgH * 0.04,
        },
      })
    })

    FM._simPhotoUrl = null
    FM._autoSave()
    FM._redraw()
    FM._refreshToolbar()
    FM._showToast('Template "' + tmpl.name + '" aplicado!', 'success')
  }

  FM._showTemplates = function () {
    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmTemplatesOverlay'

    var html = '<div style="background:#2C2C2C;border-radius:14px;width:500px;max-height:85vh;box-shadow:0 24px 80px rgba(0,0,0,0.5);overflow:hidden">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(200,169,126,0.15)">' +
        '<span style="font-size:15px;font-weight:600;color:#F5F0E8">Templates de Protocolo</span>' +
        '<button onclick="document.getElementById(\'fmTemplatesOverlay\').remove()" style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;cursor:pointer;color:#C8A97E;display:flex;align-items:center;justify-content:center">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      '</div>' +
      '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:8px">'

    FM.PROTOCOL_TEMPLATES.forEach(function (t) {
      html += '<button onclick="FaceMapping._applyTemplate(\'' + t.id + '\');document.getElementById(\'fmTemplatesOverlay\').remove()" ' +
        'style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border:1px solid rgba(200,169,126,0.15);border-radius:10px;background:rgba(255,255,255,0.03);color:#F5F0E8;cursor:pointer;text-align:left;transition:all .2s" ' +
        'onmouseover="this.style.borderColor=\'#C8A97E\';this.style.background=\'rgba(200,169,126,0.08)\'" ' +
        'onmouseout="this.style.borderColor=\'rgba(200,169,126,0.15)\';this.style.background=\'rgba(255,255,255,0.03)\'">' +
        '<div style="width:36px;height:36px;border-radius:8px;background:rgba(200,169,126,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0">' + FM._icon(t.icon, 18) + '</div>' +
        '<div><div style="font-size:14px;font-weight:600">' + t.name + '</div>' +
        '<div style="font-size:11px;color:rgba(200,169,126,0.6);margin-top:2px">' + t.desc + '</div></div>' +
      '</button>'
    })

    html += '</div></div>'
    overlay.innerHTML = html
    document.body.appendChild(overlay)
  }

})()
