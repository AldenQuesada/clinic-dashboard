/**
 * LP Builder · Inline Edit no Canvas
 *
 * Double-click em h1/h2/h3/h4/p/blockquote/.eyebrow torna o
 * elemento contenteditable. Detecta qual fieldKey corresponde
 * via mapping por block type + tag.
 *
 * Blur ou Enter (sem Shift) salva via setBlockProp.
 * Esc cancela.
 */
;(function () {
  'use strict'
  if (window.LPBInlineEdit) return

  // Mapeia (blockType, elementTag/className) → fieldKey
  // Para cada bloco, define quais elementos sao editaveis
  var EDITABLE_MAP = {
    'nav': {
      '.brand-small': 'brand_small',
      '.brand-name':  'brand_name',
    },
    'hero-split': {
      '.eyebrow':       'eyebrow',
      'h1':             'h1',
      '.lead':          'lead',
    },
    'problema-center': {
      '.eyebrow':   'eyebrow',
      'h2':         'h2',
      '.lead':      'lead',
    },
    'cards-2col': {
      '.block-intro .eyebrow':  'eyebrow',
      '.block-intro h2':        'h2',
      '.block-intro p':         'intro',
    },
    'quote-narrative': {
      'blockquote':  'quote',
    },
    'benefits-grid': {
      '.block-intro .eyebrow':  'eyebrow',
      '.block-intro h2':        'h2',
    },
    'investimento': {
      '.eyebrow':              'eyebrow',
      'h2':                    'h2',
      '.investimento-valor':   'valor',
      '.investimento-sub':     'sub',
      '.cashback-badge':       'badge_text',
    },
    'list-rich': {
      '.block-intro .eyebrow': 'eyebrow',
      '.block-intro h2':       'h2',
    },
    'list-simple': {
      '.block-intro .eyebrow': 'eyebrow',
      '.block-intro h2':       'h2',
    },
    'doctor-block': {
      '.eyebrow':  'eyebrow',
      'h2':        'h2',
    },
    'faq': {
      '.block-intro .eyebrow': 'eyebrow',
      '.block-intro h2':       'h2',
    },
    'cta-final': {
      '.eyebrow':  'eyebrow',
      'h2':        'h2',
      'p':         'lead',
    },
    'footer': {
      '.lp-footer-brand':   'brand_name',
      '.lp-footer-tagline': 'tagline',
      '.lp-footer-small':   'copyright',
      // Footer V2 (Onda 28)
      '.blk-footer-logo':       'brand_name',
      '.blk-footer-tagline-v2': 'tagline',
      '.blk-footer-copy-v2':    'copyright',
    },

    // ── Onda 28 · blocos do legado fielmente reproduzidos ──
    'hero-cover': {
      '.blk-hc-eyebrow':     'eyebrow',
      '.blk-hc-headline':    'headline',
      '.blk-hc-subheadline': 'subheadline',
    },
    'cta-legacy': {
      '.blk-cta-legacy-eyebrow':  'eyebrow',
      '.blk-cta-legacy-headline': 'headline',
      '.blk-cta-legacy-sub':      'subtitle',
    },
    'title-legacy': {
      '.blk-title-legacy-eyebrow': 'eyebrow',
      '.blk-title-legacy-h2':      'h2',
      '.blk-title-legacy-lead':    'lead',
    },
    'check-legacy': {
      '.blk-check-legacy-eyebrow': 'eyebrow',
      '.blk-check-legacy-h2':      'h2',
    },
    'buttons-row': {
      '.blk-buttons-row-eyebrow': 'eyebrow',
      '.blk-buttons-row-title':   'titulo',
    },
    'badges-legacy': {
      '.blk-badges-legacy-eyebrow': 'eyebrow',
      '.blk-badges-legacy-title':   'titulo',
    },
    'links-tree': {
      '.blk-links-tree-eyebrow': 'eyebrow',
      '.blk-links-tree-title':   'titulo',
    },
    'before-after-carousel': {
      '.blk-bac-eyebrow': 'eyebrow',
      '.blk-bac-title':   'titulo',
    },
    'magazine-toc': {
      '.blk-mtoc-kicker': 'eyebrow',
      '.blk-mtoc-h1':     'h1',
      '.blk-mtoc-lead':   'lead',
    },

    // ── Onda 29 · blocos de conversão ──
    'anatomy-quiz': {
      '.blk-aq-eyebrow':  'eyebrow',
      '.blk-aq-headline': 'headline',
      '.blk-aq-sub':      'subtitle',
    },
    'collagen-animation': {
      '.blk-collagen-eyebrow': 'eyebrow',
      '.blk-collagen-head':    'headline',
      '.blk-collagen-lead':    'lead',
    },
    'smart-popup': {
      '.blk-spop-eyebrow': 'eyebrow',
      '.blk-spop-head':    'headline',
      '.blk-spop-sub':     'subtitle',
    },
    'transformation-reel': {
      '.blk-reel-eyebrow': 'eyebrow',
      '.blk-reel-head':    'headline',
    },
    'smart-cta': {
      '.blk-scta-eyebrow': 'eyebrow',
      '.blk-scta-head':    'headline',
    },
  }

  function _matchFieldKey(blockType, target) {
    var map = EDITABLE_MAP[blockType]
    if (!map) return null
    var keys = Object.keys(map)
    for (var i = 0; i < keys.length; i++) {
      var sel = keys[i]
      // match: target casa exatamente o seletor dentro do bloco
      try {
        if (target.matches(sel)) return map[sel]
        // ou se for descendente que casa
        var found = target.closest(sel)
        if (found && found.contains(target)) return map[sel]
      } catch (_) {}
    }
    return null
  }

  function _attachToFrame() {
    var iframe = document.getElementById('lpbIframe')
    if (!iframe || !iframe.contentDocument) return
    var doc = iframe.contentDocument

    // adiciona estilo de edicao se nao existir
    if (!doc.getElementById('lpb-ie-style')) {
      var style = doc.createElement('style')
      style.id = 'lpb-ie-style'
      style.textContent = '' +
        '[contenteditable="true"]{outline:2px dashed #C8A97E !important;outline-offset:4px;background:rgba(200,169,126,.05) !important;cursor:text}' +
        '[contenteditable="true"]:focus{outline-style:solid !important}' +
        '.lpb-ie-hint{position:absolute;background:#1A1A1C;color:#C8A97E;font-family:Montserrat,sans-serif;font-size:9px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;padding:3px 8px;z-index:60;pointer-events:none}'
      doc.head.appendChild(style)
    }

    // listener double-click delegado
    if (doc.body && !doc.body._lpbIeWired) {
      doc.body._lpbIeWired = true
      doc.body.addEventListener('dblclick', function (e) {
        var blk = e.target.closest('.lpb-edit-block')
        if (!blk) return
        var blockType = blk.dataset.blockType
        var blockIdx  = parseInt(blk.dataset.blockIdx, 10)
        if (isNaN(blockIdx)) return

        // resolve qual fieldKey casa com o target
        var fieldKey = _matchFieldKey(blockType, e.target)
        if (!fieldKey) return  // elemento nao mapeado pra inline-edit

        // encontra o elemento "ancora" que tem esse fieldKey
        var anchor = e.target
        // se o map era seletor genérico (ex: 'h2'), garante o elemento certo
        var map = EDITABLE_MAP[blockType] || {}
        var sel = Object.keys(map).find(function (k) { return map[k] === fieldKey })
        if (sel) {
          var found = blk.querySelector(sel)
          if (found) anchor = found
        }

        e.preventDefault()
        e.stopPropagation()
        _enterEditMode(anchor, blockIdx, fieldKey)
      })
    }
  }

  function _enterEditMode(el, blockIdx, fieldKey) {
    if (!el) return
    var original = el.textContent
    el.setAttribute('contenteditable', 'true')
    el.focus()

    // seleciona todo o conteudo
    var doc = el.ownerDocument
    var range = doc.createRange()
    range.selectNodeContents(el)
    var sel = doc.defaultView.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    // mostra toolbar flutuante B/I
    var tb = _showInlineToolbar(el)

    function commit() {
      var newVal = el.textContent
      el.removeAttribute('contenteditable')
      cleanup()
      if (newVal !== original) {
        LPBuilder.setBlockProp(blockIdx, fieldKey, newVal)
        LPBToast && LPBToast('Atualizado · ' + fieldKey, 'success')
      }
    }
    function cancel() {
      el.textContent = original
      el.removeAttribute('contenteditable')
      cleanup()
    }
    function onKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
      else if (e.key === 'Escape')          { e.preventDefault(); cancel() }
    }
    function cleanup() {
      el.removeEventListener('blur', commit)
      el.removeEventListener('keydown', onKey)
      _hideInlineToolbar(tb)
    }
    el.addEventListener('blur', commit)
    el.addEventListener('keydown', onKey)
  }

  // ────────────────────────────────────────────────────────────
  // Inline toolbar (B / I) — flutua acima do elemento
  // ────────────────────────────────────────────────────────────
  function _showInlineToolbar(el) {
    var iframe = document.getElementById('lpbIframe')
    if (!iframe) return null
    var rect = el.getBoundingClientRect()
    var fr   = iframe.getBoundingClientRect()
    // posicao relativa ao top window
    var top  = fr.top + rect.top - 36  // 36px acima
    var left = fr.left + rect.left

    // toolbar fica no main document (fora do iframe), pra nao ser cortada
    var tb = document.createElement('div')
    tb.className = 'lpb-ie-toolbar'
    tb.style.top  = Math.max(8, top) + 'px'
    tb.style.left = Math.max(8, left) + 'px'
    tb.innerHTML = '' +
      '<button class="bold"   data-md="*" title="Negrito accent (envolve em *texto*)">B</button>' +
      '<button class="italic" data-md="_" title="Italico (envolve em _texto_)">I</button>'

    tb.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('mousedown', function (e) {
        e.preventDefault()  // nao roubar o foco do contenteditable
        var marker = b.dataset.md
        var doc = el.ownerDocument
        var sel = doc.defaultView.getSelection()
        if (!sel || sel.rangeCount === 0) return
        var range = sel.getRangeAt(0)
        var selectedText = range.toString()
        if (!selectedText) return
        // envolve em *...* ou _..._
        var wrapped = marker + selectedText + marker
        range.deleteContents()
        range.insertNode(doc.createTextNode(wrapped))
        // colapsa cursor pro fim
        sel.collapseToEnd()
      })
    })

    document.body.appendChild(tb)
    return tb
  }

  function _hideInlineToolbar(tb) {
    if (tb && tb.parentNode) tb.parentNode.removeChild(tb)
  }

  // ────────────────────────────────────────────────────────────
  // Hook: wire toda vez que o canvas renderizar
  // ────────────────────────────────────────────────────────────
  function _wire() {
    // pequeno delay pra esperar o iframe terminar de carregar
    setTimeout(_attachToFrame, 50)
  }

  document.body.addEventListener('lpb:state-changed', _wire)
  document.body.addEventListener('lpb:viewport-changed', _wire)

  // boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wire)
  } else {
    _wire()
  }

  window.LPBInlineEdit = { wire: _wire }
})()
