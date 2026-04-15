/* ============================================================================
 * Beauty & Health Magazine — Drop Zone
 *
 * Utilitário para anexar drag-drop de arquivos de imagem em qualquer elemento.
 * Valida tipo (image/*), tamanho, e entrega o File ao handler. Feedback visual
 * via data-drag-hover no elemento.
 *
 * Expõe: window.MagazineAdmin.DropZone
 *   - attach(element, handlers) → detach()
 *
 * handlers:
 *   - onFile(file) — chamado ao soltar arquivo válido
 *   - maxBytes? — default 10MB
 * ============================================================================ */
;(function () {
  'use strict'

  const DEFAULT_MAX = 10 * 1024 * 1024

  function attach(el, handlers) {
    if (!el) return () => {}
    handlers = handlers || {}
    const maxBytes = handlers.maxBytes || DEFAULT_MAX

    function onDragOver(e) {
      if (!hasImageFile(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      el.dataset.dragHover = '1'
    }
    function onDragLeave(e) {
      if (e.target !== el) return
      el.dataset.dragHover = '0'
    }
    function onDrop(e) {
      el.dataset.dragHover = '0'
      const files = e.dataTransfer && e.dataTransfer.files
      if (!files || !files.length) return
      const file = Array.from(files).find(f => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      if (file.size > maxBytes) {
        if (typeof handlers.onError === 'function') handlers.onError('Arquivo maior que 10MB')
        return
      }
      if (typeof handlers.onFile === 'function') handlers.onFile(file)
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)

    return function detach() {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
      delete el.dataset.dragHover
    }
  }

  function hasImageFile(e) {
    if (!e.dataTransfer) return false
    const items = e.dataTransfer.items
    if (!items) return true // alguns browsers não expõem items em dragover
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.startsWith('image/')) return true
    }
    return false
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.DropZone = { attach }
})()
