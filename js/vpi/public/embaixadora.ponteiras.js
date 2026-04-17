/**
 * VPI Embaixadora — Ponteiras Fotona 4D
 *
 * Modelo novo (abr/2026): 1 indicação = 1 ponteira. 5 ponteiras = 1
 * Fotona 4D completa. Resgate mínimo: 2 ponteiras. Limite: 15/ano.
 *
 * 5 ponteiras:
 *   - SmoothLiftin (lifting intraoral)
 *   - FRAC3        (ilhas de calor, manchas, rugas)
 *   - PIANO        (firmeza, contorno)
 *   - SupErficial  (peeling delicado, glow)
 *   - NX Runner    (peeling laser de rejuvenescimento)
 *
 * API pública:
 *   - vpi_pub_ponteiras_resumo(token) → saldo + resgates + protocolos
 *   - vpi_pub_ponteira_resgatar(token, quantidade, protocolos[])
 *
 * Expoe window.VPIEmbPonteiras.
 */
;(function () {
  'use strict'
  if (window._vpiEmbPonteirasLoaded) return
  window._vpiEmbPonteirasLoaded = true

  function _app() { return window.VPIEmbApp }
  function _sb()  { return window._sbShared || null }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _getToken() {
    return _app() && _app().getToken && _app().getToken()
  }
  function _toast(msg) {
    if (_app() && _app().toast) _app().toast(msg)
  }

  var _state = { resumo: null, loading: false }

  async function _fetchResumo() {
    var sb = _sb()
    var token = _getToken()
    if (!sb || !token) return null
    try {
      var r = await sb.rpc('vpi_pub_ponteiras_resumo', { p_token: token })
      if (r.error) { console.warn('[VPIEmbPonteiras] rpc error:', r.error.message); return null }
      var d = r.data || {}
      if (d.error) return null
      return d
    } catch (e) {
      console.warn('[VPIEmbPonteiras] fetch fail:', e && e.message)
      return null
    }
  }

  async function render() {
    var mount = document.getElementById('vpi-emb-ponteiras')
    if (!mount) mount = document.getElementById('vpi-emb-fotona')  // compat
    if (!mount) return

    // Proteje contra chamadas concorrentes (card pode re-renderizar varias vezes
    // antes da primeira RPC retornar)
    if (_state.loading) return

    if (!_state.resumo) {
      _state.loading = true
      try {
        _state.resumo = await _fetchResumo()
      } finally {
        _state.loading = false
      }
      if (!_state.resumo) { mount.innerHTML = ''; return }
    }

    // Re-busca o mount apos o await — card.render() pode ter recriado
    mount = document.getElementById('vpi-emb-ponteiras')
             || document.getElementById('vpi-emb-fotona')
    if (!mount) return

    var d = _state.resumo

    var disponiveis = Number(d.disponiveis || 0)
    var resgatadas  = Number(d.resgatadas_ano || 0)
    var limite      = Number(d.limite_anual || 15)
    var restanteAno = Number(d.restante_ano || 0)
    var faltamFotona = Number(d.fotona_completa_em || 5)
    var resgateMin  = Number(d.resgate_minimo || 2)
    var protocolos  = d.protocolos_disponiveis || []

    var podeResgatar = disponiveis >= resgateMin && restanteAno >= resgateMin

    // Progress bar pra Fotona 4D completa (5 ponteiras)
    var pctFotona = Math.min(100, (disponiveis / 5) * 100)

    // Lista de resgates recentes
    var resgatesHtml = ''
    var rec = d.resgates_recentes || []
    if (rec.length > 0) {
      resgatesHtml = '<div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(201,169,110,0.2)">' +
        '<div style="font-size:10px;color:#C9A96E;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:8px">Meus Resgates</div>' +
        rec.map(function (r) {
          var sLabel = r.status === 'pending' ? 'Aguardando contato' :
                       r.status === 'scheduled' ? 'Agendada' :
                       r.status === 'done' ? 'Concluída' : r.status
          var sColor = r.status === 'pending' ? '#F59E0B' :
                       r.status === 'scheduled' ? '#10B981' :
                       r.status === 'done' ? '#6EE7B7' : '#B8B0A3'
          var protocolosTxt = (r.protocolos || []).join(' · ')
          return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:6px;font-size:11px">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="color:#F4F1EC;font-weight:600">' + r.quantidade + ' ponteira(s)</div>' +
              '<div style="color:#B8B0A3;font-size:10px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(protocolosTxt) + '</div>' +
            '</div>' +
            '<span style="color:' + sColor + ';font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.06em">' + _esc(sLabel) + '</span>' +
          '</div>'
        }).join('') +
      '</div>'
    }

    mount.innerHTML =
      '<div class="vpi-ponteiras-card" style="background:radial-gradient(ellipse at top right,rgba(201,169,110,0.14),transparent 65%),linear-gradient(145deg,rgba(22,17,31,0.95),rgba(11,8,19,0.98));border:1px solid rgba(201,169,110,0.3);border-radius:18px;padding:22px;margin:12px auto;max-width:380px;color:#F4F1EC;box-shadow:0 12px 40px -12px rgba(0,0,0,0.5)">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
          '<svg width="16" height="16" fill="none" stroke="#C9A96E" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
          '<h3 style="margin:0;font-size:11px;font-weight:700;color:#C9A96E;text-transform:uppercase;letter-spacing:.14em">Minhas Ponteiras Fotona 4D</h3>' +
        '</div>' +

        '<div style="text-align:center;padding:14px 0 16px">' +
          '<div style="display:flex;align-items:baseline;justify-content:center;gap:6px">' +
            '<span style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:44px;font-weight:600;color:#F4F1EC;line-height:1">' + disponiveis + '</span>' +
            '<span style="font-size:13px;color:#B8B0A3;font-weight:500">disponíveis</span>' +
          '</div>' +
          '<div style="font-size:11px;color:#B8B0A3;margin-top:4px">' +
            (faltamFotona === 0
              ? '✨ Fotona 4D completa desbloqueada!'
              : 'Faltam <strong style="color:#C9A96E">' + faltamFotona + '</strong> pra Fotona 4D completa (5 ponteiras)') +
          '</div>' +
        '</div>' +

        // Progress bar Fotona 4D completa
        '<div style="margin-bottom:14px">' +
          '<div style="height:6px;background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden">' +
            '<div style="height:100%;width:' + pctFotona.toFixed(1) + '%;background:linear-gradient(90deg,#8E7543,#C9A96E,#E4C795);transition:width .9s"></div>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;font-size:10px;color:#B8B0A3;margin-top:4px;letter-spacing:.04em">' +
            '<span>' + disponiveis + '/5 desta Fotona</span>' +
            '<span>' + resgatadas + '/' + limite + ' este ano</span>' +
          '</div>' +
        '</div>' +

        // Botao resgatar
        (podeResgatar
          ? '<button onclick="VPIEmbPonteiras.openResgate()" style="width:100%;padding:13px;border:none;border-radius:12px;background:linear-gradient(135deg,#8E7543,#C9A96E,#E4C795);color:#0B0813;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.04em;box-shadow:0 6px 20px rgba(201,169,110,0.35)">' +
              'Resgatar ' + (disponiveis >= 5 ? '— Fotona 4D completa' : (disponiveis + ' ponteiras')) +
            '</button>'
          : '<div style="padding:12px;border:1px dashed rgba(201,169,110,0.3);border-radius:10px;font-size:11px;color:#B8B0A3;text-align:center;line-height:1.5">' +
              (disponiveis < resgateMin
                ? 'Faltam <strong style="color:#C9A96E">' + (resgateMin - disponiveis) + ' ponteira(s)</strong> pra resgate mínimo (' + resgateMin + ')'
                : restanteAno < resgateMin
                  ? 'Você já resgatou ' + resgatadas + '/' + limite + ' este ano. Próximo ano abre mais!'
                  : 'Faltam ' + (resgateMin - disponiveis) + ' pra resgatar') +
            '</div>'
        ) +

        // Lista das 5 ponteiras
        '<div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(201,169,110,0.2)">' +
          '<div style="font-size:10px;color:#C9A96E;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:8px">Protocolos disponíveis</div>' +
          protocolos.map(function (p) {
            return '<div style="padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:4px">' +
              '<div style="font-size:12px;color:#F4F1EC;font-weight:700">' + _esc(p.label) + '</div>' +
              '<div style="font-size:10px;color:#B8B0A3;margin-top:1px">' + _esc(p.desc) + '</div>' +
            '</div>'
          }).join('') +
        '</div>' +

        resgatesHtml +

      '</div>'
  }

  function openResgate() {
    var d = _state.resumo
    if (!d) return
    var disp = Number(d.disponiveis || 0)
    var restAno = Number(d.restante_ano || 0)
    var maxResgate = Math.min(disp, restAno, 5)
    var protocolos = d.protocolos_disponiveis || []

    if (maxResgate < 2) {
      _toast('Você precisa de no mínimo 2 ponteiras pra resgatar.')
      return
    }

    var chkHtml = protocolos.map(function (p, i) {
      return '<label data-proto="' + _esc(p.id) + '" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid rgba(201,169,110,0.2);border-radius:10px;cursor:pointer;background:rgba(255,255,255,0.04);transition:background 160ms ease,border-color 160ms ease" onmouseover="this.style.background=\'rgba(201,169,110,0.08)\';this.style.borderColor=\'rgba(201,169,110,0.5)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.04)\';this.style.borderColor=\'rgba(201,169,110,0.2)\'">' +
        '<input type="checkbox" value="' + _esc(p.id) + '" style="margin-top:3px;accent-color:#C9A96E;cursor:pointer"/>' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:#F4F1EC">' + _esc(p.label) + '</div>' +
          '<div style="font-size:11px;color:rgba(184,176,163,0.85);margin-top:2px">' + _esc(p.desc) + '</div>' +
        '</div>' +
      '</label>'
    }).join('')

    var overlay = document.createElement('div')
    overlay.className = 'vpi-ponteiras-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9400;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)'
    overlay.innerHTML =
      '<div style="background:linear-gradient(145deg,#16111F,#0B0813);border:1px solid rgba(201,169,110,0.3);border-radius:18px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 24px 64px -12px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.04) inset;color:#F4F1EC">' +
        '<div style="padding:18px 22px;border-bottom:1px solid rgba(201,169,110,0.2);display:flex;align-items:center;justify-content:space-between">' +
          '<h3 style="margin:0;font-family:\'Cormorant Garamond\',Georgia,serif;font-size:20px;color:#F4F1EC;letter-spacing:.02em">Resgatar Ponteiras</h3>' +
          '<button type="button" data-close style="background:none;border:none;font-size:22px;color:rgba(184,176,163,0.75);cursor:pointer;padding:0;line-height:1">&times;</button>' +
        '</div>' +
        '<div style="padding:18px 22px">' +
          '<div style="font-size:12px;color:#B8B0A3;line-height:1.5;margin-bottom:14px">' +
            'Escolha de <strong style="color:#C9A96E">2 a ' + maxResgate + ' ponteiras</strong>. ' +
            'A clínica entra em contato pra agendar a sua sessão.' +
          '</div>' +
          '<div id="vpi-ponteiras-chk-group" style="display:flex;flex-direction:column;gap:8px">' + chkHtml + '</div>' +
          '<div id="vpi-ponteiras-err" style="display:none;margin-top:12px;padding:10px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:12px;color:#FCA5A5"></div>' +
          '<button id="vpi-ponteiras-confirm" style="width:100%;margin-top:14px;padding:13px;border:none;border-radius:10px;background:linear-gradient(135deg,#8E7543,#C9A96E,#E4C795);color:#0B0813;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.04em;box-shadow:0 6px 20px rgba(201,169,110,0.35)" disabled>Selecione ao menos 2</button>' +
        '</div>' +
      '</div>'
    document.body.appendChild(overlay)

    var chks = overlay.querySelectorAll('input[type="checkbox"]')
    var btn  = overlay.querySelector('#vpi-ponteiras-confirm')
    var err  = overlay.querySelector('#vpi-ponteiras-err')

    function updateBtn() {
      var n = 0
      for (var i = 0; i < chks.length; i++) if (chks[i].checked) n++
      err.style.display = 'none'
      if (n < 2) {
        btn.disabled = true
        btn.textContent = 'Selecione ao menos 2'
      } else if (n > maxResgate) {
        btn.disabled = true
        btn.textContent = 'Máximo ' + maxResgate
      } else {
        btn.disabled = false
        btn.textContent = 'Confirmar — ' + n + (n === 5 ? ' (Fotona 4D completa)' : ' ponteiras')
      }
    }

    for (var i = 0; i < chks.length; i++) {
      chks[i].addEventListener('change', function (ev) {
        var checkedNow = 0
        for (var j = 0; j < chks.length; j++) if (chks[j].checked) checkedNow++
        if (checkedNow > maxResgate) {
          ev.target.checked = false
          err.textContent = 'Você pode resgatar no máximo ' + maxResgate + ' ponteira(s) agora.'
          err.style.display = 'block'
        }
        updateBtn()
      })
    }

    overlay.querySelector('[data-close]').addEventListener('click', function () {
      overlay.parentElement && overlay.parentElement.removeChild(overlay)
    })
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.parentElement && overlay.parentElement.removeChild(overlay)
    })

    btn.addEventListener('click', async function () {
      var selected = []
      for (var i = 0; i < chks.length; i++) if (chks[i].checked) selected.push(chks[i].value)
      if (selected.length < 2) return

      btn.disabled = true
      btn.textContent = 'Enviando...'
      err.style.display = 'none'

      try {
        var sb = _sb()
        var token = _getToken()
        if (!sb || !token) throw new Error('offline')

        var res = await sb.rpc('vpi_pub_ponteira_resgatar', {
          p_token:      token,
          p_quantidade: selected.length,
          p_protocolos: selected,
        })
        if (res.error) throw new Error(res.error.message)
        var rd = res.data || {}
        if (!rd.ok) {
          err.textContent = rd.detail || rd.reason || 'Não conseguimos processar.'
          err.style.display = 'block'
          btn.disabled = false
          btn.textContent = 'Tentar novamente'
          return
        }

        overlay.parentElement && overlay.parentElement.removeChild(overlay)
        _toast('Resgate enviado! A clínica vai entrar em contato.')
        if (window.VPIEmbConfetti && window.VPIEmbConfetti.fire) {
          try { window.VPIEmbConfetti.fire({ count: 90, duration: 2400 }) } catch (_) {}
        }
        _state.resumo = null
        if (_app() && _app().refresh) await _app().refresh()
        render()
      } catch (e) {
        err.textContent = 'Erro: ' + (e && e.message || 'tente mais tarde')
        err.style.display = 'block'
        btn.disabled = false
        btn.textContent = 'Tentar novamente'
      }
    })
  }

  function init() {
    // NAO invalida cache a cada re-render do card — isso causava race
    // conditions (multiplas RPCs concorrentes deixavam slot vazio).
    // Cache so e invalidado apos confirmar resgate (handler do confirm).
    if (_app() && _app().onStateChange) {
      _app().onStateChange(function () { render() })
    }
    window.addEventListener('vpi-emb-rendered', function () {
      setTimeout(render, 20)
    })
    render()
  }

  window.VPIEmbPonteiras = {
    init:         init,
    render:       render,
    openResgate:  openResgate,
  }
})()
