/**
 * fm-actions.js — Init, events, user actions (split from fm-ui.js)
 */
;(function () {
  'use strict'

  var FM = window._FM

  // ── Client-side trim + save for remove-bg results ─────────
  // Trims fully-black rows/cols from the edges, adds small margin,
  // then saves to the correct store (antes or after)
  FM._trimAndSaveResult = function (image_b64, target, angle) {
    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      var ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)

      var data = ctx.getImageData(0, 0, c.width, c.height).data
      var w = c.width, h = c.height

      // Find content bounds (pixels where R+G+B > 30)
      var top = 0, bottom = h - 1, left = 0, right = w - 1
      var threshold = 30

      // Top
      findTop: for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4
          if (data[i] + data[i+1] + data[i+2] > threshold) { top = y; break findTop }
        }
      }
      // Bottom
      findBottom: for (var y2 = h - 1; y2 >= top; y2--) {
        for (var x2 = 0; x2 < w; x2++) {
          var i2 = (y2 * w + x2) * 4
          if (data[i2] + data[i2+1] + data[i2+2] > threshold) { bottom = y2; break findBottom }
        }
      }
      // Left
      findLeft: for (var x3 = 0; x3 < w; x3++) {
        for (var y3 = top; y3 <= bottom; y3++) {
          var i3 = (y3 * w + x3) * 4
          if (data[i3] + data[i3+1] + data[i3+2] > threshold) { left = x3; break findLeft }
        }
      }
      // Right
      findRight: for (var x4 = w - 1; x4 >= left; x4--) {
        for (var y4 = top; y4 <= bottom; y4++) {
          var i4 = (y4 * w + x4) * 4
          if (data[i4] + data[i4+1] + data[i4+2] > threshold) { right = x4; break findRight }
        }
      }

      // Add 2% margin, clamped to image bounds
      var contentW = right - left + 1
      var contentH = bottom - top + 1
      var pad = Math.round(Math.max(contentW, contentH) * 0.02)
      var cx1 = Math.max(0, left - pad)
      var cy1 = Math.max(0, top - pad)
      var cx2 = Math.min(w, right + 1 + pad)
      var cy2 = Math.min(h, bottom + 1 + pad)

      var cropW = cx2 - cx1
      var cropH = cy2 - cy1
      var out = document.createElement('canvas')
      out.width = cropW; out.height = cropH
      var octx = out.getContext('2d')
      octx.fillStyle = '#000000'
      octx.fillRect(0, 0, cropW, cropH)
      octx.drawImage(c, cx1, cy1, cropW, cropH, 0, 0, cropW, cropH)

      out.toBlob(function (blob) {
        var url = URL.createObjectURL(blob)
        if (target === 'antes') {
          if (FM._photoUrls[angle]) URL.revokeObjectURL(FM._photoUrls[angle])
          FM._photoUrls[angle] = url
          FM._photos[angle] = blob
        } else {
          if (FM._afterPhotoByAngle[angle]) URL.revokeObjectURL(FM._afterPhotoByAngle[angle])
          FM._afterPhotoByAngle[angle] = url
        }
        FM._autoSave()
        FM._render()
        if (FM._activeAngle === angle || !FM._activeAngle) setTimeout(FM._initCanvas, 50)
        if (FM._viewMode === '2x') setTimeout(FM._initCanvas2, 100)
      }, 'image/png')
    }
    img.src = 'data:image/png;base64,' + image_b64
  }

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
    // Clear all per-angle stores (will be populated by restore)
    FM._afterPhotoByAngle = {}
    FM._simPhotoByAngle = {}
    FM._angleStore = {}
    FM._scanDataByAngle = {}

    FM._restoreSession(leadId)
    FM._cleanupStorage()

    // Ensure editorMode matches activeTab after restore
    if (!FM._activeTab || FM._activeTab === 'zones') FM._activeTab = 'simetria'
    if (FM._activeTab === 'simetria') {
      FM._editorMode = 'analysis'
      if (!FM._analysisSubMode || (FM._analysisSubMode !== 'ricketts' && FM._analysisSubMode !== 'metrics')) {
        FM._analysisSubMode = 'metrics'
      }
    }

    if (window.navigateTo) window.navigateTo('facial-analysis')
    setTimeout(function () {
      FM._render()
      setTimeout(FM._initCanvas, 50)
      if (FM._viewMode === '2x') setTimeout(FM._initCanvas2, 100)
    }, 100)
  }

  FM.openFromModal = function (lead) {
    FM._lead = lead
    FM._photos = {}
    FM._photoUrls = {}
    FM._annotations = []
    FM._activeAngle = null
    FM._nextId = 1
    FM._afterPhotoByAngle = {}
    FM._simPhotoByAngle = {}
    FM._angleStore = {}

    if (window.navigateTo) window.navigateTo('facial-analysis')
    setTimeout(function () { FM._render() }, 100)
  }

  FM._restorePage = function () {
    if (FM._lead) {
      FM._render()
      if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
      return
    }
    // Don't auto-restore — always show patient selection on page load

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

  // ── Actions ───────────────────────────────────────────────

  FM._selectAngle = function (angle) {
    // Cancel any in-progress polygon on angle switch
    if (FM._polyDrawing) FM._cancelPoly()
    // Switch angle — per-angle state auto-routes via getter/setter
    FM._activeAngle = angle
    FM._selectedRegion = null
    FM._hoveredRegion = null

    // Restore cached scan data for this angle (or clear)
    if (FM._scanDataByAngle && FM._scanDataByAngle[angle]) {
      FM._scanData = FM._scanDataByAngle[angle]
      FM._landmarkData = FM._scanDataByAngle[angle]
    } else {
      FM._scanData = null
      FM._landmarkData = null
    }

    if (FM._selectedZone) {
      var allowed = FM._zonesForAngle(angle)
      var ids = allowed.map(function (z) { return z.id })
      if (ids.indexOf(FM._selectedZone) === -1) FM._selectedZone = null
    }
    FM._selAnn = null
    FM._render()
    setTimeout(FM._initCanvas, 50)
    if (FM._viewMode === '2x') setTimeout(FM._initCanvas2, 100)
  }

  FM._selectZone = function (zoneId) {
    // Cancel any in-progress polygon when switching/deselecting zone
    if (FM._polyDrawing) FM._cancelPoly()

    FM._selectedZone = (!zoneId || FM._selectedZone === zoneId) ? null : zoneId

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
    if (FM._metricLocked) { FM._showToast('Destranque para deletar', 'warn'); return }
    FM._pushUndo()
    FM._annotations = FM._annotations.filter(function (a) { return a.id !== id })
    FM._simPhotoUrl = null
    FM._autoSave()
    FM._redraw()
    FM._refreshToolbar()
  }

  FM._clearAll = function () {
    if (!confirm('Limpar todas as marcacoes e fotos?')) return
    FM._pushUndo()
    FM._annotations = []
    FM._vectors = []
    // Clear ALL per-angle DEPOIS/SIM photos
    Object.keys(FM._afterPhotoByAngle).forEach(function (k) {
      if (FM._afterPhotoByAngle[k]) URL.revokeObjectURL(FM._afterPhotoByAngle[k])
    })
    FM._afterPhotoByAngle = {}
    Object.keys(FM._simPhotoByAngle).forEach(function (k) {
      if (FM._simPhotoByAngle[k]) URL.revokeObjectURL(FM._simPhotoByAngle[k])
    })
    FM._simPhotoByAngle = {}
    // Clear ANTES photos
    Object.keys(FM._photoUrls).forEach(function (k) {
      if (FM._photoUrls[k]) URL.revokeObjectURL(FM._photoUrls[k])
    })
    FM._photos = {}
    FM._photoUrls = {}
    // Clear all per-angle state
    FM._angleStore = {}
    FM._scanDataByAngle = {}
    FM._regionState = {}
    FM._activeAngle = null
    FM._clearSession()
    FM._render()
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

  FM._deleteAfterPhoto = function (angle) {
    var ang = angle || FM._activeAngle || 'front'
    if (!FM._afterPhotoByAngle[ang]) return
    if (!confirm('Excluir foto DEPOIS (' + ang + ')?')) return
    URL.revokeObjectURL(FM._afterPhotoByAngle[ang])
    delete FM._afterPhotoByAngle[ang]
    FM._autoSave()
    FM._render()
    if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
    if (FM._viewMode === '2x') setTimeout(FM._initCanvas2, 100)
  }

  FM._deleteExtraPhoto = function (type) {
    var ang = FM._activeAngle || 'front'
    var label = type === 'after' ? 'DEPOIS' : 'SIMULADO'
    if (!confirm('Excluir ' + label + ' (' + ang + ')?')) return
    if (type === 'after') {
      if (FM._afterPhotoByAngle[ang]) URL.revokeObjectURL(FM._afterPhotoByAngle[ang])
      delete FM._afterPhotoByAngle[ang]
    }
    if (type === 'sim') {
      if (FM._simPhotoByAngle[ang]) URL.revokeObjectURL(FM._simPhotoByAngle[ang])
      delete FM._simPhotoByAngle[ang]
    }
    FM._autoSave()
    FM._render()
    if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
    if (FM._viewMode === '2x') setTimeout(FM._initCanvas2, 100)
  }

  FM._deletePhoto = function (angle) {
    var hasAfter = !!FM._afterPhotoByAngle[angle]
    var hasSim = !!FM._simPhotoByAngle[angle]
    var hasExtra = hasAfter || hasSim

    if (hasExtra) {
      var extras = []
      if (hasAfter) extras.push('DEPOIS')
      if (hasSim) extras.push('SIMULADO')
      if (!confirm('Excluir foto ANTES (' + angle + ')?\n\nFotos ' + extras.join(' e ') + ' deste angulo serao mantidas.\nPara excluir tudo, use "Limpar tudo".')) return
    }

    // Clear ANTES only — explicitly preserve DEPOIS
    var savedAfter = FM._afterPhotoByAngle[angle] || null
    var savedSim = FM._simPhotoByAngle[angle] || null

    if (FM._photoUrls[angle]) URL.revokeObjectURL(FM._photoUrls[angle])
    delete FM._photos[angle]
    delete FM._photoUrls[angle]
    delete FM._originalFiles[angle]
    FM._annotations = FM._annotations.filter(function (a) { return a.angle !== angle })
    // Clear per-angle metrics/state (but NOT DEPOIS/SIM photos)
    delete FM._angleStore[angle]
    delete FM._scanDataByAngle[angle]

    // Restore DEPOIS/SIM in case anything cleared them
    if (savedAfter) FM._afterPhotoByAngle[angle] = savedAfter
    if (savedSim) FM._simPhotoByAngle[angle] = savedSim

    // Stay on this angle if DEPOIS exists, otherwise switch
    if (FM._activeAngle === angle) {
      if (!savedAfter && !savedSim) {
        FM._activeAngle = FM._photoUrls['front'] ? 'front' : (FM._photoUrls['45'] ? '45' : (FM._photoUrls['lateral'] ? 'lateral' : null))
      }
    }
    FM._selAnn = null

    // If DEPOIS exists, switch to 2x so user can SEE it's preserved
    if (savedAfter || savedSim) {
      FM._viewMode = '2x'
      FM._showToast('ANTES deletado. DEPOIS mantido.', 'success')
    }

    FM._autoSave()
    FM._render()
    if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
    if (FM._viewMode === '2x') setTimeout(FM._initCanvas2, 100)
  }

  FM._bindEvents = function () {
    var ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
    var MAX_SIZE_MB = 15

    function _validateFile(file) {
      if (!file) return false
      if (ALLOWED_TYPES.indexOf(file.type) === -1) {
        FM._showToast('Formato nao suportado. Use JPG, PNG ou WebP.', 'error')
        return false
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        FM._showToast('Arquivo muito grande (' + Math.round(file.size / 1024 / 1024) + 'MB). Maximo: ' + MAX_SIZE_MB + 'MB.', 'error')
        return false
      }
      return true
    }

    var input = document.getElementById('fmFileInput')
    if (input) {
      input.addEventListener('change', function (e) {
        var file = e.target.files[0]
        if (!file || !FM._pendingUploadAngle) return
        if (!_validateFile(file)) { e.target.value = ''; return }

        var targetAngle = FM._pendingUploadAngle
        FM._originalFiles[targetAngle] = file

        // Same flow as DEPOIS: send original to remove-bg directly
        var reader = new FileReader()
        reader.onload = function () {
          var b64 = reader.result.split(',')[1]
          FM._showLoading('Removendo fundo com IA...')

          fetch(FM.FACIAL_API_URL + '/remove-bg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photo_base64: b64, angle: targetAngle }),
          })
          .then(function (r) { return r.json() })
          .then(function (d) {
            FM._hideLoading()
            if (d.success && d.image_b64) {
              // Clear stale DEPOIS/SIM
              if (FM._afterPhotoByAngle[targetAngle]) { URL.revokeObjectURL(FM._afterPhotoByAngle[targetAngle]); delete FM._afterPhotoByAngle[targetAngle] }
              if (FM._simPhotoByAngle[targetAngle]) { URL.revokeObjectURL(FM._simPhotoByAngle[targetAngle]); delete FM._simPhotoByAngle[targetAngle] }
              delete FM._scanDataByAngle[targetAngle]
              FM._trimAndSaveResult(d.image_b64, 'antes', targetAngle)
              if (!FM._activeAngle) FM._activeAngle = targetAngle
              FM._showToast('Fundo removido (' + (d.elapsed_s || '?') + 's)', 'success')
            } else {
              // Fallback: save without bg removal
              if (FM._photoUrls[targetAngle]) URL.revokeObjectURL(FM._photoUrls[targetAngle])
              FM._photoUrls[targetAngle] = URL.createObjectURL(file)
              FM._photos[targetAngle] = file
              if (!FM._activeAngle) FM._activeAngle = targetAngle
              FM._showToast('Foto salva (sem bg removal)', 'warn')
            }
            FM._autoSave()
            FM._render()
            if (FM._activeAngle === targetAngle) setTimeout(FM._initCanvas, 50)
            if (FM._viewMode === '2x') setTimeout(FM._initCanvas2, 100)
          })
          .catch(function () {
            FM._hideLoading()
            if (FM._photoUrls[targetAngle]) URL.revokeObjectURL(FM._photoUrls[targetAngle])
            FM._photoUrls[targetAngle] = URL.createObjectURL(file)
            FM._photos[targetAngle] = file
            if (!FM._activeAngle) FM._activeAngle = targetAngle
            FM._autoSave()
            FM._render()
            if (FM._activeAngle === targetAngle) setTimeout(FM._initCanvas, 50)
            FM._showToast('API offline — foto salva sem processamento', 'warn')
          })
        }
        reader.readAsDataURL(file)
      })
    }

    var extraInput = document.getElementById('fmExtraFileInput')
    if (extraInput) {
      extraInput.addEventListener('change', function (e) {
        var file = e.target.files[0]
        if (!file || !FM._pendingExtraType) return
        if (!_validateFile(file)) { e.target.value = ''; return }

        // Capture angle at operation START
        var targetAngle = FM._activeAngle || 'front'

        if (FM._pendingExtraType === 'after') {
          // DEPOIS: same direct flow as ANTES — original to remove-bg
          var afterReader = new FileReader()
          afterReader.onload = function () {
            var b64 = afterReader.result.split(',')[1]
            FM._showLoading('Removendo fundo (DEPOIS)...')
            fetch(FM.FACIAL_API_URL + '/remove-bg', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ photo_base64: b64, angle: targetAngle }),
            })
            .then(function (r) { return r.json() })
            .then(function (d) {
              FM._hideLoading()
              if (d.success && d.image_b64) {
                FM._trimAndSaveResult(d.image_b64, 'after', targetAngle)
                FM._showToast('Fundo removido (' + (d.elapsed_s || '?') + 's)', 'success')
              } else {
                if (FM._afterPhotoByAngle[targetAngle]) URL.revokeObjectURL(FM._afterPhotoByAngle[targetAngle])
                FM._afterPhotoByAngle[targetAngle] = URL.createObjectURL(file)
              }
              FM._autoSave()
              FM._render()
              if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
              if (FM._viewMode === '2x') setTimeout(FM._initCanvas2, 100)
            })
            .catch(function () {
              FM._hideLoading()
              if (FM._afterPhotoByAngle[targetAngle]) URL.revokeObjectURL(FM._afterPhotoByAngle[targetAngle])
              FM._afterPhotoByAngle[targetAngle] = URL.createObjectURL(file)
              FM._autoSave()
              FM._render()
              if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
            })
          }
          afterReader.readAsDataURL(file)
        } else {
          var url = URL.createObjectURL(file)
          if (FM._simPhotoByAngle[targetAngle]) URL.revokeObjectURL(FM._simPhotoByAngle[targetAngle])
          FM._simPhotoByAngle[targetAngle] = url
          FM._autoSave()
          FM._render()
          if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
        }
      })
    }

    if (FM._activeAngle && FM._photoUrls[FM._activeAngle]) {
      setTimeout(FM._initCanvas, 50)
    }
  }

  FM._setCanvasZoom = function () { /* no-op, kept for API compat */ }
  FM._zoomCanvas = function () { /* no-op */ }

})()
