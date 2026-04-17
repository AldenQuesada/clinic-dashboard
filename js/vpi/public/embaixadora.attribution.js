/**
 * VPI Embaixadora - Attribution ROI (Fase 9 - Entrega 1)
 *
 * Card "Sua Atribuicao" no cartao, mostra:
 *   - Counter animado de valor gerado em R$
 *   - Breakdown: N cliques, N leads, N conversoes, CTR %
 *   - Destaque gold se top 10%
 *
 * Chama vpi_pub_attribution_summary(token, days).
 * Expoe window.VPIEmbAttribution.
 */
;(function () {
  'use strict'
  if (window._vpiEmbAttributionLoaded) return
  window._vpiEmbAttributionLoaded = true

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _sb() { return window._sbShared }
  function _token() {
    return window.VPIEmbApp && window.VPIEmbApp.getToken && window.VPIEmbApp.getToken()
  }

  function _fmtBRL(n) {
    n = Number(n) || 0
    try {
      return n.toLocaleString('pt-BR', {
        style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0,
      })
    } catch (_) {
      return 'R$ ' + Math.round(n).toString()
    }
  }

  function _ease(t) { return 1 - Math.pow(1 - t, 3) }  // easeOutCubic

  function _animateCounter(el, target, fmt) {
    if (!el) return
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || target <= 0) {
      el.textContent = fmt ? fmt(target) : String(target)
      return
    }
    var start    = 0
    var duration = 1100
    var startTs  = null
    function step(ts) {
      if (startTs == null) startTs = ts
      var p = Math.min(1, (ts - startTs) / duration)
      var v = start + (target - start) * _ease(p)
      el.textContent = fmt ? fmt(v) : String(Math.round(v))
      if (p < 1) requestAnimationFrame(step)
      else el.textContent = fmt ? fmt(target) : String(target)
    }
    requestAnimationFrame(step)
  }

  async function render() {
    var mount = document.getElementById('vpi-emb-attribution')
    if (!mount) return
    var token = _token()
    var sb    = _sb()
    if (!token || !sb) { mount.innerHTML = ''; return }

    try {
      var res = await sb.rpc('vpi_pub_attribution_summary', {
        p_token: token, p_period_days: 30,
      })
      if (res.error) throw new Error(res.error.message)
      var d = res.data || {}
      if (!d.ok) { mount.innerHTML = ''; return }

      var clicks     = d.clicks_total   || 0
      var leads      = d.leads_gerados  || 0
      var conv       = d.conversoes     || 0
      var valor      = Number(d.valor_total) || 0
      var ctr        = Number(d.ctr_pct) || 0
      var isTop10    = !!d.is_top_10

      if (clicks === 0 && valor === 0) {
        // Sem dados ainda — esconde (nao mostrar card vazio)
        mount.innerHTML = ''
        return
      }

      var topBadge = isTop10
        ? '<div style="display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:6px 12px;background:linear-gradient(135deg,#FBBF24,#F59E0B);color:#78350F;border-radius:20px;font-size:11px;font-weight:800;letter-spacing:.04em">' +
            '<svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 17l-6.5 4 2-7.5L2 9h7z"/></svg>' +
            'VOCÊ ESTÁ NO TOP 10%' +
          '</div>'
        : ''

      mount.innerHTML =
        '<div class="vpi-attr" style="background:linear-gradient(135deg,rgba(16,185,129,0.12),rgba(5,150,105,0.06));border:1px solid rgba(16,185,129,0.3);border-radius:14px;padding:18px;margin:12px auto;max-width:380px;color:#fff">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
            '<svg width="18" height="18" fill="none" stroke="#34D399" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' +
            '<h3 style="margin:0;font-size:14px;font-weight:700;color:#fff">Sua Atribuição</h3>' +
            '<span style="margin-left:auto;font-size:10px;color:#A7F3D0;text-transform:uppercase;letter-spacing:.08em">Últimos 30d</span>' +
          '</div>' +

          '<div style="text-align:center;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:14px">' +
            '<div style="font-size:11px;color:#A7F3D0;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Você gerou em receita</div>' +
            '<div id="vpi-attr-valor" style="font-size:36px;font-weight:800;color:#fff;line-height:1">' + _fmtBRL(0) + '</div>' +
            topBadge +
          '</div>' +

          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">' +
            _statCell('Cliques', clicks) +
            _statCell('Leads',   leads) +
            _statCell('Conv.',   conv) +
            _statCell('CTR',     ctr.toFixed(1) + '%') +
          '</div>' +
        '</div>'

      // Animar counter valor
      var valEl = document.getElementById('vpi-attr-valor')
      _animateCounter(valEl, valor, _fmtBRL)
    } catch (e) {
      if (window.console && console.warn) console.warn('[VPIEmbAttribution]', e && e.message)
      mount.innerHTML = ''
    }
  }

  function _statCell(label, value) {
    return '<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:8px 4px;text-align:center">' +
      '<div style="font-size:15px;font-weight:700;color:#fff">' + _esc(String(value)) + '</div>' +
      '<div style="font-size:9px;color:#A7F3D0;text-transform:uppercase;letter-spacing:.05em;margin-top:2px">' + _esc(label) + '</div>' +
    '</div>'
  }

  function init() {
    if (window.VPIEmbApp && window.VPIEmbApp.onStateChange) {
      window.VPIEmbApp.onStateChange(function () { render() })
    }
    // Re-render apos card principal redesenhar (card.js reseta root.innerHTML)
    window.addEventListener('vpi-emb-rendered', function () {
      setTimeout(render, 20)
    })
    render()
  }

  window.VPIEmbAttribution = {
    init:   init,
    render: render,
  }
})()
