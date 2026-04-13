/**
 * ClinicAI — Mira Config UI
 * Pagina de configuracao da Mira dentro do dashboard.
 *
 * Tabs:
 *   1. Visao Geral (KPIs, graficos de uso)
 *   2. Profissionais (numeros autorizados, permissoes)
 *   3. Logs (auditoria de queries)
 *
 * Renderiza em #miraConfigRoot
 */
;(function () {
  'use strict'
  if (window._clinicaiMiraConfigLoaded) return
  window._clinicaiMiraConfigLoaded = true

  var _root = null
  var _tab = 'overview' // overview | professionals | logs
  var _loading = false

  // State: overview
  var _stats = null

  // State: professionals
  var _numbers = []
  var _profOptions = []

  // State: logs
  var _logs = { rows: [], total: 0 }
  var _logPage = 0
  var _logFilter = { phone: '', intent: '' }

  var LOG_PAGE_SIZE = 30

  // ── Helpers ───────────────────────────────────────────────────

  function _esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    })
  }

  function _money(n) {
    if (n == null || isNaN(n)) return '0'
    return Number(n).toLocaleString('pt-BR')
  }

  function _feather(name, size) {
    size = size || 16
    return '<i data-feather="' + name + '" style="width:' + size + 'px;height:' + size + 'px"></i>'
  }

  function _replaceIcons() {
    if (_root && window.feather) feather.replace({ root: _root })
  }

  function _timeAgo(iso) {
    if (!iso) return '--'
    var d = new Date(iso)
    var now = new Date()
    var diff = Math.floor((now - d) / 1000)
    if (diff < 60) return 'agora'
    if (diff < 3600) return Math.floor(diff / 60) + 'min'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h'
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function _badge(text, color, bg) {
    return '<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;color:' + color + ';background:' + bg + '">' + _esc(text) + '</span>'
  }

  // ── Init ──────────────────────────────────────────────────────

  async function init() {
    _root = document.getElementById('miraConfigRoot')
    if (!_root) return
    _loading = true
    _render()
    await _loadTab()
    _loading = false
    _render()
  }

  async function _loadTab() {
    if (_tab === 'overview') await _loadStats()
    else if (_tab === 'professionals') await _loadNumbers()
    else if (_tab === 'logs') await _loadLogs()
  }

  // ── Data loaders ──────────────────────────────────────────────

  async function _loadStats() {
    var repo = window.MiraRepository
    if (!repo) return
    var r = await repo.dashboardStats()
    if (r.ok) _stats = r.data
  }

  async function _loadNumbers() {
    var repo = window.MiraRepository
    if (!repo) return
    var r = await repo.listNumbers()
    if (r.ok) _numbers = (r.data || []).filter(function (n) { return n.number_type === 'professional_private' })
    var rp = await repo.listProfessionals()
    if (rp.ok) _profOptions = (rp.data || []).filter(function (p) {
      var phone = (p.whatsapp || p.telefone || p.phone || '').toString().trim()
      return phone && phone.replace(/\D/g, '').length >= 10
    })
  }

  async function _loadLogs() {
    var repo = window.MiraRepository
    if (!repo) return
    var r = await repo.auditList(
      LOG_PAGE_SIZE,
      _logPage * LOG_PAGE_SIZE,
      _logFilter.phone || null,
      _logFilter.intent || null
    )
    if (r.ok) _logs = r.data
  }

  // ── Main render ───────────────────────────────────────────────

  function _render() {
    if (!_root) return

    var tabs = [
      { id: 'overview', icon: 'bar-chart-2', label: 'Visao Geral' },
      { id: 'professionals', icon: 'users', label: 'Profissionais' },
      { id: 'logs', icon: 'file-text', label: 'Logs de Uso' },
    ]

    var tabsHtml = tabs.map(function (t) {
      var active = t.id === _tab
      return '<button class="mc-tab' + (active ? ' mc-tab-active' : '') + '" data-tab="' + t.id + '">'
        + _feather(t.icon, 15) + ' ' + t.label
        + '</button>'
    }).join('')

    var body = ''
    if (_loading) {
      body = '<div style="text-align:center;padding:60px 0;color:#9ca3af;font-size:14px">'
        + _feather('loader', 24) + '<br>Carregando...</div>'
    } else if (_tab === 'overview') {
      body = _renderOverview()
    } else if (_tab === 'professionals') {
      body = _renderProfessionals()
    } else if (_tab === 'logs') {
      body = _renderLogs()
    }

    _root.innerHTML = ''
      + '<div style="padding:28px 32px;max-width:1100px;margin:0 auto">'

        // Header
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:16px;flex-wrap:wrap">'
          + '<div>'
            + '<h2 style="margin:0;font-size:22px;font-weight:700;color:#111827">' + _feather('cpu', 22) + ' Mira — Configuracao</h2>'
            + '<p style="margin:4px 0 0;font-size:13px;color:#6b7280">Assistente interna via WhatsApp para profissionais da clinica</p>'
          + '</div>'
          + '<div style="display:flex;gap:8px">'
            + '<button id="mcBtnConsole" style="background:linear-gradient(135deg,#C9A96E,#a8894f);color:#fff;border:none;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px">'
              + _feather('terminal', 15) + ' Abrir Console'
            + '</button>'
          + '</div>'
        + '</div>'

        // Tabs
        + '<div class="mc-tabs" style="display:flex;gap:4px;margin-bottom:20px;border-bottom:2px solid #e5e7eb;padding-bottom:0">'
          + tabsHtml
        + '</div>'

        // Body
        + body

      + '</div>'

      // Styles
      + '<style>'
        + '.mc-tab{background:none;border:none;padding:10px 16px;font-size:13px;font-weight:600;color:#6b7280;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;display:flex;align-items:center;gap:6px;transition:all .15s}'
        + '.mc-tab:hover{color:#111827}'
        + '.mc-tab-active{color:#C9A96E;border-bottom-color:#C9A96E}'
        + '.mc-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,.04)}'
        + '.mc-kpi{text-align:center}'
        + '.mc-kpi-value{font-size:28px;font-weight:800;color:#111827;line-height:1.2}'
        + '.mc-kpi-label{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;margin-top:4px}'
        + '.mc-table{width:100%;border-collapse:collapse;font-size:13px}'
        + '.mc-table th{text-align:left;padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;border-bottom:2px solid #e5e7eb;background:#f9fafb}'
        + '.mc-table td{padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151}'
        + '.mc-table tr:hover td{background:#f9fafb}'
        + '.mc-btn{background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}'
        + '.mc-btn:hover{border-color:#C9A96E;color:#C9A96E}'
        + '.mc-btn-primary{background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}'
        + '.mc-btn-danger{background:#fff;color:#DC2626;border:1.5px solid #FCA5A5;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer}'
        + '.mc-btn-danger:hover{background:#FEE2E2}'
        + '.mc-input{padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;background:#fff;transition:border .15s}'
        + '.mc-input:focus{border-color:#C9A96E}'
      + '</style>'

    // Event listeners
    _root.querySelectorAll('.mc-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _tab = btn.getAttribute('data-tab')
        _loading = true
        _render()
        _loadTab().then(function () {
          _loading = false
          _render()
        })
      })
    })

    var btnConsole = document.getElementById('mcBtnConsole')
    if (btnConsole) {
      btnConsole.addEventListener('click', function () {
        if (window.navigateTo) window.navigateTo('mira-console')
      })
    }

    _replaceIcons()
    _bindEvents()
  }

  // ── Tab: Overview ─────────────────────────────────────────────

  function _renderOverview() {
    if (!_stats) return '<div class="mc-card" style="text-align:center;padding:40px;color:#9ca3af">Sem dados disponiveis</div>'

    var s = _stats

    // KPI cards
    var kpis = [
      { icon: 'users',       value: s.numbers_active || 0,   label: 'Profissionais Ativos', color: '#C9A96E' },
      { icon: 'message-circle', value: s.queries_today || 0, label: 'Queries Hoje',         color: '#10b981' },
      { icon: 'trending-up', value: s.queries_week || 0,     label: 'Queries Semana',       color: '#3b82f6' },
      { icon: 'calendar',    value: s.queries_month || 0,    label: 'Queries Mes',          color: '#8b5cf6' },
      { icon: 'zap',         value: (s.avg_response_ms || 0) + 'ms', label: 'Tempo Medio',  color: '#f59e0b' },
      { icon: 'alert-circle',value: (s.error_rate || 0) + '%', label: 'Taxa de Erro',       color: s.error_rate > 5 ? '#DC2626' : '#059669' },
    ]

    var kpiHtml = kpis.map(function (k) {
      return '<div class="mc-card mc-kpi">'
        + '<div style="margin-bottom:8px;color:' + k.color + '">' + _feather(k.icon, 22) + '</div>'
        + '<div class="mc-kpi-value" style="color:' + k.color + '">' + k.value + '</div>'
        + '<div class="mc-kpi-label">' + k.label + '</div>'
        + '</div>'
    }).join('')

    // Top intents
    var intents = s.top_intents || []
    var maxIntent = intents.length > 0 ? intents[0].total : 1
    var intentsHtml = intents.map(function (i) {
      var pct = Math.round((i.total / maxIntent) * 100)
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">'
        + '<div style="width:130px;font-size:12px;font-weight:600;color:#374151;text-align:right;flex-shrink:0">' + _esc(i.intent) + '</div>'
        + '<div style="flex:1;height:22px;background:#f3f4f6;border-radius:6px;overflow:hidden">'
          + '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#C9A96E,#E8D5A3);border-radius:6px;transition:width .3s"></div>'
        + '</div>'
        + '<div style="width:36px;font-size:12px;font-weight:700;color:#111827">' + i.total + '</div>'
        + '</div>'
    }).join('')

    // Voice count
    var voiceHtml = ''
    if (s.voice_count_month != null) {
      voiceHtml = '<div class="mc-card" style="margin-top:16px">'
        + '<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;margin-bottom:10px">'
          + _feather('mic', 15) + ' Audio / Voz'
        + '</div>'
        + '<div style="font-size:20px;font-weight:800;color:#111827">' + s.voice_count_month + ' <span style="font-size:13px;font-weight:500;color:#6b7280">transcrições este mes</span></div>'
        + '</div>'
    }

    // Queries by day (sparkline via divs)
    var days = s.queries_by_day || []
    var maxDay = 1
    days.forEach(function (d) { if (d.total > maxDay) maxDay = d.total })
    var sparkHtml = days.map(function (d) {
      var h = Math.max(4, Math.round((d.total / maxDay) * 80))
      var dayLabel = new Date(d.day + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;min-width:0">'
        + '<div style="font-size:10px;font-weight:700;color:#374151">' + d.total + '</div>'
        + '<div style="width:100%;max-width:28px;height:' + h + 'px;background:linear-gradient(180deg,#C9A96E,#E8D5A3);border-radius:4px 4px 0 0"></div>'
        + '<div style="font-size:9px;color:#9ca3af">' + dayLabel + '</div>'
        + '</div>'
    }).join('')

    return ''
      // KPIs
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">'
        + kpiHtml
      + '</div>'

      // Charts row
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">'

        // Top intents
        + '<div class="mc-card">'
          + '<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;margin-bottom:14px">'
            + _feather('target', 15) + ' Top Intents (30 dias)'
          + '</div>'
          + (intentsHtml || '<div style="color:#9ca3af;font-size:13px">Nenhum dado</div>')
        + '</div>'

        // Queries by day
        + '<div class="mc-card">'
          + '<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;margin-bottom:14px">'
            + _feather('bar-chart-2', 15) + ' Queries por Dia (14 dias)'
          + '</div>'
          + '<div style="display:flex;align-items:flex-end;gap:4px;height:100px;padding-top:10px">'
            + (sparkHtml || '<div style="color:#9ca3af;font-size:13px">Nenhum dado</div>')
          + '</div>'
        + '</div>'

      + '</div>'

      + voiceHtml
  }

  // ── Tab: Professionals ────────────────────────────────────────

  function _renderProfessionals() {
    var addBtn = '<button id="mcBtnAddProf" class="mc-btn-primary" style="display:flex;align-items:center;gap:6px">'
      + _feather('user-plus', 15) + ' Cadastrar Profissional</button>'

    var header = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
      + '<div style="font-size:14px;font-weight:700;color:#111827">' + _numbers.length + ' profissional(is) autorizado(s)</div>'
      + addBtn
      + '</div>'

    if (_numbers.length === 0) {
      return header
        + '<div class="mc-card" style="text-align:center;padding:40px">'
          + '<div style="color:#9ca3af;margin-bottom:8px">' + _feather('users', 32) + '</div>'
          + '<div style="font-size:14px;color:#6b7280">Nenhum profissional cadastrado na Mira</div>'
          + '<div style="font-size:12px;color:#9ca3af;margin-top:4px">Clique em "Cadastrar Profissional" para autorizar acesso</div>'
        + '</div>'
    }

    var rows = _numbers.map(function (n) {
      var perms = n.permissions || {}
      var permBadges = ''
      if (perms.agenda !== false)    permBadges += _badge('Agenda', '#059669', '#D1FAE5') + ' '
      if (perms.pacientes !== false) permBadges += _badge('Pacientes', '#3b82f6', '#DBEAFE') + ' '
      if (perms.financeiro !== false)permBadges += _badge('Financeiro', '#8b5cf6', '#EDE9FE') + ' '

      var scopeBadge = n.access_scope === 'full'
        ? _badge('FULL', '#C9A96E', '#FEF3C7')
        : _badge('OWN', '#6b7280', '#F3F4F6')

      var statusDot = n.is_active
        ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;margin-right:6px"></span>'
        : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#DC2626;margin-right:6px"></span>'

      return '<tr>'
        + '<td>' + statusDot + _esc(n.professional_name || n.label || '--') + '</td>'
        + '<td style="font-family:monospace;font-size:12px">' + _esc(n.phone || '--') + '</td>'
        + '<td>' + scopeBadge + '</td>'
        + '<td>' + permBadges + '</td>'
        + '<td style="white-space:nowrap">'
          + '<button class="mc-btn mc-prof-edit" data-id="' + n.id + '" style="margin-right:4px">' + _feather('edit-2', 13) + '</button>'
          + '<button class="mc-btn-danger mc-prof-remove" data-id="' + n.id + '" data-name="' + _esc(n.professional_name || n.label || '') + '">' + _feather('trash-2', 13) + '</button>'
        + '</td>'
        + '</tr>'
    }).join('')

    return header
      + '<div class="mc-card" style="padding:0;overflow:hidden">'
        + '<table class="mc-table">'
          + '<thead><tr>'
            + '<th>Profissional</th>'
            + '<th>Telefone</th>'
            + '<th>Escopo</th>'
            + '<th>Permissoes</th>'
            + '<th style="width:90px">Acoes</th>'
          + '</tr></thead>'
          + '<tbody>' + rows + '</tbody>'
        + '</table>'
      + '</div>'
  }

  // ── Tab: Logs ─────────────────────────────────────────────────

  function _renderLogs() {
    var rows = (_logs.rows || [])
    var total = _logs.total || 0
    var totalPages = Math.max(1, Math.ceil(total / LOG_PAGE_SIZE))

    // Filters
    var filterHtml = '<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
      + '<input type="text" id="mcLogPhone" class="mc-input" placeholder="Filtrar por telefone..." value="' + _esc(_logFilter.phone) + '" style="width:180px">'
      + '<input type="text" id="mcLogIntent" class="mc-input" placeholder="Filtrar por intent..." value="' + _esc(_logFilter.intent) + '" style="width:160px">'
      + '<button id="mcLogSearch" class="mc-btn" style="display:flex;align-items:center;gap:4px">' + _feather('search', 14) + ' Buscar</button>'
      + '<div style="flex:1"></div>'
      + '<div style="font-size:12px;color:#6b7280;display:flex;align-items:center">' + _money(total) + ' registros</div>'
      + '</div>'

    if (rows.length === 0) {
      return filterHtml
        + '<div class="mc-card" style="text-align:center;padding:40px;color:#9ca3af">Nenhum log encontrado</div>'
    }

    var rowsHtml = rows.map(function (r) {
      var intentColor = r.success ? '#059669' : '#DC2626'
      var intentBg = r.success ? '#D1FAE5' : '#FEE2E2'
      return '<tr>'
        + '<td style="font-size:12px;color:#9ca3af;white-space:nowrap">' + _timeAgo(r.created_at) + '</td>'
        + '<td>' + _esc(r.professional_name || '--') + '</td>'
        + '<td>' + _badge(r.intent || 'unknown', intentColor, intentBg) + '</td>'
        + '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + _esc(r.query) + '">' + _esc(r.query) + '</td>'
        + '<td style="font-size:12px;color:#6b7280">' + (r.response_ms || '--') + 'ms</td>'
        + '</tr>'
    }).join('')

    // Pagination
    var pagHtml = '<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px">'
      + '<button id="mcLogPrev" class="mc-btn"' + (_logPage === 0 ? ' disabled style="opacity:.4;pointer-events:none"' : '') + '>' + _feather('chevron-left', 14) + '</button>'
      + '<span style="font-size:12px;color:#6b7280">' + (_logPage + 1) + ' / ' + totalPages + '</span>'
      + '<button id="mcLogNext" class="mc-btn"' + (_logPage >= totalPages - 1 ? ' disabled style="opacity:.4;pointer-events:none"' : '') + '>' + _feather('chevron-right', 14) + '</button>'
      + '</div>'

    return filterHtml
      + '<div class="mc-card" style="padding:0;overflow:hidden">'
        + '<table class="mc-table">'
          + '<thead><tr>'
            + '<th>Quando</th>'
            + '<th>Profissional</th>'
            + '<th>Intent</th>'
            + '<th>Query</th>'
            + '<th>Tempo</th>'
          + '</tr></thead>'
          + '<tbody>' + rowsHtml + '</tbody>'
        + '</table>'
      + '</div>'
      + pagHtml
  }

  // ── Event binding ─────────────────────────────────────────────

  function _bindEvents() {
    if (!_root) return

    // Professionals: add
    var addBtn = document.getElementById('mcBtnAddProf')
    if (addBtn) addBtn.addEventListener('click', _openRegisterModal)

    // Professionals: edit/remove
    _root.querySelectorAll('.mc-prof-edit').forEach(function (btn) {
      btn.addEventListener('click', function () { _openEditModal(btn.getAttribute('data-id')) })
    })
    _root.querySelectorAll('.mc-prof-remove').forEach(function (btn) {
      btn.addEventListener('click', function () { _confirmRemove(btn.getAttribute('data-id'), btn.getAttribute('data-name')) })
    })

    // Logs: search
    var logSearch = document.getElementById('mcLogSearch')
    if (logSearch) {
      logSearch.addEventListener('click', function () {
        _logFilter.phone = (document.getElementById('mcLogPhone') || {}).value || ''
        _logFilter.intent = (document.getElementById('mcLogIntent') || {}).value || ''
        _logPage = 0
        _reloadLogs()
      })
    }

    // Logs: pagination
    var prev = document.getElementById('mcLogPrev')
    var next = document.getElementById('mcLogNext')
    if (prev) prev.addEventListener('click', function () { _logPage--; _reloadLogs() })
    if (next) next.addEventListener('click', function () { _logPage++; _reloadLogs() })

    // Enter on filter inputs
    ;['mcLogPhone', 'mcLogIntent'].forEach(function (id) {
      var el = document.getElementById(id)
      if (el) el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && logSearch) logSearch.click()
      })
    })
  }

  async function _reloadLogs() {
    _loading = true
    _render()
    await _loadLogs()
    _loading = false
    _render()
  }

  // ── Modal: Register Professional ──────────────────────────────

  function _openRegisterModal() {
    var existing = document.getElementById('mcModalBackdrop')
    if (existing) existing.remove()

    var profOpts = _profOptions.map(function (p, i) {
      var phone = (p.whatsapp || p.telefone || p.phone || '').toString().trim()
      var label = (p.display_name || 'Sem nome') + ' — ' + phone + (p.specialty ? ' · ' + p.specialty : '')
      return '<option value="' + i + '">' + _esc(label) + '</option>'
    }).join('')

    var html = ''
      + '<div id="mcModalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
        + '<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;box-shadow:0 25px 50px rgba(0,0,0,.25);overflow:hidden">'

          // Header
          + '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
            + '<div>'
              + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Cadastrar Profissional</h3>'
              + '<p style="margin:4px 0 0;font-size:12px;color:#6b7280">Autorize um numero a usar a Mira via WhatsApp</p>'
            + '</div>'
            + '<button class="mc-modal-close" style="all:unset;cursor:pointer;color:#9ca3af;padding:8px;font-size:20px">x</button>'
          + '</div>'

          // Body
          + '<div style="padding:24px;display:flex;flex-direction:column;gap:16px">'

            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Profissional</label>'
              + '<select id="mcRegProf" class="mc-input" style="width:100%">'
                + '<option value="">-- escolha --</option>' + profOpts
              + '</select>'
            + '</div>'

            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Telefone (auto)</label>'
              + '<input type="text" id="mcRegPhone" class="mc-input" style="width:100%;background:#f9fafb" readonly placeholder="Preenchido ao selecionar profissional">'
            + '</div>'

            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Escopo de acesso</label>'
              + '<select id="mcRegScope" class="mc-input" style="width:100%">'
                + '<option value="own">Proprio (so dados do profissional)</option>'
                + '<option value="full">Completo (todos os dados da clinica)</option>'
              + '</select>'
            + '</div>'

            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">Permissoes</label>'
              + '<div style="display:flex;flex-direction:column;gap:8px;background:#f9fafb;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px">'
                + _permCheckbox('agenda', 'Agenda', 'Ver agenda, horarios livres, agendamentos')
                + _permCheckbox('pacientes', 'Pacientes', 'Buscar paciente, saldo, historico')
                + _permCheckbox('financeiro', 'Financeiro', 'Receita, comissao, cobertura, meta')
              + '</div>'
            + '</div>'

          + '</div>'

          // Footer
          + '<div style="padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end">'
            + '<button class="mc-modal-close mc-btn">Cancelar</button>'
            + '<button id="mcRegSave" class="mc-btn-primary">Cadastrar</button>'
          + '</div>'

        + '</div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)
    if (window.feather) feather.replace({ root: document.getElementById('mcModalBackdrop') })

    // Events
    document.querySelectorAll('.mc-modal-close').forEach(function (b) {
      b.addEventListener('click', function () { document.getElementById('mcModalBackdrop')?.remove() })
    })

    document.getElementById('mcRegProf')?.addEventListener('change', function (e) {
      var idx = parseInt(e.target.value, 10)
      var phoneEl = document.getElementById('mcRegPhone')
      if (isNaN(idx) || !_profOptions[idx]) { if (phoneEl) phoneEl.value = ''; return }
      var p = _profOptions[idx]
      if (phoneEl) phoneEl.value = (p.whatsapp || p.telefone || p.phone || '').toString().replace(/\D/g, '')
    })

    document.getElementById('mcRegSave')?.addEventListener('click', _handleRegister)
  }

  function _permCheckbox(value, label, hint) {
    return '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">'
      + '<input type="checkbox" class="mc-perm" data-area="' + value + '" checked style="margin-top:2px;cursor:pointer;width:16px;height:16px;accent-color:#C9A96E">'
      + '<div>'
        + '<div style="font-size:13px;font-weight:600;color:#111827">' + label + '</div>'
        + '<div style="font-size:11px;color:#6b7280">' + hint + '</div>'
      + '</div>'
      + '</label>'
  }

  async function _handleRegister() {
    var profIdx = parseInt((document.getElementById('mcRegProf') || {}).value, 10)
    if (isNaN(profIdx) || !_profOptions[profIdx]) { _toast('Selecione um profissional', 'warn'); return }

    var p = _profOptions[profIdx]
    var phone = (document.getElementById('mcRegPhone') || {}).value || ''
    phone = phone.replace(/\D/g, '')
    if (phone.length < 10) { _toast('Telefone invalido', 'warn'); return }

    var scope = (document.getElementById('mcRegScope') || {}).value || 'own'
    var perms = { agenda: false, pacientes: false, financeiro: false }
    document.querySelectorAll('.mc-perm').forEach(function (cb) {
      perms[cb.getAttribute('data-area')] = cb.checked
    })

    if (!perms.agenda && !perms.pacientes && !perms.financeiro) {
      _toast('Marque ao menos uma permissao', 'warn'); return
    }

    var repo = window.MiraRepository
    if (!repo) { _toast('Repository nao disponivel', 'error'); return }

    var saveBtn = document.getElementById('mcRegSave')
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando...' }

    var r = await repo.registerNumber({
      phone: phone,
      professional_id: p.id,
      label: 'Mira ' + (p.display_name || '').split(' ')[0],
      access_scope: scope,
      permissions: perms,
    })

    if (r.ok) {
      _toast('Profissional cadastrado!', 'ok')
      document.getElementById('mcModalBackdrop')?.remove()
      await _loadNumbers()
      _render()
    } else {
      _toast('Erro: ' + (r.error || 'desconhecido'), 'error')
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Cadastrar' }
    }
  }

  // ── Modal: Edit Number ────────────────────────────────────────

  function _openEditModal(numberId) {
    var num = _numbers.find(function (n) { return n.id === numberId })
    if (!num) return

    var existing = document.getElementById('mcModalBackdrop')
    if (existing) existing.remove()

    var perms = num.permissions || {}
    var scopeOpts = '<option value="own"' + (num.access_scope !== 'full' ? ' selected' : '') + '>Proprio</option>'
      + '<option value="full"' + (num.access_scope === 'full' ? ' selected' : '') + '>Completo</option>'

    var html = ''
      + '<div id="mcModalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
        + '<div style="background:#fff;border-radius:16px;width:100%;max-width:480px;box-shadow:0 25px 50px rgba(0,0,0,.25);overflow:hidden">'

          + '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb">'
            + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Editar — ' + _esc(num.professional_name || num.label) + '</h3>'
            + '<p style="margin:4px 0 0;font-size:12px;color:#6b7280;font-family:monospace">' + _esc(num.phone) + '</p>'
          + '</div>'

          + '<div style="padding:24px;display:flex;flex-direction:column;gap:16px">'

            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Escopo</label>'
              + '<select id="mcEditScope" class="mc-input" style="width:100%">' + scopeOpts + '</select>'
            + '</div>'

            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">Permissoes</label>'
              + '<div style="display:flex;flex-direction:column;gap:8px;background:#f9fafb;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px">'
                + _permCheckboxEdit('agenda', 'Agenda', perms.agenda !== false)
                + _permCheckboxEdit('pacientes', 'Pacientes', perms.pacientes !== false)
                + _permCheckboxEdit('financeiro', 'Financeiro', perms.financeiro !== false)
              + '</div>'
            + '</div>'

          + '</div>'

          + '<div style="padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end">'
            + '<button class="mc-modal-close mc-btn">Cancelar</button>'
            + '<button id="mcEditSave" class="mc-btn-primary">Salvar</button>'
          + '</div>'

        + '</div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)

    document.querySelectorAll('.mc-modal-close').forEach(function (b) {
      b.addEventListener('click', function () { document.getElementById('mcModalBackdrop')?.remove() })
    })

    document.getElementById('mcEditSave')?.addEventListener('click', async function () {
      var scope = (document.getElementById('mcEditScope') || {}).value || 'own'
      var permsNew = { agenda: false, pacientes: false, financeiro: false }
      document.querySelectorAll('.mc-perm-edit').forEach(function (cb) {
        permsNew[cb.getAttribute('data-area')] = cb.checked
      })

      var btn = document.getElementById('mcEditSave')
      if (btn) { btn.disabled = true; btn.textContent = 'Salvando...' }

      var repo = window.MiraRepository
      var r = await repo.updateNumber(numberId, { access_scope: scope, permissions: permsNew })
      if (r.ok && r.data && r.data.ok) {
        _toast('Atualizado!', 'ok')
        document.getElementById('mcModalBackdrop')?.remove()
        await _loadNumbers()
        _render()
      } else {
        _toast('Erro: ' + ((r.data && r.data.error) || r.error || 'desconhecido'), 'error')
        if (btn) { btn.disabled = false; btn.textContent = 'Salvar' }
      }
    })
  }

  function _permCheckboxEdit(value, label, checked) {
    return '<label style="display:flex;align-items:center;gap:10px;cursor:pointer">'
      + '<input type="checkbox" class="mc-perm-edit" data-area="' + value + '"' + (checked ? ' checked' : '') + ' style="cursor:pointer;width:16px;height:16px;accent-color:#C9A96E">'
      + '<span style="font-size:13px;font-weight:600;color:#111827">' + label + '</span>'
      + '</label>'
  }

  // ── Confirm Remove ────────────────────────────────────────────

  function _confirmRemove(numberId, name) {
    var existing = document.getElementById('mcModalBackdrop')
    if (existing) existing.remove()

    var html = ''
      + '<div id="mcModalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
        + '<div style="background:#fff;border-radius:16px;width:100%;max-width:420px;box-shadow:0 25px 50px rgba(0,0,0,.25);overflow:hidden">'

          + '<div style="padding:24px;text-align:center">'
            + '<div style="width:48px;height:48px;border-radius:50%;background:#FEE2E2;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;color:#DC2626">'
              + _feather('alert-triangle', 24)
            + '</div>'
            + '<h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827">Remover Acesso</h3>'
            + '<p style="margin:0;font-size:13px;color:#6b7280">Tem certeza que deseja desativar o acesso de <strong>' + _esc(name) + '</strong> a Mira?</p>'
          + '</div>'

          + '<div style="padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:center">'
            + '<button class="mc-modal-close mc-btn">Cancelar</button>'
            + '<button id="mcConfirmRemove" class="mc-btn-danger" style="padding:8px 20px">Remover</button>'
          + '</div>'

        + '</div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)
    if (window.feather) feather.replace({ root: document.getElementById('mcModalBackdrop') })

    document.querySelectorAll('.mc-modal-close').forEach(function (b) {
      b.addEventListener('click', function () { document.getElementById('mcModalBackdrop')?.remove() })
    })

    document.getElementById('mcConfirmRemove')?.addEventListener('click', async function () {
      var btn = document.getElementById('mcConfirmRemove')
      if (btn) { btn.disabled = true; btn.textContent = 'Removendo...' }

      var repo = window.MiraRepository
      var r = await repo.removeNumber(numberId)
      if (r.ok && r.data && r.data.ok) {
        _toast('Acesso removido', 'ok')
        document.getElementById('mcModalBackdrop')?.remove()
        await _loadNumbers()
        _render()
      } else {
        _toast('Erro ao remover', 'error')
        if (btn) { btn.disabled = false; btn.textContent = 'Remover' }
      }
    })
  }

  // ── Toast ─────────────────────────────────────────────────────

  function _toast(msg, type) {
    var colors = { ok: '#059669', warn: '#D97706', error: '#DC2626' }
    var bg = { ok: '#D1FAE5', warn: '#FEF3C7', error: '#FEE2E2' }
    var t = document.createElement('div')
    t.textContent = msg
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:10000;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;color:' + (colors[type] || '#374151') + ';background:' + (bg[type] || '#F3F4F6') + ';box-shadow:0 4px 12px rgba(0,0,0,.15);transition:opacity .3s'
    document.body.appendChild(t)
    setTimeout(function () { t.style.opacity = '0' }, 2500)
    setTimeout(function () { t.remove() }, 3000)
  }

  // ── Public API ────────────────────────────────────────────────

  window.MiraConfigUI = Object.freeze({ init: init })
})()
