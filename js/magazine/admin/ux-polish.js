/* ============================================================================
 * Beauty & Health Magazine — UX Polish
 *
 * Agrupa melhorias de UX do editor:
 *   - Ctrl/Cmd+S salva a página atual
 *   - ↑/↓ navega entre páginas na lista lateral
 *   - Busca/filtro na lista lateral
 *   - Badge 📍 em páginas com hidden_icon
 *   - Picker de template abre automático em edições vazias
 *   - Picker mostra contexto "Inserir antes de pg X" no header
 *   - Botão "Desfazer" cross-field (reverte slots ao último save)
 *   - Onboarding mini-tour (1ª visita)
 *
 * Expõe: window.MagazineAdmin.UxPolish
 *   - init(handlers) — configura tudo
 *
 * handlers:
 *   - onSave()       — invocar saveSlots
 *   - onSelectPage(id)
 *   - getPages()     — retorna state.pages
 *   - getCurrentPageId()
 *   - onOpenPicker() — abre template picker normal
 *   - onUndoLastSave() — reverte página atual ao slots salvo
 * ============================================================================ */
;(function () {
  'use strict'

  const LS_ONBOARDING = 'magazine_admin_onboarding_done'

  function init(handlers) {
    handlers = handlers || {}
    bindKeyboard(handlers)
    enhancePageList(handlers)
    enhanceTemplatePicker(handlers)
    attachUndoButton(handlers)
    maybeShowOnboarding(handlers)
    enhanceHiddenBadge(handlers)
  }

  // ── Ctrl+S + arrows ────────────────────────────────────────────────────
  function bindKeyboard(handlers) {
    document.addEventListener('keydown', (e) => {
      // Ignora se focus em modal sobreposto (fullscreen, crop, etc.)
      if (document.querySelector('.fsp-overlay[data-open="1"], .ic-overlay[data-open="1"], .ai-overlay[data-open="1"], .er-overlay[data-open="1"], .dp-overlay[data-open="1"], .ab-overlay[data-open="1"], .em-modal[data-open="1"], .modal-backdrop.open')) return

      const isMac = /mac/i.test(navigator.platform)
      const mod = isMac ? e.metaKey : e.ctrlKey

      // Ctrl/Cmd + S — salvar
      if (mod && e.key === 's') {
        e.preventDefault()
        if (typeof handlers.onSave === 'function') handlers.onSave()
        return
      }

      // Ignora setas quando usuário está digitando
      const t = e.target
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (typing) return

      // ↑ / ↓ — navegar páginas
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const pages = (typeof handlers.getPages === 'function') ? handlers.getPages() : []
        if (!pages.length) return
        const curId = (typeof handlers.getCurrentPageId === 'function') ? handlers.getCurrentPageId() : null
        const idx = pages.findIndex(p => p.id === curId)
        const next = e.key === 'ArrowUp' ? Math.max(0, idx - 1) : Math.min(pages.length - 1, idx + 1)
        if (next !== idx && pages[next]) {
          e.preventDefault()
          if (typeof handlers.onSelectPage === 'function') handlers.onSelectPage(pages[next].id)
        }
      }
    })
  }

  // ── Busca na lista de páginas ─────────────────────────────────────────
  function enhancePageList(handlers) {
    // Injeta campo de busca no panel-header da lista de páginas
    const header = document.querySelector('.panel .panel-header')
    if (!header || header.querySelector('[data-role="page-search"]')) return

    const searchWrap = document.createElement('div')
    searchWrap.className = 'page-search-wrap'
    searchWrap.innerHTML = `
      <input type="search" data-role="page-search" placeholder="Buscar página…" />
    `
    // Inserir abaixo do header (como sub-row). Para simplificar, ancoramos no panel-body.
    const pageList = document.getElementById('pageList')
    if (pageList) pageList.parentElement.insertBefore(searchWrap, pageList)

    const input = searchWrap.querySelector('[data-role="page-search"]')
    input.addEventListener('input', () => filterPageList(input.value.trim().toLowerCase()))
  }

  function filterPageList(q) {
    const items = document.querySelectorAll('#pageList .page-item')
    items.forEach(el => {
      if (!q) { el.style.display = ''; return }
      const name = el.querySelector('.tpl-name')?.textContent.toLowerCase() || ''
      const slug = el.querySelector('.tpl-slug')?.textContent.toLowerCase() || ''
      el.style.display = (name.includes(q) || slug.includes(q)) ? '' : 'none'
    })
  }

  // ── Badge 📍 em páginas com hidden_icon_page ──────────────────────────
  function enhanceHiddenBadge(handlers) {
    // Observa mutações no pageList para adicionar badge 📍
    const pageList = document.getElementById('pageList')
    if (!pageList) return
    const inject = () => {
      const pages = (typeof handlers.getPages === 'function') ? handlers.getPages() : []
      pages.forEach(p => {
        if (!p.is_hidden_icon_page) return
        const el = pageList.querySelector(`.page-item[data-page-id="${p.id}"]`)
        if (!el || el.querySelector('.hidden-icon-mark')) return
        const mark = document.createElement('span')
        mark.className = 'hidden-icon-mark'
        mark.textContent = '📍'
        mark.title = 'Ícone oculto está nesta página'
        const meta = el.querySelector('.meta')
        if (meta) meta.appendChild(mark)
      })
    }
    const obs = new MutationObserver(inject)
    obs.observe(pageList, { childList: true, subtree: false })
    inject()
  }

  // ── Template picker: auto-open + insert-mode banner ───────────────────
  function enhanceTemplatePicker(handlers) {
    // Auto-abre picker quando edição está vazia (depois do load)
    const openIfEmpty = () => {
      const pages = (typeof handlers.getPages === 'function') ? handlers.getPages() : []
      if (!pages.length && typeof handlers.onOpenPicker === 'function') {
        // Só abre se houver edição selecionada
        const hasEdition = !!document.querySelector('#editionTitle:not(:disabled)')
        if (hasEdition) handlers.onOpenPicker()
      }
    }
    // Monitora abertura de edição (via select change)
    const editionSelect = document.getElementById('editionSelect')
    if (editionSelect) {
      editionSelect.addEventListener('change', () => setTimeout(openIfEmpty, 600))
    }

    // Banner "Inserir antes de página X" no header do picker
    // O picker é rerenderizado a cada open — observamos data-open
    const modal = document.getElementById('templateModal')
    if (!modal) return
    const tpObs = new MutationObserver(() => {
      if (!modal.classList.contains('open')) return
      updatePickerBanner(modal, handlers)
    })
    tpObs.observe(modal, { attributes: true, attributeFilter: ['class'] })
  }

  function updatePickerBanner(modal, handlers) {
    const header = modal.querySelector('.modal-header h2')
    if (!header) return
    const mode = (typeof handlers.getPickerInsertMode === 'function') ? handlers.getPickerInsertMode() : null
    // Remove banner anterior
    const existing = modal.querySelector('.tp-insert-banner')
    if (existing) existing.remove()
    if (mode && typeof mode === 'object' && mode.at != null) {
      const banner = document.createElement('div')
      banner.className = 'tp-insert-banner'
      banner.textContent = `Inserindo nova página na posição ${mode.at + 1}`
      header.insertAdjacentElement('afterend', banner)
    }
  }

  // ── Botão ↶ Desfazer (reverte ao último salvo) ────────────────────────
  function attachUndoButton(handlers) {
    // Anexa no slots-actions a cada render (observa mutações no slotsForm)
    const slotsForm = document.getElementById('slotsForm')
    if (!slotsForm) return
    const inject = () => {
      const actions = slotsForm.querySelector('.slots-actions')
      if (!actions || actions.querySelector('.undo-btn')) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'undo-btn'
      btn.title = 'Reverter ao último estado salvo (Ctrl+Z não cobre entre campos)'
      btn.textContent = '↶ Desfazer'
      btn.addEventListener('click', () => {
        if (typeof handlers.onUndoLastSave === 'function') handlers.onUndoLastSave()
      })
      actions.insertBefore(btn, actions.querySelector('#autosaveIndicator'))
    }
    const obs = new MutationObserver(inject)
    obs.observe(slotsForm, { childList: true, subtree: false })
    inject()
  }

  // ── Onboarding mini-tour ──────────────────────────────────────────────
  function maybeShowOnboarding(handlers) {
    try {
      if (localStorage.getItem(LS_ONBOARDING) === '1') return
    } catch (e) { return }

    const steps = [
      {
        target: '#pageList',
        title: 'Lista de páginas',
        text: 'Arraste para reordenar · ↑/↓ navega · busca no topo · badge colorido mostra validade.',
      },
      {
        target: '.slots-actions',
        title: 'Autosave + Desfazer',
        text: 'Suas mudanças salvam sozinhas 1.5s depois. Ctrl+S salva imediato. ↶ reverte ao último salvo.',
      },
      {
        target: '.page-controls',
        title: 'Segment scope + Ícone oculto',
        text: 'Escolha quem vê cada página (VIP, dormente etc.). Só uma por edição pode ter o ícone.',
      },
      {
        target: '#reviewBtn',
        title: 'Revisar edição',
        text: 'Antes de publicar: scanner de inconsistências (kickers quebrados, TOC fora de ordem, etc.)',
      },
      {
        target: '#dispatchBtn',
        title: 'Preview WhatsApp',
        text: 'Simula as mensagens D+0/D+1/D+7 com link real + UTM automático.',
      },
    ]

    let i = 0
    const overlay = document.createElement('div')
    overlay.className = 'onb-overlay'
    overlay.innerHTML = `
      <div class="onb-card">
        <div class="onb-step" data-role="step">1/${steps.length}</div>
        <h3 data-role="title"></h3>
        <p data-role="text"></p>
        <div class="onb-actions">
          <button data-act="skip">Pular</button>
          <button data-act="next" class="primary">Próximo →</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    const titleEl = overlay.querySelector('[data-role="title"]')
    const textEl  = overlay.querySelector('[data-role="text"]')
    const stepEl  = overlay.querySelector('[data-role="step"]')
    const nextBtn = overlay.querySelector('[data-act="next"]')
    overlay.querySelector('[data-act="skip"]').addEventListener('click', finish)
    nextBtn.addEventListener('click', next)

    function render() {
      const s = steps[i]
      titleEl.textContent = s.title
      textEl.textContent = s.text
      stepEl.textContent = `${i + 1} / ${steps.length}`
      nextBtn.textContent = i === steps.length - 1 ? 'Concluir' : 'Próximo →'
      // Highlight target (opcional — sem scroll/posicionamento elaborado pra manter simples)
      document.querySelectorAll('.onb-highlight').forEach(el => el.classList.remove('onb-highlight'))
      const target = document.querySelector(s.target)
      if (target) target.classList.add('onb-highlight')
    }
    function next() {
      if (i < steps.length - 1) { i++; render() } else finish()
    }
    function finish() {
      try { localStorage.setItem(LS_ONBOARDING, '1') } catch (e) {}
      overlay.remove()
      document.querySelectorAll('.onb-highlight').forEach(el => el.classList.remove('onb-highlight'))
    }
    // Delay para DOM estabilizar
    setTimeout(render, 800)
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.UxPolish = { init }
})()
