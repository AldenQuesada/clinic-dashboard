/**
 * LP Builder · Keyboard Shortcuts
 *
 * Atalhos globais (modo editor apenas):
 *   Cmd/Ctrl+S         · salva
 *   Cmd/Ctrl+Z         · undo (restaura ultima revision)
 *   Cmd/Ctrl+D         · duplica bloco selecionado
 *   Cmd/Ctrl+P         · preview fullscreen
 *   Cmd/Ctrl+/         · foca busca da palette
 *   Esc                · deseleciona bloco
 *   Del / Backspace    · remove bloco (com confirm)
 *   ↑ / ↓ + Shift      · move bloco selecionado
 *   ?                  · mostra modal com lista de atalhos
 *
 * Ignora atalhos quando foco esta em input/textarea/contenteditable
 * (exceto Esc, que sempre funciona).
 */
;(function () {
  'use strict'
  if (window.LPBShortcuts) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }

  function _isTyping() {
    var el = document.activeElement
    if (!el) return false
    var tag = (el.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
    if (el.isContentEditable) return true
    return false
  }

  function _isMac() {
    return /Mac|iPad|iPhone/.test(navigator.platform || '')
  }

  function _modKey(e) {
    return _isMac() ? e.metaKey : e.ctrlKey
  }

  // ────────────────────────────────────────────────────────────
  // Handlers
  // ────────────────────────────────────────────────────────────
  async function _save() {
    if (!LPBuilder.isDirty()) {
      LPBToast && LPBToast('Nada a salvar', 'success'); return
    }
    try {
      await LPBuilder.savePage()
      LPBToast && LPBToast('Salvo', 'success')
    } catch (e) {
      LPBToast && LPBToast('Erro ao salvar', 'error')
    }
  }

  async function _undo() {
    var revs = LPBuilder.getRevisions() || []
    if (!revs.length) {
      LPBToast && LPBToast('Sem historico', 'error'); return
    }
    // pega a 2a revision (a 1a é a "auto-save" mais recente)
    var target = revs[1] || revs[0]
    if (!target) return
    try {
      await LPBuilder.restoreRevision(target.id)
      LPBToast && LPBToast('Restaurado: ' + (target.label || 'instantâneo'), 'success')
    } catch (e) {
      LPBToast && LPBToast('Erro ao desfazer', 'error')
    }
  }

  function _duplicate() {
    var idx = LPBuilder.getSelectedIdx()
    if (idx < 0) { LPBToast && LPBToast('Selecione um bloco primeiro', 'error'); return }
    LPBuilder.duplicateBlock(idx)
    LPBToast && LPBToast('Bloco duplicado', 'success')
  }

  function _delete() {
    var idx = LPBuilder.getSelectedIdx()
    if (idx < 0) return
    var b = LPBuilder.getBlock(idx)
    if (!b) return
    if (confirm('Remover bloco "' + b.type + '"?')) {
      LPBuilder.removeBlock(idx)
    }
  }

  function _move(dir) {
    var idx = LPBuilder.getSelectedIdx()
    if (idx < 0) return
    LPBuilder.moveBlock(idx, dir)
  }

  function _deselect() {
    LPBuilder.selectBlock(-1)
    var el = document.activeElement
    if (el && el.blur) el.blur()
  }

  function _previewFs() {
    if (window.LPBPreviewFS) window.LPBPreviewFS.open()
  }

  function _focusSearch() {
    var s = document.getElementById('lpbPalSearch')
    if (s) { s.focus(); s.select() }
  }

  // ────────────────────────────────────────────────────────────
  // Help modal
  // ────────────────────────────────────────────────────────────
  function _showHelp() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    var mod = _isMac() ? '⌘' : 'Ctrl'
    var rows = [
      [mod + ' + S',           'Salvar'],
      [mod + ' + Z',           'Desfazer (restaurar última revisão)'],
      [mod + ' + D',           'Duplicar bloco selecionado'],
      [mod + ' + P',           'Visualizar em tela cheia'],
      [mod + ' + F',           'Buscar e substituir'],
      [mod + ' + B',           'Editor de textos (em massa)'],
      [mod + ' + /',           'Focar busca da palette'],
      ['Esc',                  'Desselecionar bloco'],
      ['Del / Backspace',      'Remover bloco selecionado'],
      ['Shift + ↑',            'Mover bloco para cima'],
      ['Shift + ↓',            'Mover bloco para baixo'],
      ['?',                    'Mostrar este modal'],
    ]
    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbHelpBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:480px">' +
          '<div class="lpb-modal-h">' +
            '<h3>Atalhos de teclado</h3>' +
            '<button class="lpb-btn-icon" id="lpbHelpClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body">' +
            '<table style="width:100%;border-collapse:collapse">' +
              rows.map(function (r) {
                return '<tr style="border-bottom:1px solid var(--lpb-border)">' +
                  '<td style="padding:10px 0;font-family:monospace;color:var(--lpb-accent);font-size:12px;width:160px">' + r[0] + '</td>' +
                  '<td style="padding:10px 0;color:var(--lpb-text);font-size:12px">' + r[1] + '</td>' +
                '</tr>'
              }).join('') +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>'
    var bg    = document.getElementById('lpbHelpBg')
    var close = document.getElementById('lpbHelpClose')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
  }

  // ────────────────────────────────────────────────────────────
  // Main listener
  // ────────────────────────────────────────────────────────────
  function _onKeyDown(e) {
    // sempre permite Esc
    if (e.key === 'Escape') {
      _deselect()
      // tambem fecha modal se aberto
      var modal = document.getElementById('lpbModalRoot')
      if (modal && modal.firstChild) {
        modal.innerHTML = ''
        return
      }
      return
    }

    // skip atalhos durante typing
    if (_isTyping()) return

    // so atua em modo editor
    if (LPBuilder.getView() !== 'editor') return

    var mod = _modKey(e)

    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); _save(); return }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); _undo(); return }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); _duplicate(); return }
    if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); _previewFs(); return }
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault();
      if (window.LPBFindReplace) window.LPBFindReplace.open(); return }
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault();
      if (window.LPBBulkText) window.LPBBulkText.open(); return }
    if (mod && e.key === '/')               { e.preventDefault(); _focusSearch(); return }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); _delete(); return
    }

    if (e.shiftKey && e.key === 'ArrowUp')   { e.preventDefault(); _move(-1); return }
    if (e.shiftKey && e.key === 'ArrowDown') { e.preventDefault(); _move( 1); return }

    if (e.key === '?' && !mod) { e.preventDefault(); _showHelp(); return }
  }

  // ────────────────────────────────────────────────────────────
  // Init
  // ────────────────────────────────────────────────────────────
  function init() {
    document.addEventListener('keydown', _onKeyDown, true)
  }

  // boot automatico
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  window.LPBShortcuts = {
    showHelp: _showHelp,
  }
})()
