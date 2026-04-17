/**
 * fm-export.js,Report export, download, ranges editor
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
      '<div contenteditable="true" style="font-family:Montserrat,sans-serif;font-size:28px;font-weight:700;color:' + (color || '#F5F0E8') + ';line-height:1.1;outline:none;border:none;background:transparent">' + value + '</div>' +
      '<div contenteditable="true" style="font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(245,240,232,0.50);margin-top:6px;outline:none;border:none;background:transparent">' + label + '</div>' +
      (sub ? '<div contenteditable="true" style="font-size:10px;color:' + (color || 'rgba(245,240,232,0.4)') + ';margin-top:3px;outline:none;border:none;background:transparent">' + sub + '</div>' : '') +
    '</div>'
  }

  // ── Helper: section title bar ──
  function _sectionTitle(text, icon) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:18px 32px 8px 32px">' +
      (icon ? '<span style="color:#C8A97E;opacity:0.7">' + FM._icon(icon, 13) + '</span>' : '') +
      '<span contenteditable="true" style="font-family:Montserrat,sans-serif;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#C8A97E;border:none;outline:none;background:transparent">' + text + '</span>' +
      '<span style="flex:1;height:1px;background:linear-gradient(90deg,rgba(200,169,126,0.18),transparent)"></span>' +
    '</div>'
  }

  // ── Helper: skin analysis bar ──
  function _skinBar(label, val) {
    if (val == null) return ''
    var c = _scoreColor(val)
    var pct = Math.min(100, Math.max(0, val))
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:5px">' +
      '<span style="font-size:12px;color:rgba(245,240,232,0.55);width:80px;text-align:right;flex-shrink:0">' + label + '</span>' +
      '<div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">' +
        '<div style="width:' + pct + '%;height:100%;background:' + c + ';border-radius:3px;transition:width .3s"></div>' +
      '</div>' +
      '<span style="font-size:13px;font-weight:600;color:' + c + ';width:32px;text-align:right">' + Math.round(val) + '</span>' +
    '</div>'
  }

  // ── Helper: editable field with placeholder ──
  function _editable(id, placeholder, style) {
    var base = 'color:#F5F0E8;background:transparent;border:none;border-bottom:1px dashed rgba(200,169,126,0.25);outline:none;font-family:Montserrat,sans-serif;font-size:14px;padding:4px 2px;'
    return '<span contenteditable="true" id="' + id + '" style="' + base + (style || '') + '" ' +
      'onfocus="if(this.dataset.placeholder&&this.textContent===this.dataset.placeholder){this.textContent=\'\';this.style.color=\'#F5F0E8\'}" ' +
      'onblur="if(!this.textContent.trim()){this.textContent=this.dataset.placeholder;this.style.color=\'rgba(245,240,232,0.3)\'}" ' +
      'data-placeholder="' + FM._esc(placeholder) + '" style="' + base + (style || '') + 'color:rgba(245,240,232,0.3)">' + FM._esc(placeholder) + '</span>'
  }

  // ── Helper: editable block (multi-line) ──
  function _editableBlock(id, placeholder, style) {
    var base = 'color:rgba(245,240,232,0.3);background:transparent;border:1px dashed rgba(200,169,126,0.18);border-radius:6px;outline:none;font-family:Montserrat,sans-serif;font-size:14px;padding:10px 14px;min-height:40px;line-height:1.6;display:block;width:100%;box-sizing:border-box;'
    return '<div contenteditable="true" id="' + id + '" style="' + base + (style || '') + '" ' +
      'onfocus="if(this.dataset.placeholder&&this.textContent===this.dataset.placeholder){this.textContent=\'\';this.style.color=\'#F5F0E8\'}" ' +
      'onblur="if(!this.textContent.trim()){this.textContent=this.dataset.placeholder;this.style.color=\'rgba(245,240,232,0.3)\'}" ' +
      'data-placeholder="' + FM._esc(placeholder) + '">' + FM._esc(placeholder) + '</div>'
  }

  // ── Helper: protocol table header cell ──
  function _thCell(text) {
    return '<th style="text-align:left;padding:6px 8px;color:rgba(245,240,232,0.4);font-weight:500;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid rgba(200,169,126,0.10)">' + text + '</th>'
  }

  // ── Helper: protocol table data cell ──
  function _tdCell(text, style) {
    return '<td style="padding:5px 8px;font-size:13px;' + (style || 'color:rgba(245,240,232,0.65)') + '">' + text + '</td>'
  }

  // ── Helper: editable table cell ──
  function _tdEditable(placeholder, style) {
    return '<td contenteditable="true" style="padding:5px 8px;color:rgba(245,240,232,0.3);border-bottom:1px dashed rgba(200,169,126,0.10);outline:none;font-size:13px;' + (style || '') + '" ' +
      'onfocus="if(this.dataset.placeholder&&this.textContent===this.dataset.placeholder){this.textContent=\'\';this.style.color=\'#F5F0E8\'}" ' +
      'onblur="if(!this.textContent.trim()){this.textContent=this.dataset.placeholder;this.style.color=\'rgba(245,240,232,0.3)\'}" ' +
      'data-placeholder="' + FM._esc(placeholder) + '">' + FM._esc(placeholder) + '</td>'
  }

  FM._exportReport = function () {
    // Allow export even without analysis (doctor can edit inline)
    if (!FM._photoUrls || Object.keys(FM._photoUrls).length === 0) {
      FM._showToast('Envie pelo menos uma foto para gerar o report.', 'warn')
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
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(200,169,126,0.5);border-radius:10px;background:transparent;color:#C8A97E;font-size:12px;font-weight:600;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._previewReport()">' +
          FM._icon('eye', 13) + ' Preview</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:none;border-radius:10px;background:#C8A97E;color:#0A0A0A;font-size:12px;font-weight:600;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._downloadReport()">' +
          FM._icon('download', 13) + ' Baixar PNG</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:none;border-radius:10px;background:linear-gradient(135deg,#C8A97E,#A8875E);color:#0A0A0A;font-size:12px;font-weight:600;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._exportReportHTML()">' +
          FM._icon('code', 13) + ' Exportar HTML</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(200,169,126,0.3);border-radius:10px;background:transparent;color:#C8A97E;font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._printReport()">' +
          FM._icon('printer', 13) + ' Imprimir</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(200,169,126,0.3);border-radius:10px;background:transparent;color:#C8A97E;font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._shareReport()">' +
          FM._icon('share-2', 13) + ' Compartilhar</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:none;border-radius:10px;background:#25D366;color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._sendReportWhatsApp()">' +
          FM._icon('send', 13) + ' WhatsApp</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(200,169,126,0.3);border-radius:10px;background:transparent;color:#C8A97E;font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._presentReport()">' +
          FM._icon('maximize', 13) + ' Apresentar</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:transparent;color:rgba(245,240,232,0.6);font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._closeExport()">' +
          FM._icon('x', 13) + ' Fechar</button>' +
      '</div>' +
    '</div>'

    // ── Report Card ──
    var html = '<div id="fmReportCard" style="max-width:794px;width:100%;margin:0 auto;background:#0A0A0A;border-radius:4px;font-family:Montserrat,sans-serif;color:#F5F0E8;box-shadow:0 32px 100px rgba(0,0,0,0.6);padding-bottom:24px;box-sizing:border-box">'

    // ─── HEADER ───
    html += '<div class="fm-header" style="padding:36px 32px 20px 32px;display:flex;justify-content:space-between;align-items:flex-end">' +
      '<div>' +
        '<div class="fm-clinic-name" style="font-family:Cormorant Garamond,serif;font-size:32px;font-weight:300;font-style:italic;color:#C8A97E;letter-spacing:0.02em">' + FM._clinicName() + '</div>' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:13px;font-weight:300;font-style:italic;color:rgba(200,169,126,0.55);margin-top:2px;letter-spacing:0.06em">Harmonia que revela. Precisão que dura.</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:15px;font-weight:600;color:#F5F0E8;letter-spacing:0.02em">' + FM._esc(name) + '</div>' +
        '<div style="font-size:11px;color:rgba(245,240,232,0.4);margin-top:2px;letter-spacing:0.06em">' + dateStr + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="fm-sep" style="height:1px;background:linear-gradient(90deg,transparent,#C8A97E,transparent);margin:0 32px"></div>'

    // ─── QUEIXAS DA PACIENTE (empatia primeiro) ───
    var lead = FM._lead || {}
    var queixas = lead.queixas_faciais || (lead.customFields || {}).queixas_faciais || (lead.data || {}).queixas_faciais || []
    if (typeof queixas === 'string') queixas = [queixas]
    var queixaPrincipal = lead.queixa_principal || lead.chief_complaint || (queixas.length > 0 ? queixas[0] : '')

    html += _sectionTitle('O que voce sente', 'heart')
    html += '<div style="padding:4px 32px 12px 32px">'
    if (queixas.length > 0) {
      if (queixaPrincipal) {
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">' +
          '<span style="font-size:10px;padding:3px 10px;background:rgba(239,68,68,0.12);color:#EF4444;border-radius:4px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;flex-shrink:0">Maior impacto</span>' +
          '<span style="font-size:14px;font-weight:600;color:#F5F0E8">' + FM._esc(queixaPrincipal) + '</span>' +
        '</div>'
      }
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">'
      queixas.forEach(function (q) {
        if (!q) return
        var isMain = q === queixaPrincipal
        html += '<span style="padding:5px 12px;border-radius:6px;font-size:13px;' +
          (isMain ? 'background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#EF4444;font-weight:600' :
                    'background:rgba(200,169,126,0.06);border:1px solid rgba(200,169,126,0.12);color:rgba(245,240,232,0.6)') +
          '">' + FM._esc(q) + '</span>'
      })
      html += '</div>'
    }
    html += _editableBlock('fmReportQueixas', queixas.length > 0 ? 'Observacoes adicionais...' : 'Clique para adicionar as queixas da paciente...')
    html += '</div>'

    // ═══════════════════════════════════════════
    // DIAGNOSTICO — Fotos ANTES + metricas
    // ═══════════════════════════════════════════
    html += '<div style="text-align:center;padding:12px 32px 4px 32px">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:24px;font-weight:300;font-style:italic;color:#C8A97E" contenteditable="true">Seu diagnostico</div>' +
      '<div style="font-size:10px;color:rgba(245,240,232,0.25);letter-spacing:0.15em;text-transform:uppercase;margin-top:2px">Analise facial personalizada</div>' +
    '</div>'

    // Helper: small metric card for analysis panel
    function _miniCard(value, label, color, sub) {
      return '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,126,0.08);border-radius:6px;padding:8px 10px;text-align:center">' +
        '<div style="font-size:18px;font-weight:700;color:' + (color || '#F5F0E8') + ';line-height:1.1">' + value + '</div>' +
        '<div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,240,232,0.4);margin-top:2px">' + label + '</div>' +
        (sub ? '<div style="font-size:10px;color:' + (color || 'rgba(245,240,232,0.4)') + ';margin-top:1px">' + sub + '</div>' : '') +
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
      html += '<div class="fm-row" style="display:flex;gap:16px;padding:4px 32px 12px 32px">'

      // LEFT: ANTES photo (always canvas to include overlays)
      html += '<div style="flex:1.2;position:relative;border-radius:8px;overflow:hidden;background:#111">'
      html += '<canvas id="fmReportCanvas_antes_' + ang.id + '" style="width:100%;display:block"></canvas>'
      html += '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:linear-gradient(transparent,rgba(10,10,10,0.85));display:flex;align-items:center;gap:6px">' +
        '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#EF4444"></span>' +
        '<span style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:rgba(245,240,232,0.8)">ANTES</span>' +
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
            '<div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,240,232,0.4)">Saude da Pele</div>' +
            (FM._skinAge ? '<div style="font-size:11px;color:rgba(245,240,232,0.5);margin-top:1px">Idade estimada: <strong style="color:#F5F0E8">' + Math.round(typeof FM._skinAge === 'object' ? FM._skinAge.estimated_age : FM._skinAge) + ' anos</strong></div>' : '') +
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
            '<div style="font-size:12px;color:rgba(245,240,232,0.3);font-style:italic">Metricas do angulo 45\u00B0 disponiveis apos analise</div>' +
          '</div>'
        }
      }

      if (ang.id === 'lateral') {
        // Ricketts
        var rickPts = angStore && angStore._rickettsPoints
        if (rickPts && rickPts.nose && rickPts.chin) {
          html += '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,126,0.08);border-radius:6px;padding:10px">'
          html += '<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8A97E;font-weight:600;margin-bottom:4px">Linha de Ricketts</div>'
          html += '<div style="font-size:12px;color:rgba(245,240,232,0.55);line-height:1.5">' +
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
            '<div style="font-size:12px;color:rgba(245,240,232,0.3);font-style:italic">Análise lateral disponivel apos marcação de Ricketts</div>' +
          '</div>'
        }
      }

      html += '</div>' // end analysis panel
      html += '</div>' // end 2-column flex
    })

    // ─── Mapa de Forcas Faciais (2-column: canvas + metrics) ───
    if (FM._vecAge && FM._drawAllForceVectors) {
      html += '<div class="fm-section" style="margin-top:4px;border-top:1px solid rgba(200,169,126,0.08)"></div>'
      html += _sectionTitle('Mapa de Forcas Faciais  |  Idade: ' + (FM._vecAge || 25), 'trending-up')

      var vt = FM._vecAgeFactor(FM._vecAge || 25)
      var vc = FM._vecAgeColor(vt)

      html += '<div class="fm-row" style="display:flex;gap:16px;padding:4px 32px 12px 32px">'
      // Left: canvas
      html += '<div style="flex:1.2;position:relative;border-radius:8px;overflow:hidden;background:#111;text-align:center">' +
        '<canvas id="fmReportVecCanvas" style="width:100%;display:block;border-radius:8px"></canvas>' +
      '</div>'
      // Right: metrics
      html += '<div style="flex:0.8;display:flex;flex-direction:column;gap:6px">'
      html += _miniCard(Math.round(FM._vecCollagenPct(FM._vecAge || 25)) + '%', 'Colageno', vc)
      html += _miniCard(Math.round(100 - vt * 65) + '%', 'Elasticidade', vc)
      html += _miniCard(Math.round(100 - vt * 55) + '%', 'Sustentação', vc)
      html += _miniCard(Math.round(100 - vt * 70) + '%', 'Vetores', vc)
      if (FM._vecGravityLabel) { var g = FM._vecGravityLabel(vt); html += _miniCard(g.label, 'Gravidade', g.color) }
      html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(200,169,126,0.08);border-radius:6px;padding:8px">' +
        '<div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,240,232,0.3);margin-bottom:2px">Ligamentos</div>' +
        '<div style="font-size:12px;color:rgba(245,240,232,0.5);line-height:1.4">Retencao dos ligamentos diminui com a idade, acelerando a ptose facial.</div>' +
      '</div>'
      html += '</div>'
      html += '</div>'
    }

    // ─── Mapa de Estruturacao (zone annotations) ───
    var annots = FM._annotations || []
    var regionSt = FM._regionState || {}
    var hasAnnotations = annots.length > 0 || Object.keys(regionSt).some(function (k) { return regionSt[k] && regionSt[k].active })
    if (hasAnnotations) {
      html += '<div class="fm-section" style="margin-top:4px;border-top:1px solid rgba(200,169,126,0.08)"></div>'
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

      html += '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
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

    // ─── SCORE DE HARMONIA (agora com contexto, apos diagnostico) ───
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
      html += '<div style="text-align:center;padding:28px 32px 20px 32px;border-top:1px solid rgba(200,169,126,0.08)">' +
        '<div style="display:inline-flex;align-items:center;justify-content:center;width:90px;height:90px;border-radius:50%;border:3px solid ' + hsColor + ';box-shadow:0 0 24px ' + hsColor + '30">' +
          '<div><div style="font-size:32px;font-weight:800;color:' + hsColor + ';line-height:1">' + finalScore + '</div>' +
          '<div style="font-size:9px;color:rgba(245,240,232,0.4);letter-spacing:0.1em">/100</div></div>' +
        '</div>' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:16px;font-style:italic;color:' + hsColor + ';margin-top:8px">' + hsLabel + '</div>' +
        '<div style="font-size:9px;color:rgba(245,240,232,0.25);margin-top:3px;letter-spacing:0.1em;text-transform:uppercase">Indice de Harmonia Facial</div>' +
      '</div>'
    }

    // ═══════════════════════════════════════════
    // SOLUCAO: "Para onde vamos"
    // ═══════════════════════════════════════════
    html += '<div class="fm-section" style="text-align:center;padding:16px 32px 4px 32px;margin-top:8px;border-top:1px solid rgba(200,169,126,0.08)">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:24px;font-weight:300;font-style:italic;color:#C8A97E" contenteditable="true">Para onde vamos</div>' +
      '<div style="font-size:10px;color:rgba(245,240,232,0.25);letter-spacing:0.15em;text-transform:uppercase;margin-top:2px">Plano de reconstrucao vetorial</div>' +
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

      html += _sectionTitle(ang.label + ',Resultado Esperado', 'eye')

      html += '<div class="fm-row" style="display:flex;gap:16px;padding:4px 32px 12px 32px">'

      // LEFT: DEPOIS photo
      html += '<div style="flex:1.2;position:relative;border-radius:8px;overflow:hidden;background:#111">'
      if (ang.id === activeAngle) {
        html += '<canvas id="fmReportCanvas_depois_' + ang.id + '" style="width:100%;display:block"></canvas>'
      } else {
        html += '<img src="' + FM._esc(FM._afterPhotoByAngle[ang.id]) + '" style="width:100%;display:block" crossorigin="anonymous">'
      }
      html += '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:linear-gradient(transparent,rgba(10,10,10,0.85));display:flex;align-items:center;gap:6px">' +
        '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10B981"></span>' +
        '<span style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:rgba(245,240,232,0.8)">DEPOIS</span>' +
      '</div>'
      html += '</div>'

      // RIGHT: Expected results panel (editable)
      html += '<div style="flex:0.8;display:flex;flex-direction:column;gap:6px">'
      html += '<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(200,169,126,0.5);font-weight:600">Resultados esperados</div>'
      html += _editableBlock('fmDepoisResults_' + ang.id, 'Descreva as mudancas esperadas para ' + ang.label.toLowerCase() + '...', 'min-height:120px;font-size:13px;')
      html += '</div>'

      html += '</div>'
    })

    // ─── Nasal angular analysis (if points marked) ───
    if (FM.Nasal && FM.Nasal.hasData()) {
      html += '<div style="padding:0 32px">' + FM.Nasal.renderReportSection() + '</div>'
    }

    // ─── PLANO A,Protocolo Completo (EDITABLE) ───
    html += _sectionTitle('Plano A \u2014 Protocolo Integrado de Harmonia', 'clipboard')
    html += '<div style="padding:0 32px 4px 32px">'
    html += '<div style="margin-bottom:8px">' + _editable('fmPlanASubtitle', 'Lifting vetorial completo + Fotona + manutencao', 'font-size:13px;font-style:italic;color:rgba(245,240,232,0.3);display:inline-block;width:100%;') + '</div>'

    var transformPhrases = {
      'temporal': 'Reativa o vetor de sustentação,o rosto inteiro sobe',
      'zigoma-lateral': 'Devolve a projeção que sustenta todo o terco medio',
      'zigoma-anterior': 'Restaura o volume que define a maca do rosto',
      'olheira': 'Elimina a sombra que comunica cansaco',
      'sulco': 'Suaviza a marca que mais envelhece o rosto',
      'marionete': 'Remove a expressão de tristeza involuntaria',
      'mandibula': 'Reconstroi o contorno perdido,adeus efeito buldogue',
      'pre-jowl': 'Redefine a linha da mandibula com precisão',
      'mento': 'Restaura a projeção e o equilibrio do perfil',
      'labio-sup': 'Devolve volume natural sem aspecto preenchido',
      'labio-inf': 'Equilibra a proporção labial com naturalidade',
      'glabela': 'Suaviza a expressão de seriedade involuntaria',
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

    // Only marked zones (not all 21)
    var markedZones = (FM.ZONES || []).filter(function (z) { return !!annLookup[z.id] })
    if (markedZones.length === 0) markedZones = (FM.ZONES || []).slice(0, 4) // fallback: top 4 if nothing marked

    html += '<div class="fm-zone-list" style="display:flex;flex-direction:column;gap:3px">'
    markedZones.forEach(function (z, i) {
      var ann = annLookup[z.id]
      var avgDose = ann ? ann.ml : ((z.min + z.max) / 2)
      var treatment = ann ? ann.treatment : (z.defaultTx || 'ah')
      var tr = (FM.TREATMENTS || []).find(function (x) { return x.id === treatment })
      var tLabel = tr ? tr.label : (z.cat === 'tox' ? 'Toxina' : 'Preenchimento')
      var doseColor = z.unit === 'U' ? '#8B5CF6' : '#3B82F6'
      var phrase = transformPhrases[z.id] || ''

      html += '<div class="fm-zone-row" style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:' + (i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent') + ';border-radius:6px">' +
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + z.color + ';margin-top:4px;flex-shrink:0"></span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">' +
            '<span style="font-size:13px;font-weight:600;color:#F5F0E8">' + FM._esc(z.label) + '</span>' +
            '<div style="display:flex;align-items:center;gap:6px">' +
              '<span style="font-size:11px;color:rgba(245,240,232,0.4)">' + FM._esc(tLabel) + '</span>' +
              '<span style="font-size:13px;font-weight:700;color:' + doseColor + '">' + parseFloat(avgDose).toFixed(1) + ' ' + z.unit + '</span>' +
            '</div>' +
          '</div>' +
          (phrase ? '<div style="font-size:11px;font-style:italic;color:rgba(200,169,126,0.45);margin-top:2px">' + phrase + '</div>' : '') +
        '</div>' +
      '</div>'
    })
    html += '</div>'

    // Totals
    if (FM._protocolData && FM._protocolData.totals) {
      var pt = FM._protocolData.totals
      html += '<div style="display:flex;gap:16px;margin-top:8px;padding:8px 0;border-top:1px solid rgba(200,169,126,0.10);justify-content:flex-end">'
      if (pt.ah_ml) html += '<span style="font-size:13px;color:#3B82F6;font-weight:600">' + FM._icon('droplet', 12) + ' ' + pt.ah_ml + ' mL AH</span>'
      if (pt.botox_units) html += '<span style="font-size:13px;color:#8B5CF6;font-weight:600">' + FM._icon('zap', 12) + ' ' + pt.botox_units + ' U Botox</span>'
      if (pt.bio_sessions) html += '<span style="font-size:13px;color:#10B981;font-weight:600">' + FM._icon('refresh-cw', 12) + ' ' + pt.bio_sessions + ' Sessoes Bio</span>'
      html += '</div>'
    } else if (FM._annotations.length > 0) {
      var totals = FM._calcTotals ? FM._calcTotals() : []
      if (totals.length > 0) {
        html += '<div style="display:flex;gap:16px;margin-top:8px;padding:8px 0;border-top:1px solid rgba(200,169,126,0.10);justify-content:flex-end">'
        totals.forEach(function (tt) {
          html += '<span style="font-size:13px;color:' + tt.color + ';font-weight:600">' + tt.ml.toFixed(1) + ' ' + FM._esc(tt.label) + '</span>'
        })
        html += '</div>'
      }
    }

    // ── Protocolo Lifting 5D,Cashback Fotona ──
    var _fotonaPrice = (FM._reportConfig && FM._reportConfig.fotona_price_per_session) || 5000
    var _fotonaSessions = (FM._reportConfig && FM._reportConfig.fotona_sessions) || 3
    var _fotonaTotal = _fotonaPrice * _fotonaSessions
    html += '<div style="margin-top:16px;padding:16px;background:linear-gradient(135deg,rgba(200,169,126,0.08),rgba(200,169,126,0.03));border:1px solid rgba(200,169,126,0.18);border-radius:10px">'
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      '<div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#C8A97E;font-weight:700">FOTONA DYNAMIS NX,CASHBACK</div>' +
      '<span style="font-size:10px;padding:3px 8px;background:rgba(16,185,129,0.15);color:#10B981;border-radius:4px;font-weight:600;letter-spacing:0.1em">INCLUSO NO PROTOCOLO</span>' +
    '</div>'
    html += '<div style="font-size:13px;color:rgba(245,240,232,0.55);line-height:1.6;margin-bottom:10px">' +
      'Ao fechar o Protocolo Lifting 5D, a paciente recebe de cashback <strong style="color:#C8A97E">' + _fotonaSessions + ' sessoes de Fotona 4D</strong>,' +
      'o melhor laser do mundo,atuando em todas as camadas do rosto.' +
    '</div>'

    html += '<div style="display:flex;gap:8px;margin-bottom:10px">'
    var fotonaMonths = ['Mes 1', 'Mes 2', 'Mes 3']
    fotonaMonths.forEach(function (m, i) {
      html += '<div style="flex:1;padding:10px;background:rgba(200,169,126,0.06);border:1px solid rgba(200,169,126,0.12);border-radius:8px;text-align:center">' +
        '<div style="font-size:16px;font-weight:800;color:#C8A97E">' + (i + 1) + '</div>' +
        '<div style="font-size:10px;color:rgba(245,240,232,0.4);letter-spacing:0.1em;text-transform:uppercase;margin-top:2px">' + m + '</div>' +
        '<div style="font-size:12px;color:rgba(245,240,232,0.55);margin-top:4px">Fotona 4D</div>' +
        '<div style="font-size:10px;color:#10B981;margin-top:2px">R$ ' + _fotonaPrice.toLocaleString('pt-BR') + '</div>' +
      '</div>'
    })
    html += '</div>'

    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid rgba(200,169,126,0.10)">' +
      '<span style="font-size:13px;color:rgba(245,240,232,0.5)">Valor total Fotona (' + _fotonaSessions + ' sessoes)</span>' +
      '<span style="font-size:16px;font-weight:700;color:#10B981">R$ ' + _fotonaTotal.toLocaleString('pt-BR') + ' <span style="font-size:11px;color:rgba(245,240,232,0.3);font-weight:400;text-decoration:line-through">pago pelo cashback</span></span>' +
    '</div>'
    html += '</div>'

    // ── Timeline Accordion Lifting 5D (VERTICAL INTERATIVO) ──
    html += '<div style="margin-top:16px;padding:16px;background:rgba(255,255,255,0.02);border:1px solid rgba(200,169,126,0.08);border-radius:10px">'
    html += '<div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(200,169,126,0.4);font-weight:600;margin-bottom:16px;text-align:center">JORNADA DO PROTOCOLO LIFTING 5D</div>'

    var timelineSteps = [
      { label: 'Dia 1 \u2014 Fotona 4D', timing: 'Primeira sessao', desc: 'Ativação de colageno profundo nas 4 camadas da pele. O laser Fotona Dynamis NX trabalha de dentro para fora, estimulando regeneração real desde a mucosa oral ate a superficie. Efeito lifting imediato com melhora progressiva ao longo de 30 dias.', color: '#10B981', products: ['Fotona 4D', 'Intraoral', 'Periorbital'] },
      { label: 'Semana 2 \u2014 Injetaveis', timing: '14 dias apos Fotona', desc: 'Aplicação estrategica de Acido Hialuronico para reposição de volume, Toxina Botulinica para suavizar linhas de expressão, e Bioestimulador para ativar produção de colageno. Cada zona tratada conforme o mapa de estruturacao personalizado.', color: '#3B82F6', products: ['Acido Hialuronico', 'Toxina Botulinica', 'Bioestimulador'] },
      { label: 'Semana 4 \u2014 Retoques', timing: '30 dias apos inicio', desc: 'Avaliação do resultado inicial e ajustes finos. Pequenas correcoes de volume, simetria e proporção. Esta sessao garante a precisão do resultado final.', color: '#C8A97E', products: ['Retoques AH', 'Ajustes'] },
      { label: 'Mes 2 \u2014 2a Sessao Fotona 4D', timing: '60 dias apos inicio', desc: 'Segunda sessao de laser para potencializar a produção de colageno. A pele ja responde melhor ao estimulo, resultando em firmeza e luminosidade progressivas.', color: '#10B981', products: ['Fotona 4D'] },
      { label: 'Mes 3 \u2014 3a Sessao Fotona 4D', timing: '90 dias apos inicio', desc: 'Sessao final do ciclo Fotona. O colageno novo ja esta em plena produção. Esta sessao consolida os resultados e prepara a pele para manutencao a longo prazo.', color: '#10B981', products: ['Fotona 4D'] },
      { label: 'Transformação', timing: 'Resultado visivel', desc: 'O protocolo completo atingiu seu objetivo. Os vetores faciais foram reconstruidos, o colageno restaurado, e a harmonia facial recuperada. O resultado não e um rosto diferente \u2014 e o seu rosto de volta.', color: '#C8A97E', products: [] },
    ]

    html += '<div style="position:relative">'
    timelineSteps.forEach(function (step, idx) {
      var isLast = idx === timelineSteps.length - 1
      var dotSize = isLast ? 20 : 16

      html += '<div class="fm-timeline-step" style="position:relative;padding-left:36px;margin-bottom:0">'

      // Vertical connecting line
      if (!isLast) {
        html += '<div style="position:absolute;left:14px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom,#C8A97E,#C8A97E)"></div>'
      } else {
        html += '<div style="position:absolute;left:14px;top:0;bottom:50%;width:2px;background:linear-gradient(to bottom,#C8A97E,#C8A97E)"></div>'
      }

      // Dot
      html += '<div style="position:absolute;left:' + (isLast ? 5 : 7) + 'px;top:16px;width:' + dotSize + 'px;height:' + dotSize + 'px;border-radius:50%;border:2px solid ' + step.color + ';background:#0A0A0A;z-index:1;cursor:pointer" onclick="this.parentElement.querySelector(\'.fm-tl-content\').style.display=this.parentElement.querySelector(\'.fm-tl-content\').style.display===\'none\'?\'block\':\'none\';this.querySelector(\'span\').textContent=this.parentElement.querySelector(\'.fm-tl-content\').style.display===\'none\'?\'+\':\'\u2212\'">'
      html += '<span style="color:' + step.color + ';font-size:10px;display:flex;align-items:center;justify-content:center;height:100%">\u2212</span>'
      html += '</div>'

      // Header (always visible)
      html += '<div style="padding:12px 0 4px 0;cursor:pointer" onclick="var c=this.nextElementSibling;c.style.display=c.style.display===\'none\'?\'block\':\'none\'">'
      html += '<div style="font-size:14px;font-weight:700;color:' + step.color + '">' + step.label + '</div>'
      html += '<div style="font-size:11px;color:rgba(245,240,232,0.4)">' + step.timing + '</div>'
      html += '</div>'

      // Content (collapsible, open by default)
      html += '<div class="fm-tl-content" style="display:block;padding-bottom:16px">'

      // Photo placeholder
      html += '<div contenteditable="false" style="width:100%;height:120px;background:rgba(255,255,255,0.03);border:1px dashed rgba(200,169,126,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:8px;color:rgba(200,169,126,0.3);font-size:11px;cursor:pointer" onclick="/* future: upload photo */">Adicionar foto do procedimento</div>'

      // Procedure description
      html += '<div contenteditable="true" style="font-size:13px;color:rgba(245,240,232,0.6);line-height:1.6;outline:none;border:none;background:transparent">' + step.desc + '</div>'

      // Product tags
      if (step.products.length > 0) {
        html += '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">'
        step.products.forEach(function (p) {
          html += '<span style="padding:3px 8px;background:rgba(200,169,126,0.08);border:1px solid rgba(200,169,126,0.15);border-radius:4px;font-size:10px;color:rgba(245,240,232,0.5)">' + p + '</span>'
        })
        html += '</div>'
      }

      html += '</div>' // end fm-tl-content
      html += '</div>' // end fm-timeline-step
    })
    html += '</div>'

    html += '<div style="display:flex;gap:12px;margin-top:14px;justify-content:center;flex-wrap:wrap;font-size:12px;color:rgba(245,240,232,0.4)">'
    html += '<span>Inicio: ' + _editable('fmTimeline1', 'dd/mm/aaaa', 'width:80px;font-size:12px;') + '</span>'
    html += '<span>Retorno: ' + _editable('fmTimeline2', 'dd/mm/aaaa', 'width:80px;font-size:12px;') + '</span>'
    html += '</div>'
    html += '</div>'

    // ── Beneficios Fotona ──
    html += '<div style="margin-top:10px;padding:10px 16px;background:rgba(16,185,129,0.04);border:1px solid rgba(16,185,129,0.10);border-radius:8px">'
    html += '<div style="font-size:11px;font-weight:600;color:#10B981;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Beneficios Fotona 4D inclusos</div>'
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;color:rgba(245,240,232,0.5)">'
    var beneficios = ['Lifting e firmeza profunda', 'Rejuvenescimento das 4 camadas', 'Produção intensa de colageno', 'Melhora textura e poros', 'Redução rugas e linhas', 'Resultados naturais com glow']
    beneficios.forEach(function (b) {
      html += '<div style="display:flex;align-items:center;gap:6px"><span style="color:#10B981;font-size:11px">&#x2713;</span> ' + b + '</div>'
    })
    html += '</div></div>'

    html += '</div>' // end Plano A padding div

    // ─── PLANO B,Essencial ───
    html += '<div class="fm-section" style="margin-top:12px;border-top:1px solid rgba(200,169,126,0.08)"></div>'
    html += _sectionTitle('Plano B \u2014 Protocolo Essencial', 'target')
    html += '<div style="padding:0 32px 4px 32px">'
    html += '<div style="margin-bottom:8px">' + _editable('fmPlanBSubtitle', 'Foco nas areas de maior impacto,sem Fotona', 'font-size:13px;font-style:italic;color:rgba(245,240,232,0.3);display:inline-block;width:100%;') + '</div>'

    // Pre-preencher com top 4 zonas marcadas (maior dose primeiro), senao editavel vazio
    var planBZones = []
    var planBAnnLookup = {}
    FM._annotations.forEach(function (a) {
      if (!planBAnnLookup[a.zone]) planBAnnLookup[a.zone] = { ml: 0, treatment: a.treatment, product: a.product || '' }
      planBAnnLookup[a.zone].ml += (a.ml || 0)
    })
    Object.keys(planBAnnLookup).forEach(function (zId) {
      var z = (FM.ZONES || []).find(function (x) { return x.id === zId })
      if (z) planBZones.push({ zone: z, data: planBAnnLookup[zId] })
    })
    planBZones.sort(function (a, b) { return b.data.ml - a.data.ml })
    var planBTop = planBZones.slice(0, 4)
    var planBRows = Math.max(4, planBTop.length)

    html += '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
      '<thead><tr>' + _thCell('Zona') + _thCell('Procedimento') + _thCell('Dose') + _thCell('Produto') + _thCell('Transformacao') + '</tr></thead><tbody>'

    for (var eb = 0; eb < planBRows; eb++) {
      var pbItem = planBTop[eb]
      var bg = eb % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
      if (pbItem) {
        var pbTr = (FM.TREATMENTS || []).find(function (x) { return x.id === pbItem.data.treatment })
        var pbPhrase = transformPhrases[pbItem.zone.id] || ''
        html += '<tr style="background:' + bg + '">' +
          _tdCell('<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + pbItem.zone.color + ';margin-right:6px;vertical-align:middle"></span>' + FM._esc(pbItem.zone.label)) +
          _tdCell(pbTr ? pbTr.label : 'Preenchimento') +
          _tdCell(pbItem.data.ml.toFixed(1) + ' ' + pbItem.zone.unit, 'color:' + (pbItem.zone.unit === 'U' ? '#8B5CF6' : '#3B82F6') + ';font-weight:600') +
          _tdEditable(pbItem.data.product || 'Produto') +
          _tdEditable(pbPhrase || 'Descreva a transformacao...') +
        '</tr>'
      } else {
        html += '<tr style="background:' + bg + '">' +
          _tdEditable('Zona') + _tdEditable('Procedimento') + _tdEditable('Dose') + _tdEditable('Produto') + _tdEditable('Descreva a transformacao...') +
        '</tr>'
      }
    }

    html += '</tbody></table>'
    html += '</div>'

    // ─── Investimento ───
    html += '<div class="fm-section" style="margin-top:12px;border-top:1px solid rgba(200,169,126,0.08)"></div>'
    html += _sectionTitle('Investimento', 'credit-card')
    html += '<div style="padding:4px 32px 12px 32px">'
    html += '<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">'

    html += '<div style="flex:1;min-width:200px;background:rgba(200,169,126,0.04);border:1px solid rgba(200,169,126,0.12);border-radius:8px;padding:14px 18px">'
    html += '<div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#C8A97E;font-weight:600;margin-bottom:4px">Plano A,Protocolo Lifting 5D</div>'
    html += '<div style="font-size:28px;font-weight:700;color:#F5F0E8">R$ ' + _editable('fmPriceA', '12.000 - 15.000', 'font-size:28px;font-weight:700;max-width:100%;') + '</div>'
    html += '<div style="font-size:11px;color:#10B981;margin-top:4px">+ Cashback: ' + _fotonaSessions + ' sessoes Fotona 4D (R$ ' + _fotonaTotal.toLocaleString('pt-BR') + ')</div>'
    html += '</div>'

    html += '<div style="flex:1;min-width:200px;background:rgba(255,255,255,0.02);border:1px solid rgba(200,169,126,0.08);border-radius:8px;padding:14px 18px">'
    html += '<div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(245,240,232,0.5);font-weight:600;margin-bottom:4px">Plano B,Essencial</div>'
    html += '<div style="font-size:28px;font-weight:700;color:#F5F0E8">R$ ' + _editable('fmPriceB', '5.000 - 8.000', 'font-size:28px;font-weight:700;max-width:100%;') + '</div>'
    html += '<div style="font-size:11px;color:rgba(245,240,232,0.3);margin-top:4px">Sem Fotona incluso</div>'
    html += '</div>'

    html += '</div>'
    html += '<div style="margin-top:10px;font-size:14px;color:rgba(245,240,232,0.5)">Condicoes: ' + _editable('fmPaymentConditions', 'Ate 10x sem juros no cartao', 'max-width:100%;') + '</div>'
    html += '<div style="margin-top:6px;font-size:12px;color:rgba(200,169,126,0.4);font-style:italic">Acompanhamento anual: 40% de beneficio exclusivo nas sessoes de Fotona 4D + condicoes especiais em retoques.</div>'
    html += '</div>'

    // ─── Mensagem Lifting 5D ───
    html += '<div style="margin-top:12px;padding:16px 24px;background:rgba(200,169,126,0.04);border-left:3px solid #C8A97E;border-radius:0 8px 8px 0">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:18px;font-style:italic;color:rgba(200,169,126,0.6);line-height:1.7">' +
        'O resultado não e um rosto transformado. E o seu rosto de volta,com firmeza, leveza e expressão viva.<br>' +
        'Porque o rejuvenescimento de verdade não e mudar quem você e. E fazer o espelho voltar a te reconhecer.' +
      '</div>' +
    '</div>'

    // ─── DEPOIMENTO ───
    html += '<div class="fm-section" style="margin-top:12px;border-top:1px solid rgba(200,169,126,0.08);padding:20px 32px;text-align:center">' +
      '<div style="font-size:10px;color:rgba(245,240,232,0.25);letter-spacing:0.15em;text-transform:uppercase;margin-bottom:10px">O que outras pacientes dizem</div>' +
      _editableBlock('fmReportTestimonial', '"Diferente mas ninguem sabe dizer o que mudou. Exatamente o que eu queria.",M.C., 48 anos', 'font-family:Cormorant Garamond,serif;font-size:18px;font-style:italic;text-align:center;border-color:rgba(200,169,126,0.10);') +
    '</div>'

    // ─── FOOTER ───
    html += '<div class="fm-section" style="margin-top:8px;border-top:1px solid rgba(200,169,126,0.12)">'
    html += '<div style="padding:24px 32px 8px 32px;text-align:center">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:18px;font-weight:300;font-style:italic;color:rgba(200,169,126,0.65);line-height:1.6;max-width:500px;margin:0 auto">' +
        'Nos não preenchemos rugas. Nos reposicionamos as forcas do seu rosto.' +
      '</div>' +
    '</div>'

    var profName = FM._profName()
    var profCRM = localStorage.getItem('fm_professional_crm')
      || (window.ClinicContext ? window.ClinicContext.getSetting('professional_crm', '') : '')
      || 'CRM/PR 38.526'
    var reportId = 'HF-' + Date.now().toString(36).toUpperCase()

    html += '<div style="display:flex;justify-content:space-between;align-items:flex-end;padding:12px 32px 10px 32px">' +
      '<div>' +
        '<div style="font-size:10px;color:rgba(245,240,232,0.20);letter-spacing:0.06em">Gerado por ClinicAI Face Mapping</div>' +
        '<div style="font-size:9px;color:rgba(245,240,232,0.12);margin-top:2px;font-family:monospace">' + reportId + '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:22px;font-weight:300;font-style:italic;color:#C8A97E" contenteditable="true">' + FM._esc(profName) + '</div>' +
        '<div style="font-size:10px;color:rgba(245,240,232,0.35);letter-spacing:0.1em;margin-top:2px">' + FM._esc(profCRM) + '</div>' +
      '</div>' +
    '</div>'
    html += '<div style="text-align:center;padding:0 32px 20px 32px;font-size:11px;color:rgba(245,240,232,0.25);letter-spacing:0.06em">Valido por 7 dias</div>'
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
  function _buildHTMLComparator(angleKey, angleLabel, bSrc, aSrc) {
    var beforeSrc = bSrc || (FM._photoUrls && FM._photoUrls[angleKey])
    var afterSrc = aSrc || (FM._afterPhotoByAngle && FM._afterPhotoByAngle[angleKey])
    if (!beforeSrc || !afterSrc) return ''

    var k = angleKey // shorthand for ID suffix

    return '<div style="margin-bottom:16px">' +
      '<div style="text-align:center;padding:12px 0 4px 0">' +
        '<span style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#C8A97E;font-weight:600">Vista ' + angleLabel + '</span>' +
      '</div>' +
      '<div style="max-width:794px;margin:0 auto;background:#0A0A0A;border-radius:8px;overflow:hidden;border:1px solid rgba(200,169,126,0.12)">' +
      '<div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(200,169,126,0.08)">' +
        '<div>' +
          '<div style="font-family:Cormorant Garamond,serif;font-size:16px;font-style:italic;color:#C8A97E" contenteditable="true">Antes & Depois</div>' +
          '<div style="font-size:8px;color:rgba(245,240,232,0.3);letter-spacing:0.1em;text-transform:uppercase">Deslize para comparar</div>' +
        '</div>' +
        '<div style="display:flex;gap:4px" id="cmpModes_' + k + '">' +
          '<button onclick="setCmpMode_' + k + '(\'slider\')" class="cmpBtn_' + k + ' active" data-m="slider" style="padding:4px 10px;border:1px solid rgba(200,169,126,0.3);border-radius:6px;background:rgba(200,169,126,0.15);color:#C8A97E;font-size:10px;cursor:pointer;font-family:Montserrat,sans-serif">Slider</button>' +
          '<button onclick="setCmpMode_' + k + '(\'fade\')" class="cmpBtn_' + k + '" data-m="fade" style="padding:4px 10px;border:1px solid rgba(200,169,126,0.15);border-radius:6px;background:transparent;color:rgba(245,240,232,0.5);font-size:10px;cursor:pointer;font-family:Montserrat,sans-serif">Transição</button>' +
          '<button onclick="setCmpMode_' + k + '(\'side\')" class="cmpBtn_' + k + '" data-m="side" style="padding:4px 10px;border:1px solid rgba(200,169,126,0.15);border-radius:6px;background:transparent;color:rgba(245,240,232,0.5);font-size:10px;cursor:pointer;font-family:Montserrat,sans-serif">Lado a Lado</button>' +
        '</div>' +
      '</div>' +
      // Slider mode
      '<div id="cmpSlider_' + k + '" style="position:relative;overflow:hidden;cursor:col-resize;touch-action:none">' +
        '<img id="cmpBefore_' + k + '" src="' + beforeSrc + '" style="width:100%;display:block" draggable="false">' +
        '<div id="cmpAfterWrap_' + k + '" style="position:absolute;top:0;bottom:0;left:50%;width:50%;overflow:hidden">' +
          '<img id="cmpAfter_' + k + '" src="' + afterSrc + '" style="display:block;position:absolute;top:0;left:0" draggable="false">' +
        '</div>' +
        '<div id="cmpLine_' + k + '" style="position:absolute;top:0;bottom:0;left:50%;width:3px;background:#C8A97E;box-shadow:0 0 8px rgba(200,169,126,0.5);z-index:2">' +
          '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:32px;height:32px;border-radius:50%;background:#0A0A0A;border:2px solid #C8A97E;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(200,169,126,0.4)">' +
            '<span style="color:#C8A97E;font-size:14px;font-weight:700">&harr;</span>' +
          '</div>' +
        '</div>' +
        '<div style="position:absolute;bottom:12px;left:16px;font-size:11px;font-weight:600;color:#EF4444;background:rgba(0,0,0,0.6);padding:3px 10px;border-radius:4px">ANTES</div>' +
        '<div style="position:absolute;bottom:12px;right:16px;font-size:11px;font-weight:600;color:#10B981;background:rgba(0,0,0,0.6);padding:3px 10px;border-radius:4px">DEPOIS</div>' +
      '</div>' +
      // Fade mode (hidden)
      '<div id="cmpFade_' + k + '" style="display:none;position:relative">' +
        '<img src="' + beforeSrc + '" style="width:100%;display:block" draggable="false">' +
        '<img id="cmpFadeAfter_' + k + '" src="' + afterSrc + '" style="position:absolute;top:0;left:0;width:100%;opacity:0;transition:opacity 0.1s" draggable="false">' +
        '<div style="position:absolute;bottom:12px;left:16px;font-size:11px;font-weight:600;color:#EF4444;background:rgba(0,0,0,0.6);padding:3px 10px;border-radius:4px">ANTES</div>' +
        '<div style="position:absolute;bottom:12px;right:16px;font-size:11px;font-weight:600;color:#10B981;background:rgba(0,0,0,0.6);padding:3px 10px;border-radius:4px">DEPOIS</div>' +
      '</div>' +
      // Side by side (hidden)
      '<div id="cmpSide_' + k + '" style="display:none;gap:2px">' +
        '<div style="flex:1;position:relative"><img src="' + beforeSrc + '" style="width:100%;display:block" draggable="false"><div style="position:absolute;bottom:8px;left:8px;font-size:9px;font-weight:600;color:#EF4444;background:rgba(0,0,0,0.6);padding:2px 8px;border-radius:4px">ANTES</div></div>' +
        '<div style="flex:1;position:relative"><img src="' + afterSrc + '" style="width:100%;display:block" draggable="false"><div style="position:absolute;bottom:8px;right:8px;font-size:9px;font-weight:600;color:#10B981;background:rgba(0,0,0,0.6);padding:2px 8px;border-radius:4px">DEPOIS</div></div>' +
      '</div>' +
      // Control
      '<div style="padding:8px 16px">' +
        '<input id="cmpRange_' + k + '" type="range" min="0" max="100" value="50" style="width:100%;height:4px;border-radius:2px;outline:none;cursor:pointer;-webkit-appearance:none;background:linear-gradient(90deg,#EF4444,#C8A97E,#10B981)">' +
      '</div>' +
    '</div>' +
    '</div>' +
    '<script>' +
    '(function(){' +
      'var k="' + k + '";' +
      'var cmpMode="slider";' +
      'function setCmpMode(m){cmpMode=m;' +
        'document.getElementById("cmpSlider_"+k).style.display=m==="slider"?"block":"none";' +
        'document.getElementById("cmpFade_"+k).style.display=m==="fade"?"block":"none";' +
        'document.getElementById("cmpSide_"+k).style.display=m==="side"?"flex":"none";' +
        'document.querySelectorAll(".cmpBtn_"+k).forEach(function(b){' +
          'var a=b.getAttribute("data-m")===m;' +
          'b.style.background=a?"rgba(200,169,126,0.15)":"transparent";' +
          'b.style.color=a?"#C8A97E":"rgba(245,240,232,0.5)";' +
          'b.style.borderColor=a?"rgba(200,169,126,0.3)":"rgba(200,169,126,0.15)";' +
        '});' +
      '}' +
      'window["setCmpMode_"+k]=setCmpMode;' +
      'function updateCmp(v){' +
        'if(cmpMode==="slider"){' +
          'var wrap=document.getElementById("cmpAfterWrap_"+k);' +
          'var afterImg=document.getElementById("cmpAfter_"+k);' +
          'var line=document.getElementById("cmpLine_"+k);' +
          'var container=document.getElementById("cmpSlider_"+k);' +
          'var cW=container.offsetWidth;' +
          'wrap.style.left=v+"%";' +
          'wrap.style.width=(100-v)+"%";' +
          'afterImg.style.width=cW+"px";' +
          'afterImg.style.marginLeft="-"+(cW*v/100)+"px";' +
          'line.style.left=v+"%";' +
        '}else if(cmpMode==="fade"){' +
          'document.getElementById("cmpFadeAfter_"+k).style.opacity=v/100;' +
        '}' +
      '}' +
      'document.getElementById("cmpRange_"+k).addEventListener("input",function(){updateCmp(parseInt(this.value))});' +
      'var sl=document.getElementById("cmpSlider_"+k);' +
      'var beforeImg=document.getElementById("cmpBefore_"+k);' +
      'function initSize(){if(sl.offsetWidth>0){updateCmp(50)}}' +
      'beforeImg.addEventListener("load",initSize);' +
      'if(beforeImg.complete)setTimeout(initSize,50);' +
      'window.addEventListener("resize",function(){updateCmp(parseInt(document.getElementById("cmpRange_"+k).value))});' +
      'function onDrag(e){var r=sl.getBoundingClientRect();var x=(e.touches?e.touches[0].clientX:e.clientX)-r.left;var p=Math.max(0,Math.min(100,x/r.width*100));document.getElementById("cmpRange_"+k).value=p;updateCmp(p)}' +
      'sl.addEventListener("mousedown",function(){var m=function(e){onDrag(e)};var u=function(){document.removeEventListener("mousemove",m);document.removeEventListener("mouseup",u)};document.addEventListener("mousemove",m);document.addEventListener("mouseup",u);});' +
      'sl.addEventListener("touchmove",function(e){e.preventDefault();onDrag(e)},{passive:false});' +
    '})();' +
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

    // Pre-convert comparator photo URLs to base64
    var cmpAngles = [
      { key: 'front', label: 'Frontal' },
      { key: '45', label: '45\u00B0' },
      { key: 'lateral', label: 'Lateral' }
    ]
    var cmpB64 = {}

    function _convertUrl(src, cb) {
      if (!src) { cb(null); return }
      if (src.startsWith('data:')) { cb(src); return }
      var cvs = document.createElement('canvas')
      var tmp = new Image()
      tmp.crossOrigin = 'anonymous'
      tmp.onload = function () {
        cvs.width = tmp.naturalWidth; cvs.height = tmp.naturalHeight
        cvs.getContext('2d').drawImage(tmp, 0, 0)
        try { cb(cvs.toDataURL('image/jpeg', 0.85)) } catch (e) { cb(null) }
      }
      tmp.onerror = function () { cb(null) }
      tmp.src = src
    }

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
      var waPhone = localStorage.getItem('fm_wa_phone') || (window.ClinicContext ? window.ClinicContext.getSetting('whatsapp_phone', '5544997504000') : '5544997504000')
      var waText = encodeURIComponent('Ola! Gostaria de agendar minha avaliação facial. Vi a proposta personalizada.')

      // Build comparator HTML with base64 images
      var comparatorHtml = ''
      cmpAngles.forEach(function (a) {
        var b = cmpB64[a.key]
        if (b && b.before && b.after) {
          comparatorHtml += _buildHTMLComparator(a.key, a.label, b.before, b.after)
        }
      })

      var fullHtml = '<!DOCTYPE html><html lang="pt-BR"><head>' +
        '<meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1.0">' +
        '<meta property="og:title" content="Análise Facial \u2014 ' + FM._clinicName() + '">' +
        '<meta property="og:description" content="Proposta personalizada de harmonização facial para ' + FM._esc(patientName) + '">' +
        '<meta property="og:type" content="website">' +
        '<link rel="preconnect" href="https://fonts.googleapis.com">' +
        '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">' +
        '<title>Análise Facial \u2014 ' + FM._esc(patientName) + '</title>' +
        '<style>' +
          'body{margin:0;padding:24px 16px;background:#0A0A0A;font-family:Montserrat,sans-serif;color:#F5F0E8}' +
          '#fmReportCard{max-width:794px;margin:0 auto;background:#0A0A0A;border-radius:4px;box-shadow:0 32px 100px rgba(0,0,0,0.6)}' +
          '[contenteditable]{cursor:text}' +
          '[contenteditable]:focus{border-color:#C8A97E !important;outline:none}' +
          'img{max-width:100%;height:auto}' +
          'table{width:100%}' +
          '@media(max-width:600px){' +
          'html,body{overflow-x:hidden!important}' +
          'body{padding:0!important}' +
          '#fmReportCard{width:100%!important;max-width:100vw!important;box-sizing:border-box!important;overflow:hidden!important;border-radius:0!important}' +
          '#fmReportCard [style*="padding"][style*="32px"]{padding-left:16px!important;padding-right:16px!important}' +
          '#fmReportCard .fm-sep{margin-left:16px!important;margin-right:16px!important}' +
          '.fm-header{flex-direction:column!important;gap:8px!important;align-items:flex-start!important;padding:20px 16px 14px!important}' +
          '.fm-clinic-name{font-size:24px!important}' +
          '.fm-row{flex-direction:column!important;gap:10px!important}' +
          '.fm-section{margin-top:24px!important;padding-top:16px!important}' +
          '#fmReportCard [style*="display:flex"][style*="gap:24px"]{flex-direction:column!important}' +
          '#fmReportCard [style*="display:grid"][style*="repeat(3"]{grid-template-columns:1fr 1fr!important}' +
          '#fmReportCard [style*="font-size:9px"],#fmReportCard [style*="font-size:10px"]{font-size:12px!important}' +
          '#fmReportCard [style*="font-size:11px"],#fmReportCard [style*="font-size:12px"]{font-size:13px!important}' +
          '#fmReportCard [style*="font-size:13px"]{font-size:14px!important}' +
          '#fmReportCard [style*="font-size:24px"]{font-size:20px!important}' +
          'table{font-size:13px!important}' +
          'table td,table th{padding:6px 4px!important}' +
          '.fm-zone-row{padding:10px 8px!important}' +
          '.fm-zone-row [style*="font-size:13px"]{font-size:14px!important}' +
          '.fm-zone-row [style*="font-size:11px"]{font-size:12px!important}' +
          '.fm-timeline-step{padding-left:28px!important}' +
          '.fm-timeline-step [style*="font-size:13px"]{font-size:14px!important;line-height:1.7!important}' +
          '.fm-timeline-step [style*="height:120px"]{height:80px!important}' +
          '}' +
          '.fm-cta-btn{display:inline-flex;align-items:center;gap:8px;padding:16px 32px;background:#25D366;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;text-decoration:none;font-family:Montserrat,sans-serif;margin:24px auto;transition:transform 0.2s;box-shadow:0 4px 16px rgba(37,211,102,0.3)}' +
          '.fm-cta-btn:hover{transform:scale(1.04)}' +
        '</style>' +
        '</head><body>' +
        '<div id="fmReportCard" style="max-width:794px;width:100%;margin:0 auto;background:#0A0A0A;border-radius:4px;font-family:Montserrat,sans-serif;color:#F5F0E8;box-shadow:0 32px 100px rgba(0,0,0,0.6);padding-bottom:24px;box-sizing:border-box">' +
        content +
        '</div>' +
        comparatorHtml +
        '<div style="text-align:center;padding:32px 16px">' +
          '<a class="fm-cta-btn" href="https://wa.me/' + waPhone + '?text=' + waText + '" target="_blank">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
            'Agendar Avaliação' +
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

    // Count comparator images that need conversion
    var cmpToConvert = []
    cmpAngles.forEach(function (a) {
      var bs = FM._photoUrls && FM._photoUrls[a.key]
      var as2 = FM._afterPhotoByAngle && FM._afterPhotoByAngle[a.key]
      if (bs && as2) {
        cmpB64[a.key] = { before: null, after: null }
        cmpToConvert.push({ key: a.key, prop: 'before', src: bs })
        cmpToConvert.push({ key: a.key, prop: 'after', src: as2 })
      }
    })

    var totalPending = blobImgs.length + cmpToConvert.length
    if (totalPending === 0) {
      finalize()
      return
    }

    pending = totalPending

    // Convert report DOM images
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

    // Convert comparator images (not in DOM)
    cmpToConvert.forEach(function (item) {
      _convertUrl(item.src, function (b64) {
        if (b64) cmpB64[item.key][item.prop] = b64
        pending--
        if (pending <= 0) finalize()
      })
    })

    // Safety timeout
    setTimeout(function () { finalize() }, 8000)
  }

  // ── Render canvases: copy from main canvases WITH all overlays ──
  FM._renderReportCanvases = function () {
    var activeAngle = FM._activeAngle || 'front'
    var angles = ['front', '45', 'lateral']

    angles.forEach(function (angId) {
      var antesEl = document.getElementById('fmReportCanvas_antes_' + angId)
      if (!antesEl) return

      if (angId === activeAngle && FM._canvas && FM._canvas.width > 0) {
        // Active angle: copy directly from live canvas (has all overlays)
        antesEl.width = FM._canvas.width
        antesEl.height = FM._canvas.height
        antesEl.getContext('2d').drawImage(FM._canvas, 0, 0)
      } else if (FM._photoUrls && FM._photoUrls[angId]) {
        // Non-active angle: render photo + overlays from stored state
        var photoUrl = FM._photoUrls[angId]
        var angStore = FM._angleStore && FM._angleStore[angId]
        ;(function (el, url, store, aId) {
          var img = new Image()
          img.onload = function () {
            var maxH = 500, scale = Math.min(400 / img.width, maxH / img.height, 1)
            var w = Math.round(img.width * scale), h = Math.round(img.height * scale)
            el.width = w; el.height = h
            var ctx = el.getContext('2d')
            ctx.drawImage(img, 0, 0, w, h)

            // Draw annotations (polygons) for this angle
            var anns = (FM._annotations || []).filter(function (a) { return a.angle === aId })
            anns.forEach(function (ann) {
              if (!ann.shape || ann.shape.type !== 'polygon' || !ann.shape.points) return
              var z = (FM.ZONES || []).find(function (x) { return x.id === ann.zone })
              var color = z ? z.color : '#C8A97E'
              var pts = ann.shape.points
              ctx.beginPath()
              ctx.moveTo(pts[0].x * w, pts[0].y * h)
              for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h)
              ctx.closePath()
              ctx.fillStyle = color + '40'
              ctx.fill()
              ctx.strokeStyle = color
              ctx.lineWidth = 1.5
              ctx.stroke()
            })

            // Draw metric lines if stored
            if (store) {
              var mLines = store._metricLines
              if (mLines) {
                ctx.setLineDash([4, 3])
                if (mLines.h) mLines.h.forEach(function (l) {
                  var y = l.y * h
                  ctx.strokeStyle = '#10B981'
                  ctx.lineWidth = 1
                  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
                })
                if (mLines.v) mLines.v.forEach(function (l) {
                  var x = l.x * w
                  ctx.strokeStyle = '#3B82F6'
                  ctx.lineWidth = 1
                  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
                })
                ctx.setLineDash([])
              }
            }
          }
          img.src = url
        })(el, photoUrl, angStore, angId)
      }
    })

    // DEPOIS canvas,copy directly from FM._canvas2 (already has overlays)
    var depoisEl = document.getElementById('fmReportCanvas_depois_' + activeAngle)
    if (depoisEl && FM._canvas2 && FM._canvas2.width > 0) {
      depoisEl.width = FM._canvas2.width
      depoisEl.height = FM._canvas2.height
      var dctx = depoisEl.getContext('2d')
      dctx.drawImage(FM._canvas2, 0, 0)
    }

    // VETORES canvas,render force vectors on the active angle photo
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

  // Preview do report como PNG antes de baixar — mostra exatamente como vai
  // ficar o arquivo final em uma modal sobreposta. Util para detectar
  // overflow, fonte truncada, ou layout quebrado sem precisar fazer download.
  FM._previewReport = function () {
    var report = document.getElementById('fmReportCard')
    if (!report) return
    if (!window.html2canvas) {
      FM._showToast('Preview indisponivel (html2canvas nao carregado)', 'warn')
      return
    }
    FM._showLoading('Gerando preview...')
    window.html2canvas(report, {
      backgroundColor: '#2C2C2C',
      scale: 1,  // metade da escala do download para ser rapido
      useCORS: true,
    }).then(function (canvas) {
      FM._hideLoading()
      var dataUrl = canvas.toDataURL('image/png')
      var modal = document.createElement('div')
      modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(10px)'
      modal.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;width:100%;max-width:900px;margin-bottom:12px">' +
          '<div style="font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;color:#C8A97E;letter-spacing:0.06em">PREVIEW \u00B7 ' + canvas.width + '\u00D7' + canvas.height + 'px</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button id="fmPreviewDownload" style="padding:8px 16px;border:none;border-radius:8px;background:#C8A97E;color:#0A0A0A;font-size:12px;font-weight:600;cursor:pointer;font-family:Montserrat,sans-serif">Confirmar e baixar</button>' +
            '<button id="fmPreviewClose" style="padding:8px 16px;border:1px solid rgba(245,240,232,0.2);border-radius:8px;background:transparent;color:rgba(245,240,232,0.7);font-size:12px;cursor:pointer;font-family:Montserrat,sans-serif">Fechar</button>' +
          '</div>' +
        '</div>' +
        '<div style="flex:1;width:100%;max-width:900px;overflow:auto;border-radius:8px;background:#1a1a1a;padding:12px;box-sizing:border-box">' +
          '<img src="' + dataUrl + '" style="width:100%;display:block;border-radius:4px"/>' +
        '</div>'
      document.body.appendChild(modal)
      modal.querySelector('#fmPreviewClose').onclick = function () { modal.remove() }
      modal.querySelector('#fmPreviewDownload').onclick = function () {
        var link = document.createElement('a')
        var name = (FM._lead.nome || FM._lead.name || 'paciente').replace(/\s+/g, '-').toLowerCase()
        link.download = 'analise-facial-' + name + '-' + FM._dateStr() + '.png'
        // Re-renderiza em escala 2x para download de qualidade
        FM._showLoading('Gerando PNG final...')
        window.html2canvas(report, { backgroundColor: '#2C2C2C', scale: 2, useCORS: true })
          .then(function (hd) {
            FM._hideLoading()
            link.href = hd.toDataURL('image/png')
            link.click()
            modal.remove()
            FM._showToast('Report exportado!', 'success')
          }).catch(function () { FM._hideLoading(); modal.remove() })
      }
    }).catch(function (e) {
      FM._hideLoading()
      FM._showToast('Falha ao gerar preview: ' + (e && e.message ? e.message : ''), 'error')
    })
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
    win.document.write('<!DOCTYPE html><html><head><title>Análise Facial</title>' +
      '<style>body{margin:0;background:#2C2C2C;font-family:Montserrat,sans-serif}' +
      '@media print{body{background:#fff}}</style></head><body>' +
      report.outerHTML + '</body></html>')
    win.document.close()
    setTimeout(function () { win.print() }, 500)
  }

  // ── Modo Apresentacao (fullscreen, sem toolbar) ──
  // ── Generate ANTES/DEPOIS crossfade video ──
  FM._generateCompareVideo = function (callback) {
    // Generate side-by-side ANTES|DEPOIS image (reliable, auto-displays in WhatsApp)
    var angles = ['front', '45', 'lateral']
    var beforeSrc = null
    var afterSrc = null
    for (var i = 0; i < angles.length; i++) {
      if (FM._photoUrls && FM._photoUrls[angles[i]] && FM._afterPhotoByAngle && FM._afterPhotoByAngle[angles[i]]) {
        beforeSrc = FM._photoUrls[angles[i]]
        afterSrc = FM._afterPhotoByAngle[angles[i]]
        break
      }
    }
    if (!beforeSrc || !afterSrc) { callback(null); return }

    // Generate side-by-side comparison image
    var beforeImg = new Image()
    var afterImg = new Image()
    var loaded = 0

    function onLoad() {
      loaded++
      if (loaded < 2) return

      // Side-by-side: ANTES | divider | DEPOIS
      var imgW = 480
      var imgH = Math.round(imgW * beforeImg.naturalHeight / beforeImg.naturalWidth) || 640
      var totalW = imgW * 2 + 4  // 4px divider
      var headerH = 40
      var footerH = 36
      var totalH = headerH + imgH + footerH

      var canvas = document.createElement('canvas')
      canvas.width = totalW
      canvas.height = totalH
      var ctx = canvas.getContext('2d')

      // Background
      ctx.fillStyle = '#0A0A0A'
      ctx.fillRect(0, 0, totalW, totalH)

      // Header
      ctx.font = '300 14px serif'
      ctx.fillStyle = '#C8A97E'
      ctx.textAlign = 'center'
      ctx.fillText('' + FM._clinicName() + '', totalW / 2, 26)

      // ANTES photo
      ctx.drawImage(beforeImg, 0, headerH, imgW, imgH)

      // Divider line (champagne)
      ctx.fillStyle = '#C8A97E'
      ctx.fillRect(imgW, headerH, 4, imgH)

      // DEPOIS photo
      ctx.drawImage(afterImg, imgW + 4, headerH, imgW, imgH)

      // ANTES label
      ctx.font = '700 16px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(8, headerH + imgH - 34, 80, 26)
      ctx.fillStyle = '#EF4444'
      ctx.fillText('ANTES', 16, headerH + imgH - 14)

      // DEPOIS label
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(totalW - 88, headerH + imgH - 34, 80, 26)
      ctx.fillStyle = '#10B981'
      ctx.fillText('DEPOIS', totalW - 16, headerH + imgH - 14)

      // Footer
      ctx.font = '300 11px sans-serif'
      ctx.fillStyle = 'rgba(200,169,126,0.5)'
      ctx.textAlign = 'center'
      ctx.fillText('Harmonia que revela. Precisão que dura.', totalW / 2, totalH - 10)

      // Convert to blob
      canvas.toBlob(function (blob) {
        callback(blob)
      }, 'image/jpeg', 0.9)
    }

    beforeImg.onload = onLoad
    afterImg.onload = onLoad
    beforeImg.onerror = function () { callback(null) }
    afterImg.onerror = function () { callback(null) }
    beforeImg.src = beforeSrc
    afterImg.src = afterSrc
  }

  // ── Send Report via WhatsApp (Evolution API) ──
  FM._sendReportWhatsApp = function () {
    var lead = FM._lead
    if (!lead) { FM._showToast('Nenhum paciente selecionado', 'warn'); return }

    var phoneDefault = lead.phone || lead.whatsapp || lead.telefone || ''
    var phone = prompt('Enviar report para qual WhatsApp? (com DDD)', phoneDefault)
    if (!phone) return

    // Normalize phone
    phone = phone.replace(/\D/g, '')
    if (phone.length === 11) phone = '55' + phone
    if (phone.length === 10) phone = '55' + phone

    var patientName = lead.nome || lead.name || 'Paciente'
    var safeName = patientName.replace(/\s+/g, '-').toLowerCase()

    var EVOLUTION_URL = 'https://evolution.aldenquesada.site'
    var EVOLUTION_KEY = '429683C4C977415CAAFCCE10F7D57E11'
    var EVOLUTION_INSTANCE = 'Mih'

    function _sendHTMLReport() {
      FM._exportReportHTMLBlob(function (htmlBlob) {
        if (!htmlBlob) { FM._hideLoading(); FM._showToast('Erro ao gerar HTML', 'error'); return }

        var reader = new FileReader()
        reader.onload = function () {
          var base64 = reader.result.split(',')[1]

          fetch(EVOLUTION_URL + '/message/sendMedia/' + EVOLUTION_INSTANCE, {
            method: 'POST',
            headers: { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              number: phone,
              mediatype: 'document',
              mimetype: 'text/html',
              caption: (FM._getWACaption && FM._getWACaption('report_html') || '').replace(/\{\{nome\}\}/g, patientName) || 'Plano de Harmonia Facial personalizado para ' + patientName + '\n\n' + FM._clinicName() + '\nHarmonia que revela. Precisão que dura.',
              media: base64,
              fileName: 'proposta-facial-' + safeName + '.html',
            }),
          })
          .then(function (r) { return r.json() })
          .then(function (data) {
            FM._hideLoading()
            if (data.key || data.status === 'PENDING' || data.messageId) {
              FM._showToast('Report enviado para ' + phone + ' via WhatsApp!', 'success')
            } else {
              console.warn('[FM] WhatsApp send response:', data)
              FM._showToast('Enviado (verifique no WhatsApp)', 'success')
            }
          })
          .catch(function (err) {
            FM._hideLoading()
            FM._showToast('Erro ao enviar: ' + (err.message || 'verifique a conexao'), 'error')
          })
        }
        reader.readAsDataURL(htmlBlob)
      })
    }

    FM._showLoading('Gerando video e report...')

    // Step 1: Generate and send ANTES/DEPOIS image first (appears on top)
    FM._generateCompareVideo(function (imgBlob) {
      if (!imgBlob) { _sendHTMLReport(); return }

      var imgReader = new FileReader()
      imgReader.onload = function () {
        var imgBase64 = imgReader.result.split(',')[1]

        fetch(EVOLUTION_URL + '/message/sendMedia/' + EVOLUTION_INSTANCE, {
          method: 'POST',
          headers: { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: phone,
            mediatype: 'image',
            mimetype: 'image/jpeg',
            caption: (FM._getWACaption && FM._getWACaption('report_imagem')) || 'Resultado do seu Protocolo de Harmonia Facial\n\n' + FM._clinicName() + '\nHarmonia que revela. Precisão que dura.',
            media: imgBase64,
            fileName: 'resultado-' + safeName + '.jpg',
          }),
        })
        .then(function (r) { return r.json() })
        .then(function () {
          // Step 2: Send HTML report after (appears below)
          setTimeout(_sendHTMLReport, 1500)
        })
        .catch(function () { _sendHTMLReport() })
      }
      imgReader.onerror = function () { _sendHTMLReport() }
      imgReader.readAsDataURL(imgBlob)
    })
  }

  // Generate HTML blob (reusable by both download and WhatsApp send)
  FM._exportReportHTMLBlob = function (callback) {
    var report = document.getElementById('fmReportCard')
    if (!report) { callback(null); return }

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
      } catch (e) {}
    })

    var imgs = report.querySelectorAll('img')
    var blobImgs = []
    imgs.forEach(function (img) {
      if (img.src && (img.src.startsWith('blob:') || img.src.startsWith('data:'))) blobImgs.push(img)
    })

    var pendingB = blobImgs.length
    if (pendingB === 0) { _finalizeSend(); return }

    blobImgs.forEach(function (img) {
      if (img.src.startsWith('data:')) {
        pendingB--
        if (pendingB <= 0) _finalizeSend()
        return
      }
      var c2 = document.createElement('canvas')
      var tempImg = new Image()
      tempImg.crossOrigin = 'anonymous'
      tempImg.onload = function () {
        c2.width = tempImg.naturalWidth; c2.height = tempImg.naturalHeight
        c2.getContext('2d').drawImage(tempImg, 0, 0)
        try { img.src = c2.toDataURL('image/jpeg', 0.8) } catch (e) {}
        pendingB--
        if (pendingB <= 0) _finalizeSend()
      }
      tempImg.onerror = function () {
        pendingB--
        if (pendingB <= 0) _finalizeSend()
      }
      tempImg.src = img.src
    })

    setTimeout(function () { _finalizeSend() }, 6000)

    function _finalizeSend() {
      if (_finalizeSend._done) return
      _finalizeSend._done = true

      try {
        replacements.forEach(function (r) {
          if (r.canvas.parentNode) r.canvas.parentNode.replaceChild(r.img, r.canvas)
        })
        var content = report.innerHTML
        replacements.forEach(function (r) {
          if (r.img.parentNode) r.img.parentNode.replaceChild(r.canvas, r.img)
        })
      } catch (e) {
        console.error('[FM] _finalizeSend canvas swap error:', e)
        var content = report.innerHTML
      }

      var patientName = FM._lead ? (FM._lead.nome || FM._lead.name || 'Paciente') : 'Paciente'
      var waPhone = localStorage.getItem('fm_wa_phone') || (window.ClinicContext ? window.ClinicContext.getSetting('whatsapp_phone', '5544997504000') : '5544997504000')
      var waText = encodeURIComponent('Ola! Gostaria de agendar minha avaliação facial.')

      var fullHtml = '<!DOCTYPE html><html lang="pt-BR"><head>' +
        '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
        '<meta property="og:title" content="Análise Facial, ' + FM._clinicName() + '">' +
        '<meta property="og:description" content="Proposta personalizada para ' + FM._esc(patientName) + '">' +
        '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">' +
        '<title>Análise Facial, ' + FM._esc(patientName) + '</title>' +
        '<style>body{margin:0;padding:24px 16px;background:#0A0A0A;font-family:Montserrat,sans-serif;color:#F5F0E8}' +
        '#fmReportCard{max-width:794px;width:100%;margin:0 auto;box-sizing:border-box}[contenteditable]{cursor:text}[contenteditable]:focus{border-color:#C8A97E!important;outline:none}' +
        'img{max-width:100%;height:auto}table{width:100%}' +
        '@media(max-width:600px){html,body{overflow-x:hidden!important}body{padding:0!important}' +
        '#fmReportCard{width:100%!important;max-width:100vw!important;box-sizing:border-box!important;overflow:hidden!important;border-radius:0!important}' +
        '#fmReportCard [style*="padding"][style*="32px"]{padding-left:16px!important;padding-right:16px!important}' +
        '#fmReportCard .fm-sep{margin-left:16px!important;margin-right:16px!important}' +
        '.fm-header{flex-direction:column!important;gap:8px!important;align-items:flex-start!important;padding:20px 16px 14px!important}' +
        '.fm-clinic-name{font-size:24px!important}' +
        '.fm-row{flex-direction:column!important;gap:10px!important}' +
        '.fm-section{margin-top:24px!important;padding-top:16px!important}' +
        '#fmReportCard [style*="display:flex"][style*="gap:24px"]{flex-direction:column!important}' +
        '#fmReportCard [style*="display:grid"][style*="repeat(3"]{grid-template-columns:1fr 1fr!important}' +
        '#fmReportCard [style*="font-size:9px"],#fmReportCard [style*="font-size:10px"]{font-size:12px!important}' +
        '#fmReportCard [style*="font-size:11px"],#fmReportCard [style*="font-size:12px"]{font-size:13px!important}' +
        '#fmReportCard [style*="font-size:13px"]{font-size:14px!important}' +
        '#fmReportCard [style*="font-size:24px"]{font-size:20px!important}' +
        'table{font-size:13px!important}table td,table th{padding:6px 4px!important}' +
        '.fm-zone-row{padding:10px 8px!important}' +
        '.fm-timeline-step{padding-left:28px!important}' +
        '.fm-timeline-step [style*="height:120px"]{height:80px!important}' +
        '}' +
        '.fm-cta-btn{display:inline-flex;align-items:center;gap:8px;padding:16px 32px;background:#25D366;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;text-decoration:none;font-family:Montserrat,sans-serif;margin:24px auto;transition:transform 0.2s;box-shadow:0 4px 16px rgba(37,211,102,0.3)}' +
        '.fm-cta-btn:hover{transform:scale(1.04)}</style></head><body>' +
        '<div id="fmReportCard" style="max-width:794px;width:100%;margin:0 auto;background:#0A0A0A;border-radius:4px;font-family:Montserrat,sans-serif;color:#F5F0E8;padding-bottom:24px;box-sizing:border-box">' +
        content + '</div>' +
        '<div style="text-align:center;padding:32px 16px">' +
        '<a class="fm-cta-btn" href="https://wa.me/' + waPhone + '?text=' + waText + '" target="_blank">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
        'Agendar Avaliação</a></div></body></html>'

      var blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
      callback(blob)
    }
  }

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
