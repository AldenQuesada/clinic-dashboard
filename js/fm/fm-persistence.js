/**
 * fm-persistence.js — Session save/restore, auto-save, Supabase save
 */
;(function () {
  'use strict'

  var FM = window._FM

  FM._saveSession = function () {
    if (!FM._lead) return
    var id = FM._lead.id || FM._lead.lead_id || 'unknown'
    try {
      // Save current angle state first
      if (FM._saveAngleState) FM._saveAngleState()

      // Collect ANTES + DEPOIS URLs (all angles)
      var allUrls = {}
      Object.keys(FM._photoUrls).forEach(function (k) { allUrls['antes_' + k] = FM._photoUrls[k] })

      // Collect DEPOIS for ALL angles
      var afterAngles = FM._afterPhotoByAngle || {}
      if (FM._afterPhotoUrl && FM._activeAngle) {
        afterAngles[FM._activeAngle] = FM._afterPhotoUrl
      }
      Object.keys(afterAngles).forEach(function (ang) {
        if (afterAngles[ang]) allUrls['depois_' + ang] = afterAngles[ang]
      })

      var pending = Object.keys(allUrls).length
      if (pending === 0) { FM._saveSessionData(id); return }

      var photoData = {}
      var afterByAngle = {}
      var done = 0
      Object.keys(allUrls).forEach(function (key) {
        var img = new Image()
        img.onload = function () {
          var c = document.createElement('canvas')
          c.width = img.width; c.height = img.height
          c.getContext('2d').drawImage(img, 0, 0)
          var b64 = c.toDataURL('image/jpeg', 0.8)
          if (key.indexOf('depois_') === 0) {
            afterByAngle[key.replace('depois_', '')] = b64
          } else {
            photoData[key.replace('antes_', '')] = b64
          }
          done++
          if (done >= pending) FM._saveSessionData(id, photoData, afterByAngle)
        }
        img.onerror = function () { done++; if (done >= pending) FM._saveSessionData(id, photoData, afterByAngle) }
        img.src = allUrls[key]
      })
    } catch (e) { console.warn('[FaceMapping] Save session failed:', e) }
  }

  FM._saveSessionData = function (id, photoData, afterByAngle) {
    try {
      var photos = photoData || {}
      var afterPhotos = afterByAngle || {}
      var hasMetrics = FM._metricLines && (FM._metricLines.h.length > 0 || FM._metricLines.v.length > 0)
      var hasRegions = FM._regionState && Object.keys(FM._regionState).some(function (k) { return FM._regionState[k].active })
      var hasAnyData = Object.keys(photos).length > 0 || FM._annotations.length > 0 ||
                       Object.keys(afterPhotos).length > 0 || hasMetrics || hasRegions ||
                       (FM._stateByAngle && Object.keys(FM._stateByAngle).length > 0)
      if (!hasAnyData) {
        localStorage.removeItem('fm_session_' + id)
        localStorage.removeItem('fm_last_session')
        return
      }

      var session = {
        lead: { id: FM._lead.id || FM._lead.lead_id, nome: FM._lead.nome || FM._lead.name },
        activeAngle: FM._activeAngle,
        activeTab: FM._activeTab || 'zones',
        viewMode: FM._viewMode || '1x',
        annotations: FM._annotations,
        vectors: FM._vectors,
        // stateByAngle already saved by _saveSession caller
        stateByAngle: FM._stateByAngle || {},
        // Current angle's metric state (backward compat)
        tercoLines: FM._tercoLines,
        rickettsPoints: FM._rickettsPoints,
        metricLines: FM._metricLines,
        metricPoints: FM._metricPoints,
        metricMidline: FM._metricMidline,
        metricAngles: FM._metricAngles,
        locks: FM._locks || {},
        editorMode: FM._editorMode,
        analysisSubMode: FM._analysisSubMode,
        nextId: FM._nextId,
        nextVecId: FM._nextVecId,
        metricNextPointId: FM._metricNextPointId,
        metricNextLineId: FM._metricNextLineId,
        metric2Lines: FM._metric2Lines,
        metric2Points: FM._metric2Points,
        metric2Midline: FM._metric2Midline,
        metric2Angles: FM._metric2Angles,
        metric2NextPointId: FM._metric2NextPointId,
        metric2NextLineId: FM._metric2NextLineId,
        regionState: FM._regionState || {},
        lastAnalysis: FM._lastAnalysis || null,
        photos: photos,
        afterPhotos: afterPhotos,
        afterPhoto: afterPhotos['front'] || afterPhotos[Object.keys(afterPhotos)[0]] || null,  // backward compat
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem('fm_session_' + id, JSON.stringify(session))
      localStorage.setItem('fm_last_session', id)
    } catch (e) {
      console.warn('[FaceMapping] Storage full or error:', e)
      if (e.name === 'QuotaExceededError' || (e.message && e.message.indexOf('quota') !== -1)) {
        FM._showToast('Armazenamento local cheio. Limpe sessoes antigas.', 'warn')
      }
    }
  }

  FM._restoreSession = function (leadId) {
    try {
      var data = localStorage.getItem('fm_session_' + leadId)
      if (!data) return false
      var session = JSON.parse(data)

      FM._annotations = session.annotations || []
      FM._vectors = session.vectors || []
      FM._stateByAngle = session.stateByAngle || {}
      FM._tercoLines = session.tercoLines || FM._tercoLines
      FM._rickettsPoints = session.rickettsPoints || FM._rickettsPoints
      FM._metricLines = session.metricLines || { h: [], v: [] }
      FM._metricPoints = session.metricPoints || []
      FM._metricMidline = session.metricMidline || null
      FM._metricAngles = session.metricAngles || null
      FM._locks = session.locks || {}
      if (session.metricLocked && !session.locks) {
        FM._locks['simetria_1x_front'] = true
      }
      FM._metricNextPointId = session.metricNextPointId || 1
      FM._metricNextLineId = session.metricNextLineId || 1
      FM._metric2Lines = session.metric2Lines || { h: [], v: [] }
      FM._metric2Points = session.metric2Points || []
      FM._metric2Midline = session.metric2Midline || null
      FM._metric2Angles = session.metric2Angles || null
      FM._metric2NextPointId = session.metric2NextPointId || 1
      FM._metric2NextLineId = session.metric2NextLineId || 1
      FM._editorMode = session.editorMode || 'zones'
      FM._activeTab = session.activeTab || 'zones'
      FM._viewMode = session.viewMode || '1x'
      FM._analysisSubMode = session.analysisSubMode || 'metrics'
      FM._nextId = session.nextId || 1
      FM._nextVecId = session.nextVecId || 1
      FM._regionState = session.regionState || {}
      FM._lastAnalysis = session.lastAnalysis || null
      // Always start on 'front' if frontal photo exists, regardless of last saved angle
      FM._activeAngle = null  // will be set after photos restore

      // Restore ANTES photos
      var photos = session.photos || {}
      Object.keys(photos).forEach(function (angle) {
        if (photos[angle]) {
          var binary = atob(photos[angle].split(',')[1])
          var arr = new Uint8Array(binary.length)
          for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
          var blob = new Blob([arr], { type: 'image/jpeg' })
          FM._photoUrls[angle] = URL.createObjectURL(blob)
          FM._photos[angle] = blob
        }
      })

      // Restore DEPOIS photos (per angle)
      var afterPhotos = session.afterPhotos || {}
      // Migrate old single afterPhoto to 'front'
      if (!afterPhotos || Object.keys(afterPhotos).length === 0) {
        if (session.afterPhoto) afterPhotos = { front: session.afterPhoto }
      }
      Object.keys(afterPhotos).forEach(function (ang) {
        if (!afterPhotos[ang]) return
        try {
          var aBin = atob(afterPhotos[ang].split(',')[1])
          var aArr = new Uint8Array(aBin.length)
          for (var j = 0; j < aBin.length; j++) aArr[j] = aBin.charCodeAt(j)
          FM._afterPhotoByAngle[ang] = URL.createObjectURL(new Blob([aArr], { type: 'image/jpeg' }))
        } catch (e) { /* silent */ }
      })

      // Migrate old global state → always to 'front' (original primary view)
      if (!FM._stateByAngle || Object.keys(FM._stateByAngle).length === 0) {
        var hasData = (FM._metricLines.h.length > 0 || FM._metricLines.v.length > 0 ||
                       FM._metricPoints.length > 0 || Object.keys(FM._afterPhotoByAngle).length > 0)
        if (hasData) {
          FM._stateByAngle = {}
          FM._stateByAngle['front'] = {
            metricLines: FM._metricLines,
            metricPoints: FM._metricPoints,
            metricMidline: FM._metricMidline,
            metricAngles: FM._metricAngles,
            metricNextPointId: FM._metricNextPointId,
            metricNextLineId: FM._metricNextLineId,
            tercoLines: FM._tercoLines,
            rickettsPoints: FM._rickettsPoints,
            metric2Lines: FM._metric2Lines,
            metric2Points: FM._metric2Points,
            metric2Midline: FM._metric2Midline,
            metric2Angles: FM._metric2Angles,
            metric2NextPointId: FM._metric2NextPointId,
            metric2NextLineId: FM._metric2NextLineId,
          }
          if (FM._afterPhotoByAngle['front']) {
            // already set from afterPhotos restore above
          }
        }
      }
      // Set active angle: prefer 'front' if photo exists, else first available
      if (FM._photoUrls['front']) {
        FM._activeAngle = 'front'
      } else if (FM._photoUrls['45']) {
        FM._activeAngle = '45'
      } else if (FM._photoUrls['lateral']) {
        FM._activeAngle = 'lateral'
      } else {
        FM._activeAngle = session.activeAngle || null
      }

      // Restore the active angle's state
      if (FM._activeAngle && FM._restoreAngleState) {
        FM._restoreAngleState(FM._activeAngle)
      }

      console.log('[FaceMapping] Session restored:', Object.keys(FM._photoUrls).length, 'photos, angle:', FM._activeAngle)
      return true
    } catch (e) {
      console.warn('[FaceMapping] Restore failed:', e)
      return false
    }
  }

  FM._autoSave = function () {
    if (FM._saveTimer) clearTimeout(FM._saveTimer)
    FM._saveTimer = setTimeout(FM._saveSession, 500)
  }

  FM._clearSession = function () {
    if (!FM._lead) return
    var id = FM._lead.id || FM._lead.lead_id || 'unknown'
    try { localStorage.removeItem('fm_session_' + id) } catch (e) {}
    try { localStorage.removeItem('fm_last_session') } catch (e) {}
  }

  FM._saveToSupabase = function () {
    if (!FM._lead || !FM._lead.id) {
      alert('Nenhum paciente selecionado.')
      return
    }

    var data = {
      lead_id: FM._lead.id || FM._lead.lead_id,
      session_date: new Date().toISOString().split('T')[0],
      annotations: FM._annotations.map(function (a) {
        return {
          zone: a.zone, treatment: a.treatment, ml: a.ml,
          product: a.product, side: a.side, angle: a.angle, shape: a.shape,
        }
      }),
      totals: FM._calcTotals(),
    }

    try {
      var key = 'fm_sessions_' + (data.lead_id)
      var sessions = JSON.parse(localStorage.getItem(key) || '[]')
      sessions.push(data)
      localStorage.setItem(key, JSON.stringify(sessions))
    } catch (e) { /* ignore */ }

    if (window._sbShared) {
      var clinicId = null
      try { clinicId = JSON.parse(localStorage.getItem('clinicai_clinic_id') || 'null') } catch (e) {}
      window._sbShared.rpc('upsert_facial_session', {
        p_clinic_id: clinicId,
        p_lead_id: data.lead_id,
        p_session_data: data,
        p_gpt_analysis: FM._lastAnalysis || null,
      })
        .then(function (res) {
          if (res.error) {
            console.error('[FaceMapping] Save error:', res.error)
            FM._showToast('Erro ao salvar no banco: ' + (res.error.message || ''), 'error')
          } else {
            console.log('[FaceMapping] Saved to Supabase')
            FM._showToast('Sessao salva com sucesso', 'success')
          }
        })
        .catch(function (err) {
          console.error('[FaceMapping] Save failed:', err)
          FM._showToast('Falha ao salvar: ' + (err.message || ''), 'error')
        })
    }

    var btn = document.querySelector('.fm-btn-primary')
    if (btn) {
      var orig = btn.innerHTML
      btn.innerHTML = FM._icon('check', 14) + ' Salvo!'
      btn.style.background = '#10B981'
      btn.style.borderColor = '#10B981'
      setTimeout(function () {
        btn.innerHTML = orig
        btn.style.background = ''
        btn.style.borderColor = ''
      }, 2000)
    }
  }

})()
