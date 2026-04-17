/**
 * ClinicAI - VPI Partner Modal
 * Drawer com detalhes do parceiro + historico de indicacoes.
 *
 * Expoe window.VPIPartnerModal.open(id)
 */
;(function () {
  'use strict'

  if (window._vpiPartnerModalLoaded) return
  window._vpiPartnerModalLoaded = true

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _close() {
    var m = document.getElementById('vpiViewModal')
    if (m) m.remove()
  }

  async function open(id) {
    _close()
    if (!id || !window.VPIRepository) return
    var data
    try { data = await VPIRepository.partners.get(id) } catch (e) { data = null }
    if (!data || !data.partner) {
      alert('Nao foi possivel carregar detalhes do parceiro')
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
              ? '<span style="background:#FEE2E2;color:#991B1B;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700">Invalida</span>'
              : '<span style="background:#FEF3C7;color:#92400E;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700">Pendente</span>'
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #F9FAFB;font-size:12px">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="color:#374151;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(i.lead_id) + '</div>' +
              '<div style="color:#9CA3AF;font-size:11px">' + _esc(i.procedimento || '—') + '</div>' +
            '</div>' +
            stBadge +
            '<span style="color:#9CA3AF;font-size:11px;margin-left:10px;white-space:nowrap">' + when + '</span>' +
          '</div>'
        }).join('')
      : '<div style="color:#9CA3AF;font-size:12px;text-align:center;padding:20px">Nenhuma indicacao registrada ainda</div>'

    var overlay = document.createElement('div')
    overlay.id = 'vpiViewModal'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px'
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">' +
        '<div style="padding:20px 24px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">' +
          '<div style="display:flex;align-items:center;gap:12px">' +
            '<div style="width:44px;height:44px;border-radius:50%;background:#F5F3FF;color:#7C3AED;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700">' + _esc(initials) + '</div>' +
            '<div>' +
              '<div style="font-size:16px;font-weight:700;color:#111">' + _esc(p.nome) + '</div>' +
              '<div style="font-size:12px;color:#9CA3AF">' + _esc(p.profissao || '—') + (p.cidade ? ' &middot; ' + _esc(p.cidade) : '') + '</div>' +
            '</div>' +
          '</div>' +
          '<button onclick="VPIPartnerModal.close()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px">' +
            '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          '</button>' +
        '</div>' +

        '<div style="padding:20px 24px">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px">' +
            '<div style="background:#F9FAFB;border-radius:10px;padding:12px">' +
              '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px">WhatsApp</div>' +
              '<div style="font-size:13px;font-weight:600;color:#374151">' + _esc(p.phone || '—') + '</div>' +
            '</div>' +
            '<div style="background:#F9FAFB;border-radius:10px;padding:12px">' +
              '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px">E-mail</div>' +
              '<div style="font-size:13px;font-weight:600;color:#374151">' + _esc(p.email || '—') + '</div>' +
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
              '<div style="font-size:10px;color:#9CA3AF;font-weight:600">Ind. mes</div>' +
            '</div>' +
            '<div style="background:#F5F3FF;border-radius:10px;padding:12px;text-align:center">' +
              '<div style="font-size:22px;font-weight:800;color:#7C3AED">' + closedThisYear + '</div>' +
              '<div style="font-size:10px;color:#9CA3AF;font-weight:600">Ano atual</div>' +
            '</div>' +
            '<div style="background:#F5F3FF;border-radius:10px;padding:12px;text-align:center">' +
              '<div style="font-size:22px;font-weight:800;color:#7C3AED">' + cred + '</div>' +
              '<div style="font-size:10px;color:#9CA3AF;font-weight:600">Creditos</div>' +
            '</div>' +
          '</div>' +

          '<div style="background:#F9FAFB;border-radius:10px;padding:14px;margin-bottom:18px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
              '<span style="font-size:12px;font-weight:600;color:#374151">Progresso para proxima recompensa</span>' +
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
            '<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Historico de indicacoes</div>' +
            indRowsHtml +
          '</div>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) _close() })
  }

  window.VPIPartnerModal = { open: open, close: _close }
})()
