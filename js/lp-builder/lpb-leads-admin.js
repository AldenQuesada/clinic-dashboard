/**
 * LP Builder · Leads Admin
 *
 * Modal pra gerenciar leads capturados pelo formulário inline da
 * página atual: lista, filtra status, muda status, exporta CSV,
 * mostra estatísticas.
 *
 * Independente — testável isolado:
 *   await LPBLeadsAdmin.fetchLeads('lifting-5d')
 *   await LPBLeadsAdmin.changeStatus(leadId, 'contacted')
 *   LPBLeadsAdmin.open()
 *
 * Depende apenas de window.LPBuilder pra slug atual.
 */
;(function () {
  'use strict'
  if (window.LPBLeadsAdmin) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  var SB_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'

  function _rpc(name, params) {
    return fetch(SB_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params || {})
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    })
  }

  // ────────────────────────────────────────────────────────────
  // API pública
  // ────────────────────────────────────────────────────────────
  function fetchLeads(slug, status) {
    return _rpc('lp_leads_list', {
      p_slug:   slug || null,
      p_status: status || null,
      p_limit:  200,
    })
  }

  function changeStatus(id, status) {
    return _rpc('lp_lead_update_status', { p_id: id, p_status: status })
  }

  function deleteLead(id) {
    return _rpc('lp_lead_delete', { p_id: id })
  }

  function getStats(slug, periodDays) {
    return _rpc('lp_lead_stats', { p_slug: slug || null, p_period_days: periodDays || 30 })
  }

  function exportCsv(leads, filename) {
    if (!leads || !leads.length) return
    // Coleta todas as chaves jsonb data + meta cols
    var keysSet = {}
    leads.forEach(function (l) {
      Object.keys(l.data || {}).forEach(function (k) { keysSet[k] = 1 })
    })
    var dataKeys = Object.keys(keysSet)
    var headers = ['id', 'page_slug', 'status', 'created_at', 'utm_source', 'utm_campaign'].concat(dataKeys)

    function csvEsc(v) {
      if (v == null) return ''
      var s = String(v)
      if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }

    var rows = leads.map(function (l) {
      var utm = l.utm || {}
      var row = [
        l.id,
        l.page_slug,
        l.status,
        l.created_at,
        utm.source || '',
        utm.campaign || '',
      ]
      dataKeys.forEach(function (k) {
        row.push((l.data && l.data[k]) || '')
      })
      return row.map(csvEsc).join(',')
    })
    var csv = headers.join(',') + '\n' + rows.join('\n')

    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = (filename || 'leads') + '.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ────────────────────────────────────────────────────────────
  // Modal UI
  // ────────────────────────────────────────────────────────────
  var _activeTab = 'list'
  var _activeStatus = 'all'
  var _cachedLeads = []

  function open() {
    if (!window.LPBuilder) return
    var page = LPBuilder.getCurrentPage()
    if (!page) {
      LPBToast && LPBToast('Abra uma página primeiro', 'error')
      return
    }
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbLaBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:900px;max-height:90vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Submissões · ' + _esc(page.title || page.slug) + '</h3>' +
            '<button class="lpb-btn-icon" id="lpbLaClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="display:flex;border-bottom:1px solid var(--lpb-border);padding:0 14px" id="lpbLaTabs">' +
            _tabBtn('list',  'Lista',         'list') +
            _tabBtn('stats', 'Estatísticas',  'bar-chart-2') +
          '</div>' +
          '<div class="lpb-modal-body" id="lpbLaBody" style="flex:1;overflow:auto;padding:0">' +
            '<div style="padding:40px;text-align:center;color:var(--lpb-text-3);font-style:italic">Carregando...</div>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg    = document.getElementById('lpbLaBg')
    var close = document.getElementById('lpbLaClose')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss

    _attachTabs(page.slug)
    _renderTab(page.slug)
  }

  function _tabBtn(id, label, icon) {
    var active = id === _activeTab
    return '<button class="lpb-tab-btn" data-tab="' + id + '" ' +
      'style="background:transparent;border:0;color:' + (active ? 'var(--lpb-accent)' : 'var(--lpb-text-2)') + ';' +
      'padding:12px 14px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:500;' +
      'border-bottom:2px solid ' + (active ? 'var(--lpb-accent)' : 'transparent') + ';' +
      'cursor:pointer;display:inline-flex;align-items:center;gap:6px">' +
      _ico(icon, 12) + ' ' + label + '</button>'
  }

  function _attachTabs(slug) {
    document.querySelectorAll('#lpbLaTabs .lpb-tab-btn').forEach(function (b) {
      b.onclick = function () {
        _activeTab = b.dataset.tab
        // re-render header dos tabs
        var bar = document.getElementById('lpbLaTabs')
        if (bar) bar.innerHTML = _tabBtn('list', 'Lista', 'list') + _tabBtn('stats', 'Estatísticas', 'bar-chart-2')
        _attachTabs(slug)
        _renderTab(slug)
      }
    })
  }

  function _renderTab(slug) {
    if (_activeTab === 'stats') return _renderStats(slug)
    return _renderList(slug)
  }

  // ── LISTA ─────────────────────────────────────────────────
  async function _renderList(slug) {
    var body = document.getElementById('lpbLaBody')
    if (!body) return
    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--lpb-text-3);font-style:italic">Carregando submissões...</div>'

    try {
      var status = _activeStatus === 'all' ? null : _activeStatus
      _cachedLeads = await fetchLeads(slug, status) || []
    } catch (e) {
      body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--lpb-danger)">Erro: ' + _esc(e.message) + '</div>'
      return
    }

    var counts = { all: 0, new: 0, contacted: 0, converted: 0, discarded: 0 }
    var allCachedForCount = await fetchLeads(slug).catch(function () { return [] }) || []
    counts.all = allCachedForCount.length
    allCachedForCount.forEach(function (l) { counts[l.status] = (counts[l.status] || 0) + 1 })

    var filtersHtml = '<div style="display:flex;gap:6px;padding:12px 18px;border-bottom:1px solid var(--lpb-border);flex-wrap:wrap;align-items:center">' +
      _filterPill('all',       'Todos',     counts.all) +
      _filterPill('new',       'Novos',     counts.new || 0) +
      _filterPill('contacted', 'Contatados', counts.contacted || 0) +
      _filterPill('converted', 'Convertidos', counts.converted || 0) +
      _filterPill('discarded', 'Descartados', counts.discarded || 0) +
      '<div style="flex:1"></div>' +
      '<button class="lpb-btn ghost sm" id="lpbLaCsv">' + _ico('download', 12) + ' Exportar CSV</button>' +
      '</div>'

    var tableHtml
    if (!_cachedLeads.length) {
      tableHtml = '<div style="padding:60px;text-align:center;color:var(--lpb-text-3);font-style:italic;font-family:Cormorant Garamond,serif;font-size:18px">' +
        'Nenhuma submissão ' + (_activeStatus === 'all' ? '' : 'com status "' + _esc(_activeStatus) + '"') + '.' +
        '</div>'
    } else {
      tableHtml = '<div>' + _cachedLeads.map(function (l, i) {
        return _renderLeadRow(l, i)
      }).join('') + '</div>'
    }

    body.innerHTML = filtersHtml + tableHtml

    // wire filter pills
    body.querySelectorAll('[data-filter]').forEach(function (b) {
      b.onclick = function () {
        _activeStatus = b.dataset.filter
        _renderList(slug)
      }
    })
    // wire export
    var csvBtn = document.getElementById('lpbLaCsv')
    if (csvBtn) csvBtn.onclick = function () {
      exportCsv(_cachedLeads, 'leads-' + slug)
      LPBToast && LPBToast('CSV gerado', 'success')
    }
    // wire row actions
    body.querySelectorAll('[data-lead-act]').forEach(function (b) {
      b.onclick = async function (e) {
        e.preventDefault(); e.stopPropagation()
        var act = b.dataset.leadAct
        var id  = b.dataset.leadId
        if (!id) return
        if (act === 'delete') {
          if (!confirm('Excluir este lead permanentemente?')) return
          await deleteLead(id)
        } else {
          await changeStatus(id, act)
        }
        _renderList(slug)
      }
    })
    // wire row expand
    body.querySelectorAll('[data-lead-expand]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.leadExpand
        var details = body.querySelector('[data-lead-details="' + id + '"]')
        if (details) details.style.display = details.style.display === 'none' ? '' : 'none'
      }
    })
  }

  function _filterPill(value, label, count) {
    var active = _activeStatus === value
    return '<button data-filter="' + value + '" ' +
      'style="background:' + (active ? 'var(--lpb-accent)' : 'transparent') + ';' +
      'border:1px solid ' + (active ? 'var(--lpb-accent)' : 'var(--lpb-border)') + ';' +
      'color:' + (active ? '#1A1A1C' : 'var(--lpb-text-2)') + ';' +
      'padding:6px 12px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;cursor:pointer">' +
      _esc(label) + ' (' + count + ')' +
      '</button>'
  }

  function _renderLeadRow(l, i) {
    var data = l.data || {}
    var utm = l.utm || {}
    var nome = data.nome || data.name || '(sem nome)'
    var phone = data.telefone || data.phone || data.tel || ''
    var when = new Date(l.created_at)
    var whenStr = when.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    var statusColors = {
      new: 'var(--lpb-warn)', contacted: 'var(--lpb-text-2)',
      converted: 'var(--lpb-success)', discarded: 'var(--lpb-text-3)',
    }
    var statusLabels = {
      new: 'Novo', contacted: 'Contatado', converted: 'Convertido', discarded: 'Descartado',
    }

    var actBtns = ['contacted','converted','discarded'].filter(function (s) { return s !== l.status }).map(function (s) {
      return '<button class="lpb-btn ghost sm" data-lead-act="' + s + '" data-lead-id="' + _esc(l.id) + '" title="Marcar como ' + statusLabels[s] + '">' +
        statusLabels[s] + '</button>'
    }).join(' ')

    return '<div style="border-bottom:1px solid var(--lpb-border);padding:12px 18px">' +
      '<div style="display:flex;align-items:center;gap:14px;cursor:pointer" data-lead-expand="' + _esc(l.id) + '">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;color:var(--lpb-text)">' + _esc(nome) +
            (phone ? ' · <span style="color:var(--lpb-text-3);font-size:12px">' + _esc(phone) + '</span>' : '') +
          '</div>' +
          '<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--lpb-text-3);margin-top:3px">' +
            whenStr +
            (utm.source ? ' · ' + _esc(utm.source) : '') +
            (utm.campaign ? ' · ' + _esc(utm.campaign) : '') +
          '</div>' +
        '</div>' +
        '<span style="background:' + statusColors[l.status] + ';color:#1A1A1C;padding:2px 8px;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600">' +
          statusLabels[l.status] + '</span>' +
      '</div>' +
      '<div data-lead-details="' + _esc(l.id) + '" style="display:none;background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:12px 14px;margin-top:10px;font-size:12px;color:var(--lpb-text-2);line-height:1.7">' +
        '<div style="margin-bottom:10px"><strong style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent)">Dados do formulário</strong></div>' +
        Object.keys(data).map(function (k) {
          return '<div><span style="color:var(--lpb-text-3)">' + _esc(k) + ':</span> ' + _esc(data[k]) + '</div>'
        }).join('') +
        (utm && Object.keys(utm).length
          ? '<div style="margin-top:10px"><strong style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent)">UTM</strong></div>' +
            Object.keys(utm).map(function (k) {
              return '<div><span style="color:var(--lpb-text-3)">' + _esc(k) + ':</span> ' + _esc(utm[k]) + '</div>'
            }).join('')
          : '') +
        '<div style="margin-top:14px;display:flex;gap:6px;flex-wrap:wrap">' +
          actBtns +
          '<button class="lpb-btn ghost sm danger" data-lead-act="delete" data-lead-id="' + _esc(l.id) + '">' + _ico('trash-2', 11) + ' Excluir</button>' +
        '</div>' +
      '</div>' +
      '</div>'
  }

  // ── STATS ─────────────────────────────────────────────────
  async function _renderStats(slug) {
    var body = document.getElementById('lpbLaBody')
    if (!body) return
    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--lpb-text-3);font-style:italic">Calculando estatísticas...</div>'

    var st
    try { st = await getStats(slug, 30) }
    catch (e) {
      body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--lpb-danger)">Erro: ' + _esc(e.message) + '</div>'
      return
    }

    var bs = st.by_status || {}
    var convRate = st.total ? Math.round(((bs.converted || 0) / st.total) * 100) : 0

    body.innerHTML = '' +
      '<div style="padding:24px 20px">' +
        '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);margin-bottom:14px">Últimos ' + st.period_days + ' dias</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:24px">' +
          _bigStat(st.total || 0, 'Total submissões', 'var(--lpb-accent)') +
          _bigStat(bs.new || 0, 'Novos · não contatados', 'var(--lpb-warn)') +
          _bigStat(bs.converted || 0, 'Convertidos', 'var(--lpb-success)') +
          _bigStat(convRate + '%', 'Taxa de conversão', 'var(--lpb-text)') +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px">' +
          '<div>' +
            '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);margin-bottom:10px">Top fontes UTM</div>' +
            (st.top_utm_source && st.top_utm_source.length
              ? st.top_utm_source.map(function (s) {
                  return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--lpb-border);font-size:12px">' +
                    '<span>' + _esc(s.source) + '</span><strong style="color:var(--lpb-accent)">' + s.n + '</strong>' +
                    '</div>'
                }).join('')
              : '<div style="color:var(--lpb-text-3);font-style:italic;font-size:12px">Sem dados de UTM ainda.</div>') +
          '</div>' +
          '<div>' +
            '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);margin-bottom:10px">Top campanhas UTM</div>' +
            (st.top_utm_campaign && st.top_utm_campaign.length
              ? st.top_utm_campaign.map(function (c) {
                  return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--lpb-border);font-size:12px">' +
                    '<span>' + _esc(c.campaign) + '</span><strong style="color:var(--lpb-accent)">' + c.n + '</strong>' +
                    '</div>'
                }).join('')
              : '<div style="color:var(--lpb-text-3);font-style:italic;font-size:12px">Sem dados de UTM ainda.</div>') +
          '</div>' +
        '</div>' +

        (st.by_day && st.by_day.length
          ? '<div style="margin-top:24px">' +
              '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);margin-bottom:10px">Por dia</div>' +
              _renderSparkbar(st.by_day) +
            '</div>'
          : '') +
      '</div>'
  }

  function _bigStat(value, label, color) {
    return '<div style="text-align:center">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:36px;font-weight:300;font-style:italic;color:' + color + ';line-height:1">' +
        _esc(String(value)) +
      '</div>' +
      '<div style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--lpb-text-3);margin-top:6px">' +
        _esc(label) +
      '</div>' +
    '</div>'
  }

  function _renderSparkbar(data) {
    var max = Math.max.apply(null, data.map(function (d) { return d.n }))
    if (max === 0) max = 1
    return '<div style="display:flex;align-items:flex-end;gap:3px;height:80px;border-bottom:1px solid var(--lpb-border)">' +
      data.map(function (d) {
        var h = (d.n / max) * 100
        var date = new Date(d.date)
        return '<div style="flex:1;background:var(--lpb-accent);height:' + h + '%;min-height:2px;opacity:.8;cursor:default;position:relative" title="' +
          date.toLocaleDateString('pt-BR') + ': ' + d.n + ' lead(s)"></div>'
      }).join('') +
      '</div>'
  }

  window.LPBLeadsAdmin = Object.freeze({
    fetchLeads:   fetchLeads,
    changeStatus: changeStatus,
    deleteLead:   deleteLead,
    getStats:     getStats,
    exportCsv:    exportCsv,
    open:         open,
  })
})()
