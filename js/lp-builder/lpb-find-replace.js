/**
 * LP Builder · Find & Replace
 *
 * Modal: busca em todos os campos textuais da página.
 * Substitui um por um ou todos. Cria revision antes de
 * qualquer substituicao.
 *
 * window.LPBFindReplace.open()
 */
;(function () {
  'use strict'
  if (window.LPBFindReplace) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  // ────────────────────────────────────────────────────────────
  // Walk: percorre props recursivamente coletando strings
  // Retorna lista de { path: 'blocks[3].props.h1' OR 'blocks[5].props.items[2].titulo', value }
  // ────────────────────────────────────────────────────────────
  function _walkValue(value, path, out) {
    if (typeof value === 'string') {
      if (value && value.length > 0) out.push({ path: path, value: value })
    } else if (Array.isArray(value)) {
      value.forEach(function (v, i) { _walkValue(v, path + '[' + i + ']', out) })
    } else if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (k) {
        // pula campos tecnicos
        if (k === 'icon_svg' || k === 'foto' || k === 'visual_image' ||
            k === 'og_image_url' || k === 'url' || k === 'foto_initial' ||
            k === 'visual_placeholder' || k === 'cta_enabled') return
        _walkValue(value[k], path + '.' + k, out)
      })
    }
  }

  function _collectAll() {
    var page = LPBuilder.getCurrentPage()
    if (!page) return []
    var out = []
    ;(page.blocks || []).forEach(function (b, i) {
      _walkValue(b.props, 'blocks[' + i + '].props', out)
      // attach blockType e blockIdx pra UI
      out.forEach(function (x) {
        if (x._enriched || !x.path.indexOf('blocks[' + i + ']') === 0) return
        if (x.path.indexOf('blocks[' + i + ']') === 0 && !x._enriched) {
          x._enriched = true
          x.blockIdx = i
          x.blockType = b.type
        }
      })
    })
    // (limpeza: refazer enrich corretamente)
    var clean = []
    ;(page.blocks || []).forEach(function (b, i) {
      var sub = []
      _walkValue(b.props, '', sub)
      sub.forEach(function (x) {
        clean.push({
          blockIdx: i, blockType: b.type,
          subPath: x.path,  // ".h1" or ".items[0].titulo"
          value: x.value,
        })
      })
    })
    return clean
  }

  // ────────────────────────────────────────────────────────────
  // Aplica nova string ao path subpath dentro de block.props
  // ────────────────────────────────────────────────────────────
  function _applyAtPath(block, subPath, newValue) {
    // subPath é tipo ".h1" ou ".items[0].titulo"
    // navega ate o pai e seta a chave folha
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
      var p = parts[i]
      if (parent == null) return false
      parent = (p.kind === 'key') ? parent[p.name] : parent[p.name]
    }
    var last = parts[parts.length - 1]
    if (parent == null) return false
    parent[last.name] = newValue
    return true
  }

  // ────────────────────────────────────────────────────────────
  // Find matches
  // ────────────────────────────────────────────────────────────
  function _findMatches(needle, opts) {
    if (!needle) return []
    var all = _collectAll()
    var out = []
    var flags = opts.caseSensitive ? 'g' : 'gi'
    var pattern = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (opts.wholeWord) pattern = '\\b' + pattern + '\\b'
    var re
    try { re = new RegExp(pattern, flags) } catch (_) { return [] }

    all.forEach(function (item) {
      var match
      while ((match = re.exec(item.value)) !== null) {
        out.push({
          blockIdx: item.blockIdx,
          blockType: item.blockType,
          subPath: item.subPath,
          value: item.value,
          start: match.index,
          end: match.index + match[0].length,
          matched: match[0],
        })
        if (re.lastIndex === match.index) re.lastIndex++
      }
    })
    return out
  }

  function _replaceInValue(value, needle, replacement, opts) {
    var flags = opts.caseSensitive ? 'g' : 'gi'
    var pattern = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (opts.wholeWord) pattern = '\\b' + pattern + '\\b'
    var re = new RegExp(pattern, flags)
    return value.replace(re, replacement)
  }

  // ────────────────────────────────────────────────────────────
  // Modal
  // ────────────────────────────────────────────────────────────
  function open() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbFrBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:640px;max-height:88vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Buscar e Substituir</h3>' +
            '<button class="lpb-btn-icon" id="lpbFrClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body">' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label"><span>Buscar</span></div>' +
              '<input class="lpb-input" id="lpbFrFind" placeholder="Texto a procurar...">' +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label"><span>Substituir por</span></div>' +
              '<input class="lpb-input" id="lpbFrReplace" placeholder="(deixe vazio para apenas remover)">' +
            '</div>' +
            '<div style="display:flex;gap:14px;margin-bottom:12px;font-size:11px;color:var(--lpb-text-2)">' +
              '<label class="lpb-bool"><input type="checkbox" id="lpbFrCs"><span class="track"></span><span class="lpb-bool-label">Diferenciar maiúsculas</span></label>' +
              '<label class="lpb-bool"><input type="checkbox" id="lpbFrWw"><span class="track"></span><span class="lpb-bool-label">Palavra inteira</span></label>' +
            '</div>' +
          '</div>' +
          '<div id="lpbFrResults" style="flex:1;overflow:auto;border-top:1px solid var(--lpb-border)"></div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbFrCancel">Fechar</button>' +
            '<div style="flex:1;font-size:11px;color:var(--lpb-text-3)" id="lpbFrCount"></div>' +
            '<button class="lpb-btn" id="lpbFrAll" disabled>Substituir todos</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbFrBg')
    var close  = document.getElementById('lpbFrClose')
    var cancel = document.getElementById('lpbFrCancel')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss

    var findIn  = document.getElementById('lpbFrFind')
    var replIn  = document.getElementById('lpbFrReplace')
    var csIn    = document.getElementById('lpbFrCs')
    var wwIn    = document.getElementById('lpbFrWw')
    var results = document.getElementById('lpbFrResults')
    var count   = document.getElementById('lpbFrCount')
    var allBtn  = document.getElementById('lpbFrAll')

    function _opts() {
      return { caseSensitive: csIn.checked, wholeWord: wwIn.checked }
    }
    function _search() {
      var needle = findIn.value
      if (!needle) {
        results.innerHTML = ''
        count.textContent = ''
        allBtn.disabled = true
        return
      }
      var matches = _findMatches(needle, _opts())
      count.textContent = matches.length + ' resultado(s)'
      allBtn.disabled = matches.length === 0

      if (!matches.length) {
        results.innerHTML = '<div style="padding:30px;text-align:center;color:var(--lpb-text-3);font-style:italic">Nenhum match</div>'
        return
      }
      results.innerHTML = matches.map(function (m, i) {
        var ctxStart = Math.max(0, m.start - 30)
        var ctxEnd   = Math.min(m.value.length, m.end + 30)
        var pre  = (ctxStart > 0 ? '...' : '') + m.value.slice(ctxStart, m.start)
        var hit  = m.value.slice(m.start, m.end)
        var post = m.value.slice(m.end, ctxEnd) + (ctxEnd < m.value.length ? '...' : '')
        return '<div class="lpb-fr-row" data-match-idx="' + i + '">' +
          '<span class="loc">' + _esc(m.blockType) + ' #' + m.blockIdx + ' · ' + _esc(m.subPath) + '</span>' +
          '<span class="ctx">' + _esc(pre) + '</span><mark>' + _esc(hit) + '</mark><span class="ctx">' + _esc(post) + '</span>' +
          ' <button class="lpb-btn sm" data-replace-one="' + i + '" style="float:right">Substituir</button>' +
          '</div>'
      }).join('')

      results.querySelectorAll('[data-replace-one]').forEach(function (b) {
        b.onclick = async function (e) {
          e.stopPropagation()
          var idx = parseInt(b.dataset.replaceOne, 10)
          var m = matches[idx]
          await _doReplaceOne(m, findIn.value, replIn.value, _opts())
          _search()
        }
      })

      results.querySelectorAll('.lpb-fr-row').forEach(function (row) {
        row.onclick = function () {
          var idx = parseInt(row.dataset.matchIdx, 10)
          var m = matches[idx]
          if (m) LPBuilder.selectBlock(m.blockIdx)
        }
      })
    }
    findIn.oninput = _search
    csIn.onchange = _search
    wwIn.onchange = _search

    allBtn.onclick = async function () {
      var matches = _findMatches(findIn.value, _opts())
      if (!matches.length) return
      await _snapshotBefore('find-replace-batch')
      // agrupa por (blockIdx, subPath) — substitui a string inteira de uma vez
      var bySource = {}
      matches.forEach(function (m) {
        var k = m.blockIdx + '|' + m.subPath
        if (!bySource[k]) bySource[k] = m
      })
      var n = 0
      Object.values(bySource).forEach(function (m) {
        var b = LPBuilder.getBlock(m.blockIdx)
        if (!b) return
        var current = m.value
        var newVal = _replaceInValue(current, findIn.value, replIn.value, _opts())
        if (newVal !== current) {
          _applyAtPath(b, m.subPath, newVal)
          n++
        }
      })
      // forca state-changed (mutamos diretamente)
      var current = LPBuilder.getCurrentPage()
      if (current) LPBuilder.setPageMeta('updated_at', current.updated_at)
      LPBToast && LPBToast(n + ' campo(s) atualizado(s)', 'success')
      _search()
    }

    setTimeout(function () { findIn.focus() }, 50)
  }

  async function _doReplaceOne(m, needle, replacement, opts) {
    await _snapshotBefore('find-replace-one')
    var b = LPBuilder.getBlock(m.blockIdx)
    if (!b) return
    // substitui apenas a primeira ocorrência desse match dentro do valor atual
    var pattern = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (opts.wholeWord) pattern = '\\b' + pattern + '\\b'
    var re = new RegExp(pattern, opts.caseSensitive ? '' : 'i')
    var newVal = m.value.replace(re, replacement)
    _applyAtPath(b, m.subPath, newVal)
    var current = LPBuilder.getCurrentPage()
    if (current) LPBuilder.setPageMeta('updated_at', current.updated_at)
    LPBToast && LPBToast('Substituído', 'success')
  }

  async function _snapshotBefore(label) {
    var p = LPBuilder.getCurrentPage()
    if (!p) return
    try { await LPBuilder.rpc('lp_revision_create', { p_page_id: p.id, p_label: label, p_by: 'find-replace' }) }
    catch (_) {}
  }

  window.LPBFindReplace = { open: open }
})()
