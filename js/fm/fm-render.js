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

    if (!FM._lead) { FM._restorePage(); return }
    var name = FM._lead.nome || FM._lead.name || 'Paciente'

    // Determine which panel to show on the right — based on _activeTab ONLY
    var rightPanel
    var activeTab = FM._activeTab || 'zones'

    if (activeTab === 'simetria') {
      rightPanel = FM._renderSimetriaPanel()
    } else if (activeTab === 'analysis') {
      rightPanel = FM._renderAnalisePanel()
    } else if (activeTab === 'zones') {
      rightPanel = FM._renderZonesPanel()
    } else if (activeTab === 'vectors') {
      rightPanel = FM._renderVectorsPanel()
    } else if (activeTab === 'nasal') {
      rightPanel = (FM._renderNasalPanel ? FM._renderNasalPanel() : FM._renderZonesPanel())
    } else {
      rightPanel = FM._renderZonesPanel()
    }

    root.innerHTML = '<div class="fm-page">' +
      FM._renderHeader(name) +
      FM._renderProgressBar() +
      '<div class="fm-body">' +
        FM._renderPhotoStrip() +
        FM._renderCanvasArea() +
        rightPanel +
      '</div>' +
    '</div>'

    FM._bindEvents()
    if (window.feather) window.feather.replace()
  }

  FM._renderHeader = function (name) {
    var tabs = [
      { id: 'simetria',      label: 'Simetria',       icon: 'git-commit' },
      { id: 'zones',         label: 'Estruturação',   icon: 'layers' },
      { id: 'vectors',       label: 'Vetores',        icon: 'trending-up' },
      { id: 'nasal',         label: 'Nasal',          icon: 'triangle' },
      { id: 'analysis',      label: 'Analise',        icon: 'activity' },
    ]

    var activeTab = FM._activeTab || 'zones'

    var html = '<div class="fm-header" style="padding:8px 16px;border-bottom:1px solid rgba(200,169,126,0.12)">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<button onclick="FaceMapping._resetToSelector()" style="border:none;background:none;cursor:pointer;color:rgba(200,169,126,0.4);display:flex;align-items:center;padding:4px" title="Voltar">' + FM._icon('arrow-left', 16) + '</button>' +
        '<span style="font-family:Cormorant Garamond,serif;font-size:18px;font-weight:300;font-style:italic;color:#C8A97E">Analise Facial</span>' +
      '</div>' +

      // Tabs — all champagne, minimal
      '<div style="display:flex;gap:1px;background:rgba(200,169,126,0.06);border-radius:8px;padding:2px">'

    tabs.forEach(function (tab) {
      var isActive = activeTab === tab.id
      html += '<button onclick="FaceMapping._switchTab(\'' + tab.id + '\')" style="' +
        'padding:5px 14px;border-radius:6px;border:none;cursor:pointer;' +
        'font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:0.04em;' +
        'font-weight:' + (isActive ? '600' : '400') + ';' +
        'background:' + (isActive ? '#C8A97E' : 'transparent') + ';' +
        'color:' + (isActive ? '#fff' : 'rgba(200,169,126,0.5)') + ';' +
        '">' + tab.label + '</button>'
    })

    html += '</div>' +

      // 1x/2x toggle — minimal
      '<div style="display:flex;background:rgba(200,169,126,0.06);border-radius:6px;padding:2px;margin:0 6px">' +
        '<button onclick="FaceMapping._setViewMode(\'1x\')" style="padding:3px 10px;border-radius:4px;border:none;cursor:pointer;font-family:Montserrat,sans-serif;font-size:10px;font-weight:' + (FM._viewMode === '1x' ? '600' : '400') + ';background:' + (FM._viewMode === '1x' ? 'rgba(200,169,126,0.25)' : 'transparent') + ';color:' + (FM._viewMode === '1x' ? '#C8A97E' : 'rgba(200,169,126,0.35)') + '">1x</button>' +
        '<button onclick="FaceMapping._setViewMode(\'2x\')" style="padding:3px 10px;border-radius:4px;border:none;cursor:pointer;font-family:Montserrat,sans-serif;font-size:10px;font-weight:' + (FM._viewMode === '2x' ? '600' : '400') + ';background:' + (FM._viewMode === '2x' ? 'rgba(200,169,126,0.25)' : 'transparent') + ';color:' + (FM._viewMode === '2x' ? '#C8A97E' : 'rgba(200,169,126,0.35)') + '">2x</button>' +
      '</div>' +

      // Right actions — minimal, all champagne
      '<div style="display:flex;gap:3px;align-items:center">' +
        '<button class="fm-btn" onclick="FaceMapping._openCompare()" title="Comparar" style="font-size:9px;padding:4px 6px;border-color:rgba(200,169,126,0.15);color:rgba(200,169,126,0.5)">' + FM._icon('eye', 11) + '</button>' +
        '<button class="fm-btn" onclick="FaceMapping._exportReport()" title="Report" style="font-size:9px;padding:4px 6px;border-color:rgba(200,169,126,0.15);color:rgba(200,169,126,0.5)">' + FM._icon('download', 11) + '</button>' +
        '<button class="fm-btn" onclick="FaceMapping._saveToSupabase()" style="font-size:9px;padding:4px 8px;border-color:rgba(200,169,126,0.3);color:#C8A97E;font-weight:600">' + FM._icon('save', 11) + ' Salvar</button>' +
      '</div>' +
    '</div>'

    return html
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
          (v.hasPhoto ? (v.count > 0 ? v.count + ' marcacao' + (v.count > 1 ? 'es' : '') : 'Sem marcações') : 'Sem foto') +
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
      html += '<span style="font-size:11px;color:rgba(200,169,126,0.5);font-weight:500">' + FM._icon('user', 12) + ' ' + FM._esc(pname) + '</span>'
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

    // Separator + SIMULADO only (DEPOIS removed — visible in 2x canvas)
    html += '<div style="border-top:1px solid var(--border);margin:8px 0;padding-top:8px">' +
      '<div style="font-size:8px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(200,169,126,0.3);text-align:center;margin-bottom:6px">Report</div>'

    // Slot reservado (simulacao removida)
    if (FM._simPhotoUrl) {
      html += '<div class="fm-photo-thumb" style="border-color:#C9A96E">' +
        '<img src="' + FM._simPhotoUrl + '" alt="Simulado">' +
        '<span class="fm-photo-thumb-label" style="background:rgba(201,169,110,0.9)">SIMULADO</span>' +
        '<div class="fm-photo-actions"><button class="fm-photo-action-btn fm-photo-delete-btn" onclick="event.stopPropagation();FaceMapping._deleteExtraPhoto(\'sim\')" title="Excluir">' + FM._icon('trash-2', 11) + '</button></div>' +
      '</div>'
    }

    html += '</div>'

    html += '<input type="file" id="fmFileInput" accept="image/jpeg,image/png,image/webp" style="display:none">'
    html += '<input type="file" id="fmExtraFileInput" accept="image/jpeg,image/png,image/webp" style="display:none">'
    html += '</div>'
    return html
  }

  FM._renderCanvasArea = function () {
    // NASAL TAB — fully independent canvas area with own upload
    if (FM._activeTab === 'nasal' && FM._renderNasalCanvasArea) {
      return FM._renderNasalCanvasArea()
    }

    var hasAntes = FM._activeAngle && FM._photoUrls[FM._activeAngle]
    var hasDepois = FM._activeAngle && (FM._afterPhotoByAngle[FM._activeAngle] || FM._simPhotoByAngle[FM._activeAngle])

    if (!FM._activeAngle || (!hasAntes && !hasDepois)) {
      return '<div class="fm-canvas-area">' +
        '<div class="fm-empty-state">' +
          FM._icon('image', 48) +
          '<p>Faca o upload das fotos ANTES<br>para iniciar a analise</p>' +
        '</div>' +
      '</div>'
    }
    if (FM._viewMode === '2x') {
      return FM._renderCanvasArea2x()
    }
    return FM._renderCanvasArea1x()
  }

  FM._renderCanvasArea2x = function () {
    return '<div class="fm-canvas-area" id="fmCanvasArea" style="display:flex;flex-direction:row;gap:4px;flex:1;overflow:hidden">' +
      // LEFT: ANTES
      '<div style="flex:1;display:flex;flex-direction:column;background:#0A0A0A;border-radius:8px;overflow:hidden;position:relative">' +
        '<div style="padding:4px 12px;background:rgba(239,68,68,0.1);display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:#EF4444;letter-spacing:0.1em">ANTES</span>' +
          '<div style="display:flex;gap:3px">' +
            (FM._activeAngle !== 'lateral' ? '<button class="fm-btn" onclick="FaceMapping._autoAnalyze()" style="font-size:8px;padding:2px 6px">' + FM._icon('cpu', 10) + '</button>' : '') +
            '<button class="fm-btn" onclick="FaceMapping._deletePhoto(\'' + (FM._activeAngle || 'front') + '\')" style="font-size:8px;padding:2px 6px;border-color:#EF4444;color:#EF4444" title="Excluir ANTES">' + FM._icon('trash-2', 10) + '</button>' +
          '</div>' +
        '</div>' +
        '<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative">' +
          (FM._photoUrls[FM._activeAngle]
            ? '<canvas id="fmCanvas" style="cursor:crosshair"></canvas>' +
              (FM._activeTab === 'simetria' ? '<button onclick="FaceMapping._toggleMetricLock()" style="position:absolute;top:36px;left:6px;z-index:10;display:flex;align-items:center;padding:4px 6px;border-radius:5px;border:1px solid ' + (FM._metricLocked ? '#F59E0B' : 'rgba(255,255,255,0.15)') + ';background:' + (FM._metricLocked ? 'rgba(245,158,11,0.25)' : 'rgba(0,0,0,0.3)') + ';color:' + (FM._metricLocked ? '#F59E0B' : 'rgba(255,255,255,0.4)') + ';cursor:pointer;backdrop-filter:blur(4px)">' + FM._icon(FM._metricLocked ? 'lock' : 'unlock', 12) + '</button>' : '')
            : '<div style="color:rgba(245,240,232,0.2);font-size:12px;text-align:center;cursor:pointer" onclick="FaceMapping._triggerUpload(\'' + (FM._activeAngle || 'front') + '\')">' + FM._icon('camera', 24) + '<br>Upload ANTES</div>') +
        '</div>' +
      '</div>' +
      // RIGHT: DEPOIS
      '<div style="flex:1;display:flex;flex-direction:column;background:#0A0A0A;border-radius:8px;overflow:hidden;position:relative">' +
        '<div style="padding:4px 12px;background:rgba(16,185,129,0.1);display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:#10B981;letter-spacing:0.1em">DEPOIS</span>' +
          '<div style="display:flex;gap:3px">' +
            '<label style="font-size:8px;padding:2px 6px;border:1px solid rgba(16,185,129,0.3);border-radius:4px;color:#10B981;cursor:pointer">' +
              'Upload<input type="file" accept="image/*" onchange="FaceMapping._uploadAfterPhoto(this)" style="display:none">' +
            '</label>' +
            (FM._afterPhotoUrl ? '<button class="fm-btn" onclick="FaceMapping._deleteAfterPhoto()" style="font-size:8px;padding:2px 6px;border-color:#EF4444;color:#EF4444" title="Excluir DEPOIS">' + FM._icon('trash-2', 10) + '</button>' : '') +
          '</div>' +
        '</div>' +
        '<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative">' +
          (FM._afterPhotoUrl || FM._simPhotoUrl
            ? '<canvas id="fmCanvas2" style="cursor:crosshair"></canvas>' +
              (FM._activeTab === 'simetria' ? '<button onclick="FaceMapping._toggleMetric2Lock()" style="position:absolute;top:36px;left:6px;z-index:10;display:flex;align-items:center;padding:4px 6px;border-radius:5px;border:1px solid ' + (FM._metric2Locked ? '#F59E0B' : 'rgba(255,255,255,0.15)') + ';background:' + (FM._metric2Locked ? 'rgba(245,158,11,0.25)' : 'rgba(0,0,0,0.3)') + ';color:' + (FM._metric2Locked ? '#F59E0B' : 'rgba(255,255,255,0.4)') + ';cursor:pointer;backdrop-filter:blur(4px)">' + FM._icon(FM._metric2Locked ? 'lock' : 'unlock', 12) + '</button>' : '')
            : '<div style="color:rgba(245,240,232,0.2);font-size:12px;text-align:center">Upload foto DEPOIS<br>ou gere uma simulacao</div>') +
        '</div>' +
      '</div>' +
    '</div>'
  }

  FM._renderCanvasArea1x = function () {
    return '<div class="fm-canvas-area" id="fmCanvasArea" style="flex-direction:column;align-items:center;justify-content:center;position:relative">' +
      '<div class="fm-canvas-wrap drawing" id="fmCanvasWrap" style="position:relative">' +
        '<canvas id="fmCanvas"></canvas>' +
        (FM._activeTab === 'simetria' ? '<button onclick="FaceMapping._toggleMetricLock()" style="position:absolute;top:36px;left:6px;z-index:10;display:flex;align-items:center;gap:3px;padding:4px 8px;border-radius:6px;border:1px solid ' + (FM._metricLocked ? '#F59E0B' : 'rgba(255,255,255,0.2)') + ';background:' + (FM._metricLocked ? 'rgba(245,158,11,0.25)' : 'rgba(0,0,0,0.4)') + ';color:' + (FM._metricLocked ? '#F59E0B' : 'rgba(255,255,255,0.5)') + ';cursor:pointer;font-size:9px;font-weight:600;font-family:Montserrat,sans-serif;backdrop-filter:blur(4px)">' + FM._icon(FM._metricLocked ? 'lock' : 'unlock', 11) + '</button>' : '') +
      '</div>' +
      '<div class="fm-canvas-controls">' +
        '<button onclick="FaceMapping._toggle3DView()" title="Vista 3D" class="fm-canvas-ctrl-btn">' + FM._icon('box', 14) + '</button>' +
        '<button onclick="FaceMapping._toggleFullscreen()" title="Tela cheia" class="fm-canvas-ctrl-btn">' + FM._icon('maximize-2', 14) + '</button>' +
      '</div>' +
    '</div>'
  }

  // ── SIMETRIA PANEL (wireframe, linhas, angulos, 3 planos) ──

  FM._renderSimetriaPanel = function () {
    var html = '<div class="fm-toolbar">'

    // Sub-modes: Metrificar + Ricketts (only if lateral photo exists)
    var hasLateral = !!FM._photoUrls['lateral']
    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Modo</div>' +
      '<div style="display:flex;gap:3px">' +
        '<button class="fm-zone-btn' + (FM._analysisSubMode === 'metrics' ? ' active' : '') + '" onclick="FaceMapping._analysisSubMode=\'metrics\';FaceMapping._render();setTimeout(FaceMapping._initCanvas,50)" style="flex:1;justify-content:center">Metrificar</button>' +
        (hasLateral ? '<button class="fm-zone-btn' + (FM._analysisSubMode === 'ricketts' ? ' active' : '') + '" onclick="FaceMapping._analysisSubMode=\'ricketts\';FaceMapping._selectAngle(\'lateral\');FaceMapping._render();setTimeout(FaceMapping._initCanvas,50);if(FaceMapping._viewMode===\'2x\')setTimeout(FaceMapping._initCanvas2,100)" style="flex:1;justify-content:center">Ricketts</button>' : '') +
      '</div>' +
    '</div>'

    // Scanner toggle (ON/OFF) — only runs on frontal
    var scanOn = FM._scanEnabled
    var hasScan = FM._scanData && FM._scanData.landmarks
    html += '<div class="fm-tool-section">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          FM._icon('cpu', 12) +
          '<span class="fm-tool-section-title" style="margin:0;font-size:10px">Scanner 478pts</span>' +
        '</div>' +
        '<div onclick="FaceMapping._toggleScan()" ' +
          'style="width:32px;height:16px;border-radius:8px;cursor:pointer;position:relative;' +
          'background:' + (scanOn ? '#10B981' : 'rgba(200,169,126,0.15)') + ';transition:background .2s">' +
          '<div style="width:12px;height:12px;border-radius:50%;background:#fff;position:absolute;top:2px;' +
            'left:' + (scanOn ? '18px' : '2px') + ';transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>' +
        '</div>' +
      '</div>' +
      (hasScan ? '<div style="font-size:8px;color:rgba(16,185,129,0.5);margin-top:3px">' + FM._scanData.landmark_count + ' pontos detectados</div>' : '') +
      (!scanOn ? '<div style="font-size:8px;color:rgba(200,169,126,0.3);margin-top:3px">Desativado</div>' : '') +
      (scanOn && !hasScan ? '<div style="font-size:8px;color:rgba(245,158,11,0.5);margin-top:3px">Aguardando scan...</div>' : '') +
    '</div>'

    // (Tercos removed — redundant with manual H lines)
    if (false) {
      var tl = FM._tercoLines || { hairline: 0.05, brow: 0.33, noseBase: 0.62, chin: 0.95 }
      var totalH = tl.chin - tl.hairline
      var pSup = totalH > 0 ? Math.round((tl.brow - tl.hairline) / totalH * 100) : 33
      var pMed = totalH > 0 ? Math.round((tl.noseBase - tl.brow) / totalH * 100) : 33
      var pInf = totalH > 0 ? Math.round((tl.chin - tl.noseBase) / totalH * 100) : 33

      function _tercColor(pct) { return (pct >= 28 && pct <= 38) ? '#10B981' : (pct >= 24 && pct <= 42 ? '#F59E0B' : '#EF4444') }

      html += '<div class="fm-tool-section" style="padding:10px 12px">' +
        '<div class="fm-tool-section-title">Proporcoes Faciais</div>' +
        '<div style="font-size:9px;color:rgba(200,169,126,0.3);margin-bottom:8px">Ideal: 33% cada terco</div>' +
        // Superior
        '<div style="margin-bottom:6px">' +
          '<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">' +
            '<span style="color:rgba(245,240,232,0.5)">Superior (Trichion → Glabela)</span>' +
            '<span style="color:' + _tercColor(pSup) + ';font-weight:700">' + pSup + '%</span>' +
          '</div>' +
          '<div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.06)">' +
            '<div style="height:100%;width:' + Math.min(pSup, 100) + '%;border-radius:3px;background:' + _tercColor(pSup) + '"></div>' +
          '</div>' +
        '</div>' +
        // Medio
        '<div style="margin-bottom:6px">' +
          '<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">' +
            '<span style="color:rgba(245,240,232,0.5)">Medio (Glabela → Subnasal)</span>' +
            '<span style="color:' + _tercColor(pMed) + ';font-weight:700">' + pMed + '%</span>' +
          '</div>' +
          '<div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.06)">' +
            '<div style="height:100%;width:' + Math.min(pMed, 100) + '%;border-radius:3px;background:' + _tercColor(pMed) + '"></div>' +
          '</div>' +
        '</div>' +
        // Inferior
        '<div style="margin-bottom:6px">' +
          '<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">' +
            '<span style="color:rgba(245,240,232,0.5)">Inferior (Subnasal → Mento)</span>' +
            '<span style="color:' + _tercColor(pInf) + ';font-weight:700">' + pInf + '%</span>' +
          '</div>' +
          '<div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.06)">' +
            '<div style="height:100%;width:' + Math.min(pInf, 100) + '%;border-radius:3px;background:' + _tercColor(pInf) + '"></div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:9px;color:rgba(200,169,126,0.25);margin-top:4px">Arraste as linhas na foto para ajustar</div>'

      // Scanner button if not yet run (not available for lateral)
      if (!FM._scanData && FM._activeAngle !== 'lateral') {
        html += '<button class="fm-btn" style="width:100%;margin-top:8px" onclick="FaceMapping._autoAnalyze()">' + FM._icon('cpu', 12) + ' Auto-posicionar (Scanner)</button>'
      }

      html += '</div>'
    }

    // Ricketts info removed — was overflowing into canvas

    // Metrificar tools (only in metrics sub-mode)
    if (FM._analysisSubMode === 'metrics') {

    // Wireframe toggle
    html += '<div class="fm-tool-section">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:9px;color:#C8A97E;text-transform:uppercase;letter-spacing:0.1em;font-weight:700">Wireframe 478pts</span>' +
        '<button class="fm-btn" onclick="FaceMapping._toggleWireframe()" style="font-size:9px;padding:3px 8px;border-color:' + (FM._showWireframe ? '#C8A97E' : 'rgba(200,169,126,0.2)') + ';color:' + (FM._showWireframe ? '#C8A97E' : 'rgba(200,169,126,0.4)') + '">' + (FM._showWireframe ? 'ON' : 'OFF') + '</button>' +
      '</div>' +
    '</div>'

    // Metric tools
    html += '<div class="fm-tool-section" style="padding:10px 12px">' +
      '<div style="font-size:9px;color:#C8A97E;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:6px">Ferramentas</div>' +
      '<div style="display:flex;gap:3px;flex-wrap:wrap">' +
        '<button class="fm-zone-btn' + (FM._metricTool === 'hline' ? ' active' : '') + '" onclick="FaceMapping._setMetricTool(\'hline\')" style="flex:1;justify-content:center;font-size:9px;min-width:30px">-- H</button>' +
        '<button class="fm-zone-btn' + (FM._metricTool === 'vline' ? ' active' : '') + '" onclick="FaceMapping._setMetricTool(\'vline\')" style="flex:1;justify-content:center;font-size:9px;min-width:30px">| V</button>' +
        '<button class="fm-zone-btn' + (FM._metricTool === 'point' ? ' active' : '') + '" onclick="FaceMapping._setMetricTool(\'point\')" style="flex:1;justify-content:center;font-size:9px;min-width:30px">Pt</button>' +
      '</div>' +
      '<div style="display:flex;gap:3px;margin-top:4px">' +
        '<button class="fm-btn" onclick="FaceMapping._autoAsymmetryPairs()" style="flex:1;font-size:8px;padding:3px;border-color:rgba(200,169,126,0.2);color:rgba(200,169,126,0.6)">Pares</button>' +
        '<button class="fm-btn" onclick="FaceMapping._autoAngles()" style="flex:1;font-size:8px;padding:3px;border-color:rgba(200,169,126,0.2);color:rgba(200,169,126,0.6)">Angulos</button>' +
        '<button class="fm-btn" onclick="FaceMapping._clearMetricLines(\'all\')" style="font-size:8px;padding:3px 6px;color:rgba(200,169,126,0.3)">X</button>' +
      '</div>' +
    '</div>'

    // List of H lines with individual delete
    if (FM._metricLines.h.length > 0) {
      html += '<div class="fm-tool-section" style="padding:8px 12px">' +
        '<div style="font-size:9px;color:#10B981;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:4px">Linhas H (' + FM._metricLines.h.length + ')</div>'
      FM._metricLines.h.forEach(function (line, i) {
        var label = line.label || ('H' + (i + 1))
        var pct = Math.round(line.y * 100)
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0">' +
          '<span style="font-size:10px;color:rgba(245,240,232,0.5)">' + label + ' — ' + pct + '%</span>' +
          (FM._metricLocked
            ? '<button onclick="FaceMapping._toggleMetricLock()" style="width:18px;height:18px;border:none;background:rgba(245,158,11,0.1);border-radius:4px;color:rgba(245,158,11,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center">' + FM._icon('lock', 10) + '</button>'
            : '<button onclick="FaceMapping._deleteMetricLine(\'h\',' + i + ')" style="width:18px;height:18px;border:none;background:rgba(239,68,68,0.15);border-radius:4px;color:#EF4444;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center">&times;</button>') +
        '</div>'
      })
      html += '</div>'
    }

    // List of V lines with individual delete
    if (FM._metricLines.v.length > 0) {
      html += '<div class="fm-tool-section" style="padding:8px 12px">' +
        '<div style="font-size:9px;color:#3B82F6;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:4px">Linhas V (' + FM._metricLines.v.length + ')</div>'
      FM._metricLines.v.forEach(function (line, i) {
        var label = line.label || ('V' + (i + 1))
        var pct = Math.round(line.x * 100)
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0">' +
          '<span style="font-size:10px;color:rgba(245,240,232,0.5)">' + label + ' — ' + pct + '%</span>' +
          (FM._metricLocked
            ? '<span style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:9px;color:rgba(245,158,11,0.4)">' + FM._icon('lock', 10) + '</span>'
            : '<button onclick="FaceMapping._deleteMetricLine(\'v\',' + i + ')" style="width:18px;height:18px;border:none;background:rgba(239,68,68,0.15);border-radius:4px;color:#EF4444;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center">&times;</button>') +
        '</div>'
      })
      html += '</div>'
    }

    // List of points with individual delete
    if (FM._metricPoints.length > 0) {
      html += '<div class="fm-tool-section" style="padding:8px 12px">' +
        '<div style="font-size:9px;color:#F59E0B;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:4px">Pontos (' + FM._metricPoints.length + ')</div>'
      FM._metricPoints.forEach(function (pt, i) {
        var label = pt.label || ('P' + (i + 1))
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0">' +
          '<span style="font-size:10px;color:rgba(245,240,232,0.5)">' + label + '</span>' +
          (FM._metricLocked
            ? '<button onclick="FaceMapping._toggleMetricLock()" style="width:18px;height:18px;border:none;background:rgba(245,158,11,0.1);border-radius:4px;color:rgba(245,158,11,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center">' + FM._icon('lock', 10) + '</button>'
            : '<button onclick="FaceMapping._deleteMetricPoint(' + i + ')" style="width:18px;height:18px;border:none;background:rgba(239,68,68,0.15);border-radius:4px;color:#EF4444;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center">&times;</button>') +
        '</div>'
      })
      html += '</div>'
    }

    // ── Canvas2 (DEPOIS) lines — only in 2x mode ──
    if (FM._viewMode === '2x') {
      var has2 = FM._metric2Lines.h.length > 0 || FM._metric2Lines.v.length > 0 || FM._metric2Points.length > 0
      if (has2) {
        html += '<div class="fm-tool-section" style="padding:8px 12px;border-top:2px solid rgba(16,185,129,0.3)">' +
          '<div style="font-size:9px;color:#10B981;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:6px">DEPOIS</div>'

        if (FM._metric2Lines.h.length > 0) {
          html += '<div style="font-size:8px;color:#10B981;margin-bottom:3px">H (' + FM._metric2Lines.h.length + ')</div>'
          FM._metric2Lines.h.forEach(function (line, i) {
            var label = line.label || ('H' + (i + 1))
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:1px 0">' +
              '<span style="font-size:9px;color:rgba(245,240,232,0.4)">' + label + ' — ' + Math.round(line.y * 100) + '%</span>' +
              '<button onclick="FaceMapping._deleteMetric2Line(\'h\',' + i + ')" style="width:16px;height:16px;border:none;background:rgba(239,68,68,0.15);border-radius:3px;color:#EF4444;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center">&times;</button>' +
            '</div>'
          })
        }
        if (FM._metric2Lines.v.length > 0) {
          html += '<div style="font-size:8px;color:#3B82F6;margin-top:4px;margin-bottom:3px">V (' + FM._metric2Lines.v.length + ')</div>'
          FM._metric2Lines.v.forEach(function (line, i) {
            var label = line.label || ('V' + (i + 1))
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:1px 0">' +
              '<span style="font-size:9px;color:rgba(245,240,232,0.4)">' + label + ' — ' + Math.round(line.x * 100) + '%</span>' +
              '<button onclick="FaceMapping._deleteMetric2Line(\'v\',' + i + ')" style="width:16px;height:16px;border:none;background:rgba(239,68,68,0.15);border-radius:3px;color:#EF4444;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center">&times;</button>' +
            '</div>'
          })
        }
        if (FM._metric2Points.length > 0) {
          html += '<div style="font-size:8px;color:#F59E0B;margin-top:4px;margin-bottom:3px">Pt (' + FM._metric2Points.length + ')</div>'
          FM._metric2Points.forEach(function (pt, i) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:1px 0">' +
              '<span style="font-size:9px;color:rgba(245,240,232,0.4)">' + (pt.label || 'P' + (i+1)) + '</span>' +
              '<button onclick="FaceMapping._deleteMetric2Point(' + i + ')" style="width:16px;height:16px;border:none;background:rgba(239,68,68,0.15);border-radius:3px;color:#EF4444;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center">&times;</button>' +
            '</div>'
          })
        }
        html += '</div>'
      }
    }

    } // end of if metrics sub-mode

    // Asymmetry score (shared)
    if (FM._asymmetryScore) {
      var as = FM._asymmetryScore
      html += '<div class="fm-tool-section" style="padding:10px 12px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
          '<span style="font-size:24px;font-weight:800;color:' + as.classification.color + '">' + as.score + '</span>' +
          '<div>' +
            '<div style="font-size:10px;font-weight:600;color:' + as.classification.color + '">' + as.classification.label + '</div>' +
            '<div style="font-size:8px;color:rgba(245,240,232,0.3)">' + as.pair_count + ' pares</div>' +
          '</div>' +
        '</div>'
      as.details.forEach(function (d) {
        html += '<div style="display:flex;justify-content:space-between;font-size:9px;padding:2px 0">' +
          '<span style="color:rgba(245,240,232,0.4)">' + d.pair + '</span>' +
          '<span style="color:' + d.color + ';font-weight:600">' + d.severity + ' ' + d.higher + '</span>' +
        '</div>'
      })
      html += '</div>'
    }

    // Mandibular angles
    if (FM._metricAngles) {
      var ma = FM._metricAngles
      html += '<div class="fm-tool-section" style="padding:10px 12px">' +
        '<div style="font-size:9px;color:#C8A97E;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:6px">Mandibula</div>' +
        _clinVal('AMF', ma.amf + '\u00B0', ma.classification.color) +
        _clinVal('Tipo', ma.classification.label, ma.classification.color) +
        _clinVal('Ratio M/Z', ma.rmz, ma.rmz >= 0.85 && ma.rmz <= 0.95 ? '#10B981' : '#F59E0B') +
        _clinVal('Jawline E/D', ma.aij_left + '\u00B0/' + ma.aij_right + '\u00B0', ma.jawline.color) +
      '</div>'
    }

    // Scanner data (shape, symmetry, golden)
    if (FM._scanData) {
      var sd = FM._scanData
      html += '<div class="fm-tool-section" style="padding:10px 12px">' +
        '<div style="font-size:9px;color:#C8A97E;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:6px">Scanner</div>'
      if (sd.shape) html += _clinVal('Biotipo', sd.shape.shape, '#C8A97E')
      if (sd.symmetry) html += _clinVal('Simetria', sd.symmetry.overall + '%', sd.symmetry.overall >= 85 ? '#10B981' : '#F59E0B')
      if (sd.measurements) html += _clinVal('Prop. Aurea', Math.round(sd.measurements.golden_ratio_score) + '%', sd.measurements.golden_ratio_score >= 70 ? '#10B981' : '#F59E0B')
      html += '</div>'
    }

    html += '</div>'
    return html
  }

  // ── ANALISE PANEL (skin, collagen, age, protocol) ──

  FM._renderAnalisePanel = function () {
    var html = '<div class="fm-toolbar">'

    // Skin analysis
    if (FM._skinAnalysis) {
      var metrics = [
        { key: 'wrinkles', label: 'Rugas' },
        { key: 'spots', label: 'Manchas' },
        { key: 'pores', label: 'Poros' },
        { key: 'redness', label: 'Vermelhidao' },
        { key: 'pigmentation', label: 'Pigmentacao' },
        { key: 'firmness', label: 'Firmeza' },
      ]
      html += '<div class="fm-tool-section" style="padding:10px 12px">' +
        '<div style="font-size:9px;color:#C8A97E;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:6px">Pele</div>'
      metrics.forEach(function (m) {
        var val = FM._skinAnalysis[m.key]
        if (val == null) return
        var color = val >= 70 ? '#10B981' : val >= 50 ? '#F59E0B' : '#EF4444'
        html += '<div style="padding:2px 0">' +
          '<div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:1px">' +
            '<span style="color:rgba(245,240,232,0.5)">' + m.label + '</span>' +
            '<span style="color:' + color + ';font-weight:600">' + Math.round(val) + '</span>' +
          '</div>' +
          '<div style="height:3px;border-radius:2px;background:rgba(255,255,255,0.06)">' +
            '<div style="height:100%;width:' + Math.round(val) + '%;border-radius:2px;background:' + color + '"></div>' +
          '</div>' +
        '</div>'
      })
      var ov = FM._skinAnalysis.overall
      if (ov != null) {
        html += '<div style="display:flex;justify-content:space-between;padding:6px 0 2px;border-top:1px solid rgba(255,255,255,0.05);margin-top:4px">' +
          '<span style="font-size:10px;font-weight:600;color:rgba(245,240,232,0.5)">Score Geral</span>' +
          '<span style="font-size:14px;font-weight:700;color:' + (ov >= 70 ? '#10B981' : '#F59E0B') + '">' + Math.round(ov) + '</span>' +
        '</div>'
      }
      html += '</div>'
    }

    // Skin age
    if (FM._skinAge) {
      var ageColor = FM._skinAge.estimated_age <= 35 ? '#10B981' : FM._skinAge.estimated_age <= 45 ? '#F59E0B' : '#EF4444'
      html += '<div class="fm-tool-section" style="padding:10px 12px">' +
        _clinVal('Idade da Pele', Math.round(FM._skinAge.estimated_age) + ' anos', ageColor) +
        '<div style="font-size:8px;color:rgba(245,240,232,0.3)">' + (FM._skinAge.description || '') + '</div>' +
      '</div>'
    }

    // Heatmaps
    if (FM._heatmapImages && Object.keys(FM._heatmapImages).length > 0) {
      html += '<div class="fm-tool-section" style="padding:10px 12px">' +
        '<div style="font-size:9px;color:#C8A97E;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:6px">Heatmaps</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:3px">'
      var hBtns = [
        { key: 'wrinkles', label: 'Rugas' },
        { key: 'spots', label: 'Manchas' },
        { key: 'pores', label: 'Poros' },
        { key: 'redness', label: 'Verm.' },
        { key: 'firmness', label: 'Firmeza' },
      ]
      hBtns.forEach(function (b) {
        if (!FM._heatmapImages[b.key]) return
        var active = FM._activeHeatmap === b.key
        html += '<button style="padding:3px 6px;font-size:8px;border-radius:4px;border:1px solid ' +
          (active ? '#C8A97E' : 'rgba(200,169,126,0.15)') + ';background:' +
          (active ? 'rgba(200,169,126,0.15)' : 'transparent') + ';color:' +
          (active ? '#C8A97E' : 'rgba(200,169,126,0.4)') + ';cursor:pointer" onclick="FaceMapping._toggleHeatmap(\'' + b.key + '\')">' +
          b.label + '</button>'
      })
      html += '</div></div>'
    } else if (FM._skinAnalysis) {
      html += '<div class="fm-tool-section" style="padding:10px 12px">' +
        '<button class="fm-btn" style="width:100%;font-size:9px" onclick="FaceMapping._loadHeatmaps()">Gerar Heatmaps</button>' +
      '</div>'
    }

    // Protocol
    if (FM._protocolData) {
      var proto = FM._protocolData
      html += '<div class="fm-tool-section" style="padding:10px 12px">' +
        '<div style="font-size:9px;color:#C8A97E;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:6px">Protocolo</div>' +
        _clinVal('Classe', proto.classification + ' — ' + proto.classification_name, '#C8A97E') +
        _clinVal('Idade', proto.age_bracket, '#C8A97E') +
        '<div style="display:flex;gap:6px;margin-top:6px">' +
          '<div style="flex:1;text-align:center;padding:4px;background:rgba(200,169,126,0.08);border-radius:4px">' +
            '<div style="font-size:14px;font-weight:700;color:#C8A97E">' + proto.totals.ah_ml + '</div>' +
            '<div style="font-size:7px;color:rgba(245,240,232,0.3)">mL AH</div>' +
          '</div>' +
          '<div style="flex:1;text-align:center;padding:4px;background:rgba(200,169,126,0.08);border-radius:4px">' +
            '<div style="font-size:14px;font-weight:700;color:#C8A97E">' + proto.totals.botox_units + '</div>' +
            '<div style="font-size:7px;color:rgba(245,240,232,0.3)">U Botox</div>' +
          '</div>' +
          '<div style="flex:1;text-align:center;padding:4px;background:rgba(200,169,126,0.08);border-radius:4px">' +
            '<div style="font-size:14px;font-weight:700;color:#C8A97E">' + proto.totals.bio_sessions + '</div>' +
            '<div style="font-size:7px;color:rgba(245,240,232,0.3)">Bio</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    } else {
      html += '<div class="fm-tool-section" style="padding:10px 12px">' +
        '<button class="fm-btn" style="width:100%;font-size:9px" onclick="FaceMapping._runProtocol()">Gerar Protocolo</button>' +
      '</div>'
    }

    // Scan + analyze buttons
    if (!FM._skinAnalysis) {
      html += '<div class="fm-tool-section" style="padding:10px 12px">' +
        (FM._activeAngle !== 'lateral' ? '<button class="fm-btn" style="width:100%;font-size:9px;margin-bottom:4px" onclick="FaceMapping._autoAnalyze()">Scanner 478pts</button>' : '') +
        '<button class="fm-btn" style="width:100%;font-size:9px" onclick="FaceMapping._runSkinAnalysis()">Analisar Pele</button>' +
      '</div>'
    }

    html += '</div>'
    return html
  }

  // ── CLINICAL PANEL (legacy — used by analysis tab) ──

  FM._renderClinicalPanel = function () {
    return FM._renderAnalisePanel()
  }

  // (antigo clinical panel removido — substituido por _renderSimetriaPanel e _renderAnalisePanel)

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

  // ── ZONES PANEL (dedicated for Estruturação tab) ──
  FM._renderZonesPanel = function () {
    var html = '<div class="fm-toolbar">'

    // ── Guide lines tools ──
    var gLocked = FM._guideLocked
    var gTool = FM._guideTool
    html += '<div class="fm-tool-section" style="padding:8px 12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<span style="font-size:8px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(200,169,126,0.4);font-weight:600">Linhas Guia</span>' +
        '<button class="fm-btn" onclick="FaceMapping._toggleGuideLock()" style="font-size:8px;padding:2px 5px;border-color:' + (gLocked ? '#F59E0B' : 'rgba(200,169,126,0.15)') + ';color:' + (gLocked ? '#F59E0B' : 'rgba(200,169,126,0.4)') + '">' + FM._icon(gLocked ? 'lock' : 'unlock', 10) + '</button>' +
      '</div>' +
      '<div style="display:flex;gap:4px">' +
        '<button class="fm-zone-btn' + (gTool === 'hguide' ? ' active' : '') + '" onclick="FaceMapping._setGuideTool(\'hguide\')" style="flex:1;justify-content:center;font-size:8px;padding:3px">-- H</button>' +
        '<button class="fm-zone-btn' + (gTool === 'vguide' ? ' active' : '') + '" onclick="FaceMapping._setGuideTool(\'vguide\')" style="flex:1;justify-content:center;font-size:8px;padding:3px">| V</button>' +
        '<button class="fm-btn" onclick="FaceMapping._clearGuides()" style="font-size:7px;padding:2px 5px;border-color:rgba(200,169,126,0.1);color:rgba(200,169,126,0.3)">Limpar</button>' +
      '</div>' +
      '<div style="font-size:7px;color:rgba(200,169,126,0.2);margin-top:4px">' + (FM._guideLines.h.length + FM._guideLines.v.length) + ' guias | ' + (gLocked ? 'Travadas' : 'Livres') + '</div>' +
    '</div>'

    // ── Zone selection buttons — grouped by category ──
    var fillZones = FM.ZONES.filter(function (z) { return z.cat === 'fill' })
    var toxZones = FM.ZONES.filter(function (z) { return z.cat === 'tox' })

    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Preenchimento</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:3px">'
    fillZones.forEach(function (z) {
      var isActive = FM._selectedZone === z.id
      var hasPreset = !!FM.ZONE_PRESETS[z.id]
      html += '<div style="display:inline-flex;gap:1px">' +
        '<button class="fm-zone-btn' + (isActive ? ' active' : '') + '" ' +
          'onclick="FaceMapping._selectZone(\'' + z.id + '\')" ' +
          'style="font-size:8px;padding:3px 6px;border-color:' + z.color + '40;color:' + (isActive ? '#fff' : z.color) + ';' +
          (isActive ? 'background:' + z.color + '90;' : '') + 'border-radius:4px 0 0 4px">' +
          '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:' + z.color + ';margin-right:3px"></span>' +
          z.label + '</button>' +
        (hasPreset ? '<button class="fm-zone-btn" onclick="FaceMapping._placePreset(\'' + z.id + '\')" ' +
          'style="font-size:7px;padding:3px 4px;border-color:' + z.color + '40;color:' + z.color + ';border-radius:0 4px 4px 0;border-left:0" title="Colocar forma pronta">' +
          FM._icon('copy', 9) + '</button>' : '') +
      '</div>'
    })
    html += '</div></div>'

    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Toxina</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:3px">'
    toxZones.forEach(function (z) {
      var isActive = FM._selectedZone === z.id
      var hasPreset = !!FM.ZONE_PRESETS[z.id]
      html += '<div style="display:inline-flex;gap:1px">' +
        '<button class="fm-zone-btn' + (isActive ? ' active' : '') + '" ' +
          'onclick="FaceMapping._selectZone(\'' + z.id + '\')" ' +
          'style="font-size:8px;padding:3px 6px;border-color:' + z.color + '40;color:' + (isActive ? '#fff' : z.color) + ';' +
          (isActive ? 'background:' + z.color + '90;' : '') + 'border-radius:4px 0 0 4px">' +
          '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:' + z.color + ';margin-right:3px"></span>' +
          z.label + '</button>' +
        (hasPreset ? '<button class="fm-zone-btn" onclick="FaceMapping._placePreset(\'' + z.id + '\')" ' +
          'style="font-size:7px;padding:3px 4px;border-color:' + z.color + '40;color:' + z.color + ';border-radius:0 4px 4px 0;border-left:0" title="Colocar forma pronta">' +
          FM._icon('copy', 9) + '</button>' : '') +
      '</div>'
    })
    html += '</div></div>'

    // ── Active zone indicator + cancel ──
    if (FM._selectedZone) {
      var sz = FM.ZONES.find(function (x) { return x.id === FM._selectedZone })
      html += '<div class="fm-tool-section" style="padding:6px 8px;background:rgba(200,169,126,0.06);border:1px solid rgba(200,169,126,0.12);border-radius:6px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<span style="font-size:10px;color:#C8A97E;font-weight:600">' + FM._icon('crosshair', 12) + ' ' + (sz ? sz.label : '') + '</span>' +
          '<button class="fm-btn" onclick="FaceMapping._selectZone(null)" style="font-size:8px;padding:2px 8px;border-color:#EF4444;color:#EF4444">' + FM._icon('x', 10) + ' Sair</button>' +
        '</div>' +
        '<div style="font-size:8px;color:rgba(245,240,232,0.3);line-height:1.4;margin-bottom:6px">Clique nos pontos da foto para marcar a area. Enter ou clique no primeiro ponto para fechar.</div>' +
        (FM.ZONE_PRESETS[FM._selectedZone] ? '<button class="fm-btn" onclick="FaceMapping._placePreset(\'' + FM._selectedZone + '\')" style="width:100%;padding:6px;font-size:10px;font-weight:600;border-color:' + (sz ? sz.color : '#C8A97E') + ';color:' + (sz ? sz.color : '#C8A97E') + '">' + FM._icon('copy', 12) + ' Forma Pronta</button>' : '') +
      '</div>'
    }

    // ── Selected polygon editor ──
    if (FM._selAnn && FM._selAnn.shape && FM._selAnn.shape.type === 'polygon') {
      var selZ = FM.ZONES.find(function (x) { return x.id === FM._selAnn.zone })
      var selColor = selZ ? selZ.color : '#999'
      var selUnit = selZ && selZ.unit === 'U' ? 'U' : 'mL'
      var selStep = selUnit === 'U' ? '1' : '0.1'
      var selId = FM._selAnn.id

      html += '<div class="fm-tool-section" style="padding:8px;background:rgba(200,169,126,0.06);border:1px solid rgba(200,169,126,0.12);border-radius:6px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
          '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + selColor + '"></span>' +
          '<span style="font-size:11px;font-weight:600;color:#F5F0E8">' + (selZ ? selZ.label : FM._selAnn.zone) + '</span>' +
          (selZ ? '<span style="font-size:8px;color:rgba(200,169,126,0.4)">(' + selZ.min + '-' + selZ.max + selUnit + ')</span>' : '') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">' +
          // Dose
          '<div>' +
            '<label style="font-size:7px;text-transform:uppercase;letter-spacing:1px;color:rgba(200,169,126,0.4)">Dose (' + selUnit + ')</label>' +
            '<input type="number" step="' + selStep + '" min="0" value="' + FM._selAnn.ml + '" ' +
              'onchange="var a=window._FM._annotations.find(function(x){return x.id===' + selId + '});if(a){a.ml=parseFloat(this.value)||0;window._FM._autoSave();window._FM._redraw();window._FM._refreshToolbar()}" ' +
              'style="width:100%;padding:3px 5px;font-size:10px;background:#12121a;border:1px solid #2a2a3a;border-radius:4px;color:#F5F0E8;outline:none">' +
          '</div>' +
          // Side
          '<div>' +
            '<label style="font-size:7px;text-transform:uppercase;letter-spacing:1px;color:rgba(200,169,126,0.4)">Lado</label>' +
            '<select onchange="var a=window._FM._annotations.find(function(x){return x.id===' + selId + '});if(a){a.side=this.value;window._FM._autoSave();window._FM._refreshToolbar()}" ' +
              'style="width:100%;padding:3px 5px;font-size:10px;background:#12121a;border:1px solid #2a2a3a;border-radius:4px;color:#F5F0E8;outline:none">' +
              '<option value="bilateral"' + (FM._selAnn.side === 'bilateral' ? ' selected' : '') + '>Bilateral</option>' +
              '<option value="esquerdo"' + (FM._selAnn.side === 'esquerdo' ? ' selected' : '') + '>Esquerdo</option>' +
              '<option value="direito"' + (FM._selAnn.side === 'direito' ? ' selected' : '') + '>Direito</option>' +
            '</select>' +
          '</div>' +
          // Treatment
          '<div>' +
            '<label style="font-size:7px;text-transform:uppercase;letter-spacing:1px;color:rgba(200,169,126,0.4)">Tratamento</label>' +
            '<select onchange="var a=window._FM._annotations.find(function(x){return x.id===' + selId + '});if(a){a.treatment=this.value;window._FM._autoSave();window._FM._redraw();window._FM._refreshToolbar()}" ' +
              'style="width:100%;padding:3px 5px;font-size:10px;background:#12121a;border:1px solid #2a2a3a;border-radius:4px;color:#F5F0E8;outline:none">'
      FM.TREATMENTS.forEach(function (t) {
        html += '<option value="' + t.id + '"' + (FM._selAnn.treatment === t.id ? ' selected' : '') + '>' + t.label + '</option>'
      })
      html += '</select>' +
          '</div>' +
          // Product
          '<div>' +
            '<label style="font-size:7px;text-transform:uppercase;letter-spacing:1px;color:rgba(200,169,126,0.4)">Produto</label>' +
            '<input type="text" value="' + FM._esc(FM._selAnn.product || '') + '" placeholder="Ex: Juvederm" ' +
              'onchange="var a=window._FM._annotations.find(function(x){return x.id===' + selId + '});if(a){a.product=this.value;window._FM._autoSave()}" ' +
              'style="width:100%;padding:3px 5px;font-size:10px;background:#12121a;border:1px solid #2a2a3a;border-radius:4px;color:#F5F0E8;outline:none">' +
          '</div>' +
        '</div>' +
        // Mirror button
        '<button onclick="FaceMapping._mirrorPolygon()" ' +
          'style="margin-top:6px;width:100%;padding:4px 8px;font-size:9px;font-weight:600;border:1px solid rgba(200,169,126,0.2);border-radius:4px;background:rgba(200,169,126,0.06);color:#C8A97E;cursor:pointer">' +
          FM._icon('copy', 10) + ' Espelhar Bilateral</button>' +
      '</div>'
    }

    // ── Polygon annotations list ──
    html += '<div class="fm-tool-section" style="flex:1">' +
      '<div class="fm-tool-section-title">Marcações (' + FM._annotations.filter(function (a) { return a.angle === FM._activeAngle }).length + ')</div>'

    var angleAnnotations = FM._annotations.filter(function (a) { return a.angle === FM._activeAngle })
    if (angleAnnotations.length === 0 && !FM._selectedZone) {
      html += '<div style="font-size:11px;color:rgba(200,169,126,0.3);text-align:center;padding:12px">Selecione uma zona acima e marque na foto</div>'
    } else {
      angleAnnotations.forEach(function (ann) {
        var z = FM.ZONES.find(function (x) { return x.id === ann.zone })
        var label = z ? z.label : ann.zone
        var color = z ? z.color : '#999'
        var isSelected = FM._selAnn && FM._selAnn.id === ann.id
        html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;cursor:pointer;' +
          'background:' + (isSelected ? 'rgba(200,169,126,0.08)' : 'transparent') + '" ' +
          'onclick="FaceMapping._selectAnnotation(' + ann.id + ')">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:10px;color:rgba(245,240,232,0.7)">' + label + ' <span style="color:rgba(245,240,232,0.4);font-size:8px">' + (ann.ml || 0) + ' ' + (z && z.unit === 'U' ? 'U' : 'mL') + '</span></div>' +
            (ann.product ? '<div style="font-size:7px;color:rgba(200,169,126,0.4)">' + FM._esc(ann.product) + (ann.reticulation ? ' | ' + FM._esc(ann.reticulation) : '') + '</div>' : '') +
          '</div>' +
          '<button onclick="event.stopPropagation();FaceMapping._removeAnnotation(' + ann.id + ')" style="border:none;background:none;color:#EF4444;cursor:pointer;padding:2px">' + FM._icon('trash-2', 10) + '</button>' +
        '</div>'
      })
    }
    html += '</div>'

    // ── Opacidade ──
    html += '<div class="fm-tool-section" style="padding:6px 12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">' +
        '<span style="font-size:8px;color:rgba(200,169,126,0.4);text-transform:uppercase;letter-spacing:0.1em">Opacidade</span>' +
        '<span style="font-size:8px;color:rgba(200,169,126,0.5)">' + (FM._polyOpacity || 50) + '%</span>' +
      '</div>' +
      '<input type="range" min="0" max="100" value="' + (FM._polyOpacity || 50) + '" ' +
        'oninput="window._FM._polyOpacity=parseInt(this.value);this.previousElementSibling.lastChild.textContent=this.value+\'%\';window._FM._redraw()" ' +
        'style="width:100%;height:4px;accent-color:#C8A97E">' +
    '</div>'

    // ── Totals + Custo Estimado ──
    var angleAnns = FM._annotations.filter(function (a) { return a.angle === FM._activeAngle })
    if (angleAnns.length > 0) {
      var costMap = {}
      var totalCost = 0
      angleAnns.forEach(function (a) {
        var tr = FM.TREATMENTS.find(function (x) { return x.id === a.treatment })
        var key = a.treatment || 'ah'
        // Try real price from Supabase, fallback to config
        var realPrice = 0
        if (FM._productPrices && a.product) {
          var pk = a.product.toLowerCase()
          if (FM._productPrices[pk]) realPrice = FM._productPrices[pk].custo
        }
        if (!realPrice && tr) realPrice = tr.unitPrice || 0
        if (!costMap[key]) costMap[key] = { label: tr ? tr.label : key, color: tr ? tr.color : '#999', qty: 0, unit: tr ? tr.priceUnit : 'mL', unitPrice: realPrice, product: a.product }
        costMap[key].qty += (parseFloat(a.ml) || 0)
      })

      html += '<div class="fm-tool-section" style="border-top:1px solid rgba(200,169,126,0.1);padding-top:8px">' +
        '<div class="fm-tool-section-title" style="font-size:9px">Resumo + Custo</div>'

      Object.keys(costMap).forEach(function (key) {
        var c = costMap[key]
        var cost = c.qty * c.unitPrice
        totalCost += cost
        html += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:9px;margin-bottom:4px">' +
          '<span style="color:' + c.color + '">' + c.label + '</span>' +
          '<div style="text-align:right">' +
            '<span style="color:rgba(245,240,232,0.7);font-weight:600">' + c.qty.toFixed(1) + ' ' + c.unit + '</span>' +
            '<span style="color:rgba(200,169,126,0.4);margin-left:6px">R$ ' + cost.toFixed(0) + '</span>' +
          '</div>' +
        '</div>'
      })

      html += '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(200,169,126,0.08)">' +
        '<span style="color:#C8A97E;font-weight:600">Custo Total Produto</span>' +
        '<span style="color:#C8A97E;font-weight:700">R$ ' + totalCost.toFixed(0) + '</span>' +
      '</div>' +
      '</div>'
    }

    html += '</div>'
    return html
  }

  // ── VECTORS PANEL (dedicated for Vetores tab) ──
  FM._renderVectorsPanel = function () {
    var html = '<div class="fm-toolbar">'
    var age = FM._vecAge || 25
    var t = FM._vecAgeFactor(age)
    var colPct = FM._vecCollagenPct(age)
    var ageColor = FM._vecAgeColor(t)
    var grav = FM._vecGravityLabel(t)

    // ── Age Display ──
    html += '<div class="fm-tool-section" style="text-align:center;padding:12px">' +
      '<div style="font-size:48px;font-weight:900;line-height:1;color:' + ageColor + ';transition:color .3s">' + age + '</div>' +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:3px;color:rgba(200,169,126,0.4);margin-top:2px">anos</div>' +
    '</div>'

    // ── Age Slider ──
    html += '<div class="fm-tool-section" style="padding:8px 12px">' +
      '<input type="range" min="25" max="70" step="1" value="' + age + '" ' +
        'oninput="FaceMapping._setVecAge(parseInt(this.value))" ' +
        'style="width:100%;height:6px;border-radius:3px;outline:none;cursor:pointer;-webkit-appearance:none;' +
        'background:linear-gradient(90deg,#00e89d 0%,#d4a853 50%,#ff4466 100%)">' +
      '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:9px;color:rgba(200,169,126,0.3)">' +
        '<span>25</span><span>35</span><span>45</span><span>55</span><span>65</span><span>70</span>' +
      '</div>' +
    '</div>'

    // ── Collagen Bar ──
    html += '<div class="fm-tool-section" style="padding:8px 12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<span style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:rgba(200,169,126,0.4);font-weight:600">Colageno</span>' +
        '<span style="font-size:18px;font-weight:800;color:' + ageColor + '">' + Math.round(colPct) + '%</span>' +
      '</div>' +
      '<div style="width:100%;height:6px;background:#1a1a26;border-radius:3px;overflow:hidden">' +
        '<div style="width:' + Math.max(8, colPct) + '%;height:100%;background:' + ageColor + ';border-radius:3px;transition:all .4s;box-shadow:0 0 8px ' + ageColor + '60"></div>' +
      '</div>' +
    '</div>'

    // ── Metrics Cards ──
    var elasticity = Math.round(100 - t * 65)
    var structure = Math.round(100 - t * 55)
    var activeVec = Math.round(100 - t * 70)

    html += '<div class="fm-tool-section" style="padding:4px 12px">' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">'

    var metrics = [
      { label: 'Elasticidade', value: elasticity },
      { label: 'Sustentação', value: structure },
      { label: 'Vetores', value: activeVec },
    ]
    metrics.forEach(function (m) {
      var mc = m.value >= 70 ? '#00e89d' : (m.value >= 45 ? '#d4a853' : '#ff4466')
      html += '<div style="background:#12121a;border:1px solid #2a2a3a;border-radius:8px;padding:8px 4px;text-align:center">' +
        '<div style="font-size:18px;font-weight:800;color:' + mc + '">' + m.value + '%</div>' +
        '<div style="font-size:7px;text-transform:uppercase;letter-spacing:1px;color:rgba(200,169,126,0.3);margin-top:2px">' + m.label + '</div>' +
      '</div>'
    })
    html += '</div></div>'

    // ── Force Indicators ──
    html += '<div class="fm-tool-section" style="padding:4px 12px">' +
      '<div style="display:flex;gap:6px">'

    var forces = [
      { label: 'Gravidade', info: FM._vecGravityLabel(t) },
      { label: 'Anteriorização', info: t < 0.3 ? { label: 'Minima', color: '#00e89d' } : t < 0.6 ? { label: 'Leve', color: '#d4a853' } : { label: 'Intensa', color: '#ff4466' } },
      { label: 'Ligamentos', info: t < 0.25 ? { label: 'Firmes', color: '#00e89d' } : t < 0.55 ? { label: 'Frouxos', color: '#d4a853' } : { label: 'Frageis', color: '#ff4466' } },
    ]
    forces.forEach(function (f) {
      html += '<div style="flex:1;background:#12121a;border:1px solid #2a2a3a;border-radius:8px;padding:6px 4px;text-align:center">' +
        '<div style="font-size:11px;font-weight:700;color:' + f.info.color + '">' + f.info.label + '</div>' +
        '<div style="font-size:7px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(200,169,126,0.3);margin-top:1px">' + f.label + '</div>' +
      '</div>'
    })
    html += '</div></div>'

    // ── Zone List ──
    html += '<div class="fm-tool-section" style="padding:4px 12px">' +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:rgba(200,169,126,0.4);font-weight:600;margin-bottom:6px">Zonas Vetoriais</div>'

    FM.FORCE_VECTORS.forEach(function (def) {
      var info = FM.FORCE_REGION_INFO[def.id] || {}
      var vecDesc = t < 0.3 ? info.youngDesc : info.agedDesc
      html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03)">' +
        '<div style="width:8px;height:8px;border-radius:50%;background:' + def.color + ';box-shadow:0 0 6px ' + def.color + '40;flex-shrink:0"></div>' +
        '<div style="flex:1">' +
          '<div style="font-size:10px;font-weight:600;color:#F5F0E8">' + def.label + '</div>' +
          '<div style="font-size:8px;color:rgba(200,169,126,0.3)">' + (vecDesc || '') + '</div>' +
        '</div>' +
        '<div style="font-size:9px;color:' + ageColor + ';font-weight:600">' + (t < 0.3 ? 'OK' : t < 0.65 ? 'ALERTA' : 'CRITICO') + '</div>' +
      '</div>'
    })
    html += '</div>'

    // ── Quote ──
    var quote = FM._vecQuotes.find(function (q) { return age <= q.maxAge }) || FM._vecQuotes[FM._vecQuotes.length - 1]
    html += '<div class="fm-tool-section" style="padding:12px;text-align:center">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:13px;font-style:italic;color:rgba(200,169,126,0.4);line-height:1.6">' +
        '"' + quote.text + '"' +
      '</div>' +
    '</div>'

    html += '</div>'
    return html
  }

  // ── TOOLBAR (legacy — fallback) ──
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
          (FM._photoUrls['lateral'] ? '<button class="fm-zone-btn' + (FM._analysisSubMode === 'ricketts' ? ' active' : '') + '" ' +
            'onclick="FaceMapping._analysisSubMode=\'ricketts\';FaceMapping._selectAngle(\'lateral\');FaceMapping._render();setTimeout(FaceMapping._initCanvas,50);if(FaceMapping._viewMode===\'2x\')setTimeout(FaceMapping._initCanvas2,100)" ' +
            'style="flex:1;justify-content:center;min-width:80px">Ricketts</button>' : '') +
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
          '<div style="font-size:12px;color:rgba(200,169,126,0.5);margin-bottom:8px">Ideal: 33% cada terco</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
            FM._propBar('Superior', pSup) +
            FM._propBar('Medio', pMed) +
            FM._propBar('Inferior', pInf) +
          '</div>' +
        '</div>'
        html += '<div class="fm-tool-section">' +
          '<div style="font-size:11px;color:rgba(200,169,126,0.3)">Arraste as linhas horizontais na foto para posicionar nos pontos anatomicos.</div>' +
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
          '<div style="font-size:10px;color:rgba(200,169,126,0.3);margin-top:4px">Clique na foto para adicionar</div>' +
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
                '<span style="color:rgba(200,169,126,0.5)">' + d.from + ' → ' + d.to + '</span>' +
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
                '<span style="color:rgba(200,169,126,0.5)">' + a.line + (a.label ? ' (' + a.label + ')' : '') + '</span>' +
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
                  '<span style="color:rgba(200,169,126,0.5)">' + d.from + ' ↔ ' + d.to + '</span>' +
                  '<span style="color:#F59E0B;font-weight:600">' + d.distance_px + 'px</span>' +
                '</div>'
              if (d.vertical_diff_px > 2) {
                html += '<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:2px">' +
                  '<span style="color:rgba(200,169,126,0.3)">↕ Desnivel vertical</span>' +
                  '<span style="color:' + sevColor + ';font-weight:700">' + d.vertical_diff_px + 'px — ' + d.severity + '</span>' +
                '</div>' +
                '<div style="font-size:9px;color:rgba(200,169,126,0.3);margin-top:1px">Lado ' + d.higher_side + ' mais alto</div>'
              }
              if (d.horizontal_diff_px > 2) {
                html += '<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:2px">' +
                  '<span style="color:rgba(200,169,126,0.3)">↔ Diferenca lateral</span>' +
                  '<span style="color:rgba(200,169,126,0.5)">' + d.horizontal_diff_px + 'px</span>' +
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
            '<span style="font-size:11px;color:rgba(200,169,126,0.5)">AMF (Gonial-Mento-Gonial)</span>' +
            '<span style="font-size:14px;font-weight:700;color:' + ma.classification.color + '">' + ma.amf + '\u00B0</span>' +
          '</div>' +
          '<div style="font-size:10px;color:' + ma.classification.color + ';font-weight:600;padding:2px 0 6px">' + ma.classification.label + '</div>'

          // RMZ
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:rgba(200,169,126,0.5)">Ratio Mand/Zigoma</span>' +
            '<span style="font-size:12px;font-weight:600;color:' + (ma.rmz >= 0.85 && ma.rmz <= 0.95 ? '#10B981' : '#F59E0B') + '">' + ma.rmz + '</span>' +
          '</div>' +
          '<div style="font-size:9px;color:rgba(200,169,126,0.3)">Ideal: 0.85-0.95</div>'

          // AIJ
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;margin-top:4px">' +
            '<span style="font-size:11px;color:rgba(200,169,126,0.5)">Jawline E / D</span>' +
            '<span style="font-size:12px;font-weight:600;color:' + ma.jawline.color + '">' + ma.aij_left + '\u00B0 / ' + ma.aij_right + '\u00B0</span>' +
          '</div>' +
          '<div style="font-size:10px;color:' + ma.jawline.color + ';font-weight:500">' + ma.jawline.label + ' (media ' + ma.aij_avg + '\u00B0)</div>'

          // Asymmetry between left and right AIJ
          var aijDiff = Math.abs(ma.aij_left - ma.aij_right)
          if (aijDiff > 2) {
            var aijSide = ma.aij_left > ma.aij_right ? 'Esquerdo mais caido' : 'Direito mais caido'
            var aijColor = aijDiff > 8 ? '#EF4444' : aijDiff > 4 ? '#F59E0B' : '#10B981'
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;margin-top:2px">' +
              '<span style="font-size:10px;color:rgba(200,169,126,0.3)">Assimetria jawline</span>' +
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

    // Scanner data (shared across all simetria sub-modes)
    if (FM._scanData) {
        var sd = FM._scanData
        html += '<div class="fm-tool-section">' +
          '<div class="fm-tool-section-title">Scanner Facial</div>'

        // Face shape
        if (sd.shape) {
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:rgba(200,169,126,0.5)">Biotipo</span>' +
            '<span style="font-size:12px;font-weight:600;color:#C8A97E;text-transform:capitalize">' + sd.shape.shape + '</span>' +
          '</div>'
        }

        // Symmetry
        if (sd.symmetry) {
          var symColor = sd.symmetry.overall >= 85 ? '#10B981' : sd.symmetry.overall >= 70 ? '#F59E0B' : '#EF4444'
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:rgba(200,169,126,0.5)">Simetria</span>' +
            '<span style="font-size:12px;font-weight:600;color:' + symColor + '">' + sd.symmetry.overall + '%</span>' +
          '</div>'
        }

        // Golden ratio
        if (sd.measurements && sd.measurements.golden_ratio_score != null) {
          var grColor = sd.measurements.golden_ratio_score >= 70 ? '#10B981' : sd.measurements.golden_ratio_score >= 50 ? '#F59E0B' : '#EF4444'
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:rgba(200,169,126,0.5)">Proporção Aurea</span>' +
            '<span style="font-size:12px;font-weight:600;color:' + grColor + '">' + Math.round(sd.measurements.golden_ratio_score) + '%</span>' +
          '</div>'
        }

        // Pose
        if (sd.pose && sd.pose.estimated) {
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">' +
            '<span style="font-size:11px;color:rgba(200,169,126,0.5)">Angulo</span>' +
            '<span style="font-size:12px;font-weight:500;color:rgba(245,240,232,0.85);text-transform:capitalize">' +
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
            '<span style="font-size:11px;color:rgba(200,169,126,0.5)">Idade Biologica</span>' +
            '<span style="font-size:14px;font-weight:700;color:' + ageColor + '">' + Math.round(FM._skinAge.estimated_age) + ' anos</span>' +
          '</div>' +
          '<div style="font-size:10px;color:rgba(200,169,126,0.3);padding:2px 0 6px">' + (FM._skinAge.description || '') + '</div>'
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
                '<span style="color:rgba(200,169,126,0.5)">' + m.label + '</span>' +
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
              '<span style="font-size:11px;font-weight:600;color:rgba(200,169,126,0.5)">Score Geral</span>' +
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
            '<div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(200,169,126,0.3);margin-bottom:6px">Heatmaps</div>' +
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
              (active ? b.color : 'rgba(200,169,126,0.5)') + ';cursor:pointer;font-weight:' +
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
          '<div style="font-size:10px;color:rgba(200,169,126,0.3);margin-top:6px">Detecta 478 pontos, biotipo, simetria, idade da pele</div>' +
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
      '<div class="fm-tool-section-title">Preenchimento <span style="font-weight:400;color:rgba(200,169,126,0.3);text-transform:none;letter-spacing:0">(mL)</span></div>' +
      '<div class="fm-zone-grid">'
    fillZones.forEach(function (z) {
      html += FM._renderZoneBtn(z, allowedIds)
    })
    html += '</div></div>'

    // Rugas / Toxina section
    var toxZones = FM.ZONES.filter(function (z) { return z.cat === 'tox' })
    html += '<div class="fm-tool-section" style="padding-bottom:10px">' +
      '<div class="fm-tool-section-title">Rugas / Toxina <span style="font-weight:400;color:rgba(200,169,126,0.3);text-transform:none;letter-spacing:0">(U)</span></div>' +
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
        (rangeHint ? '<span style="font-size:10px;color:rgba(200,169,126,0.3)">' + rangeHint + '</span>' : '') +
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
      '<div class="fm-tool-section-title">Marcações (' + FM._annotations.length + ')</div>' +
      '<div class="fm-annotations-list">'

    // Cancel/deselect button when zone is active
    if (FM._selectedZone) {
      var sz = FM.ZONES.find(function (x) { return x.id === FM._selectedZone })
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:6px;background:rgba(200,169,126,0.06);border:1px solid rgba(200,169,126,0.12);border-radius:6px">' +
        '<span style="font-size:10px;color:#C8A97E;font-weight:600">' + FM._icon('crosshair', 12) + ' Marcando: ' + (sz ? sz.label : FM._selectedZone) + '</span>' +
        '<button class="fm-btn" onclick="FaceMapping._selectZone(null)" style="font-size:8px;padding:2px 8px;border-color:#EF4444;color:#EF4444">' + FM._icon('x', 10) + ' Sair</button>' +
      '</div>'
    }

    var angleAnnotations = FM._annotations.filter(function (a) { return a.angle === FM._activeAngle })
    if (angleAnnotations.length === 0 && !FM._selectedZone) {
      html += '<div style="font-size:12px;color:rgba(200,169,126,0.3);text-align:center;padding:12px">Selecione uma zona e clique nos pontos para marcar a area</div>'
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
          '<span style="color:rgba(245,240,232,0.85);font-weight:600">' + t.ml.toFixed(1) + ' mL</span>' +
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
    var activeTab = FM._activeTab || 'zones'
    var html
    if (activeTab === 'simetria') html = FM._renderSimetriaPanel()
    else if (activeTab === 'analysis') html = FM._renderAnalisePanel()
    else if (activeTab === 'vectors') html = FM._renderVectorsPanel()
    else html = FM._renderZonesPanel()
    var temp = document.createElement('div')
    temp.innerHTML = html
    toolbar.parentNode.replaceChild(temp.firstChild, toolbar)
    if (window.feather) window.feather.replace()
  }

})()
