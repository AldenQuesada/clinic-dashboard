/**
 * ClinicAI - Case Gallery Service
 *
 * Camada de dados para case_gallery (banco de antes/depois reutilizavel
 * em reports e materiais de venda).
 *
 * Expoe window.CaseGalleryService:
 *   list(filters)          -> Promise<Array> (so ativos)
 *   create(payload)        -> Promise<id>
 *   update(id, patch)      -> Promise<bool>
 *   remove(id)             -> Promise<{before_path, after_path}>
 *   uploadPhoto(blob, key) -> Promise<storagePath>
 *   signedUrl(path)        -> Promise<string>
 *   deleteStorageObjects(paths) -> Promise<void>
 *
 * Graceful: se Supabase offline, retorna [] em list; mutacoes lancam.
 */
;(function () {
  'use strict'
  if (window._caseGalleryServiceLoaded) return
  window._caseGalleryServiceLoaded = true

  var BUCKET = 'case-gallery'
  var SIGNED_TTL_SEC = 3600  // 1h — admin UI nao precisa rotacao agressiva

  function _sb() { return window._sbShared || window.supabaseClient || null }

  function _list(filters) {
    var sb = _sb()
    if (!sb) return Promise.resolve([])
    filters = filters || {}
    return sb.rpc('case_gallery_list', {
      p_focus_area: filters.focusArea || null,
      p_age_min:    filters.ageMin    != null ? filters.ageMin : null,
      p_age_max:    filters.ageMax    != null ? filters.ageMax : null,
    }).then(function (res) {
      if (res.error) { console.warn('[CaseGallery] list:', res.error); return [] }
      return Array.isArray(res.data) ? res.data : []
    }).catch(function () { return [] })
  }

  function _create(p) {
    var sb = _sb()
    if (!sb) return Promise.reject(new Error('Supabase indisponivel'))
    return sb.rpc('case_gallery_create', {
      p_patient_initials:  p.patientInitials,
      p_patient_age:       p.patientAge,
      p_patient_gender:    p.patientGender || 'F',
      p_focus_area:        p.focusArea,
      p_focus_label:       p.focusLabel,
      p_tags:              p.tags || [],
      p_photo_before_path: p.photoBeforePath,
      p_photo_after_path:  p.photoAfterPath,
      p_months_since:      p.monthsSince,
      p_summary:           p.summary || null,
      p_consent_text:      p.consentText,
    }).then(function (res) {
      if (res.error) throw res.error
      return res.data
    })
  }

  function _update(id, patch) {
    var sb = _sb()
    if (!sb) return Promise.reject(new Error('Supabase indisponivel'))
    return sb.rpc('case_gallery_update', {
      p_id:               id,
      p_patient_initials: patch.patientInitials != null ? patch.patientInitials : null,
      p_patient_age:      patch.patientAge      != null ? patch.patientAge : null,
      p_focus_area:       patch.focusArea       != null ? patch.focusArea : null,
      p_focus_label:      patch.focusLabel      != null ? patch.focusLabel : null,
      p_tags:             patch.tags            != null ? patch.tags : null,
      p_months_since:     patch.monthsSince     != null ? patch.monthsSince : null,
      p_summary:          patch.summary         != null ? patch.summary : null,
      p_is_active:        patch.isActive        != null ? patch.isActive : null,
    }).then(function (res) { if (res.error) throw res.error; return !!res.data })
  }

  function _remove(id) {
    var sb = _sb()
    if (!sb) return Promise.reject(new Error('Supabase indisponivel'))
    return sb.rpc('case_gallery_delete', { p_id: id }).then(function (res) {
      if (res.error) throw res.error
      return res.data
    })
  }

  function _uploadPhoto(blob, storagePath) {
    var sb = _sb()
    if (!sb) return Promise.reject(new Error('Supabase indisponivel'))
    return sb.storage.from(BUCKET).upload(storagePath, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: false,
    }).then(function (res) {
      if (res.error) throw res.error
      return storagePath
    })
  }

  function _signedUrl(storagePath) {
    var sb = _sb()
    if (!sb || !storagePath) return Promise.resolve(null)
    return sb.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_TTL_SEC)
      .then(function (res) {
        if (res.error) { console.warn('[CaseGallery] signedUrl:', res.error); return null }
        return res.data && res.data.signedUrl
      })
  }

  function _deleteObjects(paths) {
    var sb = _sb()
    var clean = (paths || []).filter(Boolean)
    if (!sb || !clean.length) return Promise.resolve()
    return sb.storage.from(BUCKET).remove(clean).then(function (res) {
      if (res.error) console.warn('[CaseGallery] delete storage:', res.error)
    })
  }

  window.CaseGalleryService = {
    BUCKET: BUCKET,
    list: _list,
    create: _create,
    update: _update,
    remove: _remove,
    uploadPhoto: _uploadPhoto,
    signedUrl: _signedUrl,
    deleteStorageObjects: _deleteObjects,
  }
})()
