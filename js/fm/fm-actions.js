/**
 * fm-actions.js — Init, events, user actions (split from fm-ui.js)
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
    FM._metric2Lines = { h: [], v: [] }
    FM._metric2Points = []
    FM._metric2Midline = null
    FM._metric2Angles = null

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
    if (FM._afterPhotoUrls[angle]) {
      URL.revokeObjectURL(FM._afterPhotoUrls[angle])
      delete FM._afterPhotoUrls[angle]
    }
    FM._render()
    if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
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
        if (!_validateFile(file)) { e.target.value = ''; return }

        if (FM._pendingExtraType === 'after') {
          var reader = new FileReader()
          reader.onload = function () {
            var b64 = reader.result.split(',')[1]
            FM._showLoading('Removendo fundo (DEPOIS)...')
            fetch(FM.FACIAL_API_URL + '/remove-bg', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ photo_base64: b64 }),
            })
            .then(function (r) { return r.json() })
            .then(function (d) {
              FM._hideLoading()
              if (d.success && d.image_b64) {
                var bin = atob(d.image_b64)
                var arr = new Uint8Array(bin.length)
                for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
                if (FM._afterPhotoUrl) URL.revokeObjectURL(FM._afterPhotoUrl)
                FM._afterPhotoUrl = URL.createObjectURL(new Blob([arr], { type: 'image/png' }))
                FM._showToast('Fundo removido', 'success')
              } else {
                if (FM._afterPhotoUrl) URL.revokeObjectURL(FM._afterPhotoUrl)
                FM._afterPhotoUrl = URL.createObjectURL(file)
              }
              FM._render()
              if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
              if (FM._viewMode === '2x') setTimeout(FM._initCanvas2, 100)
            })
            .catch(function () {
              FM._hideLoading()
              if (FM._afterPhotoUrl) URL.revokeObjectURL(FM._afterPhotoUrl)
              FM._afterPhotoUrl = URL.createObjectURL(file)
              FM._render()
              if (FM._activeAngle) setTimeout(FM._initCanvas, 50)
            })
          }
          reader.readAsDataURL(file)
        } else {
          var url = URL.createObjectURL(file)
          if (FM._simPhotoUrl) URL.revokeObjectURL(FM._simPhotoUrl)
          FM._simPhotoUrl = url
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
