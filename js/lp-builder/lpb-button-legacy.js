/**
 * LP Builder · Legacy Button Helper (Onda 28)
 *
 * Renderer puro do botão estilo legado com 4 variantes:
 *   · whatsapp  · #25D366 verde icônico + ícone WhatsApp inline
 *   · champagne · bg champagne premium
 *   · outline   · borda champagne, hover fill
 *   · graphite  · grafite escuro
 *
 * Usado por cta-legacy, price-legacy, e qualquer bloco que precise
 * do botão consistente do legado.
 *
 *   LPBButtonLegacy.render({ label, url, style })  → string HTML
 *   LPBButtonLegacy.STYLES                          → ['whatsapp', 'champagne', ...]
 */
;(function () {
  'use strict'
  if (window.LPBButtonLegacy) return

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // SVG WhatsApp (do legado · path balão de fala icônico)
  var WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>' +
    '<path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.616l4.573-1.46A11.956 11.956 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.319 0-4.476-.714-6.262-1.932a.5.5 0 00-.404-.067l-3.093.988.956-3.032a.5.5 0 00-.064-.415A9.946 9.946 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/>' +
    '</svg>'

  var STYLES = ['whatsapp', 'champagne', 'outline', 'graphite']

  function render(opts) {
    opts = opts || {}
    var label = opts.label || ''
    var url   = opts.url   || '#'
    var style = STYLES.indexOf(opts.style) >= 0 ? opts.style : 'champagne'
    var external = /^https?:\/\//.test(url)
    var icon = (style === 'whatsapp') ? WA_SVG : ''

    return '<a class="blk-btn-legacy blk-btn-legacy--' + style + '"' +
      ' href="' + _esc(url) + '"' +
      (external ? ' target="_blank" rel="noopener"' : '') + '>' +
      icon +
      '<span>' + _esc(label) + '</span>' +
    '</a>'
  }

  window.LPBButtonLegacy = Object.freeze({
    render:  render,
    STYLES:  STYLES,
    WA_SVG:  WA_SVG,
  })
})()
