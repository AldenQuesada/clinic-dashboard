/**
 * LP Builder · Heatmap Engine (Onda 25)
 *
 * Núcleo PURO. Sem DOM, sem fetch.
 *   · normalizeClick(event, container) → { x_pct, y_pct, block_idx }
 *   · computeMaxScrollPct(scrollY, viewportH, docH) → 0..100
 *   · gridDensity(clicks, gridSize) → matrix [row][col] = count
 *   · sampleDecision(rate) → bool
 */
;(function () {
  'use strict'
  if (window.LPBHeatmapEngine) return

  function normalizeClick(ev, container) {
    if (!ev) return null
    var rect = container ? container.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: 1 }
    var docH = container ? container.offsetHeight : (document.body.offsetHeight || 1)
    var x = ev.clientX - rect.left
    var y = (ev.clientY - rect.top) + (window.scrollY || 0) - (rect.top + (window.scrollY || 0) - rect.top)
    // y absoluto na pagina
    var yAbs = (ev.pageY != null) ? ev.pageY : (ev.clientY + (window.scrollY || 0))
    var x_pct = Math.max(0, Math.min(100, (ev.clientX / Math.max(1, window.innerWidth)) * 100))
    var y_pct = Math.max(0, Math.min(100, (yAbs / Math.max(1, docH)) * 100))
    var blockIdx = null
    var blockEl = ev.target && ev.target.closest && ev.target.closest('[data-block-idx]')
    if (blockEl) blockIdx = parseInt(blockEl.dataset.blockIdx, 10)
    return {
      x_pct: Math.round(x_pct * 100) / 100,
      y_pct: Math.round(y_pct * 100) / 100,
      block_idx: isNaN(blockIdx) ? null : blockIdx,
    }
  }

  function computeMaxScrollPct(scrollY, viewportH, docH) {
    var max = Math.max(0, (docH || 1) - (viewportH || 0))
    if (max <= 0) return 100
    return Math.max(0, Math.min(100, ((scrollY || 0) / max) * 100))
  }

  // Matriz de densidade (gridSize x gridSize) pra renderizar heatmap
  function gridDensity(clicks, gridSize) {
    var size = gridSize || 20
    var grid = []
    for (var i = 0; i < size; i++) {
      grid.push(new Array(size).fill(0))
    }
    ;(clicks || []).forEach(function (c) {
      var row = Math.min(size - 1, Math.max(0, Math.floor((c.y_pct / 100) * size)))
      var col = Math.min(size - 1, Math.max(0, Math.floor((c.x_pct / 100) * size)))
      grid[row][col]++
    })
    return grid
  }

  // Sampling: 1/N visitantes envia (reduz custo)
  function sampleDecision(oneIn) {
    var n = Math.max(1, oneIn || 3)
    return Math.random() < (1 / n)
  }

  window.LPBHeatmapEngine = Object.freeze({
    normalizeClick:      normalizeClick,
    computeMaxScrollPct: computeMaxScrollPct,
    gridDensity:         gridDensity,
    sampleDecision:      sampleDecision,
  })
})()
