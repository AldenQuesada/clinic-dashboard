/**
 * VPI Embaixadora - Indicar Amiga (Modal + RPC)
 *
 * Modal com form: nome + telefone (mask BR) + email + procedimento.
 * Submit chama vpi_pub_create_indication via Supabase anon.
 * Rate limit handled server-side; UI mostra mensagem especifica.
 * Sucesso: confetti + toast "Indicacao enviada".
 *
 * Expoe window.VPIEmbIndicate (compat) e window.VPIEmbIndicar.
 */
;(function () {
  'use strict'
  if (window._vpiEmbIndicarLoaded) return
  window._vpiEmbIndicarLoaded = true

  var PROCEDIMENTOS = [
    { v: 'Botox',          l: 'Botox' },
    { v: 'Labios',         l: 'Labios / Preenchimento' },
    { v: 'Olheiras',       l: 'Olheiras' },
    { v: 'Bioestimulador', l: 'Bioestimulador' },
    { v: 'Full Face',      l: 'Full Face' },
    { v: 'Outro',          l: 'Outro procedimento' },
  ]

  function _app() { return window.VPIEmbApp }
  function _sb()  { return window._sbShared || null }
  function _esc(s){ return _app() ? _app().esc(s) : (s == null ? '' : String(s)) }

  function _ico(name, sz) {
    sz = sz || 16
    if (window.feather && window.feather.icons && window.feather.icons[name]) {
      return window.feather.icons[name].toSvg({ width: sz, height: sz, 'stroke-width': 2 })
    }
    return ''
  }

  function _maskPhone(raw) {
    var d = String(raw || '').replace(/\D/g, '').slice(0, 11)
    if (d.length <= 2) return d
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2)
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6)
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7)
  }

  function _digits(s) { return String(s || '').replace(/\D/g, '') }

  function _isValidEmail(e) {
    if (!e) return true
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  }

  function _tierCurrent() {
    try {
      var d = _app() && _app().getData()
      return (d && d.partner && d.partner.tier_atual) || 'ouro'
    } catch (_) { return 'ouro' }
  }

  function _close() {
    var bg = document.getElementById('vpi-indicate-modal')
    if (!bg) return
    bg.classList.remove('open')
    setTimeout(function () { if (bg && bg.parentNode) bg.parentNode.removeChild(bg) }, 260)
  }

  function open() {
    if (document.getElementById('vpi-indicate-modal')) return

    var procOpts = PROCEDIMENTOS.map(function (p) {
      return '<option value="' + _esc(p.v) + '">' + _esc(p.l) + '</option>'
    }).join('')

    var bg = document.createElement('div')
    bg.className = 'vpi-modal-backdrop'
    bg.id = 'vpi-indicate-modal'
    bg.setAttribute('role', 'dialog')
    bg.setAttribute('aria-modal', 'true')
    bg.innerHTML =
      '<div class="vpi-modal" role="document">' +
        '<h3>Indicar amiga</h3>' +
        '<p class="sub">Nossa equipe entra em contato com ela com cuidado. Voce ganha creditos quando o procedimento fechar.</p>' +
        '<form id="vpi-ind-form" novalidate>' +
          '<div class="vpi-field">' +
            '<label for="vpi-ind-nome">Nome completo</label>' +
            '<input id="vpi-ind-nome" name="nome" type="text" autocomplete="name" required />' +
          '</div>' +
          '<div class="vpi-field">' +
            '<label for="vpi-ind-phone">WhatsApp (com DDD)</label>' +
            '<input id="vpi-ind-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000" required />' +
          '</div>' +
          '<div class="vpi-field">' +
            '<label for="vpi-ind-email">Email (opcional)</label>' +
            '<input id="vpi-ind-email" name="email" type="email" autocomplete="email" />' +
          '</div>' +
          '<div class="vpi-field">' +
            '<label for="vpi-ind-proc">Procedimento de interesse</label>' +
            '<select id="vpi-ind-proc" name="procedimento">' +
              procOpts +
            '</select>' +
          '</div>' +
          '<div class="vpi-ind-err" id="vpi-ind-err" style="display:none;color:#FFB4B4;font-size:12px;margin-top:-6px;margin-bottom:10px"></div>' +
          '<div class="vpi-modal-actions">' +
            '<button type="button" class="vpi-btn vpi-btn-secondary" id="vpi-ind-cancel">Cancelar</button>' +
            '<button type="submit" class="vpi-btn vpi-btn-primary" id="vpi-ind-submit">' +
              _ico('send', 16) + ' Enviar indicacao' +
            '</button>' +
          '</div>' +
        '</form>' +
      '</div>'

    document.body.appendChild(bg)
    requestAnimationFrame(function () { bg.classList.add('open') })

    var form    = bg.querySelector('#vpi-ind-form')
    var phoneEl = bg.querySelector('#vpi-ind-phone')
    var errEl   = bg.querySelector('#vpi-ind-err')
    var btnSub  = bg.querySelector('#vpi-ind-submit')
    var btnCan  = bg.querySelector('#vpi-ind-cancel')

    phoneEl.addEventListener('input', function () {
      phoneEl.value = _maskPhone(phoneEl.value)
    })

    btnCan.addEventListener('click', _close)
    bg.addEventListener('click', function (e) { if (e.target === bg) _close() })

    // Esc fecha
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { _close(); document.removeEventListener('keydown', esc) }
    })

    form.addEventListener('submit', async function (e) {
      e.preventDefault()
      errEl.style.display = 'none'
      errEl.textContent = ''

      var nome  = (form.nome.value || '').trim()
      var phone = _digits(form.phone.value)
      var email = (form.email.value || '').trim()
      var proc  = form.procedimento.value

      if (!nome) { _showErr('Informe o nome.'); return }
      if (phone.length < 10) { _showErr('Telefone invalido. Inclua DDD.'); return }
      if (!_isValidEmail(email)) { _showErr('Email invalido.'); return }

      var sb = _sb()
      var token = _app() && _app().getToken()
      if (!sb || !token) { _showErr('Conexao indisponivel. Tente novamente.'); return }

      btnSub.disabled = true
      btnSub.innerHTML = _ico('loader', 16) + ' Enviando...'

      try {
        var r = await sb.rpc('vpi_pub_create_indication', {
          p_token: token,
          p_lead: { nome: nome, phone: phone, email: email, procedimento: proc },
        })
        if (r.error) throw new Error(r.error.message || 'rpc_error')
        var d = r.data || {}
        if (d.error) {
          if (d.error === 'rate_limit') {
            _showErr('Voce ja indicou muitas amigas agora. Aguarde ' +
                     (d.retry_after_minutes || 60) + ' min e tente novamente.')
          } else if (d.error === 'invalid_phone') {
            _showErr('Telefone invalido.')
          } else if (d.error === 'invalid_input') {
            _showErr(d.detail || 'Dados incompletos.')
          } else {
            _showErr('Nao conseguimos salvar. Tente novamente em instantes.')
          }
          btnSub.disabled = false
          btnSub.innerHTML = _ico('send', 16) + ' Enviar indicacao'
          return
        }

        _close()
        if (window.VPIEmbConfetti && window.VPIEmbConfetti.fire) {
          window.VPIEmbConfetti.fire({ tier: _tierCurrent(), count: 140, duration: 3200 })
        }
        if (_app()) _app().toast('Indicacao enviada! Em breve entraremos em contato com ' + nome.split(' ')[0])
        // Refresh cartao pra mostrar a indicacao pendente na timeline
        if (_app() && _app().refresh) _app().refresh()
      } catch (err) {
        console.warn('[VPIEmbIndicar] submit fail:', err && err.message)
        _showErr('Erro ao enviar. Verifique sua conexao.')
        btnSub.disabled = false
        btnSub.innerHTML = _ico('send', 16) + ' Enviar indicacao'
      }
    })

    function _showErr(msg) {
      errEl.textContent = msg
      errEl.style.display = 'block'
    }

    if (window.feather && window.feather.replace) {
      try { window.feather.replace() } catch (_) {}
    }
    setTimeout(function () { try { form.nome.focus() } catch (_) {} }, 250)
  }

  function init() {
    // Nenhum render persistente; o botao esta no card e dispara open()
  }

  // Compatibilidade: card.js chama VPIEmbIndicate.open
  window.VPIEmbIndicate = { open: open }
  window.VPIEmbIndicar  = { open: open, init: init }
})()
