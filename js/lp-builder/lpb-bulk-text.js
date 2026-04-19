/**
 * LP Builder · Bulk Text Editor
 *
 * Modal lista TODOS os campos textuais da pagina em sequencia.
 * Permite editar tudo numa unica view, sem clicar bloco a bloco.
 * "Aplicar" salva todas as mudanças de uma vez.
 *
 * window.LPBBulkText.open()
 */
;(function () {
  'use strict'
  if (window.LPBBulkText) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  // Pula campos tecnicos / nao-textuais
  var SKIP_KEYS = {
    icon_svg: 1, foto: 1, visual_image: 1, og_image_url: 1,
    foto_initial: 1, visual_placeholder: 1, cta_enabled: 1,
    bg: 1, bg_section: 1, url: 1,
  }

  function _walk(value, path, label, out) {
    if (typeof value === 'string') {
      out.push({ path: path, label: label, value: value })
    } else if (Array.isArray(value)) {
      value.forEach(function (v, i) {
        _walk(v, path + '[' + i + ']', label + ' #' + (i + 1), out)
      })
    } else if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (k) {
        if (SKIP_KEYS[k]) return
        var nl = label ? (label + ' › ' + k) : k
        _walk(value[k], path + '.' + k, nl, out)
      })
    }
  }

  function _collect() {
    var page = LPBuilder.getCurrentPage()
    if (!page) return []
    var out = []
    ;(page.blocks || []).forEach(function (b, i) {
      var schema = window.LPBSchema
      var meta = schema ? schema.getBlockMeta(b.type) : null
      var title = meta ? meta.name : b.type
      var sub = []
      // walk somente em campos do tipo string (text/textarea/richtext) e listas
      if (meta) {
        meta.fields.forEach(function (f) {
          if (f.type === 'text' || f.type === 'textarea' || f.type === 'richtext') {
            var v = b.props ? b.props[f.k] : ''
            sub.push({ path: '.' + f.k, label: f.label, value: v || '' })
          } else if (f.type === 'list') {
            var arr = b.props ? b.props[f.k] : []
            if (!Array.isArray(arr)) arr = []
            if (f.scalarItem) {
              arr.forEach(function (it, ii) {
                sub.push({ path: '.' + f.k + '[' + ii + ']', label: f.label + ' #' + (ii + 1), value: it || '' })
              })
            } else if (f.itemSchema) {
              var def = schema.getItemSchema(f.itemSchema) || []
              arr.forEach(function (it, ii) {
                def.forEach(function (s) {
                  if (s.type === 'text' || s.type === 'textarea') {
                    sub.push({
                      path: '.' + f.k + '[' + ii + '].' + s.k,
                      label: f.label + ' #' + (ii + 1) + ' › ' + s.label,
                      value: (it && it[s.k]) || '',
                    })
                  }
                })
              })
            }
          } else if (f.type === 'cta') {
            var cta = b.props ? b.props[f.k] : {}
            if (cta && cta.label != null) {
              sub.push({ path: '.' + f.k + '.label', label: f.label + ' › Texto botao', value: cta.label })
            }
            if (cta && cta.message_wa != null) {
              sub.push({ path: '.' + f.k + '.message_wa', label: f.label + ' › Mensagem WA', value: cta.message_wa })
            }
          }
        })
      }
      if (sub.length) {
        out.push({ blockIdx: i, blockType: b.type, blockTitle: title, fields: sub })
      }
    })
    return out
  }

  function _applyAtPath(block, subPath, newValue) {
    var parts = []
    var rest = subPath
    while (rest && rest.length) {
      var m
      if (rest.charAt(0) === '.') {
        m = rest.match(/^\.([a-zA-Z0-9_]+)/)
        if (!m) break
        parts.push({ kind: 'key', name: m[1] })
        rest = rest.slice(m[0].length)
      } else if (rest.charAt(0) === '[') {
        m = rest.match(/^\[(\d+)\]/)
        if (!m) break
        parts.push({ kind: 'idx', name: parseInt(m[1], 10) })
        rest = rest.slice(m[0].length)
      } else break
    }
    if (!parts.length) return false
    var parent = block.props
    for (var i = 0; i < parts.length - 1; i++) {
      parent = parent[parts[i].name]
    }
    var last = parts[parts.length - 1]
    if (parent == null) return false
    parent[last.name] = newValue
    return true
  }

  // ────────────────────────────────────────────────────────────
  // Modal
  // ────────────────────────────────────────────────────────────
  function open() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    var groups = _collect()

    var html = ''
    if (!groups.length) {
      html = '<div style="padding:60px;text-align:center;color:var(--lpb-text-3);font-style:italic;font-family:Cormorant Garamond,serif;font-size:18px">Nenhum campo de texto na página ainda.</div>'
    } else {
      groups.forEach(function (g) {
        html += '<div style="background:var(--lpb-surface-2);padding:8px 14px;margin-top:6px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600">' +
          _esc(g.blockTitle) + ' · #' + g.blockIdx + '</div>'
        g.fields.forEach(function (f) {
          var maxClass = ''
          html += '<div class="lpb-bulk-row">' +
            '<div class="head"><strong>' + _esc(f.label) + '</strong></div>' +
            '<textarea data-bidx="' + g.blockIdx + '" data-path="' + _esc(f.path) + '" rows="1">' + _esc(f.value) + '</textarea>' +
            '</div>'
        })
      })
    }

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbBkBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:760px;max-height:88vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Editor de Textos</h3>' +
            '<button class="lpb-btn-icon" id="lpbBkClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="padding:10px 16px;background:var(--lpb-bg);border-bottom:1px solid var(--lpb-border);font-size:11px;color:var(--lpb-text-3)">' +
            'Edite todos os textos numa única tela. Clique em "Aplicar" para salvar de uma vez.' +
          '</div>' +
          '<div class="lpb-modal-body" id="lpbBkBody" style="flex:1;overflow:auto;padding:0">' + html + '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbBkCancel">Cancelar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn primary" id="lpbBkApply">Aplicar mudanças</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbBkBg')
    var close  = document.getElementById('lpbBkClose')
    var cancel = document.getElementById('lpbBkCancel')
    var apply  = document.getElementById('lpbBkApply')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss

    // auto-resize textareas
    document.querySelectorAll('#lpbBkBody textarea').forEach(function (t) {
      function autoSize() {
        t.style.height = 'auto'
        t.style.height = Math.min(t.scrollHeight, 200) + 'px'
      }
      autoSize()
      t.addEventListener('input', autoSize)
    })

    apply.onclick = async function () {
      var page = LPBuilder.getCurrentPage()
      if (!page) return
      // snapshot antes
      try { await LPBuilder.rpc('lp_revision_create', { p_page_id: page.id, p_label: 'bulk-edit', p_by: 'bulk-text' }) } catch (_) {}

      var n = 0
      document.querySelectorAll('#lpbBkBody textarea').forEach(function (t) {
        var bidx = parseInt(t.dataset.bidx, 10)
        var path = t.dataset.path
        var b = LPBuilder.getBlock(bidx)
        if (!b) return
        var newVal = t.value
        // pega valor atual via path
        var oldVal = _readAtPath(b, path)
        if (oldVal !== newVal) {
          _applyAtPath(b, path, newVal)
          n++
        }
      })
      // forca state-changed
      LPBuilder.setPageMeta('updated_at', page.updated_at)
      LPBToast && LPBToast(n + ' campo(s) atualizado(s)', 'success')
      dismiss()
    }
  }

  function _readAtPath(block, subPath) {
    var parts = []
    var rest = subPath
    while (rest && rest.length) {
      var m
      if (rest.charAt(0) === '.') {
        m = rest.match(/^\.([a-zA-Z0-9_]+)/)
        if (!m) break
        parts.push(m[1])
        rest = rest.slice(m[0].length)
      } else if (rest.charAt(0) === '[') {
        m = rest.match(/^\[(\d+)\]/)
        if (!m) break
        parts.push(parseInt(m[1], 10))
        rest = rest.slice(m[0].length)
      } else break
    }
    var cur = block.props
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return null
      cur = cur[parts[i]]
    }
    return cur == null ? '' : cur
  }

  window.LPBBulkText = { open: open }
})()
