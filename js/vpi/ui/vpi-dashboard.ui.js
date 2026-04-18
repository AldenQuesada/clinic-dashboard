/**
 * ClinicAI — VPI Dashboard Executivo (page-growth-partners)
 *
 * Visao executiva pra Mirian tomar decisoes rapidas:
 *   1. Pendencias (resgates, historias, missao/desafio ativos)
 *   2. Top 10 do mes
 *   3. Caindo em risco (dormentes + score baixo)
 *   4. Feed de ultimas indicacoes fechadas
 *
 * KPIs estrategicos ficam no topo (renderizados por vpi-strategic-kpis.ui.js).
 *
 * Expoe window.vpiRenderDashboard().
 */
;(function () {
  'use strict'
  if (window._vpiDashboardUILoaded) return
  window._vpiDashboardUILoaded = true

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _sb() { return window._sbShared || null }
  function _fmtDate(iso) {
    if (!iso) return '—'
    try {
      var d = new Date(iso)
      var days = Math.floor((Date.now() - d.getTime()) / 86400000)
      if (days === 0) return 'hoje'
      if (days === 1) return 'ontem'
      if (days < 7) return days + 'd atrás'
      return d.toLocaleDateString('pt-BR')
    } catch (_) { return '—' }
  }
  function _initials(nome) {
    var parts = String(nome || '?').trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  // ── Classe/badge score helper ──
  var CLASSE = {
    diamante: { bg:'linear-gradient(135deg,#1e293b,#0f172a)', cl:'#fff',    label:'Diamante' },
    quente:   { bg:'linear-gradient(135deg,#F59E0B,#D97706)', cl:'#fff',    label:'Quente'   },
    morna:    { bg:'#FEF3C7',                                 cl:'#92400E', label:'Morna'    },
    fria:     { bg:'#F1F5F9',                                 cl:'#475569', label:'Fria'     },
    dormente: { bg:'#FEE2E2',                                 cl:'#991B1B', label:'Dormente' },
  }
  function _classeBadge(classe, score) {
    var c = CLASSE[classe] || CLASSE.dormente
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:' + c.bg + ';color:' + c.cl + ';padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700">' +
      (score != null ? score + ' · ' : '') + c.label +
    '</span>'
  }

  // ══════════════════════════════════════════════════
  // Pendencias
  // ══════════════════════════════════════════════════
  async function _fetchPendencias() {
    var sb = _sb()
    if (!sb) return null
    var out = { resgates: 0, historias: 0, missao: null, desafio: null }

    try {
      var r1 = await sb.rpc('vpi_ponteira_resgate_list', { p_status: 'pending' })
      if (!r1.error) out.resgates = ((r1.data && r1.data.rows) || []).length
    } catch (_) {}

    try {
      // Historias pendentes: audit log com action=revista_historia_pendente
      // sem dedup por indication (simples count nos ultimos 60d)
      var r2 = await sb
        .from('vpi_audit_log')
        .select('entity_id', { count: 'exact', head: true })
        .eq('action', 'revista_historia_pendente')
        .gte('created_at', new Date(Date.now() - 60 * 86400000).toISOString())
      if (!r2.error) out.historias = r2.count || 0
    } catch (_) {}

    try {
      var r3 = await sb.rpc('vpi_missao_list')
      if (!r3.error) {
        var missoes = (r3.data && r3.data.rows) || r3.data || []
        var ativa = (missoes || []).find(function (m) {
          if (!m.is_active) return false
          if (!m.valid_until) return true
          return new Date(m.valid_until).getTime() > Date.now()
        })
        out.missao = ativa || null
      }
    } catch (_) {}

    try {
      var r4 = await sb.rpc('vpi_challenge_list')
      if (!r4.error) {
        var chs = r4.data || []
        var now = Date.now()
        var ativo = (chs || []).find(function (c) {
          if (!c.is_active) return false
          if (c.periodo_inicio && new Date(c.periodo_inicio).getTime() > now) return false
          if (c.periodo_fim && new Date(c.periodo_fim).getTime() < now) return false
          return true
        })
        out.desafio = ativo || null
      }
    } catch (_) {}

    return out
  }

  function _renderPendencias(p) {
    if (!p) return ''
    var itens = []

    if (p.resgates > 0) {
      itens.push({
        bg:'#F5F3FF', border:'#DDD6FE', icon:'#6D28D9',
        svg:'<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 12V8H6a2 2 0 1 1 0-4h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>',
        label: p.resgates + ' resgate(s) aguardando',
        detail:'Parceiras pediram ponteiras. Agende a sessão.',
        onclick:'navigateTo(\'growth-referral\');setTimeout(function(){vpiSwitchTab(8)},200)',
      })
    }
    if (p.historias > 0) {
      itens.push({
        bg:'#FEF3C7', border:'#FCD34D', icon:'#92400E',
        svg:'<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
        label: p.historias + ' história(s) pra preencher',
        detail:'Full Face fechou mas falta consent/fotos/depoimento pro spread na Revista.',
        onclick:'',
      })
    }
    if (p.missao) {
      var m = p.missao
      var prog = 0, target = 1
      if (m.criterio && typeof m.criterio === 'object' && m.criterio.target) target = m.criterio.target
      itens.push({
        bg:'#ECFDF5', border:'#BBF7D0', icon:'#065F46',
        svg:'<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        label:'Missão ativa: ' + _esc(m.titulo || 'sem nome'),
        detail: m.recompensa_texto ? 'Recompensa: ' + _esc(m.recompensa_texto) : '',
        onclick:'navigateTo(\'growth-referral\');setTimeout(function(){vpiSwitchTab(5)},200)',
      })
    }
    if (p.desafio) {
      var d = p.desafio
      itens.push({
        bg:'#FEF2F2', border:'#FECACA', icon:'#991B1B',
        svg:'<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
        label:'Desafio ativo: ' + _esc(d.titulo || 'sem nome'),
        detail: 'x' + (Number(d.multiplier || 1).toFixed(1)) + ' créditos até ' +
                (d.periodo_fim ? new Date(d.periodo_fim).toLocaleDateString('pt-BR') : '—'),
        onclick:'navigateTo(\'growth-referral\');setTimeout(function(){vpiSwitchTab(6)},200)',
      })
    }

    if (!itens.length) {
      return '<div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:20px;margin-bottom:18px;text-align:center;color:#9CA3AF;font-size:13px">' +
        '<svg width="28" height="28" fill="none" stroke="#D1D5DB" stroke-width="1.5" viewBox="0 0 24 24" style="margin-bottom:8px"><circle cx="12" cy="12" r="10"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
        '<div>Nenhuma pendência agora. Bom trabalho!</div>' +
      '</div>'
    }

    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:24px">' +
      itens.map(function (it) {
        var cursor = it.onclick ? 'cursor:pointer' : ''
        var onclick = it.onclick ? 'onclick="' + it.onclick + '"' : ''
        return '<div ' + onclick + ' style="background:' + it.bg + ';border:1px solid ' + it.border + ';border-radius:12px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start;' + cursor + '">' +
          '<div style="color:' + it.icon + ';flex:0 0 auto;margin-top:2px">' + it.svg + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:700;color:#111;margin-bottom:2px">' + it.label + '</div>' +
            (it.detail ? '<div style="font-size:11px;color:#6B7280;line-height:1.4">' + it.detail + '</div>' : '') +
          '</div>' +
        '</div>'
      }).join('') +
    '</div>'
  }

  // ══════════════════════════════════════════════════
  // Top 10 do mes
  // ══════════════════════════════════════════════════
  async function _fetchTop10() {
    var sb = _sb()
    if (!sb) return []
    try {
      var r = await sb.rpc('vpi_partner_ranking', { p_period: 'month', p_limit: 10 })
      if (r.error) return []
      return (r.data && r.data.rows) || []
    } catch (_) { return [] }
  }

  function _renderTop10(rows) {
    if (!rows || !rows.length) {
      return '<div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:24px;margin-bottom:18px;text-align:center;color:#9CA3AF;font-size:13px">Ainda sem indicações fechadas este mês.</div>'
    }
    var medals = ['🥇', '🥈', '🥉']
    return '<div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;margin-bottom:18px;overflow:hidden">' +
      '<div style="padding:14px 20px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<svg width="16" height="16" fill="none" stroke="#7C3AED" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>' +
          '<span style="font-size:14px;font-weight:700;color:#111">Top 10 do mês</span>' +
        '</div>' +
        '<a href="?page=growth-referral" onclick="navigateTo(\'growth-referral\');return false" style="font-size:11px;color:#6D28D9;font-weight:600;text-decoration:none">Ver ranking completo →</a>' +
      '</div>' +
      '<div>' +
        rows.map(function (r, i) {
          var rank = i < 3 ? medals[i] : '#' + (i + 1)
          var indicacoes = r.indicacoes_no_periodo != null ? r.indicacoes_no_periodo : (r.qtd || 0)
          var classe = r.classe || r.score_classe || 'fria'
          return '<div onclick="vpiViewPartner(\'' + _esc(r.partner_id) + '\')" style="padding:10px 20px;border-bottom:1px solid #F9FAFB;display:flex;align-items:center;gap:12px;cursor:pointer" onmouseover="this.style.background=\'#FAFAFA\'" onmouseout="this.style.background=\'\'">' +
            '<div style="width:32px;font-size:13px;font-weight:700;color:#6B7280;text-align:center">' + rank + '</div>' +
            '<div style="width:32px;height:32px;border-radius:50%;background:#F5F3FF;color:#7C3AED;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">' + _initials(r.nome) + '</div>' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-size:13px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(r.nome || '—') + '</div>' +
              '<div style="font-size:10px;color:#9CA3AF;margin-top:1px">' + (r.creditos_total || 0) + ' créditos totais</div>' +
            '</div>' +
            '<div style="text-align:center;min-width:60px">' +
              '<div style="font-size:16px;font-weight:800;color:#7C3AED">' + indicacoes + '</div>' +
              '<div style="font-size:9px;color:#9CA3AF;letter-spacing:.04em;text-transform:uppercase">este mês</div>' +
            '</div>' +
            '<div style="min-width:88px;text-align:right">' + _classeBadge(classe) + '</div>' +
          '</div>'
        }).join('') +
      '</div>' +
    '</div>'
  }

  // ══════════════════════════════════════════════════
  // Caindo em risco (dormentes + fria)
  // ══════════════════════════════════════════════════
  function _renderRisco() {
    if (!window.VPIService) return ''
    var partners = (window.VPIService.getPartnersSorted('score') || []).slice()
    // filtra status ativo + classes problemáticas
    var risco = partners.filter(function (p) {
      if (p.status !== 'ativo') return false
      return (p.score_classe === 'dormente' || p.score_classe === 'fria') &&
             (p.creditos_total || 0) > 0  // já indicou alguma vez
    }).slice(0, 6)

    if (!risco.length) {
      return '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:16px;margin-bottom:18px;text-align:center;color:#065F46;font-size:12px;font-weight:600">' +
        '✨ Nenhuma parceira em risco. Todas ativas.' +
      '</div>'
    }

    return '<div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;margin-bottom:18px;overflow:hidden">' +
      '<div style="padding:14px 20px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<svg width="16" height="16" fill="none" stroke="#D97706" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          '<span style="font-size:14px;font-weight:700;color:#111">Parceiras caindo</span>' +
          '<span style="font-size:10px;color:#9CA3AF;font-weight:500">— reativar antes que saiam</span>' +
        '</div>' +
      '</div>' +
      '<div>' +
        risco.map(function (p) {
          return '<div onclick="vpiViewPartner(\'' + _esc(p.id) + '\')" style="padding:10px 20px;border-bottom:1px solid #F9FAFB;display:flex;align-items:center;gap:12px;cursor:pointer" onmouseover="this.style.background=\'#FAFAFA\'" onmouseout="this.style.background=\'\'">' +
            '<div style="width:32px;height:32px;border-radius:50%;background:#FEF3C7;color:#92400E;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">' + _initials(p.nome) + '</div>' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-size:13px;font-weight:600;color:#111">' + _esc(p.nome) + '</div>' +
              '<div style="font-size:10px;color:#9CA3AF;margin-top:1px">' + (p.creditos_total || 0) + ' créditos · última atividade ' + _fmtDate(p.updated_at || p.created_at) + '</div>' +
            '</div>' +
            _classeBadge(p.score_classe, p.score_total) +
          '</div>'
        }).join('') +
      '</div>' +
    '</div>'
  }

  // ══════════════════════════════════════════════════
  // Feed de ultimas indicacoes
  // ══════════════════════════════════════════════════
  async function _fetchFeed() {
    var sb = _sb()
    if (!sb) return []
    try {
      var r = await sb
        .from('vpi_indications')
        .select('id, partner_id, lead_id, procedimento, creditos, fechada_em')
        .eq('status', 'closed')
        .order('fechada_em', { ascending: false })
        .limit(10)
      if (r.error) return []
      return r.data || []
    } catch (_) { return [] }
  }

  function _renderFeed(rows) {
    if (!rows || !rows.length) return ''

    // Enriquece com nome da parceira via cache
    var byId = {}
    if (window.VPIService) {
      var all = window.VPIService.getPartnersSorted('recent') || []
      for (var i = 0; i < all.length; i++) byId[String(all[i].id)] = all[i]
    }

    return '<div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;margin-bottom:18px;overflow:hidden">' +
      '<div style="padding:14px 20px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;gap:8px">' +
        '<svg width="16" height="16" fill="none" stroke="#10B981" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
        '<span style="font-size:14px;font-weight:700;color:#111">Últimas indicações fechadas</span>' +
      '</div>' +
      '<div>' +
        rows.map(function (r) {
          var partner = byId[String(r.partner_id)] || { nome: 'Parceira' }
          var fullFace = r.creditos >= 5
          return '<div style="padding:10px 20px;border-bottom:1px solid #F9FAFB;display:flex;align-items:center;gap:12px">' +
            '<div style="width:28px;height:28px;border-radius:50%;background:' + (fullFace ? 'linear-gradient(135deg,#C9A96E,#E4C795)' : '#D1FAE5') + ';color:' + (fullFace ? '#0B0813' : '#065F46') + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">' + (fullFace ? '✦' : '✓') + '</div>' +
            '<div style="flex:1;min-width:0;font-size:12px">' +
              '<div style="color:#111;font-weight:600">' + _esc(partner.nome || 'Parceira') + ' → indicou <strong>' + _esc(r.procedimento || 'procedimento') + '</strong></div>' +
              '<div style="color:#9CA3AF;font-size:10px;margin-top:1px">+' + (r.creditos || 0) + ' ponteira(s) · ' + _fmtDate(r.fechada_em) + '</div>' +
            '</div>' +
          '</div>'
        }).join('') +
      '</div>' +
    '</div>'
  }

  // ══════════════════════════════════════════════════
  // Render principal
  // ══════════════════════════════════════════════════
  async function vpiRenderDashboard() {
    var container = document.getElementById('vpiDashboardContainer')
    if (!container) return

    container.innerHTML = '<div style="padding:30px;text-align:center;color:#9CA3AF;font-size:13px">Carregando dashboard...</div>'

    // Garante cache de parceiros
    if (window.VPIService && window.VPIService.loadPartners) {
      try { await window.VPIService.loadPartners({ force: false }) } catch (_) {}
    }

    // Fetch paralelo
    var results = await Promise.all([
      _fetchPendencias(),
      _fetchTop10(),
      _fetchFeed(),
    ])

    container.innerHTML =
      '<div id="vpiChannelLTVCACSection"></div>' +
      '<div id="vpiNPSSection"></div>' +
      _renderPendencias(results[0]) +
      _renderTop10(results[1]) +
      _renderRisco() +
      _renderFeed(results[2])

    // Channel LTV/CAC analytics (s2-6)
    if (typeof window.renderChannelLTVCAC === 'function') {
      window.renderChannelLTVCAC('vpiChannelLTVCACSection')
    }
    // NPS dashboard (s2-3)
    if (typeof window.renderNPSDashboard === 'function') {
      window.renderNPSDashboard('vpiNPSSection')
    }
  }

  window.vpiRenderDashboard = vpiRenderDashboard
})()
