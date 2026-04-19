/**
 * LP Builder · Image Optimization Engine (Onda 26)
 *
 * Núcleo PURO. Sem DOM, sem fetch direto a recursos externos
 * (HEAD requests acontecem em camada separada).
 *
 *   · extractImagesFromBlocks(blocks) → [{ url, blockIdx, blockType, fieldKey }]
 *   · classifyByExt(url) → 'webp' | 'avif' | 'jpg' | 'png' | 'svg' | 'gif' | 'unknown'
 *   · isOptimizedFormat(url) → bool
 *   · sizeVerdict(bytes) → 'great' | 'ok' | 'large' | 'huge'
 *   · buildSrcset(url, widths) → 'url 480w, url 768w, url 1200w' (Supabase Storage transform)
 */
;(function () {
  'use strict'
  if (window.LPBImgOptimEngine) return

  var IMG_KEYS = ['image', 'foto', 'bg_image', 'imagem', 'before', 'after']
  var ITEM_IMG_KEYS = ['image', 'foto', 'imagem', 'bg', 'before', 'after']

  function extractImagesFromBlocks(blocks) {
    var out = []
    ;(blocks || []).forEach(function (b, idx) {
      if (!b || !b.props) return
      var p = b.props
      IMG_KEYS.forEach(function (k) {
        if (p[k]) out.push({ url: p[k], blockIdx: idx, blockType: b.type, fieldKey: k, alt: p.alt || '' })
      })
      ;(p.items || []).forEach(function (it, i) {
        if (!it) return
        ITEM_IMG_KEYS.forEach(function (k) {
          if (it[k]) out.push({ url: it[k], blockIdx: idx, blockType: b.type, fieldKey: 'items[' + i + '].' + k, alt: it.alt || '' })
        })
      })
    })
    return out
  }

  function classifyByExt(url) {
    if (!url) return 'unknown'
    var clean = String(url).split('?')[0].split('#')[0].toLowerCase()
    var m = clean.match(/\.(webp|avif|jpg|jpeg|png|svg|gif)$/)
    if (!m) return 'unknown'
    if (m[1] === 'jpeg') return 'jpg'
    return m[1]
  }

  function isOptimizedFormat(url) {
    var f = classifyByExt(url)
    return f === 'webp' || f === 'avif' || f === 'svg'
  }

  function sizeVerdict(bytes) {
    if (bytes == null) return 'unknown'
    if (bytes <= 80 * 1024)   return 'great'
    if (bytes <= 200 * 1024)  return 'ok'
    if (bytes <= 500 * 1024)  return 'large'
    return 'huge'
  }

  // Supabase Storage URL transform: ?width=X&quality=Y (fallback se não for storage)
  function buildSrcset(url, widths) {
    if (!url) return ''
    var w = widths || [480, 768, 1200]
    // Detecta supabase storage
    var isStorage = /\/storage\/v1\/object\//.test(url)
    return w.map(function (px) {
      if (isStorage) {
        var sep = url.indexOf('?') > -1 ? '&' : '?'
        return url + sep + 'width=' + px + '&quality=80 ' + px + 'w'
      }
      return url + ' ' + px + 'w'
    }).join(', ')
  }

  function buildOptimizedUrl(url, width) {
    if (!url) return url
    var isStorage = /\/storage\/v1\/object\//.test(url)
    if (!isStorage) return url
    var sep = url.indexOf('?') > -1 ? '&' : '?'
    return url + sep + 'width=' + (width || 1200) + '&quality=80'
  }

  window.LPBImgOptimEngine = Object.freeze({
    extractImagesFromBlocks: extractImagesFromBlocks,
    classifyByExt:           classifyByExt,
    isOptimizedFormat:       isOptimizedFormat,
    sizeVerdict:             sizeVerdict,
    buildSrcset:             buildSrcset,
    buildOptimizedUrl:       buildOptimizedUrl,
  })
})()
