/**
 * ClinicAI — B2B List UI
 *
 * Renderiza a lista de parcerias dentro de #b2bTabBody quando a tab
 * 'active' ou 'prospects' estiver selecionada.
 *
 * Consome: B2BRepository, B2BService
 * Ignora: form, detail (comunica via eventos)
 *
 * Eventos emitidos:
 *   'b2b:open-detail'  { id }
 *   'b2b:open-form'    { mode:'new' | mode:'edit', id? }
 *
 * Eventos ouvidos:
 *   'b2b:tab-change'
 *   'b2b:partnership-saved' (reload)
 *
 * Expõe window.B2BList.
 */
;(function () {
  'use strict'
  if (window.B2BList) return

  var _state = {
    filter: 'active',      // active | prospects
    items: [],
    loading: false,
    error: null,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _repo()  { return window.B2BRepository }
  function _svc()   { return window.B2BService    }

  function _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }))
  }

  function _statusLabel(s) {
    return ({
      prospect:  'Prospect',
      dna_check: 'DNA check',
      contract:  'Contrato',
      active:    'Ativa',
      review:    'Em revisão',
      paused:    'Pausada',
      closed:    'Encerrada',
    })[s] || s
  }

  function _healthColor(color) {
    return ({
      green:   '#10B981',
      yellow:  '#F59E0B',
      red:     '#EF4444',
      unknown: '#9CA3AF',
    })[color || 'unknown']
  }

  function _typeLabel(t) {
    return ({ transactional: 'Transacional', occasion: 'Ocasião', institutional: 'Institucional' })[t] || t
  }

  function _tierTag(tier) {
    if (!tier) return ''
    return '<span class="b2b-pill b2b-pill-tier">T' + tier + '</span>'
  }

  // ─── Renderização ───────────────────────────────────────────
  function _renderRow(p) {
    var dnaScore = p.dna_score != null ? Number(p.dna_score).toFixed(1) : '—'
    var healthColor = _healthColor(p.health_color)
    return '<button class="b2b-row" data-id="' + _esc(p.id) + '">' +
      '<span class="b2b-health" style="background:' + healthColor + '" title="Saúde: ' + (p.health_color || 'desconhecido') + '"></span>' +
      '<div class="b2b-row-body">' +
        '<div class="b2b-row-top">' +
          '<span class="b2b-row-name">' + _esc(p.name) + '</span>' +
          _tierTag(p.tier) +
          '<span class="b2b-pill b2b-pill-' + _esc(p.pillar || 'outros') + '">' + _esc(p.pillar || 'outros') + '</span>' +
          '<span class="b2b-pill b2b-pill-type">' + _esc(_typeLabel(p.type)) + '</span>' +
        '</div>' +
        '<div class="b2b-row-meta">' +
          '<span>' + _esc(_statusLabel(p.status)) + '</span>' +
          '<span>DNA ' + dnaScore + '/10</span>' +
          (p.contact_name ? '<span>' + _esc(p.contact_name) + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</button>'
  }

  function _renderBody(container) {
    if (_state.loading) {
      container.innerHTML = (window.B2BUXKit && window.B2BUXKit.skeleton({ rows: 5 })) ||
                            '<div class="b2b-empty">Carregando…</div>'
      return
    }
    if (_state.error) {
      container.innerHTML = '<div class="b2b-empty b2b-empty-err">Erro: ' + _esc(_state.error) + '</div>'
      return
    }
    if (!_state.items.length) {
      var msg = _state.filter === 'active'
        ? 'Nenhuma parceria ativa ainda. Clique em "Nova parceria" pra começar.'
        : 'Sem prospects na fila.'
      container.innerHTML = '<div class="b2b-empty">' + msg + '</div>'
      return
    }

    // Agrupa por tier (ativas) ou por pillar (prospects)
    var groups, getHeader
    if (_state.filter === 'active') {
      groups = _svc().groupByTier(_state.items)
      getHeader = function (k) { return k === 'untiered' ? 'Sem tier' : 'Tier ' + k }
    } else {
      groups = _svc().groupByPillar(_state.items)
      getHeader = function (k) { return k.charAt(0).toUpperCase() + k.slice(1) }
    }

    var keys = Object.keys(groups).filter(function (k) { return groups[k].length > 0 })
    container.innerHTML = keys.map(function (k) {
      return '<div class="b2b-group">' +
        '<div class="b2b-group-hdr">' + _esc(getHeader(k)) + ' · ' + groups[k].length + '</div>' +
        groups[k].map(_renderRow).join('') +
      '</div>'
    }).join('')
  }

  function _renderShell() {
    var exportBtn = _state.filter === 'active'
      ? '<button type="button" class="b2b-btn" data-action="export" title="Baixar planilha CSV com todas as parcerias">Exportar CSV</button>'
      : ''
    return '<div class="b2b-list-head">' +
      '<div class="b2b-list-count" data-count></div>' +
      '<div class="b2b-list-head-acts" style="display:flex;gap:8px;flex-wrap:wrap">' +
        exportBtn +
        '<button type="button" class="b2b-btn b2b-btn-primary" data-action="new">+ Nova parceria</button>' +
      '</div>' +
    '</div>' +
    '<div class="b2b-list-body" data-list-body></div>'
  }

  // ─── Data ───────────────────────────────────────────────────
  async function _load() {
    _state.loading = true
    _state.error = null
    _renderIntoBody()
    try {
      var statuses = _state.filter === 'active'
        ? null                // list retorna todos, mas vamos filtrar client-side
        : null
      var all = await _repo().list({ status: null })
      if (_state.filter === 'active') {
        _state.items = (all || []).filter(function (p) {
          return ['contract', 'active', 'review', 'paused'].indexOf(p.status) !== -1
        })
      } else {
        _state.items = (all || []).filter(function (p) {
          return ['prospect', 'dna_check'].indexOf(p.status) !== -1
        })
      }
    } catch (e) {
      _state.error = e.message || String(e)
      _state.items = []
    } finally {
      _state.loading = false
      _renderIntoBody()
      // Atualiza contador da tab correspondente
      document.dispatchEvent(new CustomEvent('b2b:tab-count', {
        detail: { tab: _state.filter, count: _state.items.length }
      }))
    }
  }

  function _renderIntoBody() {
    var body = window.B2BShell ? window.B2BShell.getTabBody() : document.getElementById('b2bTabBody')
    if (!body) return
    body.innerHTML = _renderShell()
    var listBody = body.querySelector('[data-list-body]')
    _renderBody(listBody)
    var countEl = body.querySelector('[data-count]')
    if (countEl) {
      countEl.textContent = _state.items.length + ' ' +
        (_state.filter === 'active' ? 'parcerias ativas' : 'prospects')
    }
    _bind(body)
  }

  function _bind(root) {
    var btn = root.querySelector('[data-action="new"]')
    if (btn) btn.addEventListener('click', function () { _emit('b2b:open-form', { mode: 'new' }) })

    var exportBtn = root.querySelector('[data-action="export"]')
    if (exportBtn) exportBtn.addEventListener('click', _onExport)

    root.querySelectorAll('.b2b-row').forEach(function (row) {
      row.addEventListener('click', function () {
        _emit('b2b:open-detail', { id: row.getAttribute('data-id') })
      })
    })
  }

  async function _onExport(ev) {
    var btn = ev.currentTarget
    if (!window.B2BExportService) {
      window.B2BToast ? window.B2BToast.error('Serviço de export não carregado') : alert('Export não carregado')
      return
    }
    var origLabel = btn.textContent
    btn.disabled = true; btn.textContent = 'Exportando…'
    try {
      var rows = await _repo().exportAll(null)
      if (!Array.isArray(rows) || !rows.length) {
        window.B2BToast ? window.B2BToast.warn('Nenhuma parceria para exportar') : alert('Nenhuma parceria')
        return
      }
      window.B2BExportService.downloadCSV(null, rows)
      window.B2BToast && window.B2BToast.success(rows.length + ' parceria(s) exportada(s)')
    } catch (e) {
      window.B2BToast ? window.B2BToast.error('Erro: ' + (e.message || e)) : alert('Erro: ' + (e.message || e))
    } finally {
      btn.disabled = false; btn.textContent = origLabel
    }
  }

  // ─── Bind global ────────────────────────────────────────────
  document.addEventListener('b2b:tab-change', function (e) {
    var tab = e.detail && e.detail.tab
    if (tab === 'active' || tab === 'prospects') {
      _state.filter = tab
      _load()
    }
  })

  document.addEventListener('b2b:partnership-saved', function () {
    var tab = window.B2BShell ? window.B2BShell.getActiveTab() : 'active'
    if (tab === 'active' || tab === 'prospects') _load()
  })

  // ─── API pública ────────────────────────────────────────────
  window.B2BList = Object.freeze({
    reload: _load,
  })
})()
