/**
 * LP Builder · Social Icons Engine (Onda 28)
 *
 * Núcleo PURO. Mapeia label/url social para SVG monoline 1.5px premium
 * (Feather/Lucide-style). Auto-detect por:
 *   1. Match exato pelo `network` explícito ('instagram'|'whatsapp'|...)
 *   2. Match heurístico pelo label ('Instagram', 'WhatsApp', ...)
 *   3. Match heurístico pela URL (instagram.com, wa.me, mailto:, ...)
 *   4. Fallback: ícone de link genérico
 *
 * API:
 *   LPBSocialIcons.svgFor({ network, label, url })  → string SVG inline
 *   LPBSocialIcons.detectNetwork({ network, label, url }) → 'instagram' | ... | 'link'
 *   LPBSocialIcons.NETWORKS  → lista pra <select>
 */
;(function () {
  'use strict'
  if (window.LPBSocialIcons) return

  // SVGs monoline 1.5px stroke · viewBox 24 24 · estética premium
  // (mesmo padrão do legado: 14×14 dentro do botão 32×32 com border champagne)
  var ICONS = {
    instagram:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>' +
        '<path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>' +
        '<line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>' +
      '</svg>',
    whatsapp:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' +
      '</svg>',
    facebook:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>' +
      '</svg>',
    youtube:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/>' +
        '<polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>' +
      '</svg>',
    tiktok:
      // monoline aproximada (Feather não tem oficial)
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>' +
      '</svg>',
    linkedin:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/>' +
        '<rect x="2" y="9" width="4" height="12"/>' +
        '<circle cx="4" cy="4" r="2"/>' +
      '</svg>',
    email:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>' +
        '<polyline points="22,6 12,13 2,6"/>' +
      '</svg>',
    phone:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>' +
      '</svg>',
    site:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="10"/>' +
        '<line x1="2" y1="12" x2="22" y2="12"/>' +
        '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' +
      '</svg>',
    map:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>' +
        '<circle cx="12" cy="10" r="3"/>' +
      '</svg>',
    link:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
        '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' +
      '</svg>',
  }

  var NETWORKS = [
    { id: 'auto',      label: 'Auto-detectar pelo label/URL' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'whatsapp',  label: 'WhatsApp' },
    { id: 'facebook',  label: 'Facebook' },
    { id: 'youtube',   label: 'YouTube' },
    { id: 'tiktok',    label: 'TikTok' },
    { id: 'linkedin',  label: 'LinkedIn' },
    { id: 'email',     label: 'E-mail' },
    { id: 'phone',     label: 'Telefone' },
    { id: 'site',      label: 'Site / Web' },
    { id: 'map',       label: 'Mapa / Localização' },
    { id: 'link',      label: 'Link genérico' },
  ]

  function detectNetwork(opts) {
    opts = opts || {}
    var net = String(opts.network || '').toLowerCase()
    if (net && net !== 'auto' && ICONS[net]) return net

    var label = String(opts.label || '').toLowerCase().trim()
    var url   = String(opts.url   || '').toLowerCase().trim()

    // Match por label primeiro (mais explícito)
    if (label) {
      if (/insta/.test(label))                return 'instagram'
      if (/whats|wpp|wa\b/.test(label))       return 'whatsapp'
      if (/face/.test(label))                 return 'facebook'
      if (/youtube|yt/.test(label))           return 'youtube'
      if (/tiktok|tik\s?tok/.test(label))     return 'tiktok'
      if (/linkedin|linked\s?in/.test(label)) return 'linkedin'
      if (/e-?mail|contato/.test(label))      return 'email'
      if (/tel|fone|phone/.test(label))       return 'phone'
      if (/site|web|portal/.test(label))      return 'site'
      if (/local|mapa|endere/.test(label))    return 'map'
    }

    // Match por URL
    if (url) {
      if (/instagram\.com/.test(url))         return 'instagram'
      if (/wa\.me|whatsapp/.test(url))        return 'whatsapp'
      if (/facebook\.com|fb\.com/.test(url))  return 'facebook'
      if (/youtube\.com|youtu\.be/.test(url)) return 'youtube'
      if (/tiktok\.com/.test(url))            return 'tiktok'
      if (/linkedin\.com/.test(url))          return 'linkedin'
      if (/^mailto:/.test(url))               return 'email'
      if (/^tel:/.test(url))                  return 'phone'
      if (/maps\.google|google\.com\/maps|goo\.gl\/maps/.test(url)) return 'map'
    }

    return 'link'
  }

  function svgFor(opts) {
    var net = detectNetwork(opts)
    return ICONS[net] || ICONS.link
  }

  function aria(opts) {
    var net = detectNetwork(opts)
    var found = NETWORKS.find(function (n) { return n.id === net })
    return found ? found.label : (opts && opts.label) || 'Link'
  }

  window.LPBSocialIcons = Object.freeze({
    NETWORKS:       NETWORKS,
    detectNetwork:  detectNetwork,
    svgFor:         svgFor,
    aria:           aria,
  })
})()
