/**
 * ClinicAI — Page Builder Editor
 *
 * Renders: page list, block palette, block editor, preview link.
 *
 * Depende de: PB (pb-core.js)
 */
;(function () {
  'use strict'
  if (window._pbEditorLoaded) return
  window._pbEditorLoaded = true

  function _esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML }
  function _ico(n, sz) {
    if (typeof feather !== 'undefined' && feather.icons && feather.icons[n])
      return feather.icons[n].toSvg({ width: sz || 16, height: sz || 16, 'stroke-width': 1.8 })
    return ''
  }

  // ── Main render ────────────────────────────────────────────
  function render() {
    var root = document.getElementById('pageBuilderRoot')
    if (!root) return
    if (PB.getView() === 'editor' && PB.getCurrentPage()) {
      root.innerHTML = _renderEditor()
    } else {
      root.innerHTML = _renderList()
    }
    _attachEvents()
  }

  // ── Page list ──────────────────────────────────────────────
  function _renderList() {
    var pages = PB.getPages()
    var base = window.location.origin + '/p.html?s='
    var html = '<div class="pb-module">'
    html += '<div class="pb-header">'
    html += '<div class="pb-title">' + _ico('layout', 22) + ' <span>Construtor de P\u00e1ginas</span></div>'
    html += '<button class="pb-add-btn" id="pbCreateBtn">' + _ico('plus-circle', 14) + ' Nova p\u00e1gina</button>'
    html += '</div>'
    html += '<p class="pb-subtitle">Crie landing pages com a identidade visual da cl\u00ednica.</p>'

    // Create form (hidden)
    html += '<div class="pb-create-form" id="pbCreateForm" style="display:none">'
    html += '<div class="pb-form-row">'
    html += '<div class="pb-form-field" style="flex:1"><label>Slug (URL)</label><input class="pb-input" id="pbNewSlug" placeholder="ex: promo-maio"></div>'
    html += '<div class="pb-form-field" style="flex:2"><label>T\u00edtulo</label><input class="pb-input" id="pbNewTitle" placeholder="Nome da p\u00e1gina"></div>'
    html += '</div>'
    html += '<div style="display:flex;gap:6px;margin-top:8px">'
    html += '<button class="pb-btn-save" id="pbCreateSave">Criar</button>'
    html += '<button class="pb-btn-cancel" id="pbCreateCancel">Cancelar</button>'
    html += '</div></div>'

    // Pages grid
    html += '<div class="pb-pages-grid">'
    if (!pages.length) {
      html += '<div class="pb-empty">Nenhuma p\u00e1gina criada. Clique em "+ Nova p\u00e1gina".</div>'
    } else {
      pages.forEach(function (p) {
        var link = base + p.slug
        var statusCls = p.status === 'published' ? 'pb-status-pub' : 'pb-status-draft'
        var statusTxt = p.status === 'published' ? 'Publicada' : 'Rascunho'
        html += '<div class="pb-page-card">'
        html += '<div class="pb-page-info">'
        html += '<span class="pb-page-title">' + _esc(p.title) + '</span>'
        html += '<span class="pb-page-slug">/p.html?s=' + _esc(p.slug) + '</span>'
        html += '<span class="pb-page-meta">' + _ico('eye', 11) + ' ' + (p.views || 0) + ' views &middot; <span class="' + statusCls + '">' + statusTxt + '</span></span>'
        html += '</div>'
        html += '<div class="pb-page-actions">'
        html += '<button class="pb-page-btn" data-edit="' + p.id + '" title="Editar">' + _ico('edit-2', 14) + '</button>'
        html += '<a class="pb-page-btn" href="' + _esc(link) + '" target="_blank" title="Abrir">' + _ico('external-link', 14) + '</a>'
        html += '<button class="pb-page-btn pb-page-del" data-del="' + p.id + '" title="Excluir">' + _ico('trash-2', 14) + '</button>'
        html += '</div></div>'
      })
    }
    html += '</div></div>'
    return html
  }

  // ── Editor ─────────────────────────────────────────────────
  function _renderEditor() {
    var page = PB.getCurrentPage()
    if (!page) return ''
    var blocks = PB.getBlocks()
    var selIdx = PB.getSelectedIdx()
    var base = window.location.origin + '/p.html?s=' + page.slug

    var html = '<div class="pb-editor">'

    // Top bar
    html += '<div class="pb-topbar">'
    html += '<button class="pb-back-btn" id="pbBack">' + _ico('arrow-left', 14) + ' Voltar</button>'
    html += '<input class="pb-title-input" id="pbTitleInput" value="' + _esc(page.title) + '">'
    html += '<div class="pb-topbar-actions">'
    if (page.status === 'draft') html += '<button class="pb-publish-btn" id="pbPublish">' + _ico('globe', 13) + ' Publicar</button>'
    html += '<button class="pb-save-btn' + (PB.isDirty() ? ' pb-save-dirty' : '') + '" id="pbSave">' + _ico('save', 13) + ' Salvar</button>'
    html += '</div></div>'

    // 3-column layout
    html += '<div class="pb-layout">'

    // LEFT: Block palette
    html += '<div class="pb-palette">'
    html += '<div class="pb-palette-title">Blocos</div>'
    PB.BLOCK_TYPES.forEach(function (bt) {
      html += '<button class="pb-palette-item" data-add="' + bt.type + '">' + _ico(bt.icon, 14) + ' ' + bt.label + '</button>'
    })
    html += '<div class="pb-palette-title" style="margin-top:16px">Config</div>'
    html += '<button class="pb-palette-item' + (selIdx === -2 ? ' pb-palette-active' : '') + '" data-config="sticky">' + _ico('anchor', 14) + ' Bot\u00e3o fixo</button>'
    html += '<button class="pb-palette-item' + (selIdx === -3 ? ' pb-palette-active' : '') + '" data-config="appearance">' + _ico('sliders', 14) + ' Apar\u00eancia</button>'
    html += '</div>'

    // CENTER: Block list (order)
    html += '<div class="pb-blocks">'
    html += '<div class="pb-blocks-title">Blocos da p\u00e1gina (' + blocks.length + ')</div>'
    if (!blocks.length) {
      html += '<div class="pb-empty" style="padding:20px">Adicione blocos usando a paleta \u00e0 esquerda.</div>'
    } else {
      blocks.forEach(function (b, i) {
        var bt = PB.BLOCK_TYPES.find(function (t) { return t.type === b.type }) || {}
        var isSelected = i === selIdx
        html += '<div class="pb-block-item' + (isSelected ? ' pb-block-selected' : '') + '" data-idx="' + i + '">'
        html += '<div class="pb-block-drag">' + _ico('menu', 12) + '</div>'
        html += '<span class="pb-block-icon">' + _ico(bt.icon || 'square', 13) + '</span>'
        html += '<span class="pb-block-label">' + (bt.label || b.type) + '</span>'
        html += '<span class="pb-block-preview">' + _blockPreview(b) + '</span>'
        html += '<div class="pb-block-btns">'
        html += '<button class="pb-blk-btn" data-move-up="' + i + '" title="Subir">' + _ico('chevron-up', 12) + '</button>'
        html += '<button class="pb-blk-btn" data-move-down="' + i + '" title="Descer">' + _ico('chevron-down', 12) + '</button>'
        html += '<button class="pb-blk-btn pb-blk-del" data-remove="' + i + '" title="Remover">' + _ico('x', 12) + '</button>'
        html += '</div></div>'
      })
    }
    // Preview link
    html += '<div class="pb-preview-link">'
    html += '<a href="' + _esc(base) + '" target="_blank">' + _ico('external-link', 12) + ' ' + _esc(base) + '</a>'
    html += '</div>'
    html += '</div>'

    // RIGHT: Block editor (properties)
    html += '<div class="pb-props">'
    if (selIdx >= 0 && blocks[selIdx]) {
      html += _renderBlockProps(blocks[selIdx], selIdx)
    } else if (selIdx === -2) {
      html += _renderStickyProps()
    } else if (selIdx === -3) {
      html += _renderAppearanceProps()
    } else {
      html += '<div class="pb-props-empty">' + _ico('arrow-left', 16) + '<span>Selecione um bloco para editar</span></div>'
    }
    html += '</div>'

    html += '</div></div>' // close layout + editor
    return html
  }

  function _blockPreview(b) {
    if (b.type === 'hero' && b.title) return _esc(b.title).substring(0, 25)
    if (b.type === 'title' && b.text) return _esc(b.text).substring(0, 25)
    if (b.type === 'text' && b.content) return _esc(b.content).substring(0, 25)
    if (b.type === 'buttons' && b.items) return b.items.length + ' bot\u00e3o(s)'
    if (b.type === 'price') return 'R$ ' + (b.value || 0)
    if (b.type === 'check' && b.items) return b.items.length + ' item(s)'
    if (b.type === 'badges' && b.items) return b.items.length + ' badge(s)'
    if (b.type === 'spacer') return (b.height || 60) + 'px'
    return ''
  }

  // ── Block properties editor ────────────────────────────────
  function _renderBlockProps(block, idx) {
    var html = '<div class="pb-props-header">'
    var bt = PB.BLOCK_TYPES.find(function (t) { return t.type === block.type }) || {}
    html += _ico(bt.icon || 'square', 16) + ' <span>' + (bt.label || block.type) + '</span>'
    html += '</div><div class="pb-props-body">'

    switch (block.type) {
      case 'hero':
        html += _field('T\u00edtulo', 'text', 'title', block.title, idx)
        html += '<p class="pb-hint">Use {accent}texto{/accent} para destacar em dourado</p>'
        html += _field('Subt\u00edtulo', 'text', 'subtitle', block.subtitle, idx)
        html += _select('Tema', 'theme', block.theme, [['dark', 'Escuro'], ['light', 'Claro']], idx)
        break
      case 'title':
        html += _field('T\u00edtulo', 'text', 'text', block.text, idx)
        html += _field('Subt\u00edtulo', 'text', 'subtitle', block.subtitle, idx)
        html += _select('Alinhamento', 'align', block.align, [['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']], idx)
        break
      case 'text':
        html += _textarea('Conte\u00fado', 'content', block.content, idx)
        html += _select('Alinhamento', 'align', block.align, [['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']], idx)
        break
      case 'image':
        html += _field('URL da imagem', 'text', 'url', block.url, idx)
        html += _field('Texto alternativo', 'text', 'alt', block.alt, idx)
        html += _field('Altura (px, vazio=auto)', 'number', 'height', block.height, idx)
        break
      case 'video':
        html += _field('URL (YouTube ou Vimeo)', 'text', 'url', block.url, idx)
        break
      case 'badges':
        html += _arrayEditor('Badges', block.items || [], idx, 'badges', function (item, i) {
          return _subField('Icone', 'icon', item.icon, idx, 'badges', i) + _subField('Texto', 'text', item.text, idx, 'badges', i)
        })
        break
      case 'check':
        html += _simpleArrayEditor('Itens', block.items || [], idx, 'check')
        break
      case 'testimonial':
        html += _textarea('Depoimento', 'body', block.body, idx)
        html += _field('Nome', 'text', 'author', block.author, idx)
        html += _field('Estrelas (1-5)', 'number', 'stars', block.stars, idx)
        html += _field('Data', 'text', 'date', block.date, idx)
        break
      case 'carousel':
        html += _arrayEditor('Slides', block.slides || [], idx, 'carousel', function (item, i) {
          return _subField('URL imagem', 'url', item.url || item.image, idx, 'carousel', i)
        })
        break
      case 'buttons':
        html += _arrayEditor('Bot\u00f5es', block.items || [], idx, 'buttons', function (item, i) {
          return _subField('Texto', 'label', item.label, idx, 'buttons', i)
            + _subField('URL', 'url', item.url, idx, 'buttons', i)
            + _subSelect('Estilo', 'style', item.style, [['whatsapp', 'WhatsApp'], ['champagne', 'Champagne'], ['outline', 'Outline'], ['graphite', 'Graphite']], idx, 'buttons', i)
        })
        break
      case 'price':
        html += _field('Label', 'text', 'label', block.label, idx)
        html += _field('Pre\u00e7o original', 'number', 'original', block.original, idx)
        html += _field('Pre\u00e7o final', 'number', 'value', block.value, idx)
        html += _field('Parcelas', 'number', 'parcelas', block.parcelas, idx)
        break
      case 'spacer':
        html += _field('Altura (px)', 'number', 'height', block.height, idx)
        break
      case 'toggles':
        html += _arrayEditor('Op\u00e7\u00f5es', block.items || [], idx, 'toggles', function (item, i) {
          return _subField('Label', 'label', item.label, idx, 'toggles', i)
            + '<label class="pb-sub-check"><input type="checkbox" ' + (item.default_on ? 'checked' : '') + ' data-sub-bool="default_on" data-idx="' + idx + '" data-arr="toggles" data-i="' + i + '"> Marcado por padr\u00e3o</label>'
        })
        break
    }
    html += '</div>'
    return html
  }

  // ── Sticky button props ────────────────────────────────────
  function _renderStickyProps() {
    var sticky = PB.getStickyButton() || { enabled: false, label: '', url: '', style: 'whatsapp' }
    var html = '<div class="pb-props-header">' + _ico('anchor', 16) + ' <span>Bot\u00e3o fixo no rodap\u00e9</span></div>'
    html += '<div class="pb-props-body">'
    html += '<label class="pb-sub-check"><input type="checkbox" id="pbStickyEnabled" ' + (sticky.enabled ? 'checked' : '') + '> Ativado</label>'
    html += _cfgField('Texto', 'pbStickyLabel', sticky.label, 'Quero meu presente')
    html += _cfgField('URL', 'pbStickyUrl', sticky.url, 'https://wa.me/...')
    html += _cfgSelect('Estilo', 'pbStickyStyle', sticky.style, [['whatsapp', 'WhatsApp'], ['champagne', 'Champagne'], ['graphite', 'Graphite']])
    html += '</div>'
    return html
  }

  // ── Appearance props ───────────────────────────────────────
  function _renderAppearanceProps() {
    var app = PB.getAppearance()
    var html = '<div class="pb-props-header">' + _ico('sliders', 16) + ' <span>Apar\u00eancia</span></div>'
    html += '<div class="pb-props-body">'
    html += _cfgSelect('Tema geral', 'pbTheme', app.theme, [['light', 'Claro (brandbook)'], ['dark', 'Escuro']])
    html += '</div>'
    return html
  }

  // ── Field helpers ──────────────────────────────────────────
  function _field(label, type, key, val, idx) {
    return '<div class="pb-field"><label>' + label + '</label><input class="pb-input" type="' + type + '" value="' + _esc(val || '') + '" data-prop="' + key + '" data-idx="' + idx + '"></div>'
  }
  function _textarea(label, key, val, idx) {
    return '<div class="pb-field"><label>' + label + '</label><textarea class="pb-textarea" data-prop="' + key + '" data-idx="' + idx + '" rows="5">' + _esc(val || '') + '</textarea></div>'
  }
  function _select(label, key, val, opts, idx) {
    var html = '<div class="pb-field"><label>' + label + '</label><select class="pb-input" data-prop="' + key + '" data-idx="' + idx + '">'
    opts.forEach(function (o) { html += '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + o[1] + '</option>' })
    return html + '</select></div>'
  }
  function _subField(label, key, val, idx, arr, i) {
    return '<div class="pb-sub-field"><label>' + label + '</label><input class="pb-input pb-sub-input" value="' + _esc(val || '') + '" data-sub-key="' + key + '" data-idx="' + idx + '" data-arr="' + arr + '" data-i="' + i + '"></div>'
  }
  function _subSelect(label, key, val, opts, idx, arr, i) {
    var html = '<div class="pb-sub-field"><label>' + label + '</label><select class="pb-input pb-sub-input" data-sub-key="' + key + '" data-idx="' + idx + '" data-arr="' + arr + '" data-i="' + i + '">'
    opts.forEach(function (o) { html += '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + o[1] + '</option>' })
    return html + '</select></div>'
  }
  function _cfgField(label, id, val, placeholder) {
    return '<div class="pb-field"><label>' + label + '</label><input class="pb-input" id="' + id + '" value="' + _esc(val || '') + '" placeholder="' + _esc(placeholder || '') + '"></div>'
  }
  function _cfgSelect(label, id, val, opts) {
    var html = '<div class="pb-field"><label>' + label + '</label><select class="pb-input" id="' + id + '">'
    opts.forEach(function (o) { html += '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + o[1] + '</option>' })
    return html + '</select></div>'
  }
  function _arrayEditor(label, items, idx, arrKey, renderFn) {
    var html = '<div class="pb-array"><div class="pb-array-header"><span>' + label + ' (' + items.length + ')</span><button class="pb-array-add" data-arr-add="' + arrKey + '" data-idx="' + idx + '">' + _ico('plus', 12) + '</button></div>'
    items.forEach(function (item, i) {
      html += '<div class="pb-array-item">' + renderFn(item, i)
        + '<button class="pb-array-del" data-arr-del="' + arrKey + '" data-idx="' + idx + '" data-i="' + i + '">' + _ico('x', 11) + '</button></div>'
    })
    html += '</div>'
    return html
  }
  function _simpleArrayEditor(label, items, idx, arrKey) {
    var html = '<div class="pb-array"><div class="pb-array-header"><span>' + label + ' (' + items.length + ')</span><button class="pb-array-add" data-arr-add="' + arrKey + '" data-idx="' + idx + '">' + _ico('plus', 12) + '</button></div>'
    items.forEach(function (item, i) {
      html += '<div class="pb-array-item"><input class="pb-input pb-sub-input" value="' + _esc(item) + '" data-simple-arr="' + arrKey + '" data-idx="' + idx + '" data-i="' + i + '">'
        + '<button class="pb-array-del" data-arr-del="' + arrKey + '" data-idx="' + idx + '" data-i="' + i + '">' + _ico('x', 11) + '</button></div>'
    })
    html += '</div>'
    return html
  }

  // ── Events ─────────────────────────────────────────────────
  function _attachEvents() {
    // List: create
    var createBtn = document.getElementById('pbCreateBtn')
    var createForm = document.getElementById('pbCreateForm')
    if (createBtn && createForm) {
      createBtn.addEventListener('click', function () { createForm.style.display = createForm.style.display === 'none' ? 'block' : 'none' })
    }
    var cancelBtn = document.getElementById('pbCreateCancel')
    if (cancelBtn && createForm) cancelBtn.addEventListener('click', function () { createForm.style.display = 'none' })

    var saveCreate = document.getElementById('pbCreateSave')
    if (saveCreate) {
      saveCreate.addEventListener('click', async function () {
        var slug = (document.getElementById('pbNewSlug')?.value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
        var title = (document.getElementById('pbNewTitle')?.value || '').trim()
        if (!slug || !title) return
        saveCreate.disabled = true
        await PB.createPage(slug, title)
        render()
      })
    }

    // List: edit
    document.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        await PB.loadPage(btn.dataset.edit)
        PB.setView('editor')
        render()
      })
    })

    // List: delete
    document.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!confirm('Excluir esta p\u00e1gina?')) return
        await PB.deletePage(btn.dataset.del)
        render()
      })
    })

    // Editor: back
    var backBtn = document.getElementById('pbBack')
    if (backBtn) backBtn.addEventListener('click', function () { PB.setView('list'); render() })

    // Editor: save
    var saveBtn = document.getElementById('pbSave')
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        // Update title
        var titleInput = document.getElementById('pbTitleInput')
        if (titleInput && PB.getCurrentPage()) PB.getCurrentPage().title = titleInput.value.trim()
        saveBtn.disabled = true; saveBtn.textContent = 'Salvando...'
        await PB.savePage()
        render()
      })
    }

    // Editor: publish
    var pubBtn = document.getElementById('pbPublish')
    if (pubBtn) {
      pubBtn.addEventListener('click', async function () {
        var p = PB.getCurrentPage()
        if (!p) return
        p.status = 'published'
        await PB.savePage()
        render()
      })
    }

    // Palette: add block
    document.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        PB.addBlock(btn.dataset.add)
        render()
      })
    })

    // Palette: config
    document.querySelectorAll('[data-config]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        PB.setSelectedIdx(btn.dataset.config === 'sticky' ? -2 : -3)
        render()
      })
    })

    // Blocks: select
    document.querySelectorAll('[data-idx]').forEach(function (el) {
      if (el.classList.contains('pb-block-item')) {
        el.addEventListener('click', function (e) {
          if (e.target.closest('.pb-blk-btn')) return
          PB.setSelectedIdx(parseInt(el.dataset.idx))
          render()
        })
      }
    })

    // Blocks: move/remove
    document.querySelectorAll('[data-move-up]').forEach(function (b) { b.addEventListener('click', function () { PB.moveBlock(parseInt(b.dataset.moveUp), -1); render() }) })
    document.querySelectorAll('[data-move-down]').forEach(function (b) { b.addEventListener('click', function () { PB.moveBlock(parseInt(b.dataset.moveDown), 1); render() }) })
    document.querySelectorAll('[data-remove]').forEach(function (b) { b.addEventListener('click', function () { PB.removeBlock(parseInt(b.dataset.remove)); render() }) })

    // Props: field changes
    document.querySelectorAll('[data-prop]').forEach(function (el) {
      el.addEventListener('input', function () {
        var idx = parseInt(el.dataset.idx)
        var val = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value
        PB.updateBlock(idx, el.dataset.prop, val)
      })
    })

    // Props: sub-field changes (arrays)
    document.querySelectorAll('.pb-sub-input[data-sub-key]').forEach(function (el) {
      el.addEventListener('input', function () {
        var idx = parseInt(el.dataset.idx), arr = el.dataset.arr, i = parseInt(el.dataset.i), key = el.dataset.subKey
        var block = PB.getBlock(idx)
        if (block && block[arr] && block[arr][i]) { block[arr][i][key] = el.value; }
      })
    })

    // Props: simple array changes
    document.querySelectorAll('[data-simple-arr]').forEach(function (el) {
      el.addEventListener('input', function () {
        var idx = parseInt(el.dataset.idx), i = parseInt(el.dataset.i)
        var block = PB.getBlock(idx)
        if (block && block.items) block.items[i] = el.value
      })
    })

    // Props: sub-field bool (checkbox)
    document.querySelectorAll('[data-sub-bool]').forEach(function (el) {
      el.addEventListener('change', function () {
        var idx = parseInt(el.dataset.idx), arr = el.dataset.arr, i = parseInt(el.dataset.i), key = el.dataset.subBool
        var block = PB.getBlock(idx)
        if (block && block[arr] && block[arr][i]) block[arr][i][key] = el.checked
      })
    })

    // Array: add/delete
    document.querySelectorAll('[data-arr-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx), arr = btn.dataset.arrAdd
        var block = PB.getBlock(idx)
        if (!block) return
        if (arr === 'check') { if (!block.items) block.items = []; block.items.push(''); }
        else if (arr === 'badges') { if (!block.items) block.items = []; block.items.push({ icon: '\u2728', text: '' }); }
        else if (arr === 'buttons') { if (!block.items) block.items = []; block.items.push({ label: '', url: '', style: 'champagne' }); }
        else if (arr === 'carousel') { if (!block.slides) block.slides = []; block.slides.push({ url: '' }); }
        else if (arr === 'toggles') { if (!block.items) block.items = []; block.items.push({ label: '', default_on: false }); }
        render()
      })
    })
    document.querySelectorAll('[data-arr-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx), arr = btn.dataset.arrDel, i = parseInt(btn.dataset.i)
        var block = PB.getBlock(idx)
        if (!block) return
        var target = arr === 'carousel' ? block.slides : block.items
        if (target) target.splice(i, 1)
        render()
      })
    })

    // Sticky button config
    var stickyEnabled = document.getElementById('pbStickyEnabled')
    if (stickyEnabled) {
      ;['pbStickyEnabled', 'pbStickyLabel', 'pbStickyUrl', 'pbStickyStyle'].forEach(function (id) {
        var el = document.getElementById(id)
        if (el) {
          el.addEventListener('change', function () {
            PB.setStickyButton({
              enabled: document.getElementById('pbStickyEnabled')?.checked || false,
              label: document.getElementById('pbStickyLabel')?.value || '',
              url: document.getElementById('pbStickyUrl')?.value || '',
              style: document.getElementById('pbStickyStyle')?.value || 'whatsapp'
            })
          })
          if (el.tagName !== 'SELECT') el.addEventListener('input', el.onchange)
        }
      })
    }

    // Appearance config
    var themeEl = document.getElementById('pbTheme')
    if (themeEl) {
      themeEl.addEventListener('change', function () { PB.setAppearance('theme', themeEl.value) })
    }
  }

  // ── Mount ──────────────────────────────────────────────────
  async function mount() {
    await PB.loadPages()
    render()
  }

  document.addEventListener('DOMContentLoaded', function () {
    var check = setInterval(function () {
      var page = document.getElementById('page-page-builder')
      if (page && page.style.display !== 'none' && page.offsetParent !== null) {
        clearInterval(check); mount()
      }
    }, 500)
    setTimeout(function () { clearInterval(check) }, 30000)
  })

  window.PBEditor = Object.freeze({ render: render, mount: mount })
})()
