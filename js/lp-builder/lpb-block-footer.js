/**
 * LP Builder · Block Render: footer (Onda 28 · upgrade)
 *
 * Reproduz fielmente o footer do legado p.html: bg grafite, eyebrow
 * "Clínica" champagne 8px, brand Cormorant ivory, tagline italic,
 * social icons 32×32 com border champagne (.2 alpha) e hover fill,
 * copyright 9px ivory dim.
 *
 * Os SVGs vêm via LPBSocialIcons.svgFor (auto-detect Instagram/WhatsApp/etc).
 *
 *   LPBBlockFooter.render(block) → string HTML
 */
;(function () {
  'use strict'
  if (window.LPBBlockFooter) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function render(block) {
    var p  = (block && block.props) || {}
    var bg = p.bg || 'graphite'
    var social = Array.isArray(p.social) ? p.social.filter(function (s) { return s && s.url }) : []

    var html = '<footer class="blk-footer-v2" data-bg="' + _esc(bg) + '">'

    // Logo block (eyebrow + nome)
    html += '<div class="blk-footer-logo">'
    if (p.clinic_label) html += '<span class="blk-footer-logo-label">' + _esc(p.clinic_label) + '</span>'
    html += _esc(p.brand_name || '')
    html += '</div>'

    if (p.tagline)  html += '<p class="blk-footer-tagline-v2">' + _esc(p.tagline) + '</p>'

    if (social.length) {
      html += '<div class="blk-footer-social">'
      social.forEach(function (s) {
        var ariaLabel = s.label || (window.LPBSocialIcons ? LPBSocialIcons.aria(s) : 'Link')
        var svg = (window.LPBSocialIcons ? LPBSocialIcons.svgFor(s) : '')
        var external = /^https?:\/\//.test(s.url)
        html += '<a href="' + _esc(s.url) + '"' +
          (external ? ' target="_blank" rel="noopener"' : '') +
          ' aria-label="' + _esc(ariaLabel) + '">' + svg + '</a>'
      })
      html += '</div>'
    }

    if (p.copyright) html += '<p class="blk-footer-copy-v2">' + _esc(p.copyright) + '</p>'

    html += '</footer>'
    return html
  }

  window.LPBBlockFooter = Object.freeze({ render: render })
})()
