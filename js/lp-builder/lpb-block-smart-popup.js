/**
 * LP Builder · Block Render: smart-popup (Onda 29)
 *
 * Modal lateral / centro / bottom · temporizado · cooldown 24h por visitor.
 * Renderer PURO (string HTML). Lógica de gatilho vive em lpb-smart-popup-runtime.js.
 *
 * Variantes:
 *   side    · slide-in lateral direita (default · não-bloqueante)
 *   center  · modal centro com overlay (bloqueante)
 *   bottom  · sticky bottom slide-up
 *
 *   LPBBlockSmartPopup.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockSmartPopup) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }
  function _has(v) { return v != null && String(v).trim().length > 0 }

  // SVG fechar (Feather "x")
  var X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'

  function _slugify(s) {
    return String(s || 'popup')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'popup'
  }

  function _isVideo(url) {
    if (!url) return false
    return /\.(mp4|webm|mov)(\?|#|$)/i.test(String(url))
  }

  function _renderMedia(url) {
    if (!_has(url)) return ''
    if (_isVideo(url)) {
      return '<div class="blk-spop-media">' +
        '<video src="' + _esc(url) + '" playsinline muted loop autoplay preload="metadata"></video>' +
        '</div>'
    }
    return '<div class="blk-spop-media">' +
      '<img src="' + _esc(url) + '" alt="" loading="lazy" decoding="async">' +
      '</div>'
  }

  function _renderCta(label, url, style) {
    if (!_has(label)) return ''
    if (window.LPBButtonLegacy) {
      try {
        return LPBButtonLegacy.render({ label: label, url: url || '#', style: style || 'champagne' })
      } catch (_) {}
    }
    var external = /^https?:\/\//.test(url || '')
    var styleCls = (style && /^(whatsapp|champagne|outline|graphite)$/.test(style)) ? style : 'champagne'
    return '<a class="blk-btn-legacy blk-btn-legacy--' + styleCls + '"' +
      ' href="' + _esc(url || '#') + '"' +
      (external ? ' target="_blank" rel="noopener"' : '') + '>' +
      '<span>' + _esc(label) + '</span></a>'
  }

  function render(block) {
    var p = (block && block.props) || {}
    var slug = _slugify((block && block.id) || p.headline || 'popup')

    var trigger    = p.trigger || 'time'
    var afterSec   = parseInt(p.after_seconds, 10) || 30
    var scrollPct  = parseInt(p.scroll_percent, 10) || 50
    var cooldownH  = parseInt(p.cooldown_hours, 10) || 24
    var variant    = (p.variant && /^(side|center|bottom)$/.test(p.variant)) ? p.variant : 'side'

    var eyebrow  = _has(p.eyebrow)  ? p.eyebrow  : ''
    var headline = _has(p.headline) ? p.headline : ''
    var subtitle = _has(p.subtitle) ? p.subtitle : ''
    var imageUrl = _has(p.image_url)? p.image_url: ''
    var ctaLbl   = _has(p.cta_label)? p.cta_label: ''
    var ctaUrl   = _has(p.cta_url)  ? p.cta_url  : '#'
    var ctaStyle = (p.cta_style && /^(whatsapp|champagne|outline)$/.test(p.cta_style)) ? p.cta_style : 'champagne'

    var html = ''
      + '<div class="blk-spop blk-spop--' + variant + '"'
      +   ' data-smart-popup'
      +   ' data-slug="' + _esc(slug) + '"'
      +   ' data-trigger="' + _esc(trigger) + '"'
      +   ' data-after="' + _esc(String(afterSec * 1000)) + '"'
      +   ' data-percent="' + _esc(String(scrollPct)) + '"'
      +   ' data-cooldown="' + _esc(String(cooldownH)) + '"'
      +   ' data-variant="' + _esc(variant) + '"'
      +   ' style="display:none">'

    // Overlay só pra variant=center (clicável pra fechar)
    if (variant === 'center') {
      html += '<div class="blk-spop-overlay" data-spop-overlay></div>'
    }

    html += '<div class="blk-spop-card" role="dialog" aria-modal="' + (variant === 'center' ? 'true' : 'false') + '" aria-label="' + _esc(headline || 'Mensagem') + '">'
      + '<button type="button" class="blk-spop-close" data-spop-close aria-label="Fechar">' + X_SVG + '</button>'
      + (imageUrl ? _renderMedia(imageUrl) : '')
      + '<div class="blk-spop-body">'
      +   (eyebrow  ? '<div class="blk-spop-eyebrow">' + _esc(eyebrow)  + '</div>' : '')
      +   (headline ? '<h3 class="blk-spop-head">'    + _esc(headline) + '</h3>'   : '')
      +   (subtitle ? '<p class="blk-spop-sub">'      + _esc(subtitle) + '</p>'   : '')
      +   (ctaLbl ? '<div class="blk-spop-cta" data-spop-cta>' + _renderCta(ctaLbl, ctaUrl, ctaStyle) + '</div>' : '')
      + '</div>'
      + '</div>'
      + '</div>'

    return html
  }

  window.LPBBlockSmartPopup = Object.freeze({ render: render })
})()
