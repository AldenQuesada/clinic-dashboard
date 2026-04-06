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
  function load() {
    var page = document.getElementById('page-orcamentos')
    if (!page) return

    // Renderizar com dados locais imediatamente
    var local = window.LeadsService ? LeadsService.getLocal() : JSON.parse(localStorage.getItem('clinicai_leads') || '[]')
    if (local.length) {
      _cacheData = local
      _cacheTs = Date.now()
      _render()
    }

    // Buscar dados frescos do Supabase para garantir sync
    if (window.LeadsService && LeadsService.loadAll) {
      LeadsService.loadAll().then(function(fresh) {
        if (fresh && fresh.length) {
          _cacheData = fresh
          _cacheTs = Date.now()
          _render()
        }
      }).catch(function(e) {
        console.warn('[Orcamentos] loadAll falhou, usando cache local:', e)
      })
    }
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

    // KPIs — Total, Abertos, Aprovados, Taxa de Conversao
    var abertos = 0, aprovados = 0
    leads.forEach(function(l) {
      var orcs = (l.customFields || {}).orcamentos || []
      var temAprovado = orcs.some(function(o) { return o.status === 'aprovado' })
      if (temAprovado) aprovados++; else abertos++
    })
    var taxa = leads.length ? Math.round((aprovados / leads.length) * 100) : 0

    var periodoLabel = { '7': '7 dias', '30': '30 dias', '90': '90 dias', '365': '1 ano' }
    var periodoSub = _period ? periodoLabel[_period] || _period + 'd' : 'todos'

    var kpiTotal = document.getElementById('kpiOrcTotal')
    if (kpiTotal) kpiTotal.textContent = leads.length
    var kpiTotalSub = document.getElementById('kpiOrcTotalSub')
    if (kpiTotalSub) kpiTotalSub.textContent = periodoSub

    var kpiAbertos = document.getElementById('kpiOrcAbertos')
    if (kpiAbertos) kpiAbertos.textContent = abertos
    var kpiAbertosSub = document.getElementById('kpiOrcAbertosSub')
    if (kpiAbertosSub) kpiAbertosSub.textContent = 'pendentes'

    var kpiAprovados = document.getElementById('kpiOrcAprovados')
    if (kpiAprovados) kpiAprovados.textContent = aprovados
    var kpiAprovadosSub = document.getElementById('kpiOrcAprovadosSub')
    if (kpiAprovadosSub) kpiAprovadosSub.textContent = 'fechados'

    var kpiTaxa = document.getElementById('kpiOrcTaxa')
    if (kpiTaxa) kpiTaxa.textContent = taxa + '%'
    var kpiTaxaSub = document.getElementById('kpiOrcTaxaSub')
    if (kpiTaxaSub) kpiTaxaSub.textContent = aprovados + '/' + leads.length

    // Valores financeiros
    var valorTotal = 0, valorRecuperado = 0, valorAberto = 0
    leads.forEach(function(l) {
      var orcs = (l.customFields || {}).orcamentos || []
      orcs.forEach(function(o) {
        var v = parseFloat(o.valor) || 0
        valorTotal += v
        if (o.status === 'aprovado') valorRecuperado += v
        else valorAberto += v
      })
    })

    var fmtR = function(v) { return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) }

    var elValTotal = document.getElementById('kpiOrcValorTotal')
    if (elValTotal) elValTotal.textContent = fmtR(valorTotal)
    var elValTotalSub = document.getElementById('kpiOrcValorTotalSub')
    if (elValTotalSub) elValTotalSub.textContent = periodoSub

    var elValRec = document.getElementById('kpiOrcValorRec')
    if (elValRec) elValRec.textContent = fmtR(valorRecuperado)
    var elValRecSub = document.getElementById('kpiOrcValorRecSub')
    if (elValRecSub) elValRecSub.textContent = aprovados + ' aprovados'

    var elValAb = document.getElementById('kpiOrcValorAb')
    if (elValAb) elValAb.textContent = fmtR(valorAberto)
    var elValAbSub = document.getElementById('kpiOrcValorAbSub')
    if (elValAbSub) elValAbSub.textContent = abertos + ' aguardando'

    // Trends financeiros
    var pctRec = valorTotal ? Math.round((valorRecuperado / valorTotal) * 100) : 0
    _setTrend('kpiOrcValorTotalTrend', 'kpiOrcValorTotalTrendVal', 1, fmtR(valorTotal))
    _setTrend('kpiOrcValorRecTrend', 'kpiOrcValorRecTrendVal', valorRecuperado, pctRec + '% do total')
    _setTrend('kpiOrcValorAbTrend', 'kpiOrcValorAbTrendVal', -valorAberto, (100 - pctRec) + '% pendente')

    // Trends
    _renderOrcTrends(leads, abertos, aprovados, taxa)

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
      // Procedimentos e valor do orcamento
      var cf = l.customFields || {}
      var orcamentos = cf.orcamentos || []
      var procs = orcamentos.map(function(o) { return o.procedimento || '' }).filter(Boolean)
      var procsHtml = procs.length
        ? procs.slice(0, 2).map(function(p) { return '<span style="font-size:10px;background:#FEF3C7;border-radius:4px;padding:2px 6px;color:#92400E;white-space:nowrap">' + _esc(p) + '</span>' }).join(' ') + (procs.length > 2 ? ' <span style="font-size:10px;color:#9CA3AF">+' + (procs.length - 2) + '</span>' : '')
        : '<span style="color:#D1D5DB">—</span>'
      var valorTotal = orcamentos.reduce(function(sum, o) { return sum + (parseFloat(o.valor) || 0) }, 0)
      var valorHtml = valorTotal > 0
        ? '<span style="font-size:12px;font-weight:600;color:#059669">R$ ' + valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + '</span>'
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
        '<td style="padding:10px 12px;font-size:11px;vertical-align:middle">' + procsHtml + '</td>' +
        '<td style="padding:10px 12px;vertical-align:middle">' + valorHtml + '</td>' +
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

  // ── Sparklines (mini graficos nos KPI cards) ────────────────
  var _sparkRendered = false

  function _orcSparkline(canvasId, data, color) {
    var canvas = document.getElementById(canvasId)
    if (!canvas || typeof Chart === 'undefined') return
    var ctx = canvas.getContext('2d')
    var gradient = ctx.createLinearGradient(0, 0, 0, 36)
    gradient.addColorStop(0, color.replace(')', ', 0.25)').replace('rgb', 'rgba'))
    gradient.addColorStop(1, color.replace(')', ', 0)').replace('rgb', 'rgba'))
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(function(_, i) { return i }),
        datasets: [{ data: data, borderColor: color, borderWidth: 1.8, fill: true, backgroundColor: gradient, tension: 0.4, pointRadius: 0, pointHoverRadius: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 600 }
      }
    })
  }

  function _renderOrcSparklines(leads) {
    if (_sparkRendered) return
    _sparkRendered = true

    // Distribuicao por semana (ultimos 8 semanas)
    var weeks = [0,0,0,0,0,0,0,0]
    var now = Date.now()
    leads.forEach(function(l) {
      var d = l.created_at || l.createdAt
      if (!d) return
      var age = Math.floor((now - new Date(d).getTime()) / (7 * 86400000))
      if (age >= 0 && age < 8) weeks[7 - age]++
    })

    // Aprovados por semana
    var approvedWeeks = [0,0,0,0,0,0,0,0]
    leads.forEach(function(l) {
      var orcs = (l.customFields || {}).orcamentos || []
      if (!orcs.some(function(o) { return o.status === 'aprovado' })) return
      var d = l.created_at || l.createdAt
      if (!d) return
      var age = Math.floor((now - new Date(d).getTime()) / (7 * 86400000))
      if (age >= 0 && age < 8) approvedWeeks[7 - age]++
    })

    // Taxa por semana
    var taxaWeeks = weeks.map(function(t, i) { return t ? Math.round((approvedWeeks[i] / t) * 100) : 0 })

    _orcSparkline('orcSparkTotal', weeks, 'rgb(59, 130, 246)')
    _orcSparkline('orcSparkAbertos', weeks.map(function(t, i) { return t - approvedWeeks[i] }), 'rgb(245, 158, 11)')
    _orcSparkline('orcSparkAprovados', approvedWeeks, 'rgb(16, 185, 129)')
    _orcSparkline('orcSparkTaxa', taxaWeeks, 'rgb(124, 58, 237)')
  }

  function _renderOrcTrends(leads, abertos, aprovados, taxa) {
    // Comparar ultimos 30 dias vs 30 dias anteriores
    var now = Date.now()
    var d30 = 30 * 86400000
    var recentes = 0, anteriores = 0
    leads.forEach(function(l) {
      var d = l.created_at || l.createdAt
      if (!d) return
      var age = now - new Date(d).getTime()
      if (age <= d30) recentes++
      else if (age <= d30 * 2) anteriores++
    })

    var diff = recentes - anteriores
    var pct = anteriores ? Math.round((diff / anteriores) * 100) : 0

    _setTrend('kpiOrcTotalTrend', 'kpiOrcTotalTrendVal', diff, (diff >= 0 ? '+' : '') + diff)
    _setTrend('kpiOrcAbertosTrend', 'kpiOrcAbertosTrendVal', -abertos, abertos + ' pendentes')
    _setTrend('kpiOrcAprovadosTrend', 'kpiOrcAprovadosTrendVal', aprovados, aprovados + ' fechados')
    _setTrend('kpiOrcTaxaTrend', 'kpiOrcTaxaTrendVal', taxa - 50, taxa + '%')
  }

  function _setTrend(containerId, valId, direction, text) {
    var el = document.getElementById(containerId)
    var valEl = document.getElementById(valId)
    if (!el || !valEl) return
    el.style.display = ''
    valEl.textContent = text
    el.className = 'kpi-trend ' + (direction > 0 ? 'kpi-trend-up' : direction < 0 ? 'kpi-trend-down' : 'kpi-trend-neutral')
  }

  // ── Exports ─────────────────────────────────────────────────
  window.loadOrcamentos = load
  window.orcLoadMore = loadMore
  window.orcSortBy = sortBy
  window.orcPeriodClick = periodClick
  window.orcToggleAll = toggleAll
  window.exportOrcamentosCsv = exportCsv

})()
