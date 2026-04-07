/**
 * fm-ui.js — Render, event binding, UI actions
 */
;(function () {
  'use strict'

  var FM = window._FM

  // ── Init ──────────────────────────────────────────────────

  FM.init = function (leadId) {
    var leads = window.LeadsService ? window.LeadsService.getLocal() : []
    var lead = leads.find(function (l) { return l.id === leadId || l.lead_id === leadId })
    if (!lead) lead = { id: leadId, nome: 'Paciente' }
    FM._lead = lead
    FM._photos = {}
    FM._photoUrls = {}
    FM._annotations = []
    FM._activeAngle = null
    FM._nextId = 1
    FM._afterPhotoUrl = null
    FM._simPhotoUrl = null

    FM._restoreSession(leadId)
    FM._cleanupStorage()

    if (window.navigateTo) window.navigateTo('facial-analysis')
    setTimeout(function () { FM._render() }, 100)
  }

  FM.openFromModal = function (lead) {
    FM._lead = lead
    FM._photos = {}
    FM._photoUrls = {}
    FM._annotations = []
    FM._activeAngle = null
    FM._nextId = 1
    FM._afterPhotoUrl = null
    FM._simPhotoUrl = null

    if (window.navigateTo) window.navigateTo('facial-analysis')
    setTimeout(function () { FM._render() }, 100)
  }

  FM._restorePage = function () {
    if (FM._lead) {
      FM._render()
      if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
      return
    }
    try {
      var lastId = localStorage.getItem('fm_last_session')
      if (lastId) {
        FM.init(lastId)
        return
      }
    } catch (e) {}

    var root = document.getElementById('facialAnalysisRoot')
    if (!root) return

    var leads = []
    try { leads = JSON.parse(localStorage.getItem('clinicai_leads') || '[]') } catch (e) {}
    var recentLeads = leads.slice(0, 20)

    var leadOptions = recentLeads.map(function (l) {
      var name = l.nome || l.name || 'Sem nome'
      return '<button onclick="FaceMapping.init(\'' + l.id + '\')" ' +
        'style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;border:1px solid #E8EAF0;border-radius:10px;background:#fff;cursor:pointer;text-align:left;transition:border-color .2s" ' +
        'onmouseover="this.style.borderColor=\'#C8A97E\'" onmouseout="this.style.borderColor=\'#E8EAF0\'">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#C9A96E);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">' + name.charAt(0).toUpperCase() + '</div>' +
        '<div><div style="font-size:13px;font-weight:600;color:#1A1B2E">' + FM._esc(name) + '</div>' +
        '<div style="font-size:11px;color:#9CA3AF">' + (l.phone || l.whatsapp || l.telefone || '') + '</div></div>' +
      '</button>'
    }).join('')

    root.innerHTML = '<div class="fm-page">' +
      '<div class="fm-header"><div class="fm-header-left">' +
        '<span class="fm-header-title">Analise Facial</span>' +
      '</div></div>' +
      '<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px">' +
        '<div style="max-width:400px;width:100%;text-align:center">' +
          FM._icon('image', 40) +
          '<h3 style="font-size:18px;font-weight:600;color:#1A1B2E;margin:12px 0 4px">Selecione o Paciente</h3>' +
          '<p style="font-size:13px;color:#9CA3AF;margin-bottom:16px">Escolha um paciente para iniciar a analise facial</p>' +
          '<div style="display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto;text-align:left">' +
            (leadOptions || '<p style="font-size:13px;color:#9CA3AF;text-align:center">Nenhum paciente encontrado</p>') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
    if (window.feather) window.feather.replace()
  }

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
        FM._renderToolbar() +
      '</div>' +
    '</div>'

    FM._bindEvents()
    if (window.feather) window.feather.replace()
  }

  FM._renderHeader = function (name) {
    return '<div class="fm-header">' +
      '<div class="fm-header-left">' +
        '<span class="fm-header-title">Analise Facial</span>' +
        '<span class="fm-patient-badge">' + FM._icon('user', 14) + ' ' + FM._esc(name) + '</span>' +
      '</div>' +
      '<div class="fm-header-actions">' +
        '<div class="fm-mode-toggle">' +
          '<button class="fm-mode-btn' + (FM._editorMode === 'zones' ? ' active' : '') + '" onclick="FaceMapping._setEditorMode(\'zones\')">' + FM._icon('layers', 14) + ' Zonas</button>' +
          '<button class="fm-mode-btn' + (FM._editorMode === 'vectors' ? ' active' : '') + '" onclick="FaceMapping._setEditorMode(\'vectors\')">' + FM._icon('trending-up', 14) + ' Vetores</button>' +
          '<button class="fm-mode-btn' + (FM._editorMode === 'analysis' ? ' active' : '') + '" onclick="FaceMapping._setEditorMode(\'analysis\')">' + FM._icon('git-commit', 14) + ' Analise</button>' +
        '</div>' +
        '<button class="fm-btn" onclick="FaceMapping._editRanges()" title="Editar ranges">' + FM._icon('sliders', 14) + ' Ranges</button>' +
        '<button class="fm-btn" onclick="FaceMapping._clearAll()" title="Limpar tudo">' + FM._icon('trash-2', 14) + ' Limpar</button>' +
        '<button class="fm-btn" onclick="FaceMapping._exportReport()">' + FM._icon('download', 14) + ' Exportar Report</button>' +
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

    html += '<input type="file" id="fmFileInput" accept="image/*" style="display:none">'
    html += '<input type="file" id="fmExtraFileInput" accept="image/*" style="display:none">'
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

  FM._renderToolbar = function () {
    var html = '<div class="fm-toolbar">'

    // ANALYSIS MODE
    if (FM._editorMode === 'analysis') {
      html += '<div class="fm-tool-section">' +
        '<div class="fm-tool-section-title">Tipo de Analise</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="fm-zone-btn' + (FM._activeAngle === 'front' ? ' active' : '') + '" ' +
            'onclick="FaceMapping._selectAngle(\'front\')" style="flex:1;justify-content:center"' +
            (FM._photoUrls['front'] ? '' : ' disabled') + '>Tercos Faciais</button>' +
          '<button class="fm-zone-btn' + (FM._activeAngle === 'lateral' ? ' active' : '') + '" ' +
            'onclick="FaceMapping._selectAngle(\'lateral\')" style="flex:1;justify-content:center"' +
            (FM._photoUrls['lateral'] ? '' : ' disabled') + '>Linha de Ricketts</button>' +
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

  // ── Actions ───────────────────────────────────────────────

  FM._selectAngle = function (angle) {
    FM._activeAngle = angle
    if (FM._selectedZone) {
      var allowed = FM._zonesForAngle(angle)
      var ids = allowed.map(function (z) { return z.id })
      if (ids.indexOf(FM._selectedZone) === -1) FM._selectedZone = null
    }
    FM._selAnn = null
    FM._render()
    setTimeout(FM._initCanvas, 50)
  }

  FM._selectZone = function (zoneId) {
    FM._selectedZone = (FM._selectedZone === zoneId) ? null : zoneId

    if (FM._selectedZone) {
      var z = FM.ZONES.find(function (x) { return x.id === FM._selectedZone })
      if (z) {
        FM._selectedMl = String(z.min)
        FM._selectedTreatment = z.defaultTx || (z.cat === 'tox' ? 'botox' : 'ah')
      }
    }

    FM._refreshToolbar()
  }

  FM._onTreatmentChange = function (val) {
    FM._selectedTreatment = val
  }

  FM._removeAnnotation = function (id) {
    FM._annotations = FM._annotations.filter(function (a) { return a.id !== id })
    FM._simPhotoUrl = null
    FM._autoSave()
    FM._redraw()
    FM._refreshToolbar()
  }

  FM._clearAll = function () {
    if (!confirm('Limpar todas as marcacoes e fotos?')) return
    FM._annotations = []
    FM._vectors = []
    FM._simPhotoUrl = null
    FM._afterPhotoUrl = null
    Object.keys(FM._photoUrls).forEach(function (k) {
      if (FM._photoUrls[k]) URL.revokeObjectURL(FM._photoUrls[k])
    })
    FM._photos = {}
    FM._photoUrls = {}
    FM._activeAngle = null
    FM._clearSession()
    FM._autoSave()
    FM._render()
  }

  FM._refreshToolbar = function () {
    var toolbar = document.querySelector('.fm-toolbar')
    if (!toolbar) return
    var temp = document.createElement('div')
    temp.innerHTML = FM._renderToolbar()
    toolbar.parentNode.replaceChild(temp.firstChild, toolbar)
    if (window.feather) window.feather.replace()
  }

  FM._calcTotals = function () {
    var map = {}
    FM._annotations.forEach(function (a) {
      if (!map[a.treatment]) {
        var t = FM.TREATMENTS.find(function (x) { return x.id === a.treatment })
        map[a.treatment] = { label: t ? t.label : a.treatment, color: t ? t.color : '#999', ml: 0 }
      }
      map[a.treatment].ml += a.ml
    })
    return Object.values(map)
  }

  FM._triggerUpload = function (angle) {
    FM._pendingUploadAngle = angle
    var input = document.getElementById('fmFileInput')
    if (input) {
      input.value = ''
      input.click()
    }
  }

  FM._triggerUploadExtra = function (type) {
    FM._pendingExtraType = type
    var input = document.getElementById('fmExtraFileInput')
    if (input) { input.value = ''; input.click() }
  }

  FM._deleteExtraPhoto = function (type) {
    if (type === 'after') { if (FM._afterPhotoUrl) URL.revokeObjectURL(FM._afterPhotoUrl); FM._afterPhotoUrl = null }
    if (type === 'sim') { if (FM._simPhotoUrl) URL.revokeObjectURL(FM._simPhotoUrl); FM._simPhotoUrl = null }
    FM._render()
    if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
  }

  FM._deletePhoto = function (angle) {
    if (FM._photoUrls[angle]) URL.revokeObjectURL(FM._photoUrls[angle])
    delete FM._photos[angle]
    delete FM._photoUrls[angle]
    delete FM._originalFiles[angle]
    FM._annotations = FM._annotations.filter(function (a) { return a.angle !== angle })
    FM._simPhotoUrl = null
    if (FM._activeAngle === angle) {
      FM._activeAngle = FM._photoUrls['front'] ? 'front' : (FM._photoUrls['45'] ? '45' : (FM._photoUrls['lateral'] ? 'lateral' : null))
    }
    FM._selAnn = null
    FM._autoSave()
    FM._render()
    if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
  }

  FM._bindEvents = function () {
    var input = document.getElementById('fmFileInput')
    if (input) {
      input.addEventListener('change', function (e) {
        var file = e.target.files[0]
        if (!file || !FM._pendingUploadAngle) return

        FM._originalFiles[FM._pendingUploadAngle] = file

        var tempUrl = URL.createObjectURL(file)
        FM._openCropModal(tempUrl, FM._pendingUploadAngle)
      })
    }

    var extraInput = document.getElementById('fmExtraFileInput')
    if (extraInput) {
      extraInput.addEventListener('change', function (e) {
        var file = e.target.files[0]
        if (!file || !FM._pendingExtraType) return
        var url = URL.createObjectURL(file)
        if (FM._pendingExtraType === 'after') {
          if (FM._afterPhotoUrl) URL.revokeObjectURL(FM._afterPhotoUrl)
          FM._afterPhotoUrl = url
        } else {
          if (FM._simPhotoUrl) URL.revokeObjectURL(FM._simPhotoUrl)
          FM._simPhotoUrl = url
        }
        FM._render()
        if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
      })
    }

    if (FM._activeAngle && FM._photoUrls[FM._activeAngle]) {
      setTimeout(FM._initCanvas, 50)
    }
  }

  FM._setCanvasZoom = function () { /* no-op, kept for API compat */ }
  FM._zoomCanvas = function () { /* no-op */ }

})()
