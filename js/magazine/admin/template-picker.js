/* ============================================================================
 * Beauty & Health Magazine — Template Picker
 *
 * Modal de escolha de template com:
 *   - busca (por nome / slug / descrição)
 *   - filtro por categoria
 *   - preview SVG real da coluna magazine_templates.preview_svg (quando existir)
 *   - fallback: preview proto com nº do slug
 *
 * Expõe: window.MagazineAdmin.TemplatePicker
 *   - mount(backdrop, templates, handlers) → controller { open, close, refresh(templates) }
 *
 * handlers:
 *   - onPick(slug)
 * ============================================================================ */
;(function () {
  'use strict'

  const CAT_NAMES = {
    cover:       'Capas',
    structural:  'Estruturais',
    editorial:   'Editoriais',
    back:        'Contracapa',
    feature:     'Matérias',
    visual:      'Visuais',
    interactive: 'Interativos',
    extra:       'Extras',
  }

  function mount(backdrop, templates, handlers) {
    handlers = handlers || {}
    let tpls = templates || []
    let query = ''
    let activeCat = 'all'

    backdrop.innerHTML = `
      <div class="modal tp-modal">
        <div class="modal-header">
          <h2>Escolher template</h2>
          <button class="close" data-act="close" title="Fechar">×</button>
        </div>
        <div class="tp-toolbar">
          <input type="search" class="tp-search" data-role="search" placeholder="Buscar por nome ou slug…" />
          <div class="tp-cats" data-role="cats"></div>
        </div>
        <div class="modal-body tp-body" data-role="body"></div>
      </div>
    `

    const body = backdrop.querySelector('[data-role="body"]')
    const catsEl = backdrop.querySelector('[data-role="cats"]')
    const searchEl = backdrop.querySelector('[data-role="search"]')

    backdrop.querySelector('[data-act="close"]').addEventListener('click', close)
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close() })
    searchEl.addEventListener('input', () => { query = searchEl.value.trim().toLowerCase(); render() })

    function getCategories() {
      const set = new Set()
      tpls.forEach(t => set.add(t.category || 'extra'))
      return ['all', ...Array.from(set)]
    }

    function renderCats() {
      const cats = getCategories()
      catsEl.innerHTML = cats.map(c => `
        <button type="button" class="tp-cat" data-cat="${c}" data-active="${c === activeCat ? '1' : '0'}">
          ${c === 'all' ? 'Todos' : (CAT_NAMES[c] || c)}
        </button>
      `).join('')
      catsEl.querySelectorAll('.tp-cat').forEach(b => {
        b.addEventListener('click', () => { activeCat = b.dataset.cat; render() })
      })
    }

    function filterList() {
      return tpls.filter(t => {
        if (activeCat !== 'all' && (t.category || 'extra') !== activeCat) return false
        if (query) {
          const hay = `${t.slug} ${t.name || ''}`.toLowerCase()
          if (!hay.includes(query)) return false
        }
        return true
      })
    }

    function render() {
      renderCats()
      const list = filterList()
      if (!list.length) {
        body.innerHTML = `<div class="tp-empty">Nenhum template corresponde ao filtro.</div>`
        return
      }
      // Agrupa por categoria
      const byCat = {}
      list.forEach(t => { const c = t.category || 'extra'; (byCat[c] = byCat[c] || []).push(t) })

      body.innerHTML = Object.keys(byCat).map(cat => `
        <div class="tp-group">
          <h3 class="tp-group-title">${CAT_NAMES[cat] || cat}</h3>
          <div class="tp-grid">
            ${byCat[cat].map(renderCard).join('')}
          </div>
        </div>
      `).join('')

      body.querySelectorAll('.tp-card').forEach(card => {
        card.addEventListener('click', () => {
          if (typeof handlers.onPick === 'function') handlers.onPick(card.dataset.slug)
        })
      })
    }

    function renderCard(t) {
      const svg = (t.preview_svg || '').trim()
      const fallback = (t.slug || '').match(/^t(\d+)/)?.[1] || '?'
      const preview = svg
        ? `<div class="tp-preview svg">${svg}</div>`
        : `<div class="tp-preview proto">${fallback}</div>`
      return `
        <button type="button" class="tp-card" data-slug="${escapeAttr(t.slug)}">
          ${preview}
          <div class="tp-name">${escapeHtml(t.name || t.slug)}</div>
          <div class="tp-slug">${escapeHtml(t.slug)}</div>
        </button>
      `
    }

    function open() {
      backdrop.classList.add('open')
      searchEl.value = ''
      query = ''
      render()
      setTimeout(() => searchEl.focus(), 50)
    }

    function close() {
      backdrop.classList.remove('open')
    }

    function refresh(newTemplates) {
      tpls = newTemplates || []
      render()
    }

    function escapeHtml(s) {
      if (s == null) return ''
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    }
    function escapeAttr(s) { return escapeHtml(s) }

    return { open, close, refresh }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.TemplatePicker = { mount }
})()
