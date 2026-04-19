/**
 * LP Builder · Dynamic Palette
 *
 * Extrai cor dominante de uma imagem (canvas sampling com filtro
 * de extremos) e propõe paleta { accent, dark, light } pra aplicar
 * como overrides nos tokens da página.
 *
 * Independente do resto do editor — testável isolado:
 *   var p = await LPBDynamicPalette.extractFromUrl('https://...')
 *   LPBDynamicPalette.applyToPage(p)
 *
 * UI: openModal() abre modal compacto com auto-detecção da foto hero.
 */
;(function () {
  'use strict'
  if (window.LPBDynamicPalette) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  // ────────────────────────────────────────────────────────────
  // Quantização: ignora extremos (preto/branco), retorna RGB médio
  // ────────────────────────────────────────────────────────────
  function _quantize(rgba) {
    var r = 0, g = 0, b = 0, n = 0
    for (var i = 0; i < rgba.length; i += 4) {
      var R = rgba[i], G = rgba[i + 1], B = rgba[i + 2], A = rgba[i + 3]
      if (A < 200) continue
      var lum = (0.299 * R + 0.587 * G + 0.114 * B)
      if (lum < 30 || lum > 225) continue  // ignora muito escuro / muito claro
      r += R; g += G; b += B; n++
    }
    if (n === 0) return null
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
  }

  function _hex(r, g, b) {
    function h(x) { var s = Math.max(0, Math.min(255, Math.round(x))).toString(16); return s.length === 1 ? '0' + s : s }
    return '#' + (h(r) + h(g) + h(b)).toUpperCase()
  }

  function _palette(rgb) {
    if (!rgb) return null
    return {
      accent: _hex(rgb.r, rgb.g, rgb.b),
      dark:   _hex(rgb.r * 0.62, rgb.g * 0.62, rgb.b * 0.62),
      light:  _hex(rgb.r + 40, rgb.g + 40, rgb.b + 40),
    }
  }

  // ────────────────────────────────────────────────────────────
  // API: extrai paleta de uma URL
  // ────────────────────────────────────────────────────────────
  function extractFromUrl(url) {
    return new Promise(function (resolve, reject) {
      if (!url) return reject(new Error('URL vazia'))
      var img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas')
          canvas.width = 80; canvas.height = 80
          var ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, 80, 80)
          var data = ctx.getImageData(0, 0, 80, 80).data
          var rgb = _quantize(data)
          var pal = _palette(rgb)
          if (!pal) return reject(new Error('Sem cores médias detectáveis'))
          resolve(pal)
        } catch (err) { reject(err) }
      }
      img.onerror = function () { reject(new Error('Falha ao carregar imagem (CORS?)')) }
      img.src = url
    })
  }

  // Procura a primeira foto utilizável nos blocos da página atual
  function findFirstPhotoUrl() {
    if (!window.LPBuilder) return null
    var page = LPBuilder.getCurrentPage()
    if (!page) return null
    var blocks = page.blocks || []
    for (var i = 0; i < blocks.length; i++) {
      var p = blocks[i].props || {}
      if (p.visual_image)  return p.visual_image
      if (p.foto)          return p.foto
      if (p.og_image_url)  return p.og_image_url
      if (Array.isArray(p.items)) {
        for (var j = 0; j < p.items.length; j++) {
          var it = p.items[j] || {}
          if (it.foto)        return it.foto
          if (it.url)         return it.url
          if (it.before_url)  return it.before_url
          if (it.after_url)   return it.after_url
        }
      }
    }
    return null
  }

  // Aplica como overrides de tokens (campo: colors.champagne, colors.champagneDk, colors.champagneLt)
  function applyToPage(pal) {
    if (!window.LPBuilder || !pal) return
    LPBuilder.setTokensOverride({
      'colors.champagne':   pal.accent,
      'colors.champagneDk': pal.dark,
      'colors.champagneLt': pal.light,
    })
  }

  // ────────────────────────────────────────────────────────────
  // Modal UI
  // ────────────────────────────────────────────────────────────
  function openModal() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    var sourceUrl = findFirstPhotoUrl() || ''

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbDpBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:520px">' +
          '<div class="lpb-modal-h">' +
            '<h3>Extrair paleta da foto</h3>' +
            '<button class="lpb-btn-icon" id="lpbDpClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body">' +
            '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--lpb-text-2);line-height:1.6">' +
              'Pega a cor dominante da foto hero (ou outra que você indicar) e aplica como <em>champagne / accent</em> da página inteira.' +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label"><span>URL da imagem</span></div>' +
              '<input class="lpb-input" id="lpbDpUrl" value="' + _esc(sourceUrl) + '" placeholder="https://...">' +
              '<div class="lpb-field-hint">Auto-detectada do hero. Cole outra URL se preferir.</div>' +
            '</div>' +
            '<div id="lpbDpPreview" style="margin-top:14px"></div>' +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbDpCancel">Cancelar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn" id="lpbDpExtract">' + _ico('zap', 12) + ' Extrair paleta</button>' +
            '<button class="lpb-btn primary" id="lpbDpApply" disabled>Aplicar à página</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbDpBg')
    var close  = document.getElementById('lpbDpClose')
    var cancel = document.getElementById('lpbDpCancel')
    var extract= document.getElementById('lpbDpExtract')
    var apply  = document.getElementById('lpbDpApply')
    var urlIn  = document.getElementById('lpbDpUrl')
    var prev   = document.getElementById('lpbDpPreview')

    var palette = null
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss

    extract.onclick = async function () {
      extract.disabled = true
      extract.innerHTML = _ico('loader', 12) + ' Analisando...'
      prev.innerHTML = '<div style="color:var(--lpb-text-3);font-size:11px;font-style:italic">Aguarde...</div>'
      try {
        palette = await extractFromUrl(urlIn.value.trim())
        prev.innerHTML = _renderPreview(palette)
        apply.disabled = false
      } catch (err) {
        prev.innerHTML = '<div style="color:var(--lpb-danger);font-size:11px">Erro: ' + _esc(err.message) + '</div>'
        apply.disabled = true
      } finally {
        extract.disabled = false
        extract.innerHTML = _ico('zap', 12) + ' Re-extrair'
      }
    }

    apply.onclick = function () {
      if (!palette) return
      applyToPage(palette)
      LPBToast && LPBToast('Paleta aplicada à página', 'success')
      dismiss()
    }

    // Auto-extract se já tem URL
    if (sourceUrl) extract.onclick()
  }

  function _renderPreview(p) {
    return '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);margin-bottom:10px">Paleta detectada</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
        _swatch('Accent', p.accent) +
        _swatch('Dark',   p.dark) +
        _swatch('Light',  p.light) +
      '</div>'
  }
  function _swatch(label, hex) {
    return '<div style="text-align:center">' +
      '<div style="aspect-ratio:1/1;background:' + hex + ';border:1px solid var(--lpb-border);margin-bottom:6px"></div>' +
      '<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--lpb-text-3)">' + label + '</div>' +
      '<div style="font-family:monospace;font-size:11px;color:var(--lpb-text)">' + hex + '</div>' +
      '</div>'
  }

  window.LPBDynamicPalette = Object.freeze({
    extractFromUrl:    extractFromUrl,
    findFirstPhotoUrl: findFirstPhotoUrl,
    applyToPage:       applyToPage,
    openModal:         openModal,
  })
})()
