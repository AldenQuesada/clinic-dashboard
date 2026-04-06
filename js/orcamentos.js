/**
 * ClinicAI — Orcamentos Module
 * Leads com phase=orcamento. Encapsulado em IIFE.
 */
;(function () {
  'use strict'

  var _PAGE_SIZE = 50
  var _all = []
  var _sortField = 'name'
  var _sortDir = 'asc'
  var _period = ''
  var _selectedIds = new Set()
  var _cacheData = null
  var _cacheTs = 0
  var _CACHE_TTL = 30000

  function _esc(s) { return (s || '').replace(/</g, '&lt;').replace(/"/g, '&quot;') }
  function _fmtPhone(p) {
    if (!p) return ''
    var d = p.replace(/\D/g, '')
    if (d.length === 13) return '(' + d.slice(2,4) + ') ' + d.slice(4,9) + '-' + d.slice(9)
    if (d.length === 12) return '(' + d.slice(2,4) + ') ' + d.slice(4,8) + '-' + d.slice(8)
    return p
  }
  function _sortArrow(field) {
    if (_sortField !== field) return ''
    return _sortDir === 'asc' ? ' &#9650;' : ' &#9660;'
  }

  // ── Load ────────────────────────────────────────────────────
  function load(forceRefresh) {
    var now = Date.now()
    var cacheValid = _cacheData && (now - _cacheTs) < _CACHE_TTL && !forceRefresh

    if (cacheValid) { _render(); return }

    if (window.LeadsService && LeadsService.loadAll) {
      LeadsService.loadAll().then(function(leads) {
        _cacheData = leads
        _cacheTs = Date.now()
        _render()
      }).catch(function() { _render() })
      return
    }
    _render()
  }

  function _render() {
    var allLeads = _cacheData || (window.LeadsService ? LeadsService.getLocal() : JSON.parse(localStorage.getItem('clinicai_leads') || '[]'))
    var leads = allLeads.filter(function(l) { return l.phase === 'orcamento' && l.is_active !== false })

    // Filtro nome
    var search = (document.getElementById('orcFilterNome')?.value || '').toLowerCase().trim()
    if (search) {
      leads = leads.filter(function(l) {
        var nome = (l.name || l.nome || '').toLowerCase()
        var phone = (l.phone || '').toLowerCase()
        return nome.includes(search) || phone.includes(search)
      })
    }

    // Filtro periodo
    if (_period && _period !== 'custom') {
      var cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - parseInt(_period))
      leads = leads.filter(function(l) {
        var d = l.created_at || l.createdAt
        return d && new Date(d) >= cutoff
      })
    }

    // Sort
    leads.sort(function(a, b) {
      var va, vb
      if (_sortField === 'name') {
        va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase()
      } else if (_sortField === 'lastContact') {
        va = a.last_contacted_at || a.created_at || ''; vb = b.last_contacted_at || b.created_at || ''
      } else {
        va = a.created_at || ''; vb = b.created_at || ''
      }
      if (va < vb) return _sortDir === 'asc' ? -1 : 1
      if (va > vb) return _sortDir === 'asc' ? 1 : -1
      return 0
    })

    _all = leads

    // KPIs
    var kpiTotal = document.getElementById('kpiOrcTotal')
    if (kpiTotal) kpiTotal.textContent = leads.length
    var kpiTotalSub = document.getElementById('kpiOrcTotalSub')
    if (kpiTotalSub) kpiTotalSub.textContent = leads.length + ' em aberto'

    // Sort arrows
    var headers = { orcSortName: 'name', orcSortDate: 'date', orcSortContact: 'lastContact' }
    var labels = { name: 'Nome', date: 'Data', lastContact: 'Contato' }
    for (var hId in headers) {
      var hEl = document.getElementById(hId)
      if (hEl) hEl.innerHTML = labels[headers[hId]] + _sortArrow(headers[hId])
    }

    // Render
    var tbody = document.getElementById('orcTableBody')
    if (!tbody) return
    tbody.innerHTML = ''
    _selectedIds = new Set()

    if (!leads.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9CA3AF">Nenhum orcamento encontrado</td></tr>'
      _updateLoadMore()
      return
    }

    _renderRows(leads.slice(0, _PAGE_SIZE))
    _updateLoadMore()
  }

  function _renderRows(rows) {
    var tbody = document.getElementById('orcTableBody')
    if (!tbody) return

    rows.forEach(function(l) {
      var nome = l.name || l.nome || ''
      var phone = l.phone || ''
      var waLink = phone ? 'https://wa.me/' + phone.replace(/\D/g, '') : '#'
      var status = l.status || 'active'
      var tagsArr = Array.isArray(l.tags) ? l.tags : []
      var tagsHtml = tagsArr.length
        ? tagsArr.slice(0, 3).map(function(t) { return '<span style="font-size:10px;background:#f3f4f6;border-radius:4px;padding:2px 6px;color:#374151;white-space:nowrap">' + _esc(t) + '</span>' }).join(' ')
        : '<span style="color:#D1D5DB">—</span>'

      var dateStr = l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'

      var lastContact = l.last_contacted_at || l.created_at || ''
      var contactStr = lastContact ? new Date(lastContact).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'

      var phoneHtml = _fmtPhone(phone)
      if (phone) {
        phoneHtml = '<a href="' + waLink + '" target="_blank" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:4px;color:#6B7280;text-decoration:none;font-size:11px">' +
          '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#25D366" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
          _fmtPhone(phone) + '</a>'
      }

      var checked = _selectedIds.has(l.id) ? ' checked' : ''

      var tr = document.createElement('tr')
      tr.dataset.oid = l.id
      tr.style.cssText = 'border-bottom:1px solid #F9FAFB;cursor:pointer;transition:background .1s'
      tr.onmouseenter = function() { tr.style.background = '#FAFAFA' }
      tr.onmouseleave = function() { tr.style.background = '' }
      tr.onclick = function(e) {
        if (e.target.closest('button,input,a')) return
        if (window.viewLead) viewLead(l.id)
      }

      tr.innerHTML =
        '<td style="padding:10px 6px 10px 14px"><input type="checkbox" class="orc-row-cb" data-id="' + _esc(l.id) + '"' + checked + ' style="width:14px;height:14px;accent-color:#F59E0B;cursor:pointer" onclick="event.stopPropagation()"></td>' +
        '<td style="padding:10px 12px"><div style="font-size:13px;font-weight:600;color:#111827">' + _esc(nome) + '</div><div style="margin-top:2px">' + phoneHtml + '</div></td>' +
        '<td style="padding:10px 12px;font-size:11px;vertical-align:middle">' + tagsHtml + '</td>' +
        '<td style="padding:10px 12px;vertical-align:middle"><span style="display:inline-flex;align-items:center;font-size:11px;font-weight:600;color:#F59E0B;background:#FFFBEB;border-radius:6px;padding:2px 8px">Orcamento</span></td>' +
        '<td style="padding:10px 12px;font-size:12px;color:#374151;vertical-align:middle">' + dateStr + '</td>' +
        '<td style="padding:10px 12px;font-size:12px;color:#374151;vertical-align:middle">' + contactStr + '</td>' +
        '<td style="padding:10px 8px;text-align:center;vertical-align:middle"><button onclick="event.stopPropagation();typeof viewLead===\'function\'&&viewLead(\'' + _esc(l.id) + '\')" style="background:none;border:1px solid #E5E7EB;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;color:#374151">Ver</button></td>'

      tbody.appendChild(tr)

      var cb = tr.querySelector('.orc-row-cb')
      if (cb) cb.addEventListener('change', function() {
        if (cb.checked) _selectedIds.add(l.id); else _selectedIds.delete(l.id)
      })
    })
  }

  function _updateLoadMore() {
    var btn = document.getElementById('orcLoadMore')
    if (!btn) return
    var rendered = document.getElementById('orcTableBody')?.querySelectorAll('tr[data-oid]').length || 0
    var remaining = _all.length - rendered
    if (remaining > 0) {
      btn.textContent = 'Carregar mais ' + remaining + (remaining === 1 ? ' orcamento' : ' orcamentos')
      btn.style.display = ''
    } else {
      btn.style.display = 'none'
    }
  }

  function loadMore() {
    var rendered = document.getElementById('orcTableBody')?.querySelectorAll('tr[data-oid]').length || 0
    var next = _all.slice(rendered, rendered + _PAGE_SIZE)
    if (next.length) _renderRows(next)
    _updateLoadMore()
  }

  function sortBy(field) {
    if (_sortField === field) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc'
    else { _sortField = field; _sortDir = 'asc' }
    if (_all.length) _render()
    else load()
  }

  function periodClick(btn) {
    _period = btn.dataset.period
    var bar = document.getElementById('orcPeriodBar')
    if (bar) bar.querySelectorAll('.ao-period-btn').forEach(function(b) { b.classList.remove('active') })
    btn.classList.add('active')
    _render()
  }

  function toggleAll(masterCb) {
    if (masterCb.checked) {
      _selectedIds = new Set(_all.map(function(l) { return l.id }))
    } else {
      _selectedIds = new Set()
    }
    document.querySelectorAll('.orc-row-cb').forEach(function(cb) {
      cb.checked = _selectedIds.has(cb.dataset.id)
    })
  }

  function exportCsv() {
    var data = _all.length ? _all : []
    if (!data.length) { alert('Nenhum orcamento para exportar'); return }
    var sep = ';'
    var rows = [['Nome', 'Telefone', 'Email', 'Status', 'Tags', 'Data Cadastro'].join(sep)]
    data.forEach(function(l) {
      var tags = Array.isArray(l.tags) ? l.tags.join(', ') : ''
      var dataCad = l.created_at || l.createdAt || ''
      if (dataCad) try { dataCad = new Date(dataCad).toLocaleDateString('pt-BR') } catch(e) {}
      rows.push([
        (l.name || '').replace(/;/g, ','),
        _fmtPhone(l.phone || ''),
        (l.email || '').replace(/;/g, ','),
        l.status || '',
        tags.replace(/;/g, ','),
        dataCad
      ].map(function(c) { return '"' + String(c || '').replace(/"/g, '""') + '"' }).join(sep))
    })
    var csv = rows.join('\n')
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'orcamentos_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
  }

  // ── Exports ─────────────────────────────────────────────────
  window.loadOrcamentos = load
  window.orcLoadMore = loadMore
  window.orcSortBy = sortBy
  window.orcPeriodClick = periodClick
  window.orcToggleAll = toggleAll
  window.exportOrcamentosCsv = exportCsv

})()
