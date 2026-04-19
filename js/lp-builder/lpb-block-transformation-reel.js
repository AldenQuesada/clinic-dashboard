/**
 * LP Builder · Block Render: transformation-reel (Onda 29)
 *
 * Vídeo curto autoplay sem som (estilo Reels) · 9:16 / 1:1 / 16:9.
 * Mute toggle no canto inferior direito. CTA flutuante embaixo.
 * Eyebrow + headline opcional sobreposto top-left.
 *
 * Lógica de pause-on-scroll-out + autoplay fallback vive em lpb-reel-runtime.js.
 *
 *   LPBBlockTransformationReel.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockTransformationReel) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }
  function _has(v) { return v != null && String(v).trim().length > 0 }

  // Feather "play-circle" (placeholder se sem vídeo)
  var PLAY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>'

  // Feather "volume-x" (mutado)
  var VOL_X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
    '<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'

  // Feather "volume-2" (com som)
  var VOL_ON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
    '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'

  // Play overlay (quando autoplay falha)
  var PLAY_BIG_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M8 5v14l11-7z"/></svg>'

  function _aspectClass(aspect) {
    if (aspect === '16/9') return 'blk-reel--landscape'
    if (aspect === '1/1')  return 'blk-reel--square'
    return 'blk-reel--story' // 9/16 default
  }

  function render(block) {
    var p = (block && block.props) || {}
    var videoUrl = _has(p.video_url) ? p.video_url : ''
    var eyebrow  = _has(p.eyebrow)   ? p.eyebrow   : ''
    var headline = _has(p.headline)  ? p.headline  : ''
    var ctaLbl   = _has(p.cta_label) ? p.cta_label : ''
    var ctaUrl   = _has(p.cta_url)   ? p.cta_url   : '#'
    var aspect   = (p.aspect && /^(9\/16|1\/1|16\/9)$/.test(p.aspect)) ? p.aspect : '9/16'
    var autoplay = (p.autoplay === 'no') ? 'no' : 'yes'
    var aspectCls = _aspectClass(aspect)

    var external = /^https?:\/\//.test(ctaUrl)

    var html = ''
      + '<section class="blk-reel ' + aspectCls + '"'
      +   ' data-reel-root'
      +   ' data-aspect="' + _esc(aspect) + '"'
      +   ' data-autoplay="' + _esc(autoplay) + '">'
      + '<div class="blk-reel-frame">'

    if (videoUrl) {
      var attrs = ' playsinline muted preload="metadata" loop'
      if (autoplay === 'yes') attrs += ' autoplay'
      html += '<video class="blk-reel-video" src="' + _esc(videoUrl) + '" data-reel-video' + attrs + '></video>'
    } else {
      html += '<div class="blk-reel-placeholder" aria-hidden="true">' +
        '<div class="blk-reel-placeholder-icon">' + PLAY_SVG + '</div>' +
        '<div class="blk-reel-placeholder-text">Vídeo de transformação</div>' +
        '</div>'
    }

    // Top-left overlay (eyebrow + headline)
    if (eyebrow || headline) {
      html += '<div class="blk-reel-top">'
      if (eyebrow)  html += '<div class="blk-reel-eyebrow">' + _esc(eyebrow)  + '</div>'
      if (headline) html += '<h3 class="blk-reel-head">'    + _esc(headline) + '</h3>'
      html += '</div>'
    }

    // Bottom CTA + gradient
    if (ctaLbl) {
      html += '<div class="blk-reel-bottom">'
        + '<a class="blk-reel-cta" href="' + _esc(ctaUrl) + '" data-reel-cta'
        + (external ? ' target="_blank" rel="noopener"' : '') + '>'
        + '<span>' + _esc(ctaLbl) + '</span>'
        + '</a>'
        + '</div>'
    }

    // Mute toggle (canto inferior direito · só se tem vídeo)
    if (videoUrl) {
      html += '<button type="button" class="blk-reel-mute" data-reel-mute aria-label="Ativar som" aria-pressed="false">'
        + '<span class="blk-reel-mute-on" aria-hidden="true">' + VOL_X_SVG + '</span>'
        + '<span class="blk-reel-mute-off" aria-hidden="true">' + VOL_ON_SVG + '</span>'
        + '</button>'

      // Play overlay (escondido por default · revelado se autoplay falhar)
      html += '<button type="button" class="blk-reel-play" data-reel-play aria-label="Tocar vídeo" hidden>'
        + PLAY_BIG_SVG + '</button>'
    }

    html += '</div></section>'
    return html
  }

  window.LPBBlockTransformationReel = Object.freeze({ render: render })
})()
