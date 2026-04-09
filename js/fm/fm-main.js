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
    _selectAnnotation: function (id) {
      FM._selAnn = FM._annotations.find(function (a) { return a.id === id }) || null
      FM._redraw()
      FM._refreshToolbar()
    },
    _clearAll: FM._clearAll,
    _exportReport: FM._exportReport,
    _exportReportHTML: FM._exportReportHTML,
    _presentReport: FM._presentReport,
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
    _deleteAfterPhoto: FM._deleteAfterPhoto,
    _setVecAge: FM._setVecAge,
    _deleteExtraPhoto: FM._deleteExtraPhoto,
    _regenSim: function () {
      FM._simPhotoUrl = null
      FM._generateSimulation(function () { FM._render(); if (FM._activeAngle) setTimeout(FM._initCanvas, 50) })
    },
    _generateHybrid: FM._generateHybrid,

    _mirrorPolygon: FM._mirrorPolygon,
    _setGuideTool: function (tool) {
      FM._guideTool = (FM._guideTool === tool) ? null : tool
      FM._selectedZone = null
      if (FM._polyDrawing) FM._cancelPoly()
      FM._render()
      setTimeout(FM._initCanvas, 50)
    },
    _toggleGuideLock: function () {
      FM._guideLocked = !FM._guideLocked
      FM._guideTool = null
      FM._render()
      setTimeout(FM._initCanvas, 50)
    },
    _clearGuides: function () {
      FM._guideLines = { h: [], v: [] }
      FM._redraw()
      FM._render()
      setTimeout(FM._initCanvas, 50)
    },
    _undo: FM._undo,
    _redo: FM._redo,
    _autoAnalyze: FM._autoAnalyze,
    _toggleScan: FM._toggleScan,
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
    _compareUpload: FM._compareUpload,
    _compareFromUrl: FM._compareFromUrl,
    _exportCompare: FM._exportCompare,
    _compareToggleAutoTimer: FM._compareToggleAutoTimer,
    _compareSwitchAngle: FM._compareSwitchAngle,
    _compareToggleAnnotations: FM._compareToggleAnnotations,
    _compareToggleMetrics: FM._compareToggleMetrics,
    _compareExportGif: FM._compareExportGif,
    _compareClearAnnotations: FM._compareClearAnnotations,
    _compareZoomToZone: FM._compareZoomToZone,

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

    // Region overlay engine
    _toggleRegion: FM._toggleRegion,
    _selectRegion: FM._selectRegion,
    _setRegionIntensity: FM._setRegionIntensity,
    _setRegionTreatment: FM._setRegionTreatment,
    _activateAllRegions: FM._activateAllRegions,
    _deactivateAllRegions: FM._deactivateAllRegions,
    _toggleRegionLabels: FM._toggleRegionLabels,
    _toggleRegionLock: FM._toggleRegionLock,
    _setRegionTransform: FM._setRegionTransform,
    _resetRegionTransform: FM._resetRegionTransform,

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

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo, Enter/Escape/Delete for polygons
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
      return
    }

    // Polygon keyboard shortcuts (zones mode only)
    if (FM._editorMode === 'zones') {
      if (e.key === 'Enter' && FM._polyDrawing && FM._polyPoints && FM._polyPoints.length >= 3) {
        e.preventDefault()
        FM._closePolygon()
      } else if (e.key === 'Escape' && FM._polyDrawing) {
        e.preventDefault()
        FM._cancelPoly()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && FM._polyDrawing && FM._polyPoints) {
        // Undo last point while drawing
        e.preventDefault()
        if (FM._polyPoints.length > 1) {
          FM._polyPoints.pop()
          FM._redraw()
        } else {
          FM._cancelPoly()
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && FM._selAnn && !FM._polyDrawing) {
        e.preventDefault()
        FM._removeAnnotation(FM._selAnn.id)
        FM._selAnn = null
      }
    }
  })

})()
