/**
 * ClinicAI — B2B Impact Score Panel
 *
 * Painel inline no detalhe: score de impacto da parceria (0-100).
 * Fórmula = (vouchers_redeemed × nps × (1 + reach/1000)) / (1 + custo/1000)
 * Normalizado pelo topo da rede.
 *
 * Consome: B2BImpactRepository.
 * Expõe window.B2BImpactPanel.
 */
;(function () {
  'use strict'
  if (window.B2BImpactPanel) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _scoreBand(score) {
    var n = Number(score || 0)
    if (n >= 75) return { label:'Estrela',    color:'#10B981', verdict:'Manter e replicar o modelo' }
    if (n >= 50) return { label:'Sólida',     color:'#60A5FA', verdict:'Cadência correta, seguir firme' }
    if (n >= 25) return { label:'Morna',      color:'#F59E0B', verdict:'Ativar playbook de recuperação' }
    if (n > 0)   return { label:'Fria',       color:'#EF4444', verdict:'Reavaliar contrato / permuta' }
    return       { label:'Sem dados ainda', color:'#64748B', verdict:'Emitir vouchers e coletar NPS pra medir' }
  }

  async function mount(hostId, partnershipId) {
    var host = document.getElementById(hostId)
    if (!host || !partnershipId) return
    if (!window.B2BImpactRepository) return
    host.innerHTML = '<div class="b2b-impact-panel b2b-impact-loading">Calculando impacto…</div>'

    try {
      var d = await window.B2BImpactRepository.byPartnership(partnershipId)
      if (!d || d.ok === false) { host.innerHTML = ''; return }
      var band = _scoreBand(d.impact_score)

      host.innerHTML =
        '<div class="b2b-impact-panel">' +
          '<div class="b2b-sec-title">Impacto & ROI</div>' +
          '<div class="b2b-impact-hero">' +
            '<div class="b2b-impact-score" style="color:' + band.color + '">' +
              '<strong>' + (d.impact_score || 0) + '</strong><span>/100</span>' +
            '</div>' +
            '<div class="b2b-impact-verdict">' +
              '<div class="b2b-impact-band" style="background:' + band.color + '">' + _esc(band.label) + '</div>' +
              '<div class="b2b-impact-hint">' + _esc(band.verdict) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="b2b-impact-grid">' +
            '<div class="b2b-impact-cell"><span>Vouchers resgatados</span><strong>' + (d.vouchers_redeemed || 0) + '</strong></div>' +
            '<div class="b2b-impact-cell"><span>NPS médio</span><strong>' + (d.avg_nps ? Number(d.avg_nps).toFixed(1) : '—') + '</strong></div>' +
            '<div class="b2b-impact-cell"><span>Alcance (eventos)</span><strong>' + (d.total_reach || 0) + '</strong></div>' +
            '<div class="b2b-impact-cell"><span>Custo total</span><strong>' +
              (d.total_cost != null ? 'R$ ' + Math.round(Number(d.total_cost)).toLocaleString('pt-BR') : '—') +
            '</strong></div>' +
          '</div>' +
        '</div>'
    } catch (e) {
      host.innerHTML = '<div class="b2b-empty b2b-empty-err">Impacto indisponível: ' + _esc(e.message) + '</div>'
    }
  }

  window.B2BImpactPanel = Object.freeze({ mount: mount })
})()
