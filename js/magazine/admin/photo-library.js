/* ============================================================================
 * Beauty & Health Magazine — Photo Library
 *
 * Drawer lateral (toggle) com todos os assets já enviados para a edição atual.
 * Permite reutilizar uma foto clicando: copia URL para o slot de imagem que
 * estiver em foco, ou para o clipboard como fallback.
 *
 * Expõe: window.MagazineAdmin.PhotoLibrary
 *   - mount(host, sb, handlers) → controller { refresh(editionId), toggle, open, close }
 *
 * handlers:
 *   - onPick(url) — chamado quando usuário clica numa foto
 * ============================================================================ */
;(function () {
  'use strict'

  function mount(host, sb, handlers) {
    handlers = handlers || {}
    let currentEditionId = null
    let assets = []

    host.innerHTML = `
      <div class="pl-drawer" data-open="0">
        <div class="pl-head">
          <div class="pl-title">Biblioteca de fotos</div>
          <div class="pl-head-actions">
            <span class="pl-count" data-role="count">0</span>
            <button type="button" class="pl-close" data-act="close" title="Fechar">×</button>
          </div>
        </div>
        <div class="pl-hint">Clique numa foto para aplicá-la no campo de imagem em foco.</div>
        <div class="pl-grid" data-role="grid">
          <div class="pl-empty">Selecione uma edição.</div>
        </div>
      </div>
    `

    const drawer = host.querySelector('.pl-drawer')
    const grid = host.querySelector('[data-role="grid"]')
    const count = host.querySelector('[data-role="count"]')

    host.querySelector('[data-act="close"]').addEventListener('click', close)

    async function refresh(editionId) {
      currentEditionId = editionId || null
      if (!currentEditionId) {
        assets = []
        render()
        return
      }
      const { data, error } = await sb.from('magazine_assets')
        .select('id, url, alt, type, width, height, size_kb, created_at')
        .eq('edition_id', currentEditionId)
        .eq('type', 'image')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) {
        grid.innerHTML = `<div class="pl-empty err">Erro: ${escapeHtml(error.message)}</div>`
        return
      }
      assets = data || []
      render()
    }

    function render() {
      count.textContent = String(assets.length)
      if (!assets.length) {
        grid.innerHTML = `<div class="pl-empty">Nenhuma foto enviada nesta edição ainda.</div>`
        return
      }
      grid.innerHTML = assets.map(a => {
        const url = (window.MagazineRenderer && window.MagazineRenderer.normalizeUrl)
          ? window.MagazineRenderer.normalizeUrl(a.url) : a.url
        const meta = [
          a.alt || '',
          (a.width && a.height) ? `${a.width}×${a.height}` : '',
          a.size_kb ? `${a.size_kb}kb` : '',
        ].filter(Boolean).join(' · ')
        return `
          <button type="button" class="pl-item" data-url="${escapeHtml(a.url)}" title="${escapeHtml(meta)}">
            <div class="pl-thumb" style="background-image:url('${escapeHtml(url)}')"></div>
            <div class="pl-meta">${escapeHtml(meta)}</div>
          </button>
        `
      }).join('')
      grid.querySelectorAll('.pl-item').forEach(el => {
        el.addEventListener('click', () => pick(el.dataset.url))
      })
    }

    function pick(url) {
      if (typeof handlers.onPick === 'function') handlers.onPick(url)
      // Fallback: copiar para clipboard
      try { navigator.clipboard?.writeText(url) } catch (e) {}
    }

    function open()   { drawer.dataset.open = '1'; notify() }
    function close()  { drawer.dataset.open = '0'; notify() }
    function toggle() { drawer.dataset.open = drawer.dataset.open === '1' ? '0' : '1'; notify() }
    function notify() {
      if (typeof handlers.onStateChange === 'function') handlers.onStateChange(drawer.dataset.open === '1')
    }

    function escapeHtml(s) {
      if (s == null) return ''
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    }

    return { refresh, open, close, toggle, isOpen: () => drawer.dataset.open === '1' }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.PhotoLibrary = { mount }
})()
