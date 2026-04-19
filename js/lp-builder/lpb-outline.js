/**
 * LP Builder · Outline View (Onda 28 · final)
 *
 * Painel "mapa da página" que substitui a paleta quando o usuário
 * alterna pra modo Estrutura. Inspirado no construtor legado · clean,
 * compacto, drag&drop nativo HTML5.
 *
 * UX:
 *   · Lista vertical de todos os blocos da página
 *   · Cada item: drag handle ≡ + ícone + tipo + preview text + botões inline
 *   · Click no item → seleciona no canvas + scroll do canvas pro bloco
 *   · Drag&drop reordena (HTML5 native, sem libs)
 *   · Bloco selecionado → highlight champagne border-left
 *   · Sync bidirecional: select no canvas atualiza outline, e vice-versa
 *
 * API:
 *   LPBOutline.mount(rootId)   // monta dentro de um container (a palette)
 *   LPBOutline.render()        // re-renderiza
 *   LPBOutline.unmount()       // limpa listeners
 */
;(function () {
  'use strict'
  if (window.LPBOutline) return

  var _root = null
  var _dragSrcIdx = null

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) {
    var d = document.createElement('div'); d.textContent = s == null ? '' : s
    return d.innerHTML
  }

  // Extrai um preview texto significativo de qualquer tipo de bloco
  function _previewText(b) {
    if (!b || !b.props) return ''
    var p = b.props
    var fields = ['headline', 'h1', 'h2', 'titulo', 'title', 'eyebrow', 'h3', 'lead', 'subtitle', 'subheadline']
    for (var i = 0; i < fields.length; i++) {
      var v = p[fields[i]]
      if (v && typeof v === 'string') {
        var t = v.replace(/\n/g, ' ').trim()
        if (t) return t.length > 42 ? t.slice(0, 42) + '…' : t
      }
    }
    // fallback: contagem de items se for lista
    if (Array.isArray(p.items))  return p.items.length + ' itens'
    if (Array.isArray(p.slides)) return p.slides.length + ' slides'
    if (Array.isArray(p.social)) return p.social.length + ' redes'
    return ''
  }

  function _typeIcon(type) {
    var schema = window.LPBSchema
    if (!schema || !schema.getBlockMeta) return 'square'
    var meta = schema.getBlockMeta(type)
    return (meta && meta.icon) || 'square'
  }

  function _typeLabel(type) {
    var schema = window.LPBSchema
    if (!schema || !schema.getBlockMeta) return type
    var meta = schema.getBlockMeta(type)
    return (meta && meta.name) || type
  }

  function render() {
    if (!_root) return
    var blocks = LPBuilder.getBlocks() || []
    var selIdx = LPBuilder.getSelectedIdx ? LPBuilder.getSelectedIdx() : -1

    var html = '' +
      '<div class="lpb-outline-head">' +
        '<div class="lpb-outline-h3">Estrutura da página</div>' +
        '<div class="lpb-outline-count">' + blocks.length + ' bloco' + (blocks.length === 1 ? '' : 's') + '</div>' +
      '</div>'

    if (!blocks.length) {
      html += '<div class="lpb-outline-empty">' +
        _ico('layers', 22) +
        '<div>Nenhum bloco ainda.</div>' +
        '<small>Volte para Adicionar pra escolher um.</small>' +
      '</div>'
    } else {
      html += '<div class="lpb-outline-list">'
      blocks.forEach(function (b, i) {
        var sel    = (i === selIdx) ? ' is-selected' : ''
        var icon   = _typeIcon(b.type)
        var label  = _typeLabel(b.type)
        var prev   = _previewText(b)
        html += '<div class="lpb-outline-item' + sel + '" data-idx="' + i + '" draggable="true">' +
          '<span class="lpb-outline-drag" title="Arraste para reordenar">' + _ico('menu', 12) + '</span>' +
          '<span class="lpb-outline-icon">' + _ico(icon, 13) + '</span>' +
          '<div class="lpb-outline-text">' +
            '<div class="lpb-outline-type">' + _esc(label) + '</div>' +
            (prev ? '<div class="lpb-outline-preview">' + _esc(prev) + '</div>' : '') +
          '</div>' +
          '<div class="lpb-outline-btns">' +
            '<button class="lpb-outline-btn" data-act="dup" data-idx="' + i + '" title="Duplicar">' + _ico('copy', 11) + '</button>' +
            '<button class="lpb-outline-btn lpb-outline-btn-del" data-act="del" data-idx="' + i + '" title="Remover">' + _ico('trash-2', 11) + '</button>' +
          '</div>' +
        '</div>'
      })
      html += '</div>'
    }

    _root.innerHTML = html
    _attach()
  }

  function _attach() {
    _root.querySelectorAll('.lpb-outline-item').forEach(function (el) {
      var idx = parseInt(el.dataset.idx, 10)

      // click no item → seleciona
      el.addEventListener('click', function (ev) {
        // ignora clicks nos botões internos
        if (ev.target.closest('[data-act]')) return
        if (LPBuilder.selectBlock) LPBuilder.selectBlock(idx)
      })

      // drag handlers
      el.addEventListener('dragstart', function (ev) {
        _dragSrcIdx = idx
        el.classList.add('is-dragging')
        ev.dataTransfer.effectAllowed = 'move'
        try { ev.dataTransfer.setData('text/lpb-outline-idx', String(idx)) } catch (_) {}
      })
      el.addEventListener('dragend', function () {
        el.classList.remove('is-dragging')
        _root.querySelectorAll('.is-drop-target').forEach(function (e) { e.classList.remove('is-drop-target') })
        _dragSrcIdx = null
      })
      el.addEventListener('dragover', function (ev) {
        if (_dragSrcIdx == null || _dragSrcIdx === idx) return
        ev.preventDefault()
        ev.dataTransfer.dropEffect = 'move'
        _root.querySelectorAll('.is-drop-target').forEach(function (e) { e.classList.remove('is-drop-target') })
        el.classList.add('is-drop-target')
      })
      el.addEventListener('dragleave', function () {
        el.classList.remove('is-drop-target')
      })
      el.addEventListener('drop', function (ev) {
        ev.preventDefault()
        if (_dragSrcIdx == null || _dragSrcIdx === idx) return
        var from = _dragSrcIdx
        var to   = idx
        // moveBlock recebe (idx, dir) ou (from, to). Vou usar move repetido pra simplicidade.
        if (LPBuilder.moveBlock) {
          var dir = to > from ? 1 : -1
          var steps = Math.abs(to - from)
          var cur = from
          for (var s = 0; s < steps; s++) {
            LPBuilder.moveBlock(cur, dir)
            cur += dir
          }
          if (LPBuilder.selectBlock) LPBuilder.selectBlock(to)
          if (window.LPBToast) LPBToast('Bloco reordenado · ' + (from + 1) + ' → ' + (to + 1), 'success')
        }
        _dragSrcIdx = null
      })
    })

    // botões internos
    _root.querySelectorAll('[data-act="dup"]').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation()
        var idx = parseInt(b.dataset.idx, 10)
        if (LPBuilder.duplicateBlock) {
          LPBuilder.duplicateBlock(idx)
          if (window.LPBToast) LPBToast('Bloco duplicado', 'success')
        }
      })
    })
    _root.querySelectorAll('[data-act="del"]').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation()
        var idx = parseInt(b.dataset.idx, 10)
        if (!confirm('Remover este bloco?')) return
        if (LPBuilder.removeBlock) {
          LPBuilder.removeBlock(idx)
          if (window.LPBToast) LPBToast('Bloco removido', 'success')
        }
      })
    })
  }

  function mount(rootId) {
    _root = (typeof rootId === 'string') ? document.getElementById(rootId) : rootId
    if (!_root) return
    render()
  }

  function unmount() {
    if (_root) _root.innerHTML = ''
    _root = null
    _dragSrcIdx = null
  }

  // Re-render reativo quando state muda
  document.body.addEventListener('lpb:state-changed', function () {
    if (_root) render()
  })

  window.LPBOutline = Object.freeze({
    mount:   mount,
    render:  render,
    unmount: unmount,
  })
})()
