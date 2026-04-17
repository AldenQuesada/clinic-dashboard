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
    { id: 'capilar',     label: 'Capilar',     desc: 'Laser para estímulo capilar' },
    { id: 'intimo',      label: 'Íntimo',      desc: 'Rejuvenescimento íntimo feminino' },
    { id: 'depilacao',   label: 'Depilação',   desc: 'Depilação a laser' },
    { id: 'generico',    label: 'Genérico',    desc: 'Outro protocolo Fotona 4D' },
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

    var html = '<div class="vpi-fotona-card" style="background:radial-gradient(ellipse at top right,rgba(201,169,110,0.14),transparent 65%),linear-gradient(145deg,rgba(22,17,31,0.95),rgba(11,8,19,0.98));border:1px solid rgba(201,169,110,0.3);border-radius:18px;padding:20px;margin:12px auto;max-width:380px;color:#F4F1EC;box-shadow:0 12px 40px -12px rgba(0,0,0,0.5)">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<svg width="16" height="16" fill="none" stroke="#C9A96E" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        '<h3 style="margin:0;font-size:11px;font-weight:700;color:#C9A96E;text-transform:uppercase;letter-spacing:.14em">Recompensas Fotona</h3>' +
      '</div>' +
      '<div style="font-size:13px;color:#F4F1EC;margin-bottom:14px;line-height:1.5">' +
        'Você tem <strong style="color:#C9A96E">' + desbloqueadas + '</strong> de <strong>' + TOTAL + '</strong> Fotonas 4D desbloqueadas este ano.' +
      '</div>' +
      '<div class="vpi-fotona-list" style="display:flex;flex-direction:column;gap:8px">'

    for (var i = 1; i <= TOTAL; i++) {
      var locked = i > desbloqueadas
      var used   = _isNumberUsed(i)
      var label  = i === 1 ? '1ª Fotona (5 ind.)' : i === 2 ? '2ª Fotona (10 ind.)' : '3ª Fotona (15 ind.)'
      var statusLabel = locked ? 'Bloqueada' : used ? 'Utilizada' : 'Disponível'
      var statusCol   = locked ? 'rgba(184,176,163,0.6)' : used ? 'rgba(184,176,163,0.85)' : '#6EE7B7'

      var itemBg     = locked ? 'rgba(255,255,255,0.03)' : used ? 'rgba(255,255,255,0.05)' : 'rgba(16,185,129,0.1)'
      var itemBorder = locked ? 'rgba(255,255,255,0.06)' : used ? 'rgba(255,255,255,0.08)' : 'rgba(110,231,183,0.35)'
      var itemOpacity = locked ? '0.6' : '1'
      var labelColor = locked ? 'rgba(244,241,236,0.55)' : '#F4F1EC'

      html += '<div style="padding:12px 14px;border:1px solid ' + itemBorder + ';border-radius:12px;background:' + itemBg + ';opacity:' + itemOpacity + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:700;color:' + labelColor + '">' + _esc(label) + '</div>' +
            '<div style="font-size:11px;color:' + statusCol + ';margin-top:2px;font-weight:600">' + _esc(statusLabel) + '</div>' +
          '</div>'

      if (!locked && !used) {
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button onclick="VPIEmbFotona.onSchedule(' + i + ')" style="padding:7px 12px;border:none;border-radius:8px;background:linear-gradient(135deg,#10B981,#059669);color:#fff;font-size:11px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(16,185,129,0.3)">Agendar</button>' +
          '<button onclick="VPIEmbFotona.openTransfer(' + i + ')" style="padding:7px 12px;border:1px solid rgba(201,169,110,0.45);border-radius:8px;background:rgba(201,169,110,0.08);color:#E4C795;font-size:11px;font-weight:700;cursor:pointer">Transferir</button>' +
          '<button onclick="VPIEmbFotona.openExchange(' + i + ')" style="padding:7px 12px;border:1px solid rgba(245,158,11,0.45);border-radius:8px;background:rgba(245,158,11,0.08);color:#FBBF24;font-size:11px;font-weight:700;cursor:pointer">Trocar</button>' +
        '</div>'
      }

      html += '</div></div>'
    }

    html += '</div></div>'

    mount.innerHTML = html
  }

  // ── Transferir ────────────────────────────────────────────
  function openTransfer(numero) {
    var inputCss = 'padding:10px 12px;border:1px solid rgba(201,169,110,0.25);border-radius:10px;font-size:13px;outline:none;background:rgba(255,255,255,0.06);color:#F4F1EC;font-family:inherit'
    var modal = _buildModal(
      'Transferir Fotona ' + numero,
      '<div style="display:flex;flex-direction:column;gap:14px">' +
        '<label style="display:flex;flex-direction:column;gap:6px">' +
          '<span style="font-size:11px;font-weight:700;color:#C9A96E;text-transform:uppercase;letter-spacing:.08em">Para outra embaixadora (token)</span>' +
          '<input id="vpiFotTokenDest" type="text" placeholder="Cole o token do cartão dela" style="' + inputCss + '"/>' +
        '</label>' +
        '<div style="font-size:10px;color:rgba(184,176,163,0.6);text-align:center;letter-spacing:.1em;text-transform:uppercase;font-weight:700">— OU —</div>' +
        '<label style="display:flex;flex-direction:column;gap:6px">' +
          '<span style="font-size:11px;font-weight:700;color:#C9A96E;text-transform:uppercase;letter-spacing:.08em">Para uma pessoa externa</span>' +
          '<input id="vpiFotExtNome"  type="text"  placeholder="Nome completo" style="' + inputCss + '"/>' +
          '<input id="vpiFotExtPhone" type="tel"   placeholder="WhatsApp (11) 9xxxx-xxxx" style="' + inputCss + '"/>' +
        '</label>' +
        '<button id="vpiFotTransfBtn" style="padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#8E7543,#C9A96E,#E4C795);color:#0B0813;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.04em;box-shadow:0 6px 20px rgba(201,169,110,0.35);margin-top:4px">Transferir agora</button>' +
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
          alert('Não consegui transferir: ' + (d.reason || 'erro'))
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
      return '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid rgba(201,169,110,0.2);border-radius:10px;cursor:pointer;background:rgba(255,255,255,0.04);transition:background 160ms ease,border-color 160ms ease" onmouseover="this.style.background=\'rgba(201,169,110,0.08)\';this.style.borderColor=\'rgba(201,169,110,0.5)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.04)\';this.style.borderColor=\'rgba(201,169,110,0.2)\'">' +
        '<input type="radio" name="vpiFotProt" value="' + p.id + '" style="margin-top:3px;accent-color:#C9A96E"/>' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:#F4F1EC">' + _esc(p.label) + '</div>' +
          '<div style="font-size:11px;color:rgba(184,176,163,0.85);margin-top:2px">' + _esc(p.desc) + '</div>' +
        '</div>' +
      '</label>'
    }).join('')

    var modal = _buildModal(
      'Trocar Fotona ' + numero + ' por outro protocolo',
      '<div style="display:flex;flex-direction:column;gap:8px">' +
        opts +
        '<button id="vpiFotExcBtn" style="padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#D97706,#F59E0B,#FBBF24);color:#0B0813;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.04em;box-shadow:0 6px 20px rgba(245,158,11,0.35);margin-top:10px">Trocar agora</button>' +
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
          alert('Não consegui trocar: ' + (d.reason || 'erro'))
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
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9400;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)'

    var card = document.createElement('div')
    card.style.cssText = 'background:linear-gradient(145deg,#16111F 0%,#0B0813 100%);border:1px solid rgba(201,169,110,0.3);border-radius:18px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 24px 64px -12px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.04) inset;color:#F4F1EC'
    card.innerHTML =
      '<div style="padding:16px 20px;border-bottom:1px solid rgba(201,169,110,0.2);display:flex;align-items:center;justify-content:space-between">' +
        '<h3 style="margin:0;font-size:14px;font-weight:700;color:#F4F1EC;font-family:\'Cormorant Garamond\',Georgia,serif;font-size:18px;letter-spacing:.02em">' + _esc(title) + '</h3>' +
        '<button type="button" aria-label="Fechar" style="background:none;border:none;font-size:22px;color:rgba(184,176,163,0.75);cursor:pointer;padding:0;line-height:1;transition:color 160ms ease" onmouseover="this.style.color=\'#F4F1EC\'" onmouseout="this.style.color=\'rgba(184,176,163,0.75)\'">&times;</button>' +
      '</div>' +
      '<div style="padding:18px 20px">' + bodyHtml + '</div>'

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
    // Re-render apos o card principal redesenhar (card.js reseta innerHTML
    // do root, apagando o slot #vpi-emb-fotona que populamos aqui).
    window.addEventListener('vpi-emb-rendered', function () {
      setTimeout(render, 20)
    })
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
