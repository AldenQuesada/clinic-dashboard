/**
 * LP Builder · História de versões (Onda 19)
 *
 * UI completa pro snapshot/restore de páginas. Trigger no banco já cuida
 * dos snapshots automáticos (debounce 15min). Aqui:
 *   · timeline de revisões (cards)
 *   · diff resumido vs versão atual (blocos +/-/=)
 *   · preview antes de restaurar (lê snapshot completo)
 *   · restaurar com confirmação (cria backup auto antes)
 *   · renomear label
 *   · deletar revisão antiga
 *
 * Dois entry points:
 *   · LPBHistory.openModal(pageId)   — abre modal pro pageId dado
 *   · LPBHistory.openCurrent()       — abre modal pra página em edição
 *
 * Independente — testável isolado:
 *   var rev = await LPBuilder.rpc('lp_revision_get', { p_revision_id: id })
 *   LPBHistory.diffSnapshot(rev.snapshot, currentPage)
 */
;(function () {
  'use strict'
  if (window.LPBHistory) return

  function _esc(s) {
    var d = document.createElement('div'); d.textContent = s == null ? '' : s
    return d.innerHTML
  }
  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _toast(m, k) { window.LPBToast && window.LPBToast(m, k) }

  // ──────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────
  function _fmtDate(s) {
    if (!s) return '—'
    try {
      var d = new Date(s), now = new Date()
      var diffMs = now - d, mins = Math.floor(diffMs / 60000)
      if (mins < 1)   return 'agora mesmo'
      if (mins < 60)  return mins + ' min atrás'
      var hrs = Math.floor(mins / 60)
      if (hrs < 24)   return hrs + 'h atrás'
      var days = Math.floor(hrs / 24)
      if (days < 7)   return days + 'd atrás'
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
        + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } catch (_) { return s }
  }

  function _fmtBytes(n) {
    if (!n) return '0 B'
    if (n < 1024)        return n + ' B'
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
    return (n / 1024 / 1024).toFixed(2) + ' MB'
  }

  function _badgeOrigem(by) {
    if (by === 'auto')         return '<span style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--lpb-text-2);background:var(--lpb-bg);padding:2px 6px">auto</span>'
    if (by === 'system')       return '<span style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--lpb-warning);background:rgba(251,191,36,.12);padding:2px 6px">sistema</span>'
    if (by === 'before-publish') return '<span style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--lpb-accent);background:rgba(200,169,126,.18);padding:2px 6px">pre-publish</span>'
    if (by === 'admin')        return '<span style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--lpb-success);background:rgba(74,222,128,.18);padding:2px 6px">manual</span>'
    return '<span style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--lpb-text-2)">' + _esc(by || '?') + '</span>'
  }

  // Diff resumido entre snapshot e página atual
  function diffSnapshot(snap, currentPage) {
    var snapBlocks = (snap && snap.blocks) || []
    var curBlocks  = (currentPage && currentPage.blocks) || []
    var snapTypes = snapBlocks.map(function (b) { return b && b.type }).filter(Boolean)
    var curTypes  = curBlocks.map(function (b) { return b && b.type }).filter(Boolean)

    // diff por sequência simples (LCS aproximado por count)
    var snapMap = {}, curMap = {}
    snapTypes.forEach(function (t) { snapMap[t] = (snapMap[t] || 0) + 1 })
    curTypes.forEach(function (t)  { curMap[t]  = (curMap[t]  || 0) + 1 })

    var added = 0, removed = 0, kept = 0
    Object.keys(curMap).forEach(function (t) {
      var s = snapMap[t] || 0, c = curMap[t]
      if (c > s) added += (c - s)
      kept += Math.min(s, c)
    })
    Object.keys(snapMap).forEach(function (t) {
      var s = snapMap[t], c = curMap[t] || 0
      if (s > c) removed += (s - c)
    })

    return {
      blocks_then: snapBlocks.length,
      blocks_now:  curBlocks.length,
      added:       added,
      removed:     removed,
      kept:        kept,
      title_changed: (snap && snap.title) !== (currentPage && currentPage.title),
    }
  }

  // ──────────────────────────────────────────────────────────
  // Modal principal
  // ──────────────────────────────────────────────────────────
  var _state = { pageId: null, revisions: [], current: null, selected: null }

  async function openModal(pageId) {
    if (!pageId) { _toast('Página inválida', 'error'); return }
    _state.pageId = pageId
    _state.selected = null

    // carrega página atual (pra diff) + lista revisões
    try {
      var [curR, list] = await Promise.all([
        LPBuilder.rpc('lp_page_get', { p_id: pageId }),
        LPBuilder.rpc('lp_revision_list', { p_page_id: pageId, p_limit: 50 }),
      ])
      _state.current = (curR && curR.ok) ? curR : null
      _state.revisions = Array.isArray(list) ? list : []
    } catch (err) {
      _toast('Erro ao carregar histórico: ' + err.message, 'error')
      return
    }
    _render()
  }

  function openCurrent() {
    var p = LPBuilder.getCurrentPage && LPBuilder.getCurrentPage()
    if (!p || !p.id) { _toast('Abra uma página primeiro', 'error'); return }
    return openModal(p.id)
  }

  function _render() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var revs = _state.revisions
    var listHtml = revs.length
      ? revs.map(_renderRevCard).join('')
      : '<div style="padding:32px 20px;text-align:center;color:var(--lpb-text-2);font-size:12px;line-height:1.6">' +
          _ico('clock', 28) +
          '<div style="margin-top:10px">Sem histórico ainda.</div>' +
          '<div style="font-size:10px;margin-top:4px">Snapshots automáticos rodam a cada 15min de edição.</div>' +
        '</div>'

    var detailHtml = _state.selected
      ? _renderDetail(_state.selected)
      : '<div style="padding:40px 24px;text-align:center;color:var(--lpb-text-2);font-size:11px;line-height:1.6">' +
          _ico('git-commit', 22) +
          '<div style="margin-top:10px">Selecione um snapshot na lista ao lado pra ver o diff e restaurar.</div>' +
        '</div>'

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbHistBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:920px;width:96vw">' +
          '<div class="lpb-modal-h">' +
            '<h3>Histórico de versões <small style="font-weight:400;color:var(--lpb-text-2);margin-left:8px;font-size:11px">' + revs.length + ' snapshot' + (revs.length === 1 ? '' : 's') + ' · max 50</small></h3>' +
            '<button class="lpb-btn-icon" id="lpbHistClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:320px 1fr;height:520px;overflow:hidden">' +
            '<aside id="lpbHistList" style="border-right:1px solid var(--lpb-border);overflow-y:auto;background:var(--lpb-bg)">' +
              listHtml +
            '</aside>' +
            '<section id="lpbHistDetail" style="overflow-y:auto">' +
              detailHtml +
            '</section>' +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<div style="font-size:10px;color:var(--lpb-text-2);line-height:1.5">' +
              _ico('info', 11) + ' Restaurar cria backup automático da versão atual antes de aplicar.' +
            '</div>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn ghost" id="lpbHistDone">Fechar</button>' +
          '</div>' +
        '</div></div>'

    document.getElementById('lpbHistBg').addEventListener('click', _dismiss)
    document.getElementById('lpbHistClose').onclick = _dismiss
    document.getElementById('lpbHistDone').onclick  = _dismiss
    _attachListEvents()
    _attachDetailEvents()
  }

  function _renderRevCard(r) {
    var sel = (_state.selected && _state.selected.id === r.id) ? ' style="background:var(--lpb-surface-2);border-left:3px solid var(--lpb-accent)"' : ' style="border-left:3px solid transparent"'
    var labelLine = r.label
      ? '<div style="font-size:11px;color:var(--lpb-text);font-weight:500;margin-top:2px">' + _esc(r.label) + '</div>'
      : ''
    return '' +
      '<div class="lpb-hist-rev" data-rev-id="' + _esc(r.id) + '"' + sel +
        ' style="padding:10px 14px;border-bottom:1px solid var(--lpb-border);cursor:pointer">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px">' +
          '<div style="font-size:11px;color:var(--lpb-text-2)">' + _fmtDate(r.created_at) + '</div>' +
          _badgeOrigem(r.created_by) +
        '</div>' +
        labelLine +
        '<div style="display:flex;gap:10px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--lpb-text-2);margin-top:4px">' +
          '<span>' + (r.block_count || 0) + ' blocos</span>' +
          '<span>·</span>' +
          '<span>' + _fmtBytes(r.snapshot_size || 0) + '</span>' +
        '</div>' +
      '</div>'
  }

  function _attachListEvents() {
    document.querySelectorAll('#lpbHistList .lpb-hist-rev').forEach(function (el) {
      el.onclick = async function () {
        var id = el.dataset.revId
        var meta = _state.revisions.find(function (r) { return r.id === id })
        if (!meta) return
        // selected fica como meta + snapshot quando carrega
        _state.selected = Object.assign({}, meta, { _loading: true })
        _render()
        try {
          var r = await LPBuilder.rpc('lp_revision_get', { p_revision_id: id })
          if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
          _state.selected = Object.assign({}, meta, { snapshot: r.snapshot })
          _render()
        } catch (err) {
          _toast('Erro ao abrir snapshot: ' + err.message, 'error')
          _state.selected = null
          _render()
        }
      }
    })
  }

  function _renderDetail(sel) {
    if (sel._loading) {
      return '<div style="padding:40px;text-align:center;color:var(--lpb-text-2);font-size:11px">Carregando snapshot…</div>'
    }
    var snap = sel.snapshot || {}
    var diff = _state.current ? diffSnapshot(snap, _state.current) : null

    var diffBox = diff
      ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">' +
          _statBox('+ ' + diff.added,   'adicionados', 'var(--lpb-success)') +
          _statBox('− ' + diff.removed, 'removidos',   'var(--lpb-danger)') +
          _statBox('= ' + diff.kept,    'mantidos',    'var(--lpb-text-2)') +
        '</div>' +
        '<div style="font-size:10px;color:var(--lpb-text-2);margin-bottom:14px;line-height:1.6">' +
          'Restaurar volta de <strong>' + diff.blocks_now + '</strong> blocos (atual) pra <strong>' + diff.blocks_then + '</strong> blocos (snapshot).' +
          (diff.title_changed ? '<br>Título também muda: <em>' + _esc(snap.title || '—') + '</em>' : '') +
        '</div>'
      : ''

    var blockTypes = (snap.blocks || [])
      .map(function (b) { return b && b.type }).filter(Boolean)
    var typeListHtml = blockTypes.length
      ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:18px">' +
          blockTypes.map(function (t, i) {
            return '<span style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;background:var(--lpb-bg);border:1px solid var(--lpb-border);color:var(--lpb-text-2);padding:3px 6px">' + (i + 1) + '. ' + _esc(t) + '</span>'
          }).join('') +
        '</div>'
      : ''

    var labelInputVal = sel.label || ''

    return '' +
      '<div style="padding:18px 22px">' +
        '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;margin-bottom:6px">Snapshot ' + _fmtDate(sel.created_at) + '</div>' +
        '<h4 style="font-family:var(--lpb-font-serif);font-weight:400;font-size:18px;margin:0 0 14px;color:var(--lpb-text)">' + _esc(snap.title || '(sem título)') + '</h4>' +
        diffBox +
        '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-2);margin-bottom:8px">Blocos no snapshot</div>' +
        typeListHtml +
        '<div class="lpb-field" style="margin-bottom:18px">' +
          '<div class="lpb-field-label">Marcador (opcional)</div>' +
          '<input class="lpb-input" id="lpbHistLabel" value="' + _esc(labelInputVal) + '" placeholder="ex: antes do rebrand">' +
          '<div class="lpb-field-hint">Ajuda a achar essa versão depois. Em branco = sem marcador.</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;padding-top:14px;border-top:1px solid var(--lpb-border)">' +
          '<button class="lpb-btn primary" id="lpbHistRestore">' + _ico('rotate-ccw', 14) + ' Restaurar esta versão</button>' +
          '<button class="lpb-btn ghost" id="lpbHistSaveLabel">Salvar marcador</button>' +
          '<div style="flex:1"></div>' +
          '<button class="lpb-btn ghost" id="lpbHistDelete" style="color:var(--lpb-danger)">' + _ico('trash-2', 14) + '</button>' +
        '</div>' +
      '</div>'
  }

  function _statBox(big, small, color) {
    return '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:10px;text-align:center">' +
      '<div style="font-size:18px;font-weight:600;color:' + color + ';font-family:var(--lpb-font-serif)">' + big + '</div>' +
      '<div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2);margin-top:2px">' + small + '</div>' +
    '</div>'
  }

  function _attachDetailEvents() {
    var sel = _state.selected
    if (!sel || sel._loading) return

    var btnRestore = document.getElementById('lpbHistRestore')
    var btnLabel   = document.getElementById('lpbHistSaveLabel')
    var btnDelete  = document.getElementById('lpbHistDelete')
    var inpLabel   = document.getElementById('lpbHistLabel')

    if (btnRestore) btnRestore.onclick = async function () {
      if (!confirm('Restaurar esta versão? A versão atual fica salva como backup automático antes.')) return
      btnRestore.disabled = true
      try {
        var r = await LPBuilder.restoreRevision(sel.id)
        if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
        _toast('Versão restaurada · pré-restore salvo no histórico', 'success')
        _dismiss()
        // dispara reload se LP aberta na lista
        await LPBuilder.loadPages()
      } catch (err) {
        _toast('Erro ao restaurar: ' + err.message, 'error')
        btnRestore.disabled = false
      }
    }

    if (btnLabel) btnLabel.onclick = async function () {
      var newLabel = (inpLabel.value || '').trim()
      btnLabel.disabled = true
      try {
        var r = await LPBuilder.rpc('lp_revision_label_set', {
          p_revision_id: sel.id, p_label: newLabel
        })
        if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
        // atualiza state local
        _state.selected.label = newLabel
        var inList = _state.revisions.find(function (x) { return x.id === sel.id })
        if (inList) inList.label = newLabel
        _toast('Marcador salvo', 'success')
        _render()
      } catch (err) {
        _toast('Erro: ' + err.message, 'error')
        btnLabel.disabled = false
      }
    }

    if (btnDelete) btnDelete.onclick = async function () {
      if (!confirm('Apagar este snapshot do histórico? Não é restaurável depois.')) return
      btnDelete.disabled = true
      try {
        var r = await LPBuilder.rpc('lp_revision_delete', { p_revision_id: sel.id })
        if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
        _state.revisions = _state.revisions.filter(function (x) { return x.id !== sel.id })
        _state.selected = null
        _toast('Snapshot removido', 'success')
        _render()
      } catch (err) {
        _toast('Erro: ' + err.message, 'error')
        btnDelete.disabled = false
      }
    }
  }

  function _dismiss() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (modalRoot) modalRoot.innerHTML = ''
    _state = { pageId: null, revisions: [], current: null, selected: null }
  }

  // ──────────────────────────────────────────────────────────
  // Atalho de teclado: Ctrl+Shift+H
  // ──────────────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    var ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
      var p = LPBuilder.getCurrentPage && LPBuilder.getCurrentPage()
      if (p && p.id) { e.preventDefault(); openModal(p.id) }
    }
  })

  window.LPBHistory = Object.freeze({
    openModal:     openModal,
    openCurrent:   openCurrent,
    diffSnapshot:  diffSnapshot,
  })
})()
