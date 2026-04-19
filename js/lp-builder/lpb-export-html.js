/**
 * LP Builder · Export HTML estático standalone
 *
 * Gera um arquivo .html autocontido (CSS + JS inline) que pode ser
 * hospedado em qualquer servidor (Netlify, Vercel, GitHub Pages, etc.)
 * sem dependência do Supabase.
 *
 * O que fica externo:
 *   · Google Fonts (link CDN) — pra evitar 80KB+ de fonte inline
 *   · Imagens (URLs originais)
 *   · Google Maps embed (iframe)
 *   · Form: continua apontando pra Supabase RPC (precisa internet)
 *
 * Independente — testável isolado:
 *   var html = await LPBExportHtml.exportToHtml(page, { minify: false })
 *   LPBExportHtml.downloadAsHtml(page, opts)
 *   LPBExportHtml.open()  // UI
 */
;(function () {
  'use strict'
  if (window.LPBExportHtml) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  // Lista dos arquivos CSS/JS que precisam estar inline
  var ASSETS = {
    css: ['css/lp-shared.css', 'css/lp-blocks.css'],
    js:  ['js/lp-shared.js',   'js/lp-blocks.js', 'js/lp-builder/lpb-i18n.js'],
  }

  // ────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────
  function _fetchText(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Falha ao buscar ' + url + ': HTTP ' + r.status)
      return r.text()
    })
  }

  // Renderer mesmo do lp.html — copiado aqui pra exportar standalone
  // (em produção pode-se importar do mesmo módulo)
  function _resolveBlocks(blocks, lang) {
    if (window.LPBI18n && window.LPBI18n.applyI18nAll) {
      return LPBI18n.applyI18nAll(blocks, lang || LPBI18n.DEFAULT_LANG)
    }
    return blocks
  }

  function _renderBlocksHtml(page) {
    var Render = window.LPBCanvas && window.LPBCanvas.renderBlockForExport
    if (!Render) {
      console.warn('[LPBExport] LPBCanvas.renderBlockForExport não disponível')
      return ''
    }
    var blocks = page.blocks || []
    return blocks.map(function (b, idx) {
      var inner = Render(b)
      if (!inner) return ''
      var animType = (b._style && b._style.animation && b._style.animation.type) || ''
      var animAttr = (animType && animType !== 'none')
        ? ' class="lpb-anim-' + _esc(animType) + '" data-reveal-anim'
        : ''
      return '<div data-block-idx="' + idx + '" data-block-type="' + _esc(b.type) + '"' + animAttr + '>' + inner + '</div>'
    }).join('')
  }

  function _generateBlockStylesCss(page) {
    if (!window.LPBBlockStyle || !window.LPBBlockStyle.generateAllCss) return ''
    return LPBBlockStyle.generateAllCss(page.blocks || [])
  }

  function _generateTokensOverrideCss(page) {
    var ov = page.tokens_override || {}
    var kv = []
    Object.keys(ov).forEach(function (k) {
      var varName = '--' + k.split('.').map(function (p) {
        return p.replace(/([A-Z])/g, '-$1').toLowerCase()
      }).join('-')
      kv.push(varName + ': ' + ov[k] + ';')
    })
    return kv.length ? ':root{' + kv.join('') + '}' : ''
  }

  // Inliner mínimo de CSS/JS
  async function _bundleAssets() {
    var cssParts = []
    var jsParts = []

    for (var i = 0; i < ASSETS.css.length; i++) {
      try { cssParts.push(await _fetchText(ASSETS.css[i])) }
      catch (e) { cssParts.push('/* falhou: ' + ASSETS.css[i] + ' */') }
    }
    for (var j = 0; j < ASSETS.js.length; j++) {
      try { jsParts.push(await _fetchText(ASSETS.js[j])) }
      catch (e) { jsParts.push('/* falhou: ' + ASSETS.js[j] + ' */') }
    }
    return { css: cssParts.join('\n'), js: jsParts.join('\n') }
  }

  // Minify CSS/JS bem leve (whitespace + comments)
  function _minify(src, kind) {
    if (!src) return ''
    if (kind === 'css') {
      return src
        .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */
        .replace(/\s+/g, ' ')
        .replace(/\s*([{};:,])\s*/g, '$1')
        .trim()
    }
    // js — bem conservador (não toca em código)
    return src
      .replace(/^\s*\/\/.*$/gm, '')         // line comments
      .replace(/\/\*[\s\S]*?\*\//g, '')     // block comments
      .replace(/\n{2,}/g, '\n')
      .trim()
  }

  // ────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────
  async function exportToHtml(page, opts) {
    opts = opts || {}
    if (!page) throw new Error('page obrigatório')

    var lang = opts.lang || (window.LPBI18n ? LPBI18n.DEFAULT_LANG : 'pt-BR')
    var resolvedBlocks = _resolveBlocks(page.blocks || [], lang)
    var resolvedPage = Object.assign({}, page, { blocks: resolvedBlocks })

    var bundled = await _bundleAssets()
    var blockStyles = _generateBlockStylesCss(resolvedPage)
    var tokensCss = _generateTokensOverrideCss(resolvedPage)
    var blocksHtml = _renderBlocksHtml(resolvedPage)

    var inlineCss  = bundled.css + '\n' + tokensCss + '\n' + blockStyles
    var inlineJs   = bundled.js
    if (opts.minify) {
      inlineCss = _minify(inlineCss, 'css')
      inlineJs  = _minify(inlineJs, 'js')
    }

    var meta = '<title>' + _esc(page.meta_title || page.title || 'Landing Page') + '</title>' +
      (page.meta_description ? '<meta name="description" content="' + _esc(page.meta_description) + '">' : '') +
      (page.og_image_url ? '<meta property="og:image" content="' + _esc(page.og_image_url) + '">' : '') +
      '<meta property="og:title" content="' + _esc(page.title || '') + '">'

    var html =
      '<!DOCTYPE html>\n' +
      '<html lang="' + _esc(lang) + '">\n' +
      '<head>\n' +
      '<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      meta + '\n' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
      '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">\n' +
      '<style>\n' + inlineCss + '\n</style>\n' +
      '</head>\n' +
      '<body data-landing="' + _esc(page.slug || '') + '">\n' +
      '<div id="lpRoot">' + blocksHtml + '</div>\n' +
      '<script>\n' + inlineJs + '\n</script>\n' +
      '</body>\n</html>\n'

    return html
  }

  async function downloadAsHtml(page, opts) {
    opts = opts || {}
    var html = await exportToHtml(page, opts)
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = (page.slug || 'landing') + '.html'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return html.length
  }

  // ────────────────────────────────────────────────────────────
  // Modal UI
  // ────────────────────────────────────────────────────────────
  function open() {
    if (!window.LPBuilder) return
    var page = LPBuilder.getCurrentPage()
    if (!page) {
      LPBToast && LPBToast('Abra uma página primeiro', 'error')
      return
    }
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var langOpts = (window.LPBI18n && LPBI18n.SUPPORTED || [{ code: 'pt-BR', label: 'Português' }])
      .map(function (l) {
        return '<option value="' + _esc(l.code) + '">' + _esc(l.label) + '</option>'
      }).join('')

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbExBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:560px">' +
          '<div class="lpb-modal-h">' +
            '<h3>Exportar HTML estático</h3>' +
            '<button class="lpb-btn-icon" id="lpbExClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body">' +
            '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--lpb-text-2);line-height:1.6">' +
              'Gera um arquivo <code>.html</code> com TODO o CSS e JS inline. Pode ser hospedado em qualquer servidor (Netlify, GitHub Pages, etc.) sem depender do banco.' +
              '<br><br>Forms continuam enviando pro Supabase (precisa internet). Imagens permanecem nas URLs originais.' +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label"><span>Idioma da página</span></div>' +
              '<select class="lpb-select" id="lpbExLang" style="width:100%">' + langOpts + '</select>' +
              '<div class="lpb-field-hint">Se houver traduções, escolha qual idioma fica no arquivo.</div>' +
            '</div>' +
            '<div class="lpb-field">' +
              '<label class="lpb-bool" style="width:100%;justify-content:space-between">' +
                '<span class="lpb-bool-label">Minificar CSS e JS</span>' +
                '<span style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="lpbExMinify" checked><span class="track"></span></span>' +
              '</label>' +
            '</div>' +
            '<div id="lpbExResult" style="margin-top:14px"></div>' +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbExCancel">Fechar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn" id="lpbExCopy">' + _ico('copy', 12) + ' Copiar HTML' + '</button>' +
            '<button class="lpb-btn primary" id="lpbExDownload">' + _ico('download', 12) + ' Baixar .html' + '</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbExBg')
    var close  = document.getElementById('lpbExClose')
    var cancel = document.getElementById('lpbExCancel')
    var copy   = document.getElementById('lpbExCopy')
    var dl     = document.getElementById('lpbExDownload')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss

    function _opts() {
      return {
        lang:   document.getElementById('lpbExLang').value,
        minify: document.getElementById('lpbExMinify').checked,
      }
    }

    dl.onclick = async function () {
      dl.disabled = true
      dl.innerHTML = _ico('loader', 12) + ' Gerando...'
      try {
        var size = await downloadAsHtml(page, _opts())
        var kb = (size / 1024).toFixed(1)
        document.getElementById('lpbExResult').innerHTML =
          '<div style="background:rgba(74,222,128,.1);border-left:3px solid var(--lpb-success);padding:10px 12px;font-size:11px;color:var(--lpb-success)">' +
            _ico('check', 12) + ' Arquivo baixado · ' + kb + ' KB' +
          '</div>'
        LPBToast && LPBToast('HTML exportado', 'success')
      } catch (e) {
        LPBToast && LPBToast('Erro: ' + e.message, 'error')
      } finally {
        dl.disabled = false
        dl.innerHTML = _ico('download', 12) + ' Baixar novamente'
      }
    }

    copy.onclick = async function () {
      copy.disabled = true
      try {
        var html = await exportToHtml(page, _opts())
        if (navigator.clipboard) await navigator.clipboard.writeText(html)
        LPBToast && LPBToast('HTML copiado pra área de transferência', 'success')
      } catch (e) {
        LPBToast && LPBToast('Erro: ' + e.message, 'error')
      } finally {
        copy.disabled = false
      }
    }
  }

  window.LPBExportHtml = Object.freeze({
    exportToHtml:    exportToHtml,
    downloadAsHtml:  downloadAsHtml,
    open:            open,
  })
})()
