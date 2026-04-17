/**
 * VPI Embaixadora - Challenge Banner (Fase 9 - Entrega 2)
 *
 * Banner rotativo no topo do cartao quando um challenge esta ativo.
 * Puxa vpi_pub_active_challenge() e renderiza com cor do challenge
 * + pulse discreto.
 *
 * Expoe window.VPIEmbChallenge.
 */
;(function () {
  'use strict'
  if (window._vpiEmbChallengeLoaded) return
  window._vpiEmbChallengeLoaded = true

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _sb() { return window._sbShared }

  function _injectStyle() {
    if (document.getElementById('vpi-ch-style')) return
    var s = document.createElement('style')
    s.id = 'vpi-ch-style'
    s.textContent =
      '@keyframes vpiChPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.85 } }' +
      '.vpi-ch-banner { animation: vpiChPulse 2.6s ease-in-out infinite; }' +
      '@media (prefers-reduced-motion: reduce) { .vpi-ch-banner { animation: none !important; } }'
    document.head.appendChild(s)
  }

  function _formatRemaining(endIso) {
    var end = new Date(endIso).getTime()
    var ms  = end - Date.now()
    if (ms <= 0) return 'encerrado'
    var d = Math.floor(ms / 86400000)
    var h = Math.floor((ms % 86400000) / 3600000)
    if (d >= 2) return 'ate ' + String(new Date(endIso).getDate()).padStart(2,'0') + '/' + String(new Date(endIso).getMonth()+1).padStart(2,'0')
    if (d >= 1) return 'termina em ' + d + 'd ' + h + 'h'
    if (h >= 1) return 'termina em ' + h + 'h'
    return 'terminando agora'
  }

  async function render() {
    var sb = _sb()
    if (!sb) return
    _injectStyle()

    try {
      var res = await sb.rpc('vpi_pub_active_challenge')
      if (res.error) throw new Error(res.error.message)
      var d = res.data || {}
      if (!d.ok || !d.active) {
        _removeBanner()
        return
      }

      var cor      = d.cor || '#7C3AED'
      var emoji    = d.emoji || ''
      var titulo   = d.titulo || 'Desafio ativo'
      var multi    = Number(d.multiplier || 1).toFixed(1)
      var bonus    = Number(d.bonus_fixo || 0)
      var fimLabel = _formatRemaining(d.periodo_fim)

      var existing = document.getElementById('vpi-ch-banner')
      var html =
        '<div id="vpi-ch-banner" class="vpi-ch-banner" style="width:100%;max-width:420px;margin:0 auto 14px auto;padding:12px 14px;border-radius:12px;background:linear-gradient(135deg,' + _esc(cor) + ',rgba(0,0,0,0.25));color:#fff;box-shadow:0 8px 28px -8px rgba(0,0,0,0.45);display:flex;align-items:center;gap:12px">' +
          '<div style="font-size:22px;line-height:1;flex-shrink:0">' + _esc(emoji) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.85">DESAFIO x' + _esc(multi) + (bonus ? ' +' + bonus : '') + '</div>' +
            '<div style="font-size:13px;font-weight:700;margin-top:1px">' + _esc(titulo) + '</div>' +
            '<div style="font-size:10px;opacity:.8;margin-top:1px">Suas indicações valem mais — ' + _esc(fimLabel) + '</div>' +
          '</div>' +
        '</div>'

      if (existing) {
        existing.outerHTML = html
      } else {
        // Inserir antes do cartao outer ou antes da brand
        var mount = document.createElement('div')
        mount.innerHTML = html
        var root = document.getElementById('vpi-emb-root')
        if (!root) return
        var brand = root.querySelector('.vpi-emb-brand')
        if (brand && brand.parentNode) {
          brand.parentNode.insertBefore(mount.firstChild, brand)
        } else {
          root.insertBefore(mount.firstChild, root.firstChild)
        }
      }
    } catch (e) {
      if (window.console && console.warn) console.warn('[VPIEmbChallenge]', e && e.message)
    }
  }

  function _removeBanner() {
    var el = document.getElementById('vpi-ch-banner')
    if (el) el.remove()
  }

  function init() {
    render()
    // Re-render quando o cartao re-renderizar (o banner e inserido
    // no root, entao precisa recolocar apos cada render).
    window.addEventListener('vpi-emb-rendered', function () {
      setTimeout(render, 30)
    })
  }

  window.VPIEmbChallenge = {
    init:   init,
    render: render,
  }
})()
