/**
 * LP Builder · Diff Viewer
 *
 * Modal: lista revisions, click numa carrega diff text (linha-a-linha)
 * vs estado atual da pagina. Adicoes em verde, remocoes em vermelho.
 *
 * Algoritmo simples: line-based LCS approximado com Myers diff
 * implementado de forma minimal pra strings curtas.
 *
 * window.LPBDiff.open()
 */
;(function () {
  'use strict'
  if (window.LPBDiff) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  // ────────────────────────────────────────────────────────────
  // Coleta texto plano de uma snapshot/page (block by block)
  // ────────────────────────────────────────────────────────────
  function _collectTexts(blocks) {
    if (!Array.isArray(blocks)) return []
    var out = []
    var schema = window.LPBSchema
    blocks.forEach(function (b, i) {
      var meta = schema ? schema.getBlockMeta(b.type) : null
      var name = meta ? meta.name : b.type
      var lines = []
      _walk(b.props, lines)
      out.push({ idx: i, type: b.type, name: name, lines: lines })
    })
    return out
  }

  function _walk(value, out) {
    if (typeof value === 'string') {
      if (value.trim()) out.push(value.trim())
    } else if (Array.isArray(value)) {
      value.forEach(function (v) { _walk(v, out) })
    } else if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (k) {
        if (k === 'icon_svg' || k === 'foto' || k === 'visual_image' ||
            k === 'og_image_url' || k === 'foto_initial' ||
            k === 'visual_placeholder' || k === 'cta_enabled' ||
            k === 'bg' || k === 'bg_section' || k === 'url') return
        _walk(value[k], out)
      })
    }
  }

  // Simple line-level diff (LCS-based)
  function _diffLines(oldArr, newArr) {
    var n = oldArr.length, m = newArr.length
    var dp = []
    for (var i = 0; i <= n; i++) {
      dp[i] = []
      for (var j = 0; j <= m; j++) dp[i][j] = 0
    }
    for (var i2 = 1; i2 <= n; i2++) {
      for (var j2 = 1; j2 <= m; j2++) {
        if (oldArr[i2 - 1] === newArr[j2 - 1]) dp[i2][j2] = dp[i2 - 1][j2 - 1] + 1
        else dp[i2][j2] = Math.max(dp[i2 - 1][j2], dp[i2][j2 - 1])
      }
    }
    var ops = []
    var i3 = n, j3 = m
    while (i3 > 0 && j3 > 0) {
      if (oldArr[i3 - 1] === newArr[j3 - 1]) { ops.unshift({ op: '=', t: oldArr[i3 - 1] }); i3--; j3-- }
      else if (dp[i3 - 1][j3] >= dp[i3][j3 - 1]) { ops.unshift({ op: '-', t: oldArr[i3 - 1] }); i3-- }
      else { ops.unshift({ op: '+', t: newArr[j3 - 1] }); j3-- }
    }
    while (i3 > 0) { ops.unshift({ op: '-', t: oldArr[i3 - 1] }); i3-- }
    while (j3 > 0) { ops.unshift({ op: '+', t: newArr[j3 - 1] }); j3-- }
    return ops
  }

  // ────────────────────────────────────────────────────────────
  // Render diff body
  // ────────────────────────────────────────────────────────────
  function _renderDiff(oldBlocks, newBlocks) {
    var oldByIdx = {}; oldBlocks.forEach(function (b) { oldByIdx[b.idx] = b })
    var newByIdx = {}; newBlocks.forEach(function (b) { newByIdx[b.idx] = b })
    var allIdx = {}
    oldBlocks.forEach(function (b) { allIdx[b.idx] = true })
    newBlocks.forEach(function (b) { allIdx[b.idx] = true })
    var keys = Object.keys(allIdx).map(Number).sort(function (a, b) { return a - b })

    var html = ''
    var hasAny = false
    keys.forEach(function (k) {
      var ob = oldByIdx[k]
      var nb = newByIdx[k]
      var ops
      if (ob && nb) ops = _diffLines(ob.lines, nb.lines)
      else if (ob) ops = ob.lines.map(function (t) { return { op: '-', t: t } })
      else ops = nb.lines.map(function (t) { return { op: '+', t: t } })

      var changes = ops.filter(function (o) { return o.op !== '=' })
      if (!changes.length) return
      hasAny = true

      var label = (nb || ob).name + ' · #' + k + (ob && !nb ? ' (removido)' : '') + (!ob && nb ? ' (novo)' : '')
      html += '<div class="lpb-diff-row">' +
        '<span class="label">' + _esc(label) + '</span>'
      ops.forEach(function (o) {
        if (o.op === '=') {
          html += '<div style="color:var(--lpb-text-3);opacity:.6;font-size:11px;line-height:1.5">' + _esc(o.t.slice(0, 80)) + (o.t.length > 80 ? '...' : '') + '</div>'
        } else if (o.op === '+') {
          html += '<div><span class="added">' + _esc(o.t) + '</span></div>'
        } else {
          html += '<div><span class="removed">' + _esc(o.t) + '</span></div>'
        }
      })
      html += '</div>'
    })

    if (!hasAny) {
      html = '<div style="padding:60px;text-align:center;color:var(--lpb-text-3);font-style:italic;font-family:Cormorant Garamond,serif;font-size:18px">Nenhuma diferença de texto entre as duas versões.</div>'
    }
    return html
  }

  // ────────────────────────────────────────────────────────────
  // Modal
  // ────────────────────────────────────────────────────────────
  function open() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    var page = LPBuilder.getCurrentPage()
    if (!page) return
    var revs = LPBuilder.getRevisions() || []

    if (!revs.length) {
      LPBToast && LPBToast('Sem revisões ainda — salve para criar a primeira', 'error')
      return
    }

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbDfBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:760px;max-height:88vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Comparar Versões</h3>' +
            '<button class="lpb-btn-icon" id="lpbDfClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="padding:14px 20px;border-bottom:1px solid var(--lpb-border);display:flex;align-items:center;gap:10px">' +
            '<span style="font-size:11px;color:var(--lpb-text-2)">Comparar versão atual com:</span>' +
            '<select id="lpbDfSel" class="lpb-select" style="background:var(--lpb-bg);border:1px solid var(--lpb-border);color:var(--lpb-text);padding:5px 8px;font-size:11px;flex:1">' +
              revs.map(function (r) {
                var when = new Date(r.created_at).toLocaleString('pt-BR')
                return '<option value="' + _esc(r.id) + '">' +
                  _esc(r.label || 'instantâneo') + ' · ' + when +
                  '</option>'
              }).join('') +
            '</select>' +
            '<button class="lpb-btn sm" id="lpbDfRestore">Restaurar selecionada</button>' +
          '</div>' +
          '<div class="lpb-modal-body" id="lpbDfBody" style="flex:1;overflow:auto;padding:0">' +
            '<div style="padding:40px;text-align:center;color:var(--lpb-text-3);font-style:italic">Carregando diff...</div>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg    = document.getElementById('lpbDfBg')
    var close = document.getElementById('lpbDfClose')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss

    var sel     = document.getElementById('lpbDfSel')
    var body    = document.getElementById('lpbDfBody')
    var restore = document.getElementById('lpbDfRestore')

    async function loadDiff() {
      var revId = sel.value
      body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--lpb-text-3)">Carregando...</div>'
      try {
        // Pega snapshot da revision
        var snap = await _fetchRevisionSnapshot(revId)
        if (!snap) throw new Error('snapshot vazio')
        var oldBlocks = _collectTexts(snap.blocks || [])
        var newBlocks = _collectTexts(LPBuilder.getCurrentPage().blocks || [])
        body.innerHTML = _renderDiff(oldBlocks, newBlocks)
      } catch (e) {
        body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--lpb-danger)">Erro ao carregar revision: ' + _esc(e.message) + '</div>'
      }
    }
    sel.onchange = loadDiff
    loadDiff()

    restore.onclick = async function () {
      var revId = sel.value
      if (!revId) return
      if (!confirm('Restaurar esta versão? A versão atual será salva antes.')) return
      try {
        await LPBuilder.restoreRevision(revId)
        dismiss()
        LPBToast && LPBToast('Versão restaurada', 'success')
      } catch (e) {
        LPBToast && LPBToast('Erro ao restaurar', 'error')
      }
    }
  }

  // RPC pra snapshot completo (a list nao retorna o snapshot pra economia)
  // Usamos REST direto na tabela.
  async function _fetchRevisionSnapshot(revId) {
    var url = (window.ClinicEnv && window.ClinicEnv.SUPABASE_URL) || 'https://oqboitkpcvuaudouwvkl.supabase.co'
    var key = (window.ClinicEnv && window.ClinicEnv.SUPABASE_KEY) ||
              'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
    var r = await fetch(url + '/rest/v1/lp_revisions?id=eq.' + revId + '&select=snapshot', {
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
      },
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    var rows = await r.json()
    return rows && rows[0] && rows[0].snapshot
  }

  window.LPBDiff = { open: open }
})()
