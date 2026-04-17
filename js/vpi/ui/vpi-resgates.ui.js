/**
 * ClinicAI — VPI Resgates UI (admin tab 8)
 *
 * Lista resgates de ponteiras Fotona 4D pedidos pelas parceiras.
 * Permite marcar como agendado, concluído ou cancelar.
 *
 * Expoe:
 *   window.vpiRenderResgates()
 *   window.vpiResgateUpdateStatus(id, status, apptId?, obs?, cancelReason?)
 */
;(function () {
  'use strict'
  if (window._vpiResgatesUILoaded) return
  window._vpiResgatesUILoaded = true

  var _filter = 'pending'

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _fmtDate(iso) {
    if (!iso) return '—'
    try {
      var d = new Date(iso)
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR').slice(0, 5)
    } catch (_) { return '—' }
  }

  function _statusBadge(s) {
    var map = {
      pending:   { bg:'#FEF3C7', cl:'#92400E', tx:'Pendente' },
      scheduled: { bg:'#D1FAE5', cl:'#065F46', tx:'Agendado' },
      done:      { bg:'#DBEAFE', cl:'#1E3A8A', tx:'Concluído' },
      cancelled: { bg:'#FEE2E2', cl:'#991B1B', tx:'Cancelado' },
    }
    var c = map[s] || { bg:'#F3F4F6', cl:'#6B7280', tx: s }
    return '<span style="background:' + c.bg + ';color:' + c.cl + ';padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.04em">' + _esc(c.tx) + '</span>'
  }

  async function vpiResgateUpdateStatus(id, status, apptId, obs, cancelReason) {
    var sb = window._sbShared
    if (!sb) return
    try {
      var res = await sb.rpc('vpi_ponteira_resgate_update', {
        p_id: id,
        p_status: status,
        p_appt_id: apptId || null,
        p_observacoes: obs || null,
        p_cancel_reason: cancelReason || null,
      })
      if (res.error) throw new Error(res.error.message)
      if (window._showToast) window._showToast('Resgate', 'Status: ' + status, 'success')
      vpiRenderResgates()
    } catch (e) {
      alert('Falha: ' + (e && e.message))
    }
  }

  function _askCancel(id) {
    var reason = prompt('Motivo do cancelamento (opcional):')
    if (reason === null) return  // user cancelou
    if (!confirm('Cancelar este resgate? As ponteiras voltam pro saldo da parceira.')) return
    vpiResgateUpdateStatus(id, 'cancelled', null, null, reason || 'sem motivo')
  }

  function _askSchedule(id) {
    if (!confirm('Marcar este resgate como AGENDADO?\n\nUse isso quando tiver agendado a sessão na agenda.')) return
    vpiResgateUpdateStatus(id, 'scheduled')
  }

  function _askDone(id) {
    if (!confirm('Marcar como CONCLUÍDO? Sessão foi realizada.')) return
    vpiResgateUpdateStatus(id, 'done')
  }

  async function vpiRenderResgates() {
    var container = document.getElementById('vpiResgatesContainer')
    if (!container) return

    var sb = window._sbShared
    if (!sb) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:#9CA3AF">Supabase indisponível.</div>'
      return
    }

    container.innerHTML =
      '<div style="padding:20px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap">' +
          '<div>' +
            '<div style="font-size:15px;font-weight:700;color:#111;margin-bottom:2px">Resgates de Ponteiras Fotona 4D</div>' +
            '<div style="font-size:12px;color:#9CA3AF">Parceiras pedem 2-5 ponteiras. Você agenda a sessão na agenda e marca aqui.</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px">' +
            ['pending','scheduled','done','cancelled',''].map(function (s) {
              var label = { pending:'Pendentes', scheduled:'Agendados', done:'Concluídos', cancelled:'Cancelados', '':'Todos' }[s]
              var active = _filter === s
              return '<button onclick="vpiSetResgateFilter(\'' + s + '\')" style="padding:6px 12px;border:1.5px solid ' + (active?'#7C3AED':'#E5E7EB') + ';border-radius:7px;background:' + (active?'#F5F3FF':'#fff') + ';color:' + (active?'#6D28D9':'#6B7280') + ';font-size:11px;font-weight:700;cursor:pointer">' + label + '</button>'
            }).join('') +
          '</div>' +
        '</div>' +
        '<div id="vpiResgatesBody"><div style="padding:30px;text-align:center;color:#9CA3AF;font-size:13px">Carregando...</div></div>' +
      '</div>'

    try {
      var res = await sb.rpc('vpi_ponteira_resgate_list', { p_status: _filter || null })
      if (res.error) throw new Error(res.error.message)
      var rows = (res.data && res.data.rows) || []
      var body = document.getElementById('vpiResgatesBody')
      if (!body) return

      if (rows.length === 0) {
        body.innerHTML = '<div style="padding:40px;text-align:center;color:#9CA3AF;font-size:13px">Nenhum resgate ' +
          (_filter === 'pending' ? 'pendente' : _filter === '' ? 'registrado' : _filter) + '.</div>'
        return
      }

      body.innerHTML = rows.map(function (r) {
        var protocolos = (r.protocolos || []).join(' · ')
        var canSchedule = r.status === 'pending'
        var canDone     = r.status === 'pending' || r.status === 'scheduled'
        var canCancel   = r.status === 'pending' || r.status === 'scheduled'
        return '<div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:16px;margin-bottom:10px;display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:200px">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
              '<div style="font-size:14px;font-weight:700;color:#111">' + _esc(r.partner_nome || '—') + '</div>' +
              _statusBadge(r.status) +
            '</div>' +
            '<div style="font-size:12px;color:#374151;margin-bottom:4px">' +
              '<strong style="color:#7C3AED">' + r.quantidade + ' ponteira(s)</strong> — ' + _esc(protocolos) +
            '</div>' +
            '<div style="font-size:11px;color:#9CA3AF">' +
              'WhatsApp: ' + _esc(r.partner_phone || '—') + ' · pedido ' + _fmtDate(r.created_at) +
              (r.scheduled_at ? ' · agendado ' + _fmtDate(r.scheduled_at) : '') +
              (r.done_at ? ' · feito ' + _fmtDate(r.done_at) : '') +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
            (canSchedule
              ? '<button onclick="vpiResgateSchedule(\'' + _esc(r.id) + '\')" style="padding:7px 12px;border:1.5px solid #10B981;border-radius:7px;background:#F0FDF4;color:#065F46;font-size:11px;font-weight:700;cursor:pointer">Marcar agendado</button>'
              : '') +
            (canDone
              ? '<button onclick="vpiResgateDone(\'' + _esc(r.id) + '\')" style="padding:7px 12px;border:1.5px solid #3B82F6;border-radius:7px;background:#EFF6FF;color:#1E3A8A;font-size:11px;font-weight:700;cursor:pointer">Concluído</button>'
              : '') +
            (canCancel
              ? '<button onclick="vpiResgateCancel(\'' + _esc(r.id) + '\')" style="padding:7px 12px;border:1.5px solid #FECACA;border-radius:7px;background:#FEF2F2;color:#991B1B;font-size:11px;font-weight:700;cursor:pointer">Cancelar</button>'
              : '') +
          '</div>' +
        '</div>'
      }).join('')
    } catch (e) {
      var body = document.getElementById('vpiResgatesBody')
      if (body) body.innerHTML = '<div style="padding:30px;text-align:center;color:#DC2626;font-size:13px">Erro: ' + _esc(e.message || '') + '</div>'
    }
  }

  function vpiSetResgateFilter(s) {
    _filter = s
    vpiRenderResgates()
  }

  window.vpiRenderResgates       = vpiRenderResgates
  window.vpiResgateUpdateStatus  = vpiResgateUpdateStatus
  window.vpiSetResgateFilter     = vpiSetResgateFilter
  window.vpiResgateSchedule      = _askSchedule
  window.vpiResgateDone          = _askDone
  window.vpiResgateCancel        = _askCancel
})()
