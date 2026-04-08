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
    _switchTab: FM._switchTab,
    _setViewMode: FM._setViewMode,
    _uploadAfterPhoto: FM._uploadAfterPhoto,
    _initCanvas2: FM._initCanvas2,
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

    _undo: FM._undo,
    _redo: FM._redo,
    _autoAnalyze: FM._autoAnalyze,
    _printReport: FM._printReport,
    _showHistory: FM._showHistory,
    _showNoteEditor: FM._showNoteEditor,
    _saveNote: FM._saveNote,
    _shareReport: FM._shareReport,
    _showTemplates: FM._showTemplates,
    _applyTemplate: FM._applyTemplate,
    _autoDetectZones: FM._autoDetectZones,
    _generateVectorsFromAnnotations: FM._generateVectorsFromAnnotations,
    _openBeforeAfter: FM._openBeforeAfter,
    _closeBeforeAfter: FM._closeBeforeAfter,
    _uploadBA: FM._uploadBA,
    _scanBeforeAfter: FM._scanBeforeAfter,
    _openCompare: FM._openCompare,
    _closeCompare: FM._closeCompare,
    _exportCompare: FM._exportCompare,

    // Skin analysis + heatmaps
    _runSkinAnalysis: FM._runSkinAnalysis,
    _runCollagenScore: FM._runCollagenScore,
    _runProtocol: FM._runProtocol,
    _loadHeatmaps: FM._loadHeatmaps,
    _toggleHeatmap: FM._toggleHeatmap,

    // 3D view
    _toggle3DView: FM._toggle3DView,
    _toggleWireframe: FM._toggleWireframe,

    // Metrification
    _toggleMetricLock: FM._toggleMetricLock,
    _toggleMetric2Lock: FM._toggleMetric2Lock,
    _setMetricTool: FM._setMetricTool,
    _autoMetricLines: FM._autoMetricLines,
    _clearMetricLines: FM._clearMetricLines,
    _removeLastMetric: FM._removeLastMetric,
    _deleteMetricLine: FM._deleteMetricLine,
    _deleteMetricPoint: FM._deleteMetricPoint,
    _deleteMetric2Line: FM._deleteMetric2Line,
    _deleteMetric2Point: FM._deleteMetric2Point,
    _autoAngles: FM._autoAngles,
    _autoAsymmetryPairs: FM._autoAsymmetryPairs,

    // Sub-mode access
    get _analysisSubMode() { return FM._analysisSubMode },
    set _analysisSubMode(v) { FM._analysisSubMode = v },
    _refreshToolbar: FM._refreshToolbar,
    _redraw: FM._redraw,
    _initCanvas: FM._initCanvas,
    _render: FM._render,

    get _selectedMl() { return FM._selectedMl },
    set _selectedMl(v) { FM._selectedMl = v },
    get _selectedSide() { return FM._selectedSide },
    set _selectedSide(v) { FM._selectedSide = v },
    get _selectedProduct() { return FM._selectedProduct },
    set _selectedProduct(v) { FM._selectedProduct = v },
  }

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo
  document.addEventListener('keydown', function (e) {
    // Only when facial analysis page is active
    var page = document.getElementById('page-facial-analysis')
    if (!page || !page.classList.contains('active')) return

    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        FM._undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        FM._redo()
      }
    }
  })

})()
