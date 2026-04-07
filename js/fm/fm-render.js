/**
 * fm-render.js — Pure render functions (split from fm-ui.js)
 */
;(function () {
  'use strict'

  var FM = window._FM

  // ── Render ────────────────────────────────────────────────

  FM._render = function () {
    var root = document.getElementById('facialAnalysisRoot')
    if (!root) return

    var name = FM._lead.nome || FM._lead.name || 'Paciente'

    root.innerHTML = '<div class="fm-page">' +
      FM._renderHeader(name) +
      FM._renderProgressBar() +
      '<div class="fm-body">' +
        FM._renderPhotoStrip() +
        FM._renderCanvasArea() +
        (FM._editorMode === 'analysis' && FM._analysisSubMode === 'metrics' && (FM._scanData || FM._metricAngles)
          ? FM._renderClinicalPanel()
          : FM._renderToolbar()) +
      '</div>' +
    '</div>'

    FM._bindEvents()
    if (window.feather) window.feather.replace()
  }

  FM._renderHeader = function (name) {
    return '<div class="fm-header">' +
      '<div class="fm-header-left">' +
        '<span class="fm-header-title">Analise Facial</span>' +
      '</div>' +
      '<div class="fm-header-actions">' +
        '<div class="fm-mode-toggle">' +
          '<button class="fm-mode-btn' + (FM._editorMode === 'zones' ? ' active' : '') + '" onclick="FaceMapping._setEditorMode(\'zones\')">' + FM._icon('layers', 14) + ' Zonas</button>' +
          '<button class="fm-mode-btn' + (FM._editorMode === 'vectors' ? ' active' : '') + '" onclick="FaceMapping._setEditorMode(\'vectors\')">' + FM._icon('trending-up', 14) + ' Vetores</button>' +
          '<button class="fm-mode-btn' + (FM._editorMode === 'analysis' ? ' active' : '') + '" onclick="FaceMapping._setEditorMode(\'analysis\')">' + FM._icon('git-commit', 14) + ' Analise</button>' +
        '</div>' +
        '<button class="fm-btn" onclick="FaceMapping._autoDetectZones()" title="IA detecta zonas" style="border-color:#10B981;color:#10B981">' + FM._icon('zap', 14) + ' Auto Zonas</button>' +
        '<button class="fm-btn" onclick="FaceMapping._autoAnalyze()" title="IA 478 pontos">' + FM._icon('cpu', 14) + ' Auto Analise</button>' +
        '<button class="fm-btn" onclick="FaceMapping._toggleWireframe()" title="Wireframe 478pts" style="border-color:' + (FM._showWireframe ? '#C8A97E' : 'rgba(200,169,126,0.3)') + ';color:' + (FM._showWireframe ? '#C8A97E' : 'rgba(200,169,126,0.5)') + '">' + FM._icon('grid', 14) + '</button>' +
        '<button class="fm-btn" onclick="FaceMapping._toggle3DView()" title="3D" style="border-color:#8B5CF6;color:#8B5CF6">' + FM._icon('box', 14) + ' 3D</button>' +
        '<button class="fm-btn" onclick="FaceMapping._openBeforeAfter()" style="border-color:#F59E0B;color:#F59E0B">' + FM._icon('columns', 14) + ' A/D</button>' +
        '<button class="fm-btn" onclick="FaceMapping._openCompare()" style="background:linear-gradient(135deg,#C8A97E,#A8895E);color:#fff;border-color:transparent">' + FM._icon('eye', 14) + ' Comparar</button>' +
        '<button class="fm-btn" onclick="FaceMapping._exportReport()">' + FM._icon('download', 14) + ' Report</button>' +
        '<button class="fm-btn fm-btn-primary" onclick="FaceMapping._saveToSupabase()">' + FM._icon('save', 14) + ' Salvar</button>' +
      '</div>' +
    '</div>'
  }

  FM._renderProgressBar = function () {
    var progress = FM._viewProgress()
    var doneCount = progress.filter(function (v) { return v.complete }).length

    var html = '<div class="fm-progress-bar">'

    progress.forEach(function (v, i) {
      var state = v.complete ? 'done' : (v.hasPhoto ? 'photo' : 'empty')
      var isActive = FM._activeAngle === v.id
      var statusIcon = v.complete
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
        : (v.hasPhoto ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>')

      html += '<div class="fm-progress-step' + (isActive ? ' active' : '') + ' fm-progress-' + state + '" ' +
        'onclick="FaceMapping._selectAngle(\'' + v.id + '\')">' +
        '<span class="fm-progress-icon">' + statusIcon + '</span>' +
        '<span class="fm-progress-label">' + v.label + '</span>' +
        '<span class="fm-progress-detail">' +
          (v.hasPhoto ? (v.count > 0 ? v.count + ' marcacao' + (v.count > 1 ? 'es' : '') : 'Sem marcacoes') : 'Sem foto') +
        '</span>' +
      '</div>'

      if (i < progress.length - 1) {
        html += '<div class="fm-progress-line' + (progress[i].complete ? ' done' : '') + '"></div>'
      }
    })

    html += '<div class="fm-progress-summary">' + doneCount + '/3</div>'

    // Patient name + secondary actions (moved from header)
    html += '<div style="display:flex;align-items:center;gap:8px;margin-left:auto;padding-left:12px">'
    var pname = FM._lead ? (FM._lead.nome || FM._lead.name || '') : ''
    if (pname) {
      html += '<span style="font-size:11px;color:var(--text-secondary);font-weight:500">' + FM._icon('user', 12) + ' ' + FM._esc(pname) + '</span>'
    }
    html += '<button class="fm-btn" onclick="FaceMapping._editRanges()" title="Editar ranges" style="padding:4px 8px;font-size:10px">' + FM._icon('sliders', 12) + ' Ranges</button>'
    html += '<button class="fm-btn" onclick="FaceMapping._showTemplates()" title="Templates" style="padding:4px 8px;font-size:10px">' + FM._icon('clipboard', 12) + ' Templates</button>'
    html += '<button class="fm-btn" onclick="FaceMapping._showHistory()" title="Historico" style="padding:4px 8px;font-size:10px">' + FM._icon('clock', 12) + '</button>'
    html += '<button class="fm-btn" onclick="FaceMapping._clearAll()" title="Limpar tudo" style="padding:4px 8px;font-size:10px">' + FM._icon('trash-2', 12) + '</button>'
    html += '</div>'

    html += '</div>'
    return html
  }

  FM._renderPhotoStrip = function () {
    var html = '<div class="fm-photo-strip">'

    FM.ANGLES.forEach(function (a) {
      if (FM._photoUrls[a.id]) {
        html += '<div class="fm-photo-thumb' + (FM._activeAngle === a.id ? ' active' : '') + '" ' +
          'onclick="FaceMapping._selectAngle(\'' + a.id + '\')">' +
          '<img src="' + FM._photoUrls[a.id] + '" alt="' + a.label + '">' +
          '<span class="fm-photo-thumb-label">ANTES \u2022 ' + a.label + '</span>' +
          '<div class="fm-photo-actions">' +
            '<button class="fm-photo-action-btn" onclick="event.stopPropagation();FaceMapping._recrop(\'' + a.id + '\')" title="Recortar">' +
              FM._icon('crop', 11) +
            '</button>' +
            '<button class="fm-photo-action-btn fm-photo-delete-btn" onclick="event.stopPropagation();FaceMapping._deletePhoto(\'' + a.id + '\')" title="Excluir foto">' +
              FM._icon('trash-2', 11) +
            '</button>' +
          '</div>' +
        '</div>'
      } else {
        html += '<div class="fm-photo-upload" onclick="FaceMapping._triggerUpload(\'' + a.id + '\')">' +
          FM._icon('camera', 20) +
          '<span>ANTES</span>' +
          '<span style="font-size:9px">' + a.label + '</span>' +
        '</div>'
      }
    })

    // Separator + DEPOIS / SIMULADO slots
    html += '<div style="border-top:1px solid var(--border);margin:8px 0;padding-top:8px">' +
      '<div style="font-size:8px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);text-align:center;margin-bottom:6px">Report</div>'

    // DEPOIS
    if (FM._afterPhotoUrl) {
      html += '<div class="fm-photo-thumb" style="border-color:#10B981" onclick="FaceMapping._triggerUploadExtra(\'after\')">' +
        '<img src="' + FM._afterPhotoUrl + '" alt="Depois">' +
        '<span class="fm-photo-thumb-label" style="background:rgba(16,185,129,0.8)">DEPOIS</span>' +
        '<div class="fm-photo-actions"><button class="fm-photo-action-btn fm-photo-delete-btn" onclick="event.stopPropagation();FaceMapping._deleteExtraPhoto(\'after\')" title="Excluir">' + FM._icon('trash-2', 11) + '</button></div>' +
      '</div>'
    } else {
      html += '<div class="fm-photo-upload" onclick="FaceMapping._triggerUploadExtra(\'after\')" style="border-color:#10B98140">' +
        FM._icon('camera', 16) + '<span style="font-size:8px">DEPOIS</span></div>'
    }

    // SIMULADO
    if (FM._simPhotoUrl) {
      html += '<div class="fm-photo-thumb" style="border-color:#C9A96E">' +
        '<img src="' + FM._simPhotoUrl + '" alt="Simulado">' +
        '<span class="fm-photo-thumb-label" style="background:rgba(201,169,110,0.9)">SIMULADO</span>' +
      '</div>'
    } else {
      var hasAnns = FM._annotations.length > 0
      html += '<div class="fm-photo-upload" ' +
        (hasAnns ? 'onclick="FaceMapping._regenSim()"' : '') +
        ' style="border-color:#C9A96E40;' + (hasAnns ? '' : 'opacity:0.4;cursor:default') + '">' +
        FM._icon('zap', 16) + '<span style="font-size:7px">AUTO</span><span style="font-size:8px">SIMULADO</span></div>'
    }

    html += '</div>'

    html += '<input type="file" id="fmFileInput" accept="image/jpeg,image/png,image/webp" style="display:none">'
    html += '<input type="file" id="fmExtraFileInput" accept="image/jpeg,image/png,image/webp" style="display:none">'
    html += '</div>'
    return html
  }

  FM._renderCanvasArea = function () {
    if (!FM._activeAngle || !FM._photoUrls[FM._activeAngle]) {
      return '<div class="fm-canvas-area">' +
        '<div class="fm-empty-state">' +
          FM._icon('image', 48) +
          '<p>Faca o upload das fotos ANTES<br>para iniciar a analise</p>' +
        '</div>' +
      '</div>'
    }

    return '<div class="fm-canvas-area" id="fmCanvasArea">' +
      '<div class="fm-canvas-wrap drawing" id="fmCanvasWrap">' +
        '<canvas id="fmCanvas"></canvas>' +
      '</div>' +
      '<div class="fm-canvas-controls">' +
        '<button onclick="FaceMapping._toggleFullscreen()" title="Tela cheia" class="fm-canvas-ctrl-btn">' + FM._icon('maximize-2', 14) + '</button>' +
      '</div>' +
    '</div>'
  }

  FM._renderClinicalPanel = function () {
    // Only show in metrics mode with data
    if (FM._editorMode !== 'analysis' || FM._analysisSubMode !== 'metrics') {
      return ''
    }

    var scan = FM._scanData
    var ma = FM._metricAngles
    var skin = FM._skinAnalysis
    var age = FM._skinAge

    // If no data at all, return empty
    if (!scan && !ma && !skin) return ''

    var html = '<div class="fm-clinical-panel" style="width:300px;flex-shrink:0;background:#1A1A1A;border-left:1px solid rgba(200,169,126,0.15);overflow-y:auto;max-height:calc(100vh - 100px);font-size:11px">'

    // Sub-mode toggle + tools at top
    html += '<div style="padding:8px 12px;border-bottom:1px solid rgba(200,169,126,0.1);display:flex;flex-wrap:wrap;gap:4px">' +
      '<button class="fm-zone-btn" onclick="FaceMapping._analysisSubMode=\'tercos\';FaceMapping._render();setTimeout(FaceMapping._initCanvas,50)" style="flex:1;justify-content:center;font-size:10px;min-width:60px">Tercos</button>' +
      '<button class="fm-zone-btn" onclick="FaceMapping._analysisSubMode=\'ricketts\';FaceMapping._render();setTimeout(FaceMapping._initCanvas,50)" style="flex:1;justify-content:center;font-size:10px;min-width:60px">Ricketts</button>' +
      '<button class="fm-zone-btn active" style="flex:1;justify-content:center;font-size:10px;min-width:60px;border-color:#10B981;color:#fff">Metrificar</button>' +
    '</div>' +
    '<div style="padding:6px 12px;border-bottom:1px solid rgba(200,169,126,0.1);display:flex;gap:4px">' +
      '<button class="fm-zone-btn' + (FM._metricTool === 'hline' ? ' active' : '') + '" onclick="FaceMapping._setMetricTool(\'hline\')" style="flex:1;justify-content:center;font-size:9px">-- H</button>' +
      '<button class="fm-zone-btn' + (FM._metricTool === 'vline' ? ' active' : '') + '" onclick="FaceMapping._setMetricTool(\'vline\')" style="flex:1;justify-content:center;font-size:9px">| V</button>' +
      '<button class="fm-zone-btn' + (FM._metricTool === 'point' ? ' active' : '') + '" onclick="FaceMapping._setMetricTool(\'point\')" style="flex:1;justify-content:center;font-size:9px">Ponto</button>' +
      '<button class="fm-btn" onclick="FaceMapping._autoAsymmetryPairs()" style="flex:1;font-size:9px;padding:4px;border-color:#F59E0B;color:#F59E0B">Pares</button>' +
      '<button class="fm-btn" onclick="FaceMapping._autoAngles()" style="flex:1;font-size:9px;padding:4px;border-color:#C8A97E;color:#C8A97E">Angulos</button>' +
      '<button class="fm-btn" onclick="FaceMapping._clearMetricLines(\'all\')" style="padding:4px 6px;font-size:9px;color:#EF4444">X</button>' +
    '</div>' +
    '<div style="padding:4px 12px;border-bottom:1px solid rgba(200,169,126,0.1);display:flex;gap:4px">' +
      '<button class="fm-btn" onclick="FaceMapping._exportReport()" style="flex:1;font-size:9px;padding:4px">' + FM._icon('download', 12) + ' Report</button>' +
      '<button class="fm-btn fm-btn-primary" onclick="FaceMapping._saveToSupabase()" style="flex:1;font-size:9px;padding:4px">' + FM._icon('save', 12) + ' Salvar</button>' +
    '</div>'

    // ── ASYMMETRY SCORE (if pairs exist) ──
    if (FM._asymmetryScore) {
      var as = FM._asymmetryScore
      html += '<div style="border-bottom:1px solid rgba(200,169,126,0.1)">' +
        '<div style="background:rgba(245,158,11,0.15);padding:6px 12px">' +
          '<span style="font-size:9px;font-weight:700;letter-spacing:0.1em;color:#F59E0B">SCORE ASSIMETRIA GLOBAL</span>' +
        '</div>' +
        '<div style="padding:10px 12px">' +
          '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">' +
            '<span style="font-size:28px;font-weight:800;color:' + as.classification.color + '">' + as.score + '</span>' +
            '<div>' +
              '<div style="font-size:11px;font-weight:600;color:' + as.classification.color + '">' + as.classification.label + '</div>' +
              '<div style="font-size:9px;color:rgba(245,240,232,0.4)">' + as.pair_count + ' pares | media ' + as.avg_deviation + 'px</div>' +
            '</div>' +
          '</div>'

      // Detail per pair
      as.details.forEach(function (d) {
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.03)">' +
          '<span style="font-size:10px;color:rgba(245,240,232,0.6)">' + d.pair + '</span>' +
          '<div style="text-align:right">' +
            '<span style="font-size:10px;font-weight:600;color:' + d.color + '">' + d.severity + '</span>' +
            '<span style="font-size:9px;color:rgba(245,240,232,0.4);margin-left:6px">\u2195' + d.dy + 'px ' + d.higher + '</span>' +
          '</div>' +
        '</div>'
      })

      html += '</div></div>'
    }

    // ── SECTION 1: PLANO VERTICAL ──
    html += '<div style="border-bottom:1px solid rgba(200,169,126,0.1)">' +
      '<div style="background:rgba(16,185,129,0.15);padding:6px 12px">' +
        '<span style="font-size:9px;font-weight:700;letter-spacing:0.1em;color:#10B981">PLANO VERTICAL</span>' +
      '</div>' +
      '<div style="padding:10px 12px">'

    if (scan && scan.thirds) {
      var t = scan.thirds
      html += _clinVal('Terco Superior', Math.round(t.superior) + '%', t.superior >= 28 && t.superior <= 38 ? '#10B981' : '#EF4444')
      html += _clinVal('Terco Medio', Math.round(t.medio) + '%', t.medio >= 28 && t.medio <= 38 ? '#10B981' : '#F59E0B')
      html += _clinVal('Terco Inferior', Math.round(t.inferior) + '%', t.inferior >= 28 && t.inferior <= 38 ? '#10B981' : '#F59E0B')
      html += _clinVal('Equilibrio', t.balanced ? 'Sim' : 'Nao', t.balanced ? '#10B981' : '#EF4444')

      if (t.inferior > 38) {
        html += _clinRx('Terco inferior longo', 'Botox masseter 20-30U bilateral para reduzir')
      } else if (t.inferior < 28) {
        html += _clinRx('Terco inferior curto', 'AH mento 1-2mL para projecao vertical')
      }
      if (t.medio > 38) {
        html += _clinRx('Terco medio aumentado', 'AH ponta nasal 0.5mL para encurtar')
      }
      if (t.balanced) {
        html += '<div style="color:#10B981;font-size:10px;margin-top:4px">Proporcoes verticais equilibradas</div>'
      }
    } else {
      html += '<div style="color:rgba(245,240,232,0.4);font-size:10px">Execute Auto Analise</div>'
    }

    if (scan && scan.symmetry) {
      html += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'
      html += _clinVal('Simetria Global', scan.symmetry.overall + '%', scan.symmetry.overall >= 85 ? '#10B981' : scan.symmetry.overall >= 70 ? '#F59E0B' : '#EF4444')
      if (scan.symmetry.overall < 85) {
        html += _clinRx('Assimetria detectada', 'AH compensatorio no lado deficiente')
      }
      html += '</div>'
    }

    html += '</div></div>'

    // ── SECTION 2: PLANO HORIZONTAL ──
    html += '<div style="border-bottom:1px solid rgba(200,169,126,0.1)">' +
      '<div style="background:rgba(59,130,246,0.15);padding:6px 12px">' +
        '<span style="font-size:9px;font-weight:700;letter-spacing:0.1em;color:#3B82F6">PLANO HORIZONTAL</span>' +
      '</div>' +
      '<div style="padding:10px 12px">'

    if (scan && scan.shape) {
      html += _clinVal('Biotipo', scan.shape.shape, '#C8A97E')
      if (scan.shape.ratios) {
        html += _clinVal('Larg/Altura', scan.shape.ratios.width_to_length, scan.shape.ratios.width_to_length >= 0.65 && scan.shape.ratios.width_to_length <= 0.85 ? '#10B981' : '#F59E0B')
      }
      if (scan.measurements) {
        html += _clinVal('Prop. Aurea', Math.round(scan.measurements.golden_ratio_score) + '%', scan.measurements.golden_ratio_score >= 70 ? '#10B981' : '#F59E0B')
      }

      html += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'
      var sh = scan.shape.shape
      if (sh === 'redondo') {
        html += _clinRx('Rosto redondo', 'AH mandibula 2-3mL bilateral')
        html += _clinRx('', 'AH mento 1mL projecao')
        html += _clinRx('', 'Botox masseter 25U bilateral')
      } else if (sh === 'quadrado') {
        html += _clinRx('Rosto quadrado', 'Botox masseter 30U bilateral')
        html += _clinRx('', 'AH zigoma 1mL bilateral')
        html += _clinRx('', 'AH temporal 0.5mL bilateral')
      } else if (sh === 'oval') {
        html += _clinRx('Biotipo ideal', 'AH pontual conforme queixas especificas')
      } else if (sh === 'oblongo') {
        html += _clinRx('Rosto oblongo', 'AH zigoma 1.5mL bilateral')
        html += _clinRx('', 'AH mandibula 1mL bilateral')
      } else if (sh === 'coracao') {
        html += _clinRx('Rosto coracao', 'AH mandibula 2mL bilateral')
        html += _clinRx('', 'AH mento 1mL projecao')
      } else if (sh === 'diamante') {
        html += _clinRx('Rosto diamante', 'AH temporal 1mL bilateral')
        html += _clinRx('', 'AH mandibula 1.5mL bilateral')
      }
      html += '</div>'
    } else {
      html += '<div style="color:rgba(245,240,232,0.4);font-size:10px">Execute Auto Analise</div>'
    }

    html += '</div></div>'

    // ── SECTION 3: LINHA MANDIBULAR ──
    html += '<div>' +
      '<div style="background:rgba(200,169,126,0.15);padding:6px 12px">' +
        '<span style="font-size:9px;font-weight:700;letter-spacing:0.1em;color:#C8A97E">LINHA MANDIBULAR</span>' +
      '</div>' +
      '<div style="padding:10px 12px">'

    if (ma) {
      html += _clinVal('AMF', ma.amf + '\u00B0', ma.classification.color)
      html += _clinVal('Classificacao', ma.classification.label, ma.classification.color)
      html += _clinVal('Ratio M/Z', ma.rmz, ma.rmz >= 0.85 && ma.rmz <= 0.95 ? '#10B981' : '#F59E0B')
      html += _clinVal('Jawline E', ma.aij_left + '\u00B0', ma.jawline.color)
      html += _clinVal('Jawline D', ma.aij_right + '\u00B0', ma.jawline.color)
      html += _clinVal('Tensao', ma.jawline.label, ma.jawline.color)

      var aijDiff = Math.abs(ma.aij_left - ma.aij_right)
      if (aijDiff > 2) {
        var side = ma.aij_left > ma.aij_right ? 'E' : 'D'
        html += _clinVal('Assimetria', '\u0394' + Math.round(aijDiff * 10) / 10 + '\u00B0 (' + side + ')', aijDiff > 8 ? '#EF4444' : '#F59E0B')
      }

      html += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'
      if (ma.classification.level <= 2) {
        html += _clinRx('Contorno indefinido', 'AH mandibula 2-3mL bilateral')
        html += _clinRx('', 'AH mento 1-1.5mL projecao')
        if (ma.aij_avg > 30) html += _clinRx('', 'AH pre-jowl 0.5mL bilateral')
      } else if (ma.classification.level === 3) {
        html += _clinRx('Boa definicao', 'Refinar contorno e corrigir assimetrias')
        if (aijDiff > 4) html += _clinRx('', 'AH compensatorio lado ' + side + ' 0.5-1mL')
      } else {
        html += _clinRx('Angular marcada', 'Botox masseter 20-25U se suavizar')
      }
      if (ma.aij_avg > 30) {
        html += _clinRx('Jawline caida', 'AH temporal 1mL vetor lifting')
        html += _clinRx('', 'Fios PDO 4-6 unidades')
      }
      html += '</div>'
    } else {
      html += '<div style="color:rgba(245,240,232,0.4);font-size:10px">Execute Auto Angulos</div>'
    }

    // ── PROTOCOL SECTION ──
    if (FM._protocolData) {
      var proto = FM._protocolData
      html += '<div style="border-bottom:1px solid rgba(200,169,126,0.1)">' +
        '<div style="background:rgba(139,92,246,0.15);padding:6px 12px">' +
          '<span style="font-size:9px;font-weight:700;letter-spacing:0.1em;color:#8B5CF6">PROTOCOLO RECOMENDADO</span>' +
        '</div>' +
        '<div style="padding:10px 12px">'

      // Classification
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
        '<span style="color:rgba(245,240,232,0.6);font-size:10px">Classificacao</span>' +
        '<span style="color:#8B5CF6;font-weight:700;font-size:12px">' + proto.classification + ' — ' + proto.classification_name + '</span>' +
      '</div>'

      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
        '<span style="color:rgba(245,240,232,0.6);font-size:10px">Faixa Etaria</span>' +
        '<span style="color:#C8A97E;font-weight:600;font-size:11px">' + proto.age_bracket + '</span>' +
      '</div>'

      // Totals
      html += '<div style="display:flex;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'
      html += '<div style="flex:1;text-align:center;padding:6px;background:rgba(59,130,246,0.1);border-radius:6px">' +
        '<div style="font-size:16px;font-weight:800;color:#3B82F6">' + proto.totals.ah_ml + '</div>' +
        '<div style="font-size:8px;color:rgba(245,240,232,0.4)">mL AH</div>' +
      '</div>'
      html += '<div style="flex:1;text-align:center;padding:6px;background:rgba(139,92,246,0.1);border-radius:6px">' +
        '<div style="font-size:16px;font-weight:800;color:#8B5CF6">' + proto.totals.botox_units + '</div>' +
        '<div style="font-size:8px;color:rgba(245,240,232,0.4)">U Botox</div>' +
      '</div>'
      html += '<div style="flex:1;text-align:center;padding:6px;background:rgba(16,185,129,0.1);border-radius:6px">' +
        '<div style="font-size:16px;font-weight:800;color:#10B981">' + proto.totals.bio_sessions + '</div>' +
        '<div style="font-size:8px;color:rgba(245,240,232,0.4)">Bio sess.</div>' +
      '</div>'
      html += '</div>'

      // Protocol per zone
      if (proto.protocol && proto.protocol.length > 0) {
        html += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'
        proto.protocol.forEach(function (p) {
          var zColor = p.unit === 'U' ? '#8B5CF6' : '#3B82F6'
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:10px">' +
            '<span style="color:rgba(245,240,232,0.5)">' + p.zone + (p.bilateral ? ' (bil)' : '') + '</span>' +
            '<span style="color:' + zColor + ';font-weight:600">' + p.dose + p.unit + '</span>' +
          '</div>'
        })
        html += '</div>'
      }

      // Assessment
      if (proto.assessment) {
        html += '<div style="margin-top:6px;font-size:9px;color:rgba(245,240,232,0.4);line-height:1.4">' + proto.assessment + '</div>'
      }

      html += '</div></div>'
    } else {
      html += '<div style="padding:10px 12px;border-bottom:1px solid rgba(200,169,126,0.1)">' +
        '<button class="fm-btn" style="width:100%" onclick="FaceMapping._runProtocol()">' +
          FM._icon('clipboard', 14) + ' Gerar Protocolo</button>' +
      '</div>'
    }

    // Skin age summary (if available)
    if (age) {
      html += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'
      var ageColor = age.estimated_age <= 35 ? '#10B981' : age.estimated_age <= 45 ? '#F59E0B' : '#EF4444'
      html += _clinVal('Idade da Pele', Math.round(age.estimated_age) + ' anos', ageColor)
      html += '<div style="font-size:9px;color:rgba(245,240,232,0.4);margin-top:2px">' + (age.description || '') + '</div>'
      html += '</div>'
    }

    html += '</div></div></div>'
    return html
  }

  function _clinVal(label, value, color) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0">' +
      '<span style="color:rgba(245,240,232,0.6);font-size:10px">' + label + '</span>' +
      '<span style="color:' + (color || '#F5F0E8') + ';font-weight:600;font-size:11px">' + value + '</span>' +
    '</div>'
  }

  function _clinRx(title, rx) {
    var html = ''
    if (title) {
      html += '<div style="font-size:9px;color:rgba(245,240,232,0.5);margin-top:4px">' + title + '</div>'
    }
    html += '<div style="font-size:9px;color:#3B82F6;font-weight:600;padding:2px 0">Rx: ' + rx + '</div>'
    return html
  }

  FM._renderToolbar = function () {
    var html = '<div class="fm-toolbar">'

    // ANALYSIS MODE
    if (FM._editorMode === 'analysis') {
      if (!FM._analysisSubMode) FM._analysisSubMode = 'tercos'

      html += '<div class="fm-tool-section">' +
        '<div class="fm-tool-section-title">Tipo de Analise</div>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
          '<button class="fm-zone-btn' + (FM._analysisSubMode === 'tercos' ? ' active' : '') + '" ' +
            'onclick="FaceMapping._analysisSubMode=\'tercos\';FaceMapping._selectAngle(\'front\');FaceMapping._render();setTimeout(FaceMapping._initCanvas,50)" ' +
            'style="flex:1;justify-content:center;min-width:80px"' +
            (FM._photoUrls['front'] ? '' : ' disabled') + '>Tercos</button>' +
          '<button class="fm-zone-btn' + (FM._analysisSubMode === 'ricketts' ? ' active' : '') + '" ' +
            'onclick="FaceMapping._analysisSubMode=\'ricketts\';FaceMapping._selectAngle(\'lateral\');FaceMapping._render();setTimeout(FaceMapping._initCanvas,50)" ' +
            'style="flex:1;justify-content:center;min-width:80px"' +
            (FM._photoUrls['lateral'] ? '' : ' disabled') + '>Ricketts</button>' +
          '<button class="fm-zone-btn' + (FM._analysisSubMode === 'metrics' ? ' active' : '') + '" ' +
            'onclick="FaceMapping._analysisSubMode=\'metrics\';FaceMapping._render();setTimeout(FaceMapping._initCanvas,50)" ' +
            'style="flex:1;justify-content:center;min-width:80px;border-color:#10B981;color:' + (FM._analysisSubMode === 'metrics' ? '#fff' : '#10B981') + '"' +
            '>Metrificar</button>' +
        '</div>' +
      '</div>'

      if (FM._activeAngle === 'front') {
        var t = FM._tercoLines
        var totalH = t.chin - t.hairline
        var pSup = totalH > 0 ? Math.round((t.brow - t.hairline) / totalH * 100) : 33
        var pMed = totalH > 0 ? Math.round((t.noseBase - t.brow) / totalH * 100) : 33
        var pInf = totalH > 0 ? Math.round((t.chin - t.noseBase) / totalH * 100) : 33
        html += '<div class="fm-tool-section">' +
          '<div class="fm-tool-section-title">Proporcoes</div>' +
          '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Ideal: 33% cada terco</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
            FM._propBar('Superior', pSup) +
            FM._propBar('Medio', pMed) +
            FM._propBar('Inferior', pInf) +
          '</div>' +
        '</div>'
        html += '<div class="fm-tool-section">' +
          '<div style="font-size:11px;color:var(--text-muted)">Arraste as linhas horizontais na foto para posicionar nos pontos anatomicos.</div>' +
        '</div>'
      } else {
        html += '<div class="fm-tool-section">' +
          '<div class="fm-tool-section-title">Linha de Ricketts</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);line-height:1.6">' +
            'Linha da beleza do perfil.<br><br>' +
            'Conecta o ponto mais proeminente do <strong>nariz</strong> ao <strong>mento</strong>.<br><br>' +
            'Os labios devem tocar ou ficar ligeiramente atras desta linha para um perfil harmonioso.<br><br>' +
            '<strong>Arraste os pontos N e M</strong> para ajustar ao rosto da paciente.' +
          '</div>' +
        '</div>'
      }

      // ── Metrics toolbar ──
      if (FM._analysisSubMode === 'metrics') {
        html += '<div class="fm-tool-section">' +
          '<div class="fm-tool-section-title">Ferramenta</div>' +
          '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
            '<button class="fm-zone-btn' + (FM._metricTool === 'hline' ? ' active' : '') + '" onclick="FaceMapping._setMetricTool(\'hline\')" style="flex:1;justify-content:center;font-size:10px">— H</button>' +
            '<button class="fm-zone-btn' + (FM._metricTool === 'vline' ? ' active' : '') + '" onclick="FaceMapping._setMetricTool(\'vline\')" style="flex:1;justify-content:center;font-size:10px">| V</button>' +
            '<button class="fm-zone-btn' + (FM._metricTool === 'point' ? ' active' : '') + '" onclick="FaceMapping._setMetricTool(\'point\')" style="flex:1;justify-content:center;font-size:10px">' + FM._icon('crosshair', 12) + '</button>' +
          '</div>' +
          '<div style="font-size:10px;color:var(--text-muted);margin-top:4px">Clique na foto para adicionar</div>' +
        '</div>'

        // Auto-place buttons
        html += '<div class="fm-tool-section">' +
          '<button class="fm-btn" style="width:100%;margin-bottom:6px" onclick="FaceMapping._autoMetricLines()">' +
            FM._icon('cpu', 14) + ' Auto Metrificar</button>' +
          '<button class="fm-btn" style="width:100%;border-color:#C8A97E;color:#C8A97E" onclick="FaceMapping._autoAngles()">' +
            FM._icon('triangle', 14) + ' Auto Angulos Mandibulares</button>' +
        '</div>'

        // Current measurements summary
        var summary = FM._getMetricsSummary ? FM._getMetricsSummary() : null
        if (summary) {
          html += '<div class="fm-tool-section">' +
            '<div class="fm-tool-section-title">Medidas</div>'

          // H distances
          if (summary.horizontal_distances.length > 0) {
            html += '<div style="font-size:9px;color:#10B981;text-transform:uppercase;margin-bottom:4px">Horizontais</div>'
            summary.horizontal_distances.forEach(function (d) {
              html += '<div style="display:flex;justify-content:space-between;font-size:10px;padding:2px 0">' +
                '<span style="color:var(--text-secondary)">' + d.from + ' → ' + d.to + '</span>' +
                '<span style="color:#10B981;font-weight:600">' + d.pct + '% (' + d.px + 'px)</span>' +
              '</div>'
            })
          }

          // Asymmetry
          if (summary.asymmetry.length > 0) {
            html += '<div style="font-size:9px;color:#3B82F6;text-transform:uppercase;margin-top:6px;margin-bottom:4px">Assimetria (desvio da midline)</div>'
            summary.asymmetry.forEach(function (a) {
              var color = a.deviation_pct > 5 ? '#EF4444' : a.deviation_pct > 2 ? '#F59E0B' : '#10B981'
              html += '<div style="display:flex;justify-content:space-between;font-size:10px;padding:2px 0">' +
                '<span style="color:var(--text-secondary)">' + a.line + (a.label ? ' (' + a.label + ')' : '') + '</span>' +
                '<span style="color:' + color + ';font-weight:600">' + a.side + ' ' + a.deviation_pct + '% (' + a.deviation_px + 'px)</span>' +
              '</div>'
            })
          }

          // Point pairs — asymmetry measurement
          if (summary.point_distances.length > 0) {
            html += '<div style="font-size:9px;color:#F59E0B;text-transform:uppercase;margin-top:6px;margin-bottom:4px">Assimetria (pares de pontos)</div>'
            summary.point_distances.forEach(function (d) {
              var sevColor = d.severity === 'evidente' ? '#EF4444' : d.severity === 'moderada' ? '#F59E0B' : '#10B981'
              html += '<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04)">' +
                '<div style="display:flex;justify-content:space-between;font-size:10px">' +
                  '<span style="color:var(--text-secondary)">' + d.from + ' ↔ ' + d.to + '</span>' +
                  '<span style="color:#F59E0B;font-weight:600">' + d.distance_px + 'px</span>' +
                '</div>'
              if (d.vertical_diff_px > 2) {
                html += '<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:2px">' +
                  '<span style="color:var(--text-muted)">↕ Desnivel vertical</span>' +
                  '<span style="color:' + sevColor + ';font-weight:700">' + d.vertical_diff_px + 'px — ' + d.severity + '</span>' +
                '</div>' +
                '<div style="font-size:9px;color:var(--text-muted);margin-top:1px">Lado ' + d.higher_side + ' mais alto</div>'
              }
              if (d.horizontal_diff_px > 2) {
                html += '<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:2px">' +
                  '<span style="color:var(--text-muted)">↔ Diferenca lateral</span>' +
                  '<span style="color:var(--text-secondary)">' + d.horizontal_diff_px + 'px</span>' +
                '</div>'
              }
              html += '</div>'
            })
          }

          html += '</div>'
        }

        // Mandibular angles panel
        if (FM._metricAngles) {
          var ma = FM._metricAngles
          html += '<div class="fm-tool-section">' +
            '<div class="fm-tool-section-title">Angulos Mandibulares</div>'

          // AMF
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:var(--text-secondary)">AMF (Gonial-Mento-Gonial)</span>' +
            '<span style="font-size:14px;font-weight:700;color:' + ma.classification.color + '">' + ma.amf + '\u00B0</span>' +
          '</div>' +
          '<div style="font-size:10px;color:' + ma.classification.color + ';font-weight:600;padding:2px 0 6px">' + ma.classification.label + '</div>'

          // RMZ
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:var(--text-secondary)">Ratio Mand/Zigoma</span>' +
            '<span style="font-size:12px;font-weight:600;color:' + (ma.rmz >= 0.85 && ma.rmz <= 0.95 ? '#10B981' : '#F59E0B') + '">' + ma.rmz + '</span>' +
          '</div>' +
          '<div style="font-size:9px;color:var(--text-muted)">Ideal: 0.85-0.95</div>'

          // AIJ
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;margin-top:4px">' +
            '<span style="font-size:11px;color:var(--text-secondary)">Jawline E / D</span>' +
            '<span style="font-size:12px;font-weight:600;color:' + ma.jawline.color + '">' + ma.aij_left + '\u00B0 / ' + ma.aij_right + '\u00B0</span>' +
          '</div>' +
          '<div style="font-size:10px;color:' + ma.jawline.color + ';font-weight:500">' + ma.jawline.label + ' (media ' + ma.aij_avg + '\u00B0)</div>'

          // Asymmetry between left and right AIJ
          var aijDiff = Math.abs(ma.aij_left - ma.aij_right)
          if (aijDiff > 2) {
            var aijSide = ma.aij_left > ma.aij_right ? 'Esquerdo mais caido' : 'Direito mais caido'
            var aijColor = aijDiff > 8 ? '#EF4444' : aijDiff > 4 ? '#F59E0B' : '#10B981'
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;margin-top:2px">' +
              '<span style="font-size:10px;color:var(--text-muted)">Assimetria jawline</span>' +
              '<span style="font-size:10px;font-weight:600;color:' + aijColor + '">\u0394' + Math.round(aijDiff * 10) / 10 + '\u00B0</span>' +
            '</div>' +
            '<div style="font-size:9px;color:' + aijColor + '">' + aijSide + '</div>'
          }

          html += '</div>'
        }

        // Clear buttons
        html += '<div class="fm-tool-section">' +
          '<div style="display:flex;gap:4px">' +
            '<button class="fm-btn" style="flex:1;font-size:10px" onclick="FaceMapping._removeLastMetric(\'hline\')">- H</button>' +
            '<button class="fm-btn" style="flex:1;font-size:10px" onclick="FaceMapping._removeLastMetric(\'vline\')">- V</button>' +
            '<button class="fm-btn" style="flex:1;font-size:10px" onclick="FaceMapping._removeLastMetric(\'point\')">- Pt</button>' +
            '<button class="fm-btn" style="flex:1;font-size:10px;color:#EF4444" onclick="FaceMapping._clearMetricLines(\'all\')">Limpar</button>' +
          '</div>' +
        '</div>'
      }

      // ── Scanner Data Panel (shape, symmetry, golden ratio) — hide in metrics mode ──
      if (FM._scanData && FM._analysisSubMode !== 'metrics') {
        var sd = FM._scanData
        html += '<div class="fm-tool-section">' +
          '<div class="fm-tool-section-title">Scanner Facial</div>'

        // Face shape
        if (sd.shape) {
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:var(--text-secondary)">Biotipo</span>' +
            '<span style="font-size:12px;font-weight:600;color:#C8A97E;text-transform:capitalize">' + sd.shape.shape + '</span>' +
          '</div>'
        }

        // Symmetry
        if (sd.symmetry) {
          var symColor = sd.symmetry.overall >= 85 ? '#10B981' : sd.symmetry.overall >= 70 ? '#F59E0B' : '#EF4444'
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:var(--text-secondary)">Simetria</span>' +
            '<span style="font-size:12px;font-weight:600;color:' + symColor + '">' + sd.symmetry.overall + '%</span>' +
          '</div>'
        }

        // Golden ratio
        if (sd.measurements && sd.measurements.golden_ratio_score != null) {
          var grColor = sd.measurements.golden_ratio_score >= 70 ? '#10B981' : sd.measurements.golden_ratio_score >= 50 ? '#F59E0B' : '#EF4444'
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:var(--text-secondary)">Proporcao Aurea</span>' +
            '<span style="font-size:12px;font-weight:600;color:' + grColor + '">' + Math.round(sd.measurements.golden_ratio_score) + '%</span>' +
          '</div>'
        }

        // Pose
        if (sd.pose && sd.pose.estimated) {
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:var(--text-secondary)">Angulo</span>' +
            '<span style="font-size:12px;font-weight:500;color:var(--text-primary);text-transform:capitalize">' +
              (sd.pose.angle_description || '').replace('_', ' ') + '</span>' +
          '</div>'
        }

        html += '</div>'
      }

      // ── Skin Age + Collagen Panel — hide in metrics mode ──
      if ((FM._skinAge || FM._skinAnalysis) && FM._analysisSubMode !== 'metrics') {
        html += '<div class="fm-tool-section">' +
          '<div class="fm-tool-section-title">Analise da Pele</div>'

        // Skin age
        if (FM._skinAge) {
          var ageColor = FM._skinAge.estimated_age <= 35 ? '#10B981' : FM._skinAge.estimated_age <= 45 ? '#F59E0B' : '#EF4444'
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:var(--text-secondary)">Idade Biologica</span>' +
            '<span style="font-size:14px;font-weight:700;color:' + ageColor + '">' + Math.round(FM._skinAge.estimated_age) + ' anos</span>' +
          '</div>' +
          '<div style="font-size:10px;color:var(--text-muted);padding:2px 0 6px">' + (FM._skinAge.description || '') + '</div>'
        }

        // Skin scores
        if (FM._skinAnalysis) {
          var metrics = [
            { key: 'wrinkles', label: 'Rugas' },
            { key: 'spots', label: 'Manchas' },
            { key: 'pores', label: 'Poros' },
            { key: 'redness', label: 'Vermelhidao' },
            { key: 'firmness', label: 'Firmeza' },
          ]
          metrics.forEach(function (m) {
            var val = FM._skinAnalysis[m.key]
            if (val == null) return
            var color = val >= 70 ? '#10B981' : val >= 50 ? '#F59E0B' : '#EF4444'
            var barW = Math.round(Math.min(100, Math.max(0, val)))
            html += '<div style="padding:3px 0">' +
              '<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">' +
                '<span style="color:var(--text-secondary)">' + m.label + '</span>' +
                '<span style="color:' + color + ';font-weight:600">' + Math.round(val) + '</span>' +
              '</div>' +
              '<div style="height:4px;border-radius:2px;background:rgba(255,255,255,0.08)">' +
                '<div style="height:100%;width:' + barW + '%;border-radius:2px;background:' + color + '"></div>' +
              '</div>' +
            '</div>'
          })

          // Overall
          var overall = FM._skinAnalysis.overall
          if (overall != null) {
            var oColor = overall >= 70 ? '#10B981' : overall >= 50 ? '#F59E0B' : '#EF4444'
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0 2px;border-top:1px solid rgba(255,255,255,0.06);margin-top:6px">' +
              '<span style="font-size:11px;font-weight:600;color:var(--text-secondary)">Score Geral</span>' +
              '<span style="font-size:16px;font-weight:700;color:' + oColor + '">' + Math.round(overall) + '</span>' +
            '</div>'
          }
        }

        // Button to run skin analysis
        if (!FM._skinAnalysis) {
          html += '<button class="fm-btn" style="width:100%;margin-top:8px" onclick="FaceMapping._runSkinAnalysis()">' +
            FM._icon('activity', 14) + ' Analisar Pele</button>'
        }

        // Heatmap toggle buttons
        if (FM._heatmapImages && Object.keys(FM._heatmapImages).length > 0) {
          html += '<div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:8px">' +
            '<div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:6px">Heatmaps</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px">'

          var heatmapBtns = [
            { key: 'wrinkles', label: 'Rugas', color: '#EF4444' },
            { key: 'spots', label: 'Manchas', color: '#F59E0B' },
            { key: 'pores', label: 'Poros', color: '#3B82F6' },
            { key: 'redness', label: 'Verm.', color: '#DC2626' },
            { key: 'pigmentation', label: 'Pigm.', color: '#D97706' },
            { key: 'firmness', label: 'Firmeza', color: '#06B6D4' },
          ]
          heatmapBtns.forEach(function (b) {
            if (!FM._heatmapImages[b.key]) return
            var active = FM._activeHeatmap === b.key
            html += '<button style="padding:4px 8px;font-size:10px;border-radius:6px;border:1px solid ' +
              (active ? b.color : 'rgba(255,255,255,0.1)') + ';background:' +
              (active ? b.color + '22' : 'transparent') + ';color:' +
              (active ? b.color : 'var(--text-secondary)') + ';cursor:pointer;font-weight:' +
              (active ? '600' : '400') + '" onclick="FaceMapping._toggleHeatmap(\'' + b.key + '\')">' +
              b.label + '</button>'
          })
          html += '</div></div>'
        } else if (FM._skinAnalysis) {
          html += '<button class="fm-btn" style="width:100%;margin-top:8px" onclick="FaceMapping._loadHeatmaps()">' +
            FM._icon('layers', 14) + ' Gerar Heatmaps</button>'
        }

        html += '</div>'
      }

      // Button to trigger analysis if no data yet
      if (!FM._scanData && !FM._skinAge) {
        html += '<div class="fm-tool-section">' +
          '<button class="fm-btn" style="width:100%" onclick="FaceMapping._autoAnalyze()">' +
            FM._icon('cpu', 14) + ' Escanear Rosto</button>' +
          '<div style="font-size:10px;color:var(--text-muted);margin-top:6px">Detecta 478 pontos, biotipo, simetria, idade da pele</div>' +
        '</div>'
      }

      html += '</div>'
      return html
    }

    // Zone selector
    var allowedZones = FM._zonesForAngle(FM._activeAngle)
    var allowedIds = allowedZones.map(function (z) { return z.id })
    var selZone = FM._selectedZone ? FM.ZONES.find(function (z) { return z.id === FM._selectedZone }) : null
    var curUnit = selZone ? selZone.unit : 'mL'
    var curStep = curUnit === 'U' ? '1' : '0.1'

    // Preenchimento section
    var fillZones = FM.ZONES.filter(function (z) { return z.cat === 'fill' })
    html += '<div class="fm-tool-section" style="padding-bottom:10px">' +
      '<div class="fm-tool-section-title">Preenchimento <span style="font-weight:400;color:var(--text-muted);text-transform:none;letter-spacing:0">(mL)</span></div>' +
      '<div class="fm-zone-grid">'
    fillZones.forEach(function (z) {
      html += FM._renderZoneBtn(z, allowedIds)
    })
    html += '</div></div>'

    // Rugas / Toxina section
    var toxZones = FM.ZONES.filter(function (z) { return z.cat === 'tox' })
    html += '<div class="fm-tool-section" style="padding-bottom:10px">' +
      '<div class="fm-tool-section-title">Rugas / Toxina <span style="font-weight:400;color:var(--text-muted);text-transform:none;letter-spacing:0">(U)</span></div>' +
      '<div class="fm-zone-grid">'
    toxZones.forEach(function (z) {
      html += FM._renderZoneBtn(z, allowedIds)
    })
    html += '</div></div>'

    // Treatment selector
    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Tratamento</div>' +
      '<select class="fm-select" id="fmTreatment" onchange="FaceMapping._onTreatmentChange(this.value)">'

    FM.TREATMENTS.forEach(function (t) {
      html += '<option value="' + t.id + '"' + (FM._selectedTreatment === t.id ? ' selected' : '') + '>' + t.label + '</option>'
    })

    html += '</select></div>'

    // Quantity + Side + Product
    var rangeHint = selZone ? (selZone.min + ' — ' + selZone.max + ' ' + selZone.unit) : ''
    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Detalhes</div>' +
      '<div class="fm-input-row" style="margin-bottom:8px">' +
        '<label>' + curUnit + '</label>' +
        '<input class="fm-input" id="fmMl" type="number" step="' + curStep + '" min="0" max="999" value="' + FM._selectedMl + '" ' +
          'onchange="FaceMapping._selectedMl=this.value" style="width:70px"' +
          (rangeHint ? ' placeholder="' + rangeHint + '"' : '') + '>' +
        (rangeHint ? '<span style="font-size:10px;color:var(--text-muted)">' + rangeHint + '</span>' : '') +
      '</div>' +
      '<div class="fm-input-row" style="margin-bottom:8px">' +
        '<label>Lado</label>' +
        '<select class="fm-select" id="fmSide" onchange="FaceMapping._selectedSide=this.value" style="width:auto;flex:1">' +
          '<option value="bilateral"' + (FM._selectedSide === 'bilateral' ? ' selected' : '') + '>Bilateral</option>' +
          '<option value="esquerdo"' + (FM._selectedSide === 'esquerdo' ? ' selected' : '') + '>Esquerdo</option>' +
          '<option value="direito"' + (FM._selectedSide === 'direito' ? ' selected' : '') + '>Direito</option>' +
        '</select>' +
      '</div>' +
      '<input class="fm-input" id="fmProduct" placeholder="Produto (ex: Juvederm Voluma)" value="' + FM._esc(FM._selectedProduct) + '" ' +
        'onchange="FaceMapping._selectedProduct=this.value">' +
    '</div>'

    // Annotations list
    html += '<div class="fm-tool-section" style="flex:1">' +
      '<div class="fm-tool-section-title">Marcacoes (' + FM._annotations.length + ')</div>' +
      '<div class="fm-annotations-list">'

    var angleAnnotations = FM._annotations.filter(function (a) { return a.angle === FM._activeAngle })
    if (angleAnnotations.length === 0) {
      html += '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Selecione uma zona e desenhe na foto</div>'
    } else {
      angleAnnotations.forEach(function (ann) {
        var t = FM.TREATMENTS.find(function (x) { return x.id === ann.treatment }) || FM.TREATMENTS[0]
        var z = FM.ZONES.find(function (x) { return x.id === ann.zone })
        var zColor = z ? z.color : '#999'
        html += '<div class="fm-annotation-item">' +
          '<span class="fm-annotation-dot" style="background:' + zColor + '"></span>' +
          '<div class="fm-annotation-info">' +
            '<div class="fm-annotation-zone">' + (z ? z.label : ann.zone) + '</div>' +
            '<div class="fm-annotation-detail">' + t.label + ' \u2022 ' + ann.ml + (z ? z.unit : 'mL') + (ann.product ? ' \u2022 ' + ann.product : '') + '</div>' +
          '</div>' +
          '<button class="fm-annotation-remove" onclick="FaceMapping._removeAnnotation(' + ann.id + ')" title="Remover">&times;</button>' +
        '</div>'
      })
    }

    html += '</div></div>'

    // Total summary
    var totals = FM._calcTotals()
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

  FM._renderZoneBtn = function (z, allowedIds) {
    var allowed = allowedIds.indexOf(z.id) !== -1
    var iconSvg = FM.ZONE_ICONS[z.id] || ''
    var svgEl = iconSvg
      ? '<svg class="fm-zone-icon" viewBox="0 0 12 12" width="14" height="14" stroke="' + (allowed ? z.color : '#D1D5DB') + '">' + iconSvg + '</svg>'
      : '<span class="fm-zone-dot" style="background:' + (allowed ? z.color : '#D1D5DB') + '"></span>'

    return '<button class="fm-zone-btn' + (FM._selectedZone === z.id ? ' active' : '') +
      (!allowed ? ' disabled' : '') + '" ' +
      (allowed ? 'onclick="FaceMapping._selectZone(\'' + z.id + '\')" ' : '') +
      'title="' + z.desc + ' (' + z.min + '-' + z.max + z.unit + ')' + (allowed ? '' : ' — nao se aplica') + '" ' +
      'data-zone="' + z.id + '"' +
      (!allowed ? ' disabled' : '') + '>' +
      svgEl + z.label + '</button>'
  }

  FM._refreshToolbar = function () {
    var toolbar = document.querySelector('.fm-toolbar')
    if (!toolbar) return
    var temp = document.createElement('div')
    temp.innerHTML = FM._renderToolbar()
    toolbar.parentNode.replaceChild(temp.firstChild, toolbar)
    if (window.feather) window.feather.replace()
  }

})()
