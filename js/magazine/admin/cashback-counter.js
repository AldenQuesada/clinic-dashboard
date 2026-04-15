/* ============================================================================
 * Beauty & Health Magazine — Cashback Counter
 *
 * Calcula o cashback máximo possível por leitora baseado nas páginas da edição
 * (tabela de valores vem de magazine_rpc_reader.sql).
 *
 * Tabela:
 *   open         = R$ 10    (sempre)
 *   read_80      = R$ 20    (sempre)
 *   quiz         = R$ 30    (se houver t16_quiz_cta)
 *   hidden_icon  = R$ 25    (se alguma página is_hidden_icon_page=true)
 *   shared       = R$ 15    (sempre potencial · share da edição)
 *   invite       = R$ 50    (sempre potencial · indicação)
 *   vip_access   = R$ 0     (sem valor direto · só acesso exclusivo)
 *
 * Expõe: window.MagazineAdmin.CashbackCounter
 *   - compute(pages) → { total, breakdown[] }
 *   - mount(chipEl) → controller { update(pages) }
 * ============================================================================ */
;(function () {
  'use strict'

  const REWARDS = {
    open:        { value: 10, always: true,  label: 'Abertura' },
    read_80:     { value: 20, always: true,  label: 'Leu 80%' },
    quiz:        { value: 30, always: false, label: 'Quiz', triggerTemplate: 't16_quiz_cta' },
    hidden_icon: { value: 25, always: false, label: 'Ícone oculto', triggerFlag: 'is_hidden_icon_page' },
    shared:      { value: 15, always: true,  label: 'Compartilhou' },
    invite:      { value: 50, always: true,  label: 'Indicou amiga' },
  }

  function compute(pages) {
    pages = pages || []
    const breakdown = []
    let total = 0
    Object.entries(REWARDS).forEach(([key, r]) => {
      let active = r.always
      if (!active && r.triggerTemplate) {
        active = pages.some(p => p.template_slug === r.triggerTemplate)
      }
      if (!active && r.triggerFlag) {
        active = pages.some(p => p[r.triggerFlag])
      }
      breakdown.push({ key, label: r.label, value: r.value, active })
      if (active) total += r.value
    })
    return { total, breakdown }
  }

  function mount(chipEl) {
    if (!chipEl) return { update: () => {} }
    let currentBreakdown = null

    chipEl.addEventListener('click', () => {
      if (!currentBreakdown) return
      showTooltip()
    })

    let tooltip = null
    function showTooltip() {
      if (tooltip) { tooltip.remove(); tooltip = null; return }
      tooltip = document.createElement('div')
      tooltip.className = 'cb-tooltip'
      tooltip.innerHTML = `
        <div class="cb-tt-title">Cashback máximo por leitora</div>
        <ul>
          ${currentBreakdown.map(b => `
            <li data-active="${b.active ? '1' : '0'}">
              <span>${b.label}</span>
              <span class="cb-val">${b.active ? `R$ ${b.value}` : '—'}</span>
            </li>
          `).join('')}
        </ul>
      `
      document.body.appendChild(tooltip)
      const rect = chipEl.getBoundingClientRect()
      tooltip.style.top  = (rect.bottom + 8) + 'px'
      tooltip.style.left = Math.min(window.innerWidth - 260, rect.left) + 'px'
      setTimeout(() => {
        document.addEventListener('click', closeOnce, { once: true })
      }, 50)
    }
    function closeOnce(e) {
      if (!tooltip) return
      if (e.target !== chipEl && !tooltip.contains(e.target)) {
        tooltip.remove()
        tooltip = null
      } else {
        document.addEventListener('click', closeOnce, { once: true })
      }
    }

    function update(pages) {
      const r = compute(pages)
      currentBreakdown = r.breakdown
      chipEl.textContent = `💰 até R$ ${r.total}`
      chipEl.title = 'Cashback máximo potencial · clique para detalhes'
    }

    return { update }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.CashbackCounter = { compute, mount }
})()
