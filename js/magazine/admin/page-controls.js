/* ============================================================================
 * Beauty & Health Magazine — Page Controls
 *
 * Controles por página que ficam acima do form de slots:
 *   - segment_scope (chips)
 *   - is_hidden_icon_page (toggle · mutuamente exclusivo na edição)
 *   - duplicar · inserir acima · inserir abaixo · remover
 *
 * Expõe: window.MagazineAdmin.PageControls
 *   - render(container, page, pages, handlers) → controller
 *
 * handlers:
 *   - onUpdateSegment(segmentScope[])
 *   - onToggleHiddenIcon(bool)
 *   - onDuplicate()
 *   - onInsertAt('above'|'below')
 *   - onRemove()
 * ============================================================================ */
;(function () {
  'use strict'

  const SEGMENTS = [
    { key: 'all',       label: 'Todos',      hint: 'Visível a qualquer leitor' },
    { key: 'vip',       label: 'VIP',        hint: 'Recência alta + alta frequência' },
    { key: 'active',    label: 'Ativo',      hint: 'Leads/pacientes ativos' },
    { key: 'at_risk',   label: 'Em risco',   hint: 'Risco de perda · alta prioridade' },
    { key: 'dormant',   label: 'Dormente',   hint: 'Sem contato recente' },
    { key: 'lead',      label: 'Lead',       hint: 'Ainda não converteu' },
  ]

  function escapeHtml(s) {
    if (s == null) return ''
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  function render(container, page, pages, handlers) {
    handlers = handlers || {}
    if (!page) { container.innerHTML = ''; return createStub() }

    const segs = Array.isArray(page.segment_scope) && page.segment_scope.length
      ? page.segment_scope.slice()
      : ['all']
    const isHidden = !!page.is_hidden_icon_page

    container.innerHTML = `
      <div class="page-controls">
        <div class="pc-section">
          <div class="pc-label">Visível para</div>
          <div class="pc-chips" data-role="segments">
            ${SEGMENTS.map(s => `
              <button type="button" class="pc-chip"
                data-seg="${s.key}"
                data-active="${segs.includes(s.key) ? '1' : '0'}"
                title="${escapeHtml(s.hint)}">${escapeHtml(s.label)}</button>
            `).join('')}
          </div>
        </div>

        <div class="pc-section">
          <div class="pc-label">Ícone oculto</div>
          <label class="pc-toggle">
            <input type="checkbox" data-role="hidden-icon" ${isHidden ? 'checked' : ''}/>
            <span class="pc-toggle-track"><span class="pc-toggle-thumb"></span></span>
            <span class="pc-toggle-text">
              ${isHidden
                ? 'Esta página contém o ícone oculto'
                : 'Marcar como página do ícone oculto'}
            </span>
          </label>
          <div class="pc-hint">Apenas uma página por edição pode ter o ícone. Marcar aqui desmarca das outras.</div>
        </div>

        <div class="pc-section">
          <div class="pc-label">Ações</div>
          <div class="pc-actions">
            <button type="button" class="pc-action" data-act="dup"          title="Duplicar esta página (cópia logo abaixo)">Duplicar</button>
            <button type="button" class="pc-action" data-act="insert-above" title="Adicionar nova página acima desta">+ Acima</button>
            <button type="button" class="pc-action" data-act="insert-below" title="Adicionar nova página abaixo desta">+ Abaixo</button>
            <button type="button" class="pc-action danger" data-act="del"   title="Remover esta página">Remover</button>
          </div>
        </div>
      </div>
    `

    // ── Wiring ──
    const chipsRoot = container.querySelector('[data-role="segments"]')
    chipsRoot.querySelectorAll('.pc-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.seg
        const active = chip.dataset.active === '1'
        let next = segs.slice()
        if (key === 'all') {
          next = active ? [] : ['all']
        } else {
          next = next.filter(k => k !== 'all')
          if (active) next = next.filter(k => k !== key)
          else next.push(key)
        }
        if (!next.length) next = ['all']
        syncChips(chipsRoot, next)
        segs.length = 0; segs.push(...next)
        if (typeof handlers.onUpdateSegment === 'function') handlers.onUpdateSegment(next)
      })
    })

    const hiddenInput = container.querySelector('[data-role="hidden-icon"]')
    hiddenInput.addEventListener('change', () => {
      if (typeof handlers.onToggleHiddenIcon === 'function') {
        handlers.onToggleHiddenIcon(hiddenInput.checked)
      }
    })

    container.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act
        if (act === 'dup' && handlers.onDuplicate) handlers.onDuplicate()
        if (act === 'insert-above' && handlers.onInsertAt) handlers.onInsertAt('above')
        if (act === 'insert-below' && handlers.onInsertAt) handlers.onInsertAt('below')
        if (act === 'del' && handlers.onRemove) handlers.onRemove()
      })
    })

    return {
      destroy: () => { container.innerHTML = '' },
      getSegments: () => segs.slice(),
    }
  }

  function syncChips(root, activeKeys) {
    root.querySelectorAll('.pc-chip').forEach(c => {
      c.dataset.active = activeKeys.includes(c.dataset.seg) ? '1' : '0'
    })
  }

  function createStub() {
    return { destroy: () => {}, getSegments: () => ['all'] }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.PageControls = { render, SEGMENTS }
})()
