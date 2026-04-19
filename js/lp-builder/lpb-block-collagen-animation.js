/**
 * LP Builder · Block Render: collagen-animation (Onda 29)
 *
 * Animação SVG de seção transversal da pele em 3 estágios:
 *   stage="0"  · Hoje      · fibras frouxas, opacidade 50%
 *   stage="30" · 30 dias   · fibras se reorganizando, opacidade 75%
 *   stage="60" · 60 dias   · fibras firmes paralelas, opacidade 100%
 *
 * O loop (3s/stage · pause hover · IntersectionObserver) vive em
 * lpb-collagen-runtime.js. Esse renderer é PURO (string HTML).
 *
 *   LPBBlockCollagenAnimation.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockCollagenAnimation) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function _has(v) { return v != null && String(v).trim().length > 0 }

  // SVG fixo da seção transversal · 3 camadas + grupos de fibras animáveis
  // Os grupos .blk-collagen-fibers-* recebem opacity/transform via CSS data-stage
  function _svg() {
    return ''
      + '<svg class="blk-collagen-svg" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'
      // defs · padrões pontilhados (epiderme) e gradientes
      + '<defs>'
      +   '<pattern id="blkCollagenDots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">'
      +     '<circle cx="7" cy="7" r="1.1" fill="#C8A97E" opacity="0.22"/>'
      +   '</pattern>'
      +   '<linearGradient id="blkCollagenEpi" x1="0" y1="0" x2="0" y2="1">'
      +     '<stop offset="0%" stop-color="#FEFCF8"/>'
      +     '<stop offset="100%" stop-color="#F6EFE3"/>'
      +   '</linearGradient>'
      +   '<linearGradient id="blkCollagenDerm" x1="0" y1="0" x2="0" y2="1">'
      +     '<stop offset="0%" stop-color="#F1DFD0"/>'
      +     '<stop offset="100%" stop-color="#E6CDB6"/>'
      +   '</linearGradient>'
      +   '<linearGradient id="blkCollagenColl" x1="0" y1="0" x2="0" y2="1">'
      +     '<stop offset="0%" stop-color="#D4B891"/>'
      +     '<stop offset="100%" stop-color="#B8946A"/>'
      +   '</linearGradient>'
      +   '<linearGradient id="blkCollagenShine" x1="0" y1="0" x2="1" y2="0">'
      +     '<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0"/>'
      +     '<stop offset="50%" stop-color="#FFFFFF" stop-opacity="0.35"/>'
      +     '<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>'
      +   '</linearGradient>'
      + '</defs>'

      // Camada 1 · epiderme (0-90)
      + '<rect x="0" y="0" width="600" height="90" fill="url(#blkCollagenEpi)"/>'
      + '<rect x="0" y="0" width="600" height="90" fill="url(#blkCollagenDots)"/>'
      + '<text x="20" y="32" class="blk-collagen-label" font-family="Montserrat, sans-serif" font-size="11" letter-spacing="2" fill="#8A7355" opacity="0.7">EPIDERME</text>'

      // Camada 2 · derme (90-220)
      + '<rect x="0" y="90" width="600" height="130" fill="url(#blkCollagenDerm)"/>'
      + '<text x="20" y="118" class="blk-collagen-label" font-family="Montserrat, sans-serif" font-size="11" letter-spacing="2" fill="#7A5C3F" opacity="0.7">DERME</text>'

      // Camada 3 · matriz de colágeno (220-400)
      + '<rect x="0" y="220" width="600" height="180" fill="url(#blkCollagenColl)"/>'
      + '<text x="20" y="248" class="blk-collagen-label" font-family="Montserrat, sans-serif" font-size="11" letter-spacing="2" fill="#FEFCF8" opacity="0.85">MATRIZ DE COLÁGENO</text>'

      // Brilho champagne (visível só no stage 60)
      + '<rect class="blk-collagen-shine" x="0" y="220" width="600" height="180" fill="url(#blkCollagenShine)"/>'

      // ── Grupo de fibras · estado FROUXO (stage 0)
      + '<g class="blk-collagen-fibers blk-collagen-fibers-loose">'
      +   '<path d="M 30 280 Q 120 250 220 295 T 420 285 T 580 300" stroke="#FEFCF8" stroke-width="1.4" fill="none" stroke-linecap="round"/>'
      +   '<path d="M 50 320 Q 160 290 280 340 T 520 315" stroke="#FEFCF8" stroke-width="1.2" fill="none" stroke-linecap="round"/>'
      +   '<path d="M 20 360 Q 140 335 260 370 T 500 360 T 590 350" stroke="#FEFCF8" stroke-width="1.3" fill="none" stroke-linecap="round"/>'
      +   '<path d="M 80 250 Q 180 235 300 270 T 540 255" stroke="#FEFCF8" stroke-width="1.1" fill="none" stroke-linecap="round"/>'
      + '</g>'

      // ── Grupo de fibras · estado REORGANIZANDO (stage 30)
      + '<g class="blk-collagen-fibers blk-collagen-fibers-mid">'
      +   '<path d="M 20 260 Q 150 250 300 265 T 580 260" stroke="#FEFCF8" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
      +   '<path d="M 20 290 Q 150 282 300 295 T 580 290" stroke="#FEFCF8" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
      +   '<path d="M 20 320 Q 150 312 300 325 T 580 320" stroke="#FEFCF8" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
      +   '<path d="M 20 350 Q 150 342 300 355 T 580 350" stroke="#FEFCF8" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
      +   '<path d="M 20 380 Q 150 374 300 384 T 580 380" stroke="#FEFCF8" stroke-width="1.3" fill="none" stroke-linecap="round"/>'
      + '</g>'

      // ── Grupo de fibras · estado FIRME (stage 60) · paralelas alinhadas
      + '<g class="blk-collagen-fibers blk-collagen-fibers-firm">'
      +   '<line x1="20" y1="255" x2="580" y2="255" stroke="#FEFCF8" stroke-width="1.6" stroke-linecap="round"/>'
      +   '<line x1="20" y1="280" x2="580" y2="280" stroke="#FEFCF8" stroke-width="1.6" stroke-linecap="round"/>'
      +   '<line x1="20" y1="305" x2="580" y2="305" stroke="#FEFCF8" stroke-width="1.6" stroke-linecap="round"/>'
      +   '<line x1="20" y1="330" x2="580" y2="330" stroke="#FEFCF8" stroke-width="1.6" stroke-linecap="round"/>'
      +   '<line x1="20" y1="355" x2="580" y2="355" stroke="#FEFCF8" stroke-width="1.6" stroke-linecap="round"/>'
      +   '<line x1="20" y1="380" x2="580" y2="380" stroke="#FEFCF8" stroke-width="1.4" stroke-linecap="round"/>'
      + '</g>'

      + '</svg>'
  }

  function render(block) {
    var p = (block && block.props) || {}
    var bg      = p.bg || 'ivory'
    var eyebrow = _has(p.eyebrow)  ? p.eyebrow  : ''
    var head    = _has(p.headline) ? p.headline : ''
    var lead    = _has(p.lead)     ? p.lead     : ''
    var ctaLbl  = _has(p.cta_label)? p.cta_label: ''
    var ctaUrl  = _has(p.cta_url)  ? p.cta_url  : '#'

    var html = ''
      + '<section class="blk-collagen" data-bg="' + _esc(bg) + '" data-collagen-root data-stage="0">'
      +   '<div class="blk-collagen-wrap">'
      +     (eyebrow ? '<div class="blk-collagen-eyebrow">' + _esc(eyebrow) + '</div>' : '')
      +     (head    ? '<h2 class="blk-collagen-head">'    + _esc(head)    + '</h2>'   : '')
      +     (lead    ? '<p class="blk-collagen-lead">'     + _esc(lead)    + '</p>'    : '')
      +     '<div class="blk-collagen-stage">'
      +       _svg()
      +     '</div>'
      +     '<div class="blk-collagen-readout" aria-live="polite">'
      +       '<div class="blk-collagen-marker">'
      +         '<span class="blk-collagen-marker-dot" data-marker="0"></span>'
      +         '<span class="blk-collagen-marker-dot" data-marker="30"></span>'
      +         '<span class="blk-collagen-marker-dot" data-marker="60"></span>'
      +       '</div>'
      +       '<div class="blk-collagen-stagelabel" data-stage-label>Hoje</div>'
      +       '<div class="blk-collagen-stagesub"   data-stage-sub>Pele com sinais de tempo · colágeno disperso</div>'
      +     '</div>'
      +     (ctaLbl
        ? '<a class="blk-collagen-cta" href="' + _esc(ctaUrl) + '" data-collagen-cta'
          + (/^https?:\/\//.test(ctaUrl) ? ' target="_blank" rel="noopener"' : '')
          + '>' + _esc(ctaLbl) + '</a>'
        : '')
      +   '</div>'
      + '</section>'

    return html
  }

  window.LPBBlockCollagenAnimation = Object.freeze({ render: render })
})()
