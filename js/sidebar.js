/**
 * ClinicAI — Sidebar Navigation Engine
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  RESPONSABILIDADES DESTE MÓDULO                                      ║
 * ║                                                                      ║
 * ║  1. Renderizar o sidebar a partir de NAV_CONFIG (nav-config.js)      ║
 * ║  2. Filtrar itens por papel do usuário (role) e plano (plan)         ║
 * ║  3. Gerenciar navegação: acordeão, flyout, active state, breadcrumb  ║
 * ║  4. Trocar páginas (navigateTo)                                       ║
 * ║  5. Reconstruir o menu quando o papel/plano mudar (pós-login)        ║
 * ║                                                                      ║
 * ║  DEPENDÊNCIAS (devem carregar antes):                                ║
 * ║    utils.js     → utils gerais                                       ║
 * ║    auth.js      → getUser()                                          ║
 * ║    nav-config.js → NAV_CONFIG, ROLES, PLANS                          ║
 * ║                                                                      ║
 * ║  API PÚBLICA (window.*):                                             ║
 * ║    navigateTo(pageId)          — troca de página                     ║
 * ║    handleSubItemClick(el)      — ativa subitem e navega              ║
 * ║    closeNavFlyout()            — fecha flyout do sidebar colapsado   ║
 * ║    buildSidebar(user)          — reconstrói o menu (após login etc.) ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

;(function () {
  'use strict'

  if (window._clinicaiSidebarLoaded) {
    console.error('[ClinicAI/sidebar] sidebar.js carregado mais de uma vez. Verifique o index.html.')
    return
  }
  window._clinicaiSidebarLoaded = true

  // ══════════════════════════════════════════════════════════════
  // 1. CHECAGEM DE PERMISSÃO
  // ══════════════════════════════════════════════════════════════

  /**
   * Verifica se o usuário tem permissão para ver um item de nav.
   *
   * Regras:
   *   - roles[] vazio  → sem restrição de papel, todos passam
   *   - roles[] set    → user.role deve estar na lista
   *   - plans[] vazio  → sem restrição de plano, todos passam
   *   - plans[] set    → user.plan deve estar na lista
   *   - user null/undefined → modo demo/dev, passa tudo (não há login)
   *
   * @param {{ roles?: string[], plans?: string[] }} item   — seção ou página
   * @param {{ role?: string, plan?: string }|null}  user   — usuário atual
   * @returns {boolean}
   */
  function _userCan(item, user) {
    if (!user) return true  // sem usuário = modo dev/demo → mostra tudo

    if (item.roles && item.roles.length > 0) {
      if (!item.roles.includes(user.role)) return false
    }

    if (item.plans && item.plans.length > 0) {
      // Suporta plano em user.plan (flat) ou user.tenant.plan (nested — formato do backend)
      const userPlan = user.plan || user.tenant?.plan
      if (!item.plans.includes(userPlan)) return false
    }

    return true
  }

  // ══════════════════════════════════════════════════════════════
  // 2. RENDERIZAÇÃO DO HTML
  // ══════════════════════════════════════════════════════════════

  /**
   * Escapa caracteres especiais para uso seguro em HTML.
   * Previne XSS mesmo que strings do config contenham caracteres perigosos.
   *
   * @param {*} str
   * @returns {string}
   */
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  /**
   * Gera o HTML completo do nav filtrado pelas permissões do usuário.
   *
   * @param {{ role?: string, plan?: string }|null} user
   * @returns {string} HTML pronto para ser injetado em #sidebarNav
   */
  function _buildNavHTML(user) {
    const config = window.NAV_CONFIG

    if (!Array.isArray(config)) {
      console.error(
        '[ClinicAI/sidebar] window.NAV_CONFIG não é um array. ' +
        'Certifique-se que nav-config.js carrega antes de sidebar.js.',
      )
      return ''
    }

    let html = ''

    config.forEach(section => {
      // ── Filtro de seção ──────────────────────────────────────
      if (!_userCan(section, user)) return

      // ── Filtro de páginas ────────────────────────────────────
      const visiblePages = section.pages.filter(page => {
        // Página herda roles/plans da seção quando não os define explicitamente.
        const effectiveRoles = page.roles !== undefined ? page.roles : section.roles
        const effectivePlans = page.plans !== undefined ? page.plans : section.plans
        return _userCan({ roles: effectiveRoles, plans: effectivePlans }, user)
      })

      // Seção sem páginas visíveis não aparece no menu
      if (!visiblePages.length) return

      // ── Renderiza a seção ────────────────────────────────────
      html += `<div class="nav-section">`
      html += `<div class="nav-item" data-section="${_esc(section.section)}">`
      html += `<div class="nav-item-main">`
      html += `<span class="nav-icon"><i data-feather="${_esc(section.icon)}"></i></span>`
      html += `<span class="nav-label">${_esc(section.label)}</span>`
      html += `<span class="nav-arrow"><i data-feather="chevron-right"></i></span>`
      html += `</div>`
      html += `<ul class="nav-subitems">`

      visiblePages.forEach(page => {
        const highlightCls = page.highlight     ? ' nav-subitem-highlight' : ''
        const activeCls    = page.defaultActive ? ' active'               : ''

        html += `<li`
        html += ` class="nav-subitem${highlightCls}${activeCls}"`
        html += ` data-page="${_esc(page.page)}"`
        html += ` data-breadcrumb="${_esc(page.breadcrumb)}"`
        html += `>${_esc(page.label)}</li>`
      })

      html += `</ul></div></div>`
    })

    return html
  }

  // ══════════════════════════════════════════════════════════════
  // 3. BUILD PÚBLICO
  // ══════════════════════════════════════════════════════════════

  /**
   * (Re)constrói o sidebar nav filtrando por permissões do usuário.
   * Seguro para chamar múltiplas vezes (ex: após login, troca de plano).
   *
   * O estado de navegação atual é preservado: se a página ativa ainda
   * é visível após rebuild, ela permanece ativa. Caso contrário, o
   * sistema navega para o dashboard.
   *
   * @param {{ role?: string, plan?: string }|null} user — null = modo dev
   */
  function buildSidebar(user) {
    const nav = document.getElementById('sidebarNav')
    if (!nav) {
      console.warn('[ClinicAI/sidebar] #sidebarNav não encontrado no DOM.')
      return
    }

    // Prioridade: ?page= na URL > subitem ativo > localStorage > null
    const urlPage = new URLSearchParams(window.location.search).get('page')
    const previousPage = urlPage
      || document.querySelector('.nav-subitem.active')?.dataset.page
      || (() => { try { return localStorage.getItem('clinicai_last_page') } catch { return null } })()
      || null

    // Injeta o novo HTML filtrado
    nav.innerHTML = _buildNavHTML(user)

    // Reinicializa os ícones Feather — escopo: apenas o nav reconstruído
    _replaceFeatherIcons(nav)

    // Anexa todos os event listeners ao novo DOM
    _attachNavEvents()

    // Tenta restaurar a página que estava ativa antes do rebuild / reload
    // Se tem previousPage, NAO abre dashboard primeiro (evita flash)
    if (previousPage) {
      const restoredItem = nav.querySelector(`.nav-subitem[data-page="${previousPage}"]`)
      if (restoredItem) {
        // Marca o estado visual do sidebar
        document.querySelectorAll('.nav-subitem').forEach(si => si.classList.remove('active'))
        restoredItem.classList.add('active')
        const parentNavItem = restoredItem.closest('.nav-item')
        if (parentNavItem) {
          document.querySelectorAll('.nav-item').forEach(ni => ni.classList.remove('has-active'))
          parentNavItem.classList.add('has-active', 'open')
        }
        _updateBreadcrumb(restoredItem.dataset.breadcrumb || restoredItem.textContent)
        // Garante que o conteúdo da página também seja exibido (necessário após F5)
        navigateTo(previousPage)
      } else {
        // Página não está mais visível após troca de papel → volta para dashboard
        _openDefaultSection()
        navigateTo('dashboard-overview')
      }
    } else {
      // Sem página anterior → abre dashboard
      _openDefaultSection()
      navigateTo('dashboard-overview')
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 4. EVENT LISTENERS DE NAVEGAÇÃO
  // ══════════════════════════════════════════════════════════════

  /* Timer para fechar o flyout com delay (evita fechar ao mover o mouse) */
  let _flyoutCloseTimer = null

  function _cancelFlyoutClose() {
    if (_flyoutCloseTimer) { clearTimeout(_flyoutCloseTimer); _flyoutCloseTimer = null }
  }

  function _scheduleFlyoutClose() {
    _cancelFlyoutClose()
    _flyoutCloseTimer = setTimeout(closeNavFlyout, 120)
  }

  /**
   * Anexa todos os event listeners ao DOM recém-renderizado.
   * Chamado internamente pelo buildSidebar — não use diretamente.
   */
  function _attachNavEvents() {
    const flyout = document.getElementById('navFlyout')

    // ── Itens principais (header de cada seção) ──────────────
    document.querySelectorAll('.nav-item').forEach(navItem => {
      const mainEl = navItem.querySelector('.nav-item-main')
      if (!mainEl) return

      // Sidebar expandida: clique alterna o acordeão
      mainEl.addEventListener('click', () => {
        if (!document.body.classList.contains('sidebar-collapsed')) {
          navItem.classList.toggle('open')
        }
      })

      // Sidebar colapsada: hover abre o flyout lateral
      mainEl.addEventListener('mouseenter', () => {
        if (document.body.classList.contains('sidebar-collapsed')) {
          _cancelFlyoutClose()
          _showNavFlyout(navItem, mainEl)
        }
      })

      mainEl.addEventListener('mouseleave', () => {
        if (document.body.classList.contains('sidebar-collapsed')) {
          _scheduleFlyoutClose()
        }
      })
    })

    // ── Flyout: mantém aberto enquanto o mouse está sobre ele ──
    if (flyout) {
      flyout.addEventListener('mouseenter', _cancelFlyoutClose)
      flyout.addEventListener('mouseleave', _scheduleFlyoutClose)
    }

    // ── Sub-itens: clique navega para a página ─────────────────
    document.querySelectorAll('.nav-subitem').forEach(subItem => {
      subItem.addEventListener('click', (e) => {
        e.stopPropagation()
        handleSubItemClick(subItem)
      })
    })
  }

  // ══════════════════════════════════════════════════════════════
  // 5. FLYOUT (sidebar colapsada)
  // ══════════════════════════════════════════════════════════════

  /**
   * Exibe o painel flyout ao lado de um item do sidebar colapsado.
   * Posicionado automaticamente para não sair da viewport.
   *
   * @param {HTMLElement} navItem — .nav-item que acionou o hover
   * @param {HTMLElement} mainEl  — .nav-item-main (usado para posição)
   */
  function _showNavFlyout(navItem, mainEl) {
    const flyout = document.getElementById('navFlyout')
    if (!flyout) return

    const subitems = navItem.querySelectorAll('.nav-subitem')
    if (!subitems.length) return

    const label = navItem.querySelector('.nav-label')?.textContent.trim() || ''

    // Monta HTML do flyout
    let html = `<div class="nav-flyout-title">${_esc(label)}</div><ul class="nav-flyout-list">`
    subitems.forEach(si => {
      const activeCls    = si.classList.contains('active')               ? ' nav-flyout-active'    : ''
      const highlightCls = si.classList.contains('nav-subitem-highlight') ? ' nav-flyout-highlight' : ''
      html += `<li`
      html += ` class="nav-flyout-item${activeCls}${highlightCls}"`
      html += ` data-page="${_esc(si.dataset.page || '')}"`
      html += ` data-breadcrumb="${_esc(si.dataset.breadcrumb || si.textContent.trim())}"`
      html += `>${_esc(si.textContent.trim())}</li>`
    })
    html += '</ul>'
    flyout.innerHTML = html

    // Posiciona alinhado com o item hovered
    const rect = mainEl.getBoundingClientRect()
    flyout.style.top  = `${rect.top}px`
    flyout.style.left = '64px'
    flyout.classList.add('active')
    flyout.dataset.openSection = navItem.dataset.section || ''

    // Ajuste de posição caso ultrapasse a base da viewport
    requestAnimationFrame(() => {
      const maxTop = window.innerHeight - flyout.offsetHeight - 8
      flyout.style.top = `${Math.min(rect.top, maxTop)}px`
    })

    // Cliques nos itens do flyout espelham o comportamento do sidebar normal
    flyout.querySelectorAll('.nav-flyout-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation()
        const realSub = document.querySelector(`.nav-subitem[data-page="${item.dataset.page}"]`)
        if (realSub) handleSubItemClick(realSub)
        closeNavFlyout()
      })
    })
  }

  /**
   * Fecha o flyout do sidebar colapsado.
   * Exportado para que initGlobalClickHandler (app.js) possa fechar ao
   * clicar fora do sidebar.
   */
  function closeNavFlyout() {
    _cancelFlyoutClose()
    const flyout = document.getElementById('navFlyout')
    if (flyout) {
      flyout.classList.remove('active')
      flyout.dataset.openSection = ''
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 6. CLIQUE EM SUB-ITEM
  // ══════════════════════════════════════════════════════════════

  /**
   * Processa o clique em um sub-item:
   *   1. Remove active de todos os sub-itens
   *   2. Marca o clicado como active
   *   3. Marca o nav-item pai como has-active
   *   4. Atualiza o breadcrumb
   *   5. Troca a página visível
   *
   * Exportado porque o flyout e outros módulos (ex: botão "Voltar" do
   * placeholder) precisam acionar a navegação programaticamente.
   *
   * @param {HTMLElement} subItem — elemento .nav-subitem clicado
   */
  function handleSubItemClick(subItem) {
    // Atualiza estado visual dos sub-itens
    document.querySelectorAll('.nav-subitem').forEach(si => si.classList.remove('active'))
    subItem.classList.add('active')

    // Atualiza has-active no nav-item pai
    document.querySelectorAll('.nav-item').forEach(ni => ni.classList.remove('has-active'))
    const parentNavItem = subItem.closest('.nav-item')
    if (parentNavItem) parentNavItem.classList.add('has-active')

    // Breadcrumb e troca de página
    _updateBreadcrumb(subItem.dataset.breadcrumb || subItem.textContent)
    const pageId = subItem.dataset.page
    if (pageId) navigateTo(pageId)
  }

  // ══════════════════════════════════════════════════════════════
  // 7. BREADCRUMB
  // ══════════════════════════════════════════════════════════════

  /**
   * Atualiza os elementos de breadcrumb no header.
   * Formato esperado: "Seção > Página" ou "Seção > Sub > Página".
   *
   * @param {string} breadcrumb
   */
  function _updateBreadcrumb(breadcrumb) {
    const parts  = breadcrumb.split('>').map(p => p.trim())
    const textEl = document.getElementById('breadcrumbText')
    const currEl = document.getElementById('breadcrumbCurrent')

    if (parts.length >= 2) {
      if (textEl) textEl.textContent = parts[0]
      if (currEl) currEl.textContent = parts[parts.length - 1]
    } else {
      if (textEl) textEl.textContent = 'Dashboard'
      if (currEl) currEl.textContent = breadcrumb
    }

    _replaceFeatherIcons()
  }

  // ══════════════════════════════════════════════════════════════
  // 8. TROCA DE PÁGINA
  // ══════════════════════════════════════════════════════════════

  /**
   * Exibe a página com data-page correspondente ao pageId.
   * Páginas não implementadas exibem o placeholder com o título correto.
   *
   * @param {string} pageId — valor do data-page do sub-item
   */
  function navigateTo(pageId) {
    // Auto-collapse sidebar ao navegar
    document.body.classList.add('sidebar-collapsed')
    try { localStorage.setItem('sidebar_collapsed', '1') } catch {}

    // Persiste a página atual para sobreviver a reloads (F5)
    try { localStorage.setItem('clinicai_last_page', pageId) } catch {}

    // Oculta todas as páginas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))

    const targetPage = document.getElementById(`page-${pageId}`)

    let activePage = null

    if (targetPage) {
      targetPage.classList.add('active')
      activePage = targetPage
    } else {
      // Página não implementada → mostra placeholder com título correto
      const placeholder = document.getElementById('page-placeholder')
      if (placeholder) {
        const activeSubItem = document.querySelector('.nav-subitem.active')
        const titleEl = document.getElementById('placeholderTitle')
        if (titleEl && activeSubItem) {
          titleEl.textContent = activeSubItem.textContent.trim()
        }
        placeholder.classList.add('active')
        activePage = placeholder
      }
    }

    // Cirúrgico: reprocessa apenas os ícones da página recém-exibida
    _replaceFeatherIcons(activePage)

    // Hooks de módulos externos para páginas com init especial
    if (pageId === 'growth-partners' && typeof window.vpiRefreshKpis === 'function') {
      window.vpiRefreshKpis(''); window.vpiRenderRanking('')
    }
    if (pageId === 'growth-referral' && typeof window.vpiRenderRanking === 'function') {
      window.vpiRenderRanking('2')
    }
    if (pageId === 'settings-anamnese' && typeof window.initAnamneseAdmin === 'function') {
      window.initAnamneseAdmin()
    }
    if (pageId === 'wa-disparos' && typeof window.AutomationsUI?.init === 'function') {
      window.AutomationsUI.init('disparos-root', 'disparos')
    }
    if (pageId === 'settings-automation' && typeof window.AutomationsUI?.init === 'function') {
      window.AutomationsUI.init('automations-root', 'rules')
    }
    if (pageId === 'settings-templates' && typeof window.TemplatesEditorUI?.init === 'function') {
      window.TemplatesEditorUI.init()
    }
    if (pageId === 'inbox' && typeof window.InboxUI?.init === 'function') {
      window.InboxUI.init()
    }
    if (pageId === 'analytics-wa' && typeof window.AnalyticsUI?.init === 'function') {
      window.AnalyticsUI.init()
    }
    if (pageId === 'patients-prontuario' && typeof window._initProntuarioPage === 'function') {
      window._initProntuarioPage()
    }

    // ── Leads contextualizados por funil ────────────────────────
    if (window.LeadsContext) {
      if (pageId === 'leads-fullface')   window.LeadsContext.init('fullface')
      if (pageId === 'leads-protocolos') window.LeadsContext.init('protocolos')
    }

    // ── Agenda: tabelas de leads por phase ───────────────────────
    if (window.AgendaLeads) {
      if (pageId === 'agenda-agendados')  window.AgendaLeads.renderAgendados()
      if (pageId === 'agenda-cancelados') window.AgendaLeads.renderCancelados()
    }

    // ── Pacientes: recarregar ao navegar ─────────────────────────
    if (pageId === 'patients' && window.loadPatients) {
      window.loadPatients()
    }

    // ── Captação — Kanbans segmentados ──────────────────────────
    if (window.CaptacaoKanbans) {
      if (pageId === 'kanban-fullface')   window.CaptacaoKanbans.initFullFace()
      if (pageId === 'kanban-protocolos') window.CaptacaoKanbans.initProtocolos()
    }

    // ── Page Builder ──────────────────────────────────────────────
    if (pageId === 'page-builder' && window.PBEditor) {
      window.PBEditor.mount()
    }

    // ── Captação — Quiz contextualizado por funil ────────────────
    if (window.QuizAdmin) {
      if (pageId === 'quiz-fullface')    window.QuizAdmin.init('kanban-fullface')
      if (pageId === 'quiz-protocolos')  window.QuizAdmin.init('kanban-protocolos')
      if (pageId === 'quiz-templates')   window.QuizAdmin.init(null, 'quizAdminRoot')
    }

    // ── Relatórios Financeiros — hub + sub-relatórios ────────────
    if (window.FinReports) {
      if (pageId === 'fin-reports') {
        window.FinReports.render()
      } else if (/^fin-(billing|receipts|default|ticket|conversion|commissions|by-procedure|by-patient|by-campaign)$/.test(pageId)) {
        window.FinReports.renderPage(pageId)
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 9. HELPERS INTERNOS
  // ══════════════════════════════════════════════════════════════

  /** Abre a seção Dashboard por padrão ao carregar */
  function _openDefaultSection() {
    const defaultSection = document.querySelector('.nav-item[data-section="dashboard"]')
    if (defaultSection) {
      defaultSection.classList.add('open', 'has-active')
    }
  }

  /**
   * Reinicializa os ícones Feather cirurgicamente no container informado.
   * @param {Element|null} container — processa apenas ícones dentro deste elemento
   */
  function _replaceFeatherIcons(container) {
    featherIn(container, { 'stroke-width': 1.8, width: 16, height: 16 })
  }

  // ══════════════════════════════════════════════════════════════
  // 10. INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', () => {
    // Build inicial com o perfil cacheado (null = modo dev → mostra tudo)
    const user = typeof window.getCurrentProfile === 'function' ? window.getCurrentProfile() : null
    buildSidebar(user)
  })

  /**
   * Reconstrói o sidebar quando o login completa e o papel/plano
   * do usuário ficam disponíveis.
   * Disparado por auth.js via:
   *   document.dispatchEvent(new CustomEvent('clinicai:auth-success', { detail: profile }))
   */
  document.addEventListener('clinicai:auth-success', (e) => {
    const user = e.detail
      || (typeof window.getCurrentProfile === 'function' ? window.getCurrentProfile() : null)
    buildSidebar(user)
  })

  // ══════════════════════════════════════════════════════════════
  // 11. API PÚBLICA
  // ══════════════════════════════════════════════════════════════

  Object.assign(window, {
    navigateTo,        // usado por: placeholder back btn, outros módulos JS
    handleSubItemClick,// usado por: flyout, links externos
    closeNavFlyout,    // usado por: initGlobalClickHandler (app.js)
    buildSidebar,      // usado por: admin panel (troca de plano/papel em runtime)
  })

})()
