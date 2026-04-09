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
    // Allow export even without analysis (doctor can edit inline)
    if (!FM._photoUrls || Object.keys(FM._photoUrls).length === 0) {
      alert('Envie pelo menos uma foto para gerar o report.')
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
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(200,169,126,0.3);border-radius:10px;background:transparent;color:#C8A97E;font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._presentReport()">' +
          FM._icon('maximize', 13) + ' Apresentar</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:transparent;color:rgba(245,240,232,0.6);font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._closeExport()">' +
          FM._icon('x', 13) + ' Fechar</button>' +
      '</div>' +
    '</div>'

    // ── Report Card ──
    var html = '<div id="fmReportCard" style="width:794px;margin:0 auto;background:#0A0A0A;border-radius:4px;font-family:Montserrat,sans-serif;color:#F5F0E8;box-shadow:0 32px 100px rgba(0,0,0,0.6);padding-bottom:24px">'

    // ─── HEADER ───
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

    // ─── SCORE DE HARMONIA GLOBAL ───
    var harmonyScore = 0, harmonyParts = 0
    if (FM._scanData && FM._scanData.symmetry && FM._scanData.symmetry.overall != null) { harmonyScore += FM._scanData.symmetry.overall * 0.25; harmonyParts += 0.25 }
    if (FM._scanData && FM._scanData.thirds) {
      var tS = FM._scanData.thirds
      var tercoScore = 100 - (Math.abs(tS.superior - 33) + Math.abs(tS.medio - 33) + Math.abs(tS.inferior - 33))
      harmonyScore += Math.max(0, tercoScore) * 0.20; harmonyParts += 0.20
    }
    if (FM._skinAnalysis && FM._skinAnalysis.overall != null) { harmonyScore += FM._skinAnalysis.overall * 0.20; harmonyParts += 0.20 }
    if (FM._vecAgeFactor) {
      var vecScore = 100 - Math.round(FM._vecAgeFactor(FM._vecAge || 25) * 70)
      harmonyScore += vecScore * 0.20; harmonyParts += 0.20
    }
    if (FM._scanData && FM._scanData.measurements && FM._scanData.measurements.golden_ratio != null) {
      var grDiff = Math.abs(FM._scanData.measurements.golden_ratio - 1.618)
      var grScore = Math.max(0, 100 - grDiff * 200)
      harmonyScore += grScore * 0.15; harmonyParts += 0.15
    }
    var finalScore = harmonyParts > 0 ? Math.round(harmonyScore / harmonyParts) : null

    if (finalScore !== null) {
      var hsColor = finalScore >= 80 ? '#10B981' : finalScore >= 60 ? '#F59E0B' : '#EF4444'
      var hsLabel = finalScore >= 80 ? 'Harmonia Preservada' : finalScore >= 60 ? 'Harmonia em Transicao' : 'Harmonia Comprometida'
      html += '<div style="text-align:center;padding:28px 32px 20px 32px">' +
        '<div style="display:inline-flex;align-items:center;justify-content:center;width:100px;height:100px;border-radius:50%;border:4px solid ' + hsColor + ';box-shadow:0 0 30px ' + hsColor + '30">' +
          '<div><div style="font-size:38px;font-weight:800;color:' + hsColor + ';line-height:1">' + finalScore + '</div>' +
          '<div style="font-size:8px;color:rgba(245,240,232,0.4);letter-spacing:0.1em">/100</div></div>' +
        '</div>' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:15px;font-style:italic;color:' + hsColor + ';margin-top:10px">' + hsLabel + '</div>' +
        '<div style="font-size:8px;color:rgba(245,240,232,0.25);margin-top:4px;letter-spacing:0.1em;text-transform:uppercase">Indice de Harmonia Facial</div>' +
      '</div>'
    }

    // ═══════════════════════════════════════════
    // ATO 1: "Onde voce esta" — Diagnostico
    // ═══════════════════════════════════════════
    html += '<div style="text-align:center;padding:12px 32px 4px 32px">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:18px;font-weight:300;font-style:italic;color:#C8A97E">Onde voce esta</div>' +
      '<div style="font-size:8px;color:rgba(245,240,232,0.25);letter-spacing:0.15em;text-transform:uppercase;margin-top:2px">Diagnostico facial completo</div>' +
    '</div>'

    // Helper: small metric card for analysis panel
    function _miniCard(value, label, color, sub) {
      return '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,126,0.08);border-radius:6px;padding:6px 8px;text-align:center">' +
        '<div style="font-size:14px;font-weight:700;color:' + (color || '#F5F0E8') + ';line-height:1.1">' + value + '</div>' +
        '<div style="font-size:6px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,240,232,0.4);margin-top:2px">' + label + '</div>' +
        (sub ? '<div style="font-size:6px;color:' + (color || 'rgba(245,240,232,0.4)') + ';margin-top:1px">' + sub + '</div>' : '') +
      '</div>'
    }

    var angleConfig = [
      { id: 'front', label: 'Vista Frontal' },
      { id: '45', label: 'Vista 45\u00B0' },
      { id: 'lateral', label: 'Vista Lateral' }
    ]
    var activeAngle = FM._activeAngle || 'front'
    var hasAnyPhoto = false

    angleConfig.forEach(function (ang) {
      var hasAntes = false
      if (ang.id === activeAngle) {
        hasAntes = FM._canvas && FM._canvas.width > 0
      } else {
        hasAntes = FM._photoUrls && FM._photoUrls[ang.id]
      }
      if (!hasAntes) return
      hasAnyPhoto = true

      html += _sectionTitle(ang.label, 'camera')

      // 2-column layout: photo left (~55%), analysis right (~45%)
      html += '<div style="display:flex;gap:16px;padding:4px 32px 12px 32px">'

      // LEFT: ANTES photo
      html += '<div style="flex:1.2;position:relative;border-radius:8px;overflow:hidden;background:#111">'
      if (ang.id === activeAngle) {
        html += '<canvas id="fmReportCanvas_antes_' + ang.id + '" style="width:100%;display:block"></canvas>'
      } else {
        html += '<img src="' + FM._esc(FM._photoUrls[ang.id]) + '" style="width:100%;display:block" crossorigin="anonymous">'
      }
      html += '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:linear-gradient(transparent,rgba(10,10,10,0.85));display:flex;align-items:center;gap:6px">' +
        '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#EF4444"></span>' +
        '<span style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:rgba(245,240,232,0.8)">ANTES</span>' +
      '</div>'
      html += '</div>'

      // RIGHT: Analysis panel
      html += '<div style="flex:0.8;display:flex;flex-direction:column;gap:6px">'

      var angStore = FM._angleStore && FM._angleStore[ang.id]
      var angMetricAngles = angStore && angStore._metricAngles

      if (ang.id === 'front') {
        // Tercos
        if (FM._scanData && FM._scanData.thirds) {
          var t = FM._scanData.thirds
          html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">'
          if (t.superior != null) html += _miniCard(Math.round(t.superior) + '%', 'T.Sup', (t.superior >= 28 && t.superior <= 38) ? '#10B981' : '#F59E0B')
          if (t.medio != null) html += _miniCard(Math.round(t.medio) + '%', 'T.Med', (t.medio >= 28 && t.medio <= 38) ? '#10B981' : '#F59E0B')
          if (t.inferior != null) html += _miniCard(Math.round(t.inferior) + '%', 'T.Inf', (t.inferior >= 28 && t.inferior <= 38) ? '#10B981' : '#F59E0B')
          html += '</div>'
        }
        // Simetria
        if (FM._scanData && FM._scanData.symmetry && FM._scanData.symmetry.overall != null) {
          html += _miniCard(FM._scanData.symmetry.overall + '%', 'Simetria', _scoreColor(FM._scanData.symmetry.overall, 85, 70))
        }
        // AMF + Jawline
        if (angMetricAngles) {
          html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">'
          if (angMetricAngles.amf != null) {
            var cl = angMetricAngles.classification || {}
            html += _miniCard(angMetricAngles.amf + '\u00B0', 'AMF', cl.color || '#C8A97E', cl.label || '')
          }
          if (angMetricAngles.aij_avg != null) {
            var jl = angMetricAngles.jawline || {}
            html += _miniCard(angMetricAngles.aij_avg + '\u00B0', 'Jawline', jl.color || '#C8A97E', jl.label || '')
          }
          html += '</div>'
        }
        // Golden Ratio + Biotipo
        if (FM._scanData && FM._scanData.measurements && FM._scanData.measurements.golden_ratio != null) {
          var gr = FM._scanData.measurements.golden_ratio
          html += _miniCard(gr.toFixed(3), 'Golden Ratio', Math.abs(gr - 1.618) < 0.08 ? '#10B981' : '#F59E0B')
        }
        if (FM._scanData && FM._scanData.shape && FM._scanData.shape.shape) {
          html += _miniCard(FM._scanData.shape.shape, 'Biotipo', '#C8A97E')
        }
        // Skin
        if (FM._skinAnalysis) {
          var sk = FM._skinAnalysis
          html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(200,169,126,0.08);border-radius:6px;padding:8px">'
          html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
          html += '<div style="width:36px;height:36px;border-radius:50%;border:2px solid ' + _scoreColor(sk.overall || 0) + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
            '<span style="font-size:14px;font-weight:700;color:' + _scoreColor(sk.overall || 0) + '">' + Math.round(sk.overall || 0) + '</span>' +
          '</div>'
          html += '<div style="flex:1">' +
            '<div style="font-size:7px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,240,232,0.4)">Saude da Pele</div>' +
            (FM._skinAge ? '<div style="font-size:8px;color:rgba(245,240,232,0.5);margin-top:1px">Idade estimada: <strong style="color:#F5F0E8">' + FM._skinAge + ' anos</strong></div>' : '') +
          '</div>'
          html += '</div>'
          html += _skinBar('Rugas', sk.wrinkles)
          html += _skinBar('Manchas', sk.spots)
          html += _skinBar('Poros', sk.pores)
          html += _skinBar('Firmeza', sk.firmness)
          html += '</div>'
        }
      }

      if (ang.id === '45') {
        // AMF for 45 angle
        if (angMetricAngles && angMetricAngles.amf != null) {
          var cl45 = angMetricAngles.classification || {}
          html += _miniCard(angMetricAngles.amf + '\u00B0', 'AMF 45\u00B0', cl45.color || '#C8A97E', cl45.label || '')
        }
        if (angMetricAngles && angMetricAngles.aij_avg != null) {
          var jl45 = angMetricAngles.jawline || {}
          html += _miniCard(angMetricAngles.aij_avg + '\u00B0', 'Jawline', jl45.color || '#C8A97E', jl45.label || '')
        }
        // If no metrics, show placeholder
        if (!angMetricAngles || (angMetricAngles.amf == null && angMetricAngles.aij_avg == null)) {
          html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(200,169,126,0.08);border-radius:6px;padding:12px;text-align:center">' +
            '<div style="font-size:9px;color:rgba(245,240,232,0.3);font-style:italic">Metricas do angulo 45\u00B0 disponiveis apos analise</div>' +
          '</div>'
        }
      }

      if (ang.id === 'lateral') {
        // Ricketts
        var rickPts = angStore && angStore._rickettsPoints
        if (rickPts && rickPts.nose && rickPts.chin) {
          html += '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,126,0.08);border-radius:6px;padding:10px">'
          html += '<div style="font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:#C8A97E;font-weight:600;margin-bottom:4px">Linha de Ricketts</div>'
          html += '<div style="font-size:9px;color:rgba(245,240,232,0.55);line-height:1.5">' +
            'A Linha E (Estetica) conecta a ponta do nariz ao mento. ' +
            'Os labios devem estar ligeiramente atras dessa linha para um perfil harmonico.' +
          '</div>'
          html += '</div>'
          html += _miniCard('Lateral', 'Ricketts', '#C8A97E', 'Linha E avaliada')
        }
        // Nose-to-chin angle if available
        if (angMetricAngles && angMetricAngles.amf != null) {
          html += _miniCard(angMetricAngles.amf + '\u00B0', 'Perfil', angMetricAngles.classification ? angMetricAngles.classification.color : '#C8A97E')
        }
        if (!rickPts && (!angMetricAngles || angMetricAngles.amf == null)) {
          html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(200,169,126,0.08);border-radius:6px;padding:12px;text-align:center">' +
            '<div style="font-size:9px;color:rgba(245,240,232,0.3);font-style:italic">Analise lateral disponivel apos marcacao de Ricketts</div>' +
          '</div>'
        }
      }

      html += '</div>' // end analysis panel
      html += '</div>' // end 2-column flex
    })

    // ─── Mapa de Forcas Faciais (2-column: canvas + metrics) ───
    if (FM._vecAge && FM._drawAllForceVectors) {
      html += '<div style="margin-top:4px;border-top:1px solid rgba(200,169,126,0.08)"></div>'
      html += _sectionTitle('Mapa de Forcas Faciais  |  Idade: ' + (FM._vecAge || 25), 'trending-up')

      var vt = FM._vecAgeFactor(FM._vecAge || 25)
      var vc = FM._vecAgeColor(vt)

      html += '<div style="display:flex;gap:16px;padding:4px 32px 12px 32px">'
      // Left: canvas
      html += '<div style="flex:1.2;position:relative;border-radius:8px;overflow:hidden;background:#111;text-align:center">' +
        '<canvas id="fmReportVecCanvas" style="width:100%;display:block;border-radius:8px"></canvas>' +
      '</div>'
      // Right: metrics
      html += '<div style="flex:0.8;display:flex;flex-direction:column;gap:6px">'
      html += _miniCard(Math.round(FM._vecCollagenPct(FM._vecAge || 25)) + '%', 'Colageno', vc)
      html += _miniCard(Math.round(100 - vt * 65) + '%', 'Elasticidade', vc)
      html += _miniCard(Math.round(100 - vt * 55) + '%', 'Sustentacao', vc)
      html += _miniCard(Math.round(100 - vt * 70) + '%', 'Vetores', vc)
      if (FM._vecGravityLabel) { var g = FM._vecGravityLabel(vt); html += _miniCard(g.label, 'Gravidade', g.color) }
      html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(200,169,126,0.08);border-radius:6px;padding:8px">' +
        '<div style="font-size:7px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,240,232,0.3);margin-bottom:2px">Ligamentos</div>' +
        '<div style="font-size:9px;color:rgba(245,240,232,0.5);line-height:1.4">Retencao dos ligamentos diminui com a idade, acelerando a ptose facial.</div>' +
      '</div>'
      html += '</div>'
      html += '</div>'
    }

    // ─── Mapa de Estruturacao (zone annotations) ───
    var annots = FM._annotations || []
    var regionSt = FM._regionState || {}
    var hasAnnotations = annots.length > 0 || Object.keys(regionSt).some(function (k) { return regionSt[k] && regionSt[k].active })
    if (hasAnnotations) {
      html += '<div style="margin-top:4px;border-top:1px solid rgba(200,169,126,0.08)"></div>'
      html += _sectionTitle('Mapa de Estruturacao', 'map-pin')
      html += '<div style="padding:4px 32px 12px 32px">'

      // Group annotations by zone
      var zoneMap = {}
      annots.forEach(function (a) {
        var z = (FM.ZONES || []).find(function (x) { return x.id === a.zone })
        var tr = (FM.TREATMENTS || []).find(function (x) { return x.id === a.treatment })
        var zLabel = z ? z.label : a.zone
        var tLabel = tr ? tr.label : (a.treatment || 'Preenchimento')
        var key = a.zone || 'other'
        if (!zoneMap[key]) zoneMap[key] = { label: zLabel, items: [], color: z ? z.color : '#C8A97E' }
        zoneMap[key].items.push({ treatment: tLabel, ml: a.ml || 0, product: a.product || '', side: a.side || '', unit: z && z.unit === 'U' ? 'U' : 'mL' })
      })

      // Active regions from regionState
      Object.keys(regionSt).forEach(function (rId) {
        var rs = regionSt[rId]
        if (!rs || !rs.active) return
        if (!zoneMap[rId]) {
          var zDef = (FM.ZONES || []).find(function (x) { return x.id === rId })
          zoneMap[rId] = { label: zDef ? zDef.label : rId, items: [], color: zDef ? zDef.color : '#C8A97E' }
        }
        if (rs.treatment || rs.ml) {
          var already = zoneMap[rId].items.some(function (it) { return it.treatment === (rs.treatment || '') })
          if (!already) {
            zoneMap[rId].items.push({ treatment: rs.treatment || '', ml: rs.ml || 0, product: rs.product || '', side: '', unit: 'mL' })
          }
        }
      })

      html += '<table style="width:100%;border-collapse:collapse;font-size:10px">' +
        '<thead><tr>' + _thCell('Zona') + _thCell('Tratamento') + _thCell('Dose') + _thCell('Produto') + '</tr></thead><tbody>'
      var zIdx = 0
      Object.keys(zoneMap).forEach(function (key) {
        var zm = zoneMap[key]
        zm.items.forEach(function (it) {
          var bg = zIdx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
          var sideStr = it.side ? ' (' + it.side + ')' : ''
          html += '<tr style="background:' + bg + '">' +
            '<td style="padding:5px 8px;color:#F5F0E8"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + zm.color + ';margin-right:6px;vertical-align:middle"></span>' + FM._esc(zm.label) + sideStr + '</td>' +
            '<td style="padding:5px 8px;color:rgba(245,240,232,0.65)">' + FM._esc(it.treatment) + '</td>' +
            '<td style="padding:5px 8px;color:' + (it.unit === 'U' ? '#8B5CF6' : '#3B82F6') + ';font-weight:600">' + (it.ml ? parseFloat(it.ml).toFixed(1) + ' ' + it.unit : '-') + '</td>' +
            '<td style="padding:5px 8px;color:rgba(245,240,232,0.45)">' + FM._esc(it.product) + '</td>' +
          '</tr>'
          zIdx++
        })
      })
      html += '</tbody></table>'
      html += '</div>'
    }

    // ─── Queixas da Paciente (auto-preenchido da anamnese) ───
    html += _sectionTitle('Queixas da Paciente', 'message-circle')
    html += '<div style="padding:4px 32px 12px 32px">'

    var lead = FM._lead || {}
    var queixas = lead.queixas_faciais || (lead.customFields || {}).queixas_faciais || (lead.data || {}).queixas_faciais || []
    if (typeof queixas === 'string') queixas = [queixas]
    var queixaPrincipal = lead.queixa_principal || lead.chief_complaint || (queixas.length > 0 ? queixas[0] : '')

    if (queixas.length > 0) {
      if (queixaPrincipal) {
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
          '<span style="font-size:8px;padding:2px 8px;background:rgba(239,68,68,0.12);color:#EF4444;border-radius:4px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;flex-shrink:0">Maior impacto</span>' +
          '<span style="font-size:12px;font-weight:600;color:#F5F0E8">' + FM._esc(queixaPrincipal) + '</span>' +
        '</div>'
      }
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">'
      queixas.forEach(function (q) {
        if (!q) return
        var isMain = q === queixaPrincipal
        html += '<span style="padding:4px 10px;border-radius:6px;font-size:10px;' +
          (isMain ? 'background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#EF4444;font-weight:600' :
                    'background:rgba(200,169,126,0.06);border:1px solid rgba(200,169,126,0.12);color:rgba(245,240,232,0.6)') +
          '">' + FM._esc(q) + '</span>'
      })
      html += '</div>'
    }

    html += _editableBlock('fmReportQueixas', queixas.length > 0 ? 'Observacoes adicionais da anamnese...' : 'Clique para adicionar as queixas da paciente...')
    html += '</div>'

    // ═══════════════════════════════════════════
    // ATO 2: "O que aconteceu" — Explicacao
    // ═══════════════════════════════════════════
    html += '<div style="text-align:center;padding:20px 32px 4px 32px;margin-top:8px;border-top:1px solid rgba(200,169,126,0.08)">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:18px;font-weight:300;font-style:italic;color:#C8A97E">O que aconteceu</div>' +
      '<div style="font-size:8px;color:rgba(245,240,232,0.25);letter-spacing:0.15em;text-transform:uppercase;margin-top:2px">A ciencia por tras do envelhecimento</div>' +
    '</div>'

    html += '<div style="padding:12px 48px 16px 48px">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:13px;font-style:italic;color:rgba(245,240,232,0.55);line-height:1.8;text-align:center">' +
        'O envelhecimento e uma quebra do sistema vetorial do rosto. As forcas que sustentavam cada estrutura se inverteram ' +
        '— a gravidade, a anteriorizacao e a perda dos ligamentos mudaram a direcao de tudo.' +
      '</div>' +
      '<div style="font-family:Montserrat,sans-serif;font-size:10px;font-weight:600;color:#C8A97E;text-align:center;margin-top:12px;letter-spacing:0.06em">' +
        'A harmonizacao NAO e preencher rugas. E reconstruir vetores.' +
      '</div>' +
    '</div>'

    // ═══════════════════════════════════════════
    // ATO 3: "Para onde vamos" — Solucao
    // ═══════════════════════════════════════════
    html += '<div style="text-align:center;padding:16px 32px 4px 32px;margin-top:8px;border-top:1px solid rgba(200,169,126,0.08)">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:18px;font-weight:300;font-style:italic;color:#C8A97E">Para onde vamos</div>' +
      '<div style="font-size:8px;color:rgba(245,240,232,0.25);letter-spacing:0.15em;text-transform:uppercase;margin-top:2px">Plano de reconstrucao vetorial</div>' +
    '</div>'

    // ─── DEPOIS photos (2-column: photo + expected results) ───
    angleConfig.forEach(function (ang) {
      var hasDepois = false
      if (ang.id === activeAngle) {
        hasDepois = FM._canvas2 && FM._canvas2.width > 0
      } else {
        hasDepois = FM._afterPhotoByAngle && FM._afterPhotoByAngle[ang.id]
      }
      if (!hasDepois) return

      html += _sectionTitle(ang.label + ' — Resultado Esperado', 'eye')

      html += '<div style="display:flex;gap:16px;padding:4px 32px 12px 32px">'

      // LEFT: DEPOIS photo
      html += '<div style="flex:1.2;position:relative;border-radius:8px;overflow:hidden;background:#111">'
      if (ang.id === activeAngle) {
        html += '<canvas id="fmReportCanvas_depois_' + ang.id + '" style="width:100%;display:block"></canvas>'
      } else {
        html += '<img src="' + FM._esc(FM._afterPhotoByAngle[ang.id]) + '" style="width:100%;display:block" crossorigin="anonymous">'
      }
      html += '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:linear-gradient(transparent,rgba(10,10,10,0.85));display:flex;align-items:center;gap:6px">' +
        '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10B981"></span>' +
        '<span style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:rgba(245,240,232,0.8)">DEPOIS</span>' +
      '</div>'
      html += '</div>'

      // RIGHT: Expected results panel (editable)
      html += '<div style="flex:0.8;display:flex;flex-direction:column;gap:6px">'
      html += '<div style="font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(200,169,126,0.5);font-weight:600">Resultados esperados</div>'
      html += _editableBlock('fmDepoisResults_' + ang.id, 'Descreva as mudancas esperadas para ' + ang.label.toLowerCase() + '...', 'min-height:120px;font-size:10px;')
      html += '</div>'

      html += '</div>'
    })

    // ─── PLANO A — Protocolo Completo (EDITABLE) ───
    html += _sectionTitle('Plano A \u2014 Protocolo Integrado de Harmonia', 'clipboard')
    html += '<div style="padding:0 32px 4px 32px">'
    html += '<div style="margin-bottom:8px">' + _editable('fmPlanASubtitle', 'Lifting vetorial completo + Fotona + manutencao', 'font-size:10px;font-style:italic;color:rgba(245,240,232,0.3);display:inline-block;width:100%;') + '</div>'

    var transformPhrases = {
      'temporal': 'Reativa o vetor de sustentacao — o rosto inteiro sobe',
      'zigoma-lateral': 'Devolve a projecao que sustenta todo o terco medio',
      'zigoma-anterior': 'Restaura o volume que define a maca do rosto',
      'olheira': 'Elimina a sombra que comunica cansaco',
      'sulco': 'Suaviza a marca que mais envelhece o rosto',
      'marionete': 'Remove a expressao de tristeza involuntaria',
      'mandibula': 'Reconstroi o contorno perdido — adeus efeito buldogue',
      'pre-jowl': 'Redefine a linha da mandibula com precisao',
      'mento': 'Restaura a projecao e o equilibrio do perfil',
      'labio-sup': 'Devolve volume natural sem aspecto preenchido',
      'labio-inf': 'Equilibra a proporcao labial com naturalidade',
      'glabela': 'Suaviza a expressao de seriedade involuntaria',
      'frontal': 'Alivia as linhas horizontais sem perder expressividade',
      'periorbital': 'Abre o olhar e reduz o aspecto cansado',
      'nariz': 'Harmoniza o perfil nasal sem cirurgia',
      'pescoco': 'Restaura a firmeza e o angulo cervical',
    }

    // Build annotation lookup (zone → total ml)
    var annLookup = {}
    FM._annotations.forEach(function (a) {
      if (!annLookup[a.zone]) annLookup[a.zone] = { ml: 0, treatment: a.treatment, product: a.product || '' }
      annLookup[a.zone].ml += (a.ml || 0)
    })

    // ALL zones with checkbox, dose, frase — all checked by default
    html += '<div style="display:flex;flex-direction:column;gap:2px">'
    var zones = FM.ZONES || []
    zones.forEach(function (z, i) {
      var ann = annLookup[z.id]
      var avgDose = ann ? ann.ml : ((z.min + z.max) / 2)
      var treatment = ann ? ann.treatment : (z.defaultTx || 'ah')
      var tr = (FM.TREATMENTS || []).find(function (x) { return x.id === treatment })
      var tLabel = tr ? tr.label : (z.cat === 'tox' ? 'Toxina' : 'Preenchimento')
      var doseColor = z.unit === 'U' ? '#8B5CF6' : '#3B82F6'
      var phrase = transformPhrases[z.id] || ''

      html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 8px;background:' + (i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent') + ';border-radius:4px">' +
        '<input type="checkbox" checked style="margin-top:3px;accent-color:#C8A97E;cursor:pointer;flex-shrink:0">' +
        '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + z.color + ';margin-top:5px;flex-shrink:0"></span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<span style="font-size:10px;font-weight:600;color:#F5F0E8">' + FM._esc(z.label) + '</span>' +
            '<div style="display:flex;align-items:center;gap:6px">' +
              '<span style="font-size:8px;color:rgba(245,240,232,0.4)">' + FM._esc(tLabel) + '</span>' +
              '<span style="font-size:10px;font-weight:700;color:' + doseColor + '">' + parseFloat(avgDose).toFixed(1) + ' ' + z.unit + '</span>' +
            '</div>' +
          '</div>' +
          (phrase ? '<div style="font-size:8px;font-style:italic;color:rgba(200,169,126,0.45);margin-top:1px">' + phrase + '</div>' : '') +
        '</div>' +
      '</div>'
    })
    html += '</div>'

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

    // ── Protocolo Lifting 5D — Cashback Fotona ──
    html += '<div style="margin-top:16px;padding:16px;background:linear-gradient(135deg,rgba(200,169,126,0.08),rgba(200,169,126,0.03));border:1px solid rgba(200,169,126,0.18);border-radius:10px">'
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      '<div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#C8A97E;font-weight:700">FOTONA DYNAMIS NX — CASHBACK</div>' +
      '<span style="font-size:8px;padding:3px 8px;background:rgba(16,185,129,0.15);color:#10B981;border-radius:4px;font-weight:600;letter-spacing:0.1em">INCLUSO NO PROTOCOLO</span>' +
    '</div>'
    html += '<div style="font-size:10px;color:rgba(245,240,232,0.55);line-height:1.6;margin-bottom:10px">' +
      'Ao fechar o Protocolo Lifting 5D, a paciente recebe de cashback <strong style="color:#C8A97E">3 sessoes de Fotona 4D</strong> — ' +
      'o melhor laser do mundo — atuando em todas as camadas do rosto.' +
    '</div>'

    html += '<div style="display:flex;gap:8px;margin-bottom:10px">'
    var fotonaMonths = ['Mes 1', 'Mes 2', 'Mes 3']
    fotonaMonths.forEach(function (m, i) {
      html += '<div style="flex:1;padding:10px;background:rgba(200,169,126,0.06);border:1px solid rgba(200,169,126,0.12);border-radius:8px;text-align:center">' +
        '<div style="font-size:16px;font-weight:800;color:#C8A97E">' + (i + 1) + '</div>' +
        '<div style="font-size:8px;color:rgba(245,240,232,0.4);letter-spacing:0.1em;text-transform:uppercase;margin-top:2px">' + m + '</div>' +
        '<div style="font-size:9px;color:rgba(245,240,232,0.55);margin-top:4px">Fotona 4D</div>' +
        '<div style="font-size:8px;color:#10B981;margin-top:2px">R$ 5.000</div>' +
      '</div>'
    })
    html += '</div>'

    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid rgba(200,169,126,0.10)">' +
      '<span style="font-size:10px;color:rgba(245,240,232,0.5)">Valor total Fotona (3 sessoes)</span>' +
      '<span style="font-size:14px;font-weight:700;color:#10B981">R$ 15.000 <span style="font-size:9px;color:rgba(245,240,232,0.3);font-weight:400;text-decoration:line-through">pago pelo cashback</span></span>' +
    '</div>'
    html += '</div>'

    // ── Timeline Visual Lifting 5D ──
    html += '<div style="margin-top:16px;padding:16px;background:rgba(255,255,255,0.02);border:1px solid rgba(200,169,126,0.08);border-radius:10px">'
    html += '<div style="font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(200,169,126,0.4);font-weight:600;margin-bottom:12px;text-align:center">JORNADA DO PROTOCOLO LIFTING 5D</div>'

    var timelineSteps = [
      { label: 'Sessao 1', sub: 'Dia 0', desc: 'Lifting Vetorial', color: '#C8A97E' },
      { label: 'Sessao 2', sub: '30 dias', desc: 'Refino + Ajustes', color: '#C8A97E' },
      { label: 'Fotona 1', sub: '45 dias', desc: '4D Laser', color: '#10B981' },
      { label: 'Fotona 2', sub: '60 dias', desc: '4D Laser', color: '#10B981' },
      { label: 'Fotona 3', sub: '75 dias', desc: '4D Laser', color: '#10B981' },
      { label: 'Retorno', sub: '90 dias', desc: 'Avaliacao Final', color: '#C8A97E' },
    ]
    html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;position:relative;padding:0 8px">'
    html += '<div style="position:absolute;top:7px;left:32px;right:32px;height:2px;background:linear-gradient(90deg,#C8A97E,#C8A97E,#10B981,#10B981,#10B981,#C8A97E)"></div>'
    timelineSteps.forEach(function (step) {
      html += '<div style="position:relative;z-index:1;text-align:center;width:70px">' +
        '<div style="width:14px;height:14px;border-radius:50%;border:2px solid ' + step.color + ';background:#0A0A0A;margin:0 auto 4px"></div>' +
        '<div style="font-size:8px;font-weight:600;color:#F5F0E8">' + step.label + '</div>' +
        '<div style="font-size:7px;color:rgba(245,240,232,0.3)">' + step.sub + '</div>' +
        '<div style="font-size:7px;color:' + step.color + ';margin-top:1px">' + step.desc + '</div>' +
      '</div>'
    })
    html += '</div>'

    html += '<div style="display:flex;gap:8px;margin-top:14px;justify-content:center;flex-wrap:wrap;font-size:9px;color:rgba(245,240,232,0.4)">'
    html += '<span>Inicio: ' + _editable('fmTimeline1', 'dd/mm/aaaa', 'width:70px;font-size:9px;') + '</span>'
    html += '<span>Retorno: ' + _editable('fmTimeline2', 'dd/mm/aaaa', 'width:70px;font-size:9px;') + '</span>'
    html += '</div>'
    html += '</div>'

    // ── Beneficios Fotona ──
    html += '<div style="margin-top:10px;padding:10px 16px;background:rgba(16,185,129,0.04);border:1px solid rgba(16,185,129,0.10);border-radius:8px">'
    html += '<div style="font-size:9px;font-weight:600;color:#10B981;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Beneficios Fotona 4D inclusos</div>'
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;color:rgba(245,240,232,0.5)">'
    var beneficios = ['Lifting e firmeza profunda', 'Rejuvenescimento das 4 camadas', 'Producao intensa de colageno', 'Melhora textura e poros', 'Reducao rugas e linhas', 'Resultados naturais com glow']
    beneficios.forEach(function (b) {
      html += '<div style="display:flex;align-items:center;gap:4px"><span style="color:#10B981;font-size:8px">&#x2713;</span> ' + b + '</div>'
    })
    html += '</div></div>'

    html += '</div>' // end Plano A padding div

    // ─── PLANO B — Essencial ───
    html += '<div style="margin-top:12px;border-top:1px solid rgba(200,169,126,0.08)"></div>'
    html += _sectionTitle('Plano B \u2014 Protocolo Essencial', 'target')
    html += '<div style="padding:0 32px 4px 32px">'
    html += '<div style="margin-bottom:8px">' + _editable('fmPlanBSubtitle', 'Foco nas areas de maior impacto — sem Fotona', 'font-size:10px;font-style:italic;color:rgba(245,240,232,0.3);display:inline-block;width:100%;') + '</div>'

    html += '<table style="width:100%;border-collapse:collapse;font-size:10px">' +
      '<thead><tr>' + _thCell('Zona') + _thCell('Procedimento') + _thCell('Dose') + _thCell('Produto') + _thCell('Transformacao') + '</tr></thead><tbody>'

    for (var eb = 0; eb < 4; eb++) {
      html += '<tr style="background:' + (eb % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent') + '">' +
        _tdEditable('Zona') + _tdEditable('Procedimento') + _tdEditable('Dose') + _tdEditable('Produto') + _tdEditable('Descreva a transformacao...') +
      '</tr>'
    }

    html += '</tbody></table>'
    html += '</div>'

    // ─── Investimento ───
    html += '<div style="margin-top:12px;border-top:1px solid rgba(200,169,126,0.08)"></div>'
    html += _sectionTitle('Investimento', 'credit-card')
    html += '<div style="padding:4px 32px 12px 32px">'
    html += '<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">'

    html += '<div style="flex:1;min-width:200px;background:rgba(200,169,126,0.04);border:1px solid rgba(200,169,126,0.12);border-radius:8px;padding:14px 18px">'
    html += '<div style="font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#C8A97E;font-weight:600;margin-bottom:4px">Plano A — Protocolo Lifting 5D</div>'
    html += '<div style="font-size:22px;font-weight:700;color:#F5F0E8">R$ ' + _editable('fmPriceA', '12.000 - 15.000', 'font-size:22px;font-weight:700;width:180px;') + '</div>'
    html += '<div style="font-size:9px;color:#10B981;margin-top:4px">+ Cashback: 3 sessoes Fotona 4D (R$ 15.000)</div>'
    html += '</div>'

    html += '<div style="flex:1;min-width:200px;background:rgba(255,255,255,0.02);border:1px solid rgba(200,169,126,0.08);border-radius:8px;padding:14px 18px">'
    html += '<div style="font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(245,240,232,0.5);font-weight:600;margin-bottom:4px">Plano B — Essencial</div>'
    html += '<div style="font-size:22px;font-weight:700;color:#F5F0E8">R$ ' + _editable('fmPriceB', '5.000 - 8.000', 'font-size:22px;font-weight:700;width:180px;') + '</div>'
    html += '<div style="font-size:9px;color:rgba(245,240,232,0.3);margin-top:4px">Sem Fotona incluso</div>'
    html += '</div>'

    html += '</div>'
    html += '<div style="margin-top:10px;font-size:11px;color:rgba(245,240,232,0.5)">Condicoes: ' + _editable('fmPaymentConditions', 'Ate 10x sem juros no cartao', 'width:300px;') + '</div>'
    html += '<div style="margin-top:6px;font-size:9px;color:rgba(200,169,126,0.4);font-style:italic">Acompanhamento anual: 40% de beneficio exclusivo nas sessoes de Fotona 4D + condicoes especiais em retoques.</div>'
    html += '</div>'

    // ─── Mensagem Lifting 5D ───
    html += '<div style="margin-top:12px;padding:16px 24px;background:rgba(200,169,126,0.04);border-left:3px solid #C8A97E;border-radius:0 8px 8px 0">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:13px;font-style:italic;color:rgba(200,169,126,0.6);line-height:1.7">' +
        'O resultado nao e um rosto transformado. E o seu rosto de volta — com firmeza, leveza e expressao viva.<br>' +
        'Porque o rejuvenescimento de verdade nao e mudar quem voce e. E fazer o espelho voltar a te reconhecer.' +
      '</div>' +
    '</div>'

    // ─── DEPOIMENTO ───
    html += '<div style="margin-top:12px;border-top:1px solid rgba(200,169,126,0.08);padding:20px 48px;text-align:center">' +
      '<div style="font-size:8px;color:rgba(245,240,232,0.25);letter-spacing:0.15em;text-transform:uppercase;margin-bottom:10px">O que outras pacientes dizem</div>' +
      _editableBlock('fmReportTestimonial', '"Diferente mas ninguem sabe dizer o que mudou. Exatamente o que eu queria." — M.C., 48 anos', 'font-family:Cormorant Garamond,serif;font-size:13px;font-style:italic;text-align:center;border-color:rgba(200,169,126,0.10);') +
    '</div>'

    // ─── FOOTER ───
    html += '<div style="margin-top:8px;border-top:1px solid rgba(200,169,126,0.12)">'
    html += '<div style="padding:24px 32px 8px 32px;text-align:center">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:14px;font-weight:300;font-style:italic;color:rgba(200,169,126,0.65);line-height:1.6;max-width:500px;margin:0 auto">' +
        'Nos nao preenchemos rugas. Nos reposicionamos as forcas do seu rosto.' +
      '</div>' +
    '</div>'

    var profName = localStorage.getItem('fm_professional_name') || 'Dra. Mirian de Paula'
    var profCRM = localStorage.getItem('fm_professional_crm') || 'CRM/SP 000000'
    var reportId = 'HF-' + Date.now().toString(36).toUpperCase()

    html += '<div style="display:flex;justify-content:space-between;align-items:flex-end;padding:12px 32px 10px 32px">' +
      '<div>' +
        '<div style="font-size:8px;color:rgba(245,240,232,0.20);letter-spacing:0.06em">Gerado por ClinicAI Face Mapping</div>' +
        '<div style="font-size:7px;color:rgba(245,240,232,0.12);margin-top:2px;font-family:monospace">' + reportId + '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:18px;font-weight:300;font-style:italic;color:#C8A97E">' + FM._esc(profName) + '</div>' +
        '<div style="font-size:8px;color:rgba(245,240,232,0.35);letter-spacing:0.1em;margin-top:2px">' + FM._esc(profCRM) + '</div>' +
      '</div>' +
    '</div>'
    html += '<div style="text-align:center;padding:0 32px 20px 32px;font-size:9px;color:rgba(245,240,232,0.25);letter-spacing:0.06em">Valido por 7 dias</div>'
    html += '</div>'

    // Close report card
    html += '</div>'

    overlay.innerHTML = toolbar + html
    document.body.appendChild(overlay)

    // Render canvases for active angle after DOM insertion
    setTimeout(function () { FM._renderReportCanvases() }, 80)
  }

  // ── Export Report as standalone HTML file ──
  // ── Build interactive ANTES/DEPOIS comparator for HTML export ──
  function _buildHTMLComparator() {
    // Get best ANTES/DEPOIS pair (prefer frontal)
    var beforeSrc = null, afterSrc = null
    var angles = ['front', '45', 'lateral']
    for (var i = 0; i < angles.length; i++) {
      var a = angles[i]
      if (FM._photoUrls && FM._photoUrls[a] && FM._afterPhotoByAngle && FM._afterPhotoByAngle[a]) {
        // Convert to base64 via canvas
        beforeSrc = FM._photoUrls[a]
        afterSrc = FM._afterPhotoByAngle[a]
        break
      }
    }
    if (!beforeSrc || !afterSrc) return ''

    return '<div style="max-width:794px;margin:24px auto;background:#0A0A0A;border-radius:8px;overflow:hidden;border:1px solid rgba(200,169,126,0.12)">' +
      '<div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(200,169,126,0.08)">' +
        '<div>' +
          '<div style="font-family:Cormorant Garamond,serif;font-size:16px;font-style:italic;color:#C8A97E">Antes & Depois</div>' +
          '<div style="font-size:8px;color:rgba(245,240,232,0.3);letter-spacing:0.1em;text-transform:uppercase">Deslize para comparar</div>' +
        '</div>' +
        '<div style="display:flex;gap:4px" id="cmpModes">' +
          '<button onclick="setCmpMode(\'slider\')" class="cmpBtn active" data-m="slider" style="padding:4px 10px;border:1px solid rgba(200,169,126,0.3);border-radius:6px;background:rgba(200,169,126,0.15);color:#C8A97E;font-size:10px;cursor:pointer;font-family:Montserrat,sans-serif">Slider</button>' +
          '<button onclick="setCmpMode(\'fade\')" class="cmpBtn" data-m="fade" style="padding:4px 10px;border:1px solid rgba(200,169,126,0.15);border-radius:6px;background:transparent;color:rgba(245,240,232,0.5);font-size:10px;cursor:pointer;font-family:Montserrat,sans-serif">Transicao</button>' +
          '<button onclick="setCmpMode(\'side\')" class="cmpBtn" data-m="side" style="padding:4px 10px;border:1px solid rgba(200,169,126,0.15);border-radius:6px;background:transparent;color:rgba(245,240,232,0.5);font-size:10px;cursor:pointer;font-family:Montserrat,sans-serif">Lado a Lado</button>' +
        '</div>' +
      '</div>' +
      // Slider mode
      '<div id="cmpSlider" style="position:relative;overflow:hidden;cursor:col-resize;touch-action:none">' +
        '<img id="cmpBefore" src="' + beforeSrc + '" style="width:100%;display:block" draggable="false">' +
        '<div id="cmpAfterWrap" style="position:absolute;top:0;right:0;bottom:0;left:50%;overflow:hidden">' +
          '<img id="cmpAfter" src="' + afterSrc + '" style="width:100%;display:block;position:absolute;top:0;right:0" draggable="false">' +
        '</div>' +
        '<div id="cmpLine" style="position:absolute;top:0;bottom:0;left:50%;width:3px;background:#C8A97E;box-shadow:0 0 8px rgba(200,169,126,0.5);z-index:2">' +
          '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:32px;height:32px;border-radius:50%;background:#0A0A0A;border:2px solid #C8A97E;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(200,169,126,0.4)">' +
            '<span style="color:#C8A97E;font-size:14px;font-weight:700">&harr;</span>' +
          '</div>' +
        '</div>' +
        '<div style="position:absolute;bottom:12px;left:16px;font-size:11px;font-weight:600;color:#EF4444;background:rgba(0,0,0,0.6);padding:3px 10px;border-radius:4px">ANTES</div>' +
        '<div style="position:absolute;bottom:12px;right:16px;font-size:11px;font-weight:600;color:#10B981;background:rgba(0,0,0,0.6);padding:3px 10px;border-radius:4px">DEPOIS</div>' +
      '</div>' +
      // Fade mode (hidden)
      '<div id="cmpFade" style="display:none;position:relative">' +
        '<img src="' + beforeSrc + '" style="width:100%;display:block" draggable="false">' +
        '<img id="cmpFadeAfter" src="' + afterSrc + '" style="position:absolute;top:0;left:0;width:100%;opacity:0;transition:opacity 0.1s" draggable="false">' +
        '<div style="position:absolute;bottom:12px;left:16px;font-size:11px;font-weight:600;color:#EF4444;background:rgba(0,0,0,0.6);padding:3px 10px;border-radius:4px">ANTES</div>' +
        '<div style="position:absolute;bottom:12px;right:16px;font-size:11px;font-weight:600;color:#10B981;background:rgba(0,0,0,0.6);padding:3px 10px;border-radius:4px">DEPOIS</div>' +
      '</div>' +
      // Side by side (hidden)
      '<div id="cmpSide" style="display:none;display:none;gap:2px">' +
        '<div style="flex:1;position:relative"><img src="' + beforeSrc + '" style="width:100%;display:block" draggable="false"><div style="position:absolute;bottom:8px;left:8px;font-size:9px;font-weight:600;color:#EF4444;background:rgba(0,0,0,0.6);padding:2px 8px;border-radius:4px">ANTES</div></div>' +
        '<div style="flex:1;position:relative"><img src="' + afterSrc + '" style="width:100%;display:block" draggable="false"><div style="position:absolute;bottom:8px;right:8px;font-size:9px;font-weight:600;color:#10B981;background:rgba(0,0,0,0.6);padding:2px 8px;border-radius:4px">DEPOIS</div></div>' +
      '</div>' +
      // Control
      '<div style="padding:8px 16px">' +
        '<input id="cmpRange" type="range" min="0" max="100" value="50" style="width:100%;height:4px;border-radius:2px;outline:none;cursor:pointer;-webkit-appearance:none;background:linear-gradient(90deg,#EF4444,#C8A97E,#10B981)">' +
      '</div>' +
    '</div>' +
    '<script>' +
      'var cmpMode="slider";' +
      'function setCmpMode(m){cmpMode=m;' +
        'document.getElementById("cmpSlider").style.display=m==="slider"?"block":"none";' +
        'document.getElementById("cmpFade").style.display=m==="fade"?"block":"none";' +
        'document.getElementById("cmpSide").style.display=m==="side"?"flex":"none";' +
        'document.querySelectorAll(".cmpBtn").forEach(function(b){' +
          'var a=b.getAttribute("data-m")===m;' +
          'b.style.background=a?"rgba(200,169,126,0.15)":"transparent";' +
          'b.style.color=a?"#C8A97E":"rgba(245,240,232,0.5)";' +
          'b.style.borderColor=a?"rgba(200,169,126,0.3)":"rgba(200,169,126,0.15)";' +
        '});' +
      '}' +
      'function updateCmp(v){' +
        'if(cmpMode==="slider"){' +
          'document.getElementById("cmpAfterWrap").style.left=v+"%";' +
          'document.getElementById("cmpAfter").style.marginLeft="-"+v+"vw";' +
          'document.getElementById("cmpAfter").style.width=(100/(100-v)*100)+"%";' +
          'document.getElementById("cmpLine").style.left=v+"%";' +
        '}else if(cmpMode==="fade"){' +
          'document.getElementById("cmpFadeAfter").style.opacity=v/100;' +
        '}' +
      '}' +
      'document.getElementById("cmpRange").addEventListener("input",function(){updateCmp(parseInt(this.value))});' +
      // Touch drag on slider viewport
      'var sl=document.getElementById("cmpSlider");' +
      'function onDrag(e){var r=sl.getBoundingClientRect();var x=(e.touches?e.touches[0].clientX:e.clientX)-r.left;var p=Math.max(0,Math.min(100,x/r.width*100));document.getElementById("cmpRange").value=p;updateCmp(p)}' +
      'sl.addEventListener("mousedown",function(){var m=function(e){onDrag(e)};var u=function(){document.removeEventListener("mousemove",m);document.removeEventListener("mouseup",u)};document.addEventListener("mousemove",m);document.addEventListener("mouseup",u);});' +
      'sl.addEventListener("touchmove",function(e){e.preventDefault();onDrag(e)},{passive:false});' +
    '<\/script>'
  }

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
        // ── Interactive ANTES/DEPOIS Comparator ──
        _buildHTMLComparator() +
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

    // VETORES canvas — render force vectors on the active angle photo
    var vecEl = document.getElementById('fmReportVecCanvas')
    if (vecEl && FM._drawAllForceVectors && FM._photoUrls) {
      var srcAngle = FM._photoUrls['front'] ? 'front' : (FM._photoUrls['45'] ? '45' : 'lateral')
      var vecImg = new Image()
      vecImg.onload = function () {
        var maxW = 360, scale = Math.min(maxW / vecImg.width, 500 / vecImg.height)
        var w = Math.round(vecImg.width * scale), h = Math.round(vecImg.height * scale)
        vecEl.width = w; vecEl.height = h
        var vctx = vecEl.getContext('2d')
        vctx.drawImage(vecImg, 0, 0, w, h)
        FM._drawAllForceVectors(vctx, FM._vecAge || 25, w, h)
        if (FM._drawCollagenBar) FM._drawCollagenBar(vctx, 10, h - 16, w - 20, 6, FM._vecAge || 25)
      }
      vecImg.src = FM._photoUrls[srcAngle]
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

  // ── Modo Apresentacao (fullscreen, sem toolbar) ──
  FM._presentReport = function () {
    var overlay = document.getElementById('fmExportOverlay')
    if (!overlay) return
    // Hide toolbar, go fullscreen
    var toolbar = overlay.firstElementChild
    if (toolbar && toolbar.querySelector) {
      toolbar.style.display = 'none'
    }
    overlay.style.padding = '0'
    overlay.style.background = '#0A0A0A'
    overlay.style.backdropFilter = 'none'
    var card = document.getElementById('fmReportCard')
    if (card) {
      card.style.maxWidth = '100%'
      card.style.width = '100%'
      card.style.borderRadius = '0'
      card.style.boxShadow = 'none'
    }
    // ESC to exit
    var exitHandler = function (e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', exitHandler)
        if (toolbar) toolbar.style.display = ''
        overlay.style.padding = '24px 0'
        overlay.style.background = 'rgba(0,0,0,0.85)'
        overlay.style.backdropFilter = 'blur(8px)'
        if (card) { card.style.maxWidth = ''; card.style.width = '794px'; card.style.borderRadius = '4px'; card.style.boxShadow = '0 32px 100px rgba(0,0,0,0.6)' }
      }
    }
    document.addEventListener('keydown', exitHandler)
    // Try native fullscreen
    if (overlay.requestFullscreen) overlay.requestFullscreen()
    else if (overlay.webkitRequestFullscreen) overlay.webkitRequestFullscreen()
    FM._showToast('Modo apresentacao. ESC para sair.', 'success')
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
