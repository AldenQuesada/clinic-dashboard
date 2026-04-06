/**
 * fm-main.js — Public API (window.FaceMapping), wires everything together
 * Must be loaded LAST after all fm-*.js modules
 */
;(function () {
  'use strict'

  if (window._fmLoaded) return
  window._fmLoaded = true

  var FM = window._FM

  window.FaceMapping = {
    init: FM.init,
    openFromModal: FM.openFromModal,

    _restorePage: FM._restorePage,
    _selectAngle: FM._selectAngle,
    _selectZone: FM._selectZone,
    _onTreatmentChange: FM._onTreatmentChange,
    _triggerUpload: FM._triggerUpload,
    _removeAnnotation: FM._removeAnnotation,
    _clearAll: FM._clearAll,
    _exportReport: FM._exportReport,
    _downloadReport: FM._downloadReport,
    _closeExport: FM._closeExport,
    _saveToSupabase: FM._saveToSupabase,
    _recrop: FM._recrop,
    _deletePhoto: FM._deletePhoto,
    _editRanges: FM._editRanges,
    _setEditorMode: FM._setEditorMode,
    _setCanvasZoom: FM._setCanvasZoom,
    _zoomCanvas: FM._zoomCanvas,
    _toggleFullscreen: FM._toggleFullscreen,
    _triggerUploadExtra: FM._triggerUploadExtra,
    _deleteExtraPhoto: FM._deleteExtraPhoto,
    _regenSim: function () {
      FM._simPhotoUrl = null
      FM._generateSimulation(function () { FM._render(); if (FM._activeAngle) setTimeout(FM._initCanvas, 50) })
    },

    get _selectedMl() { return FM._selectedMl },
    set _selectedMl(v) { FM._selectedMl = v },
    get _selectedSide() { return FM._selectedSide },
    set _selectedSide(v) { FM._selectedSide = v },
    get _selectedProduct() { return FM._selectedProduct },
    set _selectedProduct(v) { FM._selectedProduct = v },
  }

})()
