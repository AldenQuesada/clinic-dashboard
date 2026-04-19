/**
 * LP Builder · WCAG Contrast Engine (Onda 22)
 *
 * Núcleo PURO. Cálculos de contraste WCAG 2.1 AA/AAA.
 * Sem DOM, sem fetch, sem efeitos colaterais.
 *
 * Reusável fora do builder (face-mapping, magazine, dashboard).
 *
 * API:
 *   parseColor('#abc') → { r, g, b }
 *   relativeLuminance(rgb) → 0..1
 *   contrastRatio(c1, c2) → 1..21
 *   wcagLevel(ratio, isLargeText) → 'AAA' | 'AA' | 'A' | 'fail'
 *   suggestFix(fg, bg, targetRatio) → { fg, ratio } melhor sugestão
 *
 * Independente — testável isolado:
 *   LPBA11yContrast.contrastRatio('#fff', '#000') === 21
 */
;(function () {
  'use strict'
  if (window.LPBA11yContrast) return

  // ──────────────────────────────────────────────────────────
  // Parser de cor (suporta hex 3/6/8 + rgb/rgba)
  // ──────────────────────────────────────────────────────────
  function parseColor(input) {
    if (!input) return null
    var s = String(input).trim().toLowerCase()
    if (s.charAt(0) === '#') return _parseHex(s)
    if (s.indexOf('rgb') === 0) return _parseRgb(s)
    return null
  }

  function _parseHex(hex) {
    var h = hex.slice(1)
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    }
    if (h.length !== 6 && h.length !== 8) return null
    var r = parseInt(h.slice(0, 2), 16)
    var g = parseInt(h.slice(2, 4), 16)
    var b = parseInt(h.slice(4, 6), 16)
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null
    return { r: r, g: g, b: b }
  }

  function _parseRgb(s) {
    var m = s.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/)
    if (!m) return null
    return { r: +m[1], g: +m[2], b: +m[3] }
  }

  // ──────────────────────────────────────────────────────────
  // Luminância relativa (WCAG)
  // ──────────────────────────────────────────────────────────
  function _channel(c) {
    var s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }

  function relativeLuminance(rgb) {
    if (!rgb) return 0
    return 0.2126 * _channel(rgb.r) + 0.7152 * _channel(rgb.g) + 0.0722 * _channel(rgb.b)
  }

  // ──────────────────────────────────────────────────────────
  // Contraste (1 a 21)
  // ──────────────────────────────────────────────────────────
  function contrastRatio(c1, c2) {
    var rgb1 = typeof c1 === 'string' ? parseColor(c1) : c1
    var rgb2 = typeof c2 === 'string' ? parseColor(c2) : c2
    if (!rgb1 || !rgb2) return 0
    var l1 = relativeLuminance(rgb1)
    var l2 = relativeLuminance(rgb2)
    var lighter = Math.max(l1, l2)
    var darker  = Math.min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)
  }

  // ──────────────────────────────────────────────────────────
  // Nível WCAG
  // ──────────────────────────────────────────────────────────
  function wcagLevel(ratio, isLargeText) {
    var aa  = isLargeText ? 3.0 : 4.5
    var aaa = isLargeText ? 4.5 : 7.0
    if (ratio >= aaa) return 'AAA'
    if (ratio >= aa)  return 'AA'
    if (ratio >= 3.0) return 'A'
    return 'fail'
  }

  // ──────────────────────────────────────────────────────────
  // Sugestão de cor: ajusta luminosidade do FG até bater target
  // ──────────────────────────────────────────────────────────
  function suggestFix(fgInput, bgInput, targetRatio) {
    var fg = parseColor(fgInput), bg = parseColor(bgInput)
    if (!fg || !bg) return null
    var target = targetRatio || 4.5
    var bgLum = relativeLuminance(bg)
    // tenta escurecer FG, depois clarear
    var attempts = [
      { delta: -10 }, { delta: -25 }, { delta: -50 }, { delta: -75 },
      { delta: +10 }, { delta: +25 }, { delta: +50 }, { delta: +75 },
    ]
    var best = { ratio: contrastRatio(fg, bg), color: _toHex(fg) }
    for (var i = 0; i < attempts.length; i++) {
      var d = attempts[i].delta
      var f = { r: _clamp(fg.r + d), g: _clamp(fg.g + d), b: _clamp(fg.b + d) }
      var r = contrastRatio(f, bg)
      if (r >= target) return { fg: _toHex(f), ratio: r }
      if (r > best.ratio) best = { ratio: r, color: _toHex(f) }
    }
    // fallback: branco ou preto
    var w = contrastRatio({ r: 255, g: 255, b: 255 }, bg)
    var k = contrastRatio({ r: 0,   g: 0,   b: 0   }, bg)
    return w > k
      ? { fg: '#FFFFFF', ratio: w }
      : { fg: '#000000', ratio: k }
  }

  function _clamp(n) { return Math.max(0, Math.min(255, Math.round(n))) }
  function _toHex(rgb) {
    function p(n) { var s = n.toString(16); return s.length === 1 ? '0' + s : s }
    return ('#' + p(rgb.r) + p(rgb.g) + p(rgb.b)).toUpperCase()
  }

  window.LPBA11yContrast = Object.freeze({
    parseColor:        parseColor,
    relativeLuminance: relativeLuminance,
    contrastRatio:     contrastRatio,
    wcagLevel:         wcagLevel,
    suggestFix:        suggestFix,
  })
})()
