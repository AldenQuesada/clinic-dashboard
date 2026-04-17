/**
 * ClinicAI - VPI Ranking UI
 * Renderiza a tabela de parceiros (ranking).
 */
;(function () {
  'use strict'

  if (window._vpiRankingUILoaded) return
  window._vpiRankingUILoaded = true

  var MEDAL = ['1', '2', '3']

  // Paleta de classe de score (Fase 6)
  var CLASSE = {
    diamante: { bg: 'linear-gradient(135deg,#1e293b,#0f172a)', cl: '#fff',    label: 'Diamante', border: '#0ea5e9' },
    quente:   { bg: 'linear-gradient(135deg,#F59E0B,#D97706)', cl: '#fff',    label: 'Quente',   border: '#F59E0B' },
    morna:    { bg: '#FEF3C7',                                 cl: '#92400E', label: 'Morna',    border: '#FCD34D' },
    fria:     { bg: '#F1F5F9',                                 cl: '#475569', label: 'Fria',     border: '#CBD5E1' },
    dormente: { bg: '#FEE2E2',                                 cl: '#991B1B', label: 'Dormente', border: '#FCA5A5' },
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

    await VPIService.loadPartners({ force: false, sort: sort })
    var query = ''
    var input = document.getElementById('vpiSearchPartner' + suffix)
    if (input) query = (input.value || '').toLowerCase()

    var partners = VPIService.getPartnersSorted(sort)
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
          '<button onclick="event.stopPropagation();vpiDeletePartner(\'' + _esc(p.id) + '\')" title="Remover" style="padding:5px 7px;border:1.5px solid #FEE2E2;border-radius:6px;background:#FEF2F2;color:#DC2626;cursor:pointer;display:inline-flex;align-items:center">' +
            '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>' +
          '</button>' +
        '</td>' +
      '</tr>'
    }).join('')
  }

  window.VPIRankingUI = { render: render }
})()
