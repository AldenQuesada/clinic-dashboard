/**
 * VPI Embaixadora - Fotona: Transferir + Trocar por outro protocolo
 *
 * Doc oficial prevê: apos 3 Fotonas/ano, parceira pode transferir
 * pra terceiro OU trocar por Smooth Eyes, NX Runner, estrias, capilar,
 * intimo, depilacao ou generico.
 *
 * Consome:
 *   - window.VPIEmbApp.getData() -> partner.fotonas_usadas_ano / transferidas / trocadas
 *   - RPCs publicas vpi_pub_fotona_transfer / vpi_pub_fotona_exchange
 *
 * Expoe window.VPIEmbFotona.
 */
;(function () {
  'use strict'
  if (window._vpiEmbFotonaLoaded) return
  window._vpiEmbFotonaLoaded = true

  var PROTOCOLOS = [
    { id: 'smooth_eyes', label: 'Smooth Eyes', desc: 'Tratamento de olheiras profundas' },
    { id: 'nx_runner',   label: 'NX Runner',   desc: 'Peeling laser de rejuvenescimento' },
    { id: 'estrias',     label: 'Estrias',     desc: 'Laser para estrias recentes e antigas' },
    { id: 'capilar',     label: 'Capilar',     desc: 'Laser para estimulo capilar' },
    { id: 'intimo',      label: 'Intimo',      desc: 'Rejuvenescimento intimo feminino' },
    { id: 'depilacao',   label: 'Depilacao',   desc: 'Depilacao a laser' },
    { id: 'generico',    label: 'Generico',    desc: 'Outro protocolo Fotona 4D' },
  ]

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _sb() { return window._sbShared }

  function _getPartner() {
    var d = window.VPIEmbApp && window.VPIEmbApp.getData && window.VPIEmbApp.getData()
    return d && d.partner ? d.partner : null
  }

  function _getToken() {
    return window.VPIEmbApp && window.VPIEmbApp.getToken && window.VPIEmbApp.getToken()
  }

  function _toast(msg) {
    if (window.VPIEmbApp && window.VPIEmbApp.toast) window.VPIEmbApp.toast(msg)
  }

  function _isNumberUsed(numero) {
    var p = _getPartner()
    if (!p) return false
    var t = p.fotonas_transferidas || []
    var x = p.fotonas_trocadas     || []
    for (var i = 0; i < t.length; i++) if ((t[i].fotona_numero || 0) === numero) return true
    for (var j = 0; j < x.length; j++) if ((x[j].fotona_numero || 0) === numero) return true
    return false
  }

  function render() {
    var p = _getPartner()
    if (!p) return
    var mount = document.getElementById('vpi-emb-fotona')
    if (!mount) return

    var usadas = Number(p.fotonas_usadas_ano || 0)
    var TOTAL  = 3
    var desbloqueadas = Math.min(usadas + 1, TOTAL)

    var html = '<div class="vpi-fotona-card" style="background:#fff;border:1px solid #F3F4F6;border-radius:14px;padding:18px;margin:14px 0">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
        '<svg width="18" height="18" fill="none" stroke="#DB2777" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        '<h3 style="margin:0;font-size:15px;font-weight:700;color:#111">Minhas Recompensas Fotona</h3>' +
      '</div>' +
      '<div style="font-size:12px;color:#6B7280;margin-bottom:14px">' +
        'Voce tem ' + desbloqueadas + ' de ' + TOTAL + ' Fotonas 4D desbloqueadas este ano.' +
      '</div>' +
      '<div class="vpi-fotona-list" style="display:flex;flex-direction:column;gap:10px">'

    for (var i = 1; i <= TOTAL; i++) {
      var locked = i > desbloqueadas
      var used   = _isNumberUsed(i)
      var label  = i === 1 ? '1a Fotona (5 ind.)' : i === 2 ? '2a Fotona (10 ind.)' : '3a Fotona (15 ind.)'
      var statusLabel = locked ? 'Bloqueada' : used ? 'Utilizada' : 'Disponivel'
      var statusCol   = locked ? '#9CA3AF' : used ? '#6B7280' : '#059669'

      html += '<div style="padding:12px;border:1px solid ' + (locked ? '#F3F4F6' : used ? '#F3F4F6' : '#BBF7D0') + ';border-radius:10px;background:' + (locked ? '#FAFAFA' : used ? '#F9FAFB' : '#F0FDF4') + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:700;color:#111">' + _esc(label) + '</div>' +
            '<div style="font-size:11px;color:' + statusCol + ';margin-top:2px">' + _esc(statusLabel) + '</div>' +
          '</div>'

      if (!locked && !used) {
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button onclick="VPIEmbFotona.onSchedule(' + i + ')" style="padding:6px 10px;border:none;border-radius:7px;background:#059669;color:#fff;font-size:11px;font-weight:700;cursor:pointer">Agendar</button>' +
          '<button onclick="VPIEmbFotona.openTransfer(' + i + ')" style="padding:6px 10px;border:1.5px solid #7C3AED;border-radius:7px;background:#fff;color:#7C3AED;font-size:11px;font-weight:700;cursor:pointer">Transferir</button>' +
          '<button onclick="VPIEmbFotona.openExchange(' + i + ')" style="padding:6px 10px;border:1.5px solid #F59E0B;border-radius:7px;background:#fff;color:#B45309;font-size:11px;font-weight:700;cursor:pointer">Trocar</button>' +
        '</div>'
      }

      html += '</div></div>'
    }

    html += '</div></div>'

    mount.innerHTML = html
  }

  // ── Transferir ────────────────────────────────────────────
  function openTransfer(numero) {
    var modal = _buildModal(
      'Transferir Fotona ' + numero,
      '<div style="display:flex;flex-direction:column;gap:12px">' +
        '<label style="display:flex;flex-direction:column;gap:4px">' +
          '<span style="font-size:11px;font-weight:700;color:#374151">Para outra embaixadora (token):</span>' +
          '<input id="vpiFotTokenDest" type="text" placeholder="Cole o token do cartao dela" style="padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;outline:none"/>' +
        '</label>' +
        '<div style="font-size:10px;color:#9CA3AF;text-align:center">— OU —</div>' +
        '<label style="display:flex;flex-direction:column;gap:4px">' +
          '<span style="font-size:11px;font-weight:700;color:#374151">Para uma pessoa externa:</span>' +
          '<input id="vpiFotExtNome"  type="text"  placeholder="Nome completo" style="padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;outline:none"/>' +
          '<input id="vpiFotExtPhone" type="tel"   placeholder="WhatsApp (11) 9xxxx-xxxx" style="padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;outline:none;margin-top:6px"/>' +
        '</label>' +
        '<button id="vpiFotTransfBtn" style="padding:10px;border:none;border-radius:8px;background:#7C3AED;color:#fff;font-size:12px;font-weight:700;cursor:pointer">Transferir agora</button>' +
      '</div>'
    )

    modal.querySelector('#vpiFotTransfBtn').onclick = async function () {
      var btn = this
      btn.disabled = true; btn.textContent = 'Enviando...'
      var tokenDest = (modal.querySelector('#vpiFotTokenDest').value || '').trim()
      var extNome   = (modal.querySelector('#vpiFotExtNome').value   || '').trim()
      var extPhone  = (modal.querySelector('#vpiFotExtPhone').value  || '').trim()

      var params = { p_token: _getToken(), p_fotona_numero: numero }
      if (tokenDest) {
        params.p_to_partner_token = tokenDest
      } else if (extNome && extPhone) {
        params.p_external = { nome: extNome, phone: extPhone }
      } else {
        alert('Informe um token OU nome+WhatsApp externo.')
        btn.disabled = false; btn.textContent = 'Transferir agora'
        return
      }

      try {
        var sb = _sb()
        if (!sb) throw new Error('offline')
        var res = await sb.rpc('vpi_pub_fotona_transfer', params)
        if (res.error) throw new Error(res.error.message)
        var d = res.data || {}
        if (!d.ok) {
          alert('Nao consegui transferir: ' + (d.reason || 'erro'))
          btn.disabled = false; btn.textContent = 'Transferir agora'
          return
        }
        _closeModal(modal)
        _toast('Fotona #' + numero + ' transferida!')
        if (window.VPIEmbApp && window.VPIEmbApp.refresh) await window.VPIEmbApp.refresh()
        render()
      } catch (e) {
        alert('Falha: ' + (e && e.message))
        btn.disabled = false; btn.textContent = 'Transferir agora'
      }
    }
  }

  // ── Trocar ────────────────────────────────────────────────
  function openExchange(numero) {
    var opts = PROTOCOLOS.map(function (p) {
      return '<label style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer" onmouseover="this.style.background=\'#FAFAFA\'" onmouseout="this.style.background=\'\'">' +
        '<input type="radio" name="vpiFotProt" value="' + p.id + '" style="margin-top:3px"/>' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:#111">' + _esc(p.label) + '</div>' +
          '<div style="font-size:11px;color:#6B7280;margin-top:2px">' + _esc(p.desc) + '</div>' +
        '</div>' +
      '</label>'
    }).join('')

    var modal = _buildModal(
      'Trocar Fotona ' + numero + ' por outro protocolo',
      '<div style="display:flex;flex-direction:column;gap:8px">' +
        opts +
        '<button id="vpiFotExcBtn" style="padding:10px;border:none;border-radius:8px;background:#F59E0B;color:#fff;font-size:12px;font-weight:700;cursor:pointer;margin-top:6px">Trocar agora</button>' +
      '</div>'
    )

    modal.querySelector('#vpiFotExcBtn').onclick = async function () {
      var btn = this
      var picked = modal.querySelector('input[name="vpiFotProt"]:checked')
      if (!picked) { alert('Escolha um protocolo'); return }
      btn.disabled = true; btn.textContent = 'Enviando...'

      try {
        var sb = _sb()
        if (!sb) throw new Error('offline')
        var res = await sb.rpc('vpi_pub_fotona_exchange', {
          p_token: _getToken(),
          p_protocolo: picked.value,
          p_fotona_numero: numero,
        })
        if (res.error) throw new Error(res.error.message)
        var d = res.data || {}
        if (!d.ok) {
          alert('Nao consegui trocar: ' + (d.reason || 'erro'))
          btn.disabled = false; btn.textContent = 'Trocar agora'
          return
        }
        _closeModal(modal)
        _toast('Fotona #' + numero + ' trocada!')
        if (window.VPIEmbApp && window.VPIEmbApp.refresh) await window.VPIEmbApp.refresh()
        render()
      } catch (e) {
        alert('Falha: ' + (e && e.message))
        btn.disabled = false; btn.textContent = 'Trocar agora'
      }
    }
  }

  function onSchedule(numero) {
    // Abre WhatsApp da clinica com msg pre-preenchida (graceful fallback)
    var p = _getPartner()
    var nome = p ? p.nome : 'Parceira'
    var msg = encodeURIComponent('Oi! Quero agendar minha Fotona 4D #' + numero + '. (Sou ' + nome + ')')
    window.open('https://wa.me/?text=' + msg, '_blank', 'noopener')
  }

  // ── Modal helper ──────────────────────────────────────────
  function _buildModal(title, bodyHtml) {
    var overlay = document.createElement('div')
    overlay.className = 'vpi-fotona-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)'

    var card = document.createElement('div')
    card.style.cssText = 'background:#fff;border-radius:16px;max-width:380px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,.3)'
    card.innerHTML =
      '<div style="padding:14px 18px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">' +
        '<h3 style="margin:0;font-size:14px;font-weight:700;color:#111">' + _esc(title) + '</h3>' +
        '<button type="button" aria-label="Fechar" style="background:none;border:none;font-size:20px;color:#9CA3AF;cursor:pointer;padding:0;line-height:1">&times;</button>' +
      '</div>' +
      '<div style="padding:16px 18px">' + bodyHtml + '</div>'

    overlay.appendChild(card)
    document.body.appendChild(overlay)

    var closeBtn = card.querySelector('button[aria-label="Fechar"]')
    if (closeBtn) closeBtn.onclick = function () { _closeModal(overlay) }
    overlay.onclick = function (e) { if (e.target === overlay) _closeModal(overlay) }

    return card
  }

  function _closeModal(el) {
    // Accept card ou overlay
    var overlay = (el && el.classList && el.classList.contains('vpi-fotona-overlay')) ? el : (el && el.parentElement)
    if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay)
  }

  function init() {
    // Re-render quando state muda
    if (window.VPIEmbApp && window.VPIEmbApp.onStateChange) {
      window.VPIEmbApp.onStateChange(function () { render() })
    }
    render()
  }

  window.VPIEmbFotona = {
    init:           init,
    render:         render,
    openTransfer:   openTransfer,
    openExchange:   openExchange,
    onSchedule:     onSchedule,
  }
})()
