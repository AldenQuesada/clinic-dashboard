/**
 * LP Builder · Palette (painel esquerdo)
 *
 * Lista os blocos disponiveis agrupados por categoria.
 * Click adiciona ao final · drag inicia drag-and-drop pro canvas.
 *
 * Onda 28 · adiciona toggle [Adicionar | Estrutura] no topo · modo
 * "outline" delega render pro LPBOutline.
 */
;(function () {
  'use strict'
  if (window.LPBPalette) return

  var _root = null
  var _query = ''
  // 'add' | 'outline' · persiste em localStorage
  var _mode  = (function () {
    try { return localStorage.getItem('lpb_palette_mode') || 'add' } catch (_) { return 'add' }
  })()
  var _outlineHost = null  // div interno usado pro outline

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  function _setMode(m) {
    _mode = (m === 'outline') ? 'outline' : 'add'
    try { localStorage.setItem('lpb_palette_mode', _mode) } catch (_) {}
    render()
  }

  function _renderToggle() {
    var addCls = _mode === 'add'     ? ' is-active' : ''
    var outCls = _mode === 'outline' ? ' is-active' : ''
    var n = (LPBuilder.getBlocks() || []).length
    return '<div class="lpb-pal-toggle">' +
      '<button class="lpb-pal-toggle-btn' + addCls + '" data-mode="add">' +
        _ico('plus', 12) + ' Adicionar' +
      '</button>' +
      '<button class="lpb-pal-toggle-btn' + outCls + '" data-mode="outline">' +
        _ico('list', 12) + ' Estrutura' +
        (n > 0 ? '<span class="lpb-pal-toggle-badge">' + n + '</span>' : '') +
      '</button>' +
    '</div>'
  }

  function render() {
    if (!_root) return
    var schema = window.LPBSchema
    if (!schema) return

    // Modo OUTLINE · delega
    if (_mode === 'outline') {
      _root.innerHTML = _renderToggle() + '<div id="lpbOutlineHost" class="lpb-outline-host"></div>'
      _attachToggle()
      _outlineHost = document.getElementById('lpbOutlineHost')
      if (window.LPBOutline) LPBOutline.mount(_outlineHost)
      return
    }

    // Modo ADD (paleta original)
    var groups = schema.listGroups()
    var allBlocks = schema.listBlockTypes()
    var existing = LPBuilder.getBlocks().reduce(function (acc, b) {
      acc[b.type] = (acc[b.type] || 0) + 1
      return acc
    }, {})

    var html = '' +
      _renderToggle() +
      '<h3>Adicionar bloco</h3>' +
      '<div class="lpb-palette-search">' +
        '<input id="lpbPalSearch" placeholder="Buscar bloco..." value="' + _esc(_query) + '">' +
      '</div>'

    groups.forEach(function (g) {
      var blocksOfGroup = allBlocks.filter(function (b) {
        if (b.group !== g.id) return false
        if (!_query) return true
        var q = _query.toLowerCase()
        return b.name.toLowerCase().indexOf(q) >= 0 ||
               b.type.toLowerCase().indexOf(q) >= 0 ||
               (b.description || '').toLowerCase().indexOf(q) >= 0
      })
      if (!blocksOfGroup.length) return

      html += '<div class="lpb-pal-group">' +
        '<h3>' + _esc(g.label) + '</h3>'
      blocksOfGroup.forEach(function (b) {
        var disabled = b.singleton && existing[b.type]
        html += '<div class="lpb-pal-block ' + (disabled ? 'disabled' : '') + '" ' +
                  'draggable="' + (disabled ? 'false' : 'true') + '" ' +
                  'data-block-type="' + _esc(b.type) + '">' +
          '<div class="lpb-pal-icon">' + _ico(b.icon || 'square', 14) + '</div>' +
          '<div>' +
            '<div class="lpb-pal-name">' + _esc(b.name) + '</div>' +
            (disabled
              ? '<small class="lpb-pal-meta">Já existe (singleton)</small>'
              : (b.description ? '<small class="lpb-pal-meta">' + _esc(b.description.slice(0, 38)) + '</small>' : '')
            ) +
          '</div>' +
        '</div>'
      })
      html += '</div>'
    })

    _root.innerHTML = html
    _attach()
  }

  function _attachToggle() {
    if (!_root) return
    _root.querySelectorAll('.lpb-pal-toggle-btn').forEach(function (b) {
      b.addEventListener('click', function () { _setMode(b.dataset.mode) })
    })
  }

  function _attach() {
    _attachToggle()
    var search = document.getElementById('lpbPalSearch')
    if (search) {
      search.oninput = function () { _query = search.value; render(); search = document.getElementById('lpbPalSearch'); if (search) { search.focus(); search.setSelectionRange(_query.length, _query.length) } }
    }

    _root.querySelectorAll('.lpb-pal-block:not(.disabled)').forEach(function (el) {
      var type = el.dataset.blockType

      // click → add ao final
      el.addEventListener('click', function () {
        LPBuilder.addBlock(type)
        LPBToast && LPBToast('Bloco "' + type + '" adicionado', 'success')
      })

      // drag start
      el.addEventListener('dragstart', function (e) {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('text/lpb-block-type', type)
        // notifica canvas pra ativar drop indicators
        document.body.dispatchEvent(new CustomEvent('lpb:drag-start', { detail: { type: type } }))
      })
      el.addEventListener('dragend', function () {
        document.body.dispatchEvent(new CustomEvent('lpb:drag-end'))
      })
    })
  }

  function mount(rootId) {
    _root = document.getElementById(rootId)
    if (!_root) return
    // Smart default: se LP tem >5 blocos e é primeira vez, sugere outline
    try {
      var firstTime = !localStorage.getItem('lpb_palette_mode_seen')
      if (firstTime && (LPBuilder.getBlocks() || []).length > 5) {
        _mode = 'outline'
        localStorage.setItem('lpb_palette_mode', 'outline')
      }
      localStorage.setItem('lpb_palette_mode_seen', '1')
    } catch (_) {}
    render()
  }

  // Atalho Ctrl+/ alterna entre Adicionar e Estrutura
  document.addEventListener('keydown', function (e) {
    var ctrl = e.ctrlKey || e.metaKey
    if (ctrl && (e.key === '/' || e.key === '?')) {
      if (_root && LPBuilder.getView && LPBuilder.getView() === 'editor') {
        e.preventDefault()
        _setMode(_mode === 'add' ? 'outline' : 'add')
      }
    }
  })

  document.body.addEventListener('lpb:state-changed', function () {
    // re-render se mudou contagem de singletons
    if (_root && LPBuilder.getView() === 'editor') render()
  })

  window.LPBPalette = { mount: mount, render: render }
})()
