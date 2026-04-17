/**
 * VPI Embaixadora - Opt-Out LGPD
 *
 * Exibe modal de opt-out, envia motivo via RPC vpi_pub_opt_out,
 * e redireciona pra pagina de despedida. Fallback: toast + recarrega
 * pagina informando desativacao.
 *
 * API:
 *   VPIEmbOptOut.openModal() -> abre modal
 *
 * Expoe window.VPIEmbOptOut.
 */
;(function () {
  'use strict'
  if (window._vpiEmbOptOutLoaded) return
  window._vpiEmbOptOutLoaded = true

  var MOTIVOS = [
    { v: 'nao_quero_mais', label: 'Não quero mais participar' },
    { v: 'privacidade',    label: 'Preocupação com privacidade' },
    { v: 'nao_reconhece',  label: 'Não lembro de ter me inscrito' },
    { v: 'muitas_msgs',    label: 'Recebendo muitas mensagens' },
    { v: 'outro',          label: 'Outro motivo' },
  ]

  function _app() { return window.VPIEmbApp }
  function _sb()  { return window._sbShared }

  function _esc(s) {
    var d = document.createElement('div')
    d.textContent = s == null ? '' : String(s)
    return d.innerHTML
  }

  function openModal() {
    if (document.getElementById('vpi-optout-modal')) return

    var bg = document.createElement('div')
    bg.className = 'vpi-modal-backdrop'
    bg.id = 'vpi-optout-modal'

    var optionsHtml = MOTIVOS.map(function (m) {
      return '<option value="' + _esc(m.v) + '">' + _esc(m.label) + '</option>'
    }).join('')

    bg.innerHTML =
      '<div class="vpi-modal vpi-optout-modal">' +
        '<h3>Sair do Programa</h3>' +
        '<p class="sub">Nós vamos sentir sua falta. Conta o motivo pra gente melhorar?</p>' +
        '<div style="margin:16px 0">' +
          '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:#374151">Motivo</label>' +
          '<select id="vpi-optout-motivo" style="width:100%;padding:10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:14px;background:#fff">' +
            optionsHtml +
          '</select>' +
          '<label style="display:block;font-size:12px;font-weight:600;margin-top:12px;margin-bottom:6px;color:#374151">Conta mais (opcional)</label>' +
          '<textarea id="vpi-optout-detalhes" rows="3" placeholder="O que você diria pra gente?" style="width:100%;padding:10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;resize:vertical;font-family:inherit"></textarea>' +
        '</div>' +
        '<div class="vpi-modal-actions">' +
          '<button class="vpi-btn vpi-btn-secondary" id="vpi-optout-cancel">Cancelar</button>' +
          '<button class="vpi-btn vpi-btn-primary" id="vpi-optout-confirm">Confirmar saida</button>' +
        '</div>' +
      '</div>'
    document.body.appendChild(bg)
    requestAnimationFrame(function () { bg.classList.add('open') })

    var closeBtn   = bg.querySelector('#vpi-optout-cancel')
    var confirmBtn = bg.querySelector('#vpi-optout-confirm')
    var motivoEl   = bg.querySelector('#vpi-optout-motivo')
    var detalhesEl = bg.querySelector('#vpi-optout-detalhes')

    function close() {
      bg.classList.remove('open')
      setTimeout(function () { try { bg.remove() } catch (_) {} }, 260)
    }
    closeBtn.addEventListener('click', close)
    bg.addEventListener('click', function (e) { if (e.target === bg) close() })

    confirmBtn.addEventListener('click', async function () {
      var motivo = (motivoEl && motivoEl.value) || ''
      var detalhes = (detalhesEl && detalhesEl.value || '').trim()
      var full = motivo + (detalhes ? ' | ' + detalhes : '')

      confirmBtn.disabled = true
      confirmBtn.textContent = 'Enviando...'

      var sb = _sb()
      var token = _app() && _app().getToken()
      if (!sb || !token) {
        confirmBtn.disabled = false
        confirmBtn.textContent = 'Confirmar saída'
        if (_app()) _app().toast('Não foi possível processar. Tente novamente.')
        return
      }

      try {
        var res = await sb.rpc('vpi_pub_opt_out', { p_token: token, p_motivo: full })
        if (res.error) throw new Error(res.error.message)
        _renderGoodbye()
      } catch (e) {
        console.warn('[VPIEmbOptOut] falhou:', e && e.message)
        confirmBtn.disabled = false
        confirmBtn.textContent = 'Confirmar saída'
        if (_app()) _app().toast('Erro: ' + (e && e.message || 'tente mais tarde'))
      }
    })
  }

  function _renderGoodbye() {
    var modal = document.getElementById('vpi-optout-modal')
    if (modal) { try { modal.remove() } catch (_) {} }
    var root = document.getElementById('vpi-emb-root')
    if (!root) return

    root.innerHTML =
      '<div style="max-width:480px;margin:80px auto;padding:32px 24px;text-align:center;color:#F5F5F5">' +
        '<div style="width:72px;height:72px;margin:0 auto 20px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#A78BFA);display:flex;align-items:center;justify-content:center">' +
          '<svg width="36" height="36" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>' +
        '</div>' +
        '<h2 style="font-family:Georgia,serif;font-size:28px;margin:0 0 12px;color:#F5F5F5;font-weight:400">Pronto!</h2>' +
        '<p style="font-size:15px;color:rgba(245,245,245,0.8);line-height:1.5;margin:0 0 20px">Sua participação no Programa foi cancelada. Você não receberá mais mensagens relacionadas.</p>' +
        '<p style="font-size:13px;color:rgba(245,245,245,0.55);line-height:1.4">Se mudar de ideia, fale com a clínica que reativamos na hora.</p>' +
        '<p style="font-size:13px;color:rgba(245,245,245,0.55);margin-top:20px">Obrigada pela confiança.<br><em>Clínica Mirian de Paula</em></p>' +
      '</div>'

    // Limpa cache da sessao
    try {
      var token = _app() && _app().getToken()
      if (token) sessionStorage.removeItem('vpi_emb_cache_' + token)
    } catch (_) {}
  }

  window.VPIEmbOptOut = { openModal: openModal }
})()
