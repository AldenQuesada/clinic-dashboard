/**
 * VPI Embaixadora - Meu Impacto: vidas transformadas (Fase 9 - Entrega 5)
 *
 * Card pessoal: "Voce transformou N vidas" + slider horizontal com
 * antes/depois + depoimentos das indicadas (consent-based,
 * anonimizadas com primeiro nome).
 *
 * Expoe window.VPIEmbMyImpact.
 */
;(function () {
  'use strict'
  if (window._vpiEmbMyImpactLoaded) return
  window._vpiEmbMyImpactLoaded = true

  function _app() { return window.VPIEmbApp }
  function _sb()  { return window._sbShared }
  function _token() { return _app() && _app().getToken && _app().getToken() }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _animateCounter(el, target, duration) {
    if (!el) return
    duration = duration || 1400
    var reduce = false
    try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch (_) {}
    if (reduce || target <= 0) { el.textContent = String(target); return }
    var start = 0, t0 = performance.now()
    function step(now) {
      var p = Math.min(1, (now - t0) / duration)
      var e = 1 - Math.pow(1 - p, 3)
      el.textContent = String(Math.round(start + (target - start) * e))
      if (p < 1) requestAnimationFrame(step)
      else el.textContent = String(target)
    }
    requestAnimationFrame(step)
  }

  function _storyCard(s) {
    var antes = s.foto_antes_url
      ? '<img src="' + _esc(s.foto_antes_url) + '" alt="antes" style="width:100%;height:100%;object-fit:cover" loading="lazy"/>'
      : '<div style="width:100%;height:100%;background:#16111F;display:flex;align-items:center;justify-content:center;color:#6B7280;font-size:10px">sem foto</div>'
    var depois = s.foto_depois_url
      ? '<img src="' + _esc(s.foto_depois_url) + '" alt="depois" style="width:100%;height:100%;object-fit:cover" loading="lazy"/>'
      : '<div style="width:100%;height:100%;background:#1A1B2E;display:flex;align-items:center;justify-content:center;color:#6B7280;font-size:10px">em breve</div>'
    var depo = s.depoimento
      ? '<div style="font-size:12px;font-style:italic;color:#F4F1EC;margin-top:8px;line-height:1.45">“' + _esc(s.depoimento) + '”</div>'
      : ''
    var proc = s.procedimento ? '<div style="font-size:10px;color:#C9A96E;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-top:6px">' + _esc(s.procedimento) + '</div>' : ''

    return '<div class="vpi-myimpact-card" style="flex:0 0 240px;scroll-snap-align:start;background:rgba(255,255,255,.04);border:1px solid rgba(201,169,110,0.2);border-radius:14px;padding:12px;color:#fff">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;border-radius:10px;overflow:hidden;height:140px">' +
        antes + depois +
      '</div>' +
      '<div style="font-size:12px;font-weight:700;color:#F4F1EC;margin-top:8px">' + _esc(s.primeiro_nome || 'Amiga') + '</div>' +
      proc + depo +
    '</div>'
  }

  async function render() {
    var mount = document.getElementById('vpi-emb-myimpact')
    if (!mount) return
    var sb = _sb(), token = _token()
    if (!sb || !token) { mount.innerHTML = ''; return }

    try {
      var res = await sb.rpc('vpi_pub_my_impact', { p_token: token })
      if (res.error) throw new Error(res.error.message)
      var d = res.data || {}
      if (!d.ok) { mount.innerHTML = ''; return }

      var vidas   = d.vidas_transformadas || 0
      var stories = Array.isArray(d.stories) ? d.stories : []

      if (vidas === 0) {
        mount.innerHTML = ''
        return
      }

      var sliderHtml = ''
      if (stories.length > 0) {
        var cards = stories.map(_storyCard).join('')
        sliderHtml =
          '<div style="margin-top:14px;font-size:11px;color:#B8B0A3;text-transform:uppercase;letter-spacing:.06em;font-weight:700">As histórias que você ajudou a criar</div>' +
          '<div style="display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:10px 2px 4px;margin:0 -2px;-webkit-overflow-scrolling:touch">' +
            cards +
          '</div>'
      } else {
        sliderHtml =
          '<div style="margin-top:12px;padding:14px;background:rgba(255,255,255,.04);border-radius:10px;text-align:center;font-size:12px;color:#B8B0A3;line-height:1.5">' +
            'Em breve suas histórias aparecerão aqui, com autorização das suas indicadas.' +
          '</div>'
      }

      mount.innerHTML =
        '<div class="vpi-myimpact" style="background:linear-gradient(135deg,rgba(124,58,237,0.16),rgba(91,33,182,0.08));border:1px solid rgba(201,169,110,0.25);border-radius:14px;padding:18px;margin:12px auto;max-width:380px;color:#fff">' +
          '<div style="text-align:center;padding:8px 0 14px;border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:10px">' +
            '<div style="font-size:11px;color:#C9A96E;text-transform:uppercase;letter-spacing:.12em;font-weight:700;margin-bottom:6px">Você transformou</div>' +
            '<div style="display:flex;align-items:baseline;justify-content:center;gap:10px">' +
              '<div id="vpi-myimpact-counter" style="font-size:48px;font-weight:800;color:#fff;line-height:1">0</div>' +
              '<div style="font-size:14px;color:#F4F1EC;font-weight:500">' + (vidas === 1 ? 'vida' : 'vidas') + '</div>' +
            '</div>' +
          '</div>' +
          sliderHtml +
        '</div>'

      _animateCounter(document.getElementById('vpi-myimpact-counter'), vidas, 1400)
    } catch (e) {
      if (window.console && console.warn) console.warn('[VPIEmbMyImpact]', e && e.message)
      mount.innerHTML = ''
    }
  }

  function init() {
    if (_app() && _app().onStateChange) {
      _app().onStateChange(function () { render() })
    }
    render()
  }

  window.VPIEmbMyImpact = {
    init:   init,
    render: render,
  }
})()
