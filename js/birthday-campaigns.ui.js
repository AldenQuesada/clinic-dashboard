/**
 * ClinicAI — Birthday Campaigns UI
 *
 * Modulo completo de campanhas de aniversario:
 * - Dashboard com KPIs e proximos aniversarios
 * - Editor de templates (adicionar/editar/remover mensagens)
 * - Lista de campanhas com segmentos e alerta de orcamento
 * - Scanner manual + preview de mensagens
 *
 * Depende de: window.ClinicEnv, feather icons
 */
;(function () {
  'use strict'
  if (window._clinicaiBirthdayLoaded) return
  window._clinicaiBirthdayLoaded = true

  var _url = function() { return window.ClinicEnv?.SUPABASE_URL || '' }
  var _key = function() { return window.ClinicEnv?.SUPABASE_KEY || '' }
  function _headers() {
    var h = { 'apikey': _key(), 'Content-Type': 'application/json' }
    var s = JSON.parse(sessionStorage.getItem('sb-session') || '{}')
    h['Authorization'] = 'Bearer ' + (s.access_token || _key())
    return h
  }
  async function _rpc(name, params) {
    try {
      var r = await fetch(_url() + '/rest/v1/rpc/' + name, { method: 'POST', headers: _headers(), body: JSON.stringify(params || {}) })
      if (!r.ok) return { ok: false, data: null, error: await r.text() }
      var d = await r.json()
      return { ok: true, data: d, error: null }
    } catch(e) { return { ok: false, data: null, error: e.message } }
  }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML }
  function _feather(n, s) { return '<svg class="feather" width="' + (s||16) + '" height="' + (s||16) + '"><use href="/assets/feather-sprite.svg#' + n + '"/></svg>' }
  function _fIcon(name, size) {
    if (typeof feather !== 'undefined' && feather.icons && feather.icons[name]) {
      return feather.icons[name].toSvg({ width: size || 16, height: size || 16, 'stroke-width': 1.8 })
    }
    return ''
  }

  // ── State ──────────────────────────────────────────────────
  var _tab = 'dashboard' // dashboard | templates | campaigns
  var _stats = null
  var _upcoming = []
  var _templates = []
  var _campaigns = []
  var _segFilter = null
  var _editTmpl = null
  var _loading = false

  // ── Load data ──────────────────────────────────────────────
  async function _loadAll() {
    _loading = true
    _render()
    var [s, u, t, c] = await Promise.all([
      _rpc('wa_birthday_stats'),
      _rpc('wa_birthday_upcoming', { p_days: 60 }),
      _rpc('wa_birthday_templates_list'),
      _rpc('wa_birthday_list')
    ])
    _stats = s.ok ? s.data : {}
    _upcoming = u.ok && Array.isArray(u.data) ? u.data : []
    _templates = t.ok && Array.isArray(t.data) ? t.data : []
    _campaigns = c.ok && Array.isArray(c.data) ? c.data : []
    _loading = false
    _render()
  }

  // ── Render ────────���────────────────────────────────────────
  function _render() {
    var root = document.getElementById('birthday-root')
    if (!root) return
    var html = '<div class="bday-module">'

    // Header
    html += '<div class="bday-header">'
    html += '<div class="bday-title">' + _fIcon('gift', 22) + ' <span>Aniversarios</span></div>'
    html += '<div class="bday-tabs">'
    html += '<button class="bday-tab' + (_tab === 'dashboard' ? ' active' : '') + '" data-tab="dashboard">' + _fIcon('bar-chart-2', 14) + ' Painel</button>'
    html += '<button class="bday-tab' + (_tab === 'templates' ? ' active' : '') + '" data-tab="templates">' + _fIcon('edit-3', 14) + ' Mensagens</button>'
    html += '<button class="bday-tab' + (_tab === 'campaigns' ? ' active' : '') + '" data-tab="campaigns">' + _fIcon('users', 14) + ' Campanhas</button>'
    html += '</div>'
    html += '<button class="bday-scan-btn" id="bdayScanBtn">' + _fIcon('refresh-cw', 14) + ' Escanear agora</button>'
    html += '</div>'

    if (_loading) {
      html += '<div class="bday-loading">Carregando...</div>'
      html += '</div>'
      root.innerHTML = html
      _attachEvents()
      return
    }

    if (_tab === 'dashboard') html += _renderDashboard()
    else if (_tab === 'templates') html += _renderTemplates()
    else if (_tab === 'campaigns') html += _renderCampaigns()

    html += '</div>'
    root.innerHTML = html
    _attachEvents()
  }

  // ── Dashboard ──────────────────────────────────────────────
  function _renderDashboard() {
    var s = _stats || {}
    var html = ''

    // KPIs
    html += '<div class="bday-kpis">'
    html += _kpi(s.upcoming_30d || 0, 'Prox. 30 dias', '#2563EB')
    html += _kpi(s.total_campaigns || 0, 'Campanhas', '#10B981')
    html += _kpi(s.sending || 0, 'Enviando', '#F59E0B')
    html += _kpi(s.responded || 0, 'Responderam', '#8B5CF6')
    html += _kpi((s.response_rate || 0) + '%', 'Taxa resp.', '#C9A96E')
    html += _kpi(s.with_open_budget || 0, 'Com orcamento', '#EF4444')
    html += '</div>'

    // Segment breakdown
    html += '<div class="bday-segments">'
    html += '<div class="bday-seg-card"><span class="bday-seg-val">' + (s.segment_paciente || 0) + '</span><span class="bday-seg-lbl">Paciente</span></div>'
    html += '<div class="bday-seg-card"><span class="bday-seg-val">' + (s.segment_paciente_orcamento || 0) + '</span><span class="bday-seg-lbl">Paciente + Orcamento</span></div>'
    html += '<div class="bday-seg-card"><span class="bday-seg-val">' + (s.segment_orcamento || 0) + '</span><span class="bday-seg-lbl">Orcamento</span></div>'
    html += '</div>'

    // Upcoming birthdays
    html += '<div class="bday-section-title">' + _fIcon('calendar', 16) + ' Proximos aniversarios (60 dias)</div>'
    html += '<div class="bday-upcoming-list">'
    if (_upcoming.length === 0) {
      html += '<div class="bday-empty">Nenhum aniversario nos proximos 60 dias</div>'
    } else {
      _upcoming.forEach(function(u) {
        var d = u.birth_date ? new Date(u.birth_date + 'T12:00:00') : null
        var dayLabel = d ? (d.getDate().toString().padStart(2,'0') + '/' + (d.getMonth()+1).toString().padStart(2,'0')) : '-'
        var daysClass = u.days_until <= 7 ? ' bday-urgent' : u.days_until <= 14 ? ' bday-soon' : ''
        var budgetBadge = u.has_open_budget
          ? '<span class="bday-budget-alert" title="Orcamento aberto: ' + _esc(u.budget_title) + ' R$ ' + (u.budget_total || 0) + '">' + _fIcon('alert-circle', 12) + ' R$ ' + (u.budget_total || 0) + '</span>'
          : ''
        var campBadge = u.has_campaign
          ? '<span class="bday-camp-badge">' + _fIcon('check', 10) + '</span>'
          : '<span class="bday-camp-badge bday-camp-none">' + _fIcon('clock', 10) + '</span>'

        html += '<div class="bday-upcoming-item' + daysClass + '">'
        html += '<div class="bday-up-left">'
        html += '<span class="bday-up-name">' + _esc(u.name) + '</span>'
        html += '<span class="bday-up-meta">' + dayLabel + ' &middot; ' + (u.age_turning || '?') + ' anos &middot; ' + _esc(u.phone || '') + '</span>'
        html += '</div>'
        html += '<div class="bday-up-right">'
        html += budgetBadge
        html += '<span class="bday-up-days">' + u.days_until + 'd</span>'
        html += campBadge
        html += '</div>'
        html += '</div>'
      })
    }
    html += '</div>'
    return html
  }

  function _kpi(val, label, color) {
    return '<div class="bday-kpi"><span class="bday-kpi-val" style="color:' + color + '">' + val + '</span><span class="bday-kpi-lbl">' + label + '</span></div>'
  }

  // ── Templates editor ─────��─────────────────────────────────
  function _renderTemplates() {
    var html = ''
    html += '<div class="bday-section-title">' + _fIcon('edit-3', 16) + ' Sequencia de mensagens <button class="bday-add-tmpl" id="bdayAddTmpl">' + _fIcon('plus', 14) + ' Adicionar</button></div>'
    html += '<div class="bday-tmpl-list">'

    if (_templates.length === 0) {
      html += '<div class="bday-empty">Nenhum template configurado</div>'
    } else {
      _templates.forEach(function(t, i) {
        var isEditing = _editTmpl && _editTmpl.id === t.id
        html += '<div class="bday-tmpl-card' + (t.is_active ? '' : ' bday-tmpl-inactive') + '" data-id="' + t.id + '">'
        html += '<div class="bday-tmpl-header">'
        html += '<span class="bday-tmpl-badge">D-' + t.day_offset + '</span>'
        html += '<span class="bday-tmpl-label">' + _esc(t.label) + '</span>'
        html += '<span class="bday-tmpl-hour">' + _fIcon('clock', 12) + ' ' + t.send_hour + ':00</span>'
        html += '<span class="bday-tmpl-toggle" title="' + (t.is_active ? 'Desativar' : 'Ativar') + '">'
        html += '<label class="bday-switch"><input type="checkbox" ' + (t.is_active ? 'checked' : '') + ' data-toggle="' + t.id + '"><span class="bday-slider"></span></label>'
        html += '</span>'
        html += '<button class="bday-tmpl-edit" data-edit="' + t.id + '">' + _fIcon('edit-2', 13) + '</button>'
        html += '<button class="bday-tmpl-del" data-del="' + t.id + '">' + _fIcon('trash-2', 13) + '</button>'
        html += '</div>'

        if (isEditing) {
          html += _renderTemplateForm(_editTmpl)
        } else {
          html += '<div class="bday-tmpl-preview">' + _esc(t.content).substring(0, 150) + (t.content.length > 150 ? '...' : '') + '</div>'
        }
        html += '</div>'
      })
    }
    html += '</div>'

    // New template form
    if (_editTmpl && !_editTmpl.id) {
      html += '<div class="bday-tmpl-card bday-tmpl-new">'
      html += '<div class="bday-tmpl-header"><span class="bday-tmpl-badge">Nova</span><span class="bday-tmpl-label">Nova mensagem</span></div>'
      html += _renderTemplateForm(_editTmpl)
      html += '</div>'
    }

    html += '<div class="bday-tmpl-vars">'
    html += '<span class="bday-var-title">Variaveis disponiveis:</span>'
    html += '<code>[nome]</code> <code>[queixas]</code> <code>[idade]</code> <code>[orcamento]</code>'
    html += '</div>'

    return html
  }

  function _renderTemplateForm(t) {
    var html = '<div class="bday-tmpl-form">'
    html += '<div class="bday-form-row">'
    html += '<div class="bday-form-field"><label>Titulo</label><input class="bday-input" id="bdayTmplLabel" value="' + _esc(t.label || '') + '"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>D- (dias antes)</label><input class="bday-input" id="bdayTmplOffset" type="number" min="1" max="90" value="' + (t.day_offset || 30) + '"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>Hora envio</label><input class="bday-input" id="bdayTmplHour" type="number" min="0" max="23" value="' + (t.send_hour || 10) + '"></div>'
    html += '<div class="bday-form-field bday-form-sm"><label>Ordem</label><input class="bday-input" id="bdayTmplOrder" type="number" min="1" max="99" value="' + (t.sort_order || 1) + '"></div>'
    html += '</div>'
    html += '<div class="bday-form-field"><label>Mensagem</label><textarea class="bday-textarea" id="bdayTmplContent" rows="6">' + _esc(t.content || '') + '</textarea></div>'
    html += '<div class="bday-form-field"><label>Imagem (URL)</label><input class="bday-input" id="bdayTmplMedia" value="' + _esc(t.media_url || '') + '"></div>'
    html += '<div class="bday-form-actions">'
    html += '<button class="bday-btn bday-btn-save" id="bdayTmplSave">Salvar</button>'
    html += '<button class="bday-btn bday-btn-cancel" id="bdayTmplCancel">Cancelar</button>'
    html += '</div>'
    html += '</div>'
    return html
  }

  // ── Campaigns list ─���───────────────────────────────────────
  function _renderCampaigns() {
    var html = ''

    // Segment filter
    html += '<div class="bday-camp-filters">'
    html += '<button class="bday-seg-filter' + (!_segFilter ? ' active' : '') + '" data-seg="">Todos</button>'
    html += '<button class="bday-seg-filter' + (_segFilter === 'paciente' ? ' active' : '') + '" data-seg="paciente">Paciente</button>'
    html += '<button class="bday-seg-filter' + (_segFilter === 'paciente_orcamento' ? ' active' : '') + '" data-seg="paciente_orcamento">Paciente + Orcamento</button>'
    html += '<button class="bday-seg-filter' + (_segFilter === 'orcamento' ? ' active' : '') + '" data-seg="orcamento">Orcamento</button>'
    html += '</div>'

    var filtered = _segFilter ? _campaigns.filter(function(c) { return c.segment === _segFilter }) : _campaigns

    html += '<div class="bday-camp-list">'
    if (filtered.length === 0) {
      html += '<div class="bday-empty">Nenhuma campanha' + (_segFilter ? ' neste segmento' : '') + '. Execute o scanner para criar.</div>'
    } else {
      filtered.forEach(function(c) {
        var statusCls = 'bday-st-' + c.status
        var statusLabel = { pending: 'Pendente', sending: 'Enviando', completed: 'Concluida', responded: 'Respondeu', cancelled: 'Cancelada' }[c.status] || c.status
        var d = c.birth_date ? new Date(c.birth_date + 'T12:00:00') : null
        var dayLabel = d ? (d.getDate().toString().padStart(2,'0') + '/' + (d.getMonth()+1).toString().padStart(2,'0')) : '-'
        var segLabel = { paciente: 'Paciente', orcamento: 'Orcamento', paciente_orcamento: 'Pac + Orc' }[c.segment] || c.segment

        html += '<div class="bday-camp-item">'
        html += '<div class="bday-camp-left">'
        html += '<span class="bday-camp-name">' + _esc(c.lead_name) + '</span>'
        html += '<span class="bday-camp-meta">' + dayLabel + ' &middot; ' + (c.age_turning || '?') + ' anos &middot; ' + segLabel + '</span>'
        if (c.queixas && c.queixas !== 'aquelas coisinhas') {
          html += '<span class="bday-camp-queixas">' + _fIcon('clipboard', 11) + ' ' + _esc(c.queixas).substring(0, 60) + '</span>'
        }
        html += '</div>'
        html += '<div class="bday-camp-right">'
        if (c.has_open_budget) {
          html += '<span class="bday-budget-alert">' + _fIcon('alert-circle', 12) + ' Orc. aberto R$ ' + (c.budget_total || 0) + '</span>'
        }
        html += '<span class="bday-camp-msgs">' + (c.sent_messages || 0) + '/' + (c.total_messages || 0) + ' msgs</span>'
        html += '<span class="bday-camp-status ' + statusCls + '">' + statusLabel + '</span>'
        html += '</div>'
        html += '</div>'
      })
    }
    html += '</div>'
    return html
  }

  // ── Events ─��───────────────────────────────��───────────────
  function _attachEvents() {
    // Tabs
    document.querySelectorAll('.bday-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _tab = btn.dataset.tab
        _editTmpl = null
        _render()
      })
    })

    // Scan button
    var scanBtn = document.getElementById('bdayScanBtn')
    if (scanBtn) {
      scanBtn.addEventListener('click', async function() {
        scanBtn.disabled = true
        scanBtn.innerHTML = _fIcon('loader', 14) + ' Escaneando...'
        var r1 = await _rpc('wa_birthday_scan')
        var r2 = await _rpc('wa_birthday_enqueue')
        await _loadAll()
        var msg = 'Scan: ' + ((r1.data && r1.data.campaigns_created) || 0) + ' campanhas criadas'
        if (r2.data) msg += ', ' + (r2.data.enqueued || 0) + ' mensagens enfileiradas'
        alert(msg)
      })
    }

    // Segment filters
    document.querySelectorAll('.bday-seg-filter').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _segFilter = btn.dataset.seg || null
        _render()
      })
    })

    // Template add
    var addBtn = document.getElementById('bdayAddTmpl')
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        _editTmpl = { id: null, label: '', day_offset: 30, send_hour: 10, content: '', media_url: '', sort_order: _templates.length + 1 }
        _render()
      })
    }

    // Template edit buttons
    document.querySelectorAll('.bday-tmpl-edit').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var t = _templates.find(function(x) { return x.id === btn.dataset.edit })
        if (t) { _editTmpl = Object.assign({}, t); _render() }
      })
    })

    // Template delete buttons
    document.querySelectorAll('.bday-tmpl-del').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        if (!confirm('Remover esta mensagem da sequencia?')) return
        await _rpc('wa_birthday_template_delete', { p_id: btn.dataset.del })
        await _loadAll()
      })
    })

    // Template toggle
    document.querySelectorAll('[data-toggle]').forEach(function(cb) {
      cb.addEventListener('change', async function() {
        var t = _templates.find(function(x) { return x.id === cb.dataset.toggle })
        if (t) {
          await _rpc('wa_birthday_template_save', {
            p_id: t.id, p_day_offset: t.day_offset, p_send_hour: t.send_hour,
            p_label: t.label, p_content: t.content, p_media_url: t.media_url,
            p_is_active: cb.checked, p_sort_order: t.sort_order
          })
          await _loadAll()
        }
      })
    })

    // Template save
    var saveBtn = document.getElementById('bdayTmplSave')
    if (saveBtn && _editTmpl) {
      saveBtn.addEventListener('click', async function() {
        var label = document.getElementById('bdayTmplLabel')?.value?.trim()
        var offset = parseInt(document.getElementById('bdayTmplOffset')?.value) || 30
        var hour = parseInt(document.getElementById('bdayTmplHour')?.value) || 10
        var order = parseInt(document.getElementById('bdayTmplOrder')?.value) || 1
        var content = document.getElementById('bdayTmplContent')?.value?.trim()
        var media = document.getElementById('bdayTmplMedia')?.value?.trim()
        if (!label || !content) { alert('Preencha titulo e mensagem'); return }
        await _rpc('wa_birthday_template_save', {
          p_id: _editTmpl.id || null,
          p_day_offset: offset, p_send_hour: hour, p_label: label,
          p_content: content, p_media_url: media || null, p_sort_order: order
        })
        _editTmpl = null
        await _loadAll()
      })
    }

    // Template cancel
    var cancelBtn = document.getElementById('bdayTmplCancel')
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() { _editTmpl = null; _render() })
    }
  }

  // ── Mount ──────────────────────────────────────────────────
  function _mount() {
    var root = document.getElementById('birthday-root')
    if (!root) return
    _loadAll()
  }

  // Auto-mount when page becomes visible
  var _observer = new MutationObserver(function() {
    var page = document.getElementById('page-birthday-campaigns')
    if (page && page.classList.contains('active')) _mount()
  })
  document.addEventListener('DOMContentLoaded', function() {
    _observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] })
    // Also mount if already visible
    var page = document.getElementById('page-birthday-campaigns')
    if (page && page.classList.contains('active')) _mount()
  })

  window.BirthdayCampaigns = Object.freeze({ mount: _mount, reload: _loadAll })
})()
