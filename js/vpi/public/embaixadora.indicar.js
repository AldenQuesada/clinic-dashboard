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
    { v: 'Labios',         l: 'Lábios / Preenchimento' },
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

    var procChips = PROCEDIMENTOS.map(function (p, i) {
      return '<button type="button" class="vpi-ind-chip" data-proc="' + _esc(p.v) + '" ' +
        'style="padding:9px 14px;border:1.5px solid var(--vpi-border);border-radius:999px;background:var(--vpi-glass);color:var(--vpi-ink);font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all 160ms ease">' +
        _esc(p.l) + '</button>'
    }).join('')

    var bg = document.createElement('div')
    bg.className = 'vpi-modal-backdrop'
    bg.id = 'vpi-indicate-modal'
    bg.setAttribute('role', 'dialog')
    bg.setAttribute('aria-modal', 'true')
    bg.innerHTML =
      '<div class="vpi-modal" role="document" style="padding-bottom:0">' +
        '<div style="padding:0 0 18px">' +
          '<h3>Indicar amiga</h3>' +
          '<p class="sub">Nossa equipe entra em contato com ela com cuidado. Você ganha créditos quando o procedimento fechar.</p>' +
        '</div>' +
        '<form id="vpi-ind-form" novalidate style="padding-bottom:100px">' +
          '<div class="vpi-field">' +
            '<label for="vpi-ind-nome">Nome completo *</label>' +
            '<input id="vpi-ind-nome" name="nome" type="text" autocomplete="name" required />' +
          '</div>' +
          '<div class="vpi-field">' +
            '<label for="vpi-ind-phone">WhatsApp (com DDD) *</label>' +
            '<input id="vpi-ind-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000" required />' +
          '</div>' +
          '<div class="vpi-field">' +
            '<label for="vpi-ind-email">Email (opcional)</label>' +
            '<input id="vpi-ind-email" name="email" type="email" autocomplete="email" />' +
          '</div>' +
          '<div class="vpi-field">' +
            '<label>Procedimento de interesse</label>' +
            '<div id="vpi-ind-chips" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">' + procChips + '</div>' +
            '<input type="hidden" id="vpi-ind-proc" name="procedimento" value="' + _esc(PROCEDIMENTOS[0].v) + '"/>' +
          '</div>' +
          '<div class="vpi-ind-err" id="vpi-ind-err" style="display:none;color:#FFB4B4;font-size:12px;margin-top:8px;padding:10px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:8px"></div>' +
        '</form>' +
        '<div style="position:sticky;bottom:0;left:0;right:0;padding:14px 0;background:linear-gradient(to top,var(--vpi-bg-1) 70%,transparent);margin:0 -22px;padding-left:22px;padding-right:22px;border-top:1px solid rgba(201,169,110,0.15)">' +
          '<div class="vpi-modal-actions" style="margin:0">' +
            '<button type="button" class="vpi-btn vpi-btn-secondary" id="vpi-ind-cancel">Cancelar</button>' +
            '<button type="button" class="vpi-btn vpi-btn-primary" id="vpi-ind-submit">' +
              _ico('send', 16) + ' Enviar indicação' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    document.body.appendChild(bg)
    requestAnimationFrame(function () { bg.classList.add('open') })

    var form    = bg.querySelector('#vpi-ind-form')
    var phoneEl = bg.querySelector('#vpi-ind-phone')
    var errEl   = bg.querySelector('#vpi-ind-err')
    var btnSub  = bg.querySelector('#vpi-ind-submit')
    var btnCan  = bg.querySelector('#vpi-ind-cancel')
    var procHidden = bg.querySelector('#vpi-ind-proc')
    var chipsWrap  = bg.querySelector('#vpi-ind-chips')

    // Seleciona primeiro chip por padrao
    function _selectChip(val) {
      procHidden.value = val
      var chips = chipsWrap.querySelectorAll('.vpi-ind-chip')
      for (var i = 0; i < chips.length; i++) {
        var isActive = chips[i].getAttribute('data-proc') === val
        chips[i].style.background = isActive ? 'var(--t-grad, linear-gradient(135deg,#8E7543,#C9A96E,#E4C795))' : 'var(--vpi-glass)'
        chips[i].style.color      = isActive ? '#0B0813' : 'var(--vpi-ink)'
        chips[i].style.borderColor = isActive ? 'transparent' : 'var(--vpi-border)'
        chips[i].style.fontWeight = isActive ? '700' : '500'
      }
    }
    _selectChip(PROCEDIMENTOS[0].v)

    chipsWrap.addEventListener('click', function (e) {
      var chip = e.target.closest('.vpi-ind-chip')
      if (!chip) return
      _selectChip(chip.getAttribute('data-proc'))
    })

    phoneEl.addEventListener('input', function () {
      phoneEl.value = _maskPhone(phoneEl.value)
    })

    btnCan.addEventListener('click', _close)
    bg.addEventListener('click', function (e) { if (e.target === bg) _close() })

    // Esc fecha
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { _close(); document.removeEventListener('keydown', esc) }
    })

    btnSub.addEventListener('click', function () { _handleSubmit() })
    form.addEventListener('submit', function (e) { e.preventDefault(); _handleSubmit() })

    async function _handleSubmit() {
      errEl.style.display = 'none'
      errEl.textContent = ''

      var nome  = (form.nome.value || '').trim()
      var phone = _digits(form.phone.value)
      var email = (form.email.value || '').trim()
      var proc  = procHidden.value

      if (!nome) { _showErr('Informe o nome.'); return }
      if (phone.length < 10) { _showErr('Telefone inválido. Inclua DDD.'); return }
      if (!_isValidEmail(email)) { _showErr('Email inválido.'); return }

      var sb = _sb()
      var token = _app() && _app().getToken()
      if (!sb || !token) { _showErr('Conexão indisponível. Tente novamente.'); return }

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
            _showErr('Você já indicou muitas amigas agora. Aguarde ' +
                     (d.retry_after_minutes || 60) + ' min e tente novamente.')
          } else if (d.error === 'invalid_phone') {
            _showErr('Telefone inválido.')
          } else if (d.error === 'invalid_input') {
            _showErr(d.detail || 'Dados incompletos.')
          } else {
            _showErr('Não conseguimos salvar. Tente novamente em instantes.')
          }
          btnSub.disabled = false
          btnSub.innerHTML = _ico('send', 16) + ' Enviar indicação'
          return
        }

        _close()
        if (window.VPIEmbConfetti && window.VPIEmbConfetti.fire) {
          window.VPIEmbConfetti.fire({ tier: _tierCurrent(), count: 140, duration: 3200 })
        }
        if (_app()) _app().toast('Indicação enviada! Em breve entraremos em contato com ' + nome.split(' ')[0])
        // Refresh cartão pra mostrar a indicação pendente na timeline
        if (_app() && _app().refresh) _app().refresh()
      } catch (err) {
        console.warn('[VPIEmbIndicar] submit fail:', err && err.message)
        _showErr('Erro ao enviar. Verifique sua conexão.')
        btnSub.disabled = false
        btnSub.innerHTML = _ico('send', 16) + ' Enviar indicação'
      }
    }

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
