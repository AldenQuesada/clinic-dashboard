/**
 * ClinicAI - VPI Celebrations UI (Fase 9 - Entrega 7)
 *
 * Aba admin "Celebracoes": lista reacts ❤️🎉🙏✨ em msgs VPI que
 * tem consent da parceira + nao foram postadas ainda. Botao
 * "Marquei como postada" marca posted_at.
 *
 * Renderizada em #vpiPanel7. Tambem pode ser usada standalone.
 *
 * Expoe:
 *   window.vpiRenderCelebrations
 *   window.vpiMarkCelebrationPosted
 */
;(function () {
  'use strict'
  if (window._vpiCelebrationsUILoaded) return
  window._vpiCelebrationsUILoaded = true

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _toast(title, body, kind) {
    if (window._showToast) _showToast(title, body, kind || 'info')
  }
  function _sb() { return window._sbShared || null }
  async function _rpc(name, args) {
    var sb = _sb()
    if (!sb) throw new Error('Supabase indisponivel')
    var res = await sb.rpc(name, args || {})
    if (res.error) throw new Error(res.error.message)
    return res.data
  }

  function _fmtDateTime(iso) {
    if (!iso) return '—'
    try {
      var d = new Date(iso)
      return String(d.getDate()).padStart(2,'0') + '/' +
             String(d.getMonth()+1).padStart(2,'0') + ' ' +
             String(d.getHours()).padStart(2,'0') + ':' +
             String(d.getMinutes()).padStart(2,'0')
    } catch (_) { return '—' }
  }

  var _mode = 'pending'  // 'pending' | 'all'

  function _ensureContainer() {
    var panel = document.getElementById('vpiPanel7')
    if (!panel) return null
    var c = document.getElementById('vpiCelebContainer')
    if (c) return c

    var block = document.createElement('div')
    block.id = 'vpiCelebContainer'
    block.style.cssText = 'background:#fff;border-radius:12px;border:1px solid #F3F4F6;padding:22px'
    block.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<div style="font-size:15px;font-weight:700;color:#111;margin-bottom:2px">Celebracoes</div>' +
          '<div style="font-size:12px;color:#9CA3AF">Reacts das parceiras em msgs VPI. Consent-based. Poste no story oficial com o primeiro nome.</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button id="vpiCelebTabPending" onclick="vpiCelebSetMode(\'pending\')" style="padding:7px 14px;border:1.5px solid #7C3AED;border-radius:8px;background:#7C3AED;color:#fff;font-size:12px;font-weight:700;cursor:pointer">Pendentes</button>' +
          '<button id="vpiCelebTabAll" onclick="vpiCelebSetMode(\'all\')" style="padding:7px 14px;border:1.5px solid #E5E7EB;border-radius:8px;background:#F3F4F6;color:#374151;font-size:12px;font-weight:600;cursor:pointer">Todas</button>' +
        '</div>' +
      '</div>' +
      '<div id="vpiCelebBody"><div style="text-align:center;color:#9CA3AF;font-size:13px;padding:20px">Carregando...</div></div>'
    panel.appendChild(block)
    return block
  }

  function _tabStyle() {
    var p = document.getElementById('vpiCelebTabPending')
    var a = document.getElementById('vpiCelebTabAll')
    if (p && a) {
      var isPending = (_mode === 'pending')
      p.style.background = isPending ? '#7C3AED' : '#F3F4F6'
      p.style.color      = isPending ? '#fff'    : '#374151'
      p.style.borderColor = isPending ? '#7C3AED' : '#E5E7EB'
      a.style.background = !isPending ? '#7C3AED' : '#F3F4F6'
      a.style.color      = !isPending ? '#fff'    : '#374151'
      a.style.borderColor = !isPending ? '#7C3AED' : '#E5E7EB'
    }
  }

  async function vpiRenderCelebrations() {
    var c = _ensureContainer()
    if (!c) return
    var body = document.getElementById('vpiCelebBody')
    if (!body) return
    _tabStyle()

    try {
      var rpcName = _mode === 'pending' ? 'vpi_list_pending_celebrations' : 'vpi_list_all_celebrations'
      var res = await _rpc(rpcName, { p_limit: 200 })
      var rows = (res && res.rows) || []

      if (!rows.length) {
        body.innerHTML =
          '<div style="padding:30px;text-align:center;color:#9CA3AF;font-size:13px">' +
            (_mode === 'pending' ? 'Nenhuma celebracao pendente agora. Bora esperar a proxima reacao.' : 'Nenhuma celebracao registrada ainda.') +
          '</div>'
        return
      }

      body.innerHTML = rows.map(_celebCard).join('')
    } catch (e) {
      body.innerHTML = '<div style="padding:20px;color:#DC2626;font-size:12px">Erro: ' + _esc(e.message || e) + '</div>'
    }
  }

  function _celebCard(c) {
    var isPosted = !!c.posted_at
    var consentChip = c.consent_story
      ? '<span style="background:#D1FAE5;color:#065F46;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:.03em">CONSENT OK</span>'
      : '<span style="background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:.03em">SEM CONSENT</span>'
    var postedChip = isPosted
      ? '<span style="background:#DBEAFE;color:#1E40AF;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:.03em">POSTADA</span>'
      : ''

    var btn = (_mode === 'pending' && c.consent_story && !isPosted)
      ? '<button onclick="vpiMarkCelebrationPosted(\'' + _esc(c.id) + '\')" style="padding:7px 14px;border:none;border-radius:7px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;font-size:11px;font-weight:700;cursor:pointer">Marquei como postada</button>'
      : ''

    return '<div style="display:flex;align-items:flex-start;gap:14px;padding:14px;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:10px;background:#fff">' +
      '<div style="font-size:30px;line-height:1;flex-shrink:0">' + _esc(c.reaction) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<div style="font-size:13px;font-weight:700;color:#111">' + _esc(c.primeiro_nome || c.partner_nome || '—') + '</div>' +
          consentChip + postedChip +
        '</div>' +
        '<div style="font-size:11px;color:#9CA3AF;margin-top:2px">Reagiu em ' + _fmtDateTime(c.reacted_at) + '</div>' +
        (c.context_text
          ? '<div style="margin-top:8px;padding:8px 10px;background:#F9FAFB;border-left:3px solid #7C3AED;border-radius:4px;font-size:11px;color:#374151;line-height:1.5;max-height:60px;overflow:hidden">' + _esc(c.context_text) + '</div>'
          : '') +
      '</div>' +
      (btn ? '<div style="flex-shrink:0">' + btn + '</div>' : '') +
    '</div>'
  }

  function vpiCelebSetMode(m) {
    _mode = (m === 'all') ? 'all' : 'pending'
    vpiRenderCelebrations()
  }

  async function vpiMarkCelebrationPosted(id) {
    try {
      var r = await _rpc('vpi_mark_celebration_posted', { p_id: id })
      if (!r || !r.ok) throw new Error((r && r.reason) || 'falha')
      _toast('Marcada', 'Celebracao marcada como postada', 'success')
      vpiRenderCelebrations()
    } catch (e) {
      _toast('Erro', e.message || 'falha', 'error')
    }
  }

  window.vpiRenderCelebrations   = vpiRenderCelebrations
  window.vpiCelebSetMode         = vpiCelebSetMode
  window.vpiMarkCelebrationPosted = vpiMarkCelebrationPosted
})()
