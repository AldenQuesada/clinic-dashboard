/**
 * ClinicAI - VPI Ranking UI
 * Renderiza a tabela de parceiros (ranking).
 *
 * Janela temporal (Fase 8 - Entrega 4):
 *   - 'month' | '90d' | 'year' | 'all'
 *   - Default: 'month'
 *   - Usa RPC vpi_partner_ranking quando periodo != null (tabs)
 *   - Cai pra VPIService.getPartnersSorted (cache) quando periodo='all'
 *     e sort=ranking (preserva cache atual)
 */
;(function () {
  'use strict'

  if (window._vpiRankingUILoaded) return
  window._vpiRankingUILoaded = true

  var MEDAL = ['1', '2', '3']

  // Estado do periodo atual (por suffix, default: month)
  var _periodState = {}

  // Paleta de classe de score (Fase 6)
  var CLASSE = {
    diamante: { bg: 'linear-gradient(135deg,#1e293b,#0f172a)', cl: '#fff',    label: 'Diamante', border: '#0ea5e9' },
    quente:   { bg: 'linear-gradient(135deg,#F59E0B,#D97706)', cl: '#fff',    label: 'Quente',   border: '#F59E0B' },
    morna:    { bg: '#FEF3C7',                                 cl: '#92400E', label: 'Morna',    border: '#FCD34D' },
    fria:     { bg: '#F1F5F9',                                 cl: '#475569', label: 'Fria',     border: '#CBD5E1' },
    dormente: { bg: '#FEE2E2',                                 cl: '#991B1B', label: 'Dormente', border: '#FCA5A5' },
  }

  var PERIODS = [
    { id: 'month', label: 'Este mes' },
    { id: '90d',   label: 'Ultimos 90d' },
    { id: 'year',  label: 'Este ano' },
    { id: 'all',   label: 'Acumulado' },
  ]

  function _ensurePeriodTabs(suffix) {
    var tabsId = 'vpiRankingPeriodTabs' + suffix
    if (document.getElementById(tabsId)) return
    // Procura container da tabela pra injetar tabs antes dela
    var bodyId = 'vpiRankingBody' + suffix
    var tbody  = document.getElementById(bodyId)
    if (!tbody) return
    var table = tbody.closest('table')
    if (!table) return
    var wrap = table.parentElement && table.parentElement.parentElement
    if (!wrap) return

    var tabs = document.createElement('div')
    tabs.id = tabsId
    tabs.style.cssText = 'display:flex;gap:6px;padding:10px 20px 0 20px;flex-wrap:wrap;border-bottom:1px solid #F3F4F6;margin-bottom:0'

    var current = _periodState[suffix] || 'month'

    PERIODS.forEach(function (p) {
      var btn = document.createElement('button')
      var isActive = p.id === current
      btn.setAttribute('data-period', p.id)
      btn.textContent = p.label
      btn.style.cssText = 'padding:6px 12px;border:1.5px solid ' + (isActive ? '#7C3AED' : '#E5E7EB') +
        ';border-radius:6px;font-size:11px;font-weight:700;background:' + (isActive ? '#7C3AED' : '#F9FAFB') +
        ';color:' + (isActive ? '#fff' : '#374151') + ';cursor:pointer'
      btn.onclick = function () { setPeriod(suffix, p.id) }
      tabs.appendChild(btn)
    })

    // Tenta inserir logo antes da tabela
    var tableParent = table.parentElement
    if (tableParent) tableParent.parentElement.insertBefore(tabs, tableParent)
  }

  function _updatePeriodTabs(suffix) {
    var tabsId = 'vpiRankingPeriodTabs' + suffix
    var tabs = document.getElementById(tabsId)
    if (!tabs) return
    var current = _periodState[suffix] || 'month'
    var btns = tabs.querySelectorAll('button[data-period]')
    for (var i = 0; i < btns.length; i++) {
      var active = btns[i].getAttribute('data-period') === current
      btns[i].style.background = active ? '#7C3AED' : '#F9FAFB'
      btns[i].style.color      = active ? '#fff'    : '#374151'
      btns[i].style.border     = '1.5px solid ' + (active ? '#7C3AED' : '#E5E7EB')
    }
  }

  async function setPeriod(suffix, periodId) {
    _periodState[suffix || ''] = periodId
    _updatePeriodTabs(suffix || '')
    await render(suffix || '', null)
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _classeBadge(classe, score) {
    var c = CLASSE[classe] || CLASSE.dormente
    return '<div style="display:inline-flex;align-items:center;gap:4px;background:' + c.bg + ';color:' + c.cl + ';padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ' + c.border + '">' +
      '<span>' + (score || 0) + '</span>' +
      '<span style="opacity:.8">·</span>' +
      '<span>' + c.label + '</span>' +
    '</div>'
  }

  // Busca o ranking por periodo via RPC (Fase 8 - Entrega 4)
  async function _fetchByPeriod(period, limit) {
    try {
      var sb = window._sbShared
      if (!sb) return null
      var res = await sb.rpc('vpi_partner_ranking', {
        p_period: period,
        p_limit:  limit || 100,
      })
      if (res.error) throw new Error(res.error.message)
      var d = res.data || {}
      return Array.isArray(d.rows) ? d.rows : []
    } catch (e) {
      if (window.console && console.warn) console.warn('[VPIRankingUI] rpc period fail:', e && e.message)
      return null
    }
  }

  async function render(suffix, sort) {
    suffix = suffix || ''
    sort   = sort   || 'ranking'
    var bodyId = 'vpiRankingBody' + suffix
    var tbody  = document.getElementById(bodyId)
    if (!tbody) return

    if (!window.VPIService) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:#9CA3AF;font-size:13px">Carregando...</td></tr>'
      return
    }

    // Garante tabs de periodo
    _ensurePeriodTabs(suffix)
    var currentPeriod = _periodState[suffix] || 'month'

    // Se periodo != all e sort=ranking: usa RPC com janela temporal
    var rpcRows = null
    if (sort === 'ranking' && currentPeriod !== 'all') {
      rpcRows = await _fetchByPeriod(currentPeriod, 100)
    }

    await VPIService.loadPartners({ force: false, sort: sort })
    var query = ''
    var input = document.getElementById('vpiSearchPartner' + suffix)
    if (input) query = (input.value || '').toLowerCase()

    var partners
    if (rpcRows && rpcRows.length >= 0) {
      // Merge RPC rows com cache pra manter campos ricos (phone, status, etc)
      var byId = {}
      var cacheList = VPIService.getPartnersSorted('recent') || []
      for (var ci = 0; ci < cacheList.length; ci++) byId[String(cacheList[ci].id)] = cacheList[ci]
      partners = rpcRows.map(function (r) {
        var base = byId[String(r.partner_id)] || {}
        return Object.assign({}, base, {
          id: r.partner_id,
          nome: r.nome || base.nome,
          avatar_url: r.avatar_url || base.avatar_url,
          tier_atual: r.tier_atual || base.tier_atual,
          // Substitui a coluna "Mes" pelos valores do periodo
          indicacoes_mes:   r.indicacoes_no_periodo,
          indicacoes_ano:   base.indicacoes_ano,
          creditos_total:   base.creditos_total != null ? base.creditos_total : r.creditos_total,
          _period_creditos: r.creditos_do_periodo,
          score_classe:     r.classe || base.score_classe,
        })
      })
    } else {
      partners = VPIService.getPartnersSorted(sort)
    }
    if (query) {
      partners = partners.filter(function (p) {
        return (p.nome || '').toLowerCase().indexOf(query) >= 0
          || (p.cidade || '').toLowerCase().indexOf(query) >= 0
          || (p.profissao || '').toLowerCase().indexOf(query) >= 0
          || (p.phone || '').indexOf(query) >= 0
      })
    }

    if (!partners.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;text-align:center;color:#9CA3AF;font-size:13px">Nenhum parceiro encontrado.</td></tr>'
      return
    }

    // Sort por score se solicitado
    if (sort === 'score') {
      partners = partners.slice().sort(function (a, b) {
        return (b.score_total || 0) - (a.score_total || 0)
      })
    }

    tbody.innerHTML = partners.map(function (p, i) {
      var rank    = ((sort === 'ranking' || sort === 'score') && i < 3) ? MEDAL[i] : String(i + 1)
      var indMes  = p.indicacoes_mes || 0
      var indAno  = p.indicacoes_ano || 0
      var cred    = p.creditos_total || 0
      var prox    = (5 - (cred % 5)) || 5
      var pct     = Math.min((cred % 5) / 5 * 100, 100)
      var st      = (p.status === 'ativo')
        ? { bg: '#F0FDF4', cl: '#166534', tx: 'Ativo' }
        : (p.status === 'convidado')
          ? { bg: '#FEF3C7', cl: '#92400E', tx: 'Convidado' }
          : { bg: '#FEF2F2', cl: '#991B1B', tx: 'Inativo' }
      var classe = p.score_classe || 'dormente'
      var scoreTotal = p.score_total != null ? p.score_total : 0

      var cardUrl = ''
      if (p.card_token) {
        if (window.VPIEngine && typeof VPIEngine.cardUrl === 'function') {
          cardUrl = VPIEngine.cardUrl(p)
        } else {
          var base = (window.ClinicEnv && window.ClinicEnv.DASHBOARD_URL) ||
                     (window.location && window.location.origin) || ''
          cardUrl = String(base).replace(/\/+$/, '') + '/public_embaixadora.html?token=' + encodeURIComponent(p.card_token)
        }
      }

      return '<tr style="border-bottom:1px solid #F9FAFB;cursor:pointer" onclick="vpiViewPartner(\'' + _esc(p.id) + '\')" onmouseover="this.style.background=\'#FAFAFA\'" onmouseout="this.style.background=\'\'">' +
        '<td style="padding:11px 14px;font-size:13px;font-weight:700;color:#6B7280;white-space:nowrap">' + _esc(rank) + '</td>' +
        '<td style="padding:11px 14px;font-size:13px;font-weight:600;color:#111">' + _esc(p.nome) + '</td>' +
        '<td style="padding:11px 14px;text-align:center;font-size:12px;font-weight:700;color:#7C3AED">' + indMes + '</td>' +
        '<td style="padding:11px 14px;text-align:center;font-size:12px;font-weight:600;color:#374151">' + indAno + '</td>' +
        '<td style="padding:11px 14px;text-align:center">' +
          '<div style="display:flex;align-items:center;justify-content:center;gap:5px">' +
            '<span style="font-size:14px;font-weight:800;color:#111">' + cred + '</span>' +
            '<div style="width:44px;height:5px;background:#F3F4F6;border-radius:99px;overflow:hidden">' +
              '<div style="height:100%;width:' + pct + '%;background:#7C3AED;border-radius:99px"></div>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:10px;color:#9CA3AF;margin-top:2px">faltam ' + prox + '</div>' +
        '</td>' +
        '<td style="padding:11px 14px;text-align:center">' + _classeBadge(classe, scoreTotal) + '</td>' +
        '<td style="padding:11px 14px;text-align:center">' +
          '<span style="background:' + st.bg + ';color:' + st.cl + ';padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700">' + st.tx + '</span>' +
        '</td>' +
        '<td style="padding:11px 14px;text-align:center;white-space:nowrap">' +
          '<button onclick="event.stopPropagation();vpiViewPartner(\'' + _esc(p.id) + '\')" title="Detalhes" style="padding:5px 7px;border:1.5px solid #E5E7EB;border-radius:6px;background:#F9FAFB;color:#374151;cursor:pointer;margin-right:4px;display:inline-flex;align-items:center">' +
            '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
          '</button>' +
          (cardUrl
            ? '<button onclick="event.stopPropagation();window.open(\'' + _esc(cardUrl) + '\',\'_blank\',\'noopener\')" title="Abrir cartao publico" style="padding:5px 7px;border:1.5px solid #DDD6FE;border-radius:6px;background:#F5F3FF;color:#6D28D9;cursor:pointer;margin-right:4px;display:inline-flex;align-items:center">' +
                '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
              '</button>' +
              '<button onclick="event.stopPropagation();vpiCopyCardLink(\'' + _esc(cardUrl) + '\',this)" title="Copiar link do cartao" style="padding:5px 7px;border:1.5px solid #E5E7EB;border-radius:6px;background:#F9FAFB;color:#374151;cursor:pointer;margin-right:4px;display:inline-flex;align-items:center">' +
                '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
              '</button>'
            : '') +
          '<button onclick="event.stopPropagation();vpiDeletePartner(\'' + _esc(p.id) + '\')" title="Remover" style="padding:5px 7px;border:1.5px solid #FEE2E2;border-radius:6px;background:#FEF2F2;color:#DC2626;cursor:pointer;display:inline-flex;align-items:center">' +
            '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>' +
          '</button>' +
        '</td>' +
      '</tr>'
    }).join('')
  }

  async function vpiCopyCardLink(url, btn) {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      if (window._showToast) window._showToast('Link', 'Copiado', 'success')
      if (btn) {
        var orig = btn.innerHTML
        btn.innerHTML = '<svg width="13" height="13" fill="none" stroke="#10B981" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
        setTimeout(function () { if (btn) btn.innerHTML = orig }, 1500)
      }
    } catch (_) {
      prompt('Copie o link:', url)
    }
  }

  window.vpiCopyCardLink = vpiCopyCardLink

  window.VPIRankingUI = {
    render:    render,
    setPeriod: setPeriod,
    getPeriod: function (suffix) { return _periodState[suffix || ''] || 'month' },
  }
})()
