/**
 * fm-export.js — Report export, download, ranges editor
 */
;(function () {
  'use strict'

  var FM = window._FM

  // ── Helper: score color ──
  function _scoreColor(val, good, warn) {
    good = good || 70; warn = warn || 50
    return val >= good ? '#10B981' : val >= warn ? '#F59E0B' : '#EF4444'
  }

  // ── Helper: build a metric card (dark bg, colored value, uppercase label) ──
  function _metricCard(value, label, color, sub) {
    return '<div style="flex:1;min-width:100px;background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,126,0.10);border-radius:10px;padding:14px 10px;text-align:center">' +
      '<div style="font-family:Montserrat,sans-serif;font-size:22px;font-weight:700;color:' + (color || '#F5F0E8') + ';line-height:1.1">' + value + '</div>' +
      '<div style="font-family:Montserrat,sans-serif;font-size:8px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(245,240,232,0.50);margin-top:6px">' + label + '</div>' +
      (sub ? '<div style="font-size:8px;color:' + (color || 'rgba(245,240,232,0.4)') + ';margin-top:3px">' + sub + '</div>' : '') +
    '</div>'
  }

  // ── Helper: section title bar ──
  function _sectionTitle(text, icon) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:18px 32px 8px 32px">' +
      (icon ? '<span style="color:#C8A97E;opacity:0.7">' + FM._icon(icon, 13) + '</span>' : '') +
      '<span style="font-family:Montserrat,sans-serif;font-size:8px;letter-spacing:0.18em;text-transform:uppercase;color:#C8A97E">' + text + '</span>' +
      '<span style="flex:1;height:1px;background:linear-gradient(90deg,rgba(200,169,126,0.18),transparent)"></span>' +
    '</div>'
  }

  // ── Helper: skin analysis bar ──
  function _skinBar(label, val) {
    if (val == null) return ''
    var c = _scoreColor(val)
    var pct = Math.min(100, Math.max(0, val))
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:5px">' +
      '<span style="font-size:9px;color:rgba(245,240,232,0.55);width:72px;text-align:right;flex-shrink:0">' + label + '</span>' +
      '<div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">' +
        '<div style="width:' + pct + '%;height:100%;background:' + c + ';border-radius:3px;transition:width .3s"></div>' +
      '</div>' +
      '<span style="font-size:10px;font-weight:600;color:' + c + ';width:28px;text-align:right">' + Math.round(val) + '</span>' +
    '</div>'
  }

  // ── Helper: editable field with placeholder ──
  function _editable(id, placeholder, style) {
    var base = 'color:#F5F0E8;background:transparent;border:none;border-bottom:1px dashed rgba(200,169,126,0.25);outline:none;font-family:Montserrat,sans-serif;font-size:11px;padding:4px 2px;'
    return '<span contenteditable="true" id="' + id + '" style="' + base + (style || '') + '" ' +
      'onfocus="if(this.dataset.placeholder&&this.textContent===this.dataset.placeholder){this.textContent=\'\';this.style.color=\'#F5F0E8\'}" ' +
      'onblur="if(!this.textContent.trim()){this.textContent=this.dataset.placeholder;this.style.color=\'rgba(245,240,232,0.3)\'}" ' +
      'data-placeholder="' + FM._esc(placeholder) + '" style="' + base + (style || '') + 'color:rgba(245,240,232,0.3)">' + FM._esc(placeholder) + '</span>'
  }

  // ── Helper: editable block (multi-line) ──
  function _editableBlock(id, placeholder, style) {
    var base = 'color:rgba(245,240,232,0.3);background:transparent;border:1px dashed rgba(200,169,126,0.18);border-radius:6px;outline:none;font-family:Montserrat,sans-serif;font-size:11px;padding:10px 14px;min-height:40px;line-height:1.6;display:block;width:100%;box-sizing:border-box;'
    return '<div contenteditable="true" id="' + id + '" style="' + base + (style || '') + '" ' +
      'onfocus="if(this.dataset.placeholder&&this.textContent===this.dataset.placeholder){this.textContent=\'\';this.style.color=\'#F5F0E8\'}" ' +
      'onblur="if(!this.textContent.trim()){this.textContent=this.dataset.placeholder;this.style.color=\'rgba(245,240,232,0.3)\'}" ' +
      'data-placeholder="' + FM._esc(placeholder) + '">' + FM._esc(placeholder) + '</div>'
  }

  // ── Helper: protocol table header cell ──
  function _thCell(text) {
    return '<th style="text-align:left;padding:6px 8px;color:rgba(245,240,232,0.4);font-weight:500;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid rgba(200,169,126,0.10)">' + text + '</th>'
  }

  // ── Helper: protocol table data cell ──
  function _tdCell(text, style) {
    return '<td style="padding:5px 8px;' + (style || 'color:rgba(245,240,232,0.65)') + '">' + text + '</td>'
  }

  // ── Helper: editable table cell ──
  function _tdEditable(placeholder, style) {
    return '<td contenteditable="true" style="padding:5px 8px;color:rgba(245,240,232,0.3);border-bottom:1px dashed rgba(200,169,126,0.10);outline:none;font-size:10px;' + (style || '') + '" ' +
      'onfocus="if(this.dataset.placeholder&&this.textContent===this.dataset.placeholder){this.textContent=\'\';this.style.color=\'#F5F0E8\'}" ' +
      'onblur="if(!this.textContent.trim()){this.textContent=this.dataset.placeholder;this.style.color=\'rgba(245,240,232,0.3)\'}" ' +
      'data-placeholder="' + FM._esc(placeholder) + '">' + FM._esc(placeholder) + '</td>'
  }

  FM._exportReport = function () {
    if (FM._annotations.length === 0 && !FM._metricAngles && !FM._scanData && !FM._skinAnalysis) {
      alert('Adicione marcacoes ou execute Auto Analise antes de exportar.')
      return
    }

    var name = FM._lead ? (FM._lead.nome || FM._lead.name || 'Paciente') : 'Paciente'
    var dateStr = FM._formatDate ? FM._formatDate(new Date()) : new Date().toLocaleDateString('pt-BR')

    var overlay = document.createElement('div')
    overlay.id = 'fmExportOverlay'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);overflow-y:auto;padding:24px 0;backdrop-filter:blur(8px)'

    // ── Toolbar ──
    var toolbar = '<div style="width:794px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;padding:0 0 16px 0">' +
      '<div style="font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;color:#F5F0E8;letter-spacing:0.04em">Harmonia Facial</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:none;border-radius:10px;background:#C8A97E;color:#0A0A0A;font-size:12px;font-weight:600;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._downloadReport()">' +
          FM._icon('download', 13) + ' Baixar PNG</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:none;border-radius:10px;background:linear-gradient(135deg,#C8A97E,#A8875E);color:#0A0A0A;font-size:12px;font-weight:600;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._exportReportHTML()">' +
          FM._icon('code', 13) + ' Exportar HTML</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(200,169,126,0.3);border-radius:10px;background:transparent;color:#C8A97E;font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._printReport()">' +
          FM._icon('printer', 13) + ' Imprimir</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(200,169,126,0.3);border-radius:10px;background:transparent;color:#C8A97E;font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._shareReport()">' +
          FM._icon('share-2', 13) + ' Compartilhar</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:transparent;color:rgba(245,240,232,0.6);font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._closeExport()">' +
          FM._icon('x', 13) + ' Fechar</button>' +
      '</div>' +
    '</div>'

    // ── Report Card ──
    var html = '<div id="fmReportCard" style="width:794px;margin:0 auto;background:#0A0A0A;border-radius:4px;font-family:Montserrat,sans-serif;color:#F5F0E8;box-shadow:0 32px 100px rgba(0,0,0,0.6);padding-bottom:24px">'

    // ─── SECTION 1: Header ───
    html += '<div style="padding:36px 32px 20px 32px;display:flex;justify-content:space-between;align-items:flex-end">' +
      '<div>' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:26px;font-weight:300;font-style:italic;color:#C8A97E;letter-spacing:0.02em">Clinica Mirian de Paula</div>' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:11px;font-weight:300;font-style:italic;color:rgba(200,169,126,0.55);margin-top:2px;letter-spacing:0.06em">Harmonia que revela. Precisao que dura.</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:13px;font-weight:600;color:#F5F0E8;letter-spacing:0.02em">' + FM._esc(name) + '</div>' +
        '<div style="font-size:9px;color:rgba(245,240,232,0.4);margin-top:2px;letter-spacing:0.06em">' + dateStr + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="height:1px;background:linear-gradient(90deg,transparent,#C8A97E,transparent);margin:0 32px"></div>'

    // ─── SECTION 2: ALL 3 Angles — Fotos Metrificadas ───
    var angleConfig = [
      { id: 'front', label: 'Vista Frontal' },
      { id: '45', label: 'Vista 45\u00B0' },
      { id: 'lateral', label: 'Vista Lateral' }
    ]
    var activeAngle = FM._activeAngle || 'front'
    var hasAnyPhoto = false

    angleConfig.forEach(function (ang) {
      var hasAntes = false
      var hasDepois = false

      if (ang.id === activeAngle) {
        hasAntes = FM._canvas && FM._canvas.width > 0
        hasDepois = FM._canvas2 && FM._canvas2.width > 0
      } else {
        hasAntes = FM._photoUrls && FM._photoUrls[ang.id]
        hasDepois = FM._afterPhotoByAngle && FM._afterPhotoByAngle[ang.id]
      }

      if (!hasAntes && !hasDepois) return
      hasAnyPhoto = true

      html += _sectionTitle(ang.label, 'camera')
      html += '<div style="display:flex;gap:12px;padding:4px 32px 12px 32px;justify-content:center">'

      if (hasAntes) {
        if (ang.id === activeAngle) {
          // Active angle: use canvas with overlays
          html += '<div style="flex:1;max-width:360px;position:relative;border-radius:8px;overflow:hidden;background:#111">' +
            '<canvas id="fmReportCanvas_antes_' + ang.id + '" style="width:100%;display:block"></canvas>' +
            '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:linear-gradient(transparent,rgba(10,10,10,0.85));display:flex;align-items:center;gap:6px">' +
              '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#EF4444"></span>' +
              '<span style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:rgba(245,240,232,0.8)">ANTES</span>' +
            '</div>' +
          '</div>'
        } else {
          // Other angles: use img with blob URL
          html += '<div style="flex:1;max-width:360px;position:relative;border-radius:8px;overflow:hidden;background:#111">' +
            '<img src="' + FM._esc(FM._photoUrls[ang.id]) + '" style="width:100%;display:block" crossorigin="anonymous">' +
            '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:linear-gradient(transparent,rgba(10,10,10,0.85));display:flex;align-items:center;gap:6px">' +
              '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#EF4444"></span>' +
              '<span style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:rgba(245,240,232,0.8)">ANTES</span>' +
            '</div>' +
          '</div>'
        }
      }

      if (hasDepois) {
        if (ang.id === activeAngle) {
          html += '<div style="flex:1;max-width:360px;position:relative;border-radius:8px;overflow:hidden;background:#111">' +
            '<canvas id="fmReportCanvas_depois_' + ang.id + '" style="width:100%;display:block"></canvas>' +
            '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:linear-gradient(transparent,rgba(10,10,10,0.85));display:flex;align-items:center;gap:6px">' +
              '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10B981"></span>' +
              '<span style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:rgba(245,240,232,0.8)">DEPOIS</span>' +
            '</div>' +
          '</div>'
        } else {
          html += '<div style="flex:1;max-width:360px;position:relative;border-radius:8px;overflow:hidden;background:#111">' +
            '<img src="' + FM._esc(FM._afterPhotoByAngle[ang.id]) + '" style="width:100%;display:block" crossorigin="anonymous">' +
            '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:linear-gradient(transparent,rgba(10,10,10,0.85));display:flex;align-items:center;gap:6px">' +
              '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10B981"></span>' +
              '<span style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:rgba(245,240,232,0.8)">DEPOIS</span>' +
            '</div>' +
          '</div>'
        }
      }

      html += '</div>'
    })

    // ─── SECTION 3: Queixas da Paciente (EDITABLE) ───
    html += _sectionTitle('Queixas da Paciente', 'message-circle')
    html += '<div style="padding:4px 32px 12px 32px">'
    html += _editableBlock('fmReportQueixas', 'Clique para adicionar as queixas da paciente...')
    html += '</div>'

    // ─── SECTION 4: Analise de Simetria ───
    var hasScan = FM._scanData
    var hasAngles = FM._metricAngles
    if (hasScan || hasAngles) {
      html += _sectionTitle('Analise de Simetria', 'grid')
      html += '<div style="display:flex;gap:8px;padding:0 32px 4px 32px;flex-wrap:wrap">'

      if (hasScan && hasScan.thirds) {
        var t = hasScan.thirds
        var thirds = [
          { l: 'Sup.', v: t.superior },
          { l: 'Medio', v: t.medio },
          { l: 'Inf.', v: t.inferior },
        ]
        thirds.forEach(function (tc) {
          if (tc.v == null) return
          var c = (tc.v >= 28 && tc.v <= 38) ? '#10B981' : tc.v < 28 ? '#EF4444' : '#F59E0B'
          html += _metricCard(Math.round(tc.v) + '%', 'Terco ' + tc.l, c)
        })
      }

      if (hasAngles && hasAngles.amf != null) {
        var cl = hasAngles.classification || {}
        html += _metricCard(hasAngles.amf + '\u00B0', 'AMF', cl.color || '#C8A97E', cl.label || '')
      }

      if (hasScan && hasScan.measurements) {
        var meas = hasScan.measurements
        if (meas.golden_ratio != null) {
          var grColor = Math.abs(meas.golden_ratio - 1.618) < 0.08 ? '#10B981' : '#F59E0B'
          html += _metricCard(meas.golden_ratio.toFixed(3), 'Proporcao Aurea', grColor, '1.618 ideal')
        }
      }

      if (hasScan && hasScan.symmetry && hasScan.symmetry.overall != null) {
        var so = hasScan.symmetry.overall
        html += _metricCard(so + '%', 'Simetria', _scoreColor(so, 85, 70))
      }

      if (hasAngles && hasAngles.aij_avg != null) {
        var jl = hasAngles.jawline || {}
        html += _metricCard(hasAngles.aij_avg + '\u00B0', 'Jawline', jl.color || '#C8A97E', jl.label || '')
      }

      if (hasAngles && hasAngles.rmz != null) {
        var rmzOk = hasAngles.rmz >= 0.85 && hasAngles.rmz <= 0.95
        html += _metricCard(hasAngles.rmz, 'Ratio M/Z', rmzOk ? '#10B981' : '#F59E0B')
      }

      if (FM._rickettsPoints && FM._rickettsPoints.nose && FM._rickettsPoints.chin) {
        html += _metricCard('Lateral', 'Ricketts', '#C8A97E', 'Linha E avaliada')
      }

      if (hasScan && hasScan.shape && hasScan.shape.shape) {
        html += _metricCard(hasScan.shape.shape, 'Biotipo', '#C8A97E')
      }

      html += '</div>'
    }

    // ─── SECTION 5: Analise de Pele ───
    if (FM._skinAnalysis) {
      var sk = FM._skinAnalysis
      html += _sectionTitle('Analise da Pele', 'activity')

      html += '<div style="display:flex;gap:16px;padding:0 32px 4px 32px;align-items:flex-start">'

      html += '<div style="flex-shrink:0;width:90px;text-align:center">' +
        '<div style="width:72px;height:72px;border-radius:50%;border:3px solid ' + _scoreColor(sk.overall || 0) + ';display:flex;align-items:center;justify-content:center;margin:0 auto">' +
          '<span style="font-size:26px;font-weight:700;color:' + _scoreColor(sk.overall || 0) + '">' + Math.round(sk.overall || 0) + '</span>' +
        '</div>' +
        '<div style="font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,240,232,0.45);margin-top:6px">Score Geral</div>'
      if (FM._skinAge && FM._skinAge.estimated_age) {
        var saColor = FM._skinAge.estimated_age <= 35 ? '#10B981' : FM._skinAge.estimated_age <= 45 ? '#F59E0B' : '#EF4444'
        html += '<div style="font-size:18px;font-weight:700;color:' + saColor + ';margin-top:8px">' + Math.round(FM._skinAge.estimated_age) + '</div>' +
          '<div style="font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,240,232,0.45)">Idade Pele</div>'
      }
      html += '</div>'

      html += '<div style="flex:1">'
      html += _skinBar('Rugas', sk.wrinkles)
      html += _skinBar('Manchas', sk.spots)
      html += _skinBar('Poros', sk.pores)
      html += _skinBar('Vermelhidao', sk.redness)
      html += _skinBar('Pigmentacao', sk.pigmentation)
      html += _skinBar('Firmeza', sk.firmness)
      html += '</div>'

      html += '</div>'

      if (FM._skinAge && FM._skinAge.description) {
        html += '<div style="padding:4px 32px 8px 32px;text-align:center;font-size:10px;color:rgba(245,240,232,0.45);font-style:italic">' + FM._esc(FM._skinAge.description) + '</div>'
      }
    }

    // ─── SECTION 6: Mapa de Forcas ───
    var age = FM._vecAge || 25
    if (FM._vecAgeFactor && FM._vecCollagenPct) {
      var t = FM._vecAgeFactor(age)
      var colPct = FM._vecCollagenPct(age)
      var ageColor = FM._vecAgeColor ? FM._vecAgeColor(t) : '#C8A97E'
      var elastPct = Math.max(0, 100 - Math.round(t * 65))
      var sustPct = Math.max(0, 100 - Math.round(t * 55))
      var activeVecPct = Math.max(0, 100 - Math.round(t * 70))

      html += _sectionTitle('Vetores de Forca  |  Idade Simulada: ' + age, 'trending-up')
      html += '<div style="display:flex;gap:8px;padding:0 32px 4px 32px;flex-wrap:wrap">'
      html += _metricCard(Math.round(colPct) + '%', 'Colageno', ageColor)
      html += _metricCard(elastPct + '%', 'Elasticidade', ageColor)
      html += _metricCard(sustPct + '%', 'Sustentacao', ageColor)
      html += _metricCard(activeVecPct + '%', 'Vetores Ativos', ageColor)

      if (FM._vecGravityLabel) {
        var grav = FM._vecGravityLabel(t)
        html += _metricCard(grav.label, 'Gravidade', grav.color)
      }
      var antLabel = t < 0.3 ? 'Minima' : t < 0.6 ? 'Moderada' : 'Acentuada'
      var antColor = t < 0.3 ? '#10B981' : t < 0.6 ? '#F59E0B' : '#EF4444'
      html += _metricCard(antLabel, 'Anteriorizacao', antColor)
      var ligLabel = t < 0.25 ? 'Firmes' : t < 0.55 ? 'Estirados' : 'Alongados'
      var ligColor = t < 0.25 ? '#10B981' : t < 0.55 ? '#F59E0B' : '#EF4444'
      html += _metricCard(ligLabel, 'Ligamentos', ligColor)

      html += '</div>'
    }

    // ─── SECTION 7: PLANO A — Protocolo Completo (EDITABLE) ───
    html += '<div style="margin-top:8px;border-top:1px solid rgba(200,169,126,0.08)"></div>'
    html += _sectionTitle('Plano A \u2014 Protocolo Integrado de Harmonia', 'clipboard')
    html += '<div style="padding:0 32px 4px 32px">'
    html += '<div style="margin-bottom:8px">' + _editable('fmPlanASubtitle', 'Lifting vetorial completo + Fotona + manutencao', 'font-size:10px;font-style:italic;color:rgba(245,240,232,0.3);display:inline-block;width:100%;') + '</div>'

    // Protocol table Plano A
    html += '<table style="width:100%;border-collapse:collapse;font-size:10px">' +
      '<thead><tr>' + _thCell('Zona') + _thCell('Procedimento') + _thCell('Dose') + _thCell('Produto') + _thCell('Transformacao') + '</tr></thead><tbody>'

    // Pre-fill from annotations
    var zoneTotalsA = {}
    FM._annotations.forEach(function (a) {
      var z = (FM.ZONES || []).find(function (x) { return x.id === a.zone })
      var tr = (FM.TREATMENTS || []).find(function (x) { return x.id === a.treatment })
      var zLabel = z ? z.label : a.zone
      var tLabel = tr ? tr.label : (a.treatment || 'Preenchimento')
      var product = a.product || ''
      var key = a.zone + '|' + a.treatment
      if (!zoneTotalsA[key]) {
        zoneTotalsA[key] = { zone: zLabel, treatment: tLabel, ml: 0, product: product, unit: z && z.unit === 'U' ? 'U' : 'mL' }
      }
      zoneTotalsA[key].ml += (a.ml || 0)
    })

    // Use protocolData if available
    if (FM._protocolData && FM._protocolData.protocol && FM._protocolData.protocol.length > 0) {
      FM._protocolData.protocol.forEach(function (p, i) {
        var bg = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
        var doseColor = p.unit === 'U' ? '#8B5CF6' : '#3B82F6'
        html += '<tr style="background:' + bg + '">' +
          _tdCell(FM._esc(p.zone || '') + (p.bilateral ? ' (bi)' : ''), 'color:#F5F0E8') +
          _tdCell(FM._esc(p.treatment || p.product || '')) +
          _tdCell('<span style="color:' + doseColor + ';font-weight:600">' + p.dose + ' ' + p.unit + '</span>') +
          _tdCell(FM._esc(p.product || ''), 'color:rgba(245,240,232,0.45)') +
          _tdEditable('Descreva a transformacao...') +
        '</tr>'
      })
    } else if (Object.keys(zoneTotalsA).length > 0) {
      var idxA = 0
      Object.keys(zoneTotalsA).forEach(function (key) {
        var row = zoneTotalsA[key]
        var bg = idxA % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
        var doseColor = row.unit === 'U' ? '#8B5CF6' : '#3B82F6'
        html += '<tr style="background:' + bg + '">' +
          _tdCell(FM._esc(row.zone), 'color:#F5F0E8') +
          _tdCell(FM._esc(row.treatment)) +
          _tdCell('<span style="color:' + doseColor + ';font-weight:600">' + row.ml.toFixed(1) + ' ' + row.unit + '</span>') +
          _tdCell(FM._esc(row.product), 'color:rgba(245,240,232,0.45)') +
          _tdEditable('Descreva a transformacao...') +
        '</tr>'
        idxA++
      })
    } else {
      // Empty rows for manual fill
      for (var er = 0; er < 4; er++) {
        html += '<tr style="background:' + (er % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent') + '">' +
          _tdEditable('Zona') + _tdEditable('Procedimento') + _tdEditable('Dose') + _tdEditable('Produto') + _tdEditable('Transformacao') +
        '</tr>'
      }
    }

    html += '</tbody></table>'

    // Totals
    if (FM._protocolData && FM._protocolData.totals) {
      var pt = FM._protocolData.totals
      html += '<div style="display:flex;gap:16px;margin-top:8px;padding:8px 0;border-top:1px solid rgba(200,169,126,0.10);justify-content:flex-end">'
      if (pt.ah_ml) html += '<span style="font-size:10px;color:#3B82F6;font-weight:600">' + FM._icon('droplet', 10) + ' ' + pt.ah_ml + ' mL AH</span>'
      if (pt.botox_units) html += '<span style="font-size:10px;color:#8B5CF6;font-weight:600">' + FM._icon('zap', 10) + ' ' + pt.botox_units + ' U Botox</span>'
      if (pt.bio_sessions) html += '<span style="font-size:10px;color:#10B981;font-weight:600">' + FM._icon('refresh-cw', 10) + ' ' + pt.bio_sessions + ' Sessoes Bio</span>'
      html += '</div>'
    } else if (FM._annotations.length > 0) {
      var totals = FM._calcTotals ? FM._calcTotals() : []
      if (totals.length > 0) {
        html += '<div style="display:flex;gap:16px;margin-top:8px;padding:8px 0;border-top:1px solid rgba(200,169,126,0.10);justify-content:flex-end">'
        totals.forEach(function (tt) {
          html += '<span style="font-size:10px;color:' + tt.color + ';font-weight:600">' + tt.ml.toFixed(1) + ' ' + FM._esc(tt.label) + '</span>'
        })
        html += '</div>'
      }
    }

    // Cashback Fotona
    html += '<div style="margin-top:12px;padding:12px 16px;background:rgba(200,169,126,0.06);border:1px solid rgba(200,169,126,0.15);border-radius:8px">'
    html += '<div style="font-family:Montserrat,sans-serif;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#C8A97E;font-weight:600;margin-bottom:8px">FOTONA DYNAMIS NX \u2014 INCLUSO NO PROTOCOLO</div>'
    html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:#F5F0E8">'
    html += _editable('fmFotonaSessions', '3', 'width:30px;text-align:center;') + ' sessoes de '
    html += '<select id="fmFotonaType" style="background:#1A1A1A;color:#C8A97E;border:1px solid rgba(200,169,126,0.3);border-radius:4px;padding:3px 6px;font-size:11px;font-family:Montserrat,sans-serif;outline:none">'
    html += '<option value="lifting4d">Lifting 4D</option><option value="smootheyes">Smooth Eyes</option><option value="liplaser">Lip Laser</option>'
    html += '</select>'
    html += '</div>'
    html += '<div style="display:flex;gap:12px;margin-top:8px;font-size:11px;color:rgba(245,240,232,0.7)">'
    html += '<span>Valor incluso: R$ ' + _editable('fmFotonaValue', '2.500', 'width:60px;') + '</span>'
    html += '<span>(economia de R$ ' + _editable('fmFotonaEconomy', '1.800', 'width:60px;') + ')</span>'
    html += '</div>'
    html += '</div>'

    // Timeline
    html += '<div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;font-size:10px;color:rgba(245,240,232,0.6)">'
    html += '<span>Sessao 1: ' + _editable('fmTimeline1', 'dd/mm/aaaa', 'width:80px;') + '</span>'
    html += '<span>Sessao 2: ' + _editable('fmTimeline2', 'dd/mm/aaaa', 'width:80px;') + '</span>'
    html += '<span>Manutencao: ' + _editable('fmTimeline3', 'a definir', 'width:80px;') + '</span>'
    html += '</div>'

    html += '</div>' // end Plano A padding div

    // ─── SECTION 8: PLANO B — Protocolo Essencial (EDITABLE) ───
    html += '<div style="margin-top:8px;border-top:1px solid rgba(200,169,126,0.08)"></div>'
    html += _sectionTitle('Plano B \u2014 Prioridades', 'target')
    html += '<div style="padding:0 32px 4px 32px">'
    html += '<div style="margin-bottom:8px">' + _editable('fmPlanBSubtitle', 'Foco nas areas de maior impacto', 'font-size:10px;font-style:italic;color:rgba(245,240,232,0.3);display:inline-block;width:100%;') + '</div>'

    html += '<table style="width:100%;border-collapse:collapse;font-size:10px">' +
      '<thead><tr>' + _thCell('Zona') + _thCell('Procedimento') + _thCell('Dose') + _thCell('Produto') + _thCell('Transformacao') + '</tr></thead><tbody>'

    // 3 empty editable rows for Plan B
    for (var eb = 0; eb < 3; eb++) {
      html += '<tr style="background:' + (eb % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent') + '">' +
        _tdEditable('Zona') + _tdEditable('Procedimento') + _tdEditable('Dose') + _tdEditable('Produto') + _tdEditable('Transformacao') +
      '</tr>'
    }

    html += '</tbody></table>'
    html += '</div>'

    // ─── SECTION 9: Investimento (EDITABLE) ───
    html += '<div style="margin-top:8px;border-top:1px solid rgba(200,169,126,0.08)"></div>'
    html += _sectionTitle('Investimento', 'credit-card')
    html += '<div style="padding:4px 32px 12px 32px">'
    html += '<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">'

    html += '<div style="flex:1;min-width:200px;background:rgba(200,169,126,0.04);border:1px solid rgba(200,169,126,0.12);border-radius:8px;padding:14px 18px">'
    html += '<div style="font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#C8A97E;font-weight:600;margin-bottom:8px">Plano A</div>'
    html += '<div style="font-size:22px;font-weight:700;color:#F5F0E8">R$ ' + _editable('fmPriceA', '0.000', 'font-size:22px;font-weight:700;width:100px;') + '</div>'
    html += '</div>'

    html += '<div style="flex:1;min-width:200px;background:rgba(255,255,255,0.02);border:1px solid rgba(200,169,126,0.08);border-radius:8px;padding:14px 18px">'
    html += '<div style="font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(245,240,232,0.5);font-weight:600;margin-bottom:8px">Plano B</div>'
    html += '<div style="font-size:22px;font-weight:700;color:#F5F0E8">R$ ' + _editable('fmPriceB', '0.000', 'font-size:22px;font-weight:700;width:100px;') + '</div>'
    html += '</div>'

    html += '</div>'
    html += '<div style="margin-top:10px;font-size:11px;color:rgba(245,240,232,0.5)">Condicoes: ' + _editable('fmPaymentConditions', '3x sem juros no cartao', 'width:300px;') + '</div>'
    html += '</div>'

    // ─── SECTION 10: Footer ───
    html += '<div style="margin-top:16px;border-top:1px solid rgba(200,169,126,0.12)">'
    html += '<div style="padding:24px 32px 8px 32px;text-align:center">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:14px;font-weight:300;font-style:italic;color:rgba(200,169,126,0.65);line-height:1.6;max-width:500px;margin:0 auto">' +
        'Nos nao preenchemos rugas. Nos reposicionamos as forcas do seu rosto.' +
      '</div>' +
    '</div>'

    var profName = localStorage.getItem('fm_professional_name') || 'Dra. Mirian de Paula'
    var profCRM = localStorage.getItem('fm_professional_crm') || 'CRM/SP 000000'
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-end;padding:12px 32px 16px 32px">' +
      '<div style="font-size:8px;color:rgba(245,240,232,0.20);letter-spacing:0.06em">Gerado por ClinicAI Face Mapping</div>' +
      '<div style="text-align:right">' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:18px;font-weight:300;font-style:italic;color:#C8A97E">' + FM._esc(profName) + '</div>' +
        '<div style="font-size:8px;color:rgba(245,240,232,0.35);letter-spacing:0.1em;margin-top:2px">' + FM._esc(profCRM) + '</div>' +
      '</div>' +
    '</div>'
    html += '<div style="text-align:center;padding:0 32px 24px 32px;font-size:9px;color:rgba(245,240,232,0.25);letter-spacing:0.06em">Valido por 7 dias</div>'
    html += '</div>'

    // Close report card
    html += '</div>'

    overlay.innerHTML = toolbar + html
    document.body.appendChild(overlay)

    // Render canvases for active angle after DOM insertion
    setTimeout(function () { FM._renderReportCanvases() }, 80)
  }

  // ── Export Report as standalone HTML file ──
  FM._exportReportHTML = function () {
    var report = document.getElementById('fmReportCard')
    if (!report) return

    FM._showLoading && FM._showLoading('Gerando HTML...')

    // Convert all canvases to inline images
    var canvases = report.querySelectorAll('canvas')
    var replacements = []
    canvases.forEach(function (c) {
      try {
        var dataUrl = c.toDataURL('image/png')
        var img = document.createElement('img')
        img.src = dataUrl
        img.style.cssText = c.style.cssText
        img.style.width = '100%'
        img.style.display = 'block'
        replacements.push({ canvas: c, img: img })
      } catch (e) { /* cross-origin, skip */ }
    })

    // Convert blob images to base64
    var imgs = report.querySelectorAll('img')
    var pending = 0
    var done = false

    function finalize() {
      if (done) return
      done = true

      // Temporarily replace canvases with images
      replacements.forEach(function (r) {
        r.canvas.parentNode.replaceChild(r.img, r.canvas)
      })

      var content = report.innerHTML

      // Restore canvases
      replacements.forEach(function (r) {
        if (r.img.parentNode) r.img.parentNode.replaceChild(r.canvas, r.img)
      })

      // Resolve editable placeholder styling
      var patientName = FM._lead ? (FM._lead.nome || FM._lead.name || 'Paciente') : 'Paciente'
      var waPhone = localStorage.getItem('fm_wa_phone') || '5511999999999'
      var waText = encodeURIComponent('Ola! Gostaria de agendar minha avaliacao facial. Vi a proposta personalizada.')

      var fullHtml = '<!DOCTYPE html><html lang="pt-BR"><head>' +
        '<meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1.0">' +
        '<meta property="og:title" content="Analise Facial \u2014 Clinica Mirian de Paula">' +
        '<meta property="og:description" content="Proposta personalizada de harmonizacao facial para ' + FM._esc(patientName) + '">' +
        '<meta property="og:type" content="website">' +
        '<link rel="preconnect" href="https://fonts.googleapis.com">' +
        '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">' +
        '<title>Analise Facial \u2014 ' + FM._esc(patientName) + '</title>' +
        '<style>' +
          'body{margin:0;padding:24px 16px;background:#0A0A0A;font-family:Montserrat,sans-serif;color:#F5F0E8}' +
          '#fmReportCard{max-width:794px;margin:0 auto;background:#0A0A0A;border-radius:4px;box-shadow:0 32px 100px rgba(0,0,0,0.6)}' +
          '[contenteditable]{cursor:text}' +
          '[contenteditable]:focus{border-color:#C8A97E !important;outline:none}' +
          'img{max-width:100%;height:auto}' +
          'table{width:100%}' +
          '@media(max-width:600px){#fmReportCard{width:100% !important}}' +
          '.fm-cta-btn{display:inline-flex;align-items:center;gap:8px;padding:14px 32px;background:#25D366;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;font-family:Montserrat,sans-serif;margin:24px auto;transition:transform 0.2s}' +
          '.fm-cta-btn:hover{transform:scale(1.04)}' +
        '</style>' +
        '</head><body>' +
        '<div id="fmReportCard" style="width:794px;margin:0 auto;background:#0A0A0A;border-radius:4px;font-family:Montserrat,sans-serif;color:#F5F0E8;box-shadow:0 32px 100px rgba(0,0,0,0.6);padding-bottom:24px">' +
        content +
        '</div>' +
        '<div style="text-align:center;padding:32px 16px">' +
          '<a class="fm-cta-btn" href="https://wa.me/' + waPhone + '?text=' + waText + '" target="_blank">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
            'Agendar Avaliacao' +
          '</a>' +
        '</div>' +
        '</body></html>'

      var blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
      var link = document.createElement('a')
      var safeName = (FM._lead ? (FM._lead.nome || FM._lead.name || 'paciente') : 'paciente').replace(/\s+/g, '-').toLowerCase()
      link.download = 'proposta-facial-' + safeName + '.html'
      link.href = URL.createObjectURL(blob)
      link.click()
      URL.revokeObjectURL(link.href)

      FM._hideLoading && FM._hideLoading()
      FM._showToast && FM._showToast('HTML exportado!', 'success')
    }

    // Convert blob: images to base64 inline
    var blobImgs = []
    imgs.forEach(function (img) {
      if (img.src && (img.src.startsWith('blob:') || img.src.startsWith('data:'))) {
        blobImgs.push(img)
      }
    })

    if (blobImgs.length === 0) {
      finalize()
      return
    }

    pending = blobImgs.length
    blobImgs.forEach(function (img) {
      if (img.src.startsWith('data:')) {
        pending--
        if (pending <= 0) finalize()
        return
      }
      var cvs = document.createElement('canvas')
      var tmpImg = new Image()
      tmpImg.crossOrigin = 'anonymous'
      tmpImg.onload = function () {
        cvs.width = tmpImg.naturalWidth
        cvs.height = tmpImg.naturalHeight
        cvs.getContext('2d').drawImage(tmpImg, 0, 0)
        try { img.src = cvs.toDataURL('image/png') } catch (e) { /* skip */ }
        pending--
        if (pending <= 0) finalize()
      }
      tmpImg.onerror = function () {
        pending--
        if (pending <= 0) finalize()
      }
      tmpImg.src = img.src
    })

    // Safety timeout
    setTimeout(function () { finalize() }, 5000)
  }

  // ── Render canvases: copy from main canvases WITH all overlays ──
  FM._renderReportCanvases = function () {
    var activeAngle = FM._activeAngle || 'front'

    // ANTES canvas — copy directly from FM._canvas (already has metrics/angles/wireframe)
    var antesEl = document.getElementById('fmReportCanvas_antes_' + activeAngle)
    if (antesEl && FM._canvas && FM._canvas.width > 0) {
      antesEl.width = FM._canvas.width
      antesEl.height = FM._canvas.height
      var actx = antesEl.getContext('2d')
      actx.drawImage(FM._canvas, 0, 0)
    }

    // DEPOIS canvas — copy directly from FM._canvas2 (already has overlays)
    var depoisEl = document.getElementById('fmReportCanvas_depois_' + activeAngle)
    if (depoisEl && FM._canvas2 && FM._canvas2.width > 0) {
      depoisEl.width = FM._canvas2.width
      depoisEl.height = FM._canvas2.height
      var dctx = depoisEl.getContext('2d')
      dctx.drawImage(FM._canvas2, 0, 0)
    }
  }

  FM._downloadReport = function () {
    var report = document.getElementById('fmReportCard')
    if (!report) return

    if (window.html2canvas) {
      FM._showLoading('Gerando imagem do report...')
      window.html2canvas(report, {
        backgroundColor: '#2C2C2C',
        scale: 2,
        useCORS: true,
      }).then(function (canvas) {
        FM._hideLoading()
        var link = document.createElement('a')
        var name = (FM._lead.nome || FM._lead.name || 'paciente').replace(/\s+/g, '-').toLowerCase()
        link.download = 'analise-facial-' + name + '-' + FM._dateStr() + '.png'
        link.href = canvas.toDataURL('image/png')
        link.click()
        FM._showToast('Report exportado!', 'success')
      }).catch(function () { FM._hideLoading() })
    } else {
      var cc = document.getElementById('fmReportCenterCanvas')
      if (cc) {
        var link = document.createElement('a')
        var name = (FM._lead.nome || FM._lead.name || 'paciente').replace(/\s+/g, '-').toLowerCase()
        link.download = 'mapa-facial-' + name + '-' + FM._dateStr() + '.png'
        link.href = cc.toDataURL('image/png')
        link.click()
      }
    }
  }

  FM._printReport = function () {
    var report = document.getElementById('fmReportCard')
    if (!report) return
    var win = window.open('', '_blank')
    win.document.write('<!DOCTYPE html><html><head><title>Analise Facial</title>' +
      '<style>body{margin:0;background:#2C2C2C;font-family:Montserrat,sans-serif}' +
      '@media print{body{background:#fff}}</style></head><body>' +
      report.outerHTML + '</body></html>')
    win.document.close()
    setTimeout(function () { win.print() }, 500)
  }

  FM._closeExport = function () {
    var overlay = document.getElementById('fmExportOverlay')
    if (overlay) overlay.remove()
  }

  FM._editRanges = function () {
    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmRangesOverlay'

    var html = '<div style="background:#fff;border-radius:14px;width:520px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,0.3)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid #E8EAF0;flex-shrink:0">' +
        '<span style="font-size:15px;font-weight:600;color:#1A1B2E">Editar Ranges por Zona</span>' +
        '<button onclick="document.getElementById(\'fmRangesOverlay\').remove()" style="width:28px;height:28px;border-radius:50%;background:#F3F4F6;border:none;cursor:pointer;color:#6B7280;display:flex;align-items:center;justify-content:center">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div style="padding:16px 20px;overflow-y:auto;flex:1">' +
        '<div style="font-size:11px;color:#9CA3AF;margin-bottom:12px">Quantidade minima (obrigatoria) e maxima (sugestao) por zona. Alteracoes salvas localmente.</div>'

    html += '<div style="font-size:11px;font-weight:600;color:#C9A96E;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Preenchimento (mL)</div>'
    FM.ZONES.filter(function (z) { return z.cat === 'fill' }).forEach(function (z) {
      html += FM._rangeRow(z)
    })

    html += '<div style="font-size:11px;font-weight:600;color:#8B5CF6;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0 8px">Rugas / Toxina (U)</div>'
    FM.ZONES.filter(function (z) { return z.cat === 'tox' }).forEach(function (z) {
      html += FM._rangeRow(z)
    })

    html += '</div>' +
      '<div style="padding:12px 20px;border-top:1px solid #E8EAF0;flex-shrink:0">' +
        '<button id="fmRangesSave" style="width:100%;padding:10px;border:none;border-radius:10px;background:#C8A97E;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Salvar Ranges</button>' +
      '</div>' +
    '</div>'

    overlay.innerHTML = html
    document.body.appendChild(overlay)

    document.getElementById('fmRangesSave').addEventListener('click', function () {
      FM.ZONES.forEach(function (z) {
        var minEl = document.getElementById('fmRange_min_' + z.id)
        var maxEl = document.getElementById('fmRange_max_' + z.id)
        if (minEl && maxEl) {
          FM._saveZoneRange(z.id, parseFloat(minEl.value) || z.min, parseFloat(maxEl.value) || z.max)
        }
      })
      document.getElementById('fmRangesOverlay').remove()
      FM._refreshToolbar()
    })
  }

  FM._rangeRow = function (z) {
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:' + z.color + ';flex-shrink:0"></span>' +
      '<span style="font-size:12px;color:#1A1B2E;width:130px;flex-shrink:0">' + z.label + '</span>' +
      '<span style="font-size:10px;color:#9CA3AF;width:24px">Min</span>' +
      '<input id="fmRange_min_' + z.id + '" type="number" step="' + (z.unit === 'U' ? '1' : '0.1') + '" value="' + z.min + '" ' +
        'style="width:60px;padding:4px 6px;border:1px solid #E8EAF0;border-radius:6px;font-size:12px;text-align:center">' +
      '<span style="font-size:10px;color:#9CA3AF;width:28px">Max</span>' +
      '<input id="fmRange_max_' + z.id + '" type="number" step="' + (z.unit === 'U' ? '1' : '0.1') + '" value="' + z.max + '" ' +
        'style="width:60px;padding:4px 6px;border:1px solid #E8EAF0;border-radius:6px;font-size:12px;text-align:center">' +
      '<span style="font-size:10px;color:#9CA3AF">' + z.unit + '</span>' +
    '</div>'
  }

})()
