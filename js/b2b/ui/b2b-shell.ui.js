/**
 * ClinicAI — B2B Shell UI
 *
 * Header da página B2B: título, toggle master do scout, badge de consumo
 * e navegação por tabs. Não renderiza conteúdo das tabs; emite eventos.
 *
 * Consome: B2BRepository (para scout config)
 * Não conhece: list/form/detail (comunica via eventos DOM customizados)
 *
 * Eventos emitidos:
 *   'b2b:tab-change'        { tab }
 *   'b2b:scout-toggled'     { enabled }
 *   'b2b:scout-config-updated' { config }
 *
 * Expõe window.B2BShell.
 */
;(function () {
  'use strict'
  if (window.B2BShell) return

  var TABS = [
    { id: 'active',     label: 'Parcerias Ativas' },
    { id: 'prospects',  label: 'Prospects' },
    { id: 'candidates', label: 'Candidatos (Scout)' },
    { id: 'gaps',       label: 'Gaps do plano' },
    { id: 'health',     label: 'Saúde' },
    { id: 'config',     label: 'Configurações' },
  ]

  var _state = {
    activeTab: 'active',
    scoutConfig: null,
    consumption: null,
    mountedIn: null,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _repo() {
    if (!window.B2BRepository) throw new Error('B2BRepository não carregado')
    return window.B2BRepository
  }

  function _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }))
  }

  // ─── Renderização ───────────────────────────────────────────
  function _renderHeader() {
    var cfg = _state.scoutConfig || {}
    var enabled = !!cfg.scout_enabled
    var budget = Number(cfg.budget_cap_monthly || 100)

    return '<header class="b2b-header">' +
      '<div class="b2b-header-top">' +
        '<div>' +
          '<div class="b2b-eyebrow">Círculo Mirian de Paula</div>' +
          '<h1 class="b2b-title">Programa de <em>parcerias B2B</em></h1>' +
        '</div>' +
        '<div class="b2b-header-ctrl">' +
          _renderScoutToggle(enabled) +
          _renderBudgetBadge(budget, _state.consumption) +
        '</div>' +
      '</div>' +
      _renderTabs() +
    '</header>'
  }

  function _renderScoutToggle(enabled) {
    return '<div class="b2b-scout-toggle" data-scout-toggle>' +
      '<div class="b2b-toggle-label">' +
        '<div class="b2b-toggle-title">Scout de candidatos</div>' +
        '<div class="b2b-toggle-sub">' + (enabled ? 'Ativo · varredura permitida' : 'Desligado · zero custo') + '</div>' +
      '</div>' +
      '<button type="button" class="b2b-toggle-btn' + (enabled ? ' on' : '') + '" aria-pressed="' + enabled + '">' +
        '<span class="b2b-toggle-thumb"></span>' +
      '</button>' +
    '</div>'
  }

  function _renderBudgetBadge(budget, consumptionData) {
    var consumed = 0, pct = 0
    if (consumptionData && typeof consumptionData.total_brl !== 'undefined') {
      consumed = Number(consumptionData.total_brl || 0)
      pct = Number(consumptionData.pct_used || 0)
    }
    var cls = pct >= 80 ? 'red' : (pct >= 50 ? 'amber' : 'green')
    return '<div class="b2b-budget-badge ' + cls + '" data-budget-badge title="Consumo de varreduras no mês atual">' +
      '<div class="b2b-budget-row">' +
        '<span class="b2b-budget-lbl">Consumo scout</span>' +
        '<span class="b2b-budget-val">R$ ' + consumed.toFixed(2) + ' / R$ ' + Number(budget).toFixed(2) + '</span>' +
      '</div>' +
      '<div class="b2b-budget-bar"><div class="b2b-budget-fill" style="width:' + Math.min(100, pct) + '%"></div></div>' +
      '<div class="b2b-budget-pct">' + pct + '%</div>' +
    '</div>'
  }

  function _renderTabs() {
    return '<nav class="b2b-tabs">' +
      TABS.map(function (t) {
        var active = t.id === _state.activeTab
        return '<button type="button" class="b2b-tab' + (active ? ' active' : '') + '" data-tab="' + t.id + '">' +
          _esc(t.label) +
        '</button>'
      }).join('') +
    '</nav>' +
    '<section id="b2bTabBody" class="b2b-tab-body"></section>'
  }

  // ─── Bind eventos ───────────────────────────────────────────
  function _bind(root) {
    // Tabs
    root.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-tab')
        if (tab === _state.activeTab) return
        _state.activeTab = tab
        _rerenderTabs(root)
        _emit('b2b:tab-change', { tab: tab })
      })
    })

    // Toggle scout
    var toggleBtn = root.querySelector('.b2b-toggle-btn')
    if (toggleBtn) {
      toggleBtn.addEventListener('click', _onToggleScout)
    }
  }

  function _rerenderTabs(root) {
    root.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === _state.activeTab)
    })
  }

  async function _onToggleScout() {
    var current = !!(_state.scoutConfig && _state.scoutConfig.scout_enabled)
    var next = !current
    // Confirmação quando ativar
    if (next && !confirm('Ativar o Scout vai permitir varreduras (custo R$ 0,40-0,80 cada). Continuar?')) return

    try {
      var updated = await _repo().scoutConfigUpdate({ scout_enabled: next }, null)
      _state.scoutConfig = updated
      _refreshHeaderControls()
      _emit('b2b:scout-toggled', { enabled: !!updated.scout_enabled })
      _emit('b2b:scout-config-updated', { config: updated })
    } catch (e) {
      alert('Falha ao alterar: ' + (e.message || e))
    }
  }

  function _refreshHeaderControls() {
    var root = _state.mountedIn ? document.getElementById(_state.mountedIn) : null
    if (!root) return
    var ctrl = root.querySelector('.b2b-header-ctrl')
    if (!ctrl) return
    var cfg = _state.scoutConfig || {}
    ctrl.innerHTML = _renderScoutToggle(!!cfg.scout_enabled) +
                     _renderBudgetBadge(Number(cfg.budget_cap_monthly || 100), _state.consumption)
    var tBtn = ctrl.querySelector('.b2b-toggle-btn')
    if (tBtn) tBtn.addEventListener('click', _onToggleScout)
  }

  async function _refreshConsumption() {
    if (!window.B2BScoutRepository) return
    try {
      _state.consumption = await window.B2BScoutRepository.consumedCurrentMonth()
      _refreshHeaderControls()
    } catch (e) {
      // silencioso — mostra R$ 0 até dados carregarem
    }
  }

  // ─── API pública ────────────────────────────────────────────
  async function mount(containerId) {
    var root = document.getElementById(containerId)
    if (!root) { console.warn('[B2BShell] container não encontrado:', containerId); return }
    _state.mountedIn = containerId

    // Inicial render (sem config ainda — evita flicker longo)
    root.innerHTML = _renderHeader()
    _bind(root)

    // Carrega config real + consumption em paralelo
    try {
      var results = await Promise.all([
        _repo().scoutConfigGet(),
        window.B2BScoutRepository
          ? window.B2BScoutRepository.consumedCurrentMonth().catch(function () { return null })
          : Promise.resolve(null),
      ])
      _state.scoutConfig = results[0]
      _state.consumption = results[1]
      _refreshHeaderControls()
    } catch (e) {
      console.warn('[B2BShell] carga inicial falhou:', e.message)
    }

    // Escuta mudanças externas que impactam o header
    document.addEventListener('b2b:voucher-issued', _refreshConsumption)
    document.addEventListener('b2b:candidate-status-changed', _refreshConsumption)

    // Emite tab-change inicial pra list renderizar
    _emit('b2b:tab-change', { tab: _state.activeTab })
  }

  function getActiveTab() { return _state.activeTab }
  function setActiveTab(tab) {
    if (!TABS.find(function (t) { return t.id === tab })) return
    _state.activeTab = tab
    var root = _state.mountedIn ? document.getElementById(_state.mountedIn) : null
    if (root) _rerenderTabs(root)
    _emit('b2b:tab-change', { tab: tab })
  }
  function getTabBody() { return document.getElementById('b2bTabBody') }
  function getScoutConfig() { return _state.scoutConfig }

  window.B2BShell = Object.freeze({
    mount: mount,
    getActiveTab: getActiveTab,
    setActiveTab: setActiveTab,
    getTabBody: getTabBody,
    getScoutConfig: getScoutConfig,
    TABS: TABS,
  })
})()
