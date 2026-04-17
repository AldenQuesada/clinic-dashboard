/**
 * ClinicAI - VPI Partner Modal
 * Drawer com detalhes do parceiro + historico de indicacoes.
 *
 * Fase 6 Entrega 2: card de Score composto + alertas.
 *
 * Expoe window.VPIPartnerModal.open(id)
 *          window.VPIPartnerModal.close()
 *          window.VPIPartnerModal.recompute(id)   — recalcula on-demand
 *          window.VPIPartnerModal.sendReativacao(id)
 */
;(function () {
  'use strict'

  if (window._vpiPartnerModalLoaded) return
  window._vpiPartnerModalLoaded = true

  var CLASSE = {
    diamante: { bg: 'linear-gradient(135deg,#1e293b,#0f172a)', cl: '#fff',    label: 'Diamante' },
    quente:   { bg: 'linear-gradient(135deg,#F59E0B,#D97706)', cl: '#fff',    label: 'Quente'   },
    morna:    { bg: '#FEF3C7',                                 cl: '#92400E', label: 'Morna'    },
    fria:     { bg: '#F1F5F9',                                 cl: '#475569', label: 'Fria'     },
    dormente: { bg: '#FEE2E2',                                 cl: '#991B1B', label: 'Dormente' },
  }

  var ALERTA_COR = {
    orange: { bg: '#FFF7ED', border: '#FED7AA', cl: '#9A3412' },
    red:    { bg: '#FEF2F2', border: '#FECACA', cl: '#991B1B' },
    yellow: { bg: '#FEFCE8', border: '#FDE68A', cl: '#92400E' },
    green:  { bg: '#F0FDF4', border: '#BBF7D0', cl: '#166534' },
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _close() {
    var m = document.getElementById('vpiViewModal')
    if (m) m.remove()
  }

  async function _recompute(id) {
    var sb = window._sbShared
    if (!sb) return
    try {
      var btn = document.getElementById('vpiScoreRecompBtn')
      if (btn) { btn.disabled = true; btn.textContent = 'Calculando...' }
      var res = await sb.rpc('vpi_partner_compute_score', { p_partner_id: id })
      if (res.error) throw new Error(res.error.message)
      if (window._showToast) _showToast('Score', 'Recalculado com sucesso', 'success')
      if (window.VPIService) VPIService.invalidatePartners()
      // Reload + reopen
      await open(id)
    } catch (e) {
      console.error('[VPI] recompute:', e)
      alert('Falha ao recalcular: ' + (e.message || ''))
    }
  }

  function _buildCardUrl(partner) {
    if (window.VPIEngine && typeof VPIEngine.cardUrl === 'function') {
      return VPIEngine.cardUrl(partner)
    }
    if (!partner || !partner.card_token) return ''
    var base = (window.ClinicEnv && window.ClinicEnv.DASHBOARD_URL) ||
               (window.location && window.location.origin) || ''
    base = String(base).replace(/\/+$/, '')
    return base + '/public_embaixadora.html?token=' + encodeURIComponent(partner.card_token)
  }

  function _openCard(id) {
    var btn = document.getElementById('vpiOpenCardBtn')
    if (btn && btn.dataset && btn.dataset.url) {
      window.open(btn.dataset.url, '_blank', 'noopener')
    }
  }

  async function _copyLink(id) {
    var btn = document.getElementById('vpiCopyLinkBtn')
    if (!btn || !btn.dataset) return
    var url = btn.dataset.url
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      if (window._showToast) _showToast('Link', 'Copiado para a área de transferência', 'success')
      var orig = btn.innerHTML
      btn.innerHTML = '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Copiado'
      setTimeout(function () { if (btn) btn.innerHTML = orig }, 1800)
    } catch (_) {
      prompt('Copie o link abaixo:', url)
    }
  }

  async function _sendReativacao(id) {
    if (!confirm('Enviar WhatsApp de reativação (critério injetável expirado) para esta parceira?')) return
    var sb = window._sbShared
    if (!sb) return
    try {
      var res = await sb.rpc('vpi_send_reativacao', { p_partner_id: id })
      if (res.error) throw new Error(res.error.message)
      var r = res.data || {}
      if (r.ok) {
        if (window._showToast) _showToast('Reativação', 'WA enfileirada', 'success')
      } else {
        alert('Falha: ' + (r.error || 'desconhecida'))
      }
    } catch (e) {
      console.error('[VPI] reativacao:', e)
      alert('Erro: ' + (e.message || ''))
    }
  }

  function _scoreBar(label, val, total) {
    total = total || 100
    var pct = Math.max(0, Math.min(100, (val / total) * 100))
    var color = pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444'
    return '<div style="margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:3px">' +
        '<span style="font-size:11px;color:#6B7280;font-weight:600">' + _esc(label) + '</span>' +
        '<span style="font-size:11px;color:#111;font-weight:700">' + (val || 0) + '/100</span>' +
      '</div>' +
      '<div style="height:5px;background:#F3F4F6;border-radius:99px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:99px;transition:width .5s"></div>' +
      '</div>' +
    '</div>'
  }

  function _renderAlerta(a, partnerId) {
    var cor = ALERTA_COR[a.cor] || ALERTA_COR.yellow
    var cta = ''
    if (a.cta && a.cta.action === 'vpi_send_reativacao') {
      cta = '<button onclick="VPIPartnerModal.sendReativacao(\'' + _esc(partnerId) + '\')" style="margin-left:auto;padding:4px 10px;background:#fff;border:1.5px solid ' + cor.border + ';color:' + cor.cl + ';border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">' + _esc(a.cta.label) + '</button>'
    }
    return '<div style="display:flex;align-items:center;gap:8px;background:' + cor.bg + ';border:1px solid ' + cor.border + ';color:' + cor.cl + ';padding:8px 10px;border-radius:8px;font-size:11px;margin-bottom:6px">' +
      '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
      '<span style="flex:1;font-weight:600">' + _esc(a.texto) + '</span>' +
      cta +
    '</div>'
  }

  function _renderScoreCard(p) {
    var classe = p.score_classe || 'dormente'
    var c = CLASSE[classe] || CLASSE.dormente
    var total = p.score_total || 0
    var alertas = Array.isArray(p.alertas) ? p.alertas : []

    var alertasHtml = alertas.length
      ? alertas.map(function (a) { return _renderAlerta(a, p.id) }).join('')
      : '<div style="text-align:center;padding:8px;color:#9CA3AF;font-size:11px;font-style:italic">Nenhum alerta ativo</div>'

    return '<div style="background:linear-gradient(135deg,#F5F3FF 0%,#FFF 100%);border-radius:12px;border:1.5px solid #E0E7FF;padding:16px;margin-bottom:18px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">' +
        '<div>' +
          '<div style="font-size:10px;font-weight:700;color:#6D28D9;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Score do Parceiro</div>' +
          '<div style="display:flex;align-items:baseline;gap:8px">' +
            '<span style="font-size:32px;font-weight:800;color:#111">' + total + '</span>' +
            '<span style="font-size:13px;color:#6B7280">/100</span>' +
            '<span style="display:inline-block;background:' + c.bg + ';color:' + c.cl + ';padding:4px 10px;border-radius:20px;font-size:10px;font-weight:700;margin-left:6px">' + c.label + '</span>' +
          '</div>' +
        '</div>' +
        '<button id="vpiScoreRecompBtn" onclick="VPIPartnerModal.recompute(\'' + _esc(p.id) + '\')" title="Recalcular agora" style="padding:6px 10px;border:1.5px solid #DDD6FE;border-radius:8px;background:#fff;color:#6D28D9;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px">' +
          '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' +
          'Recalcular' +
        '</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-bottom:10px">' +
        _scoreBar('Produtividade (40%)',  p.score_produtividade || 0) +
        _scoreBar('Engajamento (25%)',    p.score_engajamento || 0) +
        _scoreBar('Recorrencia (15%)',    p.score_recorrencia || 0) +
        _scoreBar('Cadastro (10%)',       p.score_cadastro || 0) +
        _scoreBar('Criterio entrada (10%)', p.score_criterio_entrada || 0) +
      '</div>' +
      '<div style="border-top:1px solid #E0E7FF;margin-top:8px;padding-top:10px">' +
        '<div style="font-size:11px;font-weight:700;color:#6D28D9;margin-bottom:6px">Alertas</div>' +
        alertasHtml +
      '</div>' +
    '</div>'
  }

  async function open(id) {
    _close()
    if (!id || !window.VPIRepository) return
    var data
    try { data = await VPIRepository.partners.get(id) } catch (e) { data = null }
    if (!data || !data.partner) {
      alert('Não foi possível carregar detalhes do parceiro')
      return
    }
    var p = data.partner
    var inds = Array.isArray(data.indications) ? data.indications : []

    var firstName = String(p.nome || '').split(' ')[0]
    var initials  = (p.nome || '?').split(' ').map(function (w) { return w[0] }).join('').slice(0, 2).toUpperCase()
    var entrada   = p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '—'
    var cred      = p.creditos_total || 0
    var prox      = (5 - (cred % 5)) || 5
    var pct       = Math.min((cred % 5) / 5 * 100, 100)

    var closedThisMonth = inds.filter(function (i) {
      if (i.status !== 'closed' || !i.fechada_em) return false
      var d = new Date(i.fechada_em)
      var n = new Date()
      return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
    }).length
    var closedThisYear = inds.filter(function (i) {
      if (i.status !== 'closed' || !i.fechada_em) return false
      return new Date(i.fechada_em).getFullYear() === new Date().getFullYear()
    }).length

    var stColor = (p.status === 'ativo')
      ? { bg:'#F0FDF4', cl:'#166534', tx:'Ativo' }
      : (p.status === 'convidado')
        ? { bg:'#FEF3C7', cl:'#92400E', tx:'Convidado' }
        : { bg:'#FEF2F2', cl:'#991B1B', tx:'Inativo' }

    var cardUrl = _buildCardUrl(p)

    var origemLabel = p.origem === 'auto'
      ? '<span style="background:#EFF6FF;color:#1D4ED8;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">Auto-enroll</span>'
      : '<span style="background:#F5F3FF;color:#6D28D9;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">Manual</span>'

    var indRowsHtml = inds.length
      ? inds.slice(0, 15).map(function (i) {
          var when = i.fechada_em ? new Date(i.fechada_em).toLocaleDateString('pt-BR')
                                  : new Date(i.created_at).toLocaleDateString('pt-BR')
          var stBadge = i.status === 'closed'
            ? '<span style="background:#D1FAE5;color:#065F46;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700">Fechada +' + (i.creditos || 1) + '</span>'
            : i.status === 'invalid'
              ? '<span style="background:#FEE2E2;color:#991B1B;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700">Inválida</span>'
              : '<span style="background:#FEF3C7;color:#92400E;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700">Pendente</span>'
          var storyBtn = (i.status === 'closed' && window.vpiOpenIndicationStory)
            ? '<button onclick="vpiOpenIndicationStory(\'' + _esc(i.id) + '\', \'' + _esc(p.nome) + '\')" title="Editar história pro cartão" style="margin-left:6px;padding:3px 8px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;font-size:10px;color:#7C3AED;cursor:pointer;font-weight:700">História</button>'
            : ''
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #F9FAFB;font-size:12px">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="color:#374151;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(i.lead_id) + '</div>' +
              '<div style="color:#9CA3AF;font-size:11px">' + _esc(i.procedimento || '—') + '</div>' +
            '</div>' +
            stBadge + storyBtn +
            '<span style="color:#9CA3AF;font-size:11px;margin-left:10px;white-space:nowrap">' + when + '</span>' +
          '</div>'
        }).join('')
      : '<div style="color:#9CA3AF;font-size:12px;text-align:center;padding:20px">Nenhuma indicação registrada ainda</div>'

    var overlay = document.createElement('div')
    overlay.id = 'vpiViewModal'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px'
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">' +
        '<div style="padding:20px 24px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
          '<div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">' +
            '<div style="width:44px;height:44px;border-radius:50%;background:#F5F3FF;color:#7C3AED;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex:0 0 auto">' + _esc(initials) + '</div>' +
            '<div style="min-width:0">' +
              '<div style="font-size:16px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(p.nome) + '</div>' +
              '<div style="font-size:12px;color:#9CA3AF">' + _esc(p.profissao || '—') + (p.cidade ? ' &middot; ' + _esc(p.cidade) : '') + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;flex:0 0 auto">' +
            (cardUrl
              ? '<button id="vpiOpenCardBtn" data-url="' + _esc(cardUrl) + '" onclick="VPIPartnerModal.openCard(\'' + _esc(p.id) + '\')" title="Abrir cartão público em nova aba" style="display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border:1.5px solid #DDD6FE;border-radius:8px;background:#fff;color:#6D28D9;font-size:11px;font-weight:700;cursor:pointer">' +
                  '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
                  'Abrir cartão' +
                '</button>' +
                '<button id="vpiCopyLinkBtn" data-url="' + _esc(cardUrl) + '" onclick="VPIPartnerModal.copyLink(\'' + _esc(p.id) + '\')" title="Copiar link" style="display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;color:#374151;font-size:11px;font-weight:700;cursor:pointer">' +
                  '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                  'Copiar link' +
                '</button>'
              : '<span title="Cartão ainda não gerado (sem card_token)" style="font-size:10px;color:#9CA3AF;padding:6px 10px;border-radius:6px;background:#F9FAFB">Cartão não disponível</span>') +
            '<button onclick="VPIPartnerModal.close()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px">' +
              '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div style="padding:20px 24px">' +
          // Score card (Fase 6)
          _renderScoreCard(p) +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:18px">' +
            '<div style="background:#F9FAFB;border-radius:10px;padding:12px">' +
              '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px">WhatsApp</div>' +
              '<div style="font-size:13px;font-weight:600;color:#374151">' + _esc(p.phone || '—') + '</div>' +
            '</div>' +
            '<div style="background:#F9FAFB;border-radius:10px;padding:12px">' +
              '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px">Entrada</div>' +
              '<div style="font-size:13px;font-weight:600;color:#374151">' + entrada + '</div>' +
            '</div>' +
            '<div style="background:#F9FAFB;border-radius:10px;padding:12px">' +
              '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px">Origem</div>' +
              '<div style="margin-top:2px">' + origemLabel + '</div>' +
            '</div>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px">' +
            '<div style="background:#F5F3FF;border-radius:10px;padding:12px;text-align:center">' +
              '<div style="font-size:22px;font-weight:800;color:#7C3AED">' + closedThisMonth + '</div>' +
              '<div style="font-size:10px;color:#9CA3AF;font-weight:600">Ind. mês</div>' +
            '</div>' +
            '<div style="background:#F5F3FF;border-radius:10px;padding:12px;text-align:center">' +
              '<div style="font-size:22px;font-weight:800;color:#7C3AED">' + closedThisYear + '</div>' +
              '<div style="font-size:10px;color:#9CA3AF;font-weight:600">Ano atual</div>' +
            '</div>' +
            '<div style="background:#F5F3FF;border-radius:10px;padding:12px;text-align:center">' +
              '<div style="font-size:22px;font-weight:800;color:#7C3AED">' + cred + '</div>' +
              '<div style="font-size:10px;color:#9CA3AF;font-weight:600">Créditos</div>' +
            '</div>' +
          '</div>' +

          '<div style="background:#F9FAFB;border-radius:10px;padding:14px;margin-bottom:18px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
              '<span style="font-size:12px;font-weight:600;color:#374151">Progresso para próxima recompensa</span>' +
              '<span style="font-size:11px;color:#9CA3AF">faltam ' + prox + '</span>' +
            '</div>' +
            '<div style="height:8px;background:#E9D5FF;border-radius:99px;overflow:hidden">' +
              '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#7C3AED,#5B21B6);border-radius:99px;transition:width .4s"></div>' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
            '<span style="font-size:13px;font-weight:600;color:#374151">Status</span>' +
            '<span style="background:' + stColor.bg + ';color:' + stColor.cl + ';padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700">' + stColor.tx + '</span>' +
          '</div>' +

          '<div>' +
            '<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Histórico de indicações</div>' +
            indRowsHtml +
          '</div>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) _close() })
  }

  window.VPIPartnerModal = {
    open:            open,
    close:           _close,
    recompute:       _recompute,
    sendReativacao:  _sendReativacao,
    openCard:        _openCard,
    copyLink:        _copyLink,
  }
})()
