/**
 * ClinicAI — NSM Hero Card (Agendamentos finalizados/mes)
 *
 * Consome RPC growth_nsm_snapshot() e renderiza card hero com:
 *   - Numero grande do mes atual
 *   - Delta % vs mes anterior (seta cor direcao)
 *   - Receita do mes
 *
 * Expoe window.renderNSMCard(containerId).
 */
;(function () {
  'use strict'
  if (window._vpiNSMUILoaded) return
  window._vpiNSMUILoaded = true

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _sb() { return window._sbShared || null }
  function _fmtBRL(n) {
    try { return (Number(n) || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits: 0 }) }
    catch (_) { return 'R$ ' + (Number(n) || 0).toFixed(0) }
  }
  function _monthName(iso) {
    try {
      var d = new Date(iso)
      return d.toLocaleDateString('pt-BR', { month: 'long' })
    } catch (_) { return '' }
  }

  async function renderNSMCard(containerId) {
    var el = document.getElementById(containerId)
    if (!el) return

    el.innerHTML = '<div style="padding:24px;color:#fff;opacity:.7;font-size:12px">Carregando NSM…</div>'

    var sb = _sb()
    if (!sb) {
      el.innerHTML = ''
      return
    }

    try {
      var r = await sb.rpc('growth_nsm_snapshot')
      if (r.error || !r.data || !r.data.ok) {
        el.innerHTML = ''
        return
      }
      var d = r.data
      var delta = Number(d.delta_pct) || 0
      var isUp = delta > 0
      var isDown = delta < 0
      var deltaColor = isUp ? '#34D399' : (isDown ? '#FCA5A5' : 'rgba(255,255,255,.65)')
      var deltaArrow = isUp ? '↑' : (isDown ? '↓' : '—')
      var deltaAbs = Math.abs(delta).toFixed(1)

      el.innerHTML =
        '<div style="background:linear-gradient(135deg,#4C1D95 0%,#7C3AED 100%);border-radius:16px;padding:28px 28px 24px;color:#fff;margin-bottom:20px;box-shadow:0 10px 30px rgba(124,58,237,.25)">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap">' +
            // Left: metric
            '<div>' +
              '<div style="font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;opacity:.75;margin-bottom:6px">North Star · ' + _esc(_monthName(d.period_from)) + '</div>' +
              '<div style="font-size:13px;font-weight:500;opacity:.9;margin-bottom:12px">Agendamentos finalizados no mês</div>' +
              '<div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">' +
                '<div style="font-size:52px;font-weight:800;letter-spacing:-0.03em;line-height:1">' + (d.current_count || 0) + '</div>' +
                '<div style="display:flex;align-items:center;gap:4px;padding:5px 12px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:20px;font-size:12px;font-weight:700;color:' + deltaColor + '">' +
                  '<span style="font-size:14px">' + deltaArrow + '</span>' +
                  deltaAbs + '%' +
                  '<span style="font-weight:400;opacity:.75;margin-left:4px">vs ' + (d.previous_count || 0) + ' mês passado</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            // Right: revenue
            '<div style="text-align:right">' +
              '<div style="font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;opacity:.6;margin-bottom:6px">Receita</div>' +
              '<div style="font-size:22px;font-weight:700;letter-spacing:-0.01em">' + _esc(_fmtBRL(d.current_value)) + '</div>' +
              '<div style="font-size:11px;opacity:.7;margin-top:4px">mês anterior: ' + _esc(_fmtBRL(d.previous_value)) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
    } catch (e) {
      console.warn('[NSM] falha', e)
      el.innerHTML = ''
    }
  }

  window.renderNSMCard = renderNSMCard
})()
