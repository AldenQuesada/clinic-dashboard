/* ============================================================================
 * Beauty & Health Magazine — Edition Review (linter edition-wide)
 *
 * Scanner client-side que percorre todas as páginas da edição e detecta
 * inconsistências cross-page que o score por página não pega:
 *   - Par t21+t22 com kickers divergentes
 *   - TOC (t04) com números fora de sequência OU contagem ≠ páginas-ostensivas
 *   - Múltiplas páginas com is_hidden_icon_page (deveria ser 0 ou 1)
 *   - Sem página de capa (t01/02/03)
 *   - Sem contracapa (t06)
 *   - Sem editorial (t05)
 *   - Páginas com template duplicado em posições adjacentes (a menos que seja spread t21→t22)
 *   - Fotos iguais (URL) em slots diferentes
 *   - cta_link sem https e sem wa.me
 *   - Edição sem capa = sem hero_asset_id
 *
 * Expõe: window.MagazineAdmin.EditionReview
 *   - audit(edition, pages) → { issues: [{severity, page_id?, message, hint?}] }
 *   - mount(host) → controller { open(edition, pages), close }
 * ============================================================================ */
;(function () {
  'use strict'

  function audit(edition, pages) {
    const issues = []
    if (!pages || !pages.length) {
      issues.push({ severity: 'err', message: 'Edição não tem páginas.' })
      return { issues }
    }

    // 1. Estrutura mínima
    const slugs = pages.map(p => p.template_slug)
    const hasCover = slugs.some(s => /^t0[123]_cover/.test(s))
    if (!hasCover) issues.push({ severity: 'err', message: 'Sem página de capa (t01/t02/t03).', hint: 'Adicione uma capa como primeira página.' })

    const hasBack = slugs.some(s => s === 't06_back_cta')
    if (!hasBack) issues.push({ severity: 'warn', message: 'Sem contracapa (t06_back_cta).', hint: 'Recomendado fechar com CTA.' })

    const hasEditorial = slugs.some(s => s === 't05_editorial_letter')
    if (!hasEditorial) issues.push({ severity: 'warn', message: 'Sem carta editorial (t05).', hint: 'Abre a edição com voz da responsável.' })

    // 2. Hidden icon único
    const hidden = pages.filter(p => p.is_hidden_icon_page)
    if (hidden.length > 1) {
      issues.push({
        severity: 'err',
        message: `Múltiplas páginas marcadas como ícone oculto (${hidden.length}).`,
        hint: 'Só uma página por edição pode conter o ícone.',
      })
    } else if (hidden.length === 0) {
      issues.push({ severity: 'warn', message: 'Nenhuma página com ícone oculto.', hint: 'Recompensa "hidden_icon" não será paga sem uma.' })
    }

    // 3. Pares t21+t22 com kicker idêntico
    for (let i = 0; i < pages.length - 1; i++) {
      const a = pages[i], b = pages[i + 1]
      if (a.template_slug === 't21_product_photo_split' && b.template_slug === 't22_product_feature_text') {
        const ka = (a.slots && a.slots.kicker) || ''
        const kb = (b.slots && b.slots.kicker) || ''
        if (ka !== kb) {
          issues.push({
            severity: 'err',
            page_id: b.id,
            message: `Spread t21+t22 com kickers divergentes: "${ka}" vs "${kb}"`,
            hint: 'Playbook exige kickers idênticos entre as duas páginas do par.',
          })
        }
      }
      if (a.template_slug === 't21_product_photo_split' && b.template_slug !== 't22_product_feature_text') {
        issues.push({
          severity: 'warn',
          page_id: a.id,
          message: 't21 (spread visual) não é seguido por t22 (spread texto).',
          hint: 'Playbook recomenda o par t21→t22.',
        })
      }
    }

    // 4. TOC consistente
    const tocIdx = pages.findIndex(p => p.template_slug === 't04_toc_editorial')
    if (tocIdx >= 0) {
      const toc = pages[tocIdx]
      const items = Array.isArray(toc.slots && toc.slots.items) ? toc.slots.items : []
      if (!items.length) {
        issues.push({ severity: 'err', page_id: toc.id, message: 'Sumário sem itens.', hint: 'Adicione pelo menos 4 itens.' })
      } else {
        const nums = items.map(i => parseInt(i && i.num, 10)).filter(n => !isNaN(n))
        const sequential = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)
        if (!sequential) {
          issues.push({
            severity: 'warn',
            page_id: toc.id,
            message: `Números do sumário fora de sequência: ${nums.join(', ')}`,
            hint: 'Playbook pede 01, 02, 03… sequencial.',
          })
        }
        // Comparação rough: qtd de itens no sumário deve estar entre 4-8
        if (items.length < 4) issues.push({ severity: 'warn', page_id: toc.id, message: `Sumário com ${items.length} itens (mín 4).` })
        if (items.length > 8) issues.push({ severity: 'warn', page_id: toc.id, message: `Sumário com ${items.length} itens (máx 8).` })
      }
    }

    // 5. cta_link inválido
    pages.forEach(p => {
      const link = p.slots && p.slots.cta_link
      if (link && typeof link === 'string' && link.length > 0) {
        if (!/^https?:\/\/|wa\.me/.test(link)) {
          issues.push({
            severity: 'warn',
            page_id: p.id,
            message: `cta_link sem https:// nem wa.me: "${link.slice(0, 40)}…"`,
            hint: 'Use URL completa (https://wa.me/55…) para o link rodar no WhatsApp.',
          })
        }
      }
    })

    // 6. Foto repetida entre slots
    const photoOccurrences = {}
    pages.forEach(p => {
      const slots = p.slots || {}
      Object.entries(slots).forEach(([k, v]) => {
        if (typeof v === 'string' && /^https?:\/\/.*\.(jpe?g|png|webp)/i.test(v)) {
          photoOccurrences[v] = photoOccurrences[v] || []
          photoOccurrences[v].push({ pageId: p.id, field: k })
        }
      })
    })
    Object.entries(photoOccurrences).forEach(([url, uses]) => {
      if (uses.length > 1) {
        issues.push({
          severity: 'warn',
          message: `Foto reutilizada em ${uses.length} lugares: ${uses.map(u => u.field).join(', ')}`,
          hint: 'Não é bug, mas vale conferir se é intencional (capa+editorial reusando retrato é OK).',
        })
      }
    })

    // 7. Duplicação adjacente de template (exceto t21+t22 spread)
    for (let i = 0; i < pages.length - 1; i++) {
      const a = pages[i], b = pages[i + 1]
      if (a.template_slug === b.template_slug) {
        issues.push({
          severity: 'warn',
          page_id: b.id,
          message: `Duas páginas ${a.template_slug} em sequência.`,
          hint: 'Alternar templates melhora ritmo editorial.',
        })
      }
    }

    // 8. Edição sem capa associada (metadados)
    if (!edition.hero_asset_id && !edition.cover_template_slug) {
      issues.push({ severity: 'info', message: 'Edição sem cover_template_slug configurado.', hint: 'Use o botão ⋯ Metadados para escolher.' })
    }

    return { issues }
  }

  function mount(host) {
    host.innerHTML = `
      <div class="er-overlay" data-open="0">
        <div class="er-modal">
          <div class="er-head">
            <div class="er-title">Revisão da edição</div>
            <div class="er-summary" data-role="summary"></div>
            <button class="er-close" data-act="close">×</button>
          </div>
          <div class="er-body">
            <div class="er-list" data-role="list"></div>
          </div>
        </div>
      </div>
    `

    const overlay = host.querySelector('.er-overlay')
    const list = host.querySelector('[data-role="list"]')
    const summary = host.querySelector('[data-role="summary"]')

    host.querySelector('[data-act="close"]').addEventListener('click', close)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
    document.addEventListener('keydown', (e) => {
      if (overlay.dataset.open === '1' && e.key === 'Escape') close()
    })

    function open(edition, pages) {
      const { issues } = audit(edition, pages)
      const errs  = issues.filter(i => i.severity === 'err').length
      const warns = issues.filter(i => i.severity === 'warn').length
      const infos = issues.filter(i => i.severity === 'info').length

      summary.innerHTML = `
        <span class="er-pill err" data-n="${errs}">${errs} erros</span>
        <span class="er-pill warn" data-n="${warns}">${warns} avisos</span>
        <span class="er-pill info" data-n="${infos}">${infos} info</span>
      `

      if (!issues.length) {
        list.innerHTML = `<div class="er-ok">✓ Nenhum problema encontrado. Edição pronta para publicar.</div>`
      } else {
        list.innerHTML = issues.map((i, idx) => `
          <div class="er-issue" data-sev="${i.severity}">
            <div class="er-issue-main">
              <span class="er-dot"></span>
              <span class="er-msg">${escapeHtml(i.message)}</span>
              ${i.page_id ? `<code class="er-pg">pg ${shortId(i.page_id)}</code>` : ''}
            </div>
            ${i.hint ? `<div class="er-hint">${escapeHtml(i.hint)}</div>` : ''}
          </div>
        `).join('')
      }

      overlay.dataset.open = '1'
    }

    function close() {
      overlay.dataset.open = '0'
    }

    function shortId(uuid) { return String(uuid).slice(0, 8) }
    function escapeHtml(s) {
      if (s == null) return ''
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    }

    return { open, close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.EditionReview = { audit, mount }
})()
